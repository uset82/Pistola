# Pistola — Future Implementation Roadmap

This document expands the two core ideas that will shape Pistola's next major capabilities into concrete features, architecture notes, and execution milestones.

---

## Idea 1: Automated 2D Permit Drawings from 3D Models

> *"Does anyone know of a program that can automate 2D floor plans for building permits? Everyone does 3D but city and county building departments want 2D elevations, plot plans, etc."*

### The Opportunity

Building departments across the world still require flat 2D deliverables: floor plans, site/plot plans, roof plans, sections, and elevation drawings — often at specific scales with specific annotation conventions. Most modern tools focus on 3D visualization and leave the permit drawing step as a tedious manual export-and-redraw workflow.

Pistola already has the 3D scene graph, wall/slab/roof/door/window primitives, and level hierarchy. Generating compliant 2D output from that data is a natural next step and a **massive differentiator**, because almost no AI-native tool does this today.

### Feature Scope

#### 1. 2D Drawing Engine

- **Orthographic projection system** — project 3D scene geometry onto standard architectural planes (top-down plan, front/back/left/right elevations, cross-sections).
- **Level-aware slicing** — cut through the model at each level's floor elevation + a configurable offset height (typically 1.2 m / 4 ft above floor for plan views) to produce accurate floor plans.
- **Hidden-line removal** — compute which edges are hidden behind solid geometry and render them as dashed lines (standard architectural convention).
- **Section cuts** — let the user place a section plane interactively in 3D and produce a 2D section drawing with poché hatching for cut-through solids.

#### 2. Annotation and Dimensioning Layer

- **Auto-dimensioning** — detect wall lengths, room widths, door/window openings and place dimensions automatically. Allow the user to adjust, add, or remove dimensions.
- **Room labels** — compute enclosed areas (using the zone system already in pascalorg/editor) and label rooms with name + area in sq ft / sq m.
- **Door/window schedules** — generate a table listing every door and window with its type, size, and location.
- **Scale bars and title blocks** — provide standard title block templates (A1, A2, ARCH D, ANSI D) with project name, date, scale, and drawing number fields.

#### 3. Drawing Types (aligned with typical permit submission requirements)

| Drawing Type | Source Data | Notes |
|---|---|---|
| **Site / Plot Plan** | Site node + building footprint at ground level | Show setbacks, lot lines, north arrow, driveway |
| **Floor Plan** (per level) | Level slice at cut height | Walls, doors, windows, stairs, fixtures, dimensions |
| **Roof Plan** | Top-down projection of roof nodes | Ridge lines, hip lines, valleys, slopes annotated |
| **Exterior Elevations** (4 sides) | Orthographic side projections | Show finish grades, roof profiles, fenestration |
| **Building Section** (at least 1) | User-placed section plane | Foundation-to-ridge cut, floor/ceiling thicknesses |
| **Electrical / Plumbing Plans** | Future overlay layers | Optional for initial release |

#### 4. Export Formats

- **SVG** — scalable vector output, embeddable in web viewers; primary internal format.
- **DXF / DWG** — industry-standard CAD interchange for departments that require AutoCAD-compatible files. Use an open DXF writer (like `dxf-writer` or a Rust/WASM library).
- **PDF** — for direct submission. Render SVG to PDF with correct scale (e.g., 1/4" = 1'-0") and sheet layout.

#### 5. AI-Assisted Drawing Generation

Integrate with Pistola's existing AI assistant so the user can say:

- *"Generate permit drawings for this house."*
- *"Create a floor plan for Level 1 with dimensions."*
- *"Show me the north elevation."*
- *"Add a building section through the kitchen."*

The assistant decomposes the request, calls the drawing engine, and presents the result as a 2D overlay or downloadable export.

#### 6. Compliance Helpers (longer-term)

- **Jurisdiction templates** — pre-configured annotation and scale requirements for specific cities/counties.
- **Setback visualization** — overlay minimum setback distances from lot lines and flag violations.
- **Code-required annotations** — auto-add egress paths, fire ratings, accessibility symbols where applicable.

### Architecture Notes

- The 2D drawing engine should live in a new package: `packages/drawings` (or `packages/2d-engine`).
- It reads from `@pascal-app/core`'s scene graph (nodes, transforms, levels) but does NOT modify the 3D scene.
- Output is a structured drawing model (sheets, views, annotations) that can be serialized to SVG/DXF/PDF.
- The AI assistant gains new action types: `generate_floor_plan`, `generate_elevation`, `generate_section`, `export_permit_set`.

