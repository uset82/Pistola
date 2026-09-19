# Reliable, good-looking creations from IDE agents (plan)

## Context

IDE agents now drive Pistola directly (`docs/tasks/TASK-ide-direct-control.md`), but their objects are
crude. The recorded e2e "sailboat" (`docs/tasks/evidence/ide-direct-control/sailboat-local.png`) is four
primitives, with a half-buried keel and nothing framed. It looks like "a block with a stick". The user
asked how to make models create anything good, and whether the IDE should generate an image and trace it.

**User decisions**
- Objects must look right **and** stay editable (Pistola parts only, no generated meshes).
- General purpose ("whatever they want").
- Reference images come from IDEs that can make them (Codex: gpt-image; Cursor and Antigravity: Nano
  Banana Pro) or from user uploads made on free sites. Pistola does not generate images, since no free
  image model exists on OpenRouter.
- Plan now; build only after the Cursor session working in this area (`1ec0ac3`, `f649695`) has
  committed and gone quiet.

**Answer: image first, then trace? Not as the default.**
Research, 2024–2026 (links in the research notes that go into the task doc):
- **Error feedback is the biggest, cheapest win.** 3DCodeBench (12 frontier models writing 3D code):
  - showing the model its errors, with ≤2 retries, raised runnable output from 0.69 to 0.97 and likeness
    by +0.128;
  - agent harnesses improved runnability but **not shape**;
  - the typical failure is floating or disconnected parts.
- **Generated images alone make things worse.** A generated photo alone scored below text-only on 4 of
  5 models. Text plus photo helped only the strongest models, slightly. Self-critique against reference
  images was about zero or negative.
- **Planning, retrieval and bounded render checks work.** SceneCraft (+45%), LL3M, CADCodeVerify
  (saturates after about 2 rounds) and VIGA (+35%, multi-view plus memory).
- **Tracing works only on clean, dimensioned orthographic views, traced by an algorithm.** Ortho2CAD
  reports IoU 0.78 → 0.85 with a compare loop; from realistic renders, models reach only 0.21–0.28
  (BenchCAD). A visual hull from three silhouettes suits boxy objects, not concave or organic ones.
- **So tracing is an optional mode** for user photos or sketches and prismatic objects. The default
  pipeline is plan → build → check → fix → render → critique → keep best.

**Repo facts that shape the plan**
- `validateAssistantPlan` (`execute.ts:810`) throws on the first bad action, with no index, and never
  runs the kernel, so "validate ok" can still fail at run time.
- Every `revolve` is open: `local-kernel.ts` skips the closing edge.
- The manual's extrude axis is wrong: the code uses the [x,z] polygon extruded along +Y.
- CAD body bounds return `null`, from the bbox shape mismatch between `agent-tools.ts` and `execute.ts`.
- `build_cad_solid` has no rotation, even though `CadBodyNodeSchema` has it. There is no
  `update_cad_solid`, so fixes need a destructive delete that changes ids.
- `pistola_screenshot` captures the whole page, UI included. There are no exact orthographic poses.
- `silhouette-tracer.ts` exists but isn't exposed, and expects a different sheet layout than the concept
  prompts.
- The Studio loop skills (`pistola-studio`, `pistola-image-to-blueprint`, `pistola-visual-critique`,
  `.codex/agents/*`) are Codex-only.
- `CREATION_RECIPES` (8) exist, but `runRecipe` is not on the `invoke` allowlist.
- Reusable dependencies are already installed: `THREE.ShapeUtils.triangulateShape` (robust
  triangulation) and `three-mesh-bvh` (mesh distances for contact checks).

## Ticking rules
The same as `TASK-ide-direct-control.md`:
- `[x]` only with `— evidence: <command> → <result>`;
- blocked items stay open with `BLOCKED:`;
- `scripts/validate-task-evidence.mjs` must pass;
- stage only this phase's files; never stash, reset, switch the tree or `add -A`;
- re-check `git log` before each phase.

## Checklist (becomes `docs/tasks/TASK-reliable-creation.md`)

### Phase 0: Gate, benchmark harness, baseline
- [ ] The Cursor session is quiet and the tree is clean at or after `f649695`.
- [ ] Create the task doc, including the research notes with links, and
  `docs/tasks/evidence/creation-quality/`.
- [ ] MCP call log `PISTOLA_MCP_LOG=<jsonl>` records tool, ok, error codes and ms. Add a read-only
  `exportScene` to the allowlist.
