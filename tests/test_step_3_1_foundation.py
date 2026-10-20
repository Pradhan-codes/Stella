"""Unit tests for Stella Python Brain Step 3.1 Foundation.

Verifies:
1. Settings validation, defaults, and context partition sum bounds.
2. BrainState finite state machine transitions, self-transition rejection, and callback isolation.
3. StructuredResponse contract validation and unified ActionRiskLevel enforcement.
4. Strict parameter canonicalization: deterministic digests, NaN/Infinity rejection,
   unsupported type rejection, and explicit UUID/datetime normalization.
5. Defense-in-depth credential redaction across log messages, arguments, and exception tracebacks.
"""

import io
import logging
import math
from datetime import datetime, timezone
from uuid import UUID, uuid4
import pytest
from pydantic import ValidationError

from brain.config.settings import BrainSettings, ContextBudgetSettings, TimeoutSettings
from brain.config.logging import (
    redact_sensitive_text,
    RedactingFilter,
    RedactingFormatter,
    setup_logging,
)
from brain.core.fsm import BrainFSM, BrainState, InvalidStateTransitionError
from brain.core.response_contract import (
    StructuredResponse,
    ActionProposalPayload,
    ConfirmationRequirement,
)
from brain.actions.base import (
    ActionRiskLevel,
    BaseActionProposal,
    UserConfirmationPrompt,
    UserConfirmationDecision,
    ToolExecutionResult,
    canonicalize_parameters,
    compute_parameter_digest,
)


# ============================================================================
# 1. Settings Tests
# ============================================================================

def test_settings_default_values():
    """Verify safe defaults and exact provisional model identifier."""
    settings = BrainSettings()

    assert settings.model_identifier == "huihui_ai/Hermes-3-Llama-3.2-abliterated"
    assert settings.ollama_base_url == "http://127.0.0.1:11434"
    assert settings.context_budget.total_context_limit == 4096
    assert settings.context_budget.system_personality_tokens == 600
    assert settings.context_budget.long_term_memory_tokens == 500
    assert settings.context_budget.perceptual_state_tokens == 200
    assert settings.context_budget.short_term_conversation_tokens == 2000
    assert settings.context_budget.completion_reserve_tokens == 796

    # Verify partition sum exactly equals total_context_limit by default
    budget = settings.context_budget
    total_partitions = (
        budget.system_personality_tokens
        + budget.long_term_memory_tokens
        + budget.perceptual_state_tokens
        + budget.short_term_conversation_tokens
        + budget.completion_reserve_tokens
    )
    assert total_partitions <= budget.total_context_limit

    assert settings.timeouts.ping_timeout_seconds == 2.0
    assert settings.timeouts.first_token_timeout_seconds == 30.0
    assert settings.timeouts.turn_completion_timeout_seconds == 90.0
    assert settings.timeouts.confirmation_ttl_seconds == 60.0


def test_settings_validation_bounds():
    """Verify out-of-bounds context or timeout values raise ValidationError."""
    with pytest.raises(ValidationError):
        # total_context_limit must be >= 512
        ContextBudgetSettings(total_context_limit=100)

    with pytest.raises(ValidationError):
        # ping_timeout_seconds must be > 0.1
        TimeoutSettings(ping_timeout_seconds=0.0)


def test_context_budget_partition_sum_validation():
    """Verify partition budget validator rejects partitions that exceed total limit."""
    # Exceeding budget: 1000 + 1000 + 1000 + 1000 + 1000 = 5000 > 4096
    with pytest.raises(ValidationError, match="exceeds total_context_limit"):
        ContextBudgetSettings(
            total_context_limit=4096,
            system_personality_tokens=1000,
            long_term_memory_tokens=1000,
            perceptual_state_tokens=1000,
            short_term_conversation_tokens=1000,
            completion_reserve_tokens=1000,
        )

    # Valid custom budget within limit: sum = 3500 <= 4096
    valid_budget = ContextBudgetSettings(
        total_context_limit=4096,
        system_personality_tokens=500,
        long_term_memory_tokens=500,
        perceptual_state_tokens=500,
        short_term_conversation_tokens=1000,
        completion_reserve_tokens=1000,
    )
    assert valid_budget.total_context_limit == 4096


