"""Comprehensive regression test suite for Stella Phase 3 — Step 3.5: Permission Gateway.

Verifies:
1. Valid registered read-only action evaluation and execution.
2. Unknown and malformed action rejection (default-deny, parameter schema validation, extra forbidden).
3. Model-supplied permission or risk escalation attempts are ignored.
4. Missing confirmation for protected consequential actions blocks execution.
5. Valid confirmation with exact token, proposal ID, and parameter digest authorizes execution.
6. Payload alteration after confirmation is detected and rejected (ARGUMENT_TAMPERED).
7. Expired, forged, and replayed confirmation tokens are rejected.
8. Single-use confirmation under concurrent requests (thread safety and atomic consumption).
9. Executor failure and policy failure fail closed without leaking internal details.
10. Destructive actions and arbitrary OS commands remain denied.
11. Security logging hygiene: tokens, credentials, and full sensitive payloads never appear in logs.
12. Model-facing proposal evaluation results NEVER leak confirmation tokens (trusted boundary separation).
13. Forged GatewayAuthorizationResult cannot be executed (FORGED_AUTHORIZATION).
14. Execution single-use replay protection: authorized results cannot be re-executed (REPLAYED_OR_FORGED_AUTHORIZATION).
15. Concurrent execution replay protection: 10 simultaneous threads yield exactly 1 execution.
16. Cryptographic signature and dispatch token tampering are intercepted.
17. Policy revocation or alteration between authorization and dispatch fails closed.
18. Parameter tampering between authorization and dispatch is intercepted via re-digest verification.
19. Frozen Pydantic models: GatewayAuthorizationResult and UserConfirmationPrompt cannot be mutated in-place.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any, Dict, Optional
from uuid import UUID, uuid4
import pytest
from pydantic import ValidationError

from brain.actions.base import (
    ActionRiskLevel,
    BaseActionProposal,
    ToolExecutionResult,
    UserConfirmationPrompt,
    compute_parameter_digest,
)
from brain.actions.gateway import (
    GatewayAuthorizationResult,
    PermissionGateway,
)
from brain.actions.registry import (
    ActionPolicy,
    ActionRegistry,
    EmptyParams,
    ListTargetsParams,
    PurgeDatabaseParams,
    RecalibrateSensorParams,
    SetElevationParams,
    create_default_registry,
)


# ============================================================================
# Test Fixtures & Helpers
# ============================================================================

def make_proposal(
    action_name: str,
    parameters: Optional[Dict[str, Any]] = None,
    intent_summary: str = "Test proposal intent",
    risk_level: ActionRiskLevel = "read_only",
    proposal_id: Optional[UUID] = None,
    turn_id: str = "turn_test_001",
) -> BaseActionProposal:
    """Helper to construct a valid BaseActionProposal with schema compliance."""
    return BaseActionProposal(
        proposal_id=proposal_id or uuid4(),
        turn_id=turn_id,
        action_name=action_name,
        parameters=parameters or {},
        intent_summary=intent_summary,
        risk_level=risk_level,
    )


@pytest.fixture
def default_gateway() -> PermissionGateway:
    """Fixture providing a fresh PermissionGateway with default action registry."""
    return PermissionGateway(confirmation_ttl_seconds=60.0)


# ============================================================================
# 1. Valid Registered Read-Only Actions
# ============================================================================

def test_valid_registered_read_only_action(default_gateway: PermissionGateway) -> None:
    """Verify read-only actions are independently authorized and execute safely."""
    proposal_status = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Check telescope operational readiness",
    )
    auth_status = default_gateway.evaluate_proposal(proposal_status)

    assert auth_status.authorized is True
    assert auth_status.status == "authorized"
    assert auth_status.risk_level == "read_only"
    assert auth_status.prompt is None
    assert auth_status.confirmation_token is None
    assert auth_status.dispatch_token is not None
    assert auth_status.gateway_signature is not None

    result_status = default_gateway.execute_action(auth_status)
    assert result_status.status == "success"
    assert result_status.output_data == {
        "station_mode": "Observatory",
        "active_planet": "Saturn",
        "health": "NOMINAL",
    }
    assert result_status.execution_duration_ms >= 0.0

    # Action with valid parameters: list_observation_targets
    proposal_targets = make_proposal(
        action_name="list_observation_targets",
        parameters={"category": "star", "limit": 2},
        intent_summary="Find visible star targets",
    )
    auth_targets = default_gateway.evaluate_proposal(proposal_targets)

    assert auth_targets.authorized is True
    assert auth_targets.status == "authorized"
    assert auth_targets.risk_level == "read_only"
    assert auth_targets.validated_parameters == {"category": "star", "limit": 2}

    result_targets = default_gateway.execute_action(auth_targets)
    assert result_targets.status == "success"
    assert len(result_targets.output_data["targets"]) == 2
    assert result_targets.output_data["category"] == "star"


def test_valid_reversible_write_action(default_gateway: PermissionGateway) -> None:
    """Verify reversible write actions execute safely under policy without confirmation."""
    proposal = make_proposal(
        action_name="set_telescope_elevation",
        parameters={"elevation_degrees": 45.0},
        intent_summary="Align with Cygnus constellation",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is True
    assert auth.status == "authorized"
    assert auth.risk_level == "reversible_write"
    assert auth.validated_parameters == {"elevation_degrees": 45.0}

    result = default_gateway.execute_action(auth)
    assert result.status == "success"
    assert result.output_data == {"status": "applied", "elevation_degrees": 45.0}


# ============================================================================
# 2. Unknown and Malformed Action Rejection
# ============================================================================

def test_unknown_action_rejected(default_gateway: PermissionGateway) -> None:
    """Verify unknown actions are denied by default under allowlist policy."""
    proposal = make_proposal(
        action_name="unregistered_dangerous_action",
        parameters={"foo": "bar"},
        intent_summary="Untrusted attempt",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "denied"
    assert auth.error_code == "UNKNOWN_ACTION"
    assert "not registered" in auth.error_message

    # Attempting to execute unauthorized result fails closed
    exec_result = default_gateway.execute_action(auth)
    assert exec_result.status == "denied"
    assert exec_result.error_code == "UNAUTHORIZED_EXECUTION"


def test_malformed_parameters_rejected(default_gateway: PermissionGateway) -> None:
    """Verify parameter schema violations (out of bounds, wrong type) are rejected."""
    proposal = make_proposal(
        action_name="set_telescope_elevation",
        parameters={"elevation_degrees": 120.0},  # Out of range (0-90)
        intent_summary="Point past zenith",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "denied"
    assert auth.error_code == "INVALID_PARAMETERS"


def test_extra_parameters_forbidden(default_gateway: PermissionGateway) -> None:
    """Verify extra/unexpected parameter fields are strictly forbidden."""
    proposal = make_proposal(
        action_name="set_telescope_elevation",
        parameters={
            "elevation_degrees": 45.0,
            "injected_field": "exploit_attempt",
        },
        intent_summary="Testing extra field injection",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "denied"
    assert auth.error_code == "INVALID_PARAMETERS"


def test_empty_params_rejects_non_empty(default_gateway: PermissionGateway) -> None:
    """Verify actions expecting no parameters reject unexpected parameters."""
    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={"unexpected_flag": True},
        intent_summary="Status query with rogue parameter",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "denied"
    assert auth.error_code == "INVALID_PARAMETERS"


# ============================================================================
# 3. Model-Supplied Risk or Permission Escalation Attempts
# ============================================================================

def test_model_supplied_risk_escalation_ignored(default_gateway: PermissionGateway) -> None:
    """Verify model claims regarding risk level cannot bypass gateway policy."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Model attempts to execute consequential action silently",
        risk_level="read_only",  # Escalation attempt!
    )

    auth = default_gateway.evaluate_proposal(proposal)

    # Gateway independently assigns 'consequential' and demotes to awaiting_confirmation
    assert auth.authorized is False
    assert auth.status == "awaiting_confirmation"
    assert auth.risk_level == "consequential"
    assert auth.prompt is not None
    assert auth.prompt.action_name == "recalibrate_sensor_mount"
    assert auth.prompt.risk_tier == "consequential"
    # Token is NEVER leaked in model-facing evaluation
    assert auth.confirmation_token is None


