# MolWeave Progress

## Current milestone

Issue #2 - automatic component detection and structure hierarchy, approved plan

The approved implementation contract at
`docs/plans/issue-2-structure-hierarchy.md` is the detailed source of truth.
The clean feature branch is based on verified local and remote `master` at
`da54b10116175d6232882caa8359f7c47d1548f1`, and this plan is its first change.
The approved outcome adds an application-owned deterministic component
hierarchy, conservative source-aware classification, category and individual
selection through canonical atom references, and mapped group visibility while
keeping Mol* disposable. Durable component overrides, selection-specific
styling, ligand-of-interest state, and component subset export are explicitly
deferred or rejected from this slice. Implementation has not started. The
planned backward-compatible feature release is v0.3.0 with no Alembic or
archive-schema migration.

## Completed work

- Approved issue #2 as a bounded vertical slice with stable component
  instances, source/fallback/ambiguous classification provenance, an expandable
  per-entry hierarchy, central selection, and existing group visibility.
- Classified every significant issue requirement and retained ambiguous atoms
  under an explicit unclassified fallback rather than discarding or silently
  assigning them.
- Deferred durable component labels/reclassification to a focused follow-up,
  reused issue #7 for selection-specific styling, retained issue #11 ownership
  of ligand-of-interest state, and separated component subset export for a
  product-design follow-up.
- Selected a backward-compatible minor release from v0.2.1 to v0.3.0 based on
  new user-visible functionality and additive API/normalized facts without a
  database or archive-schema break.
- Fast-forwarded clean `master` from `origin/master`, verified both at
  `da54b10116175d6232882caa8359f7c47d1548f1`, and created
  `feat/issue-2-structure-hierarchy` without starting implementation.
