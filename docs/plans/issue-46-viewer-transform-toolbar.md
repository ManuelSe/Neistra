# Issue #46 — Viewer transformation toolbar and temporary camera navigation

## Status and delivery metadata

**Status: approved implementation plan; implementation not started.** Approved
explicitly by the user on 2026-10-10. Approval authorizes persisting this plan,
not starting implementation. Stop after the planning commit and verified branch
push; await `/goal`.

| Item | Planned value |
|---|---|
| Issue | [#46](https://github.com/ManuelSe/Neistra/issues/46) |
| Feature plan | `docs/plans/issue-46-viewer-transform-toolbar.md` |
| Base branch | `master` |
| Inspected and fast-forward-confirmed base | `984ecc0507625f1e72e01c3f9e4c2d4a32961a73` |
| Feature branch | `feat/issue-46-viewer-transform-toolbar` |
| PR title | `feat(viewer): add transform toolbar and temporary camera navigation` |
| Merge strategy | Normal merge commit, preserving passing checkpoints |
| Release | Minor increment: **0.11.0 → 0.12.0** |
| Annotated tag | `v0.12.0`, subject to a final collision check |

The working tree was clean before and after fetching and fast-forward-only
confirmation; local `master` matched remotely inspected `origin/master`.

The repository already has an established tag and release history. The published,
non-prerelease [v0.11.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.11.0)
points to `4ed61264d9006f81ca528bf42c0c21594121a55b`; later documentation merged
into the planning base. The planning prompt's assumption that release history is
absent does not match the inspected repository.

## Core problem and approved outcome

Users should be able to select a molecule, start transforming it directly above
the viewer, and alternate between molecular positioning and camera navigation
without reopening the inspector or losing their preview.

Deliver one existing movement transaction with:

- A distinct transformation bar adjacent to the current selection/styling toolbar.
- Fixed mouse controls: primary drag rotates; secondary or Ctrl-primary drag
  translates in the screen plane.
- Hold-Space camera navigation, followed by automatic transformation resumption
  on release.
- An **Adjust view / Resume transform** toggle for touch and keyboard access,
  as explicitly selected during planning.
- Directly accessible Apply and Cancel actions.
- Compact secondary tools for touch, keyboard, depth movement, and sensitivity.

Reuse the current transformation mathematics, captured selection, rendering queue,
backend command, history, and scientific warnings.

## Authority, baseline, and assumptions

Apply this authority order:

1. Explicit user guidance and subsequent corrections.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing architecture, documented boundaries, contracts, and conventions.
4. Issue outcomes, constraints, and non-goals.
5. Speculative technical suggestions in the issue.

Inspection covered the required [product specification](../PRODUCT_SPEC.md),
[global plan](../PLAN.md), [progress](../PROGRESS.md),
[decisions](../DECISIONS.md), and [verification](../VERIFICATION.md) documents;
relevant architecture, transformation, accessibility, performance, schema, API
and development documentation; movement state and viewer adapters; migrations,
job boundaries, tests, release metadata and repository policies. Related inputs
include issues #4 and #3 and PR #43, along with its release correction and
documentation closeout PRs #44/#45.

Relevant authority includes D-013, D-025, D-027, D-042, D-044, D-074–D-081.
[D-083](../DECISIONS.md#d-083--movement-transactions-retain-selection-ownership-during-temporary-camera-navigation)
explicitly extends D-076 for temporary camera navigation; D-076's molecular
transaction and context-discard rules remain applicable.

Baseline findings:

- Default Rotate mode already combines primary rotation with secondary/Ctrl-primary
  translation.
- The movement session belongs to the application; Mol* remains a disposable renderer.
- Movement currently hides the ordinary viewer toolbar and displays a large
  movement banner.
- Picking suppression and camera locking currently share the same viewer flag.
  Turning that flag off for Space would also re-enable selection.
- Responsive viewer remounts already retain the captured pose and camera.
- API, project, normalized and archive contracts remain version 1; Alembic head
  is `0013`.
- Recent feature PRs use normal merge commits.
- No GitHub Actions workflows, master protection or rulesets were exposed during
  inspection. Recheck live policy before delivery.
- Release qualification uses documented commands and GitHub CLI operations;
  no dedicated release automation was found.

Defaults:

- Preserve the Transform inspector launcher as another entry point to the same session.
- Preserve current task/selection/project invalidation and submission reconciliation.
- Keep navigation and secondary-tool preferences transient.
- Qualify pinned Chromium/SwiftShader and Pixel 7 emulation; make no
  physical-device or cross-browser certification claim.

## Requirement disposition matrix

| Significant requirement | Disposition | Planned treatment |
|---|---|---|
| Start transformation above the viewer | Essential | Add a viewer launcher using the existing movement workflow. |
| Clearly separate transformation from selection/styling | Essential | Use a separate adjacent transformation bar. |
| Same bar versus new bar | Optional layout alternatives | Select the separate-bar option for clear grouping and responsive wrapping. |
| Combined primary rotation and secondary translation | Already satisfied in default mode; essential to preserve | Make mouse mappings predictable regardless of touch/keyboard tool choice. |
| Intuitive drag rotation and current-plane translation | Already satisfied mathematically | Reuse quaternion composition and camera-based mapping; qualify both projections. |
| Hold Space to adjust the camera | Essential | Temporarily change interaction ownership without ending the transaction. |
| Release Space to resume | Essential | Retain pose and selection; use the updated camera for subsequent drags. |
| Touch alternative to Space | Supporting; product decision resolved | Provide the approved Adjust view / Resume transform toggle. |
| Active mode and gesture guidance | Supporting | Show semantic status, concise instructions and pressed states. |
| Apply/Cancel without opening the inspector | Already available in the banner; supporting relocation | Keep both in the transformation bar. |
| Captured target, pivot, preview and atomic history | Already satisfied | Preserve and add integration regression coverage. |
| Unselected coordinates remain unchanged | Already satisfied | Retain exact scientific assertions. |
| Numerical controls remain available | Already satisfied | Preserve their existing availability outside an active session. |
| Respect fields, buttons, modals and lost focus | Supporting | Scope the shortcut and clear stale navigation ownership safely. |
| Polished mobile and theme styling | Essential | Responsive wrapping, bounded secondary controls and touch-sized actions. |
| Regression coverage | Essential | Add real navigation/coordinate assertions, lifecycle tests and responsive evidence. |

Additional design dispositions:

- **Rejected as proposed:** implementing temporary navigation by ending or
  restarting movement. It risks selection leakage, recapture and preview loss.
  No follow-up issue.
- **Rejected as proposed:** removing useful depth, touch, keyboard or numerical
  capabilities to achieve a unified mouse workflow. Keep those capabilities as
  secondary tools. No follow-up issue.
- **Deferred:** continuous transfer of an already-held pointer gesture between
  camera and molecule. Require a fresh drag after ownership changes to avoid
  coordinate jumps. No follow-up issue unless users demonstrate a concrete need.
- **Deferred:** new gizmos, pivot markers, configurable bindings, durable
  preferences, scientific constraints and broader device certification. None is
  necessary for this issue; create no speculative follow-ups.

No unresolved product decision remains.

## Accepted scope and interaction contract

### Toolbar and secondary controls

Place the existing toolbar and a separate transformation bar in one responsive
viewer-header stack. Compute layout through normal flow rather than fixed
vertical offsets. Keep viewer status, warnings and errors clear of both bars.

When idle, show **Move selection**, with focusable unavailable states and
explanations for empty selection, locked/missing targets, viewer readiness and
wholly hidden targets. Existing capture validation remains the final check.

During a session, show:

- Transformation or camera-navigation status.
- Captured atom count and hidden-target count.
- Adjust view / Resume transform.
- Apply movement and Cancel movement.
- A **More** disclosure containing sensitivity, Rotate/Translate/Depth touch and
  keyboard preferences, step and zoom actions, and scientific details.

Keep a concise unconstrained-movement warning visible outside the disclosure.
Controls must wrap at narrow widths; secondary content must scroll within
available viewer space. Retain at least 44 CSS px height for touch actions and
the sensitivity control, and provide names, focus indicators and semantic state.

Selection, styling and explicit focus actions remain unavailable while a captured
movement exists, including temporary camera navigation. Their availability must
accurately explain the active transaction.

Preserve the inspector launcher. Route both launchers through one start action
that clears and invalidates numerical previews before capture. Restore focus to
the connected originating launcher after session exit, with a viewer-launcher
fallback guarded by project identity.

### Mouse, touch and keyboard

Mouse primary drag always rotates; secondary or Ctrl-primary drag always
translates. The touch/keyboard preference must not change these mouse mappings.

Retain Rotate/Translate/Depth for touch dragging, arrow keys and named steps.
Desktop depth positioning remains available through steps and numerical controls.
Update guidance to describe these distinctions accurately.

Reset secondary-tool defaults when a new session begins. Pointer release retains
the preview; Apply is the only commit action.

### Navigation state and viewer boundary

Keep temporary navigation state in the application-owned movement workflow,
outside authoritative molecular data and persistent preferences.

Replace the internal viewer boolean with a typed interaction state:

```ts
type MovementInteraction = "inactive" | "transform" | "camera";
setMovementMode(interaction: MovementInteraction): void;
```

Update the lazy adapter, native engine, callers, test doubles and qualification
harness together.

The transaction phase remains separate from interaction ownership:

- `inactive`: ordinary viewer behavior.
- `transform`: picking suppressed; camera orientation and target held; permitted
  zoom retained.
- `camera`: picking and implicit molecular-focus behavior still suppressed;
  native orbit, pan and zoom available.

Capture normal viewer bindings once per session. Restore them on final
exit/disposal. During temporary navigation, permit native camera gestures while
keeping animation/inertia suppressed. Reacquire the latest camera when
transformation resumes.

Do not reimplement camera motion in the application or depend on private Mol* fields.

### Space and ownership transitions

Handle unmodified Space only when an active movement canvas/viewer owns focus.
Preserve normal Space behavior in buttons, fields, editable content, disclosures,
dialogs and drawers.

Maintain separate transient held-Space and explicit-toggle state. Camera
navigation is enabled while either is active. Releasing Space resumes
transformation unless the user deliberately left the view toggle enabled.

On every ownership transition:

- End the current gesture without changing its last accepted molecular pose or camera.
- Release application pointer capture safely.
- Ignore continuation of already-held pointers until release.
- Require a fresh pointer-down for the next gesture.
- Prevent movement events from reaching both owners.

Ordinary pointer cancellation/lost capture retains the existing rule: restore the
start of that molecular drag.

Clear held-Space state on focus departure. Clear all temporary navigation state on
window blur, hidden document, modal takeover, session phase exit and renderer
remount. Preserve the captured pose and latest camera when the session remains
valid. Require a fresh Space press or toggle activation after remount.

### Scientific and compatibility boundaries

Reuse the existing captured originals, translated-centroid pivot, normalized
quaternion composition and atomic selection-transform endpoint.

Navigation cannot alter selection, coordinates, artifacts, revisions, dirty
state, history, visibility or job inputs. Camera changes do not trigger molecular
recapture or surface regeneration.

Surfaces/pockets remain suspended for the complete preview transaction;
measurements remain visibly paused. Resume geometry only on the existing
commit/cancel lifecycle.

No new endpoint, request/response field, database migration, archive field, scene
field, job type or history vocabulary is required. The only interface change is
the internal typed viewer interaction contract.

## Data, migration, API, UI, scientific, accessibility and performance implications

- TanStack Query remains the authoritative server-state cache. The existing
  application-owned movement capture/pose owns transient preview inputs; Mol*
  renders them without acquiring molecular authority.
- Reuse `POST /api/v1/projects/{project_id}/selection-transform`, proper rigid
  matrices, all-conformer transformation and `coordinates.transform` /
  `entry.coordinates` history. Keep original uploads, stable identities,
  unselected state, warnings, chemistry and immutable submitted job inputs.
- No migration is planned; head remains `0013`. API, project, normalized and
  archive majors remain 1. No durable navigation state, preference, scene pose,
  draft or new job type is introduced.
- Previews remain excluded from exports, archives and job inputs. Applied
  coordinates retain normal save/reload/restart/export/history behavior. Molecular
  export precision and loss warnings, and archive history omission, remain unchanged.
- Partial selections may stretch crossing bonds or create clashes. Missing bond
  records do not prove safety. This is manual positioning without repair,
  minimization, preparation, scoring or docking validation.
- The viewer-header stack and bounded More disclosure replace the obstructive
  primary banner layout. Keyboard, native Space activation, modal focus/Escape,
  touch-sized actions, light/dark themes and actual 200% zoom are required.
- Reuse the bounded first/latest rendering queue. Neither pointer movement nor
  navigation transitions may submit transforms, refetch normalized structures or
  enqueue molecular/surface jobs. Retain the published host performance budgets
  and report surface restoration separately.

## Milestones and independently verifiable checkpoints

Each checkpoint records commands, results, limitations and corrections here, with
a concise project summary in `docs/PROGRESS.md`. Commit only passing, substantive
states.

Run frontend lint, type-check, full frontend tests and production build at each
implementation milestone, plus its focused browser workflows. Run the relevant
Python checks for affected areas and the complete release gate before PR/merge.
Fix failures before advancing.

### M1 / C1 — Toolbar-driven transformation slice

**Outcome:** Users can start, manipulate, apply and cancel the existing
transaction entirely from the viewer header.

**Affected areas:** application launch routing, viewer header, movement controls,
availability, styling and focus.

**Acceptance:** Both launchers share one capture; mouse mappings are fixed;
hidden targets remain included; no numerical preview leaks into movement;
controls fit desktop/mobile; existing Apply/Cancel/history workflows pass. Do not
advertise Space before C2 implements it.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/viewer-toolbar.test.tsx \
  src/test/structure-loading.test.tsx \
  src/test/interactive-transform-controls.test.tsx \
  src/test/numeric-preview-ownership.test.tsx
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/viewer-controls.spec.ts
```

**Documentation/migration:** Update transformation usage and feature evidence;
no migration.

**Commit:** `feat(viewer): expose selection transforms in the viewer toolbar`

**Rollback:** Restore prior launcher/banner presentation; committed coordinates
remain ordinary compatible state.

### M2 / C2 — Temporary camera navigation

**Outcome:** Space and Adjust view temporarily transfer control to the camera
while retaining the molecular transaction.

**Affected areas:** transient workflow state, typed viewer boundary, native
binding/camera ownership, overlay routing and gesture guidance.

**Acceptance:** Real camera orbit/pan/zoom works; picking remains suppressed;
preview coordinates remain exact; release resumes transformation; subsequent
translation uses the new camera basis in perspective and orthographic views;
repeated transitions cause no binding drift.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/interactive-transform.test.ts \
  src/test/interactive-transform-controls.test.tsx \
  src/test/viewer-adapter.test.ts \
  src/test/viewer-interaction.test.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/viewer-click-selection.spec.ts
```

**Documentation/migration:** Document navigation semantics and the internal
viewer boundary; reference D-083. No migration.

**Commit:** `feat(transform): allow temporary camera navigation during movement`

**Rollback:** Remove navigation entry points and restore camera locking without
discarding molecular data.

### M2 / C3 — Input lifecycle and responsive qualification

**Outcome:** Navigation ownership stays coherent across interruptions, focus
changes and responsive remounts.

**Affected areas:** gesture cleanup, shortcut scope, modal ownership, focus
restoration, responsive controls and browser regressions.

**Acceptance:** Mid-drag changes preserve the accepted pose without jumps; lost
key-up cannot leave navigation active; buttons/fields retain Space; modal Escape
retains its existing ownership; remount preserves pose/camera and clears
navigation flags. Touch toggle, advanced steps and Apply/Cancel work in both
themes. Real 100%/200% zoom and scoped axe checks pass.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/interactive-transform-controls.test.tsx \
  src/test/structure-loading.test.tsx \
  src/test/viewer-toolbar.test.tsx
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/responsive-workspace.spec.ts \
  tests/e2e/rebranding-zoom.spec.ts \
  tests/e2e/release-hardening.spec.ts
```

**Documentation/migration:** Update accessibility guidance and record inspected
screenshots; no migration.

**Commit:** `test(transform): qualify navigation ownership and responsive controls`

Substantive corrections use separate `fix(transform)` or `fix(viewer)` commits.

**Rollback:** Revert transient ownership changes; retain the compatible
transaction and coordinates.

### M3 / C4 — Scientific, persistence and performance qualification

**Outcome:** Demonstrate unchanged scientific transactions and bounded rendering
throughout camera/navigation cycles.

**Affected areas:** native qualification harness, browser scientific assertions,
persistence/archive checks and evidence.

**Acceptance:** Hidden multi-entry targets, unselected coordinates, all-conformer
transforms, exact Cancel, no-op history and single Apply/undo/redo remain correct.
Navigation creates no molecular requests or commits. Existing
surface/pocket/measurement behavior remains correct.

Keep the established pinned-host budgets: preview and exact coordinate Cancel
each below 500 ms; longest movement task below 750 ms. Preserve one active
renderer update plus its latest pending frame. Report surface restoration
separately.

**Focused validation:**

```bash
.venv/bin/uv run pytest \
  tests/integration/test_coordinate_commands.py \
  tests/integration/test_archive_roundtrip.py \
  tests/integration/test_migrations.py \
  tests/security/test_archive_safety.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/interactive-transform-performance.spec.ts \
  tests/e2e/selection-surfaces.spec.ts \
  tests/e2e/pocket-surfaces.spec.ts \
  tests/e2e/measurements.spec.ts \
  tests/e2e/export-archive.spec.ts
```

Stage actual preceding-reader qualification using the `v0.11.0` API/core/plugin
checkout and `tests.support.transform_reader_qualification`, with
`--expected-reader 0.11.0`. Final producer-version qualification occurs in C5.
Use the existing [qualification procedure](../DEVELOPMENT.md#interactive-movement-compatibility-0110)
with the preceding checkout/version advanced to v0.11.0 and fresh disposable data.

**Documentation/migration:** Update performance, verification and compatibility
evidence; no migration.

**Commit:** `test(transform): verify scientific invariants and compatibility`

**Rollback:** Returning to the qualified preceding release requires no schema
downgrade or data stripping.

### M3 / C5 — Reviewed release candidate

**Outcome:** Complete approved scope, consistent versions and a qualified
release candidate.

**Affected areas:** authoritative versions, producer assertions, compatibility
qualification, release notes and evidence.

**Acceptance:** Every accepted requirement maps to passing evidence; actual
v0.11.0 reads final v0.12.0-produced data; complete gate passes; full-diff review
resolves consequential findings.

**Focused validation:** Check all five versions, run archive/coordinate tests,
repeat actual preceding-reader qualification with final producer metadata, then
run the complete release gate below.

```bash
.venv/bin/uv run pytest tests/integration/test_archive_roundtrip.py \
  tests/integration/test_coordinate_commands.py
```

The actual reader must check exact current coordinates/original hashes, retained
batch undo/redo, save/reexport, archive import and unchanged completed jobs. Run
produce with candidate PYTHONPATH, then read with the actual v0.11.0
API/core/plugin PYTHONPATH and `--expected-reader 0.11.0`, using the repository's
project-local Python. Record both producer and reader versions in evidence.

**Documentation/migration:** Final release notes, limitations, decisions,
verification and completion records; no migration.

**Commit:** `chore(release): prepare v0.12.0`

**Rollback:** Corrective commits before publication or a subsequent release
afterward. Never retarget a published tag.

## Acceptance and verification evidence

Planning-stage checks performed on the unchanged baseline:

- **164 frontend tests passed across 37 files.** The planning invocation
  `corepack pnpm --dir apps/web test -- interactive-transform viewer-toolbar
  viewer-interaction viewer-adapter` ran the full frontend suite; record it as
  full-suite baseline evidence rather than claiming the filter was effective.
- **109 coordinate, archive and migration integration tests passed** through
  `.venv/bin/uv run pytest tests/integration/test_coordinate_commands.py
  tests/integration/test_archive_roundtrip.py tests/integration/test_migrations.py`.
- Existing Alembic configuration deprecation warnings remain (237 warnings in
  the focused Python run).
- Working tree remained clean after baseline checks.

These results establish baseline health; they do not prove the proposed feature
works. No new browser/release gate has been run during planning.

During implementation, attach evidence for actual camera changes and native
coordinates, not only screenshots or control labels. Cover repeated Space
transitions, touch toggle, post-navigation translation, interruption cleanup,
focus, remounts, Apply/Cancel/history and request counts.

Maintain evidence under `docs/assets/viewer-transform-toolbar/`, distinguishing
checkpoint, candidate and exact-merged results. Update relevant transformation,
architecture, accessibility, performance and verification documentation with
actual behavior and measured evidence rather than planned claims.

The complete candidate gate, repeated on the exact merged release commit, is:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=/tmp/neistra-issue46-release-migration \
  .venv/bin/uv run alembic upgrade head
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

Use fresh disposable qualification data. Confirm configured services belong to
the run; record any isolated-port/data overrides. Preserve existing regression
assertions while updating selectors for the new layout. Do not weaken timing
budgets, replace real zoom with viewport emulation, or conceal unexplained flakes.

## Decisions and deviations

[D-083](../DECISIONS.md#d-083--movement-transactions-retain-selection-ownership-during-temporary-camera-navigation)
records the significant cross-project architectural extension:

- Transaction lifetime differs from camera/transform interaction ownership.
- Application-owned temporary navigation never recaptures or commits molecular state.
- Picking remains suppressed while native camera navigation is permitted.
- Ownership changes require fresh pointer gestures.
- Space respects focused controls and modal ownership.
- The approved touch toggle and remount cleanup rules.
- Fixed mouse mappings coexist with touch/keyboard/depth tools.

Explicitly extend D-076; do not rewrite prior accepted decisions. Preserve D-080
camera retention and D-081 numerical-preview invalidation.

This feature plan records local scope choices; the decision log remains
authoritative for cross-project architecture. Material changes to the approved
outcome or compatibility require renewed product review; routine corrections
within this contract are recorded with their verification.

## Version and release plan

Use a **minor release**, because toolbar access and temporary camera navigation
add meaningful public functionality. This exceeds a patch correction. No API,
schema, archive, history or scientific-data incompatibility requires a major
increment. Existing stable releases and completion gates provide no reason to
use a prerelease.

During C5 update these five authoritative sources together:

1. `pyproject.toml`
2. Root development-project version in `uv.lock`
3. `apps/web/package.json`
4. FastAPI version in `apps/api/src/molweave_api/main.py`
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Update current producer assertions and notes while retaining historical archive
coverage. Do not add a root JavaScript package version or upgrade unrelated
dependencies. No version bump occurs in the planning commit.

Release-note sections:

- Viewer transformation workflow.
- Mouse, Space, touch and keyboard controls.
- Apply/Cancel, history and scientific limitations.
- API, persistence and compatibility.
- Verification, performance and review evidence.
- Deferred scope and known limitations.

Recheck release ordering and tag availability before version changes and
publication. Record ordinary version sequencing changes; any material
compatibility change requires revisiting the plan.

## PR, merge, issue response and branch cleanup

Open the planned PR only after the complete candidate gate. Describe implemented,
simplified, deferred and rejected requirements, with compatibility and
verification evidence. Include `Closes #46` when the approved contract is complete.

Review the complete diff. Recheck required reviews, checks, protection, rulesets
and unresolved conversations; bypass none. Distinguish local review from
independent review.

After a verified merge:

1. Fast-forward local `master` to the remote merged commit.
2. Run the complete gate and final qualification on that exact commit.
3. Create annotated `v0.12.0` and publish the GitHub release.
4. Verify the annotation, peeled target, release state and published evidence remotely.
5. Publish a scope-accurate final issue reply.
6. Complete any documentation closeout through a reviewed PR without retargeting
   the release tag.
7. Delete and remotely verify only the issue #46 feature branch after delivery.

No follow-up issue is planned. Create one only for concrete unresolved work,
explaining whether it changes completion of #46.

**Merge blockers:** selection leakage, lost/jumping previews, stuck input
ownership, broken Cancel/history, changed unselected state, stale geometry,
inaccessible controls, performance regressions, incompatible data, inconsistent
versions, failing checks, unexplained flakes, consequential review findings or
unresolved required conversations.

**Release blockers:** failed exact-merged qualification, unverified merged SHA,
tag/version collision, incorrect tag target, incomplete publication evidence or
inaccurate scope claims.

## Approval, persistence and progress/completion log

The user explicitly approved this proposal on 2026-10-10 and instructed:
"Persist it and wait for the goal command as described in the previous instructions."
This supersedes the proposal's approval-pending status but does not authorize
implementation.

Planning persistence workflow:

1. Confirm the working tree is clean.
2. Fetch `origin`, switch to `master`, and update with
   `git merge --ff-only origin/master`.
3. Confirm cleanliness and review any intervening changes that affect this plan.
4. Create `feat/issue-46-viewer-transform-toolbar`.
5. Write this approved feature plan as the first branch change.
6. Append D-083 and update the concise project progress summary.
7. Verify document links, whitespace, approved scope and unchanged runtime/version sources.
8. Commit exactly: `docs(plan): add approved plan for issue 46`.
9. Push and verify the feature branch if remote access is available.
10. Report the exact path, branch, commit, milestones and planned minor release.

The initial planning commit contains this feature plan, the decision-log addition
and progress update. It leaves the global `docs/PLAN.md` unchanged.

| Item | Status | Evidence or next action |
|---|---|---|
| Product decision | Complete | User selected Adjust view / Resume transform toggle for touch. |
| Plan approval | Complete | Explicit user approval on 2026-10-10; implementation awaits `/goal`. |
| Baseline inspection/checks | Complete | 164 frontend and 109 focused Python tests pass; no new-feature claims. |
| Base synchronization | Complete | Fetched origin; clean master fast-forward confirmation at `984ecc0507625f1e72e01c3f9e4c2d4a32961a73`. |
| Feature branch creation | Complete | Local `feat/issue-46-viewer-transform-toolbar` created from the confirmed base. |
| Planning documentation verification | Complete | Required sections, five checkpoint contracts, code fences, local links/anchors, exact three-file scope, feature branch and unchanged global plan/runtime/version sources pass; whitespace check passes. |
| Planning commit/push | Handoff record | Initial commit title is `docs(plan): add approved plan for issue 46`; its exact SHA and remote branch verification are reported after commit/push, outside this commit to avoid self-reference. |
| M1 / C1 | Not started | Viewer toolbar transformation slice. |
| M2 / C2–C3 | Not started | Temporary navigation, input lifecycle and responsive qualification. |
| M3 / C4–C5 | Not started | Scientific/performance/compatibility qualification and release candidate. |
| PR/review/merge | Not started | Complete candidate gate before PR; comply with live repository policy. |
| Exact-merged qualification | Not started | Complete release gate on verified merged master. |
| Tag/release/issue reply | Not started | Publish only from qualified merged commit; verify remotely. |
| Documentation closeout/branch cleanup | Not started | Complete and verify after delivery; leave unrelated branches unchanged. |

### 2026-10-10 — Approved planning handoff

Approved scope is the viewer transformation bar, fixed mouse gestures, scoped
hold-Space navigation and the selected touch toggle, preserving existing atomic
movement and scientific state. Three milestones and five implementation
checkpoints are approved. Planned release is minor v0.12.0, with no migration.

Planning documentation checks passed for all required sections, five checkpoint
contracts, balanced code fences and local links/anchors. Exact changed scope is
this plan, `docs/DECISIONS.md` and `docs/PROGRESS.md`; the global plan and all
runtime/version sources are unchanged. Whitespace validation passes. The initial
planning commit/push SHA is verified and reported in the subsequent handoff;
no PR, implementation or release is authorized by this planning action.

Known limitations: no implementation or new-feature verification yet; qualification
will use pinned Chromium/SwiftShader and Pixel 7 emulation; existing scientific,
surface-restoration and Alembic/bundle limits remain. No blocker to planning
persistence. Next action after the verified planning commit/push is to wait for
`/goal`, without starting implementation or opening a PR.
