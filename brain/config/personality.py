"""Personality configuration loader and prompt builder for Stella Python Brain.

Loads the editable personality JSON configuration, validates its schema,
and constructs the structured system prompt defining Stella's identity,
conversational style, memory honesty, and safety boundaries.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class ConversationalStyle(BaseModel):
    """Dialogue tone and expression configuration."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    dialogue_tone: str = Field(
        description="Core tone guidelines for conversational turns.",
    )
    conciseness: str = Field(
        description="Guidelines on conversational brevity and natural flow.",
    )
    expression_hints: List[str] = Field(
        default_factory=lambda: ["neutral", "happy", "sad", "thinking", "playful", "surprised"],
        description="Allowed expression hints for the 3D avatar.",
    )


class MemoryHonestyPolicy(BaseModel):
    """Guidelines regarding memory veracity and hallucination prevention."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    policy: str = Field(
        description="Rule prohibiting fabrication of unverified memories or preferences.",
    )


class SafetyAndBoundaries(BaseModel):
    """Ethical and authorization boundaries."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    ethical_guardrails: str = Field(
        description="Non-negotiable ethical guidelines.",
    )
    system_authority: str = Field(
        description="Instruction that tools require independent gateway authorization.",
    )


class PersonalityConfig(BaseModel):
    """Schema for the editable personality configuration file."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    version: str = Field(
        default="1.0.0",
        description="Personality schema version.",
    )
    name: str = Field(
        default="Stella",
        description="Companion name.",
    )
    archetype: str = Field(
        default="Intelligent AI Companion & Creative Partner",
        description="High-level character archetype.",
    )
    persona_summary: str = Field(
        description="Summary of Stella's core personality and emotional demeanor.",
    )
    traits: List[str] = Field(
        default_factory=list,
        description="Key character traits.",
    )
    conversational_style: ConversationalStyle = Field(
        description="Dialogue tone and presentation guidelines.",
    )
    memory_honesty: MemoryHonestyPolicy = Field(
        description="Truthfulness policy regarding memories.",
    )
    safety_and_boundaries: SafetyAndBoundaries = Field(
        description="Safety and permission boundaries.",
    )
    system_instructions_template: str = Field(
        description="Base instructions template injected into the system prompt.",
    )


DEFAULT_PERSONALITY_PATH = Path(__file__).parent / "personality.json"


def load_personality_config(path: Optional[Union[str, Path]] = None) -> PersonalityConfig:
    """Load and validate the personality configuration JSON file.

    Args:
        path: Optional path to personality.json. Defaults to DEFAULT_PERSONALITY_PATH.

    Returns:
        Validated PersonalityConfig instance.

    Raises:
        FileNotFoundError: If the specified personality configuration file is not found.
        pydantic.ValidationError: If the JSON content does not conform to the schema.
    """
    config_path = Path(path) if path else DEFAULT_PERSONALITY_PATH
    if not config_path.is_file():
        raise FileNotFoundError(f"Personality configuration file not found at: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return PersonalityConfig.model_validate(data)


def build_system_prompt(config: Optional[PersonalityConfig] = None) -> str:
    """Construct the system prompt string from the personality configuration.

    Args:
        config: Optional PersonalityConfig. If omitted, loaded from default path.

    Returns:
        Formatted system prompt string.
    """
    cfg = config or load_personality_config()

    prompt_parts = [
        f"You are {cfg.name}, an {cfg.archetype}.",
        f"Persona: {cfg.persona_summary}",
        "\nCore Traits:",
    ]
    for trait in cfg.traits:
        prompt_parts.append(f"- {trait}")

    prompt_parts.extend([
        "\nConversational Style:",
        f"- {cfg.conversational_style.dialogue_tone}",
        f"- {cfg.conversational_style.conciseness}",
        f"- Available Avatar Expressions: {', '.join(cfg.conversational_style.expression_hints)}",
        "\nMemory & Honesty:",
        f"- {cfg.memory_honesty.policy}",
        "\nSafety & Authority Boundaries:",
        f"- {cfg.safety_and_boundaries.ethical_guardrails}",
        f"- {cfg.safety_and_boundaries.system_authority}",
        "\nOperating Instructions:",
        cfg.system_instructions_template,
    ])

    return "\n".join(prompt_parts)
