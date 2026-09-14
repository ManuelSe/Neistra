# Neistra Architectural Decisions

This log records decisions that materially constrain MolWeave v0.1. Changes must
add a superseding decision rather than silently editing historical rationale.

## D-001 - TypeScript/Python monorepo

Status: accepted

Decision:

- Build the browser application with React, TypeScript, and Vite.
- Build the HTTP API and worker in Python with FastAPI and Pydantic.
- Organize the repository under `apps/`, `packages/`, and `tests/`.
- Lock JavaScript dependencies with `pnpm` and Python dependencies with `uv`.
- Generate the TypeScript HTTP contract from FastAPI OpenAPI schemas.

Rationale:

The product needs a sophisticated browser workspace and Python-native chemistry
and plugin integration. Generated contracts reduce drift between these halves
without forcing the molecular domain into the viewer or frontend.

Consequences:

- CI and local verification must run both toolchains.
- The OpenAPI document is a versioned interface and breaking changes require an
  API version or migration.

## D-002 - Backend normalized molecular state is authoritative

Status: accepted

Decision:

Define a versioned, library-independent normalized molecular model in
`molweave_core`. Project entries and normalized snapshots are authoritative.
Mol*, RDKit, Gemmi, and PDBFixer/OpenMM adapt to or operate on that model but do
not own application state.

Stable structure UUIDs and entry-local atom IDs represent identity. Atom IDs are
never reused. Mol* selection loci are translated immediately to stable MolWeave
references.

Rationale:

The product requires consistent selection, editing, undo/redo, persistence,
export, and job inputs. Using Mol* or a chemistry library as the data store would
couple these behaviors to implementation-specific state and make reliable
round-tripping difficult.

Consequences:

- Every adapter must explicitly map identities, missing values, inferred values,
  warnings, and provenance.
- Viewer changes must flow through commands and patches rather than direct,
  authoritative Mol* mutations.

## D-003 - Split macromolecular and ligand chemistry responsibilities

Status: accepted

Decision:

- Use Gemmi for PDB and PDBx/mmCIF hierarchy, parsing, writing, and sequence
  information.
- Use RDKit for SDF, MOL, MOL2 import, XYZ, SMILES, ligand graph editing,
  validation, hydrogens, stereochemistry checks, coordinate generation, and
  MMFF/UFF cleanup.
- Use a documented MolWeave MOL2 writer because RDKit does not provide general
  MOL2 output.
- Use a pinned PDBFixer/OpenMM combination behind `MolecularEditor` for
  standard-residue mutation templates and protein hydrogen placement.
- Use NumPy/SciPy for transforms, superposition, spatial selection, and contact
  reference calculations.

Rationale:

No single selected library provides reliable coverage of all required
macromolecular and cheminformatics behavior. Explicit adapters let each library
operate in its strong domain while keeping scientific loss visible.

Consequences:

- Cross-library mapping and fixture tests are mandatory.
- Protein editing is blocked if a reproducible PDBFixer/OpenMM dependency set
  cannot be pinned; it must not be replaced by unvalidated geometry code.
- MOL2 support has an early milestone gate because atom typing differs among
  producers.

## D-004 - CIF means PDBx/mmCIF in v0.1

Status: accepted

Decision:

Interpret the product requirement "mmCIF or CIF" as macromolecular PDBx/mmCIF.
General crystallographic small-molecule CIF is deferred.

Rationale:

The product is centered on protein-ligand workspaces and explicitly permits
mmCIF or CIF. Treating all crystallographic CIF variants as one format would add
crystal symmetry, unit-cell, disorder, and chemical perception scope that the
v0.1 normalized model does not otherwise require.

Consequences:

- The UI and format documentation use the label "PDBx/mmCIF".
- Uploading unsupported CIF content returns a structured explanation rather than
  attempting a misleading parse.

## D-005 - Immutable artifact store plus relational metadata

Status: accepted

Decision:

Use SQLite in WAL mode for projects, entries, groups, metadata, commands,
measurements, selections, scenes, jobs, events, and artifact records. Store
original uploads, normalized snapshots, exports, logs, and results in an
immutable SHA-256-addressed filesystem.

Writes publish through a temporary work file, validation and hashing, atomic
rename, and a final database transaction. Database and artifact operations are
hidden behind replaceable interfaces.

Rationale:

SQLite and local files meet the local deployment requirement without external
services. Immutable artifacts preserve originals, make job inputs reproducible,
support history snapshots, and provide a future path to object storage.

Consequences:

- Large molecular data is not stored in SQLite blobs.
- Artifact garbage collection must account for current entries, checkpoints,
  history, archives, jobs, and results.
- Path traversal, symlinks, archive bombs, filename collisions, and hashes are
  explicit validation concerns.

## D-006 - Durable autosave with explicit checkpoints

Status: accepted

Decision:

Every acknowledged command is committed durably. The Save action creates a
checkpoint and clears dirty state; it is not the first persistence event.
Reopening a project restores the latest working revision and identifies changes
newer than the checkpoint as recovered.

Rationale:

This satisfies interrupted-session recovery without maintaining a second,
conflicting browser-only molecular store. It also gives Save a clear scientific
meaning: a named stable revision to which the user can revert or export.

Consequences:

- A network-failed or rejected command is not considered saved and must show an
  error.
- Project and entry dirty state are relative to the current checkpoint.

## D-007 - Backend command bus and bounded history

Status: accepted

Decision:

Route every user action that changes persisted project state through a typed
backend command bus. This includes metadata, imports, visibility,
representations, saved selections, measurements, scenes, molecular edits, and
coordinate changes. Commands contain human descriptions, affected structures,
selection snapshots, validated forward data, inverse deltas or immutable
before/after snapshots, and project revisions. Retain 200 commands per project.

Interactive coordinate operations preview in the browser and commit as one
command. Undo and redo are themselves atomic commands.

Rationale:

Central commands provide consistent modification flags, persistence, warnings,
concurrency checks, and reversible molecular changes. A bounded history prevents
unlimited artifact growth.

Consequences:

- Direct mutation from UI components or the viewer is prohibited.
- Compacting history must retain saved checkpoints and referenced artifacts.
- Transient hover, camera navigation, unsaved selection, active tool, and panel
  layout remain session state. Saving a selection or scene creates a command.

## D-008 - Local durable job worker without an external broker

Status: accepted

Decision:

Use SQLite as the durable v0.1 queue. A separate worker process atomically claims
jobs and launches allowlisted plugins in spawned child processes. Durable job
events feed WebSocket clients and polling fallback.

Cancellation is cooperative first and terminates the child after a grace period.
Abandoned running jobs become structured `worker_lost` failures on worker
startup. Automatic retry is not part of v0.1.

Rationale:

The required local deployment should not require Redis or another broker. A
single worker and SQLite are sufficient for the expected load while still
keeping plugin execution outside web requests and behind a replaceable
`JobRunner`.

Consequences:

- v0.1 supports one coordinating worker, although that worker may run one
  controlled child job at a time.
- Distributed execution requires a future queue implementation, not changes to
  job or plugin domain models.

## D-009 - Plugins are configured and allowlisted

Status: accepted

Decision:

Discover plugins from configured Python entry points at server startup and load
only allowlisted names. A plugin receives validated parameters, controlled
artifact handles, a private work directory, cancellation, logging, progress, and
artifact publication APIs. MolWeave does not accept arbitrary commands or
runtime plugin uploads.

Rationale:

The future docking package needs a stable integration surface, but runtime code
execution is outside the product requirement and would violate the scientific
safety constraints.

Consequences:

- Installing a plugin remains an administrator/developer deployment action.
- The docking guide documents integration through generic input roles, artifacts,
  progress, logs, results, and provenance.

## D-010 - Conditional v0.1 feature boundary

Status: accepted

Decision:

Include molecular surfaces, named scenes, and basic close-contact detection in
v0.1 because the selected libraries make them practical without displacing core
workflows.

Defer interactive side-chain rotamer browsing and optimization. Standard amino
acid mutation remains required and uses one deterministic template placement
with a clash report.

Rationale:

Surfaces, scenes, and contact detection are bounded extensions of already
required viewer and spatial infrastructure. Scientifically defensible rotamer
selection requires a curated library, scoring policy, and more validation than
the optional product wording justifies for v0.1.

Consequences:

- Rotamer controls are omitted, not represented as functioning.
- Mutation warnings explicitly state that MolWeave did not optimize the side
  chain.

## D-011 - Operational job events are not edit-history commands

Status: accepted

Decision:

Treat job submission, progress, completion, failure, and cancellation as
append-only operational events rather than undoable project-edit commands.
Importing a job result into a project is an undoable command. Cancellation
requires confirmation because it cannot be undone.

Rationale:

External process lifecycle cannot be reliably reversed. Pretending otherwise
would violate the requirement to preserve enough information for reliable undo.
The resulting molecular project change can and should remain reversible.

Consequences:

- The history UI distinguishes project edits from job events.
- Job records and artifacts remain available for inspection after cancellation
  or after an imported result is undone.

## D-012 - Project-local environment and compatible web stack

Status: accepted

Decision:

Create and retain `.venv` as the only Python environment used for MolWeave
development commands. Install `uv` inside that environment and invoke Python
tools through `.venv/bin/uv` or `.venv/bin/<tool>`.

Pin FastAPI to `>=0.115,<0.120` and AnyIO to `>=4.6,<4.10` for M1 instead of
allowing unconstrained future pre-1.0 releases. Use async FastAPI handlers with
short synchronous SQLite project-service transactions.

Rationale:

The initial unconstrained resolution selected FastAPI 0.141, Starlette 1.3, and
AnyIO 4.14. On the current Python 3.12 host, Starlette's test client and AnyIO's
thread worker both stalled even for minimal functions. The pinned compatibility
line restores a reproducible API surface. Async handlers avoid the affected
thread-worker path, while the repository boundary keeps the local synchronous
SQLite implementation replaceable.

Consequences:

- Setup documentation creates `.venv` before installing or running dependencies.
- Dependency upgrades must run the API lifecycle and standalone request tests,
  not only dependency resolution.
- Long-running or CPU-heavy work must never execute in these API handlers; the
  separate controlled worker remains required in M9.

## D-013 - Separate durable server state from local workspace preferences

Status: accepted

Decision:

Use TanStack Query for API-backed project and command state. Use a small
persisted Zustand store only for the active-project pointer, color theme, panel
sizes, and collapsed-panel preferences. Molecular entries and command history
are never copied into that browser store.

Build the desktop workspace from four stable regions: structure browser,
central work surface, inspector, and history. The three auxiliary regions are
resizable and collapsible on desktop and become drawers on narrow screens.

Rationale:

Project state must remain authoritative in the durable domain model rather than
drifting into viewer or browser-component state. Local preferences benefit from
instant persistence and do not belong in project history. The same workspace
information architecture can adapt to mobile without maintaining a second
application flow.

Consequences:

- API mutations invalidate or directly replace TanStack Query cache entries.
- Reload recovery comes from the persisted project, not browser storage.
- A stale active-project pointer is harmless: the project list remains the
  source of truth and the user receives a structured unavailable-project state.
- Mol* integration in M3 must consume normalized molecular state through an
  adapter and cannot become a second project store.

## D-014 - Explicit checkpoint schema and isolated browser fixtures

Status: accepted

Decision:

Version checkpoint snapshots as `ProjectStateV1` with an explicit
`schema_version: 1`, expose that version on complete project API responses, and
migrate older snapshots through Alembic.

Register the fixture-entry API only when `MOLWEAVE_ENABLE_TEST_ROUTES=1`.
Playwright starts a separate API on port 8010 with an isolated data directory
and that flag enabled. Normal startup does not expose fixture creation.

Rationale:

Dirty-state comparison and recovery depend on a stable snapshot contract.
Explicit versioning prevents later molecular-schema changes from being
interpreted silently. M1 must exercise entry commands through working controls
without introducing an unsafe pseudo-import path before M2 validation and
original-file preservation exist.

