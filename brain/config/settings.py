"""Typed runtime settings for Stella Python Brain.

Enforces safe default values, bounded initial context budgets,
and operational timeouts. Strictly avoids storing or logging secrets.
"""

from pathlib import Path
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ContextBudgetSettings(BaseModel):
    """Configurable initial token budget estimates (not hard guarantees)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    total_context_limit: int = Field(
        default=4096,
        ge=512,
        le=32768,
        description="Initial estimated token budget ceiling for context window.",
    )
    system_personality_tokens: int = Field(
        default=600,
        ge=100,
        le=2048,
        description="Estimated token allocation for system and persona guidelines.",
    )
    long_term_memory_tokens: int = Field(
        default=500,
        ge=50,
        le=2048,
        description="Estimated token allocation for retrieved long-term facts.",
    )
    perceptual_state_tokens: int = Field(
        default=200,
        ge=50,
        le=1024,
        description="Estimated token allocation for workspace and system metadata.",
    )
    short_term_conversation_tokens: int = Field(
        default=2000,
        ge=200,
        le=16384,
        description="Estimated token allocation for rolling recent conversation turns.",
    )
    completion_reserve_tokens: int = Field(
        default=796,
        ge=100,
        le=4096,
        description="Estimated token headroom strictly reserved for model response generation.",
    )

    @model_validator(mode="after")
    def validate_partition_budget_sum(self) -> "ContextBudgetSettings":
        partition_sum = (
            self.system_personality_tokens
            + self.long_term_memory_tokens
            + self.perceptual_state_tokens
            + self.short_term_conversation_tokens
            + self.completion_reserve_tokens
        )
        if partition_sum > self.total_context_limit:
            raise ValueError(
                f"Sum of context budget partitions ({partition_sum} tokens) "
                f"exceeds total_context_limit ({self.total_context_limit} tokens)."
            )
        return self


class TimeoutSettings(BaseModel):
    """Operational timeouts and confirmation time-to-live settings."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    ping_timeout_seconds: float = Field(
        default=2.0,
        gt=0.1,
        le=10.0,
        description="Timeout for quick health and status probes.",
    )
    first_token_timeout_seconds: float = Field(
        default=30.0,
        gt=1.0,
        le=120.0,
        description="Maximum seconds to wait before first streaming token begins.",
    )
    turn_completion_timeout_seconds: float = Field(
        default=90.0,
        gt=5.0,
        le=300.0,
        description="Maximum seconds for an entire conversational assistant turn.",
    )
    confirmation_ttl_seconds: float = Field(
        default=60.0,
        gt=5.0,
        le=600.0,
        description="Time-to-live before an unconfirmed user action proposal expires.",
    )


class PlanningSettings(BaseModel):
    """Configuration for bounded sequential planning."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    max_steps: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of sequential steps permitted in a single plan.",
    )
    default_max_retries: int = Field(
        default=2,
        ge=0,
        le=5,
        description="Maximum automated retries for a plan before failing.",
    )
    plan_timeout_seconds: float = Field(
        default=300.0,
        gt=5.0,
        le=3600.0,
        description="Default deadline timeout in seconds for plan completion.",
    )
    planning_max_tokens: int = Field(
        default=512,
        ge=100,
        le=2048,
        description="Estimated token headroom reserved for planner response generation.",
    )


class BrainSettings(BaseModel):
    """Primary configuration model for the Stella Python Brain subsystem."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    app_name: str = Field(
        default="StellaBrain",
        description="Application identifier for logs and metadata.",
    )
    version: str = Field(
        default="0.1.0",
        description="Brain subsystem version.",
    )
    # Model configuration
    model_identifier: str = Field(
        default="huihui_ai/Hermes-3-Llama-3.2-abliterated",
        description="Configurable local Ollama model identifier (provisional baseline).",
    )
    ollama_base_url: str = Field(
        default="http://127.0.0.1:11434",
        description="Local loopback endpoint for the Ollama inference engine.",
    )
    # Context and timeout components
    context_budget: ContextBudgetSettings = Field(
        default_factory=ContextBudgetSettings,
        description="Configurable context partition estimates.",
    )
    timeouts: TimeoutSettings = Field(
        default_factory=TimeoutSettings,
        description="System timeouts and confirmation TTLs.",
    )
    planning: PlanningSettings = Field(
        default_factory=PlanningSettings,
        description="Bounded planning configuration and limits.",
    )
    # Storage and configuration paths
    data_dir: Path = Field(
        default=Path("data"),
        description="Directory for local SQLite databases and persistent logs (ignored by Git).",
    )
    personality_file: Path = Field(
        default=Path(__file__).parent / "personality.json",
        description="Path to editable personality JSON configuration file.",
    )

    @classmethod
    def from_env(cls, env_prefix: str = "STELLA_") -> "BrainSettings":
        """Factory creating settings with optional environment variable overrides.
        
        Reads only non-sensitive configuration keys (e.g. STELLA_MODEL_IDENTIFIER).
        Never reads or stores raw credentials or secrets.
        """
        import os

        overrides = {}
        model_id = os.environ.get(f"{env_prefix}MODEL_IDENTIFIER")
        if model_id:
            overrides["model_identifier"] = model_id

        ollama_url = os.environ.get(f"{env_prefix}OLLAMA_BASE_URL")
        if ollama_url:
            overrides["ollama_base_url"] = ollama_url

        data_path = os.environ.get(f"{env_prefix}DATA_DIR")
        if data_path:
            overrides["data_dir"] = Path(data_path)

        personality_path = os.environ.get(f"{env_prefix}PERSONALITY_FILE")
        if personality_path:
            overrides["personality_file"] = Path(personality_path)

        return cls(**overrides)

