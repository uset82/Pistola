# OpenRouter-Free CAD Planner Integration — Codex Task Plan

> **Codex operating contract:**
> - Change `- [ ]` to `- [x]` the moment an action is confirmed complete. Never before.
> - Never advance past an unchecked box within the current section.
> - At every `### ✅ Checkpoint` block, run every listed command and confirm exit 0 before continuing.
> - At every `### 🚦 Smoke Test` block, run the listed curl/manual checks before marking the section done.
> - If a checkpoint or smoke test fails, stop, report the failure, and do not mark it checked.

---

## Pre-flight

- [ ] Read `rules.md`
- [ ] Read `editor/AGENTS.md` — confirm package boundaries; `route.ts` lives in `apps/editor`, never touches `packages/`
- [ ] Open `editor/apps/editor/app/api/cad/brief/route.ts` — read the full file before touching it
- [ ] Open `editor/apps/editor/lib/cad-ai-pipeline.ts` — read the full file
- [ ] Open `editor/apps/editor/components/editor/CadAiPanel.tsx` — read the full file
- [ ] Confirm `@openrouter/sdk` is already listed in `editor/apps/editor/package.json` dependencies — do NOT install again
- [ ] Note the existing silent-fallback in `route.ts` lines 362-368: `catch { raw = JSON.stringify(buildFallbackBrief(...)) }` — this is the primary behavior to remove

---

## Section 1 — Environment setup and `.env.example`

### 1A · Create the app-local env example

- [ ] Create `editor/apps/editor/.env.example` with the following variables and comments:

```
# ── CAD AI provider ──────────────────────────────────────────────────────────
# Priority: OPENROUTER_API_KEY > PISTOLA_CAD_AI_API_KEY > OPENAI_API_KEY > local fallback

# Primary OpenRouter credential (preferred)
OPENROUTER_API_KEY=

# Backward-compatible alias for OpenRouter (one-release grace period)
# PISTOLA_CAD_AI_API_KEY=

# OpenAI direct credential (used only when no OpenRouter key is set)
# OPENAI_API_KEY=

# Model override — leave blank to use provider default
# OpenRouter default: openrouter/optimus-alpha
# OpenAI default:     gpt-5.4
# PISTOLA_CAD_MODEL=

# OpenRouter metadata headers (optional but recommended)
# PISTOLA_CAD_AI_HTTP_REFERER=https://your-deployment-url
# PISTOLA_CAD_AI_TITLE=Pistola

# ── CAD Helper service ───────────────────────────────────────────────────────
NEXT_PUBLIC_CAD_HELPER_URL=http://localhost:7878
```

- [ ] Verify the file was created at `editor/apps/editor/.env.example` (not at repo root)

---

## Section 2 — Provider resolution in `route.ts`

Target file: `editor/apps/editor/app/api/cad/brief/route.ts`

### 2A · Replace `getCadAiConfig()` with explicit key-based provider resolution

- [ ] Remove the current `getCadAiConfig()` function (lines 152-168 in route.ts)
- [ ] Add a new `resolveProvider()` function with this exact precedence:
  1. `OPENROUTER_API_KEY` set → `{ provider: "openrouter", apiKey: OPENROUTER_API_KEY }`
  2. else `PISTOLA_CAD_AI_API_KEY` set → `{ provider: "openrouter", apiKey: PISTOLA_CAD_AI_API_KEY }`
  3. else `OPENAI_API_KEY` set → `{ provider: "openai", apiKey: OPENAI_API_KEY }`
  4. else → `{ provider: "fallback", apiKey: null }`
- [ ] Add a `resolveModel(provider)` helper: `if provider === "openrouter" return process.env.PISTOLA_CAD_MODEL || "openrouter/optimus-alpha"`; `if provider === "openai" return process.env.PISTOLA_CAD_MODEL || "gpt-5.4"`
- [ ] Keep `PISTOLA_CAD_AI_HTTP_REFERER` and `PISTOLA_CAD_AI_TITLE` reads — move them into the OpenRouter request function in Section 3

### ✅ Checkpoint 2A

- [ ] `cd editor && bun run check-types` exits 0

---

## Section 3 — Split provider request paths

