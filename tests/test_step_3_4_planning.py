"""Unit tests for Stella Python Brain Step 3.4 Bounded Planning.

Verifies:
1. Planning contracts and domain models (Plan, PlanStep, PlanProposal).
2. Lifecycle state transitions, validation, and invalid transition rejection.
3. Plan cancellation and multi-step cascading cancellation.
4. Step failure, automated retry limits, and dead-ends.
5. Expiration deadlines and fail-closed timeout enforcement.
6. BoundedPlanner integration with FakeLLMAdapter (happy path, markdown stripping, bounds).
7. Malformed JSON, missing fields, and LLM adapter error resilience.
8. Privacy and logging hygiene: no leakage of raw prompts, completions, or secrets.
9. Security invariant: A Plan is strictly an informational proposal and NEVER authorizes execution.
"""

from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Iterator, List, Optional
from uuid import UUID
import pytest
from pydantic import ValidationError

from brain.adapters.base import (
    ChatMessage,
    LLMAdapter,
    LLMAdapterError,
    LLMChunk,
    LLMGenerationParams,
    LLMResponse,
    Role,
)
from brain.config.settings import PlanningSettings
from brain.planning.planner import BoundedPlanner
from brain.planning.schema import (
    InvalidPlanTransitionError,
    Plan,
    PlanExpiredError,
    PlanGenerationError,
    PlanMaxRetriesExceededError,
    PlanProposal,
    PlanStatus,
    PlanStep,
    PlanStepProposal,
    PlanValidationError,
    StepStatus,
)


# ============================================================================
# Test Fixtures & Fake LLM Adapter
# ============================================================================

