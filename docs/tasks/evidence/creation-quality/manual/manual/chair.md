# Manual creation packet: chair

Host: Cursor or Antigravity. Do not use Pistola's in-app Assistant.

## Prompt
A four-leg wooden chair with a flat seat and a simple rectangular backrest.

## Contract
- overall_m: [0.48,0.9,0.48]
- parts: seat, back, leg-fl, leg-fr, leg-bl, leg-br
- frame: +Y up, +Z front, +X right, meters, bottom-center
- world-space parts only (no parentId) unless the child scale is compensated

## Loop
plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report

Write the final exportScene JSON to:
`docs/tasks/evidence/creation-quality/manual/manual/chair.json`
