# Pistola Building-CAD — Codex Task Plan

> **Codex operating contract:**
> - Check each `- [ ]` box by changing it to `- [x]` the moment the action is confirmed complete.
> - Never advance past an unchecked box in the current phase.
> - At every `### ✅ Checkpoint` block, run the listed commands and confirm exit 0 before continuing.
> - At every `### 🚦 Acceptance Gate` block, perform every manual verification step before starting the next phase.
> - If a checkpoint or gate fails, stop, report the failure, and do not mark it checked.

---

## Pre-flight

- [x] Read `rules.md` — internalize all operating constraints
- [x] Read `editor/AGENTS.md` — internalize package boundaries and conventions
- [x] Read `editor/README.md` — confirm data-flow and store patterns
- [x] Confirm monorepo root: `editor/` contains `packages/core`, `packages/viewer`, `apps/editor`
- [x] Confirm package manager: `bun` (all install and run commands use `bun`)

---

## Phase 1 — CAD Foundation and Service Contract

### 1A · CAD Helper Service (outside browser bundle)

- [x] Create directory `cad-helper/` at repo root (sibling of `editor/`)
- [x] Create `cad-helper/requirements.txt` — pin `freecad==1.0.*`, `fastapi`, `uvicorn`, `pydantic`
- [x] Create `cad-helper/schemas.py` — Pydantic models: `JobRequest` (discriminated union of op types), `JobResult`, `JobStatus`; op types: `sketch_to_solid`, `regenerate`, `boolean`, `fillet`, `chamfer`, `import_step`, `export_step`
- [x] Create `cad-helper/main.py` — FastAPI app with `GET /v1/health → {"status":"ok"}`
- [x] Create `cad-helper/routers/jobs.py` — `POST /v1/cad/jobs` (accepts `JobRequest`, returns `{jobId, status:"pending"}`); `GET /v1/cad/jobs/{id}` (returns `JobResult`)
- [x] Create `cad-helper/operations/sketch_to_solid.py` — FreeCAD Part.Extrusion stub returning placeholder GLB artifact path
- [x] Create `cad-helper/operations/import_step.py` — FreeCAD `Part.Shape.read()` stub
- [x] Create `cad-helper/operations/export_step.py` — FreeCAD STEP write stub
- [x] Create `cad-helper/operations/boolean.py` — union/cut/intersect stubs
- [x] Create `cad-helper/operations/fillet_chamfer.py` — fillet and chamfer stubs
- [x] Create `cad-helper/.env.example` — `FREECAD_PATH`, `ARTIFACT_DIR`, `PORT=7878`

### ✅ Checkpoint 1A

- [x] `cd cad-helper && python -c "from main import app; print('ok')"` prints `ok`
- [x] `cd cad-helper && uvicorn main:app --port 7878 &` then `curl http://localhost:7878/v1/health` returns `{"status":"ok"}`

---

### 1B · Core schema — `cad-sketch` node type

- [x] Inspect `editor/packages/core/src/schema/nodes/` — note naming convention of existing node files
- [x] Create `editor/packages/core/src/schema/nodes/cad-sketch.ts`:
  - Zod schema with fields: `id`, `type: z.literal("cad-sketch")`, `parentId`, `visible`, `plane: z.enum(["XY","XZ","YZ","level","face"])`, `entities: z.array(CadEntity)`, `dimensions: z.array(CadDimension)`, `constraints: z.array(CadConstraint)`, `editStatus: z.enum(["idle","editing","invalid"])`, `metadata`
  - export `CadSketchNode` (inferred type) and `CadSketchNodeSchema` (Zod schema)
- [x] Add `export * from "./cad-sketch"` to `editor/packages/core/src/schema/nodes/index.ts`
- [x] Add `CadSketchNode` to the `AnyNode` union in `editor/packages/core/src/schema/types.ts`
- [x] Add `"cad-sketch"` to the node type registry in `editor/packages/core/src/schema/collections.ts`

### ✅ Checkpoint 1B

- [x] `cd editor && bun run check-types` exits 0

---

### 1C · Core schema — `cad-body` node type

