# MolWeave HTTP API

Status: Milestone 6

The local FastAPI application exposes a versioned API under `/api/v1` and
generates OpenAPI at `/api/v1/openapi.json`. Swagger UI is available at
`/api/docs`.

## Conventions

- JSON request and response bodies use `snake_case`.
- Every persisted mutation except initial project creation includes
  `expected_revision`.
- A successful project command increments `revision`.
- A stale mutation returns HTTP 409 with
  `{"detail":{"code":"revision_conflict","message":"..."}}`.
- Molecular parse and format errors use HTTP 422 with file, operation, and
  optional record index. Upload/atom hard limits use HTTP 413.
- Project responses declare `schema_version: 1`.
- Mutation, undo, and redo responses may include transient coordinate
  `structure_patches` or affected-entry `topology_patches`; ordinary project
  reads return empty patch lists.
- Save advances the checkpoint to the working revision without creating a
  reversible edit command.

## Project Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Verify API and database access. |
| `GET` | `/api/v1/projects` | List project summaries, newest first. |
| `POST` | `/api/v1/projects` | Create a clean project. |
| `GET` | `/api/v1/projects/{project_id}` | Read project metadata, molecular summaries, and history. |
| `PATCH` | `/api/v1/projects/{project_id}` | Update project name and description. |
| `POST` | `/api/v1/projects/{project_id}/save` | Save the current working state as the checkpoint. |
| `POST` | `/api/v1/projects/{project_id}/history/undo` | Apply the latest inverse command. |
| `POST` | `/api/v1/projects/{project_id}/history/redo` | Reapply the next command. |