Target file: `editor/apps/editor/app/api/cad/brief/route.ts`

### 3A · Add `requestOpenRouterBrief()` using `@openrouter/sdk`

- [ ] Add import at top of `route.ts`: `import OpenAI from "@openrouter/sdk"`
- [ ] Create `requestOpenRouterBrief(body: CadBriefRequest, apiKey: string): Promise<string>`:
  - construct `new OpenAI({ apiKey, defaultHeaders: { "HTTP-Referer": process.env.PISTOLA_CAD_AI_HTTP_REFERER ?? "", "X-Title": process.env.PISTOLA_CAD_AI_TITLE ?? "Pistola" } })`
  - call `client.chat.completions.create({ model: resolveModel("openrouter"), messages: [{ role: "system", content: CAD_BRIEF_SYSTEM_PROMPT }, { role: "user", content: getPromptContext(body.prompt, body.context, body.retry ?? 0) }], temperature: 0.1, response_format: { type: "json_object" } })`
  - extract text from `response.choices[0]?.message?.content`
  - if content is null/empty: throw `new Error("OpenRouter returned an empty response.")`
  - wrap the whole call in `AbortSignal.timeout(20_000)` — pass via `signal` in the options if the SDK supports it, otherwise use `Promise.race` with a timeout rejection
  - return the content string

### 3B · Rename and isolate `requestOpenAiBrief()`

- [ ] Rename existing `requestRemoteCadBrief` → `requestOpenAiBrief`
- [ ] Remove the `getCadAiConfig()` call from inside it — instead accept `(body: CadBriefRequest, apiKey: string): Promise<string>` as signature
- [ ] Inside the function: use `resolveModel("openai")` for the model and read referer/title directly from `process.env`
- [ ] Keep the existing Responses API request body shape unchanged (`input[]`, `text.format.json_schema`)
- [ ] Keep `extractResponseText()` — it is only called from `requestOpenAiBrief`

### ✅ Checkpoint 3

- [ ] `cd editor && bun run check-types` exits 0
- [ ] `cd editor && bun run lint` exits 0

---

## Section 4 — Remove silent fallback; wire explicit dispatch in `POST`

Target file: `editor/apps/editor/app/api/cad/brief/route.ts`

### 4A · Rewrite the `POST` handler dispatch block

- [ ] Replace the current `if (config.apiKey) { try { ... } catch { raw = fallback; provider = "fallback" } }` block with:

```typescript
const { provider, apiKey } = resolveProvider()

let raw: string

if (provider === "fallback") {
  raw = JSON.stringify(buildFallbackBrief(body.prompt, body.context))
} else {
  // Remote configured — failure is a hard 502, not a silent fallback
  const remoteRaw =
    provider === "openrouter"
      ? await requestOpenRouterBrief(body, apiKey!)
      : await requestOpenAiBrief(body, apiKey!)

  raw = normalizeCadBrief(remoteRaw)
}
```

- [ ] The `await` calls above must NOT be wrapped in a try-catch that swallows to fallback — let them throw to the outer `catch` in `POST`

### 4B · Update the outer `catch` to include `provider` in the 502 response

- [ ] Find the outer `catch` in `POST` (currently returns `{ error }` with status 502)
- [ ] Change it to return `{ error: error instanceof Error ? error.message : "Unable to generate a CAD brief.", provider: resolveProvider().provider }` with status 502

### 4C · Update the 200 success response to include `provider`

- [ ] The existing success response already returns `{ raw, provider }` — confirm `provider` comes from `resolveProvider()` (not the old `config.provider`)
- [ ] Confirm `Cache-Control: no-store` header is still present

### ✅ Checkpoint 4

- [ ] `cd editor && bun run check-types` exits 0
- [ ] `cd editor && bun run lint` exits 0

---

## Section 5 — Client-side error handling in `cad-ai-pipeline.ts`

Target file: `editor/apps/editor/lib/cad-ai-pipeline.ts`

### 5A · Read `provider` from error payload

- [ ] In `requestCadBrief`, when `!response.ok`, update the payload read:
  ```typescript
  const payload = await response.json().catch(() => null)
  const providerLabel = payload?.provider ? `[${payload.provider}] ` : ""
  throw new Error(providerLabel + (payload?.error || "CAD AI route failed to generate a brief."))
  ```
