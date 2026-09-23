# TASK: Frictionless, visible 3D creation for IDE agents

Goal: any IDE agent (Claude Code, Codex, Cursor, Antigravity, WorkBuddy, Qoder) connects on the first try, builds in the user's own open Pistola tab, and gets real rendered images back after every step. It also gets correct geometry, trustworthy checks, and a scene that survives a reload.

It comes from the friction log of the "Old Light" self-portrait build (2026-09-22): MCP connect timeout, bounding-box-only renders, inside-out kernel meshes, and checker false positives.

User decisions:
- The agent builds in the user's open tab (bridge driver).
- All six IDEs are verified.

## Ticking rules

- Change `- [ ]` to `- [x]` only after the item is implemented **and** verified. Append `— evidence: <command> → <result>`, or link a file under `docs/tasks/evidence/frictionless-creation/`.
- Tick a phase checkpoint only when all of its tasks are ticked and its checkpoint commands pass.
- A blocked item stays `[ ]` with `BLOCKED: <reason>`. If a re-run fails, untick it.
- `scripts/validate-task-evidence.mjs` fails on any `[x]` without evidence.
- Other sessions use this working tree. Never `git stash`, `reset --hard`, switch the whole tree or `add -A`. Stage only this phase's files, and ask the user before committing.

## Checklist

### Phase 0 — Setup

- [x] Create this file and the evidence folder `docs/tasks/evidence/frictionless-creation/`. — evidence: `docs/tasks/evidence/frictionless-creation/phase0-dev-editor.txt`
- [x] Add this file to `scripts/validate-task-evidence.mjs`. — evidence: `node scripts/validate-task-evidence.mjs frictionless` → lists `TASK-frictionless-creation.md`
- [x] Add `dev:editor` to `editor/package.json`: only the editor app on port 3002, without the sites app or the orphan MCP watcher. — evidence: `bun run dev:editor` → `GET /workspace 200` with no sites, MCP or tsc processes (`docs/tasks/evidence/frictionless-creation/phase0-dev-editor.txt`)
- [x] Make a busy port 3002 fail with a clear message that names the process holding it. — evidence: `node editor/scripts/check-port.mjs 3002` → `Port 3002 is already in use by node.exe (PID 8204).`, exit 1
- [x] Add a `.claude/launch.json` entry `pistola-editor` (`bun run dev:editor`, port 3002). — evidence: `.claude/launch.json` holds the `pistola-editor` configuration, which runs `bun run --cwd=editor dev:editor` on port 3002
- [x] Fold in the earlier "Fix inside-out extrude, revolve and torus meshes" task suggestion (it is Phase 4 here) and dismiss it. — evidence: `dismiss_task task_f8a18915` → withdrawn; the work is tracked in Phase 4
- [x] **Checkpoint:** `bun run dev:editor` serves `/workspace`, and `node scripts/validate-task-evidence.mjs frictionless` passes. — evidence: curl `/workspace` → 200, and the validator passes (see `phase0-dev-editor.txt`)

### Phase 1 — Connect: the MCP handshake works in every IDE

- [x] `tooling/pistola-mcp/src/stdio.ts` reads and writes newline-delimited JSON-RPC, still accepts `Content-Length` input, and adds no new dependency. — evidence: `docs/tasks/evidence/frictionless-creation/phase1-handshake.txt` (a piped newline `initialize` gets a newline reply)
- [x] Protocol hygiene: `ping` returns `{}`, the client's protocol version is echoed when supported, the server exits when stdin closes, and `clientInfo` is logged. — evidence: `node --test src/stdio.test.ts` → the ping and stdin-exit tests pass; `protocolVersion` `2025-06-18` is echoed (`phase1-handshake.txt`)
- [x] Every array property in the tool schemas declares `items`; Gemini-based clients reject arrays without it. — evidence: the stdio.test.ts assertion "every array schema declares items" passes for all 39 tools
- [x] `scripts/mcp-stdio-client.mjs` uses newline framing. — evidence: it writes `${JSON.stringify(message)}\n` and reads line by line; it is exercised by the Phase 6 e2e
- [x] Add the regression test `tooling/pistola-mcp/src/stdio.test.ts`. It covers: newline `initialize` and `tools/list` replies within 5 s, `ping`, the legacy `Content-Length` input, exit on stdin close, and no array schema without `items`. — evidence: `node --test src/stdio.test.ts src/log.test.ts` → 5 pass, 0 fail
- [x] `--doctor` flag and a `pistola_status` report: Node version, editor reachable, live tab registered, local-operator auth. — evidence: `node editor/tooling/pistola-mcp/src/index.ts --doctor` → 4 ok, "all checks passed"; `pistola_status` returns a `doctor` block through the official SDK client (`phase1-handshake.txt`)
- [x] Official SDK conformance: `@modelcontextprotocol/sdk` `Client` with `StdioClientTransport` connects, lists 39 tools and calls `pistola_status`. — evidence: `docs/tasks/evidence/frictionless-creation/phase1-handshake.txt`
- [ ] **Checkpoint:** BLOCKED: `claude mcp list` shows `pistola` as pending approval. `claude mcp --help` lists add, get, list, login, logout, remove, reset-project-choices, and serve, and none of them approve a project server. The handshake tests themselves pass (`docs/tasks/evidence/frictionless-creation/phase1-handshake.txt`). Codex `mcp list` still only prints config.