## Entry and Group Endpoints

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/v1/projects/{project_id}/entries/{entry_id}` | Rename and update entry description/metadata. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/duplicate` | Duplicate an entry with a stable new ID. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/visibility` | Show or hide an entry. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/lock` | Lock or unlock an entry. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/isolate` | Make only one entry visible. |
| `PUT` | `/api/v1/projects/{project_id}/entries/{entry_id}/viewer-settings` | Replace validated representations, components, and labels. |
| `DELETE` | `/api/v1/projects/{project_id}/entries/{entry_id}` | Delete an entry reversibly. |
| `POST` | `/api/v1/projects/{project_id}/groups` | Create a group containing specified entries. |
| `POST` | `/api/v1/projects/{project_id}/selections` | Save a canonical named selection as a reversible command. |
| `DELETE` | `/api/v1/projects/{project_id}/selections/{selection_id}` | Delete a named selection reversibly. |
| `POST` | `/api/v1/projects/{project_id}/measurements` | Create a distance, angle, or dihedral measurement. |
| `PATCH` | `/api/v1/projects/{project_id}/measurements/{measurement_id}` | Rename or show/hide a measurement. |
| `DELETE` | `/api/v1/projects/{project_id}/measurements/{measurement_id}` | Delete a measurement reversibly. |
| `POST` | `/api/v1/projects/{project_id}/scenes` | Save camera, visibility, viewer settings, and selection. |
| `POST` | `/api/v1/projects/{project_id}/scenes/{scene_id}/apply` | Apply scene entry state as one command. |
| `DELETE` | `/api/v1/projects/{project_id}/scenes/{scene_id}` | Delete a named scene reversibly. |

## Molecular Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/formats` | Discover import/export capabilities and extensions. |
| `POST` | `/api/v1/projects/{project_id}/imports` | Validate and atomically import multipart structure files. |
| `POST` | `/api/v1/imports/{operation_id}/cancel` | Cancel parsing before artifact/project commit. |
| `GET` | `/api/v1/projects/{project_id}/entries/{entry_id}/structure` | Lazily read authoritative normalized data and a viewer projection. |
| `GET` | `/api/v1/projects/{project_id}/entries/{entry_id}/original` | Download immutable original bytes. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/exports` | Generate one format adapter output. |
| `GET` | `/api/v1/artifacts/{artifact_id}` | Download an immutable generated or original artifact. |
| `POST` | `/api/v1/projects/{project_id}/contacts` | Find sorted nonbonded close contacts with a spatial index. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/transform` | Translate or rotate a whole entry or selected atoms. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/ligand-edits` | Apply one validated ligand graph, hydrogen, rotation, or cleanup command. |
| `POST` | `/api/v1/projects/{project_id}/superpositions` | Superpose one protein entry onto another and report RMSD. |

Import is `multipart/form-data` with one or more `files`, required
`expected_revision`, optional booleans `generate_3d` and `infer_bonds`, and an
optional `operation_id`. The complete batch is parsed and checked before one
reversible project command publishes any entry. An SDF or SMILES file may
produce multiple entries.

Export accepts:

```json
{"format": "xyz", "acknowledge_losses": false}
```

If known blocking losses exist, the first request returns HTTP 409 with
`export_loss_acknowledgement_required` and structured warnings. Repeating with
explicit acknowledgement generates an immutable artifact.

When `MOLWEAVE_ENABLE_TEST_ROUTES=1`, the test harness exposes a fixture-only
seed endpoint under `/api/v1/testing`; normal startup never registers it.

## Selection Contract

Every selection surface uses `SelectionV1`:

```json
{
  "schema_version": 1,
  "atoms": [
    {"structure_id": "019fb497-841f-7239-b6a0-618ef7cdac34", "atom_id": 1}
  ],
  "granularity": "atom",
  "source": "inspector"
}
```

`atoms` is a unique, lexicographically ordered set of stable
`(structure_id, atom_id)` references. Granularity is `atom`, `residue`, `chain`,
or `structure`; source is `viewer`, `project`, `sequence`, `inspector`, or
`saved`. Granularity and source describe the latest operation and do not create
alternate molecular identities.

Saving accepts:

```json
{
  "expected_revision": 4,
  "name": "Active site",
  "selection": {
    "schema_version": 1,
    "atoms": [{"structure_id": "entry-id", "atom_id": 42}],
    "granularity": "residue",
    "source": "inspector"
  }
}
```

The response is the revised complete project. Saved names are unique within a
project using case-insensitive comparison. Entry deletion removes invalid
references in the same reversible command and adds an
`invalid_selection_references_removed` warning to the saved selection.

## Viewer, Measurement, And Scene Contracts

Viewer settings require one or more uniquely identified representations.
Supported styles are `cartoon`, `backbone`, `line`, `stick`,
`ball-and-stick`, `space-filling`, and `surface`. Color schemes are `element`,
`chain`, `residue`, `secondary-structure`, `structure`, and `custom`; opacity
is in `[0, 1]`. Component and label visibility use explicit booleans.

Measurements persist a name, kind, ordered atom references, visibility, and
warnings. Distance requires two distinct atoms, angle three, and dihedral four.
Display values are recalculated from authoritative coordinates.

Scenes persist a typed camera (`mode`, `position`, `target`, `up`, `radius`),
entry visibility/settings, and `SelectionV1`. Mol* snapshots are never
accepted. Applying a scene revises the project; the client then restores its
camera and transient selection.

Contact requests contain `entry_id`, `cutoff`, and `minimum_distance`. Results
contain two canonical atom references and a distance in angstroms. Explicitly
bonded pairs are excluded.

## Coordinate Command Contracts

A transform request uses angstrom translations, degree rotations, a canonical
selection snapshot, and one explicit pivot policy:

```json
{
  "expected_revision": 7,
  "entry_id": "moving-entry-id",
  "scope": "selection",
  "selection": {
    "schema_version": 1,
    "atoms": [{"structure_id": "moving-entry-id", "atom_id": 42}],
    "granularity": "atom",
    "source": "inspector"
  },
  "translation": [1.5, 0.0, 0.0],
  "rotation_degrees": [0.0, 0.0, 30.0],
  "pivot_mode": "custom",
  "pivot": [4.2, -1.0, 8.5]
}
```

`scope` is `structure` or `selection`. `pivot_mode` is
`structure_centroid`, `selection_centroid`, or `custom`; only the last accepts
an explicit pivot. Rotations compose X, then Y, then Z. The same rigid matrix
is applied to the requested stable atom IDs in every conformer.

Protein superposition accepts distinct moving and reference entry IDs,
`mode: "backbone" | "selection"`, and a selection. Backbone mode matches
unambiguous `N`, `CA`, `C`, and `O` hierarchy identities. Selection mode
partitions the canonical atom set by entry and matches the complete protein
identity rather than click order. A successful response contains the revised
project and:

```json
{
  "moving_entry_id": "moving-entry-id",
  "reference_entry_id": "reference-entry-id",
  "mode": "backbone",
  "atom_count": 128,
  "rmsd": 0.7421
}
```

Coordinate commands reject locked entries, identity/no-op transforms, invalid
or empty selected scopes, non-finite values, fewer than three correspondences,
unequal or ambiguous identities, underdetermined geometry, and
reflection-only fits. The reference entry is never changed.

Each returned coordinate patch contains `entry_id`, the new authoritative
`artifact_id`, sorted stable `atom_ids`, and matching active-conformer
coordinates. Patches are response hints for incremental viewers, not stored
project state. Reloading always reconstructs the same coordinates from the
entry's current immutable normalized artifact.

## Ligand Edit Contract

Ligand edits use a discriminated `operation` field and always include
`expected_revision`. Supported operations are `atom.add`, `atom.delete`,
`atom.element`, `atom.charge`, `bond.add`, `bond.delete`, `bond.order`,
`hydrogen.add`, `hydrogen.remove`, `bond.rotate`, and
`coordinates.cleanup`. Atom deletion accepts stable `atom_ids`; bond rotation
accepts one `bond_id`, an exact movable-side atom-ID set, and a degree angle.
Cleanup accepts `force_field: "auto" | "mmff" | "uff"`, a bounded iteration
count, and an optional local atom-ID set.

A successful response contains the revised project, structured molecular
warnings, and a report listing created, deleted, and changed stable IDs. Cleanup
also reports the actual `MMFF` or `UFF` method and convergence. Every response
includes an affected-entry topology patch so the client refetches and replaces
only that viewer projection.

Invalid valence, unsupported elements or bond orders, unavailable explicitly
requested force-field parameters, locked entries, ring/terminal/incorrect-side
bond rotation, and stale revisions fail without publishing an artifact or
advancing the project revision. Stable per-entry atom and bond allocators do not
rewind through undo, redo, or a discarded history branch.

## Errors

Domain failures use stable codes:

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `project_not_found` | The project ID is unknown. |
| 404 | `entry_not_found` | The entry ID is unknown in the project. |
| 409 | `revision_conflict` | `expected_revision` is stale. |
| 409 | `history_unavailable` | The requested undo or redo does not exist. |
| 409 | `export_loss_acknowledgement_required` | Output would discard blocking information. |
| 413 | `structure_file_too_large` | One file exceeds the configured byte limit. |
| 413 | `aggregate_upload_too_large` | The multipart request exceeds the aggregate limit. |
| 413 | `atom_hard_limit_exceeded` | A parsed entry exceeds the atom hard limit. |
| 422 | `unsupported_format` | No adapter owns the extension or requested format. |
| 422 | `parse_failed` / `no_atoms` | The named file cannot become a molecular structure. |
| 422 | `invalid_project_operation` | The command violates a project invariant. |
| 499 | `import_cancelled` | Preparation was cancelled before commit. |

FastAPI/Pydantic validation failures retain FastAPI's structured HTTP 422 body.