- [x] Create `editor/packages/core/src/schema/nodes/cad-body.ts`:
  - Zod schema with fields: `id`, `type: z.literal("cad-body")`, `parentId`, `visible`, `transform` (position/rotation/scale tuples), `operationHistory: z.array(CadOperation)` (ordered), `regenStatus: z.enum(["idle","pending","building","error"])`, `regenError: z.string().nullable()`, `previewArtifactRef: z.string().nullable()`, `cadArtifactRef: z.string().nullable()`, `sourceSketchIds: z.array(z.string())`, `metadata`
  - define `CadOperation` as a discriminated union with variants `ExtrudeOp`, `RevolveOp`, `BooleanOp`, `FilletOp`, `ChamferOp` — each with `id`, `type`, `params`, `suppressed: z.boolean()`
  - export `CadBodyNode`, `CadBodyNodeSchema`, `CadOperation`
- [x] Add `export * from "./cad-body"` to `editor/packages/core/src/schema/nodes/index.ts`
- [x] Add `CadBodyNode` to the `AnyNode` union in `editor/packages/core/src/schema/types.ts`
- [x] Add `"cad-body"` to the node type registry in `editor/packages/core/src/schema/collections.ts`

### ✅ Checkpoint 1C

- [x] `cd editor && bun run check-types` exits 0

---

### 1D · Core system — `CadBodySystem`

- [x] Create `editor/packages/core/src/systems/cad-body/index.ts`
- [x] Implement `CadBodySystem` as a React component using `useFrame`:
  - read `dirtyNodes` from `useScene.getState()`
  - for each `cad-body` node where `regenStatus === "pending"`: set `regenStatus = "building"` via `updateNode`, submit job to helper, poll for result
  - on success: write `previewArtifactRef`, `cadArtifactRef`, set `regenStatus = "idle"`
  - on failure: set `regenStatus = "error"`, `regenError = errorMessage`
  - on timeout (60 s): set `regenStatus = "error"`, `regenError = "Helper job timed out"`
- [x] Export `CadBodySystem` from `editor/packages/core/src/index.ts`

### ✅ Checkpoint 1D

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 1E · Helper client — browser-side typed fetch wrapper

- [x] Create `editor/packages/core/src/lib/cad-helper-client.ts`:
  - reads base URL from `process.env.NEXT_PUBLIC_CAD_HELPER_URL` (default `http://localhost:7878`)
  - `getHelperHealth(): Promise<{ status: string }>`
  - `submitJob(request: JobRequest): Promise<{ jobId: string }>`
  - `pollJob(jobId: string): Promise<JobResult>`
- [x] Export `cadHelperClient` from `editor/packages/core/src/index.ts`

### ✅ Checkpoint 1E

- [x] `cd editor && bun run check-types` exits 0

---

### 1F · Viewer renderer — `CadBodyRenderer`

- [x] Inspect `editor/packages/viewer/src/components/renderers/` — note the existing renderer pattern (`useRegistry`, `useFrame`, props shape)
- [x] Create `editor/packages/viewer/src/components/renderers/cad-body/CadBodyRenderer.tsx`:
  - loads GLB preview mesh from `node.previewArtifactRef` using `@react-three/drei useGLTF`
  - registers mesh with `useRegistry(node.id, "cad-body", ref)`
  - renders a placeholder wireframe box when `previewArtifactRef` is null
  - renders a translucent pulsing overlay when `regenStatus === "pending" || "building"`
  - renders a red emissive tint when `regenStatus === "error"`
- [x] Add `"cad-body"` case to the `NodeRenderer` dispatch switch in viewer
- [x] Export `CadBodyRenderer` from the renderers barrel index

### ✅ Checkpoint 1F

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 1G · Editor shell — helper status indicator

- [x] Locate the editor shell layout component in `editor/apps/editor/`
- [x] Create `editor/apps/editor/components/editor/CadHelperStatus.tsx`:
  - polls `cadHelperClient.getHelperHealth()` every 10 seconds
  - renders a colored dot: green = ready, yellow = busy (`regenStatus === "building"` on any body), red = error or unreachable
  - shows a tooltip with the last error message on hover
- [x] Mount `<CadHelperStatus />` in the editor shell (header or status bar area)

### ✅ Checkpoint 1G

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 🚦 Acceptance Gate — Phase 1