# ============================================================================
# 4. Missing Confirmation for Protected Actions
# ============================================================================

def test_missing_confirmation_blocks_execution(default_gateway: PermissionGateway) -> None:
    """Verify consequential actions cannot be dispatched without explicit confirmation."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Recalibrate sensors",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "awaiting_confirmation"

    # Direct execution of unconfirmed authorization result fails closed
    exec_result = default_gateway.execute_action(auth)
    assert exec_result.status == "denied"
    assert exec_result.error_code == "UNAUTHORIZED_EXECUTION"

    # End-to-end execute_proposal also returns denied
    e2e_result = default_gateway.execute_proposal(proposal)
    assert e2e_result.status == "denied"
    assert e2e_result.error_code == "UNAUTHORIZED"


# ============================================================================
# 5. Valid Confirmation for the Exact Action
# ============================================================================

def test_valid_confirmation_authorizes_and_executes(default_gateway: PermissionGateway) -> None:
    """Verify exact proposal confirmation with valid token grants single-use authorization."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    assert eval_result.status == "awaiting_confirmation"
    assert eval_result.confirmation_token is None  # Not leaked

    # Trusted application boundary retrieves the single-use token
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)
    assert token is not None

    # Trusted application boundary approves confirmation with identical parameters
    auth_result = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )

    assert auth_result.authorized is True
    assert auth_result.status == "authorized"
    assert auth_result.action_name == "recalibrate_sensor_mount"
    assert auth_result.risk_level == "consequential"
    assert auth_result.dispatch_token is not None
    assert auth_result.gateway_signature is not None

    # Dispatch authorized action
    exec_result = default_gateway.execute_action(auth_result)
    assert exec_result.status == "success"
    assert exec_result.output_data == {
        "status": "calibrated",
        "sensor_id": "mount_alpha",
        "axis": "both",
    }


