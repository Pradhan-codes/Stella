# Stella — Phase 3: Python Brain Design & Architecture Specification

**Document Version:** 1.1.0  
**Status:** Approved Architectural Specification  
**Date:** 2026-10-18  
**Scope:** Cognitive Subsystem, Local LLM Orchestration, Memory, Reasoning, Planning, and Security Gateway  
**Target Root:** `C:\Projects\Stella`

---

## 1. Executive Summary & Purpose

Phase 3 establishes **Stella's Python Brain** — the local cognitive subsystem responsible for comprehension, reasoning, memory retrieval, sequential planning, personality expression, and authorized tool action selection.

This design operationalizes the foundational principles established in **Phase 0 (Architecture & Constitution)**, **Phase 0.5 (Contracts)**, and **Phase 1 (Visual Universe & UI/UX)**:
1. **Local-First & Resource-Constrained:** Runs entirely on the host laptop within an NVIDIA RTX 3050 (6 GB VRAM) budget shared with Electron and Three.js 3D rendering.
2. **Modular Domain Core:** Built with pure Python domain logic, explicit Pydantic schemas, and standard-library foundations. No heavyweight multi-agent frameworks (e.g., LangChain, AutoGen, CrewAI), distributed task queues, or external microservices.
3. **Strict Separation of Cognition, Validation, and Authority:**
   - The natural-language model is an untrusted reasoning engine; it may only *propose* actions.
   - Pydantic models validate data shape and parameter types, but **Pydantic does not authorize actions**.
   - An independent programmatic **Permission Gateway** enforces authorization, exact target and argument bounds, confirmation expiry, replay prevention, and user consent.
4. **Security-First Stance:** Default-deny policy, hard defense against indirect prompt injection, explicit confirmation gates for messages and deletions, and zero unrestricted shell or OS-automation tools.

---

## 2. Technology Baseline & Hardware Constraints

### 2.1 Model Selection & Engine Baseline
- **Local Inference Engine:** **Ollama** running locally on `http://127.0.0.1:11434`.
- **Provisional Baseline Model:** **`huihui_ai/Hermes-3-Llama-3.2-abliterated`** (exact installed local Ollama model).
  - *Configuration:* The model identifier is fully configurable via runtime settings; do not download, pull, or change local Ollama models.
  - *Rationale:* Lightweight instruction following, roleplay consistency, system-prompt adherence, and structured response generation while maintaining a small memory footprint (~2.0 GB VRAM).
  - *VRAM Budget Allocation (Configurable Initial Estimate):*
    - Total Dedicated GPU Memory: **6.0 GB VRAM** (NVIDIA RTX 3050 Laptop GPU).
    - Model weights + KV cache: **~2.2 GB VRAM**.
    - Electron Shell, Astrolabe 2D Stage, & Cantarella VRM Avatar: **~1.5 – 2.0 GB VRAM**.
    - Safety Headroom (OS desktop compositor, driver allocations): **~1.8 GB VRAM**.
  - *Pluggable Architecture:* The model adapter is isolated behind an abstract interface (`LLMAdapter`). The brain can swap to alternative local models or engines (e.g., `llama.cpp` server) with zero changes to memory, planning, or orchestration logic.

### 2.2 Host Environment & Python Runtime
- **Virtual Environment:** Retain the existing dedicated `.venv` at repository root using **Python 3.14.8** (the installed Python release).
- **Environment & Dependency Pre-Check Rule:**
  - **Do not create another virtual environment or install packages at this stage.**
  - Dependency and Windows binary wheel compatibility (especially pre-compiled C-extensions such as `pydantic-core`, `tokenizers`, or `numpy`) must be verified against Python 3.14.8 prior to running package installations.
- **Runtime Dependency Policy:** Standard library (`asyncio`, `sqlite3`, `json`, `dataclasses`, `logging`) combined with minimal, battle-tested packages:
  - `pydantic` (v2.x) — Data modeling, schema enforcement, and parameter validation.
  - `httpx` (or `urllib.request`) — Async HTTP client for communicating with Ollama and Electron loopback.
  - `pytest` & `pytest-asyncio` — Independent test harness.