Consequences:

- Incompatible checkpoint changes require a new schema version and migration.
- `ProjectStateV1` is distinct from the portable `ProjectManifestV1` archive
  delivered in M8.
- Browser tests can cover the complete M1 entry workflow while production entry
  creation remains owned by the future import service.

## D-015 - M2 normalization and format fidelity policy

Status: accepted

Decision:

Use `NormalizedStructureV1` as the library-independent authority for imported
molecular data. Stable atom and bond IDs are contiguous, one-based,
entry-local integers. Models and library conformers map to ordered conformers;
the active conformer's float64 coordinates are also projected onto atom records.
Alternate locations remain distinct atom records with occupancy and alternate
identifier. Author numbering, label numbering, and insertion codes remain
separate fields.

Use Gemmi 0.7.5 for PDB and PDBx/mmCIF, RDKit 2026.3.4 for SDF, MOL, MOL2, XYZ,
and SMILES, and a deterministic MolWeave MOL2 writer. SDF records become
separate project entries. Identical PDB/PDBx models become conformers; mismatched
model topologies are rejected with an actionable error rather than flattened.
SMILES uses fixed-seed ETKDGv3 coordinate generation when requested. XYZ
connectivity may be inferred, but every inferred bond retains unknown order.
PDB connectivity never implies reliable ligand bond order.

Rationale:

The formats differ materially in topology, coordinate-set, numbering, and
property semantics. A typed authority prevents Gemmi, RDKit, or Mol* from
silently defining project behavior. Rejecting ambiguous model topology and
recording inference is safer than inventing identity or chemistry.

Consequences:

- The immutable original remains the only lossless source for unsupported
  PDBx/mmCIF categories and producer-specific MOL2 details.
- Export adapters enumerate known field losses; blocking losses require user
  acknowledgement at the API/UI boundary.
- General crystallographic CIF remains rejected as an unsupported dialect.
- RDKit may canonicalize resonance-equivalent MOL2 bond placement; fixture
  assertions compare chemical equivalence and retained SYBYL types rather than
  input array order.

## D-016 - Validate imports before atomic publication and load structures lazily

Status: accepted

Decision:

Read multipart files with byte-limit checks, then parse, normalize, and apply
atom limits to the complete batch before publishing any artifact or recording
the single multi-entry import command. A cancelled or failed preparation is
discarded. The commit phase first rechecks the optimistic project revision, then
publishes immutable original bytes and normalized snapshots in the same
short-lived database transaction as the project command.

Project responses expose entry counts, warnings, format, and artifact
identifiers but not full normalized molecular payloads. A separate entry
structure endpoint reads the normalized artifact on demand and returns both the
authoritative typed structure and a disposable Mol* projection.

Rationale:

Multi-file import must not leave a partially changed project, and a stale
project revision should not publish unreachable artifacts. Molecular payloads
can be large, so including them in every project query would defeat the lazy
viewer requirement and make ordinary metadata commands unnecessarily costly.

Consequences:

- One import is one reversible command even when an SDF creates multiple
  entries.
- Original artifacts are never rewritten by normalization or export.
- Hidden entries require no molecular fetch and cannot consume viewer memory.
- Mol* receives only generated PDBx/mmCIF or SDF projections and is never the
  molecular authority.
- Parsing and normalization run in a short-lived cancellable child process.
  Artifact publication and the project command occur only in the API parent
  after the complete validated result returns.

## D-017 - Lazy Mol* projection adapter and cancellable native parsing

Status: accepted

Decision:

Keep Mol* behind the `MolecularViewer` interface. The browser requests full
normalized structures only for visible entries, passes generated PDBx/mmCIF or
SDF projections to the viewer, and recreates the Mol* scene when the visible set
changes. Mol* is dynamically imported only after a project has structures.
Failure to create a WebGL canvas is an explicit user-visible viewer error.

Give every browser import a stable operation ID. The API performs Gemmi/RDKit
parsing and normalization in a short-lived child process while polling the
operation cancellation state. The cancellation endpoint can terminate that
process and prevents artifact or project commit. Child errors cross the process
boundary as structured data and are reconstructed into the normal API error
contract.

Rationale:

Mol* state must not become a second molecular store, hidden structures should
not consume network or WebGL resources, and the large viewer dependency should
not delay the empty project shell. Native chemistry parsing can block the event
loop and native adapter objects proved unsafe to move across worker threads.
XHR abort/disconnect signals alone are also not reliably propagated through the
development proxy.

Consequences:

- Project queries remain small; normalized payloads and Mol* load only when
  visible molecular content needs them.
- Simultaneous structures share one Mol* scene, with default Mol* structure
  representations in M2. Representation controls remain scoped to later
  viewer milestones.
- Cancellation is explicit and testable even through a proxy; cancelled
  preparation publishes no artifacts and records no command.
- The child-process boundary adds process startup and serialization overhead
  per import. That cost is accepted for local v0.1 correctness and isolation;
  M9 may move expensive conversion into the general job runner without changing
  adapter contracts.

## D-018 - Canonical atom references for central and named selection

Status: accepted

Decision:

Represent every atom, residue, chain, and structure selection as a canonical
ordered set of `(structure_id, atom_id)` references. Granularity and the source
of the last operation are metadata; they do not create parallel residue, chain,
or viewer-owned identity systems. Unsaved selection remains transient Zustand
session state. A named selection stores the same immutable reference set through
the backend command bus.

Entry deletion reconciles every saved selection in the same command: references
to the removed entry are pruned and a structured
`invalid_selection_references_removed` warning is retained. Undo restores the
entry, references, and previous warning state. Later atom-deletion commands must
use the same reconciliation action.

Rationale:

Atom IDs are the finest stable molecular identity already shared by import,
editing, export, and Mol*. Deriving residue, chain, and structure membership from
the authoritative normalized structure makes all selection algebra deterministic
and prevents synchronization loops between UI surfaces. Reconciliation must be
part of the edit transaction so a saved selection cannot silently point at
deleted molecular state.

Consequences:

- Project, sequence, inspector, worker, and viewer selection adapters consume
  one `SelectionV1` contract.
- Selection results are canonically sorted and duplicate-free before entering
  application state or persistence.
- Migration `0004` adds named selections and extends existing
  `ProjectStateV1` checkpoint documents with an additive `saved_selections`
  field. The schema version remains 1 because the migration makes all stored
  states conform before application access.
- M3 validates imported contiguous atom IDs using entry summaries. Future
  topology edits that create ID gaps must validate and reconcile against the
  authoritative current normalized artifact in their edit transaction.

## D-019 - Transient selection store and worker projection

Status: accepted

Decision:

Keep the current unsaved `SelectionV1` in a dedicated non-persisted Zustand
store and reset it whenever the active project changes. TanStack Query continues
to own normalized molecular structures. Selection operations explicitly request
only the structures they need through that cache; selecting a hidden entry or
running a project-wide predicate/invert/distance operation is an intentional
on-demand load.

Run spatial selection in a module Web Worker using a minimal projection of atom
reference, residue ID, and coordinates. The worker returns canonical atom
references and never receives or owns project, viewer, or command state.

Rationale:

Unsaved selection is session state and must update synchronously across UI
surfaces without becoming durable project state. Normalized structures remain
authoritative server data and should not be duplicated into Zustand. Distance
queries can be quadratic in seed and candidate count, so moving them off the
main thread is necessary before ordinary protein-scale use.

Consequences:

- Reload clears only the unsaved current selection; named selections reload from
  the project API.
- Hidden structures stay lazy until a user action explicitly includes them.
- The same pure selection functions are independently tested in Python and
  TypeScript, while persistence validation remains backend-owned.
- Worker failures are reported through the existing visible operation-error
  notice and do not change the current selection.

## D-020 - Explicit atom identity mapping at the Mol* boundary

Status: accepted

Decision:

Pass an ordered normalized atom-ID vector beside every disposable Mol* viewer
projection. Mol* source atom indices are translated through that vector when a
user picks a locus, and application atom references are translated back through
the same vector when selection highlighting is applied. Map Mol*'s `element`
picking level to MolWeave's public `atom` granularity at the adapter boundary.

Listen only to Mol* click behavior for viewer-originated selection events.
Programmatic application highlighting uses the interactivity selection manager
and does not synthesize a click event. The lazy adapter buffers current
selection and picking granularity until Mol* has loaded.

Rationale:

The normalized structure is the molecular authority, while mmCIF and SDF are
generated display projections whose internal identifiers and indices are
viewer details. The projection writers emit atoms in normalized order, so an
explicit ordered identity vector preserves stable IDs across protein, ligand,
multi-model, and reload workflows without making Mol* state authoritative.
Separating user clicks from programmatic highlights provides a hard loop
boundary for bidirectional synchronization.

Consequences:

- Browser, sequence, inspector, and viewer use the same canonical atom
  references even though Mol* works with loci and unit indices.
- Picking can operate at atom, residue, chain, or structure granularity while
  application state remains an atom-reference set.
- A future projection writer that reorders or filters atoms must also emit an
  updated mapping; relying on source indices without that mapping is forbidden.
- Symmetry copies map back to the same canonical atom references and are
  deduplicated by the central selection algebra.

## D-021 - Reference geometry and indexed contact semantics

Status: accepted

Decision:

Compute distance, angle, and signed dihedral values in `molweave_core` from
authoritative active-conformer coordinates. Use the RDKit-compatible signed
dihedral convention in the range `[-180, 180]`, reject coincident or collinear
geometry where the requested value is undefined, and keep measurement atom
references separate from cached display values.

Detect close contacts with SciPy `cKDTree` over one normalized structure's
active conformer. Exclude explicitly bonded atom pairs, require positive finite
cutoffs, sort results deterministically, and do not infer periodic images or
cross-structure coordinate relationships.

Rationale:

Measurement values must remain reproducible independently of Mol* and must
update when authoritative coordinates change. A tested library spatial index
provides the required sub-quadratic neighbor search without introducing a
second molecular-state model. Excluding explicit bonds makes the result useful
as nonbonded close-contact inspection rather than a bond-length listing.

Consequences:

- Mol* renders measurement loci and labels but never supplies persisted values.
- Measurement API responses calculate current values from atom references.
- Contact results are transient analysis output and are not project commands.
- Cross-structure contacts require an explicit shared-frame contract and are
  deferred; periodic boundary handling is also deferred.

## D-022 - Durable viewer state without Mol* snapshots

Status: accepted

Decision:

Persist validated representation, color, opacity, component, and label settings
on each structure entry. Persist named measurements and named scenes as project
children. Every durable mutation uses the existing optimistic revision and
command log; checkpoint snapshots include these domains.

A scene captures an application-owned camera value, all entry visibility and
viewer settings, and a canonical `SelectionV1`. Applying it changes durable
entry state in one undoable command. The client restores the saved camera and
transient selection after that command succeeds. Ordinary orbit, pan, zoom,
focus, projection changes, and unsaved selection remain session state and never
create commands.

When an entry is deleted, remove measurements that reference it and prune the
entry and atom references from named scenes in the same command. Undo restores
the entry and every dependent object.

Rationale:

Mol* snapshots contain implementation-specific objects and would make the
viewer authoritative. Typed application records are independently testable,
migratable, and can be applied to another viewer implementation. Keeping
navigation transient prevents routine camera motion from polluting history
while still making explicit scene saves reproducible.

Consequences:

- Migration `0005` adds the new tables, per-entry JSON settings, and additive
  checkpoint fields while retaining `ProjectStateV1`.
- At least one representation is required per entry; duplicate representation
  IDs and invalid color/opacity values are rejected before state changes.
- Scene camera and selection restoration is a coordinated client action after
  successful backend application, not a Mol* snapshot restore.