def test_settings_from_env_non_sensitive(monkeypatch):
    """Verify from_env overrides non-sensitive configuration keys."""
    monkeypatch.setenv("STELLA_MODEL_IDENTIFIER", "custom/local-model:latest")
    monkeypatch.setenv("STELLA_OLLAMA_BASE_URL", "http://192.168.1.50:11434")

    settings = BrainSettings.from_env()
    assert settings.model_identifier == "custom/local-model:latest"
    assert settings.ollama_base_url == "http://192.168.1.50:11434"


# ============================================================================
# 2. Finite State Machine (FSM) Tests
# ============================================================================

def test_fsm_valid_full_lifecycle():
    """Verify an end-to-end legal sequence of operational states."""
    fsm = BrainFSM(initial_state=BrainState.OFFLINE)
    assert fsm.current_state == BrainState.OFFLINE

    fsm.transition_to(BrainState.INITIALIZING, reason="startup")
    assert fsm.current_state == BrainState.INITIALIZING

    fsm.transition_to(BrainState.STANDBY, reason="ready")
    assert fsm.current_state == BrainState.STANDBY

    fsm.transition_to(BrainState.LISTENING, reason="user speaking")
    assert fsm.current_state == BrainState.LISTENING

    fsm.transition_to(BrainState.THINKING, reason="model inference")
    assert fsm.current_state == BrainState.THINKING

    fsm.transition_to(BrainState.PLANNING, reason="multi-step plan formulation")
    assert fsm.current_state == BrainState.PLANNING

    fsm.transition_to(BrainState.AWAITING_CONFIRMATION, reason="action requires approval")
    assert fsm.current_state == BrainState.AWAITING_CONFIRMATION

    fsm.transition_to(BrainState.EXECUTING, reason="user confirmed")
    assert fsm.current_state == BrainState.EXECUTING

    fsm.transition_to(BrainState.SPEAKING, reason="delivering response")
    assert fsm.current_state == BrainState.SPEAKING

    fsm.transition_to(BrainState.STANDBY, reason="turn complete")
    assert fsm.current_state == BrainState.STANDBY


def test_fsm_illegal_transitions_rejected():
    """Verify illegal jumps across security or lifecycle boundaries are rejected."""
    fsm = BrainFSM(initial_state=BrainState.OFFLINE)

    # Cannot jump straight from OFFLINE to EXECUTING or SPEAKING
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.EXECUTING)

    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.SPEAKING)

    # Initializing can only go to STANDBY or ERROR
    fsm.transition_to(BrainState.INITIALIZING)
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.THINKING)

    # Move to STANDBY
    fsm.transition_to(BrainState.STANDBY)
    # Cannot jump directly from STANDBY to EXECUTING without LISTENING/THINKING
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.EXECUTING)


def test_fsm_self_transitions_rejected():
    """Verify transitions from state to itself are strictly rejected by default."""
    fsm = BrainFSM(initial_state=BrainState.STANDBY)
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.STANDBY)

    fsm = BrainFSM(initial_state=BrainState.THINKING)
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition_to(BrainState.THINKING)


def test_fsm_error_recovery():
    """Verify transitioning to ERROR and recovering back to STANDBY."""
    fsm = BrainFSM(initial_state=BrainState.STANDBY)
    fsm.transition_to(BrainState.ERROR, reason="local failure")
    assert fsm.current_state == BrainState.ERROR

    fsm.transition_to(BrainState.STANDBY, reason="recovered")
    assert fsm.current_state == BrainState.STANDBY


