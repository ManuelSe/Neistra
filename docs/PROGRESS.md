# MolWeave Progress

## Current milestone

Milestone 2 - Format-to-viewer scientific slice

Checkpoint 2: atomic import/export and lazy molecular-data APIs verified.

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
- Pinned and installed Gemmi 0.7.5, RDKit 2026.3.4, NumPy 2.4, and
  python-multipart in the project-local `.venv`; pinned Mol* 5.11 in the web
  workspace.
- Added library-independent `NormalizedStructureV1` records for chains,
  residues, atoms, bonds, conformers, source facts, warnings, annotations, and
  inference provenance.
- Added an extensible `StructureAdapter` contract and registry for PDB,
  PDBx/mmCIF, SDF, MOL, MOL2, XYZ, and SMILES.
- Added Gemmi-backed macromolecular import/export with model/conformer,
  alternate-location, insertion-code, occupancy, and explicit unknown PDB bond
  order handling.
- Added RDKit-backed ligand adapters, deterministic SMILES 3D generation,
  explicit XYZ connectivity inference, multi-record SDF behavior, and a
  deterministic MolWeave MOL2 writer.
- Added structured export loss reporting for coordinates, conformers, residue
  and chain semantics, metadata, connectivity, bond orders, formal charges, and
  stereochemistry.
- Added small fixtures for every M2 format plus PDB models/alternate locations,
  PDB ligand connectivity, PDBx/mmCIF categories, Tripos and Corina MOL2
  typing, SDF records, XYZ inference, and stereochemical SMILES.
- Added atomic multipart import for one or more files. Every upload is parsed,
  normalized, checked against per-file, aggregate-byte, atom-warning, and
  atom-hard limits before artifacts or entries are published.
- Added immutable original and normalized-snapshot artifacts, molecular summary
  fields on entries, and migration `0003` for existing databases and checkpoint
  snapshots.
- Added format capability discovery, lazy full-structure/viewer projection
  retrieval, immutable original download, and individual export through every
  adapter.
- Added structured filename/operation/record-aware import errors and explicit
  blocking export-loss acknowledgement.
- Added one undoable multi-entry command per import, including multi-record SDF
  behavior and durable undo/redo restoration.
- Added integration coverage for successful multi-file import, every export,
  lazy retrieval, original-byte retention, multi-record SDF, undo/redo,
  warning/hard limits, cancellation before commit, and important failure states.

## Verification performed

Successful on 2026-07-30:

```bash
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync ruff check .
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync mypy apps/api packages/molweave_core
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync pytest tests/unit/test_commands.py tests/integration/test_project_lifecycle.py tests/unit/test_artifacts.py
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
- The final full M1 gate passed from the committed project-local environment:
  Ruff, mypy (12 source files), Pytest (8 tests), ESLint, TypeScript, Vitest (3
  tests), Playwright (5 passed, 1 intentional viewport skip), and the Vite
  production build.
- The documented normal API and Vite commands started successfully. The health
  endpoint returned `{"status":"ok"}` and a fresh 1440x900 Chromium render
  showed no API warning, clipping, overlap, or blank workspace.
- M2 adapter checkpoint: Ruff passed, mypy passed for 10 core source files, and
  26 adapter/scientific tests passed.
- M2 API checkpoint: Ruff passed; strict mypy passed for 19 API/core/test source
  files; 41 adapter, scientific-fidelity, and import/export integration tests
  passed.
- Import/export integration verification covered malformed and unsupported
  input, stale revision, oversized input, atom hard-limit rejection, blocking
  export losses, and cancellation after parsing but before commit. Each failure
  left project state unchanged.

## Known limitations

- Mol* is pinned but the `MolecularViewer` adapter and simultaneous browser
  display are not implemented yet.
- Upload progress/cancellation and import/export warning presentation are
  implemented at the API boundary but not yet connected to visible controls.
- The API cancellation test verifies the pre-commit service boundary. Browser
  cancellation and disconnected-request behavior remain for the E2E checkpoint.
- The API uses short synchronous SQLite transactions inside async route handlers.
  This is appropriate for local M1 workloads and remains behind the project
  service boundary.

## Blockers

None.

## Next action

Build the typed `MolecularViewer`/Mol* adapter, lazy visible-entry loading, and
real import/export dialogs with progress, cancellation, warnings, and
simultaneous protein/ligand display.
