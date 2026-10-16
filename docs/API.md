# Neistra HTTP API

Status: Neistra HTTP interface; the unchanged server identifies itself as `MolWeave API`.

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
- Project responses declare `schema_version: 2`; normalized structures and selections remain schema 1.
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
| `POST` | `/api/v1/projects/{project_id}/selection-atom-visibility` | Hide or show canonical selected atom detail as one reversible multi-entry command. |
| `POST` | `/api/v1/projects/{project_id}/surfaces` | Atomically create entry-owned surface objects. |
| `PATCH` / `DELETE` | `/api/v1/projects/{project_id}/entries/{entry_id}/surfaces/{surface_id}` | Update or remove one surface object. |
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
| `POST` | `/api/v1/projects/{project_id}/group-membership` | Move an entry batch to an existing group or Ungrouped as one reversible command. |
| `POST` | `/api/v1/projects/{project_id}/selections` | Save a canonical named selection as a reversible command. |
| `DELETE` | `/api/v1/projects/{project_id}/selections/{selection_id}` | Delete a named selection reversibly. |
| `POST` | `/api/v1/projects/{project_id}/measurements` | Create a distance, angle, or dihedral measurement. |
| `PATCH` | `/api/v1/projects/{project_id}/measurements/{measurement_id}` | Rename or show/hide a measurement. |
| `DELETE` | `/api/v1/projects/{project_id}/measurements/{measurement_id}` | Delete a measurement reversibly. |
| `POST` | `/api/v1/projects/{project_id}/scenes` | Save camera, visibility, viewer settings, and selection. |
| `POST` | `/api/v1/projects/{project_id}/scenes/{scene_id}/apply` | Apply scene entry state as one command. |
| `DELETE` | `/api/v1/projects/{project_id}/scenes/{scene_id}` | Delete a named scene reversibly. |

### Group membership

`group-membership` accepts `expected_revision`, a nonempty unique `entry_ids` list,
and `group_id` (an existing same-project group ID, or `null` for Ungrouped).
An optional canonical `selection` captures history context; group creation also
accepts this optional field without changing existing callers. The entire batch,
destination and selection references are validated before writes. Foreign or
missing references reject with structured 422 errors; stale revisions return 409,
including stale requests that otherwise would do nothing.

Only entries changing membership appear in the forward/inverse `entries.group`
actions. An exact no-op returns the current ProjectRead without changing revision,
history, timestamps or the redo branch. Empty groups remain available after moving
or deleting their final member. Locked entries may be reorganized. Membership edits
preserve molecular artifacts, entry timestamps, viewer settings and job provenance;
they emit no molecular patches. Project and affected-entry dirty state are derived
from the existing checkpoint comparison. No new migration or schema is needed.

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

The projection is read-only. Neistra exposes no component rename,
reclassification, individual-style, individual-visibility, ligand-designation,
or subset-export endpoint. `/api/v1` remains the transport prefix; project/archive
schema 2 and Alembic head 0014 cover independent surface objects.

## Selection Contract

Molecular selection uses `SelectionV1`:

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

Viewer settings require `schema_version: 2` on writes. Ordinary representations
may be empty and must have unique IDs.
Supported entry-level styles are `cartoon`, `backbone`, `line`, `stick`,
`thick-stick`, `ball-and-stick`, and `space-filling`. Whole-entry surfaces
are independent objects in `surface_objects`. Color schemes are `element`,
`chain`, `residue`, `secondary-structure`, `structure`, and `custom`; opacity
is in `[0, 1]`. Component and label visibility use explicit booleans.
Selection representation records contain a style and canonical entry-local atom
IDs. Their atomic/polymer geometry uses element coloring and full opacity before
independent selection appearance overrides. Selection surface membership is a
separate contract documented below; it does not replace these channels.

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

### Atomic selection transform

`POST /api/v1/projects/{project_id}/selection-transform` accepts the entire
canonical selection, including atoms in multiple entries:

```json
{
  "expected_revision": 7,
  "selection": {"schema_version": 1, "atoms": [
    {"structure_id": "entry-a", "atom_id": 2},
    {"structure_id": "entry-b", "atom_id": 7}
  ]},
  "rotation_matrix": [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  "translation": [1.5, 0, 0]
}
```

This is an affine world-space transform `x′ = R x + translation`, in angstroms.
The interactive client converts its captured centroid and movement to this offset;
the server does not infer a pivot or extract a target from the inspector's entry.
Require finite orthonormal rotation and determinant +1 (absolute tolerance `1e-10`,
no relative tolerance), rejecting scale, shear and reflection without repair.
Selection references are nonempty, unique and canonically ordered. Validate the
whole batch against current project/artifact/lock state before publication.