def test_fsm_callback_dispatch():
    """Verify registered in-process listeners receive state change notifications."""
    events = []

    def on_change(old_state: BrainState, new_state: BrainState, reason: str):
        events.append((old_state, new_state, reason))

    fsm = BrainFSM(initial_state=BrainState.OFFLINE, on_transition=on_change)
    fsm.transition_to(BrainState.INITIALIZING, reason="test_init")
    fsm.transition_to(BrainState.STANDBY, reason="test_ready")

    assert len(events) == 2
    assert events[0] == (BrainState.OFFLINE, BrainState.INITIALIZING, "test_init")
    assert events[1] == (BrainState.INITIALIZING, BrainState.STANDBY, "test_ready")


def test_fsm_callback_failure_isolation(caplog):
    """Verify a crashing callback does not corrupt FSM state and logs safe diagnostics without leaking secrets."""
    def broken_callback(old_state, new_state, reason):
        raise RuntimeError("Secret credential in callback: sk-1234567890abcdef1234567890")

    fsm = BrainFSM(initial_state=BrainState.OFFLINE, on_transition=broken_callback)
    with caplog.at_level(logging.WARNING, logger="stella.brain.fsm"):
        fsm.transition_to(BrainState.INITIALIZING, reason="test_init")

    # FSM state updated safely despite callback failure
    assert fsm.current_state == BrainState.INITIALIZING

    # Warning logged without leaking the exception's secret content
    assert "FSM state transition callback" in caplog.text
    assert "broken_callback" in caplog.text
    assert "sk-1234567890abcdef1234567890" not in caplog.text
    assert "RuntimeError" in caplog.text


# ============================================================================
# 3. Structured Response Contract & Unified Risk-Level Tests
# ============================================================================

def test_structured_response_valid():
    """Verify valid StructuredResponse instantiates and validates cleanly."""
    action_id = uuid4()
    prompt_id = uuid4()

    response = StructuredResponse(
        user_facing_text="Hello, Master! The stars are bright tonight.",
        proposed_actions=[
            ActionProposalPayload(
                proposal_id=action_id,
                action_name="memory_query",
                parameters={"query": "favorite telescope", "limit": 3},
                intent_summary="Look up user telescope preference",
                risk_level="read_only",
            )
        ],
        confirmation_requirements=[
            ConfirmationRequirement(
                prompt_id=prompt_id,
                proposal_id=action_id,
                action_name="memory_query",
                summary="Query favorite telescope memory",
                affected_targets=["stella_memory.db:memories"],
                parameters_digest="a" * 64,
                risk_level="read_only",
            )
        ],
        expression_hint="happy",
    )

    assert response.user_facing_text.startswith("Hello")
    assert len(response.proposed_actions) == 1
    assert response.proposed_actions[0].action_name == "memory_query"
    assert response.expression_hint == "happy"


def test_structured_response_rejects_extra_fields():
    """Verify extra/hidden fields (e.g. raw chain-of-thought, thought_delta) are forbidden."""
    with pytest.raises(ValidationError):
        # extra='forbid' must reject unexpected thought fields
        StructuredResponse(
            user_facing_text="Greetings",
            thought_delta="Internal thinking text",  # Illegal extra field
        )

    with pytest.raises(ValidationError):
        StructuredResponse(
            user_facing_text="Greetings",
            raw_chain_of_thought="Step 1...",  # Illegal extra field
        )


def test_risk_level_unification_and_validation():
    """Verify unified ActionRiskLevel is enforced across proposals and confirmation models."""
    action_id = uuid4()
    prompt_id = uuid4()

    # Valid tiers: "read_only", "reversible_write", "consequential", "destructive"
    for valid_tier in ["read_only", "reversible_write", "consequential", "destructive"]:
        proposal = BaseActionProposal(
            proposal_id=action_id,
            turn_id="turn-1",
            action_name="test_tool",
            intent_summary="Valid test",
            risk_level=valid_tier,
        )
        assert proposal.risk_level == valid_tier

        prompt = UserConfirmationPrompt(
            prompt_id=prompt_id,
            proposal_id=action_id,
            action_name="test_tool",
            human_readable_summary="Confirmation summary",
            parameters_digest="0" * 64,
            risk_tier=valid_tier,
        )
        assert prompt.risk_tier == valid_tier

    # Invalid tiers (e.g. legacy 'low', 'high', 'critical') are strictly rejected
    with pytest.raises(ValidationError):
        BaseActionProposal(
            proposal_id=action_id,
            turn_id="turn-1",
            action_name="test_tool",
            intent_summary="Invalid tier test",
            risk_level="low",  # Deprecated tier
        )

    with pytest.raises(ValidationError):
        UserConfirmationPrompt(
            prompt_id=prompt_id,
            proposal_id=action_id,
            action_name="test_tool",
            human_readable_summary="Invalid tier",
            parameters_digest="0" * 64,
            risk_tier="critical",  # Unregistered tier
        )


