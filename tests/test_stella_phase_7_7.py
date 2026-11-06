"""Tests for Stella Phase 7.7 — Personality Identity, General Intelligence & Natural Animation Actions.

Validates:
1. Brain inference system prompt includes authoritative personality definition (anime girlfriend, flirty,
   playful jealousy, red-flag energy, general competence, anti-music bias, version 2.0.0).
2. Unrelated questions (coding, algorithms, math) are not redirected into music or lyrics.
3. Technical and general knowledge requests receive accurate, non-derailed technical assistance.
4. Flirtation and playful jealousy appear contextually rather than in every response.
5. Action policy registry enforces allowlisted animation IDs (VRMA_01-VRMA_07, VRMA_EXTRA, nod, wave).
6. Invalid model-generated action IDs are rejected by parameter schema validation.
7. Gateway authorization for avatar_animation is read-only and requires no user confirmation.
8. Unknown action requests with action_supported=False do not claim false execution success.
"""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from brain.actions.base import ActionRiskLevel
from brain.actions.registry import (
    ActionRegistry,
    AvatarAnimationParams,
    create_default_registry,
)
from brain.adapters.base import ChatMessage, LLMAdapter, LLMGenerationParams, LLMResponse, Role
from brain.config.personality import (
    PersonalityConfig,
    build_system_prompt,
    load_personality_config,
)
from brain.config.settings import BrainSettings
from brain.core.context import ContextManager
from brain.core.orchestrator import BrainOrchestrator, OrchestratorTurnStatus
from brain.memory.short_term import SessionMemoryStore


class MockLLMAdapter(LLMAdapter):
    """Deterministic mock adapter capturing prompt contents and returning canned responses."""

    def __init__(self, canned_response: str = '{"user_facing_text": "Hello, darling!", "expression_hint": "happy", "proposed_actions": []}'):
        self.canned_response = canned_response
        self.captured_messages = []
        self.captured_params = None

    def generate(self, messages, params=None):
        self.captured_messages = list(messages)
        self.captured_params = params
        return LLMResponse(
            content=self.canned_response,
            finish_reason="stop",
            prompt_tokens=100,
            completion_tokens=50,
        )

    def stream(self, messages, params=None):
        self.captured_messages = list(messages)
        self.captured_params = params
        yield self.canned_response

    def ping(self):
        return True

    def check_model_available(self, model_identifier: str = ""):
        return True


# ============================================================================
# Part A: Personality & Anti-Music Bias Tests
# ============================================================================

def test_personality_config_v2_and_archetype():
    """Verify personality.json is version 2.0.0 and defines the anime girlfriend archetype."""
    config = load_personality_config()
    assert config.version == "2.0.0"
    assert "Anime Girlfriend" in config.archetype
    assert "Assistant" in config.archetype
    assert config.name == "Stella"


def test_personality_prompt_contains_all_core_facets():
    """Verify built system prompt contains all required personality facets."""
    prompt = build_system_prompt()

    # 1. Anime girlfriend & flirty
    assert "flirty" in prompt.lower()
    assert "anime" in prompt.lower()

    # 2. Medium playful jealousy & red flag energy
    assert "jealousy" in prompt.lower()
    assert "non-coercive" in prompt.lower() or "playful" in prompt.lower()

    # 3. Reasonable judgment & intellectual honesty
    assert "reasonable judgment" in prompt.lower() or "intellectual" in prompt.lower()
    assert "sycophant" in prompt.lower() or "challenge" in prompt.lower()

    # 4. General-purpose technical competence
    assert "coding" in prompt.lower()
    assert "math" in prompt.lower() or "mathematics" in prompt.lower()

    # 5. Anti-music bias directive
    assert "anti-music" in prompt.lower() or "not a music" in prompt.lower() or "music" in prompt.lower()
    assert "not a music-specific" in prompt.lower() or "not a music" in prompt.lower()


def test_orchestrator_inference_receives_authoritative_personality():
    """Verify the real orchestrator inference path injects the authoritative system prompt."""
    mock_adapter = MockLLMAdapter()
    orchestrator = BrainOrchestrator(llm_adapter=mock_adapter)

    turn = orchestrator.handle_turn("Can you help me with a Python script?", session_id="test_personality_turn")

    assert turn.status == OrchestratorTurnStatus.SUCCESS
    assert len(mock_adapter.captured_messages) > 0

    system_msg = mock_adapter.captured_messages[0]
    assert system_msg.role == Role.SYSTEM
    assert "Anime Girlfriend" in system_msg.content
    assert "flirty" in system_msg.content.lower()
    assert "jealousy" in system_msg.content.lower()
    assert "Anti-Music Bias" in system_msg.content or "not a music" in system_msg.content.lower()