One transform applies to requested stable IDs in every conformer and records one
`coordinates.transform` command using existing `entry.coordinates` actions. Return
ProjectRead with affected-entry coordinate patches. Original uploads and unselected
coordinates remain unchanged. Stale revision rejects with 409. Invalid references,
locks or matrix inputs reject without partial publication/project changes.

Movement no greater than `1e-9` angstrom on any coordinate in any conformer is a
no-op: return the unchanged project without artifacts, history, revision/timestamp
changes or redo truncation. This endpoint is additive; the numerical endpoint
below retains its existing identity-transform rejection and Euler convention.
The transform endpoint itself requires no additional migration; see the current
project/viewer/archive schema-2 boundary for independent surfaces.

### Numerical transform and superposition

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

## Selection-driven molecular edits (issue #69)

`POST /api/v1/projects/{project_id}/entries/{entry_id}/selection-edits` is additive;
existing low-level ligand/protein contracts retain their behavior. Send
`expected_revision`, `expected_artifact_id`, a canonical `SelectionV1`, and an
`action` discriminated by `operation`:

- `atom.element`: `element` in C/N/O/S/F/Cl/Br/I, one selected atom. A supported
  terminal H is replaced with a new heavy-atom identity.
- `atom.charge`: `delta` equal to -1 or 1, one selected heavy atom; result must
  remain within -1/0/+1 and pass chemistry validation.
- `atom.delete`: selected heavy atoms within one eligible component.
- `hydrogens.prepare`: complete valence H on the selected eligible component.
- C2 adds `fragment.replace` with `fragment` equal to `methyl`, `ethyl`,
  `hydroxyl`, `amino`, `carboxylic_acid` or `phenyl`, targeting one terminal H.
- C2 adds `bond.create`, `bond.delete`, and `bond.order` (integer `order`1/2/3),
  targeting exactly two selected heavy endpoints. No bond ID is accepted.
- C3 adds `residue.mutate` with `target_name` from the existing 20 standard
  amino-acid names, targeting exactly one complete polymer residue in a protein
  or complex. The service delegates to the existing constrained protein template
  editor; it does not apply small-molecule saturation/protonation to the protein.

The result contains `project`, structured `warnings`, a created/deleted/changed
identity `report`, `replacements` mapping consumed H IDs to new heavy IDs, and
transient `selection_after: SelectionV1`. The latter preserves surviving operand
IDs/maps replacements, or selects the complete new residue after mutation.
Clients apply it only if the captured project/revision/selection still owns the
response. It is not project/checkpoint/archive state or a new selection schema.
Automatic local hydrogen changes form part of the same artifact/history command.
The complete operand selection is retained in the history snapshot. Existing
affected-entry topology patches and deleted-reference reconciliation apply.

The backend verifies one unlocked entry, a current revision/artifact, a connected
prepared closed ligand component and the documented chemistry/geometry limits
before publication. This supports eligible components inside complexes without
sanitizing or changing the surrounding protein. Unknown charges/orders, invalid
valence/geometry, ambiguous boundary/alternate/stereo chemistry, empty/mixed
selection and unsupported operations reject atomically with existing structured
API errors. Aromatic changes, ambiguous E/Z order edits and unsupported generated
geometry reject; local saturation is part of bond/fragment commands. Partial,
mixed or ambiguous residue selection rejects without choosing a default target.
See [editing guidance](MOLECULAR_EDITING.md).

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

## Selection appearance (issue #29)

`POST /api/v1/projects/{project_id}/selection-appearance` accepts
`expected_revision`, canonical `selection`, `property: "color"`, and
`action: "set" | "reset"`. Set requires a six-digit `color` such as `#ff00ff`;
reset omits it. Color set accepts optional `color_mode: "all" | "carbon"`;
omission means all selected atoms. Carbon mode colors selected C and explicitly
restores native element colors on other selected atoms, including a no-C selection.
It does not change atoms outside the selection. Mode is invalid on reset/hydrogen
requests. The public input color remains a hex value, never `"element"`.
One successful action updates all selected entries atomically
and is undoable. Invalid references/parameters return 422 and stale revisions
return 409. Entry viewer-setting requests preserve omitted color assignments
and cannot mutate them directly. Existing representation reset remains separate.

The same endpoint accepts `property: "nonpolar_hydrogens"` with a strict boolean
`show` for `set`, or no value for `reset`. Only explicit H atoms in the selection
are targeted; no-H selections return 422 without a command. Original references
are all validated, including selected heavy atoms. Polarity is evaluated by the
viewer on full projected connectivity, so selecting polar H can store a preference
without changing its visibility. Color and hydrogen values cannot be combined in
one request. Omitted hydrogen assignments in entry settings are also preserved.