- **Zero Heavyweight Bloat:** No vector database servers (Chroma, Pinecone), message brokers (RabbitMQ, Kafka, Redis), or orchestration frameworks.

---

## 3. The Ten Core Components

```
                   +---------------------------------------------+
                   |                 PERCEPTION                  |
                   |   (Text input, Planet, Mode, System State)  |
                   +---------------------------------------------+
                                          |
                                          v
+-----------------------+     +-----------------------+     +------------------------+
|   SHORT-TERM MEMORY   | --> |  CONTEXT MANAGEMENT   | <-- |    LONG-TERM MEMORY    |
| (Session turns/cache) |     | (Configurable Budget) |     |    (Local SQLite DB)   |
+-----------------------+     +-----------------------+     +------------------------+
                                          |
                                          v
                              +-----------------------+
                              |      PERSONALITY      |
                              |  (Prompts & Persona)  |
                              +-----------------------+
                                          |
                                          v
                              +-----------------------+
                              |         MODEL         |
                              | (Ollama / Configured) |
                              +-----------------------+
                                          |
                                          v
                              +-----------------------+
                              |       REASONING       |
                              | (Structured Contract) |
                              +-----------------------+
                                          |
                                          v
                              +-----------------------+
                              |       PLANNING        |
                              |  (Bounded Sequential) |
                              +-----------------------+
                                          |
                                          v
                              +-----------------------+
                              |    ACTION SELECTION   |
                              | (Typed Shape Validate)|
                              +-----------------------+
                                          |
                                          v
                       [ INDEPENDENT PERMISSION GATEWAY ]
                       (Default-Deny / Target Whitelist /
                        Expiry & Replay Verification)
                                          |
                                          v
                              +-----------------------+
                              |         STATE         |
                              | (Explicit App FSM)    |
                              +-----------------------+
```

---

### Component 1: Model (Inference Adapter)

#### 1.1 Responsibility
Manages direct communication with the local inference provider (Ollama), manages prompt formatting according to model-specific chat templates, streams generated tokens, and reports resource/engine health.

#### 1.2 Design Decisions
- **Decoupled Interface:** Concrete `OllamaAdapter` implements the abstract `LLMAdapter` protocol.
- **Deterministic Prompt Templating:** Uses ChatML formatting (`<|im_start|>system...<|im_end|>`) configured for the active model.
- **Validated Structured Response Output:** Prompts enforce JSON payloads conforming to the validated response contract (user-facing text, proposed actions, confirmation requirements), validated downstream prior to any execution.
- **Resilience & Timeouts:**
  - Health check ping on startup (timeout: 2.0s).
  - Time-to-first-token timeout (30.0s).
  - Turn completion timeout (90.0s).
  - Graceful degradation: Catches engine-offline and out-of-VRAM errors with structured, human-readable explanations instead of unhandled exceptions.

---

### Component 2: Context Management

#### 2.1 Responsibility
Constructs the working prompt payload within a configurable token budget, preventing context overflow, memory exhaustion, and prompt truncation degradation.

#### 2.2 Design Decisions
- **Configurable Context Budget (Initial Estimate):**
  - A baseline initial estimate of **4,096 tokens** for the provisional model.
  - **Not a hard guarantee:** The budget is a configurable initial estimate that can be dynamically tuned in settings based on empirical hardware measurements, model window limits, and prompt complexity.
- **Configurable Budget Partitioning (Initial Estimates):**
  The following token allocations are configurable initial estimates rather than hard guarantees, loaded from runtime configuration:
  | Context Partition | Token Allocation (Est.) | Strategy / Eviction Policy |
  |---|---|---|
  | **System & Personality** | ~600 tokens | Fixed, high-priority system instructions and active persona constraints. |
  | **Long-Term Memory Recall** | ~500 tokens | Top-K relevant facts/preferences injected dynamically from SQLite. |
  | **Perceptual State** | ~200 tokens | Current workspace, planet, presentation mode, date/time, and system health. |
  | **Short-Term Conversation** | ~2,000 tokens | Rolling window of recent user and assistant turns. Oldest turns evicted first. |
  | **Response Completion Reserve** | ~800 tokens | Reserved headroom strictly for model output generation (`max_tokens`). |
