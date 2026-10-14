# Stella — Phase 1 Specification
**Status:** Planning complete  
**Project:** Stella, local-first AI companion / “universe OS”  
**Purpose of this document:** Preserve the Phase 1 design decisions and provide a clean handoff to Phase 2.  
**Implementation status:** This document records design decisions only. Phase 1 did not implement the UI, avatar, universe, or runtime behavior.

---

## 1. Phase 1 Goal

Define Stella’s visual direction, universe concept, avatar foundation, and high-level UI/UX interactions before implementation. Phase 0 (Architecture & Constitution) and Phase 0.5 (Contracts) were completed separately. Phase 1 builds on those foundations; it does not replace them.

## 2. Core Experience

Stella will have three related but distinct visual experiences:

1. **Home dashboard:** A colorful, welcoming 2D control center for status, projects, activity, navigation, and the interactive 2D companion stage.
2. **3D companion overlay:** A separate, lightweight floating desktop companion experience. Wake-word activation should reveal this overlay first, regardless of whether the dashboard or universe is currently visible.
3. **3D universe:** An immersive, celestial-fantasy environment used to navigate Stella’s functional areas (“planets”). Stella herself does **not** appear in the universe view.

Keep these experiences visually coherent while allowing each to have its own purpose and mood.

## 3. Universe Architecture & Visual Language

### 3.1 Art direction
- **Theme:** Hybrid celestial fantasy.
- **Mood:** Calm, magical, mysterious, and welcoming—not frightening.
- **Layout:** A structured, readable arrangement of eight floating planets with subtle depth and camera movement. The user can later explore the environment through camera transitions.
- **Centerpiece:** A luminous teal crystalline star combined with a mysterious nebula / black-hole-like formation. Soft fog or smoke swirls around it.
- **Performance principle:** Prioritize a strong atmosphere with restrained effects rather than expensive, continuously simulated effects.

### 3.2 Planet navigation
- Hovering over a planet previews its name, purpose, and relevant agent/system status.
- Clicking a planet enters its workspace.
- Entering the universe from Home uses a cinematic camera-flight transition.
- The initial arrangement should remain organized and easy to understand; immersion must not compromise navigation clarity.

### 3.3 Initial planet map
These names are the current proposals and may be revised during later design or implementation.

| Planet | Primary purpose |
|---|---|
| **Yuki** | Memory |
| **Asuna** | Home and navigation |
| **Rei** | Knowledge and research |
| **Sakura** | Creativity |
| **Rin** | Coding and creation |
| **Hina** | Time and routines |
| **Rem** | Integrations and system status |
| **Akari** | Agents and automation |

Planet names are anime-inspired placeholders; each planet’s visual design should be original rather than copying an existing character or world.

## 4. Planet Interior Design

Each planet should have a distinct visual identity while reusing a common workspace structure.

- **Environment:** A themed 3D setting with a planet-specific palette, lighting mood, and a small number of recognizable visual objects.
- **Workspace:** Reuse shared UI components and navigation patterns across all planets.
- **Scope:** Only one active planet scene should be loaded/rendered at a time where practical.
- **Loading:** Load planet-specific assets lazily when needed.
- **Reuse:** Reuse geometry, materials, textures, and common interface components where possible.
- **Quality controls:** Use adaptive rendering quality and pause or reduce rendering when a scene is hidden or inactive.
- **Lighting/effects:** Prefer baked or inexpensive lighting, restrained particles, simple geometry, and lightweight fog techniques. Avoid costly real-time volumetric fog or unnecessary physics unless later testing justifies them.
- **Validation:** The target development machine includes an NVIDIA RTX 3050 with 6 GB VRAM. This is a design constraint, not a guarantee of performance; measure and optimize during implementation.

## 5. Stella’s Visual Identity & Avatar Foundation

### 5.1 Chosen starting point
- The selected avatar foundation is the **Cantarella VRM model** from the first VRoid Hub candidate supplied during planning.
- The current decision is to use the model **unchanged**.
- Do not edit, redistribute, or use it in ways prohibited by its creator’s stated terms. Verify the current model page and license before downloading or integrating it, as permissions may change or have specific conditions.
- The second candidate was not selected because downloading/usage was unavailable according to the earlier review.

### 5.2 Future validation
During implementation, inspect the chosen VRM for:
- VRM version and compatibility;
- skeleton/humanoid mapping;
- available expressions and blendshapes;
- eye blinking and idle-animation possibilities;
- head/body movement and animation support;
- runtime performance and rendering quality.

These are future tests, not claims that the model has already been integrated or validated.

### 5.3 2D and 3D distinction
- The Home dashboard includes an **interactive 2D companion stage** for 2D animation, speech presentation, and actions.
- The **3D companion overlay** is a separate experience and should not be conflated with the 2D dashboard stage.
- The 3D universe is another separate experience; Stella does not appear in that universe view.

## 6. Home Dashboard UI/UX

### 6.1 Purpose and visual direction
The Home dashboard is Stella’s global control center. It should feel colorful, creative, friendly, and anime-inspired, providing contrast to the darker cosmic universe.

Use a cohesive design language with expressive accent colors (for example, violet, teal, pink, and lavender), rounded surfaces, and restrained glass-like treatments. These are visual directions, not mandatory final color values.

### 6.2 Main navigation
Proposed sidebar destinations:

- Home
- Universe
- Projects
- Memory
- Agents
- Activity
- Settings

The final information architecture and labels can be refined during Phase 2 as implementation details become concrete.

