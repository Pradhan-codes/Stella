"""Independent, fail-closed Permission Gateway for Stella Python Brain.

Enforces strict separation between model proposals, policy authorization, and execution.
The model can propose actions, but it CANNOT authorize them.

CRITICAL SECURITY PRINCIPLES:
1. Default-Deny: Any unregistered, malformed, or ambiguous action is denied.
2. Independent Policy: Model-supplied risk levels or permission claims are strictly ignored.
   The gateway determines risk and confirmation demands using trusted policy alone.
3. Cryptographic Dispatch Binding: Authorized actions are stamped with single-use,
   HMAC-signed dispatch tickets. Fabricated or replayed authorizations are rejected.
4. Single-Use Replay Protection: Both confirmation nonces and dispatch tickets are short-lived,
   stored server-side, and atomically popped under concurrency locks upon first use.
5. Trusted Boundary Separation: Model-facing proposal evaluation results NEVER leak confirmation
   tokens. Only the trusted application boundary can access confirmation capabilities.
6. Parameter Immutability & Re-Digest Verification: Parameters are verified against their
   canonical SHA-256 digest both at proposal evaluation and at physical dispatch.
7. Zero Logging Leakage: Confirmation nonces, dispatch tickets, cryptographic keys, and
   raw sensitive parameter payloads are strictly excluded from log records.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging
import secrets
import threading
import time
from typing import Any, Dict, Literal, Optional, Union
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from brain.actions.base import (
    ActionRiskLevel,
    BaseActionProposal,
    ToolExecutionResult,
    UserConfirmationPrompt,
    compute_parameter_digest,
)
from brain.actions.registry import ActionPolicy, ActionRegistry, create_default_registry

logger = logging.getLogger("stella.brain.actions.gateway")


# ============================================================================
# Gateway Contracts
# ============================================================================

class GatewayAuthorizationResult(BaseModel):
    """Immutable result of Gateway policy evaluation and authorization check."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    proposal_id: UUID = Field(
        description="UUID of the action proposal being evaluated.",
    )
    action_name: str = Field(
        description="Name of the action evaluated.",
    )
    authorized: bool = Field(
        description="Whether the action is authorized for immediate dispatch.",
    )
    status: Literal["authorized", "awaiting_confirmation", "denied"] = Field(
        description="Authorization lifecycle state.",
    )
    risk_level: ActionRiskLevel = Field(
        description="True risk level independently assigned by gateway policy.",
    )
    validated_parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Immutable canonical parameters dictionary if authorized.",
    )
    canonical_digest: Optional[str] = Field(
        default=None,
        description="SHA-256 digest of canonicalized parameters.",
    )
    prompt: Optional[UserConfirmationPrompt] = Field(
        default=None,
        description="Confirmation prompt if status is 'awaiting_confirmation'.",
    )
    confirmation_token: Optional[str] = Field(
        default=None,
        description="Single-use confirmation token. Never exposed to untrusted model-facing callers.",
    )
    dispatch_token: Optional[str] = Field(
        default=None,
        description="Single-use unpredictable dispatch ticket issued by gateway.",
    )
    gateway_signature: Optional[str] = Field(
        default=None,
        description="HMAC-SHA256 signature binding authorization to this gateway instance.",
    )
    error_code: Optional[str] = Field(
        default=None,
        description="Standardized error code if denied or failed.",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Sanitized diagnostic message if denied or failed.",
    )


