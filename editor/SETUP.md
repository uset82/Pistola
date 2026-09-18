# Pascal Editor - Setup Guide

This guide will help you set up the Pascal Editor with app-managed email/password auth, Codex-backed assistant orchestration, FreeCAD-backed CAD execution, and the integrated local CAD helper used by Pistola's CAD workspace.

## Prerequisites

- Node.js 18+ or Bun 1.3+
- Docker Desktop (optional, if you run Supabase locally outside this repo)

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

This installs the workspace dependencies used by the editor app and packages.

### 2. Start Your Database

```bash
<start your Postgres or Supabase instance>
```

Pistola's auth flow only requires a reachable Postgres-compatible database for `POSTGRES_URL`. If you use Supabase locally, start it with your own Supabase CLI workflow outside this repo. A typical local connection string looks like:

```
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### 3. Configure Environment Variables

Copy `apps/editor/.env.example` to `apps/editor/.env.local`, then fill in the values you need:

```bash
# Database Connection (Supabase local)
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# App auth session secret (generate your own secret with: openssl rand -base64 32)
BETTER_AUTH_SECRET=<generate_with_command_below>

# Google Maps (optional, for address search)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your_google_maps_key>

# Local CAD helper
PISTOLA_CAD_HELPER_URL=http://127.0.0.1:7878
PISTOLA_CAD_HELPER_RUNTIME=python
NEXT_PUBLIC_CAD_HELPER_URL=http://127.0.0.1:7878
FREECAD_PATH=C:\Users\carlos\PROYECTOS\pistolacodex\editor\third_party\FreeCAD\build\release\bin\FreeCADCmd.exe

# AI provider selection (recommended: direct OpenAI)
PISTOLA_AI_PROVIDER=openai
# Integrated assistant default:
PISTOLA_ASSISTANT_AI_PROVIDER=codex
# The assistant can use either OPENAI_API_KEY or cached local Codex login state.
OPENAI_API_KEY=<your_openai_api_key>
PISTOLA_ASSISTANT_MODEL=gpt-5.3-codex
PISTOLA_ASSISTANT_REASONING_EFFORT=medium
PISTOLA_CAD_MODEL=gpt-5.4
# Optional if you need to override the default OpenAI endpoint:
# PISTOLA_ASSISTANT_AI_BASE_URL=https://api.openai.com/v1/responses
# PISTOLA_CAD_AI_BASE_URL=https://api.openai.com/v1/responses

# Optional OpenRouter alternative
OPENROUTER_API_KEY=<your_openrouter_api_key>
# If you switch to OpenRouter, also set:
# PISTOLA_AI_PROVIDER=openrouter
# PISTOLA_ASSISTANT_MODEL=openai/gpt-5.4
# PISTOLA_CAD_MODEL=openrouter/free
# PISTOLA_ASSISTANT_AI_BASE_URL=https://openrouter.ai/api/v1
# PISTOLA_CAD_AI_BASE_URL=https://openrouter.ai/api/v1
PISTOLA_ASSISTANT_AI_HTTP_REFERER=http://127.0.0.1:3002
PISTOLA_ASSISTANT_AI_TITLE=Pistola
PISTOLA_CAD_AI_HTTP_REFERER=http://127.0.0.1:3002
PISTOLA_CAD_AI_TITLE=Pistola

# Backward-compatible alias for the OpenRouter key
PISTOLA_CAD_AI_API_KEY=<your_openrouter_api_key>
```

Generate a secret for `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

OpenAI is used here as a server-side AI provider, not as an end-user sign-in provider. Users create local Pistola accounts with email/password, and they may use the same email address they use with OpenAI if they want.

`/api/assistant/plan` is the primary AI route in the app shell. Codex is the single assistant control plane for chat, scene planning, and standard CAD prompting. `/api/cad/*` remains the helper execution and health surface.

### 4. Auth Storage Behavior

No manual auth migration step is required in the current repo. Once the app is running, Pistola creates its auth tables (`pistola_auth_users` and `pistola_auth_sessions`) lazily the first time a signup or signin request reaches the app.

### 5. CAD Helper Runtime

The integrated local CAD runtime lives under the tracked repo:

- `third_party/FreeCAD` contains the FreeCAD source submodule
- `tooling/freecad-helper` contains the Python helper

In the normal app flow you do not need to start the helper manually. `apps/editor` auto-starts `tooling/freecad-helper` on the first CAD health check or job request whenever `PISTOLA_CAD_HELPER_RUNTIME=python` and `PISTOLA_CAD_HELPER_URL` points at a local loopback URL such as `http://127.0.0.1:7878`.

