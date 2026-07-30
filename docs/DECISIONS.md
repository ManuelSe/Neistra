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
