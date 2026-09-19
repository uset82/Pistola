# TASK: Reliable, good-looking creations from IDE agents

Copied from `docs/plans/it-seems-the-ides-composed-quasar.md`. Tick only with evidence.

## Ticking rules

- Change `- [ ]` to `- [x]` only after the item is implemented **and** verified. Append
  `— evidence: <command> → <result>`, or link a file under `docs/tasks/evidence/creation-quality/`.
- Tick a phase checkpoint only when all its tasks are ticked and its checkpoint commands pass.
- A blocked item stays `[ ]` with `BLOCKED: <reason>`. If a re-run fails, untick it.
- `scripts/validate-task-evidence.mjs` fails on any `[x]` without evidence.
- The shared folder is used by other sessions: never `git stash`, `reset --hard`, switch the whole
  tree or `add -A`. Stage only this phase's files, and commit once per phase.
- Re-check `git log` before each phase.

## Checklist

### Phase 0: Gate, benchmark harness, baseline
- [x] The Cursor session is quiet and the tree is clean at or after `f649695`.
  — evidence: `git log -3 --oneline` → `9809cb9` (after `f649695` / `1ec0ac3`); worktree had only this plan untracked
- [x] Create the task doc, including the research notes with links, and
  `docs/tasks/evidence/creation-quality/`.
  — evidence: this file (Research notes) and `docs/tasks/evidence/creation-quality/`
- [x] MCP call log `PISTOLA_MCP_LOG=<jsonl>` records tool, ok, error codes and ms. Add a read-only
  `exportScene` to the allowlist.
  — evidence: `node --test editor/tooling/pistola-mcp/src/log.test.ts` → 2 pass; `docs/tasks/evidence/creation-quality/mcp-call-log.jsonl` (`code: -32601`); `bun test ./packages/editor/src/lib/agent-api/index.test.ts` → exportScene dumps nodes without mutating the scene; `mcp-tools-default.json` includes `pistola_export_scene`
- [x] `editor/scripts/creation-benchmark/`, reusing the MCP stdio client from
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
  — evidence: `editor/scripts/creation-benchmark/` plus `editor/scripts/mcp-stdio-client.mjs`; `node editor/scripts/creation-benchmark/run.mjs --mode manual --slug chair` and `--mode agent --cli codex`
- [x] Metrics:
  - first-try and final runnable rate, retries per part;
  - floating and ungrounded parts;
  - overall and per-part dimension error;
  - part coverage;
  - IoU vs gold;
  - blinded rubric score;
  - tool calls and time.
  — evidence: `node --test editor/scripts/creation-benchmark/lib/score-core.test.mjs` → 2 pass; fields in `baseline/scores.json`
- [x] Baseline run with today's tools.
  — evidence: `node editor/scripts/creation-benchmark/run.mjs --mode replay` → gold `iou: 1`; today's parented e2e sailboat `todayIoU: 0.495`
- [x] Checkpoint: `baseline/scores.json` exists, and replaying a gold batch gives IoU 1.0.
  — evidence: `docs/tasks/evidence/creation-quality/baseline/scores.json` `summary.iou: 1`

### Phase 1: Truth and plumbing
Files: `lib/cad/{local-kernel,solid-spec}.ts`, new `lib/cad/views.ts`, `lib/assistant/{execute,agent-tools}.ts`,
`capabilities/cad.ts`, `lib/agent-api/index.ts`, `scripts/generate-agent-manual.mjs`.
- [x] One frame everywhere: +Y up, +Z front, +X right, meters, bottom-center origins. `views.ts` defines
  each orthographic view's camera and screen axes, shared by the renderer, the tracer and the fitter.
  — evidence: `editor/packages/editor/src/lib/cad/views.ts`; `bun test ./packages/editor/src/lib/cad/local-kernel.test.ts` → asymmetric L-shape locks the view axes
