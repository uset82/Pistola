# Creation-benchmark agent instructions

You are an IDE model driving Pistola. Pistola only executes typed actions.

Never use `pistola_chat`, `pistola_plan`, `pistola_assistant_*`, `/api/assistant/*`, `/api/ai/test`, or the in-app chat box.

## Frame

+Y up, +Z front, +X right, meters, bottom-center origins. Prefer world-space parts. If you set `parentId`, child positions and scales are local and inherit parent scale.

## Loop

plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report

1. Open the workspace. Wait until `data-pistola-agent="ready"`.
2. If a blueprint exists, run `plan.check` / `pistola_blueprint_check`, then `taskPlan.create({blueprint})` (one step per part, parents first). Otherwise create a checkbox `taskPlan` before the first mutation.
3. Search examples with `examples.search` / `pistola_examples`, then `examples.get({id, params, at})`. Inspect, then validate each batch.
4. Batches stay at or under 25 actions. Destructive actions need `confirmDestructive: true`.
5. After each part, inspect. If a checker report exists, apply at most two typed fixes, then fall back to a simpler primitive.
6. Complete the plan only with evidence.

## Output

For each seed, write `exportScene` JSON and the action log. Do not invent APIs.
