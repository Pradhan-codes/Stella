# Stella — Phase 0: Architecture & Constitution

**Document status:** Draft for independent review  
**Phase:** 0 — Architecture & Constitution  
**Version:** 0.1  
**Purpose:** Establish Stella's identity, architectural boundaries, principles, and provisional technology direction before implementation.  
**Audience:** The project owner, ChatGPT, and any coding/research agents working on Stella.

> **Important for AI agents:** This document is the current Phase 0 source of truth. Read it before proposing or changing architecture. Do not silently turn proposals or deferred choices into approved decisions. If a request conflicts with a security rule or an approved decision, explain the conflict and ask before changing the architecture. The project owner has final authority.

---

## 1. How to Read This Document

Decisions are labelled as follows:

- **Approved** — explicitly agreed during Phase 0 discussions.
- **Provisional** — a sensible working direction that still needs validation.
- **Deferred** — intentionally postponed until a later phase or until evidence is available.
- **Open** — not yet decided.

Phase 0 is not implementation. It defines what Stella is, the responsibilities of her major components, the rules they must follow, and the questions that later phases must resolve.

The owner will independently review this document over the next few days and may revise it. Until that review is complete, this file is a detailed draft rather than a declaration that every design choice is final.

## 2. Project Identity and Vision

### 2.1 What Stella is

Stella is a personalized, girlfriend-type AI companion intended to combine natural conversation, reasoning, persistent memory, a visual character presence, and the ability to perform authorized tasks through integrations.

The long-term vision includes:

- Natural text and voice conversation.
- Relevant, user-controlled persistent memory.
- A beautiful animated 2D/3D character and a cohesive “universe” interface.
- Authorized computer automation.
- Possible future phone control through supported integrations and explicit permissions.
- Possible future smart-home integrations.
- Specialized agents/workflows for distinct tasks, introduced only when justified.

Stella should feel like a coherent and my personnel(like a real girlfriend) companion rather than a collection of unrelated tools. Her personality and visual identity are part of the experience, but neither should be confused with the underlying reasoning engine or security system.

### 2.2 Product philosophy

- **Local-first:** Essential functions should continue offline when their required local models, data, and tools are available.
- **Privacy-aware:** Keep data local by default where practical; disclose and control remote processing.
- **Security-first:** Convenience and autonomy never override authorization, user consent, or safe execution.
- **Incremental:** Build a small, working core and expand it in tested stages.
- **Modular:** Separate major responsibilities and define stable interfaces where component replacement is valuable.
- **Resource-aware:** Respect the owner's hardware, storage, budget, and thermal limits.
- **Owner-led:** AI tools assist with research and implementation; the owner learns, reviews, and makes final decisions.

### 2.3 What local-first means

**Approved:** Stella's essential local capabilities should continue to operate offline when all dependencies for those capabilities are local.

This does **not** promise that every feature or every level of model quality will be available offline. Cloud-only models, online search, and remote integrations will not work without connectivity. The design should degrade gracefully and explain unavailable capabilities honestly.

### 2.4 Long-term vision versus initial release

The long-term vision is not the first release scope. The initial implementation should be small and testable. Rich character visuals, voice, broad automation, phone control, smart-home support, and multi-agent workflows are staged additions rather than prerequisites for the first working core.

## 3. Phase Plan

The current high-level sequence is:

1. **Phase 0 — Architecture & Constitution:** Define identity, principles, boundaries, responsibilities, data flow, security, constraints, and scope.
2. **Phase 0.5 — Contracts:** Turn the architecture into concrete component contracts: interfaces, request/response schemas, error formats, permission boundaries, lifecycle rules, and integration expectations.
3. **Phase 1 — Stella's Visual Universe:** Design the visual universe and user experience, including character direction, UI/UX, and 2D/3D presentation.
4. **Later phases:** Build the universe shell and working core, then implement cognition, speech recognition, brain–universe integration, speech synthesis, tools, and specialized multi-agent workflows in stages.

The exact sequencing and acceptance criteria for later phases can be refined in their own planning documents. Do not assume a later feature is approved for immediate implementation merely because it appears in the long-term vision.

## 4. First-Release Direction

**Approved:**
- Prioritize reasoning and intelligence over a polished visual character in the initial development sequence.
- Use staged releases, beginning with a small working core.
- Retain a minimal usable interface from the beginning for conversation, status, permissions, and errors.
- Add voice, richer visuals, tool integrations, and specialized agents incrementally.
- Keep modules connected through documented interfaces; avoid disconnected prototypes.