Perform every step manually before starting Phase 2:

- [x] Start the cad-helper server — `CadHelperStatus` dot turns green within 10 seconds
- [x] In browser console: `useScene.getState().createNode(CadBodyNodeSchema.parse({type:"cad-body", regenStatus:"idle", ...}), parentId)` — body appears in scene as placeholder box
- [x] Reload the page — the `cad-body` node persists (IndexedDB) and is selectable
- [x] Stop the helper server — dot turns red within 10 seconds, no crash

---

## Phase 2 — Sketch Workbench

### 2A · Editor store — CAD phase and workplane state

- [x] Open `editor/apps/editor/store/use-editor.tsx` — read the current `phase` union type
- [x] Add `"cad"` to the phase union
- [x] Add `cadMode: "sketch" | "solid" | "modify" | "inspect"` field to `useEditor` state (default `"sketch"`)
- [x] Add `activeWorkplane: "XY" | "XZ" | "YZ" | "level" | "face"` field to `useEditor` state (default `"XY"`)
- [x] Add `activeSketchId: string | null` field (default `null`)

### ✅ Checkpoint 2A

- [x] `cd editor && bun run check-types` exits 0

---

### 2B · Editor toolbar — CAD workspace tab

- [x] Locate the toolbar component that renders phase tabs (Structure, Furnish, Zones)
- [x] Add a "CAD" tab that sets `phase = "cad"` in `useEditor`
- [x] When `phase === "cad"`, show tool groups: Sketch, Solid, Modify, Inspect
- [x] When `phase !== "cad"`, hide all CAD tool groups — existing tabs must be unaffected

### ✅ Checkpoint 2B

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 2C · Sketch entity tools

- [x] Create directory `editor/apps/editor/components/tools/cad/`
- [x] Create `SketchTool.tsx` — on click of a valid plane surface creates a `cad-sketch` node via `useScene.createNode`; sets `activeSketchId` in `useEditor`; respects active workplane
- [x] Create `LineTool.tsx` — appends a `{type:"line", start, end}` entity to the active sketch via `updateNode`
- [x] Create `RectangleTool.tsx` — appends 4 line entities (closed rectangle)
- [x] Create `CircleTool.tsx` — appends a `{type:"circle", center, radius}` entity
- [x] Create `ArcTool.tsx` — appends a `{type:"arc", center, radius, startAngle, endAngle}` entity
- [x] Create `PolylineTool.tsx` — appends a sequence of connected line entities

### ✅ Checkpoint 2C

- [x] `cd editor && bun run check-types` exits 0

---

### 2D · Sketch constraint tools

- [x] Create `editor/apps/editor/components/tools/cad/constraints/CoincidentTool.tsx` — marks two endpoints as coincident in active sketch `constraints` array via `updateNode`
- [x] Create `editor/apps/editor/components/tools/cad/constraints/HorizontalVerticalTool.tsx` — adds horizontal or vertical constraint to selected line entity
- [x] Create `editor/apps/editor/components/tools/cad/constraints/ParallelPerpendicularTool.tsx`
- [x] Create `editor/apps/editor/components/tools/cad/constraints/TangentTool.tsx`
- [x] Create `editor/apps/editor/components/tools/cad/constraints/EqualTool.tsx`
- [x] Create `editor/apps/editor/components/tools/cad/constraints/DimensionTool.tsx` — shows numeric input overlay; appends to sketch `dimensions` array via `updateNode`

### ✅ Checkpoint 2D

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 2E · Viewer renderer — `CadSketchRenderer`

- [x] Create `editor/packages/viewer/src/components/renderers/cad-sketch/CadSketchRenderer.tsx`:
  - renders each `entity` as a `THREE.Line` (or `Line2` for thickness) in the sketch plane
  - shows dimension labels as `<Html>` overlays via `@react-three/drei`
  - renders constraint symbols as small billboard sprites (placeholder icon acceptable for v1)
  - grays out (opacity 0.4) when `editStatus === "idle"`
  - highlights active entities in accent color when `editStatus === "editing"`
  - highlights invalid entities in red when `editStatus === "invalid"`
