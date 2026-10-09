# Issue #4 — Interactive selection transforms

## Status and issue metadata

- Status: **Implementation in progress; M1 and M2 complete; M3 in progress; C4 complete; C5 pending**.
- Approval: the user explicitly approved the complete proposed plan on 2026-10-09.
- Issue: [#4 — Add an interactive mouse-based mode for translating and rotating selected atoms](https://github.com/ManuelSe/Neistra/issues/4).
- Issue at approval: open, without comments, labels or a milestone; last updated 2026-08-03.
- Base branch: `master`, updated from `origin/master` with fast-forward-only integration.
- Verified planning and branch base: `c53c3251e87db69c3eac6b81453f514bbaff0706`.
- Feature branch: `feat/issue-4-interactive-selection-transform`.
- Planned version and annotated tag: **0.11.0 / `v0.11.0`**, subject to collision checks.
- PR title: `feat(transform): add interactive selection movement`.
- Merge strategy: normal merge commit preserving passing checkpoint history.
- Milestones: M1/C1, M2/C2–C3, M3/C4–C5.

This feature plan is the approved implementation contract. The issue is a product
and problem brief, not a binding technical specification. The global
`docs/PLAN.md` remains unchanged. Approval authorizes this planning handoff only:
branch creation, documentation, commit, push and remote verification. Do not
start implementation or execute PR/merge/release/issue-response actions until a
subsequent user instruction such as `/goal` authorizes that work.

## Core problem and approved outcome

Scientists need to position selected molecular material visually without
repeatedly editing coordinate fields. Deliver a temporary **Move selection**
interaction mode that:

- Captures the complete current canonical atom selection.
- Rotates that selection and translates it in the screen plane or viewing direction.
- Shows a continuous local preview while leaving authoritative molecular state unchanged.
- Applies the final pose through one atomic backend command.
- Cancels without changing project state and restores normal viewer interaction.
- Retains existing numerical inputs and sliders.

Selections may span entries. Every captured atom receives the same world-space
rigid transformation. Never silently narrow the selection to the inspector's
chosen structure or to visible atoms.

## Authority, inspected baseline and assumptions

Apply this authority order:

1. Explicit user guidance, approval and subsequent corrections.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing architecture, documented boundaries, schemas and repository conventions.
4. The issue's underlying user problems, outcomes, constraints and explicit non-goals.
5. Technical suggestions in the issue, which are non-binding.

Planning inspected AGENTS, PRODUCT_SPEC, global PLAN, PROGRESS, DECISIONS and
VERIFICATION; architecture, API, project/normalized schemas, development,
accessibility, performance and scientific-limitations documentation; transform
domain/service/schema/routes, command history and coordinate patches; selection,
workspace and query-cache ownership; viewer interfaces/lazy adapter/engine and
pinned Mol* 5.11.0 gesture bindings; surface/pocket and measurement dependencies;
persistence, migration and immutable job input paths; relevant Python, frontend
and browser tests; related issues and feature plans; branches, tags, releases,
recent PRs, live repository policy, version sources and release tooling.

Relevant accepted decisions include D-002, D-007, D-018–D-020, D-025/D-027,
D-035/D-042, D-044, D-060–D-062, D-070 and D-074. D-075 and D-076 append the
approved transform transport and interaction/session decisions without replacing
historical decisions.

Existing foundations include browser coordinate previews, immutable coordinate
history, canonical selections and atomic history actions across entries. The
current numerical transform endpoint operates on one entry; it cannot directly
commit an arbitrary captured multi-entry selection. Core matrix application
already exists, but externally supplied matrices need proper-rotation validation.
The viewer currently queues each coordinate update, so continuous dragging also
needs explicit bounded preview scheduling.

Issues #3, #5 and #6 establish explicit focus and selection-only clicks outside
this mode. Delivered surface work (#30/#38/#36) establishes obsolete-geometry
suppression, coordinate snapshot retention and cross-entry pocket invalidation.
Component corrections (#20) and subset export (#21) remain separate. Broader
ligand/preparation/docking work is not a prerequisite for free rigid movement.

Assumptions accepted by approval:

- Entries already share a meaningful Cartesian frame; no alignment is inferred.
- The same world-space transform applies to selected IDs in every conformer,
  retaining existing conformer semantics and active-atom coordinate consistency.
- Original uploads, chemistry, connectivity, identity, classification and submitted
  job inputs remain unchanged.
- Uncommitted previews are session state and are discarded on reload.
- Approval resolves whole-selection batching, a translated captured centroid,
  automatic discard on task changes and the visibility/accessibility policies below.

The premise that Neistra has no release history is outdated. Remote releases
exist through [v0.10.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.10.0).
Its annotated tag peels to `cad24628d9221fef26f667eae4275ab23438841f`, with
documentation closeout subsequently merged into the planning base. Existing
release evidence is historical, not newly executed issue #4 validation.

At review there were no open PRs, no `.github` directory or GitHub Actions
workflows, no rulesets and no protection on master. Normal merge commits are
enabled. No dedicated release script exists. Recheck live policy before delivery;
absence of remote gates does not replace local validation and full-diff review.
The planned feature branch and v0.11.0 tag were unallocated at the handoff check.

## Requirement disposition matrix

| Significant requirement | Disposition | Approved treatment and follow-up |
|---|---|---|
| Interactive Move selection launcher in Transform | Essential | Named control with an accessible unavailable reason |
| Optional viewer-toolbar launcher | Optional | Omit initially; no follow-up required |
| Require nonempty selection | Essential | Also reject locked, invalid, unavailable or uninspectable targets |
| Transform exactly selected atoms; preserve unselected coordinates | Essential | Backend validation and exact invariance evidence |
| Ligand, fragment, residue, chain and whole-entry selections | Essential | All consume canonical atom references |
| Selection spanning entries | Unclear in brief; product decision approved | Accept the complete selection atomically |
| Fixed transform target | Essential | Capture references, revision and source artifacts |
| Disable viewer picking | Essential | Disable hit and empty-space selection changes while active |
| Selection changes elsewhere | Unclear in brief; product decision approved | Cancel the preview before applying the new selection |
| Rotation gesture moves atoms instead of camera | Essential | Primary drag rotates; no camera inertia/focus side effects |
| Pan gesture moves atoms instead of camera | Essential | Secondary or Ctrl-primary drag translates in the screen plane |
| Horizontal/vertical movement follows screen orientation | Essential | Use an orthonormal camera screen basis |
| Movement along viewing direction | Essential | Explicit Depth drag mode |
| Camera fixed except zoom | Essential | Suspend orbit, pan, focus, fit, roll and navigation inputs |
| Zoom remains available | Essential | Wheel and named controls; touch controls as qualified |
| Continuous coordinate preview | Essential | Local float64 calculation and bounded renderer updates |
| Geometric centroid from selected coordinates | Essential | Arithmetic mean across all captured atoms |
| Pivot independent of mass, camera and outside atoms | Essential | Domain calculation only |
| Pivot fixed at original world location after translation | Rejected as proposed | Causes rotation to orbit the old location; carry captured centroid with translation; no follow-up needed |
| Visible pivot marker | Optional | Deferred; count/highlight/banner provide scope cues; no follow-up required |
| Selected atoms remain highlighted | Essential | Restore highlighting after coordinate updates |
| Obvious mode, count, gestures, Apply and Cancel | Essential | Persistent viewer banner; communicate state beyond color |
| Changed cursor | Supporting | Appropriate movement cursor |
| Separate Exit action | Rejected as redundant | Cancel exits; Apply exits after success; no follow-up needed |
| Escape behavior | Supporting | Cancel the complete unapplied session |
| Multiple drags create one command | Essential | Only Apply submits |
| Cancel restores exact originals | Essential | Restore captured committed coordinates, not inverse arithmetic |
| Complete-operation undo and redo | Essential | Existing immutable artifacts and coordinate actions |
| Normal controls return after exit | Essential | Restore bindings and dispose session listeners |
| Existing numerical fields and sliders | Already satisfied | Preserve behavior; prevent competing transforms during preview |
| Live Euler/vector display synchronized to numerical fields | Optional | Deferred to avoid Euler decomposition/field coupling; no follow-up required |
| Task-switch prompt versus automatic discard | Unclear in brief; product decision approved | Automatic discard with visible feedback |
| Rigid motion preserves selected relative geometry | Essential | Proper rotations and pairwise-distance tests |
| No internal conformation/connectivity editing | Essential boundary | No torsion tools, minimization, snapping or repair |
| Specialized manipulators | Deferred | Separate future product work; no speculative issue |

The unclear rows are resolved by explicit approval of this contract, not left as
implementation blockers. Cross-browser certification, physical-device
qualification, a generic gizmo framework, saved transform sessions and new job
types are deferred because they are unnecessary to this coherent workflow.
Create follow-ups only for concrete unresolved problems, not every optional idea.

## Accepted scope and interaction contract

### Capture, rigid composition and pivot

Activation captures project ID, expected revision, canonical selection, current
artifact identities, original selected coordinates and centroid. Use:

```text
x′ = c + t + R(x − c)
```

`c` is the captured arithmetic centroid, `t` is accumulated world translation,
and `R` is a proper rotation. Rotation after translation occurs around `c + t`.
The original centroid is never recomputed from rounded renderer coordinates.
Preview coordinates always derive from the captured originals. One selected atom
can translate; rotation about its own centroid produces no coordinate change.

The viewer adapter supplies camera/projection information needed for gesture
mapping. Molecular calculations and session ownership stay in application code;
Mol* objects never enter the session, API or persisted state. D-075/D-076 explain
the departure from a permanently fixed world pivot and the matrix extension.

### Gestures, visible state and accessible alternatives

Desktop controls:

- Primary drag rotates.
- Secondary or Ctrl-primary drag translates horizontally/vertically in the screen plane.
- Depth mode uses primary vertical drag along the viewing direction.
- Compact Rotate / Translate / Depth controls provide explicit primary-drag alternatives.
- Zoom remains available and updates translation sensitivity between drags.

Provide bounded step controls for keyboard and touch users through the same
preview transaction. Existing numerical controls remain available for precise
work outside an active session. Do not hijack keys belonging to text inputs.

Hidden selected atoms remain targets and are counted explicitly. Activation must
have inspectable rendered selected material; otherwise explain what must be
shown. Never automatically reveal hidden entries or change durable visibility.
Preserve visible highlighting. Provide truthful selected-atom preview cues where
suspended surfaces would otherwise remove visual context, while honoring current
visibility bounds. The banner names the mode, target count, gestures and Apply/
Cancel. Cursor/color supplement semantic text rather than being its sole carrier.

### Apply, cancel and context changes

Apply commits once. Pointer release only finishes a drag. Identity or coordinate-
no-op sessions create no command and preserve redo. Cancel restores captured
committed coordinates exactly and creates no revision, artifact, dirty-state or
history change. Escape cancels the complete unapplied session.

Selection replacement, actual inspector-task changes, project changes and
conflicting project operations discard an unapplied preview before proceeding.
Show clear discard feedback. Merely collapsing the inspector or closing its
mobile drawer retains the session so the canvas remains usable; the viewer banner
keeps Apply/Cancel accessible. Disable viewer picking, including empty-space
clearing, and suspend other camera-changing interactions except permitted zoom.
Restore normal controls and dispose listeners on exit.

During submission prevent duplicate Apply and conflicting session actions. Stale
revisions invalidate preview and refresh its captured project. Ambiguous transport
failures require reconciliation before retry: never replay against a refreshed
revision automatically. Late responses, cache updates, notices and focus follow
captured project ownership under D-074. Obsolete async loads or frames must not
restore a cancelled session or overwrite a committed pose.

### Surfaces and measurements

Affected surfaces and dependent pocket surfaces pause during preview. Commit or
cancel restores/regenerates them from appropriate coordinates. Preserve existing
definitions, profiles, colors, membership and resource/cancellation bounds; never
render obsolete geometry as current. Preview-dependent measurement displays must
update correctly or be visibly suspended until restoration. Keep unrelated entries
and representations stable. No per-drag surface jobs or normalized refetches.

## Data, migration, API and ownership implications

Add the proposed typed endpoint:

```text
POST /api/v1/projects/{project_id}/selection-transform
```

The request contains `expected_revision`, canonical `selection`, finite
`rotation_matrix` and finite affine `translation`, with `x′ = R x + b`.
The client calculates `b = c + t − R c`. Submit a rigid transform rather than
arbitrary replacement atom coordinates.

The backend validates the complete selection, same-project membership, stable
atom IDs, locks, finite coordinates and proper rotation before publication.
Require orthonormality and determinant +1 with a documented numerical tolerance;
reject scaling, shear, reflection and nonfinite inputs rather than silently
correcting them. Validate and prepare the whole batch before publishing/recording
its atomic project change. Existing artifact transaction guarantees still apply.

Reuse `coordinates.transform`, `entry.coordinates` forward/inverse actions,
immutable artifacts, `ProjectRead` and per-entry coordinate patches. Do not
introduce a second history vocabulary. The numerical single-entry endpoint and
its X-then-Y-then-Z Euler semantics remain unchanged. Client/server contracts must
be typed and verified together using the repository's current client conventions.

No database migration is planned: Alembic head remains 0013 and API, project,
archive and normalized schema majors remain 1. No persisted draft/session/viewer
field is needed. TanStack Query remains the authority cache; previews never
mutate authoritative cached structures. Session coordinate snapshots are temporary
operation inputs, not a second durable molecular store.

Archives remain current-state snapshots without portable command history. Applied
coordinates export normally; previews never export or become job inputs. Existing
submitted jobs keep their immutable artifact snapshots. Original files remain
byte-identical and downloadable. Verify previous 0.10.0 readers against retained
coordinate actions and artifacts before claiming rollback compatibility.

## Scientific implications and non-goals

Rigid movement preserves distances within the captured selection in each
conformer. Unselected coordinates remain exact. Stable identity, bond topology,
charges, hierarchy, classification and source warnings remain unchanged.

Moving a partial covalent selection can distort bonds to stationary atoms and
create clashes. Show an unconstrained-editing explanation and identify known
crossing bonds where source connectivity permits. Missing connectivity is not
evidence of chemical safety. This feature does not validate a binding pose,
perform docking, or constitute protein preparation. No automatic alignment,
periodic geometry, conformation optimization, restraints, snapping or repair.

## Milestones and checkpoints

Every checkpoint leaves existing workflows operational, records actual evidence
and commits only after focused validation passes. Run relevant Python/frontend
lint, type checks, tests, production build and browser regressions at each
milestone boundary. Fix failures before advancing. No empty checkpoint commits.

### M1 / C1 — Validated atomic rigid-transform command

Outcome: an executable API transforms an exact selection across entries through
one reversible command.

Affected areas: core transforms, API schemas/routes/coordinate service, history
integration, typed client and domain/API tests.

Acceptance:

- Proper rotations only; stable-ID gaps resolve correctly.
- Same world-space matrix across conformers and entries.
- Exact unselected-state and original-byte preservation.
- One revision/history operation and complete undo/redo.
- Whole-batch rejection for invalid targets or stale revisions.
- No-op handling preserves history and redo.

Focused validation:

```bash
.venv/bin/uv run pytest tests/unit/test_transforms.py tests/unit/test_history.py tests/integration/test_coordinate_commands.py
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
corepack pnpm --dir apps/web typecheck
```

Documentation/migration: API contract and architectural decision; update plan
evidence and PROGRESS. No migration.

Expected commit: `feat(transform): add atomic selection rigid transforms`.

Compatibility/rollback: numerical endpoint unchanged; existing coordinate action
readers retained. Revert endpoint exposure without stripping scientific data.

### M2 / C2 — Application-owned preview session

Outcome: independently tested capture, composition, preview, cancel and Apply
orchestration.

Affected areas: transform math, transient session ownership, selection guards,
query-cache integration, multi-entry preview plumbing and component/store tests.

Acceptance:

- Immutable originals and captured target; no cumulative coordinate drift.
- Centroid and translated-pivot semantics.
- Correct screen/depth mapping in perspective and orthographic modes.
- No authoritative cache mutation during preview.
- Submission, no-op, failure and late-response behavior.
- Existing numerical/sliding transforms continue to work.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- transforms history interactive-transform
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
```

Documentation/migration: session ownership, cancellation policy and progress/
evidence. No persisted draft or migration.

Expected commit: `feat(transform): add captured movement preview sessions`.

Rollback: remove transient orchestration; existing commands/numerical work remain
usable. No placeholder production controls are introduced by this checkpoint.

### M2 / C3 — Complete viewer interaction workflow

Outcome: users activate Move selection, drag, zoom, Apply/Cancel and return to
normal navigation.

Affected areas: viewer interface/lazy adapter/engine, interaction bindings,
Transform panel, viewer banner, gesture controls, highlighting, surface/
measurement lifecycle and native browser tests.

Acceptance:

- Real pointer rotation, pan and depth alter preview coordinates.
- Camera orientation/target remain fixed; only permitted zoom changes.
- Picking and secondary-focus behavior cannot retarget or reframe.
- One Apply request across multiple drags.
- Cancel restores coordinates and normal bindings.
- Bounded pending preview work; obsolete frames cannot overwrite final state.
- Affected surfaces restore correctly.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- interactive-transform viewer-adapter viewer-interaction structure-loading
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/coordinate-editing.spec.ts \
  tests/e2e/viewer-click-selection.spec.ts \
  tests/e2e/viewer-controls.spec.ts
```

Documentation/migration: gestures and mode semantics in new `docs/TRANSFORMS.md`;
architecture/scientific-limitations updates and evidence. No migration.

Expected commit: `feat(viewer): enable interactive selection movement`.

Rollback: remove/disable launcher and restore normal bindings; committed poses
remain ordinary coordinate state.

### M3 / C4 — Lifecycle, accessibility, persistence and performance qualification

Outcome: the workflow is safe across task changes and usable through keyboard
and compact touch controls.

Affected areas: operation guards, mobile integration, focus/error feedback,
targeted unit/integration/browser tests and compatibility evidence.

Acceptance:

- Empty, locked, hidden, missing and stale targets explain availability.
- Project/selection/task changes cannot leak previews or feedback.
- Pointer cancellation, lost capture, disposal and remount restore coherent state.
- Keyboard/touch step controls share the Apply/Cancel transaction.
- Light/dark, desktop/Pixel 7, actual 100%/200% browser zoom, focus and scoped axe checks pass.
- Reload/reopen/API restart, save, export and archive import retain applied coordinates.
- Previous 0.10.0 readers handle retained coordinate actions and transformed artifacts.
- Existing surface/pocket and measurement regressions pass.

Focused validation:

```bash
.venv/bin/uv run pytest tests/integration/test_coordinate_commands.py \
  tests/integration/test_archive_roundtrip.py tests/security/test_archive_safety.py
corepack pnpm --dir apps/web test -- interactive-transform selection structure-loading
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/selection-surfaces.spec.ts \
  tests/e2e/pocket-surfaces.spec.ts \
  tests/e2e/measurements.spec.ts \
  tests/e2e/export-archive.spec.ts \
  tests/e2e/release-hardening.spec.ts \
  tests/e2e/rebranding-zoom.spec.ts
```

Performance evidence uses ordinary 1STP/ligand workflows: no command per pointer
event, no normalized refetch during preview, at most one active renderer update
plus its latest pending state, preview response and coordinate cancellation under
500 ms, and longest main-thread task below the existing 750 ms budget on the
pinned host. Measure surface regeneration completion separately. These are host
regression gates, not hardware-independent throughput or physical-phone promises.
Failure to meet accepted budgets blocks advancement; never quietly weaken them.

Documentation/migration: TRANSFORMS, ACCESSIBILITY, PERFORMANCE,
SCIENTIFIC_LIMITATIONS, VERIFICATION, feature plan and PROGRESS. No migration.

Expected commit: `test(transform): qualify movement lifecycle and compatibility`.
Use separate substantive `fix(transform)` commits for consequential corrections.

Compatibility/rollback: qualify the preceding reader with retained history and
transformed artifacts in an isolated environment. Remove transient controls
without stripping history, settings or coordinates; correct any discovered
incompatibility before claiming downgrade safety.

### M3 / C5 — Reviewed release candidate

Outcome: fully validated candidate with consistent versions and scope-accurate
release documentation.

Affected areas: five version sources, current producer assertions, compatibility
matrix, release notes and verification/progress/completion records.

Acceptance:

- Every accepted requirement has evidence.
- Complete candidate gate passes with no unexplained flakes.
- Full-diff review has no consequential unresolved finding.
- Version values agree.
- Preserve older archive coverage and add 0.10.0 producer provenance.

Focused validation: version consistency, archive tests and documentation review,
followed by the complete gate below.

Documentation/migration: release and compatibility notes, current evidence and
plan/progress records. No schema migration is planned.

Expected commit: `chore(release): prepare v0.11.0`.

Rollback: corrective commits or a subsequent release; never retarget a published tag.

## Acceptance and verification evidence

Record command, commit, environment, result counts, skips, warnings and attached
evidence. Compare backend coordinates and artifact identities: canvas movement
alone does not prove persistence. Test invariants independently of the
implementation's transform formula, including pairwise distances, determinant,
unselected coordinates, all conformers and immutable originals.

Use API rejection/atomicity/history tests, pure session/math tests, component
lifecycle/accessibility tests and real WebGL workflows. Demonstrate the ligand in
a protein complex, a partial fragment/residue and multi-entry selection. Include
both camera projections, zero-change movement, failures/conflicts, preview
surfaces/measurements and normal picking/navigation after exit.

At planning approval, no implementation validation had been executed. Historical
release results remain baseline evidence; subsequent checkpoint evidence is
recorded in the progress log below.

Run the complete release gate before opening and merging the PR and again on the
exact merged master commit before publication:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<dedicated-qualification-directory> .venv/bin/uv run alembic upgrade head
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

Replace the qualification-directory placeholder with a fresh dedicated path;
it is not a literal shell argument. Use isolated browser ports/data where needed,
record overrides and ensure any reused server runs the candidate code. Preserve
the documented project-local Python environment and pinned dependency graph.

## Decisions and deviations

Approval explicitly accepts these departures/clarifications from the brief:

- A captured multi-entry atom selection is one target and one atomic command.
- Rotation uses the captured centroid carried by translation, rather than
  orbiting a permanently fixed original world location.
- Task/selection changes discard uncommitted movement automatically with feedback;
  collapsing the inspector/mobile drawer alone retains it.
- Matrix transport avoids decomposing continuous gestures into Euler inputs while
  preserving the existing numerical endpoint and persisted action vocabulary.
- Depth and accessible step controls deliver complete movement without a generic
  manipulator framework. The optional pivot marker, extra launcher and readout
  are not release requirements.

D-075/D-076 are the cross-project architectural source of truth. Record subsequent
deviations here and append decisions when material; changes to approved outcomes,
scientific semantics, compatibility or gates require explicit user approval.

## Version and release plan

Advance **0.10.0 to 0.11.0**, a minor release:

- Adds meaningful public functionality and an additive API, exceeding a patch fix.
- No planned breaking API, persisted schema, archive or history change requires a major increment.
- Existing releases are stable; use a normal release only after qualification,
  not a prerelease merely to bypass incomplete work.
- Pre-1.0 numbering does not excuse incompatible scientific data.

Update all five authoritative version sources together during C5:

1. `pyproject.toml`.
2. Root development-project version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update current assertions and notes; retain historical release records and
archive producer coverage. Do not invent a root JavaScript package version or
upgrade unrelated dependencies. Recheck version/tag/release availability and
record ordinary sequencing changes before delivery. No version bump occurs in
this documentation-only planning commit.

Proposed annotated tag: **`v0.11.0`**, only from the verified merged master commit.

Release-note sections:

1. Workflow highlights and example.
2. Gestures and target/pivot semantics.
3. Apply, cancel and history.
4. Scientific limitations.
5. Keyboard/touch behavior.
6. API, persistence and compatibility.
7. Verification and review evidence.
8. Deferred scope and remaining limitations.

## PR, merge, issue response and branch cleanup

Use `feat(transform): add interactive selection movement` and a normal merge
commit preserving passing checkpoint history. Document implemented, simplified,
deferred and rejected requirements, compatibility, exact evidence and remaining
limitations. Use `Closes #4` only when the approved contract is complete. Merge
may close the issue before publication; the final reply follows verified release.

Review the complete diff, address consequential findings and distinguish local
from independent review. Recheck required reviews/checks, protection and unresolved
conversations; bypass none. After merge, fast-forward local master, verify the
remote merged SHA and run the complete gate on that exact commit. Only then create
the annotated tag and GitHub release. Verify annotation, target, non-draft release
and published evidence remotely before claiming publication.

Post a scope-accurate issue reply after publication. Create follow-up issues only
for concrete unresolved work; optional ideas do not automatically become backlog
commitments. Delete and verify only this feature branch locally/remotely after
delivery; leave unrelated branches unchanged.

Merge blockers: incorrect target/geometry, partial batch commits, broken cancel/
history, camera/selection leakage, stale surfaces/measurements, accessibility
failures, missed performance gates, incompatible archives/history, inconsistent
versions, failed checks, unexplained flakes, consequential unresolved findings
or unmet live repository policy.

Release blockers additionally include failed exact-merged qualification,
unverified merged SHA, version/tag collision, incorrect tag target or incomplete
publication evidence. Do not bypass blockers or silently reduce accepted scope.

## Progress and completion log

| Checkpoint | Status | Evidence / next action |
|---|---|---|
| Planning inspection and review | Complete | Repository remained read-only until explicit approval; baseline and scope evidence above |
| Approval | Complete | User: "I approve this plan." on 2026-10-09; all proposed product choices accepted |
| Planning persistence | Documentation prepared on dedicated branch | Master fast-forward-only check was already current; clean base verified; this plan is the first branch file change; commit/push identity is recorded by Git and handoff report |
| Planning documentation verification | Complete | Required sections/five checkpoints/local links/exact three-file scope passed; staged diff whitespace check passed; global PLAN and all five version sources unchanged |
| M1 / C1 | Complete | Atomic batch endpoint, proper rotations, all-conformer stable-ID transforms, one history command, no-op/rejection invariants; evidence below |
| M2 / C2 | Complete | Copied capture, quaternion pose, multi-entry patches and independently tested Apply/cancel/context/response orchestration |
| M2 / C3 | Complete | App-owned activation, gestures/steps, camera/selection suspension, bounded multi-entry rendering and native surface/error restoration; evidence below |
| M3 / C4 | Pending | Lifecycle/accessibility/persistence/performance qualification |
| M3 / C5 | Pending | Reviewed release candidate and coordinated version bump |
| PR/review/merge/exact-merged gate | Pending; authorized by subsequent `/goal` | Run after C5 qualification |
| Publication/issue response/cleanup | Pending; authorized by subsequent `/goal` | Verified release and scope-accurate closeout |

### 2026-10-09 — Implementation authorization and M1/C1

The subsequent `/goal` authorizes implementation and the full delivery workflow;
the historical planning-only handoff above remains an accurate approval record.
Planning commit `b0e26a91bfc84ee861ee58a01737810351f4037e` was pushed and verified.
All implementation is on the planned feature branch.

Added the typed additive selection-transform endpoint and client. Every target is
validated before publication; matrices reject shear, scaling and reflection.
Selected stable IDs transform in every conformer with unrelated coordinates,
connectivity and original upload bytes preserved. One batch produces one command;
undo/redo restores immutable snapshots. Identity preserves redo and creates no
revision or artifact. D-077 records validation/no-op precision. No migration or
version change.

Focused evidence:

- `.venv/bin/uv run pytest tests/unit/test_transforms.py tests/unit/test_history.py tests/integration/test_coordinate_commands.py`: **31 passed**.
- `.venv/bin/uv run ruff check .`: passed.
- `.venv/bin/uv run mypy apps/api packages/molweave_core`: passed, 54 source files.
- `corepack pnpm --dir apps/web typecheck`: passed.

M1 boundary evidence:

- `.venv/bin/uv run pytest`: **396 passed**, including migration upgrade/downgrade and archive coverage; 237 existing Alembic deprecation warnings.
- `corepack pnpm --dir apps/web lint`: passed.
- `corepack pnpm --dir apps/web test`: **134 passed / 33 files**.
- `corepack pnpm test:dev`: **8 passed**.
- `corepack pnpm --dir apps/web build`: passed; existing large lazy-bundle advisory remains.
- `PLAYWRIGHT_BROWSERS_PATH=.playwright MOLWEAVE_E2E_API_PORT=8210 MOLWEAVE_E2E_WORKER_PORT=8211 MOLWEAVE_E2E_WEB_PORT=5373 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue4-m1-e2e corepack pnpm exec playwright test tests/e2e/coordinate-editing.spec.ts`: **1 desktop passed / 1 intentional mobile skip**, fresh migration through 0013.
- `git diff --check`: passed. Local checkpoint diff reviewed for atomicity,
  scientific invariants, stable-ID handling and accidental scope expansion.

Known limitations: interactive preview/UI and previous-release reader qualification
are pending; existing numeric browser workflow is preserved. No blocker.
**Next action: M2/C2 application-owned session.**


### 2026-10-09 — M2/C2 captured session boundary

M1/C1 committed as `e12bf71`. Added copied multi-entry capture and immutable-original
preview math, including hidden count and known crossing covalent bonds. Screen-plane
and depth deltas use the camera basis and perspective pivot depth or orthographic
view span. Quaternion composition is normalized, tested after 10,000 gestures, and
transported directly as a proper matrix. The pivot is the translated captured
centroid. No Euler conversion or cache mutation.

The app-owned `MovementSession` boundary uses injected authoritative load/commit/
cache ports. It prevents duplicate Apply, invalidates obsolete loads, guards the
captured context, preserves captured revision during retries, reconciles ambiguous
responses and routes late results only to the captured project. Failed reconciliation
blocks further movement until a read-only refresh succeeds. The viewer launcher
and actual React/cache/gesture wiring remain C3 work; no placeholder UI was added.

Evidence:

- `corepack pnpm --dir apps/web exec vitest run src/test/transforms.test.ts src/test/history.test.tsx src/test/interactive-transform.test.ts`: **25 passed** (20 new session/math cases).
- `corepack pnpm --dir apps/web lint`: passed.
- `corepack pnpm --dir apps/web typecheck`: passed.
- `corepack pnpm --dir apps/web build`: passed; existing bundle advisory unchanged.
- Local diff review covered scientific composition, copied input ownership, stale
  contexts, cancellation and ambiguous-response safety. No persisted field,
  migration, version change or new product decision. `git diff --check` passed.

No blocker. Next action: M2/C3 full viewer integration, then M2 boundary gates.


### 2026-10-09 — M2/C3 viewer workflow and M2 boundary

C2 committed as `9799f20`. Move selection now activates from Transform, with an
app-owned session surviving inspector/drawer closure. The viewer banner names the
captured atom/hidden counts, scientific limits, Rotate/Translate/Depth, bounded
sensitivity, keyboard/touch steps, zoom, Apply and Cancel. Pointer release keeps
preview. Inspector task and selection/project changes discard the session; project
mutations guard submission/reconciliation. No persistent session or settings field.

The adapter suspends picking and restores trackball bindings, including on disposal.
A held camera permits explicit zoom only. Availability reads live rendered bounds,
including surface-only geometry and hydrogen/isolation preferences. Inherited
surfaces and fragment/dependent pocket channels pause before coordinate updates;
transient target cues preserve inspectability and measurements pause visibly.
One active preview batch plus the latest pending frame prevents unbounded work and
starvation of later entries. Commit drops obsolete previews; cancellation restores
base coordinates. Renderer failures remain visible while later restoration commands
can recover from rejected predecessors. Older late API results cannot overwrite a
newer cached project revision. D-078 records these boundaries.

Native Chromium/SwiftShader and Pixel 7 emulation compare actual model coordinates
with expected proper-rotation patches, preserve camera target/orientation in both
projections, permit zoom, restore exact originals and inherited/fragment-only
representations, and recover after an explicitly rejected invalid stable-ID patch.
The UI journey captures hidden multi-entry targets, previews multiple gestures and
steps without writes, cancels exactly, applies one reversible batch and preserves
unselected atoms and visibility. No schema/migration/version change.

Focused and milestone evidence:

- `corepack pnpm --dir apps/web exec vitest run src/test/interactive-transform.test.ts src/test/interactive-transform-queue.test.ts src/test/viewer-adapter.test.ts src/test/viewer-interaction.test.ts src/test/structure-loading.test.tsx`: **41 passed**; the final complete frontend rerun also covers all these cases.
- `.venv/bin/uv run ruff check .`: passed.
- `.venv/bin/uv run mypy apps/api packages/molweave_core`: passed, 54 files.
- `.venv/bin/uv run pytest`: **396 passed**, including migrations/archives; 237 existing Alembic advisories.
- `corepack pnpm --dir apps/web lint`: passed.
- `corepack pnpm --dir apps/web typecheck`: passed.
- `corepack pnpm --dir apps/web test`: **158 passed / 35 files**.
- `corepack pnpm test:dev`: **8 passed**.
- `corepack pnpm --dir apps/web build`: passed; existing large-bundle advisory remains.
- `PLAYWRIGHT_BROWSERS_PATH=.playwright MOLWEAVE_E2E_API_PORT=8210 MOLWEAVE_E2E_WORKER_PORT=8211 MOLWEAVE_E2E_WEB_PORT=5373 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue4-c3-e2e corepack pnpm exec playwright test tests/e2e/interactive-selection-transform.spec.ts tests/e2e/coordinate-editing.spec.ts tests/e2e/viewer-click-selection.spec.ts tests/e2e/viewer-controls.spec.ts`: **12 passed / 8 intentional layout skips**, final frozen source run, no failed/flaky cases.
- Local checkpoint diff reviewed for ownership, scientific semantics, queue
  ordering, visibility, disposal and recovery; `git diff --check` passed.

Earlier development attempts found a mobile test that needed to reselect the
Transform tab after Cancel/remount, a TypeScript harness iteration error, and one
invalidated navigation run caused by editing Vite source during tests. All are
corrected; gates were rerun against frozen final source. These are not unexplained
flakes or omitted failures.

Known limitations: complete task/failure/focus/touch/zoom/axe qualification,
performance budgets, persistence/restart and 0.10.0 reader compatibility remain
M3/C4 work. No current blocker. Next action: M3/C4 qualification, followed by C5
version/release preparation and full delivery gates.

### 2026-10-09 — C4 correction: focus and competing controls

Qualification exposed lost keyboard focus after movement exit and inherited CSS
that reduced Rotate/Translate/Depth targets to 31 px. Exit now restores the
connected launcher, or the visible Fit all visible action when closing the mobile
inspector removed that launcher. Restoration respects current project ownership
and does not steal focus from a context-changing action. Movement buttons and the
sensitivity input have 44 px targets. Numerical transforms and superposition are
disabled for the captured interactive session so they cannot introduce competing
previews. No persisted data or migration changed.

The component test checks keyboard steps, exact launcher focus, Cancel and one
Apply; the loading regression proves reconciliation without response patches
loads the changed artifact. Browser tests cover scoped WCAG 2/2.1/2.2 axe rules,
light/dark, desktop keyboard and Pixel 7 touch, interrupted committed response
without replay and unknown-outcome blocking until explicit refresh.

Evidence: isolated browser command with ports 8210/8211/5373 and data directory
`/tmp/neistra-issue4-c4-controls`, `playwright test
tests/e2e/interactive-selection-transform.spec.ts --grep
'keyboard/touch|interrupted response|outcome is unknown'`: **6 passed**, zero
failed/flaky, final frozen source. Earlier 31 px and hidden fallback-focus failures
were corrected before this run. Focused Vitest controls/session/loading/numeric
tests: **37 passed / 4 files**. Frontend lint, typecheck and build passed.
Local diff review and `git diff --check` passed. Remaining C4 compatibility,
lifecycle, zoom and performance qualification is still pending; this correction
does not mark C4 or M3 complete.

### 2026-10-09 — C4 correction: visible heading and context feedback

Visual inspection found the movement heading behind the viewer status badge.
The banner now starts below that badge, with its three modes on one row and a
bounded scroll area. Real browser-zoom checks independently assert nonoverlap,
44 px targets, reachable controls, keyboard movement, focus and scoped axe at
100%/200% in both themes. Native full-surface screenshots were inspected at all
four combinations: [light 100%](../assets/interactive-selection-transform/c4-light-100.png),
[light 200%](../assets/interactive-selection-transform/c4-light-200.png),
[dark 100%](../assets/interactive-selection-transform/c4-dark-100.png),
[dark 200%](../assets/interactive-selection-transform/c4-dark-200.png).
At 200%, the banner scrolls internally; Apply/Cancel and every step remain reachable.

Project changes now clear previous-project feedback and explicitly explain
discarded unapplied movement. A submitted/unknown operation instead explains
that its captured project must be reopened and checked; no recall or replay is
claimed. Recovery notices cannot overwrite that immediate context-change feedback.
This applies D-074's existing ownership rule; no new persisted field or migration.

Evidence:

- Frontend lint/typecheck/build passed; focused controls/session/queue/workspace/
  numeric tests: **31 passed / 5 files**.
- Frozen `playwright test tests/e2e/interactive-selection-transform.spec.ts --grep
  'discards previews|canceled or lost|stale Apply|explains empty'`, ports
  8210/8211/5373, `/tmp/neistra-issue4-c4-context`: **8 passed**, zero failed/flaky.
- Real desktop zoom workflow with corrected heading: **1 passed**; mobile zoom
  intentionally skipped because Pixel 7 qualification is separate.
- Local diff review and `git diff --check` passed.

Diagnostic attempts exposed a test-created destination absent from an already
cached project list and an ambiguous locked-target locator matching the existing
numerical-control warning. Test setup now creates both projects before loading
the list and uses the specific movement error. The final frozen rerun above passes.
Full C4 qualification and M3 release gates remain pending.

### 2026-10-09 — C4 correction: modal focus and Escape ownership

Full interaction review found the global movement Escape listener intercepted
modal/drawer dismissal. Movement now leaves initial focus inside an open modal
and defers Escape to it; after closing that panel, workspace Escape cancels the
entire preview. Non-modal palettes are not treated as modal owners. Native Radix
dialogs omit `aria-modal`, so the guard covers their dialog role as well as the
explicit mobile drawer. TRANSFORMS documents this established keyboard behavior.

Evidence: controls/session Vitest **22 passed / 2 files**, frontend lint/typecheck/
build passed. Frozen browser `interactive-selection-transform.spec.ts --grep
'keyboard/touch'`, ports 8210/8211/5373, `/tmp/neistra-issue4-c4-modal`:
**2 passed**. Both themes/layouts verify Projects Escape, mobile inspector Escape
retaining movement, scoped axe, touch/keyboard movement and final Cancel focus.
The initial overly narrow `aria-modal=true` guard failed the real Radix dialog
test and was corrected before this passing run.

Additional workflow qualification verifies applied hidden multi-entry coordinates
after reload (**2 passed**) and no-op history/artifacts, visible measurement pause,
unapplied disposal/reload, changed reference distance after Apply, checkpoint and
reload (**2 passed**, `/tmp/neistra-issue4-c4-lifecycle`). An initial measurement
fixture expected 200 instead of its documented creation status 201; corrected and
rerun. Local diff review and `git diff --check` passed. No migration or scientific
semantics changed; complete C4 regression/performance gates remain pending.

### 2026-10-09 — C4 performance correction: transient cue shader

Native qualification distinguished actual coordinate-restoration completion from
an animation-frame polling delay. A test-only coordinate observer records exact
restored model state before subsequent surface work; it does not alter renderer
behavior. The first preview still exceeded the unchanged accepted budget:
**1,050.7 ms preview / 981 ms task**. Optional CDP CPU profiling identified
sphere-impostor shader finalization in the transient cue's scene commit; coordinate
updates themselves took 82.5 ms in that diagnostic run.

Transient cues now use small detail-zero mesh spheres, sharing the ordinary mesh
rendering path. The same params apply when visibility/isolation rebuilds a preview.
D-079 records the reason. Normal saved styles, hidden bounds, scientific state,
selection identity and complete Apply/Cancel semantics are unchanged.

Frozen unprofiled desktop qualification with ordinary RCSB 1STP (1,001 atoms),
ports 8210/8211/5373, `/tmp/neistra-issue4-c4-profile`, output
`/tmp/neistra-issue4-c4-mesh-results`, `playwright test
tests/e2e/interactive-transform-performance.spec.ts --project=chromium`: **1 passed**.
[Raw evidence](../assets/interactive-selection-transform/c4-performance.json):
protein-fragment preview **91 ms**, exact cancellation **16.2 ms**, longest task
**75 ms**; bound biotin (16 atoms) preview **30.5 ms**, cancellation **19.2 ms**.
Forty submitted frames render only the first and latest, with one active operation;
no normalized fetch, command or job request. Surface coordinates restore in
**16 ms**; inherited-surface regeneration completes separately at **1,047.1 ms**.
No CPU profiler, concurrent build or competing qualification ran during this
passing timing run. Full C4 regression and M3 release qualification remain pending.

The corrected cue also passes native both-projection/surface-only exact-restoration
workflows in desktop and Pixel 7 (**2 passed**, `/tmp/neistra-issue4-c4-cue`).
Queue/adapter/loading Vitest **19 passed / 3 files**; frontend lint/typecheck/build
pass. Local diff review and `git diff --check` pass. The test-only observer and
optional profiler stay outside production imports. No new scientific/rendered
surface profile, migration or compatibility change.

### 2026-10-09 — C4 responsive viewer lifecycle correction

Review found that responsive layout reparents/disposes the viewer while the
application-owned movement session remains active. The new renderer previously
missed camera/binding capture before its first scene. D-080 retains a transient
workflow camera, restores it after initial scene synchronization, reacquires
bindings and prevents a disposed asynchronous mount from attaching listeners.

Frozen-source native regression command: `PLAYWRIGHT_BROWSERS_PATH=.playwright
MOLWEAVE_E2E_API_PORT=8210 MOLWEAVE_E2E_WORKER_PORT=8211
MOLWEAVE_E2E_WEB_PORT=5373 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue4-remount
corepack pnpm exec playwright test tests/e2e/interactive-selection-transform.spec.ts
--grep 'responsive viewer remounts' --output=/tmp/neistra-issue4-remount-results`:
**2 passed**, both directions. Actual application native coordinates/camera,
empty movement navigation bindings, no revision write and exact cancellation/
restored bindings pass. Frontend suite **162 passed / 36 files**, including
asynchronous adapter disposal; lint and typecheck pass. Production build passes (3388 modules). A test-only harness refactor initially
used iteration on Mol*'s array-like sorted set; typecheck caught this and the
existing index loop was restored before rerunning passing typecheck/lint/build. No migration or scope expansion.

### 2026-10-09 — M3/C4 qualification complete

C4's coherent outcome is qualified. The broad frozen-source browser run on
`f1b4c4b9ddf4a8e8541f8b21fffdeb819366edc0` passes **52 tests / 10 intentional
layout skips**, zero failures/flakes, including selection/pocket surfaces,
measurements, archives, accessibility, actual browser zoom and all movement
lifecycle cases present at that checkpoint. The subsequent D-080 remount
correction passes its two native regressions and frontend gates above; C5's
complete gate must qualify their combined final release source.

Exact broad command:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright MOLWEAVE_E2E_API_PORT=8210 \
MOLWEAVE_E2E_WORKER_PORT=8211 MOLWEAVE_E2E_WEB_PORT=5373 \
MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue4-c4-regression \
corepack pnpm exec playwright test \
 tests/e2e/interactive-selection-transform.spec.ts \
 tests/e2e/interactive-transform-performance.spec.ts \
 tests/e2e/selection-surfaces.spec.ts tests/e2e/pocket-surfaces.spec.ts \
 tests/e2e/measurements.spec.ts tests/e2e/export-archive.spec.ts \
 tests/e2e/release-hardening.spec.ts tests/e2e/rebranding-zoom.spec.ts \
 --output=/tmp/neistra-issue4-c4-regression-results
.venv/bin/uv run pytest tests/integration/test_coordinate_commands.py \
 tests/integration/test_archive_roundtrip.py tests/security/test_archive_safety.py
```

Focused Python **52 passed** (19.09 s), including the new same-SQLite API restart,
save, PDB/MOL export/reimport at format precision, exact archive state and original
uploads. Ruff passes. Native performance in the broader run: fragment/ligand
preview **151.1/36 ms**, exact coordinate Cancel **17.8/21.6 ms**, longest task
**133 ms**. Forty frames produce first/latest with one active renderer operation
and no projection, mutation or job requests. Full-surface coordinate Cancel
**16.4 ms**; separate restoration/regeneration **1022.5 ms**. Unchanged 500/750 ms
budgets pass. Raw evidence: [broad performance](../assets/interactive-selection-transform/c4-regression-performance.json).

Actual preceding reader `v0.10.0` (`cad24628d9221fef26f667eae4275ab23438841f`)
opens transformed candidate data, undoes/redoes the retained batch, saves/reexports,
and imports the archive with exact coordinates/original hashes and unchanged
completed jobs. Evidence: [C4 reader](../assets/interactive-selection-transform/c4-previous-reader.json).
Producer still reports 0.10.0 at C4; repeat with 0.11.0 provenance in C5 before
release. No migration; schema/action vocabulary unchanged. Executable isolated
qualification and commands are in DEVELOPMENT.md and
`tests/support/transform_reader_qualification.py`.

Acceptance evidence mapping:

| Acceptance | Evidence |
|---|---|
| Complete target/proper rigid pose/atomic history | C1 domain/API tests; C3 hidden multi-entry native workflow |
| Immutable preview/exact Cancel/no-op | C2 math/session tests; C3/C4 native coordinates, no-op and artifact/history tests |
| Conflict/failure/context lifecycle | C4 stale/unknown/interrupted-response/task/selection/project browser cases |
| Pointer cancellation/disposal/remount | C4 gesture tests; D-080 two-direction native and late mount unit regression |
| Surface/pocket/measurement lifecycle | Broad native suites, inherited/fragment cues and persisted measurement recalculation |
| Keyboard/touch/themes/zoom/focus | Both layouts, scoped axe; real Chrome 100/200 extension checks and inspected light/dark PNGs |
| Durable persistence/exports/archives | Same-SQLite restart test, browser reload/save/export/archive, actual previous reader |
| Bounded performance | Native completion observations, unchanged budgets, first/latest queue and raw measurements |

Limits: pinned Chromium/SwiftShader and Pixel 7 emulation only; no physical-device
or universal throughput claim. Surface regeneration separately measured. Partial
selection movement remains scientifically unconstrained; crossing-bond warnings
are explanatory, not geometry validation. Optional marker/launcher/gizmos,
alignment/repair/docking and persisted drafts remain outside approved scope.
No concrete follow-up blocker or speculative issue is created. C5 and remote
delivery remain pending; no current blocker.

### 2026-10-09 — C5 release preparation

Fetched `origin/master` remains `c53c3251e87db69c3eac6b81453f514bbaff0706`;
latest release/tag remains v0.10.0, no v0.11.0 collision. Additive public workflow
and API, unchanged schema/history/archive compatibility and stable release
sequencing confirm minor 0.11.0. All five authoritative sources agree; pinned
dependencies unchanged. Preserve preceding archive producer cases and add 0.10.0.
Focused archive/security gate **38 passed** (15.11 s).

Repeat actual preceding-reader qualification with fresh migration 0013 at
`/tmp/neistra-issue4-c5-reader-data`: candidate PYTHONPATH produces **0.11.0**
data/archive, detached v0.10.0 API/core/plugin PYTHONPATH reads it. Exact retained
batch redo is explicitly checked along with undo, saved state, originals, completed
jobs and current-state archive import. All pass; [C5 reader evidence](../assets/interactive-selection-transform/c5-previous-reader.json).
Commands follow DEVELOPMENT.md with the paths above and the existing
`/tmp/neistra-issue4-reader-010` detached worktree.

README, release notes and compatibility/user documentation describe accepted
scope and scientific/deferred limits. No migration or follow-up issue is needed.
Complete clean candidate gate and final full-diff review must pass before PR/merge;
exact merged gate must pass before annotated tag/release. Delivery remains pending.

### 2026-10-09 — C5 candidate gate diagnostic and zoom synchronization correction

Clean candidate `13ab3cff639602d6803cd61de96606282bb56d79` passes frozen installs,
fresh migration 0013, Ruff, mypy (54 source files), **398 Python, 162 frontend and
8 supervisor tests**, frontend lint/typecheck and production build. Full browser
run finishes **137 passed / 42 intentional skips / 1 failed**, zero configured
retries. This is rejected candidate evidence, not a passing release gate. Logs and
commands: `/tmp/neistra-issue4-candidate-gate/gate.json` and `browser.log`.

The actual Chrome zoom workflow pressed Escape seven milliseconds after observing
a newly ungrouped row, before that captured membership action's scheduled focus
restoration. The drawer handles Escape through its focused descendants; trace
shows the premature key failed to dismiss it. Add explicit assertions that the
menu is closed and the relocated row trigger has regained focus before checking
drawer Escape. No arbitrary sleep, retry, dropped assertion, relaxed budget or
production code change. Focused repeated real-zoom qualification follows, then the
complete gate repeats on a fresh clean candidate.

Local full-diff review also clarifies TRANSFORMS.md: scenes store presentation and
use current coordinates, not independent coordinate poses. Other reviewed areas
include proper matrix/scientific invariants, whole-batch/no-op/history semantics,
immutable artifact/job provenance, camera/visibility/surface/measurement ownership,
context/failure/remount lifecycles, accessible controls, bounded queue/performance,
archive/preceding-reader compatibility, version sources and approved scope.
Review is local, not independent. No unresolved consequential code finding remains.

Focused correction gate: `PLAYWRIGHT_BROWSERS_PATH=.playwright
MOLWEAVE_E2E_API_PORT=8210 MOLWEAVE_E2E_WORKER_PORT=8211
MOLWEAVE_E2E_WEB_PORT=5373 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue4-zoom-focus
corepack pnpm exec playwright test tests/e2e/rebranding-zoom.spec.ts
--grep 'real 100%' --project=chromium --repeat-each=2
--output=/tmp/neistra-issue4-zoom-focus-results`: **2 passed** (2.2 min), zero
failed/flaky cases. Both complete theme/actual-zoom sequences verify menu closure,
restored row focus and drawer Escape. `git diff --check` passes. The substantive
test/documentation correction is committed before clean complete requalification.