### Milestones

1. **M1 — Orthographic Projection MVP**: top-down floor plan from level slice, walls + openings only, SVG output.
2. **M2 — Elevations and Sections**: four-sided elevations, user-placed section cuts, hidden-line removal.
3. **M3 — Auto-Dimensioning and Annotations**: wall dims, room labels, area calculations, door/window schedules.
4. **M4 — Sheet Layout and PDF Export**: title blocks, scale management, multi-sheet PDF generation.
5. **M5 — DXF/DWG Export**: full CAD interchange format for department submission.
6. **M6 — AI Integration**: natural-language commands to generate and customize drawings via the assistant.

---

## Idea 2: Instant 3D from Sketches — "The End of Render Wait Time"

> *"Three.js + Nano Banana 2 is the end of the 'render wait time.' Converting a napkin sketch into a functional, interactive 3D web model in seconds is the new standard."*

### The Opportunity

The traditional 3D workflow is: sketch → model in CAD → wait for render → review → iterate. Each cycle takes minutes to hours. With Pistola's real-time Three.js viewport, AI-powered scene generation, and the emerging ecosystem of fast vision models, the goal is to collapse that entire cycle into seconds.

A user draws something on paper (or a tablet), takes a photo, pastes it into Pistola's chat, and immediately gets a live, interactive, editable 3D model in the browser. No export step, no render queue, no waiting.

### Feature Scope

#### 1. Sketch-to-3D Pipeline

- **Image intake** — accept photos, screenshots, scans, or digital drawings via paste, upload, or drag-and-drop. (Partially implemented: `onPaste` handler and `attachImageFile` already exist.)
- **Sketch analysis** — use a vision model (Gemini 2.5 Pro via the existing API key) to:
  - Identify the type of sketch (floor plan, object, furniture, building facade, mechanical part).
  - Extract geometric primitives: lines, curves, rectangles, circles, dimensions, labels.
  - Infer proportions and spatial relationships.
  - Detect annotation text (handwritten dimensions, room names).
- **Scene brief generation** — convert the analysis into a Pistola `CadBrief` or a structured scene plan (nodes, hierarchy, transforms, materials).
- **Instant 3D generation** — execute the brief through the existing `executeCadBrief` pipeline to produce live geometry in the Three.js viewport. No server-side rendering. No waiting.

#### 2. Sketch Types and Handling

| Sketch Type | AI Interpretation | 3D Output |
|---|---|---|
| **Napkin floor plan** | Detect walls, rooms, doors, windows | Multi-room level with openings |
| **Object sketch** | Identify silhouette, symmetry, profile | Extruded or revolved CAD body |
| **Furniture sketch** | Match to catalog or generate primitive proxy | Placed item node with correct scale |
| **Building facade** | Detect stories, fenestration, roof profile | Multi-level structure with facade detail |
| **Mechanical part** | Identify cross-section, features, holes | Parametric CAD body with operations |
| **Interior perspective** | Extract layout, furniture, proportions | Furnished room scene |

#### 3. Progressive Refinement Loop

The sketch is just the starting point. After the initial 3D is generated:

- The user can **refine by chat**: *"Make the kitchen bigger"*, *"Add a second floor"*, *"Round the corners."*
- The user can **paste another sketch** to modify or extend the model.
- The user can **switch to manual tools** (wall tool, CAD sketch, item placement) for precision edits.
- The AI maintains context of the original sketch intent, so refinements are coherent.

#### 4. Real-Time Rendering Pipeline (Three.js + Future GPU Enhancements)

- **Instant preview** — geometry appears in the viewport as the AI generates it, node by node. No batch render step.
- **Progressive LOD** — start with box proxies, refine to detailed meshes as CAD helper returns results.
- **Material intelligence** — AI infers materials from sketch context (wood texture for floor, glass for windows, concrete for walls) and applies PBR materials automatically.
- **Lighting presets** — auto-apply appropriate lighting: architectural interior for floor plans, studio for product shots, outdoor for buildings.

#### 5. Multi-Modal Input Support

Beyond static sketches, expand input to include:

