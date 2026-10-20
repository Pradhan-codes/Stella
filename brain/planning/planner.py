"""Bounded Sequential Planner for Stella Python Brain.

Transforms high-level user goals into validated, bounded, sequential plans
using the configured local LLM adapter.

CRITICAL SECURITY AND ARCHITECTURAL INVARIANTS:
1. Plan as Proposal Only: A Plan is an advisory, informational roadmap. It NEVER
   authorizes execution or grants tool permissions.
2. Untrusted Model Output: All model responses are treated as untrusted text, strictly
   parsed and validated against Pydantic schema models.
3. Strict Bounds: Step counts are hard-capped (default max 5 steps).
4. No Executive Shell: Step descriptions are informational only. Arbitrary shell
   commands and unvalidated tool calls are strictly forbidden.
5. Privacy & Logging: Prompts, private memories, and raw model completions are never logged.
"""

from datetime import datetime, timedelta, timezone
import json
import logging
from typing import List, Optional
from pydantic import ValidationError

from brain.adapters.base import (
    ChatMessage,
    LLMAdapter,
    LLMAdapterError,
    LLMGenerationParams,
    Role,
)
from brain.config.logging import redact_sensitive_text
from brain.config.settings import PlanningSettings
from brain.planning.schema import (
    Plan,
    PlanGenerationError,
    PlanProposal,
    PlanStep,
    PlanValidationError,
)

logger = logging.getLogger("stella.brain.planning")


class BoundedPlanner:
    """Generates validated, bounded sequential plans from user objectives."""

    def __init__(
        self,
        adapter: LLMAdapter,
        planning_settings: Optional[PlanningSettings] = None,
    ):
        """Initialize BoundedPlanner.

        Args:
            adapter: LLMAdapter instance (local Ollama or test mock).
            planning_settings: Configuration governing step bounds and timeouts.
        """
        self.adapter = adapter
        self.settings = planning_settings or PlanningSettings()

    def create_plan(
        self,
        goal: str,
        *,
        context_notes: Optional[List[str]] = None,
        deadline_seconds: Optional[float] = None,
    ) -> Plan:
        """Decompose a user goal into a validated, bounded sequential plan.

        Args:
            goal: High-level user objective (non-empty string).
            context_notes: Optional list of informational reference notes (e.g. constraints).
            deadline_seconds: Optional custom duration in seconds until plan expiration.
                             Defaults to settings.plan_timeout_seconds.

        Returns:
            A validated Plan instance in PENDING status.

        Raises:
            PlanValidationError: If goal is invalid, step bounds are exceeded, or schema fails.
            PlanGenerationError: On LLM inference failure, timeout, or malformed JSON.
        """
        clean_goal = goal.strip()
        if len(clean_goal) < 3:
            raise PlanValidationError("Plan goal must be at least 3 characters long.")
        if len(clean_goal) > 512:
            raise PlanValidationError("Plan goal cannot exceed 512 characters.")

        # 1. Build bounded planning prompt
        system_instruction = (
            "You are Stella's bounded sequential planning engine.\n"
            f"Decompose the user's high-level goal into a linear, sequential plan of 1 to {self.settings.max_steps} informational steps.\n\n"
            "STRICT RULES:\n"
            "1. Output ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "goal": "string (echo the user goal)",\n'
            '  "steps": [\n'
            '    {"title": "short step title", "description": "informational explanation"}\n'
            "  ]\n"
            "}\n"
            f"2. You must provide at least 1 and AT MOST {self.settings.max_steps} sequential steps.\n"
            "3. Step descriptions must be informational outlines only. NEVER output executable code, shell commands, or action permissions.\n"
            "4. Do NOT output markdown code fences or conversational commentary outside the JSON object."
        )

        user_content = f"Goal: {clean_goal}"
        if context_notes:
            sanitized_notes = [n.strip()[:256] for n in context_notes if n and n.strip()]
            if sanitized_notes:
                notes_block = "\n".join(f"- {note}" for note in sanitized_notes[:5])
                user_content += f"\n\nContext Notes (Untrusted Reference Data):\n{notes_block}"

        messages = [
            ChatMessage(role=Role.SYSTEM, content=system_instruction),
            ChatMessage(role=Role.USER, content=user_content),
        ]

        # 2. Call LLM Adapter with strict generation bounds
        gen_params = LLMGenerationParams(
            temperature=0.2,
            max_tokens=self.settings.planning_max_tokens,
            format_json=True,
        )

        try:
            response = self.adapter.generate(messages=messages, params=gen_params)
        except LLMAdapterError as err:
            logger.warning("LLM adapter failure during plan generation: %s", err.category)
            raise PlanGenerationError(
                f"Planning generation failed due to model adapter error: {err.category}"
            ) from err
        except Exception as err:
            logger.warning("Unexpected error during plan generation: %s", type(err).__name__)
            raise PlanGenerationError(
                f"Unexpected failure during plan generation: {type(err).__name__}"
            ) from err

        # 3. Parse and strip markdown framing if present
        raw_text = response.content.strip()
        cleaned_json_text = self._strip_markdown_fences(raw_text)

        try:
            parsed_data = json.loads(cleaned_json_text)
        except json.JSONDecodeError as err:
            logger.warning("Model produced malformed JSON during planning.")
            raise PlanGenerationError("Failed to parse model output as valid JSON.") from err

        # 4. Strict Pydantic validation
        try:
            proposal = PlanProposal.model_validate(parsed_data)
        except ValidationError as err:
            logger.warning("Model plan proposal violated schema validation.")
            raise PlanValidationError(f"Model plan proposal violated schema: {err}") from err

        # 5. Enforce step count ceilings
        if len(proposal.steps) > self.settings.max_steps:
            raise PlanValidationError(
                f"Proposed plan exceeds maximum permitted steps ({len(proposal.steps)} > {self.settings.max_steps})."
            )
        if len(proposal.steps) == 0:
            raise PlanValidationError("Proposed plan must contain at least one step.")

        # 6. Calculate deadline
        timeout_sec = (
            deadline_seconds
            if deadline_seconds is not None and deadline_seconds > 0
            else self.settings.plan_timeout_seconds
        )
        deadline_dt = datetime.now(timezone.utc) + timedelta(seconds=timeout_sec)

        # 7. Construct concrete Plan
        concrete_steps = [
            PlanStep(
                index=i + 1,
                title=step_prop.title.strip(),
                description=step_prop.description.strip(),
            )
            for i, step_prop in enumerate(proposal.steps)
        ]

        plan = Plan(
            goal=proposal.goal.strip() if proposal.goal.strip() else clean_goal,
            steps=concrete_steps,
            deadline=deadline_dt,
            max_retries=self.settings.default_max_retries,
        )

        logger.info(
            "Constructed bounded plan [%s] with %d steps for goal: '%s...'",
            plan.plan_id,
            len(plan.steps),
            redact_sensitive_text(clean_goal[:40]),
        )

        return plan

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        """Strip markdown code fences (```json ... ```) if emitted by model."""
        if not text.startswith("```"):
            return text

        lines = text.splitlines()
        # Drop opening ``` or ```json
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        # Drop closing ```
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]

        return "\n".join(lines).strip()