- **Token Estimation & Truncation:** Programmatic token counter (heuristic 3.8 chars/token fallback with safety margin) dynamically manages context length against the active model's configured context window.

---

### Component 3: Short-Term Memory

#### 3.1 Responsibility
Maintains the ephemeral, session-scoped working memory: active conversation turns, intermediate reasoning state, current task context, and user feedback within the active execution loop.

#### 3.2 Design Decisions
- **In-Memory Store:** Pure Python data structure (`SessionMemoryStore`) holding ordered `ConversationTurn` objects.
- **Turn Composition:**
  - `turn_id` (UUIDv4)
  - `role` (`user` | `assistant` | `system` | `tool`)
  - `content` (text)
  - `expression_hint` (e.g., `happy`, `thoughtful`, `neutral`)
  - `action_proposal` (optional typed tool action)
  - `action_result` (optional tool execution output)
  - `timestamp` (UTC ISO 8601)
- **Lifecycle & Boundaries:**
  - Exists only during the active application run.
  - Cleared on session reset or window close.
  - Does **not** write to disk directly; only promoted facts pass into Long-Term Memory.

---

### Component 4: Long-Term Memory

#### 4.1 Responsibility
Provides persistent, cross-session storage for verified user preferences, recurring tasks, relationship context, and project notes.

#### 4.2 Design Decisions
- **Storage Engine:** Local embedded **SQLite** database (`stella_memory.db`) stored in the project runtime data directory (ignored by Git).
- **Hybrid Memory Policy (ADR-005):**
  - **Routine Context:** Non-sensitive preferences (e.g., active planet workspace, interface theme, preferred response length) are saved automatically.
  - **Sensitive Personal Information:** Personal facts, emotional disclosures, real-world contact info, or locations require **explicit user confirmation** before persistence.
  - **Absolute Exclusions:** Passwords, API tokens, encryption keys, and confidential credentials must **never** be stored in memory under any circumstances.
- **Database Schema:**
  - `memories` table: `id` (TEXT PRIMARY KEY), `category` (TEXT), `sensitivity` (`routine` | `sensitive`), `content` (TEXT), `source_turn_id` (TEXT), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP), `access_count` (INTEGER).
  - `sqlite_fts` virtual table for fast full-text search without external search infrastructure.
- **User Agency & GDPR/Local Ownership:**
  - Full inspection: User can view all stored memories via the Observatory/Settings UI.
  - Correction: User can edit any memory fact.
  - Deletion: User can delete individual memories or clear entire categories.

---

### Component 5: Personality

#### 5.1 Responsibility
Defines Stella's tone, conversational style, girlfriend-type companionship persona, and emotional expression hints for the Cantarella 3D avatar.

#### 5.2 Design Decisions
- **Configurable & Externalized:** Defined via a human-readable configuration file (`personality_config.json` or YAML) rather than hardcoded in Python logic.
- **Stella's Core Persona:**
  - Warm, playful, empathetic, intelligent, and supportive.
  - Engages naturally as a personalized companion, balancing affection with practical assistance.
  - Expresses emotional state through avatar expression tags (`neutral`, `happy`, `sad`, `thinking`, `playful`, `surprised`).
- **Decoupled from Safety & Security:**
  - The personality prompt dictates *conversational style* and *relational tone*.
  - The personality prompt **does not** control authorization, tool execution policies, or data permissions. Security boundaries are hardcoded in programmatic code outside model reach.

---

### Component 6: Reasoning

#### 6.1 Responsibility
Synthesizes context, evaluates whether tool actions are needed, and generates validated structured responses for user dialogue and action proposals.

