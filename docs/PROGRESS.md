# MolWeave Progress

## Current milestone

Milestone 8 - Complete export and portable archives

Complete. All acceptance criteria in `docs/PLAN.md` are implemented and
verified through policy, API integration, archive security, component,
production-build, and real desktop/mobile browser checks.

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
- Added a real Chromium synchronized-selection workflow covering project
  replace/add/subtract, sequence residue selection, cross-structure element
  query, Web Worker distance selection, an actual Mol* structure pick, stable
  loop-free state, named-selection save/load across reload, duplicate-name
  rejection, search empty state, entry deletion, transient-reference pruning,
  and a visible durable saved-selection warning.
- Added backend reference geometry for distance, angle, and signed dihedral
  measurements, including finite-coordinate and degenerate-geometry validation.
- Added deterministic close-contact detection using SciPy `cKDTree`, active
  conformer coordinates, configurable distance bounds, and bonded-pair
  exclusion.
- Added SciPy 1.18 to the locked project-local environment.
- Added typed, validated viewer settings for all required representations,
  coloring, opacity, component visibility, and label visibility. Settings are
  stored per entry and changed through the revisioned command bus.
- Added durable named distance, angle, and dihedral measurements with
  rename/show/hide/delete commands and stable atom references.
- Added named scenes that capture application camera, entry visibility,
  representation settings, and selection. Scene application is one undoable
  project command.
- Reconciled entry deletion across measurements and scenes: dependent
  measurements are removed, scene entry/selection references are pruned, and
  undo restores the complete prior state.
- Added the close-contact API and migration `0005` for viewer settings,
  measurements, scenes, and additive checkpoint-state fields.
- Replaced Mol* default presets with application-driven, coexisting cartoon,
  backbone, line, stick, ball-and-stick, space-filling, and molecular-surface
  representations using typed entry settings.
- Added element, chain, residue, secondary-structure, structure, and uniform
  custom coloring; opacity; hydrogen, solvent, ion, ligand, and protein
  component visibility; and atom, residue, chain, and structure labels.
- Added an explicit viewer control surface for perspective/orthographic
  projection, zoom, focus selection, center/reset, selection isolation, and
  named-scene save/apply/delete. Orbit and pan remain direct canvas navigation.
- Added application-owned camera subscriptions and scene values at the viewer
  adapter boundary. Structure rebuilds preserve the current camera and never
  persist Mol* snapshots.
- Added viewer-rendered distance, angle, and dihedral loci/labels that are
  recalculated from current normalized coordinates.
- Added measurement create/rename/show/hide/delete UI, close-contact search,
  atom/residue/chain inspection, and a lower atom-property table synchronized
  with central selection.
- Added the recommended-size fallback: structures at or above 250,000 atoms
  retain usable reduced-detail rendering while surface and dense labels are
  suppressed with a visible notice.
- Added exact atom-index and `structure_id:atom_id` predicate selection as a
  small M4 inspection prerequisite. This enables deterministic multi-atom
  measurement construction when source atom names are not unique.
- Added M4 Playwright workflows for the complete viewer control matrix, named
  scene divergence/restore, WebGL failure, distance/angle/dihedral management,
  property inspection, close-contact success/failure, and reload persistence.
- Audited the M5 coordinate-editing path end to end. The existing immutable
  normalized artifacts and command actions can provide exact undo/redo, while
  Mol* `ModelWithCoordinates` provides an affected-entry-only coordinate update
  boundary without making the viewer authoritative.
- Defined whole-structure and selected-atom transform semantics across every
  conformer, active-conformer patch semantics, deterministic Euler composition,
  configurable pivots, and strict protein correspondence rules for explicit
  selection and backbone superposition.
- Added float64 rigid-transform reference logic with stable-atom validation,
  X-then-Y-then-Z Euler composition, selected/entry centroid helpers, explicit
  pivots, every-conformer updates, and active-atom coordinate reconciliation.
- Added proper-rotation Kabsch fitting and protein superposition by explicit
  identity-matched selections or deterministic backbone identities. Results
  contain the fitted structure, rotation/translation, matched atom count, RMSD,
  and inspectable correspondence identities.