- [x] Register the sketch group with `useRegistry(node.id, "cad-sketch", ref)`
- [x] Add `"cad-sketch"` case to the `NodeRenderer` dispatch switch in viewer
- [x] Export `CadSketchRenderer` from the renderers barrel index

### ✅ Checkpoint 2E

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 2F · Sketch editor panel

- [x] Create `editor/apps/editor/components/editor/panels/CadSketchPanel.tsx`:
  - lists entities in the active `cad-sketch` node with type and key params
  - lists constraints with a delete button per item (delete calls `updateNode`)
  - lists dimensions with editable numeric inputs (edit calls `updateNode`)
  - shows `editStatus` badge
  - "Close Sketch" button sets `editStatus = "idle"` and clears `activeSketchId`
- [x] Mount `<CadSketchPanel />` in the right panel when `activeSketchId` is non-null and `phase === "cad"`

### ✅ Checkpoint 2F

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 🚦 Acceptance Gate — Phase 2

- [x] Click "CAD" tab — CAD toolbar appears; Structure/Furnish/Zones tool groups are hidden
- [x] Select XY workplane, activate Sketch tool, click scene — `cad-sketch` node created, `CadSketchPanel` opens
- [x] Draw a closed rectangle (4 lines, coincident corners) — entities visible in scene and in panel
- [x] Add a numeric dimension to one edge — label appears in scene, value editable in panel
- [x] Click "Close Sketch" — `editStatus = "idle"`, sketch renders grayed-out
- [x] Reload page — sketch, entities, dimensions, and constraints all survive persistence
- [x] Re-open sketch (double-click or panel button) — `editStatus` returns to `"editing"`

---

## Phase 3 — Solid Operations

### 3A · Helper — solid operation implementations

- [x] Expand `cad-helper/schemas.py` `JobRequest` union with: `ExtrudeOp` (`sketchId`, `distance`, `direction`, `symmetric`), `RevolveOp` (`sketchId`, `axis`, `angle`), `BooleanUnionOp`/`BooleanCutOp`/`BooleanIntersectOp` (`bodyIdA`, `bodyIdB`), `FilletOp` (`bodyId`, `edgeRefs`, `radius`), `ChamferOp` (`bodyId`, `edgeRefs`, `distance`)
- [x] Implement `cad-helper/operations/extrude.py` — FreeCAD `Part.Extrusion`, export GLB preview and STEP CAD artifact
- [x] Implement `cad-helper/operations/revolve.py` — FreeCAD `Part.Revolution`
- [x] Implement `cad-helper/operations/boolean.py` — FreeCAD `Part.fuse`, `Part.cut`, `Part.common`
- [x] Implement `cad-helper/operations/fillet_chamfer.py` — FreeCAD `Part.Fillet`, `Part.Chamfer`
- [x] Wire all operations into `cad-helper/routers/jobs.py` dispatch

### ✅ Checkpoint 3A

- [x] `python -m pytest cad-helper/tests/ -v` — all stubs return a valid `JobResult` shape

---

### 3B · Solid operation tools in editor

- [x] Create `editor/apps/editor/components/tools/cad/solid/ExtrudeTool.tsx`:
  - requires `activeSketchId` to be set and sketch to have a closed profile
  - shows numeric input for distance and direction toggle (positive/negative/symmetric)
  - on confirm: creates or updates a `cad-body` node, appends `ExtrudeOp` to `operationHistory`, sets `regenStatus = "pending"`
- [x] Create `editor/apps/editor/components/tools/cad/solid/RevolveTool.tsx` — same pattern; axis picker (X/Y/Z/custom), angle input
- [x] Create `editor/apps/editor/components/tools/cad/solid/BooleanTool.tsx` — requires two `cad-body` selections; presents union/cut/intersect picker; appends `BooleanOp` to target body and sets `regenStatus = "pending"`
- [x] Create `editor/apps/editor/components/tools/cad/solid/FilletTool.tsx` — requires edge selection on a `cad-body`; numeric radius input; appends `FilletOp`
- [x] Create `editor/apps/editor/components/tools/cad/solid/ChamferTool.tsx` — requires edge selection; numeric distance input; appends `ChamferOp`
- [x] In all solid tools: return early (show toast "Body is rebuilding — please wait") when target body has `regenStatus === "building"`

