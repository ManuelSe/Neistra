# MolWeave HTTP API

Status: Milestone 2

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
| `DELETE` | `/api/v1/projects/{project_id}/entries/{entry_id}` | Delete an entry reversibly. |
| `POST` | `/api/v1/projects/{project_id}/groups` | Create a group containing specified entries. |

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