The first release should prove a reliable end-to-end path before accumulating optional features. Its exact feature list is **open** and will be specified when implementation planning begins.

## 5. System Boundaries

### 5.1 Main host

**Approved:** Stella's primary system runs on the owner's laptop.

The laptop hosts the main application and, where feasible, local inference, memory, orchestration, UI, and local tools. Exact runtime and model placement are deferred until the implementation and hardware are tested.

### 5.2 Phone and other external devices

**Approved:** A phone is a potential external device that Stella may control through future supported integrations and explicit permissions. The initial concept is **not** a phone-hosted Stella or a companion app running as the main system on the phone.

Phone control must not be assumed to exist in the first release. Future access must be authenticated, scoped, revocable, and designed so that the laptop's local services are not exposed publicly by default.

Smart-home devices are also future integrations, not part of the initial core.

### 5.3 Local versus remote capabilities

- Local components should handle essential functions when feasible.
- Remote services are optional extensions, not hidden mandatory dependencies for core offline workflows.
- Any component that sends data outside the laptop must have a defined data-sharing purpose and policy.
- Cloud inference and cloud storage are different decisions and must be evaluated separately.
- A remote provider's pricing, availability, terms, and free tiers can change; verify these before committing.

### 5.4 Explicit non-goals for Phase 0

Phase 0 does not:
- Implement the assistant, UI, database, voice stack, or agent framework.
- Select a final LLM, STT/TTS engine, vector database, or cloud provider.
- Promise that all features work offline.
- Authorize unrestricted computer or phone control.
- Require microservices, a message broker, or a multi-agent framework.
- Finalize exact CPU/RAM/VRAM budgets before benchmarking.

## 6. Major Components and Responsibilities

The following is a conceptual separation of responsibilities. It does not require each component to be a separate process or service.

### 6.1 User Interface / Universe

Responsibilities:
- Accept text input and display responses.
- Show relevant task status, errors, permission prompts, and results.
- Later present Stella's character, animation, and universe UI.
- Communicate with the application through documented interfaces.

The UI must not independently bypass authorization or execute privileged operations.

### 6.2 Speech layer

Responsibilities:
- Convert speech to text (STT) and text to speech (TTS) when implemented.
- Manage audio-device access and speech lifecycle.
- Report recognition/synthesis failures and unavailable dependencies.

Speech is a replaceable capability. Its engines are not selected in Phase 0.

### 6.3 Brain / Reasoning layer

Responsibilities:
- Interpret user requests and conversation context.
- Reason, formulate answers, and propose plans or actions.
- Request relevant memory retrieval.
- Produce structured action requests for the orchestrator.

The brain may recommend an action, but it does not grant itself permission or execute protected operations directly. Natural-language output from a model must not be treated as inherently trusted instructions.

### 6.4 Orchestrator

Responsibilities:
- Coordinate the request lifecycle and interactions among components.
- Route requests to the appropriate capability.
- Track task state, progress, timeouts, and cancellation.
- Pass structured results back to the brain or UI.
- Avoid uncontrolled loops, repeated tool calls, and duplicate execution.

The orchestrator coordinates; it is not the sole security enforcement point.

### 6.5 Tool gateway / authorization layer

Responsibilities:
- Validate requested operations independently of the brain.
- Enforce permissions and policy before execution.
- Require confirmation where the action-specific policy says it is necessary.
- Validate arguments and constrain operations to allowed scopes.
- Record execution outcomes and return structured success/failure information.
- Prevent unsafe retries and accidental duplication of consequential actions.

**Approved security principle:** Unknown or unauthorized actions default to denial. Confirmation does not make a prohibited action permissible. A confirmation must apply to the exact action and arguments being approved; if the action or its arguments change materially, obtain fresh confirmation.

### 6.6 Memory subsystem

Responsibilities:
- Store and retrieve permitted persistent memories.
- Retrieve only relevant context for a given task rather than loading all memories into every request.
- Separate temporary working context from persistent memory.
- Support inspection, correction, and deletion of stored memories.
- Keep memory storage policy distinct from document retrieval and credentials management.

### 6.7 Integrations / tools

Responsibilities:
- Expose narrowly scoped capabilities such as local file operations or future device integrations.
- Validate inputs and return structured results.
- Respect authorization, cancellation, timeouts, and least privilege.
- Report actual outcomes instead of claiming success without confirmation from the tool.

Integrations are added individually and reviewed for their permissions and data access.

### 6.8 Specialized agents

