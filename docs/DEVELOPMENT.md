# Development And Troubleshooting

Status: Neistra development guide; existing configuration contracts retained.

The private JavaScript packages are `neistra` and `@neistra/web`. Workspace
commands below are unchanged. Python modules, environment variables and data
paths intentionally retain their compatibility names; see [BRANDING](BRANDING.md).
If a custom external script uses a package-name filter, update it to
the web name, for example `corepack pnpm --filter @neistra/web build`.
Run root scripts from the repository root without a package filter.

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

The normal development startup applies pending database migrations, starts the
API, standalone job worker, and Vite client, waits for the API and web client to
be ready, and supervises their shutdown:

```bash
corepack pnpm dev
```

Open `http://127.0.0.1:5173`. Press Ctrl+C in the startup terminal to stop all
three services. Vite reloads frontend changes; the API deliberately retains the
tested non-reloading startup behavior and must be restarted after Python
changes.

For process-level troubleshooting, run the migration and three long-running
commands manually in separate terminals:

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

Verify the API independently with:

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
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
```

Playwright owns `.molweave-e2e/` and starts API port 8010, worker health port
8011, and Vite port 5173. Focus one workflow with, for example:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-journey.spec.ts --project=chromium
```

When those resources are already occupied by an intentionally running local
stack, focused evidence can use isolated values without changing repository or
CI defaults:

```bash
MOLWEAVE_E2E_API_PORT=8110 \
MOLWEAVE_E2E_WORKER_PORT=8111 \
MOLWEAVE_E2E_WEB_PORT=5273 \
MOLWEAVE_E2E_DATA_DIR=.molweave-e2e-isolated \
PLAYWRIGHT_BROWSERS_PATH=.playwright \
  corepack pnpm exec playwright test tests/e2e/polar-hydrogen-visibility.spec.ts
```

The data directory must be disposable and dedicated to that run. Record any
override with the evidence so it is not mistaken for the documented default
release environment. The configuration rejects invalid ports and data paths
containing spaces, shell metacharacters, parent traversal, or the filesystem
root before constructing any service command.

Use `.venv/bin/uv run pytest tests/scientific` for the chemistry/file-format
suite and `corepack pnpm --dir apps/web test -- jobs` for a focused component
run. Do not add `MOLWEAVE_ENABLE_TEST_ROUTES=1` to normal startup.

## Configuration

`MOLWEAVE_DATA_DIR` changes the managed root. `MOLWEAVE_DATABASE_URL` can
replace the default SQLite URL. `MOLWEAVE_API_PORT` and `MOLWEAVE_WEB_PORT`
change the single-command supervisor ports from their defaults of 8000 and
5173; the Vite proxy follows the selected API port unless `VITE_API_TARGET` is
set explicitly. Import/archive byte limits, atom warning/hard limits, worker
polling, plugin allowlist/targets, and optional worker health port are defined
in `apps/api/src/molweave_api/settings.py`. API and worker must use the same data
directory and plugin configuration.

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

### Single-command startup exits

Read the final prefixed service error. The supervisor exits if migration fails,
if a configured port is already occupied, or if any child process stops. Run
the manual commands above when a service needs to be diagnosed independently.
Missing-environment and missing-dependency errors include the exact one-time
setup command to run.

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

### Selection appearance migration (0.6.0)

Back up the managed data directory, stop API and worker, then run the normal
`alembic upgrade head` command before starting 0.6.0. Migration 0010 adds empty
appearance collections to live, checkpoint, scene and retained command settings.
It does not rewrite normalized molecular artifacts or uploaded originals.
Supported older projects and archives remain readable; an older application is
not guaranteed to read new appearance data.

Downgrade to 0009 is allowed only when every retained appearance collection is
empty. Undo history or a named/checkpoint scene may retain non-default data after
resetting current display. The migration refuses such a downgrade before writing
changes. Use a pre-upgrade backup to roll back without discarding retained state;
do not manually delete history to bypass the guard.


## Compact selection styling (0.6.1)

This release changes presentation and transient palette state only. Upgrading from
0.6.0 requires no new migration; Alembic head remains 0010. Keep the documented
upgrade command for earlier databases. Application/API/archive version metadata
advances together to 0.6.1; schema major 1 and appearance wire formats are unchanged.
The issue #34 plan records focused and complete release gates and compatibility
checks, including archive application versions 0.5.0 and 0.6.0.

## Selection surface migration (0.7.0)

Back up the managed data directory before upgrading. Migration 0011 adds a null
surface-membership default throughout live entries, checkpoints, scenes and
retained command actions. Run `.venv/bin/uv run alembic upgrade head` against the
intended application data directory. Existing originals and normalized artifacts
are unchanged; older projects/archives remain readable by the new application.

Downgrade to 0010 is allowed only when **every retained surface value is null**.
A removed surface can remain in undo history, checkpoints or scenes, so removal
alone is not a safe downgrade procedure. Refusal leaves stored state unchanged.
After using the feature, restoring the pre-upgrade backup is the reliable rollback;
do not edit SQLite JSON or silently discard history. Older applications are not
guaranteed to preserve newly exported surface settings. Frontend geometry is not
persisted and is rebuilt from stable memberships and current molecular artifacts.


## Atomic-detail visibility migration (0.8.0)

Migration 0012 adds `selection_hidden_atoms: []` to all retained viewer-settings
paths, including nested checkpoint scenes and forward/inverse commands. Upgrade
with the existing `alembic upgrade head` command against the intended data directory,
after retaining a pre-upgrade backup. Original uploads and normalized artifacts
are unchanged; schema majors remain 1.

Downgrade to 0011 is allowed only when **every retained hidden mask is empty**.
Showing all currently hidden atoms is insufficient if history/scenes/checkpoints
can restore a nonempty mask. Refusal prevalidates all locations before writing.
Restore the pre-upgrade backup when needed; do not strip history or edit database
JSON to evade the check. New readers accept older archives with absent masks;
older readers are unsupported for new visibility-bearing archives. Migration tests
cover upgrade, safe downgrade/re-upgrade, every refusal path and metadata invariance.

Migration 0013 adds nullable saved pocket definitions throughout live and retained
viewer state. Upgrade existing databases with `uv run alembic upgrade head` after
backing up the database and artifact directory. A lossless downgrade to 0012 requires
**every** live/checkpoint/scene/forward/inverse pocket field to be null. The migration
checks all locations before modifying any and refuses otherwise. Removing the
visible pocket is insufficient while history retains it; restore a pre-upgrade
backup rather than stripping references. Prior archives load with null pockets;
new pocket-bearing archives require a compatible reader. See PROJECT_SCHEMA and
D-069 for the unchanged current-snapshot archive boundary.
