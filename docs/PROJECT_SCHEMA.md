# Project Schema

Status: Neistra, `ProjectStateV1` and `ProjectManifestV1`

Neistra separates the relational working model, checkpoint snapshots, immutable
artifacts, and browser preferences. The API and database are authoritative;
browser layout state is not project state.

## Versioning

The checkpoint payload is `ProjectStateV1` and contains
`"schema_version": 1`. The API exposes the same version on complete project
responses. Alembic migration `0002` upgrades snapshots created before the
version field was introduced.

Any incompatible change requires a new schema number and a migration. Readers
must reject unknown newer versions rather than guessing. The portable
`ProjectManifestV1` archive defined in `docs/PLAN.md` is delivered in M8 and is a
separate, documented transport schema.

## ProjectStateV1

```text
ProjectStateV1
  schema_version: 1
  name: string
  description: string | null
  entries: StructureEntryV1[] sorted by stable ID
  groups: EntryGroupV1[] sorted by stable ID
  saved_selections: SavedSelectionV1[] sorted by stable ID
  measurements: MeasurementV1[] sorted by stable ID
  scenes: SceneV1[] sorted by stable ID
```

The snapshot intentionally excludes working revision, checkpoint revision,
timestamps that change as a consequence of commands, command history, and UI
preferences. Dirty state is a deterministic comparison of the current
project-state payload with the saved checkpoint.

## StructureEntryV1

```text
id: UUIDv7 string
group_id: UUIDv7 string | null
name: string
description: string | null
structure_type: protein | ligand | complex | solvent | unknown
original_filename: string | null
source_format: pdb | mmcif | sdf | mol | mol2 | xyz | smiles | null
normalized_data: {"schema_version": 1, "storage": "artifact"}
atom_count: integer
bond_count: integer
residue_count: integer
conformer_count: integer
warnings: MolecularWarning[]
viewer_settings: ViewerSettingsV1
visible: boolean
locked: boolean
user_metadata: JSON object
job_links: string[]
generated_results: string[]
original_artifact_id: string | null
current_artifact_id: string | null
created_at: ISO-8601 timestamp
```

Validated M2 import populates `original_artifact_id` and
`current_artifact_id`. The first references byte-identical input; the second
references serialized `NormalizedStructureV1`. Originals are never overwritten.
Every M5 coordinate command publishes another immutable normalized artifact and
switches only `current_artifact_id`; undo restores the exact prior artifact ID.
Project API responses expose summaries, not `normalized_data`; full molecular
data is read lazily through the structure endpoint. See
`docs/NORMALIZED_SCHEMA.md`.

## EntryGroupV1

```text
id: UUIDv7 string
parent_id: UUIDv7 string | null
name: string
created_at: ISO-8601 timestamp
```

## SavedSelectionV1

```text
id: UUIDv7 string
name: string, unique per project ignoring case
atom_references: AtomReference[] in canonical order
granularity: atom | residue | chain | structure
warnings: MolecularWarning[]
created_at: ISO-8601 timestamp
```

An `AtomReference` contains a stable structure-entry ID and a positive
normalized atom ID. Named selections are immutable reference sets from the
user's perspective and participate in checkpoint state, undo, and redo. An edit
that removes referenced molecular objects reconciles references and records a
warning in the same command; undo restores both references and warning state.

Migration `0004` adds the relational named-selection table and upgrades
existing checkpoint payloads with an empty `saved_selections` list. This is an
additive migration, so the schema version remains 1.
Complete project API responses also include the relational `modified_at`
timestamp for each saved selection; checkpoint payloads omit derived update
timestamps.

## ViewerSettingsV1

```text
representations:
  - id: unique string within the entry
    style: cartoon | backbone | line | stick | ball-and-stick |
      thick-stick | space-filling | surface
    color_by: element | chain | residue | secondary-structure | structure |
      custom
    custom_color: six-digit CSS hex color
    opacity: number in [0, 1]
selection_representations:
  - style: line | stick | thick-stick | ball-and-stick | space-filling |
      backbone | cartoon
    atom_ids: sorted unique positive normalized atom IDs
components:
  hydrogens: boolean
  nonpolar_hydrogens: boolean
  solvent: boolean
  ions: boolean
  ligands: boolean
  protein: boolean
labels:
  atoms: boolean
  residues: boolean
  chains: boolean
  structure: boolean
```