- Measurement display values are always recalculated from current normalized
  coordinates; atom references, names, and visibility are the durable data.

## D-023 - Mol* as a disposable renderer for complete viewer state

Status: accepted

Decision:

Create Mol* structures with an empty representation preset, then build static
components and representations exclusively from MolWeave `ViewerSettings`.
Map public styles and color schemes at the adapter boundary. Rebuild disposable
Mol* state when structure membership, display settings, or selection isolation
changes, preserving and restoring the application camera around the rebuild.

Render measurements and labels with Mol*'s structure measurement manager from
canonical atom-reference loci. Track the created selection transforms and
replace them whenever authoritative coordinates, durable measurements, or label
settings change. Subscribe to Mol* camera changes only to project position,
target, up, radius, and projection mode into `CameraState`.

For entries at or above the 250,000-atom recommended limit, replace requested
surfaces with line rendering and suppress dense atom/residue/chain labels while
retaining structure labels and a visible reduced-detail notice.

Rationale:

The public builder and measurement APIs provide mature rendering and interaction
without exposing plugin state to the rest of the application. Full rebuilds are
acceptable for v0.1 setting changes if camera and selection remain stable, and
they provide a clear cancellation boundary through generation counters.
Proactively degrading expensive surfaces/labels avoids an unusable viewer on
large structures.

Consequences:

- Multiple representations and components can coexist for every loaded entry.
- Mol* internal refs, themes, snapshots, and loci never enter persistence or
  React project state.
- Viewer labels and measurements are regenerated after coordinate changes and
  therefore remain synchronized with normalized state.
- Surface requests remain durably recorded on large entries but display as a
  documented reduced-detail fallback until the structure is below the limit.

## D-024 - Exact atom-reference predicate for measurement construction

Status: accepted

Decision:

Extend predicate selection with `atom_index` and `atom_reference`. The latter
matches the explicit textual form `structure_id:atom_id`, while the former
matches an entry-local atom ID across all structures in scope.

Rationale:

Imported ligand formats do not guarantee unique atom names, and screen-space
picking is unsuitable for deterministic 3- and 4-atom measurement construction.
The canonical identity already consists of structure UUID plus atom ID, so an
exact predicate is the smallest typed prerequisite for inspection and testing.

Consequences:

- Users can construct ordered measurement selections without ambiguous names.
- The prerequisite extends the shared Python/TypeScript predicate matrices and
  does not introduce another identity representation.
- The selection remains transient until explicitly saved or used by a durable
  measurement/scene command.

## D-025 - Rigid transform and conformer semantics

Status: accepted

Decision:

Represent every M5 coordinate edit as one float64 rigid transform: a translation
vector plus Euler rotations in degrees composed X, then Y, then Z. Whole-entry
rotation defaults to the active conformer's structure centroid. Selected-atom
rotation supports the selected-atom centroid, the entry centroid, or an explicit
finite Cartesian pivot.

Apply the same world-space matrix to the requested stable atom IDs in every
conformer. Update each atom record's coordinate from the resulting active
conformer. Translation and rotation inputs that are non-finite or jointly
identity, missing/duplicate atom references, empty selected scopes, locked
entries, and invalid pivots are rejected before publication.

Rationale:

One matrix gives numeric input and interactive gestures identical scientific
semantics. Applying it across conformers preserves their shared topology and
relative coordinate frames; changing only the active conformer would leave the
normalized entry internally inconsistent. Deriving atom coordinates from the
active conformer maintains the existing normalized-model invariant.

Consequences:

- Transform previews may use browser float64 calculations, but only the backend
  result becomes authoritative.
- Undo restores the prior immutable normalized artifact exactly. Numeric
  comparisons use a documented `1e-9` angstrom tolerance.
- Euler composition and pivot choice are part of the public API contract and
  must not depend on Mol* camera orientation.

## D-026 - Identity-matched protein Kabsch superposition

Status: accepted

Decision:

Superpose one moving protein or complex entry onto one distinct reference entry
using active-conformer float64 coordinates. Explicit-selection mode partitions
the canonical selection by the two entries and matches atoms by an unambiguous
protein identity key containing chain, residue numbering/insertion/name, atom
name, and element. Backbone mode deterministically matches common `N`, `CA`,
`C`, and `O` identities.

Require equal identity sets, at least three matched atoms, and rank-two or
greater centered geometry. Reject missing hierarchy, duplicate identities,
unequal or non-corresponding selections, collinear geometry, reflection-only
solutions, and non-protein entries. Apply the resulting proper Kabsch rotation
and translation to every atom in every moving-entry conformer and report matched
atom count plus post-fit RMSD.

Rationale:

Canonical selections intentionally do not retain click order. Pairing atoms by
array position or selection size would silently create scientifically arbitrary
correspondence. Protein hierarchy supplies a deterministic, inspectable identity
contract, and rank/reflection validation avoids reporting an underdetermined fit
as meaningful.

Consequences:

- General ligand graph matching and sequence-alignment-based correspondence are
  outside M5; the product specifically requires protein superposition.
- Backbone mode requires compatible residue/chain identities rather than
  guessing a sequence alignment.
- The reference entry is never changed; only the moving entry receives a patch
  and history action.

## D-027 - Immutable coordinate history with transient entry patches

Status: accepted

Decision:

Publish each transformed `NormalizedStructureV1` as an immutable current
artifact. Store forward and inverse command actions containing the affected
entry's after/before artifact ID and the corresponding active-coordinate span.
Undo and redo atomically switch the authoritative artifact reference and return
the matching span. Do not store viewer state or Mol* objects in commands.

Expose coordinate spans as transient project-response patches and update the
matching TanStack Query structure cache. At the viewer boundary, use Mol*
`ModelWithCoordinates` to update only the affected entry model and its
representations; unrelated loaded entries are not cleared, reparsed, or
retransmitted. Interactive browser previews use the same patch path and are
discarded or replaced by the authoritative backend patch at commit.

Rationale:

Immutable artifacts provide reliable reversal and persistence without placing
large mutable molecular blobs in SQLite. Active-coordinate spans are sufficient
for visible updates and measurement recalculation, and avoid serializing entire
structures for ordinary coordinate gestures. Mol* remains a disposable
projection of application-owned state.

Consequences:

- Project GET responses contain no patches; mutation, undo, and redo responses
  may carry transient patches that are not checkpoint state.
- One completed pointer gesture sends one backend command. Pointer movement
  only updates a local preview.
- A reload always reconstructs the same state from the current normalized
  artifact, independent of whether a client consumed the transient patch.

## D-028 - Stable ligand-edit identity and validated topology commands

Status: accepted

Decision:

Allow `NormalizedStructureV1` atom and bond IDs to be positive, unique, and
strictly increasing without requiring contiguity. Coordinate arrays continue to
align with atom-list order, never with `atom_id - 1`. Imported structures remain
contiguous initially. Each durable structure entry owns monotonic
`next_atom_id` and `next_bond_id` allocators; successful additions advance them,
and undo, redo, history truncation, or branch replacement never rewinds them.

Implement ligand graph changes through an RDKit-backed `MolecularEditor` and
`StructureValidator`. Convert stable IDs explicitly at the RDKit boundary,
sanitize before publication, compare stable-ID stereochemistry before and after
relevant edits, and return structured warnings and an operation report.
Unavailable requested force-field parameters and non-converged minimization are
reported explicitly; a requested force field never silently falls back.
`auto` cleanup may select MMFF and then UFF, but reports the selected method and
why MMFF was unavailable.

Publish every successful topology result as a new immutable normalized artifact.
History switches complete before/after artifacts and molecular summaries.
Topology responses identify the affected entry and artifact so the browser
refetches that projection and replaces only that Mol* structure. Coordinate-only
movement and bond rotation retain the M5 coordinate-span patch when topology is
unchanged.

Atom deletion reconciles transient selection in the client and, in the same
backend command, prunes invalid references from saved selections and named
scenes and removes measurements whose required endpoint was deleted. Each
affected durable object receives a visible structured warning where it remains;
undo restores its exact previous state.

Rationale:

Contiguous IDs conflict with the product requirement that a deleted or undone
new identity is never reused. Keeping allocation state outside reversible
molecular snapshots makes that guarantee hold across undo branches. RDKit is
the pinned chemistry authority for M6, but explicit identity maps and immutable
normalized artifacts keep it from becoming application state. Full
affected-entry replacement is necessary for topology changes, while continuing
to use coordinate spans avoids rebuilding unrelated structures for geometry-only
edits.

Consequences:

- Selection and reference validation must inspect authoritative atom-ID sets
  once topology edits can create gaps; `atom_id <= atom_count` is no longer a
  valid membership test.
- Migration `0006` initializes allocators to `atom_count + 1` and
  `bond_count + 1` for all pre-M6 entries and checkpoint entry states.
- Adapters and viewer projections must preserve list order independently of
  stable IDs.
- Ring bonds, non-single bonds, terminal bonds, and movable selections that are
  not exactly one component after cutting the bond are rejected before
  rotatable-bond coordinate publication.
- Original upload artifacts remain untouched by every edit and cleanup command.

## D-029 - Unified affected-entry patches for ligand edit artifacts

Status: accepted

Decision:

Return an affected-entry topology patch for every M6 ligand edit, including bond
rotation and coordinate cleanup. The patch contains only the entry and new
artifact identity; the browser refetches that one normalized/viewer projection
and replaces only that Mol* structure. Existing M5 translation, rotation, and
superposition commands continue to use compact coordinate spans.

Rationale:

M6 coordinate cleanup and bond rotation can change validation warnings,
stereochemistry reports, inference provenance, and the immutable artifact
snapshot in addition to coordinates. A single molecular patch path guarantees
that all of those fields update atomically and keeps undo/redo behavior
identical across every ligand edit. The refetch is still scoped to one affected
entry and does not rebuild unrelated structures.

Consequences:

- The M6 browser cache must invalidate and replace exactly the patched entry.
- Molecular edit undo/redo returns the corresponding before/after topology
  patch; reload remains reconstructible from the current artifact alone.
- Interactive free movement remains the M5 transform command and does not pay
  the topology-refetch cost.

## D-030 - Migrate the persistent E2E database before server startup

Status: accepted

Decision:

Run `alembic upgrade head` against `.molweave-e2e` in the Playwright API
web-server command before starting Uvicorn. Keep the persistent test data
directory and `reuseExistingServer` behavior, but require a restarted API after
backend schema or response-contract changes.

Rationale:

SQLAlchemy `create_all` creates fresh schemas but cannot add columns to an
existing SQLite database. Milestone 6 added stable-ID and allocator columns, so
an accumulated E2E database could pass the health check and then fail its first
project query. Applying the same migration path used by documented local
startup tests realistic upgrade behavior and avoids destructive test-data
cleanup.

Consequences:

- Every Playwright command is safe to run against a test directory created by
  an earlier milestone.
- Migration failures stop browser verification before test interactions begin.
- A server already listening on port 8010 is still reused; developers must
  restart it after code or schema changes.

## D-031 - Pin protein template chemistry to PDBFixer 1.12 and OpenMM 8.4

Status: accepted

Decision:

Pin PDBFixer to the immutable official `v1.12` commit
`94cfa4c0ca551cdc5f13320f9a658efd59f2b881` and OpenMM to `8.4.0`. Keep both
behind a constrained protein-editor adapter. Use PDBFixer/OpenMM only for
standard-residue templates and protein hydrogen placement; use the normalized
MolWeave model for identity, hierarchy, persistence, warnings, and history.

Mutation is limited to the 20 standard amino acids and one deterministic
template placement. Interactive rotamer search, protonation-state selection,
loop construction, terminal capping, force-field assignment, and full protein
preparation remain deferred.

Rationale:

The approved plan makes a reproducible PDBFixer/OpenMM stack a hard M7 gate and
forbids substituting unvalidated geometry code. The paired October 2025 releases
support Python 3.12 and give MolWeave a versioned template authority while the
explicit adapter prevents library topology or identity from becoming project
state.

