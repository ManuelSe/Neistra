# MolWeave Progress

## Current milestone

Milestone 1 - Durable project workspace

Checkpoint 1: backend persistence and command foundation verified.

## Completed work

- Created the project-local `.venv` and installed `uv` inside it. All Python
  commands use `.venv/bin/...`.
- Added the root Python project, locked dependencies, Ruff, mypy, and Pytest
  configuration.
- Added FastAPI project APIs, typed request/response schemas, SQLite SQLAlchemy
  models, and the initial Alembic migration.
- Added durable project creation, details updates, explicit checkpoints,
  uncheckpointed-change recovery, optimistic project revisions, bounded command
  history, undo, and redo.
- Added seeded-fixture command support for rename, duplicate, group, hide/show,
  isolate, lock/unlock, and delete/restore entry operations.
- Added the immutable content-addressed local artifact-store interface with
  atomic publication and managed-root path validation.
- Added structured API errors for stale revisions, missing resources, invalid
  operations, and unavailable history.

## Verification performed

Successful on 2026-07-30:

```bash
.venv/bin/ruff check .
.venv/bin/mypy apps/api packages/molweave_core
.venv/bin/pytest -q tests/unit/test_commands.py tests/unit/test_artifacts.py tests/integration/test_project_lifecycle.py
```

Results:

- Ruff: passed.
- mypy: passed for 11 source files.
- Pytest: 8 passed.
- API restart integration test confirmed uncheckpointed changes survive process
  recreation and become clean after Save.
- Artifact tests confirmed deterministic content addressing and rejection of
  absolute/traversal paths.

## Known limitations

- The React workspace and browser verification are not implemented yet.
- Entry operations are exercised through seeded normalized fixtures, as allowed
  by M1; production file import belongs to M2.
- The API uses short synchronous SQLite transactions inside async route handlers.
  This is appropriate for local M1 workloads and remains behind the project
  service boundary.

## Blockers

None.

## Next action

Build the React desktop workspace with real project create/reopen/save,
undo/redo, dirty/recovery feedback, responsive resizable panels, and persisted
theme/layout state. Then add component and browser tests.