- Added focused scientific tests for selected and whole-entry transforms,
  multi-conformer behavior, composition and pivots, exact fits, and rejection
  of identity, finite-input, no-op, missing, duplicate, non-protein, unequal,
  collinear, and reflection failures.
- Added the typed RDKit-backed `MolecularEditor` and `StructureValidator` domain
  boundary with atom/bond CRUD, element and formal-charge changes, explicit
  hydrogen inference/removal, exact-side rotatable-bond rotation, MMFF/UFF
  whole or local cleanup, sanitization, clash warnings, and stable-ID
  stereochemistry comparison.
- Relaxed normalized atom and bond identities from contiguous to strictly
  increasing unique IDs while retaining coordinate-array list-order semantics.
  RDKit projections now carry stable identity properties and round-trip atom
  chiral tags.
- Added focused M6 domain and scientific tests covering successful operations,
  invalid valence, missing force-field parameters, unchanged heavy-atom IDs,
  gapped IDs, hydrogen provenance, stereo preservation/change, cleanup reports,
  ring/terminal/wrong-side rotation rejection, and questionable geometry.
- Added exact per-entry atom-ID summaries and monotonic atom/bond allocators,
  Alembic migration `0006`, typed discriminated ligand-edit requests/reports,
  immutable molecular command actions, and affected-entry topology patches.
- Added atomic atom-deletion reconciliation for saved selections,
  measurements, and named-scene selections. Undo restores the prior artifact
  and every dependent object while allocation counters remain monotonic.
- Added durable API coverage for topology edits, branch-after-undo identity,
  restart persistence, original-upload preservation, reference reconciliation,
  exact undo restoration, valence non-mutation, cleanup reporting, and locked
  edits.
- Added a complete Ligand inspector workspace for atom/bond CRUD, element and
  charge changes, explicit hydrogens, selected-atom movement, exact-side bond
  rotation, and whole/selected MMFF/UFF cleanup with structured result and
  warning display.
- Reconciled transient selection against exact current atom IDs and added a
  topology-query path that waits for the new artifact, then replaces only the
  affected Mol* entry while preserving unrelated models, camera, application
  selection, labels, and measurements.
- Added client coverage for all ligand control payloads, locked controls, and
  affected-entry topology replacement without a full scene synchronization.

## Verification performed

Successful through 2026-07-31:

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
- M3 desktop browser checkpoint: the synchronized-selection Playwright workflow
  passed in Chromium in 16.8 seconds. The test exercised a real WebGL Mol*
  canvas and confirmed programmatic highlighting remained stable after a
  viewer-originated pick.
- Exact M3 Python gate: 14 selection and saved-selection tests passed.
- Exact M3 client gate: 13 selection, project-browser, sequence, viewer-loading,
  adapter, and matched workspace tests passed.
- Exact M3 Playwright gate: 1 desktop Chromium workflow passed in 15.8 seconds;
  the intentional mobile duplicate was skipped because the test targets the
  full three-panel desktop workspace.
- Final repository gate: Ruff passed; strict mypy passed for 24 source files;
  all 64 Python tests passed; ESLint and TypeScript passed; all 13 Vitest tests
  passed; and the production build completed with 3,337 transformed modules.
- The final build emitted spatial selection as an independent 0.75 KiB Web
  Worker chunk, kept the initial application at 413.51 KiB, and kept Mol* in a
  lazy chunk.
- The normal database upgraded from `0003` to `0004`. The documented API and
  Vite commands started successfully on ports 8000 and 5173; `/health` returned
  `{"status":"ok"}` and `/formats` returned all seven adapters.
- Fresh normal-startup Chromium captures at 1440x900 and Pixel 7 dimensions
  showed a nonblank responsive shell with readable controls and no clipping or
  incoherent overlap.
- M4 scientific checkpoint: all 8 focused measurement/contact tests passed;
  targeted Ruff and strict mypy checks passed.
- M4 persistence checkpoint: repository-wide Ruff passed; strict mypy passed
  for 28 source files; all 75 Python tests passed, including viewer-state,
  scene restore/undo, invalid-reference atomicity, deletion reconciliation, and
  contact API coverage.