## Independent surface objects (issue #57)

`POST /api/v1/projects/{project_id}/surfaces` accepts `expected_revision` and a
nonempty `surfaces` batch. Each item has `entry_id`, optional `name`, `source`,
and optional `appearance` (1–100 definitions/request). All targets are validated before any change; one batch
creates one reversible command. Surface IDs validate/serialize as canonical UUIDs,
including imported entry and scene definitions. Creation always makes distinct UUIDv7 objects,
including repeated creation from the same selection. Maximum: 16 objects/entry.

Sources:

- `{"kind":"entry"}` follows the owner's current topology using native geometry.
- `{"kind":"fragment","profile":"molecular-v1","atom_ids":[1,2]}` captures
  sorted, unique, positive entry-local IDs.
- `{"kind":"pocket","profile":"pocket-v1","radius":5,"seed_atom_references":[{"structure_id":"entry-id","atom_id":1}]}`
  captures canonical sorted seed references across project entries. Hidden seeds
  are valid. Creation/source replacement requires current protein context on the
  owner. Radius is finite, 2–12 Å in 0.5 Å steps.

`PATCH /api/v1/projects/{project_id}/entries/{entry_id}/surfaces/{surface_id}`
accepts `expected_revision` and optional `name`, `visible`, `source`, `appearance`.
Source replacement is explicit and cannot change kind. Appearance is a complete
object: `color_by`, `custom_color`, `opacity`, `mode` (`solid`/`mesh`),
`inherit_atom_colors`. Defaults are element, #3b82f6, 0.45, solid, false.
Supported themes are the existing entry themes. Exact unchanged updates create no
history. `DELETE` on the same route accepts `{"expected_revision":N}` and removes
only that object, including when protein context is unavailable. Hiding/removal
never creates a replacement representation. Stale revisions return 409; invalid
operations return 422 without partial changes.

Viewer settings contain `surface_objects` and no legacy singleton fields. Generic
viewer-settings PUT preserves omitted objects and rejects altered objects. Scenes,
checkpoints, duplication, retained history and archives preserve complete settings.
Topology deletion prunes fragment atoms and all affected live/scene pocket seeds;
empty captured definitions are removed with exact inverse state. New atoms never
join captured sources. UI notices explain affected definitions. Runtime status,
meshes, and transient active-object selection are excluded from persisted state.
API success means a definition was saved, not that rendering succeeded.

**Compatibility:** project/viewer payloads and archive manifests are schema 2;
transport remains `/api/v1`. Legacy singleton endpoints `selection-surface` and
`selection-pocket-surface` return structured 410 migration guidance. Legacy surface
representation writes fail with guidance to the object endpoint. Upgrade old
clients together with the server. Schema-1 archives validate and convert on import;
schema-2 exports require an upgraded reader. Migration 0014 converts every retained
viewer snapshot. Back up both database and artifacts before upgrade. Downgrade
refuses any retained objects or empty ordinary representation sets; restoring the
complete pre-upgrade backup is the supported rollback.

## Selection atom-detail visibility (issue #38)

`POST /api/v1/projects/{project_id}/selection-atom-visibility` accepts:

```json
{
  "expected_revision": 4,
  "selection": {
    "schema_version": 1,
    "atoms": [{"structure_id": "entry-id", "atom_id": 1}],
    "granularity": "atom",
    "source": "viewer"
  },
  "action": "hide"
}
```

`action` is `hide` or `show`; a nonempty canonical SelectionV1 is required.
All references across entries are validated before any mutation. Hide unions the
captured IDs into `ViewerSettings.selection_hidden_atoms`; Show subtracts them.
Unchanged membership returns the current project without a revision/history entry.
Invalid targets/actions are 422; stale revision is 409. There is no surface atom
capacity limit on this display-state command.

Atomic representation Apply reveals its target in the same command; polymer
Backbone/Cartoon Apply preserves hidden membership. Representation Reset clears
its target's atomic/polymer assignments and hidden membership. Other settings,
coordinates, molecular artifacts and original bytes are unaffected. Show retains
prior assignments and remains subject to entry/component/isolation/H visibility.
Generic viewer-settings PUT preserves an omitted mask and rejects a changed mask;
use the dedicated action, representation Apply/Reset, or existing scene/history
operations. This is atomic-detail visibility, not atom deletion or subset export.

# Transient molecular interaction analysis