Every structure entry has at least one representation. These settings are
application-owned project state; Mol* consumes them but is not their persistence
format. Selection representations contain at most one record per style. Atom
IDs are disjoint within the atomic channel and within the polymer channel, but
the same atom may have one assignment in each channel. An applied style
replaces the selected membership only within its channel; reset removes the
selected IDs from both channels and restores entry-level inheritance.

Polymer assignments are valid only for exact complete residues classified as
supported protein, DNA, or RNA and containing their required trace atom.
Assignments use current entry-local normalized atom IDs; they never persist
Mol* loci, source array positions, component labels, or coordinates. Atom
deletion prunes live and scene assignments atomically, while undo restores the
prior records. Named scenes store the same typed viewer settings, so applying a
scene restores styles with its camera and transient selection.

`components.hydrogens` is the master display switch. When it is `true`,
`components.nonpolar_hydrogens=false` selects the polar-only presentation;
when the master switch is `false`, no hydrogen is displayed and the dependent
preference is retained for later re-enabling. Both fields default to `true` in
legacy payloads. They filter presentation only and do not add, remove, infer,
or modify normalized atoms or bonds.

Alembic migration `0008` adds an empty `selection_representations` list to live
entry JSON, checkpoint entry JSON, and scene entry-state JSON. Legacy project
and archive payloads that omit the additive field default to an empty list.
Downgrade is permitted only while all such lists are empty; otherwise it stops
with an explicit instruction to reset selection styles, preventing silent data
loss. Project schema version 1, archive schema version 1, and normalized schema
version 1 are unchanged.

Alembic migration `0009` adds `nonpolar_hydrogens: true` to live entry JSON,
checkpoint entry JSON, and scene entry-state JSON. Project and archive payloads
that omit the additive field retain all-hydrogen behavior through the model
default. Downgrade is permitted only while every stored value is `true`; if a
polar-only preference exists, it stops with an explicit instruction to re-enable
non-polar hydrogens first rather than silently discard user state. Project
schema version 1, archive schema version 1, normalized schema version 1, and
the `/api/v1` major remain unchanged.

## MeasurementV1

```text
id: UUIDv7 string
name: string
kind: distance | angle | dihedral
atom_references: ordered AtomReference[]
visible: boolean
warnings: MolecularWarning[]
created_at: ISO-8601 timestamp
```

Distance, angle, and dihedral measurements require two, three, and four distinct
atom references respectively. Coordinates and displayed values are derived
from the current normalized structures rather than stored in the measurement.

## SceneV1

```text
id: UUIDv7 string
name: string, unique per project ignoring case
camera:
  mode: perspective | orthographic
  position: [x, y, z]
  target: [x, y, z]
  up: [x, y, z]
  radius: positive number
entry_states:
  - entry_id: UUIDv7 string
    visible: boolean
    viewer_settings: ViewerSettingsV1
selection: SelectionV1
created_at: ISO-8601 timestamp
```

Named scenes store typed application state, never opaque Mol* snapshots.
Applying a scene changes durable entry visibility and viewer settings through
one revisioned command. Camera and current selection are restored by the client
from the same scene response.

Migration `0005` adds viewer settings, measurements, and scenes and upgrades
existing checkpoint payloads with deterministic viewer defaults and empty
measurement/scene lists. It is additive, so the schema version remains 1.
Entry deletion removes dependent measurements and prunes deleted entry and atom
references from scenes atomically; undo restores the complete prior state.

## Command Records

Each reversible mutation stores:

- Stable command ID, project ID, and ordered position.
- Machine-readable command type and human-readable description.
- Complete forward and inverse action arrays.
- Affected entry IDs and a selection snapshot.
- Applied/undone state and creation timestamp.

Coordinate actions additionally store the before/after normalized artifact ID
and a sorted active-coordinate span for the affected stable atom IDs. The span
lets undo, redo, and connected viewers update one entry without embedding the
complete normalized structure in SQLite. Artifact bytes remain authoritative.

The history is limited to 200 commands. Issuing a command after undo discards
the redo branch. Undo and redo are themselves revision-checked operations and
increment the working revision.

Complete project mutation responses expose `structure_patches` as a transient
transport field. It is excluded from `ProjectStateV1`, checkpoints, dirty-state
comparison, and ordinary project reads.

