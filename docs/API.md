# MolWeave HTTP API

Status: Milestone 1

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
- Validation errors use HTTP 422. Missing projects or entries use HTTP 404.
- Project responses declare `schema_version: 1`.
- Save advances the checkpoint to the working revision without creating a
  reversible edit command.

## Project Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Verify API and database access. |
| `GET` | `/api/v1/projects` | List project summaries, newest first. |
| `POST` | `/api/v1/projects` | Create a clean project. |
| `GET` | `/api/v1/projects/{project_id}` | Read complete M1 project state and history summary. |
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

Production entry creation is intentionally absent until M2 implements validated
file import and immutable original preservation. When
`MOLWEAVE_ENABLE_TEST_ROUTES=1`, the test harness exposes a fixture-only seed
endpoint under `/api/v1/testing`; normal startup never registers it.

## Errors

Domain failures use stable codes:

| HTTP | Code | Meaning |
|---|---|---|
| 404 | `project_not_found` | The project ID is unknown. |
| 404 | `entry_not_found` | The entry ID is unknown in the project. |
| 409 | `revision_conflict` | `expected_revision` is stale. |
| 409 | `history_unavailable` | The requested undo or redo does not exist. |
| 422 | `invalid_operation` | The command violates a project invariant. |

FastAPI/Pydantic validation failures retain FastAPI's structured HTTP 422 body.