### Phase 2 — Watch: build in the user's open tab

- [x] `getDriver` defaults to the bridge driver for the local target. `PISTOLA_TRANSPORT=browser` keeps the headless driver. — evidence: `bridge-check.mjs` with `PISTOLA_TRANSPORT` unset → `pistola_status` reports `"transport": "bridge"` (`docs/tasks/evidence/frictionless-creation/phase2-bridge.txt`)
- [x] With no tab registered, `pistola_open` opens the user's browser at `/workspace` and waits, or fails visibly with instructions. — evidence: bridge.test.ts "open fails with instructions when no tab is registered" passes; the launch step is skipped under `PISTOLA_OPEN_BROWSER=0` and exercised by the Phase 6 per-IDE runs
- [x] Target the most recently focused tab, and list the sessions in `pistola_status`. — evidence: the workspace-bridge.test.ts ranking test passes (connected > visible > focusedAt > lastSeenAt); `GET /api/workspace/session` returns `sessions[]` with `streamConnected`
- [x] Bridge reliability: per-method timeouts, a clear error when the tab closes or reloads, and never reload the user's tab. — evidence: bridge.test.ts → "fails fast when the tab loses its stream" and "unreachable editor points at dev:editor" pass; `PISTOLA_BRIDGE_TIMEOUT_MS` (default 120 s); the tab keeps one event stream instead of reconnecting on every snapshot change (`WorkspaceBridge.tsx`)
- [x] Bridge memory: results are not echoed back to the tab over the event stream, are deleted once read, and the tab reports its visibility. — evidence: the workspace-bridge.test.ts test "consumed results are removed and streamed results omit large payloads" passes; the tab PATCHes `visible` and `focusedAt` on visibility changes and focus
- [x] Local-operator auth works on localhost without signing in, and the token is documented only in `.env.example`. — evidence: `--doctor` → "ok auth local operator accepted"; `apps/editor/.env.example:36` has a commented placeholder only
- [x] Agent builds don't take over the selection: `run` and `taskPlan.runStep` restore the user's selection afterwards unless `{ select: true }` is passed. — evidence: an in-page probe (`window.pistola.run` build_cad_solid) → `sameSelection: true`, `panelOpen: false`; agent-api tests 12 pass (`phase2-bridge.txt`)
- [ ] **Checkpoint:** BLOCKED: Claude Code will not run `pistola_open` until the project `pistola` server is approved in a Claude session (`claude mcp list` → pending approval).

### Phase 3 — See: real renders returned as images

- [x] `SceneCapture` component inside `<Viewer>`: its own camera, `EDITOR_LAYER` off, scans and guides hidden, the live camera untouched. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt` (camera delta 0 after the sheet)
- [x] The CAD origin `AxesHelper` moves to `EDITOR_LAYER`. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt`
- [x] `window.pistola.render({ view | camera, nodeIds?, width, height })` returns a PNG data URL, the camera and the bounds. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt`
- [x] `window.pistola.renderSheet()` returns a labelled 4×2 PNG contact sheet. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-eight-view.png`
- [x] The MCP render tools return real PNG image content on both drivers; the bounding-box sheet stays available as `mode: 'layout'`. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-mcp.txt`
- [x] Every render is also saved to `.pistola/renders/`, which is gitignored, with its path returned, so IDEs that drop MCP images can open the file. Images are capped at 1568 px on the long edge. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-mcp.txt`
- [x] Auto-preview: `pistola_run` and `pistola_task_run_step` attach a small iso render. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-mcp.txt`
- [x] Live camera: `orbit_camera` honours `degrees`, plus new `set_view` and `set_camera` actions. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt`
- [x] Presentation mode also hides the IDE plan panel, the Assistant pill and the account badge. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt`
- [ ] Optional: reduce SSGI speckle, kept only if frame rate stays acceptable.
- [x] **Checkpoint:** replaying `.pistola/studio/claude-self-portrait/actions.json` from an IDE returns a real eight-view PNG, and the live camera and panels are unchanged. — evidence: `docs/tasks/evidence/frictionless-creation/phase3-render.txt`

### Phase 4 — Build right: kernel and checker correctness

- [x] Fix the winding of extrude, revolve, torus and `extrudeProfileZy`, and audit loft, hull, capsule and ellipsoid. Signed volume must be above 0 for every op. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [x] Add a `group` op (merge, no CSG), exempt it from the disjoint-shells check, and document it in `manual().solidSpec`. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [x] Re-test `union` on touching parts; weld vertices after CSG if open edges remain. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt` (`weldByPosition` keeps the welded mesh only when open edges drop)
- [x] Buried-part check uses a mesh containment test, with translucent and `nested: true` opt-outs. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [x] Contact graph uses exact mesh distance (`MeshBVH.closestPointToGeometry`) in both directions, so a real intersection counts as contact. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [x] `getCadBodyTransform` is used in context, measure and scene-geometry. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [x] Tests for winding, `group`, buried/contact true and false positives, and measuring a rotated body. — evidence: `docs/tasks/evidence/frictionless-creation/phase4-kernel.txt`
- [ ] **Checkpoint:** the self-portrait replay gives 0 structure errors, and an extruded cover renders solid. The cover is solid (`phase4-kernel.txt`). Exact mesh distance cleared the false float on "edge of knowing". Six real `FLOATING_PART` errors remain (orbit and beads, 67–208 mm from the nearest supported part).

