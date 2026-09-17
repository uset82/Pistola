# Pascal Editor

A 3D building and CAD editor built with React Three Fiber and WebGPU.



https://github.com/user-attachments/assets/8b50e7cf-cebe-4579-9cf3-8786b35f7b6b



## Repository Architecture

This is a Turborepo monorepo with one app and several shared packages:

```
editor-v2/
├── apps/
│   └── editor/          # Next.js application
├── packages/
│   ├── core/            # Schema definitions, state management, systems
│   ├── editor/          # Editor shell, CAD tools, panels, command palette
│   └── viewer/          # 3D rendering components
```

### Separation of Concerns

| Package | Responsibility |
|---------|---------------|
| **@pascal-app/core** | Node schemas, scene state (Zustand), systems (geometry generation), spatial queries, event bus |
| **@pascal-app/viewer** | 3D rendering via React Three Fiber, default camera/controls, post-processing |
| **@pascal-app/editor** | Reusable editor tools, CAD stores, command actions, helper UI |
| **apps/editor** | Next.js composition layer, API routes, always-on assistant shell, app-specific orchestration |

The **viewer** renders the scene with sensible defaults. `@pascal-app/editor` extends it with interactive tools, selection management, and CAD editing capabilities. `apps/editor` mounts the runtime, provides API routes, and hosts the always-on AI assistant surface.

### Stores

Each package has its own Zustand store for managing state:

| Store | Package | Responsibility |
|-------|---------|----------------|
| `useScene` | `@pascal-app/core` | Scene data: nodes, root IDs, dirty nodes, CRUD operations. Persisted to IndexedDB with undo/redo via Zundo. |
| `useViewer` | `@pascal-app/viewer` | Viewer state: current selection (building/level/zone IDs), level display mode (stacked/exploded/solo), camera mode. |
| `useEditor` | `@pascal-app/editor` | Editor state: phase (`site | structure | furnish | cad`), active tool, CAD mode/workplane, panel state. |
| `useCad` | `@pascal-app/editor` | CAD helper health, CAD command toasts, sketch/body operations, STEP import/export actions. |

**Access patterns:**

```typescript
// Subscribe to state changes (React component)
const nodes = useScene((state) => state.nodes)
const levelId = useViewer((state) => state.selection.levelId)
const activeTool = useEditor((state) => state.tool)

// Access state outside React (callbacks, systems)
const node = useScene.getState().nodes[id]
useViewer.getState().setSelection({ levelId: 'level_123' })
```

---

## Core Concepts

### Nodes

Nodes are the data primitives that describe the 3D scene. All nodes extend `BaseNode`:

```typescript
BaseNode {
  id: string              // Auto-generated with type prefix (e.g., "wall_abc123")
  type: string            // Discriminator for type-safe handling
  parentId: string | null // Parent node reference
  visible: boolean
  camera?: Camera         // Optional saved camera position
  metadata?: JSON         // Arbitrary metadata (e.g., { isTransient: true })
}
```

**Node Hierarchy:**

```
Site
└── Building
    └── Level
        ├── Wall → Item (doors, windows)
        ├── Slab
        ├── Ceiling → Item (lights)
        ├── Roof
        ├── Zone
        ├── CadSketch
        ├── CadBody
        ├── Scan (3D reference)
        └── Guide (2D reference)
```

Nodes are stored in a **flat dictionary** (`Record<id, Node>`), not a nested tree. Parent-child relationships are defined via `parentId` and `children` arrays.

---

### Scene State (Zustand Store)

The scene is managed by a Zustand store in `@pascal-app/core`:

```typescript
useScene.getState() = {
  nodes: Record<id, AnyNode>,  // All nodes
  rootNodeIds: string[],       // Top-level nodes (sites)
  dirtyNodes: Set<string>,     // Nodes pending system updates

  createNode(node, parentId),
  updateNode(id, updates),
  deleteNode(id),
}
```

**Middleware:**
- **Persist** - Saves to IndexedDB (excludes transient nodes)
- **Temporal** (Zundo) - Undo/redo with 50-step history

---

### Scene Registry

The registry maps node IDs to their Three.js objects for fast lookup:

```typescript
sceneRegistry = {
  nodes: Map<id, Object3D>,    // ID → 3D object
  byType: {
    wall: Set<id>,
    item: Set<id>,
    zone: Set<id>,
    // ...
  }
}
```

Renderers register their refs using the `useRegistry` hook:

```tsx
const ref = useRef<Mesh>(null!)
useRegistry(node.id, 'wall', ref)
```

This allows systems to access 3D objects directly without traversing the scene graph.

---

### Node Renderers

Renderers are React components that create Three.js objects for each node type:

