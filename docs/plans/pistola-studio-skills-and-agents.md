# Pistola Studio: Concept-First Codex Skills and Agents

## Context
Asked to "genera un barco de juguete", Codex (GPT-5.6 / Sol in the Codex app) immediately built an ugly blockout from boxes. Nobody agreed on the look first, and the geometry is boxes stacked on a floor grid. The user wants the repo `D:\Proyectos\pistolacodex` to ship **skills and agents** so that:

1. **Codex agrees on the look first.** It generates a concept image (`image_gen`) and asks the user if they like it. Only after approval does it build the 3D model **from that image**.
2. **Pistola's own agents guide GPT-5.6 / Sol** on how to use Pistola's features (architecture, primitives, CAD, MAC). They also critique the result against the concept and record what they learn, so the system improves continuously and the models support each other.

What Codex supports (verified locally and in the docs):
- The built-in `image_gen` / `view_image` tools, via the `imagegen` system skill (`~/.codex/skills/.system/imagegen`). No API key needed.
- Project skills in `.agents/skills/<name>/SKILL.md`, with optional `agents/openai.yaml`, `references/` and `scripts/`.
- Project custom agents in `.codex/agents/*.toml`, with `name`, `description` and `developer_instructions`, plus optional `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers` and `[[skills.config]]`. They inherit the parent's model and tools when `model` is omitted, and run in parallel.
- The repo already has `agents.md` (role catalog; `.codex/config.toml` has `project_doc_fallback_filenames = ["agents.md"]`) and 8 generic skills: idea-intake, scene-decomposition, execution-planning, scene-validation, pascal-node-mapping, ide-orchestration, mac-cad-generation, export-readiness.

## The Studio loop (what Codex will do)
```
Intake → Concept (image_gen, 2–3 variants) → USER GATE: pick or adjust
       → Blueprint (image → parts + silhouettes, in meters) → Feature plan (which Pistola tools)
       → Build (execute in page) → Screenshot → Critic vs concept → fix (≤3 rounds)
       → USER GATE: side-by-side review → Librarian saves lessons + reusable blueprint
```
- **The main Codex thread is the Orchestrator/Builder.** It is the only one that talks to the user, generates images and drives the browser. Only one agent ever touches the live page.
- **Sub-agents do the thinking:** blueprint, feature choice, critique and learning. They return JSON the Builder executes.
- **Skipping the concept.** If the user says "sin concepto / just build", or passes their own reference image, go straight to Blueprint.

## Part A: Skills (`.agents/skills/`, new)
1. **`pistola-studio/`**: the entry skill, invoked implicitly for "genera / crea / haz / make / build a 3D …".
   - `SKILL.md` covers the loop, the two user gates, stop conditions (max 3 critic rounds, then ask) and file locations. It routes to the other skills and agents.
   - `references/concept-prompting.md` covers buildable concept art: a clean white background, a 3/4 hero view, and an **orthographic sheet** (front / side / top) for tracing. It also covers style presets (toy, low-poly, realistic, architectural), and the note "simple readable forms, no tiny detail below 2 cm scale".
   - `agents/openai.yaml` holds the display name, a default prompt, and implicit invocation on.
2. **`pistola-image-to-blueprint/`**: converts an approved image into a parts blueprint.
   - `references/blueprint.schema.json` defines each part as `{ id, name, role, shape: primitive|profile-extrude|silhouette-intersection|revolve|cad-brief|mac, dims_m, position_m, rotation_deg, color, parent, source_view }`, plus the overall scale anchor.
   - `references/techniques.md`:
     - Scale from one known dimension.
     - **Silhouette intersection:** extrude the side outline × the top outline, then intersect. This is how the hull gets its real shape.
     - Revolve for round parts; primitives only for genuinely boxy parts.
     - Toy-style simplification.
   - `scripts/trace_silhouette.py` (Python + Pillow) thresholds a clean-background view, traces the outer contour (marching squares), simplifies it (Douglas-Peucker) and outputs a polygon scaled to meters. This is deterministic, so Codex doesn't eyeball coordinates.