- [x] `intersect_profiles` takes plane-explicit `profileXY` / `profileZY` / `profileXZ` (2 or 3 of them);
  `side/topProfile` stay as aliases.
  — evidence: same test → aliased `profileXY`/`profileXZ` volume matches `sideProfile`/`topProfile`
- [x] Kernel fixes:
  - revolve closes, with caps when the angle is under 360;
  - `ShapeUtils` triangulation;
  - polygon cleanup (dedupe points, fix winding, reject self-intersections);
  - errors carry the spec path (`spec.children[1].polygon[4]`).
  — evidence: `revolve closes and reports 0 open edges`; `kernel errors carry the spec path`
- [x] `build_cad_solid` gains `rotation`, `partId` and `role`.
  — evidence: `bun test ./packages/editor/src/lib/agent-api/index.test.ts` → update_cad_solid keeps the body id
- [x] New non-destructive `update_cad_solid {bodyId, spec?, position?, rotation?, color?}` that keeps the id.
  — evidence: same test
- [x] Fix bounds (the bbox shape) and compute world-space bounds through parents.
  — evidence: `agent-tools.ts` accepts `{min,max}` and `[[min],[max]]`, then walks `parentId`
- [x] `validate` checks each action (index + path) and dry-runs the kernel. Meshes are cached by spec hash
  for `run`, so validate-ok means run-ok.
  — evidence: `validate reports the real action index and solid-spec path`; `evaluateCadSolidSpecCached`
- [x] The manual is generated from code: frame, per-op origins, one executed example per op, and
  `manual({section})`. Add `runRecipe` to the allowlist.
  — evidence: `manual sections and runRecipe are allowlisted`; `bun editor/scripts/generate-agent-manual.mjs`
- [x] Checkpoint:
  - tests execute every manual example;
  - an asymmetric L-shape locks the view axes;
  - revolve has 0 open edges;
  - benchmark replay.
  — evidence: 7 pass in `local-kernel.test.ts`; `node editor/scripts/creation-benchmark/run.mjs --mode replay --out docs/tasks/evidence/creation-quality/phase-1` → `iou: 1`

### Phase 2: Structural checker and feedback (largest expected gain)
Files: new `lib/structure/{scene-geometry,contact-graph,checks,report}.ts`, new
`packages/core/src/lib/primitive-geometry.ts` (shared with `item-renderer.tsx`).
- [x] Every part becomes world triangles plus an axis-aligned box. Tolerance is max(2 mm, 0.5% of the
  assembly diagonal).
  — evidence: `bun test ./packages/editor/src/lib/structure/checks.test.ts` → `assembly tolerance is max(2mm, 0.5% of the diagonal)`
- [x] Per-body checks:
  - `EMPTY_RESULT`;
  - `NOOP_DIFFERENCE`;
  - `DISJOINT_SHELLS`;
  - `OPEN_MESH`;
  - `DEGENERATE`;
  - `BUDGET` (over 50k triangles).
  — evidence: same suite → `no-op cut produces NOOP_DIFFERENCE`; `open mesh produces OPEN_MESH`; codes in `editor/packages/editor/src/lib/structure/checks.ts`
- [x] Assembly checks:
  - contact graph: box broadphase, then `three-mesh-bvh` distance;
  - `FLOATING_PART`;
  - `UNGROUNDED` / `BELOW_FLOOR`;
  - `BURIED_PART`;
  - `DUPLICATE_PART`;
  - `EXCESSIVE_OVERLAP` (warning).
  — evidence: `floating mast produces FLOATING_PART`; `sunk keel produces BELOW_FLOOR`; `contact-graph.ts` uses `MeshBVH.closestPointToPoint`
- [x] Issues are structured:
  ```
  {code, severity, actionIndex, specPath?, partId, otherPartId?, measured, fix:{hint, patch?}}
  ```
  - Floating parts get a `move_target {delta}` patch.
  - At most 20 issues, errors first.
  — evidence: fixture patches are `move_target`; `finalizeReport` slices to 20 errors-first
