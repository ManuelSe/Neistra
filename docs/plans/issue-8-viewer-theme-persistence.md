# Issue 8 - Viewer Theme Persistence

Status: implementation in progress; checkpoint 2 complete

## Issue metadata

- Issue: [#8 - Mol* viewer should preserve the active light or dark theme](https://github.com/ManuelSe/MolWeave/issues/8)
- Issue state when planned: open
- Issue author: `ManuelSe`
- Issue created: 2026-08-04
- Plan approved: 2026-08-05
- Base branch: `master`
- Base commit at approval: `9c60bbad506e30ca2bb6564296090b80b41d8354`
- Planned feature branch: `fix/issue-8-viewer-theme-persistence`
- Planned application version: `0.1.1`
- Planned tag: `v0.1.1`

This document is the implementation contract for issue #8. It supplements, but
does not replace, the global `docs/PLAN.md`.

## Core problem and approved outcome

MolWeave already persists one local light/dark workspace preference and projects
it into the typed molecular-viewer boundary. Live theme changes work, but a Mol*
Canvas3D created while dark mode is already active can still initialize with
Mol*'s light default. Viewer remounts therefore expose a mismatch between the
surrounding application and the WebGL canvas.

The approved outcome is a lifecycle-safe projection of the active MolWeave
theme into every Mol* instance. The first Canvas3D frame, lazy initialization,
structure loading and replacement, responsive remounts, project restoration in
a new tab, and explicit live theme changes must all retain the active theme.
Theme synchronization must remain transient appearance state and must not
change molecular data, viewer settings, selections, camera state, project
revision, archives, or history.

## Authority and assumptions

The plan applies the following authority order:

1. User guidance approving this plan and any later corrections.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing application/viewer ownership boundaries and repository conventions.
4. Issue #8's underlying consistency problem and explicit non-goals.
5. Any implementation suggestion inferred from the issue.

Accepted decisions D-013, D-017, D-022, D-023, D-038, and especially D-041
remain authoritative:

- Zustand owns the persisted local theme preference.
- Project and normalized molecular state remain independent from Mol*.
- Mol* remains a disposable renderer behind `MolecularViewer`.
- Theme is not project, scene, archive, command-history, or molecular state.
- A live theme change must update the renderer in place rather than reload its
  structures or reset application-owned state.

Planning assumptions:

- "Open a project in a new tab" means opening another MolWeave page in the same
  browser profile and restoring the existing persisted active-project pointer.
  It does not require a new URL-routing or open-in-new-tab product feature.
- The issue's examples describe lifecycle triggers, not separate theming
  implementations for imports, edits, responsive layout, and navigation.
- Light and dark background colors remain the existing `#eef2f1` and `#11191b`.
- The complete action-by-theme Cartesian product is unnecessary. Tests will
  cover both themes and every distinct lifecycle boundary with representative
  operations.

## Repository findings

The persisted workspace store already retains `theme` under
`molweave-workspace-v1`. `App` applies it to the document and passes it through
`WorkspaceCanvas` to `StructureViewer`. `StructureViewer` sets the requested
background before mounting the lazy viewer and forwards later theme changes.
The lazy wrapper also buffers the color until its Mol* engine exists.

The remaining defect is at the concrete engine initialization boundary.
`MolstarEngine.mount` currently tries to set the color from Mol*'s
`onBeforeUIRender` callback. Mol* calls that callback before rendering its React
container and before Canvas3D exists, so `plugin.canvas3d?.setProps(...)` is a
no-op. Canvas3D is then created with Mol*'s light default. A later explicit
theme toggle succeeds because Canvas3D exists by then.

Existing component and adapter tests use fakes and establish pre-mount
forwarding plus in-place live updates. The current real-WebGL test starts in
light mode and toggles only after mounting, so it does not cover initial dark
initialization, responsive recreation, or new-tab restoration. Mol*'s
`plugin.clear()` is called without viewport reset, so ordinary scene clearing
should not independently reset the renderer; real browser tests will protect
that assumption across load and topology-replacement paths.

Remote inspection at approval found:

- `master` was the only remote branch and matched the local base commit.
- There were no pull requests, tags, GitHub releases, GitHub Actions workflows,
  branch protections, required checks, or established pull-request convention.
- GitHub allowed squash, merge-commit, and rebase merges; automatic branch
  deletion and auto-merge were disabled.
- The repository nevertheless contains completed v0.1 code and authoritative
  `0.1.0` version sources.

Related issues #3 through #7 concern viewer controls, selection/camera behavior,
interactive transforms, and selection-based styling. Issue #9 concerns project
group membership. None is part of this fix.

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment |
|---|---|---|
| Use the active theme when Mol* first initializes | Essential | Configure the renderer at the actual Canvas3D initialization boundary. |
| Keep dark mode dark and light mode light | Essential | Verify initial and live behavior in both modes. |
| Loading or adding structures must not reset the theme | Essential | Exercise initial import and an additional visible structure load. |
| Replacing or modifying a structure must not reset the theme | Essential | Exercise a real topology-changing ligand edit and Mol* projection rebuild. |
| Responsive viewport changes must not reset the theme | Essential | Cross the desktop/compact breakpoint and verify the recreated real-WebGL canvas. |
| Opening another tab must initialize from the persisted theme | Essential | Open a second page in the same browser context and verify restored project and canvas appearance. |
| Recreating or remounting the viewer must retain the theme | Essential | Ensure every new viewer receives current application appearance before its first render. |
| Only explicit MolWeave theme changes may change viewer appearance | Essential | Keep a single application-to-viewer projection path; do not add operation-specific mutations. |
| An explicit theme change updates the existing viewer | Already satisfied | Retain and strengthen the in-place update test. |
| Theme changes must not reload/resynchronize structures | Already satisfied, regression-protected | Retain the component assertion and add browser request/state evidence. |
| Persist the local theme preference | Already satisfied | Keep the existing Zustand key and storage boundary. |
| Application and viewer must not display conflicting themes | Supporting | Compare document theme and WebGL background luminance after lifecycle transitions. |
| Preserve structures, representations, selection, camera, and project data | Essential invariant | Assert theme-only actions do not change loaded counts, project revision, artifacts, settings, or selection; retain the in-place renderer setter. |
| Redesign either theme | Rejected as proposed / explicit non-goal | No visual redesign and no follow-up issue unless separately requested. |
| Add custom, automatic, system, or per-project themes | Rejected as proposed / outside issue | Keep the existing two local themes. |
| Store the theme in project state, scenes, archives, API records, or Mol* snapshots | Rejected | Conflicts with accepted ownership decisions. |
| Add separate theme repair hooks to imports, edits, navigation, and responsive layout | Rejected as proposed | Fix the shared viewer lifecycle boundary once. |

No essential issue requirement is deferred. No follow-up issue is planned. If
implementation uncovers a distinct loss of transient camera state caused by
responsive remounting, that behavior will be reported separately rather than
expanding issue #8 beyond theme synchronization.

## Accepted scope

- Correct initial Mol* Canvas3D background configuration.
- Retain lazy pre-mount theme buffering and live in-place updates.
- Add focused fake-viewer regression coverage where it strengthens lifecycle
  ordering without duplicating existing tests.
- Add a real-WebGL issue workflow covering initial theme, load, replacement,
  responsive remount, new-tab restoration, and explicit switching.
- Demonstrate that theme-only changes do not mutate or reload project/viewer
  state.
- Preserve archive compatibility while advancing the application patch version.
- Update issue-specific evidence, project progress, the decision log where
  necessary, and authoritative version sources.

## Non-goals

- Theme redesign, additional palettes, user-defined colors, or system-theme
  detection.
- Per-project themes or persistence in project schemas, archives, scenes, or
  command history.
- Responsive workspace redesign or elimination of the existing compact-layout
  remount.
- New project routing or an explicit "open in new tab" command.
- Camera, selection, representation, or molecular-state feature work.
- Any feature from related issues #3 through #7 or #9.
- Backend molecular, chemistry, job, database, or migration changes.

## Milestones and checkpoints

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Store this approved implementation contract before application code changes.

Affected areas:

- `docs/plans/issue-8-viewer-theme-persistence.md`

Acceptance criteria:

- Status is approved and implementation is explicitly not started.
- Issue metadata, base and feature branches, requirement dispositions, scope,
  checkpoints, implications, evidence, release plan, and logs are present.
- No application, test, version, schema, or migration file is changed.

Focused validation:

```bash
git diff --check
git status --short
```

Documentation and migration implications:

- Creates the detailed issue-specific source of truth.
- Does not replace `docs/PLAN.md`.
- No migration.

Expected commit:

```text
docs(plan): add approved plan for issue 8
```

Rollback and compatibility:

- Revert the plan commit. There is no runtime, data, or compatibility effect.

### Checkpoint 1 - Correct viewer initialization

Concrete outcome:

- Initial dark and light colors reach Canvas3D before its first actual render,
  while live theme changes remain in-place renderer updates.

Affected areas:

- `apps/web/src/viewer/MolstarEngine.ts`
- `apps/web/src/viewer/MolstarViewer.ts`, only if lifecycle buffering needs a
  focused adjustment
- `apps/web/src/components/StructureViewer.tsx`, only if initial/live projection
  ordering needs a focused adjustment
- `apps/web/src/test/viewer-adapter.test.ts`
- `apps/web/src/test/structure-loading.test.tsx`
- A small typed viewer-theme helper only if it removes duplicated tokens without
  broad styling refactoring

Implementation constraints:

- Supply initial opaque renderer properties through Mol*'s Canvas3D
  initialization specification, where Mol* consumes them while creating the
  canvas.
- Retain `setBackgroundColor` for post-mount changes.
- Do not add per-import, per-edit, per-navigation, or per-responsive-action
  theme handlers.
- Do not remount Mol*, rebuild structures, or update durable state on a theme
  change.
- Preserve existing WebGL failure handling and lazy loading.

Acceptance criteria:

- Both initial colors survive lazy viewer and engine construction.
- Dark initialization does not fall back to Mol*'s light default.
- Live light/dark changes update the existing Canvas3D renderer.
- Live theme changes do not remount the viewer or resynchronize structures.
- Structure synchronization and topology rebuild retain the engine's requested
  background.
- Viewer startup failure remains visible and safe.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- structure-loading viewer-adapter
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
```

Documentation and migration implications:

- Reference D-041; do not add a new theme architecture decision unless the
  implementation materially deviates from it.
- No API, data, schema, or migration change.

Expected commit:

```text
fix(viewer): preserve theme across viewer initialization
```

Rollback and compatibility:

- Frontend-only behavior correction. Reverting restores the known dark-mode
  initialization regression without changing persisted data.

### Checkpoint 2 - Add real lifecycle regression evidence

Concrete outcome:

- Protect issue #8's complete user-visible workflow with a dedicated real-WebGL
  browser test.

Affected areas:

- Prefer a dedicated `tests/e2e/viewer-theme.spec.ts`.
- Add a shared E2E helper only when it reduces duplication without coupling
  unrelated workflows.

Acceptance criteria:

The desktop Chromium workflow must:

1. Persist dark mode before a molecular viewer exists.
2. Open or import a structure and observe a dark initial WebGL background.
3. Load an additional structure and remain dark.
4. Perform a topology-changing ligand edit and remain dark after projection
   replacement.
5. Cross the 840 px desktop/compact breakpoint and remain dark after remount.
6. Open a second page in the same browser context and initialize its restored
   project viewer in dark mode.
7. Switch to light mode and update the existing canvas in place.
8. Remount or reload in light mode and remain light.
9. Keep the document theme and WebGL luminance consistent after every
   lifecycle transition.
10. Prove theme-only actions do not advance project revision, change current
    artifact IDs or viewer settings, clear the canonical selection, or change
    loaded-structure counts.

The test may distribute lifecycle boundaries across light and dark states. It
does not need to repeat every action in both modes when the shared initialization
and setter paths are already directly covered.

Focused validation:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-theme.spec.ts --project=chromium

PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-controls.spec.ts --project=chromium
```

Documentation and migration implications:

- Add planned/passing evidence to this plan and later to
  `docs/VERIFICATION.md`.
- No migration.

Expected commit:

```text
test(e2e): cover viewer theme lifecycle
```

Rollback and compatibility:

- Test-only rollback removes regression protection but does not change runtime
  behavior.

### Checkpoint 3 - Preserve cross-patch archive compatibility

Concrete outcome:

- Advancing the application version must not make valid archives produced by
  MolWeave 0.1.0 unreadable.

Affected areas:

- `apps/api/src/molweave_api/archive_service.py`
- `tests/integration/test_archive_roundtrip.py`
- `tests/security/test_archive_safety.py`
- `docs/PROJECT_SCHEMA.md`
- `docs/DECISIONS.md`

Implementation constraints:

- Keep `ProjectManifestV1.schema_version` at `1`.
- Treat `application_version` as validated provenance rather than requiring it
  to equal the current producer's exact patch version.
- Retain strict validation for malformed version data and unknown archive schema
  versions.
- Add explicit evidence that a valid 0.1.0 archive imports under 0.1.1.
- Do not alter archived molecular bytes, normalized schema, relationships, or
  remapping behavior.

Acceptance criteria:

- New archives identify application version 0.1.1 after the release bump.
- Valid 0.1.0 archives remain importable without data loss or migration.
- Unsupported archive schema versions remain rejected.
- Malformed application-version values remain rejected.
- The archive schema version and all persisted molecular/project schemas remain
  unchanged.

Focused validation:

```bash
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync ruff check .
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync mypy apps/api packages/molweave_core
UV_CACHE_DIR=/tmp/uv-cache .venv/bin/uv run --no-sync pytest \
  tests/integration/test_archive_roundtrip.py \
  tests/security/test_archive_safety.py
```

Documentation and migration implications:

- Append an accepted decision stating that archive schema version determines
  structural compatibility while application version records provenance.
- Update `docs/PROJECT_SCHEMA.md` to match the executable manifest contract.
- No database or archive migration.

Expected commit:

```text
fix(archive): preserve cross-patch archive compatibility
```

Rollback and compatibility:

- Safe before producing 0.1.1 archives. After release, rollback would make
  those archives fail exact-version validation and is therefore discouraged.

### Checkpoint 4 - Qualify the 0.1.1 release

Concrete outcome:

- Align authoritative version sources, complete project records, pass the full
  release gate, and leave a reviewable pull request ready to merge.

Affected areas:

- `pyproject.toml`
- Generated `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `docs/PROGRESS.md`
- `docs/VERIFICATION.md`
- This plan's progress and completion log

Authoritative version changes:

- Python project/application version: `0.1.1`.
- Generated lock entry for `molweave-dev`: `0.1.1`.
- Web package version: `0.1.1`.
- FastAPI/OpenAPI application version: `0.1.1`.
- Archive producer application version: `0.1.1`.

Versions explicitly not changed:

- `/api/v1`.
- `ProjectStateV1`.
- `ProjectManifestV1.schema_version`.
- `NormalizedStructureV1`.
- Alembic head `0007`.
- Demonstration plugin implementation version `1.0.0`.

Acceptance criteria:

- Every authoritative application version reports 0.1.1.
- Lock files are generated from authoritative manifests, not hand-edited into
  inconsistency.
- `docs/PROGRESS.md` records the current issue milestone, completed work,
  verification, limitations, blockers, and next action.
- `docs/VERIFICATION.md` records issue #8 evidence without rewriting the v0.1
  requirement matrix.
- The feature plan completion log contains actual commit IDs and command
  results.
- The complete release gate passes on the final PR state.

Complete release gate:

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
git diff --check
```

Documentation and migration implications:

- Update the issue plan, project progress, verification evidence, project
  schema notes, and decision log as described above.
- No Alembic or molecular/project schema migration.

Expected commit:

```text
chore(release): prepare 0.1.1
```

Do not create an empty verification commit. If final verification discovers a
necessary repair, make the smallest conventional checkpoint commit and rerun
the affected focused gate plus the complete gate.

Rollback and compatibility:

- The theme fix can be reverted without persisted-data changes.
- Do not publish or retag a partially reverted 0.1.1 build.
- Existing 0.1.0 archives must remain importable after release.

## Acceptance and verification evidence

| Requirement | Planned evidence |
|---|---|
| Initial dark/light renderer color | Component/adapter lifecycle assertions plus real Canvas3D pixel luminance in `viewer-theme.spec.ts` |
| Live explicit theme switching | Existing strengthened `structure-loading` and viewer-adapter tests plus real-WebGL transition |
| No remount or structure resynchronization for a theme change | Fake-viewer mount/sync counters and normalized-structure request assertions |
| Structure loading retention | Real second-import/load transition in `viewer-theme.spec.ts` |
| Structure modification/replacement retention | Real topology-changing ligand edit and post-rebuild pixel assertion |
| Responsive retention | Desktop-to-compact and compact-to-desktop viewport transition |
| New-tab restoration | Second Playwright page sharing the persisted workspace origin |
| Application/viewer consistency | Document `data-theme` paired with corner-background WebGL luminance |
| Project/molecular invariance | Before/after API revision, artifact, viewer-settings, selection, and loaded-count assertions |
| Archive compatibility | 0.1.0 manifest import test plus existing round-trip and archive-safety suites |
| No broader regression | Complete documented release gate |

Passing evidence must be recorded with exact commands and results in this
plan's progress log and summarized in `docs/PROGRESS.md`. Planned evidence must
not be described as passing until it has run successfully.

## Implications

### Data and migrations

- No SQLite, Alembic, project-state, normalized-molecular, selection,
  measurement, scene, or job migration.
- No project revision or history action for a theme change.
- Browser storage key and shape remain unchanged.

### Archive compatibility

- Archive schema remains version 1.
- Application version remains provenance and advances to 0.1.1.
- Valid 0.1.0 archives must remain readable.

### API

- No endpoint, request, response, or `/api/v1` compatibility change.
- Only FastAPI/OpenAPI application metadata advances to 0.1.1.

### UI and viewer

- No new control or visual redesign.
- The current theme is projected into the Canvas3D initialization props and
  live renderer props.
- Theme-only updates remain constant-time and must not rebuild the scene.

### Scientific behavior

- No parsing, chemistry, validation, coordinates, topology, inference,
  representation semantics, warnings, or provenance changes.
- Original molecular uploads and normalized artifacts remain untouched.

### Accessibility

- No new interaction or focus surface.
- Existing theme contrast and desktop/mobile accessibility checks remain part
  of the release gate.

### Performance

- Initial renderer configuration is constant-size state.
- Live changes remain one Canvas3D property update.
- No complete-structure serialization, network refetch, or viewer scene rebuild
  is permitted for a theme-only change.

### Security

- No new user input, storage location, path, plugin, command, or remote access
  surface.

## Decisions and deviations

- D-041 remains the governing theme decision. The implementation corrects its
  lifecycle placement rather than replacing its design.
- A new accepted decision will be appended only for the material archive
  compatibility rule: archive schema version controls structural compatibility;
  application patch version is provenance.
- The issue's separate examples are consolidated into the shared viewer
  lifecycle boundary. No operation-specific theme hooks are approved.
- The new-tab outcome uses existing persisted workspace behavior; new routing
  is not approved.
- Browser verification uses a representative lifecycle matrix rather than
  repeating every action in both themes. Both initialization and live paths for
  both colors remain directly covered.

Any implementation deviation that reduces an essential requirement, changes
state ownership, changes a persisted schema, or changes release compatibility
requires plan amendment and renewed approval before proceeding.

## Version and release plan

### SemVer determination

This work is a patch release: `0.1.0` to `0.1.1`.

Rationale:

- It corrects existing documented light/dark behavior.
- It adds no user-facing feature and removes none.
- It makes no incompatible API, database, project, archive-schema, or molecular
  schema change.
- It explicitly retains 0.1.0 archive compatibility.
- A minor or major increment would overstate the compatibility impact.
- A prerelease is unnecessary after the focused and complete release gates pass.

The repository has no prior tag or GitHub release, but the code and docs already
declare v0.1/0.1.0 complete. `v0.1.1` is therefore an honest first GitHub tag
for the patch over that declared baseline; the absence of a `v0.1.0` tag does
not convert this bug fix into a minor or major release.

### Pull request

- Title: `fix(viewer): preserve active theme across viewer lifecycle`
- Base: `master`
- Head: `fix/issue-8-viewer-theme-persistence`
- Body: document implemented, simplified, deferred, and rejected requirements;
  include verification results, compatibility, migration status, version
  impact, and `Fixes #8`.
- Merge strategy: rebase-and-merge after approval and all gates.

Rebase-and-merge preserves the coherent Conventional Commit checkpoints and
matches the repository's linear history. No existing PR convention overrides
that choice. Branch protection and required status checks were absent when the
plan was approved, so the documented local complete gate is an explicit merge
blocker rather than an optional substitute for CI.

### Issue handling

- Use `Fixes #8` so the issue closes only when the PR merges.
- Publish a final issue reply after the release is remotely verified.
- The reply must state the root cause, implemented lifecycle behavior,
  verification, version/tag, compatibility, and any genuine remaining work.
- No follow-up issue is planned for the accepted scope.
- If a distinct camera/remount defect is discovered, open a focused follow-up
  instead of silently adding it to issue #8.

### Tag and GitHub release

- Proposed annotated tag: `v0.1.1`.
- Create the tag only from the verified merged commit on `master`.
- Push and verify the tag before creating the GitHub release.
- Never reuse or move an existing release tag.

Release-note sections:

1. Highlights
2. Fixed
3. Verification
4. Compatibility and migrations
5. Known limitations
6. Deferred and follow-up work

### Branch cleanup

- Delete the remote feature branch only after the PR merge, annotated tag, and
  GitHub release are verified.
- Delete the local feature branch only after local `master` is fast-forwarded
  to the verified remote merged commit.
- Do not rely on automatic branch deletion; it is disabled remotely.

## Merge and release blockers

Merge is blocked when any of the following is true:

- The feature plan or implementation scope is not approved.
- Any focused or complete validation command fails.
- Initial dark mode is not verified against a real Canvas3D.
- New-tab, responsive-remount, structure-load, or topology-replacement coverage
  fails.
- Theme-only actions trigger viewer remount, structure synchronization,
  normalized-structure refetch, project revision changes, artifact changes,
  representation changes, or selection loss.
- A valid 0.1.0 archive cannot be imported.
- Archive, API, project, or molecular compatibility changes beyond this plan.
- Authoritative version sources disagree.
- `git diff --check` reports errors.
- The complete diff contains consequential unresolved review findings.
- Required review conversations or checks, if configured before merge, remain
  unresolved.
- Documentation claims evidence that has not actually passed.

Release is additionally blocked when:

- The pull request is not verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The final release gate did not pass on the PR's final state.
- `v0.1.1` already exists or points to another commit.
- Any version source differs from 0.1.1.
- The annotated tag cannot be pushed or verified remotely.
- The GitHub release cannot be verified against the tag and merged commit.

## Progress and completion log

| Date | Status | Evidence / notes |
|---|---|---|
| 2026-08-05 | Plan proposed | Read-only repository, architecture, test, release, and GitHub inspection completed. Root cause localized to pre-Canvas3D background application. |
| 2026-08-05 | Plan approved | User approved the plan and authorized committing the pending `AGENTS.md` issue-delivery workflow. |
| 2026-08-05 | Branch prepared | Local `master` matched `origin/master` at `9c60bbad506e30ca2bb6564296090b80b41d8354`; the approved feature branch was created from a clean tree. |
| 2026-08-05 | Plan persisted | Commit `6119dc3` added this approved plan as the first branch change. |
| 2026-08-05 | Repository workflow persisted | Commit `3bce619` added the approved issue-delivery instructions to `AGENTS.md`. |
| 2026-08-05 | Checkpoint 1 complete | Canvas3D initialization now receives the active opaque color in its creation spec and reapplies the latest buffered color after mount. All 45 Vitest tests, ESLint, TypeScript, and the production build passed; the existing Mol* chunk-size warning remains non-blocking. |
| 2026-08-05 | Checkpoint 2 complete | Added `tests/e2e/viewer-theme.spec.ts`. The real Chromium Canvas3D stayed dark through first and second imports, a ligand topology replacement, the 840 px responsive remount, and same-context second-page restoration; a live switch updated the existing canvas to light without project, artifact, viewer-setting, selection, loaded-count, or normalized-request changes, and a light remount stayed light. The dedicated spec passed 1/1 in 18.8 s and the existing viewer-controls suite passed 2/2 in 23.8 s. ESLint, TypeScript, and `git diff --check` also passed. |
| Pending | Checkpoint 3 | Not started. |
| Pending | Checkpoint 4 | Not started. |
| Pending | PR and review | Not opened. |
| Pending | Merge and release | No merge, tag, or release exists. |

## Handoff

The repository must stop after plan persistence, repository-instruction commit,
project-level progress handoff, and feature-branch push. Application
implementation begins only through a subsequent `/goal` request.