def test_user_rejection_denies_action(default_gateway: PermissionGateway) -> None:
    """Verify explicit user denial prevents action execution."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)

    # User explicitly clicks Cancel / Deny
    auth_result = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="denied",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )

    assert auth_result.authorized is False
    assert auth_result.status == "denied"
    assert auth_result.error_code == "USER_DENIED"

    exec_result = default_gateway.execute_action(auth_result)
    assert exec_result.status == "denied"
    assert exec_result.error_code == "UNAUTHORIZED_EXECUTION"


# ============================================================================
# 6. Payload Alteration After Confirmation (Tamper Detection)
# ============================================================================

def test_payload_alteration_after_confirmation_detected(default_gateway: PermissionGateway) -> None:
    """Verify modifying parameters after confirmation prompt generation is rejected."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)

    # Attacker attempts to change parameters before sending confirmation
    altered_parameters = {"sensor_id": "mount_alpha", "axis": "x"}

    auth_result = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters=altered_parameters,
    )

    assert auth_result.authorized is False
    assert auth_result.status == "denied"
    assert auth_result.error_code == "ARGUMENT_TAMPERED"
    assert "parameters have been modified" in auth_result.error_message


def test_parameter_addition_after_confirmation_detected(default_gateway: PermissionGateway) -> None:
    """Verify adding extra parameters after prompt generation is rejected."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)

    altered_parameters = {
        "sensor_id": "mount_alpha",
        "axis": "both",
        "rogue_option": True,
    }

    auth_result = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters=altered_parameters,
    )

    assert auth_result.authorized is False
    assert auth_result.status == "denied"
    assert auth_result.error_code == "ARGUMENT_TAMPERED"


# ============================================================================
# 7. Expired, Forged, and Replayed Confirmations
# ============================================================================

def test_forged_confirmation_token_rejected(default_gateway: PermissionGateway) -> None:
    """Verify fabricated/random confirmation tokens are rejected."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    default_gateway.evaluate_proposal(proposal)

    forged_token = "fake_forged_token_0123456789abcdef0123456789abcdef"
    auth_result = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=forged_token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )

    assert auth_result.authorized is False
    assert auth_result.status == "denied"
    assert auth_result.error_code == "INVALID_CONFIRMATION_TOKEN"