- **Photo of a real space** — AI interprets the photo, estimates room dimensions, and generates a matching 3D model.
- **Voice description** — combine speech-to-text with the existing prompt pipeline for hands-free modeling.
- **Video walkthroughs** — extract multiple views from a video to build a more accurate 3D reconstruction.
- **PDF floor plans** — architect-grade floor plans imported and converted to editable 3D geometry.

#### 6. Edge Rendering and Sketch Style Output

Close the loop: not only can you go FROM sketch TO 3D, but you can go FROM 3D BACK TO sketch:

- **NPR (non-photorealistic) rendering** — render the 3D model with sketch-like edge lines, hatching, and hand-drawn aesthetics.
- **Client presentation mode** — show the model in a "concept sketch" style for early design conversations.
- **Before/after comparison** — display the original napkin sketch side-by-side with the generated 3D model.

### Architecture Notes

- The sketch analysis layer should be a new module: `lib/assistant/sketch-analysis.ts` (or a dedicated package if it grows).
- It receives an image (data URL) and returns a structured analysis: detected primitives, inferred type, extracted dimensions, confidence scores.
- The analysis feeds into the existing `promptToCadBrief` or a new `sketchToCadBrief` function.
- The image intent selector (already partially built: `auto`, `workspace`, `reference`, `floorplan`, `sketch`) guides the analysis model.
- Progressive generation can use the existing `executionEvents` system to show real-time feedback.

### Milestones

1. **S1 — Sketch Classification**: when the user pastes an image, the AI classifies it (floor plan, object, facade, etc.) and reports the type.
2. **S2 — Floor Plan Extraction**: detect walls, rooms, and openings from a sketched floor plan and generate a multi-room level.
3. **S3 — Object Profile Extraction**: detect the silhouette of a sketched object and generate an extruded or revolved CAD body.
4. **S4 — Dimension Extraction**: read handwritten or printed dimensions from sketches and apply them to generated geometry.
5. **S5 — Photo-to-3D**: accept a photo of a real room or object and generate a matching 3D model.
6. **S6 — Progressive Refinement**: maintain sketch-to-3D context across multiple chat turns for iterative improvements.

---

## How These Two Ideas Connect

These features are complementary halves of a full architecture workflow:

```
Napkin Sketch ──► [Sketch-to-3D Pipeline] ──► Live 3D Model ──► [2D Drawing Engine] ──► Permit-Ready PDFs
     ▲                                            │                                          │
     └────────── Refine by Chat ◄──────────────────┘                                          │
                                                                                              ▼
                                                                                    Building Department
```

A user can go from a hand-drawn floor plan on a napkin → interactive 3D model → permit-ready 2D drawings in a single session, using natural language to guide every step. That is the Pistola vision: **from idea to prototype to project, without leaving the editor.**

---

## Priority and Sequencing

| Priority | Feature | Dependency | Value |
|---|---|---|---|
| **P0** | Image classification + floor plan extraction (S1–S2) | Existing Gemini API | Unlocks the sketch-to-3D story |
| **P1** | Top-down floor plan SVG output (M1) | Scene graph access | Immediate utility for permit workflow |
| **P2** | Object sketch-to-CAD (S3) | CAD brief pipeline | Expands modeling to product/mechanical |
| **P3** | Auto-dimensioning + annotations (M3) | M1 floor plans | Makes 2D output professionally usable |
| **P4** | Elevations and sections (M2) | Orthographic projection | Completes the permit drawing set |
| **P5** | PDF + DXF export (M4–M5) | Drawing model | Makes output submittable |
| **P6** | Photo-to-3D and voice input (S5) | Vision model maturity | Expands input modalities |

---

## Technical Dependencies to Investigate

- **DXF/DWG writer** — evaluate `dxf-writer`, `js-dxf`, or a Rust/WASM-based library for reliable CAD file output.
- **PDF generation** — evaluate `pdf-lib`, `jsPDF`, or server-side rendering with Puppeteer for scaled architectural sheets.
- **Vision model quality** — test Gemini 2.5 Pro's ability to extract geometric primitives from hand-drawn sketches (accuracy, consistency, hallucination rate).
- **SVG rendering in Three.js** — for overlaying 2D drawing previews directly in the 3D viewport.
- **Font embedding** — architectural annotation fonts (like RomanS or similar SHX-style fonts used in CAD) for professional-looking output.