# ============================================================================
# 4. Strict Action Parameters & Parameter Digest Determinism Tests
# ============================================================================

def test_parameter_canonicalization_order_invariance():
    """Verify canonicalize_parameters produces identical JSON regardless of key insertion order."""
    params_a = {"b": 2, "a": 1, "c": {"y": "second", "x": "first"}}
    params_b = {"a": 1, "c": {"x": "first", "y": "second"}, "b": 2}

    canon_a = canonicalize_parameters(params_a)
    canon_b = canonicalize_parameters(params_b)

    assert canon_a == canon_b
    assert canon_a == '{"a":1,"b":2,"c":{"x":"first","y":"second"}}'


def test_parameter_digest_determinism():
    """Verify compute_parameter_digest returns identical SHA-256 for identical content."""
    params_1 = {"path": "/workspace/notes.txt", "mode": "read", "flags": [1, 2, 3]}
    params_2 = {"flags": [1, 2, 3], "path": "/workspace/notes.txt", "mode": "read"}

    digest_1 = compute_parameter_digest(params_1)
    digest_2 = compute_parameter_digest(params_2)

    assert len(digest_1) == 64
    assert digest_1 == digest_2


def test_parameter_digest_detects_changes():
    """Verify any modification to parameter keys, values, or types alters the digest."""
    base_params = {"path": "/workspace/notes.txt", "count": 10}

    # Changed value
    digest_base = compute_parameter_digest(base_params)
    digest_val_change = compute_parameter_digest({"path": "/workspace/notes.txt", "count": 11})
    assert digest_base != digest_val_change

    # Changed key
    digest_key_change = compute_parameter_digest({"target_path": "/workspace/notes.txt", "count": 10})
    assert digest_base != digest_key_change

    # Changed type (int vs string)
    digest_type_change = compute_parameter_digest({"path": "/workspace/notes.txt", "count": "10"})
    assert digest_base != digest_type_change


def test_canonicalize_parameters_rejects_non_finite_floats():
    """Verify strict rejection of NaN, positive Infinity, and negative Infinity."""
    with pytest.raises(ValueError, match="NaN or Infinity"):
        canonicalize_parameters({"value": float("nan")})

    with pytest.raises(ValueError, match="NaN or Infinity"):
        canonicalize_parameters({"value": float("inf")})

    with pytest.raises(ValueError, match="NaN or Infinity"):
        canonicalize_parameters({"nested": {"value": float("-inf")}})


def test_canonicalize_parameters_rejects_unsupported_types():
    """Verify rejection of non-whitelisted types (set, custom object, non-string keys)."""
    # Sets are rejected
    with pytest.raises(TypeError, match="Unsupported parameter type 'set'"):
        canonicalize_parameters({"tags": {"tag1", "tag2"}})

    # Custom objects are rejected
    class CustomPayload:
        pass

    with pytest.raises(TypeError, match="Unsupported parameter type 'CustomPayload'"):
        canonicalize_parameters({"obj": CustomPayload()})

    # Non-string dictionary keys are rejected
    with pytest.raises(TypeError, match="Dictionary keys must be strings"):
        canonicalize_parameters({1: "integer_key"})


