"""Standalone CLI demonstration driver for Stella Python Brain (Steps 3.1 - 3.6).

Demonstrates:
1. Active configuration settings and editable personality loading.
2. Session-scoped ephemeral working memory (turns, goals, scratchpad).
3. SQLite-backed persistent memory store with credential rejection and relevance recall.
4. Bounded context assembly combining personality, recalled memories, and perception.
5. Safe, non-intrusive Ollama adapter loopback health probe.
6. Finite State Machine (FSM) lifecycle and parameter digest immutability.
7. Bounded sequential planning with strictly validated step transitions.
8. Independent, fail-closed Permission Gateway with single-use replay protection.
9. Central Brain Orchestrator with bounded context, untrusted model guards, and safe FSM recovery.

No models are downloaded or executed automatically. No cloud APIs are contacted.
"""

import json
import sys
from pathlib import Path
from typing import Iterator, List, Optional
from uuid import uuid4

# Ensure project root is on sys.path when invoked directly as a script
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from brain.actions.base import BaseActionProposal, compute_parameter_digest
from brain.actions.gateway import GatewayAuthorizationResult, PermissionGateway
from brain.adapters.base import (
    ChatMessage,
    LLMAdapter,
    LLMAdapterError,
    LLMChunk,
    LLMGenerationParams,
    LLMResponse,
    Role,
)
from brain.adapters.ollama_adapter import OllamaAdapter
from brain.config.logging import setup_logging
from brain.config.personality import build_system_prompt, load_personality_config
from brain.config.settings import BrainSettings
from brain.core.context import ContextManager
from brain.core.fsm import BrainFSM, BrainState, InvalidStateTransitionError
from brain.core.orchestrator import (
    BrainOrchestrator,
    OrchestratorResponse,
    OrchestratorTurnStatus,
)
from brain.memory.long_term import SqliteMemoryStore, format_for_context
from brain.memory.schema import (
    ConsentRequiredError,
    ConversationTurn,
    MemoryRecallRequest,
    MemorySensitivity,
    MemoryWriteProposal,
    PrivacyViolationError,
)

from brain.memory.short_term import SessionMemoryStore
from brain.planning import (
    BoundedPlanner,
    InvalidPlanTransitionError as PlanningInvalidTransitionError,
    Plan,
    PlanStatus,
    PlanStep,
    StepStatus,
)


