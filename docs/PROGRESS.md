# MolWeave Progress

## Current milestone

Milestone 3 - Project browser, selection, and sequence

Checkpoint 3 complete: authoritative selection is synchronized bidirectionally
through the project browser, sequence, inspector, and Mol* adapter. End-to-end
browser verification and the final milestone gate remain.

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
- Added a typed application `MolecularViewer` interface and a Mol* 5.11
  implementation that consumes disposable PDBx/mmCIF/SDF projections rather
  than owning molecular state.
- Added lazy Mol* code loading and lazy normalized-structure requests. Hidden
  entries are neither fetched nor retained in the viewer scene; visibility
  changes rebuild the scene from visible authoritative entries.
- Added simultaneous protein/ligand display, visible loading and loaded counts,
  warning counts, retryable projection failures, resize handling, camera reset,
  and an explicit WebGL-unavailable error.
- Added functioning top-bar and empty-workspace import actions with multi-file
  selection, file summaries, deterministic SMILES/XYZ options, byte progress,
  processing state, explicit cancellation, and structured errors.
- Added an explicit import-operation cancellation API. Molecular parsing runs
  in a cancellable child process so native Gemmi/RDKit work cannot block the
  API event loop or race a cancellation into project commit.
- Added functioning top-bar and per-entry export actions, server-discovered
  format options, blocking loss-warning acknowledgement, generated artifact
  download, and per-entry immutable original download.
- Added compact per-entry source-format, atom-count, and warning summaries in
  the project browser.
- Split Mol* into an on-demand production chunk, reducing the initial
  application JavaScript chunk from about 3.8 MB to about 395 KB.
- Added component coverage for lazy visible-only structure loading, simultaneous
  viewer synchronization, retry, and adapter lifecycle isolation.
- Added Playwright coverage for multi-file import, real WebGL display, reload,
  loss acknowledgement, generated and original downloads, visibility
  unload/reload, malformed input, and cancellation without project mutation.
- Documented the M2 HTTP API, `NormalizedStructureV1`, project artifact
  references, supported-format fidelity matrix, scientific limitations, local
  startup architecture, and exact verification commands.
- Updated Alembic startup so a fresh configured data directory is created before
  SQLite migration access.
- Added canonical `SelectionV1` state as an ordered set of stable
  `(structure_id, atom_id)` references with semantic granularity and operation
  source metadata.
- Added pure deterministic replace, add, subtract, clear, invert, residue/chain/
  structure expansion, molecular predicate, atom-distance, residue-distance,
  and reference-reconciliation operations.
- Added durable named-selection persistence, migration `0004`, project response
  summaries, optimistic-revision APIs, and reversible create/delete commands.
- Integrated saved-reference reconciliation with the existing entry-delete
  command. Invalid references are removed atomically with a structured visible
  warning; undo restores both the entry and the original saved selection.
- Added backend coverage for algebra, every predicate, expansions, spatial
  behavior, restart persistence, undo/redo, duplicate and invalid requests,
  atomic failure, deletion reconciliation, and warning restoration.
- Added a non-persisted central Zustand selection store that resets at the
  project boundary and retains only canonical `SelectionV1` session state.
- Added TypeScript selection algebra for replace/add/subtract/clear, invert,
  residue/chain/structure expansion, all required molecular predicates, and
  selection summaries using normalized molecular records.
- Completed the project browser with search, structure-type filter, name/type/
  atom-count/modified sorting, collapsible and selectable groups, selected-row
  state, and modifier-driven entry multi-selection.
- Reworked the inspector into functional Selection, Sequence, and Project tabs.
  Selection includes a visible atom/residue/chain/structure summary, operation
  modes, clear/invert/expand controls, all required predicate queries,
  atom/residue distance operations, and durable named-selection save/load/delete
  controls with warning display.
- Added a normalized-residue protein sequence view with chain and residue
  selection. Selected residues are derived from the common atom-reference set,
  so sequence-to-inspector and inspector-to-sequence state stays bidirectional.
- Added a module Web Worker for distance calculations. The production build
  emits it as an independent worker chunk; the main thread only sends a
  normalized coordinate/reference projection and receives stable atom
  references.