- A fresh temporary database migrated `0001 -> 0002 -> 0003 -> 0004 -> 0005`,
  reported `0005 (head)`, downgraded to `0004`, and upgraded to `0005` again.
- M4 client checkpoint: ESLint and TypeScript passed; all 17 component/domain
  tests passed, including exact backend-matching geometry and the complete
  representation/color option matrix.
- The production build passed with 3,342 transformed modules, a 435.69 KiB
  initial application chunk, and Mol* retained in a lazy chunk.
- Existing Chromium import/display/export regression: both workflows passed.
  A real WebGL canvas rendered protein and ligand with application-owned
  default representations after reload; malformed and cancelled imports
  remained non-mutating.
- M4 viewer browser checkpoint: 2 Chromium workflows passed. One configured all
  seven representation builders and all six color schemes concurrently,
  checked nonblank canvas pixels, exercised projection/zoom/focus/reset and
  selection isolation, then saved/restored/deleted a scene after external
  visibility divergence. The other disabled WebGL and verified a usable error
  with project status retained.
- M4 measurement browser checkpoint: the Chromium workflow passed with exact
  2/3/4-atom construction, backend-matching distance display, angle/dihedral
  labels, rename/show/hide/delete, reload persistence, lower property rows,
  atom/residue/chain inspection, invalid contact feedback, and successful
  contact selection.
- Focused fallback regression: 19 client tests passed, including explicit
  reduced-detail projection at 250,000 atoms and viewer startup failure. The
  focused Python selection/measurement/contact suite passed all 21 tests.
- M1/M3 browser-regression repair: empty projects still open Project details,
  but the first successful import now returns the inspector to Selection unless
  the user explicitly chose a tab. The component regression test, ESLint, and
  the complete real-WebGL synchronized-selection workflow passed.
- Exact M4 gate: 8 measurement/contact reference tests and all 20 client tests
  passed; the production build transformed 3,342 modules with a 436.09 KiB
  initial application chunk and lazy Mol* chunk; all 3 desktop measurement,
  viewer-control, scene, and WebGL-failure workflows passed with 3 intentional
  mobile duplicates skipped.
- Final repository regression: Ruff passed; strict mypy passed for 28 source
  files; all 77 Python tests passed; ESLint and TypeScript passed; all 20 Vitest
  tests passed; and the full Playwright matrix passed 12 workflows with 6
  intentional desktop-only mobile skips.
- The normal database migrated from `0004` to `0005 (head)`. The documented API
  and Vite commands started the current code on ports 8000 and 5173; `/health`
  returned `{"status":"ok"}` and `/formats` returned all seven adapters.
- Fresh normal-startup Chromium captures at 1440x900 and Pixel 7 dimensions
  showed a nonblank responsive shell with readable controls and no clipping or
  incoherent overlap. M4's real molecular view was separately verified by
  nonblank canvas-pixel assertions in the complete representation workflow.
- M5 audit checkpoint: the worktree began clean at `664bf56`; the complete
  product, plan, progress, and decision documents were reread; coordinate,
  artifact, history, API, selection, and viewer source contracts were inspected.
- M5 scientific checkpoint: all 15 transform/superposition tests passed; focused
  Ruff passed; strict mypy passed for both new core modules.
- M5 persistence checkpoint: transform and superposition mutations now publish
  immutable normalized artifacts, return active-coordinate patches, preserve
  original uploads, update every conformer, enforce locks and revisions, and
  participate in exact artifact-based undo/redo.
- M5 backend verification: repository-wide Ruff passed; strict mypy passed for
  25 source files; all 96 Python tests passed. The focused M5 set covered
  numeric whole-entry translation, selected custom-pivot rotation, no-op and
  locked failure states, successful backbone Kabsch fitting with RMSD, rejected
  unequal correspondence, exact undo/redo restoration, redo invalidation, and
  original-file preservation.
- M5 client checkpoint: the inspector now provides whole-entry or selected-atom
  translation and rotation, structure/scope/custom pivots, numeric entry, an
  axis slider with local preview and one-command pointer completion, and
  backbone or selected protein superposition with matched-atom/RMSD reporting.