`POST /api/v1/projects/{project_id}/interactions` is read-only and requires
`{"inputs":[{"entry_id":"…","artifact_id":"…"}],"profile":"interaction-v1","frame":"workspace-cartesian"}`.
Inputs must be unique current normalized artifacts belonging to the project.
Foreign entries return 404; stale inputs 409; invalid requests 422; busy admission
429; resource limits 413; deadline 504. Client disconnect cancels execution.
Response contains input identities, profile/frame, deterministic interaction
records (canonical participants, endpoints, scope, geometry), per-type coverage,
warnings and admitted candidate count. No viewer projection or job worker is
required; no result is persisted. See [Interactions](INTERACTIONS.md).

## Direct molecular edits (issue #74)

`POST /api/v1/projects/{project_id}/entries/{entry_id}/model-edits` edits canonical
normalized records without requiring complete chemistry, one conformer or a closed
ligand component. It requires `expected_revision`, `expected_artifact_id`, one-entry
`selection`, and discriminated `action`. Current actions:

| Operation | Fields / operands |
|---|---|
| `atom.element` | recognized `element`; one atom, identity retained |
| `atom.charge.set` | absolute integer or null `charge`; one atom |
| `atom.delete` | exact selected atoms, including H and last atom |
| `bond.set` | `order`: null,1,1.5,2,3; two distinct atoms in the same entry |
| `bond.delete` | two endpoints; also records removal of native inferred display connectivity |

Optional `hydrogen_policy` defaults to `preserve`; `complete_if_possible` attempts
the existing eligible component helper in memory and saves the direct edit alone
with a warning if completion fails. Explicit H deletion is never reversed.
The result uses the selection-edit response: project, report, warnings,
replacements and selection_after, with one reversible history command. Locks,
stale revisions/artifacts, absent/mixed operands, invalid structural values and
no-ops refuse publication. Incomplete chemistry produces durable warnings.

`neistra_modeling` normalized metadata version1 stores authored endpoint-pair bond
exclusions. Native rendering applies them without assigning inferred chemistry;
adding a canonical bond clears its exclusion, atom deletion prunes references,
and Undo restores metadata exactly. Existing selection-edits and ligand-edits
HTTP semantics remain unchanged. See [molecular editing](MOLECULAR_EDITING.md)
for the implemented workflow, verification and scientific limits.


`POST /api/v1/projects/{project_id}/molecules` creates an entry and first atom in
one command. Supply expected_revision, name, element (default C) and nullable
integer charge (default0). The response adds entry_id to the ordinary edit response.
The first atom starts at the origin; generated provenance and nullable source/
original fields distinguish it from an upload. Undo removes the entry; Redo
restores its identity and artifact.

Additional direct actions:

| Operation | Fields / operands |
|---|---|
| `atom.add` | recognized element, nullable charge (default0), direction0–5; one attachment atom or an explicitly selected empty entry. Optional finite coordinates explicitly position a disconnected atom with empty selection; that point is used in each conformer. |
| `fragment.attach` | one heavy anchor or terminal H to replace; one of the six existing fragment names, direction0–5 and rotation0–5. |

`POST /api/v1/projects/{project_id}/entries/{entry_id}/model-edits/preview` accepts
the same request for placement actions, performs the same structural/ownership
validation and candidate computation, and publishes nothing. It returns captured
revision/artifact, entry_id, atoms with string preview_id/element/coordinates,
coordinate-only bonds, existing removed_atom_ids and warnings. New ghost IDs are
not canonical AtomReferences. Apply sends the captured action to model-edits,
which validates again and recomputes it. Preview does not reserve identities.
Generated coordinates cover all conformers; retained coordinates stay exact.
Optional H merges only new H/bonds from an eligible helper, retaining the direct
candidate exactly when completion is unavailable. Existing legacy HTTP endpoints
retain their behavior; compact and advanced manual atom/bond UI share direct edits.

Draft chemical export remains distinct from the structure viewer projection.
A representational loss requiring acknowledgement returns409 without publishing an
export artifact; retry with the existing acknowledgement field only after reviewing
warnings. Unsupported chemistry/field representation returns a typed422; use a
native project archive rather than repairing canonical records to force export.
Unknown-charge defaults in MOL/SDF/MOL2, unknown-order defaults in MOL/SDF, modeled
MOL2 types and native bond-exclusion loss are explicit. SMILES refuses unknown
charge/order or invalid assigned chemistry. None of these checks gates direct edits.
Modeled MOL/SDF/SMILES also report blocking `implicit_valence_interpretation`:
external readers may interpret absent H through valence defaults even after literal
H deletion. Acknowledgement authorizes that representation, never canonical repair.