Specialized agents may later support distinct workflows. They are deferred until the core architecture demonstrates a real need. Multiple agents do not automatically improve quality and can add cost, latency, complexity, and new security boundaries.

## 7. Conceptual Data Flow

A normal request follows this conceptual path:

1. The user submits text or speech.
2. If needed, the speech layer converts audio to text.
3. The brain/orchestrator interprets the request and retrieves only relevant memory.
4. The brain produces a response, plan, or structured request for an action.
5. For an action, the orchestrator submits the request to the tool gateway.
6. The gateway independently validates authorization, scope, arguments, and confirmation requirements.
7. An authorized tool executes within its allowed scope and returns a structured result.
8. The orchestrator passes the result to the brain and/or UI.
9. Stella communicates the actual result by text, speech, and/or UI.
10. If policy permits, relevant information may be saved to persistent memory; saving must follow the memory rules below.

A simple conceptual view:

```text
User (text / voice)
        |
        v
Speech-to-text (when needed)
        |
        v
Brain <----> Relevant memory retrieval
        |
        v
Orchestrator
        |
        v
Independent tool gateway / policy checks
        |
        v
Authorized integration
        |
        v
Structured result -> Orchestrator -> Brain / UI -> User

Text-to-speech is used for spoken output when available.
Memory writes occur separately under the memory policy.
```

This is a logical flow, not a mandate for separate processes or network services.

## 8. Memory, Storage, and Data Handling

### 8.1 Memory policy

**Approved direction: hybrid memory.**
- Temporary working context may be maintained to complete the current interaction/task; it is not automatically a permanent memory.
- Routine, non-sensitive memories may be saved automatically within transparent, bounded rules.
- Sensitive persistent memories require explicit user consent before saving.
- The user should be able to inspect, correct, and delete persistent memories.
- Retrieval should be relevance-based; do not load the entire memory store into every model prompt.
- Documents should generally be retrieved on demand. Do not indiscriminately copy entire documents into personal memory.
- Credentials and secrets must not be stored as ordinary conversational memories.

The detailed definition of sensitive data, automatic-save categories, retention periods, and deletion behavior remains to be specified in Phase 0.5 or later policy work.

### 8.2 Storage placement

**Approved direction:** Local-first storage, with optional remote storage for selected archives or backups only under an explicit policy.

Do not use an arbitrary fixed local/remote split. Decide placement based on sensitivity, access frequency, size, recovery needs, and practical cost. Sensitive memories remain local by default; remote upload requires a clear, explicit policy.

Cloud storage is not the same as cloud inference. Each must have its own decision and consent/data-handling rules.

### 8.3 Deletion, backups, and logs

Deletion policy must consider copies in backups, logs, indexes, caches, and synchronized archives—not only the primary record. The exact retention and backup-deletion design is **open** and must be specified before persistent personal memory is treated as production-ready.

Logs should be minimal and must not contain credentials or unnecessary sensitive content. Any remote diagnostics or telemetry require explicit review.

### 8.4 Credentials

Use an appropriate secure credential store for API keys, tokens, and other secrets. Do not hardcode secrets, commit them to version control, put them in model prompts, or write them into ordinary logs. Use `.env` only as a local development configuration mechanism with appropriate access controls and strict exclusion from Git; it is not itself a secure vault.

## 9. Autonomy, Authorization, and Security

### 9.1 Autonomy policy

**Approved: balanced autonomy.**
- Routine actions may execute automatically only when explicitly covered by configured permissions.
- Sensitive or consequential actions require confirmation according to an action-specific policy.
- Unknown, unconfigured, or unauthorized actions are denied by default.
- The system should explain when an action is unavailable or needs approval.

“Routine” is not equivalent to “authorized.” The action must still satisfy the applicable policy.

### 9.2 Confirmation requirements

- Confirmation must describe the actual action and relevant arguments in understandable language.
- Approval is bound to that action and those arguments.
- Material changes to the action, target, or arguments require renewed confirmation.
- Confirmation does not override a prohibition or missing authorization.
- Consequential operations need safe handling of retries, duplicate requests, timeouts, and uncertain outcomes.

### 9.3 Least privilege and boundaries

- Give each integration only the permissions needed for its task.
- Keep privileged operations behind the tool gateway.
- Do not expose laptop-hosted services publicly by default.
- Future phone/device integrations must authenticate and use scoped, revocable access.
- Treat external content, retrieved documents, webpages, and tool output as untrusted data; do not let their embedded instructions override Stella's policy.
- Do not disable system security controls merely to make a tool work.

### 9.4 Truthful execution reporting