- Coordinate responses seed the new artifact-keyed TanStack Query projection
  before project state changes. Mol* models are built through
  `ModelWithCoordinates`; previews, commits, undo, and redo update only the
  affected model while topology synchronization, other entries, and camera
  state remain unchanged.
- M5 client verification: ESLint and TypeScript passed; all 26 component/domain
  tests passed under the exact `transforms history` gate; the production build
  passed with 3,344 transformed modules, a 447.95 KiB initial application
  chunk, and Mol* retained in a lazy chunk.
- M5 browser checkpoint: the desktop Chromium coordinate workflow passed
  against the real API and WebGL viewer in 11.2 seconds. It verified camera
  navigation does not change coordinates, combined numeric transform, nonblank
  incremental rendering, exact undo/redo, one-revision selected-atom gesture
  and reversal, zero-RMSD backbone superposition, unequal correspondence
  feedback, and a locked-entry disabled state. The existing complete
  synchronized-selection WebGL workflow also passed.
- Exact M5 final gate: 15 transform/superposition tests and the focused history
  test passed; repository-wide Ruff, strict mypy for 25 source files, and all
  96 Python tests passed. ESLint, TypeScript, all 26 client tests, and the
  production build passed.
- Exact M5 Playwright gate: the complete desktop coordinate workflow passed in
  11.4 seconds with one intentional mobile duplicate skipped. The full browser
  regression passed 13 workflows with 7 intentional desktop-only mobile skips.
- The documented normal API and Vite commands started the current code on ports
  8000 and 5173. `/health` returned `{"status":"ok"}`, `/formats` returned all
  seven adapters, and the frontend entrypoint responded successfully.
- Fresh normal-startup Chromium inspection at 1440x900 and Pixel 7 dimensions
  showed the live coordinate inspector and molecular canvas with readable,
  scrollable controls and no clipping, text overflow, or incoherent overlap.
- M6 audit checkpoint: reread the product, plan, progress, and decision
  documents; verified the clean M5 baseline; and traced molecular identity,
  artifact, command-history, saved-selection, measurement, scene, query-cache,
  and Mol* update paths.
- Defined gapped stable atom/bond identity, non-rewinding per-entry allocation,
  immutable topology history, affected-entry viewer replacement, transactional
  deleted-reference reconciliation, and explicit valence/stereo/force-field
  warning semantics in D-028.
- M6 scientific checkpoint: focused Ruff passed; strict mypy passed for 19
  core/test source files; all 11 ligand editor and scientific validation tests
  passed.
- M6 persistence checkpoint: repository-wide Ruff passed; strict mypy passed
  for 38 API/core/test source files; all 110 Python tests passed.
- A fresh temporary database migrated `0001 -> 0002 -> 0003 -> 0004 -> 0005 ->
  0006`, reported `0006 (head)`, downgraded to `0005`, and upgraded to `0006`
  again.
- M6 client checkpoint: ESLint and TypeScript passed; all 30 client
  component/domain tests passed under the exact `ligand-editor` gate; the
  production build transformed 3,345 modules with a 461.10 KiB initial chunk
  and Mol* retained in a lazy chunk.
- M6 desktop browser checkpoint: the real Chromium API/WebGL workflow passed in
  12.2 seconds. It verified invalid-valence rejection without revision or atom
  mutation; atom and bond creation with stable IDs; exact bond-rotation
  undo/redo; terminal-bond rejection without revision change; explicit
  hydrogen add/remove; reported MMFF/UFF cleanup; selected-atom movement; lock
  enforcement after reload; affected-entry viewer replacement; and a nonblank
  molecular canvas throughout.
- Playwright now applies Alembic migrations to its persistent `.molweave-e2e`
  data directory before starting the API. Exact E2E commands therefore work
  after schema changes without deleting accumulated test projects.
- The viewer tolerates absent transient patch arrays from a stale local API
  during a rolling development restart. Fresh current-version project
  responses continue to provide both typed patch collections.
