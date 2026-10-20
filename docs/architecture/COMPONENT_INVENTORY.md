# Stella Architecture — Component Inventory

**Document Version:** 1.0.0  
**Status:** Baseline Architectural Audit  
**Date:** 2026-10-18  
**Scope:** Repository State Prior to Python Brain Subsystem Development  
**Root Path:** `C:\Projects\Stella`

---

## 1. Executive Summary & Purpose

This component inventory establishes an evidence-based map of the **Stella** codebase before beginning work on the Python-based brain. Stella is designed as a local-first, privacy-conscious AI companion featuring an Electron desktop shell, a React/TypeScript interface, an Observatory Astrolabe Home, a 3D celestial Universe, an animated Cantarella VRM avatar, and a dedicated desktop companion overlay.

This audit inspects the current repository state, verifies real files and symbols, distinguishes existing implementations from planned designs, and identifies technical debt and integration boundaries.

---

## 2. Global Architectural Status Summary

| Architectural Subsystem | Current Status | Primary Tech Stack | Source of Truth Location |
|---|---|---|---|
| **Electron Desktop Shell** | **Implemented** | Electron 44.8, Node.js CJS | [`electron/main.cjs`](file:///c:/Projects/Stella/electron/main.cjs), [`electron/preload.cjs`](file:///c:/Projects/Stella/electron/preload.cjs) |
| **Presentation & Mode Switching** | **Implemented** | React Context, Custom IPC | [`src/context/PresentationContext.tsx`](file:///c:/Projects/Stella/src/context/PresentationContext.tsx), [`src/App.tsx`](file:///c:/Projects/Stella/src/App.tsx) |
| **Observatory Home UI (2D)** | **Implemented** | React, HTML5 Canvas, SVG | [`src/components/Observatory/`](file:///c:/Projects/Stella/src/components/Observatory/) |
| **3D Celestial Universe** | **Implemented** | React Three Fiber, Three.js, Drei | [`src/components/Universe/`](file:///c:/Projects/Stella/src/components/Universe/) |
| **Cantarella VRM Avatar** | **Implemented** | `@pixiv/three-vrm` 3.5.5 | [`src/components/CompanionPanel/CantarellaAvatar.tsx`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx) |
| **Expression Controller (Phase 2)** | **Implemented** | TypeScript Class, Blendshapes | [`src/components/CompanionPanel/CantarellaExpressionController.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaExpressionController.ts) |
| **Animation Manager (VRMA)** | **Implemented** | `@pixiv/three-vrm-animation` 3.5.5 | [`src/components/CompanionPanel/CantarellaAnimationManager.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAnimationManager.ts) |
| **Procedural Idle Controller** | **Implemented** | TypeScript Class, Three.js math | [`src/components/CompanionPanel/CantarellaIdleController.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaIdleController.ts) |
| **Desktop Companion Overlay** | **Implemented** | Frameless transparent Electron | [`src/components/CompanionOverlay/`](file:///c:/Projects/Stella/src/components/CompanionOverlay/) |
| **Legacy Dashboard UI** | **Orphaned / Inactive** | React (Stitch design draft) | [`src/components/Header/`](file:///c:/Projects/Stella/src/components/Header/), [`src/components/NavigationRail/`](file:///c:/Projects/Stella/src/components/NavigationRail/) |
| **Python Brain Subsystem** | **Planned (Not Started)** | Python, Local LLM | *Not yet created* (clean `.venv` exists) |
| **Memory Subsystem** | **Planned (Not Started)** | SQLite / Vector cache | *Not yet created* |
| **Tool Gateway & Authorization** | **Planned (Not Started)** | Policy Engine | *Not yet created* |

---

## 3. Detailed Component Inventory

### 3.1 Desktop Shell & Process Boundary

#### `ElectronMainProcess`
- **Location:** [`electron/main.cjs`](file:///c:/Projects/Stella/electron/main.cjs)
- **Status:** **Implemented** (with embedded test suite technical debt)
- **Primary Responsibility:** Manages the desktop application lifecycle, single-instance locking via `app.requestSingleInstanceLock()`, creation and geometric placement of windows, inter-window presentation mode transitions, and IPC message routing.
- **What It Must NOT Own:** Model inference execution, avatar rendering logic, tool policy enforcement, or test harness orchestration during normal execution.
- **Main Dependencies:** `electron`, `path`, `http`, `fs`, `screen`.
- **Communication:**
  - Inbound IPC: `stella:get-presentation-mode`, `stella:set-presentation-mode`, `stella:window-minimize`, `stella:window-maximize`, `stella:window-close`.
  - Outbound IPC: `stella:presentation-mode-changed`, `stella:pause-rendering`, `stella:resume-rendering`.
- **Owned State:** `mainWindow` (reference), `companionWindow` (reference), `currentMode` (`'workspace' | 'companion-overlay'`), `isTransitioning` (boolean guard).
- **Coupling & Risks:**
  - Embeds ~820 lines of automated verification code ([lines 351–1177](file:///c:/Projects/Stella/electron/main.cjs#L351-L1177)) directly inside the application entry point.
  - Contains hardcoded developer artifact file paths (`C:\\Users\\Sai\\.gemini\\...`).
  - Probes dev server on port 5173 with an 800ms timeout before falling back to local `dist/index.html`.
- **Disposition:** **Modularize later.** Retain window and lifecycle coordination; extract the verification test suite into a standalone test script under `tests/`.

#### `ElectronPreloadBridge`
- **Location:** [`electron/preload.cjs`](file:///c:/Projects/Stella/electron/preload.cjs)
- **Status:** **Implemented**
- **Primary Responsibility:** Exposes a secure, strictly validated, and narrow API (`window.stellaDesktop`) to renderers via `contextBridge.exposeInMainWorld`.
- **What It Must NOT Own:** Arbitrary Node.js execution, filesystem access, child process execution, or unrestricted IPC forwarding.
- **Main Dependencies:** `electron` (`contextBridge`, `ipcRenderer`).
- **Communication:** Bridges between the DOM `window.stellaDesktop` and `ipcRenderer`.
- **Owned State:** Stateless (checks CLI flag `--window-type=companion` to determine `windowType`).
- **Coupling & Risks:** Validates presentation modes against `ALLOWED_MODES` (`workspace`, `companion-overlay`). No security leaks observed; `nodeIntegration` is `false`, `contextIsolation` is `true`, `sandbox` is `true`.
- **Disposition:** **Remain as-is.** Clean security boundary.

---

### 3.2 Presentation Coordination & Routing

#### `PresentationContext`
- **Location:** [`src/context/PresentationContext.tsx`](file:///c:/Projects/Stella/src/context/PresentationContext.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Coordinates presentation mode and active window type across React component trees. Syncs mode changes with `window.stellaDesktop` IPC and updates document root class tokens (`workspace-active` vs `companion-overlay-active`).
- **What It Must NOT Own:** 3D rendering updates, avatar poses, or model conversation state.
- **Main Dependencies:** React, [`src/types/desktop.d.ts`](file:///c:/Projects/Stella/src/types/desktop.d.ts).
- **Communication:** Listens to `window.stellaDesktop.onPresentationModeChanged`; invokes `window.stellaDesktop.setPresentationMode`.
- **Owned State:** `presentationMode` (`'workspace' | 'companion-overlay'`), `windowType` (`'main' | 'companion'`).
- **Coupling & Risks:** Low risk. Contains browser fallback when running outside Electron.
- **Disposition:** **Remain as-is.**

#### `StellaPresentationManager` (App Root)
- **Location:** [`src/App.tsx`](file:///c:/Projects/Stella/src/App.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Root UI component. Renders isolated [`CompanionOverlay`](file:///c:/Projects/Stella/src/components/CompanionOverlay/CompanionOverlay.tsx) when `windowType === 'companion'`. When `windowType === 'main'`, toggles between [`ObservatoryHome`](file:///c:/Projects/Stella/src/components/Observatory/ObservatoryHome.tsx) and lazy-loaded [`UniverseView`](file:///c:/Projects/Stella/src/components/Universe/UniverseView.tsx).
- **What It Must NOT Own:** Individual planet workspace logic or avatar animation loops.
- **Main Dependencies:** React (`lazy`, `Suspense`, `useState`), [`PresentationContext`](file:///c:/Projects/Stella/src/context/PresentationContext.tsx).
- **Communication:** Passes navigation callbacks (`handleLaunchUniverse`, `handleBackToHome`).
- **Owned State:** `activeNavId` (`'home' | 'universe'`).
- **Coupling & Risks:** In `main` window, hides `ObservatoryHome` via `display: isUniverse ? 'none' : 'contents'` to preserve internal state and astrolabe positions when switching to Universe view.
- **Disposition:** **Remain as-is.**

---

### 3.3 Observatory Home UI (Primary 2D Interface)

#### `ObservatoryHome`
- **Location:** [`src/components/Observatory/ObservatoryHome.tsx`](file:///c:/Projects/Stella/src/components/Observatory/ObservatoryHome.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** The primary 2D sanctuary dashboard. Hosts the 3-column layout: left column (greeting, selected planet info readout), center column ([`AstrolabeStage`](file:///c:/Projects/Stella/src/components/Observatory/AstrolabeStage.tsx)), right column ([`StellaStatePanel`](file:///c:/Projects/Stella/src/components/Observatory/StellaStatePanel.tsx)), top header (brand, status chip, window controls, mode switch), bottom quick-action dock, and modal workspace viewer ([`PlanetWorkspaceModal`](file:///c:/Projects/Stella/src/components/Universe/PlanetWorkspaceModal.tsx)).
- **What It Must NOT Own:** 3D WebGL scenes, direct VRM bone manipulations, or model inference.
- **Main Dependencies:** React, [`StarCanvas`](file:///c:/Projects/Stella/src/components/Observatory/StarCanvas.tsx), [`AstrolabeStage`](file:///c:/Projects/Stella/src/components/Observatory/AstrolabeStage.tsx), [`StellaStatePanel`](file:///c:/Projects/Stella/src/components/Observatory/StellaStatePanel.tsx), [`PlanetWorkspaceModal`](file:///c:/Projects/Stella/src/components/Universe/PlanetWorkspaceModal.tsx), [`observatoryData.ts`](file:///c:/Projects/Stella/src/components/Observatory/observatoryData.ts).
- **Communication:** Triggers desktop mode switch to companion overlay; launches 3D Universe via `onLaunchUniverse`; triggers toast notifications for offline actions.
- **Owned State:** `selectedNodeIndex`, `hoveredNodeIndex`, `toastMessage`, `activeWorkspacePlanet`.
- **Coupling & Risks:** Minor duplication between `OBSERVATORY_NODES` in [`observatoryData.ts`](file:///c:/Projects/Stella/src/components/Observatory/observatoryData.ts) and `PLANETS_DATA` in [`planetData.ts`](file:///c:/Projects/Stella/src/components/Universe/planetData.ts).
- **Disposition:** **Remain as-is.** Highly polished, stable.

#### `AstrolabeStage`
- **Location:** [`src/components/Observatory/AstrolabeStage.tsx`](file:///c:/Projects/Stella/src/components/Observatory/AstrolabeStage.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Central visual stage. Renders an animated SVG celestial coordinate ring (96 astronomical ticks, rotating dashed circles), 8 interactive orbiting planetary workspace nodes, and embeds the Cantarella avatar in portrait framing.
- **What It Must NOT Own:** WebGL rendering loop or avatar blendshape management.
- **Main Dependencies:** React, [`CantarellaAvatar`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx).
- **Communication:** Passes hover and selection events to parent `ObservatoryHome`.
- **Owned State:** Trigonometric tick coordinates (`useMemo`).
- **Coupling & Risks:** None.
- **Disposition:** **Remain as-is.**

#### `StellaStatePanel`
- **Location:** [`src/components/Observatory/StellaStatePanel.tsx`](file:///c:/Projects/Stella/src/components/Observatory/StellaStatePanel.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Right-hand telemetry and diagnostic panel. Displays honest system status (offline standby), collapsible sections for hardware telemetry, companion persona metrics, facial expression test buttons (neutral, happy, sad, angry, playful, shy), fallback gesture triggers (wave, nod), and 8 VRMA animation motion test buttons.
- **What It Must NOT Own:** Hardware sensor polling or VRM animation mixing directly.
- **Main Dependencies:** [`useSystemMonitoring`](file:///c:/Projects/Stella/src/components/Observatory/useSystemMonitoring.ts), [`CantarellaExpressionController`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaExpressionController.ts), [`CantarellaAnimationManager`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAnimationManager.ts).
- **Communication:** Subscribes to `cantarellaExpressionController` and `cantarellaAnimationManager` state changes.
- **Owned State:** `activeTab` (`'system' | 'companion' | 'weather' | null`), `expressionNotice`.
- **Coupling & Risks:** None.
- **Disposition:** **Remain as-is.** Useful testbed for Phase 2 avatar features.

#### `useSystemMonitoring`
- **Location:** [`src/components/Observatory/useSystemMonitoring.ts`](file:///c:/Projects/Stella/src/components/Observatory/useSystemMonitoring.ts)
- **Status:** **Implemented**
- **Primary Responsibility:** Client-side telemetry detection using available web APIs (navigator.hardwareConcurrency, navigator.deviceMemory, WebGL renderer unmasking, Battery API).
- **What It Must NOT Own:** Fabricated or mocked AI performance data.
- **Honest Truthful Reporting Evidence:** Lines 9–13, 22–34 explicitly state `"Offline (Host daemon not connected)"`, `"Offline (Local standby)"`, and `"6 GB Target • Real-time telemetry offline"`. It preserves the truthfulness principle.
- **Disposition:** **Remain as-is.**

---

### 3.4 3D Celestial Universe Subsystem

#### `UniverseView` & `UniverseScene`
- **Location:** [`src/components/Universe/UniverseView.tsx`](file:///c:/Projects/Stella/src/components/Universe/UniverseView.tsx), [`src/components/Universe/UniverseScene.tsx`](file:///c:/Projects/Stella/src/components/Universe/UniverseScene.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Renders the 3D celestial-fantasy universe using `@react-three/fiber` and `@react-three/drei`. Features 8 floating planets along distinct portrait-projected elliptical orbits, crystalline Stella Core, Black Hole nebula, lighting, and camera flight controllers.
- **What It Must NOT Own:** Stella avatar rendering (Phase 1 rule: Stella does NOT appear in the Universe view).
- **Main Dependencies:** `three`, `@react-three/fiber`, `@react-three/drei`, [`planetData.ts`](file:///c:/Projects/Stella/src/components/Universe/planetData.ts).
- **Communication:** `onBackToHome` callback; selection triggers `PlanetWorkspaceModal`.
- **Owned State:** `cameraMode` (`'entering' | 'overview' | 'zoomed' | 'returning'`), `hoveredPlanetId`, `selectedPlanet`, `isWorkspaceOpen`, `isTransitioning`, `reducedMotion`.
- **Coupling & Risks:** Heavy 3D GPU resource usage. Mitigated by lazy loading in `App.tsx` and pausing when in background.
- **Disposition:** **Remain as-is.**

#### `PlanetNode` & `PlanetWorkspaceModal`
- **Location:** [`src/components/Universe/PlanetNode.tsx`](file:///c:/Projects/Stella/src/components/Universe/PlanetNode.tsx), [`src/components/Universe/PlanetWorkspaceModal.tsx`](file:///c:/Projects/Stella/src/components/Universe/PlanetWorkspaceModal.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** `PlanetNode` renders individual 3D planets with procedural canvas textures ([`textures.ts`](file:///c:/Projects/Stella/src/components/Universe/textures.ts)), rings, satellites, and interactive hover glow. `PlanetWorkspaceModal` renders the accessible full-screen workspace view when a planet is clicked.
- **Disposition:** **Remain as-is.**

---

### 3.5 Desktop Companion Overlay

#### `CompanionOverlay`
- **Location:** [`src/components/CompanionOverlay/CompanionOverlay.tsx`](file:///c:/Projects/Stella/src/components/CompanionOverlay/CompanionOverlay.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** The dedicated desktop companion overlay window component. Rendered exclusively in the frameless, transparent, always-on-top companion `BrowserWindow`. Features a draggable mini capsule (`-webkit-app-region: drag`), return to Stella button, minimize button, collapsible reaction tray with expression and motion triggers, and full-framing Cantarella avatar.
- **What It Must NOT Own:** Main dashboard navigation, Universe rendering, or opaque window styling.
- **Main Dependencies:** React, [`PresentationContext`](file:///c:/Projects/Stella/src/context/PresentationContext.tsx), [`CantarellaAvatar`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx), [`CantarellaExpressionController`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaExpressionController.ts), [`CantarellaAnimationManager`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAnimationManager.ts).
- **Communication:** Uses `returnToWorkspace` and `minimizeWindow` from `usePresentation`. Listens to desktop `onPauseRendering` IPC to auto-close trays when hidden.
- **Owned State:** `isTrayOpen`, `activeGesture`, `expressionStatus`, `animationStatus`.
- **Disposition:** **Remain as-is.** Clean, lightweight implementation.

---

### 3.6 Cantarella Avatar & Animation Engine

#### `CantarellaAvatar`
- **Location:** [`src/components/CompanionPanel/CantarellaAvatar.tsx`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx)
- **Status:** **Implemented**
- **Primary Responsibility:** Mounts and manages the Three.js canvas for Cantarella's VRM avatar (`public/models/cantarella.vrm`). Configures camera framing (`full` vs `portrait`), soft celestial lighting (key, fill, rim), and manages the continuous render loop.
- **Resource Management & Laptop Optimization:**
  - **Model Caching:** Module-level caching ([line 26](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx#L26)) reuses the parsed `VRM` instance across component remounts, saving 53MB network/disk refetches and CPU parse overhead.
  - **Visibility Pausing:** Uses `IntersectionObserver` ([line 299](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx#L299)), `document.hidden` ([line 263](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx#L263)), and Electron IPC (`onPauseRendering` / `onResumeRendering`) to completely cancel `requestAnimationFrame` when the avatar is hidden or the window is invisible.
  - **GPU Cleanup:** Fully disposes WebGLRenderer, cancels animation frames, and cleans listeners on unmount ([lines 346–378](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAvatar.tsx#L346-L378)).
  - **Fallback:** Displays SVG [`CelestialAvatar`](file:///c:/Projects/Stella/src/components/CompanionPanel/CelestialAvatar.tsx) while loading or if WebGL fails.
- **Disposition:** **Remain as-is.** Preserves laptop-conscious performance principles.

#### `CantarellaExpressionController`
- **Location:** [`src/components/CompanionPanel/CantarellaExpressionController.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaExpressionController.ts)
- **Status:** **Implemented**
- **Primary Responsibility:** Framework-agnostic controller managing smooth facial expression transitions via VRM blendshapes (`happy`, `sad`, `angry`, `playful` -> `relaxed`). Interpolates weights using cubic ease-in-out curve (`3p^2 - 2p^3`).
- **Honest Model Boundary:** Accurately marks `shy` as unsupported with reason `"cantarella.vrm does not contain a shy/blush blendshape group or morph target"` ([line 73](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaExpressionController.ts#L73)).
- **Blink Conflict Prevention:** Configures `happy` blendshape `overrideBlink = 'block'` so smiling closed eyes are not double-closed by natural blinking.
- **Disposition:** **Remain as-is.**

#### `CantarellaAnimationManager`
- **Location:** [`src/components/CompanionPanel/CantarellaAnimationManager.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaAnimationManager.ts)
- **Status:** **Implemented**
- **Primary Responsibility:** Manages `THREE.AnimationMixer` for Cantarella. Loads and retargets 8 VRMA motion clips (`VRMA_01` to `VRMA_07` and `うでぶんぶん.vrma`) from `public/animations/`.
- **Resting Pose Guard:** Constructs a synthetic rest clip (`_cantarellaRestPose`) with Cantarella's exact normalized A-pose bone quaternions, cross-fading back to rest pose upon animation stop/finish without visual snapping.
- **Disposition:** **Remain as-is.**

#### `CantarellaIdleController`
- **Location:** [`src/components/CompanionPanel/CantarellaIdleController.ts`](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaIdleController.ts)
- **Status:** **Implemented**
- **Primary Responsibility:** Procedural lifelike idle behavior: gentle asymmetric breathing sway (~15.8 bpm), biologically plausible stochastic blinking with randomized intervals (2.5–6.0s) and double-blinks, multi-frequency Lissajous head drift, micro-saccadic eye gaze adjustments towards camera, and safe fallback gestures (wave, nod).
- **Bone Conflict Guard:** Suppresses idle drift (`idleWeight` fades to 0) when an imported VRMA motion is playing ([lines 115–120](file:///c:/Projects/Stella/src/components/CompanionPanel/CantarellaIdleController.ts#L115-L120)).
- **Disposition:** **Remain as-is.**

---

### 3.7 Orphaned / Inactive Legacy Components

During the initial Phase 1 visual exploration, an earlier dashboard layout was drafted based on the Stitch design system. When the project approved the **Observatory Astrolabe Home** design, these earlier components were disconnected from `App.tsx`:

1. [`src/components/Header/Header.tsx`](file:///c:/Projects/Stella/src/components/Header/Header.tsx) (Orphaned navbar with search input)
2. [`src/components/NavigationRail/NavigationRail.tsx`](file:///c:/Projects/Stella/src/components/NavigationRail/NavigationRail.tsx) (Orphaned vertical icon rail)
3. [`src/components/ActivitySection/ActivitySection.tsx`](file:///c:/Projects/Stella/src/components/ActivitySection/ActivitySection.tsx) (Orphaned card list for sample activities)
4. [`src/components/WorkspacesSection/WorkspacesSection.tsx`](file:///c:/Projects/Stella/src/components/WorkspacesSection/WorkspacesSection.tsx) (Orphaned grid of 3 sample workspaces)
5. [`src/components/CompanionPanel/CompanionPanel.tsx`](file:///c:/Projects/Stella/src/components/CompanionPanel/CompanionPanel.tsx) (Orphaned right-column companion card with disabled text input)
6. [`src/data/demoData.ts`](file:///c:/Projects/Stella/src/data/demoData.ts) (Orphaned mock data used by the inactive components above)
7. [`stella-home-observatory.html`](file:///c:/Projects/Stella/stella-home-observatory.html) (Original static HTML/CSS prototype of the Observatory)

- **Known Risk:** Creates developer confusion regarding which dashboard is active; `src/index.css` contains 27KB of styling for these unused components alongside `src/components/Observatory/observatory.css`.
- **Disposition:** **Needs decision.** Mark as inactive/legacy; do not delete during this audit. Recommend archiving or isolating in a future cleanup phase.

---

### 3.8 Future Python Brain & AI Subsystems (Planned)

The following components represent the upcoming milestone and do not currently have code in the repository:

#### `PythonBrainDaemon` (Planned)
- **Intended Location:** `brain/` or `src-python/stella_brain/`
- **Status:** **Planned but not implemented**
- **Intended Responsibility:** Host the local Python runtime, manage conversation session memory, construct prompts with retrieved memories, orchestrate reasoning steps, and produce structured action proposals.
- **Boundary Constraint:** Must NOT execute OS commands directly. Must NOT self-authorize tool actions.

#### `LocalLLMAdapter` (Planned)
- **Intended Location:** `brain/adapters/llm/`
- **Status:** **Planned but not implemented**
- **Intended Responsibility:** Abstraction layer for local LLM inference engines (e.g. Ollama, llama.cpp, or Hugging Face transformers). Manages context windows, token streaming, timeouts, and cancellation.
- **Laptop Hardware Boundary:** Must fit comfortably within the laptop's RTX 3050 (6 GB VRAM) alongside Three.js WebGL and Electron window usage (~1–1.5 GB VRAM combined).

#### `MemorySubsystem` (Planned)
- **Intended Location:** `brain/memory/`
- **Status:** **Planned but not implemented**
- **Intended Responsibility:** Local SQLite-backed storage for persistent user facts, relationship context, and interaction summaries. Enforces hybrid memory policy: routine context saved automatically, sensitive personal memories require explicit user consent. Provides inspection and deletion interfaces.

#### `AuthorizedToolGateway` (Planned)
- **Intended Location:** `brain/gateway/` or `electron/gateway/`
- **Status:** **Planned but not implemented**
- **Intended Responsibility:** Independent policy enforcement engine. Intercepts action proposals from the brain, validates parameters against whitelist schemas, checks action permissions, requests user confirmation for consequential actions, executes within constrained sandbox, and returns structured execution results.

---

## 4. Subsystem Dependency & Communication Flow

```mermaid
graph TD
    subgraph Electron_Shell [Electron Desktop Shell]
        MainProc["electron/main.cjs<br/>(Two-Window Manager)"]
        Preload["electron/preload.cjs<br/>(ContextBridge: window.stellaDesktop)"]
    end

    subgraph Renderer_Main [Main Window Renderer]
        AppRoot["src/App.tsx<br/>(PresentationManager)"]
        ObsHome["src/components/Observatory/<br/>ObservatoryHome.tsx"]
        UnivView["src/components/Universe/<br/>UniverseView.tsx (3D)"]
        ObsHome --> Astrolabe["AstrolabeStage.tsx"]
        ObsHome --> StatePanel["StellaStatePanel.tsx"]
        Astrolabe --> AvatarPortrait["CantarellaAvatar.tsx<br/>(Portrait Framing)"]
    end

    subgraph Renderer_Companion [Companion Window Renderer]
        CompOverlay["src/components/CompanionOverlay/<br/>CompanionOverlay.tsx (Transparent)"]
        CompOverlay --> AvatarFull["CantarellaAvatar.tsx<br/>(Full Framing)"]
    end

    subgraph Avatar_Subsystem [Cantarella Engine (Shared Logic)]
        AvatarPortrait -.-> SharedVRM["Cached VRM Instance<br/>(public/models/cantarella.vrm)"]
        AvatarFull -.-> SharedVRM
        SharedVRM --> ExprCtrl["CantarellaExpressionController<br/>(Blendshapes)"]
        SharedVRM --> AnimMgr["CantarellaAnimationManager<br/>(VRMA Mixer)"]
        SharedVRM --> IdleCtrl["CantarellaIdleController<br/>(Blink, Breathe, LookAt)"]
    end

    subgraph Future_Python_Subsystem [Future Python Subsystem (Planned)]
        BrainDaemon["Python Brain Daemon<br/>(Reasoning & Orchestration)"]
        LLMAdapter["Local LLM Adapter<br/>(Ollama / llama.cpp)"]
        MemStore["Memory Subsystem<br/>(SQLite / Vault)"]
        ToolGateway["Tool Gateway & Policy<br/>(Independent Authorization)"]
        
        BrainDaemon --> LLMAdapter
        BrainDaemon --> MemStore
        BrainDaemon --> ToolGateway
    end

    MainProc -->|Creates & Position| Renderer_Main
    MainProc -->|Creates & Position| Renderer_Companion
    Preload -->|IPC Bridge| AppRoot
    Preload -->|IPC Bridge| CompOverlay

    MainProc -.->|Future IPC / RPC| BrainDaemon
```

---

## 5. Architectural Findings & Technical Debt

### Finding 1: Verification Test Suite Embedded in Production Entry Point (Critical)
- **Severity:** Critical
- **Evidence:** [`electron/main.cjs` lines 351–1177](file:///c:/Projects/Stella/electron/main.cjs#L351-L1177) contains `runAutomatedVerification()`, which runs 820 lines of browser DOM automation, VRMA animation testing, screenshot generation, and hardcoded user path writes (`C:\\Users\\Sai\\.gemini\\antigravity-ide\\brain\\...`).
- **Risk:**
  - Inflates production main process file to 49 KB.
  - Risk of unintended test execution or `process.exit(1)` in production.
  - Mixes test automation logic with desktop window lifecycle code.
- **Practical Next Step:** Move `runAutomatedVerification()` out of `electron/main.cjs` into a dedicated test script (`tests/e2e/two_window_verification.cjs`) and add an `npm test` script in `package.json`.

### Finding 2: Inactive / Orphaned Components from Earlier Phase 1 Draft (High)
- **Severity:** High
- **Evidence:** `Header.tsx`, `NavigationRail.tsx`, `ActivitySection.tsx`, `WorkspacesSection.tsx`, `CompanionPanel.tsx`, and `demoData.ts` are unmounted and unused in `App.tsx`.
- **Risk:**
  - High developer confusion regarding active layout.
  - Duplicate CSS in `src/index.css` (27 KB) competing with `observatory.css` (14 KB).
- **Practical Next Step:** Move these components into an `archive/legacy_phase1_draft/` directory or mark them clearly as inactive to keep the active code path clean.

### Finding 3: Lack of Formal Test Runner or Contract Test Suite (High)
- **Severity:** High
- **Evidence:** `package.json` contains zero testing libraries (no `vitest`, `jest`, or `playwright`). Only ad-hoc manual scripts exist in `scratch/`.
- **Risk:** High regression risk when integrating the Python brain. Process boundary contracts cannot be validated automatically.
- **Practical Next Step:** Introduce `vitest` for TypeScript contract schema testing and `pytest` for standalone Python brain testing before integrating the two.

### Finding 4: Python Environment Dependency & Wheel Compatibility Check (Medium)
- **Severity:** Medium
- **Evidence:** The local `.venv` reports `Python 3.14.8`.
- **Risk:** Compatibility of dependencies and availability of pre-compiled Windows C-extension binary wheels (such as `pydantic-core`, `tokenizers`, `numpy`, or `onnxruntime`) must be verified against Python 3.14.8 prior to package installation.
- **Practical Next Step:** Keep the existing `.venv` with Python 3.14.8. Check dependency and Windows binary wheel compatibility before installing packages. Do not create another virtual environment or install packages prematurely.

### Finding 5: Non-ASCII Character in Animation Filename (Medium)
- **Severity:** Medium
- **Evidence:** `public/animations/うでぶんぶん.vrma` and references in `CantarellaAnimationManager.ts` line 87.
- **Risk:** Potential URI decoding and bundling issues across varying operating system encodings.
- **Practical Next Step:** Retain file attribution in `THIRD_PARTY_NOTICES.md` while providing a normalized ASCII alias (`VRMA_EXTRA.vrma` or `vrma_flailing.vrma`).

### Finding 6: Duplicated Planet Metadata Between Observatory and Universe (Medium)
- **Severity:** Medium
- **Evidence:** Planet data is declared separately in [`observatoryData.ts`](file:///c:/Projects/Stella/src/components/Observatory/observatoryData.ts) (Asuna color: `#dcd8ea`) and [`planetData.ts`](file:///c:/Projects/Stella/src/components/Universe/planetData.ts) (Asuna color: `#4ade80`).
- **Risk:** Visual inconsistency when transitioning from Observatory to 3D Universe.
- **Practical Next Step:** Consolidate planet data definitions into a single shared data module.