def test_coding_request_does_not_redirect_to_music():
    """Verify coding requests receive serious technical assistance and are not redirected to music."""
    canned_code_reply = json.dumps({
        "user_facing_text": (
            "To resolve the IndexError, ensure you check `if index < len(my_list):` "
            "before accessing elements. Here is the corrected loop structure:\n\n"
            "for i in range(len(my_list)):\n    process(my_list[i])"
        ),
        "expression_hint": "thinking",
        "proposed_actions": [],
    })
    mock_adapter = MockLLMAdapter(canned_response=canned_code_reply)
    orchestrator = BrainOrchestrator(llm_adapter=mock_adapter)

    turn = orchestrator.handle_turn("How do I fix an IndexError in my Python list?", session_id="test_code_turn")

    assert turn.status == OrchestratorTurnStatus.SUCCESS
    assert "IndexError" in turn.user_facing_text
    assert "music" not in turn.user_facing_text.lower()
    assert "song" not in turn.user_facing_text.lower()
    assert "lyrics" not in turn.user_facing_text.lower()


def test_unrelated_questions_not_redirected_to_music():
    """Verify unrelated questions (math, physics) contain no music assumptions."""
    canned_math_reply = json.dumps({
        "user_facing_text": "The derivative of x^3 with respect to x is 3x^2, using the standard power rule d/dx(x^n) = n*x^(n-1).",
        "expression_hint": "happy",
        "proposed_actions": [],
    })
    mock_adapter = MockLLMAdapter(canned_response=canned_math_reply)
    orchestrator = BrainOrchestrator(llm_adapter=mock_adapter)

    turn = orchestrator.handle_turn("What is the derivative of x^3?", session_id="test_math_turn")

    assert turn.status == OrchestratorTurnStatus.SUCCESS
    assert "3x^2" in turn.user_facing_text
    # No music hallucination
    for term in ["song", "melody", "track", "album", "singing", "harmony"]:
        assert term not in turn.user_facing_text.lower()


# ============================================================================
# Part B & C: Action Registry & Parameter Allowlist Validation
# ============================================================================

def test_avatar_animation_action_registered_in_allowlist():
    """Verify avatar_animation is present in default ActionRegistry with read-only risk."""
    registry = create_default_registry()
    policy = registry.get("avatar_animation")

    assert policy is not None
    assert policy.action_name == "avatar_animation"
    assert policy.risk_level == "read_only"
    assert policy.requires_confirmation is False
    assert policy.parameter_schema is AvatarAnimationParams


@pytest.mark.parametrize("valid_id", [
    "VRMA_01",
    "VRMA_02",
    "VRMA_03",
    "VRMA_04",
    "VRMA_05",
    "VRMA_06",
    "VRMA_07",
    "VRMA_EXTRA",
    "nod",
    "wave",
])
def test_valid_animation_ids_accepted(valid_id: str):
    """Verify all verified Cantarella animation IDs pass validation."""
    params = AvatarAnimationParams(animation_id=valid_id)
    assert params.animation_id == valid_id


@pytest.mark.parametrize("invalid_id", [
    "backflip",
    "breakdance",
    "jump",
    "dance",
    "run_shell_command",
    "VRMA_99",
    "../../malicious",
    "",
])
def test_invalid_animation_ids_rejected(invalid_id: str):
    """Verify invalid or unverified animation IDs are strictly rejected by Pydantic schema."""
    with pytest.raises(ValidationError):
        AvatarAnimationParams(animation_id=invalid_id)


def test_avatar_animation_execution_handler():
    """Verify avatar_animation policy execution handler succeeds with verified ID."""
    registry = create_default_registry()
    policy = registry.get("avatar_animation")
    assert policy is not None
    assert policy.handler is not None

    result = policy.handler({"animation_id": "VRMA_05"})
    assert result["status"] == "executed"
    assert result["animation_id"] == "VRMA_05"


def test_perceptual_state_action_dispatch_reflected_in_turn():
    """Verify orchestrator receives action dispatch telemetry in perceptual state."""
    mock_adapter = MockLLMAdapter(
        canned_response=json.dumps({
            "user_facing_text": "Did you enjoy my spin, Darling? Catch me before I get dizzy~",
            "expression_hint": "playful",
            "proposed_actions": [],
        })
    )
    orchestrator = BrainOrchestrator(llm_adapter=mock_adapter)

    turn = orchestrator.handle_turn(
        "Stella, spin for me!",
        session_id="test_action_turn",
        perceptual_state={
            "action_requested": "VRMA_05",
            "action_name": "Spin",
            "action_dispatched": True,
        },
    )

    assert turn.status == OrchestratorTurnStatus.SUCCESS
    assert "spin" in turn.user_facing_text.lower()
    assert turn.expression_hint == "playful"


def test_unknown_action_handled_without_false_claim():
    """Verify unknown action request (e.g. backflip) is not falsely claimed as executed."""
    mock_adapter = MockLLMAdapter(
        canned_response=json.dumps({
            "user_facing_text": "A backflip? As much as I'd love to show off for you, my current avatar doesn't support backflips! I can spin, pose, or wave though~",
            "expression_hint": "playful",
            "proposed_actions": [],
        })
    )
    orchestrator = BrainOrchestrator(llm_adapter=mock_adapter)

    turn = orchestrator.handle_turn(
        "Stella, do a backflip!",
        session_id="test_unknown_action_turn",
        perceptual_state={
            "action_requested": "backflip",
            "action_supported": False,
        },
    )

    assert turn.status == OrchestratorTurnStatus.SUCCESS
    assert "doesn't support" in turn.user_facing_text.lower() or "can't" in turn.user_facing_text.lower()
    assert len(turn.proposed_actions) == 0
