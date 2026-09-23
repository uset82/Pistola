# Plan: frictionless, visible 3D creation for IDE agents in Pistola

## Context

Building the "Old Light" self-portrait (26 CAD bodies) exposed the friction an IDE agent hits today:

1. **Can't connect.** The Pistola MCP server times out in every IDE. Root cause, reproduced: `tooling/pistola-mcp/src/stdio.ts:33-36,135-153` uses `Content-Length` framing, like the Language Server Protocol. MCP stdio clients send one JSON message per line. The repo's own e2e client uses the same wrong framing, so the test passes while real IDEs fail.
2. **Can't see.**
   - `renderViews` and `renderEightViews` draw bounding boxes, not meshes. The eight-view output is SVG, which models can't read as an image.
   - `pistola_screenshot` captures UI overlays. `orbit_camera` ignores `degrees`, and there is no API to set an exact camera.
   - The IDE plan panel, Assistant pill, selection panel, build-mode cursor column and CAD origin axes cover the model.
3. **Wrong geometry.**
   - Extrude, revolve and torus meshes are inside-out, so solids render see-through.
   - `union` is always CSG and leaves open edges on touching parts. There is no plain "group" op.
4. **False alarms.**
   - Buried-part check: compares bounding-box overlap with mesh volume, which flagged 20 intentional nestings.
   - Contact check: samples vertices in one direction only, which gives floating false positives.
   - Measure, inspect and the checker read stale cad-body transforms.
5. **API gaps.**
   - `getNodes()` crashes with no arguments. `inspect` returns no partId or bounds.
   - `taskPlan.undo` can only undo the whole plan.
   - Large scenes silently fail to autosave: a localStorage quota error is swallowed.
6. **Startup.** No editor-only dev script, no `.claude/launch.json`, and a port-3002 conflict.

**Intended outcome:** any of the six IDEs connects on the first try. It builds in the **user's own open tab**, so the user watches live, and gets **real rendered images** back after every step. It gets correct geometry, trustworthy checks, and a scene that survives a reload.

**User decisions:**
- Build in the user's open tab, through the existing bridge driver.
- Verify all six IDEs: Claude Code, Codex, Cursor, Antigravity, WorkBuddy and Qoder.

## How the checklist is tracked

After approval, copy the checklist below into `docs/tasks/TASK-frictionless-creation.md`, using the existing convention from `docs/tasks/TASK-ide-direct-control.md:5-13`:
- Tick `- [x]` only after the item is verified, and append `— evidence: <command> → <result>` or a link to `docs/tasks/evidence/frictionless-creation/`.
- Items that can't be done stay `- [ ]` with `BLOCKED: <reason>`.
- Every phase ends with a checkpoint.

Also:
- Ask before every commit.
- Never stash, switch branches or run `git add -A`: other agents commit to main in this working tree.

---

## Phase 0 — Setup

- [ ] Create `docs/tasks/TASK-frictionless-creation.md` from this plan, and create the evidence folder `docs/tasks/evidence/frictionless-creation/`.
- [ ] Add the new task file to the list in `scripts/validate-task-evidence.mjs:8-17`.
- [ ] Add a `dev:editor` script to `editor/package.json`. It should start only the editor app on port 3002 plus the package watchers it needs, not the sites app or the orphan MCP watcher.
- [ ] Make a busy port 3002 fail with a clear message that names the process holding it.
- [ ] Add `.claude/launch.json` with a `pistola-editor` entry (`bun run dev:editor`, port 3002), so IDE preview tools can start it.
- [ ] Fold in the earlier "Fix inside-out extrude, revolve and torus meshes" task suggestion (it is Phase 3 here), and dismiss that suggestion so the work isn't duplicated.
- [ ] **Checkpoint:** `bun run dev:editor` serves `/workspace`. `node scripts/validate-task-evidence.mjs` passes.

## Phase 1 — Connect: the MCP handshake works in every IDE

- [ ] In `tooling/pistola-mcp/src/stdio.ts`, read and write newline-delimited JSON-RPC.
  - Keep accepting `Content-Length` input as a fallback: if the buffer starts with `Content-Length:`, parse the header.
  - Do this without adding a dependency. `@modelcontextprotocol/sdk` sits in `node_modules`, but switching to it would be a dependency change.