- Added client coverage for the complete algebra and predicate matrix, spatial
  atom/residue behavior, project search/filter/sort/group interaction,
  replace/add/subtract entry selection, and sequence-to-summary synchronization.
- Extended the viewer abstraction with application selection input, explicit
  atom/residue/chain/structure picking granularity, and viewer-originated
  selection events.
- Added stable normalized atom-ID mapping in both directions across disposable
  Mol* mmCIF/SDF projections. Programmatic highlighting and user click events
  use separate Mol* channels to prevent synchronization feedback loops.
- Added a functional viewer-pick granularity control and visible viewer
  selection count. The lazy adapter preserves current selection and pick mode
  while the Mol* chunk initializes.
- Added component and adapter tests for programmatic viewer reflection,
  viewer-originated callbacks, selection modes, lazy initialization, and
  non-emission from programmatic updates.

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
- M2 visible-slice checkpoint: ESLint and TypeScript passed; all 6 component
  tests passed; the production build passed with Mol* isolated in a lazy chunk.
- The expanded import/export integration suite passed 16 tests, including the
  explicit cancellation endpoint and child-process preparation boundary.
- Desktop Chromium passed both M2 E2E workflows. The success workflow rendered
  a real nonblank Mol* canvas, displayed protein and ligand simultaneously,
  reloaded both structures, downloaded acknowledged XYZ output, byte-compared
  the immutable original MOL download, and exercised hide/show unload. The
  failure workflow covered cancelled and malformed imports with unchanged
  project revision.
- Final Python gate: Ruff passed; strict mypy passed for 22 source files; all 50
  unit, integration, and scientific tests passed.
- Final web gate: ESLint and TypeScript passed; all 6 component tests passed;
  the production build passed with a 395.60 KiB initial application chunk and
  lazy Mol* chunk.
- Exact M2 Playwright gate: 3 passed across desktop and Pixel 7, with one
  intentional mobile duplicate of the desktop-only failure/cancellation matrix
  skipped.
- M1 browser regression: 5 passed across desktop and Pixel 7, with one
  intentional mobile duplicate of the desktop-only entry-command matrix
  skipped.
- A fresh temporary database migrated `0001 -> 0002 -> 0003`, reported `0003
  (head)`, downgraded to `0002`, and upgraded to `0003` again.
- The documented normal API and Vite commands started successfully. `/health`
  returned `{"status":"ok"}`, `/formats` returned all seven adapters, and
  fresh desktop and Pixel 7 Chromium captures showed a nonblank responsive
  shell without clipping or incoherent overlap.
- M3 backend checkpoint: targeted Ruff passed; strict mypy passed for 24 source
  files; all 14 selection and saved-selection tests passed.
- M3 backend regression: repository-wide Ruff passed; strict mypy passed for 24
  source files; the complete 64-test Python suite passed.
- A fresh temporary database migrated `0001 -> 0002 -> 0003 -> 0004`, reported
  `0004 (head)`, downgraded to `0003`, and upgraded to `0004` again.
- M3 client checkpoint: ESLint and TypeScript passed; all 12 component/domain
  tests passed under the exact `selection project-browser sequence` gate.
- The production build passed and emitted `spatial.worker` as an independent
  0.75 KiB chunk; the initial application chunk remained 411.62 KiB and Mol*
  remained lazy.
- M3 viewer checkpoint: ESLint and TypeScript passed; 13 focused selection,
  browser, sequence, viewer-loading, and adapter tests passed; the production
  build passed with a 413.47 KiB initial application chunk and lazy Mol* chunk.

## Known limitations

- Mol* is necessarily a large on-demand dependency (about 963 KiB compressed).
  It is excluded from the initial application chunk and loaded only when a
  project contains structures.
- Mol* still uses its M2 default representations. Representation controls,
  labels, measurements, and molecular editing remain scoped to later
  milestones.
- Import preparation uses one short-lived child process per batch. This favors
  cancellation and native-library isolation over minimum process overhead.
- The API uses short synchronous SQLite transactions inside async route handlers.
  This is appropriate for local M1 workloads and remains behind the project
  service boundary.

## Blockers

None.

## Next action

Add the M3 synchronized-selection Playwright workflow, exercise successful and
important failure paths in a real browser, repair issues found, then run the
complete milestone and regression gates plus documented startup checks.