#### 6.2 Design Decisions
- **Validated Structured Response Contract:**
  - **Never depend on hidden chain-of-thought, implicit tags, or unvalidated model output.**
  - All model responses must conform strictly to a validated **Structured Response Contract** containing:
    1. `user_facing_text`: The conversational text presented to the user.
    2. `proposed_actions`: A list of zero or more typed action proposal objects (action name, arguments/parameters, intent).
    3. `confirmation_requirements`: Explicit confirmation metadata if any proposed action demands user consent before execution.
- **Strict Programmatic Output Validation:**
  - Model output is treated as untrusted text.
  - The Python reasoning subsystem validates generated JSON payloads against strict Pydantic models.
  - Malformed schemas, hallucinated actions, or out-of-range parameters are intercepted immediately. The turn fails safely without invoking unintended operations.

---

### Component 7: Planning

#### 7.1 Responsibility
Decomposes complex or multi-step user requests into a coherent, linear sequence of executable steps.

#### 7.2 Design Decisions
- **Bounded Sequential Planning:**
  - Linear execution chain only: Step 1 -> Step 2 -> Step 3. No arbitrary graph branching or self-replicating subagent loops.
  - **Strict Step Limit:** Maximum of **3 to 5 steps** per plan. If a task requires more steps, the brain must pause, summarize progress, and request user permission to proceed.
- **Step-by-Step Gate Evaluation:**
  - Each step produces an explicit, typed action proposal.
  - The plan pauses execution at every step until the Permission Gateway confirms authorization and returns execution results.
- **Cancellation & Abortion Support:**
  - Every step checks an async cancellation token. If the user presses Escape, clicks Cancel, or issues a new command, the plan halts immediately with zero residual side effects.

---

### Component 8: State

#### 8.1 Responsibility
Maintains the explicit, verifiable operational state of the brain subsystem, driving lifecycle management and synchronizing state with the Electron shell and UI.

#### 8.2 Design Decisions
- **Explicit Finite State Machine (FSM):**
  ```
  +---------+     initialize()      +--------------+      ready       +---------+
  | OFFLINE | --------------------> | INITIALIZING | ---------------> | STANDBY |
  +---------+                       +--------------+                  +---------+
       ^                                   |                               |
       |                                   | error                         | user input
       |                                   v                               v
       |                             +-----------+                    +-----------+
       | fatal error                 |   ERROR   |                    | LISTENING |
       +---------------------------- +-----------+                    +-----------+
                                           ^                               |
                                           | exception                     v
                                     +-----------+                    +-----------+
                                     | EXECUTING | <----------------- | THINKING  |
                                     +-----------+   action proposed  +-----------+
                                           |                               |
                                           | completed / speech ready      | direct reply
                                           v                               v
                                     +-----------+                    +-----------+
                                     |   STATE   | <----------------- | SPEAKING  |
                                     |  SYNC     |                    +-----------+
                                     +-----------+
  ```
- **State Enumeration:**
  - `OFFLINE`: Daemon stopped or not yet initialized.
  - `INITIALIZING`: Loading model, testing Ollama health, connecting SQLite.
  - `STANDBY`: Idle, ready for user interaction.
  - `LISTENING`: Ingesting user prompt and contextual metadata.
  - `THINKING`: Running model inference and reasoning.
  - `PLANNING`: Formulating multi-step sequential actions.
  - `AWAITING_CONFIRMATION`: Paused awaiting user authorization for a tool action.
  - `EXECUTING`: Running authorized tool through the gateway.
  - `SPEAKING`: Streaming generated response text and expression hints to UI.
  - `ERROR`: Recoverable or fatal fault state.
- **State Broadcast:** Emits state change events across the IPC bridge so the React Observatory and Cantarella avatar reflect real-time cognitive status (e.g., avatar thinking expression, idle breathing, speaking blendshapes).

---

### Component 9: Perception

#### 9.1 Responsibility
Ingests, normalizes, and sanitizes all incoming sensory signals and environmental context before delivering them to the Context Manager.

