# Neistra

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/neistra-brand-dark.svg">
  <img src="docs/assets/neistra-brand-light.svg" alt="" width="450">
</picture>

Shape molecular structure.

Neistra, formerly MolWeave, is a local, single-user molecular project workspace for importing,
viewing, selecting, measuring, editing, converting, and organizing protein and
small-molecule structures. It includes durable projects, undo/redo, portable
archives, and an allowlisted background-job plugin system. Docking, PDBQT, and
complete protein preparation are deliberately not included.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/neistra-workspace-dark.png">
  <img src="docs/assets/neistra-workspace-light.png" alt="Neistra molecular workspace with a streptavidin structure, component browser and inspector" width="960">
</picture>

Real workspace screenshots: [light](docs/assets/neistra-workspace-light.png) ·
[dark](docs/assets/neistra-workspace-dark.png). These show the existing local
workspace, not proposed account, docking or marketplace features.

Version **0.9.0** adds saved **protein pocket views** behind
**Surface options → Pocket…**. Capture ligand or site atoms, choose a protein
receptor and apply a radius. The view crops a complete protein molecular surface;
it does not discover cavities or infer binding. Hidden seed entries remain valid.
One pocket is saved per receptor; scenes retain alternatives.

Reversible **Hide / Show** remains in the existing Atom detail row. Hide selected
atoms while retaining polymer and surface geometry; Show restores prior styles.
Saved styling survives undo/redo, scenes, reload and project archives.

Whole-protein fragment surfaces now support up to 100,000 effective atoms within
explicit grid, memory and time bounds: 512 MiB mesh allocation, 1 GiB retained
output, 2 GiB accounted working buffers and a 120-second calculation deadline.
Real 23,694- and 58,870-atom proteins and a synthetic 100,000-atom target are
qualified on desktop and Pixel 7 emulation; this is not an arbitrary-device guarantee.

Select atoms or an entry and open **Style selection**. The compact palette stays
open while you pick another selection or move the camera. Apply an illustrated
representation or color swatch immediately, choose **All atoms** or **Carbon only**,
or use **Surface → Add / Remove**. Representation, surface, color and hydrogen
changes remain independently reversible. Scientific help stays on demand.

Fragment surfaces enclose the selected atoms alone. Cut boundaries can create artificial
faces; they are not context-aware patches. The fixed profile uses a 1.4 Å probe,
0.5 Å grid and translucent element/selection colors. Visibility and hydrogen
preferences filter the fragment. Existing entry surfaces can remain enabled.
See the [styling workflow](docs/SELECTION_STYLING.md) and
[scientific limitations](docs/SCIENTIFIC_LIMITATIONS.md).

Back up managed data and upgrade to migration **0013** before startup. Older
projects/archives remain readable by v0.9.0. Downgrade to 0012 requires every retained
pocket definition, including history and scenes, to be null; otherwise restore the
pre-upgrade backup. Older readers are unsupported for pocket-bearing archives.
Atomic hiding does not change entry-based Visible export.
`.molweave.zip`, Python module names, `MOLWEAVE_*` settings and data paths remain
compatible. See [release notes](docs/RELEASE_NOTES.md) and
[migration guidance](docs/DEVELOPMENT.md#pocket-definition-migration-090).
The [pocket feature plan](docs/plans/issue-36-pocket-surfaces.md) records scope,
scientific boundaries and qualification evidence.

## Prerequisites

- Python 3.12
- Node.js 22 with Corepack
- Git, a C/C++ runtime suitable for the locked scientific wheels, and a
  Chromium-compatible Linux, macOS, or Windows development environment

All Python work uses the project-local `.venv`.

## Setup

From the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install uv
.venv/bin/uv sync --frozen
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave .venv/bin/alembic upgrade head
```

## Start Locally

After completing setup, migrate and start the API, job worker, and web client
with one command:

```bash
corepack pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Interactive API
documentation is at [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs).
The command prefixes service logs and stops all three processes together when
you press Ctrl+C.

For troubleshooting, the equivalent processes can still be run in separate
terminals after applying migrations manually:

```bash
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
```

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  MOLWEAVE_DATA_DIR=.molweave \
  .venv/bin/uvicorn molweave_api.main:app --host 127.0.0.1 --port 8000
```

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  MOLWEAVE_DATA_DIR=.molweave .venv/bin/python -m molweave_api.worker
```

```bash
corepack pnpm --dir apps/web dev
```

## Architecture

```mermaid
flowchart LR
    UI[React workspace] -->|REST and job WebSocket| API[FastAPI]
    UI --> PREFS[Local theme and layout preferences]
    API --> PARSE[Cancellable Gemmi / RDKit child process]
    API --> EXPORT[Cancellable export / archive child process]
    API --> PS[Project service and command bus]
    API --> COORD[Transform and Kabsch service]
    API --> EDIT[RDKit ligand editor and validator]
    API --> PEDIT[PDBFixer / OpenMM protein editor]
    COORD --> PS
    EDIT --> PS
    PEDIT --> PS
    PS --> DB[(SQLite)]
    PS --> ART[Content-addressed artifact store]
    PS --> STATE[ProjectStateV1]
    UI -->|visible-entry projections| VIEWER[Lazy Mol* adapter]
    UI --> SELECT[Transient canonical selection store]
    SELECT <--> VIEWER
    SELECT --> WORKER[Spatial-query Web Worker]
    UI -->|coordinate spans / affected-entry replacement| VIEWER
    API --> CONTACTS[SciPy contact index]
    API -->|enqueue only| DB
    JOBS[Separate job worker] -->|atomic claim| DB
    JOBS --> CHILD[Spawned allowlisted plugin]
    CHILD -->|progress, logs, results| JOBS
    JOBS -->|validated publication| ART
```

TanStack Query owns API-backed state. Zustand persists only the active project
pointer, theme, and panel preferences; a separate non-persisted Zustand store
owns the current canonical selection. SQLite metadata, viewer settings, named
selections, measurements, scenes, and immutable normalized artifacts are
authoritative. Mol* renders generated projections and is never a project save
format or molecular state store.

See [architecture](docs/ARCHITECTURE.md), [development and troubleshooting](docs/DEVELOPMENT.md),
[HTTP API](docs/API.md), [project/archive schema](docs/PROJECT_SCHEMA.md),
[normalized molecular schema](docs/NORMALIZED_SCHEMA.md), [format matrix](docs/FORMAT_MATRIX.md),
[plugin guide](docs/PLUGIN_GUIDE.md), [scientific limitations](docs/SCIENTIFIC_LIMITATIONS.md),
[fixture provenance](docs/FIXTURES.md), [accessibility](docs/ACCESSIBILITY.md),
[performance](docs/PERFORMANCE.md), [release evidence](docs/VERIFICATION.md), and
[architectural decisions](docs/DECISIONS.md) for the current contracts and their history.

## Release Checks

Run these from the repository root:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
```

Install the pinned Chromium once before the browser check:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright install chromium
```

The Playwright configuration migrates an isolated test database, then starts
the test API, separate worker, and Vite server. Ports 5173, 8010, and 8011 must
be free. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for focused commands,
environment variables, clean-state procedures, and troubleshooting.
