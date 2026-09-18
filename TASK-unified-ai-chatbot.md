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

- [ ] **1.1 Move Model Selector into Chatbot Header**:
  - Relocate the model indicator and selector from the CAD sidebar into the top header of `AiAssistantPanel.tsx`.
  - Display current active model (e.g. `⭐ Free Models Router`, `Llama 3.3 70B`, `Claude 3.7 Sonnet`, `DeepSeek V3`).
  - Provide a one-click dropdown showing:
    - Quick-pick badges: `⭐ Free Only`, `⚡ Recommended`, `All (445)`.
    - Instant search bar to filter models.
    - Quick toggle for Free vs Flagship models without opening settings.
- [ ] **1.2 In-Chat Model Commands**:
  - Allow users to switch models directly via chat syntax:
    - `/model openrouter/free`
    - `/model deepseek/deepseek-chat`
    - `/model claude-3.7`
  - Chat confirms with inline badge: *"Switched active model to DeepSeek V3"*.
- [ ] **1.3 Smart Task Auto-Routing**:
  - When the user asks for vision/inspection ("what's in this room?", "is the door aligned?"), auto-route to a vision-capable model (Gemini 2.5 Flash / GPT-4o).
  - When the user issues a 0ms deterministic command ("orbit left", "make the sofa red"), execute instantly at $0 cost without calling LLMs.
  - When the user asks for complex reasoning or engineering parts, route to the configured reasoning model.

---

## Phase 2 — Full CAD & Solid Engine Control from Chat

- [ ] **2.1 Chat-Driven FreeCAD 2D/3D Operations**:
  - Register capabilities in `packages/editor/src/lib/assistant/capabilities/cad.ts`:
    - `cad_create_sketch(plane: 'XY' | 'XZ' | 'YZ', levelId?: string)`
    - `cad_add_entities(sketchId, entities: Line | Circle | Rect | Arc | Heart | Airfoil)`
    - `cad_extrude(sketchId, length: number, symmetric?: boolean)`
    - `cad_fillet(bodyId, radius: number, edges?: string[])`
    - `cad_boolean(targetBodyId, toolBodyId, operation: 'fuse' | 'cut' | 'common')`
  - Chat can construct precise mechanical sketches and parametric solids from prompts:
    - *"Sketch a 50mm x 50mm plate with a 10mm center hole on the XY plane and extrude 8mm"*
    - *"Fillet the top edges of the selected bracket by 2mm"*
- [ ] **2.2 Chat-Driven Multi-Agent-CAD (MAC) Solid Generation**:
  - Make MAC directly invokable by the agentic loop whenever the user asks for an advanced mechanical assembly, mechanism, or freeform solid:
    - *"Build a 6-axis robot arm with gripper"*
    - *"Create a realistic drone frame with 4 motor mounts"*
    - *"Generate an aerodynamic airplane wing with rib cutouts"*
    - *"Create an anatomically accurate solid heart with chambers"*
  - The chatbot triggers the job, shows an inline progress card (`[MAC Engine: Synthesizing STEP geometry...]`), and automatically imports and centers the resulting GLB/STEP into the scene.

---

## Phase 3 — Complete Architectural & Interior Control

- [ ] **3.1 High-Level Architectural Commands**:
  - Ensure the chatbot can construct entire multi-story structures from a single brief:
    - `create_site(polygon: Vector2[], name: string)`
    - `create_level(elevation: number, height: number, name: string)`
    - `create_wall(start: Vector3, end: Vector3, thickness: number, height: number)`
    - `create_slab(polygon: Vector2[], levelId: string)`
    - `create_roof(roofType: 'gable' | 'hip' | 'flat', polygon: Vector2[])`
    - `create_stair(start: Vector3, targetLevelId: string)`
    - `insert_opening(wallId, openingType: 'door' | 'window', positionOffset: number)`
- [ ] **3.2 Comprehensive Furnishing & Styling Control**:
  - `place_item(catalogId, position, rotation)`
  - `create_compound(name, parts: PrimitiveSpecification[])`
  - `set_node_appearance(nodeIds: string[], { color, roughness, metalness, material })`
  - `transform_node(nodeId, { translate, rotate, scale })`
  - Examples:
    - *"Furnish the kitchen with an island, 3 barstools, stainless steel fridge, and gas stove"*
    - *"Change all walls on Level 1 to warm white and make the floor polished concrete"*

