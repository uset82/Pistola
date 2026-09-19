---
name: pistola-learnings
description: Pistola's shared memory for Codex. After a Pistola build is delivered, record what worked and what failed in .agents/library/LEARNINGS.md, and save the approved blueprint and action batches as a reusable library object. Also covers reading the library before a new build. Use at the end of pistola-studio or when a Pistola workaround is discovered.
---

# Pistola Learnings

The library lets the next session start where this one ended. Keep it small, true, and useful; it is read at the start of every build.

## Before a build

- Read `.agents/library/INDEX.md` and `.agents/library/LEARNINGS.md`.
- If the index has a matching object, load `.agents/library/objects/<slug>.json` and offer to reuse or adapt it.

## After a build

1. **Save the object**, if the user approved it or said it was good enough, to `.agents/library/objects/<slug>.json`:

   ```json
   {
     "slug": "barco-de-juguete",
     "title": "Toy sailboat",
     "approved": "2026-09-19",
     "keywords": ["barco", "boat", "velero", "toy"],
     "host": { "surface": "window.pistola.invoke | mcp pistola_run", "cad_runtime": "mock | python" },
     "blueprint": { ...pistola-image-to-blueprint JSON... },
     "batches": [ [ ...actions with $ref ids and a "LEVEL" placeholder... ] ],
     "critic_rounds": 2,
     "known_gaps": ["hull is a side-profile extrusion, not a true intersection"]
   }
   ```

   - Replace real node ids with `$ref_*` and replace level ids with `"LEVEL"`, so the batches can be replayed.
   - Never store concept images here. They stay in the gitignored `.pistola/studio/`.
2. **Add a row to `INDEX.md`:** slug, title, keywords, date, and a one-line description.
3. **Record lessons in `LEARNINGS.md`.**
   - Add one bullet per lesson under the right heading: `Features`, `Blueprint`, `Concepts` or `Hosts`.
   - Format: `- YYYY-MM-DD: <what happened> → <what to do instead>`.
   - Before adding, look for an existing bullet on the same topic. Update it instead of duplicating it.
   - Keep the file to about 50 active bullets. Move stale ones to the `Archive` section when the platform fixes the underlying issue.
4. **Suggest recipe promotion, don't apply it.** If an object was built well two or more times, suggest adding it to `editor/packages/editor/src/lib/assistant/recipes/creation-recipes.ts`, so the in-app assistant can build it without an LLM. Changing product code needs the user's go-ahead and a normal code review.

## What counts as a lesson

A lesson is a non-obvious fact that changes the next attempt. For example: "a stacked part without `allowOverlap` rolls back the whole batch", or "on pistola.canner.app, CAD extrude is a mock, so use primitives". Generic advice and one-off typos are not lessons.
