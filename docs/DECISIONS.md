# MolWeave Architectural Decisions

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
