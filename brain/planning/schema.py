"""Planning domain models, lifecycle states, and validation contracts.

CRITICAL SECURITY AND AUTHORIZATION INVARIANT:
A Plan is strictly an advisory, informational decomposition of a goal into sequential steps.
Plans and PlanSteps NEVER contain executable shell commands, tool execution authorization,
or system permissions. All tool execution requires the independent Permission Gateway.
"""

from datetime import datetime, timezone
from enum import Enum
import time
from typing import Any, List, Optional
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator


# ============================================================================
# Lifecycle Enums
# ============================================================================

class StepStatus(str, Enum):
    """Lifecycle states for individual sequential plan steps."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PlanStatus(str, Enum):
    """Lifecycle states for an entire sequential plan."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ============================================================================
# Exceptions
# ============================================================================

class PlanningError(Exception):
    """Base exception for all planning subsystem operations."""


class PlanValidationError(PlanningError):
    """Raised when a plan proposal or step configuration violates domain constraints."""


class InvalidPlanTransitionError(PlanningError):
    """Raised when an illegal lifecycle state transition is attempted."""


class PlanExpiredError(PlanningError):
    """Raised when attempting to execute or advance an expired plan past its deadline."""


class PlanMaxRetriesExceededError(PlanningError):
    """Raised when a plan or step exceeds its configured maximum retry ceiling."""


class PlanGenerationError(PlanningError):
    """Raised when an LLM inference or output-parsing failure occurs during planning."""


# ============================================================================
# Proposal Models (Untrusted Model Output Contracts)
# ============================================================================

class PlanStepProposal(BaseModel):
    """Untrusted model proposal for an individual informational plan step.

    CRITICAL SECURITY NOTICE:
    Step descriptions are informational outlines only. This model strictly forbids
    executable commands, tool calls, or action execution parameters.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    title: str = Field(
        min_length=1,
        max_length=128,
        description="Concise summary title of this step.",
    )
    description: str = Field(
        min_length=1,
        max_length=1024,
        description="Informational explanation of what this step involves.",
    )


class PlanProposal(BaseModel):
    """Untrusted model proposal for decomposing a goal into sequential steps."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    goal: str = Field(
        min_length=3,
        max_length=512,
        description="The overarching objective being decomposed.",
    )
    steps: List[PlanStepProposal] = Field(
        min_length=1,
        max_length=10,
        description="Ordered sequence of proposed informational steps.",
    )

    @model_validator(mode="after")
    def validate_unique_step_titles(self) -> "PlanProposal":
        """Verify that proposed steps do not contain duplicate titles."""
        titles = [s.title.strip().lower() for s in self.steps]
        if len(titles) != len(set(titles)):
            raise ValueError("Plan steps must have distinct, non-duplicate titles.")
        return self


# ============================================================================
# Concrete Step & Plan Domain Models
# ============================================================================