- [ ] Switch `scripts/mcp-stdio-client.mjs` to newline framing, so the e2e test uses real-client behaviour.
- [ ] Add a regression test, `tooling/pistola-mcp/src/stdio.test.ts` (node:test). It spawns the server, sends a newline `initialize` and `tools/list`, and asserts a reply within 5 s.
- [ ] Add a `--doctor` flag to `src/index.ts`, and put the same report in `pistola_status`. It prints:
  - the Node version
  - whether the editor is reachable on 3002
  - whether a live tab is registered
  - whether local-operator auth works
- [ ] **Checkpoint:**
  - The Claude Code MCP status shows `pistola` connected, with 39 tools listed.
  - The handshake test passes.
  - Codex lists the server without timing out.

## Phase 2 — Watch: build in the user's open tab

- [ ] Make `getDriver` (`tooling/pistola-mcp/src/index.ts:31-34`) default to the **bridge** driver for the local target. The headless browser driver stays available through `PISTOLA_TRANSPORT=browser`, for CI and e2e.
- [ ] When no tab is registered (`/api/workspace/session`), `pistola_open` opens the user's default browser at `http://localhost:3002/workspace` and waits for the tab to register. If that fails, it fails visibly with instructions and never falls back silently (see `editor/AGENTS.md`, IDE Operator Boundary).
- [ ] Target the most recently focused tab:
  - `WorkspaceBridge.tsx` reports focus and visibility to the session.
  - `apps/editor/lib/workspace-bridge.ts` picks the target from that.
  - `pistola_status` lists the open sessions.
- [ ] Bridge reliability (`drivers/bridge.ts`):
  - Per-method timeouts, with longer ones for render and waitForIdle.
  - A clear error when the tab closed or reloaded.
  - Never reload or navigate the user's tab.
- [ ] Check that local-operator auth (`apps/editor/lib/auth/route.ts:41-99`) works on localhost without signing in. Document `PISTOLA_LOCAL_API_TOKEN` in `.env.example` only, never with a real value.
- [ ] Stop agent builds from taking over the selection. Add an optional `select` flag to `build_cad_solid` and its siblings (`lib/assistant/execute.ts:1280`, `:1353-1469`, `:347/373/395`), defaulting to false for agent-API and MCP calls. Clicks in the UI keep selecting.
- [ ] **Checkpoint:** from Claude Code, `pistola_open` followed by a one-part build appears live in the open tab, with no properties panel popping up.

## Phase 3 — See: real renders returned as images

- [ ] **Capture component.** Add `SceneCapture` in `packages/editor/src/components/editor/`, mounted inside `<Viewer>` next to `ThumbnailGenerator` (`components/editor/index.tsx:223-244`).
  - It listens for capture requests through a promise registry, `lib/render/capture-registry.ts`.
  - It builds its own camera and turns off `EDITOR_LAYER`, which hides the grid, cursor and helpers.
  - It hides scans and guides, then calls `gl.render` followed by `drawImage` in the same task. Reuse the approach in `thumbnail-generator.tsx:37-100`.
  - The live camera is never touched.
- [ ] Move the CAD origin `AxesHelper` to `EDITOR_LAYER` (`packages/viewer/.../cad-space/cad-space-renderer.tsx:10,15`), so it stays out of captures and presentation views.
- [ ] **API, `window.pistola.render(...)`.**
  - Input: `{ view?, camera?: {position, target, fov?}, nodeIds?, width = 768, height = 768 }`.
  - `view` is one of top, bottom, front, back, left, right, left-45, right-45 or iso. Poses come from `createCanonicalCameraPose` (`lib/render-views/canonical-views.ts:87-217`).
  - Framing uses the world bounds of `nodeIds`, or of all parts.
  - Output: `{ mime: 'image/png', dataUrl, camera, bounds }`.
- [ ] **API, `window.pistola.renderSheet({ views?, cell = 384 })`.** A labelled 4×2 PNG contact sheet composed on a 2D canvas.
- [ ] **MCP tools.**
  - `pistola_render_eight_views` returns the real PNG sheet. The old bounding-box sheet stays available as `mode: 'layout'`.
  - `pistola_render_views` returns real views.
  - `pistola_screenshot` renders the current viewport camera without UI clutter.
  - All three return MCP image content through `imageResult` (`index.ts:15-20`).
  - The bridge driver's `screenshot()` is implemented as `invoke('render')`, which removes the throw at `bridge.ts:79`.