class FakeLLMAdapter(LLMAdapter):
    """Controllable test double implementing LLMAdapter."""

    def __init__(
        self,
        response_text: str = "",
        error_to_raise: Optional[LLMAdapterError] = None,
    ):
        self.response_text = response_text
        self.error_to_raise = error_to_raise
        self.received_messages: List[ChatMessage] = []
        self.received_params: Optional[LLMGenerationParams] = None

    def ping(self) -> bool:
        return True

    def check_model_available(self, model_name: Optional[str] = None) -> bool:
        return True

    def generate(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> LLMResponse:
        self.received_messages = list(messages)
        self.received_params = params

        if self.error_to_raise:
            raise self.error_to_raise

        return LLMResponse(
            content=self.response_text,
            finish_reason="stop",
            prompt_tokens=120,
            completion_tokens=85,
        )

    def stream(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> Iterator[LLMChunk]:
        yield LLMChunk(delta_text=self.response_text, finish_reason="stop")


# ============================================================================
# 1. Contract & Schema Validation Tests
# ============================================================================

def test_plan_step_contract_and_defaults():
    """Verify PlanStep creation, defaults, stable identifier, and extra field rejection."""
    step = PlanStep(
        index=1,
        title="Align optical sensor",
        description="Point the optical sensor to calibration target.",
    )

    assert step.index == 1
    assert step.title == "Align optical sensor"
    assert step.status == StepStatus.PENDING
    assert step.started_at is None
    assert step.completed_at is None
    assert step.error_message is None
    # Verify step_id is a valid UUID string
    UUID(step.step_id)

    # Extra fields must be forbidden
    with pytest.raises(ValidationError):
        PlanStep(
            index=1,
            title="Step",
            description="Desc",
            shell_command="rm -rf /",  # Unallowed executable field
        )


def test_plan_contract_and_defaults():
    """Verify Plan instantiation, sequential ordering, and bounds validation."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Description 1"),
        PlanStep(index=2, title="Step 2", description="Description 2"),
    ]
    plan = Plan(goal="Calibrate telescope", steps=steps)

    assert plan.goal == "Calibrate telescope"
    assert len(plan.steps) == 2
    assert plan.status == PlanStatus.PENDING
    assert plan.max_retries == 2
    assert plan.retry_count == 0
    assert not plan.is_expired
    assert not plan.is_terminal
    UUID(plan.plan_id)

    # Rejection of empty goal
    with pytest.raises(ValidationError):
        Plan(goal="  ", steps=steps)

    # Rejection of empty steps list
    with pytest.raises(ValidationError):
        Plan(goal="Calibrate telescope", steps=[])

    # Rejection of mismatched / non-sequential step indices
    invalid_steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=3, title="Step 3", description="Desc 3"),  # Non-contiguous
    ]
    with pytest.raises(ValidationError, match="mismatched index"):
        Plan(goal="Calibrate telescope", steps=invalid_steps)


# ============================================================================
# 2. Lifecycle State Transitions Tests
# ============================================================================

def test_plan_step_lifecycle_transitions():
    """Verify individual PlanStep lifecycle transitions and guard enforcement."""
    step = PlanStep(index=1, title="Test step", description="Details")

    # Legal start
    step.start()
    assert step.status == StepStatus.IN_PROGRESS
    assert step.started_at is not None

    # Illegal double start
    with pytest.raises(InvalidPlanTransitionError, match="expected 'pending'"):
        step.start()

    # Legal complete
    step.complete()
    assert step.status == StepStatus.COMPLETED
    assert step.completed_at is not None
    assert step.is_terminal

    # Illegal transition from terminal state
    with pytest.raises(InvalidPlanTransitionError, match="expected 'in_progress'"):
        step.complete()

    # Step failure and reset test
    step2 = PlanStep(index=2, title="Step 2", description="Details")
    step2.start()
    step2.fail("Hardware probe timeout")
    assert step2.status == StepStatus.FAILED
    assert step2.error_message == "Hardware probe timeout"

    # Reset for retry
    step2.reset_for_retry()
    assert step2.status == StepStatus.PENDING
    assert step2.error_message is None
    assert step2.started_at is None


def test_plan_lifecycle_full_happy_path():
    """Verify end-to-end legal sequence: start -> advance -> complete."""
    steps = [
        PlanStep(index=1, title="Initial setup", description="Set baseline parameters"),
        PlanStep(index=2, title="Execute calibration", description="Calibrate sensors"),
        PlanStep(index=3, title="Log telemetry", description="Record results"),
    ]
    plan = Plan(goal="Complete calibration routine", steps=steps)
    assert plan.status == PlanStatus.PENDING

    # 1. Start plan
    first_step = plan.start()
    assert plan.status == PlanStatus.IN_PROGRESS
    assert first_step.index == 1
    assert first_step.status == StepStatus.IN_PROGRESS

    # 2. Complete Step 1 -> advances to Step 2
    step2 = plan.complete_current_step()
    assert step2 is not None
    assert step2.index == 2
    assert step2.status == StepStatus.IN_PROGRESS
    assert plan.steps[0].status == StepStatus.COMPLETED

    # 3. Complete Step 2 -> advances to Step 3
    step3 = plan.complete_current_step()
    assert step3 is not None
    assert step3.index == 3
    assert step3.status == StepStatus.IN_PROGRESS
    assert plan.steps[1].status == StepStatus.COMPLETED

    # 4. Complete Step 3 -> Plan COMPLETED
    final = plan.complete_current_step()
    assert final is None
    assert plan.status == PlanStatus.COMPLETED
    assert plan.completed_step_count == 3
    assert plan.is_terminal


def test_plan_illegal_state_transitions():
    """Verify invalid plan state transitions are rejected with clear errors."""
    steps = [PlanStep(index=1, title="Step", description="Desc")]
    plan = Plan(goal="Test illegal transitions", steps=steps)

    # Cannot complete step before starting plan
    with pytest.raises(InvalidPlanTransitionError, match="plan is in 'pending' state"):
        plan.complete_current_step()

    # Cannot retry a non-failed plan
    with pytest.raises(InvalidPlanTransitionError, match="expected 'failed'"):
        plan.retry()

    # Start and complete plan
    plan.start()
    plan.complete_current_step()
    assert plan.status == PlanStatus.COMPLETED

    # Cannot start or complete already completed plan
    with pytest.raises(InvalidPlanTransitionError, match="expected 'pending'"):
        plan.start()

    with pytest.raises(InvalidPlanTransitionError, match="plan is in 'completed' state"):
        plan.complete_current_step()


# ============================================================================
# 3. Cancellation Tests
# ============================================================================

def test_plan_cancellation_pending():
    """Verify cancelling a PENDING plan transitions plan and all steps to CANCELLED."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
    ]
    plan = Plan(goal="Cancel while pending", steps=steps)
    plan.cancel("Operator aborted")

    assert plan.status == PlanStatus.CANCELLED
    assert plan.cancellation_reason == "Operator aborted"
    assert all(s.status == StepStatus.CANCELLED for s in plan.steps)


def test_plan_cancellation_in_progress():
    """Verify cancelling an IN_PROGRESS plan preserves COMPLETED steps and cancels remaining."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
        PlanStep(index=3, title="Step 3", description="Desc 3"),
    ]
    plan = Plan(goal="Cancel midway", steps=steps)
    plan.start()
    plan.complete_current_step()  # Step 1 is COMPLETED, Step 2 is IN_PROGRESS

    plan.cancel("Urgent shutdown")

    assert plan.status == PlanStatus.CANCELLED
    assert plan.steps[0].status == StepStatus.COMPLETED  # Preserved
    assert plan.steps[1].status == StepStatus.CANCELLED  # Cancelled
    assert plan.steps[2].status == StepStatus.CANCELLED  # Cancelled


def test_plan_cancel_already_terminal_rejected():
    """Verify cancelling an already terminal plan is rejected."""
    steps = [PlanStep(index=1, title="Step 1", description="Desc 1")]
    plan = Plan(goal="Terminal cancel", steps=steps)
    plan.cancel("First cancel")

    with pytest.raises(InvalidPlanTransitionError, match="already in terminal state"):
        plan.cancel("Second cancel")


# ============================================================================
# 4. Failure and Retry Limits Tests
# ============================================================================

def test_plan_failure_and_retry_within_limit():
    """Verify step failure transitions plan to FAILED, and retry resumes execution."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
    ]
    plan = Plan(goal="Retry test", steps=steps, max_retries=2)
    plan.start()

    # Step 1 fails
    plan.fail_current_step("Sensor connection lost")
    assert plan.status == PlanStatus.FAILED
    assert plan.failure_reason == "Sensor connection lost"
    assert plan.steps[0].status == StepStatus.FAILED

    # Retry 1
    resumed = plan.retry("Reconnecting bus")
    assert resumed.index == 1
    assert resumed.status == StepStatus.IN_PROGRESS
    assert plan.status == PlanStatus.IN_PROGRESS
    assert plan.retry_count == 1
    assert plan.failure_reason is None

    # Step 1 completes
    step2 = plan.complete_current_step()
    assert step2.index == 2
    assert plan.steps[0].status == StepStatus.COMPLETED


