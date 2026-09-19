# Creation benchmark

Scores IDE-built Pistola objects against hand-built gold assemblies.

```bash
node editor/scripts/creation-benchmark/run.mjs --mode replay
node editor/scripts/creation-benchmark/score.mjs --from docs/tasks/evidence/creation-quality/baseline
node editor/scripts/creation-benchmark/run.mjs --mode agent --cli codex --seeds 3
node editor/scripts/creation-benchmark/run.mjs --mode manual --set dev
```

Replay interprets `place_item` in Node (same bottom-center AABB as `getNodeBounds`). Gold masks are those AABBs projected onto front/side/top occupancy grids, so IoU needs no image generation. Phase 5 will replace the grid with the CPU rasterizer.

The held-out set (bench, mug, desk fan, wheelbarrow, rocket, bookshelf) must not become library examples.