- [ ] This ensures the thrown error message reads `[openrouter] <message>` or `[openai] <message>` instead of a generic string

### 5B · Export `provider` from `CadBriefResponse` type for future use

- [ ] In `cad-ai-pipeline.ts`, confirm `CadBriefResponse` type already includes `provider: 'fallback' | 'openai' | 'openrouter'` — if not, add it
- [ ] No streaming changes — keep the existing non-streaming fetch path intact

### ✅ Checkpoint 5

- [ ] `cd editor && bun run check-types` exits 0

---

## Section 6 — UI error copy in `CadAiPanel.tsx`

Target file: `editor/apps/editor/components/editor/CadAiPanel.tsx`

### 6A · Surface provider label in `panelError`

- [ ] The `panelError` string is set from `error.message` in `handlePlan` (line 83) — no change needed in the component itself since the provider label is now embedded in the error message from Section 5A
- [ ] Confirm the `panelError` display block (around line 282) renders the full string including `[openrouter]` prefix — it already does since it just renders `{panelError}`
- [ ] No streaming or UI contract changes — leave all other component logic untouched

### ✅ Checkpoint 6

- [ ] `cd editor && bun run check-types` exits 0
- [ ] `cd editor && bun run lint` exits 0

---

## Section 7 — Final build and smoke tests

### ✅ Checkpoint 7 — Type and build

- [ ] `cd editor && bun run check-types` exits 0
- [ ] `cd editor && bun run build` exits 0

---

### 🚦 Smoke Test — Environment resolution

Start the dev server with each env config below and confirm the logged or returned `provider` field matches.

**Test 1 — OpenRouter key only**
- [ ] Set `OPENROUTER_API_KEY=<real-or-test-key>` in `.env.local`; unset all other keys
- [ ] POST `{"prompt":"create a box 1m x 1m x 1m"}` to `/api/cad/brief`
- [ ] Response includes `"provider":"openrouter"` and status 200 (or 502 if key is invalid — must NOT be `"provider":"fallback"`)

**Test 2 — Legacy alias only**
- [ ] Set `PISTOLA_CAD_AI_API_KEY=<key>` only
- [ ] POST same prompt — response includes `"provider":"openrouter"`

**Test 3 — OpenAI key only**
- [ ] Set `OPENAI_API_KEY=<key>` only
- [ ] POST same prompt — response includes `"provider":"openai"`

**Test 4 — No remote keys (local fallback)**
- [ ] Unset all AI keys
- [ ] POST `{"prompt":"create a box 1m x 2m x 0.5m"}` — response `"provider":"fallback"`, status 200, `raw` contains a valid extruded box brief

**Test 5 — Remote provider configured, invalid response simulated**
- [ ] Set `OPENROUTER_API_KEY` to a clearly invalid key (e.g. `or-invalid`)
- [ ] POST prompt — expect status 502 with `{ error: "[openrouter] ...", provider: "openrouter" }` — must NOT fall back to local

**Test 6 — Ambiguous prompt**
- [ ] With valid OpenRouter key: POST `{"prompt":"make a bracket"}` — response is either:
  - 200 with `ambiguities` non-empty (model responded), or
  - 502 with provider error (model failed) — either is acceptable; no silent fallback to local

**Test 7 — UI error copy**
- [ ] With invalid key active, trigger a Plan in the CAD panel — confirm `panelError` reads `[openrouter] …` not a generic message

---

## Scope boundaries — DO NOT change in this slice

- [ ] (out of scope) Streaming responses — keep `fetch` non-streaming
- [ ] (out of scope) Prompt quality improvements for free-tier models
- [ ] (out of scope) API key logging — never log key values; log only `provider`, `model`, and error summary
- [ ] (out of scope) Root-level `.env.example` — do not modify or delete it
- [ ] (out of scope) `env.mjs` validation — CAD AI vars are optional server-only; do not add them to the t3-env schema

---

*Last updated: 2026-03-24 | OpenRouter-Free CAD Planner Integration v1*