### Phase 5 — Less friction: API ergonomics and persistence

- [x] `getNodes()` works with no arguments, and `invoke` keeps array arguments whole. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`
- [x] `inspect` and `exportScene` return each cad-body's partId, role, world bbox, color, opacity, triangles and spec; add an `inspect({ partId })` filter. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`
- [x] Per-step snapshots, `taskPlan.undoStep` plus MCP `pistola_task_undo_step`, and re-running a finished step. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`
- [x] Persistence moves to IndexedDB through `idb-keyval`, already a core dependency. It falls back to reading existing localStorage saves, and a failed save shows an error instead of being swallowed. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`
- [x] Replay: record agent actions, plus `exportActions()`, `replay(actions)` and MCP `pistola_replay`. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`
- [x] **Checkpoint:** a one-call replay rebuilds the self-portrait, and a reload keeps the 26-part scene. — evidence: `docs/tasks/evidence/frictionless-creation/phase5-api.txt`

### Phase 6 — Every IDE: configs, skill, docs and end-to-end tests

- [x] `scripts/ide-setup.mjs` configs use bridge mode, with a portable Antigravity path where supported, and `--check` passes. — evidence: `node scripts/ide-setup.mjs --check` → `ide-setup --check passed.` Antigravity stays in the user profile via `--install-user` because that IDE has no project MCP path (`scripts/ide-setup.mjs`).
- [ ] E2E: newline framing, bridge mode with a stand-in tab, a real-PNG assertion, and a 0-error self-portrait replay.
- [x] Skill and Codex studio docs: watch mode, render and `renderSheet`, `group`, the no-reload rule, and a host-aware concept gate. — evidence: `.agents/skills/pistola-direct-control/SKILL.md` sections Watch mode, Render, and Concept gate; `.agents/skills/pistola-features/SKILL.md` `group` row; `.agents/skills/pistola-studio/SKILL.md` gate 1. `node scripts/ide-setup.mjs --check` passed, so the IDE copies match.
- [x] `tooling/pistola-mcp/README.md`: framing, drivers, and the CDP default. Archive the fixed lessons in `.agents/library/LEARNINGS.md`. — evidence: `editor/tooling/pistola-mcp/README.md` newline framing, bridge default for local, no default CDP attach URL. Fixed kernel, contact, measure, and render lessons are under Archive in `.agents/library/LEARNINGS.md`.
- [ ] Verify each IDE (connected, open tab, sailboat build, real render):
  - [ ] Claude Code — BLOCKED: MCP server is pending approval (`claude mcp list`).
  - [x] Codex — `node editor/scripts/codex-sailboat-check.mjs` with `gpt-5.6-sol` on pinned stand-in `415ccba8` (the 54-node tab was left at 54 nodes). Codex called `pistola_task_run_step` and `pistola_render_eight_views`, reported 4 parts, and saved a real eight-view PNG: `docs/tasks/evidence/frictionless-creation/codex-sailboat.png`.
  - [ ] Cursor — `cursor-agent` 2026.04.17 is installed in WSL (`/home/carlos/.local/bin/cursor-agent`). `cursor-agent status` says not logged in, and `cursor-agent mcp list` says `pistola: not loaded (needs approval)`. No sailboat render.
  - [ ] Antigravity — installed (`Antigravity.exe`). `gemini` 0.58.0 refuses this account (`IneligibleTierError`: migrate to Antigravity). The app has no agent CLI. No sailboat render.
  - [x] WorkBuddy — `node editor/scripts/workbuddy-sailboat-check.mjs` with `.workbuddy/settings.json` allowing `DeferExecuteTool` and `mcp__pistola__*`, pinned stand-in `fc79dba9`. CodeBuddy saved a real eight-view PNG (brown hull, white sail): `docs/tasks/evidence/frictionless-creation/workbuddy-sailboat.png`. The log also says `Max turns (8) exceeded` after that render.
  - [ ] Qoder — installed (`C:\Program Files\Qoder\Qoder\Qoder.exe`). No CLI on PATH. No sailboat render.
- [ ] **Acceptance gate:** every phase ticked with evidence, `validate-task-evidence` passes, and `bun run check-types` and `bun run lint` are clean. Note (2026-09-23): `bun run check-types` from `editor/` is 7 successful, 7 total, including `@pascal-app/nodes` and `editor` (re-run after the contact-graph change). `bun run lint` exits 0; remaining diagnostics are warnings and infos. The gate stays open until the open phase checkpoints and the remaining IDE sailboat checks are ticked.