### 6.3 Dashboard content
The dashboard should provide useful at-a-glance information such as:
- recent activity;
- active tasks;
- projects and quick actions;
- real system/model status;
- a prominent action to launch the universe;
- access to Stella’s 3D companion overlay;
- the interactive 2D companion stage.

Status displays must represent actual observed state. Do not fabricate model availability, health metrics, activity, or task progress. The dashboard should remain navigable and useful even when an AI model is offline.

### 6.4 Adaptive featured area
Use an adaptive featured panel where appropriate, but preserve a clear, prominent role for the 2D companion stage. Other contextual content—such as system activity or a selected project—may appear around it or take priority in a deliberate state, without making the dashboard confusing or displacing the companion experience unpredictably.

### 6.5 Global controls
The UI should provide clear access to:
- global settings;
- notifications or alerts;
- search/navigation;
- system status;
- Home, Universe, and the companion overlay.

Exact placement, behavior, and visual states remain implementation-level details to finalize when building the UI.

## 7. Companion Overlay & Wake-Word Behavior

### 7.1 Confirmed behavior
- The 3D companion overlay is separate from the Home dashboard’s 2D companion stage.
- Wake-word activation should reveal or bring forward the **3D companion overlay first**, whether the user is currently viewing the dashboard or the universe.
- The overlay should be designed as a lightweight, unobtrusive desktop companion rather than requiring the full dashboard to open for every interaction.

### 7.2 Details intentionally left for Phase 2
The following details were not fully specified and must be decided before or during the relevant implementation work:
- exact overlay position, dimensions, and always-on-top behavior;
- drag, snap, minimize, hide, and close interactions;
- how manual activation differs from wake-word activation;
- microphone/listening/processing/speaking states and their indicators;
- how the overlay behaves when the user is in a full-screen app or game;
- keyboard shortcuts and accessibility behavior;
- failure states when microphone, speech services, or the model are unavailable.

Do not treat these unspecified details as already agreed decisions.

## 8. Interaction & Navigation Summary

| User action | Intended result |
|---|---|
| Launch Stella Home | Show the colorful 2D dashboard and companion stage |
| Choose “Universe” / “Launch Universe” | Transition into the 3D universe with cinematic camera flight |
| Hover over a planet | Preview planet name, purpose, and relevant status |
| Click a planet | Enter that planet’s themed workspace |
| Activate wake word | Reveal/bring forward the 3D companion overlay first |
| Use dashboard companion stage | Interact with 2D companion animation, speech presentation, and actions |

## 9. Performance & Engineering Principles

These are design constraints to carry into implementation:

1. Favor clarity and responsiveness over visual effects that add little value.
2. Load only what the current view needs; lazy-load planet-specific assets.
3. Reuse shared UI and 3D resources.
4. Pause or reduce rendering for hidden/inactive scenes.
5. Provide quality settings or adaptive quality where appropriate.
6. Test actual frame rate, memory use, VRAM use, loading time, and responsiveness on the target laptop.
7. Keep system status truthful and make offline/unavailable states understandable.
8. Avoid coupling the dashboard, 2D companion stage, 3D overlay, and universe into one inseparable scene.

## 10. Scope Boundaries

### Included in Phase 1
- Visual direction and conceptual universe layout.
- Initial planet map and intended responsibilities.
- Planet-interior visual and performance principles.
- Avatar foundation selection and license caution.
- Home dashboard concept and navigation proposal.
- Separation of 2D companion stage, 3D companion overlay, and universe.
- Cinematic universe entry and hover/click planet interactions.
- High-level wake-word overlay behavior.

### Not implemented in Phase 1
- Dashboard UI or frontend code.
- 3D universe or planet scenes.
- VRM loading, rigging changes, animation, or avatar integration.
- Wake-word detection, STT, TTS, model integration, or tool calling.
- Agent workflows, memory implementation, or system integrations.
- Final overlay controls and all detailed UI states.

## 11. Open Decisions for Phase 2

Phase 2 should begin by reviewing this document alongside the Phase 0 Architecture & Constitution and Phase 0.5 Contracts documents. Then turn the conceptual design into implementation-ready specifications.

Open items include:
- final dashboard layout, component hierarchy, responsive behavior, and navigation details;
- precise color palette, typography, spacing, iconography, and motion rules;
- final planet names and visual themes;
- overlay placement, controls, visibility rules, and detailed state design;
- avatar license/compatibility verification and technical test plan;
- 2D companion-stage animation approach;
- scene loading strategy and measurable performance budgets;
- the order of implementation tasks and acceptance criteria.

## 12. Phase 1 Exit Criteria

Phase 1 is considered complete as a **planning phase** because the project now has:
- a coherent visual direction for Home and the universe;
- a proposed eight-planet information architecture;
- a consistent-but-themed planet workspace strategy;
- a chosen, unmodified avatar foundation subject to its license;
- a clear distinction between the 2D dashboard companion stage, 3D companion overlay, and 3D universe;
- defined cinematic entry and planet hover/click behavior;
- documented performance constraints and unfinalized decisions for the next phase.

This completion does **not** mean any of these features have been implemented or performance-tested.

---

## Phase 2 Handoff

**Start Phase 2 in a new chat.** Bring this `phase1.md` together with the Phase 0 Architecture & Constitution and Phase 0.5 Contracts documents. Begin with a design/specification review and convert the open decisions into an implementation-ready plan. Do not jump straight into coding: agree on the Phase 2 scope, order, and acceptance criteria first.