Ligand-capable structure entries also persist an exact ordered `atom_ids`
summary plus monotonic `next_atom_id` and `next_bond_id` allocators. Atom count
is not an identity range once deletions create gaps. Allocators are deliberately
outside reversible molecular snapshots and never rewind, so an identity issued
by a successful command is not reused after undo or history branching.

Molecular edit actions store complete before/after normalized artifact
references and entry summaries. Their mutation, undo, and redo responses expose
an affected-entry `topology_patches` transport field. The client refetches that
artifact and replaces only its disposable Mol* structure; the patch is not
checkpoint state. Migration `0006` initializes exact atom IDs and allocators in
current entries and retained checkpoint payloads.

## Artifact Records

Artifact bytes live under the configured managed root. The relational record
contains stable ID, SHA-256, size, media type, safe display filename, managed
relative path, and creation time. Publication uses a temporary file, `fsync`,
and atomic replacement. Absolute paths and paths escaping the root are rejected.
Content hashes deduplicate bytes while entry records retain the safe original
display filename and source format.

## Job Records

Jobs are relational operational state, not part of `ProjectStateV1` and not
project edit commands. A job stores its stable ID, parent project, plugin/job
identity and implementation version, canonical parameters, lifecycle state,
progress/message, timestamps, values, warnings, structured error, worker ID,
cancellation flag, and immutable provenance document.

Each input stores the submitted entry identity and role plus the exact artifact
ID, SHA-256, size, media type, and filename. Later project edits cannot change
that snapshot. Each result stores a role, immutable artifact reference, media
type, plugin metadata, importability, and IDs of entries created from it.
Ordered events store state, progress, stdout, stderr, and cancellation messages.

Result import creates an artifact-backed `StructureEntryV1` with
`source_format: null`; the normalized internal media type is not presented as a
molecular file format. `job_links`, `generated_results`, and metadata link the
job, result, implementation, parameters, inputs, and immutable hashes. Import
is one normal undoable command.

## ProjectManifestV1 Archive

A portable project is a ZIP archive with safe relative member names:

```text
manifest.json
artifacts/<sha256>
```

`manifest.json` is strict JSON with:

```text
schema_version: 1
application_version: semantic-version producer provenance
source_project_id: UUID string
source_revision: non-negative integer
source_checkpoint_revision: non-negative integer
name: non-empty string
description: string or null
created_at: ISO-8601 timestamp
modified_at: ISO-8601 timestamp
entries[]: strict current entry snapshots with normalized data and artifact paths
groups[]: strict group snapshots
saved_selections[]: strict canonical atom-reference snapshots
measurements[]: strict typed measurement snapshots
scenes[]: strict camera, entry-state, and selection snapshots
jobs[]: strict terminal or normalized-incomplete job snapshots
files[]:
  path: artifacts/<sha256>
  sha256: 64 lowercase hex characters
  size: non-negative integer
  media_type: non-empty string
  filename: safe display basename
```

`schema_version` selects the structural archive contract. The separately
validated `application_version` records which MolWeave release produced the
archive and is not an exact-version import gate. Consequently, a valid archive
produced by 0.1.0 remains readable by 0.1.1 while both releases use
`ProjectManifestV1` schema version 1. Malformed semantic versions and unknown
archive schema versions are rejected.

The archive includes every original/current artifact referenced by an entry
and every immutable job input/result artifact required for provenance. Export
uses deterministic JSON, deterministic member ordering, fixed ZIP timestamps,
and checksums. Import validates schema, member allowlist, uniqueness, paths,
declared/actual size, SHA-256, total/member/compression-ratio limits, normalized
documents, referential integrity, and job provenance before one atomic project
creation.

All project, entry, group, selection, measurement, scene, artifact, job, input,
result, and event IDs are remapped on import. The imported project starts as a
clean revision-zero checkpoint while retaining source ID/revision provenance.
Command history and browser/Mol* state are intentionally absent. Queued or
running source jobs become failed records with `archive_incomplete_job` because
executable process state is neither portable nor resumable.

## Browser Preferences

The `molweave-workspace-v1` browser key contains only:

- Theme.
- Active-project pointer.
- Horizontal and vertical panel sizes.
- Collapsed state for the structure, inspector, and history panels.

It never contains molecular entries, artifacts, checkpoints, or command history.
The unsaved current selection and current camera are transient session state and
are cleared when the active project changes or the page reloads unless the user
restores them from a named scene.