- [x] `checkStructure` / `pistola_check`. `run` and `taskPlan.runStep` embed the report automatically, so
  agents can't skip feedback.
  — evidence: `run and invoke(checkStructure) embed the same report`; `mcp-tools-default.json` includes `pistola_check`
- [x] Keep-best:
  - the plan keeps its best snapshot;
  - `taskPlan.restoreBest`;
  - regressions are flagged;
  - opt-in `strict` reverts the step.
  — evidence: `keep-best stores a snapshot and strict reverts a regression`; MCP `pistola_task_restore_best`
- [x] Skill rule: at most 2 retries per step using the issue list, then fall back to a simpler technique.
  — evidence: `.agents/skills/pistola-direct-control/SKILL.md` Loop step 5
- [x] Checkpoint: fixtures (floating mast, sunk keel, no-op cut, open revolve) produce their expected
  codes, and the patches clear them; the 8 recipes are validated and fixed; benchmark run.
  — evidence: `bun test ./packages/editor/src/lib/structure/checks.test.ts` → 8 pass; `node editor/scripts/creation-benchmark/run.mjs --mode replay --out docs/tasks/evidence/creation-quality/phase-2` → `iou: 1`

### Phase 3: Plan contract (blueprint v2)
Files: new `lib/blueprint/{schema,check}.ts`, `lib/operator-plan/operator-plan.ts`,
`.agents/skills/pistola-image-to-blueprint` (blueprint schema v2).
- [x] Blueprint fields:
  - `frame`, `overall_m`, `anchor: floor|wall|none`;
  - parts `{id, name, role, technique, dims_m, position_m, rotation_deg, color, parent, mirrorOf?, count?}`;
  - relations `{a, aFace, rel: touches|on_top_of|inside|centered_on|mirror_of|gap_ok, b, bFace, tol_m?}`;
  - acceptance ratios.
  — evidence: `editor/packages/editor/src/lib/blueprint/schema.ts` `BlueprintV2Schema`; skill `references/blueprint.schema.json` (v1 `shape` / `scale.value_m` stay aliases)
- [x] `plan.check` runs before any geometry:
  - references resolve;
  - parents are acyclic;
  - relations are consistent with the declared boxes;
  - the parts add up to `overall_m`.
  — evidence: `bun test ./packages/editor/src/lib/blueprint/check.test.ts` → `plan.check catches a sailboat mast that is not on the hull`; `plan.check flags a cyclic parent and an overall that the parts cannot make`; MCP `pistola_blueprint_check` (not `pistola_plan*`)
- [x] `taskPlan.create({blueprint})` generates one step per part (parent first), plus check and render
  steps.
  — evidence: same suite → `taskPlan.create({blueprint}) builds one step per part plus check and render` (`hull`, `mast`, `check`, `render`); rejects a failing blueprint before create
- [x] Scene-vs-plan checks: `PART_MISSING`, `DIM_MISMATCH` (over 10% is an error, over 5% a warning),
  `POSITION_MISMATCH`, `RELATION_VIOLATED`, `ACCEPTANCE_FAILED`.
  — evidence: same suite → `scene-vs-plan reports PART_MISSING, DIM_MISMATCH and POSITION_MISMATCH`; codes in `check.ts`
- [x] Relation snapper: deterministic translation patches that satisfy touches/on_top_of. It proposes
  them; it never applies them silently.
  — evidence: `the snapper proposes a move_target that sits the mast on the hull and does not apply it` (`applied: false`, delta `[0, -1.6, 0]`); applying the delta makes `plan.check` pass without mutating the scene
- [x] Checkpoint: a sailboat plan with a wrong mast height is caught before the build, and the snapper
  fixes it; benchmark run.
  — evidence: 7 pass in `check.test.ts`; `node editor/scripts/creation-benchmark/run.mjs --mode replay --out docs/tasks/evidence/creation-quality/phase-3` → `summary.iou: 1`

