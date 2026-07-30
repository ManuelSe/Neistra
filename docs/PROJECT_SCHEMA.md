# Project Schema

Status: `ProjectStateV1`, Milestone 1

MolWeave separates the relational working model, checkpoint snapshots, immutable
artifacts, and browser preferences. The API and database are authoritative;
browser layout state is not project state.

## Versioning

The M1 checkpoint payload is `ProjectStateV1` and contains
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
source_format: string | null
normalized_data: versioned JSON object
visible: boolean
locked: boolean
user_metadata: JSON object
job_links: string[]
generated_results: string[]
original_artifact_id: string | null
current_artifact_id: string | null
created_at: ISO-8601 timestamp
```

`original_artifact_id` and `current_artifact_id` are reserved by the M1 schema
and become populated by M2 import. Originals are never overwritten.
`normalized_data` is empty only for M1 seeded test fixtures; the scientific
`NormalizedStructureV1` contract begins in M2.

## EntryGroupV1

```text
id: UUIDv7 string
parent_id: UUIDv7 string | null
name: string
created_at: ISO-8601 timestamp
```

## Command Records

Each reversible mutation stores:

- Stable command ID, project ID, and ordered position.
- Machine-readable command type and human-readable description.
- Complete forward and inverse action arrays.
- Affected entry IDs and a selection snapshot.
- Applied/undone state and creation timestamp.

The history is limited to 200 commands. Issuing a command after undo discards
the redo branch. Undo and redo are themselves revision-checked operations and
increment the working revision.

## Artifact Records

Artifact bytes live under the configured managed root. The relational record
contains stable ID, SHA-256, size, media type, safe display filename, managed
relative path, and creation time. Publication uses a temporary file, `fsync`,
and atomic replacement. Absolute paths and paths escaping the root are rejected.

## Browser Preferences

The `molweave-workspace-v1` browser key contains only:

- Theme.
- Active-project pointer.
- Horizontal and vertical panel sizes.
- Collapsed state for the structure, inspector, and history panels.

It never contains molecular entries, artifacts, checkpoints, or command history.
