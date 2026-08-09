# MolWeave HTTP API

Status: MolWeave v0.1

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
| `POST` | `/api/v1/projects/{project_id}/selection-representations` | Apply or reset a representation for a canonical selection as one reversible multi-entry command. |

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
| `GET` | `/api/v1/projects/{project_id}/entries/{entry_id}/structure` | Lazily read normalized data, its derived component hierarchy, and a viewer projection. |
| `GET` | `/api/v1/projects/{project_id}/entries/{entry_id}/original` | Download immutable original bytes. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/exports` | Generate one format adapter output. |
| `GET` | `/api/v1/artifacts/{artifact_id}` | Download an immutable generated or original artifact. |
| `POST` | `/api/v1/projects/{project_id}/contacts` | Find sorted nonbonded close contacts with a spatial index. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/transform` | Translate or rotate a whole entry or selected atoms. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/ligand-edits` | Apply one validated ligand graph, hydrogen, rotation, or cleanup command. |
| `POST` | `/api/v1/projects/{project_id}/entries/{entry_id}/protein-edits` | Apply one validated protein hierarchy, mutation, or hydrogen command. |
| `POST` | `/api/v1/projects/{project_id}/superpositions` | Superpose one protein entry onto another and report RMSD. |

## Job Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/jobs/definitions` | Read allowlisted definitions, role declarations, and parameter JSON schemas. |
| `POST` | `/api/v1/projects/{project_id}/jobs` | Validate and enqueue a job with immutable input snapshots. |
| `GET` | `/api/v1/projects/{project_id}/jobs` | List durable project jobs, newest first. |
| `GET` | `/api/v1/jobs/{job_id}` | Read state, provenance, inputs, errors, values, and results. |
| `POST` | `/api/v1/jobs/{job_id}/cancel` | Cancel queued work or request running-child cancellation. |
| `GET` | `/api/v1/jobs/{job_id}/events` | Poll ordered events after optional `after_sequence`. |
| `POST` | `/api/v1/jobs/{job_id}/results/{result_id}/import` | Import a normalized result through one undoable command. |
| WebSocket | `/ws/jobs?project_id=...&after_event_id=...` | Stream durable project events from a global cursor. |

Submission does not increment the project revision because operational job
state is not an edit command. It snapshots each input's current artifact ID,
SHA-256, size, entry identity, role, and structure type in the queued
transaction. The HTTP process never executes a plugin. A separate worker claims
jobs and records ordered state, progress, log, and result events. Result import
does increment project revision and is undoable.

The demonstration request is:

```json
{
  "job_type": "molweave.demo.structure_statistics",
  "parameters": {
    "step_count": 5,
    "delay_ms": 100,
    "fail_at_step": null,
    "translation": [0.0, 0.0, 0.0]
  },
  "inputs": [{"role": "structure", "entry_id": "entry-id"}]
}
```

The worker validates result roles/media types, safe filenames, artifact
count/bytes, and importable normalized structures before publication. See
`docs/PLUGIN_GUIDE.md` for the public plugin contract.

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

## Lazy Structure And Component Contract

The structure endpoint is artifact-keyed and returns an additive
`ComponentHierarchyV1` projection beside the authoritative normalized document
and disposable viewer payload:

```json
{
  "entry_id": "entry-id",
  "structure": {"schema_version": 1, "atoms": [], "residues": []},
  "hierarchy": {
    "schema_version": 1,
    "components": [
      {
        "id": "cmp-opaque-stable-id",
        "category": "ligand",
        "display_label": "BTN 300 · chain A",
        "chain_ids": [1],
        "residue_ids": [122],
        "atom_ids": [],
        "classification_source": "source",
        "classification_status": "assigned",
        "warnings": []
      }
    ],
    "warnings": []
  },
  "viewer": {"format": "mmcif", "data": "..."}
}
```

Categories are `protein`, `dna`, `rna`, `other_polymer`, `ligand`, `water`,
`solvent`, `ion`, `other_heterogen`, and `unclassified`. Membership is expressed
through chain/residue IDs; `atom_ids` is used only when an atom lacks usable
hierarchy. Consumers derive exact atom unions from the returned normalized
document without duplicating category atom arrays. Classification source is
`source`, `fallback`, or `ambiguous`; status is `assigned` or `ambiguous`.

The projection is read-only. MolWeave exposes no component rename,
reclassification, individual-style, individual-visibility, ligand-designation,
or subset-export endpoint in this release. `/api/v1` and project/archive schema
version 1 are unchanged. Alembic head is `0008` for the additive selection-
representation viewer-settings field.

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

### Selection representation action

The project-level action accepts the same canonical `SelectionV1` and applies
atomically across every referenced entry:

```json
{
  "expected_revision": 8,
  "selection": {
    "schema_version": 1,
    "atoms": [
      {"structure_id": "entry-id", "atom_id": 42},
      {"structure_id": "entry-id", "atom_id": 43}
    ],
    "granularity": "residue",
    "source": "project"
  },
  "action": "apply",
  "style": "thick-stick"
}
```

