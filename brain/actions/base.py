"""Base data models and parameter digest utilities for Stella action proposals.

CRITICAL ARCHITECTURAL BOUNDARY & SECURITY NOTICE:
1. Pydantic models in this module validate data shape and parameter types only.
   Pydantic does NOT authorize actions or enforce system permissions.
2. All client-supplied confirmation payloads (prompt IDs, digests, timestamps)
   are treated as strictly UNTRUSTED inputs.
3. This module provides baseline data structures and canonical digest utilities.
   It does NOT implement or claim a complete permission gateway, trusted nonce
   minting system, or real action execution engine (deferred to later steps).
"""

import hashlib
import json
import math
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

ActionRiskLevel = Literal["read_only", "reversible_write", "consequential", "destructive"]
ActionRiskTier = ActionRiskLevel  # Backward compatibility alias
ExecutionStatus = Literal["success", "denied", "failed", "cancelled"]


def canonicalize_parameters(parameters: Dict[str, Any]) -> str:
    """Recursively canonicalize an action parameter dictionary into deterministic JSON.

    Guarantees:
    - Dictionary keys must be strings and are sorted lexicographically at all nesting depths.
    - JSON serialization uses compact separators (no arbitrary whitespace).
    - Strict JSON: NaN, +Infinity, and -Infinity are rejected with ValueError.
    - Unsupported types (set, custom objects, functions, generators) are rejected with TypeError.
    - Supported types: dict, list, tuple, str, int, float (finite only), bool, None, UUID, datetime.
    - Consistent UTF-8 encoding.

    Raises:
        TypeError: If parameters is not a dict, if dict keys are not strings, or if unsupported types are passed.
        ValueError: If non-finite floating point values (NaN, Infinity) are encountered.
    """
    if not isinstance(parameters, dict):
        raise TypeError(f"Action parameters must be a dictionary, got '{type(parameters).__name__}'.")

    def _normalize(value: Any) -> Any:
        # Check booleans first (bool is a subclass of int in Python)
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            if not math.isfinite(value):
                raise ValueError(
                    f"Out-of-range float value '{value}' (NaN or Infinity) is not permitted in action parameters."
                )
            return value
        if isinstance(value, str):
            return value
        if value is None:
            return None
        if isinstance(value, dict):
            normalized_dict = {}
            for k in sorted(value.keys()):
                if not isinstance(k, str):
                    raise TypeError(f"Dictionary keys must be strings, got '{type(k).__name__}'.")
                normalized_dict[k] = _normalize(value[k])
            return normalized_dict
        if isinstance(value, (list, tuple)):
            return [_normalize(item) for item in value]
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()

        raise TypeError(
            f"Unsupported parameter type '{type(value).__name__}'. "
            "Only dict, list, tuple, str, int, float, bool, None, UUID, and datetime are permitted."
        )

    normalized = _normalize(parameters)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def compute_parameter_digest(parameters: Dict[str, Any]) -> str:
    """Compute the SHA-256 hexadecimal digest of canonicalized action parameters.

    Provides parameter immutability verification: if any argument key, value,
    type, or nested structure is modified, the digest will change.

    Args:
        parameters: The action parameter dictionary.

    Returns:
        64-character lowercase hexadecimal SHA-256 string.
    """
    canonical_json = canonicalize_parameters(parameters)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class BaseActionProposal(BaseModel):
    """Base schema for an action proposed by the reasoning engine.

    CRITICAL SECURITY NOTICE:
    The 'risk_level' attribute on an action proposal is model-suggested metadata.
    It does NOT authorize execution or bind system permissions. The independent
    Permission Gateway independently determines the true risk tier and required
    authorizations based on system policy.
    """

    model_config = ConfigDict(extra="forbid")

    proposal_id: UUID = Field(
        description="Unique UUIDv4 identifying this specific action proposal.",
    )
    turn_id: str = Field(
        description="Correlation ID of the conversational turn that spawned this proposal.",
    )
    action_name: str = Field(
        min_length=1,
        max_length=64,
        description="Canonical identifier of the requested action from the authorized registry.",
    )
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Action-specific parameters dictionary.",
    )
    intent_summary: str = Field(
        min_length=1,
        max_length=256,
        description="Plain-language human-readable rationale for proposing this action.",
    )
    risk_level: ActionRiskLevel = Field(
        default="read_only",
        description="Model-suggested risk tier. Independent gateway verifies actual policy tier.",
    )
    requested_scope: str = Field(
        default="workspace",
        description="Security scope requested for execution (e.g. workspace, memory, system).",
    )

    @property
    def parameter_digest(self) -> str:
        """Return the SHA-256 parameter digest of the current arguments."""
        return compute_parameter_digest(self.parameters)


class UserConfirmationPrompt(BaseModel):
    """Schema for presenting an action proposal to the user for explicit confirmation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    prompt_id: UUID = Field(
        description="Unique UUIDv4 identifying this confirmation prompt.",
    )
    proposal_id: UUID = Field(
        description="The Proposal UUID this confirmation prompt binds to.",
    )
    action_name: str = Field(
        description="Name of the action awaiting confirmation.",
    )
    human_readable_summary: str = Field(
        description="Plain-language explanation displayed in the user confirmation modal.",
    )
    affected_targets: List[str] = Field(
        default_factory=list,
        description="Specific files, URIs, or endpoints affected by this action.",
    )
    parameters_display: Dict[str, str] = Field(
        default_factory=dict,
        description="Sanitized key-value strings formatted for human review.",
    )
    parameters_digest: str = Field(
        min_length=64,
        max_length=64,
        description="SHA-256 digest of canonicalized parameters to prevent argument tampering.",
    )
    risk_tier: ActionRiskLevel = Field(
        default="consequential",
        description="Risk level determining why confirmation is required.",
    )


class UserConfirmationDecision(BaseModel):
    """Untrusted client-submitted response to a UserConfirmationPrompt.

    SECURITY RULE:
    All fields in this model are received from untrusted clients (DOM/Renderer).
    The Gateway must independently verify prompt existence, argument equality,
    TTL expiration, policy authorization, and single-use replay protection.
    The client must NEVER mint or decide its own authorization nonces.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    prompt_id: UUID = Field(
        description="ID of the prompt being answered.",
    )
    proposal_id: UUID = Field(
        description="ID of the proposal being approved or rejected.",
    )
    decision: Literal["approved", "denied"] = Field(
        description="Explicit user choice.",
    )
    parameter_digest: str = Field(
        min_length=64,
        max_length=64,
        description="Digest supplied by client, verified against stored server prompt digest.",
    )
    decision_timestamp: datetime = Field(
        description="Client timestamp of decision (evaluated against Gateway server TTL).",
    )


class ToolExecutionResult(BaseModel):
    """Structured result returned after an authorized tool executes."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    proposal_id: UUID = Field(
        description="Proposal UUID that initiated this execution.",
    )
    status: ExecutionStatus = Field(
        description="Outcome status of the tool execution attempt.",
    )
    output_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Structured execution results on success.",
    )
    error_code: Optional[str] = Field(
        default=None,
        description="Standardized error code if execution failed or was denied.",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Sanitized diagnostic explanation if execution failed or was denied.",
    )
    execution_duration_ms: float = Field(
        ge=0.0,
        description="Duration of execution in milliseconds.",
    )
