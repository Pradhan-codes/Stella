"""Action registry and policy models for Stella Permission Gateway.

Defines the explicit allowlist of authorized system actions, parameter schemas,
independent risk tiers, and execution handlers.

CRITICAL SECURITY NOTICE:
1. Risk levels and confirmation requirements in ActionPolicy are IMMUTABLE trusted policy.
   They are NEVER derived from or influenced by untrusted model output.
2. Arbitrary shell execution, OS command automation, and unrestricted filesystem access
   are strictly unsupported and omitted from this registry.
"""

from typing import Any, Callable, Dict, List, Literal, Optional, Type
from pydantic import BaseModel, ConfigDict, Field

from brain.actions.base import ActionRiskLevel


# ============================================================================
# Action Parameter Schemas (Strict Extra-Forbidden)
# ============================================================================

class EmptyParams(BaseModel):
    """Schema for actions that accept no parameters."""

    model_config = ConfigDict(frozen=True, extra="forbid")


class ListTargetsParams(BaseModel):
    """Parameters for list_observation_targets action."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    category: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Optional celestial category filter (e.g. galaxy, nebula, star).",
    )
    limit: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Maximum targets to return.",
    )


class SetElevationParams(BaseModel):
    """Parameters for set_telescope_elevation action."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    elevation_degrees: float = Field(
        ge=0.0,
        le=90.0,
        description="Telescope altitude angle in degrees from horizon to zenith.",
    )


class SaveDraftNoteParams(BaseModel):
    """Parameters for save_draft_note action."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    title: str = Field(
        min_length=1,
        max_length=128,
        description="Title of the draft observation note.",
    )
    body: str = Field(
        min_length=1,
        max_length=2048,
        description="Body content of the draft note.",
    )


class RecalibrateSensorParams(BaseModel):
    """Parameters for recalibrate_sensor_mount action."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    sensor_id: str = Field(
        min_length=1,
        max_length=64,
        description="Identifier of the optical sensor assembly.",
    )
    axis: Literal["x", "y", "both"] = Field(
        default="both",
        description="Mechanical axis to recalibrate.",
    )


class PurgeDatabaseParams(BaseModel):
    """Parameters for purge_observation_database action."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    confirm_phrase: str = Field(
        min_length=1,
        max_length=128,
        description="Safety phrase confirming intent to purge records.",
    )


# ============================================================================
# Action Policy Definition
# ============================================================================

class ActionPolicy(BaseModel):
    """Trusted authorization policy for an individual registered action."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True, extra="forbid")

    action_name: str = Field(
        min_length=1,
        max_length=64,
        description="Canonical identifier of the action.",
    )
    description: str = Field(
        min_length=1,
        max_length=256,
        description="Human-readable explanation of what this action does.",
    )
    risk_level: ActionRiskLevel = Field(
        description="Trusted risk classification independently assigned to this action.",
    )
    requires_confirmation: bool = Field(
        default=False,
        description="Whether this action demands explicit user confirmation before execution.",
    )
    parameter_schema: Optional[Type[BaseModel]] = Field(
        default=None,
        description="Pydantic schema used to validate parameters and reject extra fields.",
    )
    is_destructive: bool = Field(
        default=False,
        description="Whether this action performs irreversible deletion or system purge.",
    )
    handler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = Field(
        default=None,
        description="In-process execution callable.",
    )


# ============================================================================
# Action Registry
# ============================================================================

class ActionRegistry:
    """Allowlist registry managing supported action policies and executors."""

    def __init__(self) -> None:
        self._policies: Dict[str, ActionPolicy] = {}

    def register(self, policy: ActionPolicy) -> None:
        """Register an action policy into the allowlist."""
        self._policies[policy.action_name] = policy

    def get(self, action_name: str) -> Optional[ActionPolicy]:
        """Look up an action policy by name. Returns None if unknown/unregistered."""
        return self._policies.get(action_name)

    def is_registered(self, action_name: str) -> bool:
        """Check whether an action is explicitly registered in the allowlist."""
        return action_name in self._policies

    @property
    def registered_actions(self) -> List[str]:
        """Return list of all registered action names."""
        return sorted(self._policies.keys())


def create_default_registry() -> ActionRegistry:
    """Construct the initial approved capability set with safe in-memory executors."""
    registry = ActionRegistry()

    # 1. Read-Only Actions (No confirmation required)
    registry.register(
        ActionPolicy(
            action_name="get_observatory_status",
            description="Retrieve current observatory mode, active planet, and system status.",
            risk_level="read_only",
            requires_confirmation=False,
            parameter_schema=EmptyParams,
            handler=lambda params: {
                "station_mode": "Observatory",
                "active_planet": "Saturn",
                "health": "NOMINAL",
            },
        )
    )

    registry.register(
        ActionPolicy(
            action_name="list_observation_targets",
            description="List celestial objects available for telescope observation.",
            risk_level="read_only",
            requires_confirmation=False,
            parameter_schema=ListTargetsParams,
            handler=lambda params: {
                "category": params.get("category"),
                "targets": [
                    {"name": "M31 Andromeda", "category": "galaxy"},
                    {"name": "NGC 7000 North America", "category": "nebula"},
                    {"name": "Vega", "category": "star"},
                    {"name": "Betelgeuse", "category": "star"},
                ][: params.get("limit", 10)],
            },
        )
    )

    # 2. Reversible Writes (Safe parameters, no confirmation required under baseline policy)
    registry.register(
        ActionPolicy(
            action_name="set_telescope_elevation",
            description="Adjust telescope altitude angle within safe bounds (0 to 90 degrees).",
            risk_level="reversible_write",
            requires_confirmation=False,
            parameter_schema=SetElevationParams,
            handler=lambda params: {
                "status": "applied",
                "elevation_degrees": params["elevation_degrees"],
            },
        )
    )

    registry.register(
        ActionPolicy(
            action_name="save_draft_note",
            description="Save a temporary observation draft note in local memory.",
            risk_level="reversible_write",
            requires_confirmation=False,
            parameter_schema=SaveDraftNoteParams,
            handler=lambda params: {
                "status": "saved_draft",
                "title": params["title"],
                "length": len(params["body"]),
            },
        )
    )

    # 3. Consequential Actions (Requires explicit user confirmation with single-use token)
    registry.register(
        ActionPolicy(
            action_name="recalibrate_sensor_mount",
            description="Perform physical hardware recalibration of optical sensor mount.",
            risk_level="consequential",
            requires_confirmation=True,
            parameter_schema=RecalibrateSensorParams,
            handler=lambda params: {
                "status": "calibrated",
                "sensor_id": params["sensor_id"],
                "axis": params["axis"],
            },
        )
    )

    # 4. Destructive Actions (Default-denied by policy)
    registry.register(
        ActionPolicy(
            action_name="purge_observation_database",
            description="Irreversibly delete historical astronomical observation catalog.",
            risk_level="destructive",
            requires_confirmation=True,
            is_destructive=True,
            parameter_schema=PurgeDatabaseParams,
            handler=lambda params: {
                "status": "purged",
                "confirmed_by": params["confirm_phrase"],
            },
        )
    )

    return registry