3. **`pistola-features/`**: the "internal guide" for using Pistola.
   - `SKILL.md` gives a decision table:
     - architecture tools for buildings;
     - `place_item` primitives for boxy assemblies;
     - `execute_cad_brief` extruded profiles (works today, including on hosted);
     - `build_cad_solid` for silhouette intersections and booleans (after Part C);
     - `generate_mac_part` only where the real MAC runtime exists (mock on hosted).
   - `references/actions-cookbook.md` covers:
     - working patterns: explicit `levelId` / `nodeId`, `$ref_N`, `parentId` nesting, `allowOverlap`, ≤25 actions per chunk;
     - coordinates: meters, Y up, floor y = 0;
     - known errors and their fixes: "cannot be placed at the requested floor position", "must be reviewed", implicit-target drift, "Failed to fetch".
   - `references/execution-surfaces.md` ranks how to execute, best first:
     1. `window.pistola.run()`
     2. the chat `/run {json}` command
     3. local `pistola-mcp` `pistola_execute`
     4. natural-language chat prompt with the concept image attached (last resort)

     It also tells Codex how to detect which one is available.
   - The source of truth for schemas is `window.pistola.manual()` or `/agents/manual.json` once Part C ships. The cookbook links there instead of duplicating the 91 action types.
4. **`pistola-visual-critique/`**: rubric for comparing a viewport screenshot with the concept: silhouette/proportions, part count, placement, color/material, toy readability. It outputs a ranked fix list mapped to blueprint part ids, with concrete action patches, and returns pass/fail.
5. **`pistola-learnings/`**: the continuous-improvement loop.
   - After each delivery, append a dated lesson to `.agents/library/LEARNINGS.md` (what failed, the workaround, which feature). Keep it curated and short: merge duplicates, and use at most about 50 lines of active lessons.
   - Save the approved blueprint and its action batches as `.agents/library/objects/<slug>.json`, and index them in `.agents/library/INDEX.md`.
   - `pistola-studio` checks the library first ("barco de juguete" → reuse and adapt).
   - Propose, but never auto-apply, promoting a proven blueprint into `packages/editor/src/lib/assistant/recipes/creation-recipes.ts`. That needs a human-reviewed PR.

Update the existing skills' descriptions so they route to `pistola-studio` for object requests and to `ide-orchestration`, which points at the new surfaces. Also update `mac-cad-generation` to state that MAC is a mock on hosted deploys.

## Part B: Custom agents (`.codex/agents/*.toml`, new)
All of them omit `model`, so they inherit GPT-5.6 / Sol. Each attaches the relevant skills via `[[skills.config]]`.

| Agent | sandbox | Job | Returns |
|---|---|---|---|
| `pistola_blueprint` | read-only | Reads the approved concept image (`view_image`) and the traced silhouettes; applies `pistola-image-to-blueprint` | Blueprint JSON (schema-valid) |
| `pistola_feature_guide` | read-only | Picks the Pistola feature for each part (`pistola-features`); converts the blueprint into validated action chunks; flags deploy limits (mock CAD/MAC) | Action batches + rationale |
| `pistola_critic` | read-only | Compares the screenshot with the concept (`pistola-visual-critique`). It can be spawned twice in parallel: one pass for proportions/silhouette, one for details/color | Ranked fix list + pass/fail |
| `pistola_librarian` | workspace-write (only `.agents/library/**`) | Distills lessons and saves reusable blueprints (`pistola-learnings`) | Paths written |

Update root `agents.md`:
- a "Studio loop" section mapping its existing roles (Orchestrator, Scene Planning, Pascal Integration, Quality) to these agents;
- the rule that only the main thread drives the browser and talks to the user.