- [ ] **Auto-preview.** `pistola_run` and `pistola_task_run_step` accept `preview` (default true on the bridge driver). It attaches a 512 px iso render to every build result, so the agent sees each step.
- [ ] **Live camera.**
  - Make `orbit_camera` honour `degrees` (`custom-camera-controls.tsx:336-358`).
  - Add a `set_view {view}` action and a `set_camera {position, target}` action, so the user sees the same angle the agent reviewed.
- [ ] **Presentation mode.** Extend `set_preview_mode`, or add `set_presentation_mode`, so it also collapses `OperatorPlanPanel` and hides the `AiAssistantPanel` pill and `AccountBadge` (mounted in `PistolaWorkspaceShell.tsx:30-34`).
- [ ] **Optional speckle fix.** Turn on SSGI temporal filtering, or raise the sample counts slightly (`post-processing.tsx:31-44`). Keep the change only if frame rate stays acceptable.
- [ ] **Checkpoint:** an IDE replays `.pistola/studio/claude-self-portrait/actions.json`, then gets a real eight-view PNG with correct colours. The user's live camera and panels are unchanged.

## Phase 4 — Build right: kernel and checker correctness

- [ ] **Fix winding** in `lib/cad/local-kernel.ts`:
  - extrude (`:380-392`)
  - revolve (`:543-544`, caps `:553-554`)
  - torus (`:791`, change `a,b,c,a,c,d` to `a,c,b,a,d,c`)
  - `extrudeProfileZy` (`:436-443`)
  - Also audit loft, hull, capsule and ellipsoid.
  - Compute the volume signed internally, but keep reporting its absolute value.
- [ ] Add a **`group` op**: `lib/cad/solid-spec.ts` (after `:182`), and a kernel case that calls `mergeMeshes` (`:632`). Exempt it from the disjoint-shells check (`lib/structure/checks.ts:6`), and document it in `manual().solidSpec`.
- [ ] After the winding fix, re-test `union` on touching boxes and coaxial cylinders. If open edges remain, weld vertices by position after CSG.
- [ ] **Buried-part check** (`lib/structure/checks.ts:226-236`).
  - Replace the bounding-box and volume ratio with a containment test. Sample the smaller part's vertices and triangle centroids, and test each with a point-in-mesh raycast parity check (three-mesh-bvh is already used in `contact-graph.ts`). Flag only when at least 85% of samples are inside the other solid.
  - Skip pairs where either part has opacity below 1, and add an explicit `nested: true` opt-out on `build_cad_solid`.
- [ ] **Contact graph** (`lib/structure/contact-graph.ts:27-51`). Sample both directions, and add triangle centroids and edge midpoints to the corner vertices.
- [ ] **One transform source.** Use `getCadBodyTransform` (`packages/core/src/lib/cad-body-transform.ts:22-32`) in `assistant/context.ts:178`, in `assistant/agent-tools.ts:210` (measure should respect rotation) and in `structure/scene-geometry.ts:37`.
- [ ] **Tests.**
  - `local-kernel.test.ts`: signed volume above 0 for every op, a `group` case, and mirror still correct.
  - `checks.test.ts`: rings around a core, pages inside a cover and a halo around a core are not buried, while a truly buried box still is. Rotated stacked books count as touching.
  - `agent-tools.test.ts`: measuring a rotated body.
- [ ] **Checkpoint:**
  - Replaying the self-portrait gives 0 structure errors.
  - A cover rebuilt with `extrude` renders solid rather than see-through.
  - All new tests pass.

## Phase 5 — Less friction: API ergonomics and persistence