If `FREECAD_PATH` is not set, the helper auto-detects the common integrated `FreeCADCmd.exe` outputs under `editor/third_party/FreeCAD`, including `build/release/bin`, `build/debug/bin`, `build/bin`, and `.pixi/envs/default/Library/bin`. Set `FREECAD_PATH` only when your build output lives elsewhere.

If you want to run the canonical helper manually from the repository root:

```bash
cd tooling/freecad-helper
python -m uvicorn main:app --host 127.0.0.1 --port 7878
```

### 5b. Multi-Agent-CAD (MAC) sidecar

Advanced text-to-CAD uses a separate sidecar at `tooling/mac-helper` (default `http://127.0.0.1:7879`). FreeCAD stays the interactive engine; MAC generates standalone mechanical parts via [Pan-Chera/Multi-Agent-CAD](https://github.com/Pan-Chera/Multi-Agent-CAD).

Pistola does **not** vendor MAC. Clone and install it yourself:

```bash
git clone https://github.com/Pan-Chera/Multi-Agent-CAD.git
cd Multi-Agent-CAD
conda env create -f environment.yml
conda activate multi_agent_cad
pip install --no-deps "aider-chat==0.82.3"
```

Then in `apps/editor/.env.local`:

```bash
PISTOLA_MAC_HELPER_URL=http://127.0.0.1:7879
PISTOLA_MAC_HELPER_RUNTIME=python
PISTOLA_MAC_ROOT=C:\path\to\Multi-Agent-CAD
PISTOLA_MAC_PYTHON=C:\path\to\conda\envs\multi_agent_cad\python.exe
OPENROUTER_API_KEY=<your_openrouter_key>
PISTOLA_MAC_MODEL=openrouter/free
```

For plumbing tests without installing MAC, set `PISTOLA_MAC_HELPER_RUNTIME=mock`.

Install the same OpenRouter model from the CAD panel **AI Model** section (writes gitignored `.pistola-ai.local.json`) or via MCP `pistola_configure_model`. That config is shared by assistant planning, CadBrief planning, and MAC stages.

### 5c. IDE control (MCP)

Cursor / VS Code / Codex can drive Pistola through `tooling/pistola-mcp` (see repo `.cursor/mcp.json`):

1. Start the editor and keep a live workspace tab open.
2. Sign in through `/login`; development-only token-based MCP calls still need that signed-in browser tab for scene mutations. Alternatively, for a local auth-free workspace leave `PISTOLA_LOCAL_API_TOKEN` unset and set `PISTOLA_ALLOW_UNAUTHENTICATED_API=1` in `apps/editor/.env.local` (development only).
3. Use MCP tools such as `pistola_chat`, `pistola_generate_mac`, and `pistola_configure_model`.

Scene mutations require the open tab (`WorkspaceBridge` + `/api/workspace/*`).

The bundled Node helper in `tooling/cad-helper/server.mjs` is now mock-only. Use it only when you explicitly opt in:

```bash
PISTOLA_CAD_HELPER_RUNTIME=mock
cd tooling/cad-helper
node server.mjs
```

Notes:

- The default helper URL is `http://127.0.0.1:7878`.
- Set `PISTOLA_CAD_HELPER_RUNTIME=python` for the canonical local helper, `mock` for the bundled scaffold helper, or `external` when another process owns the helper lifecycle.
- Set `PISTOLA_CAD_HELPER_URL` only if you want the app routes to target a different helper instance. Loopback URLs are treated as locally managed only when the runtime mode is `python` or `mock`.
- Set `NEXT_PUBLIC_CAD_HELPER_URL` only if browser-side CAD jobs should target a different helper URL.
- The bundled Node helper in `tooling/cad-helper` is mock-only and should stay an explicit opt-in.
- Standard CAD prompting now flows through the assistant route and resolves into direct assistant actions or `execute_cad_brief`, not a separate CAD planner surface.

### 6. Start the Development Server

```bash
bun dev
```

The editor is typically available at `http://localhost:3000`. If that port is occupied, the dev server may move to another local port such as `3002`.

## Monorepo Structure

```
.
├── apps/
│   └── editor/              # Next.js editor application
│       ├── app/
│       │   ├── api/auth/    # Signup, signin, signout, session routes
│       │   └── login/       # Email/password auth screen
│       ├── components/      # App UI components
│       └── lib/auth/        # Auth config, sessions, and Postgres helpers
├── third_party/
│   └── FreeCAD/             # Integrated FreeCAD source submodule
├── tooling/
│   ├── cad-helper/          # Bundled mock CAD helper runtime
│   └── freecad-helper/      # Canonical Python FreeCAD bridge
├── packages/
│   ├── core/               # @pascal-app/core - Core editor logic
│   ├── editor/             # @pascal-app/editor - editor shell + CAD tooling
│   ├── ui/                 # Shared UI primitives
│   ├── viewer/             # @pascal-app/viewer - 3D viewer
│   ├── eslint-config/      # Shared lint config
│   └── typescript-config/  # Shared tsconfig presets
└── turbo.json
```

## Database Schema

### Auth Tables

- **pistola_auth_users** - App-managed user accounts with normalized email and password hash
- **pistola_auth_sessions** - Signed session records keyed by a hashed session token

### Application Tables

- **properties** - User properties
  - `id`: Property ID
  - `name`: Property name
  - `owner_id`: User ID (foreign key to users)

- **properties_addresses** - Property addresses with Google Maps data
  - `id`: Address ID
  - `property_id`: Property ID (foreign key)
  - `formatted_address`: Full address
  - `latitude`, `longitude`: GPS coordinates
  - Plus detailed address components (street, city, state, etc.)

- **properties_models** - Scene graph models (versions)
  - `id`: Model ID
  - `property_id`: Property ID (foreign key)
  - `name`: Model name
  - `version`: Version number
  - `draft`: Draft status
  - `scene_graph`: JSONB scene graph data

## Features

### Authentication

- **Email/Password Sign-In**: Users create a Pistola-managed account at `/login`
- **Session Management**: 30-day signed sessions stored in secure httpOnly cookies
- **OpenAI Separation**: Users may reuse their OpenAI email address, but OpenAI is not the sign-in provider

### Property Management

- **Create Properties**: Add properties with real-world addresses
- **Google Maps Integration**: Address autocomplete and geocoding
- **Switch Properties**: Seamlessly switch between properties

### Scene Management

- **Auto-Save**: Changes saved every 2 seconds
- **Scene Loading**: Automatic scene loading when switching properties
- **Version Control**: Models are versioned for future rollback support

### CAD Workspace

- **Sketch and Solid Modeling**: `cad-sketch` and `cad-body` nodes inside the same scene graph
- **STEP Import/Export**: Local helper-backed interop for CAD artifacts
- **CAD AI Planning**: Codex-led assistant execution that can emit direct CAD briefs and runtime actions
- **Helper Status**: Clear runtime health/error state inside the editor shell

## Development Workflow

### Making Database Changes

There is no checked-in database package or migration workflow in this repo right now. The built-in auth tables are created directly by `apps/editor/lib/auth/db.ts` when needed.

If you introduce durable application tables later, add an explicit migration location and update this guide in the same change.

### Updating Database Types

There is no generated database types package in the current workspace. Keep any new query or schema types next to the code that owns them until a dedicated database package exists.

### Testing Authentication

1. Start the editor: `bun dev`
2. Open `/login`
3. Create an account with email and password
4. Confirm you are redirected to `/`
5. Verify the signed-in badge appears and AI/CAD routes respond only while the session exists

## Supabase Studio

Access the local Supabase Studio at: http://127.0.0.1:54323

Use this to:
- Browse and edit tables
- Run SQL queries
- View logs
- Manage RLS policies
- Test database functions

## Production Deployment

For production deployment:

1. Create a Supabase project at https://supabase.com
2. Get your production database connection string
3. Update environment variables in your hosting platform
4. Set `POSTGRES_URL`, `BETTER_AUTH_SECRET`, and your AI provider credentials in production
5. If you add a real migration workflow later, run it as part of deployment before exposing signup/login to users

## Troubleshooting

### "Missing POSTGRES_URL" error

Make sure you've set `POSTGRES_URL` in `apps/editor/.env.local` to your Supabase connection string.

### Local database not reachable

Verify that the Postgres or Supabase instance referenced by `POSTGRES_URL` is running and accepting connections from the app.

### Auth tables not being created

Confirm the configured database user can create tables and indexes, then hit `/login` and submit a signup request once so the lazy auth schema initialization runs.

### Auth not working

1. Verify `POSTGRES_URL` and `BETTER_AUTH_SECRET` are set in `apps/editor/.env.local`
2. Check that `apps/editor/app/api/auth/signup/route.ts` and `signin/route.ts` exist
3. Confirm the `pistola_auth_users` and `pistola_auth_sessions` tables can be created in your Postgres database

## Next Steps

- Add password reset and email verification flows
- Add OAuth providers (Google, GitHub, etc.)
- Set up production Supabase project
- Configure RLS policies for additional security
- Add more property features (sharing, collaboration, etc.)