class PendingConfirmation:
    """Internal server-side tracking record for an awaiting confirmation."""

    __slots__ = (
        "token",
        "prompt_id",
        "proposal_id",
        "action_name",
        "parameters_digest",
        "validated_parameters",
        "risk_level",
        "created_at",
        "expires_at",
        "monotonic_expiry",
        "consumed",
    )

    def __init__(
        self,
        token: str,
        prompt_id: UUID,
        proposal_id: UUID,
        action_name: str,
        parameters_digest: str,
        validated_parameters: Dict[str, Any],
        risk_level: ActionRiskLevel,
        expires_at: datetime,
        monotonic_expiry: float,
    ) -> None:
        self.token = token
        self.prompt_id = prompt_id
        self.proposal_id = proposal_id
        self.action_name = action_name
        self.parameters_digest = parameters_digest
        self.validated_parameters = validated_parameters
        self.risk_level = risk_level
        self.created_at = datetime.now(timezone.utc)
        self.expires_at = expires_at
        self.monotonic_expiry = monotonic_expiry
        self.consumed = False


class ActiveDispatch:
    """Internal server-side tracking record for an authorized action dispatch ticket."""

    __slots__ = (
        "dispatch_token",
        "proposal_id",
        "action_name",
        "canonical_digest",
        "validated_parameters",
        "risk_level",
        "confirmed_by_user",
        "created_at",
        "expires_at",
        "monotonic_expiry",
        "consumed",
    )

    def __init__(
        self,
        dispatch_token: str,
        proposal_id: UUID,
        action_name: str,
        canonical_digest: str,
        validated_parameters: Dict[str, Any],
        risk_level: ActionRiskLevel,
        confirmed_by_user: bool,
        expires_at: datetime,
        monotonic_expiry: float,
    ) -> None:
        self.dispatch_token = dispatch_token
        self.proposal_id = proposal_id
        self.action_name = action_name
        self.canonical_digest = canonical_digest
        self.validated_parameters = validated_parameters
        self.risk_level = risk_level
        self.confirmed_by_user = confirmed_by_user
        self.created_at = datetime.now(timezone.utc)
        self.expires_at = expires_at
        self.monotonic_expiry = monotonic_expiry
        self.consumed = False


# ============================================================================
# Permission Gateway Core
# ============================================================================