Consequences:

- Dependency smoke tests must cover imports, the Reference platform, standard
  template mutation, and hydrogen placement before editor implementation.
- Every generated atom must map to a unique retained residue/chain identity and
  receive a new monotonic MolWeave atom ID; ambiguous mapping rejects the edit.
- Alternate conformers, missing backbone/template anchors, unsupported
  residues, termini, hydrogen uncertainty, and severe clashes must remain
  explicit warnings or blocking errors.
- A dependency resolution or smoke failure blocks M7 rather than enabling a
  fallback protein builder.

## D-032 - Reject ambiguous protein templates and preserve author metadata

Status: accepted

Decision:

Keep generic deletion and metadata edits in the normalized MolWeave model.
Atom deletion cascades to incident bonds and empty residues/chains without
renumbering surviving stable IDs. Residue renumbering changes author numbers in
chain order and clears insertion codes; it preserves label numbers. Chain
rename accepts application names longer than one character but reports their
PDB export limitation.

Project only polymer residues into PDBFixer. Require exactly one conformer,
resolved alternate locations, unique one-character polymer chain names, and
unique author residue identities for template mutation and protein hydrogen
placement. Map every PDBFixer residue by chain, author number, and insertion
code, then every retained atom by stable residue ID and atom name. Reject the
complete edit if any identity is missing, duplicated, or changed unexpectedly.
Preserve retained atom IDs and coordinates; allocate new stable IDs only for
inferred template atoms and bonds.

Rationale:

Generic hierarchy changes do not require a chemistry engine and should retain
all available conformers. PDBFixer uses PDB-style topology identities and can
otherwise silently collapse ambiguity. Explicitly narrowing its accepted input
turns uncertain mapping into a visible failure instead of publishing a
scientifically misidentified structure. Author numbering is the interoperable
PDB edit surface; label numbering remains source provenance.

Consequences:

- Deletion, chain rename, residue renumbering, and the existing M5 free atom or
  residue movement remain available without PDBFixer template preconditions.
- Renumbering with insertion codes warns that those codes were cleared.
- Long chain names remain valid normalized state but block subsequent PDBFixer
  template operations until changed to unique one-character names.
- Mutation preserves `N`, `CA`, `C`, and `O` IDs and coordinates when present;
  the new side chain is deterministic and explicitly reported as unoptimized.
- Template operations on multiple models, alternate locations, missing author
  identifiers, duplicate residue/atom identities, or unsupported polymer
  residues fail atomically.

## D-033 - Reuse molecular artifact commands for protein edits

Status: accepted

Decision:

Expose protein edits through one discriminated
`POST /projects/{project_id}/entries/{entry_id}/protein-edits` contract. Route
every successful result through the existing molecular-change command: publish
an immutable normalized artifact, update molecular summary fields, advance
monotonic atom/bond allocators, return one affected-entry topology patch, and
record complete before/after artifacts for undo and redo.

Use the same transactional deleted-atom reference reconciliation as ligand
edits, but label its durable warning with the actual protein operation.
Coordinate-only atom or residue movement continues through the M5 transform
contract and compact coordinate patch; it does not create a second protein
movement implementation.

Rationale:

Protein and ligand topology edits have the same persistence and viewer
invalidation semantics even though their chemistry engines differ. Reusing one
command representation keeps history, stable identity, original-file
preservation, selection cleanup, and affected-entry replacement consistent.
The M5 transform already provides reversible selected-atom movement independent
of viewer state.

Consequences:

- No M7 database migration is required; migration `0006` already provides the
  allocator and summary fields.
- Protein and complex entries are accepted; ligand, solvent, unknown, and
  locked entries reject before artifact publication.
- New protein atom and bond IDs never reuse identities consumed on an undone
  branch.
- Topology changes refetch and replace only the affected Mol* entry. Existing
  free movement retains the smaller coordinate-patch path.

## D-034 - Remap only the transient PDBFixer projection

Status: accepted

Decision:

Before exporting a polymer-only structure to PDBFixer, order atoms by normalized
residue hierarchy and source atom order, then assign temporary contiguous atom
and bond serials. Remap projected bond endpoints to those temporary serials.
Continue mapping PDBFixer output back by unique chain, author number, insertion
code, residue, and atom-name identities. Never publish the temporary serials or
use them as MolWeave identity.

Rationale:

MolWeave stable IDs are monotonic and non-reused. A mutation can therefore add
new atoms to an early residue with IDs greater than atoms in later residues or
chains. PDB requires each residue's records to be contiguous; exporting in
stable-ID order made OpenMM reconstruct the early residue as a second topology
object and correctly triggered the ambiguity rejection. Hierarchy ordering is
required at this file-format boundary, while stable IDs remain authoritative in
the normalized model.

Consequences:

- Sequential template operations such as mutation followed by hydrogen
  placement retain unambiguous residue identity.
- The projection is disposable and cannot be stored in history, project state,
  selections, or viewer state.
- Existing atom IDs and coordinates still map by hierarchy/name and remain
  unchanged; inferred atoms still receive the entry's monotonic MolWeave IDs.
- Any duplicate hierarchy or atom-name identity continues to reject before
  publication.

## D-035 - Deterministic batch exports and remapped portable archives

Status: accepted

Decision:

Implement one typed export policy over immutable current normalized artifacts.
The policy resolves `all`, `selected`, or `visible` entry scope; applies
hydrogen, water, and ion exclusion to a disposable normalized copy; and exports
either collision-safe separate files or one multi-record file. Multi-record
packing is available only for formats that declare it and is initially SDF or
SMILES. Multiple separate outputs are packaged in a deterministic ZIP with
stable member ordering, fixed ZIP metadata, safe ASCII stems, and numeric
collision suffixes. Every entry retains its own structured loss report.

Prepare batch exports outside the web request process from immutable input
bytes. Cancellation terminates preparation. Loss acknowledgement and a final
cancellation check occur before the parent publishes the one completed
artifact, so a rejected or cancelled operation leaves no partial export
artifact or work file.

Define `ProjectManifestV1` as a deterministic JSON document inside a ZIP
archive. It contains application/schema versions, source project identifiers,
working/checkpoint revisions, current groups, entries, viewer settings, saved
selections, measurements, scenes, and a content table for every deduplicated
original and current normalized artifact. Each content record declares its safe
archive path, SHA-256, byte length, media type, and display filename.

Archive import rejects absolute or parent paths, backslashes, duplicate names,
directories, symlinks, encrypted members, undeclared or missing members,
unsupported schema versions, excessive entry counts, compressed or
uncompressed size limits, excessive decompression ratios, malformed manifests,
relationship errors, normalized-summary mismatches, and content hash/size
mismatches before publishing artifacts or creating a project.

An imported archive always receives fresh project, entry, group, selection,
measurement, and scene UUIDs, with every relationship remapped atomically.
Entry-local atom and bond IDs and normalized bytes remain unchanged. This
allows the same archive to be imported repeatedly or back into its source
installation without relational collisions. The imported current state becomes
a clean revision-zero checkpoint; source revisions and IDs remain manifest
provenance. Command history is not a portable transport concern.

Rationale:

Filtering and format conversion are export projections, not molecular edits,
so they must not change project history or authoritative artifacts. Preparing
one final artifact before publication gives cancellation and loss confirmation
a clear atomic boundary. Fixed metadata and explicit filenames make repeated
exports byte-deterministic.

Portable archives are scientific snapshots rather than SQLite backups.
Preserving relational UUIDs would make normal same-instance re-import fail,
while restoring command rows would couple the transport schema to database
implementation details. Relationship remapping preserves the user-visible
project and stable molecular identity while keeping import repeatable.

Consequences:

- A selected export requires an explicit nonempty entry-ID set; visibility is
  resolved from durable project state.
- Filtering can produce an empty entry and then rejects the complete export
  without publication.
- Per-entry adapter warnings are never flattened into an unattributed batch
  message. Blocking loss in any entry requires acknowledgement for the batch.
- Archive export includes byte-identical originals and exact current normalized
  artifacts, including unsaved durable working state, but not undo/redo records.
- Archive import is all-or-nothing and creates a new active project rather than
  mutating an existing project.
- The web client exposes each long-running export/import as a typed operation
  handle. Cancellation first signals the server's operation endpoint and then
  aborts the local fetch or upload, while sequence guards prevent a late result
  from repopulating a closed dialog.
- Project archive import lives in the project chooser rather than the
  structure-import flow because it creates a fresh project and must be
  available when no project is active.
- Job summaries and result artifacts use reserved additive manifest fields that
  M9 will populate through the generic job model; no docking concepts enter M8.

## D-036 - Durable generic jobs with allowlisted spawned plugins

Status: accepted

Decision:

Define docking-neutral `JobDefinition`, `JobPlugin`, `JobContext`, `JobRunner`,
`JobResult`, input-artifact, and result-artifact contracts in `molweave_core`.
Discover installed `molweave.jobs` package entry points and explicitly
configured Python plugin targets only at process startup, then register only
plugin names present in the deployment allowlist. The demonstration plugin
lives in `packages/molweave_demo_plugin` and enters through this same registry;
it is not a special API or worker branch.

Persist jobs, immutable input snapshot references, result-artifact references,
and an ordered event ledger in SQLite. Submission records the validated
parameter object, implementation version, current immutable input artifacts,
entry roles, hashes, project revision, and plugin identity in one transaction.
Job submission and state events do not advance project edit history. Importing
a normalized result creates one ordinary reversible project command and links
the new entry to the source job, inputs, and result artifact.

Run one coordinating worker as a process separate from Uvicorn. It atomically
claims queued rows and launches each allowlisted plugin in a spawned child with
serialized controlled input handles, a private managed work directory,
validated parameters, progress/log/cancellation callbacks, wall-time and
output-size limits, and platform-supported resource limits. Only the worker
parent may publish returned bytes to the artifact store or update lifecycle
state. Request handlers load definition metadata for validation but never call
plugin execution code.

Cancellation sets a durable request flag. A cooperative child receives it
first; the worker terminates the child after a bounded grace period and records
a terminal cancelled event. Worker startup atomically converts abandoned
running rows to failed jobs with structured `worker_lost` errors. Automatic
retry is omitted. Job events are available by monotonic cursor through both a
WebSocket and a polling endpoint.

Portable archives include project job summaries and result artifacts needed by
entry provenance. Relational job IDs are remapped on archive import along with
entry links. Terminal jobs remain terminal historical records. A queued or
running source job is imported as failed with an explicit
`archive_incomplete_job` error because executable process state is not
portable or resumable.

Rationale:

Immutable artifact snapshots make execution reproducible without copying
mutable entry state into a second molecular model. A durable event ledger
supports reload, polling fallback, recovery, and inspectable stdout/stderr.
The spawned child boundary keeps plugin imports and failures away from both the
HTTP request path and the coordinating worker while retaining a small local
deployment with no broker. Explicit allowlisting and controlled byte/result
interfaces satisfy the future integration need without exposing arbitrary
commands or runtime code upload.

Consequences:

- Normal local startup gains a third documented worker command; API-only use
  can queue and inspect jobs but cannot execute them.
- The API and worker build registries independently from identical startup
  configuration, and registry mismatches produce structured claim failures.
- Input entries may later change or be deleted without changing a submitted
  job's artifact IDs, hashes, parameters, or provenance.
- Standard output, standard error, messages, progress, cancellation requests,
  state changes, results, and failures remain ordered durable events after
  browser or process restart.
- Plugins may be installed only by the deployment operator. Job parameters,
  filenames, roles, output media types, byte limits, and managed paths are
  validated even for allowlisted code.
- Core job models contain generic roles, structured values, scores, artifacts,
  and provenance only; receptor, ligand, pose, docking, and scoring semantics
  belong to a future plugin and its documentation.