- [ ] `editor/scripts/creation-benchmark/`, reusing the MCP stdio client from
  `ide-direct-control-e2e.mjs`:
  - `prompts.json`: 12 prompts, each with overall dimensions, required parts and relations.
    - Dev set: chair, table lamp, sailboat, toy car, wall bracket, dog.
    - Held-out set: bench, mug, desk fan, wheelbarrow, rocket, bookshelf. These never become examples.
  - `gold/<slug>.json`: hand-built, check-clean batches. They give gold orthographic masks, so IoU needs
    no image generation.
  - `run.mjs` modes:
    - `replay`;
    - `agent --cli codex|claude` (headless, fixed instructions, 3 seeds);
    - `manual` for Cursor and Antigravity.
  - `score.mjs` recomputes all metrics from logs and scenes, so earlier runs can be re-scored.
- [ ] Metrics:
  - first-try and final runnable rate, retries per part;
  - floating and ungrounded parts;
  - overall and per-part dimension error;
  - part coverage;
  - IoU vs gold;
  - blinded rubric score;
  - tool calls and time.
- [ ] Baseline run with today's tools.
- [ ] Checkpoint: `baseline/scores.json` exists, and replaying a gold batch gives IoU 1.0.

### Phase 1: Truth and plumbing
Files: `lib/cad/{local-kernel,solid-spec}.ts`, new `lib/cad/views.ts`, `lib/assistant/{execute,agent-tools}.ts`,
`capabilities/cad.ts`, `lib/agent-api/index.ts`, `scripts/generate-agent-manual.mjs`.
- [ ] One frame everywhere: +Y up, +Z front, +X right, meters, bottom-center origins. `views.ts` defines
  each orthographic view's camera and screen axes, shared by the renderer, the tracer and the fitter.
- [ ] `intersect_profiles` takes plane-explicit `profileXY` / `profileZY` / `profileXZ` (2 or 3 of them);
  `side/topProfile` stay as aliases.
- [ ] Kernel fixes:
  - revolve closes, with caps when the angle is under 360;
  - `ShapeUtils` triangulation;
  - polygon cleanup (dedupe points, fix winding, reject self-intersections);
  - errors carry the spec path (`spec.children[1].polygon[4]`).
- [ ] `build_cad_solid` gains `rotation`, `partId` and `role`.
- [ ] New non-destructive `update_cad_solid {bodyId, spec?, position?, rotation?, color?}` that keeps the id.
- [ ] Fix bounds (the bbox shape) and compute world-space bounds through parents.
- [ ] `validate` checks each action (index + path) and dry-runs the kernel. Meshes are cached by spec hash
  for `run`, so validate-ok means run-ok.
- [ ] The manual is generated from code: frame, per-op origins, one executed example per op, and
  `manual({section})`. Add `runRecipe` to the allowlist.
- [ ] Checkpoint:
  - tests execute every manual example;
  - an asymmetric L-shape locks the view axes;
  - revolve has 0 open edges;
  - benchmark replay.

### Phase 2: Structural checker and feedback (largest expected gain)
Files: new `lib/structure/{scene-geometry,contact-graph,checks,report}.ts`, new
`packages/core/src/lib/primitive-geometry.ts` (shared with `item-renderer.tsx`).
- [ ] Every part becomes world triangles plus an axis-aligned box. Tolerance is max(2 mm, 0.5% of the
  assembly diagonal).
- [ ] Per-body checks:
  - `EMPTY_RESULT`;
  - `NOOP_DIFFERENCE`;
  - `DISJOINT_SHELLS`;
  - `OPEN_MESH`;
  - `DEGENERATE`;
  - `BUDGET` (over 50k triangles).
- [ ] Assembly checks:
  - contact graph: box broadphase, then `three-mesh-bvh` distance;
  - `FLOATING_PART`;
  - `UNGROUNDED` / `BELOW_FLOOR`;
  - `BURIED_PART`;
  - `DUPLICATE_PART`;
  - `EXCESSIVE_OVERLAP` (warning).
- [ ] Issues are structured:
  ```
  {code, severity, actionIndex, specPath?, partId, otherPartId?, measured, fix:{hint, patch?}}
  ```
  - Floating parts get a `move_target {delta}` patch.
  - At most 20 issues, errors first.
- [ ] `checkStructure` / `pistola_check`. `run` and `taskPlan.runStep` embed the report automatically, so
  agents can't skip feedback.
- [ ] Keep-best:
  - the plan keeps its best snapshot;
  - `taskPlan.restoreBest`;
  - regressions are flagged;
  - opt-in `strict` reverts the step.