`action` is `apply` or `reset`. Apply requires one of `line`, `stick`,
`thick-stick`, `ball-and-stick`, `space-filling`, `backbone`, or `cartoon`;
reset requires `style` to be absent. An empty selection, stale/unknown atom
reference, duplicate or noncanonical reference, or incompatible polymer target
returns a validation/operation error without changing any entry. Backbone and
Cartoon require exact complete supported protein, DNA, or RNA residues with
their required trace atoms in every selected entry; partial or mixed-invalid
multi-entry requests fail as a whole.

A successful action returns the revised complete project and increments the
project revision exactly once. Atomic styles replace selected atoms only among
the five atomic styles; polymer styles replace them only between Backbone and
Cartoon. Reset removes the selected atoms from both channels. The existing
entry viewer-settings endpoint may preserve but cannot mutate
`selection_representations`; callers must use this project-level action so
validation, atomicity, history, and topology reconciliation cannot be bypassed.

## Viewer, Measurement, And Scene Contracts

Viewer settings require one or more uniquely identified representations.
Supported entry-level styles are `cartoon`, `backbone`, `line`, `stick`,
`thick-stick`, `ball-and-stick`, `space-filling`, and `surface`. Color schemes are `element`,
`chain`, `residue`, `secondary-structure`, `structure`, and `custom`; opacity
is in `[0, 1]`. Component and label visibility use explicit booleans.
Selection-specific records contain a style and canonical entry-local atom IDs;
they inherit fixed element coloring and full opacity in this release and do not
add selection-specific surface, label, color, or opacity controls.

Component visibility includes `hydrogens` and `nonpolar_hydrogens`, both
defaulting to `true` for additive compatibility. `hydrogens=false` is
authoritative and hides all explicit hydrogens while preserving the dependent
value. Otherwise `nonpolar_hydrogens=false` requests the polar-only mode. That
mode renders only explicit hydrogens with projected bond connectivity to N, O,
S, F, Cl, Br, or I. This is a viewer contract, not an atom-edit, hydrogen
inference, protonation, or hydrogen-bond-analysis API. Existing clients that
omit the field retain the prior all-hydrogen behavior; `/api/v1` is unchanged.

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

## Protein Edit Contract

Protein edits use a discriminated `operation` field and always include
`expected_revision`. Supported operations delete atoms, residues, chains,
waters, or common ions; rename a chain; renumber a chain from a positive start
using a positive step; mutate one residue to one of the 20 standard amino
acids; and add or remove hydrogens. Hydrogen addition accepts an optional
residue scope and a pH in `[0, 14]`.

Chain rename preserves normalized chain identity while changing its authored
and display labels. Chain renumbering changes authored residue numbers, clears
insertion codes, and preserves normalized residue identity. Standard amino-acid
mutation preserves `N`, `CA`, `C`, and `O` coordinates and rebuilds side-chain
atoms from the pinned PDBFixer/OpenMM template data.

A successful response contains the revised project, structured warnings, and a
report listing created, deleted, and changed stable atom and bond IDs. It also
contains an affected-entry topology patch so the client replaces that viewer
projection and reconciles transient and saved selection references.

Template operations require an unambiguous single-model polymer hierarchy.
Alternate conformers, duplicate atom names within the target residue, missing
required backbone atoms, unsupported target residues, locked entries, and stale
revisions fail without publishing an artifact or advancing the project
revision. Stable per-entry atom and bond allocators do not rewind through undo,
redo, or a discarded history branch.

Atom and residue movement uses the existing `transform` endpoint with an exact
canonical atom selection. This is an unconstrained Cartesian edit. The protein
editor surfaces missing-template, unsupported-residue, terminal, alternate
conformer, severe-clash, and questionable-hydrogen warnings, but it is not a
complete structure-preparation, protonation, rotamer, or force-field workflow.

## Errors

Domain failures use stable codes:

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `project_not_found` | The project ID is unknown. |
| 404 | `entry_not_found` | The entry ID is unknown in the project. |
| 409 | `revision_conflict` | `expected_revision` is stale. |
| 409 | `history_unavailable` | The requested undo or redo does not exist. |
| 404 | `job_not_found` / `job_result_not_found` | The job or result ID is unknown. |
| 409 | `job_conflict` | The requested lifecycle transition is invalid. |
| 409 | `export_loss_acknowledgement_required` | Output would discard blocking information. |
| 413 | `structure_file_too_large` | One file exceeds the configured byte limit. |
| 413 | `aggregate_upload_too_large` | The multipart request exceeds the aggregate limit. |
| 413 | `atom_hard_limit_exceeded` | A parsed entry exceeds the atom hard limit. |
| 422 | `unsupported_format` | No adapter owns the extension or requested format. |
| 422 | `parse_failed` / `no_atoms` | The named file cannot become a molecular structure. |
| 422 | `invalid_project_operation` | The command violates a project invariant. |
| 422 | `invalid_job_operation` | Parameters, roles, inputs, or results violate the definition. |
| 499 | `import_cancelled` | Preparation was cancelled before commit. |

FastAPI/Pydantic validation failures retain FastAPI's structured HTTP 422 body.