class PlanStep(BaseModel):
    """A validated, state-tracked step within a sequential plan.

    CRITICAL SECURITY NOTICE:
    A PlanStep is an advisory task item. It does NOT possess execution capability,
    shell access, or tool authorization.
    """

    model_config = ConfigDict(extra="forbid")

    step_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Stable unique identifier for this step.",
    )
    index: int = Field(
        ge=1,
        le=100,
        description="1-indexed sequence number defining execution order.",
    )
    title: str = Field(
        min_length=1,
        max_length=128,
        description="Concise title of the step.",
    )
    description: str = Field(
        min_length=1,
        max_length=1024,
        description="Informational detail outlining the step.",
    )
    status: StepStatus = Field(
        default=StepStatus.PENDING,
        description="Current lifecycle state of the step.",
    )
    started_at: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when the step began in-progress.",
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when the step completed, failed, or was cancelled.",
    )
    error_message: Optional[str] = Field(
        default=None,
        max_length=1024,
        description="Error detail if the step failed.",
    )

    @property
    def is_terminal(self) -> bool:
        """Indicate whether the step has reached an immutable terminal state."""
        return self.status in (StepStatus.COMPLETED, StepStatus.CANCELLED)

    def start(self) -> None:
        """Transition step from PENDING to IN_PROGRESS."""
        if self.status != StepStatus.PENDING:
            raise InvalidPlanTransitionError(
                f"Cannot start step '{self.step_id}': current status is '{self.status.value}', expected 'pending'."
            )
        self.status = StepStatus.IN_PROGRESS
        self.started_at = datetime.now(timezone.utc)

    def complete(self) -> None:
        """Transition step from IN_PROGRESS to COMPLETED."""
        if self.status != StepStatus.IN_PROGRESS:
            raise InvalidPlanTransitionError(
                f"Cannot complete step '{self.step_id}': current status is '{self.status.value}', expected 'in_progress'."
            )
        self.status = StepStatus.COMPLETED
        self.completed_at = datetime.now(timezone.utc)

    def fail(self, error_message: str) -> None:
        """Transition step from IN_PROGRESS to FAILED."""
        if self.status != StepStatus.IN_PROGRESS:
            raise InvalidPlanTransitionError(
                f"Cannot fail step '{self.step_id}': current status is '{self.status.value}', expected 'in_progress'."
            )
        self.status = StepStatus.FAILED
        self.completed_at = datetime.now(timezone.utc)
        self.error_message = error_message.strip()[:1024]

    def cancel(self, reason: Optional[str] = None) -> None:
        """Transition step to CANCELLED from PENDING or IN_PROGRESS."""
        if self.is_terminal:
            raise InvalidPlanTransitionError(
                f"Cannot cancel step '{self.step_id}': already in terminal state '{self.status.value}'."
            )
        self.status = StepStatus.CANCELLED
        self.completed_at = datetime.now(timezone.utc)
        if reason:
            self.error_message = f"Cancelled: {reason.strip()[:1000]}"

    def reset_for_retry(self) -> None:
        """Reset a FAILED step back to PENDING for a controlled retry."""
        if self.status != StepStatus.FAILED:
            raise InvalidPlanTransitionError(
                f"Cannot reset step '{self.step_id}': current status is '{self.status.value}', expected 'failed'."
            )
        self.status = StepStatus.PENDING
        self.started_at = None
        self.completed_at = None
        self.error_message = None


