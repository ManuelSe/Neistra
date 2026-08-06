# Issues 5 And 6 - Camera-Neutral Viewer Selection Clicks

Status: implementation in progress; Checkpoints 1 and 2 complete

## Issue metadata

- Primary issue: [#5 - Clicking empty viewer space should clear the atom selection](https://github.com/ManuelSe/MolWeave/issues/5)
- Bundled issue: [#6 - Clicking a structure should select it without changing the viewer focus](https://github.com/ManuelSe/MolWeave/issues/6)
- Issue state at approval: open
- Issue author: `ManuelSe`
- Issues created: 2026-08-03
- Plan approved: 2026-08-06
- Base branch: `master`
- Base commit at approval: `8e98bda5082af57aa591db099bc580a99daf2310`
- Planned feature branch: `fix/issue-5-viewer-click-selection`
- Planned application version: `0.2.1`
- Planned tag: `v0.2.1`

This document is the combined implementation contract for issues #5 and #6. It
supplements, but does not replace, the global `docs/PLAN.md`. One plan and
branch cover both issues because they define the two outcomes of one primary
viewer-click contract and share the same Mol* behavior boundary. Issue #5 is
the primary identifier so the plan path, branch name, and initial plan commit
follow the repository's singular issue-delivery convention. The pull request
will close both issues explicitly.

## Core problem and approved outcome

MolWeave already translates a picked Mol* locus into canonical application atom
references and expands it according to the active Atom, Residue, Chain, or
Structure picking granularity. Mol*'s default camera-focus and
representation-focus behaviors independently consume the same primary click.
A structural hit can therefore select and focus, while an empty hit can clear
selection and reset the camera. This couples application selection to implicit
camera navigation and can destroy a deliberately composed inspection view.

The approved outcome makes primary viewer activation an application selection
input only:

- A structural hit updates the transient canonical selection according to the
  active picking granularity and replace/add/subtract modifier.
- An unmodified empty-space click clears a non-empty selection.
- An empty-space click while selection is already empty is a true no-op.
- Additive or subtractive empty-space clicks are no-ops.
- These actions do not change camera position, orientation, target, radius,
  zoom, rotation center, isolation, visibility, or representations.
- Fit all visible, Focus selection, and Focus visible ligands remain explicit
  camera commands through the generic viewer boundary.
- Camera dragging, wheel zoom, secondary/context behavior, and programmatic
  focus remain unchanged.

## Authority and assumptions

The plan applies the following authority order:

1. User approval of this plan and any later corrections.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing application/viewer ownership boundaries, schemas, and repository
   conventions.
4. Issues #5 and #6's user problems, intended outcomes, constraints, and
   explicit non-goals.
5. Technical suggestions in the issues, which are non-binding.

Accepted decisions D-002, D-013, D-017 through D-020, D-022, D-023, D-038,
D-041, D-043, and the new D-044 remain authoritative:

- Normalized molecular state and canonical atom references remain
  application-owned.
- Current selection and ordinary camera state remain transient.
- Mol* remains a disposable renderer and gesture/hit-testing provider.
- Application code supplies explicit camera focus targets; Mol* executes them.
- Primary activation selects or clears; it does not implicitly focus.

Planning assumptions:

- Issues #5 and #6 are one coherent defect slice, not two releases or branches.
- "Camera unchanged" is verified by the complete application camera snapshot:
  projection mode, position, target, up vector, and radius. The target is the
  application-visible rotation/focus center.
- Empty activation with an add or subtract modifier is a no-op. Clearing would
  contradict additive/subtractive selection semantics even though the issue
  requires only that modifiers never trigger camera focus.
- Primary pointer or touch activation follows this contract when Mol* emits its
  normal click event. No separate browser gesture recognizer is introduced.
- Mol*'s existing click-versus-drag recognition remains authoritative. The
  pinned mouse input path uses a four-pixel threshold; other supported input
  paths retain their library-defined thresholds.
- "Molecule" is not added as a synonym or a new granularity. Structure is the
  current top-level picking mode; stable individual-component semantics remain
  with issue #2.

## Repository findings

`MolstarEngine.mount` subscribes to `plugin.behaviors.interaction.click`, maps
Alt to subtract, Ctrl/Meta/Shift to add, and an unmodified click to replace. It
normalizes picked loci to the active granularity and maps Mol* source indices
to stable `(structure_id, atom_id)` references. Empty loci currently emit an
empty replacement selection.

The default Mol* UI specification also registers:

- `PluginBehaviors.Camera.FocusLoci`, whose default primary bindings focus a
  hit locus and reset the camera on an empty hit; and
- `PluginBehaviors.Representation.FocusLoci`, whose primary and modified-primary
  bindings update Mol* structure-focus state and can focus additive targets.

Those behaviors explain both reported outcomes. The application already has
generic `focusAtoms` and `fitVisible` operations, delivered in issue #3, which
call the Mol* camera manager explicitly without modifying selection. The
selection store is transient Zustand state; projects, checkpoints, archives,
history, and browser preferences do not persist the current selection or
ordinary camera movement.

Mol*'s input observer already emits `interaction.click` only when its movement
test recognizes a click. The application has no separate box-selection gesture
to preserve or change. Camera drag and wheel behavior are owned by the existing
Mol* trackball path.

At approval, local clean `master`, `origin/master`, and the remote default branch
all matched `8e98bda`. The remote had only `master`, no GitHub Actions workflows,
no branch protection, no rulesets, no required status checks, and no required
reviews. GitHub allowed merge commits, squash merges, and rebase merges;
automatic branch deletion was disabled. Recent feature PRs #13 and #15 used
rebase merge and complete local release-gate evidence.

The repository has verified annotated tags and GitHub releases `v0.1.1` and
`v0.2.0`. The issue brief's statement that release history was not established
is therefore superseded by current repository and remote state.

Related issue boundaries:

- Issue #3 already delivered the explicit focus controls required by both
  issues and is released in v0.2.0.
- Issue #2 owns stable component hierarchy and individual component/molecule
  selection semantics.
- Issue #4 owns a future mode that deliberately reassigns drag gestures from
  the camera to coordinate transformations.
- Issue #7 owns persisted selection-specific representation styling.

None of those scopes is implemented by this fix.

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment |
|---|---|---|
| An unmodified primary click on empty viewer space clears a non-empty current selection | Essential | Retain the application empty-selection path while removing Mol*'s implicit camera reset. |
| Empty click preserves camera position, orientation, zoom, target, and rotation center | Essential | Configure the viewer so no primary or modified-primary empty binding can reset or focus the camera. |
| Empty click does not change visibility or representations | Essential | Prevent primary clicks from entering Mol* representation-focus state and verify display invariants. |
| Empty click while selection is already empty has no effect | Essential | Suppress redundant selection emission and camera work. |
| A structural hit updates selection according to active granularity | Already satisfied by the repository; regression-protected | Preserve existing Atom, Residue, Chain, and Structure locus normalization. |
| A structural hit does not move, orient, zoom, fit, focus, or retarget the camera | Essential | Remove primary activation from Mol* camera-focus and representation-focus bindings. |
| Repeated selections can be made without disturbing the camera | Essential | Exercise consecutive picks and picking-mode changes against one exact camera snapshot. |
| Existing replace, add, and subtract modifier semantics remain | Essential | Preserve unmodified replace, Alt subtract, and Ctrl/Meta/Shift add. |
| Modified empty-space clicks never trigger whole-structure focus | Essential | Remove all primary modifier focus/reset bindings. |
| Modified empty-space clicks preserve selection | Supporting | Treat add/subtract of an empty operand as a no-op rather than an implicit clear. |
| Fit all visible remains the explicit overview command | Already satisfied by issue #3 | Retain the existing toolbar action and generic `fitVisible` viewer operation. |
| Focus selection and Focus visible ligands remain explicit | Already satisfied by issue #3 | Retain the existing toolbar actions and generic `focusAtoms` operation. |
| Programmatic focus commands are unaffected | Essential invariant | Regression-test explicit focus after implicit focus is disabled. |
| Click behavior is consistent across supported representations | Essential | Prove the shared interaction path across every representation style and representative real WebGL protein/ligand views. |
| Dragging continues to perform its assigned camera action | Already satisfied; regression-protected | Continue consuming Mol* `interaction.click`; verify a drag changes the camera and does not clear or replace selection. |
| Use the same click-versus-drag threshold used elsewhere | Already satisfied | Retain Mol* input-observer thresholds. |
| Add a new application or DOM movement threshold | Rejected as proposed | A second recognizer could diverge from Mol* and double-handle gestures. |
| Add Molecule or Component as a picking mode | Deferred | Stable component identity belongs to issue #2; current Structure mode remains unchanged. No new follow-up issue is needed. |
| Change camera dragging, wheel zoom, context behavior, or box selection | Rejected as proposed / explicit non-goal | Preserve existing behavior and do not claim an unimplemented box-selection feature. |
| Persist click selection or ordinary camera state | Rejected | Conflicts with accepted ownership decisions and is unnecessary for the reported problem. |
| Change molecular coordinates, chemistry, schemas, APIs, or archives | Rejected | This is a transient frontend/viewer interaction correction. |

No essential issue requirement is deferred. Issue #2 already owns the only
deferred product concept, so this plan creates no new follow-up issue unless
implementation or review reveals a distinct input-device defect that cannot be
fixed within the approved primary-activation contract.

## Accepted scope

- Define application-owned primary selection semantics at the Mol* plugin-spec
  boundary.
- Remove primary, modified-primary, and primary-equivalent trigger activation
  from Mol* implicit camera and representation focus.
- Preserve appropriate non-primary bindings, Mol* trackball gestures, and
  explicit application focus operations.
- Preserve current canonical selection mapping and picking granularities.
- Make empty-selection and modified-empty paths observable no-ops.
- Add direct typed regression coverage for focus bindings and selection-event
  semantics.
- Add real-WebGL workflow evidence for structural hits, empty clicks,
  modifiers, drags, representations, camera invariance, and explicit focus.
- Document the interaction ownership boundary and prepare a compatible patch
  release.

## Non-goals

- New selection granularities, component detection, hierarchy, or ligand
  designation.
- New toolbar controls, global shortcuts, context menus, or box selection.
- Changes to camera drag, pan, orbit, wheel, pinch, or secondary activation.
- Interactive coordinate movement from issue #4.
- Selection-specific representation persistence from issue #7.
- Project, scene, archive, command-history, browser-preference, API, database,
  molecular-schema, or migration changes.
- Mol* dependency upgrade or replacement.
- Cross-browser or WebXR qualification beyond the existing pinned Chromium
  release environment.

## Milestones and checkpoints

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Store this approved combined implementation contract before application code
  changes, record a concise project handoff, and append the accepted interaction
  ownership decision.

Affected areas:

- `docs/plans/issue-5-viewer-click-selection.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`

Acceptance criteria:

- Status is approved and implementation is explicitly not started.
- Both issues, metadata, base and feature branches, dispositions, scope,
  checkpoints, implications, evidence, release plan, blockers, and logs are
  present.
- The global `docs/PLAN.md` is unchanged.
- No application, test, version, schema, migration, or runtime file changes.

Focused validation:

```bash
git diff --check
git status --short
```

Documentation and migration implications:

- Creates the issue-specific source of truth.
- Updates the project-level current milestone and appends D-044.
- No migration.

Expected commit:

```text
docs(plan): add approved plan for issue 5
```

Rollback and compatibility:

- Revert the documentation commit. There is no runtime, data, API, or archive
  compatibility effect.

### Checkpoint 1 - Establish camera-neutral primary selection

Concrete outcome:

- Structural and empty primary activations update only MolWeave's transient
  canonical selection while implicit Mol* camera and representation focus no
  longer run.

Affected areas:

- `apps/web/src/viewer/MolstarEngine.ts`
- A narrowly scoped typed interaction or plugin-spec helper if direct testing
  justifies it
- `apps/web/src/test/viewer-adapter.test.ts`
- `apps/web/src/test/structure-loading.test.tsx`
- Selection tests where no-op combination behavior belongs

Implementation constraints:

- Configure the Mol* plugin specification at construction so its camera-focus
  and representation-focus behaviors do not bind primary, modified-primary, or
  primary-equivalent trigger activation.
- Preserve existing non-primary behavior rather than removing all focus
  capabilities from Mol*.
- Keep `focusAtoms` and `fitVisible` as explicit application operations.
- Keep Mol* hit testing and click-versus-drag recognition authoritative.
- Do not add browser event listeners, timeout heuristics, a second movement
  threshold, or Mol* state as application authority.
- Preserve source-index to stable atom-ID mapping and active granularity.

Acceptance criteria:

- Primary and modified-primary triggers cannot match implicit focus/reset
  behavior.
- A structural hit emits the correct canonical references, granularity, and
  selection mode.
- Unmodified empty activation clears a non-empty selection.
- Empty activation while already empty emits no selection change.
- Modified empty activation emits no selection change.
- Non-primary/context behavior, explicit focus, and camera gestures retain
  their prior bindings.
- No project command, request, structure sync, representation rebuild, durable
  mutation, or molecular mutation is introduced.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- \
  viewer-adapter structure-loading selection viewer-toolbar
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
git diff --check
```

Documentation and migration implications:

- Implements D-044 through the existing viewer boundary.
- No API, data, schema, archive, or migration change.

Expected commit:

```text
fix(viewer): decouple primary clicks from camera focus
```

Rollback and compatibility:

- Frontend-only behavioral rollback. Reverting restores the known implicit
  focus/reset defect without changing persisted projects or archives.

### Checkpoint 2 - Add real interaction regression evidence

Concrete outcome:

- Protect the complete issues #5 and #6 workflow with a dedicated real-WebGL
  browser test.

Affected areas:

- Prefer `tests/e2e/viewer-click-selection.spec.ts`
- Shared E2E helpers only when they reduce duplication without coupling
  unrelated workflows
- Existing viewer adapter/component tests only for evidence gaps found while
  qualifying the real viewer

Acceptance criteria:

The workflow must cover:

1. Atom, Residue, Chain, and Structure picks produce the expected selection.
2. Replace, additive, and subtractive picks retain their current semantics.
3. Several consecutive structural picks preserve an exact camera snapshot.
4. An unmodified empty click clears a non-empty selection and preserves the
   exact camera snapshot.
5. Repeated empty activation while already empty changes neither selection nor
   camera.
6. Additive and subtractive empty activation change neither selection nor
   camera.
7. A drag beyond Mol*'s click threshold performs its assigned camera action
   without being treated as a click or clearing selection.
8. Fit all visible and Focus selection still change the camera explicitly.
9. The shared click policy works for every supported representation style,
   with representative protein and ligand real-WebGL picks.
10. Transient clicks do not advance project revision, change artifacts,
    coordinates, viewer settings, history, isolation, or visibility, or request
    normalized structures again.
11. Compact primary activation follows the same selection-only semantics where
    the existing Mol* input path supports it.

Camera evidence may use named scene snapshots as the existing browser suite
does, but intentional scene commands must be separated from the before/after
project-invariance assertion.

Focused validation:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-click-selection.spec.ts

PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-controls.spec.ts tests/e2e/synchronized-selection.spec.ts
```

Documentation and migration implications:

- Adds planned/passing evidence to this plan and later to
  `docs/VERIFICATION.md`.
- No migration.

Expected commit:

```text
test(e2e): cover camera-neutral viewer selection
```

Rollback and compatibility:

- Test-only rollback removes regression protection but does not change runtime
  or persisted behavior.

### Checkpoint 3 - Document verified interaction semantics

Concrete outcome:

- Document the application selection, Mol* gesture, and explicit camera-focus
  boundary with exact passing evidence.

Affected areas:

- `docs/ARCHITECTURE.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- This plan's progress log
- `docs/ACCESSIBILITY.md` only if qualification exposes a material compact-input
  implication

Acceptance criteria:

- Documentation distinguishes transient selection, ordinary camera gestures,
  and explicit focus commands.
- It records the supported modifier and empty-space behavior.
- It does not claim box selection, Molecule/Component picking, new context
  behavior, or unsupported input-device coverage.
- Both issues' implemented, already-satisfied, deferred, and rejected
  requirements remain traceable to evidence.

Focused validation:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
git diff --check
```

Documentation and migration implications:

- Updates behavioral and verification documentation without redefining project
  or molecular schemas.
- No migration.

Expected commit:

```text
docs(viewer): document camera-neutral click semantics
```

Rollback and compatibility:

- Documentation-only rollback; runtime behavior remains.

### Checkpoint 4 - Qualify and prepare v0.2.1

Concrete outcome:

- Advance every authoritative application version, preserve archive
  compatibility, run the complete release gate, review the complete diff, and
  prepare accurate release evidence.

Affected areas:

- `pyproject.toml`
- `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `tests/integration/test_archive_roundtrip.py`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- This plan's progress log

Acceptance criteria:

- All five authoritative application version sources report `0.2.1`.
- `/api/v1`, Alembic `0007`, `ProjectStateV1`, `ProjectManifestV1`,
  `NormalizedStructureV1`, and archive schema version 1 remain unchanged.
- Archive round-trip provenance includes valid `0.2.0` input in addition to
  retained 0.1.x evidence.
- Release notes distinguish the fixed interaction from unchanged explicit
  focus and from deferred component/molecule work.
- Every focused and complete validation passes on the final candidate.
- Full-diff review finds no consequential unresolved issue, accidental scope,
  dead/debug code, scientific misstatement, or compatibility regression.

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

- Adds v0.2.1 release notes and evidence.
- No database, project, molecular, selection, scene, browser-storage, API, or
  archive-schema migration.

Expected commits:

```text
chore(release): prepare v0.2.1
docs(plan): record v0.2.1 release qualification
```

Rollback and compatibility:

- Revert release preparation before merge if qualification fails. Never move
  or reuse a published tag. The behavioral change does not require data
  rollback.

## Acceptance and verification evidence

| Claim | Planned evidence |
|---|---|
| Primary clicks cannot invoke Mol* implicit focus/reset | Direct typed inspection or matching tests for the constructed Mol* behavior bindings |
| Hit and empty selection events follow the approved contract | Viewer/selection unit and component tests |
| All four picking granularities remain synchronized | Existing toolbar, structure-loading, selection, and synchronized-selection tests plus the new workflow |
| Hit clicks preserve camera | Exact pre/post real-WebGL camera snapshots |
| Empty clicks clear without camera reset | Real-WebGL selection summary and exact camera snapshot |
| Empty and modified-empty no-op semantics | Direct interaction tests and browser selection/camera evidence |
| Drags remain camera gestures | Real WebGL drag with changed camera and unchanged selection |
| Explicit focus remains functional | Existing viewer-controls workflow and new post-fix regression |
| Representation independence | All representation-style code paths plus representative real-WebGL protein and ligand picks |
| No durable or molecular mutation | Exact project-response, artifact, revision, settings, and normalized-request evidence |
| Release compatibility | Complete gate and archive round trips including 0.2.0 provenance |

Automated evidence is the acceptance authority. Manual inspection may
supplement WebGL visual meaningfulness but cannot replace the camera, selection,
gesture, or state-invariance assertions.

## Data, migration, API, UI, and quality implications

### Data and migrations

- No relational data, Alembic migration, project checkpoint, saved selection,
  scene, normalized molecular artifact, or archive member changes.
- Current selection and unsaved ordinary camera state remain transient.

### API

- No endpoint, schema, OpenAPI, request, response, WebSocket, job, or artifact
  contract changes.
- `/api/v1` remains the current API line.

### UI and interaction

- No new control or panel is added.
- Existing toolbar picking modes and focus actions remain the named action
  surfaces.
- Primary clicks become predictable selection-only interactions; empty clicks
  become predictable clearing interactions.

### Scientific implications

- No atom identity, coordinates, topology, hierarchy, chemistry,
  classification, warning, or inference changes.
- Canonical atom references remain the only selection representation crossing
  the viewer boundary.
- Camera behavior has no scientific data effect.

### Accessibility

- No new interactive control requires an accessible name or keyboard model.
- Existing toolbar, inspector, sequence, project browser, and selection summary
  remain the semantic alternatives to WebGL atoms.
- Individual canvas atoms remain outside the screen-reader object model; this
  issue does not claim otherwise.

### Performance

- No new network request, molecular projection, or structure rebuild is
  expected.
- Removing unintended focus animations should reduce work on selection clicks.
- Direct tests must fail if clicks trigger normalized-structure requests or
  complete viewer resynchronization.

## Decisions and deviations

- Issues #5 and #6 are bundled under issue #5's delivery identifiers because
  one shared Mol* interaction boundary causes both defects. Splitting them would
  duplicate implementation and make either checkpoint behaviorally incomplete.
- D-044 records primary click ownership in the cross-project decision log. This
  plan references rather than replaces that decision.
- The issues' suggestion to distinguish clicks and drags at the application
  level is simplified to retaining Mol*'s existing tested distinction.
- Modified empty-space activation is defined as a selection no-op rather than a
  clear, preserving established add/subtract semantics.
- Molecule/Component mode is not introduced. Issue #2 already owns the required
  identity and hierarchy model.
- The release-history premise in the request is rejected as stale because
  annotated `v0.1.1` and `v0.2.0` releases are verified locally and remotely.

## Version and release plan

### SemVer assessment

This work is a patch release from 0.2.0 to 0.2.1:

- It corrects unintended coupling in existing selection behavior.
- It adds no new public API or durable product capability.
- It removes no documented explicit focus command.
- It does not change persisted schemas, archives, database migrations,
  molecular formats, browser storage, or command history.
- It preserves the existing four picking granularities and modifier contract.

A minor release would overstate the scope; a major release is unwarranted
because there is no incompatible public or persisted contract change. A
prerelease is unnecessary because the repository already has a stable v0.2.0
release and the fix is bounded, reversible, and fully regression-testable.

Authoritative version sources:

1. `pyproject.toml`
2. `uv.lock`
3. `apps/web/package.json`
4. `apps/api/src/molweave_api/main.py`
5. `apps/api/src/molweave_api/archive_service.py`

Proposed annotated tag: `v0.2.1`.

Release-note sections:

1. Highlights
2. Fixed
3. Interaction behavior
4. Verification
5. Compatibility and migrations
6. Accessibility, scientific, and performance implications
7. Deferred and follow-up work

## Pull request, merge, issue response, and cleanup

### Pull request

- Planned title: `fix(viewer): keep selection clicks camera-neutral`
- Base: `master`
- Head: `fix/issue-5-viewer-click-selection`
- Body must document implemented, already-satisfied, simplified, deferred,
  and rejected requirements; exact validation; compatibility; and release
  impact.
- Closing directives:

```text
Closes #5
Closes #6
```

- Review the complete diff locally and request available review. Do not claim
  an independent review unless one is returned and verified.
- Do not bypass any protection, check, review, or conversation configured
  before merge.

### Merge strategy

- Rebase merge after every checkpoint and the complete gate pass.
- This retains coherent Conventional Commit checkpoints and matches recent
  feature-delivery convention.
- Verify the exact merged commit on `origin/master` before any tag operation.

### Issue response and follow-up strategy

- The PR closes both issues.
- After release, post a verified close-out reply to each issue covering shared
  click semantics, explicit focus, modifiers, drag preservation, verification,
  compatibility, version/tag, and deferred Molecule/Component scope.
- Do not create a new component-selection issue; issue #2 already owns it.
- Create a follow-up only if qualification proves a distinct device-specific or
  gesture-specific defect outside the approved primary-activation contract.

### Tag, GitHub release, and closeout

- Create annotated `v0.2.1` only from the verified merged commit on clean
  `master`.
- Push and dereference the tag before publishing the GitHub release.
- Verify that the release is non-draft, non-prerelease, and points to the exact
  tag and merged commit.
- If remote PR, tag, release, or issue-response identifiers must be recorded
  after publication, use a documentation-only closeout PR without changing
  versions or moving the tag.

### Branch cleanup

- Automatic remote branch deletion is disabled.
- Delete the remote feature branch only after feature merge, tag, release,
  both issue responses, and any closeout PR are verified.
- Delete the local feature branch only after local clean `master` is
  fast-forwarded to the final verified remote commit.

## Merge and release blockers

Merge is blocked when any of the following is true:

- This approved plan is missing or changed materially without renewed approval.
- Any focused or complete validation command fails.
- A primary or modified-primary structural hit changes any camera snapshot
  field.
- An empty click changes the camera, visibility, isolation, or representation.
- An empty click fails to clear a non-empty selection.
- An already-empty or modified-empty click causes a selection or camera change.
- Replace, add, subtract, or active granularity behavior regresses.
- A drag crossing Mol*'s threshold is handled as a selection click.
- Explicit focus or fit commands stop working.
- A supported representation bypasses the selection-only contract.
- Primary selection enters Mol* representation-focus state.
- A click causes project commands, normalized-structure requests, molecular
  mutation, or full viewer rebuild without separately approved justification.
- A second application gesture detector or viewer-owned molecular authority is
  introduced.
- API, project, normalized, browser-storage, database, or archive compatibility
  changes beyond this plan.
- A valid 0.1.x or 0.2.0 archive cannot be imported.
- Authoritative version sources disagree.
- `git diff --check` or full-diff review has a consequential unresolved finding.
- Required protections, checks, reviews, or conversations configured before
  merge remain unresolved.
- Documentation claims evidence that did not pass.

Release is additionally blocked when:

- The feature PR is not verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The complete release gate did not pass on the final candidate.
- `v0.2.1` already exists or points to another commit.
- Any authoritative version source differs from 0.2.1.
- The annotated tag cannot be pushed, dereferenced, or verified remotely.
- The GitHub release cannot be verified against the tag and merged commit.
- Either final issue response would claim unverified delivery or deferred
  behavior.

## Progress and completion log

| Date | Status | Evidence / notes |
|---|---|---|
| 2026-08-06 | Plan proposed | Read-only inspection covered repository guidance, product/architecture/schema/API/release documentation, MolWeave selection and viewer ownership, Mol* default interaction behaviors and input thresholds, migrations, tests, version sources, git state, issues #5 and #6, related issues #2, #3, #4, and #7, remote branches, pull requests, tags, releases, merge settings, CI, rulesets, and protection state. |
| 2026-08-06 | Plan approved | User approved the combined issue #5/#6 scope, camera-neutral primary selection contract, empty/modifier semantics, checkpoints, patch-release path, blockers, and delivery workflow. |
| 2026-08-06 | Branch prepared | Clean local `master` was fetched and fast-forward checked against `origin/master` at `8e98bda5082af57aa591db099bc580a99daf2310`; branch `fix/issue-5-viewer-click-selection` was created. |
| 2026-08-06 | Plan persisted | This plan, concise project handoff, and D-044 are the first branch change. No implementation, tests, versions, schemas, migrations, or runtime behavior changed. |
| 2026-08-06 | Checkpoint 1 complete locally | Added a typed Mol* interaction policy that removes primary, modified-primary, and trigger activation from both default camera-focus and representation-focus behaviors while retaining secondary camera bindings. The viewer now accepts primary/trigger picks for application selection, clears only a non-empty selection on an unmodified empty pick, and treats already-empty and modified-empty picks as no-ops. Direct tests inspect the installed behavior parameters, prove every modifier cannot match implicit primary focus/reset, preserve secondary bindings, and cover selection activation/mode/empty policy. The focused frontend run passed all 54 tests across 17 files; ESLint, TypeScript, production build, and `git diff --check` passed. The initial lint run identified unsafe access to Mol*'s untyped `defaultParams`; explicit `unknown` narrowing fixed it before the passing rerun. The build retained the known non-blocking lazy Mol* warning at 966.15 KiB gzip and the initial application chunk at 151.14 KiB gzip. Diff review found no backend, API, schema, migration, molecular, persistence, representation, explicit-focus, or custom gesture-detector change. |
| 2026-08-06 | Checkpoint 2 complete locally | Added `viewer-click-selection.spec.ts` with desktop SwiftShader WebGL and Pixel 7 trigger-path workflows. The desktop test configures all seven supported representation styles, proves Atom/Residue/Chain/Structure scope, replace/add/subtract behavior, unmodified empty clearing, already-empty and modified-empty no-ops, exact camera equality across all clicks, changed camera after a real drag, changed cameras after explicit Focus selection and Fit all visible, exact durable project equality, and zero repeated normalized-structure requests. The compact test proves touch-trigger Structure selection and empty clearing without durable mutation. The first desktop run exposed that the seven-representation scene had not completed its final automatic fit before the baseline snapshot; the test now requires two identical pre-action snapshots and retains exact equality rather than weakening the assertion. The dedicated matrix then passed 2 applicable workflows with 2 intentional layout skips in 30.8 seconds. Existing `viewer-controls.spec.ts` and `synchronized-selection.spec.ts` passed 6 applicable workflows with 6 intentional cross-layout skips in 56.7 seconds. ESLint, TypeScript, and `git diff --check` passed. Diff review found no product, API, schema, migration, molecular, persistence, accessibility, or unsupported gesture expansion. |
| Pending | Checkpoint 3 | Not started. |
| Pending | Checkpoint 4 | Not started. |
| Pending | Pull request and review | No pull request exists. |
| Pending | Merge and release | No v0.2.1 tag or release exists. |

## Completion

Checkpoints 1 and 2 are implemented and verified. Checkpoints 3 and 4,
pull-request delivery, merge, release, and issue closeout remain.