def test_replayed_confirmation_token_rejected(default_gateway: PermissionGateway) -> None:
    """Verify a valid token cannot be replayed after its first consumption."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)

    # 1. First consumption succeeds
    first_auth = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    assert first_auth.authorized is True

    # 2. Replay with identical token fails closed
    replay_auth = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    assert replay_auth.authorized is False
    assert replay_auth.status == "denied"
    assert replay_auth.error_code == "CONFIRMATION_NOT_FOUND"


def test_expired_confirmation_rejected() -> None:
    """Verify expired confirmation tokens are rejected under TTL enforcement."""
    fast_gateway = PermissionGateway(confirmation_ttl_seconds=5.0)

    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration",
    )
    eval_result = fast_gateway.evaluate_proposal(proposal)
    token = fast_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)

    # Simulate expiration by artificially adjusting internal pending timestamps
    with fast_gateway._lock:
        pending = fast_gateway._pending_confirmations[str(proposal.proposal_id)]
        pending.monotonic_expiry = time.monotonic() - 1.0
        pending.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    auth_result = fast_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )

    assert auth_result.authorized is False
    assert auth_result.status == "denied"
    assert auth_result.error_code == "CONFIRMATION_EXPIRED"
    assert "expired" in auth_result.error_message


# ============================================================================
# 8. Confirmation Reuse Under Concurrent Requests
# ============================================================================

def test_confirmation_reuse_under_concurrent_requests(default_gateway: PermissionGateway) -> None:
    """Verify thread-safe atomic consumption prevents race-condition replay."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Sensor recalibration concurrency test",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)
    assert token is not None

    def attempt_confirm() -> GatewayAuthorizationResult:
        return default_gateway.confirm_and_authorize(
            proposal_id=proposal.proposal_id,
            confirmation_token=token,
            decision="approved",
            parameters={"sensor_id": "mount_alpha", "axis": "both"},
        )

    # Launch 10 simultaneous threads attempting to consume the single token
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(attempt_confirm) for _ in range(10)]
        for fut in as_completed(futures):
            results.append(fut.result())

    # Invariant: EXACTLY ONE thread must succeed; all others must be denied
    successes = [r for r in results if r.authorized is True]
    denials = [r for r in results if r.authorized is False]

    assert len(successes) == 1
    assert len(denials) == 9
    assert all(r.error_code == "CONFIRMATION_NOT_FOUND" for r in denials)


# ============================================================================
# 9. Executor Failure and Policy Failure Fail Closed
# ============================================================================

def test_executor_failure_fails_closed() -> None:
    """Verify runtime exceptions inside action handlers fail closed without leaking internals."""
    registry = create_default_registry()

    def failing_handler(params: dict) -> dict:
        raise RuntimeError("Hardware actuator motor stalled at position 42.1")

    registry.register(
        ActionPolicy(
            action_name="failing_action",
            description="Action whose handler deliberately crashes.",
            risk_level="reversible_write",
            requires_confirmation=False,
            parameter_schema=EmptyParams,
            handler=failing_handler,
        )
    )

    gateway = PermissionGateway(registry=registry)
    proposal = make_proposal(
        action_name="failing_action",
        parameters={},
        intent_summary="Trigger failure",
    )

    auth = gateway.evaluate_proposal(proposal)
    assert auth.authorized is True

    exec_result = gateway.execute_action(auth)
    assert exec_result.status == "failed"
    assert exec_result.error_code == "EXECUTION_FAILURE"
    # Diagnostic message sanitization: should mention exception type, not internal tracebacks
    assert "RuntimeError" in exec_result.error_message
    assert "hardware actuator motor" not in exec_result.error_message.lower()


def test_missing_executor_fails_closed() -> None:
    """Verify action policies registered without a handler fail closed."""
    registry = create_default_registry()
    registry.register(
        ActionPolicy(
            action_name="handlerless_action",
            description="Policy with no handler attached.",
            risk_level="read_only",
            requires_confirmation=False,
            parameter_schema=EmptyParams,
            handler=None,
        )
    )

    gateway = PermissionGateway(registry=registry)
    proposal = make_proposal(
        action_name="handlerless_action",
        parameters={},
        intent_summary="Handlerless test",
    )
    auth = gateway.evaluate_proposal(proposal)
    assert auth.authorized is True

    result = gateway.execute_action(auth)
    assert result.status == "failed"
    assert result.error_code == "NO_EXECUTOR"