```
SceneRenderer
└── NodeRenderer (dispatches by type)
    ├── BuildingRenderer
    ├── LevelRenderer
    ├── WallRenderer
    ├── SlabRenderer
    ├── ZoneRenderer
    ├── ItemRenderer
    └── ...
```

**Pattern:**
1. Renderer creates a placeholder mesh/group
2. Registers it with `useRegistry`
3. Systems update geometry based on node data

Example (simplified):
```tsx
const WallRenderer = ({ node }) => {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'wall', ref)

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0, 0, 0]} />  {/* Replaced by WallSystem */}
      <meshStandardMaterial />
      {node.children.map(id => <NodeRenderer key={id} nodeId={id} />)}
    </mesh>
  )
}
```

---

### Systems

Systems are React components that run in the render loop (`useFrame`) to update geometry and transforms. They process **dirty nodes** marked by the store.

**Core Systems (in `@pascal-app/core`):**

| System | Responsibility |
|--------|---------------|
| `WallSystem` | Generates wall geometry with mitering and CSG cutouts for doors/windows |
| `SlabSystem` | Generates floor geometry from polygons |
| `CeilingSystem` | Generates ceiling geometry |
| `RoofSystem` | Generates roof geometry |
| `ItemSystem` | Positions items on walls, ceilings, or floors (slab elevation) |
| `CadBodyRuntimeSystem` | Editor-owned CAD runtime loop that regenerates `cad-body` nodes through the external CAD helper and writes preview/CAD artifacts back to scene state |

**Viewer Systems (in `@pascal-app/viewer`):**

| System | Responsibility |
|--------|---------------|
| `LevelSystem` | Handles level visibility and vertical positioning (stacked/exploded/solo modes) |
| `ScanSystem` | Controls 3D scan visibility |
| `GuideSystem` | Controls guide image visibility |

**Processing Pattern:**
```typescript
useFrame(() => {
  for (const id of dirtyNodes) {
    const obj = sceneRegistry.nodes.get(id)
    const node = useScene.getState().nodes[id]

    // Update geometry, transforms, etc.
    updateGeometry(obj, node)

    dirtyNodes.delete(id)
  }
})
```

---

### Dirty Nodes

When a node changes, it's marked as **dirty** in `useScene.getState().dirtyNodes`. Systems check this set each frame and only recompute geometry for dirty nodes.

```typescript
// Automatic: createNode, updateNode, deleteNode mark nodes dirty
useScene.getState().updateNode(wallId, { thickness: 0.2 })
// → wallId added to dirtyNodes
// → WallSystem regenerates geometry next frame
// → wallId removed from dirtyNodes
```

**Manual marking:**
```typescript
useScene.getState().dirtyNodes.add(wallId)
```

---

### Event Bus

Inter-component communication uses a typed event emitter (mitt):

```typescript
// Node events
emitter.on('wall:click', (event) => { ... })
emitter.on('item:enter', (event) => { ... })
emitter.on('zone:context-menu', (event) => { ... })

// Grid events (background)
emitter.on('grid:click', (event) => { ... })

// Event payload
NodeEvent {
  node: AnyNode
  position: [x, y, z]
  localPosition: [x, y, z]
  normal?: [x, y, z]
  stopPropagation: () => void
}
```

---

### Spatial Grid Manager

Handles collision detection and placement validation:

```typescript
spatialGridManager.canPlaceOnFloor(levelId, position, dimensions, rotation)
spatialGridManager.canPlaceOnWall(wallId, t, height, dimensions)
spatialGridManager.getSlabElevationAt(levelId, x, z)
```

Used by item placement tools to validate positions and calculate slab elevations.

---

## Editor Architecture

The editor extends the viewer with:

### Tools

Tools are activated via the toolbar and handle user input for specific operations:

- **SelectTool** - Selection and manipulation
- **WallTool** - Draw walls
- **ZoneTool** - Create zones
- **ItemTool** - Place furniture/fixtures
- **SlabTool** - Create floor slabs
- **CAD Sketch Tools** - Create and edit `cad-sketch` entities, constraints, and dimensions
- **CAD Solid Tools** - Extrude, revolve, Boolean, fillet, chamfer, import STEP, export STEP

### Selection Manager

The editor uses a custom selection manager with hierarchical navigation:

```
Site → Building → Level → Zone → Items
```

Each depth level has its own selection strategy for hover/click behavior.

### Editor-Specific Systems

- `ZoneSystem` - Controls zone visibility based on level mode
- Custom camera controls with node focusing

---

## Data Flow