class Plan(BaseModel):
    """A validated sequential plan tracking linear progress toward a user goal.

    CRITICAL SECURITY NOTICE:
    A Plan represents an advisory roadmap. It is NEVER authorization to execute actions.
    """

    model_config = ConfigDict(extra="forbid")

    plan_id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Stable unique identifier for this plan.",
    )
    goal: str = Field(
        min_length=3,
        max_length=512,
        description="The overarching objective being pursued.",
    )
    steps: List[PlanStep] = Field(
        min_length=1,
        max_length=10,
        description="Linear sequence of plan steps.",
    )
    status: PlanStatus = Field(
        default=PlanStatus.PENDING,
        description="Current lifecycle state of the plan.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC creation timestamp.",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC last update timestamp.",
    )
    deadline: Optional[datetime] = Field(
        default=None,
        description="Optional absolute UTC expiration deadline.",
    )
    max_retries: int = Field(
        default=2,
        ge=0,
        le=5,
        description="Maximum allowed retries across the plan.",
    )
    retry_count: int = Field(
        default=0,
        ge=0,
        description="Current count of retries attempted.",
    )
    cancellation_reason: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Explanation if the plan was cancelled.",
    )
    failure_reason: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Explanation if the plan failed.",
    )

    # In-process monotonic deadline reference (robust against system clock shifts)
    _monotonic_deadline: Optional[float] = PrivateAttr(default=None)

    def model_post_init(self, __context: Any) -> None:
        """Initialize monotonic deadline from deadline datetime if provided."""
        super().model_post_init(__context)
        if self.deadline is not None:
            now_utc = datetime.now(timezone.utc)
            remaining_seconds = (self.deadline - now_utc).total_seconds()
            if remaining_seconds > 0:
                self._monotonic_deadline = time.monotonic() + remaining_seconds
            else:
                self._monotonic_deadline = time.monotonic()

    @model_validator(mode="after")
    def validate_steps_order_and_uniqueness(self) -> "Plan":
        """Verify step indices are sequential, 1-indexed, and titles are distinct."""
        for expected_idx, step in enumerate(self.steps, start=1):
            if step.index != expected_idx:
                raise ValueError(
                    f"Plan step at position {expected_idx} has mismatched index {step.index}."
                )
        titles = [s.title.strip().lower() for s in self.steps]
        if len(titles) != len(set(titles)):
            raise ValueError("Plan steps must have distinct, non-duplicate titles.")
        return self

    @property
    def is_terminal(self) -> bool:
        """Indicate whether the plan has reached a final immutable state."""
        return self.status in (PlanStatus.COMPLETED, PlanStatus.FAILED, PlanStatus.CANCELLED)

    @property
    def is_expired(self) -> bool:
        """Check whether an active or pending plan has surpassed its configured deadline."""
        if self.deadline is None or self.is_terminal:
            return False
        # Dual-check: monotonic clock (robust against system clock changes) and UTC wall clock
        if self._monotonic_deadline is not None and time.monotonic() > self._monotonic_deadline:
            return True
        return datetime.now(timezone.utc) > self.deadline

    @property
    def current_step(self) -> Optional[PlanStep]:
        """Return the step currently in-progress, or the next pending step."""
        for step in self.steps:
            if step.status == StepStatus.IN_PROGRESS:
                return step
        for step in self.steps:
            if step.status == StepStatus.PENDING:
                return step
        return None

    @property
    def completed_step_count(self) -> int:
        """Number of steps successfully completed."""
        return sum(1 for s in self.steps if s.status == StepStatus.COMPLETED)

    def _touch(self) -> None:
        """Update the last-modified timestamp."""
        self.updated_at = datetime.now(timezone.utc)

    def _check_deadline(self) -> None:
        """Verify deadline has not elapsed; fail closed if expired."""
        if self.is_expired:
            self.status = PlanStatus.FAILED
            self.failure_reason = "Plan deadline expired."
            # Ensure step states remain consistent with failed plan
            for step in self.steps:
                if step.status == StepStatus.IN_PROGRESS:
                    step.fail("Plan deadline expired.")
                elif step.status == StepStatus.PENDING:
                    step.cancel("Plan deadline expired.")
            self._touch()
            raise PlanExpiredError(
                f"Plan '{self.plan_id}' has expired past deadline '{self.deadline.isoformat()}'."
            )

    def start(self) -> PlanStep:
        """Start execution of the plan by transitioning to IN_PROGRESS and starting step 1.

        Returns:
            The first PlanStep (now in IN_PROGRESS state).

        Raises:
            InvalidPlanTransitionError: If not in PENDING state.
            PlanExpiredError: If deadline has passed.
        """
        if self.status != PlanStatus.PENDING:
            raise InvalidPlanTransitionError(
                f"Cannot start plan '{self.plan_id}': current status is '{self.status.value}', expected 'pending'."
            )
        self._check_deadline()
        self.status = PlanStatus.IN_PROGRESS
        first_step = self.steps[0]
        first_step.start()
        self._touch()
        return first_step

    def complete_current_step(self) -> Optional[PlanStep]:
        """Complete the active step and advance to the next step, or complete the plan.

        Returns:
            The next active PlanStep if more steps remain, or None if the plan is completed.

        Raises:
            InvalidPlanTransitionError: If plan is not in progress or no step is active.
            PlanExpiredError: If deadline has passed.
        """
        if self.status != PlanStatus.IN_PROGRESS:
            raise InvalidPlanTransitionError(
                f"Cannot complete step on plan '{self.plan_id}': plan is in '{self.status.value}' state."
            )
        self._check_deadline()

        active_step = next((s for s in self.steps if s.status == StepStatus.IN_PROGRESS), None)
        if not active_step:
            raise InvalidPlanTransitionError(
                f"Cannot complete current step: no step is currently 'in_progress' on plan '{self.plan_id}'."
            )

        active_step.complete()
        self._touch()

        # Check for next pending step
        next_step = next((s for s in self.steps if s.status == StepStatus.PENDING), None)
        if next_step:
            next_step.start()
            self._touch()
            return next_step

        # If all steps are completed, complete plan
        if all(s.status == StepStatus.COMPLETED for s in self.steps):
            self.status = PlanStatus.COMPLETED
            self._touch()
            return None

        raise InvalidPlanTransitionError(
            f"Cannot complete plan '{self.plan_id}': not all steps were successfully completed."
        )

    def fail_current_step(self, error_message: str) -> None:
        """Mark the active step as failed and transition the plan to FAILED.

        Args:
            error_message: Detailed explanation of the failure.

        Raises:
            InvalidPlanTransitionError: If plan is not in progress or no step is active.
        """
        if self.status != PlanStatus.IN_PROGRESS:
            raise InvalidPlanTransitionError(
                f"Cannot fail current step: plan '{self.plan_id}' is in '{self.status.value}' state."
            )

        active_step = next((s for s in self.steps if s.status == StepStatus.IN_PROGRESS), None)
        if not active_step:
            raise InvalidPlanTransitionError(
                f"Cannot fail current step: no step is currently 'in_progress' on plan '{self.plan_id}'."
            )

        active_step.fail(error_message)
        self.status = PlanStatus.FAILED
        self.failure_reason = error_message.strip()[:512]
        self._touch()

    def retry(self, reason: Optional[str] = None) -> PlanStep:
        """Retry a failed plan by resetting the failed step back to PENDING and restarting.

        Args:
            reason: Optional explanation for the retry attempt.

        Returns:
            The restarted PlanStep now in IN_PROGRESS.

        Raises:
            PlanMaxRetriesExceededError: If retry_count has reached max_retries.
            InvalidPlanTransitionError: If plan is not in FAILED state.
            PlanExpiredError: If deadline has passed.
        """
        if self.status != PlanStatus.FAILED:
            raise InvalidPlanTransitionError(
                f"Cannot retry plan '{self.plan_id}': current status is '{self.status.value}', expected 'failed'."
            )
        self._check_deadline()

        if self.retry_count >= self.max_retries:
            raise PlanMaxRetriesExceededError(
                f"Plan '{self.plan_id}' has exhausted maximum allowed retries ({self.retry_count}/{self.max_retries})."
            )

        failed_step = next((s for s in self.steps if s.status == StepStatus.FAILED), None)
        if not failed_step:
            raise InvalidPlanTransitionError(
                f"Cannot retry plan '{self.plan_id}': no step is in 'failed' state."
            )

        self.retry_count += 1
        failed_step.reset_for_retry()
        self.status = PlanStatus.IN_PROGRESS
        self.failure_reason = None
        failed_step.start()
        self._touch()
        return failed_step

    def cancel(self, reason: str = "User cancelled") -> None:
        """Cancel the plan and all remaining non-terminal steps.

        Args:
            reason: Explanation for the cancellation.

        Raises:
            InvalidPlanTransitionError: If plan is already in a terminal state.
        """
        if self.is_terminal:
            raise InvalidPlanTransitionError(
                f"Cannot cancel plan '{self.plan_id}': already in terminal state '{self.status.value}'."
            )

        self.status = PlanStatus.CANCELLED
        self.cancellation_reason = reason.strip()[:512]

        for step in self.steps:
            if not step.is_terminal:
                step.cancel(reason)

        self._touch()