- M6 responsive browser checkpoint: the dedicated desktop chemistry workflow
  and Pixel 7 inspector workflow both passed. The mobile case imported a real
  ligand, rejected invalid valence without mutation, added an atom, and
  confirmed the drawer has no horizontal overflow.
- Exact M6 final gate: 8 ligand editor unit tests, 3 scientific validation
  tests, all 30 client tests, the two-project ligand Playwright workflow, and
  the production build passed. The build transformed 3,345 modules with a
  461.11 KiB initial application chunk and Mol* retained as a lazy chunk.
- Repository-wide final regression: Ruff passed; strict mypy passed all 51
  checked source/test files; all 110 Python tests passed; ESLint, TypeScript,
  and all 30 client tests passed; and the complete Playwright matrix passed 15
  workflows with 9 intentional cross-project skips.
- The broader mypy gate found four annotation defects in three pre-M6 tests.
  Return annotations/casts and one now-unnecessary ignore were corrected as a
  small validation prerequisite; all 15 affected tests and the complete Python
  suite pass unchanged behaviorally.
- Normal `.molweave` startup upgraded migration `0005 -> 0006`. The documented
  API and Vite commands then started successfully; `/health`, all seven format
  capabilities, and the frontend entrypoint responded.
- Live Chromium inspection at 1440x900 and Pixel 7 dimensions loaded an actual
  ethanol projection and the ligand editor without viewer errors. Both views
  fit horizontally; the desktop molecule was correctly framed and the mobile
  controls were readable and vertically scrollable.
- Updated the README, HTTP API, project schema, scientific limitations,
  decisions, and progress documents for the implemented M6 contracts and
  validation commands.
- M7 audit checkpoint: reread the complete product, plan, progress, and decision
  documents; verified the clean M6 baseline; and traced the reusable M6
  topology-command, stable-ID, reference-reconciliation, and affected-entry
  viewer paths.
- The required dependency gate found neither PDBFixer nor OpenMM installed.
  PDBFixer `v1.12` was resolved to official commit
  `94cfa4c0ca551cdc5f13320f9a658efd59f2b881`; OpenMM is pinned to the matching
  stable `8.4.0` release.
- M7 dependency checkpoint: `uv` resolved and installed PDBFixer `1.12.0` from
  the immutable commit and OpenMM `8.4.0` in the project `.venv`. OpenMM's
  installation test found Reference and CPU platforms, computed forces on
  both, and reported all differences within tolerance.
- The PDBFixer smoke path loaded its capped alanine dipeptide, mutated
  `ALA-2` to `VAL`, rebuilt the standard heavy-atom template, and added 16
  hydrogens at pH 7.0. The result contained 12 heavy and 28 total atoms.
- M7 domain checkpoint: added cascade-safe atom, residue, chain, water, ion,
  and hydrogen deletion; chain rename; author residue renumbering; standard
  amino-acid mutation; and explicit-hydrogen placement behind a typed
  PDBFixer adapter.
- PDBFixer template results map topology residues and retained atoms through
  unique chain, author-number, insertion-code, and atom-name identities.
  Existing backbone IDs and coordinates survive mutation, while inferred atoms
  and bonds receive caller-supplied monotonic IDs. Multiple conformers,
  alternate locations, unsupported mutation sources/targets, and missing
  backbone anchors reject before publication.
- Protein validation now surfaces unsupported polymer residues and sub-0.4
  angstrom severe clashes. Template operations append visible warnings for
  deterministic side-chain placement without rotamer search, terminal edits,
  pH-dependent hydrogen inference, and terminal hydrogen state.
- Focused Ruff and strict mypy passed. The exact M7 domain gates passed all 5
  protein-editor unit tests and all 8 scientific template tests, covering
  successful mutation/hydrogen workflows and important ambiguity, unsupported
  residue, incomplete backbone, invalid target, invalid deletion, and metadata
  failure states.
- M7 persistence checkpoint: added a discriminated protein-edit HTTP contract
  and service for atom/residue/chain deletion, water/ion removal, chain rename,
  author residue renumbering, standard mutation, and explicit hydrogen
  add/remove. Protein and complex entries share the service; ligands and locked
  entries reject before publication.