### ✅ Checkpoint 3B

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 3C · Body inspector panel — regen state and operation tree

- [x] Create `editor/apps/editor/components/editor/panels/CadBodyPanel.tsx`:
  - ordered list of operations from `operationHistory` with type, params summary, and suppress toggle
  - suppress toggle sets `op.suppressed = !op.suppressed` via `updateNode` and sets `regenStatus = "pending"`
  - shows `regenStatus` badge (idle / pending / building / error)
  - shows `regenError` message with "Retry" button when `regenStatus === "error"` (retry sets `regenStatus = "pending"`)
  - drag handles visible but disabled (labeled "reorder available in v2")
- [x] Mount `<CadBodyPanel />` in the right panel when a `cad-body` node is selected and `phase === "cad"`
- [x] Update `CadBodyRenderer.tsx`: add spinning overlay while `regenStatus === "building"` and red emissive error highlight when `regenStatus === "error"`

### ✅ Checkpoint 3C

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 🚦 Acceptance Gate — Phase 3

- [x] Draw a closed rectangle sketch, activate Extrude tool, enter `2.5` m — `cad-body` appears in scene after regen
- [x] Edit a sketch dimension — `regenStatus` transitions `pending → building → idle` and preview mesh updates
- [x] Create two overlapping bodies, run Boolean Cut — result mesh updates; scene graph is intact
- [x] Apply Fillet to an edge — mesh updates without error
- [x] Suppress an operation in `CadBodyPanel` — regen fires and mesh changes accordingly
- [x] With helper offline: attempt extrude — `regenStatus = "error"` appears with message; no scene data loss

---

## Phase 4 — Professional Editing Flow

### 4A · Transform support for `cad-body`

- [x] Open `editor/apps/editor/components/tools/` — locate the `SelectTool` and any node-type allowlists for the transform gizmo
- [x] Add `"cad-body"` to the node-type allowlist so move/rotate/scale gizmo activates on `cad-body` selection
- [x] Transform updates write only to `node.transform` via `updateNode` — do NOT set `regenStatus = "pending"` (transform is scene placement, not geometry)
- [x] Verify that `CadBodySystem` regen preserves existing `node.transform` — regen writes only artifact refs and `regenStatus`

### ✅ Checkpoint 4A

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 4B · Command palette — CAD commands

- [x] Locate the command palette implementation in `editor/apps/editor/`
- [x] Register command `cad.sketch.new` — precondition: `phase === "cad"`; action: activate `SketchTool`
- [x] Register command `cad.sketch.close` — precondition: `activeSketchId !== null`; action: set `editStatus = "idle"`, clear `activeSketchId`
- [x] Register command `cad.extrude` — precondition: active closed sketch exists; action: activate `ExtrudeTool`
- [x] Register command `cad.revolve` — precondition: active closed sketch exists; action: activate `RevolveTool`
- [x] Register command `cad.boolean.union`, `cad.boolean.cut`, `cad.boolean.intersect` — precondition: two `cad-body` nodes selected; action: activate `BooleanTool` with the corresponding mode
- [x] Register command `cad.fillet` — precondition: one `cad-body` selected; action: activate `FilletTool`
- [x] Register command `cad.chamfer` — precondition: one `cad-body` selected; action: activate `ChamferTool`
- [x] All commands show an error toast when preconditions are not met
- [x] Add keyboard shortcuts (when `phase === "cad"`): `S` = `cad.sketch.new`, `E` = `cad.extrude`, `R` = `cad.revolve`

### ✅ Checkpoint 4B

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 🚦 Acceptance Gate — Phase 4

- [x] Select a `cad-body`, use the move gizmo — body moves; `transform` updates; no regen triggered
- [x] Edit a sketch dimension on the same body — body regenerates; scene placement is preserved
- [x] Suppress an operation in `CadBodyPanel` — regen fires and mesh changes
- [x] Open command palette, type "extrude" — command appears and can be triggered
- [x] Press `S` while `phase === "cad"` — sketch tool activates
- [x] Undo/redo works for node creation, sketch edits, and operation history appends

---

## Phase 5 — Interop and Building-Aware Placement

### 5A · STEP import