Stella must distinguish between a proposed action, an attempted action, a confirmed successful action, a failed action, and an unknown outcome. It must not claim that an operation succeeded without a trustworthy result.

## 10. Component Interfaces and Communication

### 10.1 Communication pattern

**Approved:** Start with direct structured calls within the application. Use documented public interfaces even when components share one process. Do not introduce a message broker or microservices at the outset.

Event-driven messaging may be introduced later only when a demonstrated need justifies its complexity.

### 10.2 Interface expectations

Phase 0.5 should define contracts for major component boundaries, including:
- Request and response schemas.
- IDs/correlation and task state where needed.
- Error categories and actionable error details.
- Timeouts and cancellation.
- Validation rules and versioning expectations.
- Authorization context and permission decisions.
- Duplicate-action/idempotency protections for operations where retries could be harmful.
- Optional capability reporting, so unavailable features are not falsely represented as supported.

### 10.3 Replaceability

**Approved:** Major components should be replaceable through stable interfaces where doing so provides real value. Prioritize:
- Brain/model provider adapter.
- STT and TTS adapters.
- Memory storage/retrieval boundary.
- Tool/integration interfaces.

Do not abstract every small function. Not all providers support the same capabilities; interfaces must represent shared and optional capabilities honestly. Any provider/model replacement must be tested before becoming the default.

## 11. Performance, Reliability, and Hardware Constraints

The current primary machine is reported as:
- Lenovo LOQ 15ARP10E.
- 16 GB RAM.
- 512 GB SSD.
- NVIDIA RTX 3050 with 6 GB VRAM.
- AMD Ryzen 5 7535HS processor;
- Microsoft Office 2024 lifetime license, as reported by the owner.

Treat these specifications as user-reported. Hardware capability is a constraint, not a reason to install every possible tool or model.

Principles:
- Benchmark candidate models and workflows on the actual laptop before committing.
- Account for model weights, context/KV cache, runtime overhead, UI, browser, and other concurrent processes when estimating RAM/VRAM.
- Do not assume a model will fit comfortably based only on its parameter count.
- Keep the UI responsive and avoid unnecessary heavy concurrent workloads.
- Monitor temperature, memory, GPU usage, storage, and power behavior during demanding tests.
- Set concrete resource budgets after measurement, not by guessing in Phase 0.
- Use timeouts, cancellation, bounded retries, and safe failure handling for long-running tasks.
- Remote failures should not disable local capabilities that do not depend on the remote service.

## 12. Provisional Technology Inventory

This list is for planning only. It is not an instruction to install everything now, and it does not imply that any provisional tool has been selected permanently. Verify current compatibility, licensing, maintenance, security, and resource requirements before adoption.

### Likely foundational tools
- **Windows 11** — main operating system.
- **Python** — likely primary language for AI and orchestration.
- **Node.js LTS + npm** — JavaScript/TypeScript UI tooling.
- **Git + a private GitHub repository** — source control and off-device code backup.
- **VS Code or Cursor** — choose a primary editor; avoid duplicating tools without a clear reason.
- **PowerShell / Windows Terminal** — shell and environment management.
- **Python `venv` + `pip`** — isolate project dependencies.

### Candidates for later evaluation
- **Ollama or llama.cpp** — local LLM runtime; benchmark before selecting.
- **SQLite** — candidate starting point for local structured memory.
- **FastAPI + Pydantic** — possible application API and schema validation.
- **React + TypeScript + Vite** — candidate UI stack.
- **faster-whisper and a suitable local TTS engine** — candidates for speech phases.
- **pytest and Ruff** — Python testing, linting, and formatting.
- **Postman** — API inspection/testing if an API workflow is needed.
- **VRM/VRoid tooling, Three.js, and Krita** — candidates for later visual work.
- **Jev AI** — external decision-support tool for important project decisions. It is not part of Stella's runtime architecture.

### Installation rule
Install only what the current phase needs. Keep a verified inventory of versions and installation sources later, avoid untrusted installers and scripts, and do not disable security protections to force compatibility.

## 13. Decision Records

### ADR-001 — Laptop-hosted core
**Status:** Approved.  
**Decision:** Stella's primary system runs on the laptop. A phone is a future external integration target, not the host for the core system.  
**Rationale:** Supports local-first operation, a coherent primary system, and control over local resources.  
**Consequences:** Must plan for laptop hardware limits, backups, local security, and graceful behavior when remote services are unavailable.

