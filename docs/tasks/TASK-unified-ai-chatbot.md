# `TASK-unified-ai-chatbot.md` — Single Unified AI Chatbot Controlling All Pistola Features

> **Core Mandate**
> There must be **only one AI chatbot** in Pistola. A user should never have to navigate multiple panels, toggle disconnected settings, or guess whether a feature is "CAD", "Architecture", "Furnish", or "Vision". From this single chat interface, the AI chatbot must have autonomous, full-spectrum control over **every single feature** of the editor.

---

## Executive Summary

Currently, Pistola has powerful but fragmented capabilities:
1. The **AI Assistant Chat** (`AiAssistantPanel.tsx`) generates architecture plans, compound recipes, and executes scene turns.
2. The **CAD Runtime Panel** (`cad-helper.tsx`) handles FreeCAD status, sketch plane selection, manual entities, and housed the AI Model Settings (`AiModelSettings.tsx`).
3. The **MAC (Multi-Agent-CAD) Engine** (`tooling/mac-helper`) generates solid STEP/GLB mechanics but required specialized triggers.
4. The **Viewport and Camera Controls** (top view, orbit, orthographic, snapshot capture) are scattered across manual overlay buttons.
5. The **Scene & Hierarchy Panels** (site boundaries, levels, zones, materials, measurements) operate via isolated UI tabs.

**The Solution: The Omnipotent Chatbot Operator.**
A single, conversational, multimodal interface that directly exposes and orchestrates:
- **Architecture & Buildings**: Walls, doors, windows, slabs, roofs, stairs, levels, zones, sites.
- **CAD & Mechanical Solids**: Parametric 2D sketches, 3D extrusions, booleans, fillets, workplanes, and Multi-Agent-CAD complex solid generation (airplanes, robots, hearts, gears, mechanisms).
- **Interior & Furnishing**: Procedural primitives, compound recipes, asset catalog lookup, material recoloring, spatial placement.
- **Camera & Viewport**: Orbit, focus on selection, switch view modes (3D, top-down, wireframe, scans), capture snapshots.
- **Scene Query & Inspection**: Measure dimensions, room areas, longest walls, collision detection, and analyze visual screenshots with vision models.
- **AI Model & Runtime Control**: Instant model switching directly in the chat header (OpenRouter 440+ models, free vs flagship), test connections, and auto-route tasks to specialized models.

---

## Unified Feature Surface Matrix

| Feature Domain | Existing Manual UI / Tool | Unified Chatbot Action / Tool | Status |
| :--- | :--- | :--- | :--- |
| **AI Model Selector** | CAD helper subpanel (`AiModelSettings`) | Chat header model selector + `@model <id>` prompt command | Phase 1 |
| **OpenRouter 445+ Models** | `/api/ai/models` endpoint | Live search dropdown in chat toolbar + auto free router | Phase 1 |
| **CAD Sketching** | FreeCAD panel + manual draw | `cad_create_sketch`, `cad_add_entities`, `cad_set_plane` | Phase 2 |
| **CAD Solids & Extrusions**| FreeCAD helper | `cad_extrude_sketch`, `cad_boolean_op`, `cad_fillet` | Phase 2 |
| **MAC Mechanical Parts** | MAC helper daemon / python script | `generate_mac_part` (airplanes, arms, engines, gears) | Phase 2 |
| **Parametric Recipes** | Recipe catalog in `recipes/` | `create_from_recipe` (robots, furniture, rockets) | Phase 3 |
| **Procedural Primitives**| Box / Cylinder manual items | `create_primitive` (sphere, torus, cone, capsule, wedge) | Phase 3 |
| **Architecture Structures**| Site/Wall/Floor builder tools | `create_wall`, `create_slab`, `create_roof`, `create_level` | Phase 3 |
| **Zone & Spatial Design**| Zone panel | `create_zone`, `update_zone_color`, `set_phase` | Phase 3 |
| **Viewport & Camera** | Overlay orbit/top buttons | `orbit_camera`, `set_camera_view`, `focus_nodes` | Phase 4 |
| **Visual Vision Analysis** | Manual attachment dropzone | `capture_and_inspect_viewport` (multimodal turn) | Phase 4 |
| **Spatial Measurements** | Space detection library | `measure_distance`, `measure_area`, `find_longest_wall` | Phase 4 |
| **History & Safe Review**| Bottom status bar / undo button | Single-turn undo card + destructive review gates in chat | Phase 5 |
| **IDE Agent (MCP)** | External `.cursor/mcp.json` | Identical tool parity via `pistola-mcp` | Phase 6 |

---

## Phase 1 — Chatbot Header & Real-Time Model Switcher

- [x] **1.1 Move Model Selector into Chatbot Header**:
  - Relocated model indicator and dropdown into top header of `AiAssistantPanel.tsx`.
  - Active model badge with real-time selection (`⭐ Free Router`, `Llama 3.3 70B`, `DeepSeek V3`, `Claude 3.7 Sonnet`, `GPT-4o`, `Gemini 2.5`).
  - Search 445+ OpenRouter models, filter tabs (`Free Only`, `Recommended`, `All`), and built-in custom API key/endpoint configuration.
- [x] **1.2 In-Chat Model Commands**:
  - Supports `/model <id>` and natural language commands (`"Switch model to Claude 3.7 Sonnet"`, `"change model to deepseek"`).
  - Inline confirmation badge with zero latency.
