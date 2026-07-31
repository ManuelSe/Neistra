# Project Schema

Status: `ProjectStateV1` with normalized artifacts, viewer state, measurements,
named scenes, immutable coordinate revisions, and durable jobs, Milestone 9

MolWeave separates the relational working model, checkpoint snapshots, immutable
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
      space-filling | surface
    color_by: element | chain | residue | secondary-structure | structure |
      custom
    custom_color: six-digit CSS hex color
    opacity: number in [0, 1]
components:
  hydrogens: boolean
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
format.

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

`ProjectManifestV1` archives include job summaries plus all immutable input and
result artifacts needed for provenance. IDs are remapped on import. Queued or
running archived jobs become failed records with `archive_incomplete_job`;
executable process state is never reconstructed.

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