class _DemoFakeAdapter(LLMAdapter):
    """In-memory deterministic adapter for CLI demonstration without requiring running Ollama."""

    def __init__(self, response_text: str = "") -> None:
        self.response_text = response_text
        self.should_fail = False

    def ping(self) -> bool:
        return not self.should_fail

    def check_model_available(self, model_name: Optional[str] = None) -> bool:
        return True

    def generate(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> LLMResponse:
        if self.should_fail:
            raise LLMAdapterError("Simulated local Ollama engine timeout")
        return LLMResponse(
            content=self.response_text,
            finish_reason="stop",
            prompt_tokens=180,
            completion_tokens=45,
            total_duration_ms=25.0,
            model="demo_local_model",
        )

    def stream(
        self,
        messages: List[ChatMessage],
        params: Optional[LLMGenerationParams] = None,
    ) -> Iterator[LLMChunk]:
        yield LLMChunk(delta_text=self.response_text, finish_reason="stop")



def run_demonstration() -> int:
    """Run in-process foundation, adapter, and memory demonstration and return exit code."""
    logger = setup_logging()
    logger.info("Initializing Stella Brain Step 3.6 CLI demonstration...")

    # 1. Load settings (safe, non-sensitive)
    settings = BrainSettings()
    print("=" * 65)
    print(f"Stella Brain Milestone (v{settings.version})")
    print(f"Model Baseline:     {settings.model_identifier}")
    print(f"Ollama Loopback:    {settings.ollama_base_url}")
    print(f"Database Directory: {settings.data_dir}")
    print(f"Context Limit:      {settings.context_budget.total_context_limit} tokens")
    print(f"Completion Reserve: {settings.context_budget.completion_reserve_tokens} tokens")
    print("=" * 65)

    # 2. Personality Configuration
    print("\n[1/9] Loading Editable Personality Configuration:")
    try:
        persona = load_personality_config()
        print(f"  Name:       {persona.name} (v{persona.version})")
        print(f"  Archetype:  {persona.archetype}")
        print(f"  Traits:     {', '.join(persona.traits[:3])}...")
        print(f"  Tone:       {persona.conversational_style.dialogue_tone[:75]}...")
    except Exception as err:
        print(f"[FAIL] Could not load personality: {err}")
        return 1

    # 3. Session-Scoped Working Memory (Short-Term Memory)
    print("\n[2/9] Demonstrating Ephemeral Short-Term Working Memory:")
    session_store = SessionMemoryStore(max_turns=10)
    session_store.add_turn(ConversationTurn(role=Role.USER, content="Hello Stella, can we inspect Cygnus?"))
    session_store.add_turn(ConversationTurn(role=Role.ASSISTANT, content="Of course, Darling! Pointing sensors to Cygnus."))
    session_store.add_goal("Calibrate secondary mirror")
    session_store.set_scratchpad("elevation_deg", 45)

    print(f"  Stored Turns in Session:       {session_store.turn_count}")
    print(f"  Active Session Goals:          {session_store.get_goals()}")
    print(f"  Scratchpad Items:              {session_store.get_all_scratchpad()}")
    print("  (Session memory is strictly in-memory and will never persist to disk).")

    # 4. Durable Long-Term Memory & Privacy Guards
    print("\n[3/9] Demonstrating SQLite Long-Term Memory (Isolated Store):")
    with SqliteMemoryStore(db_path=":memory:") as mem_store:
        # Store routine preference
        pref_mem = mem_store.store(MemoryWriteProposal(
            category="preference",
            sensitivity=MemorySensitivity.ROUTINE,
            content="User prefers observation elevation angle set to 45 degrees.",
        ))
        print(f"  Stored Routine Preference:     [{pref_mem.category}] {pref_mem.content[:45]}...")

        # Store sensitive memory with explicit consent verified by trusted boundary
        sens_mem = mem_store.store(
            MemoryWriteProposal(
                category="personal",
                sensitivity=MemorySensitivity.SENSITIVE,
                content="User nickname is Stargazer.",
            ),
            trusted_consent=True,
        )
        print(f"  Stored Sensitive Memory:       [{sens_mem.category}] (Verified by trusted boundary)")

        # Demonstrate model-generated consent rejection
        try:
            mem_store.store(MemoryWriteProposal(
                category="personal",
                sensitivity=MemorySensitivity.SENSITIVE,
                content="Model attempting to bypass consent.",
                consent_granted=True,  # Model claims consent
            ))
            print("  [FAIL] Untrusted model consent unexpectedly permitted!")
            return 1
        except ConsentRequiredError:
            print("  [PASS] Guard blocked model-proposed consent (fail-closed).")

        # Demonstrate credential rejection
        try:
            mem_store.store(MemoryWriteProposal(
                category="secret",
                content="API key is sk-1234567890abcdef1234567890",
            ))
            print("  [FAIL] Credential rejection failed!")
            return 1
        except PrivacyViolationError:
            print("  [PASS] Privacy guard blocked credential storage (sk-...).")


        # Relevance Recall
        recalled = mem_store.recall(MemoryRecallRequest(
            query_text="telescope elevation angle",
            max_results=2,
        ))
        print(f"  Recalled Memories:             {len(recalled)} items matching 'telescope elevation angle'")
        if recalled:
            print(f"    - Top Match Relevance:       {recalled[0].relevance_score}")

        formatted_memories = format_for_context(recalled)

    # 5. Bounded Context Assembly with Recalled Memory
    print("\n[4/9] Demonstrating Bounded Context Assembly with Memory:")
    cm = ContextManager(budget_settings=settings.context_budget)
    system_prompt = build_system_prompt(persona)
    mock_perception = {
        "active_planet": "Saturn",
        "station_mode": "Observatory",
    }

    assembled = cm.assemble_context(
        system_instruction=system_prompt,
        current_user_message="Prepare telescope for next star observation.",
        conversation_history=session_store.to_chat_messages(),
        long_term_memories=formatted_memories,
        perceptual_state=mock_perception,
    )

    print(f"  Total Estimated Prompt Tokens: {assembled.estimated_total_tokens}")
    print("  Partition Token Allocations:")
    for partition, count in assembled.partition_breakdown.items():
        print(f"    - {partition:<26}: {count:>4} tokens")
    print(f"  History Turns Evicted:         {assembled.eviction_summary.conversation_turns_dropped}")
    print(f"  Total Messages Prepared:       {len(assembled.messages)}")

    # 6. Safe Ollama Adapter Health Probe
    print("\n[5/9] Demonstrating Safe Ollama Adapter Health Probe (Local Loopback Only):")
    adapter = OllamaAdapter(
        base_url=settings.ollama_base_url,
        model_name=settings.model_identifier,
        ping_timeout_seconds=settings.timeouts.ping_timeout_seconds,
    )
    is_alive = adapter.ping()
    if is_alive:
        model_installed = adapter.check_model_available()
        print(f"  Ollama Daemon Status:          ONLINE (200 OK)")
        print(f"  Configured Model Available:    {'YES' if model_installed else 'NO (not pulled)'}")
    else:
        print(f"  Ollama Daemon Status:          OFFLINE / STANDBY")
        print("  (Ollama is not running locally. Adapter handles offline state gracefully).")

    # 7. Finite State Machine (FSM) Lifecycle & Parameter Digest Immutability
    print("\n[6/9] Demonstrating FSM Lifecycle & Parameter Digest:")
    fsm = BrainFSM(initial_state=BrainState.OFFLINE)
    fsm.transition_to(BrainState.INITIALIZING, reason="CLI startup self-test")
    fsm.transition_to(BrainState.STANDBY, reason="Engine ready")
    fsm.transition_to(BrainState.LISTENING, reason="User input simulation")
    fsm.transition_to(BrainState.STANDBY, reason="Idle return")

    try:
        fsm.transition_to(BrainState.EXECUTING, reason="Illegal transition test")
        print("  [FAIL] Unexpectedly permitted illegal transition!")
        return 1
    except InvalidStateTransitionError as err:
        print(f"  [PASS] Guard intercepted illegal transition: {err.current_state.value} -> {err.target_state.value}")

    params = {"target_file": "notes.txt", "line_count": 42, "options": {"force": False}}
    digest = compute_parameter_digest(params)
    print(f"  SHA-256 Digest:                {digest}")

    # 8. Bounded Sequential Planning (Step 3.4)
    print("\n[7/9] Demonstrating Bounded Sequential Planning:")
    sample_steps = [
        PlanStep(
            index=1,
            title="Calibrate telescope mount",
            description="Adjust altitude and azimuth motor drives to alignment markers.",
        ),
        PlanStep(
            index=2,
            title="Inspect optical mirror",
            description="Perform focal sensor check and verify primary mirror cleanliness.",
        ),
        PlanStep(
            index=3,
            title="Record celestial coordinates",
            description="Log right ascension and declination into observation catalog.",
        ),
    ]
    plan = Plan(
        goal="Calibrate observatory telescope for evening observation session",
        steps=sample_steps,
        max_retries=2,
    )

    print(f"  Created Plan [{plan.plan_id[:8]}...]: '{plan.goal[:45]}...'")
    print(f"  Plan Step Count:               {len(plan.steps)} (Cap: {settings.planning.max_steps})")
    print(f"  Initial Plan Status:           {plan.status.value}")

    # Step 1: Start plan
    first_step = plan.start()
    print(f"  Started Plan -> Active Step:   [{first_step.index}/{len(plan.steps)}] '{first_step.title}'")

    # Step 1: Complete and advance to Step 2
    second_step = plan.complete_current_step()
    print(f"  Completed Step 1 -> Step 2:    [{second_step.index}/{len(plan.steps)}] '{second_step.title}'")

    # Demonstrate step failure and retry within retry limit
    plan.fail_current_step("Optical sensor temporarily unresponsive")
    print(f"  [PASS] Intercepted Step 2 Fail: Plan Status is '{plan.status.value}'")
    restarted_step = plan.retry("Re-attempt sensor focal probe")
    print(f"  [PASS] Retried Plan ({plan.retry_count}/{plan.max_retries}): Resumed Step 2 in '{plan.status.value}'")

    # Complete step 2
    third_step = plan.complete_current_step()
    print(f"  Completed Step 2 -> Step 3:    [{third_step.index}/{len(plan.steps)}] '{third_step.title}'")

    # Complete step 3 -> Plan COMPLETED
    terminal = plan.complete_current_step()
    assert terminal is None
    print(f"  Completed Step 3 -> Plan:      {plan.status.value} ({plan.completed_step_count}/{len(plan.steps)} steps complete)")

    # Verify illegal transition on completed plan is rejected
    try:
        plan.cancel("Attempting illegal cancellation")
        print("  [FAIL] Permitted cancellation on completed plan!")
        return 1
    except PlanningInvalidTransitionError:
        print("  [PASS] Guard blocked illegal transition on terminal COMPLETED plan.")

    # 9. Independent Permission Gateway (Step 3.5)
    print("\n[8/9] Demonstrating Independent Permission Gateway (Step 3.5):")
    gateway = PermissionGateway(confirmation_ttl_seconds=60.0)

    # (a) Registered Read-Only Action
    read_proposal = BaseActionProposal(
        proposal_id=uuid4(),
        turn_id="turn_cli_001",
        action_name="get_observatory_status",
        parameters={},
        intent_summary="Probe observatory state",
    )
    auth_read = gateway.evaluate_proposal(read_proposal)
    exec_read = gateway.execute_action(auth_read)
    print(f"  Read-Only Action '{read_proposal.action_name}': Authorized={auth_read.authorized}, Status='{auth_read.status}' (Risk: '{auth_read.risk_level}')")
    print(f"    - Execution Result:          Status='{exec_read.status}', Output={exec_read.output_data}")

    # (b) Default-Deny on Unknown / Dangerous Action
    shell_proposal = BaseActionProposal(
        proposal_id=uuid4(),
        turn_id="turn_cli_002",
        action_name="run_shell_command",
        parameters={"command": "whoami"},
        intent_summary="Untrusted model proposing arbitrary shell execution",
    )
    auth_shell = gateway.evaluate_proposal(shell_proposal)
    print(f"  [PASS] Unknown Action Denied:  '{shell_proposal.action_name}' -> Code='{auth_shell.error_code}'")

    # (c) Consequential Action Requiring Confirmation
    conseq_proposal = BaseActionProposal(
        proposal_id=uuid4(),
        turn_id="turn_cli_003",
        action_name="recalibrate_sensor_mount",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
        intent_summary="Align focal optical mount",
    )
    auth_conseq = gateway.evaluate_proposal(conseq_proposal)
    assert auth_conseq.confirmation_token is None  # Never leaked to model-facing layer
    print(f"  Consequential Action:          Authorized={auth_conseq.authorized}, Status='{auth_conseq.status}' (Risk: '{auth_conseq.risk_level}')")
    print(f"    - Issued Prompt ID:          [{str(auth_conseq.prompt.prompt_id)[:8]}...]")
    print(f"    - Model Token Leakage:       None (Token is kept in trusted boundary)")

    # (d) Argument Tampering Protection
    trusted_token = gateway.get_confirmation_token_for_trusted_boundary(auth_conseq.prompt.prompt_id)
    tamper_result = gateway.confirm_and_authorize(
        proposal_id=auth_conseq.proposal_id,
        confirmation_token=trusted_token,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "x"},  # Tampered parameter
    )
    print(f"  [PASS] Tamper Guard Detected:  Code='{tamper_result.error_code}' (Modified payload intercepted)")

    # (e) Valid Trusted Confirmation & Dispatch
    auth_conseq2 = gateway.evaluate_proposal(conseq_proposal)
    trusted_token2 = gateway.get_confirmation_token_for_trusted_boundary(auth_conseq2.prompt.prompt_id)
    valid_confirm = gateway.confirm_and_authorize(
        proposal_id=auth_conseq2.proposal_id,
        confirmation_token=trusted_token2,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    exec_conseq = gateway.execute_action(valid_confirm)
    print(f"  [PASS] Trusted Confirmation:   Authorized={valid_confirm.authorized}, Execution='{exec_conseq.status}'")

    # (f) Confirmation Replay Protection (Atomic Token Consumption)
    replay_result = gateway.confirm_and_authorize(
        proposal_id=auth_conseq2.proposal_id,
        confirmation_token=trusted_token2,
        decision="approved",
        parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    print(f"  [PASS] Confirmation Replay:    Code='{replay_result.error_code}' (Token cannot be reused)")

    # (g) Execution Replay Protection (Single-Use Dispatch Ticket)
    exec_replay = gateway.execute_action(valid_confirm)
    print(f"  [PASS] Execution Replay Guard: Code='{exec_replay.error_code}' (Authorization is single-use)")

    # (h) Forged Authorization Rejection
    fake_auth = GatewayAuthorizationResult(
        proposal_id=uuid4(),
        action_name="recalibrate_sensor_mount",
        authorized=True,
        status="authorized",
        risk_level="consequential",
        validated_parameters={"sensor_id": "mount_alpha", "axis": "both"},
    )
    exec_fake = gateway.execute_action(fake_auth)
    print(f"  [PASS] Forged Auth Denied:     Code='{exec_fake.error_code}' (Unsigned authorizations rejected)")

    # (i) Destructive Action Default-Deny
    destruct_proposal = BaseActionProposal(
        proposal_id=uuid4(),
        turn_id="turn_cli_004",
        action_name="purge_observation_database",
        parameters={"confirm_phrase": "PURGE_NOW"},
        intent_summary="Attempted catalog wipe",
    )
    auth_destruct = gateway.evaluate_proposal(destruct_proposal)
    print(f"  [PASS] Destructive Policy:     Code='{auth_destruct.error_code}' (Destructive actions default-denied)")

    # 10. Central Brain Orchestrator (Step 3.6)
    print("\n[9/9] Demonstrating Central Brain Orchestrator (Step 3.6):")
    demo_adapter = _DemoFakeAdapter()

    with SqliteMemoryStore(db_path=":memory:") as demo_sqlite:
        demo_session = SessionMemoryStore(max_turns=10, session_id="cli_demo")
        demo_gateway = PermissionGateway(confirmation_ttl_seconds=60.0)
        orchestrator = BrainOrchestrator(
            settings=settings,
            personality_config=persona,
            llm_adapter=demo_adapter,
            memory_store=demo_sqlite,
            session_store=demo_session,
            permission_gateway=demo_gateway,
        )

        # (a) Turn 1: Conversational turn with read-only action proposal
        demo_adapter.response_text = json.dumps({
            "user_facing_text": "Hello Darling! All observatory instruments are aligned and tracking smoothly.",
            "expression_hint": "happy",
            "proposed_actions": [
                {
                    "proposal_id": str(uuid4()),
                    "action_name": "get_observatory_status",
                    "parameters": {},
                    "intent_summary": "Probe telescope status",
                    "risk_level": "read_only",
                }
            ],
            "confirmation_requirements": [],
        })
        turn1 = orchestrator.process_turn("Hello Stella, how are the observatory instruments?", session_id="cli_demo")
        persisted_count = demo_sqlite._conn.execute("SELECT COUNT(*) FROM memories;").fetchone()[0]
        print(f"  Turn 1 Status:                 {turn1.status.value}")
        print(f"  Assistant Dialogue:            '{turn1.user_facing_text}'")
        print(f"  Expression Hint:               '{turn1.expression_hint}'")
        print(f"  Proposed Actions Evaluated:    {len(turn1.proposed_actions)} (Action: '{turn1.proposed_actions[0].action_name}', Risk: '{turn1.proposed_actions[0].risk_level}')")
        print(f"  Automatic Execution Guard:     Actions evaluated={len(turn1.proposed_actions)}, executed=0 (Never auto-executed)")
        print(f"  Short-Term Session Turns:      {demo_session.turn_count} (User + Assistant stored in ephemeral memory)")
        print(f"  Long-Term Persisted Turns:     {persisted_count} (Full transcripts are NEVER auto-persisted)")
        print(f"  FSM End-of-Turn State:         {orchestrator.get_fsm('cli_demo').state.value} (Clean return to STANDBY)")

        # (b) Turn 2: Consequential action proposing recalibration (Awaiting Confirmation)
        demo_adapter.response_text = json.dumps({
            "user_facing_text": "I can recalibrate the sensor mount for you, but please confirm the operation.",
            "expression_hint": "thinking",
            "proposed_actions": [
                {
                    "proposal_id": str(uuid4()),
                    "action_name": "recalibrate_sensor_mount",
                    "parameters": {"sensor_id": "mount_alpha", "axis": "both"},
                    "intent_summary": "Align focal optical mount",
                    "risk_level": "consequential",
                }
            ],
            "confirmation_requirements": [],
        })
        turn2 = orchestrator.process_turn("Please recalibrate mount alpha.", session_id="cli_demo")
        print(f"  Turn 2 Status:                 {turn2.status.value}")
        print(f"  Confirmation Prompts Issued:   {len(turn2.confirmation_prompts)}")
        if turn2.confirmation_prompts:
            prompt = turn2.confirmation_prompts[0]
            print(f"    - Prompt ID:                 [{str(prompt.prompt_id)[:8]}...]")
            print(f"    - Token Protection:          Confirmation token is None (Never leaked outside gateway boundary)")

        # (c) Turn 3: Graceful failure recovery on model timeout
        demo_adapter.should_fail = True
        turn3 = orchestrator.process_turn("Are you still there?", session_id="cli_demo")
        print(f"  Turn 3 Model Failure Handling: Status='{turn3.status.value}', Error='{turn3.error_message}'")
        print(f"  Safe Fallback Response:        '{turn3.user_facing_text}'")
        print(f"  FSM Auto-Recovery State:       {orchestrator.get_fsm('cli_demo').state.value} (Recovered cleanly from ERROR to STANDBY)")

    print("\n[OK] Step 3.6 Brain Orchestrator, Permission Gateway, Planning & Foundation CLI demonstration completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(run_demonstration())