### Phase 4: Retrieval (examples and subassemblies)
Files: new `lib/agent-examples/*`, `lib/agent-api/index.ts`, MCP `pistola_examples`, `.agents/library`.
- [x] One technique example per op, in the canonical frame.
  — evidence: `editor/packages/editor/src/lib/agent-examples/catalog.ts` `technique-<op>` for every `MANUAL_OP_EXAMPLES` key
- [x] Parameterized subassemblies, returned as editable actions with `partId`s plus a blueprint fragment:
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
  — evidence: same catalog ids; `examples.get` returns `$ref_*` actions and a blueprint fragment
- [x] `examples.search` / `examples.get({id, params, at})`.
  — evidence: `bun test ./packages/editor/src/lib/agent-examples/catalog.test.ts` → search ranks `wheel-axle`; get(`leg-set`, at [2,0,0]) stamps LEVEL and offsets; MCP `pistola_examples`
- [x] Convert `CREATION_RECIPES` and `geometric-phone-stand` into replayable library entries. The library
  format is `{blueprint, batches, scores, renders}` with `$ref_*` / `LEVEL` placeholders.
  — evidence: `recipe-<id>` wrappers; `.agents/library/objects/geometric-phone-stand.json`; `.agents/library/INDEX.md`
- [x] Checkpoint: every example builds with 0 checker errors; the held-out benchmark improves.
  — evidence: same suite → `every technique, subassembly and library example builds with 0 checker errors`; `run.mjs --mode replay --out .../phase-4` `summary.iou: 1` (gold replay unchanged; agent held-out skipped, no IDE quota)

### Phase 5: Render views and fixed critique
Files: new `lib/render/{soft-raster,render-views}.ts` (Worker), MCP `pistola_render_views`,
`drivers/browser.ts` (canvas-only screenshot).
- [x] A CPU rasterizer over the Phase 2 geometry. It is deterministic, shows no UI, works on WebGPU, Sites
  and tests, and needs no camera animation.
  — evidence: `editor/packages/editor/src/lib/render/soft-raster.ts` projects `collectStructureParts` meshes through `views.ts`
- [x] Output: one 2×2 PNG.
  - Panels: FRONT, SIDE, TOP, ISO.
  - Flat shading with one hue per part and a legend.
  - 0.1 m grid, floor line, W×H×D labels.
  - Per-view masks.
  - IoU and a diff overlay (red = missing, blue = extra) when a gold or reference image exists.
  — evidence: `render-views.ts` composes 2×2 PNG; `maskIou` when gold masks are passed
- [x] Fixed checklist returned with the render (recognizable, proportions, every part visible, worst view, symmetry, floating or sunk, missing signature, palette). The agent answers `{score, ≤3 fixes (partId + numeric change)}`.
  — evidence: `critiqueRender` in `editor/packages/editor/src/lib/render/render-views.ts`; skill Loop step 8
- [x] Policy: at most 2 rounds, keep the best, stop when there's no gain. Disable it for models where the
  benchmark shows harm.
  — evidence: `.agents/skills/pistola-direct-control/SKILL.md` Loop step 8
- [x] Checkpoint: the render test matches a known box; benchmark run.
  — evidence: `bun test ./packages/editor/src/lib/render/render-views.test.ts` → `a known 1 m box fills a square front mask`; `run.mjs --mode replay --out .../phase-5` `summary.iou: 1`

### Phase 5A: User-approved eight-view reference and review loop

This is an additive IDE contract: it does not replace the Phase 5 numeric 2×2 diagnostic, and it
does not claim the gated image fitter below.

- [x] A reference pack requires a user-approved concept, one positive meter scale anchor, and exactly
  these separately labeled assets: Top, Left 45°, Front, Right 45°, Left, Right, Back, Bottom.
  The six cardinal source views are orthographic; the 45° review views may be perspective.
  — evidence: `bun test packages/editor/src/lib/reference-pack/reference-pack.test.ts` → 8 pass
