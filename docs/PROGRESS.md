# MolWeave Progress

## Current milestone

Milestone 1 - Durable project workspace

Checkpoint 3: complete M1 lifecycle, failure handling, and documentation
verified; final clean gate remains.

## Completed work

- Created the project-local `.venv` and installed `uv` inside it. All Python
  commands use `.venv/bin/...`.
- Added the root Python project, locked dependencies, Ruff, mypy, and Pytest
  configuration.
- Added FastAPI project APIs, typed request/response schemas, SQLite SQLAlchemy
  models, and the initial Alembic migration.
- Added durable project creation, details updates, explicit checkpoints,
  uncheckpointed-change recovery, optimistic project revisions, bounded command
  history, undo, and redo.
- Added seeded-fixture command support for rename, duplicate, group, hide/show,
  isolate, lock/unlock, and delete/restore entry operations.
- Added the immutable content-addressed local artifact-store interface with
  atomic publication and managed-root path validation.
- Added structured API errors for stale revisions, missing resources, invalid
  operations, and unavailable history.
- Added the React/Vite/TypeScript workspace using TanStack Query for server
  state and Zustand for persisted local preferences.
- Added the real project workflow: create, switch/reopen, edit details, save a
  checkpoint, recover dirty state, undo, and redo.
- Added real structure-entry commands for seeded M1 fixtures: rename,
  duplicate, group, hide/show, isolate, lock/unlock, and delete/restore.
- Added a responsive desktop shell with resizable/collapsible structure,
  inspector, history, and central workspace regions. On narrow screens the
  auxiliary regions become accessible drawers.
- Added persisted light/dark theme and panel-layout preferences, structured
  request failure feedback, retry, and conflict/recovery notices.
- Added component tests for project creation/checkpoint state, persisted theme,
  and an unavailable-API failure with retry.
- Added Playwright lifecycle coverage for desktop and Pixel 7 viewports,
  including create, interrupted-session recovery, undo/redo, save/reopen, theme
  persistence, desktop collapse persistence, mobile drawers, and API
  failure/retry.
- Added a desktop browser workflow for all M1 entry commands using isolated,
  test-only seeded fixtures.
- Fixed a project-create/list cache race that could clear the newly active
  project and a retry path that could refetch a disabled project query into the
  wrong cache.
- Versioned checkpoint snapshots as `ProjectStateV1`, exposed
  `schema_version: 1`, and added an Alembic data migration for existing
  snapshots.
- Documented local `.venv` setup, startup, architecture, M1 API, project schema,
  and exact verification commands.

## Verification performed

Successful on 2026-07-30:

```bash
.venv/bin/ruff check .
.venv/bin/mypy apps/api packages/molweave_core
.venv/bin/pytest -q tests/unit/test_commands.py tests/unit/test_artifacts.py tests/integration/test_project_lifecycle.py
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- project-workspace
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/project-lifecycle.spec.ts
MOLWEAVE_DATA_DIR=.molweave .venv/bin/alembic upgrade head
```

Results:

- Ruff: passed.
- mypy: passed for 11 source files.
- Pytest: 8 passed.
- ESLint: passed.
- TypeScript: passed.
- Vitest: 3 passed.
- Vite production build: passed (1,802 modules transformed).
- API restart integration test confirmed uncheckpointed changes survive process
  recreation and become clean after Save.
- Artifact tests confirmed deterministic content addressing and rejection of
  absolute/traversal paths.
- Chromium captures at 1440x900 and Pixel 7 dimensions confirmed a nonblank
  workspace, readable controls, responsive drawers, and no visible overlap.
- Playwright: 5 passed on desktop/mobile and 1 intentional skip (the complete
  entry-command matrix runs on desktop; mobile lifecycle and failure handling
  run separately).
- Alembic upgraded the existing local database from revision `0001` to `0002`.

## Known limitations

- Entry operations are exercised through seeded normalized fixtures, as allowed
  by M1; production file import belongs to M2.
- The API uses short synchronous SQLite transactions inside async route handlers.
  This is appropriate for local M1 workloads and remains behind the project
  service boundary.

## Blockers

None.

## Next action

Run every M1 verification command from a clean working state, verify documented
normal startup and browser rendering once more, then mark M1 complete.