```
User Action (click, drag)
       ↓
Tool Handler
       ↓
useScene.createNode() / updateNode()
       ↓
Node added/updated in store
Node marked dirty
       ↓
React re-renders NodeRenderer
useRegistry() registers 3D object
       ↓
System detects dirty node (useFrame)
Updates geometry via sceneRegistry
Clears dirty flag
```

---

## Pistola CAD Flow

The CAD workflow adds a second, helper-backed modeling loop on top of the existing building editor:

```
CAD tool or CAD AI prompt
  ↓
useEditor / useCad actions
  ↓
cad-sketch / cad-body nodes stored in useScene
  ↓
CadBodyRuntimeSystem submits regenerate/import/export jobs
  ↓
local CAD helper (FastAPI on 127.0.0.1:7878 by default)
  ↓
artifact refs + preview data written back to cad-body
  ↓
CadSketchRenderer / CadBodyRenderer update the scene
```

Key CAD pieces:

- `packages/core/src/schema/nodes/cad-sketch.ts` and `cad-body.ts` define the CAD node contracts.
- `packages/editor/src/components/systems/cad/` owns helper-backed regeneration.
- `packages/viewer/src/components/renderers/cad-sketch/` and `cad-body/` render sketch entities and solid previews.
- `packages/editor/src/store/use-cad.ts` and `use-editor.tsx` coordinate CAD phase state and helper entry points.
- `apps/editor/app/api/cad/*` proxies the helper for CAD helper-backed operations.
- `apps/editor/app/api/assistant/plan/route.ts` exposes the general assistant planner route.
- `apps/editor/components/editor/AiAssistantPanel.tsx` provides prompt → plan/review → scene execution in the app shell, with CAD as one capability.

---

## Technology Stack

- **React 19** + **Next.js 16**
- **Three.js** (WebGPU renderer)
- **React Three Fiber** + **Drei**
- **Zustand** (state management)
- **Zod** (schema validation)
- **Zundo** (undo/redo)
- **three-bvh-csg** (Boolean geometry operations)
- **Turborepo** (monorepo management)
- **Bun** (package manager)

---

## Getting Started

### Development

Run the development server from the **root directory** to enable hot reload for all packages:

```bash
# Install dependencies
bun install

# Run development server (builds packages + starts editor with watch mode)
bun dev

# This will:
# 1. Build @pascal-app/core and @pascal-app/viewer
# 2. Start watching both packages for changes
# 3. Start the Next.js editor dev server
# Open http://localhost:3000
```

**Important:** Always run `bun dev` from the root directory to ensure the package watchers are running. This enables hot reload when you edit files in `packages/core/src/` or `packages/viewer/src/`.

### CAD Helper

The building editor can run without the CAD helper, but CAD sketch-to-solid, STEP import/export, and CAD AI execution require the local helper runtime.

The integrated Pistola workspace now lives entirely under `editor/`:

- `third_party/FreeCAD` holds the FreeCAD source submodule
- `tooling/freecad-helper` holds the Python helper that bridges the editor to `FreeCADCmd.exe`
- `apps/editor` owns the assistant shell and helper proxy routes

By default, `apps/editor` auto-starts `tooling/freecad-helper` the first time the app checks CAD health or creates a CAD job whenever `PISTOLA_CAD_HELPER_RUNTIME=python` and `PISTOLA_CAD_HELPER_URL` points at a local loopback URL such as `http://127.0.0.1:7878` or `http://localhost:7878`.

When you use the Python helper runtime, `FREECAD_PATH` is optional. If you omit it, the helper auto-detects common integrated Windows outputs such as `editor/third_party/FreeCAD/build/release/bin/FreeCADCmd.exe`, `editor/third_party/FreeCAD/build/debug/bin/FreeCADCmd.exe`, `editor/third_party/FreeCAD/build/bin/FreeCADCmd.exe`, and `editor/third_party/FreeCAD/.pixi/envs/default/Library/bin/FreeCADCmd.exe`. The helper fails fast if none of those outputs nor `FREECAD_PATH` exists.

If you need to run the canonical helper manually from the repository root:

```bash
cd tooling/freecad-helper
python -m uvicorn main:app --host 127.0.0.1 --port 7878
```

If you explicitly want the bundled mock helper instead, set `PISTOLA_CAD_HELPER_RUNTIME=mock` and run:

```bash
cd tooling/cad-helper
node server.mjs
```

Useful environment variables:

- Active app env file: `apps/editor/.env.local`
- Example template: `apps/editor/.env.example`
- `POSTGRES_URL` — required server-side Postgres connection string for app-managed email/password accounts
- `BETTER_AUTH_SECRET` — required secret used to sign Pistola session cookies
- `PISTOLA_CAD_HELPER_RUNTIME` — optional helper lifecycle mode; defaults to `python` on loopback URLs and `external` for remote URLs. Use `mock` only for the bundled scaffold helper.
- `PISTOLA_CAD_HELPER_URL` — optional server-side helper URL used by `apps/editor/app/api/cad/*`; loopback URLs auto-start only when the runtime mode is `python` or `mock`, while remote URLs are treated as externally managed
- `NEXT_PUBLIC_CAD_HELPER_URL` — optional explicit client-side helper URL used by the core CAD helper client; defaults to `http://127.0.0.1:7878`
- `FREECAD_PATH` — optional override for the FreeCAD executable; if omitted, the helper auto-detects the common integrated `FreeCADCmd.exe` outputs under `editor/third_party/FreeCAD`
- `PISTOLA_AI_PROVIDER` — optional global provider override; use `openai`, `openrouter`, or `fallback`
- `PISTOLA_ASSISTANT_AI_PROVIDER` / `PISTOLA_CAD_AI_PROVIDER` — optional per-surface overrides that take precedence over `PISTOLA_AI_PROVIDER`; the integrated assistant defaults to `codex`
- `OPENAI_API_KEY` — recommended server-side credential for the built-in assistant and CAD planners, including the Codex SDK assistant path. The assistant can also use cached Codex CLI login state from `~/.codex/auth.json` on trusted local machines.
- `PISTOLA_ASSISTANT_MODEL` — optional; defaults to `gpt-5.3-codex` when `PISTOLA_ASSISTANT_AI_PROVIDER=codex`, otherwise follows the current OpenAI/OpenRouter assistant defaults
- `PISTOLA_ASSISTANT_REASONING_EFFORT` — optional Codex-only setting; use `low`, `medium`, `high`, or `xhigh`
- `OPENROUTER_API_KEY` — optional alternative provider credential
- `PISTOLA_CAD_AI_API_KEY` — optional backward-compatible alias for `OPENROUTER_API_KEY`
- `PISTOLA_CAD_AI_BASE_URL` — optional; for OpenRouter use the API root like `https://openrouter.ai/api/v1`; for direct OpenAI use the full Responses endpoint like `https://api.openai.com/v1/responses`
- `PISTOLA_CAD_MODEL` — optional; defaults to `openrouter/free` with OpenRouter and `gpt-5.4` with direct OpenAI
- `PISTOLA_CAD_AI_HTTP_REFERER` / `PISTOLA_CAD_AI_TITLE` — optional request metadata headers for compatible providers such as OpenRouter

`/api/assistant/plan` is the primary AI route for the app shell. Codex is the single control plane for scene edits and CAD prompting, while `/api/cad/*` stays focused on helper health and execution.

`run_cad_prompt` remains available only as a backward-compatible internal macro. Standard CAD prompting now resolves back through the assistant route into direct actions such as `execute_cad_brief`, not through a separate CAD planner surface.

Users now sign in through Pistola's own email/password flow at `/login`. They may choose the same email address they use with OpenAI, but OpenAI only powers the assistant server-side through API credentials and is not the identity provider for end-user accounts.

### Building for Production

```bash
# Build all packages
turbo build

# Build specific package
turbo build --filter=@pascal-app/core
```

### Publishing Packages

```bash
# Build packages
turbo build --filter=@pascal-app/core --filter=@pascal-app/viewer

# Publish to npm
npm publish --workspace=@pascal-app/core --access public
npm publish --workspace=@pascal-app/viewer --access public
```

---

## Key Files

| Path | Description |
|------|-------------|
| `packages/core/src/schema/` | Node type definitions (Zod schemas) |
| `packages/core/src/store/use-scene.ts` | Scene state store |
| `packages/editor/src/components/systems/cad/` | CAD helper-backed body regeneration |
| `packages/core/src/hooks/scene-registry/` | 3D object registry |
| `packages/core/src/systems/` | Geometry generation systems |
| `packages/viewer/src/components/renderers/` | Node renderers, including `cad-sketch` and `cad-body` |
| `packages/viewer/src/components/viewer/` | Main Viewer component |
| `packages/editor/src/components/tools/` | Editor tools, including CAD sketch/solid tools |
| `packages/editor/src/store/` | Editor and CAD Zustand stores |
| `apps/editor/app/api/cad/` | Helper proxy routes for CAD helper-backed operations |
| `apps/editor/app/api/assistant/plan/route.ts` | Always-on assistant planning endpoint |
| `apps/editor/components/editor/AiAssistantPanel.tsx` | Always-on assistant UI for chat, review, and execution |
| `tooling/freecad-helper/` | Integrated Python helper that runs FreeCAD-backed CAD jobs |
| `third_party/FreeCAD/` | FreeCAD source submodule used for local CAD execution builds |