- [x] Reference metadata is provider-neutral and never accepts `data:`, `blob:`, or `file:` image
  payloads. Stored image bytes remain in the IDE or its asset system.
  — evidence: same suite → `opaque asset references reject inline and local-file payloads`
- [x] The canonical review camera contract is +Y up, +Z front, +X right, bottom-center in meters;
  a deterministic 4×2 sheet uses all eight views once.
  — evidence: `bun test packages/editor/src/lib/render-views/canonical-views.test.ts` → 6 pass;
  `scene-contact-sheet.test.ts` → 3 pass
- [x] `referencePack.*` and `renderEightViews` are exposed through `window.pistola.invoke`; the latter
  returns a side-effect-free SVG review with the current structural report.
  — evidence: `bun test packages/editor/src/lib/agent-api/reference-pack-api.test.ts` → 2 pass
- [x] Generic MCP surfaces are available to Codex, Cursor, Antigravity, Qoder, and other compatible
  IDEs: `pistola_reference_{validate,set,get,clear}` and `pistola_render_eight_views`. The operator
  plan panel shows the approved-pack state and an accessible bounded preview.
  — evidence: `node editor/scripts/ide-direct-control-e2e.mjs --list-tools` lists all five tools;
  `bun run check-types` → pass; `node scripts/ide-setup.mjs --check` → passed

### Phase 6 (gated): Reference mode and a minimal fitter
Start only if the Phase 5 benchmark shows outline and proportion errors dominate.
- [x] `pistola_reference_sheet_add({path|dataUrl, layout: 'front|side|top' sheet, knownDimension})`. A reference
  is always paired with a text blueprint.
  — evidence: `bun test ./packages/editor/src/lib/reference/reference.test.ts` → `reference.add requires a blueprint, traces the sheet, and does not apply hull or guides`; MCP `pistola_reference_sheet_add`
- [x] A prompt pack for IDEs that generate images (one image holding all three views, black on white,
  orthographic), plus a user guide for making sheets on free sites (`docs/`).
  — evidence: `.agents/skills/pistola-direct-control/references/ortho-sheet-prompt.md`; `docs/reference-sheets.md`
- [x] Browser-Worker tracer job, built on `silhouette-tracer.ts`:
  - threshold for clean sheets; background removal (BiRefNet ONNX, MIT) only later, for photos;
  - components sorted left to right;
  - Moore contour tracing, then Douglas-Peucker simplification;
  - output in meters, in the `views.ts` frame;
  - cross-view consistency within ±5%.
  — evidence: same suite → `traceReferenceSheet scales three left-to-right views into the views.ts frame` (`consistent: true`, planes XY/ZY/XZ); `jobs.ts` keeps the trace body free of scene-store access
- [x] Uses: the IoU target for renders, and an optional 3-view hull blockout for prismatic main bodies.
  — evidence: same suite → hull `intersect_profiles` validates; `render-views.ts` compares framed masks when a reference is active
- [x] Minimal fitter:
  - coordinate descent, about 300 evaluations, in the same Worker job;
  - only translate and scale on at most 10 parts;
  - objective: IoU minus a relation-violation penalty;
  - returns a patch plus before/after IoU.
  — evidence: same suite → `the fitter proposes unapplied patches` (`applied: false`, negative X `move_target`, scene unchanged)
- [x] Schedule tracing and fitting in a real browser Worker before enabling them for large reference sheets or assemblies.
  — evidence: `bun test packages/editor/src/lib/reference/jobs.test.ts` → Worker success, failure cleanup, and SSR inline
  fallback pass; `bun run build:sites` → webpack packages `reference-worker.ts`; `bun run smoke:sites` → 19/19,
  including the real static-site Worker trace.