def test_plan_retry_limit_exhausted():
    """Verify attempting to retry beyond max_retries raises PlanMaxRetriesExceededError."""
    steps = [PlanStep(index=1, title="Step 1", description="Desc 1")]
    plan = Plan(goal="Exhaust retries", steps=steps, max_retries=1)
    plan.start()

    # Fail 1
    plan.fail_current_step("Attempt 1 error")
    # Retry 1 (legal: retry_count goes to 1)
    plan.retry()

    # Fail 2
    plan.fail_current_step("Attempt 2 error")
    # Retry 2 must exceed limit
    with pytest.raises(PlanMaxRetriesExceededError, match="exhausted maximum allowed retries"):
        plan.retry()


# ============================================================================
# 5. Deadline and Expiration Tests
# ============================================================================

def test_plan_deadline_expiration_on_start():
    """Verify start() on an expired plan raises PlanExpiredError and marks plan FAILED."""
    past_deadline = datetime.now(timezone.utc) - timedelta(seconds=10)
    steps = [PlanStep(index=1, title="Step 1", description="Desc 1")]
    plan = Plan(goal="Expired plan", steps=steps, deadline=past_deadline)

    assert plan.is_expired

    with pytest.raises(PlanExpiredError, match="expired past deadline"):
        plan.start()

    assert plan.status == PlanStatus.FAILED
    assert "expired" in plan.failure_reason.lower()


