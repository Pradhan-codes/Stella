"""Configuration and logging components for Stella Brain."""

from brain.config.settings import BrainSettings, ContextBudgetSettings, TimeoutSettings
from brain.config.logging import (
    setup_logging,
    redact_sensitive_text,
    RedactingFilter,
    RedactingFormatter,
)

from brain.config.personality import (
    PersonalityConfig,
    load_personality_config,
    build_system_prompt,
)

__all__ = [
    "BrainSettings",
    "ContextBudgetSettings",
    "TimeoutSettings",
    "setup_logging",
    "redact_sensitive_text",
    "RedactingFilter",
    "RedactingFormatter",
    "PersonalityConfig",
    "load_personality_config",
    "build_system_prompt",
]