- Merged documentation-only [closeout PR #18](https://github.com/ManuelSe/MolWeave/pull/18)
  without moving `v0.2.1`,
  fast-forwarded clean local `master`, and deleted the original feature and
  closeout branches locally and remotely after verifying the release and both
  issue replies.
- Rebase-merged [PR #17](https://github.com/ManuelSe/MolWeave/pull/17) to
  verified `origin/master` commit `c08fbc3`, closing issues #5 and #6.
- Published and remotely verified annotated tag and
  [GitHub release `v0.2.1`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.1)
  at exact released commit `c08fbc3`.
- Posted and verified both issue close-out replies with implemented behavior,
  explicit-focus and gesture boundaries, verification, compatibility, release,
  rejected scope, and the issue #2 component-identity deferral.
- Requested `@codex review`; the integration did not acknowledge or return a
  review, so PR #17 records the completed local full-diff review without
  claiming independence.
- Before qualification, confirmed `origin/master` remained the approved
  `8e98bda` baseline and no v0.2.1 tag or release existed; the repository had no
  configured Actions, branch protection, ruleset, required check, or required
  review.
- Advanced all five authoritative application version sources to 0.2.1 and
  extended exhaustive archive round-trip provenance coverage to 0.2.0 while
  retaining both 0.1.x cases and schema version 1.
- Added v0.2.1 release notes covering behavior, compatibility,
  verification, scientific/accessibility/performance implications, and
  deliberately deferred or rejected scope.
- Documented the viewer interaction ownership boundary, including hit and
  modifier semantics, empty-space no-ops, Mol* gesture authority, camera-neutral
  primary activation, explicit focus operations, and transient-state limits.
- Added a bounded v0.2.1 evidence matrix without claiming deferred component,
  molecule, box-selection, context-input, cross-browser, or WebXR behavior.
- Added a dedicated real-WebGL workflow that configures cartoon, backbone,
  line, stick, ball-and-stick, space-filling, and surface representations and
  exercises their shared application selection path.
- Proved Atom, Residue, Chain, and Structure scope plus replace, add, subtract,
  empty clear, already-empty no-op, and modified-empty no-op behavior with an
  exact unchanged camera snapshot.
- Proved a real drag changes the camera without clearing selection and that
  explicit Focus selection and Fit all visible continue to produce distinct
  camera snapshots.
- Proved transient viewer clicks leave the complete project response unchanged
  and cause no repeated normalized-structure request.
- Added Pixel 7 touch-trigger evidence for Structure selection and empty-space
  clearing without durable project mutation.
- Added a typed interaction-policy helper that derives camera-neutral Mol*
  camera-focus and representation-focus bindings from the pinned defaults,
  removing primary and primary-equivalent triggers without removing secondary
  camera behavior.
- Routed both primary and Mol* trigger picks into the existing canonical
  selection path, preserving Alt subtract, Ctrl/Meta/Shift add, and unmodified
  replace semantics.
- Made an unmodified empty pick clear only a non-empty selection; already-empty
  and modified-empty picks now emit no selection change.
- Added direct tests that inspect the configured Mol* behavior parameters,
  exhaust every modifier against primary and trigger focus/reset, retain
  secondary bindings, and cover selection activation, modifier, and empty-pick
  policy.
- Approved one combined implementation contract for issues #5 and #6 because
  Mol*'s default camera-focus and representation-focus behaviors cause both
  sides of the same primary-click defect.
- Classified every significant issue requirement and retained Atom, Residue,
  Chain, and Structure picking, selection modifiers, Mol* gesture thresholds,
  non-primary camera behavior, and explicit focus operations.
- Defined unmodified empty-space clearing, already-empty and modified-empty
  no-op semantics, exact camera invariance, representation-independent behavior,
  and drag preservation as independently verifiable acceptance criteria.
- Rejected a second application click-versus-drag detector and deferred new
  Molecule/Component identity to existing issue #2.
- Selected the patch release from the verified v0.2.0 baseline to v0.2.1; the
  five authoritative version sources will change only after implementation and
  complete qualification.
- Fetched `origin/master`, confirmed clean local and remote baseline commit
  `8e98bda5082af57aa591db099bc580a99daf2310`, and created
  `fix/issue-5-viewer-click-selection` without starting implementation.
- Rebase-merged [PR #15](https://github.com/ManuelSe/MolWeave/pull/15) to
  verified `origin/master` commit `ab14e19`, closing issue #3.
- Published and remotely verified annotated tag and
  [GitHub release `v0.2.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.0)
  at exact released commit `ab14e19`.
- Posted and verified the issue #3 close-out reply with implemented scope,
  release, verification, compatibility, and deferred/rejected decisions.
- Requested `@codex review`; no integration response arrived, so the PR records
  the completed local review and does not claim independent review.
- Aligned the Python project, generated lock record, web package, FastAPI
  metadata, and archive producer provenance at 0.2.0 after confirming the
  remote v0.1.1 baseline and absence of a colliding v0.2.0 tag or release.
- Kept `/api/v1`, Alembic `0007`, `ProjectStateV1`, manifest schema 1, and
  `NormalizedStructureV1` unchanged; no migration is required.
- Extended the exhaustive archive round trip to both 0.1.0 and 0.1.1 producer
  provenance while 0.2.0 exports retain schema version 1.
- Added complete 0.2.0 release notes covering behavior, compatibility,
  verification, scientific/accessibility limits, and deliberately deferred scope.
- Added desktop real-WebGL camera snapshots proving selection, aggregate
  standalone-plus-complex ligand, and all-visible framing are distinct.
- Added exact before/after project-response and normalized-request evidence that
  quick camera actions do not mutate durable state or refetch molecular data.
- Added two-way browser synchronization between toolbar and Selection inspector
  without changing the current canonical selection.
- Qualified protein-only ligand unavailability, standalone and `1STP` complex
  ligand eligibility, focusable explanations, Pixel 7 bounds, compact native
  selection, axe coverage, keyboard reachability, and horizontal-overflow safety.
- Documented aggregate classification semantics and explicitly retained
  ambiguity, ligand designation, and individual-ligand choice as limitations.
- Added generic typed `focusAtoms` and `fitVisible` viewer operations so
  application code owns canonical focus targets while Mol* owns camera execution.
- Added Fit all visible, Focus selection, and Focus visible ligands to the quick
  toolbar and removed duplicate focus/reset actions from the expandable display
  drawer.
- Derived aggregate visible-ligand targets from normalized residue
  `component_type`, entry/component/hydrogen visibility, and captured isolation;
  water, ions, polymers, unknown components, and hidden atoms are excluded.
- Kept unavailable actions keyboard reachable with `aria-disabled`, accurate
  focus/hover reasons, and suppressed activation.
- Made persistent notices pointer-transparent except for their dismiss button so
  they cannot obstruct underlying viewer quick actions.
- Added an application-owned `ViewerToolbar` that exposes Atom, Residue, Chain,
  and Structure picking above the 3D workspace without opening the inspector.
- Wired the toolbar through `App`, `WorkspaceCanvas`, and `StructureViewer` to
  the existing transient selection-store setter, retaining one picking value
  for the toolbar, Selection inspector, and Mol* adapter.
- Added a compact labelled select below 520 px while retaining pressed buttons,
  accessible names, keyboard-native controls, and explanatory desktop tooltips.
- Added direct toolbar/store regression tests proving all four modes and that a
  future picking-mode change leaves the canonical current selection unchanged.
- Approved issue #3 as a scoped frontend/viewer vertical slice: one
  always-visible selection-mode toolbar, Fit all visible, Focus selection, and
  aggregate Focus visible ligands using authoritative normalized component
  classifications.
- Classified all significant issue requirements and explicitly deferred
  per-ligand choice to existing issues #2 and #11 rather than introducing a
  premature component or ligand-of-interest model.
- Selected the backward-compatible MolWeave 0.2.0 minor-release path from the
  verified v0.1.1 baseline; no persisted schema or HTTP API change is planned.
- Prepared `feat/issue-3-viewer-toolbar-focus` from clean `master` at
  `34a2b480cea67a509bb396375b58b4f7841f7cbc` and persisted the approved plan as
  the first branch change without starting implementation.
- Corrected Mol* initialization so the active light or dark background is part
  of Canvas3D creation instead of an earlier callback where Canvas3D does not
  yet exist.
- Reapplied the latest buffered background immediately after mount, preserving
  live theme changes without remounting or resynchronizing structures.
- Added a real-WebGL lifecycle regression that starts dark before a project
  viewer exists, imports a ligand and protein, performs a ligand topology edit,
  crosses the 840 px layout breakpoint, and restores the active project and
  dark canvas in a second page from the same browser context.
- Verified an explicit switch to light updates the existing canvas while
  preserving project revision, artifact IDs, viewer settings, canonical
  selection, loaded-structure count, and normalized-structure request count;
  a subsequent responsive remount also initializes light.
- Replaced exact archive producer-version matching with strict semantic-version
  provenance validation while retaining `ProjectManifestV1.schema_version: 1`
  as the compatibility gate.
- Extended the exhaustive archive round trip to import a manifest explicitly
  marked 0.1.0, and added safety cases for valid release/prerelease provenance,
  malformed versions, and unchanged rejection of unknown schema versions.
- Corrected the documented executable archive layout and recorded D-042 without
  changing archive contents, normalized data, relationships, ID remapping,
  persisted schemas, or Alembic head.
- Advanced the Python project, generated lock entry, web package, FastAPI
  metadata, and archive producer version together from 0.1.0 to 0.1.1 without
  changing API or persisted schema versions.
- Added 0.1.1 release notes and a focused issue #8 evidence section without
  rewriting the v0.1 requirement matrix.
- Passed the complete release gate: frozen Python/JavaScript installation,
  Alembic `0007 (head)`, Ruff, strict mypy, 180 Python tests, ESLint,
  TypeScript, 45 Vitest tests, 7 supervisor tests, production build, and 30
  applicable Playwright workflows with 20 intentional cross-layout skips.
- Rebase-merged [PR #13](https://github.com/ManuelSe/MolWeave/pull/13),
  fast-forwarded local `master`, and published the annotated
  [`v0.1.1` release](https://github.com/ManuelSe/MolWeave/releases/tag/v0.1.1)
  from verified commit `fb92de6`.
- Verified the remote tag object, release, merged PR, closed issue #8 and its
  close-out reply, then removed the original implementation branch locally and
  remotely.
- Approved and persisted the issue #8 feature plan without changing application
  code, tests, versions, schemas, migrations, or runtime behavior.
- Added the repository issue-delivery workflow to `AGENTS.md` and prepared the
  dedicated `fix/issue-8-viewer-theme-persistence` branch from the verified
  `master` baseline.
- Classified the issue requirements, localized the likely lifecycle defect,
  defined independently verifiable checkpoints, and selected a compatible
  `0.1.1` patch-release path.
- Added application-owned Mol* canvas appearance through the typed viewer
  boundary, using the existing light `#eef2f1` and dark `#11191b` surface
  colors.
- Applied the initial background before Mol* UI rendering and forwarded live
  theme changes without remounting the viewer, rebuilding structures, or
  changing durable viewer/project state.
- Added lazy-adapter and StructureViewer coverage for pre-mount color retention,
  live forwarding, and stable viewer/structure synchronization.
- Added `corepack pnpm dev` as a dependency-free cross-platform supervisor for
  Alembic migration, Uvicorn, the standalone job worker, and Vite.
- Added prefixed service logs, API/web readiness checks, strict configurable
  ports, prerequisite diagnostics, failure propagation, and coordinated child
  process shutdown without changing the API/worker process boundary.
- Added supervisor tests for command construction, environment overrides,
  cross-platform paths, invalid ports, readiness retry, and child termination.
- Promoted single-command startup in the README and development guide while
  retaining the exact manual troubleshooting path.
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

- Remote issue #5/#6 delivery verification: PR #17 is merged; both issues are
  closed with their close-out replies; remote annotated tag `v0.2.1`
  dereferences to `c08fbc3`; and the GitHub release is published, non-draft,
  and non-prerelease.
- GitHub reported no Actions workflows, rulesets, branch protection, required
  checks, or required reviews. PR #17 was clean and mergeable before rebase
  merge. The requested Codex integration returned no review; no independent
  review is claimed.
- Final full-diff review against `origin/master` found no accidental scope
  expansion, dead or debug code, duplicate gesture recognition, scientific
  inaccuracy, migration risk, persisted-data regression, incompatible API or
  archive change, or consequential unresolved finding. The only bounded test
  waits settle representation loading and explicit camera animations before
  exact snapshots.
- Issue #5/#6 Checkpoint 4 complete release gate: frozen Python/JavaScript
  installs, Alembic `0007 (head)`, Ruff, strict mypy across 46 source files,
  182/182 Python tests, ESLint, TypeScript, 54/54 Vitest tests, 7/7 supervisor
  tests, the production build, and 35 applicable Playwright workflows passed.
  Playwright intentionally skipped 25 cross-layout cases and completed in 8.3
  minutes. `git diff --check` passed.
- Archive round trips pass exhaustively with 0.1.0, 0.1.1, and 0.2.0 producer
  provenance while 0.2.1 exports retain manifest schema version 1. All five
  authoritative version sources report 0.2.1; `/api/v1`, Alembic `0007`,
  `ProjectStateV1`, `ProjectManifestV1`, and `NormalizedStructureV1` remain
  unchanged. No migration exists, so migration downgrade testing is not
  applicable.
- The final build retains the known non-blocking lazy Mol* warning at 966.15
  KiB gzip and the initial application chunk at 151.14 KiB gzip.
- Issue #5/#6 Checkpoint 3: architecture and verification documentation now map
  the implemented selection, gesture, explicit-focus, modifier, empty-space,
  representation, durable-state, and compact-input boundaries to exact passing
  evidence. ESLint, TypeScript, and `git diff --check` passed.
- Checkpoint 3 diff review found no schema, API, migration, archive, molecular,
  persistence, accessibility, or performance claim expansion and no claim for
  deferred Molecule/Component or box-selection behavior.
- Issue #5/#6 Checkpoint 2: `viewer-click-selection.spec.ts` passed 2 applicable
  desktop/mobile workflows with 2 intentional cross-layout skips in 30.8
  seconds. `viewer-controls.spec.ts` plus `synchronized-selection.spec.ts`
  passed 6 applicable workflows with 6 intentional cross-layout skips in 56.7
  seconds. ESLint, TypeScript, and `git diff --check` passed.
- The first dedicated desktop run exposed an unsettled initial camera while all
  seven representations completed their final automatic fit. Baseline capture
  now requires two identical snapshots; the passing rerun retains exact camera
  equality rather than using a numeric tolerance.
- Checkpoint 2 diff review found no product expansion, new control, custom
  gesture detector, backend/API/schema/migration/persistence/molecular change,
  scientific claim, or unresolved accessibility finding.
- Issue #5/#6 Checkpoint 1: all 54 Vitest tests across 17 files passed; ESLint,
  TypeScript, the production build, and `git diff --check` passed. The initial
  lint run exposed unsafe access to Mol*'s untyped `defaultParams`; explicit
  `unknown` narrowing was applied before the passing rerun.
- The Checkpoint 1 build retains the known non-blocking lazy Mol* warning at
  966.15 KiB gzip; the initial application chunk remains 151.14 KiB gzip.
- Checkpoint 1 diff review found no backend, API, persisted state, project or
  molecular schema, migration, archive, scientific, representation, explicit
  focus, or new browser gesture-detector change.
- Remote issue #3 delivery verification: PR #15 is merged; issue #3 is closed
  with its close-out reply; remote annotated tag `v0.2.0` dereferences to
  `ab14e19`; and the GitHub release is published, non-draft, and non-prerelease.
- GitHub reported no Actions workflows, rulesets, branch protection, required
  checks, or required reviews. PR #15 was clean and mergeable before rebase
  merge. The requested Codex integration returned no review; no independent
  review is claimed.
- Issue #3 Checkpoint 4 complete release gate: frozen Python/JavaScript installs,
  Alembic `0007 (head)`, Ruff, strict mypy across 46 source files, 181/181
  Python tests, ESLint, TypeScript, 51/51 Vitest tests, 7/7 supervisor tests,
  production build, and 33 applicable Playwright workflows passed. Playwright
  intentionally skipped 23 cross-layout cases and completed in 7.9 minutes.
- The build retains the known non-blocking lazy Mol* warning at 965.86 KiB gzip;
  the initial application chunk is 151.14 KiB gzip. All five authoritative
  version sources report 0.2.0 and Alembic reports `0007 (head)`.
- The first full browser run exposed only a stale partial accessible-name query
  in the definition journey. Exact advanced-inspector group selectors were
  applied in both related journeys; their focused run passed 2/2, and a fresh
  complete Playwright rerun passed 33 applicable workflows with no failure.
- Final full-diff review found no accidental scope expansion, dead or debug
  code, scientific inaccuracy, migration risk, persisted-data regression,
  incompatible API/archive change, or consequential unresolved finding.
- Issue #3 Checkpoint 3: `viewer-controls.spec.ts` passed 5 applicable real-WebGL
  desktop/Pixel 7 workflows with 5 intentional cross-layout skips in 42.7
  seconds. `release-hardening.spec.ts` passed 5 applicable axe, keyboard,
  responsive, and performance workflows with 1 intentional layout skip in 30.2
  seconds. All 51 Vitest tests passed; `git diff --check` passed.
- Checkpoint 3 browser evidence includes three distinct named camera snapshots,
  a larger all-visible radius than the aggregate ligand radius, exact durable
  project equality around every transient action, unchanged selection across
  picking transitions, and zero repeated normalized-structure requests.
- Checkpoint 3 diff review found no accidental product expansion, heuristic
  ligand classification, API/schema/archive/persistence change, molecular
  mutation, migration, or unresolved scientific or accessibility finding.
- Issue #3 Checkpoint 2: all 51 Vitest tests across 16 files passed, including
  focus-target classification/filtering, generic viewer-adapter forwarding,
  toolbar availability/help, camera routing, and selection invariance. ESLint,
  TypeScript, the production build, and `git diff --check` passed.
- The focused real-WebGL Chromium viewer-control workflow passed 2/2 in 25.9
  seconds after verifying the quick toolbar is not obstructed by a persistent
  status notice and is used with the display drawer closed. The production build
  retains the established 965.86 KiB gzip lazy Mol* chunk warning; the initial
  application chunk is 151.12 KiB gzip.
- Checkpoint 2 diff review found no persisted-state, project revision, command,
  API, schema, migration, archive, molecular-data, or classification change and
  no ligand heuristic or Mol*-owned domain decision.
- Issue #3 Checkpoint 1: the focused frontend test command passed all 47 Vitest
  tests across 15 files, including the new toolbar and selection-invariance
  cases. ESLint, TypeScript type-checking, the Vite production build, and
  `git diff --check` passed. The established lazy Mol* chunk warning remains
  non-blocking at 965.86 KiB gzip; the initial application chunk is 150.46 KiB
  gzip. Checkpoint diff review found no persistence, API, schema, molecular,
  camera, classification, migration, or unrelated behavior change.
- Issue #3 planning verification: inspected the governing product, plan,
  progress, decision, verification, architecture, schema, API, accessibility,
  scientific-limit, development, and release documents; traced frontend
  selection/viewer state, normalized ligand classification, viewer tests,
  migrations, and authoritative version sources; and inspected GitHub issue #3,
  related issues #2/#5/#6/#7/#11, branches, pull requests, tags, releases,
  workflows, protections, rulesets, and merge settings. Local `master` was clean
  and matched `origin/master` at `34a2b48` before branch creation.
- Issue #8 checkpoint 1: all 45 Vitest tests passed, including the lazy-adapter
  pre-mount ordering and StructureViewer no-remount/no-resynchronization theme
  assertions. ESLint, TypeScript type-checking, and the Vite production build
  passed; the expected existing large Mol* chunk warning remained non-blocking.
- Checkpoint 1 diff review found only the Mol* Canvas3D lifecycle correction and
  planning/progress evidence; it introduced no API, persisted-state, migration,
  scientific, accessibility, or new-control changes.
- Issue #8 checkpoint 2: the dedicated desktop Chromium lifecycle spec passed
  1/1 in 18.8 seconds, and the existing viewer-controls Chromium suite passed
  2/2 in 23.8 seconds. The executed workflows use real SwiftShader WebGL.
- Checkpoint 2 also passed frontend ESLint, TypeScript type-checking, and
  `git diff --check`. Diff review found one scoped E2E test plus its evidence;
  it adds no runtime, API, schema, migration, scientific, or UI behavior.
- Issue #8 checkpoint 3: repository Ruff and strict mypy passed; all 23 focused
  archive round-trip and safety tests passed in 6.03 seconds. The exhaustive
  restored-project assertions cover molecular structures, original bytes,
  settings, selections, measurements, scenes, and ID remapping.
- Checkpoint 3 diff review found only archive provenance validation, compatible
  test evidence, the executable schema documentation correction, and appended
  D-042. No database/archive migration, molecular transformation, API shape,
  frontend behavior, or relaxed archive-structure validation was introduced.
- Issue #8 checkpoint 4: every frozen install, migration, static-analysis,
  Python/frontend/unit/supervisor/build/browser command in the documented gate
  passed. Pytest reported 180/180, Vitest 45/45, supervisor tests 7/7, and
  Playwright 30 passed plus 20 intentional skips in 7.6 minutes.
- The production build kept Mol* lazy at 965.86 KiB gzip and the initial app
  chunk at 150.15 KiB gzip. The existing chunk-size warning is non-blocking;
  `git diff --check` passed.
- Final local review covered every change from `origin/master` through released
  preparation commit `455581d`. It found no accidental scope expansion, dead or
  debug code, scientific changes, migration risk, persisted-state regression,
  or unresolved consequential finding.
- GitHub reported PR #13 clean and mergeable with no checks, protection rules,
  rulesets, required reviews, or review threads. The requested `@codex review`
  produced no acknowledgement or review, so only the documented local review
  is claimed.
- Remote release verification confirmed annotated tag object `6b23f58`
  dereferences to released `master` commit `fb92de6`; issue #8 closed through
  PR #13 and contains the verified release close-out comment.
- Confirmed local `master` and `origin/master` matched commit
  `9c60bbad506e30ca2bb6564296090b80b41d8354` before creating the issue branch.
- Inspected issue #8, related issues, repository ownership boundaries, existing
  theme/viewer tests, version sources, archive compatibility, GitHub branches,
  pull requests, tags, releases, merge settings, and the absence of configured
  CI and branch protection.
- `git diff --check` passed for the approved plan and repository-instruction
  changes before implementation began.
- Frontend ESLint and TypeScript pass; all 45 Vitest tests pass, including
  initial background propagation, lazy-engine forwarding, live theme changes,
  and assertions that theme updates do not remount or resynchronize Mol*.
- The focused Chromium viewer-controls workflow passes both applicable cases.
  Real WebGL background-pixel luminance changes from light to dark and back,
  while two loaded structures remain present; the existing representation,
  navigation, isolation, scene, and WebGL-failure checks also pass.
- The production Vite build passes with Mol* remaining in its lazy chunk, and
  `git diff --check` reports no whitespace errors.
- Supervisor syntax and all 7 Node tests pass, covering default and overridden
  commands, Windows/POSIX path construction, invalid configuration,
  prerequisite diagnostics, migration failure, readiness retry, and child
  termination. `git diff --check` reports no whitespace errors.
- An isolated `corepack pnpm dev` smoke run migrated a temporary database from
  empty state through `0007 (head)`, started the API on port 18080, worker health
  endpoint on 18081, and Vite on 15173, reported readiness, and returned 200
  from all three processes. Ctrl+C removed all three listeners without touching
  the normal `.molweave` data root.
- Repository Ruff and strict mypy pass; all 170 Python tests pass. Frontend
  ESLint, TypeScript, all 44 Vitest tests, and the production Vite build pass.
- The focused Chromium demonstration-job workflow passes completion, failure,
  cancellation, artifact download, result import, and undo against an isolated
  migrated API, standalone worker, and Vite server (`1 passed`, `1` intentionally
  inapplicable mobile test skipped under the Chromium desktop project).

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
- M9 audit checkpoint: reread the complete product, plan, progress, and
  decision documents from the clean `2f6a7ff` baseline. Confirmed there is no
  existing job implementation to preserve: entry `job_links` and
  `generated_results`, archive `jobs`, and lower-panel space are intentional
  extension points; job tables, plugin contracts/registry, worker, events,
  APIs, demonstration plugin, and client workflows remain to be implemented.
- Traced reusable M9 prerequisites: immutable current artifacts provide input
  snapshots; `ArtifactService` provides atomic result publication and safe
  downloads; `ProjectService` can import a generated normalized entry through
  one undoable command; and `ProjectManifestV1` can carry job summaries and
  referenced result artifacts without changing the molecular schema.
- M9 contract checkpoint: added docking-neutral `JobDefinition`, `JobPlugin`,
  `JobContext`, `JobResult`, immutable input handle, result artifact, role, and
  resource-policy contracts in `molweave_core.jobs`. Declarations validate
  unique roles, cardinality, safe result filenames, media types, wall time,
  cancellation grace, output counts/bytes, and optional CPU/memory bounds.
- Added a startup-only plugin registry that loads configured Python targets and
  installed `molweave.jobs` entry points, admits only allowlisted plugin names,
  rejects malformed targets and duplicate job types, and exposes validated
  parameter JSON schemas without calling plugin execution.
- Added `packages/molweave_demo_plugin` through the same public registry path.
  Its generic structure-statistics job accepts one or more immutable normalized
  structure artifacts, reports cancellable step progress and stdout/stderr,
  calculates atom/bond/residue/chain/element/molecular-weight statistics, and
  returns JSON plus an optionally translated normalized structure artifact.
- Focused verification passed all 6 registry/demo-plugin tests. Targeted Ruff
  and strict mypy passed all 7 new core/plugin/test source files. Tests cover
  allowlisting, target and duplicate rejection, parameter schemas, result
  statistics/coordinates, deterministic failure, and cooperative cancellation.
- M9 durable lifecycle checkpoint: added migration `0007` and relational jobs,
  immutable input snapshots, result-artifact links, and ordered event records.
  Submission validates plugin parameters, role cardinality, structure types,
  current artifact availability, and captures project revision, artifact IDs,
  hashes, sizes, plugin target, implementation version, and canonical parameters
  as durable provenance before queue publication.
- Added the separate `molweave_api.worker` process and controlled spawned-child
  runner. The worker atomically claims queued rows, re-hashes every immutable
  input, gives each child a private work directory and controlled context,
  relays stdout/stderr and monotonic progress into the event ledger, validates
  returned roles/media/normalized structures/count/bytes, enforces wall time
  and optional platform CPU/memory limits, and publishes results only in the
  parent. Cooperative cancellation escalates after the declared grace period;
  startup recovery marks abandoned running work failed with `worker_lost`.
- Added generic definition, submit/list/detail/cancel/event/result-import HTTP
  endpoints and `/ws/jobs` with a durable global event cursor. The API loads an
  allowlisted registry at startup but never calls plugin execution. Result
  import creates a fully usable artifact-backed entry through the existing
  command ledger, preserves job/input/result provenance, and is undoable.
- Focused backend verification is clean: Ruff and strict mypy pass the complete
  API/job/plugin tree; 10 job unit/integration tests pass, covering successful
  execution, deterministic failure, invalid parameters, immutable provenance,
  queued and running cancellation, downloads, result import/undo, event order,
  and worker-loss recovery. A fresh SQLite database upgraded through all
  migrations and reported `0007 (head)`. OpenAPI generation succeeds with 42
  documented paths.
- M9 archive checkpoint: extended the v1 portable manifest with validated job,
  immutable input-snapshot, and result-artifact records. Export includes input
  artifacts even when no longer current, deduplicates all content by hash, and
  preserves terminal state, parameters, values, warnings, errors, timestamps,
  provenance, and imported-result links. Import remaps project, entry, job, and
  result identities while preserving hashes and downloads; nonterminal source
  jobs become explicit `archive_incomplete_job` failures and cannot execute.
- Generated normalized result entries now use `source_format: null` instead of
  inventing a pseudo file format. Their exact media type and implementation,
  parameter, input, job, and result provenance remain available through the
  artifact and metadata records. This keeps the supported molecular file-format
  vocabulary closed and lets archive validation remain strict.
- Archive verification passes all 8 focused archive/job/recovery integration
  tests plus targeted Ruff and strict mypy. Coverage includes legacy no-job
  projects, completed job inputs/results/downloads, imported result-entry link
  remapping, immutable hash preservation, and queued-job recovery as failure.
- M9 frontend checkpoint: added a top-bar Jobs action and a controlled Jobs tab
  in the persistent lower panel/mobile drawer. The generic submission dialog is
  generated from registered parameter JSON schemas and input-role declarations,
  filters incompatible/missing-artifact entries, enforces role cardinality,
  and submits real canonical values rather than plugin-specific form code.
- Added a dense job list/detail workspace with queued/running/completed/failed/
  cancelled states, stable progress, timestamps, input/plugin/version metadata,
  structured errors, parameters and result values, durable event logs, artifact
  downloads, result import, retry state, and explicit cancellation confirmation.
  Active work refreshes through WebSocket invalidation with bounded polling as
  fallback. Result import updates project/history caches so undo is immediately
  available.
- Frontend verification is clean: all 44 Vitest tests pass, including 3 focused
  job tests for generic submission, logs/download/import, structured failure,
  and confirmed cancellation. TypeScript and ESLint pass, and the production
  Vite build succeeds with Mol* still isolated in its lazy viewer chunk.
- M9 browser checkpoint: Playwright now manages API, Vite, and the separate job
  worker, and Vite proxies `/ws/jobs` upgrades as well as HTTP. Desktop Chromium
  submits a successful demonstration job, observes real progress/log events,
  downloads statistics, imports its normalized structure, undoes the import,
  inspects a deterministic structured failure, confirms running-job
  cancellation, and reaches `cancelled`. Pixel 7 submits/completes the same
  real job, exposes results/import controls, and passes viewport bounding-box
  and horizontal-overflow checks.
- Browser iteration caught and fixed three functional state issues: explicit
  nullable schema defaults are no longer converted to empty strings; each new
  submission resets parameters and input roles rather than retaining a previous
  failure configuration; and event invalidation follows the effective selected
  job even before the user explicitly selects a row, with slow terminal polling
  retained as WebSocket fallback.
- The exact demonstration-job Playwright command passes 2 applicable workflows
  across desktop and mobile Chromium (2 intentionally inapplicable project
  variants skipped). Successful runs show accepted backend WebSocket
  connections, and inspected desktop/mobile screenshots have no overlap or
  clipping in the job workspace.
- M9 documentation checkpoint: updated local startup and architecture for the
  separate worker; documented job HTTP/WebSocket semantics, durable schema and
  archive behavior, and generic-job scientific limits; and added a concrete
  plugin-development guide covering registration, definitions, immutable
  inputs, controlled execution, progress/logs, artifact publication, pose and
  score representation, generated-result import, failures, and the future
  docking integration checklist. Docking remains explicitly outside v0.1.
- Final Python checkpoint: repository Ruff passes, strict mypy passes all 73
  checked source/test files, and the complete suite passes all 168 tests. The
  full-suite run exposed duplicate `test_registry` module names that focused
  runs could not reveal; packaging the existing adapter and job test directories
  gives Pytest stable distinct module identities without changing production
  code or milestone behavior.
- Final frontend/browser checkpoint: ESLint and TypeScript pass, both the
  focused jobs command and complete Vitest run pass all 44 tests, and the Vite
  production build succeeds with Mol* retained as a lazy chunk. The exact M9
  Playwright command passes its 2 applicable desktop/mobile workflows (2
  intentionally inapplicable variants skipped) against isolated migrated API,
  worker, and Vite processes; server evidence confirms live WebSocket upgrades.
- Final startup checkpoint: the documented Alembic command upgraded the local
  store from `0006` to `0007 (head)`, then the documented Uvicorn, standalone
  worker, and Vite commands started successfully on ports 8000 and 5173.
  Health and job-definition requests returned 200, the browser-rendered shell
  was inspected at desktop resolution, and the live worker claimed and
  completed demonstration job `019fb7bb-4b0d-77c1-83aa-b08f8c9922f5` with
  ordered progress and both statistics and importable-structure results.
- Milestone 9 is complete: deterministic completion/failure/cancellation,
  abandoned-worker recovery, immutable input/result provenance, request/worker
  execution separation, undoable linked result import, portable job records,
  and exact future docking extension documentation are implemented and tested.
- M10 audit checkpoint: confirmed every functional v0.1 domain has a real
  implementation and milestone browser coverage; deferred rotamer browsing,
  docking/PDBQT, and full protein preparation are omitted or explicitly
  described as unavailable rather than exposed as working controls.
- Identified the remaining M10 work: a consolidated definition-of-done browser
  journey; automated keyboard, focus, accessible-name, light/dark contrast, and
  responsive-layout checks; reproducible representative-project performance
  and request-payload evidence; fixture provenance/scientific assertions;
  development and troubleshooting documentation; final API/schema/format/
  limitations/plugin review; and an evidence mapping for every traced v0.1
  requirement. Existing import/export cancellation and large-structure fallback
  states remain functional regression prerequisites rather than placeholders.
- M10 accessibility checkpoint: added pinned `@axe-core/playwright` WCAG 2.2
  A/AA checks over a populated real-WebGL project in both light/dark themes and
  desktop/Pixel 7 layouts. The audit exposed and repaired unnamed composite
  structure navigation, nested interactive ARIA options, and invalid generated
  resize-handle relationships. Structure selection is now a correctly named
  pressed button beside independent row commands, and every panel/resize handle
  has a stable ID and accessible label.
- Added roving Arrow/Home/End keyboard activation for inspector, lower-panel,
  job-detail, and export tab strips. Controlled dialogs now focus the first
  workflow control, close with one Escape, and restore their external opener;
  mobile drawers receive focus, expose dialog semantics, close with Escape, and
  restore their toolbar trigger. Automated viewport checks find no clipped
  visible form controls or document-level horizontal overflow.
- Added the immutable RCSB PDB `1STP` streptavidin-biotin release fixture and an
  exact SHA-256/scientific assertion: it imports as a 1,001-atom complex with
  121 polymer residues, one BTN ligand, 84 waters, the expected element counts,
  and 17 explicit bonds whose PDB bond order remains unknown.
- M10 performance checkpoint: desktop Chromium imports and renders `1STP`
  within the 30-second regression budget. Post-load entry selection, zoom,
  center/reset, and representation change complete within 5 seconds, produce no
  750 ms main-thread task, and issue zero repeated normalized-structure GETs.
  These are pinned-host regression budgets, not hardware-independent throughput
  claims.
- Checkpoint verification is clean: focused Python test/Ruff/mypy pass; all 44
  Vitest tests, ESLint, and TypeScript pass; the release-hardening Playwright
  spec passes 5 applicable desktop/mobile cases with one intentional mobile
  performance skip; and the affected synchronized-selection real-WebGL workflow
  passes.
- M10 definition-of-done checkpoint: added a consolidated real-browser desktop
  journey that creates a project; imports protein and ligand files; renders and
  configures multiple representations; selects through project, query,
  hierarchy, sequence, and Mol* picking paths; creates distance, angle, and
  dihedral measurements; transforms whole structures and selections; edits
  ligand topology and protein chemistry; exercises undo/redo, checkpoint,
  reload, selected SDF export, successful job result import, running-job
  cancellation, and project reopen; and confirms deferred docking/PDBQT/rotamer
  controls are absent.
- The combined journey exposed a persistent Mol* state-tree failure when a
  topology replacement followed measurement creation. Topology changes now
  rebuild the disposable viewer projection as one serialized transaction, and
  measurement overlay updates use the same engine queue. This preserves the
  backend molecular state as authority and avoids deleting children beneath an
  already-removed Mol* parent. Job-result imports now also mark the browser
  session edited so a stale recovery notice cannot replace result feedback.
- Checkpoint verification passes: frontend TypeScript, all 44 Vitest tests, and
  the consolidated desktop Chromium journey pass. The final journey completed
  in 2.6 minutes against migrated API, standalone worker, Vite, and real WebGL;
  both job completion/import and cooperative cancellation were observed.
- M10 documentation checkpoint: promoted the README and API/project/
  normalized/format/scientific contracts to v0.1; added clean frozen setup,
  three-process startup, development commands, configuration, and specific
  troubleshooting; documented frontend/API/domain/persistence/viewer/worker
  ownership and dependencies; expanded the strict `ProjectManifestV1` archive
  layout and validation contract; and linked all release documents centrally.
- Added documented WCAG/keyboard/focus/responsive/manual accessibility scope;
  the `1STP` performance fixture, budgets, request behavior, and interpretation;
  immutable official/synthetic fixture provenance and scientific assertions;
  and a release evidence matrix covering functional, failure, documentation,
  startup, manual, and deferred behavior.
- Documentation verification passes: a requirement audit expands every listed
  interval and confirms all 269 atomic IDs from the plan are covered with no
  missing IDs; every relative Markdown link in the README and `docs/*.md`
  resolves; and `git diff --check` reports no whitespace errors.
- M10 final-gate repair checkpoint: a fresh full Playwright run exposed a real
  SQLite race between worker progress and API cancellation event appends. Two
  sessions could increment the same in-memory job event counter and violate the
  unique `(job_id, sequence)` constraint, terminating the worker. Event sequence
  allocation now uses an atomic database update/return after flushing caller
  state, so SQLite serializes the competing writers.
- Added a deterministic two-session barrier regression test that appends two
  events from independently stale job reads and asserts contiguous unique
  sequences. Focused Ruff and strict mypy pass, all 5 job-lifecycle integration
  tests pass, and the affected demonstration-job Playwright spec passes both
  applicable desktop/mobile workflows with 2 intentional cross-layout skips.
- Corrected the M10 plan's Playwright command to execute from the repository
  root, matching `playwright.config.ts` and `tests/e2e`; the previous `--dir
  apps/web` form changed the working directory and found no tests.
- M10 full-gate checkpoint: `.venv/bin/uv sync --frozen` passes with 49 locked
  packages; `CI=1 corepack pnpm install --frozen-lockfile` recreated all 527
  packages from the lock; and a brand-new temporary data root migrated through
  Alembic `0001` to `0007 (head)`.
- Repository Ruff and the exact M10 strict mypy scope pass; the complete Python
  suite passes all 170 unit, integration, scientific, and security tests after
  the event-allocation repair. ESLint, TypeScript, all 44 Vitest tests, and the
  Vite production build pass. The build keeps Mol* in a lazy 965.76 KiB gzip
  chunk and the initial application chunk at 150.04 KiB gzip.
- The complete Playwright gate passed from a fresh `.molweave-e2e` store in 6.1
  minutes: 29 applicable desktop/mobile workflows passed and 19 explicitly
  inapplicable cross-layout variants skipped. It exercised real WebGL, all
  definition-of-done workflows, job concurrency/cancellation, structured
  success/failure states, archive safety, accessibility, responsiveness, and
  the representative performance/request budget without recurrence of the
  worker event race.
- M10 startup checkpoint: the documented Alembic command confirmed migration
  `0007 (head)` in the normal local data root, and the documented Uvicorn,
  standalone worker, and Vite commands started on ports 8000 and 5173. API
  health and job-definition requests returned 200. Project
  `019fb823-b91c-713e-a97f-753463f6b601` imported a real structure and job
  `019fb823-b991-7efd-a006-751a825ab849` completed through the live worker with
  9 contiguous durable events plus statistics and structure results.
- Desktop 1440x900 and Pixel 7 browser smoke checks rendered a nonblank Mol*
  canvas with no horizontal overflow or clipped workspace controls. Inspection
  found that focus restoration after closing a narrow inspector drawer could
  leave its tooltip over a recovery notice. Focus-triggered tooltips are now
  suppressed at widths up to 520 px while accessible button names remain; the
  browser regression asserts both restored trigger focus and a hidden tooltip.
- After that visual repair, ESLint, TypeScript, all 44 Vitest tests, and the
  production build pass again. A second complete Playwright run from a fresh
  `.molweave-e2e` store reports `passed` with no failed test IDs or failure
  artifacts; all managed E2E services shut down cleanly. Milestone 10 and the
  MolWeave v0.1 implementation are complete.

## Known limitations

- Real-WebGL qualification uses the repository's pinned Chromium/SwiftShader
  desktop and Pixel 7 projects; this fix does not add a cross-browser or WebXR
  matrix.
- Focus visible ligands aggregates all rendered atoms already classified as
  ligand in normalized application state. It does not repair ambiguous or
  unknown source classification, choose a ligand of interest, or offer
  per-ligand selection; issues #2 and #11 own those broader product models.
- Issue #8 real-viewer lifecycle regression coverage is intentionally desktop
  Chromium with pinned SwiftShader WebGL. The approved patch did not require a
  cross-browser theme matrix.
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
- M9 supplies one local coordinating worker and performs no automatic retry.
  CPU/address-space limits are applied only where the host platform supports
  them; wall time, cancellation escalation, result count, and result byte limits
  remain portable.
- The demonstration plugin validates the generic infrastructure only. Docking,
  receptor/ligand preparation, pose scoring, and scientific ranking remain
  outside v0.1 core and require a separately installed allowlisted plugin.

## Blockers

None.

## Next action

Begin Checkpoint 1 of the approved issue #2 plan under `/goal`: establish the
typed component domain, source-aware classifier, and additive lazy structure
API contract. Do not broaden into durable overrides, styling, ligand analysis,
or subset export.