- [ ] Fix `getNodes()` with no arguments (`agent-api/index.ts:729`, `agent-tools.ts:89`). Fix `invoke` spreading array arguments (`:813`, `:858`).
- [ ] `inspect` and `exportScene` return, for each cad-body: `partId`, `role`, world `bbox`, `color`, `opacity`, triangle count and `spec` (`assistant/context.ts:171-187`, `agent-api/index.ts:744-757`). Add an `inspect({ partId })` filter.
- [ ] **Per-step undo.** Take a snapshot at the start of `runStep` (before `agent-api/index.ts:617`). Add `taskPlan.undoStep` and an MCP `pistola_task_undo_step`. Allow re-running a finished step, which replaces its evidence.
- [ ] **Persistence.**
  - When saving (`packages/editor/src/lib/scene.ts`), drop a cad-body's `positions/indices/normals` whenever `preview.spec` exists, and re-evaluate with `evaluateCadSolidSpecCached` on load.
  - Stop swallowing quota errors (`scene.ts:91-96`): show a toast and add a `pistola_status` warning.
- [ ] **Replay.** Record executed agent actions on the operator plan. Add `pistola.exportActions()` and `pistola.replay(actions)`, plus MCP `pistola_replay`.
- [ ] **Checkpoint:**
  - Rebuilding the self-portrait is one `pistola_replay` call.
  - Reloading the tab keeps the 26-part scene.
  - `pistola.exportActions()` round-trips.

## Phase 6 — Every IDE: configs, skill, docs and end-to-end tests

- [ ] **Configs.** Update `scripts/ide-setup.mjs` so the configs use bridge mode. Make Antigravity's path portable if the IDE supports it; otherwise document the per-machine path. Leave the user's `.bak` files alone. `--check` must pass.
- [ ] **E2E.** `scripts/ide-direct-control-e2e.mjs` gains:
  - newline framing
  - bridge mode, with a Playwright tab standing in for the user's tab
  - an assertion that render tools return a PNG with real content (non-uniform pixels)
  - the self-portrait replay with 0 structure errors
- [ ] **Skill.** Update `.claude/skills/pistola-direct-control/SKILL.md`, plus the Codex studio skills under `.agents/`, with:
  - watch mode and `render`/`renderSheet`
  - the `group` op and the no-reload rule
  - a host-aware concept gate: hosts without image generation use a written part table and real-render review
- [ ] **Docs.** Update `tooling/pistola-mcp/README.md`: the framing, the drivers, and the CDP-default mismatch (the README says port 9333, the code has no default). Move now-fixed lessons in `.agents/library/LEARNINGS.md` to its Archive section.
- [ ] **Verify each IDE.** For each one: MCP connected, `pistola_open` on the user's tab, build the sailboat example, and get a real render back. Save the evidence (tool list plus render PNG) to the evidence folder. An IDE that isn't installed gets `BLOCKED: <reason>`.
  - [ ] Claude Code
  - [ ] Codex
  - [ ] Cursor
  - [ ] Antigravity
  - [ ] WorkBuddy
  - [ ] Qoder
- [ ] **Acceptance gate:** every phase ticked with evidence, `validate-task-evidence` passes, and `bun run check-types` and `bun run lint` are clean.

---

## Verification (run from `editor/`)

```bash
node --test tooling/pistola-mcp/src/stdio.test.ts
bun test ./packages/editor/src/lib/cad/local-kernel.test.ts ./packages/editor/src/lib/structure/checks.test.ts ./packages/editor/src/lib/agent-api/index.test.ts ./packages/editor/src/lib/assistant/agent-tools.test.ts
bun run check-types
bun run lint
node scripts/ide-direct-control-e2e.mjs --target local
node ../scripts/validate-task-evidence.mjs
```

**Manual end-to-end check:** with the editor open in a browser tab, ask each IDE to "build the sailboat example and show me the eight-view render". The model should appear live in the tab, and the IDE should show a real PNG.

## Risks and ordering

- **Phase 1 blocks everything.** Phase 3 depends on Phase 2's bridge render path.
- **Winding fix:** saved scenes keep their old, inverted meshes until they are re-evaluated. Phase 5's re-evaluate-on-load fixes that. Mirror's index swap must stay correct.
- **Checker changes must not hide real errors.** Keep true-positive tests for each rule.
- **Bridge queue:** it lives in memory in the single Next dev process, so a hot reload drops pending commands. The bridge must fail with a clear error, and the tab must re-register.
- **Render readback:** test under both WebGPU and the WebGL2 fallback.
- **Public repo:** no tokens or `.env.local` values in commits.