- [ ] Skill rule: at most 2 retries per step using the issue list, then fall back to a simpler technique.
- [ ] Checkpoint: fixtures (floating mast, sunk keel, no-op cut, open revolve) produce their expected
  codes, and the patches clear them; the 8 recipes are validated and fixed; benchmark run.

### Phase 3: Plan contract (blueprint v2)
Files: new `lib/blueprint/{schema,check}.ts`, `lib/operator-plan/operator-plan.ts`,
`.agents/skills/pistola-image-to-blueprint` (blueprint schema v2).
- [ ] Blueprint fields:
  - `frame`, `overall_m`, `anchor: floor|wall|none`;
  - parts `{id, name, role, technique, dims_m, position_m, rotation_deg, color, parent, mirrorOf?, count?}`;
  - relations `{a, aFace, rel: touches|on_top_of|inside|centered_on|mirror_of|gap_ok, b, bFace, tol_m?}`;
  - acceptance ratios.
- [ ] `plan.check` runs before any geometry:
  - references resolve;
  - parents are acyclic;
  - relations are consistent with the declared boxes;
  - the parts add up to `overall_m`.
- [ ] `taskPlan.create({blueprint})` generates one step per part (parent first), plus check and render
  steps.
- [ ] Scene-vs-plan checks: `PART_MISSING`, `DIM_MISMATCH` (over 10% is an error, over 5% a warning),
  `POSITION_MISMATCH`, `RELATION_VIOLATED`, `ACCEPTANCE_FAILED`.
- [ ] Relation snapper: deterministic translation patches that satisfy touches/on_top_of. It proposes
  them; it never applies them silently.
- [ ] Checkpoint: a sailboat plan with a wrong mast height is caught before the build, and the snapper
  fixes it; benchmark run.

### Phase 4: Retrieval (examples and subassemblies)
Files: new `lib/agent-examples/*`, `lib/agent-api/index.ts`, MCP `pistola_examples`, `.agents/library`.
- [ ] One technique example per op, in the canonical frame.
- [ ] Parameterized subassemblies, returned as editable actions with `partId`s plus a blueprint fragment:
  - leg set;
  - wheel + axle;
  - lathe profiles (bottle, shade, cup);
  - hollow container;
  - rail/ladder array;
  - handle/knob;
  - arm link;
  - tapered hull;
  - sail/fin;
  - quadruped blockout;
  - cabinet carcass.
- [ ] `examples.search` / `examples.get({id, params, at})`.
- [ ] Convert `CREATION_RECIPES` and `geometric-phone-stand` into replayable library entries. The library
  format is `{blueprint, batches, scores, renders}` with `$ref_*` / `LEVEL` placeholders.
- [ ] Checkpoint: every example builds with 0 checker errors; the held-out benchmark improves.

### Phase 5: Render views and fixed critique
Files: new `lib/render/{soft-raster,render-views}.ts` (Worker), MCP `pistola_render_views`,
`drivers/browser.ts` (canvas-only screenshot).
- [ ] A CPU rasterizer over the Phase 2 geometry. It is deterministic, shows no UI, works on WebGPU, Sites
  and tests, and needs no camera animation.
- [ ] Output: one 2×2 PNG.
  - Panels: FRONT, SIDE, TOP, ISO.
  - Flat shading with one hue per part and a legend.
  - 0.1 m grid, floor line, W×H×D labels.
  - Per-view masks.
  - IoU and a diff overlay (red = missing, blue = extra) when a gold or reference image exists.
- [ ] Fixed checklist returned with the render:
  - recognizable;
  - proportions vs the plan (numbers supplied);
  - every part visible;
  - worst view and the part causing it;
  - symmetry;
  - floating or sunk parts;
  - missing signature feature;
  - palette.

  The agent answers `{score, ≤3 fixes (partId + numeric change)}`.
- [ ] Policy: at most 2 rounds, keep the best, stop when there's no gain. Disable it for models where the
  benchmark shows harm.
- [ ] Checkpoint: the render test matches a known box; benchmark run.

### Phase 6 (gated): Reference mode and a minimal fitter
Start only if the Phase 5 benchmark shows outline and proportion errors dominate.
- [ ] `pistola_reference_add({path|dataUrl, layout: 'front|side|top' sheet, knownDimension})`. A reference
  is always paired with a text blueprint.
- [ ] A prompt pack for IDEs that generate images (one image holding all three views, black on white,
  orthographic), plus a user guide for making sheets on free sites (`docs/`).