- [x] Finish `cad-helper/operations/import_step.py`: load STEP with `Part.Shape.read()`, tessellate to GLB preview, write both artifacts to `ARTIFACT_DIR`, return `{previewArtifactRef, cadArtifactRef}`
- [x] Wire `import_step` into `cad-helper/routers/jobs.py` dispatch
- [x] Create `editor/apps/editor/components/tools/cad/ImportStepTool.tsx`:
  - file picker for `.step` / `.stp` files
  - uploads file to helper via `multipart/form-data` POST to `/v1/cad/jobs`
  - creates a `cad-body` node with returned artifact refs and `regenStatus = "idle"`
  - applies building-aware parenting (see 5C)

### ✅ Checkpoint 5A

- [x] `cd editor && bun run check-types` exits 0

---

### 5B · STEP export

- [x] Finish `cad-helper/operations/export_step.py`: read STEP artifact from `cadArtifactRef`, return a signed download URL or served file path
- [x] Wire `export_step` into helper dispatch
- [x] Add "Export STEP" button to `CadBodyPanel.tsx`:
  - calls `cadHelperClient.submitJob({type:"export_step", cadArtifactRef: node.cadArtifactRef})`
  - polls for result, then triggers `window.location.href` download

### ✅ Checkpoint 5B

- [x] `cd editor && bun run check-types` exits 0

---

### 5C · Building-aware parenting

- [x] In `SketchTool.tsx`: when creating a `cad-sketch` node, read `useViewer.getState().selection.levelId`; if non-null set `parentId = levelId`, else set `parentId = useScene.getState().rootNodeIds[0]`
- [x] Apply the same parenting logic in `ImportStepTool.tsx`
- [x] Apply the same parenting logic when `ExtrudeTool` creates a new `cad-body` node

### ✅ Checkpoint 5C

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 5D · Level plane snapping for sketch tool

- [x] In `SketchTool.tsx`: when `activeWorkplane === "level"`, read the active level node's floor elevation from `useScene.getState().nodes[levelId]` and snap the sketch plane Y to that elevation
- [x] Show a semi-transparent ghost plane quad in the viewer while sketch tool is active

### ✅ Checkpoint 5D

- [x] `cd editor && bun run check-types` exits 0

---

### 🚦 Acceptance Gate — Phase 5

- [x] Import a STEP file — body appears in scene with correct preview mesh; no crash
- [x] Import with a level selected — body is parented under that level in the structure tree
- [x] Export the body as STEP — download triggers; file is valid STEP (open in any viewer)
- [x] Create a sketch with `activeWorkplane = "level"` — sketch plane Y matches level elevation
- [x] Reload — imported body persists with artifact refs intact

---

## Phase 6 — Pistola AI Orchestration

### 6A · CAD brief schema in core

- [x] Create `editor/packages/core/src/schema/cad-brief.ts`:
  - `CadEntitySpec` — `{type, points, params}`
  - `SketchPlan` — `{plane, entities: CadEntitySpec[], dimensions, constraints}`
  - `OperationNode` — `{id, op: CadOperation["type"], params, dependsOn: string[]}`
  - `CadBrief` — `{intent: string, sketchPlans: SketchPlan[], operationGraph: OperationNode[], assumptions: string[], ambiguities: string[]}`
  - export Zod schemas and inferred types for all four
- [x] Export `CadBrief`, `CadBriefSchema`, and related types from `editor/packages/core/src/index.ts`

### ✅ Checkpoint 6A

- [x] `cd editor && bun run check-types` exits 0

---

### 6B · AI pipeline — prompt to `CadBrief`

- [x] Create `editor/apps/editor/lib/cad-ai-pipeline.ts`:
  - `promptToCadBrief(prompt: string, context: {nodes: AnyNode[], levelId: string|null}): Promise<CadBrief>`
  - calls the AI provider with a system prompt that enforces `CadBrief` JSON output and requires the model to list all geometric assumptions and flag ambiguities
  - parses the response with `CadBriefSchema.parse(...)` — throws `CadAiBriefValidationError` on Zod failure
  - retries once on JSON parse failure before throwing
- [x] Export `promptToCadBrief` and `CadAiBriefValidationError` from the file