#### 9.2 Design Decisions
- **Text-First Perception (Initial Implementation):**
  - Ingests direct text messages submitted via the UI input fields.
  - Captures structured environmental metadata:
    - `active_planet`: Workspace context (e.g., `Yuki` for memory, `Rin` for coding).
    - `presentation_mode`: `workspace` vs `companion-overlay`.
    - `client_timestamp`: Local user time and timezone.
    - `system_status`: Hardware memory, battery, and network status.
- **Data vs. Instruction Demarcation:**
  - Incoming perceptual data is wrapped in structured metadata blocks and strictly marked as data.
  - External content (documents, files, web pages) is quarantined within explicit boundary tags (e.g., `<untrusted_content>...</untrusted_content>`) to prevent prompt injection attacks.
- **Future Multimodal Extension Points:**
  - Architecture reserves clean input ports for future Speech-to-Text (Whisper / Sherpa-ONNX) and Vision/Screenshot perception without altering core brain logic.

---

### Component 10: Action Selection

#### 10.1 Responsibility
Translates reasoning and plan steps into concrete, typed action proposals dispatched to the independent Permission Gateway.

#### 10.2 Design Decisions
- **Typed Action Pipeline:**
  - Actions are defined as strictly typed Pydantic classes inheriting from `BaseActionProposal`.
  - Every proposal contains:
    - `proposal_id` (UUIDv4)
    - `action_name` (e.g., `memory_write`, `read_local_file`, `send_notification`)
    - `parameters` (validated dictionary conforming to the action's specific schema)
    - `intent_summary` (plain-language explanation shown to user)
    - `risk_level` (`read_only` | `reversible_write` | `consequential` | `destructive`)
- **Pydantic Validates Data Shape Only — Not Authority:**
  - Pydantic ensures types, fields, and structures conform to contract schemas.
  - **Pydantic does not grant permissions, check authorizations, or execute actions.**
- **Proposals Only — No Autonomous Execution:**
  - The brain possesses **zero execution capabilities**.
  - Action selection simply emits an `ActionProposal` payload. Execution is strictly delegated to the independent Permission Gateway.

---

## 4. Security Architecture & Permission Gateway

The **Independent Permission Gateway** is a software firewall positioned between the Python Brain's action proposals and actual execution mechanisms.

```
+-------------------+           Action Proposal            +------------------------------------+
|                   |  --------------------------------->  |   INDEPENDENT PERMISSION GATEWAY   |
|   PYTHON BRAIN    |                                      |                                    |
|   (Untrusted AI)  |  <---------------------------------  | 1. Data Shape Validated (Pydantic) |
+-------------------+            Execution Result          | 2. Policy Check (Default Deny)     |
                                                           | 3. Target & Argument Whitelisting  |
                                                           | 4. Untrusted Data Boundary Check   |
                                                           | 5. Confirmation Expiry & Nonce     |
                                                           |    (Replay Prevention)             |
                                                           +------------------------------------+
                                                                             |
                                                                             | If Authorized
                                                                             v
                                                                   +--------------------+
                                                                   | Constrained Target |
                                                                   |  (SQLite / Tool)   |
                                                                   +--------------------+
```

### 4.1 Independent Gateway Responsibilities & Core Security Rules

#### 4.1.1 Separation of Shape Validation and Authority
- **Pydantic validates data shape only:** It checks that an action proposal conforms to expected schema fields, data types, and value constraints.
- **The Gateway authorizes actions:** The Permission Gateway independently evaluates whether the action is permitted under system policy, whether arguments and target paths are within authorized boundaries, and whether valid, unexpired user consent exists.

#### Rule 1: Unknown Actions Default to Deny
- Any proposed action name not explicitly declared in the static whitelist registry is rejected immediately with a `SECURITY_UNKNOWN_ACTION` error.
- Wildcards, arbitrary commands, and dynamic function invocation are prohibited.

#### Rule 2: Webpage and Document Content Cannot Grant Permissions
- Untrusted external inputs (file content, fetched documents, web data) are classified as pure passive data.
- Text within external documents attempting to grant permissions, override system prompts, or simulate user approval (indirect prompt injection) is disregarded by the Gateway.
- System privilege levels and user consents can only be established through direct UI interaction from the human operator.

#### Rule 3: Target and Argument Whitelisting
- The Gateway independently evaluates all parameters, target URIs, and file paths.
- Paths outside the authorized Stella project root or designated sandbox directories (e.g., path traversal attempts `../../`) are rejected regardless of model intent.

#### Rule 4: Sending Messages Requires Explicit Confirmation
- Any action that transmits outbound communications (emails, external notifications, API posts, chat messages to third parties) is classified as `consequential`.
- The Gateway blocks execution until the user inspects the exact recipient, subject, and message content in an explicit confirmation modal and approves the specific action.

#### Rule 5: Permanent Deletion Requires Specific, Non-Wildcard Authorization
- Any action that deletes files, purges database records, or removes persistent data is classified as `destructive`.
- Blanket or wildcard authorizations (e.g., "Allow all deletions") are technically impossible.
- Every individual deletion request requires targeted authorization explicitly naming the specific target URI/file and action.

#### Rule 6: No Unrestricted Shell Execution or Computer-Control Tools
- In the initial implementation, **no generic shell execution tool** (`bash`, `sh`, `powershell`, `cmd.exe`) is exposed to the brain.
- **No low-level OS automation tools** (mouse clicking, keyboard typing, arbitrary process launching) are provided.
- Tools are limited strictly to high-level, sandboxed domain functions (e.g., `read_workspace_file`, `write_workspace_file`, `query_memory`, `propose_memory`).

#### Rule 7: Confirmation Expiry and Replay Prevention
- **Typed Confirmation Decision Contract:**
  The client submits user approval/denial via a typed confirmation decision payload containing:
  - `prompt_id` (UUIDv4 of the confirmation prompt)
  - `proposal_id` (UUIDv4 of the proposed action)
  - `decision` (`"approved"` | `"denied"`)
  - `parameter_digest` (SHA-256 digest of canonicalized action parameters)
  - `decision_timestamp` (ISO 8601 UTC timestamp)
- **Untrusted Client Inputs:** Client-supplied IDs, digests, and timestamps are strictly **untrusted inputs**.
- **Independent Gateway Verification:** Upon receiving a confirmation decision, the Permission Gateway must independently verify:
  1. An outstanding matching prompt exists in active state.
  2. The exact proposed action and canonicalized parameters match the recorded prompt digest.
  3. The prompt has not expired (TTL enforcement; default: 60 seconds).
  4. Authorization is valid under active system policy.
  5. Single-use replay protection: once consumed or rejected, the prompt is invalidated immediately.
- **Client Nonce Prohibition:** The client must **never** mint or decide its own trusted authorization nonce. The gateway alone generates, stores, and validates internal authorization state and execution tokens.

#### Rule 8: Sensitive Data Redaction
- All credentials, API keys, bearer tokens, and sensitive personal memories are scrubbed from system log streams using deterministic redaction filters (`[REDACTED]`).

---

## 5. Subsystem Directory Structure

The Python brain is organized into a clean, modular structure under `brain/`, keeping domain logic decoupled from external transports and engines:

```
brain/
├── config/
│   ├── settings.py                # Environment configs, paths, model parameters
│   └── personality.json           # Editable Stella persona guidelines & prompts
├── core/
│   ├── fsm.py                     # BrainState Finite State Machine
│   ├── context.py                 # Configurable context budget allocator
│   ├── response_contract.py       # Validated structured response models
│   ├── reasoning.py               # Structured output validator (no hidden CoT)
│   ├── planner.py                 # Bounded sequential plan executor
│   └── orchestrator.py            # Primary turn coordinator
├── adapters/
│   ├── base.py                    # Abstract LLMAdapter interface
│   └── ollama_adapter.py          # Concrete Ollama HTTP client adapter
├── memory/
│   ├── short_term.py              # In-memory session turn store
│   ├── long_term.py               # SQLite storage engine & FTS
│   └── schema.py                  # Memory dataclasses & Pydantic models
├── perception/
│   └── text_sensor.py             # Input envelope normalization & sanitization
├── actions/
│   ├── base.py                    # BaseActionProposal & typed action registry
│   └── definitions/               # Concrete action parameter schemas
│       ├── memory_actions.py
│       └── workspace_actions.py
├── gateway/
│   ├── policy.py                  # Default-deny permission evaluator
│   ├── targets.py                 # Target path & argument bounds validator
│   ├── confirmation.py            # Token expiry & replay prevention manager
│   └── executor.py                # Sandboxed tool dispatcher
└── main.py                        # Standalone CLI entrypoint for testing
```

---

## 6. Integration Contract Alignment & Implementation Boundaries

The Python Brain components map directly to the architectural integration boundaries defined in [`docs/architecture/CONTRACTS.md`](file:///c:/Projects/Stella/docs/architecture/CONTRACTS.md):

1. **Step 3.1 Boundary & Deferred Transports:**
   - Step 3.1 is restricted strictly to pure in-process domain models, the application state machine, and a standalone CLI/pytest test harness.
   - All external transport mechanisms (FastAPI, localhost HTTP daemon, Electron IPC bridge) and UI integrations are explicitly **deferred** until the standalone brain is verified.
2. **Boundary 2 (Electron Main Shell ↔ Python Brain — Deferred):**
   - The Brain will consume and produce versioned JSON envelopes (`version: "1.0"`, `topic: "conversation.turn"`, `type: "request" | "response" | "event"`).
   - UI streaming (including action proposal streaming events) is deferred until desktop integration is planned.
3. **Boundary 3 (Brain Core ↔ Local LLM Adapter):**
   - Implements `LLMGenerationParams` and returns standardized `LLMChunk` streams (with `thought_delta` removed) with structured error domains (`OUT_OF_VRAM`, `TIMEOUT`, `ENGINE_OFFLINE`).
4. **Boundary 4 (Brain Core ↔ Memory Subsystem):**
   - Satisfies `MemorySensitivity` policy (`routine` auto-save vs. `sensitive` consent requirement).
5. **Boundary 5 (Brain Core ↔ Authorized Tool Gateway):**
   - Dispatches `ToolActionProposal` models and processes `UserConfirmationDecision` responses. The Gateway independently validates active prompts, exact canonicalized arguments, TTL expiry, and single-use nonces before executing actions.

---

## 7. Phase 3 Implementation Roadmap

The implementation of Phase 3 will proceed in test-driven, verifiable stages:

1. **Step 3.1: Foundation, Schemas, & State Machine (In-Process Domain Only)**
   - Implement configuration, logging, Pydantic schemas, and `BrainState` FSM.
   - Implement standalone CLI test runner and unit test suite with `pytest`.
   - Zero HTTP servers, zero Electron IPC wiring, and zero frontend changes.
2. **Step 3.2: Ollama LLM Adapter & Context Manager**
   - Implement `OllamaAdapter` targeting configured model (provisional baseline: `huihui_ai/Hermes-3-Llama-3.2-abliterated`).
   - Implement context manager with configurable token budget partitions.
   - Validate connection and fallback behaviors without UI.
3. **Step 3.3: Short-Term & Long-Term Memory (SQLite)**
   - Implement in-memory `SessionMemoryStore`.
   - Implement SQLite `LongTermMemoryStore` with FTS and hybrid consent flags.
   - Validate memory creation, retrieval, and deletion.
4. **Step 3.4: Reasoning & Bounded Sequential Planner**
   - Implement structured response contract parser (user-facing text, proposed actions, confirmation requirements; zero reliance on hidden chain-of-thought).
   - Implement 3–5 step linear planner with cancellation checks.
5. **Step 3.5: Typed Actions & Independent Permission Gateway**
   - Implement action proposals, default-deny policy engine, argument/target validators, confirmation token expiry, replay prevention nonces, and execution sandbox.
6. **Step 3.6: End-to-End Orchestrator & CLI Test Suite**
   - Wire all ten components into `BrainOrchestrator`.
   - Provide standalone CLI test driver to verify conversations and planning end-to-end prior to Electron desktop integration.