Generated structure results are stored as normalized artifacts with
`source_format = null`. `source_format` describes an uploaded/exportable
molecular file vocabulary, while the normalized artifact media type describes
the internal generated representation. A pseudo format name would weaken the
closed file-format contract and break strict portable-archive validation.

## D-037 - Deterministic release qualification and evidence mapping

Status: accepted

Decision:

Qualify v0.1 with the existing domain and vertical-browser suites plus one
consolidated desktop definition-of-done journey. Add automated browser checks
for WCAG 2.2 AA detectable violations in both themes, keyboard reachability and
modal focus restoration, desktop and Pixel 7 bounds/overflow, and important
API/viewer failure states. Keep behavior that requires real WebGL under explicit
canvas-pixel assertions.

Profile a documented representative protein-ligand project in Chromium. Record
bounded shell/import/viewer readiness and selection-interaction timings, fail on
long main-thread tasks above the documented budget, and assert that camera,
selection, representation, and metadata interactions do not retransmit complete
normalized structures except when an affected entry genuinely requires a new
projection. Treat thresholds as regression budgets on the pinned test host, not
scientific throughput guarantees.

Maintain a requirement-evidence document keyed by every atomic ID in the plan.
Prefer automated unit, integration, component, or Playwright evidence; use a
documented manual check only for behavior that cannot be asserted reliably in
automation. Fixture provenance and expected scientific assertions are part of
that evidence, not informal test knowledge.

Rationale:

M10 must demonstrate that the assembled product works as one application and
is usable, responsive, and operable, without duplicating molecular authority or
loosening earlier scientific gates. Deterministic checks make regressions
actionable, while an explicit evidence map prevents broad product requirements
from being silently inferred from unrelated passing tests.

Consequences:

- Accessibility checks combine an automated rules engine with explicit keyboard
  and focus workflows because neither method covers the other completely.
- Performance tests use generous published budgets and request-shape assertions
  to detect architectural regressions without promising hardware-independent
  benchmark numbers.
- The full Playwright gate retains focused failure workflows in addition to the
  consolidated happy-path journey.
- Release documentation must distinguish measured test-fixture behavior from
  recommended production limits and known scientific limitations.

## D-038 - Atomic Mol* rebuilds for topology changes

Status: accepted

Decision:

Treat Mol* structures, components, representations, labels, selections, and
measurements as one disposable projection whenever normalized molecular
topology changes. Replace a changed topology by serializing a full viewer-tree
rebuild through the engine queue, while preserving the camera and restoring
selection and measurement overlays from application state. Serialize explicit
measurement updates through that same queue.

Rationale:

Mol* labels and measurements are state-tree children of structure nodes. A
partial structure-root replacement can race React effects that update overlays,
leaving a child operation addressed to a removed parent. A full rebuild is
atomic from the adapter's perspective, keeps normalized molecular state outside
Mol*, and is substantially easier to reason about for v0.1 topology edits.

Consequences:

- Topology edits may rebuild every visible Mol* projection, while coordinate-
  only edits continue to use coordinate patches.
- Camera, application selection, representation settings, labels, and
  measurements survive the rebuild because they are reapplied from authoritative
  application state.
- Incremental topology-tree surgery is deferred until profiling demonstrates a
  need and it can preserve parent/child ordering under concurrent UI effects.

## D-039 - Database-allocated per-job event sequences

Status: accepted

Decision:

Allocate each durable job event sequence with an atomic database increment that
returns the assigned value, after flushing the state change associated with the
event. Do not derive the next sequence by incrementing a previously loaded ORM
job object.

Rationale:

The API and worker are separate processes and can append cancellation and
progress events concurrently. Their ORM objects can contain the same prior
counter, causing duplicate `(job_id, sequence)` inserts. SQLite serializes the
atomic updates and assigns a distinct monotonic value to each transaction.

Consequences:

- Ordered polling and WebSocket cursors remain gap-free for successful event
  transactions under concurrent API/worker writes.
- Event and related job-state changes remain in the same transaction.
- A two-session barrier integration test protects the concurrency behavior;
  the database uniqueness constraint remains a final integrity guard.

## D-040 - One-command local process supervision

Status: accepted

Decision:

Expose `corepack pnpm dev` as the normal post-setup local startup command. A
dependency-free Node supervisor applies Alembic migrations and then launches
Uvicorn, the coordinating job worker, and Vite as distinct child processes with
the same data, plugin, and Python-path configuration. It waits for API and web
readiness, prefixes logs, and stops the complete child process groups when one
service fails or the developer interrupts the command.

Keep the existing manual commands documented as a troubleshooting path. Do not
install dependencies, open a browser, enable test routes, or enable Uvicorn
reload during normal startup. Permit explicit API and web port overrides while
retaining 8000 and 5173 as defaults.

Rationale:

Local use should require one memorable command without collapsing the worker
into the request process or weakening the tested deployment boundaries. Node
22 is already a required cross-platform runtime, and built-in process APIs avoid
adding a process-manager dependency solely for development orchestration.

Consequences:

- One-time frozen dependency installation remains explicit and separate from
  everyday startup.
- Migration failure, port conflicts, and unexpected child exits fail the whole
  supervised session instead of leaving a partially working application.
- Frontend hot reload remains available through Vite; Python changes require a
  deliberate restart of the supervised command.
- The API and worker remain independently runnable and continue to load plugin
  registries in separate processes.

## D-041 - Application-owned Mol* canvas appearance

Status: accepted

Decision:

Project the persisted local workspace theme into Mol* through the typed
`MolecularViewer` boundary as a transient background color. Apply the initial
color before Mol* renders its UI, retain it across lazy engine loading, and
update the existing Canvas3D renderer in place when the theme changes. Use the
same light and dark colors as the surrounding structure-viewer surface and keep
the WebGL background opaque.

Do not add the workspace theme or canvas background to project viewer settings,
named scenes, command history, archives, or Mol* snapshots. A theme change must
not reload structures, rebuild representations, reset the camera or selection,
or mark a project dirty.

Rationale:

The theme is already an application-owned persisted browser preference rather
than molecular project state. Explicitly projecting its color through the
viewer adapter removes the bright default Mol* canvas in dark mode while
preserving the existing renderer ownership boundary and opaque screenshot,
postprocessing, and pixel-test behavior.

Consequences:

- Both initially restored dark mode and live theme changes reach the Mol*
  renderer without a white first frame.
- Viewer implementations must accept background-color updates before and after
  mounting.
- Canvas appearance follows the local user preference independently of durable
  scientific and scene state.

## D-042 - Archive schema governs structural compatibility

Status: accepted

Decision:

Use `ProjectManifestV1.schema_version` as the archive structural compatibility
gate. Retain `application_version` as required, validated semantic-version
producer provenance, but do not require it to equal the importing MolWeave
release. Keep strict rejection for unknown archive schema versions and malformed
application-version values.

Rationale:

A patch release that does not change the manifest contract must be able to read
archives from the preceding patch release. Exact application-version matching
would incorrectly make compatible 0.1.0 archives unreadable in 0.1.1 and couple
data compatibility to release metadata instead of the explicitly versioned
schema.

Consequences:

- Valid 0.1.0 archives import under 0.1.1 without migration or data loss.
- New archives continue to record the producing application version.
- A future incompatible archive shape requires a new schema version and an
  explicit migration or rejection policy; changing only the application
  version cannot silently redefine the schema.

## D-043 - Application-owned focus targets and aggregate ligand focus

Status: accepted

Decision:

Derive context-sensitive camera focus targets from application-owned normalized
structures and display state, express every molecular target as canonical
`(structure_id, atom_id)` references, and pass those references through a
generic `MolecularViewer` focus operation. Mol* owns camera execution and the
rendered scene bounds used by Fit all visible, but it does not classify the
target or become the authority for molecular identity.

For issue #3, Focus visible ligands collects all confidently ligand-classified
atoms from loaded visible entries whose ligand component is enabled, excludes
hidden hydrogens and atoms outside active isolation, and focuses their union.
Unknown components, water, ions, polymers, failed loads, and unloaded entries
are excluded. The implementation must use
`NormalizedStructureV1.residues[].component_type`; it must not infer ligands
from residue names, size, ordering, proximity, connectivity guesses, or Mol*
static-component classifications.

Do not create an active-ligand or component-instance persistence model for this
aggregate camera action. Individual-ligand choice remains deferred until issue
#2 or issue #11 establishes stable component identity or durable ligand-of-
interest semantics. Focus, fit, picking mode, and ordinary camera navigation
remain transient and do not enter project state, scenes unless explicitly
saved afterward, command history, archives, or browser preferences.

Rationale:

The normalized model already provides stable atom IDs and validated residue
component classifications across standalone ligands and complexes. Reusing
that authority makes the action deterministic and independently testable while
keeping Mol* disposable. Framing every visible classified ligand gives useful,
unambiguous behavior without silently selecting one candidate or prematurely
committing to a durable component model that broader open issues must design.

Consequences:

- Viewer implementations accept application focus targets without acquiring
  ligand-specific logic.
- Multiple visible ligands are framed together in issue #3.
- Focus actions cannot modify selection, isolation, visibility,
  representations, molecular artifacts, project revision, or history.
- Component-classification limitations remain visible scientific limitations;
  the toolbar cannot repair them with hidden heuristics.
- A future component hierarchy or ligand-of-interest model can provide a more
  specific target through the same generic viewer boundary without changing
  the camera ownership contract.

## D-044 - Primary viewer activation is selection-only

Status: accepted

Decision:

Treat a primary activation in the molecular viewer as an application-owned
selection input, never an implicit camera-focus command. A structural hit is
translated immediately from Mol* loci to canonical MolWeave atom references
and applied using the active Atom, Residue, Chain, or Structure granularity and
replace/add/subtract mode. An unmodified empty hit clears a non-empty current
selection; an already-empty hit and an empty hit with an additive or
subtractive modifier are no-ops.

Configure Mol* camera-focus and representation-focus behavior so primary,
modified-primary, and primary-equivalent trigger activation cannot focus a
locus, reset the camera, or create internal representation-focus state. Retain
non-primary behavior and the existing camera trackball gestures. Continue to
use Mol* hit testing and click-versus-drag recognition rather than adding a
second application gesture detector.

Camera framing remains explicit through the generic application-owned
`focusAtoms` and `fitVisible` viewer operations established by D-043. Current
selection and ordinary camera movement remain transient and do not enter
project state, scenes unless explicitly saved afterward, command history,
archives, or browser preferences.

Rationale:

MolWeave's selection listener and Mol*'s default camera and representation
focus behaviors currently consume the same click independently. A hit can
therefore select and focus, while an empty click can clear selection and reset
the camera. Separating these actions preserves carefully composed inspection
views and gives explicit toolbar focus controls one predictable responsibility.
Reusing Mol* gesture recognition avoids divergent movement thresholds and
keeps the viewer boundary small.

Consequences:

- Primary structural picks and empty-space clearing cannot move, zoom, orient,
  fit, or retarget the camera.
- Repeated and modified selections retain their existing canonical selection
  semantics without camera drift.
- Camera drag, wheel, pinch, non-primary interaction, and explicit focus paths
  remain independent from selection clicks.
- Viewer implementations must expose picked application references without
  acquiring authoritative molecular or selection state.
- A future interactive coordinate-movement mode must explicitly supersede
  gesture ownership while active; it cannot rely on implicit selection focus.
- Molecule or component picking requires the stable identity model owned by
  issue #2 and is not inferred by this decision.

## D-045 - Derived application-owned component hierarchy

Status: accepted

Decision:

Derive `ComponentHierarchyV1` deterministically from the current authoritative
`NormalizedStructureV1` artifact. Preserve optional source entity, subchain,
entity-type, and polymer-type facts during macromolecular normalization, then
classify individual protein, DNA, RNA, other-polymer, putative-ligand, water,
other-solvent/additive, ion/metal, other-heterogen, and unclassified components.
Prefer explicit source entity/polymer facts, use documented residue/element and
legacy-normalized fallbacks, and expose qualitative source/fallback/ambiguous
provenance plus warnings. Every atom belongs to exactly one individual
component; unresolved material remains visible as unclassified.

Give components entry-local opaque deterministic IDs anchored to stable
normalized source/entity/subchain/chain/residue identity. Do not derive identity
from a display label, coordinate, array position, molecular size, proximity,
recent selection, or Mol* object. Source instance boundaries take precedence
over connectivity so a covalently connected ligand remains selectable and
incomplete PDB/PDBx bonds do not invent false components. One source residue is
not split solely because recorded connectivity appears disconnected.

Expose the hierarchy through the lazy structure response and project it into
the per-entry UI. Category and individual selections materialize through the
existing canonical `(structure_id, atom_id)` selection representation. Reuse
existing selection granularities rather than extending the persisted selection
enum. Application-owned memberships drive mapped component visibility and
ligand focus; Mol* remains a disposable renderer.

Do not persist a second hierarchy snapshot in SQLite, checkpoints, scenes,
browser preferences, or archives. Recompute it after topology changes and
require exact identity/membership stability after coordinate-only changes.
Durable user labels and reclassification overrides, selection-specific styling,
ligand-of-interest designation, and atom/component subset export require
separate product contracts.

Rationale:

The normalized model already owns stable molecular identity and is available
through a lazy artifact-keyed API. A derived hierarchy prevents drift between
project, viewer, and chemistry state while allowing old artifacts to use a
conservative fallback. Source metadata is scientifically stronger than viewer
classification or proximity/size guesses, but it still cannot establish every
biological role; explicit provenance and unclassified material prevent false
certainty. Canonical atom materialization lets every current tool consume the
same selection without a second component-selection state model.

Consequences:

- Optional additive normalized source facts retain
  `NormalizedStructureV1.schema_version: 1`; legacy artifacts remain valid.
- The lazy structure API gains an additive typed hierarchy field while
  `/api/v1`, `ProjectStateV1`, `ProjectManifestV1`, and Alembic head `0007`
  remain unchanged.
- Component identity is reproducible across reopen and archive import and is
  independent from Mol* lifecycle.
- Coordinate edits cannot change component identity or membership; topology
  edits regenerate current membership from stable normalized identities.
- Putative ligand classification is not a ligand-of-interest or binding-role
  claim, and ambiguous classifications remain visible and warned.
- Individual component styling/visibility remains with issue #7; durable
  correction and subset export require focused follow-up decisions.

## D-046 - Durable selection-representation replacement channels

Status: accepted

Decision:

Persist selection-specific molecular representations inside each entry's
`ViewerSettingsV1` as canonical records containing one supported style and a
sorted, unique, non-empty list of stable atom IDs. Derive an atomic channel
(`line`, `stick`, `thick-stick`, `ball-and-stick`, `space-filling`) and a
polymer channel (`backbone`, `cartoon`) from the style rather than storing a
second channel field. Within each channel, atom memberships are disjoint and
same-style records merge. Applying a style subtracts the exact target from
other styles in that channel before merging it into the requested style;
reset subtracts the exact target from both channels. One revisioned project
command covers all selected entries and records complete before/after settings
for undo and redo.

Accept any current non-empty canonical atom selection for atomic styles.
Accept polymer styles only for exact complete residues classified from the
current normalized artifact as protein, DNA, or RNA and containing a usable
trace atom. Persist exact atom membership rather than residues, derived
components, Mol* loci, or display identities. Coordinate changes preserve
membership; topology deletions prune live entry and named-scene assignments,
remove empty records, and retain exact inverse state for undo. New atoms do not
inherit styles. Existing entry-level viewer-setting mutations must round-trip
the assignments unchanged and cannot bypass the dedicated command.

The renderer projects these application-owned targets into disposable exact
Mol* components. Atomic bonds may be shown only when both endpoints are in the
target. Atomic and polymer channels may coexist; entry-level surface, color,
opacity, labels, component visibility, camera, isolation, and transient current
selection remain independent.

Rationale:

Exact stable atom targets give styling the same durable identity and command
semantics as the rest of MolWeave without duplicating the derived hierarchy or
making Mol* authoritative. Two bounded replacement channels deliver the common
cartoon-plus-atomic-detail workflow while avoiding unbounded layer ordering and
editing semantics. Complete-residue polymer validation prevents a partial or
unsupported target from being silently expanded into scientifically misleading
geometry.

Consequences:

- Viewer settings, checkpoints, named scenes, history, and archives preserve
  exact assignments; legacy state receives an empty additive default through
  Alembic revision `0008` and model defaults.
- Downgrading through `0008` is refused while any live, checkpoint, or scene
  assignment is non-empty, preventing silent data loss.
- `/api/v1`, project state schema 1, archive manifest schema 1, and normalized
  structure schema 1 remain unchanged.
- Selection-specific colors, opacity, labels, surfaces, presets, same-channel
  layering, context-menu duplication, and a Ribbon alias remain outside this
  decision.

## D-047 - Additive polar-only hydrogen visibility

Status: accepted

Decision:

Persist hydrogen display as two additive booleans in each entry's existing
viewer settings: `components.hydrogens` remains the master visibility switch
and `components.nonpolar_hydrogens` defaults to `true`. The effective modes are
none when the master switch is false, polar-only when the master is true and
the additive switch is false, and all hydrogens when both are true. Named
scenes, project checkpoints, undo and redo, and archives preserve the same
settings without introducing a new molecular-state object or API version.

Project the effective mode into Mol* representation parameters. In polar-only
mode use Mol*'s native non-polar-hydrogen classifier, which treats hydrogens
bonded to nitrogen, oxygen, sulfur, fluorine, chlorine, bromine, or iodine as
polar. Apply the projection consistently to entry and exact-selection atomic
representations, including surfaces; cartoon and backbone remain unchanged.
Ligand focus excludes all hydrogen atoms in polar-only mode so the camera target
is stable even though the remaining polar hydrogens are rendered. Atom labels
remain an independent explicit visibility setting.

Alembic revision `0009` adds the default to live entry settings, saved project
checkpoints, and named-scene snapshots. Missing fields in legacy API or archive
payloads validate as `true`. Downgrade removes the additive default only when no
stored location has `nonpolar_hydrogens: false`; otherwise it refuses rather
than silently changing a saved polar-only view.

Rationale:

An additive presentation setting preserves prior all-hydrogen behavior and the
existing master switch while delivering the scientifically common polar-only
view without mutating normalized structures or inventing bonds. Reusing the
renderer classifier avoids a second application-side chemistry heuristic and
keeps molecular state independent from Mol* lifecycle. The explicit precedence
also prevents contradictory controls from producing ambiguous persisted state.

Consequences:

- `/api/v1`, `ProjectStateV1`, `ProjectManifestV1`, and
  `NormalizedStructureV1` retain schema major 1; the change is additive.
- Projects and archives from earlier MolWeave versions open with all hydrogens
  shown when hydrogen visibility was enabled.
- Polar classification depends on the normalized bond graph projected to Mol*;
  missing or incorrect source bonds can affect which hydrogens remain visible,
  and MolWeave must surface existing parsing or bond warnings rather than infer
  chemistry for this display feature.
- Per-element hydrogen filters, hydrogen addition, protonation, bond inference,
  ligand-specific policy, rendering presets, and automatic performance changes
  remain outside this decision.

## D-048 - Neistra presentation with stable MolWeave technical contracts

Status: accepted for the user-approved Neistra rebranding implementation.

Decision:

Rename the visible product and frontend/repository presentation to Neistra.
Keep all backend code, metadata, version constants, Python packages, API and
archive contracts, environment variables, data directories, job/plugin IDs,
scientific defaults and the `molweave-workspace-v1` preference key unchanged.
Do not rewrite server diagnostics, user names, uploaded files or historical
evidence to conceal compatibility identifiers. Retain all five application
version values: the user's no-backend-change requirement explicitly overrides
the normal coordinated release-version update for this work. Release/version
policy and external repository cutover remain separate, unexecuted work.

Use the supplied guide's Sparked N with its spark above the right stroke;
exclude the conflicting spark-over-i variant. Build flat, path-only production
assets from that construction and an outlined geometric wordmark. Adapt neutral
strokes for dark backgrounds, retain Ember/Spark, and use a true monochrome
variant when color is unavailable. Standalone marks retain N-height clear
space. Toolbar/favicon assets use the compact application treatment illustrated
in the guide, with explicit padding and minimum sizes documented in BRANDING.
Use system sans-serif UI text and a system serif for editorial welcome text;
the supplied guide specifies categories and contains no licensed font master.

Rationale:

Visible identity can change without data migration or backend API changes.
Keeping technical names preserves existing installations, archives, plugins
and preferences. Explicit asset geometry, spacing and type choices resolve the
guide's differing examples without inventing new scientific capabilities or
introducing network/font dependencies.

Consequences:

- Neistra Archive remains the existing `.molweave.zip` format.
- Legacy identifiers remain visible when they express real provenance or an
  executable integration contract; the frontend only rewords its own copy.
- The rebrand is a compatible presentation change, not a schema/API release.
- The user forbids committing `.rebranding/`; tracked product documentation
  records the implementation evidence and permanent brand rules separately.

## D-049 - One Neistra presentation theme across startup, CSS and WebGL

Status: accepted

Decision:

Own the Neistra primitives and derived semantic colors in a typed frontend
module. Generate initial CSS and legacy-preference restoration into the HTML
head from that same module at dev/build time. Consume the identical opaque
viewer-background values through the existing buffered `setBackgroundColor`
boundary from D-041. Do not store theme appearance in molecular settings,
projects, scenes, history or archive data.

Keep the existing preference key and persisted shape, validate restored values,
and tolerate unavailable/quota-limited storage for session-only operation.
Use system fonts and accessible semantic derivatives of the guide palette.
Scope vendor DOM color/focus overrides to the Mol* host and label its existing
CSS-only attribution link, without modifying the library or molecular palettes.

Rationale:

One source prevents HTML, browser chrome, CSS and WebGL from drifting and avoids
a light startup frame for existing dark-theme users. Optional preferences must
not prevent scientific work. Semantic roles preserve readable warnings, errors,
focus and selection instead of assigning brand orange to every state.

Consequences:

- Theme toggles remain presentation-only, preserving camera, selection,
  isolation, artifacts, revision/history and normalized-structure request counts.
- Preference validation does not migrate or duplicate stored state.
- The Vite HTML transform participates in both development and production;
  first-paint and compiled-asset checks must cover both delivery paths.
- Exact palette assertions coexist with scientific output checks; intentional
  background changes do not authorize weakening molecule/viewer assertions.

## D-050 - Current Neistra presentation with preserved repository history

Status: accepted

Decision:

Rename only the private JavaScript package identities, current product prose
and human-facing supervisor messages. Preserve executable commands, backend
identifiers, version values, prior plans/decisions/releases and their existing
URLs. Explain the transition in current documentation and inventory all
remaining old-name matches instead of replacing repository-wide text.

Use real application screenshots and clear-space variants of the canonical
vector master for repository presentation. Strip generated raster metadata
to keep the existing pixels and make repeat generation byte-identical.

Rationale:

The current product can be coherent without falsifying provenance, breaking
existing installations or implying that an external rename/release occurred.
Real screenshots avoid presenting guide mockups as implemented capabilities.

Consequences:

- Frozen JavaScript installation needs no lockfile or dependency update.
- Supervisor configuration, startup/readiness and shutdown behavior are
  unchanged; an integration assertion covers the renamed diagnostic prefix.
- The external cutover checklist remains local and unexecuted, and the
  no-backend/version exception in D-048 remains binding.

## D-051 - Seed-preserving distance expansion in selection styling