def test_canonicalize_parameters_nested_uuid_and_datetime():
    """Verify explicit deterministic normalization of UUIDs and datetimes in nested structures."""
    fixed_uuid = UUID("12345678-1234-5678-1234-567812345678")
    fixed_dt = datetime(2026, 10, 18, 12, 0, 0, tzinfo=timezone.utc)

    params = {
        "event_id": fixed_uuid,
        "metadata": {
            "timestamp": fixed_dt,
            "items": [1, fixed_uuid],
        },
    }

    canon = canonicalize_parameters(params)
    assert '"event_id":"12345678-1234-5678-1234-567812345678"' in canon
    assert '"timestamp":"2026-10-18T12:00:00+00:00"' in canon

    digest = compute_parameter_digest(params)
    assert len(digest) == 64


def test_base_action_proposal_digest_property():
    """Verify BaseActionProposal parameter_digest property matches utility function."""
    proposal = BaseActionProposal(
        proposal_id=uuid4(),
        turn_id="turn-42",
        action_name="workspace_read",
        parameters={"file": "stella.py", "lines": [1, 50]},
        intent_summary="Inspect source code",
        risk_level="read_only",
        requested_scope="workspace",
    )

    expected = compute_parameter_digest(proposal.parameters)
    assert proposal.parameter_digest == expected


def test_user_confirmation_decision_model():
    """Verify UserConfirmationDecision stores untrusted client decision payload."""
    prompt_id = uuid4()
    proposal_id = uuid4()
    dummy_digest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    now = datetime.now(timezone.utc)

    decision = UserConfirmationDecision(
        prompt_id=prompt_id,
        proposal_id=proposal_id,
        decision="approved",
        parameter_digest=dummy_digest,
        decision_timestamp=now,
    )

    assert decision.decision == "approved"
    assert decision.parameter_digest == dummy_digest
    assert decision.prompt_id == prompt_id


# ============================================================================
# 5. Credential Redaction & Formatted Traceback Protection Tests
# ============================================================================

def test_redact_sensitive_text_patterns():
    """Verify common secret and credential patterns are replaced with [REDACTED]."""
    # API key pattern
    text_key = "Failed request using key sk-1234567890abcdef1234567890 and user yuki"
    assert "sk-1234567890abcdef1234567890" not in redact_sensitive_text(text_key)
    assert "[REDACTED]" in redact_sensitive_text(text_key)

    # Bearer token pattern
    text_bearer = "Authorization: Bearer mySecretToken12345678"
    redacted_bearer = redact_sensitive_text(text_bearer)
    assert "mySecretToken12345678" not in redacted_bearer
    assert "[REDACTED]" in redacted_bearer

    # Password assignment
    text_pwd = "User login credentials: password: 'SuperSecretPassword123' in session"
    redacted_pwd = redact_sensitive_text(text_pwd)
    assert "SuperSecretPassword123" not in redacted_pwd
    assert "[REDACTED]" in redacted_pwd

    # Non-sensitive text remains intact
    text_clean = "The telescope orientation is 45 degrees North."
    assert redact_sensitive_text(text_clean) == text_clean


def test_logging_filter_redacts_records():
    """Verify RedactingFilter scrubs sensitive data from logging records."""
    redacting_filter = RedactingFilter()

    # Test msg redaction
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="Connecting with api_key='secret_key_value_9999'",
        args=(),
        exc_info=None,
    )
    redacting_filter.filter(record)
    assert "secret_key_value_9999" not in record.msg
    assert "[REDACTED]" in record.msg


def test_redacting_formatter_scrubs_tracebacks():
    """Verify RedactingFormatter redacts credentials embedded in exception messages and tracebacks."""
    formatter = RedactingFormatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    )

    fake_secret = "sk-abcdef1234567890abcdef1234567890"
    try:
        raise ValueError(f"Engine connection failed with secret key: {fake_secret}")
    except ValueError:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="stella.test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=20,
        msg="A fatal error occurred",
        args=(),
        exc_info=exc_info,
    )

    formatted_output = formatter.format(record)

    # The raw secret key must NEVER appear in the formatted output or traceback
    assert fake_secret not in formatted_output
    assert "[REDACTED]" in formatted_output
    assert "ValueError: Engine connection failed with secret key: [REDACTED]" in formatted_output