### ✅ Checkpoint 6B

- [x] `cd editor && bun run check-types` exits 0

---

### 6C · AI pipeline — `CadBrief` executor

- [x] Create `editor/apps/editor/lib/cad-brief-executor.ts`:
  - `executeCadBrief(brief: CadBrief, parentId: string): Promise<{sketchIds: string[], bodyIds: string[]}>`
  - iterates `brief.sketchPlans` → creates `cad-sketch` nodes via `useScene.createNode`
  - iterates `brief.operationGraph` in dependency order → creates `cad-body` nodes and sets `operationHistory`
  - marks all created bodies with `regenStatus = "pending"`
- [x] Export `executeCadBrief` from the file

### ✅ Checkpoint 6C

- [x] `cd editor && bun run check-types` exits 0

---

### 6D · CAD chat integration

- [x] Locate or create the AI chat panel in `editor/apps/editor/`
- [x] Add a "CAD mode" toggle in the chat panel
- [x] When CAD mode is active: route the user prompt through `promptToCadBrief → executeCadBrief`
- [x] Display `brief.assumptions` as an expandable card before committing to the scene
- [x] If `brief.ambiguities` is non-empty, show a clarification prompt to the user and wait for a follow-up before calling `executeCadBrief`

---

### 6E · Failure and error behavior

- [x] In `cad-ai-pipeline.ts`: catch AI provider errors, malformed JSON, and Zod validation failures — surface all as user-readable toasts; never crash the editor
- [x] In `cad-brief-executor.ts`: after execution, collect all bodies where `regenStatus === "error"` and display a summary panel with "Retry" (sets `regenStatus = "pending"`) and "Edit Sketch" actions
- [x] In `CadBodySystem`: enforce 60-second timeout on any pending job — set `regenStatus = "error"`, `regenError = "Helper job timed out"`

### ✅ Checkpoint 6E

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0

---

### 🚦 Acceptance Gate — Phase 6

- [x] In CAD mode chat, type "create a box 1 m × 2 m × 0.5 m" — brief appears with assumptions; body is created and regenerated in scene
- [x] Manually edit a sketch dimension on the AI-created body — body regenerates; operation history is preserved
- [x] Type an ambiguous prompt ("make a bracket") — clarification question appears before any scene changes
- [x] With helper offline during AI execution — error summary panel appears; scene has no corrupt nodes

---

## Final Validation — All Phases Complete

- [x] `cd editor && bun run check-types` exits 0
- [x] `cd editor && bun run lint` exits 0
- [x] `cd editor && bun run build` exits 0
- [x] Open a fresh scene — Structure, Furnish, and Zones tabs work without regressions
- [x] Full CAD flow: sketch → extrude → boolean cut → fillet → STEP export — succeeds end to end
- [x] Full AI flow: chat prompt → brief → scene creation → manual edit → regen → STEP export
- [x] Helper offline throughout: all CAD tool entry points show clear status; no blank screens; no data loss

---

## Post-v1 Continuation — BIM Metadata IFC Export

Scope note: this is a metadata-first IFC export slice after v1. It exports the scene hierarchy and Pistola property sets, not full IFC solid geometry or semantic BIM element mapping.

- [x] Add core BIM metadata resolution and metadata-first IFC serialization for site / building / level hierarchy and exported scene elements
- [x] Add editor-side IFC download actions in Settings and Command Palette
- [x] Validate with `cd editor && bun run check-types`, `cd editor && bun run lint`, `cd editor && bun run build`, and a direct `serializeSceneToIfc(...)` smoke

---

## Deferred — DO NOT implement in v1

- [ ] (out of scope) Full geometric IFC authoring and semantic BIM export beyond the metadata-first export above
- [ ] (out of scope) Assembly constraints between bodies
- [ ] (out of scope) CAM, sheet metal, SubD, freeform surfacing
- [ ] (out of scope) Arbitrary operation history reordering (drag to reorder)
- [ ] (out of scope) Automatic semantic conversion of `cad-body` to wall/slab building nodes
- [ ] (out of scope) Remote/cloud CAD helper — v1 is local-only

---

*Last updated: 2026-03-24 | Pistola Building-CAD Roadmap v1 + post-v1 continuation*