def test_plan_deadline_expiration_during_execution():
    """Verify complete_current_step() detects elapsed deadline and raises PlanExpiredError."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
    ]
    # Future deadline initially
    future_deadline = datetime.now(timezone.utc) + timedelta(seconds=2)
    plan = Plan(goal="Timeout plan", steps=steps, deadline=future_deadline)

    plan.start()

    # Simulate clock advance past deadline
    plan.deadline = datetime.now(timezone.utc) - timedelta(seconds=5)
    assert plan.is_expired

    with pytest.raises(PlanExpiredError):
        plan.complete_current_step()

    assert plan.status == PlanStatus.FAILED


# ============================================================================
# 6. BoundedPlanner Integration Tests (with FakeLLMAdapter)
# ============================================================================

def test_bounded_planner_successful_plan_generation():
    """Verify BoundedPlanner parses valid JSON output and creates a validated Plan."""
    mock_payload = {
        "goal": "Calibrate the secondary mirror",
        "steps": [
            {"title": "Inspect mount", "description": "Verify alignment screws"},
            {"title": "Center laser", "description": "Ensure laser aligns with target ring"},
            {"title": "Lock position", "description": "Tighten set screws to lock calibration"},
        ],
    }
    fake_adapter = FakeLLMAdapter(response_text=json.dumps(mock_payload))
    settings = PlanningSettings(max_steps=5, default_max_retries=2, plan_timeout_seconds=120)

    planner = BoundedPlanner(adapter=fake_adapter, planning_settings=settings)
    plan = planner.create_plan(
        goal="Calibrate the secondary mirror",
        context_notes=["Station is in Observatory mode", "Mirror temperature is 18C"],
    )

    assert isinstance(plan, Plan)
    assert plan.goal == "Calibrate the secondary mirror"
    assert len(plan.steps) == 3
    assert plan.steps[0].title == "Inspect mount"
    assert plan.steps[1].title == "Center laser"
    assert plan.steps[2].title == "Lock position"
    assert plan.status == PlanStatus.PENDING
    assert plan.deadline is not None

    # Verify adapter received formatted system and user messages
    assert len(fake_adapter.received_messages) == 2
    assert "You are Stella's bounded sequential planning engine." in fake_adapter.received_messages[0].content
    assert "Mirror temperature is 18C" in fake_adapter.received_messages[1].content


def test_bounded_planner_strips_markdown_code_fences():
    """Verify BoundedPlanner handles JSON wrapped in markdown code fences (```json ... ```)."""
    raw_response = (
        "```json\n"
        "{\n"
        '  "goal": "Align observatory astrolabe",\n'
        '  "steps": [\n'
        '    {"title": "Position dial", "description": "Rotate coordinate dial to zero"}\n'
        "  ]\n"
        "}\n"
        "```"
    )
    fake_adapter = FakeLLMAdapter(response_text=raw_response)
    planner = BoundedPlanner(adapter=fake_adapter)

    plan = planner.create_plan("Align observatory astrolabe")
    assert plan.goal == "Align observatory astrolabe"
    assert len(plan.steps) == 1
    assert plan.steps[0].title == "Position dial"


def test_bounded_planner_rejects_oversized_plans():
    """Verify BoundedPlanner enforces maximum step limit and rejects models generating too many steps."""
    oversized_payload = {
        "goal": "Perform massive overhaul",
        "steps": [
            {"title": f"Sub-task {i}", "description": f"Details for subtask {i}"}
            for i in range(8)  # 8 steps exceeds max_steps=5
        ],
    }
    fake_adapter = FakeLLMAdapter(response_text=json.dumps(oversized_payload))
    planner = BoundedPlanner(adapter=fake_adapter, planning_settings=PlanningSettings(max_steps=5))

    with pytest.raises(PlanValidationError, match="exceeds maximum permitted steps"):
        planner.create_plan("Perform massive overhaul")


def test_bounded_planner_rejects_malformed_json():
    """Verify BoundedPlanner handles syntax errors in model output safely."""
    fake_adapter = FakeLLMAdapter(response_text="This is not JSON: {goal: unfinished...")
    planner = BoundedPlanner(adapter=fake_adapter)

    with pytest.raises(PlanGenerationError, match="Failed to parse model output as valid JSON"):
        planner.create_plan("Test malformed output")


def test_bounded_planner_rejects_missing_required_fields():
    """Verify BoundedPlanner rejects model JSON missing required step fields."""
    invalid_payload = {
        "goal": "Missing titles",
        "steps": [
            {"description": "No title field"}  # Missing 'title'
        ],
    }
    fake_adapter = FakeLLMAdapter(response_text=json.dumps(invalid_payload))
    planner = BoundedPlanner(adapter=fake_adapter)

    with pytest.raises(PlanValidationError, match="violated schema"):
        planner.create_plan("Test missing title")


def test_bounded_planner_handles_llm_adapter_errors():
    """Verify BoundedPlanner maps LLMAdapterError safely to PlanGenerationError."""
    fake_adapter = FakeLLMAdapter(
        error_to_raise=LLMAdapterError(category="ENGINE_OFFLINE", message="Ollama daemon unreachable")
    )
    planner = BoundedPlanner(adapter=fake_adapter)

    with pytest.raises(PlanGenerationError, match="ENGINE_OFFLINE"):
        planner.create_plan("Test engine offline")


# ============================================================================
# 7. Privacy & Logging Hygiene Tests
# ============================================================================

def test_planner_logging_never_leaks_prompts_or_secrets(caplog):
    """Verify BoundedPlanner never logs raw prompts, completions, or sensitive keys."""
    secret_note = "User secret api_key: sk-1234567890abcdef1234567890"
    mock_payload = {
        "goal": "Record secret note",
        "steps": [
            {"title": "Note down", "description": "Write down without secrets"}
        ],
    }
    fake_adapter = FakeLLMAdapter(response_text=json.dumps(mock_payload))
    planner = BoundedPlanner(adapter=fake_adapter)

    with caplog.at_level(logging.DEBUG, logger="stella.brain.planning"):
        planner.create_plan("Record note", context_notes=[secret_note])

    # Ensure secret token is nowhere in the planner logs
    assert "sk-1234567890abcdef1234567890" not in caplog.text
    # Ensure system prompt text is not dumped
    assert "You are Stella's bounded sequential planning engine." not in caplog.text


# ============================================================================
# 8. Security & Authorization Invariance
# ============================================================================

def test_plan_cannot_authorize_or_execute_actions():
    """Verify that a Plan is strictly an advisory proposal and cannot authorize or dispatch actions."""
    step = PlanStep(
        index=1,
        title="Delete directory",
        description="Informational note advising directory cleanup.",
    )
    plan = Plan(goal="Cleanup task", steps=[step])

    # 1. PlanStep has no tool execution methods
    assert not hasattr(step, "execute")
    assert not hasattr(step, "dispatch")
    assert not hasattr(step, "parameters_digest")
    assert not hasattr(step, "grant_permission")

    # 2. Plan has no tool execution methods
    assert not hasattr(plan, "execute")
    assert not hasattr(plan, "dispatch")
    assert not hasattr(plan, "parameters_digest")
    assert not hasattr(plan, "grant_permission")

    # 3. Neither Plan nor PlanStep can be treated as ActionProposalPayload
    from brain.core.response_contract import ActionProposalPayload
    with pytest.raises(ValidationError):
        ActionProposalPayload.model_validate(step.model_dump())

    with pytest.raises(ValidationError):
        ActionProposalPayload.model_validate(plan.model_dump())


# ============================================================================
# 9. Targeted Regression Tests for Hardened Plan Invariants
# ============================================================================

def test_plan_rejects_duplicate_step_titles():
    """Verify both Plan and PlanProposal reject duplicate step titles (case-insensitive)."""
    # 1. Plan rejection of duplicate titles
    duplicate_steps = [
        PlanStep(index=1, title="Calibrate mirror", description="Desc 1"),
        PlanStep(index=2, title="CALIBRATE MIRROR", description="Desc 2"),
    ]
    with pytest.raises(ValidationError, match="distinct, non-duplicate titles"):
        Plan(goal="Calibrate observatory", steps=duplicate_steps)

    # 2. PlanProposal rejection of duplicate titles
    with pytest.raises(ValidationError, match="distinct, non-duplicate titles"):
        PlanProposal(
            goal="Calibrate observatory",
            steps=[
                PlanStepProposal(title="Step A", description="Desc A"),
                PlanStepProposal(title="step a", description="Desc B"),
            ],
        )


def test_plan_step_count_maximum_bound():
    """Verify Plan model rejects plans exceeding 10 steps."""
    many_steps = [
        PlanStep(index=i + 1, title=f"Step {i + 1}", description=f"Desc {i + 1}")
        for i in range(11)
    ]
    with pytest.raises(ValidationError):
        Plan(goal="Too many steps", steps=many_steps)


def test_plan_expiry_step_state_consistency():
    """Verify that when a plan expires, active steps are failed and pending steps cancelled."""
    past_deadline = datetime.now(timezone.utc) - timedelta(seconds=1)
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
    ]
    plan = Plan(goal="Consistency test", steps=steps)
    # Start step 1
    plan.start()
    assert plan.steps[0].status == StepStatus.IN_PROGRESS
    assert plan.steps[1].status == StepStatus.PENDING

    # Force expiration
    plan.deadline = past_deadline
    assert plan.is_expired

    with pytest.raises(PlanExpiredError):
        plan.complete_current_step()

    assert plan.status == PlanStatus.FAILED
    assert plan.steps[0].status == StepStatus.FAILED
    assert plan.steps[0].error_message == "Plan deadline expired."
    assert plan.steps[1].status == StepStatus.CANCELLED


def test_terminal_plan_cannot_expire_retroactively():
    """Verify that a completed plan does not expire retroactively or corrupt its state."""
    future_deadline = datetime.now(timezone.utc) + timedelta(seconds=10)
    steps = [PlanStep(index=1, title="Step 1", description="Desc 1")]
    plan = Plan(goal="Completion test", steps=steps, deadline=future_deadline)

    # Complete plan on time
    plan.start()
    plan.complete_current_step()
    assert plan.status == PlanStatus.COMPLETED

    # Simulate elapsed deadline
    plan.deadline = datetime.now(timezone.utc) - timedelta(seconds=5)
    # A completed plan is terminal and MUST NOT report as expired
    assert not plan.is_expired

    # Calling complete_current_step on completed plan must raise InvalidPlanTransitionError, NOT PlanExpiredError
    with pytest.raises(InvalidPlanTransitionError, match="plan is in 'completed' state"):
        plan.complete_current_step()

    # Plan status must remain COMPLETED, not corrupted to FAILED
    assert plan.status == PlanStatus.COMPLETED


def test_plan_cannot_complete_with_unfinished_steps():
    """Verify that a plan cannot complete if any step is not in COMPLETED state."""
    steps = [
        PlanStep(index=1, title="Step 1", description="Desc 1"),
        PlanStep(index=2, title="Step 2", description="Desc 2"),
    ]
    plan = Plan(goal="Incomplete steps test", steps=steps)
    plan.start()

    # Manually cancel step 2 behind the scenes
    plan.steps[1].cancel("External fault")

    # Completing step 1 must not transition plan to COMPLETED
    with pytest.raises(InvalidPlanTransitionError, match="not all steps were successfully completed"):
        plan.complete_current_step()


def test_bounded_planner_truncates_long_context_notes():
    """Verify BoundedPlanner bounds individual context notes to 256 characters."""
    giant_note = "A" * 1000
    mock_payload = {
        "goal": "Test context notes bounding",
        "steps": [{"title": "Step 1", "description": "Desc 1"}],
    }
    fake_adapter = FakeLLMAdapter(response_text=json.dumps(mock_payload))
    planner = BoundedPlanner(adapter=fake_adapter)

    plan = planner.create_plan("Test goal", context_notes=[giant_note])
    assert plan.goal == "Test context notes bounding"

    user_msg = fake_adapter.received_messages[1].content
    # Note should be bounded to 256 'A's, not 1000
    assert "A" * 256 in user_msg
    assert "A" * 257 not in user_msg