class PermissionGateway:
    """Independent fail-closed authorization gateway between proposals and execution."""

    def __init__(
        self,
        registry: Optional[ActionRegistry] = None,
        confirmation_ttl_seconds: float = 60.0,
    ) -> None:
        """Initialize Permission Gateway.

        Args:
            registry: Action allowlist and policy registry. Defaults to create_default_registry().
            confirmation_ttl_seconds: Time-to-live in seconds before unconfirmed prompts or
                unconsumed dispatch tickets expire.
        """
        self.registry = registry or create_default_registry()
        self.confirmation_ttl_seconds = max(5.0, min(confirmation_ttl_seconds, 600.0))
        self._gateway_secret: bytes = secrets.token_bytes(32)
        self._pending_confirmations: Dict[str, PendingConfirmation] = {}
        self._active_dispatches: Dict[str, ActiveDispatch] = {}
        self._lock = threading.Lock()

    def _compute_dispatch_signature(
        self,
        proposal_id: UUID,
        action_name: str,
        canonical_digest: str,
        dispatch_token: str,
    ) -> str:
        """Compute HMAC-SHA256 signature binding authorization metadata to this gateway."""
        payload = f"{proposal_id}:{action_name}:{canonical_digest}:{dispatch_token}"
        return hmac.new(
            self._gateway_secret,
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _issue_dispatch(
        self,
        proposal_id: UUID,
        action_name: str,
        canonical_digest: str,
        validated_parameters: Dict[str, Any],
        risk_level: ActionRiskLevel,
        confirmed_by_user: bool,
    ) -> GatewayAuthorizationResult:
        """Issue an immutable, cryptographically sealed single-use dispatch authorization."""
        dispatch_token = secrets.token_urlsafe(32)
        signature = self._compute_dispatch_signature(
            proposal_id=proposal_id,
            action_name=action_name,
            canonical_digest=canonical_digest,
            dispatch_token=dispatch_token,
        )

        now_utc = datetime.now(timezone.utc)
        expires_at = now_utc + timedelta(seconds=self.confirmation_ttl_seconds)
        monotonic_exp = time.monotonic() + self.confirmation_ttl_seconds

        dispatch = ActiveDispatch(
            dispatch_token=dispatch_token,
            proposal_id=proposal_id,
            action_name=action_name,
            canonical_digest=canonical_digest,
            validated_parameters=dict(validated_parameters),
            risk_level=risk_level,
            confirmed_by_user=confirmed_by_user,
            expires_at=expires_at,
            monotonic_expiry=monotonic_exp,
        )

        with self._lock:
            self._active_dispatches[dispatch_token] = dispatch

        return GatewayAuthorizationResult(
            proposal_id=proposal_id,
            action_name=action_name,
            authorized=True,
            status="authorized",
            risk_level=risk_level,
            validated_parameters=validated_parameters,
            canonical_digest=canonical_digest,
            dispatch_token=dispatch_token,
            gateway_signature=signature,
        )

    def get_confirmation_token_for_trusted_boundary(
        self,
        prompt_or_proposal_id: Union[UUID, str],
    ) -> Optional[str]:
        """Retrieve the single-use confirmation token for a pending prompt.

        TRUSTED APPLICATION BOUNDARY ONLY:
        This method is strictly intended for trusted host UI/controller code
        presenting the prompt modal to the user. Model-facing reasoning code must
        NEVER have access to this method or receive confirmation tokens.
        """
        key = str(prompt_or_proposal_id)
        with self._lock:
            pending = self._pending_confirmations.get(key)
            if pending is None or pending.consumed:
                return None
            return pending.token

    def evaluate_proposal(self, proposal: BaseActionProposal) -> GatewayAuthorizationResult:
        """Evaluate an untrusted action proposal against independent security policy.

        Args:
            proposal: Untrusted BaseActionProposal emitted by reasoning subsystem.

        Returns:
            GatewayAuthorizationResult specifying authorization status, true risk tier,
            and confirmation requirements if applicable.
        """
        action_name = proposal.action_name

        # 1. Allowlist verification: Unknown actions are rejected immediately
        policy = self.registry.get(action_name)
        if policy is None:
            logger.warning(
                "Gateway denied unregistered action '%s' for proposal [%s]",
                action_name,
                proposal.proposal_id,
            )
            return GatewayAuthorizationResult(
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                authorized=False,
                status="denied",
                risk_level="consequential",
                error_code="UNKNOWN_ACTION",
                error_message=f"Action '{action_name}' is not registered in the authorized allowlist.",
            )

        # 2. Strict Parameter Validation: Schema validation rejecting extra fields
        validated_params: Dict[str, Any] = {}
        if policy.parameter_schema is not None:
            try:
                validated_model = policy.parameter_schema.model_validate(proposal.parameters)
                validated_params = validated_model.model_dump()
            except ValidationError as err:
                logger.warning(
                    "Gateway rejected malformed parameters for action '%s' [%s]",
                    action_name,
                    proposal.proposal_id,
                )
                return GatewayAuthorizationResult(
                    proposal_id=proposal.proposal_id,
                    action_name=action_name,
                    authorized=False,
                    status="denied",
                    risk_level=policy.risk_level,
                    error_code="INVALID_PARAMETERS",
                    error_message=f"Parameter schema validation failed for action '{action_name}': {err.errors()[0]['msg']}",
                )
        else:
            if proposal.parameters:
                return GatewayAuthorizationResult(
                    proposal_id=proposal.proposal_id,
                    action_name=action_name,
                    authorized=False,
                    status="denied",
                    risk_level=policy.risk_level,
                    error_code="UNEXPECTED_PARAMETERS",
                    error_message=f"Action '{action_name}' does not accept parameters.",
                )

        # 3. Canonical Parameter Digest
        try:
            digest = compute_parameter_digest(validated_params)
        except Exception as err:
            return GatewayAuthorizationResult(
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                authorized=False,
                status="denied",
                risk_level=policy.risk_level,
                error_code="CANONICALIZATION_FAILED",
                error_message=f"Failed to canonicalize parameters: {type(err).__name__}",
            )

        # 4. Destructive Action Guard: Default-deny
        if policy.is_destructive:
            logger.warning(
                "Gateway denied destructive action '%s' [%s] under default system policy",
                action_name,
                proposal.proposal_id,
            )
            return GatewayAuthorizationResult(
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                authorized=False,
                status="denied",
                risk_level=policy.risk_level,
                error_code="DESTRUCTIVE_ACTION_DENIED",
                error_message=f"Destructive action '{action_name}' is disabled by default safety policy.",
            )

        # 5. User Confirmation Required (Consequential actions)
        if policy.requires_confirmation:
            prompt_id = uuid4()
            token = secrets.token_urlsafe(32)
            now_utc = datetime.now(timezone.utc)
            expires_at = now_utc + timedelta(seconds=self.confirmation_ttl_seconds)
            monotonic_exp = time.monotonic() + self.confirmation_ttl_seconds

            pending = PendingConfirmation(
                token=token,
                prompt_id=prompt_id,
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                parameters_digest=digest,
                validated_parameters=validated_params,
                risk_level=policy.risk_level,
                expires_at=expires_at,
                monotonic_expiry=monotonic_exp,
            )

            with self._lock:
                # Indexed by both proposal_id and prompt_id for trusted boundary lookup
                self._pending_confirmations[str(proposal.proposal_id)] = pending
                self._pending_confirmations[str(prompt_id)] = pending

            prompt = UserConfirmationPrompt(
                prompt_id=prompt_id,
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                human_readable_summary=policy.description,
                parameters_display={k: str(v) for k, v in validated_params.items()},
                parameters_digest=digest,
                risk_tier=policy.risk_level,
            )

            logger.info(
                "Gateway issued confirmation prompt [%s] for proposal [%s] (Action: '%s')",
                prompt_id,
                proposal.proposal_id,
                action_name,
            )

            # CRITICAL SECURITY RULE: The secret confirmation token is NEVER leaked
            # to untrusted model-facing callers. It remains strictly internal.
            return GatewayAuthorizationResult(
                proposal_id=proposal.proposal_id,
                action_name=action_name,
                authorized=False,
                status="awaiting_confirmation",
                risk_level=policy.risk_level,
                validated_parameters=validated_params,
                canonical_digest=digest,
                prompt=prompt,
                confirmation_token=None,
            )

        # 6. Read-Only / Pre-Authorized Action (Issued genuine single-use dispatch ticket)
        logger.info(
            "Gateway authorized registered action '%s' [%s] (Risk: '%s')",
            action_name,
            proposal.proposal_id,
            policy.risk_level,
        )

        return self._issue_dispatch(
            proposal_id=proposal.proposal_id,
            action_name=action_name,
            canonical_digest=digest,
            validated_parameters=validated_params,
            risk_level=policy.risk_level,
            confirmed_by_user=False,
        )

    def confirm_and_authorize(
        self,
        proposal_id: Union[UUID, str],
        confirmation_token: str,
        decision: Literal["approved", "denied"],
        parameters: Dict[str, Any],
    ) -> GatewayAuthorizationResult:
        """Validate confirmation from trusted application boundary and authorize execution.

        CRITICAL SECURITY INVARIANTS:
        1. Single-Use Consumption: Pending confirmation is removed atomically inside lock.
        2. Token Equality: Token compared via constant-time comparison (hmac.compare_digest).
        3. Parameter Immutability: Supplied parameters must re-digest to exact matching SHA-256.
        4. Expiry Check: Monotonic clock and UTC time checked against configured TTL.
        5. Dispatch Sealing: Approved confirmations issue an HMAC-signed single-use dispatch ticket.

        Args:
            proposal_id: UUID of proposal awaiting confirmation.
            confirmation_token: Unpredictable single-use token provided by trusted host.
            decision: "approved" or "denied".
            parameters: Action parameters dictionary for argument-tampering verification.

        Returns:
            GatewayAuthorizationResult with authorized=True on valid approval, or denied.
        """
        proposal_key = str(proposal_id)

        # Atomic retrieval and consumption under lock
        with self._lock:
            pending = self._pending_confirmations.get(proposal_key)
            if pending is None or pending.consumed:
                logger.warning(
                    "Confirmation failed: no active pending confirmation for identifier [%s]",
                    proposal_id,
                )
                return GatewayAuthorizationResult(
                    proposal_id=UUID(proposal_key) if isinstance(proposal_id, str) and len(proposal_key) == 36 else (proposal_id if isinstance(proposal_id, UUID) else uuid4()),
                    action_name="unknown",
                    authorized=False,
                    status="denied",
                    risk_level="consequential",
                    error_code="CONFIRMATION_NOT_FOUND",
                    error_message="Confirmation prompt not found, already consumed, or expired.",
                )
            # Atomically consume and remove all index references
            pending.consumed = True
            self._pending_confirmations.pop(str(pending.proposal_id), None)
            self._pending_confirmations.pop(str(pending.prompt_id), None)

        # Constant-time token verification
        if not hmac.compare_digest(pending.token, confirmation_token or ""):
            logger.warning("Confirmation token mismatch for proposal [%s]", pending.proposal_id)
            return GatewayAuthorizationResult(
                proposal_id=pending.proposal_id,
                action_name=pending.action_name,
                authorized=False,
                status="denied",
                risk_level=pending.risk_level,
                error_code="INVALID_CONFIRMATION_TOKEN",
                error_message="Confirmation token mismatch or forged authorization attempt.",
            )

        # Dual-clock expiration check (monotonic clock + UTC)
        now_mono = time.monotonic()
        now_utc = datetime.now(timezone.utc)
        if now_mono > pending.monotonic_expiry or now_utc > pending.expires_at:
            logger.warning("Confirmation prompt expired for proposal [%s]", pending.proposal_id)
            return GatewayAuthorizationResult(
                proposal_id=pending.proposal_id,
                action_name=pending.action_name,
                authorized=False,
                status="denied",
                risk_level=pending.risk_level,
                error_code="CONFIRMATION_EXPIRED",
                error_message="Confirmation prompt has expired past its time-to-live.",
            )

        # Argument tampering verification
        try:
            current_digest = compute_parameter_digest(parameters)
        except Exception:
            current_digest = ""

        if current_digest != pending.parameters_digest:
            logger.warning(
                "Parameter tampering detected for proposal [%s] (Digest mismatch)",
                pending.proposal_id,
            )
            return GatewayAuthorizationResult(
                proposal_id=pending.proposal_id,
                action_name=pending.action_name,
                authorized=False,
                status="denied",
                risk_level=pending.risk_level,
                error_code="ARGUMENT_TAMPERED",
                error_message="Action parameters have been modified since confirmation prompt generation.",
            )

        # Explicit user choice
        if decision != "approved":
            logger.info("User explicitly denied confirmation for proposal [%s]", pending.proposal_id)
            return GatewayAuthorizationResult(
                proposal_id=pending.proposal_id,
                action_name=pending.action_name,
                authorized=False,
                status="denied",
                risk_level=pending.risk_level,
                error_code="USER_DENIED",
                error_message="User explicitly denied execution authorization.",
            )

        logger.info(
            "Action '%s' [%s] confirmed by trusted boundary",
            pending.action_name,
            pending.proposal_id,
        )

        return self._issue_dispatch(
            proposal_id=pending.proposal_id,
            action_name=pending.action_name,
            canonical_digest=pending.parameters_digest,
            validated_parameters=pending.validated_parameters,
            risk_level=pending.risk_level,
            confirmed_by_user=True,
        )

    def execute_action(self, authorization: GatewayAuthorizationResult) -> ToolExecutionResult:
        """Dispatch an authorized action to its registered executor.

        CRITICAL SECURITY INVARIANTS:
        1. Authorization Gate: Must be explicitly authorized.
        2. Cryptographic Dispatch Ticket: Must have a valid, unconsumed dispatch ticket and
           HMAC-SHA256 signature issued by this gateway instance.
        3. Single-Use Consumption: Ticket is popped and consumed atomically under lock.
        4. Parameter Integrity: Parameters are re-digested and verified against the ticket digest.
        5. Policy Re-Verification: Policy is inspected at dispatch time to prevent policy swaps.
        6. Exception Containment: Failure details are sanitized; secrets/traces are never leaked.

        Args:
            authorization: GatewayAuthorizationResult from evaluate_proposal or confirm_and_authorize.

        Returns:
            ToolExecutionResult detailing outcome, output data, and timing.
        """
        # Guard 1: Authorization gate
        if not authorization.authorized or authorization.status != "authorized":
            logger.warning(
                "Attempted execution of unauthorized action '%s' [%s]",
                authorization.action_name,
                authorization.proposal_id,
            )
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="UNAUTHORIZED_EXECUTION",
                error_message="Cannot dispatch tool: action was not authorized by Gateway.",
                execution_duration_ms=0.0,
            )

        # Guard 2: Dispatch ticket and signature presence
        if not authorization.dispatch_token or not authorization.gateway_signature:
            logger.warning(
                "Attempted execution with missing dispatch credentials for '%s' [%s]",
                authorization.action_name,
                authorization.proposal_id,
            )
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="FORGED_AUTHORIZATION",
                error_message="Action authorization missing required gateway cryptographic dispatch ticket.",
                execution_duration_ms=0.0,
            )

        # Guard 3: Atomic retrieval and single-use consumption
        with self._lock:
            dispatch = self._active_dispatches.pop(authorization.dispatch_token, None)
            if dispatch is None or dispatch.consumed:
                logger.warning(
                    "Execution denied: dispatch ticket not found or already executed [%s]",
                    authorization.proposal_id,
                )
                return ToolExecutionResult(
                    proposal_id=authorization.proposal_id,
                    status="denied",
                    error_code="REPLAYED_OR_FORGED_AUTHORIZATION",
                    error_message="Authorization ticket was not found, forged, or already executed (replay rejected).",
                    execution_duration_ms=0.0,
                )
            dispatch.consumed = True

        # Guard 4: Cryptographic HMAC signature verification
        expected_sig = self._compute_dispatch_signature(
            proposal_id=dispatch.proposal_id,
            action_name=dispatch.action_name,
            canonical_digest=dispatch.canonical_digest,
            dispatch_token=dispatch.dispatch_token,
        )

        if not hmac.compare_digest(expected_sig, authorization.gateway_signature):
            logger.warning("Cryptographic signature mismatch for proposal [%s]", authorization.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="FORGED_AUTHORIZATION",
                error_message="Authorization cryptographic signature verification failed.",
                execution_duration_ms=0.0,
            )

        # Guard 5: Dual-clock ticket expiration
        now_mono = time.monotonic()
        now_utc = datetime.now(timezone.utc)
        if now_mono > dispatch.monotonic_expiry or now_utc > dispatch.expires_at:
            logger.warning("Dispatch ticket expired for proposal [%s]", authorization.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="AUTHORIZATION_EXPIRED",
                error_message="Action authorization ticket has expired prior to dispatch.",
                execution_duration_ms=0.0,
            )

        # Guard 6: Structural and parameter integrity verification
        if (
            dispatch.proposal_id != authorization.proposal_id
            or dispatch.action_name != authorization.action_name
            or dispatch.canonical_digest != authorization.canonical_digest
        ):
            logger.warning("Authorization structural metadata mismatch for [%s]", authorization.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="FORGED_AUTHORIZATION",
                error_message="Authorization metadata does not match registered dispatch ticket.",
                execution_duration_ms=0.0,
            )

        # Guard 7: Parameter re-digest verification
        params = authorization.validated_parameters or {}
        try:
            current_digest = compute_parameter_digest(params)
        except Exception:
            current_digest = ""

        if current_digest != dispatch.canonical_digest:
            logger.warning("Parameter tampering detected at dispatch for proposal [%s]", authorization.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="ARGUMENT_TAMPERED",
                error_message="Action parameters modified between authorization and execution.",
                execution_duration_ms=0.0,
            )

        # Guard 8: Current registry policy check (prevents policy swaps after authorization)
        policy = self.registry.get(dispatch.action_name)
        if policy is None or policy.handler is None:
            logger.warning("No registered executor for action '%s' [%s]", dispatch.action_name, dispatch.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="failed",
                error_code="NO_EXECUTOR",
                error_message=f"No execution handler registered for action '{dispatch.action_name}'.",
                execution_duration_ms=0.0,
            )

        if policy.is_destructive:
            logger.warning("Destructive action denied at dispatch '%s' [%s]", dispatch.action_name, dispatch.proposal_id)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="DESTRUCTIVE_ACTION_DENIED",
                error_message=f"Destructive action '{dispatch.action_name}' is disabled by default safety policy.",
                execution_duration_ms=0.0,
            )

        if policy.requires_confirmation and not dispatch.confirmed_by_user:
            logger.warning("Unconfirmed consequential action denied at dispatch '%s'", dispatch.action_name)
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="denied",
                error_code="UNAUTHORIZED_EXECUTION",
                error_message=f"Action '{dispatch.action_name}' requires explicit user confirmation.",
                execution_duration_ms=0.0,
            )

        # Guard 9: Schema re-validation
        if policy.parameter_schema is not None:
            try:
                policy.parameter_schema.model_validate(params)
            except ValidationError as err:
                return ToolExecutionResult(
                    proposal_id=authorization.proposal_id,
                    status="denied",
                    error_code="INVALID_PARAMETERS",
                    error_message=f"Parameter schema validation failed at dispatch: {err.errors()[0]['msg']}",
                    execution_duration_ms=0.0,
                )

        # Guard 10: Dispatch with timing and failure isolation
        t0 = time.perf_counter()
        try:
            output = policy.handler(dispatch.validated_parameters)
            duration_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(
                "Executed action '%s' [%s] in %.2fms (status='success')",
                dispatch.action_name,
                dispatch.proposal_id,
                duration_ms,
            )
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="success",
                output_data=output,
                execution_duration_ms=duration_ms,
            )
        except Exception as err:
            duration_ms = (time.perf_counter() - t0) * 1000.0
            logger.warning(
                "Execution failed for action '%s' [%s]: %s",
                dispatch.action_name,
                dispatch.proposal_id,
                type(err).__name__,
            )
            return ToolExecutionResult(
                proposal_id=authorization.proposal_id,
                status="failed",
                error_code="EXECUTION_FAILURE",
                error_message=f"Tool execution encountered an internal error: {type(err).__name__}",
                execution_duration_ms=duration_ms,
            )

    def execute_proposal(self, proposal: BaseActionProposal) -> ToolExecutionResult:
        """End-to-end convenience method: evaluate proposal and execute if authorized.

        If the proposal requires confirmation or is denied, returns a denied ToolExecutionResult.
        """
        auth_result = self.evaluate_proposal(proposal)
        if not auth_result.authorized:
            return ToolExecutionResult(
                proposal_id=proposal.proposal_id,
                status="denied",
                error_code=auth_result.error_code or "UNAUTHORIZED",
                error_message=auth_result.error_message or "Action requires confirmation or was denied.",
                execution_duration_ms=0.0,
            )
        return self.execute_action(auth_result)
