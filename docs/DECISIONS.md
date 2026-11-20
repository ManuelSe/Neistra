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

## D-070 — Application-resolved pocket inputs and coordinate dependency invalidation

Status: accepted and implemented for issue #36 C3.

Resolve pocket seed coordinates in the application from artifact-keyed projection
queries, including hidden seed entries. Only visible owner entries become viewer
structures. Never resolve molecular data through viewer API fetches or make a seed
entry visible as a loading side effect. Pending/failed/obsolete projections produce
an explicit unavailable input rather than a patch from stale coordinates.

Carry captured references, coordinates and source-revision dependencies through the
typed render boundary. Selection, color, camera and atomic/H visibility are not seed
dependencies. Preview bookkeeping includes hidden entries: suppress every dependent
pocket before rendering previews, restore committed state on cancel, and update
resolved seed coordinates on commit. Full receptor context remains independent of
display-only atom masks and isolation.

An artifact-keyed application sync may already contain a committed coordinate patch.
When neither loaded coordinates nor dependent seed coordinates differ, and no
preview is active, treating that commit as already applied avoids duplicate geometry
invalidation and a spurious runtime seed revision. Real changes still invalidate
the appropriate channels. This extends D-060–062 without making the viewer molecular
authority; its coordinate copies and caches remain disposable.

Keep one saved pocket per receptor behind the existing Surface overflow footprint.
The nonmodal panel captures seeds explicitly; selection changes do not retarget it.
Default receptor eligibility uses the current entry list after imports/deletions;
initial seeds stay captured until explicitly replaced. Existing saved pockets
remain removable with no selection or no protein context.
Scenes remain the supported way to retain alternative pocket views. No permanent
layer manager, cavity algorithm or additional primary-panel row is introduced.

## D-071 — Organizational group membership without molecular or ordering state

Status: accepted by explicit user approval of the issue #9 plan on 2026-10-08;
implementation not started.

Decision:

Use existing nullable `StructureEntry.group_id` and persisted EntryGroup records
for top-level project organization. Add one revisioned, atomic membership command
for a captured entry batch and group-or-Ungrouped destination. Reuse existing
`entries.group` forward/inverse actions and project responses. Validate complete
same-project scope before writes; exact no-ops must preserve revisions, timestamps,
history and the redo branch. Locked entries may be reorganized, consistent with
existing group creation, without changing their lock or molecular state.

Retain empty groups after moving, ungrouping or deleting their final entry and
expose them as reusable destinations. Preserve the existing derived sorting model;
undo restores membership and the derived position under unchanged sort/filter.
Do not add manual position storage or persist sort/filter preferences in this
slice. Reload retains the existing default name-sorted view.

Use entry highlighting derived from the canonical transient selection rather
than a second entry-selection authority. If the originating row is selected,
capture all selected entry IDs; otherwise capture that row alone. Explicit actions
and desktop drag operate on whole entries, including those with partial atom
selections, and explain their scope without expanding or changing atom selection.
Capture selection context for command history using existing conventions.

TanStack Query remains the project cache owner; dialog/drag drafts are transient
application state. Mol*, normalized molecular artifacts and the separate derived
component hierarchy do not own organization. Membership changes must not fetch
normalized data, reload/rebuild structures, regenerate surfaces, or alter camera,
selection, representation, visibility, molecular data, warnings, originals or jobs.

Offer complete keyboard/touch accessible explicit actions and desktop drag from
dedicated handles. Touch drag, keyboard drag simulation, live tab synchronization,
manual ordering and broader group/component management remain outside this plan.
Named scenes keep their existing visual-state purpose. D-035/D-042 archives remain
current-state snapshots with remapped group references and no portable history.

Rationale:

The user problem is changing membership as projects evolve. Existing relational
membership and reversible action vocabulary already express that operation.
Retained groups support refill workflows and avoid an additional deletion/restore
lifecycle. Derived sorting removes unnecessary ordering migrations. Explicit
controls make desktop, keyboard and mobile organization complete without a new
touch-gesture system. These choices preserve molecular authority and reduce
compatibility risk while delivering the issue's essential outcome.

Consequences:

- The approved implementation contract is
  [issue #9 structure group membership](plans/issue-9-structure-group-membership.md).
- No database migration, ordering field, molecular schema or archive shape change
  is planned; Alembic head remains 0013 and schema majors remain 1.
- The additive API returns existing ProjectRead; optional history selection context
  must not break older group-creation callers.
- Validate retained command/history compatibility with the preceding application
  before claiming rollback safety; never strip data to make a downgrade appear safe.
- Empty-group presentation changes, but automatic deletion and nested groups are
  not introduced. Component corrections #20 and subset export #21 remain separate.
- The planned minor release is 0.10.0. Approval/persistence does not mean the feature
  is implemented, tested, merged or released; await the user's implementation start.

## D-072 — Checkpoint-derived dirty state preserves organization timestamps

Status: accepted and implemented for issue #9 M1/C1.

Decision: keep project revision/time updates in `_touch`, while deriving entry
dirty flags through the existing checkpoint comparison in `project_read`. Remove
the redundant blanket assignment of `dirty=true` to every entry. Apply existing
`entries.group` actions with an explicit unchanged database `modified_at` value,
including creation, undo and redo, so SQLAlchemy's automatic on-update timestamp
cannot change the browser's Modified sorting key during organization.

Rationale: qualification exposed that changing either group membership or the
redundant dirty column invoked the entry's automatic timestamp update. That
violated approved organization-only semantics and touched unrelated structures.
The checkpoint comparison already owns correct per-entry dirty state; no alternate
dirty model or new command/action field is necessary. Molecular edits continue
their existing explicit timestamps and all command responses derive dirty flags.

Compatibility: no migration/schema change or new inverse payload vocabulary.
Existing `entries.group` history is retained, and original/current artifacts,
viewer settings, scenes and job snapshots remain unchanged. Tests cover exact
timestamps, dirty/checkpoint behavior, history no-ops, restart and archive remapping.

## D-073 — Derived entry dirty flags must not mutate ORM state

Date: 2026-10-08. Status: accepted during issue #9 qualification.

Decision: compute per-entry dirty flags on the typed response from checkpoint
comparison, without assigning the redundant ORM column. Saving a checkpoint
updates project checkpoint state/revision and does not reset that entry column.
The persisted column remains for schema/reader compatibility; it has no new
ownership role. D-072 and previous accepted checkpoint semantics remain intact.

Rationale: assigning derived flags during reads could autoflush entry timestamp
updates; clearing them on save also touched modified-date sorting keys. An
organization-only edit followed by checkpoint save must retain those keys.
A same-session read/move/no-op/save regression demonstrates the previous failure
and proves response flags, timestamps and reopened state with the corrected path.

Compatibility: no migration or payload change. Molecular mutations keep their
existing explicit state/timestamp writes, and accepted checkpoint comparison
still supplies the public dirty flags. Existing grouping/history/archive readers
continue to use the same state and action shapes.

## D-074 — Project mutation feedback follows captured project ownership

Date: 2026-10-09. Status: accepted during issue #9 qualification.

Decision: capture the active project when a project mutation starts. Cache its
response under its own project ID, and refetch that captured project on a revision
conflict. Show completion/error feedback and restore membership focus only when
that project is still active, including the scheduled focus frame. A closing
membership dialog clears only its own captured request.

Rationale: users can switch projects while a request is pending. The command still
belongs to its captured project; a late response must not overwrite another
workspace's notice, dirty-session indicator or focus. Existing molecular/query
ownership remains unchanged. This is completion-context correctness, not live tab
synchronization or a new concurrency model.

Implications: no API, schema, migration or archive change. Success and conflict
regressions hold a real membership request, switch workspace, and then release it
on desktop and Pixel 7. The original project's command/conflict semantics remain
valid while the other project's revision, notice and filter-control focus stay unchanged.

## D-075 — Atomic rigid transforms of captured canonical selections

Date: 2026-10-09. Status: accepted by explicit approval of the issue #4 plan;
implementation not started.

Decision:

Extend the numerical coordinate workflow with one additive revisioned selection
transform endpoint. Its captured canonical selection may span entries. Accept a
finite proper rotation matrix and affine world-space translation; validate all
references, same-project ownership, locks, coordinates and matrix constraints
before publication. Require orthonormality and determinant +1 within a documented
tolerance; reject scale, shear, reflection and nonfinite values rather than
silently repairing them. Never silently narrow selection to the inspector's entry
or rendered atoms.

Apply the same matrix to selected stable atom IDs in every conformer. Reuse
`coordinates.transform`, existing `entry.coordinates` forward/inverse actions,
immutable before/after normalized artifacts, ProjectRead and coordinate patches.
One Apply is one atomic revision/history operation. Identity or coordinate-no-op
movement preserves history and redo. Keep the current numerical endpoint and its
X-then-Y-then-Z Euler semantics unchanged.

The browser derives every preview from captured original float64 coordinates:
`x′ = c + t + R(x − c)`. Here `c` is the initial selected-coordinate arithmetic
centroid and `t` is accumulated translation. Further rotation uses `c + t`, so a
translated ligand rotates about its moved center rather than orbiting the old
world location. The affine command offset is `b = c + t − R c`. Camera orientation
maps gestures into world transforms but never defines the molecular centroid.

Rationale:

Canonical selections and existing history already support multiple entries.
Sequential single-entry requests would risk partial commits and multiple undo
steps. A validated matrix carries composed gestures without Euler decomposition
or gimbal singularities, while retaining the established persisted action shape.
Deriving previews from originals avoids coordinate drift and exact cancellation
does not depend on inverse floating-point arithmetic.

Consequences:

- The approved contract is [issue #4 interactive selection transforms](plans/issue-4-interactive-selection-transform.md).
- This extends D-025's transport without changing numerical API composition,
  all-conformer semantics or backend molecular authority under D-002.
- No new history action vocabulary, database migration or persisted session field
  is planned. Alembic remains 0013; API/project/archive/normalized majors remain 1.
- Unselected coordinates, stable IDs, connectivity, source warnings and originals
  remain unchanged. Partial covalent movement may distort boundary bonds and create
  clashes; explain unconstrained editing without inferring chemical safety from
  missing connectivity. No docking, preparation or conformation claim is added.
- D-035/D-042 archives remain current scientific snapshots without command history.
  Verify preceding 0.10.0 readers before claiming retained-history rollback safety.
- The planned additive minor release is 0.11.0, subject to availability and gates.
  Approval/persistence does not mean implementation, validation or release occurred.

## D-076 — Application-owned movement sessions temporarily own viewer gestures

Date: 2026-10-09. Status: accepted by explicit approval of the issue #4 plan;
implementation not started.

Decision:

Own Move selection as transient application state capturing project, revision,
canonical references, source artifacts, original coordinates and centroid. Keep
TanStack Query as the authoritative server cache and Mol* as a disposable renderer.
Preview snapshots are temporary operation inputs, not a second durable molecular
store. Only Apply submits; drag completion does not commit. Cancel/Escape restores
captured committed coordinates without changing artifacts, revision or history.

While active, primary dragging rotates and normal secondary/Ctrl-primary pan
gestures translate in the screen plane. An explicit Depth mode supplies movement
along the viewing direction. Compact Rotate/Translate/Depth controls and bounded
keyboard/touch step actions use the same session transaction. Keep numerical
controls but prevent competing transforms during a preview. Suppress viewer picking,
empty-space selection clearing, focus, fit, orbit, pan, roll, navigation and camera
inertia; allow permitted zoom and refresh gesture sensitivity between drags.
Restore normal D-044 interaction ownership on exit.

Display a persistent viewer banner with target count, gesture help and Apply/Cancel;
preserve visible selected highlighting and appropriate cursor. Hidden selected
atoms still belong to the target and are counted. Require inspectable selected
material or explain what must be shown; never automatically reveal hidden entries
or change durable visibility. Selected-atom preview cues must honor visibility
bounds when affected surfaces pause.

Selection replacement, actual inspector-task changes, project changes and
conflicting operations discard an unapplied session before proceeding, with clear
feedback. Collapsing the inspector or closing its mobile drawer alone retains the
session so canvas interaction remains possible. Reload discards the draft. Capture
and generation guards prevent obsolete loads/frames from resurrecting it. Bound
renderer preview scheduling to one active update plus its latest pending state.

Suspend affected surfaces and dependent pocket surfaces while coordinates preview;
restore/regenerate from correct state on cancel/commit under D-060–D-062/D-070.
Measurement previews update correctly or are visibly suspended until restoration.
Never show obsolete geometry as current. No molecular refetch or command per
pointer event; immutable submitted job inputs remain unchanged.

Prevent duplicate Apply/conflicting actions during submission. Revision conflict
invalidates preview and refreshes the captured project. Reconcile ambiguous transport
failures before retry without automatically replaying against a refreshed revision.
Late responses, feedback and focus retain D-074's captured project ownership.

Rationale:

Temporary gesture ownership makes coordinate editing visibly distinct from camera
navigation. A persistent banner prevents unnoticed mode state and lets mobile
users close the drawer without losing their operation. Automatic discard avoids
retargeting or silently committing a pose when switching tasks. Existing coordinate
projection and dependent-geometry rules retain scientific and persistence ownership.

Consequences:

- This explicitly supersedes D-044 gesture ownership only during Move selection;
  normal picking/focus/navigation behavior is unchanged outside the mode.
- No durable viewer preference, local-storage draft, scene session or job type is
  introduced. Uncommitted poses never enter export, archives or job inputs.
- Qualify real WebGL rotation/pan/depth, both projection modes, exact cancellation,
  multi-drag single Apply, context failures, keyboard/touch, themes, real zoom,
  dependent geometry and published host performance gates before release.
- Pivot marker, extra toolbar launcher, Euler readout and generic gizmo framework
  remain optional/deferred; no speculative follow-up issues are required.
- Full scope, checkpoint commands and release blockers live in the approved
  [feature plan](plans/issue-4-interactive-selection-transform.md). Implementation
  requires a subsequent instruction such as `/goal`.

## D-077 — Proper-rotation validation and coordinate no-op tolerance

Date: 2026-10-09. Status: implemented in issue #4 M1/C1.

Validate supplied matrices in the core rigid-transform boundary with float64
orthonormality and determinant +1, absolute tolerance `1e-10` and no relative
tolerance. Reject rather than normalize invalid rotations. Also validate resulting
coordinates before publication. The numerical and superposition callers continue
to supply proper rotations through this common boundary.

The additive selection endpoint preflights every entry and prepares all conformers
before publishing any result. Coordinate movement no greater than `1e-9` angstrom
on every axis of every conformer is a no-op. Return unchanged project state and
preserve timestamps, history, redo and artifacts. Keep the numerical endpoint's
existing no-op rejection unchanged. Entries whose coordinates are unchanged need
no patch/artifact, while the history selection records the complete captured target.

This supplies reproducible validation for D-075 without new persisted state,
migration or action vocabulary. The threshold follows the existing documented
coordinate comparison precision in D-025; it is not a geometry repair policy.

## D-078 — Viewer visibility and bounded movement rendering

Date: 2026-10-09. Status: implemented in issue #4 M2/C3.

Movement eligibility reads the adapter's live inspectable atom references rather
than approximating visibility in React. The viewer projection owns hydrogen
display classification, component/isolation bounds and rendered surface groups;
these references affect availability/hidden counts only. Scientific targets remain
the complete captured canonical selection. A temporary getter above the drawer
lifetime avoids stale visibility snapshots after asynchronous surface completion.

Keep one active renderer operation and the latest pending multi-entry preview
batch. Complete each active non-cancelled batch so continuous movement does not
starve later entries. Commit drops pending previews before authoritative patches;
Cancel restores captured base coordinates after active work finishes. Dispose
drops pending frames and restores original camera bindings before releasing the
engine. Late API cache updates cannot replace newer project revisions.
Every renderer caller still observes its own failure; subsequent queued recovery
commands handle a rejected predecessor so cancellation can restore the model.

Suspend inherited surfaces, fragment meshes and dependent pockets before preview
model updates. Capture inspectable bounds before suspension and add transient
selected-atom cues without revealing hidden material or altering durable styles.
Measurements pause explicitly instead of displaying stale preview values. Surface
restoration/regeneration is separate from coordinate cancellation latency. These
choices implement D-075/D-076 without a persisted session or generic manipulator.

## D-079 — Bounded transient movement cues

Date: 2026-10-09. Status: implemented during issue #4 C4 qualification.

Use small, detail-zero mesh spheres for transient selected-atom movement cues,
including cues recreated during a visibility/isolation rebuild. These disposable
cues preserve captured inspectable bounds and do not change saved representations,
scientific coordinates, visibility masks or the matrix transaction.

Native CPU profiling found first-use sphere-impostor shader finalization stalled
an otherwise ordinary cartoon view for about one second. Reusing the ordinary
mesh rendering path reduces the qualified first preview to 91 ms without moving
that work outside the measured interval or weakening the accepted 500 ms response
and 750 ms task budgets. Subsequent preview and exact coordinate cancellation are
also qualified. Surface restoration/regeneration remains separately reported.

## D-080 — Retain transient movement camera across renderer remounts

Date: 2026-10-09. Status: implemented during issue #4 C4 qualification.

Keep a copied camera snapshot with the application-owned movement workflow for
its lifetime. Responsive layout can dispose and remount the viewer while the
captured scientific target and pose remain active. Ignore the new renderer's
initial camera notifications until its first scene is synchronized, restore the
held snapshot, and reacquire movement bindings. Clear the snapshot on session
exit/new capture; it is neither persisted nor authoritative molecular state.
Only the renderer that initiated synchronization may complete that lifecycle.

The lazy adapter also releases an engine whose asynchronous native mount finishes
after disposal, without attaching late listeners. Native desktop-to-compact and
compact-to-desktop regressions verify unchanged preview coordinates and camera,
suppressed navigation, exact Cancel and restored normal bindings.

## D-081 — Numerical preview request ownership

Date: 2026-10-09. Status: implemented during issue #4 C5 review.

Keep a transient generation for numerical preview loads in the application.
Latest requests supersede older ones. Clearing preview, starting movement, changing
project/revision/selection or submitting a conflicting project operation invalidates
pending work. Check the captured project/revision/selection and movement phase
before handing a loaded numerical pose to the renderer; suppress superseded
failures too. The clear callback is stable so rerenders cannot inadvertently clear
a valid numerical preview through the Transform panel's cleanup. Active numerical
failures remain visible in that panel. This guards the existing numerical workflow
without persisting draft state or changing its API/commit semantics.

An App-level delayed-load regression fails against the preceding source because
a cleared numerical pose reaches the renderer after movement starts. It passes
with generation invalidation and also verifies a subsequent valid numerical
preview still works while authoritative cached coordinates stay unchanged.

## D-082 — Coordinate remounted membership focus with menu teardown

Date: 2026-10-09. Status: accepted during issue #4 release qualification.

The exact-merged actual Chrome zoom gate found that a direct Remove from group
action can remount its origin row before the Radix menu focus scope finishes
teardown. A lone success requestAnimationFrame cannot guarantee retained focus:
the replacement action trigger stayed inactive throughout a five-second assertion.
This blocks keyboard/drawer navigation in the approved accessibility workflow.

Capture the direct membership action scope in the row and explicitly hand focus
back through `onCloseAutoFocus`. Prevent stale default trigger restoration and
resolve the replacement via the application callback, guarded by the captured
project. Retain the success-frame restoration for responses arriving after menu
closure. These two lifecycle events cover either ordering without arbitrary waits,
retry loops or longer test timeouts. Other menu actions retain normal Radix behavior.
This extends D-074's captured-project focus ownership; no molecular/API/schema
semantics or release impact changes. Add a regression completing membership before
menu teardown; native zoom repeats and late-project responses qualify the handoff.

## D-083 — Movement transactions retain selection ownership during temporary camera navigation

Date: 2026-10-10. Status: accepted by explicit approval of the issue #46 plan;
implementation not started.

Decision:

Keep the captured movement transaction independent from temporary camera versus
coordinate interaction ownership. Application-owned transient held-Space and
explicit Adjust view toggle state can permit native orbit, pan and zoom without
ending the transaction, recapturing its target, changing its pose or committing.
The typed viewer boundary distinguishes `inactive`, `transform` and `camera`.
Suppress picking, empty-space clearing and implicit molecular-focus behavior
throughout the captured session, including camera navigation. Capture normal
bindings once per session and restore them on final exit/disposal. Suppress
animation/inertia during the session; resume transformation using the latest
camera, with each new molecular drag capturing its current basis and scale.

Mouse primary drag rotates; secondary or Ctrl-primary drag translates regardless
of the secondary touch/keyboard preference. Retain Rotate/Translate/Depth for
touch, arrows and named steps, plus existing numerical controls outside movement.
Place the shared session's launcher and Apply/Cancel in a distinct viewer-header
bar with compact secondary tools. The inspector launcher remains an alternative
entry point, using the same numerical-preview invalidation before capture.

Scope unmodified Space to the active viewer/movement canvas; native controls,
editable content, dialogs and drawers retain their keyboard ownership. The user
explicitly selected an Adjust view / Resume transform toggle for touch and
keyboard access. Navigation is enabled while either held Space or the explicit
toggle is active; key release does not override a deliberately enabled toggle.
Clear held Space on focus departure, and clear all temporary navigation state on
window blur, hidden document, modal takeover, session phase exit or renderer
remount. Retain a still-valid pose and latest camera, requiring a fresh navigation
activation after remount.

On ownership changes, end the current gesture at its last accepted pose/camera,
release application capture safely, and ignore already-held pointers until
release. Require a fresh pointer-down for the next owner. Ordinary pointer
cancellation/lost capture continues to restore the start of that molecular drag.
Do not synthesize continuous gesture transfers or depend on private Mol* fields.

Rationale:

The prior boolean couples camera locking to selection suppression. Disabling it
to navigate would permit a click to replace the captured selection or discard a
preview. Separating interaction ownership from transaction lifetime delivers the
requested camera adjustment without weakening scientific authority or history.
Fresh gesture boundaries prevent stale deltas from jumping between camera and
molecule. The explicit toggle is usable without simultaneous touch controls.

Consequences:

- This explicitly extends D-076's camera restriction while preserving its
  capture, Apply/Cancel, task/selection/project invalidation, reconciliation,
  geometry suspension and rendering bounds.
- D-080 still governs application-held camera restoration across remounts;
  D-081 still invalidates pending numerical previews before shared movement start.
- Reuse D-075/D-077's rigid transform, all-conformer semantics and atomic history.
  No endpoint, schema, migration, archive, scene, job type, history vocabulary or
  persisted navigation preference is added. Original uploads and submitted job
  snapshots remain unchanged.
- Camera/navigation changes cannot recapture molecular targets or trigger
  molecular refetches, commands or surface jobs. Existing scientific warnings,
  surface/measurement suspension and pinned-host budgets remain required.
- Full scope, lifecycle rules, checkpoints and release blockers are in the
  [approved issue #46 plan](plans/issue-46-viewer-transform-toolbar.md).
  Implementation requires a subsequent `/goal`; approval currently authorizes
  documentation persistence only.

### D-083 implementation note — 2026-10-10, C2

The native adapter uses public Mol* Binding values with ownership-sensitive
trigger getters. Mol* retains these PD.Value parameters by identity; checking
availability at event time suppresses implicit focus without an asynchronous
behavior-update window. The typed interaction flag separately suppresses all
application picking. Native trackball bindings/properties are copied once per
transaction and restored on final exit. Public DOM input-end events terminate
native gestures; production code does not access private Mol* input/control fields
or implement camera movement. Native perspective/orthographic regression checks
confirm orbit, target-changing pan, zoom, unchanged selection/coordinates and
normal picking restoration. Broader C3 lifecycle qualification remains pending.
This implements D-083; it does not amend scientific or persistence contracts.

### D-083 implementation note — 2026-10-10, C3

Temporary navigation is now qualified through true emulated touch, held mouse
ownership changes, blur/visibility/modal interruption, responsive remounts,
native control Space, both themes and real browser zoom. An application-owned
transient input epoch ends gestures even if interaction remains `transform`.
Held pointers and their compatibility mouse-up cannot leak into ordinary picking
after final exit; fresh pointers restore normal behavior. Secondary tools scroll
independently to preserve primary actions. This implements the accepted fresh
input/selection contract without private Mol* state, gesture transfer or new
persisted preferences. Historical planning/C2 notes above retain their dates;
implementation is authorized by the subsequent `/goal` and C1–C3 are complete.

### D-083 implementation note — 2026-10-10, C5 native key handoff

Native key termination uses bubbling body key-up events. The public Mol* input
observer accepts keyboard input only from body/canvas while the pointer is inside;
its ordinary leave handler clears key state outside. Window-target events had
been ignored and a held pre-session navigation key could resume camera movement.
The native regression reproduces this in both layouts; accepted camera remains
exact over eight frames after corrected entry/resume, with unchanged coordinates
and project. This preserves fresh input ownership without private native fields,
observable mutation, fabricated camera mathematics or persistent state.


### D-084 — Compact transform actions and pointer-owned canvas focus (2026-10-11)

Accepted by explicit user approval of the correction plan. Primary transform
actions use icons, accessible names and hover/focus tooltips. A persistent warning/
help icon opens tap-accessible scientific and gesture guidance; meaningful errors
and uncertain commit outcomes remain visible text. More retains secondary tools.
Nonmodal panels remain bounded and yield Escape before movement cancellation when
focused. Native control Space and editable/modal focus retain their meaning.

Native mouse-down must retain movement canvas focus without blocking Mol* input.
Idle mouse movement back to the canvas may restore focus from body or noneditable
movement controls only; it must not steal editable, slider, unrelated or modal
focus. This repairs released Space navigation instead of introducing conflicting
Shift/Ctrl bindings. D-083 ownership, fresh gestures and scientific invariants
remain unchanged. No API, schema, migration, scientific math or durable preference
change. See the [correction contract](plans/issue-46-compact-transform-controls.md).
Historical verification did not cover natural focus after toolbar interaction;
new regression tests must omit artificial canvas focus for these workflows.


### D-084 implementation note — release-gate focus restoration correction

The full real-zoom gate exposed an existing group-menu return-focus race after
removing membership. An isolated 20-cycle diagnosis with movement never active
failed on cycle4: focus reached the old grouped row before query notification
remounted it, leaving body focused. The canvas handlers cannot focus a missing
movement overlay and are scoped outside the project browser.

Resolve the requested group action against the **accepted rendered revision**
using an application-owned transient focus request and layout effect, rather than
a timing-dependent requestAnimationFrame. Retain menu-teardown recovery for fast
responses; discard requests after a project/revision change or later unrelated
focus. This narrow supporting repair is necessary for the existing release gate;
it introduces no grouping capability, data/API/history change or general focus
refactor. Cover delayed query rendering, unrelated fields, project changes and
repeated native row remounts. Original transform scope/deferrals remain unchanged.

## D-085 — Transient bounded molecular interaction analysis

Date: 2026-10-11. Status: accepted by explicit user approval of the issue #49
plan; implementation not started.

Decision: implement interaction inspection as pure molecular-core analysis over
immutable normalized artifacts, exposed through one additive read-only endpoint.
Return canonical atom identities, geometric evidence, immutable input identities
and structured coverage/warnings; no project command, database record, result
artifact or durable report. Display choices are transient per-project session
state, not browser preferences, scene content, history or archive fields.

Run analysis in a cancellable child using existing import/export execution
conventions, without requiring the standalone generic job worker. Admission is
bounded by 100,000 atoms, one million candidate comparisons, 20,000 records and
30 seconds, with one active analysis per API process. Enforce limits before
unbounded allocation; failures cannot masquerade as complete truncated results.

Rationale: interactive inspection needs reproducible chemistry, cancellation and
responsive rendering, but neither durable reports nor preparation commands.
Bounded read-only execution avoids a second molecular authority and unnecessary
persistence/job lifecycle complexity.

Consequences: preserve the existing close-contact endpoint. No migration or
persisted schema change; head remains 0013 and existing contract majors remain 1.
Scientific/result identity is application-owned; Mol* renders disposable geometry.
The full contract and checkpoint/release gates are in the
[issue #49 plan](plans/issue-49-molecular-interactions.md).

## D-086 — Conservative analysis-only interaction chemistry

Date: 2026-10-11. Status: accepted by explicit user approval of the issue #49
plan; implementation not started.

Decision: require explicit donor hydrogens for H-bond geometry and markers from
H to acceptor heavy atom. Do not generate atoms/coordinates automatically or
substitute donor-heavy-atom endpoints. Reuse existing explicit preparation tools.

Use pinned RDKit for chemically validated small molecules and a restricted
analysis-only registry for the 20 canonical amino acids, grounded in pinned OpenMM
standard bond definitions and documented interaction typing. Map only observed,
unambiguous atoms. Conventional ASP/GLU negative and LYS/ARG positive side-chain
assumptions are warned; explicit conflicting chemistry/protonation prevents them.
Do not assume histidine or terminal charge. Unknown normalized bond orders and
charges must not become silent conversion defaults. Unsupported chemistry and
unresolved alternate locations produce skipped-site coverage/warnings.

One versioned interaction-v1 profile defines geometry, ring planarity, charges,
radii and covalent/H-bond exclusions as specified by the approved plan. These
classifications do not establish binding energies, universally correct protonation
or experimentally validated chemistry. Display switches cannot change assignment
or disable chemical clash exceptions; valid overlapping types remain independent.

Rationale: common protein imports omit chemistry, so explicitly disclosed template
assumptions are useful without changing authoritative molecular data. Unsupported
ligands require real chemistry assignment rather than proximity/name guesses.

Consequences: analysis cannot overwrite original uploads, normalized records or
their existing warnings/inferences. CCD-based PDB/mmCIF ligand typing is a separate
approved follow-up, not an implicit preparation feature in #49. Research found
that dictionary-based assignment requires its own data and mapping contract.

## D-087 — Molecular grouping and shared-workspace interaction geometry

Date: 2026-10-11. Status: accepted by explicit user approval of the issue #49
plan; implementation not started.

Decision: derive analysis molecule grouping separately from D-045 selectable
components. Complete small-molecule graphs use connected components; source
polymer/nonpolymer instances provide grouping evidence for incompletely connected
macromolecular inputs. Unambiguous covalent links join instances, including
attached ligands. Ambiguous links warn and suppress affected scope-dependent
results. Use stable source identities/connectivity rather than spatial proximity;
coordinate movement must not split a polymer into new molecule identities.

The current domain has no cross-entry covalent connectivity, so separate entries
remain separate molecular instances. Cross-entry analysis explicitly declares the
workspace Cartesian frame and uses authoritative active-conformer coordinates as
displayed, without alignment, crystallographic symmetry or periodic images.

Rationale: file, entry, chain, residue and selectable-component boundaries do not
universally represent molecule boundaries. A documented common-frame contract
makes cross-entry geometry inspectable without inventing molecular relationships.

Consequences: this extends D-021's cross-structure deferral for #49's explicit
shared-frame analysis only. It does not change the old contact tool, component
identity, molecular connectivity, persisted grouping or coordinate-transform math.
Suppress within-group clash assignments when incomplete connectivity prevents
defensible exclusions; cross-molecule element-based screening remains possible
when separation is established.

## D-088 — Interaction overlay lifecycle and logical visibility

Date: 2026-10-11. Status: accepted by explicit user approval of the issue #49
plan; implementation not started.

Decision: cache derived analysis by project, sorted input artifact identities and
fixed profile. Type/scope controls filter cached results. Camera, selection, theme,
organization and ordinary styling do not rerun chemistry. Committed input changes
debounce by 250 ms; cancellation and captured generations reject obsolete results.

Clear overlays before any coordinate preview reaches the renderer. Pause for the
preview lifetime, restore matching committed results after Cancel, and analyze
new committed artifacts after Apply. Keep choices outside the disposable renderer
so renderer remounts retain them; project switch/reload restores defaults: all six
types off, Inter on and Intra off. Panel opening alone starts no analysis.

Current component visibility, isolation, applicable atom masks and H settings
filter overlays. Deliberately hidden polar hydrogens suppress their H-bond markers,
as explicitly requested by the user. Centroid interactions require complete
visible ring membership. Distinguish zero detected, partial coverage and unavailable.

Rationale: an old classification at preview coordinates would misrepresent geometry.
Explicit pausing avoids per-frame chemistry without concealing this limitation.
Display-state ownership and canonical references preserve camera/picking/focus
contracts and prevent unrelated actions from refetching molecular data.

Consequences: typed batched nonpickable overlay geometry is separate from durable
measurements. Use pattern and color distinctions, compact nonmodal controls,
accessible names/tooltips and secondary Help. Preserve D-083–084 movement/native
focus conventions. No transient options or results enter scenes, history or archives.


### D-086 implementation note — M1/C2, 2026-10-11

Ligand site typing checks every supplied formal charge and bond order before
calling the existing RDKit conversion helper; unknown values cannot become its
neutral/single defaults. Validate disconnected graphs independently, preserving
canonical IDs. Observed canonical protein sites require expected elements,
unambiguous names and required heavy neighbors; template inference is analysis
only. Missing explicit donor H and undefined angular geometry remain visible
coverage warnings. Qualified H-bond clash exceptions are computed before display
filtering. Complete supplied ligand graphs use connectivity rather than their
shared residue labels for molecular grouping. No authoritative schema changed.


### D-086 implementation note — M2/C3, 2026-10-11

Use pinned RDKit public Lipinski donor/acceptor SMARTS for validated ligand graphs,
with explicit H and charge constraints. BaseFeatures pharmacophore acceptor rules
exclude some common amines/anionic oxygen and include fluorine; they are unsuitable
as this profile's H-bond typing contract. Canonical protein ring/site rules remain
explicit and observed-only. Histidine acceptors need observed tautomer evidence;
no histidine/terminal charge assumption is introduced. Resonance-equivalent ionic
sites share one group center/marker; supplied neutral chemistry and contradictory
H evidence prevent conventional side-chain charge fallback. All six assignment
rules run independently before display filtering.

### D-087 implementation note — M2/C3, 2026-10-11

Consecutive source residue identities within one canonical polymer instance can
supply analysis-only OpenMM peptide connectivity, explicitly warned. Missing
heavy template sites, sequence gaps and unresolved links suppress unsafe covalent
exclusions. Group identity is independent of coordinates, and an unknown-order
cross-residue link without canonical or supplied covalent evidence suppresses its
affected scope rather than inventing a relationship. XYZ has no reliable molecule
boundaries, so disconnected inferred fragments do not become intermolecular scope.

### D-088 implementation note — M3/C4, 2026-10-11

Overlay visibility is filtered first from authoritative application membership
and again against the disposable renderer projection using the established native
nonpolar-H classifier. This preserves D-045 hydrogen semantics without chemistry
repair or moving state authority into Mol*. Clear before native coordinate previews;
restore only after committed coordinates and current projections are ready.
Responsive renderer remounts retain project-session choices/cache, while an open
interaction popover may close with its old renderer. This matches existing
responsive workspace lifecycle and does not persist transient state in scenes.

### D-088 lifecycle/cache qualification note — 2026-10-11

Reuse the latest analysis for a visible subset only when every requested entry
has the same immutable artifact identity in that result. Retain conservative
superset coverage warnings; logical visibility filters suppress hidden/deleted
participants. New/revealed changed artifacts invalidate the result. Reset session
choices synchronously when the workspace project pointer changes, including empty
projects without a mounted molecular viewer. This closes the lifetime gap between
application-owned session state and conditional renderer mounting.

### D-086 covalent modification qualification note — 2026-10-11

Canonical residue names cannot override observed covalent modifications. Local
template typing verifies required heavy-neighbor elements and rejects external
links except chemically compatible peptide/disulfide connections. A modified
side-chain site becomes untyped with a warning, preventing e.g. acylated Lys NZ
from acquiring an assumed positive charge. Disulfide S is not a thiol donor and
does not request missing donor H; contradictory supplied thiol H is skipped.
Molecular grouping still respects supplied covalent links and inputs stay immutable.

### D-088 native buffer qualification note — issue #55 C1, 2026-10-13

Mol* ShapeRepresentation retains geometry ValueCells on an existing render object.
Create updated Lines through the previous geometry so endpoint/group/index buffers
change together with counts, colors and bounds. Fresh disconnected buffers can
leave old coordinates and undersized index capacity attached despite correct
application records. Tests must inspect active attached buffers and actual canvas
output; submitted records and draw counts alone do not establish rendering.
Keep one nonpickable batch and canonical endpoints. Exact coincident clashes use
a centered three-axis cross of 0.15 Å half-length as an explicitly documented
marker; molecular geometry is not inferred or modified.
The shape uses the current record count explicitly; retained buffer capacity
must not create stale color groups after shrinking or emptying the batch.

### D-086 fixed-profile reference qualification note — issue #55 C2, 2026-10-13

Freeze structural source coordinates and independently specify prepared test
chemistry, participants and geometric expectations. Small controlled molecules
plus the2REG choline environment qualify supported rules without implementing
ligand assignment. Source atom coordinates and explicit choline graph are checked
against original bytes. Do not tune interaction-v1 to reproduce another tool's
report:2REG cation–π partners qualify, while Asp45 at4.716Å lies outside Neistra's
4.5Å ionic cutoff. Separate complete Trp rings explain ring-versus-residue counts.
No production chemistry or thresholds are changed by this qualification.
The two2REG PDB fixture paths have scoped Git attributes preserving fixed-width\npadding and disabling text newline conversion. Their format padding is exempt\nfrom blank-at-end-of-line checks; code/documentation checks remain unchanged.\nChecksum and source-coordinate tests enforce exact scientific input fidelity.\nEOF

### D-086 contradictory acid evidence correction — issue #55 C4 review, 2026-10-13

Local complete-diff scientific review reproduced a supported-policy violation:
observed ASP/GLU acid H plus supplied negative carboxyl-side charge could bypass
the old fallback-protonation check and create ionic or H-bond assignments. Skip
the affected acid oxygen sites before typing/groups and return the existing
structured conflicting_protonation warning with canonical IDs. Preserve source
charges/coordinates; do not choose a replacement protonation state. Neutral acid
and ordinary deprotonated sites retain their existing behavior. This implements
the accepted contradictory-evidence boundary; no threshold/profile/API/schema
change. Negative salt and aligned donor-H regressions cover both ASP and GLU.

## D-089 — Application-owned notification lifetime and conservative persistence

Date: 2026-10-14. Status: accepted by explicit user approval of the
[issue #56 plan](plans/issue-56-viewer-notification-timeout.md); implementation
requires a subsequent `/goal` and has not started.

Decision:

Keep application popup notification lifetime in transient React state, separate
from presentation color, server/project state, persisted workspace preferences,
and disposable Mol* state. Routine confirmations expire after 10,000 ms. Errors,
warning-bearing summaries, and guidance requiring inspection, retry, refresh, or
reconciliation remain visible until manually dismissed or replaced under existing
behavior. Declare exceptional lifetime with typed producer metadata, not message
text matching or inference from success/error styling.

Retain the single visible notification. Each new emission, including identical
text, receives a fresh lifetime. Cancel obsolete timers and guard callbacks by
emission identity so a superseded notice cannot dismiss its replacement. Unrelated
renders/theme changes and viewer remounts do not restart the lifetime. Dismissal,
context changes, and application unmount invalidate obsolete work.

Retain accessible roles and manual dismissal. Defer expiration while keyboard
focus is inside the notice; remove it after focus leaves if its deadline passed.
Manual dismissal leaves focus at a sensible connected workspace target without
stealing unrelated focus or overriding modal/native input ownership. Browser timer
throttling may delay callbacks; notices must never expire early.

Rationale:

Routine notifications clutter the viewer, while success-styled messages can also
contain scientific warnings or uncertain movement instructions. Explicit lifetime
preserves consequential information without introducing a queue, new persistence,
or scientific authority. This continues D-013's transient UI boundary and D-084's
visible meaningful-error/uncertain-outcome policy.

Consequences:

- Existing single-slot replacement, wording, position, colors, and Close control
  remain. Persistent means no automatic timeout, not immunity from replacement.
- Independent successive-emission lifetimes satisfy the explicitly approved
  interpretation of issue #56; simultaneous notification stacks are excluded.
- Scientific warnings, API retry displays, viewer failures, job state, dialogs,
  interaction coverage, and vendor feedback retain their separate lifecycles.
- Expiration cannot change molecular data, originals, artifacts, history, project
  revisions, jobs, selection, camera, or renderer initialization. No API/schema,
  migration, dependency, or durable notification preference is introduced.
- Fake-timer/component coverage and real browser workflows must qualify deadline,
  replacement, repeated text, persistence, cleanup, focus, and state invariance.
- Scope, delivery gates, release impact, and the planning-only stop are governed
  by the approved feature plan; approval currently authorizes documentation only.

### D-089 implementation note — issue #56 M1/C1, 2026-10-14

Implementation is authorized by the subsequent `/goal`. The React notice component
uses each published value's object identity with a functional state update to reject
obsolete expiry/dismissal. Its effect depends only on notice identity and the stable
setter, preserving lifetimes across unrelated renders and viewer remounts. Error
notices never receive a timeout, even if marked transient. Structured warning counts
and explicit movement lifetime metadata preserve success-styled consequential text.
Manual focus restoration respects an open modal and connected prior targets; expiry
while focused waits for departure without moving focus. C1 qualifies these policies
without changing project/API/archive schemas, molecular state, or CSS.

### D-089 stale callback qualification note — issue #56 C3 review, 2026-10-14

A reproduced obsolete-callback case could preserve the wrong expiration marker
while a newer focused notice was overdue. Cleanup explicitly invalidates its
closure before clearing the timer, so obsolete callbacks cannot modify lifecycle
refs, in addition to the existing functional state identity guard. A regression
invokes the old callback after the new deadline, then leaves keyboard focus and
requires removal without focus theft. This implements the accepted stale-work
boundary; no new notification scope or scientific/persisted behavior is introduced.

### D-089 released qualification note — issue #56 C3, 2026-10-14

Released in v0.13.2 through PR #62. Clean candidate and exact merged master c21de2e
repeat the complete gates, with194 frontend and182 browser workflows/44 intentional
skips plus492 Python/eight supervisor tests, zero failures/retries. Actual preceding
v0.13.1 reader accepts final data/history/originals/archives/jobs. Typed lifetime,
closure cleanup, state identity, focused-notice deferral and producer warning/action
policy retain application ownership without scientific, API shape, schema, migration
or dependency changes. Publication and issue response are remotely verified; the
approved feature plan retains the detailed evidence and final cleanup audit link.


## D-090 — Identified disposable surface visuals and lazy calculation admission

Date: 2026-10-14. Status: implemented renderer primitives for issue #57 M1/C1;
production surface-object persistence and management require C2.

Use application `(entryId, surfaceId)` identities independently of molecular atom
selection. A disposable registry binds native representations to these identities,
activates the entire representation, and emits only application identity on an
unmodified primary hit. Modified structural hits retain canonical add/subtract
selection. Renderer refs never enter project state. The typed lazy viewer boundary
buffers active identity and forwards surface activation subscriptions; renderer
rebuilds rebind matching representations without changing molecular selection.

Retain current solid surface geometry. For fragment/pocket mesh display derive the
same three triangle edges and owner groups as pinned Mol* Lines.fromMesh. Allocate
exact native wide-line buffers after admission and yield cooperatively during edge
conversion. Account retained buffers, native group-mapping output and temporary
mapping arrays; reserve aggregate display bytes before allocation. This is display
conversion, not a new scientific profile, field calculation or molecular authority.
Native entry surfaces retain their existing native geometry/wireframe path in C2.

Surface runtime requests distinguish same-entry objects and retain separate
cancellation/current-component guards. The one-worker serial queue accepts lazy
input factories, invoking them only after checking request cancellation and viewer
lifetime at execution admission. A cancelled queued request never extracts typed
coordinates/radii. Geometry reuse avoids both calculation and input allocation;
new display arrays share the existing retained worker-output budget. These are
accounted buffers, not a browser/GPU memory cap or native entry-calculation bound.

Rationale: singleton channel identity cannot support independent same-entry
objects, and constructing every queued surface input would multiply memory before
worker admission. Preserving molecular selection and existing scientific geometry
keeps this checkpoint independently verifiable without a persisted-state change.
The production object model, migration and superseding singleton/minimum-display
rules will be recorded separately in C2; earlier scientific decisions remain intact.


## D-091 — Canonical surface objects and the schema-2 compatibility boundary

Date: 2026-10-14. Status: implemented for issue #57 C2; appearance/source editing
and full release qualification follow in C3/C4.

ViewerSettingsV2 owns up to sixteen ordered surface objects per entry, with stable
identity, explicit entry/fragment/pocket source, independent appearance, requested
visibility and distinguishable names. This supersedes the singleton ownership in
D-057/D-066 and the minimum-one ordinary representation restriction in D-022.
Removing the last surface or ordinary representation does not invent geometry.
New fragment creation captures selection separately per entry; repeated creation
creates another object, without implicit union/subtraction. Historical effects
remain exact through migrated before/after snapshots.

Server-generated UUIDv7 identifies new objects. Migration 0014 and legacy archive
conversion derive UUIDv5 from entry ID plus legacy channel/representation identity,
not membership or appearance; the same historical object keeps identity across
retained snapshots. Duplication preserves local IDs and remaps self seeds; archive
import remaps all entry references. Molecular originals, normalized artifacts,
chemistry warnings, revision/history positions and timestamps are unchanged.
Topology reconciliation prunes every affected live/scene captured source with exact
inverse state. Application notices name affected definitions and persist under
D-089; they do not become fabricated molecular warnings.

Project/viewer payloads and archive manifests advance to schema 2, while normalized
molecules and selections stay schema 1. `/api/v1` routes remain, with explicit
schema-2 write discrimination, dedicated revisioned object commands, and structured
410 guidance for obsolete singleton endpoints. Generic viewer writes cannot mutate
objects. This is an explicit old-client compatibility break, carried by the approved
pre-1.0 minor release, rather than parallel writable legacy authorities.

All retained migration paths prevalidate before writes. Downgrade refuses any saved
object or empty ordinary representation set, including retained history. Restore a
pre-upgrade database-and-artifact backup for rollback. Schema-1 archives validate
before conversion; schema-2 exports require an upgraded reader. Actual tagged
producer/reader compatibility remains a C4 release gate.

The compact nonmodal manager is application-owned. Requested object visibility is
bounded by parent visibility; unavailable objects remain removable. Saving a
definition never asserts successful rendering. Native entry calculations stay native;
worker accounting and deadlines apply to fragment/pocket work only.


## D-092 — Explicit source selection and independent surface appearance

Date: 2026-10-14. Status: implemented and checkpoint-qualified for issue #57 C3.

Surface appearance uses the existing supported themes, uniform color, finite
opacity and solid/mesh display as one revisioned object update. Choosing a theme
clears atom-color inheritance for that object; the explicit inheritance checkbox
can restore overpaint precedence. New objects remain independent; migrated ones
retain prior inheritance. Scientific field keys exclude appearance.

Select source atoms is an explicit molecular-selection action: current entry,
captured fragment, or complete current protein calculation context. Pocket seeds
locate the crop and never masquerade as surface membership. Context loading uses
application-owned artifact-keyed queries, discards stale responses and makes no
viewer-derived molecular authority. Fragment replacement rejects mixed-owner
selection rather than silently discarding selected atoms. Pocket radius and seed
replacement are explicit, retain identity and owner, and require current protein
context; changing receptor creates a new owner-bound object. Existing display-edit
policy permits these operations on locked entries while molecular edits stay locked.

The nonmodal manager owns focus only after explicit keyboard/list interaction;
canvas activation leaves canvas focus in place. Source loading, pending commands
and errors remain scoped to the active object/project. No new schema migration or
scientific profile is introduced beyond C2/D-091.


## D-093 — Focus ownership during nonmodal tool handoff

Date: 2026-10-14. Status: implemented and keyboard/zoom-qualified during issue #57 C4.

Opening Surfaces from Style selection transfers tool ownership. The closing Style
palette suppresses its normal launcher restoration while the manager opens; normal
palette closing retains its existing default. This also preserves canvas focus for
surface activation. Otherwise the outgoing palette's delayed close callback steals
focus from the newly opened manager.

When a user closes the manager while focus belongs to it, capture that ownership
before unmount/blur events, then restore the connected meaningful launcher or the
stable Style selection action. A connected document body is not a usable launcher.
External focus and Escape remain owned by the workspace. The manager never restores
focus merely because it remains open while another workspace control has focus.

Rationale: browser qualification reproduced both an outgoing-palette race and loss
of close intent during unmount blur. Explicit handoff and close intent preserve
keyboard reachability without delayed focus timers or a new application focus system.
Project changes and renderer state do not become persisted focus authority.

## D-094 — Stable calculation snapshots for lazy surface inputs

Date: 2026-10-14. Status: implemented and native queue-qualified for issue #57 C4.

A lazy surface request retains the calculation Structure data value and canonical
atom-ID mapping matching its immutable dependency key. It must not look up that
data through a disposable StateObjectSelector when the queue eventually admits
it. An appearance rebuild can delete/recreate renderer components while unrelated
requests wait; the old selector then has no object, although the scientific input
snapshot remains valid.

Capturing the data reference does not allocate typed coordinate/radius inputs.
Those arrays are still created only at serial queue admission. Molecular dependency
changes cancel obsolete requests; appearance-only rebuilds keep the same scientific
snapshot and rebind completion to the current visual component. No molecular
state, profile, geometry algorithm or persisted schema changes.

The native regression holds the first actual worker dispatch, rebuilds components
with four same-entry fragment/pocket requests queued, and cancels one queued pocket.
Only one input is extracted before release and three in total; the cancelled input
is never materialized, all remaining objects render, and maximum active workers is
one. Desktop qualification reproduces the failure before the fix; desktop and
mobile qualification both pass after it.

## D-095 — Canonical identifiers and retained schema-2 validators

Date: 2026-10-14. Status: implemented and migration/archive-qualified for issue #57 C4.

Surface IDs validate as UUID strings and serialize canonically, matching generated
UUIDv7 and migrated UUIDv5 identities and existing archive identifier conventions.
Validate them in every surface-object model, including scene archive state, before
publishing imported projects. Malformed strings cannot identify objects through
the entry-owned API routes and must not become durable state. UUID normalization
precedes per-entry uniqueness checks. Legacy archive owner UUIDs normalize before
deriving IDs, so equivalent UUID spelling cannot split one object across snapshots.

Keep explicit ViewerSettingsV2 and SceneEntryStateV2 models for migration0014 and
manifest2 readers; application code uses current aliases. A future incompatible
schema must introduce its own versioned models and preserve the V2 contract and
nested semantics. Historical migration validation must not accidentally advance
when the application's current alias changes.

Rationale: negative archive tests reproduced acceptance of unaddressable entry and
scene object IDs. Canonical UUID validation rejects both atomically. Explicit
versioned validation also preserves the declared migration/archive boundary during
future application development. No molecular format, profile or additional database
revision is introduced.


## D-096 — Requested and bound generations own structural picks

Date: 2026-10-14. Status: implemented and native pointer-qualified for issue #57 C4.

A structural synchronization immediately advances the requested generation and
retires surface bindings. Ignore structural clicks until the bound generation
matches that request and the rebuild has finished. Update the bound generation
only after the complete current scene commits. This prevents still-visible pixels
from retired surfaces falling through to molecular selection while the serialized
rebuild waits. A failed rebuild cannot make unknown bindings authoritative.

Keep this generation guard separate from the existing rebuilding flag because
camera capture/navigation uses that flag. Navigation keeps its existing ownership;
application molecular state remains authoritative. Modifier selection resumes with
the current scene. Native desktop/mobile tests deliberately hold the rebuild queue,
click old surface pixels, verify unchanged atom selection, then release the rebuild
and activate the current complete object. The diagnostic reproduced zero-to-one
atom selection before this guard; both viewports pass after it.

## D-097 — Independent component browsing context

Date: 2026-10-14. Status: accepted by explicit approval of the issue #59 plan;
runtime implementation not started.

Decision:

Separate compact entry management from component browsing using a desktop
vertical split and mobile Entries/Components tabs. Entry-name activation retains
the existing canonical molecular-selection operation and synchronously sets the
inspected entry. An explicit Components action changes browsing context alone.
Component/category selection, viewer picks, group selection, visibility changes,
and surface activation do not implicitly retarget the browser.

Own the inspected entry, per-entry expansion, and scroll state in a typed transient
application session store that survives responsive component remounts. Keep the
target while its entry is filtered, regrouped, collapsed, hidden, renamed, or
deselected. Clear on project change and target deletion; Undo does not implicitly
reactivate it. Reconcile current IDs and focus/scroll after topology changes.
Persist only panel size/collapse preferences through the existing safe workspace
storage. Never copy molecular payloads, derived hierarchy, or this browse context
into project snapshots, history, named scenes, or archives.

Use existing artifact-keyed TanStack Query structures and D-045 memberships.
Selection continues to consume D-018 canonical atom references. Separate label,
disclosure, visibility, and Details controls so browsing and focus cannot become
another molecular-selection authority. Expose all classification provenance and
warnings through keyboard/touch-accessible details. Preserve explicit shared
Protein/Ligands/Solvent/Ions visibility scope; individual persisted component
visibility is outside this contract.

The approved continuous virtual component list uses stable IDs, bounded overscan,
focus retention, and keyboard navigation to off-screen rows. Full-category
selection includes unmounted members. Build an artifact-keyed membership index
instead of rescanning every atom for each row. Native list/button semantics remain
application-owned; an incomplete ARIA tree is not introduced.

Rationale:

Inline expanded hierarchies displace other entries and conflate the molecule being
inspected with the current molecular selection. Independent browsing preserves a
scientist's context while selections span components or entries. Session ownership
keeps scientific project state authoritative and avoids migrations for navigation.
Virtualization bounds DOM growth while explicit provenance, visibility scope, and
complete canonical operands preserve scientific meaning.

Consequences:

- [Issue #59 contract](plans/issue-59-compact-project-navigation.md) governs
  implementation and evidence. C0 approval/persistence does not claim runtime
  functionality; stop ready for `/goal`.
- This supersedes only D-045's inline per-entry hierarchy presentation, not its
  classification, stable identity, membership, query, or scientific boundaries.
  D-013, D-018/019, D-071, and D-090–096 remain authoritative.
- No API, molecular, job/plugin, migration, or archive shape change. Head remains
  0014; project/viewer/archive schemas2 and normalized/selection schemas1 remain.
- The planned minor release is0.15.0, with actual taggedv0.14.0 compatibility
  qualification before claiming rollback safety. Additive layout preferences are
  not a database migration; rollback restores the earlier navigation workflow.
- Entry-list virtualization, durable browsing context, component overrides/export,
  surface redesign, carbon defaults, and charge chemistry remain outside scope.

### D-097 implementation note — issue #59 C1, 2026-10-14

The new browser reuses the existing revisioned entry/group/viewer actions and
artifact-keyed query. App-level project/deletion reconciliation keeps navigation
correct even while a desktop panel or mobile drawer is unmounted. Only split/
collapse preferences are persisted; expansion and scroll remain session state.

Components/Details handoff suppresses outgoing menu launcher restoration. Entry
Details initially focuses its dialog container, rather than its tooltip-bearing
Close action: a focused tooltip otherwise consumes the first Escape. Both mobile
tab-panel identifiers remain in the DOM even when their inactive content is
unmounted, preserving valid aria-controls. These are focus/semantics corrections,
not changes to molecular selection, scientific state, or the API.

### D-097 implementation note — issue #59 C2, 2026-10-14

The compact pane uses native list/listitem/button semantics, logical row positions
and total count, complete Up/Down/Home/End navigation, and independent controls.
Only the active row's controls join the tab sequence; keyboard movement focuses
off-screen labels without selecting. Stable ID keys and at most two additional
focus/Details rows keep virtual DOM membership bounded. Category activation uses
the complete cached operand, never the visible window.

Build normalized residue-to-atom and component/category indexes from the current
artifact projection. Preserve the existing component granularity and canonical
selection algebra exactly, including covalent boundaries and explicit orphan IDs.
This is a browser lookup optimization, not scientific reclassification. Warning
and provenance Details retains complete text. Water and other solvent keep their
shared Solvent control; duplicate shared-control names are scoped to their category
row in tests, rather than inventing separate visibility preferences.

Pin the approved TanStack adapter3.14.19/core3.19.4 without incidental dependency
upgrades. React19 ref props add typed IconButton ref support for focus restoration.
Generated O-only water fixtures qualify navigation with real normalized identities;
they do not certify preparation chemistry or a realistic solvent environment.

### D-097 qualification note — issue #59 C3, 2026-10-14

Qualification reproduced loss of owned focus when an artifact-key change replaces
the hierarchy with a loading state. A stable shell tracks focus ownership across
that transition and returns it to the pane heading; an external text interaction
keeps its focus. Removed current rows return to their surviving category or the
heading. No stale molecular payload is retained as selectable placeholder data.

The many-entry case reproduced insufficient contrast from hidden-row opacity.
Use the existing contrast-qualified muted text token while preserving readable
controls and warning indicators. Component warning counts are explicit accessible
descriptions, rather than relying on an SVG inside an explicitly named button.

Actual200% browser zoom reproduced an entry menu extending beyond the viewport.
Bound the existing Radix portal menu to its runtime available height and viewport,
with internal scrolling. This preserves all entry actions and their keyboard
behavior. The expanded four-theme/zoom workflow has a240-second harness deadline;
its geometry, hit-testing, contrast, focus and scientific assertions are unchanged.
The pinned Radix runtime height variable is explicitly identified in token tests.

These repairs stay within navigation/focus/accessibility scope. No API, molecular
model, classification, job, archive shape or migration change is introduced.

Local C3 review also reproduced a queued Components focus callback targeting a
new project's heading after a switch. Guard the callback with its captured project
and inspected entry. The fake-frame regression fails before repair and passes
afterward; superseded browser qualification is recorded separately and restarted
on corrected source. No older project's delayed UI work owns current focus.

The real-zoom workflow subsequently reproduced a Details closing callback taking
focus from the already focused Interactions launcher; Enter then reopened the old
entry menu. Both Details dialogs now preserve a later meaningful connected control
and restore only when their closing scope still needs restoration. Entry return
targets retain project/entry identity and resolve remounted launchers by ID; an
old project cannot focus a new project's heading. Focused regressions cover both
dialog kinds, while the complete corrected browser gate is repeated.

D-097 final review note — percentage-only desktop minima reproduced only44px
for two32px component rows at1200×600 with hidden/outside-list parent status.
Measure available pane space, current controls/header overhead and two row heights
to constrain the existing divider. ResizeObserver handles layout changes without
per-component requests or molecular state. Impossible combined minima share the
viewport rather than creating invalid panel constraints; mobile full-height tabs
remain unchanged. A pre-fix failing native regression and passing repair are retained.

## D-098 — Conservative prepared-component editing and projection ownership

Date: 2026-10-16. Status: accepted by explicit approval of the issue #69 plan;
runtime implementation not started.

Add selection-driven small-molecule editing for one eligible closed component
within one unlocked entry, including prepared components inside complexes.
Resolve targets from current authoritative normalized identity and reject missing
bond orders/formal charges before RDKit conversion. Existing conversion defaults
must not turn unknown source chemistry into a prepared editable molecule.

Use a temporary component chemistry projection and merge the validated result
back by stable IDs. Preserve unrelated components, protein/water records,
coordinates, hierarchy and source facts. Never sanitize an entire protein as a
ligand or infer preparation from component classification. Initial eligibility
requires one conformer, usable finite coordinates, supported known chemistry,
no ambiguous alternate site, covalent external boundary, unsupported metal,
radical or stereo encoding, and at most 256 heavy/1,024 resulting component atoms.
These are admission bounds, not speed guarantees.

The accepted contract is [issue #69](plans/issue-69-compact-molecular-editor.md).
Its prepared-complex workflow must be qualified through normal archive import;
raw PDB/mmCIF ligands with incomplete chemistry remain visibly unsupported.
Existing #52 assignment analysis, #12 preparation and #20/#21 component override/
extraction concerns do not become implicit editing prerequisites or capabilities.

Rationale: entry-level ligand restrictions prevent useful in-place editing, while
unknown-to-single/neutral conversion and whole-complex sanitization would invent
scientific certainty. A bounded component adapter extends D-002/003/028 without
giving chemistry libraries, component labels or the viewer molecular authority.

Consequences: no normalized schema or database migration is planned. Existing
low-level editing endpoints retain their behavior. Material compatibility or
scope changes require an amended approved plan, not silent data stripping.

## D-099 — Local hydrogen and geometry changes form one molecular command

Date: 2026-10-16. Status: accepted by explicit approval of the issue #69 plan;
runtime implementation not started.

Supported selection-driven small-molecule edits reconcile explicit H locally on
edited atoms and immediate affected neighbors. Preserve unaffected H/coordinates;
new atoms/bonds consume monotonic identities. Replacing a terminal singly bonded
H consumes that H identity and allocates a new heavy-atom identity. Each complete
edit, including generated H and reference reconciliation, publishes one immutable
result and one reversible command using existing generic molecular actions.

Use fixed attachment definitions for methyl, ethyl, hydroxyl, amino, carboxylic
acid and phenyl, deterministic bounded coordinate generation, and explicit
bond-length/angle/overlap validation. Preserve unaffected heavy coordinates
exactly; report unoptimized retained geometry where element/order changes require
review. Validate supported mapped stereochemistry; unsupported encodings reject
rather than silently disappearing. Record method/version, generated identities,
coordinates and seeds through existing inference/metadata facilities, invalidate
stale derived chemistry and expose modified-source-label limitations.

Do not silently choose pH, tautomer, aromatic protonation, global embedding or
force-field fallback. The new UI rejects direct aromatic order cycling,
unsupported aromatic element/charge changes and automatically saturated H
deletion. Initial element shortcuts are C/N/O/S/F/Cl/Br/I, with neutral divalent
S only; broader elements, fragment chemistry, ring fusion and peptide growth
remain follow-ups. A hydrogen-free input may require one explicit initial
Prepare component hydrogens action. Opening Edit/showing H never adds atoms.
Existing protein mutation and hydrogen-removal semantics remain documented and
available; local small-molecule saturation does not imply protein preparation.

Rationale: automatic H must be real molecular state with exact history, not a
viewer effect or a second independently failing edit. Bounded chemistry and
visible uncertainty provide useful building without pretending valence inference
determines protonation or an optimized binding pose.

Consequences: failed validation/stale targets publish no molecular change.
Original bytes remain immutable. Reuse existing reconciliation for saved
selections, scenes, measurements, appearance masks and surface sources. Preserve
D-028 monotonic allocators through Undo/Redo and branching. No new persisted
action discriminator or schema major is planned; actual v0.15.0 reader proof is a
release gate. Full contract and approved exceptions live in the issue #69 plan.

## D-100 — Selection-driven Edit panel and captured target ownership

Date: 2026-10-16. Status: accepted by explicit approval of the issue #69 plan;
runtime implementation not started.

Place Edit beside Transform and keep its compact Atoms/Bonds/Fragments/Residues
panel nonmodal and open for successive actions. Canonical selection supplies all
operands; never default to the first entry/residue. Resolve bonds from exactly
two canonical endpoints and qualify native bond-hit mapping without adding a
persisted bond-selection schema. Reuse existing standard-amino-acid mutation;
omit Grow until separately implemented. Keep advanced inspector tools accessible.

Introduce an additive typed selection-driven API under `/api/v1`, capturing
project revision, current artifact, complete operand selection and bounded action
parameters. Existing ligand/protein endpoints retain behavior. The service owns
eligibility, complete preparation and one publication; the viewer remains a
disposable renderer. Record the actual operand selection in history.

Own panel state transiently above responsive remounts. Guard async work by its
captured project/artifact/selection: a late response must not mutate another
project's UI or overwrite a later selection. Preserve surviving references and
explicitly map substituted H to replacement; do not select all new H. Opening or
browsing tools creates no chemistry command. Existing hydrogen display settings
remain presentation commands with visible isolation/atom-hide limitations.

Canvas gestures keep normal selection/navigation. Active movement blocks
chemistry edits until explicit completion/cancellation. Reuse focus handoff and
warning lifetime ownership from D-089/D-093 rather than introducing competing
timers or focus restoration. Require labelled, keyboard/touch-accessible controls,
explained availability, full scientific feedback and light/dark/narrow/zoom tests.

Rationale: rapid editing needs one selection authority, explicit tool ownership
and atomic backend edits. Panel visibility, native loci or late closure state
cannot become molecular targets or overwrite newer workspace intent.

Consequences: no durable panel state, new job/plugin type or migration. Project/
viewer/archive2 and normalized/selection1 remain; head0014 stays. Planned minor
0.16.0 adds meaningful functionality while retaining prior contracts, subject to
actual reader and complete candidate/exact-master release gates. C0 records the
approved plan/decisions only and stops ready for `/goal`.

### D-098–100 implementation note — issue #69 M1/C1, 2026-10-16

`/goal` now authorizes implementation and complete delivery. The additive
selection-edit service uses the existing generic `entry.molecule` action with an
explicit captured operand snapshot. New-ID bounds and duplicate/order/aromaticity
guards reject before RDKit's permissive conversion defaults. Component membership
is indexed once rather than scanning all atoms for every component; no whole-
protein chemistry validation is introduced.

Local H reconciliation retains viable existing H and removes only surplus H,
then fills deficits on affected atoms. New geometry uses 0.65–1.35 covalent-radius
sums, hybridization angle screens and a0.4Å overlap refusal. These are documented
admission checks; fixed legacy collinear input can reject rather than silently
moving its heavy atoms. The reproducible positive3D fixture and synthetic complex
archive are scientific test inputs, not a preparation/import capability.

Raw tetrahedral tags depend on bond-neighbor order. Retained supplied supported
centers are re-perceived from fixed3D geometry after normalized bond ordering,
with explicit review warnings; CIP-priority changes do not imply inversion.
Unsupported encodings reject. App-owned pending state blocks competing workspace
mutations; project/selection/revision guards own response feedback and replacement.
Desktop/mobile C1 workflows pass. Broader lifecycle, science and actual old-reader
qualification still require C4/C5; no migration or compatibility claim is inferred.

### D-099 implementation note — issue #69 M2/C2, 2026-10-16

Fragment-v1 embeds only six methyl-capped templates with pinned ETKDGv3 seed690
and200iterations maximum. Remove cap/H, align the root axis by a proper rotation,
set attachment length by covalent radii and compare six60° torsions against
retained non-anchor coordinates. Fixed heavy atoms and complete template H remain
explicit; deterministic first-best ties, method/template/seed provenance and final
distance/angle/overlap validation are qualified. No parent embedding, implicit
minimizer or fusion builder is introduced.

Endpoint bond controls reuse canonical atom selection. Real native bond-loci hits
map to exactly the normalized pair at Atom granularity, with unchanged camera;
no new persisted bond reference is needed. Creating a bond requires nearby
unbonded heavy endpoints inside the closed component; aromatic direct changes and
order changes requiring E/Z decisions reject. Local saturation can make a break
geometrically impossible at fixed coordinates and then rejects the whole edit.
Disconnected accepted results warn that subsequent building needs connected
topology. Generic artifact actions, publication and monotonic allocation remain
unchanged, including all pre-tagged fragment IDs and generated H in one allocator
advance. C2 science/API/native gates pass; C3/C4/C5 remain required.

### D-100 implementation note — issue #69 M3/C3, 2026-10-16

The residue action resolves exactly one complete canonical amino acid and calls
the existing protein editor before the same generic molecular publication. Return
transient `selection_after` for complete new-residue selection or surviving/mapped
small-molecule operands. This avoids another molecular fetch for selection and
does not become project/checkpoint/archive data. The client retains captured
project/revision/selection guards. Existing low-level edit routes and template
semantics remain unchanged; all20 targets are qualified through the new route.

Use a portal bounded to the viewport and observed notice geometry; coalesce
resize/mutation work by animation frame. Pending actions focus a stable container
before controls disable. Keyboard opening and responsive owned-focus restoration
use transient intent, reset on project change; outside interactions keep focus.
Opening Edit suppresses outgoing Style restoration; other tools/movement close
Edit without competing focus restoration. Numeric preview blocks chemistry.
Coarse44px targets, persistent warning disclosures, current-type no-op availability
and native selection/mutation/Undo are qualified on desktop/mobile in both themes
and320px. Source identity, schema majors and migration head remain unchanged.
Real200% zoom, broader lifecycle/scientific/compatibility and release gates still
belong to C4/C5. These C3 checks are local self-review, not independent review.


### D-098–100 qualification note — issue #69 M4/C4, 2026-10-16

Use fixed 3D geometry as stereo authority only after refusing unspecified potential
stereo and conflicts between source tetrahedral tags and coordinates. Rebuild the
edited component in final serialized atom/bond order before assigning tetrahedral
tags. New centers receive inferred stereo fields, center IDs/method provenance and
review warnings. Opposite enantiotopic H substitutions and CIP-priority changes
are qualified separately from geometric inversion. Unsupported E/Z remains refused.
Nonfinite surrounding coordinates refuse clash validation without publication.
The compact residue route refuses explicit side-chain crosslinks before template
replacement; legacy routes retain their prior behavior.

Native qualification reproduced a camera reset when an ordinarily focused ligand
crossed a responsive viewer remount. Retain only the active project's camera in a
transient presentation store, seed the new disposable viewer before its first
scene load, and clear on project change. This avoids a queued initial fit winning
over late restoration, without putting molecular state into the viewer or changing
persisted scenes. Movement retains its existing transaction camera authority.
Artifact-query failure uses explicit retry, consistent with the viewer's query;
late edit responses retain project/revision/selection guards. Audit modification
timestamps advance during Undo; artifact bytes and reference content restore
exactly. No schema/migration/legacy API changes are introduced by these refinements.


### D-100 release-review note — issue #69 M5/C5, 2026-10-16

Project ID alone does not own an asynchronous UI operation after leaving and
returning to the same project. Each active-project change advances a transient
editing-session generation. Capture it at submission; only matching current
project/generation can publish feedback, clear pending, change selection or show
completion/error notices. Project-cache acceptance still follows revision ordering,
including inactive owners. Responsive remounts keep the same generation. A red/green
component regression reproduces old completion clearing a newer pending edit;
native qualification holds two server-committed responses across a project roundtrip.
No API, molecular state, schema or version impact changes.

The full candidate gate found a mobile target-size failure where a vendor screenshot
popup overlapped the new Edit launcher. Observe the complete application header's
actual bounds and reserve that clearance above vendor popups, rather than assuming
the picking toolbar has fixed height. Keep popup scroll bounds, launcher hit targets
and keyboard access at responsive widths and real zoom. This is presentation-only
layout; no molecular/viewer state is copied into React or persisted.

The static theme contract also requires every consumed CSS variable to have a
source declaration. Declare the geometry clearance's72px fallback in the viewer
scope; keep its measured inline value transient. No assertion is weakened.


## D-101 — Direct molecular edits preserve incomplete chemistry

Date: 2026-10-16. Status: accepted by explicit approval of issue #74 plan.

Direct atom/bond editing operates on normalized records independently of source
format, navigation category and complete chemistry. Unknown remains unknown.
Requested incomplete/over-valent/aromatic/stereo states publish with scientific
warnings, not blanket sanitization rejection. Structural integrity, locks,
revisions/artifacts, stable IDs and resource limits still apply. Direct element
assignment retains identity/coordinates; deletion removes selected atoms and
incident bonds only. Optional H completion defaults off and cannot block the
requested direct change or reverse explicit H deletion. Chemistry helpers retain
operation-specific prerequisites. No whole protein is sanitized as a ligand.

This explicitly supersedes the mandatory preparation/sanitization/saturation and
closed-component restrictions of D-028/D-098/D-099 for the new direct service.
Their legacy API contracts and historical rationale remain. D-002/005/007/018/
020/029 and captured UI ownership remain authoritative. Full scope is in
[issue #74 plan](plans/issue-74-direct-molecular-modeling.md).

## D-102 — Navigation membership is not a molecular-edit boundary

Date: 2026-10-16. Status: accepted by explicit approval of issue #74 plan.

Preserve source-based navigation hierarchy (D-045), but do not constrain direct
edits to its categories or closed components. Explicit same-entry connectivity
can cross residues, ligands, protein and unclassified material. New generated H
inherit valid bonded-parent membership. Historical orphan H with an unambiguous
explicit heavy parent derive membership without artifact rewrites or proximity
inference. Ambiguous atoms remain visible/editable. Combining entries is excluded.

## D-103 — Render and persist authored draft topology independently of chemistry

Date: 2026-10-16. Status: accepted by explicit approval of issue #74 plan.

Viewer projection must display incomplete normalized states without chemistry
normalization. A display-only non-kekulizing ligand projection and application-
owned bond overlay retain authored orders and suppress explicitly removed native
inferred display bonds. Versioned neistra_modeling metadata stores stable endpoint
exclusions in the same immutable artifact/history transaction; additions/deletions
reconcile it. Viewing inferred bonds assigns no chemistry. Preserve native protein
display inference elsewhere. Mol* remains disposable, not molecular authority.

New generated entries use existing nullable original/source fields and explicit
provenance. Native archives/save/Undo must preserve all draft values and empty
entries; chemical-format export reports limits rather than repairing chemistry.
No top-level schema/database migration is planned. Actual v0.16.0 data/history/
archive reader qualification must distinguish its unsupported draft rendering/
chemistry from lossless retention; unrestricted runtime rollback is not promised.


### D-102 implementation note — issue #74 C1, 2026-10-16

Historical H membership derives only for an orphan H with exactly one explicit
bond to a heavy parent whose residue exists. Add those atom IDs to the parent's
navigation component with fallback provenance and an informational warning;
keep original atom/residue records unchanged. Ambiguous/unbonded/H–H cases stay
unclassified. The legacy H generator now assigns each new H its own bonded
parent's residue, including multi-residue ligand entries. Existing single-residue
standalone atom-add behavior remains. No migration or blanket chemistry-policy
change occurs in C1; direct editing belongs to C2.


### D-101/103 implementation note — issue #74 C2, 2026-10-16

Direct operations have a distinct model-edits API and normalized-record service.
They share one immutable publication/reconciliation path with legacy selection
edits, retaining legacy HTTP semantics. Absolute nullable charges and nullable
bond orders avoid interpreting unknown as neutral/single. Canonical atom identity
survives element assignment, including H. Literal deletion can leave an empty
entry; structure display skips an empty native model.

The version1 neistra_modeling namespace marks authored states and stores explicit
stable endpoint-pair bond exclusions. The disposable Mol* decorator merges
canonical edges with baseline native protein inference, then suppresses exclusions.
It owns a fresh dynamic bond cache, retaining other native polymer properties;
coordinate preview updates reuse the fixed authored graph. Display-only SDF uses
non-kekulizing output and never writes its representation defaults into normalized
chemistry. Local warnings do not certify a chemically valid graph. No migration.

### D-101/102/103 implementation note — issue #74 C3, 2026-10-16

New molecule records a generic reversible model.create command using existing
entry.create/delete actions. Its first atom is explicitly chosen (visible C/zero
defaults) at the origin, with generated source facts, a LIG residue and nullable
entry source/original fields. There is no fabricated upload. Empty entries keep
their identity/history and require an explicit target for rebuilding. Advanced
manual atom/bond controls now translate to the direct service; chemistry helpers
retain their existing HTTP behavior. Remove the inspector's first-ligand fallback
and display unknown charges as unknown rather than a silent zero default.

Placement uses canonical record operations plus six deterministic local directions
and the six existing methyl-capped ETKDGv3 seed690 fragment templates. Six torsions
rank rigid placements against retained material; user rotation is a bounded offset.
Only the template is embedded, never a protein/parent. Generate each conformer's
new positions independently while retaining every old coordinate exactly. Clashes
warn, not reject. New records inherit their actual anchor's valid residue. This is
unoptimized placement, not protonation, conformer search or preparation.

The read-only preview endpoint computes the same candidate without publication or
allocator advancement, returning string ghost identities and coordinates rather
than new canonical atom operands. The native preview is a nonpickable shape outside
the molecular model map. Context includes project visit, revision/artifact,
selection and H policy; input/tool/movement/context changes invalidate it. Cancel
removes only the proposal. Creation responses and focus obey captured ownership;
closing a pending creation leaves any server-stored result in its original project.

Optional H completion consumes only new H and their bonds from the eligible helper
candidate. It never normalizes retained atom/bond/stereo/coordinate records, removes
retained atoms, exceeds the entry resource limit or reverses explicit H deletion.
Failure preserves the direct draft with a skip warning. Legacy helpers are unchanged.

Native XYZ qualification exposed an existing import assumption: RDKit's neutral
atom defaults were retained even though XYZ encodes no formal charge. New XYZ
imports now retain null charges, an explicit warning and no assumed canonical
SMILES descriptor. Original bytes and historical saved structures remain exact;
there is no automatic reinterpretation or migration. This is within D101's
unknown-chemistry contract, not expanded malformed-file acceptance or chemistry
inference. Existing schema/API shapes already support null values.

### D-101/103 qualification note — issue #74 C4, 2026-10-16

Direct edits remain permissive; chemical-format export is a separate representability
boundary. Native artifacts preserve nullable charges/orders, unusual charges,
explicit bond exclusions, generated/empty entries and all conformers exactly.
MOL/SDF/MOL2 representation defaults for unknown charge/order need explicit loss
acknowledgement. SMILES requires assigned valid chemistry; unrepresentable draft
writers return typed refusals rather than repairing a graph or publishing a partial
export. Modeled MOL2 derives current types instead of copying immutable source types.
PDB refuses overflowing charge/serial/coordinate fields. Sparse stable identities
use the maximum ID as the mmCIF model serial stride, avoiding duplicate row IDs.

Disposable ligand display may substitute a representable charge for an integer
outside its C++ field; exact canonical charge remains in inspection/artifacts.
Unusual charge warns. Unknown attachment radii use an explicitly warned unoptimized
1.5 angstrom fallback. New atoms inherit the anchor's alternate-site label (terminal
H replacement prefers that H's label); no alternate site is chosen automatically.
Bond stereo labels can depend on remote substituent priorities: conservatively
unassign them in the edited explicit connected graph, with warning, while retaining
disconnected annotations. Local tetrahedral tags remain outside that broader rule.
No whole-parent chemistry normalization or distance matrix is introduced.

Placement inspection temporarily collapses the full panel into a bottom-docked
nonmodal bar; Tools restores inputs and warnings without losing the proposal.
Theme-adaptive ghost colors and labelled 44px controls keep native proposals visible
at narrow widths/real zoom. This remains compact-panel building, not canvas drawing.
The actual tagged v0.16.0 reader qualifies data/history/archive retention separately
from its expected broken-aromatic renderer and chemistry-helper refusals. Do not
promise unrestricted runtime rollback or strip new draft data. No migration.

### D-101/103 additional qualification findings — issue #74 C4, 2026-10-16

A broad native zoom run reproduced lost focus when a closed Edit launcher was
replaced by the responsive viewer mount between focus and Enter. Preserve captured
launcher focus for the same project visit across that remount; do not reopen a
closed tool or override another control's newer focus. Deterministic component and
native breakpoint regressions supplement the actual zoom test. Failed/interrupted
runs remain diagnostic and require a new passing source-bound milestone gate.

Literal H-free drafts expose another real representation boundary: MOL/SDF/SMILES
readers interpret absent H using valence defaults even after explicit H deletion.
Three regression exports demonstrate that interpretation without changing canonical
atoms. Add a blocking explicit warning requiring acknowledgement rather than
claiming those formats preserve the literal draft as protonation intent. Native
archives retain the exact graph; this does not change direct deletion or add H.

## D-104 — Retain identity allocation floors across entry recreation

Date: 2026-10-16. Status: accepted implementation of issue #74's approved monotonic
identity contract, found during final local self-review.

Undoing an allocation, then undoing/recreating its entry could reset the row's
counter and reuse an earlier atom/bond ID on branching. A real API probe and five
regressions reproduce it for generated/imported entries and legacy helper edits.
Read floors from the existing bounded retained entry.create/entry.molecule action
paths as well as the live row. Core editors receive that floor; publication advances
past actual created IDs, including a branch that first changes only an element.
Preview/refusal reads do not reserve or persist any identities.

Within the same command transaction, retain higher floors in existing entry.create
snapshots before molecular publication/recreation/deletion. Allocation bookkeeping
intentionally never undoes; chemical artifacts, original uploads, other action
values and history counts stay exact. This lets generic recreation survive later
branch truncation without a new table, namespace or schema migration. Inspect only
known action paths, never recursively rewrite arbitrary metadata. Legacy helper
chemistry prerequisites and HTTP shapes remain unchanged.

The actual v0.16.0 reader qualifies retained floors through generic new-command
Undo/Redo and archive re-export. Its older authoring does not implement the new
floor propagation for future writes; use the current version for continued editing.
This supplements the existing expected old-renderer/helper limitations, not a claim
of unrestricted runtime rollback or retroactive repair of already-reused IDs.

## D-105 — Operation-specific additive hydrogen proposals

Date: 2026-10-17. Status: accepted, issue #77.

Replace the optional direct-edit completion dependency on prepared-component
eligibility with a focused typed domain service. It proposes additive H per site,
using request-scoped canonical adjacency and bounded chemical contexts. Navigation
categories, original format and covalent component boundaries cannot gate building.
Unknown incident chemistry remains unknown and produces a precise skip. Independent
sites can succeed; all conformers of one site succeed together. Publication retains
existing immutable artifacts, generic single-command history and allocation floors.
No new database/normalized schema or chemistry-plugin framework is necessary.

Budgets and truncated diagnostic counts are explicit. Existing H and coordinates
are never removed/repositioned by completion; optional failures retain direct edits.
The legacy preparation helper and its HTTP eligibility remain unchanged. This
supersedes D-103's optional helper-consumption implementation within this scope.

## D-106 — Authored geometry, chemical interpretation and stereo intent

Date: 2026-10-17. Status: accepted, issue #77.

The normalized draft and its immutable source facts serve different purposes.
Missing information is not a prepared chemical state. Building, completion,
preparation, analysis and export have separate prerequisites and claims, documented
in MOLECULAR_MODEL.md. Current stereo for H building follows retained geometry after
consistent H representation in a bounded temporary analysis. Reconcile affected
current annotations, warn on changes, preserve source facts and disconnected labels.
Conformer disagreement clears a universal current assignment; absent tags alone do
not block building. New configurations unsupported by retained geometry need an
explicit preview choice. Add N/geometry choices describe this operation, not future
persistent constraints or a preparation certificate.

### D-105/106 interface qualification — issue #77 C2, 2026-10-17

Explicit H actions use the additive model route with policy preserve, share the
read-only placement protocol and recompute on Apply. Zero-addition responses are
applied=false and cannot publish a warning-only artifact, advance revision or clear
Redo. Reports are transient; successful additions retain choices/geometry and
scientific assumptions in ordinary inference records and durable warning summaries.
General inspector H building opens this same preview rather than invoking a second
chemistry implementation. Operation choices reset with the project session; source
facts, old helper endpoints and protein preparation semantics are unchanged.

### D-105/106 qualification hardening — issue #77 C3, 2026-10-17

Synthetic regressions reject contradictory aromatic flags/orders rather than
normalizing them in a temporary context, and diagnose coordinates whose numerical
precision cannot represent a new H bond. Request-scoped coordinate arrays are
cached once per conformer alongside spatial indexes; initial repeated array
conversion was eliminated before release. Shared public frame/radius helpers serve
both atom/fragment placement and H building without changing their semantics.

Count and stereo stages share the analyzed-atom budget. Temporary consistent-H
stereo assessment processes one conformer at a time and shares the generated-H
coordinate-row budget with actual additions. Resource/chemistry-limited assessment
cannot discard supported H additions; it warns and clears dependent current labels
where necessary. Coordinates/source facts remain exact, and no preparation or
universal conformer agreement is claimed. This qualifies the existing bounded
proposal contract without adding a schema, persistent constraint or new engine.

### D-105/106 adversarial qualification — issue #77 C3, 2026-10-17

Failed site admissions still consume their complete generation-work allowance;
late conformer failure cannot repeatedly reuse the same budget. Stereo assessment
charges repeated conformer atom visits as well as temporary H coordinate rows.
Canonical oversized component closure is cached even when chemical perception is
refused, and conjugation checks use precomputed incident pi-bond counts rather than
repeated scans of a shared high-degree neighbor.

Actual planar-neighbor and collinear-alkene probes exposed false current stereo
from temporary analysis H. Require retained geometric evidence for current atom/
bond orientation, clear unresolved labels with a specific warning, and skip
undetermined automatic trigonal placement. Explicit draft placement remains usable
without a stereo certificate. Conformer disagreement also receives an explicit
warning even when the incoming current tag was already absent. Original source
facts and retained coordinates remain exact. These regressions qualify the approved
geometry-first policy, rather than relaxing preparation or inventing configuration.

### D-105 UI qualification — issue #77 C3, 2026-10-17

Only zero-addition standalone H proposals disable Apply. A zero-H report from
optional completion cannot disable a valid ordinary atom/fragment proposal; its
base edit remains independently applicable. A component regression and actual
unknown-chemistry P attachment with optional completion enabled cover this boundary.
New previews clear prior result feedback, avoiding duplicate obsolete reports.

### D-105 batch contact qualification — issue #77 C4, 2026-10-17

A retained-only index missed overlaps between H generated at separate sites in one
operation. Build one combined retained/proposed contact index per conformer after
site admission, query excluding each proposal itself, and attribute warning counts
back to canonical parents/conformers. This preserves the one-index/no-pair-matrix
bound and every coordinate while covering new/new contacts as well. Contacts warn;
they do not reject the scientist's draft. A two-site overlaid synthetic regression
and the existing real4097-site index/array budget test qualify the correction.


## D-107 — Operation-specific bond hydrogen reconciliation and protection evidence

Date: 2026-10-17. Status: accepted by explicit approval of issue #81 plan.

The approved [issue #81 contract](plans/issue-81-local-hydrogen-reconciliation.md)
adds a distinct destructive endpoint-local reconciliation policy for heavy-heavy
bond edits. The UI defaults to immediate reconciliation with visible add/remove/move
wording, Preserve H and optional preview. Existing omitted API policy stays preserve;
complete_if_possible and standalone completion/Add N H retain additive-only meaning.
Unsupported sites retain the valid requested bond edit and receive diagnostics.
No preparation, protonation inference, heavy-atom optimization or global repair is
implied. D-101/D-105/D-106 remain unchanged for their historical operations.

C1 records narrow isotope/radical identity evidence in normalized annotations with
kind neistra_hydrogen_protection, schema_version 1, origin import/generated/
original_recovery and typed atoms (atom_id, element, source_index, isotope,
radical_electrons). Zero denotes no explicit source isotope/radical annotation;
null means unavailable evidence. Ordinary protium may also have explicit mass 1.
These are protection facts, not new canonical editable chemistry fields. Chemical
export warns about unsupported protected facts; native artifacts/archives retain
all records. IDs remain provenance even if an atom is later deleted. Element/index
mismatch invalidates applicability; malformed or conflicting facts cannot prove
ordinary H. Unrelated annotations remain untouched.

Older source evidence can be recovered from preserved originals only by matching
record/format and stable import ID plus element/source index/residue/alternate
identity. Never recover through mutable names or spatial proximity. Reads/previews
do not publish; successful edits may persist recovered facts in their artifact.
Unknown evidence conservatively skips reconciliation. Generated ordinary atom/H
placement records its explicit identity at creation. No migration or top-level
schema change; actual preceding-reader retention must be qualified before release.

### D-107 implementation note — issue #81 M1/C2, 2026-10-17

A separate typed reconciliation function uses shared public count/coordination/
current-stereo helpers without changing additive semantics. It strips only endpoint
H in its temporary count context, stages every conformer before site materialization,
retains lower H IDs and chooses minimum-displacement equivalent positions with
stable ties. All heavy/unrelated coordinates stay exact. New potential tetrahedral
configuration requires retained unambiguous orientation; atom-ID ordering cannot
choose an enantiomer. Protected source identities and nonterminal/charged H skip
whole sites. Nonaromatic supported states are the initial automatic profile;
aromatic changes remain draft edits with diagnostics, not automatic ring repair.

The optional report and moved-atom preview extend existing model routes. Existing
omitted preserve and additive policy retain semantics. Original-source recovery is
bounded by existing file/atom limits and only used when required facts are missing;
preview reads never publish. The existing artifact transaction and deleted-atom
reference reconciliation own exact Undo/Redo. Metadata bond exclusions are pruned
against retained atoms after H removals. No new schema, dependency or job mechanism.


### D-107 implementation note — issue #81 M2/C3, 2026-10-17

Bond hydrogens use a separate transient preference, default reconciliation on each
project visit, independently of additive atom/fragment completion. Bond controls
apply immediately; optional preview captures the same explicit action/policy and
uses ordinary Apply recomputation. New moved-H lines/ghosts and removed-H crosses
are nonpickable transient shapes, never canonical coordinates or identities.
Preview responses add old-coordinate removal records for that rendering purpose.
Feedback carries project-visit ownership, and policy changes/cancellation invalidate
pending previews; no late response may resurrect a previous proposal.


### D-107 qualification note — issue #81 M3/C4, 2026-10-17

Collinear heavy neighbors cannot establish a new trigonal plane in substituted
triple-to-double changes. Reconciliation now skips those sites precisely while
retaining the direct bond draft. Potential tetrahedral choices require protection
identity evidence for the complete bounded dependency context, including endpoint H
removed only in a temporary counting projection; temporary stripping cannot erase
an isotope dependency. Narrow labelled/radical imports now explicitly warn about
protection-only retention rather than implying full canonical chemistry support.
Full canonical isotope/radical identity and chemical export are tracked by #83.

Scientific qualification covers supported charge/heteroatom/halogen profiles,
radicals/isotopes/unusual H, sparse IDs, nonfirst active conformers, alternate and
covalent residue boundaries, failed-work budgets, actual coordinate/diagnostic caps
and fixed real-protein context. Removed-H selection/measurement/style/scene
references restore through existing generic Undo; operational modified timestamps
retain existing history semantics. Source recovery is verified through an actual
old-style import with raw original bytes and mutation-free preview. The actual
v0.18 reader harness additionally exercises destructive/additive/partial protected
commands in independent conformers and rich existing project state.


C4 explicit-label qualification: every explicit isotope mass, including mass1
protium, is protected. This supersedes C1's implementation allowance for explicit
mass1 as ordinary. The approved contract requires ordinarily unlabelled H; chemical
equivalence to natural H cannot discard a scientist's explicit source label. Only
isotope0/no explicit label and zero explicit radical electrons establish ordinary
identity for destructive reconciliation. Native source facts remain unchanged.


C4 protected-priority qualification: chemical projections do not implement canonical
isotope/radical fields. New reconciliation therefore assigns current stereo only
for complete bounded contexts with ordinary known identity evidence. Protected or
unknown contexts retain the direct edit's conservative unassigned current labels
and gain a precise diagnostic; geometry/source facts remain authoritative. This
prevents isotope-dependent CIP priorities from producing a falsely inferred E/Z
label after otherwise supported H removal. It does not expand #83 into this issue.


C4 native focus qualification: an actual320px hit test exposed the focused bond
policy hidden beneath the sticky Edit header after preview cancellation. Scoped
scroll-padding keeps focus targets below the header. Regression tests verify actual
hit testing, not focus state alone, in both themes alongside existing real zoom and
editing accessibility. No global layout or interaction ownership change is made.

## D-108 — Qualified local minimization uses a bounded integrated parameter model

Date: 2026-10-18. Status: accepted by approval of the issue #82 plan;
implementation not started.

The [approved feature plan](plans/issue-82-selection-minimization.md) extends
D-003/D-031's original limited use of protein chemistry tooling only for an
explicit local-minimization operation. Use one versioned `amber-local-v1` model:
ff14SB for complete supported protein states, GAFF 1.81/AM1-BCC for supported
organic molecules, and TIP3P for explicitly included complete waters. Integrate
parameter generation through a separately locked AmberTools 24.8 CPU toolchain;
retain the existing uv application environment and OpenMM 8.4.0 pin. Qualify Linux
x86-64 first. No job installs packages or downloads parameters.

OpenMM supplies energy and forces; existing SciPy L-BFGS-B optimizes a reduced
selected-coordinate vector. Fixed atoms are never optimizer variables. Verify the
final movable gradient independently of the solver's termination flag. Record
model terms/units, charge convention, parameter/tool/data checksums, work,
convergence and limitations. Qualification of this exact combination is a hard
C1 gate; no weaker fallback may substitute for failure.

Parameter assignment is distinct from chemical preparation. Require complete,
unambiguous topology and explicit-H patterns; raw PDB/Mol* display inference is
not calculation topology. Do not add/delete atoms, invent canonical bonds, assign
missing ligand orders/charges, choose protonation or replace current coordinates
with parameter-generation geometry. Uncovered, ambiguous or unsupported chemistry
refuses the complete calculation with actionable diagnostics. Incomplete drafts
remain editable under D-101/D-106.

Initially refuse metals, unsupported ions/cofactors, nonstandard residues,
unsupported crosslinks, isotope/radical uncertainty and covalent protein–ligand
adducts. The user explicitly chose integrated parameters and deferred covalent
adducts; create one focused follow-up before implementation merge. D-102's
entry-local topology is unchanged; no implicit cross-entry bond representation is
introduced. Broader preparation/ligand assignment/building remains #12/#52/#71.

Native tooling executes only fixed allowlisted programs with generated inputs in
managed directories, configured through `MOLWEAVE_AMBERTOOLS_PREFIX`. Extend the
existing controlled job boundary to supervise subprocess descendants through
cancellation, deadlines and worker/child loss. Scientific parameterization does
not permit arbitrary user commands. Exact limits, package build, evidence and
release gates live in the feature plan. Historical MMFF/UFF cleanup contracts and
protein template operations retain their existing behavior.

## D-109 — Explicit complete context and captured active conformers bound minimization

Date: 2026-10-18. Status: accepted by approval of the issue #82 plan;
implementation not started.

Capture the central canonical selection, immutable input artifacts and one
explicitly confirmed active conformer per entry. Empty selection is invalid;
unselected atoms, including H, remain fixed. Do not silently expand movable
selection. A temporary calculation assembly may span entries without merging
their persisted molecular state. Navigation categories and renderer state do not
define chemistry or calculation membership.

Default to isolated mode, including the complete selected covalent molecule as
necessary fixed/movable context. Environment mode explicitly adds chosen complete
protein chains/molecular components, including hidden material. Nearby-candidate
discovery at 12 Å is not a crop or automatic inclusion policy. Show included and
excluded context, movable/fixed counts and conformer pairing before submission;
mandatory covalent closure cannot be excluded. Never combine every loaded entry
or use visibility/hydrogen-display settings as physical-input filters.

Preserve complete chosen-chain topology, crossing bonds/angles/torsions,
exclusions and scaled 1–4 interactions; no artificial termini or caps. Isolated
bounded molecules use uncropped nonperiodic nonbonded evaluation. Environment
calculations use nonperiodic 12 Å cutoff, 10 Å Lennard-Jones switching and
reaction-field dielectric 78.3, with engine neighbor updates as atoms move.
Report finite-range/omitted-context approximations rather than suggesting a full
solvated or long-range model. Distance-cropped calculation shells are deferred
unless measured need justifies a separately approved design.

Only captured selected coordinates in captured active conformers may change;
inactive conformers stay exact. This is specific to the new minimization
operation and does not change D-025/D-075's existing all-conformer transforms.
Multi-entry pairing requires explicit confirmation; unresolved alternates or
incompatible states refuse. Batch conformer optimization is deferred. Current
coordinate/stereo intent is validated rather than silently choosing a new
configuration; local convergence does not certify a native conformation, binding
pose, preparation state or clash elimination.

## D-110 — Background minimization proposals apply atomically to existing entries

Date: 2026-10-18. Status: accepted by approval of the issue #82 plan;
implementation not started.

Reuse D-036's generic immutable-input job lifecycle and allowlisted execution for
`coordinates.minimize`. Add focused typed capability, submission, proposal/report
and Apply interfaces under `/api/v1`; do not build a universal engine framework.
Expensive preflight, parameterization and optimization stay outside HTTP/UI work.
Completion produces an inspectable result, never a canonical mutation. Distinguish
blocked, failed, non-converged, converged and unchanged outcomes. Non-converged
proposals may be inspected but cannot Apply.

Application-owned session state captures project/selection/context/conformer
ownership above responsive remounts. TanStack Query owns server results; Mol*
renders a disposable nonpickable preview. Preview cannot enter canonical query
data, exports or molecular artifacts. Later selection/camera/project changes do
not retarget jobs or revive discarded presentation state. Existing tool ownership,
focus, accessibility and derived-geometry invalidation remain binding.

Apply validates result integrity, project ownership, every captured source/context
artifact and identity, current expected revision and movable-entry locks before
publishing any molecular changes. Fixed context may be locked. Unrelated project
changes are permissible only when captured dependencies remain exact; changed
dependencies require rerun rather than silent rebase. Failures, cancellation,
rejected Apply, coordinate no-ops and repeated Apply cannot create misleading or
duplicate molecular history.

Extend molecular publication to a batch while retaining existing callers. One
command uses recognized `entry.molecule` actions and affected-entry patches to
switch exact before/after artifacts across entries. Preserve topology, all stable
identities, unselected rows, inactive conformers, source facts, original bytes and
user metadata. Append operation provenance/warnings separately and invalidate
measurements/surfaces/interactions/projections through existing paths. D-036's
ordinary result import continues to create new entries; minimization Apply is an
explicit distinct operation, not an import shortcut.

Use existing job/artifact storage and versioned extensible normalized annotations.
No new persisted action kind, database migration or top-level schema is planned
(Alembic0014; project/viewer/archive2; normalized/selection1). Native archives retain
inputs, parameters/reports and application provenance as historical records;
archived proposals cannot Apply against remapped entry identities. Archives still
omit portable Undo history. Actual tagged v0.19.0 reader qualification must prove
retention; it does not promise old-runtime authoring support for minimization.

The approved release target is stable minor0.20.0, subject to collision checks,
full candidate and exact merged-master qualification. All five authoritative
versions advance together in the implementation PR. Planning approval/persistence
does not mean this feature works, has passed scientific tests, or has shipped.
Stop after C0 and await `/goal`.

### D-108–110 implementation note — issue #82 C1, 2026-10-18

The user's `/goal` starts implementation after the verified C0 documentation
handoff. C1 adds the opt-in isolated calculation plugin and existing-runner
subprocess-tree ownership; C2 context, C3 Apply and C4 UI remain unimplemented at
this checkpoint. There is no schema/migration or authoritative application-version
change. An explicit 137-package URL/SHA256 lock installs AmberTools outside the uv
application environment. Runtime checks record/validate the dependency fingerprint
and 25 actual program/wrapper/scientific-data hashes; these selected files are not
prefix-relocated in the approved package, allowing installation at another prefix.

Parameter generation uses complete specified organic graphs, explicit H and
ordinary identity evidence. Retain native raw charges and calculate a uniform
rounding offset to the already specified formal net charge. Reject nonfinite or
larger discrepancies than `min(0.05, 0.00051 * atom_count)` elementary charge.
The correction is recorded in the report and raw/corrected MOL2 files, never in
canonical formal charges. Uniform normalization follows the established
[OpenFF charge-bookkeeping convention](https://docs.openforcefield.org/projects/toolkit/en/stable/_modules/openff/toolkit/topology/molecule.html);
the bound is Neistra's explicit conservative model policy, not an OpenFF guarantee.
SQM must complete; no parmchk2 missing-term extrapolation is attempted.

Validate generated elements, names/order, connectivity and assigned bond-order
representation, accepting equivalent aromatic encodings only after chemical
perception. The tested native carboxylate output is conservatively refused because
its bond-order representation is not qualified by this mapping. This does not
rewrite the draft or assert that the native force-field representation is chemically
wrong. Successful charged/stereo/aromatic/halogen examples are distinct fixtures;
coverage is bounded by the complete model/parameter checks, not a universal claim.

The worker establishes an owned POSIX job process group before plugin loading.
Native descendants inherit that group; cancellation escalation, deadline, child
loss and normal cleanup signal the owned group. A cooperating child detecting
coordinator-pipe EOF kills its group on exit, including native descendants.
Native thread pools are bounded before registry imports. Tests use real spawned
descendants for cooperative/forced cancellation, deadlines and coordinator/child
loss; Linux-specific process observation is explicitly scoped. Existing generic
job transport, persistence and demonstration behavior remain the regression gate.

### D-108–110 implementation note — issue #82 C2, 2026-10-18

Whole chosen protein chains are matched against the checksum-locked ff14SB native
libraries by existing named atoms, elements, explicit-H pattern and complete
canonical connectivity, including directed peptide links and compatible termini.
The match determines the calculation protonation template; it never repairs a
canonical graph or chooses pH. Only standard supported states match. Conflicting
supplied charges/orders/stereo, unsupported crosslinks/adducts, partial chains and
single-residue chains without compatible both-termini templates refuse. Existing
separate PDBFixer preparation now appends ordinary identity evidence for its own
new template-generated atoms; minimization does not assume old unevidenced atoms
are ordinary. Existing evidence and originals remain unchanged.

LEaP sequences/combinations are temporary parameter models with exact canonical
entry/atom mapping, not persisted entry merging. Validate raw AMBER labels before
OpenMM's deliberate PDB alias normalization (terminal H1 becomes presentation H),
then verify elements and all canonical bonds. Canonical H is deterministically
mapped to template H1 only at N termini. Generated native geometry is ignored;
retain actual captured start rows and reference mapping separately. ff14SB template
chirality and current/supplied molecular stereo must survive the calculation.

Environment evaluation uses OpenMM CPU/one deterministic-force thread to provide
native dynamic neighbor handling with the approved12Å cutoff,10Å LJ switch and
reaction-field78.3 model; no dispersion correction. Preserve native bonds, angles,
torsions, exclusions and scaled1–4 terms across selection boundaries. AMBER TIP3P's
auxiliary H-H internal distance is an explicitly reported engine term rather than
new canonical connectivity; waters are unconstrained, including when selected.
This is the pinned local model's flexible internal representation, not a general
solvated-water accuracy claim. Fixed waters/protein/ligands can be included;
visibility and locks do not exclude fixed context. Atom-count limits and full
membership apply independently of the12Å candidate-discovery radius.

C2 tests establish small prepared synthetic same/separate-entry context, actual
energy/force/outcome changes, movable peptide boundaries, finite differences,
scaled interactions, dynamic neighbors, explicit water and hidden/locked fixed
context through the real worker. Prepared1STP, larger-assembly performance and
full scientific coverage remain C5 gates; Apply/UI remain C3/C4. No database,
structural schema, application dependency/version or original-file change.

### D-110 implementation note — issue #82 C3, 2026-10-18

The server owns source capture; clients confirm active conformers and explicit
context atom membership, never artifact IDs/hashes as authority. Mandatory closure
adds complete covalent components and chosen protein chains so sparse topology
refuses scientific preflight rather than silently reducing membership. Generic
job submission cannot bypass this boundary. Capability inspection runs outside the
HTTP event loop; all expensive scientific work remains in the controlled worker.

Atomic Apply takes SQLite's writer lock before any dependency/retry read. This
serializes independent API-process Apply requests. Every captured current artifact,
input/result digest, identity/conformer, selected-coordinate mask, lock and
qualified report check must pass before after-artifact publication. A job-level
`minimization_application` marker joins the molecular command transaction; repeated
Apply after success or Undo refuses rather than creating duplicate history.
This does not redesign unrelated project command concurrency.

Use a batch of existing `entry.molecule` actions and exact before/after artifacts/
summaries; preserve the original single-entry method as a wrapper. New multi-entry
batches preserve topology. Multiple-entry deletion reconciliation is explicitly
unsupported because sequential pruning from original viewer/selection state could
overwrite another entry's pruning; no current minimization path deletes atoms.
Retain existing single-entry deletion/cleanup behavior. Append compact normalized
job/model/digest/conformer/selected-ID/dependency identities, while full capture,
scientific reports and model inputs remain immutable job artifacts. No action kind,
database, structural schema, migration, application version or dependency change.

Existing archive provenance marks imported jobs historical, so reports remain
inspectable but Apply refuses against remapped IDs. Do not rewrite historical
proposal atom references or silently rebase imported results. C3 archive round-trip
is distinct from actual tagged0.19.0-reader retention and final producer gates in
C5/C6. Native UI/default registration remain C4.

## D-111 — App-owned minimization presentation and explicit coordinate publication

Accepted 2026-10-18 for issue #82 C4. The minimization session lives above responsive
viewer remounts in an operation-specific transient store. It captures canonical
selection, immutable artifact identities and active conformers; generation/project
ownership guards every asynchronous continuation. Selection changes cannot retarget
work, and discarded/project-switched presentation cannot be revived by delayed
requests. Immutable artifact queries avoid querying a live entry under an old
artifact cache key. Server jobs/reports remain persistent and explicitly inspectable
from Jobs; imported historical reports never become fresh proposals.

Use the existing renderer's nonpickable geometry path through a narrowed geometry
interface, separate from canonical atoms, exports, measurements and history. Context
choices derive from canonical full components/chains, with12 Å discovery only;
visibility never selects physical context. Existing edit/movement/modal ownership
clears the transient preview. Apply remains a single server-validated transaction.

The user's subsequent explicit guidance requests an icon beside Edit and Ctrl+M
that automatically minimizes selected atoms. Provide the adjacent lightning button;
Ctrl+M captures the current selection and immediately submits default isolated,
500-iteration work, opening progress. Keep explicit Apply under the approved
proposal contract, as communicated to the user. Ignore text entry, modal ownership,
modifier variants and repeated keys; concurrent starts are guarded. Selections
spanning molecules open a diagnostic and require explicit environment choice rather
than silently adding physical context. Missing native prerequisites are visible.

Enable the dedicated plugin in the default allowlist/targets without eagerly
loading or requiring its native installation. Keep generic submission unavailable
for server-owned captures. Fix the existing jobs WebSocket to observe disconnect
while idle and clean up its reader on transport-close races; unrelated defects
remain visible. Direct ASGI lifetime tests verify cleanup rather than relying on a
test client's forced cancellation.

C4 review refinement: numerical-transform setup and minimization capture explicitly
retire each other's pending presentation. Beginning minimization also increments
the numerical preview generation, so a delayed transform source response cannot
appear afterward. Starting numerical preview dismisses minimization synchronously.
The regression exercises the actual App ownership boundary in both directions.
Read current store loading/applying state before submissions to guard rapid repeated
callbacks before a React render. This changes no calculation or publication physics.

## D-112 — Qualify local chemistry and native work before accepting minimization results

Accepted 2026-10-18 for issue #82 C5, refining D-108–110 without changing the pinned
force field, schemas or operation scope. Unknown canonical protein fields remain
unknown; explicit-H standard templates establish calculation state only. Validate
independent charged groups separately: an incorrect terminal charge cannot cancel
an incorrect side-chain charge in a matching total. Fully assigned local valence,
Kekule placement and aromatic flags must also be compatible. Preserve every
canonical field and refuse contradictions; do not choose a different protonation
state. All70 supported native internal/terminal graph states are enumerated, with
26 internal-state native parameter/force-derivative cases.

The qualified AMBER/OpenMM model emits HarmonicBondForce, HarmonicAngleForce,
PeriodicTorsionForce and NonbondedForce. Check masses, all bonded records,
nonbonded particles and exceptions for finiteness. Unknown force kinds require
explicit qualification instead of unchecked acceptance. Independently retain final
energy/gradient checks. Reject singular starts before expensive native generation,
including across entries, using a bounded spatial tree after chemistry prerequisite
classification; retain the optimizer's independent guard. Failure-injection tests
are refusal evidence, never a substitute for real native positive physics.

The independently prepared1STP benchmark preserves all901 observed protein heavy
rows and the complete159-residue SEQRES chain, explicitly modeling missing terminal
residues/H outside minimization. PDBFixer's generated terminal residues included
mirrored sites; offline preparation reflects only generated side chains into the
standard L frame before adding H. The minimizer's strict stereo validator stays
unchanged. Frozen data/procedure retain this assumption and all corrections; no
observed heavy atom is corrected. Raw1STP remains unchanged and unprepared.

Use the RCSB CCD BTN neutral acid as an explicitly chosen32-atom benchmark
microstate with original ligand heavy coordinates, assigned CCD graph and verified
three chiral centers. This is not physiological protonation prediction or anionic
biotin qualification. Strict unqualified native carboxylate bond representations
still refuse. Include every chosen complete chain; no distance crop/caps. A larger
18,208-atom fixture uses eight full chains translated60Å apart plus one ligand;
this measures bounded work, not a biological oligomer.

Measure aggregate RSS of API/test/coordinator and all live descendants at20ms,
fresh calculation processes/parameters with ordinary OS cache. Observe real SQM
before timing cancellation. Native UI latency starts at the trusted UI event and
ends after geometry/queue settlement and a frame; retain automation/JSON round-trip
latency separately. Preserve existing500ms preview/cancel and750ms longest-task
bounds, plus unchanged existing movement budgets. Do not equate automation latency
on18k transferred atom references with native preview work.

C5 review refinement: the GAFF path requires carbon-containing organic components
and refuses explicit canonical ion components. Otherwise a monoatomic halide could
receive covalent GAFF parameters instead of the separately qualified ionic model it
would need. Carbon-containing charged ligands remain eligible; explicit canonical
neutral water uses the TIP3P path. Noncarbon inorganic molecules are outside this
organic profile. This strengthens the already approved unsupported-ion boundary;
it does not add an ion model, reinterpret a ligand's charge or change draft editing.

## D-113 — Resident memory supervision and authored identity diagnostics

Accepted 2026-10-20 under the approved issue #89 plan, M1/C1. Minimization uses an
optional generic worker resident-memory budget instead of RLIMIT_AS: native mappings
can reserve large virtual ranges without resident pressure. The coordinator samples
the Linux child process tree, excluding zombies, and terminates its confirmed process
group on over-budget usage. Default minimization budget is4GiB, configured through
MOLWEAVE_MINIMIZATION_MAX_RSS_BYTES. This is sampled supervision, not hard cgroup
enforcement; existing memory_bytes retains address-space semantics for other plugins.
Allocation exceptions remain distinct from sampled budget failures. Internal
tracebacks are retained as diagnostic job logs.

Calculation identity refusal is not malformed metadata: catch the evidence parser's
errors separately from explicit domain refusals. Diagnostics retain stage/code and
available entry/atom/residue identity. Never infer ordinary identity from coordinates
or erase protected/unknown facts. Selection/legacy ligand atom generation records
explicit authored ordinary identity. Element replacement updates applicable ordinary
evidence to authored provenance; protected/unknown/conflicting evidence stays protected
or invalid. Direct model element edits use the same bounded helper. Original bytes,
prior artifacts and exact history retain preceding facts. D-107 recovery matching
remains strict; this checkpoint does not invent evidence for unknown legacy atoms.

No new structural schema, history action, migration, dependency or force-field model.
Automatic context, caching, live display and warned acceptance remain later checkpoints.

## D-114 — Automatic complete context is canonical, nonrecursive and revalidated

Accepted 2026-10-20 under issue89 M2/C2. Supersedes D-109's isolated UI default and
manual confirmation requirement only for explicitly requested automatic mode.
Minimize/Ctrl+M now request automatic capture of current active conformers. Omitted
mode on the existing API still means isolation; explicit environment/conformer
confirmation retains its meaning. New automatic captures use operation schema2;
schema1 decoding and exact serialization remain supported. No structural schema
change or force-field change; implementation version becomes1.1.0.

Union canonical bonds and full polymer chains for mandatory and optional membership.
Discover within12Å of complete mandatory components, not recursively from optional
ones. Stream candidate entries through a bounded spatial query; visibility/categories
never filter physical inputs. Capture unsupported nearby components too, so scientific
preflight refuses instead of silently dropping them. Existing atom/entry/organic
limits refuse oversized work without cropping/caps. No additional neighbors plus
one mandatory component resolves explicitly to isolation; multiple components use
the existing qualified nonperiodic environment model.

Revalidate automatic discovery against proposed final selected coordinates and current
project structures before publication, under the existing Apply writer lock. Retain
captured supersets; new required omitted components invalidate Apply. This includes
negative dependencies such as a previously distant entry moving nearby. Native
parameter generation remains in the worker; discovery/capture/proposal/Apply handlers
run off the HTTP event loop. Unknown geometry cannot establish exclusion automatically.
Advanced settings retain explicit isolation/manual context; superseding an automatic
job requests cancellation and gives the new draft a fresh generation.

No database migration/new history action; actual previous-reader retention remains
the final compatibility gate. Live display/cache/warned acceptance remain C3–C5.

## D-115 — Cache native preparation, never geometry authority or implicit charge state

Accepted 2026-10-20 under issue89 M3/C3. The worker supplies an optional managed
cache directory; minimization owns its bounded cache service without adding required
JobContext methods or a general calculation framework. Default cache is under
data/cache/minimization,2GiB of file/manifest bytes,128 entries,100MiB per entry and
the existing16MiB native-file bound. Atomic publication, digests, strict relative-file
allowlists, cooperative process locking, cancellation and orphan-staging cleanup
keep invalid/partial data out of reuse. Preparation is serialized across local
workers; optimization runs outside that lock. This matches the default local-worker
architecture and favors simple correct eviction over parallel cold preparation.

Cache native complete receptor libraries, organic charge/parameter files and assembled
prmtops. Reload/validate canonical native atom mapping, topology, current charge input,
model settings and finite qualified force parameters; never deserialize pickle or
cached viewer/optimizer state. Keys cover ordered chemistry, protonation, templates,
component composition/mapping, pinned toolchain/engine/model/settings and actual organic
charge-input text. Version the cache signature if its interpretation/model changes.

User-confirmed conservative policy: AM1-BCC depends on input geometry. Coordinate
changes invalidate that organic preparation; selection changes do not. Template-only
protein parameters can be reused across coordinates, but current coordinate/identity/
chemistry preflight still runs. Optimizer start positions always come from current
immutable captures, never cached inpcrd/template coordinates. Charge-input SHA256 and
cache origin remain provenance. Every job copies complete native files and retains
independent report/model artifacts; clearing cache cannot change existing results.

Corruption or unavailable cache causes an explained cold preparation under the same
qualified force field, never a scientific fallback or prerequisite bypass. Native
failures propagate honestly. Disable with MOLWEAVE_MINIMIZATION_CACHE=0; configure
bytes with MOLWEAVE_MINIMIZATION_CACHE_BYTES. Clear only while workers are idle.
No structural migration/schema/dependency/version/physical-model change. Cold/warm
benchmarks are preparation evidence, not a live-view qualification (C4/C5).
## D-116 — Transient minimization snapshots (issue #89 C4)

Accepted optimizer callbacks publish selected coordinates into one atomic latest
file in the existing private job work directory, bounded to1MiB and5Hz. The
callback uses the accepted iterate, never the mutable most recent objective trial.
Ordinary durable optimization progress is limited to1Hz; frames are neither job
events nor artifacts/cache/archive contents. Completion/cancellation and normal
worker cleanup end delivery; a restart never restores an interactive session.

The read-only project/job endpoint validates exact captured mapping, conformer,
capture digest and live producer/coordinator process identities (PID plus Linux
start ticks), strips private process details and sends Cache-Control:no-store.
This qualifies the existing local Linux deployment with a shared PID namespace;
an unverifiable process or changed project revision ends preview, while final
calculation/report and independently guarded Apply remain available. Transport
unavailability cannot authorize partial Apply. No DB or structural schema change.
Viewer rendering and warned acceptance follow in C5; C4 alone does not claim live UI.

## D-117 — Live coordinate ownership and warned acceptance (issue #89 C5)

Supersedes D-110/111 only for the approved interactive session and eligible new
results. Reuse selected-row native coordinate transforms, one active plus latest
pending frame, with epoch guards across every awaited entry. No canonical structures or molecular query
objects change until explicit acceptance. Cancel clears presentation immediately and
requests worker cancellation; panel close, tool/project changes and late submission
responses also end ownership. Reload/Jobs inspection never resumes live rendering.
Retain canonical IDs/picking; pause geometry-dependent displays during preview.

Interactive UI chooses a schema2 acceptance policy. The legacy API default remains
strict. Eligible nonconverged results require ordinary max-iteration termination,
finite full forces/energy, objective decrease beyond numerical tolerance, verified
mapping/stereo/fixed rows and no new nonbonded pair within the disclosed0.6Å bound.
Do not impose the convergence gradient threshold on these results; disclose their
actual residual gradient. Abnormal/line-search/evaluation-limit/timeout/resource/
cancellation outcomes never qualify. The clearly named Accept unconverged coordinates
button acknowledges that warning and submits a digest-bound acknowledgement. Record
outcome/policy/acknowledgement in existing application provenance, preserving the
same atomic Undo/Redo command. Old reports never acquire retrospective eligibility.
No structural schema/migration/dependency/physical-model change. Publication wall
time is transient latency evidence, not scientific acceptance authority.

Renderer-local job/report/frame subscriptions avoid pushing high-rate reads through
App; App retains command/capture/acceptance ownership. Preview/live presentation
changes do not subscribe App's unrelated panels. Keep approved32-ligand-atom native
performance assertions unchanged. In-browser fixed-row comparisons avoid serializing
all18k coordinates while measuring UI latency; return only bounded status/summary.
Mol* automatic quality overrides explicit detail, so the existing low-detail movement
cue must also choose custom quality. This affects transient display tessellation,
never atom coordinates, scientific parameters or persisted representation settings.
The expanded1166-heavy-atom test now passes focused native bounds. Earlier901 counts
were estimates, and exploratory latencies mixed instrumentation with the cue-quality
bug; #100 records the correction. Full C5 and release gates remain required.

Native live updates also yield on the public Mol* GPU fence API before consuming
the newest pending packet. This avoids synchronous uploads into buffers still used
by a previous draw. Abort/dispose/context loss release the fence, with a two-second
stall bound. Cancellation and explicit final-preview controls take priority and do
not wait for automatic delivery readiness. Duplicate/older packets are ignored;
immutable preview inputs do not refetch on checkbox toggles. No trajectory or
canonical molecular/query mutation is introduced by this display scheduling.

## D-118 — Verified original identity remains calculation-local

Issue #89 may recover missing legacy isotope/radical facts only from checksum-
verified preserved originals using D-107's strict source format/record, stable ID,
source index, element, residue and alternate-site matching. Existing unknown,
protected, conflicting or malformed facts are never upgraded. Coordinates and
names alone do not prove identity. Missing/invalid source evidence remains unknown.

The API creates a typed server-only schema2 capture attestation for missing facts
in captured membership. Workers validate the mapping and overlay it only on their
calculation copy. Canonical normalized inputs, annotations and original bytes stay
unchanged, including after coordinate acceptance. The immutable job/report retains
full evidence; compact application annotations avoid copying all facts. Apply also
checks the original pointer and integrity as dependencies. Legacy schema1 and older
schema2 captures omit the absent optional field exactly as before. No structural
schema, database migration, physical model or implicit repair is introduced.

Editing and minimization share the original-verification helper; existing hydrogen
reconciliation keeps its publication semantics. Recovery can refuse safely without
making unrelated editing a new chemistry gate. Original hash verification also
prevents recovery from a corrupt preserved file. The helper filters calculation
facts to bounded membership; its default preserves existing edit recovery behavior.

## D-119 — Retain the qualified Hamiltonian while alternatives are assessed

Issue #89's approved outcome does not require a force-field transition. The
[OpenFF feasibility assessment](OPENFF_FEASIBILITY.md) identifies charge ownership,
isomorphic-molecule combination, 1–4/exclusion, protein/water, chemical-domain and
packaging questions that need a pinned native experiment. It does not establish
accuracy or speed superiority. Keep amber-local-v1 and its conservative charge-
geometry dependency. Focused[#101](https://github.com/ManuelSe/Neistra/issues/101)
requires its own qualification and a distinct model identity before production.

Reference CPU profiling of prepared1STP and the18k capacity fixture finds fixed-
protein-only evaluation costs approximately the full model's cost. This is a
material opportunity, not a measured reduced-evaluation speedup or an additive
cost decomposition. Subtracting a constant preserves selected derivatives but
saves no evaluation work by itself. Retain every production force-field term in
this release. Focused[#102](https://github.com/ManuelSe/Neistra/issues/102) must
qualify an actual reduced evaluator against full-model energies up to a disclosed
fixed constant and selected forces, boundary terms, exclusions/scaled1–4, settings,
cache/current-coordinate dependencies, cancellation and practical performance.
No quadratic exception-list shortcut, silent model substitution or unsupported
chemistry expansion is authorized by these feasibility findings.

Publication clarification for D-118 (issue89, no behavior change): immutable captured
inputs, original uploads and existing identity facts remain untouched. Explicit
acceptance creates a new coordinate artifact with the normal minimization provenance
annotation. “Calculation-local recovery” means the recovered isotope/radical facts
are not copied into canonical annotations; it does not mean the accepted coordinate
artifact lacks its ordinary operation provenance. The historical decision remains.

## D-120 — Toggle complete canonical selection operands across current views

Date: 2026-10-20. Status: accepted by approval of the
[issue #90 plan](plans/issue-90-selection-gestures.md); implementation pending.

Extend the internal selection operation with whole-operand toggle in TypeScript
and Python. A nonempty operand is subtracted only when every one of its canonical
atom references is selected; otherwise its complete membership is added. Preserve
unrelated references, canonical ordering and operand source/granularity metadata.
An empty toggle is a no-op. Explicit replace/add/subtract keep their existing
semantics; no HTTP request or persisted selection object gains an operation mode.

Use one modifier policy across viewer, project browser, Components panel and
existing Sequence tab: Alt subtracts; otherwise Ctrl/Cmd toggles; otherwise Shift
adds or invokes the eligible viewer range; otherwise replace. This order governs
combined modifiers. Entry groups and categories toggle their materialized union
as one operand, not each child independently. Lazy loads retain project/entry
ownership and apply toggle against the current selection, never another project.

Rationale: scientists expect a fully selected entity to deselect while partially
selected entities become complete. Atomwise symmetric difference would invert
partial membership and violate that intent. Extending D-018/019's shared algebra
avoids divergent modifier semantics or additional selection authorities.

No molecular mutation, saved-selection representation, migration, dependency
upgrade or HTTP API change is authorized by this operation. C0 records the accepted
decision only; feature and release qualification remain pending.

## D-121 — Native double-click expands application-owned targets without camera focus

Date: 2026-10-20. Status: accepted by approval of the
[issue #90 plan](plans/issue-90-selection-gestures.md); implementation pending.

Narrowly extend D-044's primary-selection policy for unmodified Atom-mode
double-click. Mol* retains hit testing and click-versus-drag recognition. Correlate
the browser's native dblclick with the two preceding accepted primary hits in the
current viewer generation; both must resolve to the same expandable application
target. Single-click selection remains immediate, without a double-click timer.
Expanded selection subsequently replaces it and cannot focus or change the camera.

Resolve protein hits to the complete normalized residue; assigned ligand, solvent,
water, ion and other-heterogen hits use complete individual D-045 component
membership. Never expand a ligand to its containing complex. Unsupported polymers
and ambiguous/unclassified material retain ordinary picking; do not infer molecular
identity from proximity, names, missing connectivity or size. Preserve Atom-mode
bond-endpoint picking and expand only when all endpoints share one eligible target.

Raw-hit/gesture context at the viewer interface uses canonical application
references. Mol* objects and internal selection state never enter the central
store. Empty/surface/modified/dragged/stale/mixed-target input cannot expand.
Navigation, ownership/mode changes, rebuilds, blur and disposal clear correlation;
listeners are cleaned up. Movement ownership, surfaces, non-primary camera gestures
and existing touch navigation keep their contracts; no custom double-tap recognizer.

Rationale: native double-click classification adds a useful shortcut without a
second drag recognizer, delayed single selection, speculative molecule discovery,
or implicit camera action. This deliberately extends D-044's original modifier/
activation defaults while retaining its camera and gesture-ownership boundaries.

No durable viewer state, hierarchy snapshot, migration or new molecular schema.
Implementation, real native interaction and lifecycle qualification remain pending.

## D-122 — Fixed residue-range anchors are transient application selection state

Date: 2026-10-20. Status: accepted by approval of the
[issue #90 plan](plans/issue-90-selection-gestures.md); implementation pending.

Keep a project-scoped range anchor in the nonpersisted selection store above
responsive viewer remounts. Identity includes entry, current molecular artifact,
derived protein component, chain and normalized residue ID, independent of
canonical atom-reference ordering. Establish it through unmodified Residue-mode
selection, Ctrl/Cmd toggle-on of a complete protein residue in Residue mode, or
eligible Atom-mode residue double-click. Shift and Alt never establish/advance it.

Shift-click with a valid anchor adds the inclusive interval of existing residues
in normalized residue-list order within the same entry, chain and protein
component. Do not use number arithmetic, author/insertion-code sorting, atom IDs,
display order or proximity. Do not bridge separate source polymer components with
the same chain label. Include existing hidden atoms and explicit H; invent no
missing residues or atoms. With no valid same-boundary anchor/target, retain the
ordinary active-granularity additive pick, including Atom-mode atom selection.

Clear the anchor on project change, clear/replacement outside an explicit eligible
viewer selection, picking-mode change, source-artifact change, or loss of complete
anchor-residue membership. Additive/toggle/subtractive panel actions may preserve a
still-valid anchor but do not establish it for #90. Responsive remounts preserve
valid anchors; reload clears them. No anchor in preferences, scenes, saved
selections, history, archives, autosave or normalized data. Explicitly saved
selection results continue to use the unchanged canonical reference schema.

Rationale: an explicit stable anchor gives predictable repeated ranges despite
sorted canonical references, numbering gaps and insertion codes. Application
ownership preserves D-018/019 and keeps Mol* disposable. Protein source boundaries
prevent unrelated sequence material from entering a range. Cross-panel ranges and
new residue/sequence navigation remain separate approved work under #94/#95;
hover remains #91. No new follow-up issue is required for this bounded scope.

No HTTP/schema/migration/dependency change. The planned release is stable minor
0.22.0 for added capabilities and intentional gesture changes, subject to collision
checks and complete candidate/exact-master gates. Five authoritative versions
advance in the implementation PR, not C0. Implementation and verification pending.

### D-120 implementation note — issue #90 M1/C1, 2026-10-20

Shared internal toggle and modifier adapters now implement the accepted complete-
operand rule in TypeScript/Python. Entry/group lazy loading checks active project,
selection project and current entry/artifact before publication; algebra reads
current selection. Four-granularity native Ctrl-off/Meta-on, empty modifiers and
cross-panel synchronization pass. Existing explicit add/subtract remain. Full278
frontend and focused17 Python pass; checkpoint evidence lives in the feature plan.
This is C1 only: double-click/range and release qualification remain pending.
No molecular, HTTP, persisted-schema, migration, dependency or version change.

### D-121 implementation note — issue #90 M2/C2, 2026-10-20

Pure indexed expansion and accepted-hit correlation now implement D-121. Native
synthetic complexes prove complete residue/individual ligand selection with hidden
H, stable camera/revision, both themes and desktop/mobile viewports. Real standalone
SDF expansion also passes. Modified/empty/surface/navigation/movement/rebuild/blur/
dispose paths clear correlation; unmapped nonmolecular loci retain their prior
no-op behavior. This narrowly extends D-044 without a timer/drag recognizer or
chemistry inference. Exact gates and the local self-review correction live in the
feature plan. C3 range anchors and final release qualification remain pending.
No HTTP/schema/migration/dependency/application-version/molecular-file change.

### D-120/122 implementation and qualification note — issue #90 M3/C3, 2026-10-20

Application-owned fixed anchors and result references publish atomically from
current cached projections. Normalized residue-list order, not sorted IDs or
number arithmetic, defines intervals within entry/protein-component/chain.
Source artifacts, mode/project transitions and incomplete start membership
invalidate; responsive remounts preserve valid state. A transient project visit
epoch also guards old lazy entry/group selections after leaving and returning.
No anchor enters saved selections/scenes/APIs/history/preferences/archives.

Native C3 qualification passes52 browser cases /2 existing layout exclusions;
all290 frontend and static/build gates pass. A test projected a cropped/unpickable
raster center after resize; explicit camera fitting and a bounded read-only native
pixel observation repaired qualification, with trusted clicks and exact references.
No runtime change or timing/membership threshold relaxation during those diagnostics.
The feature plan retains initial/decisive traces and all probe command logs and
observations. This is implementer review only, not independent approval. No new
schema, migration, HTTP route, chemistry inference, dependency or version change.
C4 final performance/actual reader/release gates remain pending.

### D-123 — Issue #90 qualification uses canonical results and actual readers

2026-10-20. Gesture results retain ordinary selection schema1 references. Native
trusted-input tests prove authoring; separate disposable actual-tag/current API
processes prove generic persistence/history/archive compatibility. Do not infer
old gesture authoring from retained data, or final-version compatibility from a
preversion fixture. Native test pixel/readiness observations are test-only and
must never replace the actual input or exact canonical-membership assertions.
No migration, production diagnostic hooks or persisted gesture state are needed.

### D-120–123 publication note — issue #90, 2026-10-20

Approved scope released as stable0.22.0 in PR#105 at verified master28d3a9bb.
Both complete15-command gates and actual tagged0.21/final0.22 reader directions
pass with identical472 source hashes. No migration/schema/API/dependency or
molecular change. Local full-diff self-review only; Codex requested, none returned,
no required approval/check bypassed. Annotated exact tag, stable release/public
bundle and issue reply verified. The feature plan records detailed qualification
and final reference/cleanup audit links without moving the published runtime tag.

## D-124 — Shared picking targets and viewer-local hover ownership

Date: 2026-10-20. Status: accepted by approval of the
[issue #91 plan](plans/issue-91-selection-mode-hover.md); implementation pending.

Share one internal target-resolution path between ordinary structural clicks and
hover. Atom hits retain element-level identity and existing bond-endpoint picking;
protein Residue hits use complete normalized residue membership. Assigned
nonpolymer Residue hits use the complete existing individual component, including
explicit component atom IDs. Other residue targets retain native residue
normalization; ambiguous classification does not justify molecule expansion.
Chain/Structure retain their existing click semantics. Multi-atom hits resolve
the union of applicable targets, never an arbitrary first atom. This is a narrow
extension of D-020/044 using D-045's existing membership authority; D-120–123's
modifier, double-click and range-anchor contracts remain binding.

Hover previews the active-mode entity only, independent of modifiers. It does
not preview Shift ranges, toggled results or subtraction. Replace the default
Mol* molecular HighlightLoci handler with one adapter-owned subscription and
marking provider. Explicit resolved loci bypass automatic highlight granularity
expansion; programmatic selection marking remains exact and separate. Preserve
existing distinct highlight/selection colors and active surface-object markers.
Managed surface hits retain their object-selection path, rather than becoming
molecular hover targets.

The disposable viewer owns transient hover state; no hover enters the canonical
selection store, anchors, preferences, scenes, history, archives, or project API.
Never emit a selection event or issue a mutation/refetch/job from hover. Render
only through existing visible representations without revealing hidden atoms or
loading hidden entries. Reuse immutable molecular/component indexes and cache the
current target/loci by scene generation and picking mode; repeated samples within
one entity do not rematerialize membership or remark it.

Clear hover on empty/unsupported hits, exit/blur, mode changes, structural or
coordinate presentation changes, navigation/movement ownership changes and
disposal. Reject stale-generation or actively owned pointer/navigation input.
Clean up all subscriptions/providers; the next valid real sample resolves the
current scene. Preserve canonical selection and active surface activation during
highlight removal. Do not synthesize clicks or infer molecular identity from
geometry, names, size, connectivity guesses or renderer residue grouping.

Rationale: setting renderer granularity alone cannot guarantee complete canonical
components or lifecycle correctness. Shared targeting makes the preview truthful
without a second selection authority or modifier-preview framework. Native marker
and exact-reference tests must qualify both target membership and independence
from selection/camera/project state. The existing stable release history supports
a patch 0.22.1 correction with unchanged schemas/APIs, not a new feature or schema
boundary. No migration, dependency change or implementation is authorized in C0.


### D-124 implementation note — issue #91 M1/C1, 2026-10-20

Ordinary structural clicks now use a shared typed target resolver. Native
Atom/Chain/Structure behavior is retained; Residue mode uses complete normalized
protein residues and assigned nonpolymer components, including explicit members.
Unsupported/ambiguous residue targets keep native normalization. Immutable weak
membership caches preserve entry IDs; mixed operands materialize their union.
The passing checkpoint gate qualifies canonical targets and existing native
selection/camera gestures. Hover ownership and release qualification remain
pending; no scientific inference, migration, API or version change.

### D-124 implementation note — issue #91 M2/C2 lifecycle qualification, 2026-10-20

Canvas3D queues marker actions until drawing. Molecular hover marking therefore
targets only ordinary structural representations and excludes every registered
managed surface; it cannot remove a surface's independent active-object marker
before or after queued drawing. This implements the preservation requirement
without a competing restoration callback or another surface selection owner.

Native qualification exposed that Mol* multisample rendering emits camera-change
events for temporary projection jitter. Clearing hover on every such event erases
valid stationary previews. Compare the application camera snapshot (mode, pose,
up, radius), and invalidate only an actual camera change; pointer/navigation and
scene/tool ownership boundaries still clear immediately. The diagnostic stack
identifies MultiSamplePass, and unchanged exact native marker assertions qualify
the correction. No rendering-quality or performance threshold was reduced.

Test pointer motion observes an empty in-canvas native sample before returning to
an identical atom pixel after toolbar/ownership changes. Teleporting from outside
to the identical last native pixel does not produce a new changed-coordinate hit
in Mol*. The test still uses trusted pointer input and independent native markers;
it neither injects a preview nor selects the expected target programmatically.
The initial lint/native/timestamp-baseline diagnostics remain separate from final
passing evidence. Complete qualification and publication remain pending.

### D-124 root-independent removal note — issue #91 M2/C2, 2026-10-20

Coordinate refresh can retain native marker buffers while replacing molecular
root identity. A queued old-root RemoveHighlight then fails to clear retained
ordinary markers even though the hover manager/cache is already empty. Native
coordinate-preview qualification reproduced ligand marker bits with an empty
target and empty last hit. The sole molecular hover provider now removes the
ordinary highlight plane with EveryLoci; additions still use the exact resolved
target. Managed surfaces remain excluded, and selection bits are untouched.
No per-frame project state, chemistry, geometry or persisted ownership changes.

Surface qualification additionally observes the processed native hover identity
before its trusted click instead of assuming an asynchronous GPU readback fits
in80ms. Actual native camera snapshots replace the harness's previously-null
application camera observation. Sampling and exact object/marker assertions are
unchanged. A queued-rebuild test observes a real old-scene hit while generation
ownership rejects it; valid fresh hits after rebinding are not classified stale.
These strengthened readiness/ownership observations remain test-only.

### D-124 cache and readiness note — issue #91 M2/C2, 2026-10-20

For Atom/Chain/Structure hover, compare normalized native loci before constructing
canonical reference sets/keys. Repeated hits in the same entity therefore avoid
canonical rematerialization as well as marker updates. Residue/component targets
reuse weak immutable membership caches. All caches clear with the existing
mode/scene/coordinate/navigation boundaries. Test-only resolution counters observe
real different-atom hits in one Chain/Structure target and require no new target
resolution or marker action. This is an allocation/work bound, not a throughput
or speedup claim.

The existing post-reload surface-appearance worker-count test now waits for all
five ready states and zero active workers before capturing its baseline, just
as its pre-reload assertion already does. Otherwise unfinished initial calculation
could be miscounted as an appearance recalculation. Its exact unchanged-worker-
count, geometry, native marker, camera, selection and original-byte assertions
remain intact. No surface runtime or scientific algorithm was changed.

## D-125 — Finish pending native pick reads for synchronous clicks

Accepted implementation correction for issue #91, 2026-10-20. Removing native
surface hover marking exposed an unread GPU pick-buffer path: Mol*5.11.0 can set
`PickHelper.dirty=false` after scheduling asynchronous hover readback, while
`PickBuffers.ready=false`. Its synchronous `identify()` only reads dirty buffers
and returns an empty target before application click handling. Controlled original
fixed80ms native surface tests passed13/13 with the exact tagged0.22.0 renderer,
versus2/3 with the new renderer (one empty activation). This evidence does not
justify classifying the observed regression as an unrelated pre-existing defect.

Preserving surface clicks is essential approved scope. Pin a narrow pnpm package
patch to the existing Mol*5.11.0: clean synchronous picks check readback state and
read pending/failed buffers before returning. Resolved buffers do not reread or
render; dirty scenes retain native render/read. Async hover, target semantics,
geometry and canonical ownership are unchanged. Patch both ESM/CommonJS builds.
This replaces a readiness-only test accommodation; retain the original80ms click
scenario and add pending/failed/resolved/dirty unit coverage. No guessed target,
click replay, timing delay, public Neistra API or dependency upgrade is introduced.

This is an evidence-driven implementation deviation from the plan's original
no-dependency-change expectation, recorded in the feature contract. It maintains
the approved user outcome without changing product scope or scientific behavior.
Locked installs and candidate/exact-master native/performance gates must validate
it. Track upstream incorporation/removal separately; retain the pinned correction
until an upgraded renderer passes the same regressions without it.

D-125 qualification note: deterministic CommonJS negative control reproduces
missing pending/failed hits in the original package and correct reads in the
patched package, retaining resolved reuse and dirty render/read. ESM unit tests
exercise the same four paths. Ten original80ms native surface cases pass without
readiness-delay substitution. Exact source hashes, runner and diagnostics are
retained under `docs/assets/selection-mode-hover/`; full milestone/release gates
remain separately required.

### D-124 application camera-publication note — final review

The retained camera subscription previously forwarded native multisample jitter
events even when the application camera snapshot was unchanged. StructureViewer
then called React `setCamera` and the transient camera store on hover-driven
rendering. A trusted-input negative control proves eight extra publications with
an identical snapshot on the first hover. This violates the contract's absence
of application-state updates per hover despite not changing the pose.

Deduplicate publications by the existing public CameraState snapshot (mode, pose,
up and radius); preserve actual camera changes, immediate initial subscriber
snapshots and all native label/focus behavior. This is viewer-adapter ownership,
not a new UI/store field or public interface. Native hover tests count subscriber
callbacks and require zero additional publications while the pose stays exact.
The interrupted first candidate remains diagnostic evidence, not release
qualification. Rerun coherent focused and complete clean-candidate/master gates.

## D-126 — Quick minimization is a distinct editing model

Approved2026-10-21 by “Implement the plan”, issue#110; contract:
`plans/issue-110-quick-minimization.md`. Use installed RDKit/SciPy and distinct
quick-local-v1/coordinates.quick_minimize for bounded local protein/pocket work.
Preserve canonical chemistry, originals, fixed/inactive rows and every existing
AMBER scientific/API/report contract. Missing legacy identity evidence alone does
not veto quick coordinate cleanup; known protection facts remain unchanged.

For quick work only, supersede D-108–119 default prerequisites/context/publication:
visible entries define automatic participation, attached terminal H expands the
mask by default with an exact-mask option, temporary conventional protein states
are reported, and usable output publishes as one Undo/Redo command from its owning
client session. Advanced AMBER retains prior accepted requirements/explicit Apply.

Use capped local fragments/native MMFF94 polar and steric forces. UFF/native
geometric restraints may provide explicitly approximate repair; report missing
coverage and preserve unsupported fixed sites as obstacles. Caps/finite shells
are declared model approximations, not AMBER equivalence. No engine framework,
persistent parameter cache or DB migration. Scientific/publication/performance
claims require the approved independent tests and real-workflow release gates.

## D-127 — Quick pocket closure and native solver stops

Issue#110 uses complete observed standard residues within the6Å discovery shell
plus2Å skin, three-bond mover closure and fixed observed-position ACE/NME caps.
Recheck/extend membership between bounded native segments and rediscover around
the final proposal at Apply, including previously distant participating entries.
Compare original/candidate under exactly the final native model. Fixed-only force
field terms remain native constants; they do not move canonical site atoms.

RDKit sequence ILE connects CD1 to CG2 in the installed build; correct that disposable
named template to the standard CG1-CD1 bond, with a real pocket qualification.
Protein defaults never complete heavy atoms. Respect observed H before neutral-HIS
assumptions. Relative objective tolerance can stop before maximum force convergence;
return a warned useful improvement, and restart only when a segment bound requires
neighborhood reassessment. Never label that stop force-converged.

## D-128 — Temporary interpretation and explicit repair coverage

Issue#110 interprets each connected local component independently. Bounded RDKit
bond-order perception may fill unknown facts on unchanged connectivity, with a
reported neutral net-charge attempt and rejection of conflicting assigned facts.
Source elements, isotope/radical evidence and canonical graph/charges remain untouched.
Copies of the three supplied debug files are committed as regression inputs.

When native parameterization fails, retain the observed unsanitized graph in a native
empty field with declared geometric/steric constraints. Keep supported components in
a mapped native field, add unsupported fixed obstacles, and disclose omitted polar/
coordination terms. Repair energies are penalty units. Rebuild steric candidates using
current positions while geometry targets stay original; changing those targets between
segments would invalidate objective comparison. Only coincident movable repair sites
receive small deterministic starting offsets; published fixed rows remain exact.

## D-129 — App owns quick publication; viewer remounts do not own the session

Issue#110 uses independent typed quick frontend requests/reports while retaining the
AMBER APIs. Ctrl+M/lightning submits quick work immediately; an explicit settings
launcher permits context/mask/repair choices and Advanced AMBER without starting work.
Only the owning App command session arms automatic Apply. Disarm synchronously before
Cancel/close/Apply; inspection/reload never rearm. The existing writer/revision/digest
checks remain authoritative and publication creates one Undo/Redo command.

Native responsive tests found that viewer cleanup could dismiss a new session during
a remount. The App command hook now owns disposal/cancellation, while the viewer owns
only transient rendering. Store the initiating launcher kind so Escape restores the
correct live control even when its prior DOM node was replaced. Native tests cover
both profiles at320px in both themes. No worker-side or reload publication is added.

## D-130 — Fast context validation and render-local quick presentation

Issue#110 retains all participating immutable source snapshots, but chemically templates
only spatially relevant entries. Before guarded extension, newly relevant entries get
full template/closure checks; distant sources are never silently truncated or discarded.
The worker proves final6Å discovery under its final model. An eligible report records
that proof. At publication exact source identities preserve it; changed formerly distant
entries receive fresh final-position spatial discovery and refuse if newly relevant.
Changed modeled sources always refuse. This is an immutable per-job proof, not a
persistent parameter cache or weaker context criterion. Native fields retain all local
nonbonded pairs, including between fragments; generic repair keeps bounded refreshed
steric lists and original geometric targets.

Preflight18k timing found excess App rerenders and topology-driven scene rebuilding.
Quick commands now read current ownership at invocation; settings/job/frame presentation
subscribes only inside the viewer. Initial empty-frame transport polls100ms until the
first real snapshot, then200ms. Worker output/rendering stays at most5Hz/latest-only.
No fake frames or relaxed timing limits. Shared geometric acceptance checks avoid importing
prepared-engine modules into quick calculations.

## D-131 — Coordinate publication preserves warnings through existing history actions

Quick Apply uses the existing atomic coordinate batch, not topology patches. Append
artifact provenance/warnings and update entry warning summaries with existing generic
`entry.update` actions in the same command. Old readers already understand both action
kinds. Undo/Redo restores exact artifacts and warning arrays; allocators/topology stay
unchanged. Keep geometry-dependent overlays paused throughout publication. No new DB,
structural or history action schema is needed. Native artifacts retain temporary atom/
bond states, original/candidate/helper coordinates, mappings, modes, assumptions and
versions so reported objectives can be inspected independently.

## D-132 — Version0.23.0 is an additive minor capability

Issue#110 adds independent quick job/HTTP contracts and changes the default interactive
behavior, so0.23.0 is a minor release. Existing prepared AMBER requests/reports remain
unchanged. The actual tagged0.22.1 reader retains new generic data/history/jobs/archives
in preflight; complete candidate and exact-master gates must still pass before delivery.
No dependency upgrade, canonical chemical rewrite or schema migration is included.

## D-133 — Coordinate cache seeding refreshes complete immutable artifacts

Immediate coordinate patches also update the active conformer's coordinate rows,
preserving inactive conformers. Seeded query data is invalidated so a mounted reader
refreshes the full immutable artifact, including provenance and warnings. This shared
path covers Apply, Undo and Redo after reload without a quick-specific cache protocol.
Canonical server artifacts remain authoritative; the patch only supplies immediate
geometry while the complete projection is retrieved. Typed conformer rows mirror the
existing molecular schema. Two regression cases preserve the prior cached artifact.

## D-134 — Spawn bootstrap defers coordinator-only API imports

Candidate timing exposed a1038ms first live frame against the unchanged1000ms limit.
The first accepted native step was published853ms after input. Import profiling found
that spawned children rebuilt API schemas, SQLAlchemy and unrelated prepared chemistry
while importing the coordinator module (about670ms). Keep coordinator-only imports
inside parent methods/main, with type-only imports underTYPE_CHECKING. The child
entry point, input class/pickle identity, fresh process per job, IPC, resource limits,
process-group cancellation and supervision algorithms remain unchanged. No warm pool,
parameter cache or new job framework is introduced. A fresh-interpreter regression
checks the bootstrap dependency boundary. Combined bootstrap/calculation imports fall
from about733ms to443ms locally; native/full qualification remains authoritative.

## D-135 — Pocket repair findings block publication

Read-only replay of user history exposes repair geometry collapse despite objective
improvement. Qualification must include independently checked bonded geometry and
correct cis/trans restraint conventions, with angular units and fixed-only objective
constants handled explicitly. Preserve canonical coordination/connectivity and report
omitted metal physics. Keep private project data outside git and do not repair or
undo the user's live project during investigation. Prior broad passes cannot waive
the reproduced defect; corrected candidate and exact-master gates remain mandatory.

## D-136 — Repair preserves geometry independently of objective improvement

Correct the repair cross-product convention so observed cis/trans sides target the
matching0/180°dihedral. Native RDKit2026.03.4 constraint energies square degree errors;
convert the stated angular strengths from per-radian squared using(pi/180)^2.
Retain all physical moving-dependent native interactions. Omit native field parts
with no movable indices because they are constant; keep their atoms as modeled fixed
steric context. Center each bounded solver segment's objective at its starting
energy, leaving gradients unchanged, so fixed-only offsets cannot dominate relative
stopping. Eligibility uses an absolute tolerance plus represented floating precision.

Independently validate final bonds touching movers for supported covalent elements
against broad0.6–1.6 times summed covalent radii. This is a collapse/stretch guard,
not force-field convergence or metal-geometry qualification. Invalid geometry cannot
auto-apply even if energy falls. Record proof/violations in reports; older quick
reports default to unverified and require a new run. Historical data/Undo remains.
Quick implementation version1.0.1 distinguishes the corrected calculation; prepared
AMBER and durable schemas are unchanged. Near-coincident repair variables may get
deterministic calculation-only starting offsets below0.087Å; fixed/original rows
stay exact and the original geometry remains the acceptance reference. Report this
assumption and retain real accepted optimizer frames only.

The unsupported metal-linked connected group can still require explicitly labeled
repair, with omitted electrostatics/coordination reported. This correction does not
claim qualified metal, covalent-adduct or protonation physics. Private user captures
stay outside git; synthetic causal physics/geometry regressions are public.

D-136 implementation detail: reuse only the last exact energy/gradient evaluation
under the identical native field object and coordinate vector; field/context/steric
replacement invalidates reuse. Cancellation/budget checks still run on every call.
Use direct native arrays when the global/local mapping is identical. This removes
duplicate numerical work without changing forces, optimizer steps or scientific
limits; no persistent parameter cache is added. Qualification records power every
15seconds as well as step boundaries, without changing host settings.

## D-137 — Exact moving interactions and the intended context skin

Native reference timing exposes repeated fixed-fragment work and unnecessary
context rebuilding. For MMFF94, optionally partition complete covalent components
into the active group and bounded groups of whole fixed components. Sum native
(active+fixed-group) fields and subtract duplicate active self-terms. This preserves
every moving-dependent native term, parameter, exclusion,1–4 scale and dielectric.
Use it only when estimated pair work falls materially; otherwise retain the full
native field. No chemistry boundary is cut and no moving interaction is omitted.

Omit fixed-only interactions between groups, which are constant, and explicitly
report captured geometry as energy zero. Reports/models/UI retain that reference.
Independent full-field energy **changes** and movable/fixed gradients must match
before/after perturbations for both normalized and actual PDB/MOL pockets, with
whole and partial ligand masks. This avoids constructing a full fixed-only field
just to recover an irrelevant constant. Native properties remain inspectable.

Refine D-136's numerical reference to remain tied to the model's captured geometry
across bounded segments, rather than resetting at every segment. Relative stopping
then remains invariant to arbitrary fixed energy offsets while reflecting the
whole local change. Keep ftol1e-7, independent force threshold0.01, iteration/time/
resource limits and honest limited-improvement reporting.

The6Å core is protected by its2Å skin. Check a7Å lookahead before each bounded
segment, which can move at most sqrt(3)*0.5Å, before extending the8Å model;
do not rebuild for every change in the outer skin. Preserve
all prior modeled atoms when extending, and keep final6Å discovery verification.
Install rebuilt fields on the retained assembly itself so field-center metadata
survives complete job/model serialization. The guard regression executes the full
job and checks its retained model, rather than stopping at the optimizer. Final
bonded checks reject any bond below0.6Å, including unsupported links; this does not
infer a metal coordination target. Existing covalent-radius guards remain.

## D-138 — Explicit geometry settling for a fixed environment

Quick pocket cleanup may stop after at least25 accepted steps under one installed
model when three consecutive accepted canonical-coordinate steps are below0.01Å.
Enable this only when canonical fixed atoms exist, retaining the existing isolated
molecule stopping behavior. Reset the counters on context installation. Require
bonded geometry, declared stereochemistry and severe-overlap checks before this
stop; retain every final publication check and objective-improvement requirement.

Report geometry_settled as a warned improvement, with its measured step count and
tolerance. Only the independent0.01 maximum-force threshold establishes convergence.
This deliberately favors useful interactive geometry over spending the remaining
budget on tiny pocket adjustments; it does not validate binding affinity or metal
coordination. Iteration, time, resource and browser performance limits are unchanged.
Public regressions check the limited outcome and prevent settling from accepting
collapsed geometry. Native browser and complete frozen gates remain required.

## D-139 — Small-ring targets follow topology; planarity is independently checked

An independent post-replay audit finds that broad bond plausibility alone can leave
an unsaturated ring badly folded. After the sign/unit correction, choosing every
substituent's cis/trans side from damaged initial coordinates can still create
mutually inconsistent restraints. For an existing double/aromatic bond in a ring
of at most seven atoms, derive the ring-internal cis relationship and external
substituent's opposite side from connectivity. Keep observed-side targets for
acyclic/larger-ring bonds. Do not infer missing double bonds or flatten saturated
rings. Public folded-substituted aromatic/Kekule regressions reproduce and cover it.

Independently check rings of at most seven atoms touching movers whose every atom
has aromatic or incident in-ring multiple-bond evidence. Reject plane deviation
above0.2Å before geometry settling or publication. This broad local geometry guard
is not a metal/affinity certificate. A mask unable to fix a ring while holding the
other atoms fixed may refuse; it cannot broaden itself. Saturated puckered rings
remain valid. Test this rejection even when an independent mock objective decreases.

Add default-false planar validation proof alongside bonded proof so earlier reports
remain inspectable but require recalculation. Quick implementation1.0.2 distinguishes
this correction from the intermediate local1.0.1 preview. Preserve durable schemas,
canonical chemistry, uploads and all fixed rows. Full candidate9 is explicitly
interrupted at this finding; its1162 Python/313 frontend/8 supervisor/static/build
passes are diagnostic. Restart focused native checks, then complete fresh candidate
and exact-master gates. No thresholds or required checks are waived.

## D-140 — Automatic UI hydrogen maintenance is an explicit direct-edit policy

Date: 2026-10-22. Status: accepted by explicit approval of the
[issue #92 plan](plans/issue-92-automatic-hydrogen-editing.md); implementation
pending. C0 authorizes planning persistence only, with an explicit stop ready for
`/goal`.

The user confirmed automatic handling without a user-facing policy selector,
including under Advanced. Add an explicit automatic policy for direct model edits
and use it for ordinary atom, fragment and bond UI actions. Existing omitted
preserve, additive complete_if_possible, bond-only reconcile_if_possible and legacy
HTTP operation semantics remain compatible. This amends D-101/D-105/D-107's UI
defaults and new-policy deletion behavior without rewriting those historical
contracts or imposing blanket sanitization on incomplete drafts.

Reuse operation-specific completion/reconciliation, coordination, stereo and
protection helpers. Maintain changed/new heavy sites and immediately affected
canonical neighbors under shared request budgets, not recursive global completion.
Stage each site's changes across all conformers. Unsupported/protected chemistry
retains the requested direct edit with precise partial/unresolved diagnostics.
Routine maintenance preserves assigned charges, heavy coordinates and unrelated
records. Explicit H deletion and H-endpoint bond breaking cannot immediately
recreate H at their affected parent or silently infer deprotonation.

Under the new automatic policy, explicit heavy-atom deletion cascades to H whose
sole authoritative bonded neighbor is a selected heavy atom, including represented
labelled H. This is deliberate deletion of attached material, distinct from
ordinary/protected-H eligibility for inferred maintenance. Do not infer missing
connectivity, speculative bridging-H ownership or global historical orphan repair.
Legacy literal deletion remains available through its unchanged API policy.

One existing molecular transaction owns the requested edit, accepted H changes,
reference reconciliation, warnings and exact artifact Undo/Redo. Keep source
uploads immutable, IDs monotonic, helper work bounded and molecular authority
independent of the renderer. No new job framework, schema migration or persistent
H constraint is authorized.

## D-141 — One-click H addition has finite operation-specific charge transitions

Date: 2026-10-22. Status: accepted by explicit approval of issue #92;
implementation pending.

The user approved bounded C/N/O chemistry and explicitly added bounded S. Add
hydrogens.add_one on the existing direct model-edit route, with one selected heavy
parent and no count/geometry/orientation inputs. Reuse placement and validation
helpers without replacing the legacy hydrogens.add draft-building contract.

The approved plan's finite state table bounds valence filling to C0:4,
N0:3/N+1:4, O-1:1/O0:2/O+1:3 and ordinary single-bond
S-1:1/S0:2/S+1:3. At the corresponding filled valence, only N0 to N+1,
O-1 to O0, O0 to O+1, S-1 to S0 and S0 to S+1 charge-changing steps are
authorized. Those steps require ordinary nonaromatic, nonconjugated single-bond
environments. Unlisted/hypervalent states, ambiguous identity/chemistry, metal
coordination and undetermined new stereo refuse rather than escalate charge.
Existing assigned multiple-bond geometry may support bounded deficit filling;
it does not authorize additional charge transitions.

General toolkit sanitization is not sufficient scientific admission. The pinned
RDKit feasibility probe accepts higher-charge O/S states that this finite action
must refuse. Qualify graphs, charges, stereo and geometry independently. Filling
one missing explicit H toward the supported valence is not a preparation,
protonation-state, pH, tautomer or optimized-geometry claim.

Count all canonical bonds/H regardless of visibility. Exactly one new H plus any
parent-charge update must succeed in every conformer before one immutable
artifact/history command publishes. Preserve retained coordinates and selected
parent; invalid requests leave artifacts/history/Redo/allocators unchanged.
Provenance and scientific warnings remain inspectable. Do not duplicate chemical
eligibility in JavaScript or introduce an eligibility endpoint.

The user confirmed that +H atoms remain ordinary H: the action itself cannot
immediately remove its addition, but a later edit at that site may reconcile it.
Do not add persistent user-H locks/count constraints. Broader H chemistry needs
its own bounded follow-up; isotope/radical identity remains #83. No schema
migration is needed for this operation or its existing inference records.

## D-142 — Direct additions inherit application-owned attachment appearance

Date: 2026-10-22. Status: accepted by explicit approval of issue #92;
implementation pending.

The user selected attachment-atom inheritance over entry defaults alone. Carry a
typed internal new-atom-to-appearance-source mapping through direct edits.
Attached atoms/fragments use the heavy attachment atom, including terminal-H
replacement; generated H use their actual parent, resolving ancestry through new
fragment atoms. Unattached first/disconnected atoms retain entry defaults.

Extend applicable durable representation memberships and copy explicit color
tokens. Element tokens stay element tokens for the new atom's own element;
custom hex assignments remain custom colors. Polymer inheritance must respect
existing valid residue semantics. Do not infer a molecule-wide style rule from
mixed explicit memberships or reconstructed historical color choices.

This explicitly amends D-046/D-054's addition-time inheritance behavior for the
approved direct workflow. Keep visibility, isolation, local H preferences,
independent surfaces and named selections with their established owners; do not
expand their explicit memberships. Named scenes remain snapshots rather than
receiving new addition memberships automatically.

Coalesce inheritance and deleted-reference pruning in one existing molecular
command with existing reversible viewer-setting actions, so neither update can
overwrite the other or resurrect removed references. Undo/Redo, reload and native
archives must retain exact resulting state. The renderer projects these settings;
no renderer-derived appearance becomes authoritative. Existing viewer fields and
generic history actions suffice; no new schema, migration or persistent style
intent object is authorized.

### D-140 implementation note — issue #92 M1/C1, 2026-10-22

The user's `/goal` authorizes implementation and verified delivery. The new
automatic model-edit policy now reuses reconciliation for canonical one-hop
operands, new generated sites and current draft protection facts. Explicit heavy
deletion cascades terminal H without interpreting display connectivity; explicit
H intent suppresses that parent's maintenance. Legacy policy meanings remain.

Cap processed site records and detailed context errors while retaining full
unprocessed totals. Charge failed admitted work before any per-site conformer
publication. Resolve moved IDs once for the final change report to avoid an
atom-by-site scan as target counts grow. API previews remain pure and the existing
publication/history boundary owns all accepted changes. Final C1 source-bound
qualification and local review are recorded in the feature plan. UI migration,
one-click charge transitions and appearance inheritance remain subsequent work;
no migration, dependency or version change is made by C1.

### D-141 implementation note — issue #92 M2/C2, 2026-10-22

The finite one-H action now reuses additive placement with automatic geometry
guards, stages all conformers and publishes H/parent charge/provenance together.
Charge transitions require known ordinary local identity and single-bond
nonconjugated neighbor evidence, including neighbor bond orders; absence of an
observed pi bond cannot certify nonconjugation when those orders are unknown.
Later explicit site edits may reconcile its ordinary H as the user confirmed.

An independent asymmetric-sulfide probe found that RDKit's implicit-H context can
omit potential sulfonium stereo that its explicit-H candidate detects. Keep the H
explicit for this post-proposal assessment and refuse an undetermined new sulfur
centre before publication. Symmetric dimethyl sulfide and thiol/hydrogen-sulfide
cases remain qualified; this does not broaden hypervalent/aromatic support.
Protected/unknown dependency identity prevents current stereo assignment rather
than implying canonical isotope support. The final C2 scientific/native gate,
source identities and implementer self-review are linked in the feature plan.
No migration, dependency, profile-framework or legacy API replacement is introduced.

### D-142 implementation note — issue #92 M3/C3, 2026-10-22

Private creation ancestry now travels in direct domain results, never normalized
or HTTP schema fields. The API resolves source chains against pre-edit settings,
groups additions by source and extends only representation/color properties.
This avoids scanning every new atom per color group. Element tokens remain tokens;
unattached ancestry falls back to entry defaults. Valid polymer memberships extend
only through complete supported residue semantics; prior unsupported partial
assignments warn without blocking a valid direct edit.

The existing molecular publisher accepts optional proposed live settings and
coalesces them with all deleted-reference pruning in the existing reversible
entry.update action. It cannot overwrite pruning with an independent stale style
snapshot or create a second user command. Named scenes retain their snapshot
membership; other visibility/H/surface/selection owners remain unchanged. Generic
callers retain their old defaults/action vocabulary. Exact renderer component and
overpaint membership, combined Undo/Redo, archives and shared viewer/command
regressions pass the C3 source-bound gates linked in the plan. No new migration,
schema, dependency or version source change is introduced.

### D-140/141 UI implementation note — issue #92 M4/C4, 2026-10-22

The compact editor and advanced direct-edit inspector now share automatic policy;
legacy omitted/preserve and optional HTTP policies retain their meanings. Remove
transient H policy/count/geometry/completion state and obsolete Build H launchers.
Dedicated +H applies immediately with server admission; optional bond preview,
unknown-order/charge assignment, H display/removal and protein preparation remain.
No new persisted preference or migration is introduced. Primary/inspection icon
controls retain keyboard tooltips and canonical operand/response ownership.

C4 qualification preserves safety boundaries when legacy fixtures cannot prove
ordinary identity. Unknown XYZ H remain protected; the historical complex's +H
refusal is correct. Its existing native-picking regression uses explicit legacy
additive HTTP fixture preparation, never inferred identity or a retired UI claim.
Full C4 evidence and local self-review are linked in the feature plan; broader
qualification is tracked separately in remotely verified #114.

### D-141 qualification refinement — issue #92 C5, 2026-10-22

A mirrored-conformer C/N probe demonstrated that the generic stereo reconciler's
warning-and-clear behavior cannot satisfy bounded +H admission: every frame can
have usable local coordinates while the molecule has no consistent new stereo.
A typed opt-in consistency requirement now refuses +H if assessment is incomplete,
geometry is unresolved or conformers disagree. Generic additive/reconciliation
callers keep their existing default warnings and do not acquire strict admission.
The existing bounded assessment supplies the proof; no new perception framework,
canonical source rewrite or unbounded analysis is introduced. Keep the separate
explicit-H sulfur check because implicit-H perception can miss that new centre.
The feature plan retains fail-first mirror cases, passing translation controls,
API no-publication/Redo/counter proof and final requalification requirements.

## D-143 — Compact molecular launchers and panel-independent quick execution

Date: 2026-10-22. Status: accepted by explicit approval of the
[issue #93 plan](plans/issue-93-compact-modeling-toolbar.md); implementation
pending. C0 authorizes planning persistence only, with an explicit stop ready for
`/goal`.

The idle viewer has one shared compact group containing Transform, Edit and
Minimize, in that order. Remove the separate Quick settings and Advanced AMBER
launcher. Use 32 px desktop buttons/16 px icons and 44 px coarse-pointer/narrow-layout
targets; scope the common chrome to launchers so active transformation controls
retain their current workflow and scientific guidance.

The user's confirmed correction supersedes D-111/D-129's opening behavior:
clicking Minimize opens setup without calculating; Ctrl+M submits existing quick
work without automatically opening the panel. Preserve the existing default
scientific model and exact-once automatic coordinate command. A click during a
shortcut run reveals the current owned session rather than launching concurrent
work. Explicit Jobs inspection remains available and never arms publication.
Do not add shortcut progress, Cancel, or results UI. Meaningful errors and
scientific warnings still use the existing notice policy under D-089.

Separate panel visibility from application-owned session lifetime in private
typed frontend interfaces. Polling, validated automatic Apply and existing live
coordinate rendering cannot depend on whether the panel is visible. Preserve
project/generation ownership, late-response rejection, revision/digest checks,
explicit cancellation and session-retirement boundaries. Responsive viewer
remounts do not retire computation; inspection/reload cannot rearm publication.
Shortcut execution never steals focus. One remaining launcher is the connected
fallback for explicit panel closure; preserve unrelated focus and existing
nonmodal Escape/tool-handoff rules (D-084/D-093).

Rationale: a fourth launcher defeats the compact toolbar outcome, and hiding its
panel alone would otherwise stop polling/publication or cancel work. Distinguish
explicit setup access from immediate execution without another calculation
framework or molecular authority. This is a presentation/lifecycle correction,
planned as stable patch 0.24.1 against verified 0.24.0, not a new scientific/API
capability. Preserve existing APIs/jobs/plugins, schemas, migration 0014,
originals, fixed/inactive coordinates and exact Undo/Redo. No dependency upgrade,
persistent preference, data rewrite or scientific algorithm change is authorized.


### D-143 implementation authorization — issue #93, 2026-10-22

The user's `/goal` authorizes implementation and verified delivery. Session
retirement follows project/generation changes, not panel visibility. Existing
render-local job/report/live observers serve hidden owned quick runs; only their
panel visibility is suppressed. Failures disarm automatic publication and emit
existing error notices; warning-bearing hidden results use D-089 persistent
notices. Opening the existing run preserves capture/generation and does not
resubmit. No new API, job, data schema or molecular authority is introduced.


### D-143 launcher qualification note — issue #93 M2/C2, 2026-10-22

The existing narrow-screen stylesheet hides generic tooltips. Reuse its
viewer-toolbar tooltip exception for Edit and Minimize so keyboard-focus guidance
remains available at320px; do not globally enable all tooltips or add a new tooltip
system. Keep the current launcher revealable while its atomic publication response
is pending. Native tests hold a real Apply response, verify preserved launcher
focus/closed panel, then explicitly reveal the same session without resubmission.


### D-143 quiet performance evidence — issue #93 C3, 2026-10-22

A panel-render feedback witness is incompatible with the explicitly quiet shortcut.
Observe trusted command acceptance as a separately named test-only metric; retain
real canonical-coordinate publication/native paint, independent first-frame and
explicit-cancellation observations. Do not compare command acceptance to old panel
feedback as a speedup. Preserve every existing numerical/scientific and latency
budget. No production instrumentation, synthetic animation or new progress UI is
introduced.


### D-143 read-failure retirement — issue #93 C3 review, 2026-10-22

A job/report-read failure disarms an owned quick run before issuing best-effort
cancellation of any cached queued/running job. Otherwise failed observation could
leave calculation consuming its remaining budget. Update only that job's query
record when cancellation returns; never reopen/rearm its session. If transport
continues to fail, retain the original diagnostic and Jobs record. Native injected
503 tests verify cancellation, a closed panel and unchanged canonical data; unit
cases retain late-result, refusal and Apply-rejection guards. No solver, API,
schema, worker policy or result validity change is introduced.


### D-143 explicit tool focus handoff — issue #93 C3 review, 2026-10-22

Apply D-093's existing restoration suppression to Style → Minimize handoff, as
already done for Style → Edit/Surfaces. The closing Style palette must not reclaim
its previous trigger after explicit Minimize setup acquires focus. No timer,
persisted state or new focus framework. A native keyboard regression reproduces
the original mobile failure and passes in both layouts with the additional owner
guard; panel focus, next Tab target and unchanged project revision are asserted.


### D-143 hidden tool handoff — issue #93 C4 review, 2026-10-22

Quiet Ctrl+M still retires competing nonmodal tools under existing ownership
rules. Their close autofocus must not restore an old trigger over a connected
external control. Extend the D-093 restoration suppression through hidden
automatic publication, and give Interactions the same optional restoration flag
already used by Style. Default restoration remains for ordinary Interactions
closure. Explicit Minimize setup takes panel focus; a quiet command retains
external focus. Surface Manager already drops restoration when focus leaves it;
Edit's external closure does not imperatively restore focus. Modal/typing guards
remain. No timer, new focus framework, persisted state or scientific change.


### D-143 qualification observation correction — issue #93 C4, 2026-10-22

Correct two observed test-harness races without changing production behavior or
waiving a release gate. The real-time notification test already records DOM
appearance/removal and requires at least10000ms lifetime. Wait for removal using
its existing total13500ms allowance; remove the redundant8500ms driver-relative
visibility assertion, which can begin after expiry once screenshot/inspection
overhead is included. Preserve real time, screenshots, native/project/request
invariants and all focus/persistent-warning cases. Do not change the notice timer.

The native worker test's `/proc/<pid>/stat` observer treats ProcessLookupError
(ESRCH) like FileNotFoundError (ENOENT): the observed process has exited. Continue
surfacing permission and other failures. Worker cancellation/termination/recovery
assertions and production runner behavior remain unchanged. This is bounded C4
validation repair under the instruction to fix validation failures, not a product
requirement change. No exception is assumed; repeat complete candidate/master gates.

## D-144 — Shared explicit protein-residue selection across application panels

Date: 2026-10-23. Status: accepted by explicit approval of the
[issue #94 plan](plans/issue-94-protein-residue-hierarchy.md); runtime
implementation pending. C0 authorizes planning persistence only, with an explicit
stop ready for `/goal`.

Extend D-122's transient fixed residue anchor to explicit protein-residue actions
in Components and the existing Sequence tab. Keep D-018/019 canonical atom
references and the selection store as the sole selection authority. Generalize
the existing atomic selection/anchor transition; do not create panel-local
selection or anchors. Typed frontend requests carry project/visit, entry,
artifact, residue, modifier-operation and source identity, and resolve against
the current artifact-keyed query cache. Reject retired ownership and missing
targets without selecting stale membership.

Panel residue actions select all existing normalized residue-member atoms in any
viewer picking mode. Plain activation replaces and establishes the start;
Ctrl/Cmd toggle-on establishes a start only when Shift is absent. Alt subtracts,
then Ctrl/Cmd toggles, then Shift adds a range or the ordinary target. Shift and
Alt never establish or advance the start. Whole-operand toggle completes partial
membership and removes complete membership, preserving unrelated references.
Preserve `project`, `sequence` and `viewer` source metadata.

Ranges use normalized residue-list order within one entry, assigned protein
component and chain. Never bridge separate source instances with identical chain
names. Preserve numbering gaps, insertion codes, hidden atoms and explicit
residue-member hydrogens without inventing missing atoms or residue membership
for orphan atoms. No valid matching start means additive target-only selection.
Repeated Shift gestures retain the fixed start. Viewer ranges remain eligible
only in Atom/Residue modes; Chain/Structure viewer picking keeps its contract.

Keep existing invalidation on clear, unrelated replacement, project/visit change,
picking-mode change, source-artifact change or incomplete start membership.
Responsive remounts preserve valid anchors; reload clears them. Loading saved
selections/scenes restores references without a start. Anchors never enter APIs,
preferences, project state, scenes, archives, history or normalized artifacts.

Rationale: cross-panel ranges need a common explicit residue action, rather than
inferring a start from canonically sorted atoms or maintaining synchronization
between independent owners. This supersedes only D-122's viewer-only
anchor-establishment limitation. Preserve D-120's modifier precedence, D-122's
source boundaries/invalidation and D-123's separation between native authoring
proof and actual-reader retention.

No HTTP/job/plugin contract, persisted selection/schema, molecular artifact,
migration or dependency change is authorized. Stable minor 0.25.0 is planned
against verified 0.24.1 because this adds cross-interface selection capability;
final candidate, exact-master and actual prior-reader qualification remain
mandatory. C0 changes no application version or runtime behavior.

## D-145 — Existing protein-chain components own compact residue navigation

Date: 2026-10-23. Status: accepted by explicit approval of the
[issue #94 plan](plans/issue-94-protein-residue-hierarchy.md); runtime
implementation pending.

Extend D-097's independent Components browser as Protein category → existing
protein-chain component → residues. Current D-045 components already represent
source chain instances; do not insert a duplicate chain level or merge instances
based on display names. Assigned protein components may expand into their
observed normalized residues, in normalized list order. Display recorded names,
author/label numbering and insertion codes; mark a fallback internal ID as an ID
when numbering is absent. Preserve nonstandard names and disambiguate colliding
chain labels without changing molecular identity.

Own expanded protein-component IDs alongside category expansion and scroll in
the existing transient per-project/per-entry navigation store. Keep molecular
payloads in TanStack Query. Selection never changes the inspected entry,
expansion, scroll, camera, visibility or viewer picking mode. Preserve browsing
across entry switching and responsive remounts; reconcile deleted identities and
owned focus after current-artifact changes. Browsing does not enter preferences,
project state, history, scenes or archives.

Reuse the continuous virtual list, stable keys, 32px fine-pointer/44px
coarse-pointer rows, eight-row overscan on either side and at most two retained
focus/Details rows. Use cached residue/component membership, not full atom scans
for every row. Selection operands include all normalized members independent of
which rows are mounted. Keep native list/button semantics, separate disclosures
from selection, extend keyboard navigation into children, and retain existing
warning/Details and category visibility scopes. Full/partial/unselected coverage
is derived from canonical references; partial coverage has a non-color cue.

Retain the existing Sequence tab and make only the labeling, indexed coverage and
shared protein-residue selection changes required by #94. Preserve existing
nonprotein polymer and whole-chain behavior. Sequence relocation, horizontal
strip and chain-selector redesign remain with #95. Classification, nonprotein
hierarchy expansion and per-residue visibility are outside this contract.

Rationale: the current chain-instance hierarchy and virtual browser already
supply identity, independent browsing, caching and bounded DOM. Extending them
delivers residue navigation without a second hierarchy authority, redundant
nesting, persistent navigation format or unrelated layout redesign. Compact
labels retain scientific identity while complete warning details remain
accessible.

No database/API/job/plugin/scientific-model or archive change is authorized.
Alembic remains 0014; project/viewer/archive schemas remain 2 and
normalized/selection/component schemas remain 1. Qualify exact membership,
source boundaries, owned focus, both themes, keyboard/zoom, bounded large lists,
unchanged native budgets and actual-reader retention before claiming delivery.


### D-144 implementation authorization — issue #94, 2026-10-23

The user's `/goal` authorizes implementation and verified delivery under the
approved feature contract. C1 generalizes the atomic selection/anchor transition
for explicit Sequence protein residues and preserves all existing viewer-mode
and invalidation boundaries. Requests validate current project visit, entry and
artifact before resolving cached normalized membership. The immutable index
retains entry-independent residue membership so reusing an artifact for another
entry cannot publish the original entry's atom references. This is application
lookup state, not a new molecular/schema/API authority. Native/milestone evidence
is recorded in the feature plan; no completion is inferred from authorization.


### D-145 implementation note — issue #94 M2/C2, 2026-10-23

The Components list derives flat category/component/residue rows from cached
application memberships, in normalized residue order. Expanded protein IDs remain
session navigation state. Duplicate component labels receive instance qualifiers
without changing source identity. Left/Right navigation uses explicit parent keys;
selection and disclosures keep separate controls and current project/visit guards.
No molecular, API/job, persisted schema, dependency or migration change. Native
large-list, accessibility and checkpoint evidence remains with the feature plan.


### D-145 large-range qualification repair — issue #94 C2, 2026-10-23

The real 10,000-residue/30,000-atom navigation test exposed a3.2s main-thread task
when the complete source-order range reached existing summary and reconciliation
paths. Keep the approved <750ms gate. Replace per-reference linear atom/residue
search in selection summaries with an immutable-structure weak index, and replace
App reconciliation's repeated atom-ID-array membership scans with entry-local sets.
Both retain exact gapped IDs, missing-reference behavior and source replacement
semantics. This is the bounded lookup repair needed for the approved interaction,
not new selection policy or scientific/persisted state. Pure regressions exercise
entry reuse, unknown/gapped IDs and one index build per immutable source; native
qualification must prove the corrected full path.

The synthetic large-list case profiles navigation with an already loaded hidden
entry and the atom property table unmounted. That existing unvirtualized table is
outside this navigation profile; no general 30,000-row table/rendering throughput
claim is made. Existing native1STP/scientific/surface/movement budgets remain
unchanged and separately required. Exact profile context belongs in evidence.


### D-145 closed edit-launcher membership repair — issue #94 C2, 2026-10-23

After summary/reference lookup repairs, the unchanged large-range gate still
reported1721ms. A separate native CDP CPU profile identified the closed molecular
Edit launcher's per-reference `atoms.some` eligibility scan as the dominant work
(1340 sampled frames in that predicate). A disabled query still exposes cached
structure data, so the closed launcher must use a memoized atom-ID set for exact
membership. Keep current stale-reference/eligibility semantics and full edit
regressions; do not bypass validation or alter edit behavior. Retain the CPU profile
as diagnostic evidence; qualification runs without profiling and with original
limits. No molecular/API/schema/scientific-model expansion is introduced.

## D-146 — Application display owns stacked protein sequence context

Date: 2026-10-28. Status: accepted by explicit approval of the
[issue #95 plan](plans/issue-95-workspace-sequence-viewer.md); runtime
implementation not started. C0 authorizes planning persistence only, with a
mandatory stop ready for `/goal`.

Replace the Inspector Sequence tab with a dedicated sequence component below the
3D canvas and above the existing lower panel. The user's confirmed guidance
supersedes the issue's single active protein/chain selector: show all displayed
protein chains in vertically stacked, nonwrapping, independently horizontally
scrollable rows. Protein-only scope explicitly supersedes D-145's temporary
retention of nonprotein Sequence-tab access; other molecular access remains in
Components and existing tools. Do not change protein classification or infer
missing residues.

Derive rows from assigned protein component and normalized chain identities in
current artifact-keyed application projections. Entry visibility, protein
settings, applicable representations/masks, and current isolation determine row
eligibility. Retain the complete observed chain while any part is displayed.
Visible protein surfaces retain declared source-chain context; camera clipping,
occlusion, cropped mesh pixels, and renderer internals do not define sequence
membership. Keep separate source instances distinct despite colliding labels or
numbers. Preserve normalized residue order, author/label numbering, insertion
codes, explicit internal-ID fallback, and recorded nonstandard names.

Reuse D-144's guarded residue action, canonical atom references, modifier policy,
and shared transient fixed anchor. Complete residue operands include hidden
members; displayed DOM or rendered membership never limits selection. Derive
full/partial/unselected coverage from the central selection. Selecting, browsing,
collapsing, or hiding sequences cannot move the camera, reveal atoms, change
picking mode, mutate the project, or create another selection authority.

Keep molecular payloads in TanStack Query and isolation with its existing viewer
owner. Persist only the safe workspace presentation preference
`sequenceDisplay: "expanded" | "collapsed" | "hidden"`, with expanded as the
default. Keep scroll/focus context transient and project-scoped across responsive
remounts; reset on project change/reload and reconcile removed identities. No
browsing or anchor state enters project snapshots, history, scenes, or archives.

The expanded area accommodates up to three chain rows and at most one-third of
the available viewer region, with vertical scrolling for additional chains.
Collapse leaves a compact header; hide leaves a named toolbar restore control.
Both are independent of the existing lower-panel layout/collapse state. Preserve
the renderer instance and existing saved panel-layout shape. Selection does not
automatically scroll; keyboard focus reveals its own target. Native accessible
controls, non-color partial coverage, theme tokens, and the existing virtualizer
provide bounded two-axis browsing without a new dependency or ARIA tree.

Rationale: workspace-derived stacked rows preserve visible molecular context
without a chain selector, another molecular authority, or pixel-driven row
churn. Shared actions retain cross-panel behavior; browser presentation and
transient browsing remain outside scientific persistence.

No HTTP/job/plugin/scientific-model, molecular artifact, dependency upgrade,
database migration, or persisted schema change is authorized. Alembic remains
0014; project/viewer/archive schemas remain 2 and normalized/selection/component
schemas remain 1. Plan stable minor 0.26.0 against verified 0.25.0 for the added
independent sequence workspace. Complete candidate/exact-master and actual
prior-reader qualification remain mandatory before delivery; C0 changes no
application version or runtime behavior.


### D-146 implementation authorization — issue #95 M1/C1, 2026-10-28

The user’s `/goal` authorizes implementation and verified delivery under the
approved feature contract. C1 extracts reusable protein sequence presentation,
source-instance rows and residue labels into typed frontend modules while the
existing Inspector remains the working integration. The shared immutable gesture
index supplies exact protein membership and source order; cached rows retain no
entry identity, preventing artifact reuse from selecting another entry. Assigned
protein scope and identifiable nonstandard names follow explicit user guidance.
No scientific inference or API/schema/migration/version change. Native evidence
and the initial/final qualification attempts are retained in the feature plan;
docking and final qualification remain C2 onward.


### D-146 implementation note — issue #95 M2/C2, 2026-10-28

The docked component consumes existing visible artifact-keyed projections and
viewer-local isolation. A weak immutable-projection/settings cache derives
logical displayed protein rows from ordinary representation membership and
independent surface sources. It never reads mesh pixels or publishes molecular
state. Row identity includes entry/component/chain; complete observed residue
context and exact shared canonical operands remain independent of virtual DOM.
Previous-artifact rows are visibly updating and cannot publish residue actions.

Only the validated expanded/collapsed/hidden preference enters safe browser
storage. Separate project-scoped transient navigation holds row/residue IDs,
scroll positions and owned responsive focus intent, not molecules or selection.
Keyboard navigation reveals focus, while unrelated selections do not scroll.
Hide/show focus returns through connected controls; collapse and lower-panel state
remain independent. Focus requests retire after fulfillment rather than reclaiming
focus on later selection renders. Native evidence and final checkpoint status
remain in the feature plan; no delivery is inferred from this implementation note.

The shorter canvas exposed unpickable raster centers in the intentionally tiny
existing gesture fixture. Read-only native probes confirmed absent picks at those
pixels and valid picks after resizing. Qualification uses explicit existing camera
zoom during setup (and after explicit resize fitting); source fixture, molecular
membership/camera assertions, budgets, renderer bindings and production picking
remain unchanged. The original failed attempts and corrected native cases are
retained. This is test framing, not a renderer fix or a performance speedup claim.


### D-146 outside-focus qualification — issue #95 C3 review, 2026-10-28

A null-related-target blur retires sequence focus ownership, including when a
nonfocusable outside target takes interaction. Otherwise later topology removal
could reclaim focus from the body/canvas. The old guard fails the new regression
by focusing the next residue; the corrected guard retains outside focus. Owned
responsive remount intent is still captured separately during unmount. C3 review
also removes the obsolete Inspector callback and spinner selector and uses a
React-generated content ID. Fixed-source unit/native evidence and fail-first
source hashes are retained; no selection, display-policy or durable change.


### D-146 last-chain and project-viewport review — issue #95 C3, 2026-10-28

When the last displayed chain disappears, the surviving sequence header consumes
only owned unmount focus intent and retires obsolete focus/row identities. It
cannot reclaim unrelated outside focus. A fail-first pair verifies owned versus
unowned behavior. Scroll restoration also checks project ownership on every
initial/layout read: cached-project rendering can precede App's passive store
transition. Reading another project's offsets must yield zero without retargeting
the session store. Its fail-first regression demonstrates the stale viewport.
These complete existing focus/project boundaries, not new navigation policy or
persistence. Final boundary gates and the interrupted first full candidate are
retained; repeat the complete gate from a new clean fixed candidate.
## D-147 — Carbon-first selection coloring uses application-session memory

Date: 2026-10-30. Status: accepted for issue #58.

Selection coloring starts in **Carbon only** mode when the application mounts. A
mode button updates one App-owned transient value immediately, before any color is
applied. That value survives palette closure, selection changes, responsive viewer
remounts and project switches. Reloading the page mounts a fresh application and
restores Carbon only. Do not copy the value into local/session storage, project
state, scenes, history, APIs or molecular artifacts.

This supersedes D-055 only for the coloring-mode lifetime. Custom-color input and
its disclosure remain scoped to one open palette. Mode changes remain presentation
state and issue no selection-appearance request or project command. Applying in
Carbon only continues to send `color_mode: "carbon"`; applying in All atoms keeps
the established omitted `color_mode` wire behavior. Existing element overrides,
reset, undo/redo, rendering and scientific interpretation remain unchanged.

Rationale: carbon-first coloring preserves conventional heteroatom colors, while
remembering an explicit mode choice avoids repeated setup during one working
session. App ownership is the narrowest lifetime that survives project-keyed viewer
replacement without turning the choice into durable user or scientific state.
The compatible presentation correction targets patch 0.26.1 with no dependency,
migration, persisted-schema, HTTP/job/plugin or molecular-model change.


## D-148 — Portable correctness gates and explicit reference timing qualification

Date: 2026-11-02. Accepted by explicit user instruction during PR #126 review.

Default tests must execute scientific/UI workflows without requiring AC power or
a particular CPU/GPU performance profile. Retain finite/nonnegative measurements,
scientific outcomes, exact state/original preservation, request/work/DOM/memory
bounds and generous bounded readiness/hang waits. Only absolute latency targets
(and empirical timing ratios) require `NEISTRA_PERFORMANCE=1`; preserve their
original limits and record whether they were enforced. Invalid profile settings
must fail rather than silently disabling qualification. No timing-based test skips.

Production computation deadlines, cancellation policies and resource ceilings
remain unchanged and retain dedicated enforcement tests. A memory-enforcement
fixture gets its own longer test-only deadline so memory failure is not a race
against the independent short-deadline fixture. General developer/merge gates
run the portable profile; strict timing is separate reference-host qualification.
Existing decisions/plans requiring every pinned-host timing target on arbitrary
developer hardware are superseded only for this test/release policy, not for
scientific correctness, supported capacity or intended responsiveness targets.

Rationale: power saving and machine load change elapsed time without changing
correctness. Controlled timing remains useful regression evidence; laptop power
state must not determine whether a presentation fix can merge. No public API,
scientific model, dependency, persisted schema or production resource policy change.


### D-148 qualification note — PR #126, 2026-11-02

The complete browser execution has one externally interrupted case: Vite's
connection loss triggers a document reload during a native job that converges in
1.443s. Power telemetry has a 216s gap followed by AC/charging; no isolated causal
claim is made. Retain the failed command/trace. An unchanged-source exact-case
replay passes; all other cases passed initially. Complete unique coverage plus
this explicit resolution qualifies the merge, without suppressing failures,
adding skips/automatic retries, changing scientific assertions or needlessly
repeating already passing coverage. Report the mixed power conditions honestly.
No source changes follow qualification beyond documentation/evidence. A release
is outside the user's merge/cleanup request; no release gate or publication is
claimed for an unexecuted merged-master run.

## D-149 — Neistra owns the viewer interface around the rendering engine

Date: 2026-11-02. Status: accepted by explicit approval of the
[issue #96 plan](plans/issue-96-application-owned-viewer.md). Implementation is
pending and must wait for `/goal`; this decision does not claim delivered behavior.

Use the pinned Mol* 5.11.0 custom viewport seam to render its existing canvas
without native controls, settings/menus, hover-information DOM, notifications,
task overlays or logo. Disable outer native task and drag overlays. Keep the
existing PluginUIContext, builders, representation/measurement managers, camera,
picking and application adapter; do not convert the engine architecture or hide
native UI after rendering using CSS, DOM deletion or production observers.

All user-facing controls and feedback belong to Neistra. Preserve application
warnings/errors, import/job/surface/minimization feedback and notification
lifetimes. Extend the existing loading indicator through actual scene
synchronization with transient operation/current-viewer guards. Initialization
and WebGL failures must reach application-owned feedback. Clean up failed/late
mounts, subscriptions and rendering resources. No new task mirror, fabricated
percentage progress or unsupported cancellation control is introduced.

Retain renderer-owned molecular representations, hover highlighting, selection,
interaction markers, previews and application-managed labels and measurements.
The normalized molecular model and backend remain authoritative. No molecular,
project, scene, history, archive, job/plugin or API state migrates into the viewer.
Preserve the D-125 pick-readback patch and #107 maintenance scope.

Remove obsolete native-UI theme overrides, attribution observer and native-popup
clearance helper/variable when unused. Ship the complete Mol* copyright/license
notice outside the viewer in the production distribution and repository
attribution documentation. Required implementation wrappers and canvas layout
styles may remain.

This supersedes D-049 only for retaining/theming native controls and visible
viewport attribution, and related native-popup clearance guidance including the
D-100 release-review note. It supersedes D-124/125's incidental preservation of
native informational label DOM, not their picking, hover, camera or surface
contracts. Theme tokens, scientific molecular colors, accessibility, ownership
and all D-148 portable qualification requirements remain binding. Update tests
that require native controls alongside their removal, preserving applicable
theme, focus, zoom, layout and hit-target coverage.

Rationale: a minimal composition boundary removes competing interfaces without
replacing the qualified rendering engine. Existing Neistra controls cover the
supported scientific workflows. Automatic parity with every native function
would expand scope unnecessarily. Defer application-owned image export to a
bounded delivery follow-up; retain #97/#98 independently. No new hover-information
overlay or advanced renderer panels are required by this approval.

The planned compatible presentation correction is patch 0.26.2 from current
unreleased 0.26.1. Stable releases already exist through v0.26.0. No dependency,
migration, persisted schema, public API/job/plugin or scientific-model change is
planned. The feature contract governs checkpoints, evidence and delivery; C0
persists planning only and stops ready for `/goal`.

### D-149 implementation note — issue #96 M1/C1, 2026-11-02

The minimal viewport retains the existing PluginUIContext and Plugin layout. A
small mounting helper performs the same initialization/render/canvas-readiness
sequence while retaining the React root for unmount-before-context disposal,
including initialization/WebGL failures. Engine disposal is idempotent and late
mount completion cannot bind input/subscriptions to a retired engine. No renderer
architecture, scientific model, dependency or schema changes are introduced.

Screenshot review also identified the canvas-rendered native orientation axes.
Disable that camera helper explicitly: a DOM-only absence assertion would miss
this native viewport overlay. Molecular labels/measurements and navigation remain
intact; no replacement orientation widget is introduced. The native gate checks
both forbidden DOM and the actual camera-helper state. Existing D-125 patch and
D-148 portable correctness requirements remain unchanged.

### D-149 explicit user correction — retain orientation axes, 2026-11-02

The user explicitly stated, “Actually, the orientaion axes can stay.” This
supersedes the axes-disable portion of the preceding implementation note.
Preserve the existing canvas-rendered orientation axes and their default camera
behavior. They are an explicit exception to the native-interface cleanup;
native DOM controls, information overlays, notifications, task UI and branding
remain omitted. No replacement axes widget or new setting is introduced. Native
qualification asserts the retained camera helper is on.

### D-149 lifecycle qualification note — issue #96 M2/C2, 2026-11-02

Native measurement/structure-label representations retain their custom text and
positive visible glyph draw counts through rebuilds, responsive remounts and
project teardown/reopen. Real toast entries and overlay-task events do not mount
native UI. Exact database reads, original bytes and camera are preserved; no
renderer rebuild writes back to the application model. The current render error
still reaches the application alert, unlike obsolete errors. Existing orientation
axes remain enabled. The observation harness is development-only and its cold-cache
and production-exclusion checks pass. Existing annotation overlap/placement is
unchanged; this is interface ownership qualification, not a label-layout redesign
or new scientific algorithm. Final release gates remain independently required.

### D-149 cleanup ordering correction — issue #96 M3/C3, 2026-11-02

A retained native remount trace reveals React cannot synchronously finish a nested
root unmount during the parent root's commit. The fail-first regression reproduces
plugin disposal preceding canvas cleanup. Queue the idempotent root/context
cleanup in one microtask after that commit, unmount the canvas root first, and
always dispose its plugin context afterward. Engine input/subscription teardown
and invalidation remain immediate; no stale engine can accept new application
work. No renderer/state/API/schema ownership change is introduced. Real responsive
and project teardown tests must assert the React warning is absent. This corrects
the earlier intended cleanup ordering without suppressing React diagnostics.

### D-149 native camera-event qualification correction — 2026-11-03

Candidate qualification exposes a missed native double-click expansion. The pinned
renderer emits camera.changed for projection-only multisampling jitter as well
as physical camera changes. The adapter previously cleared transient double-click
history for every such event, although its existing hover invalidation already
distinguishes unchanged application camera state. A deterministic native regression
reproduces the expansion failure with two actual projection updates/events and
byte-for-byte equal physical camera snapshots; it retains trusted native input
and exact complete-residue/individual-ligand membership assertions.

Compare the full physical SDK camera snapshot before invalidating double-click
history. Real camera changes, native drag/wheel, scene rebuilds, modes and existing
lifecycle invalidation still clear it. Projection jitter changes no molecular,
selection, camera, schema or API authority. This is a narrow interaction-preservation
repair required by #96's acceptance contract, not a renderer upgrade or gesture
feature expansion. No deadline, fixture, scientific policy or exclusion is relaxed.

### D-149 verified delivery — 2026-11-03

The accepted interface boundary, explicit orientation-axes exception and appended
cleanup/camera-event corrections are qualified on clean candidate and exact merged
master `e1cae49a9655a4a48a72c25f36bbd45db0273423`. Both complete 20-command gates and actual tagged v0.26.0↔0.26.2
producer/readers pass, with 595 identical source identities, no required scientific
skips or new browser exclusions. Stable annotated v0.26.2 is published from that
master only; [publication/download receipts](assets/application-owned-viewer/c4-publication.json)
verify tag target, release/asset identities, downloaded SHA-256/CRC and internal
file hashes. No migration/API/schema/dependency/scientific-model change. Review
provenance remains local self-review; requested Codex returned no external result.
Later publication-document integration/cleanup receipts in the [issue reply](https://github.com/ManuelSe/Neistra/issues/96#issuecomment-6596946523)
preserve qualified runtime bytes and never retarget the published tag. Image
export remains separately scoped #128; native-feature parity is not reintroduced.

## D-150 — Compatible Neistra technical namespaces and configuration

Date: 2026-11-04. Status: accepted by explicit approval of the
[issue #99 plan](plans/issue-99-compatible-technical-rebranding.md).
Implementation is pending `/goal`; this decision does not claim delivered behavior.

The user explicitly selected Python package moves with compatibility aliases,
then approved the complete proposal with “Implement this plan and wait for goal.”
C0 persists planning only and stops before runtime implementation.

Canonical implementation becomes `neistra_api`, `neistra_core` and
`neistra_demo_plugin`, with canonical package directories and updated maintained
imports/tooling. Retain thin legacy module aliases and source-root bridges so
documented old imports, API/worker invocations and configured plugin targets remain
usable. Both import orders must preserve object/type/exception/ORM/registry/plugin
identity; never duplicate scientific implementations or eagerly import the entire
module tree. Preserve lightweight spawn bootstrap and scientific resource lookup.

Use canonical `NEISTRA_*` configuration when explicitly present, otherwise legacy
`MOLWEAVE_*`, otherwise defaults. An invalid canonical value fails instead of
falling back. Conflicts identify setting names without disclosing values. Apply
the same policy across settings, launch/migration/worker/test/native-toolchain and
resource/cache controls. Preserve production limits and allowlist enforcement.

Explicit store/database configuration wins. Reuse existing default old/new stores
in place; competing default stores require explicit selection. Only genuinely
fresh installations create `.neistra/neistra.db`. Recognize `molweave.db` in an
explicitly chosen root; competing database files need explicit database selection.
An unreadable existing store must never cause a silent empty replacement. Do not
automatically copy, rename, merge or relocate stores. All stack processes must
resolve the same store; no schema migration is introduced.

Accept `.neistra.zip` and `.molweave.zip` using existing strict content validation.
An additive optional archive-export filename-style field preserves old API naming
when omitted; current UI explicitly requests the new suffix, with legacy naming
available through a secondary option. Only filenames change: retain archive
contents, schemas, hashes, original bytes and MIME contracts. Qualify actual older
HTTP readers with legacy-named current archives, not only producer-version strings.

Retain serialized MIME/job/plugin/scientific-model identifiers, `molweave.jobs`
discovery, stored legacy plugin targets, historical provenance and the browser key
`molweave-workspace-v1`. Preserve user names/uploads, scientific fixtures, historical
plans/decisions/releases and evidence. Document residual legacy names rather than
performing an unconditional replacement. No alias removal/deprecation schedule,
public distribution packaging or physical store migration is authorized here.

This supersedes D-048/D-050 only for canonical Python implementation names/current
metadata, configured names, fresh-installation paths and archive filename behavior
approved above. Their historical/data/provenance protections remain. D-002, D-042,
D-148 and current application/viewer state owners remain binding. Project/viewer/
archive schema2, normalized/selection/component1 and Alembic0014 remain unchanged.

Rationale: current developer naming can converge without discarding working
installations or rewriting scientific contracts. Explicit aliases and precedence
bound compatibility work; in-place store discovery avoids data-migration risk.
Stable minor0.27.0 reflects additive public namespaces/configuration/archive support
from established stable0.26.2, rather than a first-release reset or a major break.
Actual preceding-reader, scientific/spawn, candidate and exact-master qualification
remain mandatory under the feature contract. No implementation or release is
claimed by this approved architectural decision.


### D-150 implementation note — issue #99 M1/C1

Canonical implementation directories retain one source of molecular, ORM and
plugin objects. Explicit leaf forwarding files replace their legacy module entry
in `sys.modules`; package wrappers delegate exports and retain their own forwarding
search path. Legacy outer core/demo source roots only bridge to the canonical
compatibility directories. This avoids both duplicated class identities and a
process-wide import hook; no symlinks or eager whole-tree aliasing are needed.
Type-check-only reexports preserve legacy migration imports without executing
another implementation. The existing worker `-m` entry delegates explicitly.

Registry loading treats canonical/legacy targets resolving to the same singleton
as one registration; conflicting independent plugins still fail existing checks.
Historical migrations and actual preceding-reader support keep their old imports
so one harness can execute older tags. Scientific resource files move unchanged;
no persisted identifier, dependency version, schema or chemistry changes in C1.


### D-150 implementation note — issue #99 M2/C2

A dependency-light core helper owns canonical-first environment resolution. The
Python store resolver is shared by settings consumers; the launcher no longer
injects a data-root default that would defeat existing-store discovery. TypeScript
and JavaScript tooling use the same tested precedence contract. Native-toolchain,
cache/resource readers and scientific test guards recognize both spellings; empty
or invalid canonical settings never fall back. Explicitly empty plugin CSV values
still disable configured plugins, rather than restoring the defaults.

The resolver performs read-only filesystem checks before startup mutations,
propagates access errors, rejects broken symlinks/competing roots/databases, and
requires an explicit database URL for nonempty roots without a recognized database.
Existing auto-discovered databases must have a SQLite header. Explicit URLs retain
their intentional database-location override and connectivity validation remains
in the database layer. No missing/invalid store is silently replaced. Tests include
an existing migrated store, project publication and reopen through the other
configuration spelling, plus canonical and legacy native/browser execution.


### D-150 implementation note — issue #99 M3/C3

Archive filename style is an optional literal request field, defaulting to legacy
for existing HTTP clients. Current UI explicitly requests the new suffix; a native
secondary disclosure allows legacy naming. Both names use byte-identical prepared
archive contents and preserve media/schema contracts. Import validates either
suffix before invoking unchanged archive safety checks. Private transient renderer
and RDKit identity-property markers now use Neistra consistently; these are never
normalized/persisted identity authorities. Default generated mmCIF block labels
use Neistra. Original uploads and authoritative molecular IDs are untouched.


### D-150 package-export review correction — issue #99 M3/C3

Full compatibility review reproduces a package-export shadowing edge case: an
explicit legacy demo-plugin submodule import can replace the package's delegated
`plugin` singleton with that submodule. Bind the forwarding leaf while initializing
both legacy package/source-root entry points, then export the original singleton,
matching the original package initialization order. Both-order and old-source-root
subprocess regressions now assert the package-level singleton identity too. No
registry policy, plugin ID, job behavior or scientific state changes.


### D-150 complete-gate logging correction — issue #99 M4/C4

The first complete candidate reports1330 passing Python cases and one missing
configuration-conflict diagnostic. In-process Alembic calls disabled pre-existing
application loggers through `fileConfig`'s default. A fail-first migration regression
reproduces this independently. Preserve existing loggers explicitly in the migration
bootstrap with `disable_existing_loggers=False`; do not weaken the diagnostic test
or re-enable a logger only inside that test.184 focused configuration/store/migration
cases pass after correction. Historical migration files/revisions and schemas are
unchanged. Candidate1 remains diagnostic; a fresh complete candidate gate is required.


### D-150 native-observation correction — issue #99 M4/C4

Candidate2 passes1332 Python/374 frontend/14 supervisor and static/build/migration
checks, then native ammonia appearance fails because current test instrumentation
and exact-tag assertions still read the retired private renderer prefix. The trace
shows an undefined observed layer, not a molecular count/charge change. Stop the
known-failing run explicitly and retain its60pass/1fail/1interrupted/3existing
exclusions/349not-run summary and known-failure trace. Update the two harness readers
and two assertion files to the canonical private tag; retain exact atom/color/mesh
assertions.24 focused desktop/mobile native cases then pass with no exclusions.
The name audit now also rejects retired private markers in live source and tests,
while preserving historical/fixture data. No product runtime or scientific policy
changes; a fresh complete candidate3 gate remains required.


### D-150 verified delivery note — issue #99 M5/C5

Stable minor v0.27.0 delivers the approved additive namespaces, configuration and
archive naming through normal PR #131 merge at
`e702a3d12aabbd1d5bd4eb10bc50ee44ba7c1782`. Complete clean-candidate and exact-master
24-step gates pass with matching 697 source identities, 1,332 Python (zero skips),
374 frontend, 14 supervisor and 352 browser passes / the exact same 62 exclusions.
Actual tagged v0.26.2/current readers pass both ways; legacy CLI/source roots/
settings/target complete a real spawned job. Schemas, migration history, dependency
versions and scientific models remain unchanged. Annotated tag c1f2887 targets the
qualified runtime; stable/latest release and anonymous downloaded qualification
asset verify by SHA-256, CRC and all 192 manifest files. See the feature plan and
`docs/assets/technical-rebranding/c5-publication.json` for precise receipts.

Review remains local implementer self-review: Codex was requested but returned
no external review. No independent approval or strict reference-host timing is
claimed. Publication documentation may advance master through a normal merge
without retargeting the fixed runtime tag; all qualified runtime/test/tool source
identities must remain unchanged. Final issue-response and branch-cleanup receipts
are maintained in the verified issue reply. Deferred public packaging/alias-removal
policy and rejected history/store/serialized-identifier rewrites remain as approved.

## D-151 — Local read-only presentation mirrors the molecular canvas

Date: 2026-11-04. Status: approved planning; implementation awaits `/goal`.

The [issue #97 contract](plans/issue-97-detached-presentation-viewer.md) adds one
local presentation window displaying captured main molecular canvas output. Keep
the capture boundary typed behind MolecularViewer and its lazy renderer adapter.
The child mounts neither the workspace nor a second molecular renderer, project
queries, editing handlers or job subscriptions. It has no independent camera,
selection or project authority. Backend normalized artifacts and existing
application owners remain authoritative; rendered output is transient presentation,
never a molecular store, project snapshot or scientific calculation result.

An application-level controller above responsive viewer remounts owns the child,
capture source and cleanup. Use a narrow same-origin bridge with exact window,
origin, session and source-generation checks. Share the media object through the
same-origin relationship, not serialized scene messages. Child replies are limited
to readiness/lifecycle acknowledgement, never workspace commands. Retire sources
and obscure stale output on project changes, source replacement and disconnection.
Distinguish source health from an unchanged stationary image. Parent reload ends
the session; child reload can reconnect to its still-current owner.

Mirror existing molecular annotations, highlights, surfaces, appearance and live
previews, preserving their existing scientific pause/visibility rules. Keep the
accepted canvas-rendered orientation axes. A latest-value normalized pointer maps
through the displayed source-image rectangle and never changes selection. Retain
necessary temporary preview/loading/error/disconnected feedback while steady-state
presentation remains free of application controls. Fullscreen requires a child
user gesture and retains browser exit behavior.

Explicitly accepted limits: output detail follows main canvas resolution with
aspect-preserving letterboxing; main workspace must remain rendering. Hidden,
minimized, suspended or unavailable sources show paused/disconnected feedback
instead of promising background operation. Desktop Chromium qualification does
not imply every browser-family certification. Remote sharing, recording, automatic
monitor placement, independent high-resolution rendering and image export are
outside this slice; #128 independently owns image export.

Rationale: mirroring the existing canvas carries the entire visible molecular
workflow without duplicate geometry, surface calculations, chemistry, artifact
fetches or complex transient scene synchronization. An independent renderer,
BroadcastChannel scene replication and 3D pointer reconstruction are unnecessary
for the approved outcome. Native WebGL capture, annotation/preview fidelity,
resizing, input isolation and source lifecycle are a mandatory first gate. Failure
requires a revised approved plan, not a silent second-renderer fallback or reduced
essential coverage. Measure capture/compositing overhead; do not promise constant
frame rate or hardware-independent performance.

Preserve D-148 correctness/timing policy, D-149 interface/axes ownership and D-150
technical compatibility. No new HTTP/job/plugin, durable state, scientific
algorithm, dependency or migration is planned. Project/viewer/archive remain2,
normalized/selection/component remain1 and Alembic remains0014. Proposed stable
minor0.28.0 reflects a new compatible user capability on established stable0.27.0,
subject to final version/tag recheck and complete candidate/exact-master gates.
This planning checkpoint changes no application version or runtime behavior.

### D-151 implementation note — issue #97 M1/C1

Explicit `/goal` authorizes implementation after planning3631543. The first native
gate qualifies capture on pinned desktop Chromium: actual annotation raster and
coordinate-preview/cancel output match source canvas content, fullscreen and
one-window reuse work, and child input cannot alter main camera/project/originals.
The capture refresh requests one native draw to initialize an otherwise stationary
scene. A separate bootstrap import avoids loading workspace/API/renderer code in
the child. No molecular/saved-state authority changes.

The test source must be the actual canvas, not an element screenshot that includes
application controls composited above it. Preserve initial diagnostic failures;
correct only that observation and mounted-viewer readiness, without relaxing raster
acceptance. C2 source/connection lifecycle and C3 comprehensive visual/pointer/
accessibility/resource gates remain pending. No schema/migration/version/dependency
or scientific change is made by C1.

### D-151 verification correction — explicit user guidance, 2026-11-04

The user approves replacing the physical second-monitor check with headed desktop
window/fullscreen tests and automated unequal-viewport coverage, and further
clarifies that moving a window to another monitor needs no special test separate
from ordinary window movement. The issue #97 contract records this amendment.
Verify ordinary desktop movement/resizing/fullscreen and retain honest environment
evidence. Do not require or claim a physical second-monitor test. Product behavior,
source-resolution/visibility limits and scientific boundaries remain unchanged.

### D-151 source-lifecycle qualification — issue #97 M2/C2

The App controller retires sources before project ownership changes and survives
responsive renderer replacement. Only exact owned-window/session acknowledgements
extend the connection lease. Heartbeats publish bounded control state without
forcing stationary redraws. Hidden/muted/ended/context-lost sources obscure output;
closing the child releases tracks/listeners/timers. Parent teardown sends terminal
disconnection rather than silently leaving a stale scene. Child reload may reuse
the current source; parent reload requires a new explicit session.

Review adds a receiver-local source epoch in addition to the session generation:
late frame/play callbacks from a replaced stream cannot expose output or clear the
replacement callback's ownership. Tests cover those delayed callbacks, persistent
playback denial, lost ownership and first-frame waiting. Popup failures have their
own application message and cannot mark molecular rendering as failed. Actual
native context loss and project/remount/reload workflows pass. No molecular/API/
schema/migration/scientific/dependency/version change. C3 and release gates remain.

### D-151 visual and accessibility implementation — issue #97 M3/C3

Pointer observations remain passive and bounded to one latest packet per33ms,
with immediate retirement/leave clearing and two-second child inactivity expiry.
Map through the contained source image, never the complete letterboxed window or
canonical selection. The child fullscreen affordance fades while idle, remains
visible while focused, retains F/native exit, and reports denied requests without
interrupting media. A visually hidden heading supports the scene-only accessible
shell without adding visible application chrome.

Initial video stays hidden until a current source frame has actually painted.
Explicit initialization/projection failures propagate to the child, including
when no viewer could bind, rather than leaving an apparently valid empty/stale
scene. Existing source warnings, annotation-overlap limitations and scientific
preview pauses remain owned by the main application. No chemistry, API, schema,
migration or dependency change is introduced.

Twelve native feature cases, real100%/200%zoom, eighteen presentation unit cases
within392frontend tests and a headed ordinary-window/fullscreen case pass. The
58,870-atom resource case retains one main renderer/one active capture per owner,
no repeat structure reads and stopped tracks across three cycles. Existing
desktop/mobile regression qualification and complete release gates remain pending
at this implementation note; exact checkpoint receipts govern final claims.

### D-151 C3 checkpoint qualification — 2026-11-04

All392frontend,12native feature,1headed ordinary-window/fullscreen and69existing
desktop/mobile workflow cases pass. The13layout exclusions are an exact subset of
the verified0.27.0 baseline, with no new scientific exclusion. Lint/types/build,
shipped license and lightweight production-entry/test-harness audits pass. The
headed browser observes movement to80,70 and reports maximization; actual browser
zoom1/2 preserves44px controls and accessibility. The user-approved ordinary-desktop
amendment is satisfied without claiming physical multi-monitor testing.

Source/projection initialization failures now have explicit child status, and
video remains hidden until a current frame paints. This removes initial zero-size
media observation and avoids presenting failed loading as an empty valid scene.
Tests await acknowledged display changes, retain correct authored ethane2C/6H
counts, and use the actual toolbar launcher. No chemistry or API behavior was
changed to satisfy tests. Full release/actual-reader qualification remains C4/C5.

D-151 final review note (issue97): source generations and binding leases have
separate lifetimes. Capture failure may advance output invalidation without
preventing the current renderer owner from releasing its binding. The regression
asserts release after an unsupported capture and preserves stale-binding rejection.
No molecular owner or persisted contract changes.

D-151 delivery note (issue97, v0.28.0): native capture, actual current-frame workflow
coverage and complete candidate/exact-master qualification confirm the approved
local ownership boundary. No scientific algorithm, public API contract, dependency,
durable schema or migration changes. Both actual preceding readers retain rich
projects/archives. The stable additive minor release preserves source-resolution,
visible-source and pinned-browser limits; strict reference timing and independent
approval remain separate claims. Publication/evidence references live in the issue
feature plan and verification log; historical decisions remain unchanged.

## D-152 — Read-only viewer warning details and focused input ownership

Date: 2026-11-13. Status: accepted by explicit approval of the
[issue #98 plan](plans/issue-98-viewer-warning-details.md). Planning persistence
only; application implementation must wait for `/goal`.

Expose the existing viewer warning count through a compact application-owned,
non-modal details surface. Derive both count and grouped rows from current
`Entry.warnings` on entries with `visible: true`. Preserve duplicate records,
entry/warning order, current names and supplied severity. Stable entry identity,
not name, separates groups. Loading success, selection, isolation and component
visibility do not redefine this existing count. Renderer errors, reduced-detail
notices, interaction diagnostics and operation notifications remain separate.

Own only transient popup/focus/position state. Add no warning snapshot/store,
request, polling, job, project command, scientific operation or persisted state.
Opening, reading and dismissal never acknowledge, resolve or modify warnings.
Original uploads and authoritative molecular/project state remain unchanged.

Use the installed dialog primitives with explicit non-modal semantics and no
backdrop. Only the warning trigger becomes pointer-active within the passive
status overlay. Preserve full readable messages, severity semantics, scrollability,
keyboard access, themes, touch targets and viewport/zoom usability. Existing
palettes cannot be reused unchanged because they prevent outside dismissal.

When the current warning count becomes zero, hide the ordinary trigger but keep
an already-open surface showing "No warnings for visible structures". Retain a
valid positioning anchor. Project changes and viewer remounts close the surface.
Escape/Close restore focus to a live trigger or current viewer fallback; outside
actions and project changes retain their own focus destination.

Movement handles Escape on window capture before dialog handlers. A narrow guard
for focus inside this warning dialog must leave Escape for its dismissal without
cancelling movement. A background non-modal dialog must not suppress ordinary
canvas cancellation. Explicit `aria-modal="false"` also preserves existing modal
detection semantics. Qualify first-Escape dismissal and subsequent canvas-Escape
cancellation; no general dialog/input framework refactor is authorized.

Rationale: existing project summaries contain the exact records, and entry details
already expose them. This corrects discoverability without new scientific/data
authority. Optional technical metadata, search/filter/export, repair actions,
persistent acknowledgements and global message logs are outside the approved
delivery; no speculative follow-up is required.

The compatible correction is planned as patch 0.28.1 from verified stable 0.28.0,
subject to release/tag recheck. Stable release history already exists; do not reset
numbering. No new scientific method, public API/job/plugin contract, dependency,
schema or migration is planned. Head remains 0014, project/viewer/archive schemas
remain 2 and normalized/selection/component remain 1. All five application version
sources advance only during release preparation. The feature plan governs the
focused checkpoints, complete gates, actual preceding readers and all seven
specialist implementation assessments. C0 persists planning and stops.

### D-152 implementation authorization — 2026-11-13

The user explicitly invoked `/goal` after approving and verifying the planning
commit `1c8a571`. This authorizes the approved implementation and gated delivery
workflow. The initial planning-only status above is historical; the ownership,
scope, compatibility and qualification decisions remain binding.

### D-152 C1 implementation and focused qualification — 2026-11-13

The count and groups now share current visible-entry warning props; the dialog
owns only local lifecycle/focus/position state. A retained status anchor supports
the current empty state. Named warning groups use local group semantics rather
than page landmarks, preserving identically named entries without accessibility
conflicts. The Close control retains existing icon-button styling and its
accessible name without a redundant tooltip layer that would consume Escape.

The focused movement capture guard defers only when focus is inside warning
details. Native first-Escape dismissal from content and Close preserves active
movement; subsequent canvas Escape retains cancellation. Exact-record, pending/
failed-loading, empty/focus, project/remount and immutable-state checks pass.
The feature evidence index retains diagnostics and matching source/log identities.
No scientific, API, schema, migration, dependency or version change is introduced;
complete release qualification and final specialist assessments remain required.

### D-152 C2 keyboard and bounded presentation qualification — 2026-11-13

Native long-list accessibility checks require explicit keyboard focus semantics
on the scroll body. Use a named focusable region with existing inset focus styling;
Tab/End/Home and Escape from the list preserve the established read-only/movement
contract. A bounded payload-access experiment independently demonstrated that JSX
inside a closed portal still read every warning. Construct portal rows only while
open; do not add a cache, worker, pagination or truncation. Getter-counted closed
records now incur zero message/severity reads; all current rows remain available
when opened. This is not a latency or universal capacity claim.

Actual extension-driven browser zoom waits for the real responsive replacement
viewer before opening details, preserving intentional popup retirement. Complete
C2 evidence qualifies 54 native passes / 6 exclusions (five existing, one real
desktop zoom exclusion under mobile emulation), all 402 frontend tests and static/
build checks. No API, scientific method, schema, migration, dependency or version
change is introduced. Final-version complete gates/readers and all seven final
specialist implementation assessments remain required.

### D-152 release preparation — 2026-11-13

The fresh remote/base check retains master 00320ea and stable latest 0.28.0 with no
0.28.1 tag collision. Prepare patch 0.28.1 in all five authoritative sources and
retain preceding archive-producer coverage. This corrects access to existing
warning information without a new scientific/API/persistence contract. No schema,
historical migration or dependency change is introduced. Complete final-version
gates, actual tagged readers and final specialist assessments precede delivery.

### D-152 verified delivery — 2026-11-13

Issue #98 is delivered through [PR #135](https://github.com/ManuelSe/Neistra/pull/135) as stable [v0.28.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.28.1)
from exact qualified master `d7ea8e91b6ba4ecf0298f4bd92ffea69b44100c2`. Both complete 24-step candidate and
exact-master gates, actual tagged 0.28.0 readers in both directions, both archive
suffixes and all seven final specialist agent assessments pass. Current 718 and
preceding 713 source identities verify. The candidate interruption uses verified
completed checks on unchanged originally clean source and a complete restarted
browser invocation; partial browser results are excluded.

The accepted local current-warning projection, explicit non-modal/focus/input
ownership, complete message/severity fidelity and patch rationale remain unchanged.
No scientific, API, dependency, persisted-schema or migration change was introduced.
[Publication evidence](assets/viewer-warning-details/c4-publication.json) and the
[verified issue reply](https://github.com/ManuelSe/Neistra/issues/98#issuecomment-6851862559) retain runtime/publication and later integration/
cleanup receipts. These are specialist agent assessments, not independent human
approval. Later documentation receipts preserve the released runtime tag.

## D-153 — Current connectivity and reliable quick publication

Date: 2026-11-13. Status: approved by the user's “Implement the plan.” under the
[issue #137 contract](plans/issue-137-authoritative-minimization.md). C0 authorizes
planning persistence and an explicit stop ready for `/goal`; implementation is pending.

The user's subsequent corrections supersede any earlier allowance for independent
display or minimization inference of missing current connectivity. The current
normalized molecular graph is authoritative. Original uploads remain immutable
provenance and recovery artifacts; they never authorize restoring a current bond.
Viewer bond representations, edits and quick minimization must consume the same
canonical endpoint set, including a sparse or empty graph. Deleting a bond must
remain effective despite unrelated unknown charges/orders. Temporary parameter
interpretation of existing edges and disclosed helpers/caps remain supported,
but cannot reconnect absent canonical edges, directly or indirectly.

New PDB/mmCIF imports honor the existing infer_bonds option and record supported
standard-protein inference canonically, with unknown orders, inference provenance
and warnings, before display. Existing explicit chemistry is preserved. The plan
defines conservative sequence, geometry, conformer and break checks; no missing
atoms or unsupported coordination/topology are invented. The user explicitly
selected leaving existing projects unchanged: no read-time migration, automatic
repair, original-file comparison, or new connectivity-repair action. Current sparse
graphs remain sparse; factual calculation diagnostics explain limitations. Existing
manual editing remains available. Reuse the existing authored bond-exclusion
contract across editing paths, without adding a molecular schema.

Quick Apply is an App-owned publication transaction independent of panel/preview
generation. On an ambiguous response, reconcile fresh project/job state and the
durable application marker; absence of a marker at the same revision is not proof
of nonpublication. Retain project-scoped write guards and a session journal, allow
read-only refresh and explicit same-result retry, and never blindly replay Apply.
Late results cannot retarget another project or steal focus. This refines D-129
without adding a generic transaction framework or server publication endpoint.

The broader approved scope includes prerequisite/outcome feedback, explicit draft
recapture, staged target/context details, effective-field provenance, scientific
regressions, measured per-job indexing and small shared API helper extraction.
Preserve D-143 quiet execution and D-148 portable correctness/opt-in strict timing.
Use extensible job result values/model artifacts for versioned field provenance;
retain quick-report schemas. Corrected quick implementation is 1.0.3, with historical
inspection/download retained and earlier proposal Apply refused. Version mismatches
at worker dispatch/child execution fail explicitly rather than misstate provenance.

The planned stable release is minor 0.29.0 because expanded controls, diagnostics
and import behavior accompany the fixes; stable 0.28.1 and earlier releases already
exist. Update all five application version sources only during release preparation.
No database migration, dependency upgrade or canonical schema change is approved:
head 0014; project/viewer/archive 2; normalized/selection/component 1. Actual 0.28.1
reader qualification, complete candidate/exact-master checks and all seven final
specialist implementation assessments remain required. No application fix, passing
future release gate, PR, merge, tag or release is claimed by this planning checkpoint.

### D-153 C1 implementation qualification — 2026-11-13

The subsequent `/goal` authorizes implementation/delivery. C1 records supported
connectivity during new import only; current display/calculation graphs remain
literal thereafter. Known nonpolymer/entity boundaries veto inferred peptide links.
Typed local connectivity-limited state marks sparse protein interpretation
approximate even when native MMFF parameters exist; temporary H assumptions are
explicit. Helpers cannot create direct or indirect canonical reconnections.

Native root/subset bond discovery had a spatial cutoff even with infinite pair
distance. Operator-aware canonical pairs on the current model preserve exact
cross-unit edges through representations/preview refresh. Existing model metadata
is shared across all editor paths, including pruning after protein deletion.
Historical fixture construction explicitly opts out of new import inference to
preserve committed archive bytes. Worker parent/child version mismatches fail
before executing another implementation; earlier quick proposals retain inspection
and artifact downloads, with Apply requiring a corrected run.

[C1 evidence](assets/authoritative-minimization/README.md) records focused
qualification and scientific correction/review. These are checkpoint results,
not the complete release gate or final seven-role implementation assessment.
App version/schema/head/dependencies and original artifacts are unchanged.

### D-153 C2 implementation ownership — 2026-11-13

The App retains per-project publication sessions and a minimal verified session
journal; preview/panel dismissal cannot erase dispatched work. Every ambiguous
response follows fresh project/job reconciliation. A matching durable marker is
evidence of a recorded command, not proof that later Undo/edits left it applied.
An unchanged revision without a marker never authorizes automatic replay. Explicit
retry retains the original job/digest/revision and uses existing server idempotency.

Project commands capture source identity before asynchronous mutation preflight
and recheck its guard immediately before dispatch. This also governs direct edits,
movement, import and result import. Read-only availability is separate from write
availability, preserving Export and Jobs during recovery. Normal confirmed success
is transient; unresolved recovery diagnostics remain persistent. No server API,
database or molecular schema changes are needed. Focused checkpoint evidence is
recorded in the feature plan; final integrated qualification remains pending.

### D-153 C3 effective-field diagnostic contract — 2026-11-13

Keep strict quick reports/proposals at schema1. The independently versioned
`effective_field` object is additive inside generic job result values and the
temporary model ZIP. Components carry canonical membership and actual installed
base treatment after fallback/rebuild, not initial parameter availability. Native
components can also participate in approximate steric context. Coverage describes
the disclosed local objective, never physical completeness or a validated pose.

Scientific design review independently reproduced moving MMFF/UFF, fixed UFF,
mixed native/repair and supported-fixed/no-native-field cases. Use scoped omission
keys: `uff_electrostatics`, `unsupported_site_electrostatics`, `coordination`,
`unsupported_physical_terms`, `fixed_only_native_terms`, `current_connectivity`.
Missing unsupported-site electrostatics do not deny native-native MMFF terms.
Sparse attribution intersects modeled residue diagnostics with each component's
canonical references; a global flag cannot label every component. A fixed-only
constant has zero moving derivative and does not alone reduce moving-force coverage.

The frontend validates version, exact keys, capacity, deterministic component IDs,
disjoint canonical membership, methods, coverage and the omission union. Missing
historical metadata and invalid/unsupported metadata have distinct fallbacks;
neither changes scientific Apply eligibility. No numerical method, public input,
database migration or molecular/project/archive schema change follows from these
diagnostics. Implementation qualification remains a separate checkpoint gate.

### D-153 C4 observed-state qualification — 2026-11-13

Independent qualification reproduced five ordinary supplied-state failures:
acid H on the first named ASP/GLU oxygen, and coherent alternate supplied charges
on histidine or the first ASP/GLU oxygen. Independent state expectations failed
five cases before correction (19 passed). Resolve unknown carboxyl orders/charges
jointly from observed H, known orders and assigned charge before named defaults;
avoid duplicating an existing histidine cation. Explicit orders/charges, atoms,
coordinates and the exact current endpoint graph remain authoritative. Conflicting
assigned facts retain existing warned repair/refusal; no enumeration, pH model,
canonical repair or broader residue support is introduced.

The bounded scientific matrix adds supplied-state, conflict, disulfide, terminus
and exact cap tests; synthetic state coordinates qualify interpretation, not an
equilibrium pose. Mixed moving profiles use fresh independent native fields and
full-pair harmonic/steric sums, with the distance-constraint convention ½kδ².
Finite differences use 1e-5 angstrom steps, 1e-4 absolute/1e-6 relative gradient
tolerances away from kinks and 1e-6 objective tolerance. Native kcal/mol and
surrogate penalty quantities remain distinct. Real worker/API profiles protect
sparse IDs, inactive conformers, fixed rows, source/original bytes, history and
archive compatibility. No numerical force-field redesign or persisted schema is
needed. C4 is the corrected baseline for subsequent measured indexing work.

### D-153 C5 measured assembly indexes — 2026-11-13

Measure against corrected C4 `80adf97`, rather than an earlier scientific method.
Exact count-only radius queries use `eps=0` and preserve closed 6/7/8 angstrom
membership. Each assembly owns immutable captured rows/coordinates, current
adjacency, residue groups and nonprotein components; component members are stored
once with atom-to-component references. Source/classification mismatches reject
reuse. Preserve the existing halo/residue/nonprotein closure order and partition
induced subsets without traversing omitted bridge atoms. Whole model rebuilding
replaces discovery and helper-adjacency snapshots. Independent calls, including
Apply screening, construct fresh indexes; none are serialized or shared across jobs.

Protein incident indexes retain endpoint keys and read updated bond objects after
temporary order interpretation. Temporary adjacency caches endpoints only. No
all-pairs distance cache, persistent cache, approximation, dependency or resource-
limit change is introduced. Full timing-free model/report/proposal/provenance data
are byte-identical before/after in three equivalent profiles.

Measured direct-plugin CPU work improves for pocket/18k profiles, while small work
is unchanged within noise. The retained indexes increase whole-job memory; only
dense-query tracked allocation decreases. Accept this bounded linear memory/CPU
tradeoff with existing worker limits intact. These local measurements do not
establish browser latency gains or strict reference-host timing qualification.

### D-153 C6 shared publication infrastructure — 2026-11-13

Extract six small persistence functions rather than a common scientific Apply
pipeline. Quick minimization owns an independent constructor/service; both callers
share lookup, artifact integrity, source parsing, pre-read publication locking and
pure selected-coordinate replacement. Transaction completion, annotations,
scientific acceptance, captured dependencies, warnings, provenance, history and
artifact publication remain service-owned. Preserve error mappings and the exact
strictly-greater-than-1e-9 angstrom component displacement threshold. A legacy
module alias preserves namespace identity. No public API, schema, dependency,
version or scientific-policy change is required. Independent architecture review
and service/native qualification are recorded in the feature evidence.


### D-153 C7 release and closure instruction — 2026-11-13

Retain stable minor 0.29.0: new import behavior and additive controls/diagnostics
extend 0.28.1 without incompatible persisted schemas, APIs, archives or dependencies.
A real release/tag history now exists; qualify actual tagged 0.28.1 readers both
ways and repeat the complete gate on exact merged master. The user's subsequent
explicit `/goal` requires `Closes #137` in the PR, superseding the approved plan's
earlier post-publication closure timing. Normal merge may close the issue; final
close-out still requires verified exact-master qualification, tag, release and
issue reply. No protection or acceptance gate is waived.

### D-153 C7 metadata validation correction — 2026-11-13

Full-diff preflight reproduced a Python/viewer mismatch: boolean `true` was coerced
to schema version1 in authored modeling metadata, while the viewer rejected it.
Add a before-validation boolean guard and an all-editor-path regression. The new
expectation fails before correction; 53 focused cases then pass. Ordinary numeric
version1 metadata and measured C5 fixture behavior are unaffected. This enforces
the existing malformed-metadata contract without a schema migration or broader
metadata redesign; complete final candidate qualification remains required.


### D-153 C7 qualification isolation and fixture defaults — 2026-11-13

The first full gate exposed a recipe error: canonical DATA_DIR overrides legacy
DATA_DIR monkeypatched inside migration tests, so directory creation and database
connection target different paths. Preserve test assertions; use the existing
legacy test override and clear four inherited datastore aliases before applying
explicit recipe environments. This also keeps direct migration/browser/reader
commands independent of a developer deployment's database URL. Record failed
attempts and rerun the complete fresh gate rather than counting partial results.

Retain the scientific release fixture's default ImportOptions and update its
specific expected graph from17 supplied bonds to940 (17supplied/923inferred),
with exact unknown orders, warnings and inference identities. Independent review
confirms original atoms/conformers/explicit bonds unchanged; this aligns with the
accepted new-import behavior rather than disabling it to retain old assertions.
No application code, migration policy, dependency or scientific tolerance changes.


### D-153 subsequent user direction — quiet successful shortcuts — 2026-11-13

The user's actual Ctrl+M screenshot demonstrates an unreadable notification with
many per-residue warnings/UUIDs and offscreen Close. The user explicitly questions
retaining that message at all. Remove successful-shortcut scientific-warning
popups; do not replace them with warning-count popups. The existing brief
publication confirmation remains. Scientific report/model payloads and applied
entry warnings/badge/Details remain unchanged and full Jobs inspection remains
available. Plain refused/failed notices must not claim no change when another
client may have applied/undone a job. Prerequisite/API errors retain their existing
actionable diagnostics in the bounded notice; generic pre-job wording would lose
information when opening fresh setup. Add no retained-error/setup lifecycle.
Publication uncertainty keeps its distinct recovery path. This supersedes the
earlier shortcut warning-notice presentation, not warning retention or science.

Bound the existing shared application notice and scroll its text independently of
the always-reachable Close control, with long-token wrapping, keyboard access and
unchanged focus/lifetime semantics. Reuse the component rather than a notification
framework. UI/UX/theory assessment supports this correction. Stop the current gate,
retain interrupted evidence separately and repeat complete qualification afterward.
No original user screenshot or molecular payload is published as test evidence.


### D-153 notice reading ownership — 2026-11-13

Independent UI correction review reproduces inherited scroll when a new long
notice replaces a scrolled one. Reset only when notice object identity changes;
ResizeObserver measurements and unrelated renders preserve reading position.
Keep focus/lifetimes and complete text unchanged. Unit/native regressions and an
independent actual-component probe confirm the new message begins at the top
without stealing focus. This extends the existing notice identity ownership,
without a persistent notification model, molecular-state change or new framework.


### D-153 passive short notices and interactive overflow — 2026-11-13

The complete candidate gate finds a concrete regression: pointer events on a
short persistent import message intercept an underlying viewer control. Preserve
the original passive short-notice behavior. Only a measured overflowing text
region captures pointer input for reading/scrolling; Close always remains
interactive. Reuse the existing overflow boolean rather than add another state
owner. Do not dismiss notices or force clicks in tests to conceal interception.
Independent actual-component hit testing and the unchanged native hardening case
verify the correction. Long reading, identity reset, focus, lifetimes, scientific
payloads and production/qualification limits remain unchanged.

## D-154 — One installation-local camera across the application

Date: 2026-11-13. Status: accepted by the user's explicit planning choices and
“Implement the plan.” under the [issue #140 contract](plans/issue-140-representation-surfaces-session-camera.md).
C0 persists planning only; implementation requires the subsequent `/goal`.

Representations remain authoritative per-entry settings. One application camera
is shared across molecules **and projects**. Entry/project changes, imports,
visibility changes, styles, surfaces, new molecules and renderer remounts do not
reset it. Reopening restores the installation's last camera. The sole automatic
fit is the first drawable content on a pristine installation, after hydration
proves no saved/adjusted camera exists; user navigation cancels that opportunity.
Explicit Fit, Focus, Reset, projection and named-scene actions remain effective.
No per-molecule camera map, view selector or new switching workflow is approved.

Plan a singleton WorkspacePresentationV1 with independent revision and typed
camera (mode, position, target, up, radius, FOV), GET/PUT workspace presentation
API and migration 0015, subject to collision check. Navigation writes must not
touch project revisions, dirty state, checkpoints, history, Redo or entry
timestamps. Presentation is installation-local and excluded from archives;
project/viewer/archive 2 and normalized/selection/component 1 remain unchanged.
Existing browser last-project navigation remains sufficient.

One App-owned controller hydrates once, buffers the latest camera through lazy
mounts, serializes/coalesces writes and prevents late responses/restores from
overwriting newer navigation. A bounded local recovery mirror and best-effort
closure flush address interrupted writes; differing server/base revisions require
explicit Save current view. Failures remain visible without disabling navigation.
No power-loss-proof or failed-network persistence guarantee is made.

This supersedes D-022's transient ordinary-camera policy and D-023's implicit
scene-content fitting only where necessary for the approved shared-camera
contract. Their separation of molecular authority, portable scenes and navigation
history remains. Runtime/schema changes, migration and qualification are pending.

## D-155 — Corrected display geometry with bounded surface ownership

Date: 2026-11-13. Status: accepted planning contract for issue #140; implementation
pending. The user explicitly selected a focused release and immediate Undoable
surface appearance, with expanded local styling deferred to one follow-up.

Thin/thick sticks retain the pinned native provider but use uniform size 1,
aspect 1 and existing scale 0.22/0.36 so atom spheres act as matching-radius caps.
Ball-and-stick/space filling retain physical sizes; native multiple/aromatic
notation and canonical graph restrictions remain. Complete styling no-ops must
not consume revision, dirty state, history or Redo.

Whole-entry surfaces move from independent unit shells to combined-context worker
geometry, sharing the existing molecular definition (physical radii, probe 1.4 Å,
grid 0.5 Å, 36 probe positions). Retain fragment/pocket meanings and durable identities.
Input admission is kind-specific: fragment/pocket ≤100,000 effective atoms; entry
<250,000, with the existing parent ≥250,000 fallback still enforced. Preserve
64 million cells, 512 MiB mesh, 1 GiB retained, 2 GiB accounted working buffers, 120 seconds
and one worker. These are eligibility/resource ceilings, not universal throughput
claims. Never silently coarsen. Refusal preserves definitions with explained
fallback. Capacity qualification is required; failure cannot silently reduce the
approved contract. Canonical calculation order requires validated/accounted
display ownership mapping, not equal-count assumptions.

Surface readiness follows successful current-generation installation and is
distinct from effective visibility/isolation. Keep existing entry-owned objects,
commands, source pruning, scene/archive remapping and transient activation. A
unified chooser, bounded list/details manager and narrow surface-only incremental
updates improve the workflow without a generic layer/scene framework. Appearance
commits once per completed gesture; source changes remain explicit captured
Apply/Revert actions. Shared receptor meshes, new scientific surface families,
polymer hiding and local appearance schemas are outside this slice. D-154 owns
the camera across every display transition.

Plan stable minor 0.30.0 because additive persistence/API and workflow functionality
accompany fixes. Five version sources change only in release preparation. Existing
stable 0.29.0 history is verified; all future candidate/exact-master gates, actual
tagged readers and seven-role final assessments remain required. C0 introduces
no application, version, dependency, migration or durable-schema implementation.

### D-155 implementation and delivery authorization

The subsequent issue #140 `/goal` authorizes C1–C7 and explicitly requires
`Closes #140` in the PR. This supersedes the approved plan's earlier Refs/late-close
timing only. Normal merge can close the issue; complete exact-master verification,
annotated tag/release and the final issue response remain required. No protection,
review or acceptance gate is waived. C1 introduces no migration or persisted
viewer-field change; reset scope is an additive request control with all-channel
default, and complete no-ops retain existing history/Redo.

### D-155 C2 implementation boundary

The combined surface calculation is implemented as an internal worker source-kind
contract; it adds no persisted viewer field or project/archive version. Cached
geometry stays in canonical atom order, while a checked bijection owns separate
native display groups/IDs. Retained and active allocation accounting includes
that mapping. Installation acknowledgement, not worker completion, owns Ready.
All kinds use the same terminating worker cancellation lifecycle. C2 evidence is
recorded in the feature plan; this does not certify the remaining workflow/camera
work or the final release. Earlier native-entry behavior described in historical
qualification sections remains historical, with current policy documented in
SURFACES/PERFORMANCE/SCIENTIFIC_LIMITATIONS.

### D-155 C3 editing and reconciliation boundary

Surface creation uses one chooser and derives exact new object identities from
the successful command response, preserving request order without matching names
or guessing after an ambiguous response. An App-owned, project-local editing
session retains captured source drafts and tokenized appearance intent across
disposable viewer instances. It is transient and excluded from archives/history;
only existing surface commands publish completed appearance gestures or explicit
source Apply actions. Project switching discards source drafts with feedback.

Canonical source, visibility or appearance changes retire conflicting previews.
After a responsive remount, valid pending/uncertain intent is replayed only after
canonical scene installation, with fresh tokens and current project/viewer guards.
Uncertain publication requires a fresh read rather than automatic command replay.

The incremental renderer recognizes only surface changes against an immutable
last-sync snapshot. Other molecular/display changes retain the conservative full
rebuild. Object-owned bindings preserve geometry for appearance, rebuild only the
visual for solid/mesh, and retire only affected resources for removal/source
changes. Retired visuals cannot activate an object or fall through into molecular
selection. Fallback lines remain selectable objects, but only actual translucent
meshes affect the mesh picking threshold. This is a bounded surface-specific
path, not a general scene reconciliation framework.


### D-154 implementation boundary — 2026-11-14

Migration 0015 adds an installation singleton with an independent atomic revision;
it does not use project commands or mutate any project/history/artifact table.
Project/viewer/archive 2 and portable scene camera fields remain unchanged. The
separate session camera stores FOV in radians, with zoom derived rather than stored.
Pinned numerical eligibility rejects exact native degeneracy (including the
lookAt component-wise 1e-6 identity shortcut, raw-up cross under/overflow and
nonfinite view/projection arithmetic). These are renderer eligibility checks,
not chemistry rules or a new minimum physical radius. Logical radius remains
positive even below the native clipping floor.

App owns the controller and recovery mirror; viewers own disposable bindings.
Hydration, acknowledgements, mirror conflicts and target retirement use independent
revision/token/generation guards. Unknown or different dirty bases require explicit
publication; a failed refresh cannot silently rebase them. A typed asynchronous
restoration-failure channel keeps lazy startup usable without saving the fallback
over the rejected preference. Failed scene requests cancel only their own pending
intent, including after binding retirement; newer navigation remains authoritative.

The exact final native pose is sampled on the existing commit cadence and once
more during flush/retirement when a valid pose is already known. Final sampling
excludes pristine defaults, pending scene intent and refused display recovery.
Transform-mode getters and observations retain the locked pose silently. No extra
animation loop or per-molecule camera map is introduced. One-fit eligibility is
reserved globally before installation; canonical target references alone are
insufficient. Actual committed, visible, nonzero-alpha native geometry is required.

With native automatic resets disabled, cached public canvas spheres can remain
stale after commits. Current bounds therefore use public committed render objects
and the pinned BoundaryHelper98 aggregation, operating over visual objects rather
than atoms. Clipping changes preserve logical pose and zoom, while explicit Fit
uses current effective visible bounds. Explicit native Reset/axis navigation
resolves immediately at the public boundary so queued fitting cannot overwrite
later input. Native qualification and full release status remain in the feature
plan; this decision does not certify pending delivery gates.

## D-156 — Manager-only surface activation and passive surface rendering

Date: 2026-11-14. Status: approved planning contract for issue #145; runtime
implementation pending. The user's “Implement the plan.” authorizes C0 planning
persistence only under the [feature contract](plans/issue-145-surface-selection-hydrogen-toggle.md).

Surface activation is a transient application-owned manager editing target,
independent of molecular selection and requested visibility. Clicking its active
row toggles it off; an ordinary empty primary viewer click clears activation even
when molecular selection is already empty. Molecular picks retain the manager
editing target and cannot activate a surface or open the manager. A surface-only
shell pixel without molecular geometry behind it follows ordinary empty-pick
behavior, as explicitly selected by the user; no ownership or nearest-atom proxy.

Plan nonpickable, unmarked native solid/mesh/fallback visuals before display
acknowledgement and through updates/rebuilds. Remove renderer activation/highlight
wiring and surface-driven picking-threshold adjustment, retaining managed/retired
identity guards, rendered-atom accounting and ordinary molecular feedback. Reuse
the existing empty replace selection event for application-side clearing, including
zero molecular selection, while preserving modifiers/movement/generation guards.

This narrowly supersedes D-155 C3's selectable fallback/surface behavior. It does
not change surface source definitions, geometry, worker policy, visibility, previews,
draft ownership, history, archive contracts or D-154's shared camera. Deselecting
preserves source drafts and existing unfinished/completed/pending gesture recovery.
Native click-through and marker/rendered regression evidence remain required;
planning and pinned-source inspection do not certify the future implementation.

## D-157 — Prominent icon control for graph-attached hydrogen visibility

Date: 2026-11-14. Status: approved planning contract for issue #145; runtime
implementation pending. The user explicitly chose attached-H targeting, a minimal
icon and prominent placement among representation controls, then approved the
[feature contract](plans/issue-145-surface-selection-hydrogen-toggle.md) for C0.

Replace the selected-hydrogen dropdown with one original H icon in an always-
visible Hydrogens row after atomic representation/Hide controls and before Polymer.
Use the stable accessible name Show non-polar hydrogens: pressed=true means All,
false means Polar, mixed means differing effective preferences; mixed activation
chooses All. Check/mixed-state cues supplement color, with current/next mode and
inheritance in the tooltip/accessible description. A secondary reset restores
entry inheritance for the same target. Avoid chemical addition/charge imagery.

Resolve one exact operand: selected existing element-H atoms plus element-H
neighbors of selected heavy atoms in the current normalized bond graph. Heavy
seeds exclude H/D/T. Use one edge, stable entry/atom IDs and deduplication; recorded
unknown-order/inferred edges count, absent edges are never guessed. Include hidden
and explicitly selected isolated H; no recursive traversal, proximity inference,
atom generation, molecular-state edit or global selection expansion. Preserve
current isotope representation/metadata; broader isotope targeting remains #83.

This supersedes only D-053's prohibition on heavy-atom-to-attached-H targeting.
Complete-projection polarity classification remains renderer-owned and unchanged.
The control expresses nonpolar display preference, local override over entry
default; equal effective inherited/explicit values are uniform. The master switch
remains an independent visibility gate; rendering never publishes a preference.

Use the same memoized pure resolver for state/set/reset. Capture project/epoch,
seed selection, participating artifact identities and explicit H operand; reject
stale contexts before dispatch and after asynchronous preflight. Submit through
the existing revision-guarded appearance API and current-artifact H validation,
without a REST expansion flag, persisted field, migration or new job. Color
targeting remains unchanged. One action retains existing atomic Undo/Redo,
scene/archive and recovery contracts.

Plan stable minor 0.31.0: attached-H authoring adds user-visible functionality to
0.30.0, while surface fixes alone would be patch scope. Established stable history
is verified. All five version sources change only in release preparation; schemas,
0015 migration head and dependencies remain. Actual preceding readers, complete
candidate/exact-master checks and same-candidate seven-role implementation review
remain required. C0 adds no application behavior or version change.


### D-156/D-157 implementation and delivery authorization — 2026-11-14

The subsequent issue #145 `/goal` authorizes C1–C4 and explicitly requires
`Closes #145` in the PR. This supersedes the approved plan's Refs/late-close timing
only. Normal merge can close the issue; exact-master checks, verified release and
final issue response remain required. No product, schema, protection or review
gate changes.

### D-156 C1 creation acknowledgement and canonical UI publication

Native mobile qualification reproduced loss of the second newly created pocket's
manager activation without an intervening row click or molecular deselection.
The command result exposes its exact identity before asynchronous query observer
notification necessarily supplies new entry props. Pruning on local activation
therefore rejected a valid new identity against the previous canonical snapshot.

Reconcile activation on canonical entry changes using a functional state update,
not merely when local activation changes. Preserve deletion pruning and exact
creation identity without timers, guessed targets or forced reactivation. An
independent held-notification component case fails before correction and passes
afterward, including subsequent object removal; native qualification follows.
This enforces existing creation ownership within D-156, adding no durable state,
API or scientific-method change.


### D-157 C2 captured targeting and measured work — 2026-11-14

The one-hop resolver is pure and shared by mode/set/reset. It refuses missing or
mismatched participating projections and stale selected IDs rather than returning
partial targets. A hydrogen-only typed callback captures project/epoch, seed
identity, artifact IDs and the exact H operand; a small command factory checks
current cache/store ownership before construction and after awaited preflight.
The existing endpoint receives only the captured explicit-H selection and revision.
Quiet command feedback reuses the palette's action status; color remains separate.
These are transient UI interfaces, not new wire/schema/archive fields.

Final C2 native qualification covers heavy-only selection, full-graph polar
classification, reset/inheritance/mixed/master precedence, history/reload and
retired hidden loads in both layouts. Native actual200% captures and real keyboard/
pointer actions resolve an earlier incorrectly scaled screenshot artifact without
a product positioning change. The main H row remains before Polymer.

Independent loaded-control profiling across128/10k/100k synthetic atoms confirms
one atom/bond scan per cold/changed context and none on warm preference, busy,
focus or click updates. A real58,870-atom protein plus4-atom ligand uses2initial
structure reads,0repeat reads and4exact single-H commands. Large-scene observed
warm actions take1.87–4.70sdesktop/2.58–5.21smobile, including the unchanged D-155
conservative non-surface renderer path. This is a material known limitation, not
a demonstrated new regression, speedup or strict-host timing result. No broader
scene reconciliation/cache/worker is justified within this correction. Preserve
the existing release gates and resource limits; final seven-role review remains.


### D-156/D-157 C3 release preparation — 2026-11-14

Repository inspection reconfirms stable minor0.31.0 from0.30.0: existing attached-H
authoring is new public functionality, while passive surfaces correct interaction.
All five authoritative versions move together; no migration, REST/persisted schema,
dependency or scientific-method change is required. Actual preceding tagged source
qualification is mandatory in both producer/reader directions and archive suffixes;
version-string compatibility tests alone are insufficient. Fresh complete candidate
and exact merged-master gates, plus all-seven final specialist review, remain
required before publication. This preparation does not assert those future results.


### D-156 qualification note — native polymer provenance

Removing managed surface picking exposes test oracles that formerly obtained
molecular IDs from shell loci. For atom-detail-hidden polymer acceptance, fix an
independent normalized residue target, locate actual native cartoon/backbone
geometry in a bounded projected neighborhood, then verify one real input and its
exact event/IDs. Native polymer groups may return complete residue loci at atom
granularity; do not filter hidden atomic detail, widen accepted IDs, re-enable
shell picks or retry input to preserve an obsolete test. This refines verification
provenance without changing runtime or scientific semantics.


### D-148 qualification note — native readiness before read-only audits

Issue145 full qualification exposed unrelated native warning-fixture races.
Boundary-row visibility does not establish completed native scrolling: observe
the body's own terminal scrollend before the next real input, with cleanup and
unchanged viewport assertions/deadlines. Separately, equal native camera snapshots
do not establish initial fitting's debounced autosave acknowledgement. Wait for
the actual clean public mirror and matching server revision/camera before arming
a read-only request audit; continue to reject every later write. These are bounded
fixture-readiness corrections, not product changes, request exemptions, timing
waivers or proof of a browser defect. Keep failed attempts and focused evidence;
complete clean qualification still restarts from step1.


### D-156/D-157 verified delivery — 2026-11-15

Stable v0.31.0 ships approved issue #145 scope through PR #146, exact qualified master
cc54cd324c5aebe86024c1b85165715691ddcbb3. All33 candidate and fresh exact-master
gates pass; all seven specialists PASS the exact reviewed head with identical
released tree. Actual 0.30.0 bidirectional readers, unchanged schemas/head 0015,
annotated tag, stable/latest release and downloaded qualification-asset hashes
verify. Scientific/portable timing limits remain. No new method, migration or
follow-up issue. Final documentation/cleanup readbacks live in the issue reply;
subsequent documentation never moves the qualified runtime tag.


## D-158 — Immutable artifact identity for structure projections

Issue #147's read-only audit reproduces an Undo/delayed-read/Redo race: a request
keyed by one artifact can fetch current data from another and retain it indefinitely
under the wrong cache key. Add an optional expected-artifact parameter to the
existing structure GET. Reject a mismatch with 409 before capture; capture one
immutable artifact identity, read its bytes and return that identity explicitly.
Unqualified legacy callers retain current-read behavior. New clients validate entry
and artifact identity before shared-cache insertion and propagate cancellation.

Every projection consumer uses the same typed query contract, including hidden
loads, editing, hierarchy, tables, surface inputs and coordinate publication.
Coordinate-seeded continuity values carry the new identity and explicit provisional
status; they cannot certify chemistry/provenance before the mandatory complete
refresh. Request interception/counting compares endpoint pathname so query strings
cannot bypass race coverage. No viewer-owned molecular authority or portable
schema/migration change is introduced; matching client/server deployment is required.


## D-159 — Preserve authored topology through template mutation and diagnostics

The owner explicitly chooses preservation of deliberately cut retained/backbone
bonds while mutating a supported side chain, with a precise warning identifying
the unresolved connectivity. Existing retained bonds, orders, IDs, coordinates and
exclusions are authoritative; new template bonds require a genuinely new endpoint.
Do not silently repair a cut or infer chemical preparation. Existing N/CA/C/O
template-element contradictions refuse atomically. Unknown charge/order in raw
protein input alone does not become a whole-entry veto.

Affected direct-edit bond diagnostics inspect every retained conformer, identify
conformer/bond/atom IDs and explicitly bound/truncate detail without silently
omitting frames. Preserve current geometric thresholds and deliberate warned
drafts; nonfinite affected geometry cannot be published.

Replace the validator's quadratic arrays while preserving its actual scientific
decision: any distinct active-frame pair with strict separation <0.4 Å, including
bonded atoms and alternate locations, yields the existing overlap warning. This is
not an element-aware nonbonded model. Use exact bounded nearest-neighbor existence
queries, first row alone then small batches with immediate exit, inspect both k=2
neighbors excluding self and recompute the original distance. An all-N query can
repeat a full coincident-point leaf scan despite bounded result storage. Independent
brute-force boundary/tie oracles and measured memory/work establish equivalence and
scaling; no universal linear-time claim or altered production atom limit.


## D-160 — Bounded pure editing computation and fresh atomic publication

Use a short immutable snapshot and an ephemeral spawned computation child without
ORM/session or canonical publication authority. Reuse existing process/resource
lifecycle primitives. Heavy parsing, scientific work, staged-result validation and
serialization belong off the event loop; return a small verified result descriptor
rather than receiving a complete large model pickle on the loop. No new durable
job or persisted editing schema is required.

After compute, a fresh session takes the project publication lock before reads,
rechecks revision/artifact/entry lock/allocation floors and publishes one existing
command atomically. Neutralize the lock name while preserving its existing wrapper.
Keep final lock→check→commit synchronous without awaits because other project
writers currently rely on main-loop serialization. Offloading only edit publication
would break that shared boundary. Measure remaining critical-section work; any
necessary off-loop publication must first establish shared revision reservation
across all writers in a separately verified checkpoint, not an edit-only shortcut.

Qualify one active child per API process with bounded admission and no unbounded
queue. Proposed preview/edit compute deadlines are 30/300 seconds, sampled child
process-tree RSS 4 GiB and graceful cleanup 2 seconds before kill/reap. These are
separately named production settings to verify, not the audit's diagnostic 1 GiB
ceiling, import-size limit or a universal aggregate-memory guarantee. Existing atom
and hydrogen work bounds remain binding. Superseded previews are cancellable;
submitted Apply retains operation ownership after panel closure. Cancellation
before publication leaves history/allocators untouched; a committed result requires
reconciliation/Undo, never a false promise of cancellation or blind uncertain replay.


## D-161 — Compact editor truth, captured geometry handoff and five fragments

Keep a bounded original icon-led compact panel with visible verified target identity,
element/formal-charge uncertainty or residue/chain information and actionable
prerequisite reasons. Preview inspection must visibly show preparing/ready/warnings/
partial state, details, Applying and failure/recovery. Preserve deliberate warned
draft authoring, keyboard/focus/coarse-pointer behavior, both themes and real zoom.
Fix the compound eye/H control locally rather than changing every icon button.

Offer explicit guarded Select whole residue recovery after history operations;
never silently broaden an arbitrary or newer selection. Geometry handoff captures
project/epoch/selection/artifacts and opens existing move/rotate, Quick/Advanced
minimization or eligible ligand torsion without running it. Do not inherit a stale
inspector entry or invent a whole-entry operand. Correct torsion's per-conformer
axis, exact endpoints and graph-cut movable side before compact exposure; preserve
fixed atoms and disconnected spectators, units and existing chemistry admission.

The owner accepts five neutral fixed fragments from #71: cyclopropyl, cyclobutyl,
cyclopentyl, cyclohexyl and methoxy. Reuse the existing seeded placement/builder,
qualify final automatic-H output and preserve internally qualified complete template
geometry without a client bypass or general reconciliation disable. Give every
fragment a truthful original glyph. No ring fusion, arbitrary fragments, new
length/angle/stereo authoring, isotope schema, chemistry assignment, preparation or
peptide growth is added. The feature contract records separate issue dispositions.

The owner's explicit plan-and-deliver request and early decisions authorize C0
through full release delivery without finished-plan review. Record the plan as
Authorized within agreed scope; not individually reviewed. This changes no scientific,
verification, seven-role same-candidate, remote protection or compatibility gate.
Provisional stable minor 0.32.0 reflects added functionality; recheck collisions and
all authoritative versions before preparation/publication.


### D-159 C2 clarification — new target connection with retained atom identities

Scientific implementation identifies an overbroad consequence of the new-endpoint
rule: pinned mutation retains common heavy-atom names, so ARG/GLN/GLU/LYS→PRO can
retain every ring atom while legitimately requiring a new N–CD connection. Theory
independently enumerates all 20 pinned templates and finds exactly those four
retained-name target-edge additions. A new target connection need not have a new
atom identity; it must not be confused with restoring a missing source-required edge.

Permit only same-residue PRO N–CD closure with compatible retained N/CD identities,
requested target PRO, a standard source template that did not require N–CD, an absent
current pair and no authored exclusion. Allocate a new inferred bond with template
provenance; keep retained atom IDs and coordinates exact. An authored N–CD exclusion
keeps the ring open with a precise warning. Existing edges retain IDs/order/provenance
without duplication. Measure N–CD distance in Å and warn about unoptimized retained
closure geometry even if it falls inside existing extreme-distance thresholds; no
coordinate search, silent repositioning or validated-conformation claim.

For reverse PRO→ARG/GLN/GLU/LYS, preserve the current N–CD edge under the accepted
retained-topology policy and explicitly diagnose disagreement with target topology;
do not silently certify an ordinary standard target or delete the retained edge.
Keep protein mutation's existing single-conformer admission and atomic refusal of
unsupported multiple frames. Direct-edit diagnostic coverage is independently
all-conformer. This narrowly supersedes only the endpoint condition in D-159,
preserving authored cuts, exclusions and the authorized side-chain workflow.


### D-159 C2 clarification — preserve the predecessor's floating-point reduction

Parent complete-diff inspection identifies that a scalar no-axis NumPy norm uses
a dot-product path while the predecessor dense validator uses explicit-axis
elementwise squaring and reduction. Theory reproduces strict 0.4 Å decisions
changing in both directions on pinned NumPy 2.4.6. For example, the origin and
`[-0.007012883902680816, -0.378476683284495, 0.12925254221614194]` have predecessor
axis norm 0.4, but scalar norm 0.39999999999999997. A second independent vector
reverses the decision. A scalar pair-loop oracle would repeat the same mistake.

Recompute candidate distances with explicit `axis=-1` on the original float64
subtraction, preserving the predecessor's axis-reduction arithmetic. Use the actual
old dense axis=2 expression only for independent small-fixture regression oracles.
Permanent vectors and symmetric ties demonstrate failures before correction.
Bounded theory probes cover 128 clouds and three tree leaf sizes, including adjacent
floats, ties, underflow/overflow and large coordinates with a close pair, without
corrected decision or nearest-rank discrepancies. This qualifies the chosen pinned
arithmetic path; it is not a universal hardware/library equivalence claim. Exact
queries, both-index/self handling, first-row admission, small batches and strict
threshold remain unchanged. No approximation or tolerance relaxation.


### D-158 C1 implementation — cancellation before HTTP dispatch

Consuming the shared query AbortSignal exposes a real redundant-read boundary in
development StrictMode: synchronous dispatch starts an HTTP request immediately,
observer cleanup aborts it, and re-subscription starts the same immutable read.
The unchanged native 10,000-component oracle detects two requests instead of one.
An actual StrictMode component negative control reproduces the same two reads.

Settle one microtask, then check the captured signal before HTTP dispatch. A retired
probe exits without network work; live requests still receive AbortSignal and cancel
when their final observer retires. No timer, second cache, registry or weakened
request-count assertion is introduced. The unchanged native oracle passes with one
read in both layouts; the complete focused 80-case run passes with its three exact
existing exclusions and unchanged source. This refines transient request ownership,
without changing molecular state, schema, science or production capacity policy.


### D-160 C3 clarification — ephemeral Apply outcome evidence

An unchanged project read cannot establish that a lost Apply request has stopped:
an upstream request may still be computing before its atomic revision check. Keep
the submitted attempt above panel/viewer remounts and never infer cancellation or
replay permission from a successful GET. Closing the editor hides a submitted
attempt without aborting its owned request.

Add an optional UUID request header for model/selection Apply and a bounded,
process-local outcome registry/read endpoint. Previews remain outside this registry.
Store only request identity/digest, phase, small outcome/error metadata, timestamps
and confirmed committed revision/artifact identity. Reject reuse rather than execute
an existing token again. Missing, evicted, expired, restarted or different-process
records mean unknown. Do not dispatch a tagged request if registration fails. Keep
active/finishing records until settled; bound completed retention with TTL/LRU.
This is session recovery evidence, not durable exactly-once execution or a new job.

Record commit proof inside a controller-owned transaction observer before the
existing post-commit project response is built. The observer reads only already
loaded identity/revision values, performs no database queries and cannot raise.
An observer failure leaves an unknown outcome. Confirmed saved proof survives a
later project-read, response-encoding or cleanup failure. Proven prepublication
failure and successful no-change outcomes become not-applied only after their
owned work settles. An ambiguous publication exception must remain unknown.

The client freezes one request/context/token, retains one dispatch promise and
queries its outcome during recovery; current project refreshes remain separate.
Never install an earlier committed response over later authoritative edits or Undo.
A deliberate retry after confirmed nonpublication captures fresh context and a
new token. This implements the accepted recovery contract without persisted schema
or migration changes; final integrated verification remains required.


### D-161 C4 clarification — constructed fragment H and finite-coordinate precision

For the five added fixed fragments, derive transient template-to-new-ID ownership
inside the actual placement construction. Validate proper finite local alignment
and rotation matrices, ordinary identities, complete graph/valence, fresh atom
ownership and every conformer before preserving generated H coordinates through
automatic maintenance. This record certifies template-owned construction, not
physical quality or a client-supplied exemption. Existing fragments retain their
ordinary reconciliation, including conjugation-dependent amino H placement.

Do not reconstruct the placement through a runtime rigid fit. A fixed fit residual
can falsely reject representable large translations, while a tolerance growing with
world coordinates can conceal collapsed geometry. Compare each represented
world-space displacement from the generated root directly with its intended local
displacement. Above 1e-8 Å representation error, retain a precise conformer-specific
precision warning and preserve the actual generated rows. This is a numerical
reporting threshold, not physical admission or a new bond-quality model. Bound
diagnostic detail explicitly if many conformers are affected.

Refuse nonfinite coordinates, collapsed distinct generated rows and internal bonds
outside the existing extreme-distance bounds atomically. Do not silently fall back
to ideal H refitting for a small ring. Independent tests must demonstrate proper
transforms, mapping/graph ownership negatives, exact generated-coordinate retention,
ordinary/large translations and distortion before collapse/extreme distances.


### D-160 client recovery clarification — acknowledge uncertainty without replay

Architecture and workflow review identify a permanent recovery dead end if a
missing/restarted/expired receipt keeps a project write-blocked forever. For an
unknown outcome, offer Check status and Review current state. A verified fresh
review shows the canonical affected structure and history, or verified absence if
the target was deleted. Then allow the explicit Continue editing current state
acknowledgment while stating that the earlier outcome remains unknown and may
still arrive. Positively identified pending/finishing operations keep their normal
waiting path; review failure keeps the guard.

Capture and recheck reviewed project/revision/artifact/token identities immediately
before acknowledgment. Changed context requires another review. Persist/read back
the acknowledgment for the exact token before releasing only that editing guard;
storage failure remains visible and keeps recovery active. Keep acknowledgment
separate from outcome and retain bounded read-only old context. Discard the earlier
proposal, automatic Apply and retry intent. Never relabel an unknown operation as
unapplied, cancel it implicitly or automatically resubmit it.

Subsequent editing requires a new deliberate action, fresh captured revision/
artifact/selection and new UUID. Existing fresh atomic checks resolve a late old
operation racing that new action: one can publish from the shared expected
revision, while the other conflicts and must refresh without silent rebasing.
Retain unrelated quick-publication/movement guards. A late old response can update
its own record and monotonic project authority, but cannot erase a newer attempt,
restore an old proposal/selection or steal focus. This is the agreed recovery
workflow, not new execution or durable-receipt functionality.


### D-161 C4 review corrections — admission, periodicity and retained diagnostics

Independent scientific review reproduces three gaps in the new torsion early
return: configured result-size admission and all-conformer affected-bond diagnostics
were skipped, while the reused method converted very large unreduced degrees to
radians and lost rotation periodicity. Passing initial torsion/API cases did not
qualify these boundaries. Permanent regressions reproduce all three before repair.

Refuse an oversized rotation operand before qualification, including zero-angle
setup, using the existing configured result-limit diagnostic. Keep this check
inside rotation so deletion can still reduce an oversized entry. Reduce finite
degrees with `math.remainder(angle_degrees, 360.0)` before radians/trigonometry;
preserve the requested angle in the transient plan/preview and retain the established
fixed-to-moving axis orientation and no-op contract. Regression expectations use
integer-ratio arithmetic for the actual representable float, including positive
and negative 1e12, 1e20 and 1e308, rather than treating a rounded float as an exact
decimal integer. No new magnitude cap or scientific rotation method is introduced.

Reuse finite-derived-length validation and the existing bounded bond-geometry
diagnostic over both axis endpoints and every rotating atom. Include distal moving
bonds and all conformers without expanding the operand to disconnected spectators.
Persist deduplicated diagnostics for a real change; no-op setup returns diagnostics
without changing original warnings, coordinates, artifacts, history or floors.
Tests include inactive-frame outliers, explicit truncation/full counts, distal
bonds, exact fixed material and spawned preview/Apply refusal/publication outcomes.


### D-160 C5 clarification — damaged client journal and bounded acknowledged history

Private recovery-journal reads distinguish absent, ready, invalid and unavailable.
Failed/oversized/partly invalid reads never authorize an assumption that no edit
exists. Retain recoverable identities. Unavailable storage visibly pauses writes;
a corrupt value needs explicit review/continuation before replacement by a small
versioned envelope with an identity-unavailable unknown marker. Each project has
its own reviewed acknowledgment, persisted and read back before only that guard
is released. Keep the marker unknown and preserve known pending owners. Do not
claim every structure was verified when only project/history and no attempt
identity are available. Bound marker acknowledgments to 64 projects; eviction
requires that project to review again rather than silently retaining permission.

Independent 32-cycle reproduction shows that pruning before re-adopting journal
rows resurrects retired records. Merge first, preserve journal age order, then
bound retired acknowledged history to 20 while retaining current and unresolved
owners. Apply the same bound on reload, restore the latest acknowledged current
record and let an aged-out callback retire without regaining UI ownership.
The corrected independent probe retains 20 previous/21 total rows and latest
attempt after reload. Acknowledgment remains distinct from a confirmed outcome.

### D-161 C5 clarification — one operation policy across preview composition

A qualified rotation DTO and correct Apply do not establish visible proposal
geometry. Rendered review finds that the editor captures rotation under preserve
policy while the viewer compares against automatic policy, dropping the proposal.
Use the same operation-specific policy/context resolver at request, capture and
viewer admission. Rotation remains coordinate-only with preserve policy;
ordinary atom/fragment placement retains automatic policy. Do not change science
to make context keys match. Qualification must inspect the actual native moving
geometry, nonpickable rendered objects, visible pixels and Cancel removal while
canonical coordinates, originals and history remain unchanged before Apply.


### D-162 — Owner-validated aromatic carbon H and shared attached-H appearance

The owner reports aromatic bond creation retaining excessive explicit H and the
compact Show explicit H action failing to reveal attached H or toggle. Correct both
before publication of issue #147. The aromatic exclusion is scientific eligibility,
not merely missing dispatch; changing entry-wide visibility defaults cannot replace
selection-local H overrides. Preserve the original merged commit and qualify a
normal corrective PR before tagging, without editing master or retargeting a tag.

For automatic maintenance only, explicitly interpret an eligible ordinary neutral
carbon with authored aromatic incident connectivity as provisional trigonal sp2
coordination. With one to three heavy neighbors and only consistent single/aromatic
heavy edges, target total attached H equals three minus heavy-neighbor degree.
Preserve the authored graph and heavy coordinates, retain aromaticity-unvalidated
warnings and record this local inference. This neither certifies aromaticity nor
repairs rings, assigns charges or predicts protonation. Fractional bond-order
rounding is invalid, including at fused degree-three aromatic carbon.

Keep existing protected/labelled/radical/alternate and explicit-H-intent checks,
whole-site/all-conformer staging and resource limits. Unsupported charge/identity,
heteroatoms, mixed multiple/unknown/contradictory orders and excessive degree retain
H with precise diagnostics. Independent qualified sites may succeed with partial
feedback. Legacy and additive policies remain unchanged. Fixed independent graphs,
counts, formulas and coordinate invariants qualify this bounded extension. Every
aromatic bond edit revisits its endpoints; this local degree rule avoids relying on
later global aromatic perception to revisit previously skipped eligible carbon.

Use the same shared H control and central appearance command in both editor and
styling. Resolve only selected existing H and graph-attached existing H; preserve
selection and canonical molecular state. Compact projection readiness is independent
of styling-panel loading. Capture current epoch/seed/artifacts/revision and recheck
through the existing App publication path. Keep master visibility separate, retain
All/Polar/Mixed and reset semantics, and own pending/late feedback without changing
molecular Apply ownership. This adds no service, schema, migration or second cache.


### D-161 clarification — canonical torsion-axis admission

Whole-candidate scientific review reproduces the new direct rotation accepting an
unknown canonical axis order because the toolkit projection supplies a single-bond
default. The accepted direct workflow requires a known nonaromatic single axis.
Check canonical order equal to 1 and aromatic flag false before toolkit qualification,
including zero-angle setup. Preserve the legacy ligand API and all other eligibility
checks. Refusal must leave originals, coordinates, artifacts, revision, history,
allocator floors and staging unchanged. Independent known-single positive controls
and unknown/multiple/aromatic negative controls qualify this admission correction.

## D-163 — Explicit transient interaction targets and precise inspection

Date: 2026-11-15. Status: authorized planning contract for issue #152 under the
owner's plan-and-deliver invocation; wording not individually reviewed.

Keep qualified immutable interaction records authoritative and apply explicit
application-owned transient targets independently of molecular Inter/Intra scope.
All visible remains dynamic. Selection capture stores exact canonical IDs; one
complete participant group must intersect that set and the other must be disjoint.
Retain full donor/H, ring and charge groups and unchanged scientific evidence.
This is display targeting, not partial-site qualification or molecular selection
expansion. Ordinary selection and result Select never recapture the target.

Exact selection intent survives coordinate/chemistry changes while IDs remain
valid. A whole-ligand label additionally requires the same explicit assigned
instance and identical resolved full membership. Missing current projections mean
validating; missing IDs or changed ligand membership require explicit Update.
Never guess another ligand, prune invalid intent or silently fall back to workspace.
Do not equate navigation residue components with universal molecule grouping.

Use a bounded optional list and precise participant/metric inspector with existing
camera Focus and explicit canonical Select actions. Retire old details on artifact
change. Distinguish salt minimum-site distance from drawn group centers, H···A
from donor···acceptor, centroid metrics and clash overlap. Counts describe records.
Coverage remains a conservative input summary; stronger percentages are unsupported.
Preserve known warning identity and preparation guidance without inventing mappings.
Durable designation, chemistry assignment and 2D diagrams remain separate.

## D-164 — Guarded interaction installation receipts and session appearance

Date: 2026-11-15. Status: authorized planning contract for issue #152; implementation
and qualification pending under the feature plan.

An awaited native geometry task cannot publish after clear, newer requests,
preview/rebuild retirement, renderer replacement or disposal. Recheck generation,
canvas/plugin ownership and eligibility after awaited construction. Publish narrow
display-key/scene-generation receipts: pending on invalidation and ready with exact
installed record keys/counts only after successful current installation. Include
native hydrogen visibility; lazy unmounted adapters cannot claim readiness. App
also guards project, viewer and requested display identity. Shown means installed
eligible records, not guaranteed on-screen unoccluded pixels.

Master show/hide preserves categories/scopes/targets/appearance/cache and avoids
unnecessary cold chemistry; an empty category choice never silently enables types.
Keep all choices session-only. Shared category pattern/color definitions drive
faithful original legend samples and renderer geometry; bounded color/width/reset
are presentation only. Keep markers passive and no permanent contact text. Detailed
identity/metric inspection supplies on-demand explanation without new annotation
authority. No new service, job, molecular/durable schema or database migration.

### D-164 implementation clarification — source-scene ownership

An unchanged canonical isolation request must retain installed markers/readiness;
the surface-specific no-op path does not schedule interaction restoration. Preserve
null versus an empty isolation set. A structural rebuild must also check its own
captured scene after awaited stages before adopting interaction work or publishing
commit/bound generation. Merely reading the latest generation inside the interaction
installer cannot certify the older rebuild's native scene. Held-source regressions
and scoped architecture reassessment qualify this boundary without widening the
scene reconciliation framework.

### D-164 implementation clarification — failed molecular installation

A display-generation match alone cannot certify that molecular source installation
completed. Keep a transient successful-source generation, requested/completed source
operation serial and retained source error inside the disposable renderer. Current
source failure retires shown counts and prevents interaction or appearance retries
from approving a partially installed scene, including empty-result readiness.
Preview Cancel cannot clear this failure; a successful full source rebuild can.
An unhealthy source must bypass the surface-only fast path. Obsolete operations
cannot replace newer pending state, and valid queued updates must eventually make
progress. Readiness follows all awaited source work and scene commit. This extends
installation evidence without changing canonical molecular state, analysis caching,
persisted schemas or scientific methods.

### D-164 implementation clarification — drawable installed records

Native shown counts require generated marker geometry as well as visibility and
successful current installation. A shared pure presentation predicate requires
two finite 3D endpoints and finite positive separation, or the existing exact-zero
clash cross. Coincident nonclash endpoints produce no line and no installed key.
Preserve their detected records, full participants, canonical endpoints and metric
evidence; details explain the unavailable marker and retain Select atoms. Focus
continues to require an installed eligible marker. No epsilon, scientific distance
cutoff, detector change or substitute coordinate is introduced. Independent duplicate
complete-ring input establishes this case without changing scientific classification.

### D-164 C3 clarification — measured work and atomic drawing admission

Equivalent ordinary and dense fixed-profile fixtures establish repeated visibility
filtering and full-record serialization on unchanged camera/panel/receipt renders.
Use one controller-local readonly projection of entry identity, normalized data,
hierarchy and effective settings; compiler-narrow visibility helpers to these
consumed fields. Reuse only when length, order and all field identities match.
Memoize derived display work while keeping immutable-artifact evidence identity
independent. Do not retain old renderer wrappers or create a global cache.

A separate reproduced baseline defect permits one nearest-site salt contact to
request an arbitrarily long group-center dashed line. Add atomic admission before
engine representation updates and before builder allocation or previous-buffer
access. The ceiling is 500,000 conservatively estimated segments: positive clashes
require one, coincident clashes three, and patterned records reserve one extra
complete cycle beyond ceil(distance / cycle length). The reserve covers iterative
floating-point accumulation; a 7.1 Å salt line emits 21 segments although an ideal
cycle calculation predicts 20. Safe arithmetic refuses unsafe/overflowing estimates.

The pinned native builder uses 168 raw array bytes per segment: 84,000,000 bytes
(about 80.1 MiB) at the ceiling. Estimated old/staging/GPU payload coexistence is
approximately 392 MB before JavaScript, metadata and driver overhead. These are
engineering admission estimates, not measured heap or latency guarantees. The
ceiling leaves headroom for ordinary 20,000-record bounded-distance categories;
the analysis record limit does not guarantee every admitted result can be drawn.

An over-budget batch produces the existing display error with no partial installed
keys/counts. Preserve detector output, participants, metric evidence and endpoints.
Keep details/Select available, disable Focus without installed geometry, and allow
a smaller cached target/type set to recover without rebuilding molecular sources
or repeating chemistry. No truncation, coarsening, new scientific threshold,
persistence/API change, production-deadline relaxation or source-failure bypass.

### D-164 C3 clarification — contain expected drawing refusal

After publishing the current native display error and removing its overlay, the
engine completes only a typed drawing-admission refusal without rejecting the
shared molecular queue. Request completion is not a claim of rendered readiness;
the receipt remains authoritative. An expected display limit must not make an
unchanged measurement acknowledgment or completed molecular synchronization report
a persistent generic viewer error. Direct preflight/builders still throw the typed
limit error, and unexpected native/source failures continue rejecting. Qualify
no-op/actual measurement progress, source restoration, cached recovery and absence
of the generic viewer-error banner. Error-inspection test helpers reject by default
and require explicit opt-in to observe an expected queue rejection.

### D-164 release preparation — compatible minor 0.33.0

The additive captured-target inspector, retained visibility/appearance controls and
truthful display receipts justify minor 0.33.0 from 0.32.0. All five authoritative
versions move together. No dependency, schema or migration changes are introduced.
The actual tagged 0.32.0 implementation successfully retains/reexports current-authored
editing states in three isolated-process preflight phases. Both fresh complete gates,
final same-candidate specialist review and protected publication remain separate.


## D-165 — Finite ligand-information program and independent identities

Date: 2026-11-16. Authorized by explicit owner plan-and-deliver invocation for parent11 and required children156–163; plan wording not individually reviewed. The parent contract records finite native dependency order and serial independently qualified child releases. Related acquisition/processing, additional chemistry, interaction diagram, superposition relocation and metadata redesign remain separately owned; no hidden external issue delivery is implied.

Keep canonical sorted selection separate from transient ordered inspection/measurement targets, deliberate inspected entry, durable exact ligand designation and existing transient interaction targeting. Singleton picks or explicit user ordering establish angle/torsion sequence; sorted set order never implies click order. Use current complete observed finite coordinates; missing/preview/degenerate geometry stays explicitly unavailable. Hover single-atom identity is emitted through the existing native owner independently of grouped highlighting, with source/lifecycle retirement and no per-move API work.

Durable designation uses exact canonical membership/origin and an explicit cleared choice, not viewer IDs/labels or automatic first/size/proximity guesses. Candidate eligibility and reliable chemistry are independent. Current-input derived displays synchronously select exact instance/input/source/implementation/policy/settings matches and immediately retire incompatible values; bounded automatic jobs then refresh. Changed chemistry previews initially show labelled unavailable; entry filters always use committed project inputs. Existing fallback neutral/single chemistry adapters cannot qualify descriptors. Migration/archive/history/old-reader preservation or safe refusal must be established before durable code.

Keep the existing inspector until final163; audit and relocate every retained selection/measurement/contact/editing capability.163 expressly supersedes only saved-selection UI and standalone numerical-transform controls, preserving data/services/history. Update product specification then; do not rewrite historical global plan. Full scientific/current release gates, all-seven same-candidate specialist agent assessments, remote protections/reviews and exact merged qualification remain binding. Parent closure and Goalcompletion require all eight delivered plus final integration/release/closeout evidence.

### D-165 independent158preparation — durable intent and explicit old-reader refusal

Prepare independent158in an isolated branch/worktree while156long qualification remains frozen; publish/integrate in the agreed serial order with every final gate intact. No required dependency or exclusion changes.

Choose first-class typed entry-owned designation with a stable intent UUID plus complete canonical membership/current assessed source; keep candidate keys, chemistry hashes and ordinary navigation separate. Source-qualified original mappings govern automatic inventory resolution; guessed connectivity/metadata cannot establish it. Exact selectable membership does not imply reliable depiction chemistry.

Existing checkpoint version markers do not protect older direct writers: actual-source disposable probes demonstrated loss of unknown checkpoint state on oldsave.0016will rename the root project table to an explicit versioned physical name and move project/checkpoint/archive state to3, preserving historical validators. This provides a real old-reader refusal boundary before export/reconstruction; downgrade refuses any nondefault designation across current/checkpoint/history state. The child contract defines tests before accepting this migration. No live store or historical migration is changed by planning.

### D-165 legacy default completion and depiction admission

Automatic legacy designation completion is idempotent system enrichment, separate from undoable user intent commands. A locked revisioned POST changes only exact unresolved migrated defaults and records source/resolver/assessment provenance; preserve all existing history/checkpoint/redo records. Capture legacy creation and molecular snapshots before replay so repeated Undo/Redo restores exact intent. Import automatic assignment remains inside its entry-create command; manual choice and Clear remain reversible. Do not grow the200command budget or discard redo merely by opening a project.

Bound retained depiction content by count, individual/aggregate bytes and atomic admission, preserving existing content at capacity. Source-binding metadata may rotate; content rows are retained so eviction cannot create unbounded orphan drawings. Refuse new drawing publication explicitly before any artifact write when capacity is exhausted. No broad artifact deletion or change to original uploads is authorized.

## D-166 — Source lineage, scientific qualification and recoverable failures

Date: 2026-11-16. Applies to the authorized #158 slice within parent #11.

Molecular instance lineage is separate from current chemistry qualification.
Verify raw mmCIF source tables and any present nonpolymer scheme against the
preserved original. Reconstruct original canonical/source-index/residue/chain
bindings from that original; editable labels, element and bond values do not
replace those identities. An absent legacy receipt may be recovered by exact
original proof with explicit provenance; a present contradictory receipt must
fail closed. Bind the original digest or its absence into inventory identity.

Known-covalent new clusters must belong to one anchored original instance and its
canonical residue/chain partition. Keep valid polymer ownership nonpotential.
Ambiguous ownership and undeclared or inconsistent raw classes stay unsupported
potential inputs, suppressing automatic selection of another candidate. Before/
after known-connectivity checks retire intent after a proven split or merge;
missing source bonds do not become guessed connectivity. Water and monoatomic-ion
exclusions use qualified physical composition where needed, preserving implicit-H
multiatom ions. Molecular formula, mass and charge remain unavailable without
qualified chemistry; an observed atom-charge sum is not a qualified card value.

Failure of an optional original-file integrity check during a valid canonical
edit retires the designation assessment to stale/unresolved with its current
source and recovery reason. It does not block unrelated valid canonical editing.
Preserve assigned intent and exact Undo/Redo snapshots. Canonical-input integrity
failures still block publication; explicit candidate/depiction reads still reject
unverified artifacts. Shared exception types live outside publication services to
avoid a service import cycle and retain historical import aliases.

Recovery feedback belongs to a captured context visit, including same-artifact
choice changes and A→B→A. Known failed input checks retire cached composition and
drawings and block Use until a successful matching-input recheck. They never clear
intent or rewrite history. Explain original-file failures and source conflicts in
compact warnings; reimport creates a new entry, so guidance must say to choose that
new entry. Clear, cancellation, focus and the existing import flow remain intact.

The schema3 fence needs an explicit qualification protocol: actual older-source
refusal of current live stores and both archive suffixes without mutation,
independently older-authored positive fixtures migrated forward with exact new
defaults, and reopening current editing/designation state. Preserve all positive
fixtures, corruption/stale/allocator controls, full synthetic reader stores and raw
observations. Diagnostic v0.33 source checks are not final qualification against
the later released predecessor. Do not mislabel safe-refusal results as successful
older-writer retention.

Measured optional-column fallback allocation was quadratic despite bounded lookup
patterns. Resolve missing coordinate columns once and avoid eager row-sized
scheme defaults. Independent work counters show 4,000,000 discarded slots at 1,000
scheme rows become zero, without changing mapping semantics. Keep workload-specific
cache observations and portable correctness separate from strict-host latency
claims; do not expand this correction into unrelated optimization.

### D-166 future descriptor/profile qualification refinement

Before #159/#160 implementation, pin descriptor options, disposable hydrogen
normalization and source-domain facts. Independent toolkit probes demonstrate
explicit-H-sensitive Strict rotor counts and includeSandP-sensitive TPSA. Required
and feasible named optional profile variants use exact sourced operators and
explicit calculator adaptations. The optional lead-library range uses a disclosed
conservative charged-graph domain gate; it must not neutralize input, pretend to
classify permanent charge, or require new pKa jobs. Source research refines the
child plans; it does not claim those dependent features are implemented.

### D-166 future sidebar/filter ownership clarification

Read-only pre-code assessments refine #161/#162 without changing dependencies or
claiming implementation. One exact current basis joins independently completing
composition, depiction and analysis outputs; producer-specific inventory/graph
hashes are not interchangeable. Sidebar preview unavailability is a presentation
overlay and must not invalidate the committed aggregate data used by filters.
Deliberately inspected entries remain accessible when filtered out; never retarget
the first matching row.

Own name/property/type/sort state above responsive browser mounts and keep filtering
a reversible projection. Qualified preset application includes source-domain
conditions and exact operators, not numeric ranges alone. Manual numeric changes
retain a visible domain until explicitly removed. Count known failures as excluded,
otherwise terminal unavailability before pending work, with disjoint counts over
all entries. Scoped resets preserve independent type/sort and molecular state.
The child plans record these decisions and required tests; proposed aggregate
page sizes still require measurement against delivered #159/#160 before adoption.

### D-166 corrective source audit — representation, water and visit ownership

Independent complete-source review found reachable exact-original query/dummy
qualification, isotope-water exclusions, historical water-label overrides and an
old-visit legacy-resolution error. Apply one concrete-molecule guard after either
recovery or reconstruction, before input hashing, composition or depiction. Keep
exact selectable membership independent and preserve source-proven isotope,
radical, stereo and H semantics.

Qualified water uses atomic-number composition and full H accounting with zero
formal charge; isotope information is retained. A compatible established PDB/mmCIF
water boundary can remain source-assigned without qualified molecular values.
Verified current nonwater wins over historical classification, while raw nonpolymer
ownership defeats name-only water heuristics. Preserve conservative unresolved
states and existing unsupported reasons; no global classification override is added.

Advance resolver/chemistry and matching client keys to v2 so previous derived
bindings cannot bypass corrected qualification. Drawing policy and database/schema
remain unchanged. Preserve explicit intent, original bytes and retained cache rows;
do not add broad garbage collection or a live-state migration for pre-release keys.
Legacy completion captures its open visit for error feedback, preserving global
serialization, bounded priority batches and final scheduling after retired requests.

### D-166 clarification — independent nuclear counts and image recovery

Known canonical element identities qualify heavy-site counts independently of
molecular bond/charge chemistry. Any undefined/dummy element makes the complete
count unavailable, preserving null versus known zero. Explicit D/T counting aliases
are hydrogen only and never rewrite source isotope facts. Retire previous derived
inventory keys through resolver/client v3; keep chemistry v2 and drawing v1.

Depiction metadata success does not establish successful image download/decoding.
Own recovery by exact source visit and image attempt; use a fresh same-artifact URL
and remount for Retry, leaving metadata, choice and canonical state intact. A polite
per-instance status reports failure and requested retry outcome only for the actual
current attempt. Old/failed loads cannot claim recovery, and initial successes stay
silent. Distinct-molecule native controls establish independent URLs; repeated exact
occurrences intentionally share an artifact/browser request.

### D-165 C1 clarification — local inspection ownership and truthful target choices

Keep atom-hover subscription/render state in a narrow viewer-information child. A loaded100,000-atom component probe confirmed that pointer publications in the parent invalidate query-result-array memoization and repeat full-source derivation; the corrected component performs no full-source mapping or network read over20distinct warm targets. This is measured work reduction, not a strict-host latency claim. Source/artifact/settings/renderer qualification remains synchronous in the child.

Selected details own one bounded hidden-source observer only while the disclosure and chosen subject remain current. The pinned query library misses teardown when an observer array only loses its trailing items. Use four fixed quick-inspection slots with unique disabled empty-entry identities, plus one ordinary detail query, retaining existing immutable source keys and cancellation. Release local observers without globally cancelling shared consumers. Test4→1→0, disclosure close, selection retirement, held cancellation, shared consumers and later retired artifact changes. No dependency patch or broader observer refactor is included.

Secondary target choices expose canonical atom IDs and known alternate sites; duplicate entry names gain exact entry identity. Passive strip copy stays compact. Below400px, overflowing header actions scroll inside their own bounded area with focus-outline padding, preventing keyboard focus from shifting the whole viewer outside the viewport. Actual browser zoom uses the fractional visual viewport for containment; integer window dimensions can truncate half a CSS pixel.

### D-165 clarification — atomic atom-field readiness

The complete release journey exposed editable XYZ fields before their current
selected-atom initialization. A traced late projection overwrote an accepted X=4
before submission. Keep element, charge, coordinates and initialized owner in one
atomic local draft. Owner visits include project, chosen editor entry, immutable
artifact and single target; returning through a missing source is a new visit.
Gate the Atoms fieldset until current initialization commits, preserve same-owner
manual drafts across equivalent refetch objects, and keep missing targets explicit.
No/multiple selection marks its owner without reseeding absolute-add inputs.
Existing projection qualification, explicit command publication and other editing
guards remain authoritative. Preserve exact native input/assertion requirements.

### D-165 qualification clarification — pixel ownership and cache retirement

A full-canvas color count also sees unrelated molecular and camera-axis edge
pixels. Qualify interaction drawing against frozen pre-analysis full-canvas masks
for each actual H-visibility state, requiring stable masks, identical camera/size
and restored-background equality. Count actual later cyan coordinates absent from
the matching mask; never subtract scalar totals or crop away potential residuals.
Keep native installation/geometry checks, channel thresholds, count bounds and
existing timeouts. Preserve failed evidence separately from complete qualification.

The native hover source lookup is disposable scene-owned state. Clearing feedback
must release its cached source array/map as well: an independent 100,000-atom
probe showed one retired scene held until disposal. Retire the lookup immediately;
rebuild only O(entries) membership on the next actual atom hover. Preserve warmed
per-atom work and deduplication, with no canonical molecular mutation.

## D-167 — Deliberate measurement ownership and complete bounded contact reads

Date:2026-11-16. Authorized refinement of child157 under the finite parent11program,
after verified156release; wording not individually reviewed. No implementation is
claimed by this planning record. Existing durable ordered measurement refs/commands
remain; keep the acquisition draft transient and application-owned above responsive
remounts. A temporary verified native atom-pick lease consumes events before ordinary
selection clearing/expansion while preserving canonical selection/order/anchor and
ordinary picking state. Capture installed source generation PLUS operation/artifact,
project epoch and draft owner. Return Promise Save with explicit ordered refs,
synchronous duplicate rejection and session-owned late completion/focus/feedback.
Share exact-kind, current finite complete geometry qualification across strip,
draft, saved values and actual native installation; invalid records remain recoverable
without drawing invalid geometry. Every preview retires affected values/markers.

Retain close-contact inspection through a current-input ephemeral child read, not a
persistent job. Capture immutable descriptors in a short owned session, verify size/
SHA in the child, bound result serialization before whole-payload allocation, recheck
current artifact before success, and retain admission through repeated-cancel-safe
termination/reaping/cleanup. Preserve successful list shape and optional expected
artifact compatibility. Stale/busy/capacity/geometry/timeout/unexpected errors remain
distinct. Client owner guards cover responses AND row actions, including A→B→A.

Global pair materialization grows quadratically before minimum/bond exclusions.
Count-only preflight agrees empirically on288small cases but does not establish a
universal floating-point allocation guard; old tree membership and np.linalg.norm
reported distance differ near boundaries in both directions. Use single-point
nonperiodic p∞ exact cube queries with eps0/oneworker, input-N-bounded lists and
j>i. Define reported distance from the same rounded differences as
max(hypot(dx,dy,dz),absdx,absdy,absdz). This makes d≤cutoff imply cube inclusion;
pinned component-gap/max pruning supports the conservative search under normal
IEEE arithmetic/library contract. Filter with the same inclusive reported predicate
and every recorded bond. This explicitly refines last-bit/near-threshold numerical
behavior while preserving Euclidean Å meaning. No alignment/PBC/energy interpretation.

Charge all raw neighbors before exclusions; bound actual input, cumulative returned
work, retained results, serialized bytes and terminable lifetime. Returned-neighbor
counts do not bound internal tree traversal. Any limit or numerical-extent failure
refuses the whole operation, never partial/empty success. Extreme finite±1e308spans
can exceed the tree's numerical range; report that honestly. Validate source missingness,
active finite N×3 geometry before even zero/one-site empty success. Sparse ascending
IDs are supported; unsorted arrays already fail the canonical model validator.

Select numerical budgets only after ordinary-protein/complex and sparse/dense
measurements; existing tiny /contacts tests do not justify tiny new capacity.
Qualify memory/work/request/cancellation limits under D148; strict-host latency
remains opt-in. Cap manager DOM at50summary rows/oneexpanded record; hidden source
observers are incremental4draft+4expanded, preserving independent156/legacy consumers.
Reuse immutable endpoint indexes and measure native label mapping before optimizing.

Scientific primary implementation references:
[query contract](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.cKDTree.query_ball_point.html),
[pinned cube traversal](https://raw.githubusercontent.com/scipy/scipy/v1.18.0/scipy/spatial/ckdtree/src/query_ball_point.cxx),
[component-distance implementation](https://raw.githubusercontent.com/scipy/scipy/v1.18.0/scipy/spatial/ckdtree/src/distance_base.h),
[extent tracker](https://raw.githubusercontent.com/scipy/scipy/v1.18.0/scipy/spatial/ckdtree/src/rectangle.h),
[stable norm](https://docs.python.org/3.12/library/math.html#math.hypot).
Independent theory controls support72configurations/699queries; these are planning
probes, not implementation approval or formal verification of every library build.

## D-168 — Measured contact admission and opaque verified responses

Date:2026-11-16. Implements D-167's contact-read contract within child157; this is
an implementation checkpoint decision, not complete feature or release approval.

Retain100,000input atoms,64MiB immutable normalized source,2,000,000raw returned
neighbors,250,000retained results and64MiB encoded response. Admit source/atom
metadata before the child loads coordinates; validate actual canonical atom count
and source size/SHA again in the child. All raw returned neighbors are charged
before exclusions. An individual list is bounded by admittedN; internal traversal
is bounded operationally by a terminable computation, not by that visit counter.
Serialize each validated typed row and array delimiter only after byte admission;
any refusal discards the whole operation. Preserve successful list DTO shape and
optional source binding for existing callers. Minimum0 remains a valid API/core
setting; no new contact family, chemistry assumption or scientific threshold.

Use15seconds for the computation lifetime and a polled1GiB child-RSS threshold;
retain admission through owned-thread settlement, termination/reaping and temporary
file removal, including repeated cancellation and shutdown. These are operational
policies, not all-host latency guarantees, an instantaneous hard allocation ceiling,
or a1GiB address-space limit. Measured virtual mappings approach1.94GiB. A2second
termination grace precedes kill/reap. Cleanup failure closes admission rather than
allowing additional work over retained resources. No persistent job/artifact/history
or molecular edit is created by this read.

The parent captures minimal metadata columns in a short owned session. The fixed
trusted child validates every finite, sorted, unique stable-reference row and
writes bounded JSON to an owned file. Strict operation/project/entry/artifact/policy
completion metadata, size and SHA qualify opaque response bytes after the child
finishes; the parent does not allocate a second whole Pydantic/JSON model. SHA alone
is not a claim of schema validation. A fresh metadata capture rejects changed or
deleted sources before success. Shared verified-file reads open one regular file,
fstat its descriptor and read at most declared size+1; settle any owned read thread
before removing its directory. Input aliases within the managed store retain their
existing compatibility; output aliases and outside paths are refused.

Evidence: [source-bound performance packet](assets/viewer-measurements/c1-contact-performance.json)
retains117primitive processes (111complete results/six intended whole refusals),
the original twelve API measurements with their disclosed SQL-LOB baseline confound,
and twelve fresh corrected ASGI requests: nine complete200responses/three expected
413refusals. Three repetitions per case, fresh processes with warm filesystem cache.
The58,870-site1AON3Å case returns128,466pairs/24,810,069bytes in2.858–2.962seconds;
a near64MiB100,000-site sparse source completes in1.708–1.983seconds. Maximum child
RSS591.84MiB and APIparent response-phase peak216.61MiB support the chosen defaults
on the measured host; client JSON decoding is measured separately. All source/DB/
artifact identities and cleanup witnesses pass. Admitted ceilings do not certify
every metadata/bond shape or cutoff. Dense1AON10Å explicitly refuses capacity.

Theory and performance specialists independently assessed this narrow policy and
its scientific interpretation; architecture assessed ownership and transport. This
does not substitute for remaining lifecycle tests, native tool implementation,
all-seven final same-candidate assessments or either complete release gate. D148
portable/strict-host distinction remains. Existing immutable endpoint inspection
indexes now serve saved and quick geometry; failed current queries, missing source
facts and every preview must suppress saved native geometry while retaining records.


## D-169 — Transient measurement ownership and bounded disclosures

Date:2026-11-16. Child157 C1b checkpoint; no durable schema/version change.

Own the numbered measurement draft above responsive viewer remounts. Native atom
acquisition is an explicit disposable lease: consume its primary picks before
ordinary selection effects, verify raw singleton identity against the current
source, and preserve canonical selection, inspection order and ordinary picking
mode. Kind changes empty the draft; removing a target leaves its numbered gap.
Explicit selection import confirms three/four-target order. Compact picking keeps
fields and exposes the canvas; Review returns to the retained draft. Native marker
labels are nonpickable and independently owned from saved measurements.

Promise Save captures project/revision/visit epoch, session/generation, exact
ordered references and artifacts. Synchronous admission prevents double dispatch.
A failed current Save retains fields; late acknowledgements can update only their
own monotonic project cache, without taking over another session's feedback.
Stopping acquisition does not retire an already admitted Save. Source change or
preview entry retires its UI owner even when acquisition has stopped; restoring
an old source or leaving a preview cannot revive it. Closing is not rollback.

Use four fixed disabled-capable source observer slots per draft and expanded
record. Variable-length query arrays retained trailing observers in the pinned
library; shrinking the number of calls did not establish bounded subscriptions.
Chooser correction substitutes the active draft slot, preserving independent
inspection consumers. At most50saved summary rows and one expansion are mounted.
Current source facts and every preview qualify geometry independently of hover.

Contact disclosure owns an AbortSignal, request and current-result actions.
Collapse, compact picking, project/source/preview retirement synchronously abort
before publishing the new disclosure state. Retained Find callbacks also reject
an already aborted disclosure before admitting work. A→B→A cannot revive a request
or row action. Explicit entry choice includes hidden/locked entries; selection
remains a separate deliberate result action. Existing contacts remain read-only.

Focused [checkpoint evidence](assets/viewer-measurements/c1b-measurement-checkpoint.json)
passes1,134frontend cases/116suites plus lint/types/build and five real native
workflows, with one unchanged legacy mobile exclusion and no retries/new exclusions.
Native child exits0; its enclosing tool reports143 after completion, cause
unestablished. Separate independent log/source completion verification exits0.
Scoped architecture/UX assessments pass after correcting concrete ownership,
observer and canvas-access findings. They do not constitute final seven-role
approval. The [native baseline](assets/viewer-measurements/c2-native-label-baseline.json)
records inherited100-label latency/resource costs requiring measured C2 correction.


## D-170 — Bounded native measurement batches with one full-text layer

Date:2026-11-16. Child157 C2 design refinement within accepted scope; authorized
through the standing program delivery instruction. Architecture and theory PASS
this proposed direction; implementation and performance approval remain pending.

The source-bound [baseline](assets/viewer-measurements/c2-native-label-baseline.json)
justifies correcting per-record native representation/text resources. Use a small
typed adapter over the pinned public distance/angle/dihedral APIs: at most three
kind-grouped geometry representations with their text visual disabled, and one
LabelRepresentation containing every qualified visible record. Keep full Root
formatted labels in each infos[].label, global customText empty, existing font
quality and explicit record-ID/group maps. Equal names/targets never deduplicate
records. No measurement cap, truncation, font quality reduction, schema, dependency
or global font-cache patch. Native geometry still consumes ordered current loci;
application data remains authoritative. A CPU font-cache fix alone would leave
one large GPU font texture per text renderable and is insufficient.

Each label uses its own DataLoci and copied finite point anchor from the SAME
current single-atom native sphere centers used by its geometry. Distance anchors
at midpoint(A,B), angle at vertexB, torsion at midpoint(B,C), with overflow-safe
midpoint calculation. These are display positions only. Radius-dependent label
scaling is disabled. Valid coincident distance and0/180degree angles stay labelled
when the native arc plane degenerates. Full signed values/units/order remain Root
formatted. Anchor placement is a deliberate presentation adaptation; do not claim
pixel-identical per-kind text depth, arc placement or occlusion.

Engine owns installed and staged batches, fenced by plugin identity, measurement
epoch, scene generation and source-operation identity. Build replacement native
representations off canvas, check current ownership after each await, then attach
the complete batch without awaits between attachments. Failure/retirement discards
all staged objects. Direct canvas representations are outside plugin measurement
state: explicitly hide/remove/destroy installed and staged resources on source
replacement, preview, source failure, empty scene and disposal. A late completion
must destroy its own obsolete batch. Draft target markers retain a separate owner.

Source sync currently calls applyMeasurements before completing its generation/
source operation; coordinate paths also update measurements. Integrate installation
at a successfully completed source boundary or stage explicitly for that owning
operation. An atom-pick readiness check at the old call site would incorrectly
reject legitimate installation. Preserve current-source/finite/source-fact/preview
qualification and existing no-op avoidance. Avoid incremental in-place updates
until measurements justify their additional stale-update complexity.

Acceptance: mixed kinds/ordered refs, signed±90degree torsions, zero distance,
0/180degree angles, rigid-frame anchor covariance, full/duplicate/long names,
rename/hide/delete/reorder, moved/deleted participants, preview cancellation and
held stale completion. Verify exactly one saved-label text representation and
constant bounded native representation count at10/100records; measure initial,
rename, identical no-op and retirement/restoration cycles including resource
baselines. Qualify actual appearance and retain draft markers, structure labels,
selection, camera and immutable originals. Thousand-record manager DOM/observer
qualification remains separate. Scientific implementation author cannot supply
independent final review; all seven final assessments remain required.

## D-171 — Measurement acknowledgements and first-load recovery

Date:2026-11-17. Child157 C2 correction to D-169; no durable/API schema change.

Generic command feedback already ignored acknowledgements older than the monotonic
project cache. Independent actual-App probes showed two later continuations could
still announce an obsolete rename or clear a saved draft. Return a typed
`current | superseded` completion from the measurement creation port. A superseded
Save retains fields and directs its current owner to check Saved measurements;
a retired owner remains inert. Saved rename/delete continuations independently
compare their returned revision with their own project cache before success text.
Dispatch/source/visit/preview guards and monotonic cache admission remain in force.

Classify recovery once on the first loaded state of each project during an App
mount, including an initially clean state. A late acknowledgement can then update
its own cache without being misclassified as startup recovery after A→B→A. A fresh
App still announces genuinely persisted dirty state. Independent architecture
assessment passes the corrected actual-App/session probes; this is scoped review,
not final feature approval.

Ordered persistence qualification compares all record content while recognizing
that Undo/Redo is a new command and legitimately advances modification timestamps.
IDs, creation dates, full names, visibility and ordered cross-entry references
restore exactly; modification time remains monotonic. Both archive suffixes retain
current-state data and their established history omission. The new wrapper selects
actual implementation modules before Python starts and verifies their provenance.
Development0.34↔actual tagged0.34preflight does not substitute for final0.35readers.

A physical loopback TCP disconnect test now closes a real held request, observes
child reaping and staging removal, then verifies renewed admission through another
actual HTTP request. It preserves project/artifact state. This supplements the
previous callback-level cancellation controls without relabelling that evidence.

## D-172 — Synchronous preview retirement and recoverable saved explanations

Date:2026-11-17. Child157 C3 review corrections; no scientific method, durable
schema, migration or dependency change.

Numerical preview entry now updates its application-owned ref and guards the
measurement session before publishing React state. Entering and cancelling within
one batched turn therefore still retires the previous Save/contact owner. Rendered
preview state remains the viewer projection; synchronous command qualification
reads the ref. A completed Save also preserves the current stopped acquisition
intent, including when editing opened during its request. Successful current Save
can clear fields and report success without unexpectedly acquiring the pointer.

The single expanded saved record receives the existing typed SelectionGeometry
result from its bounded current-source observers. Its value and explanation share
that result. Preview and missing/loading/failed source states take precedence over
undefined geometry; ordered references and draft rename text remain retained.
Compact summary values retain their existing interface. No new scientific math,
durable fields, source observers or background jobs are introduced.

A failed refetch can retain a complete cached projection whose normal stale time
is infinite. The measurement tool locally makes errored source queries stale so
closing/reopening actually retries, including cached-data failures. Successful
immutable projections keep their existing lifetime, and global source policy is
unchanged. This supports the stated recovery instruction without displaying failed
cached coordinates as current. Missing participants remain recoverable definitions;
restoring valid current coordinates restores the original measurement value/label.

Both stopped C3 gate attempts retain partial logs and their explicit intentional
SIGTERM receipts. Neither is a completed gate or a source of pooled passing checks.
All42commands must run fresh after corrections; all seven final specialist verdicts
and exact merged qualification remain required before delivery.

## D-173 — Refuse conflicting contact coordinate bases

Date:2026-11-17. Child157 complete scientific-theory review identified an accepted
normalized payload whose canonical atom coordinates differ from its active
conformer. The viewer and shared measurement geometry use the atom coordinates;
close-contact search uses the active conformer. Existing adapters normally keep
these aligned, but the normalized schema does not enforce equality.

Before searching, qualify both current bases as finite N×3 coordinates and require
exact numeric agreement, allowing ordinary signed-zero equality. Refuse the entire
read with an explicit geometry reason if they disagree, including singleton input;
never silently choose a conformer, rewrite source coordinates, align, add a tolerance
or return contacts from an ambiguous basis. A consistent nondefault active conformer
remains supported even when an inactive conformer differs. Empty complete structures
retain their existing empty result. This is request qualification, not a new method,
durable schema restriction, migration or mutation of original artifacts.

Acceptance includes each-axis disagreement, finite-active/nonfinite-atom input,
singleton refusal before the empty shortcut, consistent active-ID7 behavior, and
API422 with explicit reason and unchanged project/artifact state. Run affected
scientific/API validation, independent theory/implementation/performance reassessment,
and fresh complete release gates before claiming completion.

## D-174 — Separate verified qualification and failure-forensic assets

Date:2026-11-17. Child157 release-evidence refinement; no application, scientific,
durable-project, migration, dependency or version change. Independent architecture
assessment passes this design; actual part verification/publication remains required.

The primary qualification ZIP and its checksum/package sidecars retain both complete
fresh gates, all reader workspaces, lossless logs and source proofs. Failed runs
remain failed. Large raw failure recordings/stores are preserved separately in
bounded forensic ZIP parts, rather than duplicating them inside the primary ZIP or
adding more large payloads to Git. Existing committed C4 parts retain identical
bytes/hashes under `docs/assets/viewer-measurements/forensics/`; subsequent large
parts stay in owned ignored staging until their release upload. Raw originals stay
retained in owned evidence after verified relocation.

A tracked format-versioned index binds release version, failed candidate/run/source
identities, recipe/log references, failure status, canonical inventory digests and
each part's unique asset name, ordinal, finalized byte size, SHA-256 and recursive
verification counts. Per-run inventories identify every relative path, size and
hash. Their exact union must equal the part manifests, with no missing, duplicated
or additional files, before relocation or publication. All ephemeral traces,
scientific observations and owned stores are included. Finalized parts must remain
below80MiB; an oversized single member requires explicit lossless handling rather
than omission or truncation.

The primary bundle includes the immutable index/inventories and points to the
additional release assets. Inspect its assembled member list to prevent accidental
rebundling. Later upload IDs, URLs, server digests and anonymous-download receipts
are separate publication facts, not changes to the immutable index. Private local
upload paths remain in owned staging metadata. A same-name remote asset is reusable
only after its identity matches the index; do not overwrite a different payload.
Keep fresh staging/atomic finalization and preserve incomplete attempts on recovery.

After exact merged qualification, publish the indexed parts with the same release.
Verify every part locally and through a full anonymous download, including SHA-256,
recursive ZIP CRC/manifests and cross-part inventory completeness, before child
closeout. Record the batch verifier's provenance and actual exits. The existing
primary downloader alone does not establish forensic-part availability. The parent
Goal remains active until all required units and final integrated closeout pass.

This layout respects independently documented hosting bounds: each release asset
must be smaller than2GiB, with up to1000assets per release; a Git push has its own
2GiB bound. See [release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
and [push limits](https://docs.github.com/en/get-started/using-git/troubleshooting-the-2-gb-push-limit),
checked2026-11-17. No history rewrite, force push or repository setting change.


D-174 implementation evidence: the tracked typed verifier lives in
`tools/verify_measurement_forensics.py`, automatically inside the existing
qualifying source prefix. No gate helper/command is removed or weakened; the
next inventory gains this one source. Local25part verification, Ruff/mypy and
explicit corruption controls pass. Independent architecture verifies the actual
parts/index/tool/provenance and main-package selection. Public availability is
still a later obligation, not established by these local checks.


D-174 final candidate evidence: candidate7 completes42fresh commands with931current/
885actual0.34source identities intact. Independent summary and recursive packaging
verify both qualified parts and all reader workspaces; failures remain distinct.
The additional candidate6failure inventory brings the forensic index to26parts,
47506files/4624058988raw bytes. Explicit scope metadata distinguishes the failed
complete-gate attempt from its later passing focused correction. Index3d9348 binds
all current identities; old25payloads/two prior run rows remain unchanged. Actual
anonymous verification of all26parts remains required after stable publication.


D-174 publication readback: both complete42-command gates qualify actual0.35code;
primary ZIP/sidecars and all26forensic parts pass full anonymous verification with
all exact unions. C6publication evidence and its separately verified self identity
preserve observed stage facts without rewriting historical pending receipts or the
runtime tag. Normal terminal documentation may integrate evidence after release;
post-integration branch-cleanup readback belongs in the delivery asset/canonical
issue reply rather than another runtime release or recursive receipt commit.


## D-175 — Integrate durable ligand ownership with released measurement guards

Date: 2026-11-17. Child #158 integration against actual terminal master `b038e4e6`
and preceding released runtime `7542d1a1` / v0.35.0, after verified #157 closeout.
This preserves the authorized scope, scientific methods and existing source facts.

Keep D-165/D-166 alongside D-167–D-174; neither branch supersedes the other's
accepted decisions. Retain the synchronous numerical-preview ref, measurement
session, native batch/contact lifecycle, generic captured command context and
monotonic per-project cache. Ligand choice and quiet legacy recognition need their
own monotonically retired visit/preview/source authority. Render-only pause state
and an effect-updated selection epoch cannot establish retirement across same-turn
preview entry/Cancel or workspace A→B→A. Consulted architecture before integrating.

Capture exact current project/revision, visit, entry/current/original source and
candidate/input identity. Qualify before asynchronous mutation preflight effects and
again at dispatch; extend guards through legacy conflict reread and its sole retry.
Separate dispatch admission from completion feedback so a request's own busy/revision
change does not reject valid success. Late acknowledgements may update only their
own monotonic cache; retired/superseded UI continuations cannot close another chooser,
move focus or announce success/error. Opening the chooser stops measurement picking
while retaining its draft and ordinary canonical selection.

Use actual 0.35 sources for compatibility, retain all 42 predecessor responsibilities
including seven ordered-measurement phases, then add meaningful schema3/designation
checks. Safe refusal is distinct from old-writer retention. Preserve every existing
scientific/history/archive oracle, failed attempt, deadline and exclusion. All five
versions advance to 0.36.0, with explicit 0016/project/archive3 serialization and
default-only rollback notices; dependencies remain pinned. Current integration is
not a qualified candidate or readiness claim. Focused and complete fresh gates and
all-seven final same-candidate assessments must follow.


D-175 integrated native recovery correction: first Escape closes ligand choices
and restores its launcher. On narrow layouts a second Escape belongs to the
focused Inspector drawer and must preserve the stopped measurement draft. The
initial combined native run exposed both handlers acting on that event, which
closed Measurements and cleared its targets/name. The pinned dismissal listener
runs during document capture, so drawer bubble propagation alone is insufficient.
Measurements must prevent its own default dismissal, then defer Stop/Close when
the Escape target belongs to another dialog. The focused drawer consumes its own
close. Keep existing tool/canvas and nested measurement chooser recovery intact.
Independent UX assessment establishes this acceptance; implementation and fresh
native qualification follow. The failed traces remain distinct from the root's
corrected desktop whitespace oracle and unattributed preparation navigation event.


D-175 correction verification: ownership/StrictMode scoped checks pass120cases;
Escape correction passes158cases/nine suites, full frontend lint/types and independent
UX reassessment. A fresh18-case native run passes both profiles/themes, real zoom,
320px/image recovery, exact ligand choice and ordered measurement acquisition. Both
Escapes preserve the stopped named ordered draft and canonical selection; originals
and persisted designation remain unchanged by cancellation. All994source hashes stay
fixed; build, child and observed enclosing exit0. C3's checked packet retains failed
and passing evidence separately. Final full gates and all-seven review still follow.


## D-176 — Qualified entry-wide occurrence counts outside durable intent

Date: 2026-11-17. Full review of #158 found that an instance ordinal and pagination
do not meet the accepted occurrence-count requirement. Independent UX, theory and
architecture confirmed the gap. Intentionally stop candidate1 before further gates;
its eight passes, partial Python log, explicit SIGTERM cause and observed enclosing
143 remain failed/partial evidence. All994current/931actual0.35sources were unchanged.
No passing segment substitutes for the next complete fresh candidate gate.

Expose nullable `occurrence_count`, explicit `occurrence_basis` and structured
`occurrence_reason` on derived candidate metadata. These never enter designation
intent, commands, project/history/archive state or renderer ownership. Individual
instances remain independently selectable; counts do not change automatic eligibility.
Count within the complete current entry, never across entries, visible pages,
conformers or symmetry/assembly expansion. Unknown is not zero or an assumed one.

The `qualified_representation_v1` basis uses strictly qualified graph representations.
On a disposable copy, clear original atom maps and conformers, then use canonical
isomeric CXSMILES with explicit H/bond notation and radical extension. Qualified
total attached H is preserved: equivalent bracket/implicit notation does not create
different identities. Keep explicit H graph nodes, isotope, charge, radicals and
supported stereo; add/remove no H and perform no neutralization, tautomerization or
desalting. Enhanced/nonordinary stereo, structural groups, query/dummy and unsupported
bond semantics remain unavailable. Names, atom/source IDs, coordinates, formula,
mass, depiction bytes and the existing identity-bearing chemical input hash are not
equivalence keys. A proposed H-bookkeeping map encoding was rejected before adoption.

The `verified_source_entity_v1` basis counts complete current occurrences assigned
to the same verified immutable source entity. It is source identity, not current
chemical equality, including after chemical edits. Require existing source mapping
qualification; preserve its limitations, including unsupported multiple nonpolymer
residues within one asymmetry. The counting helper adds no further asymmetry-only
uniqueness rule. Never infer entity identity from mutable residue labels. Unknown
potential instances invalidate complete chemical totals; independently proved source
counts may remain known. No partial chemical totals or unlabelled lower bounds.

Share one verified source assessment and one prepared chemistry context through
inventory resolution, count construction and visible metadata, including water/ion
classification. The existing resolver accepts optional prepared inputs; default
callers retain their prior behavior. A separate count-policy key leaves membership,
chemical-input and depiction policies unchanged.

Retain only finalized immutable summaries in a bounded process-local LRU. Verify
normalized/original inputs before lookup. The key includes resolved managed store,
complete inventory identity, source format/record index, resolver/chemistry/count
policies, toolkit and resource settings. Record index is required because recovery
consumes it separately from the inventory digest. Matching coordinate-only inputs
may reuse counts. Retain no native molecules, preparation contexts or builder
closures. No database migration, artifact deletion or persistent job is introduced.

Cold counting shares the existing two depiction work slots, without a work queue;
same-key misses are single-flight. Cache hits need no work slot. Cleanup releases
admission and in-flight ownership on every exit. Retention is bounded by exact
encoded key/value bytes, not a claim of Python heap or RSS limits. Oversized summaries
may serve their current valid response without retention. Deterministic input-limit
results may be retained; transient busy/time refusals are not permanently cached.
Current provisional admission is1,024potential instances/8,192candidate sites/1,024
sites per candidate, a cooperatively polled2second counting budget, and64summaries/
256KiBper summary/8MiBencoded retention. Final prototype/API measurements must qualify
these defaults before adoption; polling is not a hard per-library-call deadline.

Cards show the server-declared entry scope and basis, or concise unavailability with
a secondary reason. Preview and failed input checks retire counts. Count/depiction
failure does not disable an independently exact selectable instance. One page-level
Retry counts action uses the existing metadata refetch, with synchronous duplicate
admission and captured context/page/source/preview feedback/focus. Transient results
retry on reopen; stable immutable metadata retains its lifetime. No polling loop or
implied background queue. Preserve current focus/choice/depiction and retire old
A→B→A continuations. Actual native recovery, performance adoption and final complete
gates/all-seven assessment still follow the focused corrections.


D-176 measured adoption: retain the proposed 1,024-instance / 8,192-site /
1,024-site-per-candidate admission, cooperative two-second budget and 64-entry /
256-KiB-per-entry / 8-MiB encoded cache bounds. The frozen eight production files
pass 24 fresh core samples, 18 actual ASGI samples, six additional verified-source
samples and retention/admission probes. On this portable host, 1,000 repeated
three-site instances take 0.599–0.608 seconds in the count index and 0.747–0.753
seconds in cold API reads; 1,000 varied six-site instances take 1.345–1.379 and
1.557–1.572 seconds respectively. Verified source totals of 1,000 require no
chemical signatures. Warm pages rebuild neither index nor signatures, but still
perform existing source preparation and visible metadata qualification.

Candidate/site excess refuses before chemical qualification; the 58,870-site
complex explicitly reports its atom limit. Cache hits work while both slots are
occupied; misses start no builder. The retention probe ends at 62 summaries /
8,346,192 encoded bytes, approximately 17.1 MB of recursively counted Python
objects and zero retained native molecules. An initial process high-water reading
of approximately 956 MiB did not reproduce in a separately sampled fresh child
(approximately 139 MiB); both observations remain retained and the cause is
unestablished. No Python-heap/RSS ceiling, every-host latency, TCP/browser timing
or hard per-library-call deadline is inferred. This is scoped policy evidence;
complete release gates and all-seven final review remain required.


D-175 additional complete-review findings (2026-11-17): candidate2 was intentionally
stopped during Python, before any source edit, after eight passing steps. Independent
UI review and primary inspection found the narrow dialog header/Close clipped away
in a previously passing screenshot. A stronger actual-app native oracle reproduces
the failure on both profiles: outer scrollTop133, header top−124 versus panel top8.
The prior oracle checked only panel/footer bounds. Make the modal frame non-scrollable
with `overflow: clip` and contain absolute accessibility content within the relatively
positioned scrolling body. Both focused native cases then pass, including header/Close
containment and zero outer scroll. This establishes the actual outer scrolling symptom
and correction; the isolated accessibility-content probe is supporting structural
evidence, not a claim that every application focus event was individually traced.

Architecture independently reproduced another P2 using a schema-valid changed Clear
acknowledgement with actual dirty flags and timestamps: the correct monotonic project
cache update remounts a newly opened chooser through its designation-dependent React
key, replacing deliberate footer focus with the heading. The earlier revision-only
held acknowledgements did not exercise this path. Preserve the chooser mount for its
explicit source/open visit while keeping designation-sensitive async ownership. Retain
the shared designation-aware metadata query and failure channel; same-source/same-page
previous data may bridge a designation refetch only when its previous query succeeded.
Known failed inputs must not be resurrected from retained data. Use stays disabled
until the actual new-key check succeeds. Keep page/draft/focus where inputs remain
qualified, retire old Retry/RAF feedback on designation changes, and accept legitimate
ACKs into their project cache. Changed Use/Clear and held-refetch/error-recovery
regressions plus fresh integrated/native qualification follow before candidate3.

All partial candidate2 logs, intentional signal/owned-process evidence and actual
enclosing26838exit143 remain preserved. No partial pass is pooled into a future gate.


D-175 correction readback: the pinned query observer retains its last query with
defined data. A successful A followed by a no-data failed B can otherwise supply A
as a placeholder for pending C. The source owner now retains a local qualification
fence across designation keys and chooser close/reopen. Matching errors withhold
cached/placeholder metadata; matching actual nonmanual successful reads restore it.
Keep shared query consumers and permit a real read retained by the summary to recover
across dialog visits. The failed assertion that demanded continued refusal after such
a genuine post-failure read was corrected as a test oracle, with raw attempts retained.
No global registry, scientific policy, migration or App/MeasurementTool change is added.

Final focused checks pass187cases/nine suites, full lint/types and enclosing31288exit0.
Full frontend1304/122suites and build pass. Two new native-test oracle errors were
diagnosed directly: the modal intentionally aria-hides the background root despite
the legitimate Change button being present, and SQLite readback omits the UTC suffix
on newly UTC-written modified_at fields. Observe the existing background DOM without
interacting with inert controls; normalize only the optional trailingZ on those UTC
fields, retaining all six fractional digits and every other project value. Preserve
all active-modal focus/DOM/radio, cancellation, revision and original-byte assertions.
After four targeted actual-server ACK cases pass, a fresh26-case native run passes
all profiles/themes/zoom/narrow/Axe/recovery/measurement checks with zero failures,
flakes, retries or skips; all1,003sources stay unchanged, actual enclosing59094exit0.
The unrelated frontend/build proof is reused only after verifying the sole changed
source is the new native oracle. All failed/full partial attempts remain separate.
Complete fresh gates and final same-candidate all-seven assessment remain mandatory.


## D-177 — Isolate pytest fixture stores from qualification databases

Date:2026-11-17. Freshcandidate3 at ac4786d1 completes2,844Python cases but fails132
historical migration cases; all failures belong to one migration module. Actual
source maps remain1,003current/931preceding unchanged and the enclosing exit is1.
The Python step injected the qualification database through canonical NEISTRA
settings. Those correctly override the migration fixture's legacy temporary-store
aliases, so Alembic targeted the qualification store while the fixture opened its
untouched temporary store. The captured precedence warnings and missing database
errors establish this path. Production precedence and migration behavior are correct.

The pytest phase must inherit only the runner's sanitized module/tool settings,
without a per-step shared database binding. Existing per-step removal of all five
canonical/legacy/database aliases remains; dedicated Alembic, versions, CLI and
actual-reader phases keep their explicit isolated stores. Preserve all42commands,
reader directions, migration logic, historical assertions, exclusions and deadlines.

A real unchanged migration case fails with the injected settings and passes with
them sanitized; all133historical migration cases then pass unchanged. A recipe
regression fails before correction and passes afterward, including a real child
under hostile inherited aliases. All17recipe cases, scopedRuff and syntax checks
pass. Only the generator and its existing environment-guard test change. Earlier
application/native evidence remains valid for byte-identical application sources;
no partial Python totals are pooled into qualification. A freshcandidate4 must run
the complete gate. Retain all failed candidate3 logs, actual stores and provenance.

The evidence ZIP retains every real pytest-workspace payload. Internal `*current`
convenience links are recorded with validated within-owner targets rather than
archived or followed as filesystem links. Original workspaces/links stay intact;
generic release packaging continues to reject arbitrary symlinks.


## D-186 — Share sourced profiles through one synchronous evaluation engine

Date:2026-11-17. Before #160 implementation, theory confirms the already accepted
seven source-qualified adaptations and two investigated unavailable variants.
Reference research supports explicit named criteria, operators and mismatch details;
a compact selector/status and expandable criteria/details in the existing property
region is the chosen original workflow. Full sidebar, radar rendering and entry
filter UI remain #161/#162. No arbitrary expression editor or additional science job.

Independent architecture consultation selects one production TypeScript generic
evaluator and a versioned Python registry/API. Python validates data references,
composite DAGs and descriptor mappings, and may provide independent offline boundary
fixtures; there is no present server consumer requiring a duplicate runtime numeric
evaluator. Thresholds live once in the shared registry, never in component literals.
Composites reference shared constraints/profiles. Required descriptor dependencies
augment #159 consumer demand without mutating saved category preferences. Selection
is transient; no new project schema, cache, job platform or migration is introduced.

Only a #159 current-binding-qualified owner view may supply current evaluations:
exact source/binding/scientific-input/method/library/policy and owner epoch must match.
A generic DescriptorReport or expected_hash copied from that report establishes no
publication authority. Retired/preview/mismatched inputs withhold incompatible values
synchronously. Preserve current partial violations separately from missing/pending/
error and require every required qualified input for a positive overall result.
Teague's operational charge-presence fact must be strictlyfalse; source-domain
unavailability precedes numerical compliance, even with net chargezero.

Use unrounded exact operators and limits, no epsilon. Scientific numeric validation
is distinct from plotting domains: valid out-of-radar-range values remain values,
with genuine threshold outcomes. Ordered polarity/size/lipophilicity/flexibility axes,
normalization, clipping and missing-axis policy are shared display metadata rather
than evaluation changes or a polygon score. Exact/adjacent float boundaries,
integer±1, malformed/nonfinite/boolean values, stale/version mismatches, partial
coverage, composites, domain refusal and dependency ownership require tests.

Isolated domain preparation pins exact frozen unreleased #159 kernel and frontend
type sources with private hashes. These copies are not a delivered prerequisite.
Integrate actual verified #159 delivery master and reconcile every copied source
before final #160 qualification, review or publication. Publication remains serial.


## D-190 — Preserve the focused inspector task across derived-content layout changes

Actual160native3 retains the same focused, hittable query input but moves it upward
108.4375CSSpx when expanded profile criteria and property methods replace pending
reasons with current report content. Its inner scrollTop remains1675. Independent
UI and UX trace assessments confirm a reading-position regression, independently
reproduced after settled animation frames; do not relax the existing≤1px oracle.

Keep all scientific warnings, natural-height disclosures, control identity and the
single existing inspector scroll owner. A small presentation boundary INSIDE the
functional Properties renderer receives each session-driven content publication.
React's documented getSnapshotBeforeUpdate captures the actual focused legacy
control and its owner-relative offset immediately before DOM publication; the
matching componentDidUpdate compensates only that same inner owner for a residual
offset change. A wrapper only above the subscribing component cannot observe its
local rerenders; ordinary layout-effect cleanup is not a reliable pre-mutation
snapshot. See https://react.dev/reference/react/Component#getSnapshotBeforeUpdate.

Independent architecture consultation accepts this bounded precommit approach.
Guard current connected control/focus, unchanged section/nearest scroll owner,
semantic project/entry/task visit and explicit task-navigation token. The token is
presentation metadata, never scientific state or a React remount key. Deliberate
scrolling and navigation remain authoritative; capture the latest actual position
at publication and do not override a changed owner/task in the commit. No focus(),
scrollIntoView, window scrolling, observer, animation-frame loop, restored controls,
new scrollbox, height cap, suppressed warning or descriptor scheduling change.
Qualify positive/negative guard cases, actual source retirement and warning updates,
explicit scrolling, both themes, narrow layouts and verified100%/200% browser zoom.

The separate native4 preview failure is a test-oracle mistake: closing the editor
legitimately cancels placement. Trace shows properties resume before the test's
same-entry select. Keep the actual editor/proposal open while inspecting; mobile
Inspector opening preserves the editor/workspace. Corrected actual native5 passes
all16main cases in both themes and desktop/mobile, actual97537exit0 with1,071source
hashes fixed, including preview Cancel/Apply/exactUndoRedo and metadata recovery.
This does not pool into the still-failed access qualification or authorize readiness.


## D-195 — A source failure retires earlier inventory checks across presenters

Independent installed-query/component controls reveal a consequential source-failure
race in158candidate246efa and the identical159/160controls, plus161's new shared
owner: an older successful page-zero response held in transport can arrive after a
newer page integrity failure and restore cached cards/composition/image without a
new source check. Preserve the independent failed controls and interrupted158C10;
passing earlier checks or a later presenter change do not qualify this behavior.

A known failure must synchronously withhold the exact-source inventory across its
header, chooser, pages and responsive visits. Only a genuine matching check begun
after that failure may restore qualification. Late arrival time and manual cache
writes do not establish requalification. Retain failure knowledge through presenter
unmounts; do not reconstruct recovery from success timestamps changed manually.
A bounded start/failure-generation barrier or verified cancellation of all earlier
in-flight exact-source checks may implement this contract. Choose through actual
installed-query probes before code, then retain permanent negative/recovery tests.
Keep unrelated project/entry/artifact work independent, one shared qualification
object and existing two-active/24-queued drawing admission. No scientific value
cache, chemistry method, predictor, schema, source-file mutation or new dependency.

The161header additionally requires its resolved designation's non-null source
artifact to equal the authoritative current entry artifact. Agreement between two
stale designation copies is insufficient. Preserve exact instance/membership and
distinct inventory/chemistry/descriptor hashes; candidate key is not a durable
instance ID. Missing/unqualified facts remain withheld with recovery.

Correct earliest158first and propagate the qualified policy through159/160/161.
Verify held earlier-page responses, source failure, close/reopen and responsive
unmount, manual writes, genuine fresh Retry, another failure during Retry, shared
pages, source/project changes and unaffected independent consumers. Keep all old
scientific assertions, workloads, timing bounds and warnings. Run appropriate fresh
candidate/full gates and same-candidate seven-role reviews; this correction is not
permission to pool partial runs or claim a release before exact-master qualification.


## D-196 — Terminalize refused private startup ownership without unconfirmed signals

The new161native1 first identity/profile case passes, but its next project remains
pending through120seconds despite fast successful reads and renewed leases. The
retained source is unchanged. Independent offline controls of159's actual worker,
child and copied database prove a sufficient new159failure mechanism: registration
refusal can reap a child while leaving its job RUNNING, and that orphan blocks later
derived admission. Early cancellation can precede the ownership ACK. The exact
native1branch remains an inference; post-shutdown reaped/PID fields do not prove
when reaping occurred. This path is absent in158; its fresh qualification continues.

Keep candidate process-group identity separate from signal authority. Grant group
signals only after positive record_process ownership registration. A refused or
unconfirmed child is cleaned up through its positively owned process handle and
joins, never through unconfirmed killpg. Recheck the captured current attempt and
liveness before spawn and before coordinator_ready; do not grant calculation
permission to work already known to be retired. Preserve cancellation grace and
wall-time bounds and serialize ownership ACK before later control messages.

Before treating startup refusal as terminal/reaped, refresh under the existing
serialized database writer boundary and match captured job ID, worker ID, private
execution ID and parameters. Only that still-owned RUNNING attempt may transition:
use existing cancelled for real cancellation/owner retirement, or explicit startup
failed when still wanted. Do not clobber terminal/deleted/reassigned attempts; bind
reaping to the captured execution identity. Reuse captured-generation failure
fencing; one startup error must not fail unrelated current demands.

This is a necessary159lifecycle correction propagated to160/161, not a new chemistry
method, schema, scientific cache, scheduling policy, fairness or resource-budget
change. Do not raise deadlines, suppress failures, publish late outputs or restore
historical numbers. Regression evidence must cover early stop/ACK ordering, absent
unconfirmed group signals, truthful active startup failure, existing terminal and
reassigned states, durable terminalization plus next admission, and real process
cleanup/recovery. Preserve the original failed native store and all observations.

The preceding corrected159selected browser probe4 passes one desktop case with
five cold starts and20paired real edits, actual7395exit0, all1110/49method identities
fixed and cleanup verified. This does not qualify all8cases or the forthcoming
worker correction. Portable cold-edit median2057.95ms/p952242.60ms exceeds the
unchanged2000ms target under disclosed concurrent work; do not claim that target or
controlled-host performance has passed. Measure current corrected source before
performance acceptance; preserve the existing targets and D148 policy.


## D-197 — Bound inventory failure facts with conservative requalification

Independent installed-query controls of D-195 show that 1,000 failed sources,
with or without genuine recovery before query removal, leave 1,000 retained
owner records after all queries are gone. Unrecovered records also retain full
error objects. The module-lifetime QueryClient outlives presenters, so query
collection alone cannot bound this separate map. Candidate11 is explicitly
interrupted for this confirmed resource defect; its partial checks are not a
complete qualification and remain retained independently.

Keep at most128 source qualification records and64KiB of source-key UTF-8 bytes.
These are local metadata-retention limits, not limits on entries, molecule size,
candidate eligibility or chemistry work. On eviction, retain one sticky owner-
lifetime fact that an unknown source requires a genuine check. An absent source
must then remain blocked until a matching successful request qualifies it; manual
cache writes and old responses cannot admit or qualify records. Retained unrelated
records keep their qualification, and eviction never cancels unrelated work.

Allocate a fresh opaque token for each admitted source record and each subsequent
failure. At actual query-fetch start, retain only that token in a weak query map.
Only matching nonmanual success with the still-current token may recover a record.
Eviction/recreation and deactivate/reactivate must never reset token authority.
Keep cancellation scoped to the exact project/entry/current/original source, after
installing the new failure token. Preserve weak historical-error acknowledgements
so successful recovery is not undone by reactivation or manual cache publications.

Retain only fixed recovery classifications: source conflict, artifact unavailable
or integrity failure, and retry required. Full response errors, warnings, reports,
stack traces and cause graphs remain with existing query/API owners. Preserve the
presenter's specific current/original-file recovery wording. Use one QueryClient-
owned instance across application/presenter remounts; a new owner for an existing
client would lose conservative forgetting. An oversized source key is declined
conservatively rather than stored beyond the byte budget.

This introduces no scientific cache, method, request retry loop, resource/deadline
relaxation or schema change. The bounded tradeoff is an occasional genuine check
after qualification metadata is evicted. Verify thousands of failed/recovered/
removed sources against both bounds, absent original error references, manual
writes after eviction, old success across recreation, failure during Retry,
reactivation, source isolation and unchanged chooser/StrictMode recovery. Obtain
independent architecture/performance reassessment before the next full candidate
qualification, then all seven same-candidate assessments and the complete gates.


## D-198 — Retire numerical source authority on verified source failure

Independent production-hook/session/component controls demonstrate that candidate
source-integrity, missing-artifact and source-conflict failures withhold formula
and drawing but leave cached properties labelled current. In161the same condition
leaves a complete passing profile and radar. This is an earliest159frontend
source-publication defect, not a demonstrated chemistry or numerical-value error.
Transport failure, unrelated source and qualification-metadata eviction controls
preserve independently qualified numbers; those conditions must remain distinct.

The canonical inventory owner emits a typed exact-source verification-failure fact
only for structure_artifact_conflict, artifact_integrity_error and artifact_not_found.
Carry project/entry/current/original artifact identity, a fresh opaque failure token
and fixed classification. Install the candidate barrier first, emit before query
cancellation/React notifications, and retain no original errors or unbounded history.
Do not use generic inventory blocked status/revision as numerical authority.

One App-lifetime subscription forwards that fact into the existing property session,
independent of presenter visibility. Invalidate every matching source-bound client
binding and coverage alias, clear matching request projections, stop only matching
active work via existing generation/abort/release, and retire the matching current
PropertyInputOwner capture before notification. Tag existing bounded records with
typed source identity rather than parsing opaque cache keys. Captured profile
isCurrent checks must become false immediately. Preserve explicit Cancel and
unrelated work, intent, original bytes and Undo ownership.

Candidate success never restores numerical authority. Recover only through a fresh
matching source-verified property READ begun after the latest failure, under the
existing report/source/binding/method guards. Older held reads/demands cannot cross
the failure generation. Keep the backend semantic report/proof cache, so verified
warm reuse does not require new calculation. Reuse connection/retry behavior with
no automatic retry loop; other supported exact-source producers enter this typed
boundary through their existing owners rather than a global HTTP interceptor.

This is a frontend authority correction with no migration, scientific method,
backend cache policy, scheduler/resource/deadline change or broader delivery scope.
Verify all three failures across coverage aliases/profile/radar/table, candidate-
only recovery rejection, old held responses, another failure during fresh READ,
fresh warm recovery, captured-profile retirement, transport/unrelated/eviction
independence, hidden/mobile/remount/A→B→A/Cancel/Undo/source-replacement ownership
and repeated bounded failures. Long performance execution remains held until the
corrected source is independently reassessed and freshly qualified.


### D-198 refinement — distinguish molecular source failures from drawing artifacts

Independent architecture review reproduces a remaining current-authority failure:
a committed exact-source depiction query reporting409structure_artifact_conflict
leaves cached numerical authority live. The existing depiction service verifies
current and original molecular inputs and a separate derived SVG; its generic
artifact error codes alone cannot distinguish those reads. Source integrity and
missing-input failures must therefore carry narrowly assigned typed provenance.

Preserve existing HTTP status and error code. A local ligand-source exception
records current/original input role and the original failure classification only
around known molecular input reads in _load_inputs/_cached. The API adds optional
source_verification=current|original; derived SVG reads remain untagged. The
frontend validates this optional enum, with a null default for existing callers.
The canonical owner decodes the committed, supported-policy depiction query's
exact project/entry/current/original identity. Source conflicts and provenance-
qualified artifact failures enter the existing barrier and numerical-retirement
boundary before cancellation/publication. Transport, malformed/legacy/preview
keys and untagged drawing errors do not acquire molecular failure authority.
Candidate behavior remains compatible. Neither depiction nor candidate success
restores numerical authority; only a fresh validated property READ may recover.

This completes the already accepted D-198 producer boundary without changing
chemistry, cache policy, schemas, scheduling, budgets or delivery dependencies.
Architecture and scientific implementation assessed the seam before code. Verify
real cached/cold current/original integrity/missing failures, distinct derived SVG
failures, public error compatibility, precise query identity, old in-flight work
and fresh warm recovery. Keep the first failed channel proof and original frozen
candidate intact; renew affected independent assessments before propagation.


### D-198 producer closure — shared current facts before numerical consumers

Independent actual application controls reproduce a source-qualification defect:
Use can report a molecular integrity or missing-artifact failure while cached
composition/drawing remain visible and Use stays enabled. The corresponding159
path also retains numerical authority. This violates D-166/D-195 even though the
failed operation leaves durable intent unchanged. The old1007-source candidate,
all raw controls and its active C12 qualification remain untouched. An isolated
fix/issue-158-source-producer-qualification tree owns this correction under the
same approved158plan; it is not a separate release or permission to push early.

Audit the closed four-producer ligand-service boundary: candidates and depiction
use their query owners; designate and legacy resolve report failure inside their
actual captured API operation, before generic command/toast/helper feedback gates.
Expose a bounded explicit canonical-owner source-failure entry point, reusing the
existing barrier, cancellation and notification path. Preserve128records/64KiB,
weak request-start guards and current-only successful candidate requalification.
Depiction success never qualifies candidate facts.159's numerical bridge consumes
these facts separately; it still requires a fresh property READ for recovery.

Known current/original molecular reads carry optional typed source_verification
and source_identity={project_id,entry_id,current_artifact_id,original_artifact_id},
captured as primitives before the actual read. Preserve existing HTTP status/code/
message. Include normalized-source StructureArtifactConflict failures as well as
integrity/missing-artifact failures. Derived SVG reads remain untagged. The _entry
expected-current mismatch receives a typed current tag without inventing an old-
current/new-original tuple. Its single-target operation can use its own captured
four-field input. A later expected_input_hash mismatch is semantic rejection, stays
untagged and does not invalidate independent scientific facts.

The client distinguishes absent, valid and invalid supplied identity; malformed
provided provenance cannot become absent fallback authority. Batch resolve accepts
only proof matching its captured project, requested member and all four immutable
source fields, even for a one-entry batch. Never invalidate every batch input.
Single-target operations use the captured exact source and valid producer evidence.
Delayed source facts apply independently of UI feedback ownership to matching
cached source only; a different source B remains untouched. Returning to the same
immutable A requires verification after the latest observed failure. Clear/no-op
fabricates no read proof; successful assignment/clear follows existing identity/
history. Transport, revision/context errors, semantic candidate rejection and
untagged derived drawing errors do not become molecular-source failures.

Architecture and scientific implementation assessed this boundary before code.
Verify actual158composition/drawing/Use retirement, actual159numerical/captured-
authority retirement, exact batch isolation, API provenance validation, held reads,
closed/switched contexts, Clear/semantic/transport/derived positives, bounded
retention and successful current candidate recheck. Preserve all failed proofs.
Complete focused/static/web checks and all-seven same-final-candidate assessments;
then run a fresh full158candidate/exact-master gate before publication. C12's
unchanged automated results are historical, not approval of the known defect.


D-198 single-Use compatibility clarification: inspection of the designation write,
entry.ligand patch application, history trimming and project DTO construction finds
no artifact reads outside the captured target's _inputs. Therefore legacy untagged
artifact_integrity_error409/artifact_not_found404 on the actual single-target Use
API promise are valid source evidence for that captured input. Enable this narrow
fallback only when selecting a candidate. Clear has no input read and gains no such
fallback; batch resolution always requires full typed exact identity. Untagged
structure_artifact_conflict remains ambiguous with candidate-hash rejection and
cannot grant mutation authority. A supplied malformed or mismatching identity
always prevents fallback. This preserves the original source-failure regression
while retaining explicit producer and immutable-source ownership.


### D-198 property-result producer — preserve explicit physical verification facts

A separate159integration negative uses six actual current/original corruption,
missing-file and missing-metadata READ results. They return HTTP200/status=failed
with no report; the property session retires numbers but leaves canonical candidate
facts qualified. Preserve the source-bound negative assessment72841d050ca371a1778aa461610eec39a683f07b9eab6ae08d0476fabf77ea95.
This producer belongs159, not the earliest158ligand-service correction.

Before159integration, carry a narrow optional physical-source fact from existing
PropertySourceVerification snapshot/read failure branches into the existing current
result row. Capture project/entry/current/original primitive IDs before publication
locks/rechecks or ORM refresh, and preserve provenance in operation-local failure
memoization. Never infer physical failure from free-text reason, generic failed/
unavailable status, worker/chemistry/capacity errors or generic structure409; the
latter also covers valid-source designation/instance/membership changes.

Install a narrow session-to-canonical-owner publication port synchronously above
presentation. After existing active request/read-generation/ownership and exact
source guards, validate all four fields and non-null role evidence, publish one
fact through the canonical barrier/event retirement path, and return immediately.
That response's own authority has retired; it cannot then publish, poll or demand.
The inventory-to-session retirement path must not re-emit a physical fact. Apply
the same provenance validation to source-verified demand rows while retaining the
fresh-property-READ recovery fence. No new broker, error history, retry loop or
scientific method is introduced.

Candidate and numerical recovery remain independent: candidate success alone
cannot restore numbers, and numeric success cannot silently qualify composition/
drawing. Verify six actual physical failures, unsupported/worker/capacity/transport/
designation positives, one-event retirement across aliases, held A/B/Undo/Retry/
newer-failure ownership, hidden/remounted consumers and unrelated/Cancel/original-
bytes/history/bounded retention. Architecture and scientific implementation have
assessed the method before code; actual159implementation and reassessment remain
pending the earliest158shared-source correction.


### D-196 downstream recovery continuation — verified profile preparation

2026-11-18: propagate the exact accepted159worker correction into160without changing
profile definitions, evaluator/dependency behavior, scientific methods, schema or
resource bounds. Catch private-cache OSError only inside its housekeeping seam;
pre-launch input/version refusals capture immutable ownership and terminalize/reap
only a rechecked exact association with affirmative never-started process metadata.
Replacement, foreign, deleted and positively registered captures keep their existing
verified recovery authority.

Only job_worker.py changes and one independent33-case regression file is added to
the1197-source preparation. All1196other source bodies remain exact. Destination
checks pass33new+171affected cases and Ruff/ownedformat/mypy280. Three unchanged
private migration cases bind ROOT/alembic/current0017 to this destination, with
collection-time proof and a same-case160location supplement; the initial missing-
file collection failure is retained. This is scoped local checkpoint acceptance,
not a full-feature/all-seven/performance qualification. Preserve old guards as
stale HOLD and integrate actual released159before final delivery. The lossless
source/recovery packet retains all1831regular input files without SQL processing;
installed node_modules remains an explicit inert dependency alias, not a bundled
source or omitted owned evidence tree.


### D-201 downstream inspector preparation — preserve complete query ownership

2026-11-18: before released159integration, reuse its exact inspector query-scaling
correction in160. One immutable-project entry index replaces repeated linear
searches. Memoized query options preserve every eligible hidden/selected entry and
artifact key; explicit data/isError/isPlaceholderData notifications retain complete
projection qualification and retained-data failure retirement. Do not narrow query
scope or change the visit/task/scroll suffix, profile dependencies or source guards.

Architecture and performance assessed the method before the bounded two-path edit
and independently reviewed its resulting diff/evidence. The original100/1000-entry
resource assertion fails as expected; the corrected regression and two ownership
controls pass, as do122affected cases and web lint/types/build. Preserve raw red and
green logs, launcher-only failures and source inventories in the scoped evidence
packet. This passes local preparation only: actual released159integration, profile
qualification and all-seven same-final-candidate acceptance remain mandatory. No
additional standalone native workload is required solely for this identical
correction; no production latency improvement is inferred from mocked work counts.


## D-203 — Qualify consecutive property releases on the same database schema

2026-11-20, #160, before new compatibility implementation. The actually released
v0.37.0 prerequisite uses schema 0017; planned v0.38.0 profiles add no durable
schema. A preceding migration refusal cannot prove positive same-schema writer
compatibility. Keep literal/default `private-derived-shared-schema-v1` and its
0017/0016 refusal and offline controls unchanged. Add the explicitly selected,
allowlisted `private-derived-same-schema-v2` for current/previous 0017, through
recipe, actor authorization, summaries, package and profile helper catalogue.
Do not infer protocol or worker source from version strings, roots or capabilities.

The [accepted contract](assets/ligand-profiles/c3-same-schema-acceptance.json)
retains the exact earlier planning input and independent architecture/scientific
implementation PASS identities. Actual v0.37.0 tag/merge/release/closeout are now
verified. Actual #160 predecessor extraction, actor/schema proofs and integration
remain pending; no new runtime result is claimed by this decision.

Before preceding-code API writes, prove actual preceding upgrade exit 0 at 0017,
unchanged schema, logical rows, artifacts and originals. Keep all 17 migration
bodies exact. Use its genuine purpose-aware ORM/API for ordinary jobs; separately
retain the omitted-column server-default regression. Ordinary jobs stay ordinary;
private derived work stays absent from ordinary API/archive projections. Forged
markers grant no authority. Preserve history, metadata, preferences, corruption,
stale/recovery, cancellation, deletion/Undo and archive remapping behavior.

Exercise pending, captured, started, completed, cancelled, corrupt, stale, forged
and project-deleted families genuinely produced by BOTH current and preceding
sources, with both archive suffixes and all three directional phases. Keep actual
nonready states nonready; never prewarm fixtures solely to fabricate value vectors.
Use exact ten-descriptor coverage, including logP and strict rotors; preserve saved
composition/polarity preferences and the separate source-qualified charge-presence
fact. Compare genuine available producer vectors and independently specified
fixture goldens; floats retain absolute 1e-10/relative 0, integers retain exact types,
and profile operators retain exact boundaries without epsilon. Unsupported edited
chemistry keeps qualified known counts and per-value unavailable reasons.

Select an explicit authorized current/previous worker slot and verify exact source,
interpreter/module hashes, method/library/policy BEFORE early worker return or an
interruption claim. The existing process-group checkpoint precedes plugin loading;
it proves an owned spawned descriptor child, not native calculation entry. Report
only actually observed stages and actually matching producer-vector comparisons.

The six profile-specific qualification helpers require an independent literal
five-directory/six-name catalogue. Historical helpers and v1 contracts remain.
Registry reads remain storage-free; profile selection stays transient and resets
on reload/remapping. No scientific method, descriptor, dependency, migration,
workload, deadline or performance policy change is introduced. Full candidate and
actual-merge gates and all seven final specialist reviews still apply.