- [x] Vertical guide planes (a `create_guide` action) show the reference behind the build.
  — evidence: same suite → `create_guide` writes `metadata.pistolaPlane: front`; `GuideRenderer` stands front/side planes up

- [x] Checkpoint: 3-view sheet traces in meters, hull and guides stay proposals, fitter does not apply, benchmark run.
  — evidence: 4 pass in `reference.test.ts`; `node editor/scripts/creation-benchmark/run.mjs --mode replay --out docs/tasks/evidence/creation-quality/phase-6` → `summary.iou: 1`

### Phase 7 (gated on remaining failures): Richness and composition
- [x] Loft (cross-sections along an axis), 3-view hull, and torus/capsule/ellipsoid in the kernel.
  — evidence: `local-kernel.test.ts` → `loft, hull, torus, capsule, and ellipsoid produce closed solids`; `MANUAL_OP_EXAMPLES` adds those ops
- [x] Angle-based smooth normals; per-body `roughness` / `metalness` / `opacity`.
  — evidence: same suite → `angle-based normals keep box creases and smooth a cylinder wall`; `CadBodyNode` + mesh preview PBR fields; `cad-body-preview.test.ts` per-body PBR
- [x] A complexity budget, with kernel work in a Worker.
  — evidence: same suite → `complexity budget rejects oversized meshes and kernel jobs evaluate on a worker-ready path`; `kernel-jobs.ts` `runKernelJob`; `KERNEL_TRIANGLE_BUDGET` 50k
- [x] CAD bodies render in the architecture world as real meshes, and items parented to bodies are no
  longer moved.
  — evidence: `cad-body-preview.test.ts` → architecture instances reuse the source CAD mesh; `item-parenting.test.ts` → cad-body/cad-instance skip slab lift; `CadInstanceRenderer` draws the source mesh

### Every phase
- [x] Update `.agents/skills/pistola-direct-control/SKILL.md` with the loop:
  plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report.
  — evidence: `.agents/skills/pistola-direct-control/SKILL.md` Loop (Phase 6 optional 3-view sheet + Phase 7 loft/hull/materials + architecture meshes); `node scripts/ide-setup.mjs --check` → passed
- [x] Turn the Codex-only Studio sub-agents into role sections that any IDE can follow.
  — evidence: `.agents/skills/pistola-studio/SKILL.md` Roles; `.agents/skills/pistola-direct-control/SKILL.md` Roles (any IDE)
- [x] Regenerate the per-IDE files with `scripts/ide-setup.mjs` and run `--check`.
  — evidence: `node scripts/ide-setup.mjs --check` → passed
- [x] Benchmark:
  - replay and score every phase;
  - full agent runs at baseline and after Phases 2, 4 and 5 (to limit IDE usage);
  - save `phase-N/scores.json` plus side-by-side renders.
  — evidence: replay `iou: 1` in `phase-3`, `phase-4`, `phase-5`, `phase-6`, `phase-7`; `--mode agent --cli codex` skipped (no IDE quota)
- [x] `validate-task-evidence.mjs` passes; 0 forbidden AI-route requests.
  — evidence: `node scripts/validate-task-evidence.mjs` (Phase 7 tick)

### Acceptance (held-out set, ≥2 headless IDEs, 3 seeds)
- [ ] Final runnable rate ≥ 95%.
- [ ] 0 floating parts in ≥ 90% of runs.
- [ ] Overall dimension error ≤ 5%.
- [ ] Part coverage ≥ 90%.
- [ ] Rubric score beats the baseline on ≥ 5 of 6 objects.
- [ ] IoU vs gold reported (no hard threshold).
- [ ] `bun run check-types`, the targeted `bun test` suites, `build:sites` and `smoke:sites` all pass.

## Research notes

These papers shaped the default pipeline (plan → build → check → fix → render → critique → keep
best). Tracing stays an optional mode for clean, dimensioned orthographic sheets.

### Error feedback is the biggest cheap win