- [ ] Tracer, in a Worker, built on `silhouette-tracer.ts`:
  - threshold for clean sheets; background removal (BiRefNet ONNX, MIT) only later, for photos;
  - components sorted left to right;
  - Moore contour tracing, then Douglas-Peucker simplification;
  - output in meters, in the `views.ts` frame;
  - cross-view consistency within ±5%.
- [ ] Uses: the IoU target for renders, and an optional 3-view hull blockout for prismatic main bodies.
- [ ] Minimal fitter:
  - coordinate descent, about 300 evaluations, in a Worker;
  - only translate and scale on at most 10 parts;
  - objective: IoU minus a relation-violation penalty;
  - returns a patch plus before/after IoU.
- [ ] Vertical guide planes (a `create_guide` action) show the reference behind the build.

### Phase 7 (gated on remaining failures): Richness and composition
- [ ] Loft (cross-sections along an axis), 3-view hull, and torus/capsule/ellipsoid in the kernel.
- [ ] Angle-based smooth normals; per-body `roughness` / `metalness` / `opacity`.
- [ ] A complexity budget, with kernel work in a Worker.
- [ ] CAD bodies render in the architecture world as real meshes, and items parented to bodies are no
  longer moved.

### Every phase
- [ ] Update `.agents/skills/pistola-direct-control/SKILL.md` with the loop:
  plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report.
- [ ] Turn the Codex-only Studio sub-agents into role sections that any IDE can follow.
- [ ] Regenerate the per-IDE files with `scripts/ide-setup.mjs` and run `--check`.
- [ ] Benchmark:
  - replay and score every phase;
  - full agent runs at baseline and after Phases 2, 4 and 5 (to limit IDE usage);
  - save `phase-N/scores.json` plus side-by-side renders.
- [ ] `validate-task-evidence.mjs` passes; 0 forbidden AI-route requests.

### Acceptance (held-out set, ≥2 headless IDEs, 3 seeds)
- [ ] Final runnable rate ≥ 95%.
- [ ] 0 floating parts in ≥ 90% of runs.
- [ ] Overall dimension error ≤ 5%.
- [ ] Part coverage ≥ 90%.
- [ ] Rubric score beats the baseline on ≥ 5 of 6 objects.
- [ ] IoU vs gold reported (no hard threshold).
- [ ] `bun run check-types`, the targeted `bun test` suites, `build:sites` and `smoke:sites` all pass.

## Reuse
- **Kernel and CAD:** `local-kernel.ts` (three-bvh-csg), `solid-spec.ts`, `silhouette-tracer.ts`.
- **Libraries already installed:** `THREE.ShapeUtils`, `three-mesh-bvh`.
- **Execution:** `validateAssistantPlan` / `executeAssistantPlan` (`execute.ts`), `move_target {delta}`
  for patches, the operator-plan store and `taskPlan`, `CREATION_RECIPES`.
- **Skills:** the Studio skills (blueprint schema, critique rubric, concept prompts) and `.agents/library`.
- **Tooling:** the MCP stdio client and static server in `editor/scripts/ide-direct-control-e2e.mjs`,
  `scripts/ide-setup.mjs`, `scripts/validate-task-evidence.mjs`.

## Verification
- **Per phase:** the checkpoint tests above, pasted as evidence.
- **Benchmark:** `node editor/scripts/creation-benchmark/run.mjs --mode replay|agent --cli codex|claude`
  then `score.mjs`. It writes scores and side-by-side renders to `docs/tasks/evidence/creation-quality/`.
- **Manual:** one object from Codex (it generates the reference sheet) and one from Claude Code (with an
  uploaded sheet) in Phase 6, compared with the reference.

## Risks
- **Checker false positives on intended gaps** (a hanging shade, wheel clearance): mitigated by `gap_ok`
  relations, severity tuning and a fixture set.
- **The checker or rasterizer disagreeing with the viewer:** mitigated by the shared primitive generator,
  and a test comparing extracted bounds with `Box3.setFromObject`.
- **Benchmark noise and overfitting:** mitigated by 3 seeds and the held-out split; the structural
  metrics decide the gate, not the rubric.
- **Dry-run cost:** mitigated by the spec-hash cache, the budget and a Worker.
- **Headless IDE runs use your plan quota:** agent runs are limited to four points; Cursor and Antigravity
  are manual.
- **The concurrent session overlapping this work:** mitigated by the Phase 0 gate and a `git log` check
  before each phase.
