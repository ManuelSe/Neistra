# MolWeave

MolWeave is a local, single-user molecular project workspace. Milestone 1
provides durable projects, entry organization commands, bounded undo/redo,
checkpoints, recovery, and a responsive light/dark application shell. Structure
file import and the molecular viewer begin in Milestone 2 and are intentionally
absent from the current UI.

## Prerequisites

- Python 3.12
- Node.js 22 with Corepack
- A Chromium-compatible Linux, macOS, or Windows development environment

All Python work uses the project-local `.venv`.

## Setup

From the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install uv
.venv/bin/uv sync
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install
MOLWEAVE_DATA_DIR=.molweave .venv/bin/alembic upgrade head
```

## Start Locally

Run the API and web client in separate terminals:

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src MOLWEAVE_DATA_DIR=.molweave \
  .venv/bin/uvicorn molweave_api.main:app --host 127.0.0.1 --port 8000
```

```bash
corepack pnpm --dir apps/web dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Interactive API
documentation is at [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs).

## Architecture

```mermaid
flowchart LR
    UI[React workspace] -->|REST /api/v1| API[FastAPI]
    UI --> PREFS[Local theme and layout preferences]
    API --> PS[Project service and command bus]
    PS --> DB[(SQLite)]
    PS --> ART[Content-addressed artifact store]
    PS --> STATE[ProjectStateV1]
    VIEWER[Mol* adapter, M2] -. consumes normalized state .-> UI
    JOBS[Controlled worker, M9] -. publishes artifacts .-> ART
```

TanStack Query owns API-backed state. Zustand persists only the active project
pointer, theme, and panel preferences. The SQLite project model is authoritative;
future molecular state and Mol* viewer state remain separate.

See [docs/API.md](docs/API.md), [docs/PROJECT_SCHEMA.md](docs/PROJECT_SCHEMA.md),
and [docs/DECISIONS.md](docs/DECISIONS.md) for the current contracts.

## Milestone 1 Checks

Run these from the repository root:

```bash
.venv/bin/ruff check .
.venv/bin/mypy apps/api packages/molweave_core
.venv/bin/pytest tests/unit/test_commands.py tests/integration/test_project_lifecycle.py
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- project-workspace
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/project-lifecycle.spec.ts
corepack pnpm --dir apps/web build
```

Install the pinned Chromium once before the browser check:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright install chromium
```

The Playwright configuration starts an isolated test API and Vite server. Ports
5173 and 8010 must be free while that command runs.