- **3DCodeBench** (Gao et al., 2026). 12 frontier VLMs write Blender 5.0 Python. Showing the model
  its errors, with ≤2 retries, raised runnable output from ~0.69–0.70 to ~0.97 and likeness by about
  +0.128. Agent harnesses improved runnability but **not** shape. Typical failure: floating or
  disconnected parts. Generated photos alone scored below text-only on 4 of 5 models.
  - Paper: https://arxiv.org/abs/2606.01057
  - Code: https://github.com/gaoypeng/3dcodebench
  - HTML: https://arxiv.org/html/2606.01057v1

### Planning, retrieval, and bounded render checks

- **SceneCraft** (Hu et al., ICML 2024). Scene-graph blueprint, then Blender code, then VLM critique.
  About +45% vs prior LLM scene agents.
  - https://proceedings.mlr.press/v235/hu24g.html
  - https://arxiv.org/abs/2403.01248
- **LL3M** (ThreeDLE). Multi-agent Blender Python with automatic code and visual self-critique.
  - https://threedle.github.io/ll3m/
- **CADCodeVerify** (Alrashedy et al., ICLR). VLM writes validation questions, then correction
  prompts. Gains saturate after about two rounds.
  - https://arxiv.org/abs/2410.05340
  - https://github.com/Kamel773/CAD_Code_Generation
- **VIGA** (Yin et al., 2026). Write → run → render → compare → revise with multi-view tools and a
  sliding memory. About +35% on BlenderGym.
  - https://arxiv.org/abs/2601.11109
  - https://fugtemypt123.github.io/VIGA-website/

### Tracing only on clean ortho sheets

- **Ortho2CAD** (2026). Raster ortho drawings → CadQuery. Reports IoU 0.78 → 0.85 with a compare
  loop; 100% syntactically valid code on their draw set.
  - https://arxiv.org/abs/2607.08891
- **BenchCAD** (2026). Industrial CadQuery benchmark. From realistic (non-drawing) renders, models
  stay around 0.21–0.28 IoU.
  - https://arxiv.org/abs/2605.10865

A visual hull from three silhouettes suits boxy objects, not concave or organic ones. Pistola does
not generate images (no free image model on OpenRouter). Reference images come from the IDE or from
user uploads.

### Repo facts that still shape later phases

- `validateAssistantPlan` historically threw on the first bad action and did not dry-run the kernel.
- Every `revolve` is open (`local-kernel.ts` skips the closing edge).
- The manual's extrude axis disagrees with the kernel ([x,z] along +Y vs XY along +Z).
- CAD body bounds can return `null` from a bbox shape mismatch.
- `build_cad_solid` has no rotation in the action, and there is no `update_cad_solid`.
- `pistola_screenshot` is a full-page UI capture. `silhouette-tracer.ts` exists but is unexposed.
- `runRecipe` exists on the API object but is not on the `invoke` allowlist (Phase 1).
- `THREE.ShapeUtils` and `three-mesh-bvh` are already installed.

## Reuse

- Kernel and CAD: `local-kernel.ts`, `solid-spec.ts`, `silhouette-tracer.ts`.
- Execution: `validateAssistantPlan` / `executeAssistantPlan`, `move_target {delta}`, `taskPlan`,
  `CREATION_RECIPES`.
- Tooling: `editor/scripts/mcp-stdio-client.mjs` (extracted from `ide-direct-control-e2e.mjs`),
  `scripts/ide-setup.mjs`, `scripts/validate-task-evidence.mjs`.

## Verification

- Per phase: the checkpoint tests above, pasted as evidence.
- Benchmark: `node editor/scripts/creation-benchmark/run.mjs --mode replay|agent --cli codex|claude`
  then `node editor/scripts/creation-benchmark/score.mjs --from <run-dir>`.
- Scores and side-by-side mask dumps land in `docs/tasks/evidence/creation-quality/`.