---

## Phase 4 — Camera, Viewport, Inspection & Multimodal Vision

- [ ] **4.1 Viewport Camera Control via Chat**:
  - Register direct camera execution capabilities:
    - `orbit_camera(direction: 'left' | 'right' | 'up' | 'down', degrees?: number)`
    - `set_camera_view(view: 'top' | 'isometric' | 'front' | 'side' | 'walkthrough')`
    - `focus_selection(nodeIds?: string[])` — automatically frames the camera on the created or selected object.
    - `toggle_view_scans(enabled: boolean)`
    - `set_level_view_mode(mode: 'all' | 'isolated' | 'cutaway')`
  - Example commands:
    - *"Show me a top-down view of the entire building"*
    - *"Zoom in on the robot arm we just generated"*
    - *"Orbit 45 degrees left to check the facade"*
- [ ] **4.2 Multimodal Visual Inspection Tool**:
  - Add tool `inspect_viewport_vision(question?: string)`:
    - Automatically takes an in-memory high-res screenshot of the active WebGL canvas.
    - Sends the image alongside the user question to a vision model (Gemini 2.5 Flash / GPT-4o).
    - Returns structured visual findings to the chat timeline:
      - *"The sofa is currently colliding with the left wall by 15cm; adjusting position now."*

---

## Phase 5 — Autonomous Agentic Operator Loop & Safety

- [ ] **5.1 Single-Turn Multi-Step Orchestration**:
  - The chatbot can plan and execute multi-phase tasks in a single turn with full transparency:
    1. Inspect current scene bounds.
    2. Build or import 3D geometry.
    3. Position and align in relation to existing nodes.
    4. Focus camera on the finished result.
    5. Present summary with an instant **Undo Turn** button.
- [ ] **5.2 Destructive Action Review Gate**:
  - Any batch deleting >3 nodes or clearing a whole level pauses with an inline **Review Card** in chat:
    - `[Proceed (Delete 5 nodes)]` `[Cancel]`
- [ ] **5.3 Single-Click Undo for Every Chat Turn**:
  - Maintain scene snapshot before every mutating turn.
  - An inline "Undo this turn" button appears under every agent execution response.

---

## Phase 6 — Universal IDE (MCP) Parity

- [ ] **6.1 Expose All Tools over `pistola-mcp`**:
  - Ensure Cursor, VS Code, and Codex connecting to Pistola have 100% parity with the in-browser chatbot:
    - `pistola_agent` (full multi-step operator)
    - `pistola_cad` (FreeCAD + MAC solids)
    - `pistola_scene` (architecture & furnish)
    - `pistola_camera` (viewport control)
    - `pistola_measure` (spatial dimensions)
    - `pistola_model` (switch model)

---

## Acceptance Verification Criteria

- [ ] **Prompt 1 (CAD Mechanical)**: *"Generate a robotic arm with 3 joint segments and a gripper, then orbit camera to focus on it."* -> Generates solid, places in scene, camera focuses on it.
- [ ] **Prompt 2 (Organic/Complex Solid)**: *"Create a 3D red heart solid with a smooth base."* -> Parametric heart wire / MAC solid created and rendered.
- [ ] **Prompt 3 (Architecture)**: *"Build a 10m x 8m modern studio with large windows on the south wall and an oak floor."* -> Creates walls, openings, floor slab, applies materials.
- [ ] **Prompt 4 (Observation)**: *"How long is the longest wall and what is the total floor area?"* -> Measures accurately and replies with exact dimensions.
- [ ] **Prompt 5 (Camera)**: *"Switch to top view and take a snapshot."* -> Camera transitions to top orthographic view and attaches snapshot thumbnail.
- [ ] **Prompt 6 (Model Switch)**: *"Switch model to Claude 3.7 Sonnet."* -> Chatbot switches model and confirms without opening side panels.
- [ ] **Prompt 7 (Safety)**: *"Undo what you just did."* -> Reverts the exact scene state to before the turn.