- Every successful protein edit publishes a new immutable normalized artifact,
  advances existing per-entry atom/bond allocators only for created identities,
  records an exact reversible history command, returns an affected-entry
  topology patch, and leaves the original upload artifact unchanged.
- Deleted protein atoms reuse transactional reference reconciliation: saved
  selections and scenes are pruned, affected measurements are removed, and
  undo restores the molecular artifact and all durable references exactly.
  Reconciliation warnings now record the actual edit operation instead of a
  ligand-specific label.
- All 4 protein API integration workflows passed, including mutation/backbone
  preservation, hydrogen ID non-reuse after an undo branch, metadata and
  component edits, durable-reference reconciliation, multi-model rejection,
  lock enforcement, and wrong-entry-type rejection. Repository-wide Ruff,
  strict mypy for 56 files, and all 127 Python tests passed.
- M7 client checkpoint: added a Protein inspector tab that loads protein and
  complex hierarchy data even when hidden, follows the selected entry, and
  exposes working selected-atom/residue/chain deletion, water/ion removal,
  chain rename, author renumbering, one-of-20 mutation, pH-aware explicit
  hydrogen add/remove, and selected atom or whole-residue movement controls.
- Protein topology responses use the existing affected-entry cache/viewer
  replacement path and remove deleted stable IDs from the live selection.
  Coordinate movement retains the M5 compact patch path. Locked or unloaded
  entries expose no enabled mutation command.
- The editor keeps the deterministic-template limitation visible and renders
  every scientific warning returned by the API; it explicitly states that
  rotamer search, protonation analysis, and full protein preparation are not
  performed.
- ESLint and TypeScript passed. The exact `protein-editor` client gate ran all
  34 component/domain tests successfully, including 4 protein editor workflows.
  The production build transformed 3,346 modules with a 472.94 KiB initial
  application chunk and Mol* retained as a lazy chunk.
- Browser verification exposed and fixed a real sequential-edit mapping defect:
  monotonic side-chain IDs can place new atoms after atoms from later chains in
  normalized ID order. The PDBFixer adapter now emits a hierarchy-ordered,
  temporary remapped projection so each residue remains contiguous without
  changing authoritative MolWeave IDs. Mutation followed directly by hydrogen
  placement has focused scientific regression coverage.
- Browser verification also exposed and fixed hierarchy form input being
  overwritten during the brief projection gap after a topology artifact
  changes. The editor now preserves active input while the affected Mol*
  projection refetches, with a dedicated component regression test.
- Exact M7 Playwright gate: the desktop Chromium workflow passed in 15.6
  seconds and the Pixel 7 workflow passed in 4.1 seconds, with two intentional
  cross-project skips. Desktop verified backbone-preserving mutation and
  warnings, exact undo/redo, hydrogen add/remove, water/ion removal, chain
  rename and renumber, atom and whole-residue movement, reversible
  atom/residue/chain deletion, live selection reconciliation, affected-entry
  viewer replacement, a nonblank WebGL canvas, lock enforcement, and atomic
  multiple-model/alternate-location rejection. Mobile performed a real chain
  rename and confirmed the scrollable editor has no horizontal overflow.
- Exact M7 final gates passed: 5 protein-editor unit tests, 9 scientific
  template tests, all 34 client tests under the `protein-editor` filter, the
  two-platform protein Playwright workflow with two intentional cross-project
  skips, and the production build. The build transformed 3,346 modules with a
  473.24 KiB initial application chunk and Mol* retained as a lazy chunk.
- Repository-wide final regression passed: Ruff, strict mypy for 56 source and
  test files, all 128 Python tests, ESLint, TypeScript, all 34 client tests, and
  the production build. Clean bounded Playwright runs covered all 28 configured
  cases: 17 workflows passed and 11 intentional cross-project cases skipped.
- The documented normal migration, Uvicorn, and Vite commands started the
  current code on ports 8000 and 5173. `/health` returned `{"status":"ok"}`,
  all seven format capabilities loaded, OpenAPI contained the protein-edit
  route, and the frontend entrypoint responded.
