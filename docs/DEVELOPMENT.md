# Development And Troubleshooting

Status: Neistra development guide; current Alembic head is 0014, project/viewer/
archive schemas are 2, and normalized/selection schemas remain 1. See
[upgrade instructions](#upgrading-independent-surfaces-0014). Earlier issue upgrade
sections are historical; configuration names and process commands are retained.

The private JavaScript packages are `neistra` and `@neistra/web`. Workspace
commands below are unchanged. Python modules, environment variables and data
paths intentionally retain their compatibility names; see [BRANDING](BRANDING.md).
If a custom external script uses a package-name filter, update it to
the web name, for example `corepack pnpm --filter @neistra/web build`.
Run root scripts from the repository root without a package filter.

All commands run from the repository root. Python commands must use the
project-local `.venv`; do not install project packages into the system Python.

## Clean Setup

Required versions are Python 3.12, Node.js 22, Corepack, and Git. Create the
environment and install exactly the locked dependency graph:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install uv
.venv/bin/uv sync --frozen
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install --frozen-lockfile
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright install chromium
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
```

`uv sync --frozen` installs the locked PDBFixer Git commit and scientific
packages. Network access is required only for initial dependency/browser
installation. The default managed state is `.molweave/`; it contains SQLite,
artifacts, job work directories, and worker state and is ignored by Git.

## Local Processes

The normal development startup applies pending database migrations, starts the
API, standalone job worker, and Vite client, waits for the API and web client to
be ready, and supervises their shutdown:

```bash
corepack pnpm dev
```

Open `http://127.0.0.1:5173`. Press Ctrl+C in the startup terminal to stop all
three services. Vite reloads frontend changes; the API deliberately retains the
tested non-reloading startup behavior and must be restarted after Python
changes.

For process-level troubleshooting, run the migration and three long-running
commands manually in separate terminals:

```bash
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
```

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  MOLWEAVE_DATA_DIR=.molweave \
  .venv/bin/uvicorn molweave_api.main:app --host 127.0.0.1 --port 8000
```

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  MOLWEAVE_DATA_DIR=.molweave .venv/bin/python -m molweave_api.worker
```

```bash
corepack pnpm --dir apps/web dev
```

Verify the API independently with:

```bash
curl --fail http://127.0.0.1:8000/api/v1/health
curl --fail http://127.0.0.1:8000/api/v1/jobs/definitions
```

The worker is required only for executing queued jobs. The project, import,
editing, export, and API workflows remain usable when it is stopped; queued
jobs stay queued.

## Validation

The complete release gate is:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
```

Playwright owns `.molweave-e2e/` and starts API port 8010, worker health port
8011, and Vite port 5173. Focus one workflow with, for example:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-journey.spec.ts --project=chromium
```

When those resources are already occupied by an intentionally running local
stack, focused evidence can use isolated values without changing repository or
CI defaults:

```bash
MOLWEAVE_E2E_API_PORT=8110 \
MOLWEAVE_E2E_WORKER_PORT=8111 \
MOLWEAVE_E2E_WEB_PORT=5273 \
MOLWEAVE_E2E_DATA_DIR=.molweave-e2e-isolated \
PLAYWRIGHT_BROWSERS_PATH=.playwright \
  corepack pnpm exec playwright test tests/e2e/polar-hydrogen-visibility.spec.ts
```

The data directory must be disposable and dedicated to that run. Record any
override with the evidence so it is not mistaken for the documented default
release environment. The configuration rejects invalid ports and data paths
containing spaces, shell metacharacters, parent traversal, or the filesystem
root before constructing any service command.

Use `.venv/bin/uv run pytest tests/scientific` for the chemistry/file-format
suite and `corepack pnpm --dir apps/web test -- jobs` for a focused component
run. Do not add `MOLWEAVE_ENABLE_TEST_ROUTES=1` to normal startup.

## Configuration

`MOLWEAVE_DATA_DIR` changes the managed root. `MOLWEAVE_DATABASE_URL` can
replace the default SQLite URL. `MOLWEAVE_API_PORT` and `MOLWEAVE_WEB_PORT`
change the single-command supervisor ports from their defaults of 8000 and
5173; the Vite proxy follows the selected API port unless `VITE_API_TARGET` is
set explicitly. Import/archive byte limits, atom warning/hard limits, worker
polling, plugin allowlist/targets, and optional worker health port are defined
in `apps/api/src/molweave_api/settings.py`. API and worker must use the same data
directory and plugin configuration.

## Troubleshooting

### Migration or database errors

Stop API and worker, confirm both use the same `MOLWEAVE_DATA_DIR`, then rerun
`MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head`. For a
disposable development reset only, remove `.molweave/` and migrate again. Do
not remove a state directory containing projects that must be retained.

### API unavailable in the browser

Check `/api/v1/health`, inspect the Uvicorn terminal, and confirm port 8000 is
free. Vite proxies `/api` and `/ws` to `http://127.0.0.1:8000` by default; set
`VITE_API_TARGET` when using another API address.

### Single-command startup exits

Read the final prefixed service error. The supervisor exits if migration fails,
if a configured port is already occupied, or if any child process stops. Run
the manual commands above when a service needs to be diagnosed independently.
Missing-environment and missing-dependency errors include the exact one-time
setup command to run.

### Jobs remain queued

Start the worker with the same `PYTHONPATH`, data directory, and plugin
allowlist as the API. `/api/v1/jobs/definitions` confirms API discovery. A
registry mismatch fails the claim explicitly instead of running unknown code.

### WebGL unavailable or blank viewer

Enable browser hardware acceleration and WebGL, update the graphics driver,
and reload. Stored molecular data is independent from Mol*. Headless tests use
Chromium SwiftShader flags from `playwright.config.ts`; a nonblank canvas is
asserted by pixel reads.

### Native scientific package installation fails

Confirm Python is exactly 3.12 and rerun the frozen sync on a supported
platform. The lock expects binary-compatible NumPy, SciPy, RDKit, OpenMM,
Gemmi, and the pinned PDBFixer source. Do not silently substitute dependency
versions; those are scientific changes requiring fixture review.

### Playwright cannot bind ports or find Chromium

Stop existing processes on 5173, 8010, and 8011, install the pinned browser with
the command above, and rerun. If pnpm's default store is unavailable, use the
same explicit `--store-dir` on install and subsequent pnpm commands.

### Import or export is rejected

Read the structured error and warnings in the UI/API. Filename extension,
UTF-8 validity, request/file limits, atom limits, malformed chemistry, and
known export losses are enforced. Lossy export requires explicit
acknowledgement; the immutable original remains downloadable.

### Selection appearance migration (0.6.0)

Back up the managed data directory, stop API and worker, then run the normal
`alembic upgrade head` command before starting 0.6.0. Migration 0010 adds empty
appearance collections to live, checkpoint, scene and retained command settings.
It does not rewrite normalized molecular artifacts or uploaded originals.
Supported older projects and archives remain readable; an older application is
not guaranteed to read new appearance data.

Downgrade to 0009 is allowed only when every retained appearance collection is
empty. Undo history or a named/checkpoint scene may retain non-default data after
resetting current display. The migration refuses such a downgrade before writing
changes. Use a pre-upgrade backup to roll back without discarding retained state;
do not manually delete history to bypass the guard.


## Compact selection styling (0.6.1)

This release changes presentation and transient palette state only. Upgrading from
0.6.0 requires no new migration; Alembic head remains 0010. Keep the documented
upgrade command for earlier databases. Application/API/archive version metadata
advances together to 0.6.1; schema major 1 and appearance wire formats are unchanged.
The issue #34 plan records focused and complete release gates and compatibility
checks, including archive application versions 0.5.0 and 0.6.0.

## Selection surface migration (0.7.0)

Back up the managed data directory before upgrading. Migration 0011 adds a null
surface-membership default throughout live entries, checkpoints, scenes and
retained command actions. Run `.venv/bin/uv run alembic upgrade head` against the
intended application data directory. Existing originals and normalized artifacts
are unchanged; older projects/archives remain readable by the new application.

Downgrade to 0010 is allowed only when **every retained surface value is null**.
A removed surface can remain in undo history, checkpoints or scenes, so removal
alone is not a safe downgrade procedure. Refusal leaves stored state unchanged.
After using the feature, restoring the pre-upgrade backup is the reliable rollback;
do not edit SQLite JSON or silently discard history. Older applications are not
guaranteed to preserve newly exported surface settings. Frontend geometry is not
persisted and is rebuilt from stable memberships and current molecular artifacts.


## Atomic-detail visibility migration (0.8.0)

Migration 0012 adds `selection_hidden_atoms: []` to all retained viewer-settings
paths, including nested checkpoint scenes and forward/inverse commands. Upgrade
with the existing `alembic upgrade head` command against the intended data directory,
after retaining a pre-upgrade backup. Original uploads and normalized artifacts
are unchanged; schema majors remain 1.

Downgrade to 0011 is allowed only when **every retained hidden mask is empty**.
Showing all currently hidden atoms is insufficient if history/scenes/checkpoints
can restore a nonempty mask. Refusal prevalidates all locations before writing.
Restore the pre-upgrade backup when needed; do not strip history or edit database
JSON to evade the check. New readers accept older archives with absent masks;
older readers are unsupported for new visibility-bearing archives. Migration tests
cover upgrade, safe downgrade/re-upgrade, every refusal path and metadata invariance.

## Pocket-definition migration (0.9.0)

Migration 0013 adds nullable saved pocket definitions throughout live and retained
viewer state. Upgrade existing databases with `uv run alembic upgrade head` after
backing up the database and artifact directory. A lossless downgrade to 0012 requires
**every** live/checkpoint/scene/forward/inverse pocket field to be null. The migration
checks all locations before modifying any and refuses otherwise. Removing the
visible pocket is insufficient while history retains it; restore a pre-upgrade
backup rather than stripping references. Prior archives load with null pockets;
new pocket-bearing archives require a compatible reader. See PROJECT_SCHEMA and
D-069 for the unchanged current-snapshot archive boundary.

## Structure membership compatibility (0.10.0)

No new migration is introduced; Alembic head remains 0013. The revisioned membership
endpoint is additive. Existing nullable entry group IDs, EntryGroup records and
`entries.group` history actions retain their shape. Current project/normalized/API/
archive schema majors remain 1. Empty groups and membership round-trip through
archives with IDs remapped; archive history remains database-local.

Reverting this feature's controls/endpoint to 0.9.0 needs no data stripping or
schema downgrade. The preceding service understands the retained grouping actions.
Earlier pre-0.9 readers retain their existing pocket/visibility limitations;
organization compatibility does not waive those scientific-state constraints.
Grouping preserves uploaded and normalized bytes and entry modified-date sort keys.
D-072 preserves membership timestamps; D-073 keeps derived dirty flags on response
copies, avoiding ORM writes through reads and checkpoint saves. See GROUPS.md and the issue #9 feature plan for scope,
interaction semantics, evidence and release blockers.

## Viewer toolbar compatibility (0.12.0)

Toolbar access and temporary navigation introduce no API, persisted draft,
scientific transform, history, archive or database changes. Head remains 0013;
contract majors remain 1. Existing atomic selection transforms are reused.
Use the actual v0.11.0 checkout as the preceding reader; repeat qualification
with final v0.12.0 producer metadata before publication. The executable helper
checks exact coordinates/original hashes, retained multi-entry undo/redo,
save/reexport, archive import (history intentionally omitted) and unchanged jobs.

```bash
git worktree add --detach /tmp/neistra-reader-011 v0.11.0
MOLWEAVE_DATA_DIR=/tmp/neistra-toolbar-reader .venv/bin/uv run alembic upgrade head
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  .venv/bin/python -m tests.support.transform_reader_qualification produce \
  --data-dir /tmp/neistra-toolbar-reader --evidence /tmp/neistra-toolbar-producer.json
PYTHONPATH=/tmp/neistra-reader-011/apps/api/src:/tmp/neistra-reader-011/packages/molweave_core/src:/tmp/neistra-reader-011/packages/molweave_demo_plugin/src \
  .venv/bin/python -m tests.support.transform_reader_qualification read \
  --data-dir /tmp/neistra-toolbar-reader --expected-reader 0.11.0 \
  --evidence /tmp/neistra-toolbar-reader.json
git worktree remove /tmp/neistra-reader-011
```

Use fresh disposable directories, never a user's project. Rollback to the
qualified v0.11.0 requires no schema downgrade or data stripping. Historical
qualifications below do not certify readers predating their supported schemas.
Detailed results: [issue #46 plan](plans/issue-46-viewer-transform-toolbar.md).

## Interactive movement compatibility (0.11.0)

The typed selection-transform endpoint is additive. No database migration or
persisted draft is introduced; head remains 0013 and project, normalized, API and
archive majors remain 1. Committed multi-entry movement reuses existing
`coordinates.transform` / `entry.coordinates` forward and inverse actions and
immutable normalized artifacts. Original uploads and submitted job inputs remain
unchanged. Archives capture applied current state, with remapped IDs and no
portable undo history. Format-specific molecular exports retain their existing
precision/loss reporting; previews are never exported.

The previous-release reader qualification uses the actual `v0.10.0` API/core/plugin
checkout in a separate process, with the unchanged pinned scientific dependencies.
It opens the candidate's SQLite/artifact directory, checks exact coordinates and
original hashes, undoes/redoes the retained multi-entry command, saves/re-exports,
and imports the candidate archive. Existing completed jobs remain unchanged.
`tests/support/transform_reader_qualification.py` produces executable evidence;
see the [feature plan](plans/issue-4-interactive-selection-transform.md) for runs
and the version of each producer. Qualification must be repeated after updating
the candidate producer version.

Example from the repository root, using fresh qualification data and a detached
previous-release worktree (never a user's project):

```bash
git worktree add --detach /tmp/neistra-reader-010 v0.10.0
MOLWEAVE_DATA_DIR=/tmp/neistra-movement-reader .venv/bin/uv run alembic upgrade head
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src \
  .venv/bin/python -m tests.support.transform_reader_qualification produce \
  --data-dir /tmp/neistra-movement-reader --evidence /tmp/neistra-producer.json
PYTHONPATH=/tmp/neistra-reader-010/apps/api/src:/tmp/neistra-reader-010/packages/molweave_core/src:/tmp/neistra-reader-010/packages/molweave_demo_plugin/src \
  .venv/bin/python -m tests.support.transform_reader_qualification read \
  --data-dir /tmp/neistra-movement-reader --expected-reader 0.10.0 \
  --evidence /tmp/neistra-reader.json
git worktree remove /tmp/neistra-reader-010
```

Reverting movement controls/endpoint to the qualified 0.10.0 reader requires no
schema downgrade or data stripping. Readers predating pocket/visibility support
retain their existing limitations; this check does not waive them. Restore a
pre-upgrade backup when downgrading those earlier schema features rather than
stripping retained history or scientific settings.


## Compact transformation correction compatibility (0.12.1)

This patch changes presentation and transient focus restoration, including an
existing group-action return-focus race. No scientific algorithm, API, archive or
database change; head remains0013 and schema majors 1. All five version sources
advance together without dependency updates. Run the complete release gate above
on the clean candidate and exact merged master before tagging.

Qualify the actual tagged v0.12.0 reader with the existing two-process helper, using
a fresh disposable data directory and a detached reference checkout. Replace the
prior example's reader path/tag with `/tmp/neistra-reader-012` /`v0.12.0` and use
`--expected-reader 0.12.0`. The 0.12.1 producer must be final before qualification.
Check exact coordinates/originals, retained batch undo/redo, save/reexport, archive
import without portable history and unchanged completed jobs. Rollback to that
qualified 0.12.0 needs no data stripping or schema downgrade; earlier migration
restrictions still apply. See the [correction plan](plans/issue-46-compact-transform-controls.md).

## Molecular interaction qualification

Contract: [issue #49 plan](plans/issue-49-molecular-interactions.md). Focused core/API
checks include `tests/unit/test_interactions.py`, `tests/scientific/test_interactions.py`
and `tests/integration/test_interactions.py`; frontend ownership tests are
`src/test/interactions.test.ts`. Browser specs `interactions.spec.ts` and
`interactions-lifecycle.spec.ts` inspect actual batched native geometry, H-bond pixels,
cache/request behavior, immutable artifacts and project/scene/preview lifecycles.
The existing `rebranding-zoom.spec.ts` supplies real browser zoom qualification.

When an existing development server occupies default ports, set
`MOLWEAVE_E2E_WEB_PORT=5183`, `MOLWEAVE_E2E_API_PORT=8020`,
`MOLWEAVE_E2E_WORKER_PORT=8021` and a disposable absolute
`MOLWEAVE_E2E_DATA_DIR` alongside the documented Playwright command. Run timing
without a profiler or concurrent build. Keep diagnostic failures separate from
passing evidence. Final0.13.0 candidate and exact mergedbf29b9a have passed the
complete release gate and actual tagged0.12.1 reader qualification; [recorded
evidence](assets/molecular-interactions/c5-merged-gate.json). Future releases must
repeat those gates against their final producer. No migration or
state stripping is needed for rollback to qualified v0.12.1; transient choices reset.

## Interaction correction compatibility (0.13.1)

Issue#55 repairs native buffers/current group counts and marker/toolbar presentation,
with independently qualified existing chemistry. It adds no API, database, archive
or normalized-state field. Head remains0013 and schema majors1; dependencies are
unchanged. All five versions advance together to0.13.1. Run the complete release
gate on the clean candidate and exact merged master.

Use the existing two-process `tests.support.transform_reader_qualification` helper
with final0.13.1 producer metadata and an actual detached `v0.13.0` checkout at
`/tmp/neistra-issue55-reader-013`, passing `--expected-reader 0.13.0`. Dedicated
fresh data verifies exact coordinates/originals, retained Undo/Redo, save/re-export,
archive import without portable history and unchanged completed jobs. Qualified
rollback needs no downgrade/data stripping, but restores the old rendering defect.
Earlier migration guards still apply. [Contract](plans/issue-55-interaction-corrections.md).
Restart services and reload the workspace on upgrade/rollback to reset transient
interaction caches. Rollback restores both the native renderer defect and the
old contradictory-acid assignment limitation. Persisted compatibility is unchanged.

## Notification timeout compatibility (0.13.2)

Routine application notices expire after ten seconds; errors, warning-bearing
summaries, and action-required movement guidance remain visible. Focused notices
wait for keyboard focus departure. Existing detailed warning/status displays retain
their lifecycles. No new migration or persisted preference is introduced; head 0013
and project/normalized/archive majors 1 remain. Update all five version sources
without dependency upgrades and run the complete candidate and exact merged gates.

Use `tests.support.transform_reader_qualification` with final 0.13.2 producer
metadata and an actual detached v0.13.1 checkout (`--expected-reader 0.13.1`),
with fresh disposable data. Check exact originals/coordinates, retained Undo/Redo,
save/re-export, current-state archive import, and completed jobs. Existing exhaustive
archive tests also cover preceding producer provenance. Qualified rollback needs
no downgrade/data stripping; reload the frontend to restore the old notice lifetime.
The [approved plan](plans/issue-56-viewer-notification-timeout.md) and its evidence
log govern release blockers and verification.


## Upgrading independent surfaces (0014)

Stop API and worker processes before upgrading. Back up the complete managed data
directory, including SQLite and artifacts, before `alembic upgrade head`. Migration
0014 converts live settings, saved checkpoints/scenes, and retained forward/inverse
history to project/viewer schema 2 without rewriting molecular files. Keep client
and API deployments together: `/api/v1` remains, but schema-1 viewer writes and
obsolete singleton surface endpoints are no longer writable contracts.

Schema-1 archives remain importable after strict validation and conversion. New
exports use manifest schema 2 and require an upgraded reader. Keep pre-upgrade
archives/backups when older readers must remain usable. Downgrade prevalidates all
retained snapshots and refuses any surface objects or empty ordinary representation
sets; removing live objects does not erase historical ones. Restore the complete
pre-upgrade backup to roll back safely. Do not delete history or edit database JSON
to bypass refusal. Actual tagged v0.13.2 producer/reader qualification is recorded
in the issue #57 feature plan before release.


## Compact navigation compatibility (0.15.0)

This minor release adds compact entries and independent virtual component browsing.
Restart services and reload the workspace on upgrade/rollback to reset transient
browsing state. No new migration is needed from0.14.0: head0014, project/viewer/
archive2 and normalized/selection1 remain. Only split/collapse preferences persist;
older clients ignore additive browser preferences. Molecular state and originals
are unchanged. Rollback to qualified0.14.0 needs no downgrade/data stripping and
restores its previous browser layout. Earlier0014 downgrade guards remain in force.

Run the complete candidate and exact merged-master release gates above. With fresh
disposable data, run `tests.support.navigation_reader_qualification produce` from
the final0.15.0 checkout, then `read --expected-reader 0.14.0 --reader-root <tagged-tree>`
with actual detached v0.14.0 API/core/plugin paths first on PYTHONPATH. The harness
asserts the implementation paths, original bytes/coordinates, retained Undo/Redo,
completed jobs, exact scenes/three surfaces, save/reexport, archive history omission
and cross-entry pocket seed remapping. Provenance-string archive tests are
additional coverage, not evidence of an actual old reader.

See [approved contract](plans/issue-59-compact-project-navigation.md),
[user guidance](PROJECT_NAVIGATION.md), [accessibility](ACCESSIBILITY.md) and
[performance](PERFORMANCE.md) for qualified layouts, keyboard semantics and limits.


## Selection editing compatibility (0.16.0)

Upgrade client and API together to use the additive selection-edit endpoint and
compact controls. No new migration is required: head0014 and project/viewer/archive
schemas2, normalized/selection1 remain unchanged. Preserve a full managed-data
backup (database, artifacts and worker state) before changing application versions.

Edits use ordinary immutable artifacts, monotonic IDs and existing generic
molecular-history actions. Originals and completed jobs remain unchanged. The
actual taggedv0.15.0 reader passes both final0.16.0 candidate and exact released
master qualification; see [release evidence](assets/molecular-editing/c5-merged-gate.json).
Runtime rollback to that qualified reader removes the new controls/route but retains edited structures and
old generic Undo/Redo/archive operations, without a schema downgrade or stripping
history. Existing0014 downgrade guards still apply for earlier schema readers.
Do not run incompatible client/server versions concurrently against one data store.

Scientific eligibility, initial H preparation, fixed geometry/stereo limits and
explicit retry after an artifact read failure are documented in
[MOLECULAR_EDITING](MOLECULAR_EDITING.md). A successful edit is already stored even
if subsequent rendering/refetch fails; retry the read rather than repeating the
mutation blindly. Release evidence and publication state live in the
[feature plan](plans/issue-69-compact-molecular-editor.md).

## Direct molecular modeling compatibility (issue #74)

Direct normalized-record editing adds no migration: Alembic head0014,
project/viewer/archive2 and normalized/selection1 remain. Existing helper HTTP
semantics persist; new direct endpoints and version1 `neistra_modeling` metadata
are additive. Generated entries have nullable original/source fields; empty entries
remain editable and archiveable. Native archives retain unknown chemistry and
explicit native bond exclusions. Chemical exports may require loss acknowledgement
or refuse an unrepresentable draft; never alter canonical state to force export.

Run `tests.support.modeling_reader_qualification produce` with candidate API/core/
plugin paths and fresh migrated data, then `read --expected-reader 0.16.0
--reader-root <detached-v0.16.0-checkout>` with that checkout's paths on PYTHONPATH.
The harness verifies implementation module locations and actual producer versions.
It qualifies rich existing jobs/scenes/surfaces/originals, direct generic Undo/Redo,
unknowns/exclusions, generated empty archives/re-export and multiconformer/alternate
sites. It separately asserts expected old aromatic-renderer/helper refusals.
Repeat with the final version on both clean candidate and exact merged master.
Back up complete managed data before rollback; data retention does not certify
old rendering, the new UI or helper eligibility. No automatic stripping/repair.

D-104 additionally qualifies monotonic IDs after undoing and redoing entry creation.
Retained generic entry.create snapshots carry higher allocator floors in the same
transaction; current direct/legacy editors consult bounded historical evidence.
The old reader retains these produced floors, but its future authoring does not
implement the new propagation. Continue modeling with the current client/server.
Previously reused historical identities cannot be retroactively disentangled.