`editor/AGENTS.md` gets a one-line pointer.

Storage:
- Concept images and screenshots go in `.pistola/studio/<slug>/` (concept-v1..3.png, ortho-sheet.png, render-rN.png). This folder is **gitignored**, since the repo is public.
- The JSON library under `.agents/library/` is committed.

## Part C: Platform work that makes the loop smooth
This is carried over from the previously approved plan, in the same order. The skills work today through fallback 3/4 and `execute_cad_brief` profiles, and get much better as each item lands.
1. **Phase 0.**
   - Shared `createAssistantRuntime()` (`packages/editor/src/lib/assistant/runtime.ts`).
   - Assembly fix in `builders.ts`: honor `parentId`, and don't collision-check stacked or primitive parts.
   - Fix the `board` recipe.
   - Readable "Failed to fetch" messages.
2. **Phase 1–2.**
   - The agent API `packages/editor/src/lib/agent-api/`: `manual`, `inspect`, `validate`, `run`, `waitForIdle`, `undo`, `screenshot`.
   - `window.pistola` via `AgentApiBridge` in `PistolaWorkspaceShell.tsx`.
   - The chat `/run` `/validate` `/inspect` `/recipe` `/manual` commands in `AiAssistantPanel.tsx`.
   - Generated `public/agents/manual.json` and `llms.txt`.
   - WebMCP moved into the shared shell.
3. **Phase 3.** A `manifold-3d` local kernel plus the `build_cad_solid` spec (primitives, extrude with holes, revolve, union/difference/intersection, mirror, arrays), stored as a spec in a `cad-body` `mesh` preview. This enables silhouette intersection and real shapes on both deploys.

Code work happens in the existing worktree `D:\Proyectos\pistolacodex-agent` (branch `feat/agent-api`), because the Codex session edits `main` in place. Parts A and B are new files only, so they can be written in the main tree and committed by explicit path.

## Files
- **New:** `.agents/skills/{pistola-studio, pistola-image-to-blueprint, pistola-features, pistola-visual-critique, pistola-learnings}/` (each with `SKILL.md`, `agents/openai.yaml` and `references/` as listed); `.agents/skills/pistola-image-to-blueprint/scripts/trace_silhouette.py`; `.codex/agents/{pistola_blueprint, pistola_feature_guide, pistola_critic, pistola_librarian}.toml`; `.agents/library/{INDEX.md, LEARNINGS.md, objects/}`.
- **Edit:** `agents.md`, `editor/AGENTS.md`, `.gitignore` (`.pistola/studio/`), and the `SKILL.md` descriptions of `ide-orchestration`, `mac-cad-generation` and `idea-intake`.
- **Part C code:** as listed in Part C.

## Verification
- **Static checks:**
  - every `SKILL.md` has valid frontmatter (`name` and `description`);
  - each `.codex/agents/*.toml` parses and has the required fields;
  - `blueprint.schema.json` validates the sample blueprint in `references/`;
  - `trace_silhouette.py` returns a polygon with the expected area (±5%) on a bundled test silhouette.
- **Codex discovery:** in the Codex app on this repo, `$pistola-studio` appears in the skill list, and "spawn pistola_critic" works.
- **End-to-end in the Codex app:** "genera un barco de juguete".
  - Codex shows 2–3 concept images and **asks** before building.
  - After a pick, it runs blueprint → feature plan → build.
  - The screenshot critique loops at most 3 times.
  - The final message shows the concept and render side by side and asks for feedback.
  - `.agents/library/objects/barco-de-juguete.json` and a lesson are written.
- **Repeat test:** a second "barco de juguete" request reuses the library entry, needs fewer critic rounds and doesn't ask for new concepts unless the user wants them.
- **Part C:** unit tests plus browser E2E as in the earlier plan. Also: `window.pistola.run()` builds the traced hull with `build_cad_solid` on pistola.canner.app and on the Sites export.