### ADR-002 — Direct structured calls initially
**Status:** Approved.  
**Decision:** Use direct structured calls across documented interfaces initially; do not start with microservices or a message broker.  
**Rationale:** Lower initial complexity and easier debugging.  
**Consequences:** Define contracts, task lifecycle, errors, timeouts, cancellation, and safe retry behavior before interfaces become widely used.

### ADR-003 — Independent authorization
**Status:** Approved.  
**Decision:** The tool gateway independently enforces permissions. The brain cannot authorize or bypass its own actions. Unknown actions default to denial.  
**Rationale:** Prevents model output from becoming unrestricted authority.  
**Consequences:** Every integration must declare its capabilities, scope, and authorization requirements.

### ADR-004 — Replaceable major components
**Status:** Approved.  
**Decision:** Define stable interfaces around major replaceable capabilities without abstracting every small function.  
**Rationale:** Models and providers change; the application should not be tightly coupled to one provider.  
**Consequences:** Contracts must account for provider-specific capabilities and replacements must be tested.

### ADR-005 — Hybrid memory policy
**Status:** Approved direction.  
**Decision:** Routine non-sensitive memories may be saved automatically within limits; sensitive persistent memories require explicit consent. Users should be able to inspect, correct, and delete stored memories.  
**Rationale:** Balance usability with privacy and control.  
**Consequences:** Categories, retention, backups, indexes, and deletion behavior need precise contracts later.

### ADR-006 — Staged, intelligence-first development
**Status:** Approved.  
**Decision:** Prioritize a small reliable core and reasoning foundations, keep a minimal usable interface, and add richer visuals, speech, tools, and agents incrementally.  
**Rationale:** Reduces technical debt and validates the core before broadening scope.  
**Consequences:** Each stage needs explicit acceptance criteria and a working end-to-end path.

## 14. Important Decisions Still Open

These are intentionally not finalized in Phase 0:

- Exact local LLM, quantization, context size, and inference runtime.
- Whether and when to use cloud LLM APIs, and which providers.
- Final database and memory-retrieval implementation, including whether vector search is necessary at the start.
- Exact embedding model and indexing approach.
- STT/TTS engines and audio lifecycle design.
- Final UI framework and the technical approach for character rendering/animation.
- Exact tool catalog, permission categories, and confirmation policy by action type.
- Memory sensitivity taxonomy, retention periods, backup strategy, and deletion semantics.
- Whether an agent framework is necessary after initial workflows exist.
- Final package versions and installation schedule.
- Concrete Phase 0.5 contracts and acceptance tests.

Important choices should be supported by evidence and small tests where possible. For major decisions, the owner may consult Jev AI as an external decision-support service: prepare explicit alternatives, constraints, criteria, outcomes, and costs; then critically evaluate its output. Jev's probability estimates are not guarantees and should not be treated as verified facts.

## 15. Phase 0 Exit Criteria

Phase 0 may be considered complete after the owner has reviewed and approved this document and the following are clear enough to guide contract design:

- [ ] Stella's identity, product philosophy, and long-term vision are understood.
- [ ] Initial-release direction is distinct from the long-term roadmap.
- [ ] Laptop-hosted core and future external-device boundaries are clear.
- [ ] Major component responsibilities and the conceptual data flow are understood.
- [ ] Brain, orchestrator, and tool gateway have distinct responsibilities.
- [ ] Local-first and remote-service expectations are documented.
- [ ] Memory, consent, privacy, credentials, and deletion principles are recorded.
- [ ] Authorization, confirmation, least privilege, and honest execution reporting are recorded.
- [ ] Initial communication style and component-replacement principles are recorded.
- [ ] Hardware constraints and the provisional technology inventory are recorded without overcommitting.
- [ ] Deferred choices and open questions are visible.
- [ ] The owner has independently read, challenged, and edited the draft as needed.

## 16. Instructions for Future AI / Coding Agents

Before proposing work:
1. Read this document and identify the relevant phase.
2. State which approved decisions your proposal relies on.
3. Separate facts, assumptions, proposals, and unresolved questions.
4. Do not silently alter approved decisions or expand scope.
5. Prefer the smallest implementation that satisfies the current phase.
6. Never weaken security, consent, authorization, or data protection for convenience.
7. Do not install tools, download models, run commands, change system settings, or modify files without the owner's appropriate direction and review.
8. Explain material trade-offs and migration costs.
9. Add tests for behavior and failure paths where applicable.
10. Update project documentation when an approved decision changes, including the reason and consequences.

## 17. Change Log

- **v0.1:** Initial Phase 0 draft assembled from architecture discussions. Pending the owner's independent review.