- Fresh normal-startup Chromium inspection at 1440x900 and Pixel 7 dimensions
  showed the empty workspace and responsive navigation with no clipping,
  horizontal overflow, or incoherent overlap. The separate M7 Playwright
  workflow exercised the populated protein editor and real nonblank WebGL
  viewer at both viewport classes.
- Updated the README, HTTP API contract, scientific limitations, decisions,
  and progress documents for the implemented M7 behavior, dependency pins,
  verification commands, and explicit not-full-preparation boundary.
- M8 audit checkpoint: reread the complete product, plan, progress, and decision
  documents from the clean `8de7732` baseline and traced individual adapter
  export, immutable original/current artifacts, project snapshots, canonical
  entry selection, client download, and import-cancellation paths.
- Defined deterministic all/selected/visible scope resolution, disposable
  hydrogen/water/ion filtering, collision-safe separate filenames, SDF/SMILES
  multi-record packing, per-entry loss reports, prepare-before-publish
  cancellation, and `ProjectManifestV1` archive/import semantics in D-035.
- Existing export baseline verification passed all 9 adapter export tests and
  all 16 import/export API integration tests before M8 changes.
- M8 export-policy checkpoint: added validated disposable
  hydrogen/water/ion filtering, empty-result rejection, portable ASCII stems,
  case-insensitive collision suffixes, stable entry ordering, fixed-metadata
  ZIP packing, SDF/SMILES multi-record packing, and per-entry output/loss
  reports.
- Added the cancellable batch export API for all, selected, and visible scopes.
  Preparation runs in a child process from immutable normalized snapshots;
  adapter or policy failures remain structured, and only a completed,
  loss-acknowledged result is published by the API parent.
- Download filenames are now explicit safe response values instead of mutable
  artifact metadata. Identical bytes still deduplicate by SHA-256 while renamed
  exports retain their deterministic requested filename.
- The exact M8 export-policy gate passed all 12 tests. Focused Ruff and strict
  mypy passed for the six changed core/API/test modules, and the combined
  import/export regression passed all 31 tests. API coverage includes every
  scope/filter, deterministic repeated output, multi-record success,
  unsupported format/mode, attributed blocking warnings, and pre-publication
  cancellation with an unchanged artifact count.
- M8 archive checkpoint: defined validated `ProjectManifestV1` records for
  source revisions, entries, groups, viewer settings, saved selections,
  measurements, scenes, and deduplicated original/current artifact content.
  Archive ZIPs use stable JSON/member ordering and fixed metadata, so repeated
  exports of one project revision are byte-identical.
- Archive import validates the complete ZIP and normalized-entry summaries in a
  child process before publication. It then publishes content and creates a
  clean revision-zero project atomically, remapping every relational UUID while
  retaining atom/bond IDs and byte-identical original/current artifacts.
- Archive validation rejects unsafe absolute, drive, backslash, empty, dot, and
  parent paths; directories, symlinks, special/encrypted files; duplicate,
  missing, unexpected, or unreferenced members; compression-ratio/member/
  compressed/uncompressed/manifest limits; unsupported schema/application
  shapes; bad hashes/sizes; invalid group or atom references; and normalized
  summary/media mismatches.
- Exact archive gates passed both round-trip/cancellation integration workflows
  and all 11 hostile-archive cases. The 19 existing import/export workflows
  still pass. Repository-wide Ruff and strict mypy passed all 61 current Python
  source and test files.
- Added a typed complete-export dialog with all/selected/visible scopes,
  deterministic format and separate/multi-record choices, hydrogen/water/ion
  filters, per-entry filenames and scientific warnings, blocking-loss consent,
  cancellation, and artifact downloads. Per-entry browser export opens the
  same complete workflow with that entry selected.
- Added portable archive export in the same export surface and project archive
  import in the project chooser, so an archive can be restored without an
  existing active project. Successful import switches to the fresh restored
  project; rejected archives retain the current project.
- Added cancellable typed web-client operations for batch export, archive
  export, and archive import. Client cancellation calls the server operation
  endpoint before aborting the local request/upload.