Status: accepted for issue #29

Extend D-018/019 with an explicit expansion operation in Style selection. Search
all current project entries, including intentionally loaded hidden entries, in
active-conformer Cartesian coordinates with an inclusive positive finite cutoff.
Default to 4 Å and matching atoms. Complete-residue mode includes every atom of
each matched residue, preserves matching orphan atoms, and always retains the
canonical seed. Keep the inspector's existing general query semantics unchanged.

Reuse the existing spatial Web Worker and artifact cache. Abort terminates the
worker; cancellation during shared loading rejects the operation without cancelling
other consumers' cache fetches. Before application, check the active project,
seed identity, and current entry/artifact identities. Dialog context changes and
closure cancel pending work. Refresh polymer eligibility after selection changes
and ignore superseded eligibility responses.

Rationale: expansion is a deliberate shared-selection change, not a representation
edit or a spatial inference. Seed retention and explicit orphan behavior prevent
residue completion from unexpectedly dropping a ligand or ion. Context guards
prevent asynchronous results from overwriting later scientific or selection state.

No project command, revision, molecular artifact, visibility, or camera change
occurs. Coordinates across entries must already share a meaningful frame; there
is no alignment, periodic geometry, contact classification, or binding-site claim.

## D-052 - Independent durable selection appearance properties

Status: accepted for issue #29

Extend D-046 with `ViewerSettings.selection_colors`: canonical, disjoint stable
atom-ID memberships grouped by lowercase six-digit color. Color replacements
subtract only their selected atoms from other colors. They neither replace nor
reset atomic/polymer representation assignments. The new revisioned
`selection-appearance` command changes one property across all selected entries
atomically, recording exact settings for history. Entry-setting requests preserve
omitted appearance fields and reject attempts to bypass this dedicated action.

Render colors as one disposable Mol* overpaint transform per representation,
intersected with that layer's atom membership. This includes inherited surfaces
without introducing a subset-surface representation or splitting polymer geometry.
Color boundaries on continuous geometry follow atom-associated primitives.

Alembic 0010 adds defaults to live entries, checkpoint entries and scenes, named
scenes, and documented forward/inverse command action paths. Do not traverse user
metadata. Validate all retained locations before downgrade and refuse any loss of
non-default appearance, including history that could restore an override. This
strengthens downgrade safety beyond the earlier viewer migrations without changing
them. Legacy archives default absent fields; archive readers validate target IDs.
Topology deletion prunes live and scene assignments in the same reversible edit.

Rationale: independent property memberships avoid multiplying representation styles
or silently changing unrelated state. Complete retained-history migration prevents
undo from restoring a structurally stale snapshot or creating a false dirty state.
The additive contract retains API/project/archive/normalized schema major 1 and
immutable scientific artifacts; it promises backward reading, not older-reader
support for new appearance state. Hydrogen-specific precedence extends this
property model in the following checkpoint.

## D-053 - Exact selected-hydrogen preferences and complete-projection classification

Status: accepted for issue #29

Extend D-047 and D-052 with independent `selection_nonpolar_hydrogens` assignments,
grouped by strict boolean `show`, with disjoint canonical atom IDs. The command
reads authoritative normalized elements to target only explicit selected H atoms;
heavy-atom selection never implicitly targets attached H. Reject an action with
no hydrogen targets. Retain preferences for polar H without claiming a visual
change: polarity is determined only in the disposable viewer.

When local preferences exist, classify nonpolar H once on the complete Mol*
structure, using its pinned native connectivity classifier before any selection,
component, or isolation subsets. Apply local preference over the entry nonpolar
setting, with the master hydrogen/component/isolation visibility as upper bounds.
Pass the resulting mask to all representation layers and prevent parent-geometry
expansion or reclassification on filtered subsets. Polar H remains unaffected.
Without local preferences retain the established native representation path.

Do not duplicate chemistry classification in the backend or generate hydrogen
atoms. The established N/O/S/F/Cl/Br/I polar-neighbor convention and connectivity
limitations remain. Ligand focus conservatively uses heavy atoms when any local
hydrogen preference exists, extending D-047's stable focus rule without a second
classifier. Selection, stored coordinates, bonds, originals and warnings remain
unchanged. Extend unreleased migration 0010 and its retained-state downgrade guard
to both independent properties; intermediate checkpoint schemas are not releases.

During qualification, an existing isolation→appearance→scene workflow exposed a
transient Mol* radius-zero camera during disposable scene clearing. Retain the
last valid application camera while rebuilding (including superseded rebuilds),
and do not publish this renderer reset to scene persistence. This enforces the
existing camera-invariance contract rather than changing scene schemas or
accepting invalid saved cameras.

## D-054 - Carbon-only selection coloring with explicit element overrides

Status: accepted by user amendment to issue #29, 2026-09-11

Extend D-052 with an optional carbon-only color application mode. Resolve selected
carbon atoms from authoritative normalized elements in the existing atomic command;
store the chosen hex color on those IDs and `color: "element"` on the remaining
selected IDs. Retain disjoint memberships and independent property resets.
The viewer resolves element records using the pinned Mol* palette and its default
saturation/lightness, intersected with each representation's visible membership.
There is no backend palette, molecular mutation, new geometry, or dynamic selection.

Rationale: merely filtering the custom-color target to carbon would leave previous
solid colors or non-element entry themes on selected heteroatoms, contrary to the
user's requested element colors. Explicit element assignments make that outcome
durable across entry themes, history, scenes and archives without new collections.
No-carbon selections restore element colors. Reset returns to the underlying entry
theme. Assignments attach to current stable IDs; subsequent chemistry edits do not
rerun the carbon selection, and added atoms inherit existing entry defaults.

The API adds optional `color_mode` only to color-set requests; omission means all.
Existing hex records are unchanged. Migration 0010 already defaults the collection
and rejects any retained nonempty appearance on downgrade, including element records.
No new migration is necessary. The unreleased additive minor remains 0.6.0; schema
major 1 and backward archive reading remain, without older-reader compatibility
for newly added appearance values. This explicit amendment supersedes the earlier
single-solid-mode scope; other deferred color schemes remain outside scope.

## D-055 - Non-modal selection styling with transient palette state

Status: accepted for issue #34, 2026-09-11

Selection styling is a workspace tool, implemented as a dedicated non-modal dialog
rather than changing the shared Modal used for blocking workflows. Outside picking,
selection and camera actions remain available. Escape closes only when focus belongs
to the palette; move focus to its container before disabling the activated control.
Close on project changes. Keep draft coloring mode and custom color only for the
open palette lifetime, without adding viewer-owned molecular state or persistence.
Existing application command closures capture the project and selection at activation;
context-bound feedback must not describe a subsequent selection. This is a usability
patch retaining D-051–D-054, API/schema major 1 and migration head 0010.

## D-056 - Selected-fragment surface interpretation

Status: accepted for issue #30, 2026-09-11; not yet implemented

