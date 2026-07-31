# Development And Troubleshooting

Status: MolWeave v0.1

All commands run from the repository root. Python commands must use the
project-local `.venv`; do not install project packages into the system Python.

## Clean Setup

Required versions are Python 3.12, Node.js 22, Corepack, and Git. Create the
environment and install exactly the locked dependency graph:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install uv
.venv/bin/uv sync --frozen
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install --frozen-lockfile
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright install chromium
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
```

`uv sync --frozen` installs the locked PDBFixer Git commit and scientific
packages. Network access is required only for initial dependency/browser
installation. The default managed state is `.molweave/`; it contains SQLite,
artifacts, job work directories, and worker state and is ignored by Git.

## Local Processes

Start these three long-running commands in separate terminals:

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

Open `http://127.0.0.1:5173`. Verify the API independently with:

```bash
curl --fail http://127.0.0.1:8000/api/v1/health
curl --fail http://127.0.0.1:8000/api/v1/jobs/definitions
```

The worker is required only for executing queued jobs. The project, import,
editing, export, and API workflows remain usable when it is stopped; queued
jobs stay queued.

## Validation

The complete release gate is:

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
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
```

Playwright owns `.molweave-e2e/` and starts API port 8010, worker health port
8011, and Vite port 5173. Focus one workflow with, for example:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-journey.spec.ts --project=chromium
```

Use `.venv/bin/uv run pytest tests/scientific` for the chemistry/file-format
suite and `corepack pnpm --dir apps/web test -- jobs` for a focused component
run. Do not add `MOLWEAVE_ENABLE_TEST_ROUTES=1` to normal startup.

## Configuration

`MOLWEAVE_DATA_DIR` changes the managed root. `MOLWEAVE_DATABASE_URL` can
replace the default SQLite URL. Import/archive byte limits, atom warning/hard
limits, worker polling, plugin allowlist/targets, and optional worker health
port are defined in `apps/api/src/molweave_api/settings.py`. API and worker must
use the same data directory and plugin configuration.

## Troubleshooting

### Migration or database errors

Stop API and worker, confirm both use the same `MOLWEAVE_DATA_DIR`, then rerun
`MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head`. For a
disposable development reset only, remove `.molweave/` and migrate again. Do
not remove a state directory containing projects that must be retained.

### API unavailable in the browser

Check `/api/v1/health`, inspect the Uvicorn terminal, and confirm port 8000 is
free. Vite proxies `/api` and `/ws` to `http://127.0.0.1:8000` by default; set
`VITE_API_TARGET` when using another API address.

### Jobs remain queued

Start the worker with the same `PYTHONPATH`, data directory, and plugin
allowlist as the API. `/api/v1/jobs/definitions` confirms API discovery. A
registry mismatch fails the claim explicitly instead of running unknown code.

### WebGL unavailable or blank viewer

Enable browser hardware acceleration and WebGL, update the graphics driver,
and reload. Stored molecular data is independent from Mol*. Headless tests use
Chromium SwiftShader flags from `playwright.config.ts`; a nonblank canvas is
asserted by pixel reads.

### Native scientific package installation fails

Confirm Python is exactly 3.12 and rerun the frozen sync on a supported
platform. The lock expects binary-compatible NumPy, SciPy, RDKit, OpenMM,
Gemmi, and the pinned PDBFixer source. Do not silently substitute dependency
versions; those are scientific changes requiring fixture review.

### Playwright cannot bind ports or find Chromium

Stop existing processes on 5173, 8010, and 8011, install the pinned browser with
the command above, and rerun. If pnpm's default store is unavailable, use the
same explicit `--store-dir` on install and subsequent pnpm commands.

### Import or export is rejected

Read the structured error and warnings in the UI/API. Filename extension,
UTF-8 validity, request/file limits, atom limits, malformed chemistry, and
known export losses are enforced. Lossy export requires explicit
acknowledgement; the immutable original remains downloadable.