- The exact M8 component command passed all 41 web tests, including 7 new
  export/archive dialog workflows for scopes, filters, multi-record support,
  downloads, attributed loss confirmation, archive round-trip UI, hostile
  archive feedback, and both export/import cancellation. Frontend lint and
  TypeScript checks also pass.
- Added the exact M8 Playwright workflow against real imported PDB, MOL, and
  MOL2 chemistry. Desktop Chromium verifies all/selected/visible scopes,
  water/ion removal in downloaded PDB bytes, supported two-record SDF output,
  deterministic repeated downloads, safe separate ZIP output, attributed loss
  consent, and stale-result-free export/import cancellation.
- Browser archive coverage downloads the same project archive twice and checks
  byte identity, imports it through the project chooser, compares restored
  project state and byte-identical originals through the API, then verifies an
  invalid ZIP creates no project and leaves the restored project active.
  Pixel 7 coverage confirms the complete export/archive controls fit the
  viewport, remain operable, generate a real archive, and expose archive import.
- The exact M8 Playwright command passes 4 applicable workflows across desktop
  and mobile Chromium (4 intentionally inapplicable project variants skipped).
- Updated the existing import/display/export regression for the complete export
  surface. Both workflows pass in desktop Chromium, including real XYZ
  information-loss consent, original-file byte equality, malformed-file
  rejection, and import cancellation.
- Final validation is clean: all 156 Python tests pass; repository Ruff and
  strict mypy pass all 61 Python source/test files; all 41 frontend tests pass;
  frontend lint and TypeScript checks pass; and the Vite production build
  succeeds. The expected lazy Mol* chunk remains isolated from the initial
  application bundle.
- Updated `README.md` to describe M8 and document its exact validation commands.
  The documented API and Vite startup commands started current code on ports
  8000 and 5173; `/api/v1/health` returned `{"status":"ok"}`, current OpenAPI
  included the complete-export/archive endpoints, and the browser entry
  returned the MolWeave application shell.

## Known limitations

- Mol* is necessarily a large on-demand dependency (about 963 KiB compressed).
  It is excluded from the initial application chunk and loaded only when a
  project contains structures.
- Representation changes rebuild the affected disposable Mol* projection in
  M4. Camera state is preserved across rebuilds, but adding incremental Mol*
  representation patches is deferred unless profiling demonstrates a need.
- Import preparation uses one short-lived child process per batch. This favors
  cancellation and native-library isolation over minimum process overhead.
- The API uses short synchronous SQLite transactions inside async route handlers.
  This is appropriate for local M1 workloads and remains behind the project
  service boundary.
- Spatial selection runs off the main thread but uses a direct
  seed-by-candidate calculation in v0.1. Large jobs can take time and consume
  worker memory; a spatial index is deferred.
- Cross-structure distance selection assumes entries already share a meaningful
  Cartesian frame. It does not apply alignment, periodic boundaries, unit-cell
  transforms, or minimum-image rules.
- M4 close-contact detection currently operates within one normalized
  structure. Cross-structure contacts and periodic boundaries are outside the
  v0.1 requirement.
- Free selected-atom translation remains an unconstrained rigid transform and
  can create chemically unreasonable local geometry. Ligand graph changes,
  bond rotation, and coordinate cleanup now use the M6 validator and surface
  sanitization, stereochemistry, clash, convergence, and force-field warnings.
- Protein superposition requires compatible, unambiguous hierarchy identities.
  It does not guess sequence alignments, fill missing residues, or perform
  ligand graph matching.
- M7 mutation performs one deterministic PDBFixer template placement. It does
  not search rotamers, optimize the local environment, choose protonation
  states, cap termini, fill loops, or constitute complete protein preparation.
- PDBFixer template operations currently require one resolved conformer,
  unique one-character polymer chain names, author residue numbers, and no
  alternate locations. Ambiguous inputs reject without changing the entry.
- Portable project archives are exact current-state snapshots and intentionally
  omit undo/redo command history. Imported projects start as clean revision-zero
  checkpoints while retaining source revision provenance in the archive.

## Blockers

None.

## Next action

Milestone 8 is complete. Begin Milestone 9 only when requested.