- [x] **1.3 Smart Task Auto-Routing**:
  - 0ms deterministic commands (camera, viewport modes, grid, theme, measurements, undo) execute locally without remote LLM latency or cost.
  - Multi-step architecture and CAD solid tasks route to active planner/reasoning model.

---

## Phase 2 — Full CAD & Solid Engine Control from Chat

- [x] **2.1 Chat-Driven FreeCAD 2D/3D Operations**:
  - Registered CAD capabilities in `packages/editor/src/lib/assistant/capabilities/cad.ts` and `execute.ts`:
    - `set_cad_workplane`, `close_cad_sketch`, `create_default_cad_sketch`, `extrude_cad_sketch`, `revolve_cad_sketch`, `apply_cad_boolean`, `apply_cad_fillet`, `apply_cad_chamfer`, `add_cad_box_ears`, `extrude_cad_body_face`, `shell_cad_body`.
- [x] **2.2 Chat-Driven Multi-Agent-CAD (MAC) Solid Generation**:
  - Direct execution via `generate_mac_part` and `generateMacPartAction` in chatbot.
  - Generates mechanical STEP/GLB solid geometry and auto-imports into active scene.

---

## Phase 3 — Complete Architectural & Interior Control

- [x] **3.1 High-Level Architectural Commands**:
  - Full structural generation: `create_building`, `create_level`, `create_zone`, `create_wall`, `create_slab`, `create_roof`, `place_door`, `place_window`.
  - Auto-scaffolding in `getRecipeLevelTarget` creates building and level containers if none exist.
  - Studio, south-wall large windows, and custom oak/wood floor slab styling supported out-of-the-box.
- [x] **3.2 Comprehensive Furnishing & Styling Control**:
  - Catalog asset placement, compound multi-part recipes (robot arm, airplane, surfboard, humanoid robot, rocket, car, table, chair, drone).
  - Zone recoloring, appearances, and material parameters.

---

## Phase 4 — Camera, Viewport, Inspection & Multimodal Vision

- [x] **4.1 Viewport Camera Control via Chat**:
  - Direct execution for `camera_top_view`, `orbit_camera` (cw/ccw), `set_camera_mode` (perspective/orthographic), `focus_camera_on_nodes`, `toggle grid`, `toggle scans`, `theme`.
- [x] **4.2 Multimodal Visual Inspection Tool**:
  - Canvas snapshot capture to data URL, displays snapshot thumbnail inline in the chat timeline (`imageUrl`).
  - Instant zero-latency geometric calculation of longest wall (`Math.hypot`), total floor area (`calculatePolygonArea`), and node counts.

---

## Phase 5 — Autonomous Agentic Operator Loop & Safety

- [x] **5.1 Single-Turn Multi-Step Orchestration**:
  - Chatbot plans and executes compound recipes, automatically sequencing geometric assembly followed by camera orbiting and target node framing.
- [x] **5.2 Destructive Action Review Gate**:
  - Inline review cards for actions requiring manual review before modifying the scene.
- [x] **5.3 Single-Click Undo for Every Chat Turn**:
  - Maintains pre-turn scene snapshot.
  - Single-click "Undo" button on response cards and natural language command support (`"Undo what you just did."`, `"undo"`, `"deshacer"`, `"revert"`).

---

## Phase 6 — Universal IDE (MCP) Parity

- [x] **6.1 Expose All Tools over `pistola-mcp`**:
  - Complete parity in `editor/tooling/pistola-mcp/src/index.ts`:
    - `pistola_status`, `pistola_configure_model`, `pistola_get_workspace`, `pistola_plan`, `pistola_execute`, `pistola_chat`, `pistola_generate_mac`, `pistola_generate_cad`, `pistola_get_job`, `pistola_list_artifacts`, `pistola_inspect_scene`, `pistola_get_nodes`, `pistola_measure`, `pistola_search_catalog`, `pistola_list_capabilities`, `pistola_list_recipes`, `pistola_camera`, `pistola_agent`.

---

## Acceptance Verification Criteria

- [x] **Prompt 1 (CAD Mechanical)**: *"Generate a robotic arm with 3 joint segments and a gripper, then orbit camera to focus on it."* -> Generates articulated robot arm compound assembly, orbits camera, and focuses on the arm root node.
- [x] **Prompt 2 (Organic/Complex Solid)**: *"Create a 3D red heart solid with a smooth base."* -> Parametric heart wire sketch and 3D extrusion brief created and rendered.
- [x] **Prompt 3 (Architecture)**: *"Build a 10m x 8m modern studio with large windows on the south wall and an oak floor."* -> Auto-scaffolds building/level, creates 10x8m perimeter walls, large windows on south wall ($ref_room_wall_0), and Oak Floor Slab.
- [x] **Prompt 4 (Observation)**: *"How long is the longest wall and what is the total floor area?"* -> Measures accurately with `Math.hypot` and `calculatePolygonArea`, replies with exact metrics in chat.
- [x] **Prompt 5 (Camera)**: *"Switch to top view and take a snapshot."* -> Switches camera to top-down orthographic view and attaches snapshot thumbnail in chat timeline.
- [x] **Prompt 6 (Model Switch)**: *"Switch model to Claude 3.7 Sonnet."* -> Switches active AI model to Claude 3.7 Sonnet, updates config, and confirms in chat without opening side panels.
- [x] **Prompt 7 (Safety)**: *"Undo what you just did."* -> Reverts scene snapshot to exact pre-turn state and confirms in chat.