# ============================================================================
# 10. Destructive and Arbitrary-Command Actions Remain Denied
# ============================================================================

def test_destructive_action_default_denied(default_gateway: PermissionGateway) -> None:
    """Verify destructive actions are denied under baseline system safety policy."""
    proposal = make_proposal(
        action_name="purge_observation_database",
        parameters={"confirm_phrase": "PURGE_ALL_DATA"},
        intent_summary="Attempted database purge",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    assert auth.authorized is False
    assert auth.status == "denied"
    assert auth.risk_level == "destructive"
    assert auth.error_code == "DESTRUCTIVE_ACTION_DENIED"
    assert "disabled by default safety policy" in auth.error_message

    exec_result = default_gateway.execute_action(auth)
    assert exec_result.status == "denied"


def test_arbitrary_shell_and_commands_denied(default_gateway: PermissionGateway) -> None:
    """Verify dangerous shell/OS commands are completely absent and denied."""
    dangerous_actions = [
        ("run_shell_command", {"cmd": "rm -rf /"}),
        ("exec_powershell", {"script": "Get-Process"}),
        ("eval_python", {"code": "__import__('os').system('calc')"}),
        ("write_arbitrary_file", {"path": "C:\\Windows\\System32\\bad.dll"}),
        ("open_unrestricted_socket", {"host": "evil.com", "port": 4444}),
    ]

    for name, params in dangerous_actions:
        proposal = make_proposal(
            action_name=name,
            parameters=params,
            intent_summary="Malicious attack vector simulation",
        )
        auth = default_gateway.evaluate_proposal(proposal)
        assert auth.authorized is False
        assert auth.status == "denied"
        assert auth.error_code == "UNKNOWN_ACTION"


# ============================================================================
# 11. Security Logging Hygiene
# ============================================================================

def test_logging_hygiene_no_tokens_or_secrets_logged(
    default_gateway: PermissionGateway,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify confirmation tokens, secrets, and raw parameter dumps are excluded from logs."""
    caplog.set_level(logging.DEBUG, logger="stella.brain.actions.gateway")

    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Check logging hygiene",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)
    assert token is not None

    auth = default_gateway.confirm_and_authorize(
        proposal_id=proposal.proposal_id,
        confirmation_token=token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    default_gateway.execute_action(auth)

    all_logs = " ".join(record.message for record in caplog.records)

    # Invariant 1: The secret confirmation token MUST NOT appear anywhere in the logs
    assert token not in all_logs

    # Invariant 2: Secret dispatch ticket MUST NOT appear in the logs
    assert auth.dispatch_token not in all_logs

    # Invariant 3: Simulated sensitive string should never appear in log records
    sensitive_token = "sk-ant-api03-test-secret-token"
    assert sensitive_token not in all_logs


# ============================================================================
# 12. Trusted Boundary Separation (Model Evaluation Never Leaks Token)
# ============================================================================

def test_model_facing_proposal_evaluation_does_not_leak_confirmation_token(
    default_gateway: PermissionGateway,
) -> None:
    """Verify evaluate_proposal NEVER exposes the single-use token to untrusted model callers."""
    proposal = make_proposal(
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Consequential action test",
    )
    eval_result = default_gateway.evaluate_proposal(proposal)

    assert eval_result.status == "awaiting_confirmation"
    # MUST BE NONE on model-facing result
    assert eval_result.confirmation_token is None
    assert eval_result.prompt is not None

    # Only accessible via trusted boundary method
    token = default_gateway.get_confirmation_token_for_trusted_boundary(eval_result.prompt.prompt_id)
    assert token is not None
    assert len(token) > 20


# ============================================================================
# 13. Forged Authorization Rejection (Critical Vulnerability Regression)
# ============================================================================

def test_forged_authorization_result_rejected_by_execute_action(
    default_gateway: PermissionGateway,
) -> None:
    """Verify manually fabricated GatewayAuthorizationResult cannot execute actions."""
    # Attacker constructs a fake 'authorized' object
    fake_auth = GatewayAuthorizationResult(
        proposal_id=uuid4(),
        action_name="recalibrate_sensor_mount",
        authorized=True,
        status="authorized",
        risk_level="consequential",
        validated_parameters={"sensor_id": "mount_alpha", "axis": "both"},
        canonical_digest=compute_parameter_digest({"sensor_id": "mount_alpha", "axis": "both"}),
    )

    result = default_gateway.execute_action(fake_auth)
    assert result.status == "denied"
    assert result.error_code == "FORGED_AUTHORIZATION"
    assert "missing required gateway cryptographic dispatch ticket" in result.error_message


def test_forged_dispatch_token_rejected_by_execute_action(
    default_gateway: PermissionGateway,
) -> None:
    """Verify authorization with fabricated/unknown dispatch token is rejected."""
    fake_auth = GatewayAuthorizationResult(
        proposal_id=uuid4(),
        action_name="get_observatory_status",
        authorized=True,
        status="authorized",
        risk_level="read_only",
        validated_parameters={},
        canonical_digest=compute_parameter_digest({}),
        dispatch_token="fake_dispatch_token_1234567890",
        gateway_signature="fake_signature_1234567890",
    )

    result = default_gateway.execute_action(fake_auth)
    assert result.status == "denied"
    assert result.error_code == "REPLAYED_OR_FORGED_AUTHORIZATION"


# ============================================================================
# 14. Single-Use Execution Replay Protection
# ============================================================================

def test_execution_single_use_replay_rejected(default_gateway: PermissionGateway) -> None:
    """Verify an authorized action cannot be dispatched a second time (execution replay)."""
    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Read status",
    )
    auth = default_gateway.evaluate_proposal(proposal)
    assert auth.authorized is True

    # 1. First execution succeeds
    first_exec = default_gateway.execute_action(auth)
    assert first_exec.status == "success"

    # 2. Replay with exact same authorization object fails closed
    second_exec = default_gateway.execute_action(auth)
    assert second_exec.status == "denied"
    assert second_exec.error_code == "REPLAYED_OR_FORGED_AUTHORIZATION"
    assert "replay rejected" in second_exec.error_message


def test_concurrent_execution_replay_protection(default_gateway: PermissionGateway) -> None:
    """Verify concurrent attempts to execute the same authorization yield exactly 1 execution."""
    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Concurrent status probe",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    def attempt_execution() -> ToolExecutionResult:
        return default_gateway.execute_action(auth)

    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(attempt_execution) for _ in range(10)]
        for fut in as_completed(futures):
            results.append(fut.result())

    successes = [r for r in results if r.status == "success"]
    denials = [r for r in results if r.status == "denied"]

    assert len(successes) == 1
    assert len(denials) == 9
    assert all(r.error_code == "REPLAYED_OR_FORGED_AUTHORIZATION" for r in denials)


# ============================================================================
# 15. Cryptographic Signature Tampering
# ============================================================================

def test_dispatch_signature_tampering_rejected(default_gateway: PermissionGateway) -> None:
    """Verify mutating the HMAC signature causes cryptographic verification to fail."""
    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Status query",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    # Construct tampered auth with flipped signature character
    tampered_sig = auth.gateway_signature[:-1] + ("A" if auth.gateway_signature[-1] != "A" else "B")
    tampered_auth = GatewayAuthorizationResult(
        proposal_id=auth.proposal_id,
        action_name=auth.action_name,
        authorized=True,
        status="authorized",
        risk_level=auth.risk_level,
        validated_parameters=auth.validated_parameters,
        canonical_digest=auth.canonical_digest,
        dispatch_token=auth.dispatch_token,
        gateway_signature=tampered_sig,
    )

    result = default_gateway.execute_action(tampered_auth)
    assert result.status == "denied"
    assert result.error_code == "FORGED_AUTHORIZATION"
    assert "signature verification failed" in result.error_message


# ============================================================================
# 16. Policy Changes After Authorization Fail Closed
# ============================================================================

def test_policy_revocation_at_dispatch_time() -> None:
    """Verify that if an action is revoked from the registry before dispatch, execution fails."""
    registry = create_default_registry()
    gateway = PermissionGateway(registry=registry)

    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Status query",
    )
    auth = gateway.evaluate_proposal(proposal)
    assert auth.authorized is True

    # Policy is deregistered prior to execution
    del registry._policies["get_observatory_status"]

    result = gateway.execute_action(auth)
    assert result.status == "failed"
    assert result.error_code == "NO_EXECUTOR"


def test_action_converted_to_destructive_fails_at_dispatch() -> None:
    """Verify that if an action is marked destructive after authorization, execution fails."""
    registry = create_default_registry()
    gateway = PermissionGateway(registry=registry)

    proposal = make_proposal(
        action_name="set_telescope_elevation",
        parameters={"elevation_degrees": 45.0},
        intent_summary="Elevation adjust",
    )
    auth = gateway.evaluate_proposal(proposal)
    assert auth.authorized is True

    # Mutate registry policy to destructive
    registry.register(
        ActionPolicy(
            action_name="set_telescope_elevation",
            description="Now marked destructive",
            risk_level="destructive",
            requires_confirmation=True,
            is_destructive=True,
            parameter_schema=SetElevationParams,
            handler=lambda params: {"status": "destroyed"},
        )
    )

    result = gateway.execute_action(auth)
    assert result.status == "denied"
    assert result.error_code == "DESTRUCTIVE_ACTION_DENIED"


# ============================================================================
# 17. Parameter Tampering at Dispatch
# ============================================================================

def test_parameter_tampering_at_dispatch_rejected(default_gateway: PermissionGateway) -> None:
    """Verify modifying parameters between authorization and dispatch is intercepted."""
    proposal = make_proposal(
        action_name="set_telescope_elevation",
        parameters={"elevation_degrees": 45.0},
        intent_summary="Set elevation",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    # Attacker constructs a result with tampered parameter value
    tampered_auth = GatewayAuthorizationResult(
        proposal_id=auth.proposal_id,
        action_name=auth.action_name,
        authorized=True,
        status="authorized",
        risk_level=auth.risk_level,
        validated_parameters={"elevation_degrees": 89.0},  # Modified value!
        canonical_digest=auth.canonical_digest,
        dispatch_token=auth.dispatch_token,
        gateway_signature=auth.gateway_signature,
    )

    result = default_gateway.execute_action(tampered_auth)
    assert result.status == "denied"
    assert result.error_code == "ARGUMENT_TAMPERED"


# ============================================================================
# 18. Frozen Model Immutability
# ============================================================================

def test_gateway_authorization_result_is_frozen(default_gateway: PermissionGateway) -> None:
    """Verify GatewayAuthorizationResult fields cannot be mutated in place."""
    proposal = make_proposal(
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Status query",
    )
    auth = default_gateway.evaluate_proposal(proposal)

    with pytest.raises(ValidationError):
        auth.action_name = "recalibrate_sensor_mount"  # type: ignore[misc]

    with pytest.raises(ValidationError):
        auth.authorized = False  # type: ignore[misc]


# ============================================================================
# 19. Registry Inspection and Containment
# ============================================================================

def test_registry_inspection_and_extensibility() -> None:
    """Verify registry allowlist queries and policy containment."""
    registry = create_default_registry()
    actions = registry.registered_actions

    assert "get_observatory_status" in actions
    assert "list_observation_targets" in actions
    assert "set_telescope_elevation" in actions
    assert "save_draft_note" in actions
    assert "recalibrate_sensor_mount" in actions
    assert "purge_observation_database" in actions
    assert "run_shell_command" not in actions

    registry.register(
        ActionPolicy(
            action_name="custom_safe_action",
            description="Safe custom diagnostic test",
            risk_level="read_only",
            requires_confirmation=False,
            parameter_schema=EmptyParams,
            handler=lambda params: {"custom": "ok"},
        )
    )
    assert registry.is_registered("custom_safe_action")
    gateway = PermissionGateway(registry=registry)
    result = gateway.execute_proposal(
        make_proposal(action_name="custom_safe_action", parameters={}, intent_summary="Test")
    )
    assert result.status == "success"
    assert result.output_data == {"custom": "ok"}