The approved [issue #30 plan](plans/issue-30-selection-surfaces.md) adds a surface
computed only from assigned atoms, independently per entry and across internal
rendering units. The fixed `molecular-v1` profile uses a 1.4 Å probe, 0.5 Å grid,
36 probe positions, pinned Mol* physical radii, no parent context or cavity flood
filling, and opacity 0.45. Effective membership intersects existing visibility,
isolation and full-projection hydrogen preferences. Existing colors apply through
atom-associated coloring; existing entry surfaces and representation channels
remain independent.

Rationale: a bounded fragment view delivers useful selection styling without
implicitly promising a context-derived molecular surface patch. Cut residues and
covalent boundaries may expose artificial faces. Do not infer residue completion,
caps, repair, alignment, periodic geometry, alternate-location resolution or
occupancy weighting. Preserve source warnings; this is not a solvent-accessible
area measurement or pocket analysis. Context-aware patches require separate work.

This extends the earlier surface deferral in D-046/052 without rewriting their
historical scope. The feature plan records qualification gates and non-goals.

## D-057 - One durable surface membership per entry

Status: accepted for issue #30, 2026-09-11; not yet implemented

Extend ViewerSettings with nullable `selection_surface`, containing the fixed
profile identifier and canonical stable atom IDs. Add/Remove union or subtract
captured IDs through one revisioned multi-entry command. No-op actions create no
history. Other appearance properties and atomic/polymer resets stay independent.
Ordinary current-selection changes do not retarget membership. Deletions prune
live/scene memberships reversibly; additions infer no membership. Scenes,
checkpoints, duplication and archive remapping preserve the application record,
not generated meshes or Mol* snapshots.

Rationale: a single bounded membership avoids a generic layer manager while
retaining established command, history and application-authority guarantees.
Existing entry-settings updates preserve omitted values and cannot bypass the
dedicated action. Migration 0011 (subject to availability) defaults every documented
live/checkpoint/scene/forward/inverse settings path to null without traversing
user metadata. Validate all retained locations before downgrade and refuse any
non-null state, including history. Removing visible membership alone does not
make downgrade safe; document pre-upgrade backup restoration.

Retain API/project/archive/normalized major 1 with backward reading of absent
fields. Older readers are not guaranteed to preserve new surface state. Original
uploads and normalized scientific artifacts remain unchanged. The additive user
feature targets application v0.7.0, subject to release collision checks.

## D-058 - Bounded cancellable selection-surface computation

Status: accepted for issue #30, 2026-09-11; not yet implemented

Reuse pinned Mol* field and mesh routines inside a dedicated browser worker with
a small viewer adapter; do not fork the scientific algorithm or add backend jobs.
Prove identity, coloring, picking, normals, cancellation and disposal before
building persistence/UI. Generation counters alone do not stop computation:
terminate obsolete/cancelled workers and reject stale results.

The approved plan fixes initial atom/grid/mesh/concurrency/deadline and host
qualification gates. Check admission before allocation and account for working
buffers, not only finished meshes. Failure to establish reliable bounds blocks
progress pending an approved amendment. Browser/GPU process memory is not claimed
to have a hard per-worker cap. Retain intent with explained line fallback for
oversize/failure, including the existing 250,000-atom parent degradation policy.

Rationale: responsiveness and truthful state require separating durable membership
from transient rendering success. Status, Cancel and Retry are transient; Cancel
does not undo settings. Closing the palette does not cancel a saved request.
Project switches, disposal and superseding geometry terminate obsolete work.
Coordinates/membership/visibility/isolation invalidate geometry; colors reuse
valid meshes and ordinary camera/selection changes do not regenerate them.
Hide obsolete surfaces during coordinate previews and regenerate or restore at
commit/cancellation. Never publish stale geometry as current scientific state.


## D-059 - Native surface mesh groups and transparent picking compatibility

Status: accepted implementation decision for issue #30, 2026-09-11

Use pinned Mol* field/marching-cubes routines, and its no-subdivision uniform
triangle group operation for cross-WebGL atom-associated picking/coloring.
Surface input groups follow the full component's serial element iterator across
units. A WeakMap binds disposable structures to generated meshes; a native complex
mesh visual retains structural loci. Count intersected cells before extraction
and bound native edge/triangle/chunk allocations; no scientific algorithm fork.

C1 real picking revealed Mol*'s default minimum pick opacity is 0.5, above the
approved surface opacity 0.45. Selection-surface integration must permit picking
at 0.45 while preserving inherited representation eligibility: explicitly retain
inherited layers' original 0.5 opacity threshold when lowering the renderer
threshold, and restore its default when the selection surface is absent. C1
qualifies this in an isolated surface-only harness; C3 must implement and verify
mixed-layer compatibility. Do not change the approved scientific opacity or make
other transparent layers newly pickable as a side effect.

## D-060 - Application-owned camera resets across asynchronous scene updates

Status: accepted implementation decision for issue #30, 2026-09-11

C4 exposed an intermittent surface-only rebuild failure: Mol* automatically reset
an empty scene's maximum radius, clamping the application camera radius to 0.01
before the asynchronous mesh arrived. Preserving position alone was insufficient;
the resulting clipping removed surface color evidence.

The adapter uses Mol*'s manual-reset mode, explicitly commits scene geometry before
restoring the application camera, and supplies a maximum radius that cannot clamp
the retained radius. An initial populated scene still fits explicitly; user Fit,
Focus, orbit, zoom and saved cameras remain available. An empty/disposable scene
must not publish a new camera. Coordinate and measurement updates synchronize the
scene bounds while retaining the current camera. This enforces existing camera
ownership, rather than changing the scientific surface profile or relaxing tests.

Viewer components are keyed by project ID so switching to a cached project also
disposes its previous worker/geometry/isolation state and establishes a fresh
initial view. This avoids carrying renderer state between projects.

## D-061 - Coordinate snapshots survive disposable viewer rebuilds

Status: accepted implementation decision for issue #30, 2026-09-12

A committed coordinate patch also updates the adapter's disposable normalized
input by cloning it; isolation and visibility rebuilds must not recreate the old
pose. Application query objects and original molecular files remain untouched.
Transient preview coordinates are retained separately across style rebuilds and
keep surfaces hidden until commit or cancel; clearing a preview restores the
committed coordinates. These caches are renderer projections, not molecular
authority, and are disposed with the viewer.

The production regression test exposed a 5 Å surface displacement after isolation
with the old cache. It now checks committed geometry, immutable source input,
preview preservation during rebuild, cancellation and exact geometry restoration.
No persisted schema, API or scientific profile changes are required.

## D-062 - Idempotent measurement projection updates

Status: accepted implementation decision for issue #30, 2026-09-12

Ignore unchanged measurement payloads in the viewer adapter. React query result
arrays can change identity during camera notifications without any measurement
change. Rebuilding native measurements then restoring the camera caused a feedback
loop during the complete measurement workflow. Compare the small serializable
payload before enqueueing rendering; real label/reference/visibility changes still
rebuild, while coordinate and structure changes explicitly refresh measurements
through their existing paths. Molecular and measurement authority remain outside
the viewer. Production tests verify stable native references for repeated inputs
and replacement/removal for changed inputs.

## D-063 - Durable atom-detail hiding preserves independent representations

Status: approved plan on 2026-09-14; not implemented

Under the [issue #38 plan](plans/issue-38-selection-visibility-capacity.md), add an
exact per-entry `selection_hidden_atoms` membership with revisioned multi-entry
hide/show commands. Apply the mask only to atomic layers and their atom labels,
including suppression of bonds incident to hidden atoms. Do not subtract from
shared polymer or surface inputs: hiding any selected residue atoms must preserve
ribbon/cartoon and surfaces. Molecular data and original uploads remain unchanged.

Retain prior atomic style assignments so Show restores them. Applying an atomic
style reveals its captured target in the same command; polymer styling leaves the
mask unchanged. Representation Reset clears the target's representation overrides
and hide mask, while colors, H preferences and surfaces remain independent.
Entry/component/isolation/H visibility bounds still apply after Show. Hidden atoms
remain selectable through application selections; Visible export remains entry-based.

Rationale: a sixth Hide/Show tile within Atom detail provides quick reversible
control without another permanent row or a new global visibility model. Reuse
history/scenes/checkpoints/archive paths and reversible topology pruning. A
provisional migration 0012 adds empty defaults throughout retained state and
refuses downgrade if any nonempty hide mask remains, before writing anything.

## D-064 - Substantially increased surface capacity with staged accounting

Status: approved plan on 2026-09-14; not implemented or empirically qualified

Issue #38 supersedes the initial resource policy in D-058 while preserving its
scientific and cancellation principles. Target 100,000 effective atoms, 64 million
grid cells, 512 MiB mesh allocation per surface, 1 GiB retained meshes per viewer,
2 GiB accounted active calculation buffers and a 120-second deadline, with one
worker at a time. Keep the existing 250,000-atom parent degradation policy.

Replace the overly conservative per-intersected-cell bound with staged accounting
of actual edge/triangle requirements, native group duplication, chunk/compaction
and transfer/retention buffers. Check allocations before each stage. Preallocate
typed inputs and use explicit geometry dependency keys instead of large typed-array
JSON serialization. Preserve hard worker termination and truthful fallback/retry.

Rationale: increasing only the 64 MiB constant would leave other false rejections
and unsafe working allocations unresolved. Qualification must render real larger
proteins and a labelled deterministic 100,000-atom stress fixture, preserving
molecular-v1 radii/probe/grid/opacity, cancellation and UI responsiveness gates.
This is not an arbitrary-hardware or browser/GPU heap guarantee. Do not silently
reduce resolution, weaken tests or claim an approved budget has been measured.
The complete first release targets v0.8.0 and must not wait for pocket work.

## D-065 - Pocket views crop complete protein-context molecular surfaces

Status: approved plan on 2026-09-14; not implemented

The [issue #36 plan](plans/issue-36-pocket-surfaces.md) resolves the context-patch
follow-up from D-056. Define pocket-v1 separately from molecular-v1 fragments:
compute the chosen entry's complete current protein surface, including supplied
protein H atoms, excluding separately classified nonprotein context, then keep
triangles whose centroids are within the radius of a captured seed atom center.
Radius defaults to 5 Å, accepts 2–12 Å in 0.5 Å steps, and uses the current shared
Cartesian project frame without automatic alignment or periodic/symmetry context.

Use pinned native molecular-surface parameters (probe 1.4 Å, grid 0.5 Å, 36 probe
positions, physical radii, opacity 0.45). Preserve retained vertex coordinates,
normals, winding and receptor atom-owner groups; do not cap cut edges or recompute
nearby residues as a fragment. Open triangle boundaries and disconnected patches
are valid. No nearby triangles is an explained empty result.

Atomic hiding and H detail toggles do not reshape this full-protein context.
Entry/protein hiding hides the view; isolation filters displayed triangles by
receptor ownership without truncating calculation context. Hidden seeds still
supply coordinates. This extends pocket behavior without changing fragment rules.

Rationale: a selection-centered patch answers the user's inspection need while
avoiding fragment cut-face artifacts. It is not automatic pocket discovery,
solvent/cavity measurement or evidence of binding. Custom receptor context,
multiple managed pockets, chemistry repair and analysis remain outside this slice.

## D-066 - One saved pocket per receptor with explicit cross-entry dependencies

Status: approved plan on 2026-09-14; not implemented

Persist a nullable pocket-v1 definition on the receptor's viewer settings, with
canonical captured seed atom references and radius. One view per receptor plus
saved scenes provides alternatives without a layer manager. The Surface row's
existing help footprint becomes an overflow menu for Pocket and About surfaces;
receptor/radius/seed controls appear only in the pocket popover. Selection changes
never silently replace saved seeds; Use selection explicitly updates the draft.

Resolve receptor and seed projections in the application, including hidden seed
entries. Keep two explicit runtime channels, Fragment and Pocket, sharing one
worker and combined release-1 allocation budgets. Compute/crop in the worker and
retain only the compact patch. Coordinate/topology changes to either dependency
invalidate the view; previews hide obsolete output. Colors/camera/current selection
do not regenerate it. Preserve D-060–062 ownership and lifecycle safeguards.

Revisioned commands, scenes/checkpoints/history, duplication, topology pruning and
archive validation/remapping must cover cross-entry seed references at every
retained path. Prune deleted seeds reversibly and clear definitions when all seeds
are gone. Receptor copies remap self-seeds; other same-project references remain.
A provisional migration 0013 adds null defaults and refuses downgrade with any
retained non-null pocket before writes. Do not silently lose historical intent.

Rationale: entry settings remain authoritative while renderer state is disposable;
existing per-entry-only appearance validation is insufficient for cross-entry seeds.
This separately approved v0.9.0 release follows verified v0.8.0. Implementation is
not authorized by the user's plan-persistence instruction; wait for their start.


## D-067 - Staged native allocation and immutable surface dependency revisions

Status: implemented and qualified in issue #38 C1, 2026-09-14

D-064 uses the pinned native marching-cubes corner table and counts unique crossing
grid edges before extraction. Count all crossings even if native id-field filtering
later omits them. Bound native chunk rounding, simultaneous compact copies and two
edge-cache slices. Before native no-subdivision grouping, count mixed-owner
triangles (three additional vertices each); include raw arrays, retained original
index metadata, grouping chunks, compaction, transfer copies and atom-ID mapping.
The 2 GiB active-buffer check is separate from the 1 GiB retained output budget.
Field accounting includes both fields, an upper bound for native lookup cells,
lookup scratch, grid axes, atom input copies and neighbor buffers. This accounts
application/native calculation buffers, not JavaScript object overhead, browser
heap capacity or GPU allocation. Measure process RSS separately.

Inside each viewer, immutable normalized snapshots receive monotonically assigned
revisions through a WeakMap. Coordinate commits and topology replacements supply
new snapshots; previews continue to suspend obsolete geometry. An exact effective
atom-ID key covers membership and visibility/H/isolation, together with revision
and profile. Coordinates are never JSON-serialized for cache identity. Input
extraction is lazy, after the cache check; colors/camera/current selection cannot
force input allocation or worker recomputation. Weak keys do not retain old
molecular snapshots. Existing application ownership and native group ordering stay
unchanged, with production coordinate/cancel/cache regressions as release gates.

## D-068 - Explicit surface channels retain compact pocket output

Status: implemented and qualified in issue #36 C1, 2026-09-15

Fragment and Pocket requests use explicit entry/channel identity and one shared
worker queue. Cancellation, retry, stale-result guards, component bindings and
status messages distinguish channels. Reject channel/profile mismatches. Empty
pockets are a distinct explained terminal result; errors/cancellation retain the
definition without relabelling a fragment or full-receptor line representation as
a pocket fallback. Ordinary fragment fallback remains unchanged.

After native full-protein extraction/grouping, use a radius-cell seed index and
an inclusive triangle-centroid test. Compact only retained vertices/indices while
preserving positions, normals, winding and receptor serial groups. Retain the full
receptor atom-ID mapping for native color/picking, but not the full source mesh.
Account source/compact coexistence, seed copies/index, triangle marks and vertex
remapping under the active budget before crop allocation. Reserve an additional
pocket index buffer under the combined retained budget for display isolation;
isolation reuses cached vertices/normals/context and never recalculates fragments.
Seed-buffer admission precedes allocation, avoiding an intermediate flat JS copy.
These are accounted-buffer limits, not guarantees about browser/GPU heaps.

Rationale: this implements D-065/066 using native scientific geometry and existing
application ownership, with two explicit channels rather than a generic layer
manager. The dev-only harness qualifies this renderer checkpoint before durable
commands or the Pocket UI are introduced.

## D-069 — Pocket persistence preserves the portable snapshot boundary

Status: accepted and implemented for issue #36 C2.

The approved pocket plan requires all retained seed references to survive, remap
and validate correctly. Its reference to archive history is interpreted through
the existing higher-authority D-035 architecture: archives export current entries
and scenes, not command history or prior checkpoint contents. Remap and validate
every exported pocket definition, then derive the imported checkpoint from that
remapped current state. Do not add portable historical commands or validate a
historical atom against unrelated current geometry.

Database history remains reversible and migration 0013 covers every documented
live/checkpoint/scene/forward/inverse viewer-settings path, with atomic downgrade
refusal on any non-null pocket. Topology/entry deletion prunes all affected live
owners and scenes in its original command; inverse actions retain the prior
references. Self-seeds remap on receptor duplication; other-entry references stay
within the same project. Newly created atoms do not become captured seeds.

This clarifies retained-path scope without expanding archive schema or silently
rewriting D-035. API, project and archive majors remain 1; old archives default
null and older readers are unsupported for pocket-bearing archives. Originals,
normalized artifacts, conformers and warnings remain molecular authority.
