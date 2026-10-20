# Stella Architecture — Integration Contracts & Boundary Specifications

**Document Version:** 1.0.0  
**Status:** Architectural Specification & Proposal  
**Date:** 2026-10-18  
**Scope:** Integration Boundaries for Desktop Shell, UI, and Upcoming Python Brain Subsystem  
**Root Path:** `C:\Projects\Stella`

---

## 1. Classification & Status Key

To maintain strict architectural discipline and avoid blurring existing code with future plans, all contracts and interfaces in this document are categorized into one of three tiers:

- `[EXISTING]` — Verifiable in existing, working source code. Includes file paths and line numbers.
- `[APPROVED DECISION]` — Formally decided in Phase 0 ([`docs/roadmap/PHASE_0.md`](file:///c:/Projects/Stella/docs/roadmap/PHASE_0.md)), Phase 0.5 ([`docs/roadmap/PHASE_0_5.md`](file:///c:/Projects/Stella/docs/roadmap/PHASE_0_5.md)), or Phase 1 ([`docs/roadmap/PHASE_1.md`](file:///c:/Projects/Stella/docs/roadmap/PHASE_1.md)).
- `[PROPOSED]` — Concrete contract proposals designed for the upcoming Python brain milestone, awaiting owner review and approval before implementation.

---

## 2. Boundary 1: TypeScript Frontend ↔ Electron Main / Preload

### 2.1 Existing Contracts `[EXISTING]`

The existing desktop API is exposed to the renderer via `contextBridge` in [`electron/preload.cjs`](file:///c:/Projects/Stella/electron/preload.cjs#L10-L66) and typed in [`src/types/desktop.d.ts`](file:///c:/Projects/Stella/src/types/desktop.d.ts#L4-L17).

```typescript
// [EXISTING] src/types/desktop.d.ts
export type PresentationMode = 'workspace' | 'companion-overlay';
export type WindowType = 'main' | 'companion';

export interface StellaDesktopAPI {
  isElectron: boolean;
  windowType: WindowType;
  getPresentationMode: () => Promise<PresentationMode>;
  setPresentationMode: (mode: PresentationMode) => Promise<{ success: boolean; mode: PresentationMode }>;
  openCompanionOverlay: () => Promise<{ success: boolean; mode: PresentationMode }>;
  returnToWorkspace: () => Promise<{ success: boolean; mode: PresentationMode }>;
  onPresentationModeChanged: (callback: (mode: PresentationMode) => void) => () => void;
  onPauseRendering: (callback: () => void) => () => void;
  onResumeRendering: (callback: () => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}
```

#### Existing IPC Channels:
- `stella:get-presentation-mode` (invoke -> handle)
- `stella:set-presentation-mode` (invoke -> handle, validated against `ALLOWED_MODES`)
- `stella:window-minimize` (send -> on)
- `stella:window-maximize` (send -> on)
- `stella:window-close` (send -> on)
- `stella:presentation-mode-changed` (webContents.send push event)
- `stella:pause-rendering` (webContents.send push event)
- `stella:resume-rendering` (webContents.send push event)

---

### 2.2 Proposed Brain Bridge Extension `[PROPOSED]`

When the standalone Python brain is ready for desktop integration, the frontend should communicate with it **through Electron's secure preload bridge**, preserving context isolation and sandboxing:

```typescript
// [PROPOSED] Future extension to StellaDesktopAPI in desktop.d.ts
export interface BrainSessionStatus {
  state: 'offline' | 'initializing' | 'standby' | 'thinking' | 'speaking' | 'error';
  modelId: string | null;
  vramUsageBytes?: number;
  activeTaskId?: string | null;
}

export interface ChatMessageRequest {
  requestId: string; // UUIDv4
  text: string;
  sessionContext?: {
    activePlanetId?: string;
    presentationMode: PresentationMode;
  };
}

export interface ChatStreamChunk {
  requestId: string;
  chunkType: 'text_delta' | 'expression_hint' | 'motion_hint' | 'done'; // 'thought_delta' removed; raw/unvalidated model thoughts are never exposed
  deltaText?: string;
  expressionName?: 'neutral' | 'happy' | 'sad' | 'angry' | 'playful';
  motionId?: string; // e.g. 'VRMA_02'
  finishReason?: 'stop' | 'length' | 'cancelled' | 'error';
  error?: string;
}

export interface ExtendedStellaDesktopAPI extends StellaDesktopAPI {
  // Direct Request/Response
  getBrainStatus: () => Promise<BrainSessionStatus>;
  sendChatMessage: (request: ChatMessageRequest) => Promise<{ accepted: boolean; requestId: string }>;
  cancelChatMessage: (requestId: string) => Promise<boolean>;

  // Events (One-way status & streaming updates)
  onBrainStatusChanged: (callback: (status: BrainSessionStatus) => void) => () => void;
  onChatMessageChunk: (callback: (chunk: ChatStreamChunk) => void) => () => void;
}
```

---

## 3. Boundary 2: Electron Application Shell ↔ Python Brain Process

### 3.1 Transport Trade-Off Analysis `[APPROVED DECISION: ADR-002]`

Phase 0 ADR-002 approves **direct structured calls within the laptop** without a message broker (RabbitMQ/Kafka/Redis) or multi-agent microservice networks.

Below is the objective trade-off evaluation of transport options for connecting the Electron main process to the local Python brain process:

| Transport Mechanism | Security Boundary | Memory / CPU Overhead | Process Lifecycle Coupling | Independent Testability | Complexity |
|---|---|---|---|---|---|
| **Option A: Stdio with Framed JSON-RPC 2.0 / NDJSON** | **Highest:** Private OS pipe, no network port opened, immune to local port sniffing. | **Lowest:** Direct stream piping, zero network stack overhead. | **Tightest:** Child process stdio automatically closes if Electron crashes; OS terminates zombie Python. | **Medium:** Tested via stdin/stdout pipe mock scripts or test drivers. | **Low:** Node `child_process.spawn` handles pipes natively. |
| **Option B: Localhost HTTP/REST + SSE (e.g. FastAPI on 127.0.0.1)** | **Medium:** Needs loopback bind (`127.0.0.1`) + shared secret token to block unauthorized local processes. | **Low–Medium:** Small HTTP server runtime overhead (Uvicorn / FastAPI). | **Loose:** Risk of orphaned Python daemon keeping 6 GB VRAM allocated if Electron exits abruptly. | **Highest:** Trivial to test with `curl`, `pytest`, Postman, or Python CLI before UI integration. | **Low–Medium:** Requires dynamic free port negotiation (`EADDRINUSE` handling). |
| **Option C: Localhost WebSockets** | **Medium:** Same loopback & auth token considerations as HTTP. | **Medium:** Persistent socket connection and framing overhead. | **Loose:** Requires heartbeat ping/pong to avoid zombie processes. | **High:** Testable with standard WebSocket clients. | **Medium:** Bidirectional state machine management needed. |
| **Option D: Windows Named Pipes (`\\.\pipe\stella_brain`)** | **High:** Windows DACL permission security, no network port. | **Low:** Fast OS-level IPC. | **Tight:** Pipe broken events signal parent exit. | **Low–Medium:** Windows-specific; more cumbersome to test in cross-platform CLI tools. | **Medium–High:** Platform-specific Python win32 bindings required. |

#### Architectural Recommendation & Implementation Boundary:
1. **Decouple Brain Domain Logic from Transport:** The Python brain core must be built as pure in-process domain services with Pydantic request/response models and a standalone CLI/pytest test harness (`brain/main.py`), knowing nothing about HTTP, Electron, or frontend UI.
2. **Step 3.1 Initial Scope:** Step 3.1 implements pure in-process domain models, the state machine, and a standalone CLI test driver. All external transport layers (FastAPI, localhost HTTP daemon, Electron IPC bridge) and UI integrations are explicitly **deferred** until the standalone brain is verified.
3. **Integration Step (Deferred):** When integration is scheduled, Electron can either communicate with the domain runner via a private OS pipe (Option A: stdio JSON-RPC) or an authenticated loopback endpoint (Option B).

---

### 3.2 Wire Envelope Specification `[PROPOSED]`

All inter-process messages between Electron and the Python brain must conform to a versioned JSON envelope:

```json
{
  "$schema": "https://stella.local/schemas/v1/envelope.json",
  "version": "1.0",
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "type": "request",
  "topic": "conversation.turn",
  "timestamp": "2026-10-18T15:00:00.000Z",
  "payload": {}
}
```

#### Envelope Validation Rules:
- `version`: Required. Must match semantic major version (`"1.0"`).
- `id`: Required UUIDv4.
- `correlation_id`: Optional for initial requests; required for all subsequent responses, chunks, and events.
- `type`: Must be one of `"request"`, `"response"`, `"event"`, or `"error"`.
- `topic`: Semantic routing string (`<subsystem>.<action>`).
- `timestamp`: ISO 8601 UTC timestamp.

---

### 3.3 Core Request / Response Schemas `[PROPOSED]`

#### `brain.initialize`
- **Direction:** Electron -> Brain
- **Purpose:** Health check, hardware capability query, model loading confirmation.
- **Request Payload:**
  ```json
  {
    "client_version": "0.1.0",
    "requested_model_profile": "local_standard"
  }
  ```
- **Response Payload:**
  ```json
  {
    "status": "ready",
    "engine": "ollama",
    "model_name": "huihui_ai/Hermes-3-Llama-3.2-abliterated",
    "context_window_size": 4096,
    "vram_allocated_bytes": 4529848320,
    "tools_available": ["system_info", "memory_vault"]
  }
  ```
  *(Note: `model_name` is configurable via runtime settings. Current provisional baseline: `huihui_ai/Hermes-3-Llama-3.2-abliterated`. Do not download or pull alternative models. `context_window_size` is a configurable initial estimate).*

#### `conversation.turn`
- **Direction:** Electron -> Brain
- **Purpose:** Submit user input and initiate an orchestrated assistant turn.
- **Request Payload:**
  ```json
  {
    "turn_id": "turn-101",
    "user_input": "Hello Stella, how are you today?",
    "input_mode": "text",
    "active_workspace": "yuki",
    "max_response_tokens": 512,
    "temperature": 0.7
  }
  ```
- **Response Chunks (Streamed Events):**
  *(Note: UI streaming and action proposal event streaming are deferred until integration planning. Step 3.1 operates strictly in-process with validated structured response returns).*
  ```json
  {
    "turn_id": "turn-101",
    "chunk_type": "text",
    "text_delta": "Hello! It is wonderful to see you."
  }
  ```
  ```json
  {
    "turn_id": "turn-101",
    "chunk_type": "expression_hint",
    "expression": "happy",
    "confidence": 0.85
  }
  ```

#### `conversation.cancel`
- **Direction:** Electron -> Brain
- **Purpose:** Request immediate abort of active model inference.
- **Request Payload:**
  ```json
  {
    "turn_id": "turn-101",
    "reason": "user_cancelled"
  }
  ```
- **Response Payload:**
  ```json
  {
    "turn_id": "turn-101",
    "status": "aborted",
    "tokens_generated": 14
  }
  ```

---

## 4. Boundary 3: Brain Core ↔ Local LLM Adapter

### 4.1 Approved Principles `[APPROVED DECISION: ADR-004, Hardware Constraints]`
- **Replaceability:** The LLM adapter must be replaceable (e.g. swap Ollama for llama.cpp) without modifying the conversation orchestrator or memory subsystem.
- **Hardware Budget:** Hardware constraint: RTX 3050 with 6 GB VRAM. Model weights, KV cache, WebGL renderers, and Electron combined must not exceed 5.5 GB VRAM to avoid driver fallback to slow system RAM paging.

### 4.2 Proposed Internal Python / Pydantic Contract `[PROPOSED]`

```python
# [PROPOSED] brain/adapters/llm/contracts.py
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum

class Role(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"

class ChatMessage(BaseModel):
    role: Role
    content: str
    name: Optional[str] = None

class LLMGenerationParams(BaseModel):
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    max_tokens: int = Field(default=512, ge=1, le=4096)
    stop_sequences: List[str] = Field(default_factory=list)

class LLMChunk(BaseModel):
    delta_text: str = ""
    # thought_delta: Removed. Unvalidated internal model thoughts must never be streamed.
    finish_reason: Optional[Literal["stop", "length", "tool_calls", "cancelled", "error"]] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None

class LLMAdapterError(Exception):
    def __init__(self, category: Literal["OUT_OF_VRAM", "TIMEOUT", "ENGINE_OFFLINE", "CONTEXT_OVERFLOW"], message: str):
        super().__init__(message)
        self.category = category
```

---

## 5. Boundary 4: Brain Core ↔ Memory Subsystem

### 5.1 Approved Principles `[APPROVED DECISION: ADR-005]`
- **Hybrid Memory Policy:**
  1. Routine, non-sensitive context is saved automatically within bounded rules.
  2. Sensitive persistent memories require **explicit user consent** before persistence.
  3. Relevance-based retrieval: Never load the entire memory vault into every prompt.
  4. User inspection, correction, and deletion must be supported.
  5. Credentials, passwords, and API keys must never be stored in personal memory.

### 5.2 Proposed Pydantic Memory Contracts `[PROPOSED]`

```python
# [PROPOSED] brain/memory/contracts.py
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

class MemorySensitivity(str, Enum):
    ROUTINE = "routine"       # General preferences, project topics (auto-save allowed)
    SENSITIVE = "sensitive"   # Intimate personal facts, health, location, secrets (requires user consent)

class StoredMemory(BaseModel):
    id: str
    category: str             # e.g., "preference", "fact", "project", "milestone"
    sensitivity: MemorySensitivity
    content: str
    relevance_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime

class MemoryRecallRequest(BaseModel):
    query_text: str
    max_results: int = Field(default=5, ge=1, le=20)
    workspace_filter: Optional[str] = None
    min_relevance_threshold: float = Field(default=0.65, ge=0.0, le=1.0)

class MemoryWriteProposal(BaseModel):
    category: str
    sensitivity: MemorySensitivity
    proposed_content: str
    rationale: str
    requires_consent: bool
```

---

## 6. Boundary 5: Brain Core ↔ Authorized Tool Gateway

### 6.1 Approved Security Principles `[APPROVED DECISION: ADR-003, Section 9]`
- **The Brain Cannot Authorize:** Natural-language model output is untrusted. The brain may only *propose* an action.
- **Independent Policy Enforcement:** The tool gateway independently evaluates arguments, permissions, and scopes.
- **Default to Deny:** Any unknown, unconfigured, or out-of-scope action is denied immediately.
- **Confirmation Binding:** User confirmation applies strictly to the specific action and exact arguments. If arguments change, fresh confirmation is mandatory.

### 6.2 Proposed Tool Action Contracts `[PROPOSED]`

```python
# [PROPOSED] brain/gateway/contracts.py
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, Literal
from uuid import UUID

class ToolActionProposal(BaseModel):
    proposal_id: UUID
    turn_id: str
    tool_name: str
    parameters: Dict[str, Any]
    rationale: str
    requested_scope: str

class UserConfirmationPrompt(BaseModel):
    prompt_id: UUID
    proposal_id: UUID
    tool_name: str
    human_readable_summary: str
    affected_targets: List[str]
    parameters_display: Dict[str, str]
    risk_tier: Literal["low", "medium", "high", "consequential"]

class ToolExecutionResult(BaseModel):
    proposal_id: UUID
    status: Literal["success", "denied", "failed", "cancelled"]
    output_data: Optional[Dict[str, Any]] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    execution_duration_ms: float

class UserConfirmationDecision(BaseModel):
    prompt_id: UUID
    proposal_id: UUID
    decision: Literal["approved", "denied"]
    parameter_digest: str  # SHA-256 digest of canonicalized action parameters
    decision_timestamp: datetime

#### 6.2.1 Confirmation Validation Security Rules:
- **Untrusted Client Inputs:** Client-supplied `prompt_id`, `proposal_id`, `parameter_digest`, and `decision_timestamp` are strictly untrusted inputs.
- **Gateway Verification Requirements:** Upon receiving a `UserConfirmationDecision`, the Permission Gateway must independently verify:
  1. An outstanding matching confirmation prompt exists in active state.
  2. The exact proposed action and canonicalized parameters match the recorded prompt digest.
  3. The prompt has not expired (TTL enforcement).
  4. Authorization is valid under active system policy.
  5. Single-use replay protection: once consumed or rejected, the prompt is invalidated immediately.
- **Client Nonce Prohibition:** The client must **never** mint or decide its own trusted authorization nonce. The gateway alone generates and manages internal authorization state and execution tokens.
```

---

## 7. Cross-Cutting Contract Rules

### 7.1 Timeouts and Cancellation Lifecycle `[APPROVED DECISION: PHASE 0.5]`
1. **Operation-Specific Timeouts:**
   - Quick metadata/status queries: 2.0 seconds timeout.
   - Local LLM prompt generation: 30.0 seconds timeout before streaming starts; 90.0 seconds maximum turn duration.
   - Tool execution: Bound to specific tool policy (default: 15.0 seconds).
2. **Cancellation Token Propagation:**
   - When the user cancels via UI or presses Escape, the cancellation token propagates down: Electron IPC -> Python Brain -> Local LLM Adapter -> Tool Gateway.

### 7.2 Structured Error Classification `[PROPOSED]`

All error payloads across process boundaries must use this standardized format:

```json
{
  "error": {
    "domain": "LLM_INFERENCE",
    "code": "OUT_OF_VRAM",
    "message": "GPU memory budget exceeded (allocated 5.8 GB / 6.0 GB limit).",
    "retryable": false,
    "details": {
      "allocated_bytes": 5872025600,
      "budget_bytes": 6000000000
    }
  }
}
```

Standard error domains:
- `SYSTEM` — Process lifecycle, OS pipe, network bind issues.
- `LLM_INFERENCE` — Model missing, out of VRAM, context length exceeded, engine timeout.
- `MEMORY` — Database lock, query syntax, consent rejected.
- `GATEWAY_AUTH` — Unauthorized action, permission denied, invalid arguments, scope violation.

### 7.3 Redacted Logging & Sensitive-Data Scrubbing `[APPROVED DECISION: PHASE 0.5]`
- **No Credentials in Logs:** API keys, passwords, bearer tokens, and session secrets must be scrubbed using regex masking (`[REDACTED]`) before emitting to console or log files.
- **Prompt Content Masking:** Logs must record operation metadata (turn ID, token count, duration, status) rather than the raw user conversation text or persistent personal memories.
