# Issue #56 — Viewer notification timeout

## 1. Status, metadata, and approved outcome

**Status:** implementation in progress; M1/C1 and M2/C2 complete; M3/C3 pending.
The user approved the proposal on 2026-10-14 with “I approve the plan.”
The user authorized implementation and complete delivery through `/goal` on
2026-10-14. Historical C0 instructions below retain the planning-only stop.

- **Issue:** [#56 — Automatically dismiss viewer notifications after 10 seconds](https://github.com/ManuelSe/Neistra/issues/56).
- **Issue metadata:** open; created and last updated 2026-10-13 at 06:02:17 UTC;
  no comments, labels, assignees, or milestone at planning inspection.
- **Plan path:** `docs/plans/issue-56-viewer-notification-timeout.md`.
- **Base branch:** `master`.
- **Inspected and actual feature-branch base:**
  `d81650ee0939d03a673c2a48ea44904213a8dd2f`, matching `origin/master`.
- **Feature branch:** `fix/issue-56-viewer-notification-timeout`.
- **Planned release:** patch **0.13.2**, annotated tag **`v0.13.2`**.
- **PR title:** `fix(notifications): automatically dismiss transient viewer notices`.
- **Merge strategy:** normal merge commit, preserving passing checkpoint commits.

**Core problem:** indefinitely visible routine notifications clutter the
molecular workspace and require unnecessary manual dismissal.

**Approved outcome:** routine application notifications above the molecular
viewer expire after 10 seconds without affecting molecular state or viewer
interaction. Manual dismissal continues to work. Consequential messages remain
visible.

Explicitly approved scope interpretations:

1. Retain the current single-notification presentation. Each new notification
   receives a fresh lifetime; an older timer cannot dismiss its replacement.
   Simultaneously displayed notification stacks are excluded.
2. Use a conservative persistence policy. All errors, warning-bearing
   import/edit summaries, and guidance requiring inspection, retry, refresh, or
   reconciliation remain visible until dismissed or replaced under existing
   behavior. Presentation color is independent of lifetime.

## 2. Authority, inspection, and assumptions

Authority order: explicit user guidance and corrections; `AGENTS.md` and accepted
decisions; existing architecture, product boundaries, schemas, and conventions;
issue problems, outcomes, constraints, and non-goals; non-binding implementation
suggestions.

The approved proposal inspected `AGENTS.md`, `PRODUCT_SPEC.md`, global `PLAN.md`,
`PROGRESS.md`, `DECISIONS.md`, `VERIFICATION.md`, architecture and development
guidance, project/normalized/API contracts, migrations, generic jobs, frontend
ownership, relevant component and browser tests, related issues, Git branches,
tags, releases, PR conventions, GitHub configuration, and version sources.

Preserve accepted D-002, D-013, D-037, and D-084, along with existing viewer,
movement, and scientific-warning boundaries. [D-089](../DECISIONS.md#d-089--application-owned-notification-lifetime-and-conservative-persistence)
records the cross-project notification policy accepted with this plan.
The feature plan does not replace the decision log or global implementation plan.

### Baseline findings

- `apps/web/src/App.tsx` owns one `{ kind, text }` application notice. New notices
  replace it. Its renderer above the workspace already supplies Close/manual
  dismissal, `notice success`/`notice error` styles, and `status`/`alert` roles.
- Some success-styled notices contain chemistry/protein warnings or instructions
  to inspect an uncertain movement outcome. Their style cannot determine lifetime.
- Scientific warnings, viewer failures, API Retry controls, dialog errors, and
  job state also have separate displays with distinct owners and lifecycles.
- The notification is fixed-position presentation. Expiration needs no workspace
  layout redesign or renderer integration.
- `MovementSession.ts`, its hook, and job callbacks emit application notices.
  Their internal typed metadata may need a narrow extension; molecular command
  and transaction semantics do not change.
- TanStack Query owns server state, Zustand persists established workspace
  preferences, and Mol* is a disposable renderer. Notification lifetime belongs
  to transient React application state.
- Project, normalized, and archive schema majors remain 1; migration head is
  `0013`. No notification schema or durable notification store exists or is needed.
- The planning prompt's release-history premise is outdated. The verified latest
  stable release is [v0.13.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.13.1),
  published 2026-10-13, with annotated tag targeting
  `dfca45af3baac1e7395c6b39e73f93fc9651276f`. Current master adds delivery documentation.
- At inspection and approval recheck, no PR was open. GitHub inspection found no
  Actions workflows, rulesets, or protected-master requirements. All ordinary
  merge methods are enabled. Recent delivery uses normal merge commits.
- Release preparation is documented and manually executed with Git/`gh`; there
  is no repository release automation to extend for this correction.
- Related [#46](https://github.com/ManuelSe/Neistra/issues/46) and accepted D-084
  require consequential movement errors/outcomes to remain visible.
  [#55](https://github.com/ManuelSe/Neistra/issues/55) establishes the current
  verified scientific baseline. Ligand chemistry assignment remains separate
  [#52](https://github.com/ManuelSe/Neistra/issues/52); it is not reopened here.

## 3. Requirement disposition matrix

| Requirement | Classification | Approved treatment and follow-up |
|---|---|---|
| Transient viewer notifications disappear after 10 seconds | Essential | Apply one shared lifecycle to the application notice above the viewer. |
| Manual dismissal before timeout | Already satisfied by the repository | Preserve it and add timeout regression coverage. |
| Consistent timeout for every transient notification | Essential | Audit every application-notice producer; ordinary success/information confirmations use the same policy. |
| Messages requiring explicit action may remain visible | Supporting | Preserve errors and consequential guidance through typed lifetime metadata. |
| Multiple notifications have independent timers | Unclear and requiring a product decision — resolved by approval | Independent lifetimes for successive notifications in the existing single slot; no stale callback may dismiss a replacement. |
| Introduce simultaneous notifications to satisfy that criterion literally | Rejected as proposed | Adds stacking, layout, ordering, and accessibility behavior beyond this correction. No follow-up unless simultaneous display is desired. |
| Preserve existing behavior and styling otherwise | Essential | Retain replacement semantics, wording, position, colors, roles, and Close control. |
| Keep parsing, chemistry, conversion, and validation warnings visible | Essential | Persistent warning-bearing summaries; existing detailed displays retain their owners and records. |
| Safe cleanup and replacement handling | Supporting | Cancel obsolete timers, guard expiration by emission identity, clean up on unmount. |
| Keyboard-safe expiration | Supporting | Defer removal while focus is inside the notice; dismiss after focus leaves if its deadline passed. |
| Configurable duration, notification history, queues, animations | Optional | Excluded from this patch; no speculative follow-up issue. |
| Apply timers to every status/error display or Mol* vendor toast | Rejected as proposed | Progress, interaction coverage, scientific guidance, retry displays, and vendor feedback have distinct purposes/lifecycles. No follow-up needed. |

No significant issue requirement is silently deferred. The ambiguous concurrent
notification criterion is resolved explicitly above. Issue close-out must disclose
that interpretation rather than claim a simultaneous-notification implementation.

## 4. Accepted implementation scope and non-goals

Use a small typed React notification lifecycle integrated at the existing
application owner. A hook/component or equivalent maintainable typed module is
appropriate; a new dependency or global notification service is unnecessary.

### Lifetime contract

- Separate presentation (`success`/`error`) from lifetime
  (`transient`/`persistent`).
- Ordinary confirmations expire: project creation, checkpoint save, routine
  changes, successful organization, warning-free import/edit results, job
  submission, and cancellation requests. Routine informational recovery messages
  may expire while existing durable recovery/dirty indicators remain available.
- Errors, warning-bearing results, and action-required guidance are persistent.
  Audit every producer, including success-styled uncertain/reconciled movement
  outcomes and project-switch guidance.
- Producers declare exceptional lifetime explicitly. Do not match message text
  to infer lifetime or duplicate scientific-warning state into the notice system.
- Each emission, including repeated identical text, receives a fresh 10,000 ms
  lifetime. Its deadline begins when the notice is published for display.
- Unrelated renders, theme changes, and viewer remounts do not restart its lifetime.
- Replacement, dismissal, project-context changes, and application unmount
  invalidate obsolete callbacks. An old timer can never clear a newer notice.
- Browser timer throttling may delay removal; notices must never expire early.
- Preserve current replacement behavior, including replacement of persistent
  notices. Persistence prevents automatic timeout; it does not add a queue or
  change existing replacement/manual-dismissal behavior.
- Expiration never changes project revision, history, artifacts, coordinates,
  selection, camera, jobs, or scientific-warning records.
- Preserve existing visible wording, CSS position/colors, live-region roles,
  accessible names, and Close control.
- Do not automatically remove a keyboard-focused Close control. If the deadline
  passes while focus is inside the notice, defer removal until focus leaves.
  Manual dismissal leaves focus at a sensible connected workspace target without
  disturbing unrelated focus or bypassing modal/native input ownership.

Audit `App.tsx`, movement notice ports/hook, and job callbacks. Extend internal
callback metadata only where necessary to convey action-required guidance.

### Non-goals

No notification stack, history center, duration setting, queue, animation, broad
status-display rewrite, vendor toast alteration, new dependency, chemistry rule,
scientific calculation, molecular command, viewer API, or persisted preference.
No expansion of issue #52 or unrelated backlog scope.

## 5. Milestones and independently verifiable checkpoints

Every checkpoint leaves a coherent branch, records focused evidence and meaningful
changes, and uses a Conventional Commit. Never create empty checkpoint commits.
Fix validation failures before advancing. Keep historical evidence separate from
new results; do not report planned commands as passing checks.

### C0 — Persist approval and stop

**Outcome:** approved contract exists remotely on the dedicated branch, ready
for `/goal`.

**Affected areas:** this plan, concise `docs/PROGRESS.md` entry, appended D-089 in
`docs/DECISIONS.md`.

**Acceptance and sequence:**

1. Confirm clean working tree, fetch origin, switch to local master, and update
   using `git merge --ff-only origin/master`.
2. Confirm cleanliness again and recheck issue/release/base metadata. Amend the
   plan before dependent work if material changes invalidate the approved contract.
3. Create `fix/issue-56-viewer-notification-timeout`.
4. Write this approved plan as the first branch change; then add the project
   progress summary and append the accepted cross-project decision.
5. Inspect document links/metadata and staged diff; run `git diff --check`.
6. Commit exactly `docs(plan): add approved plan for issue 56`.
7. Push and verify the remote branch/commit if remote access is available.
8. Report exact plan path, branch, commit, approved milestones, and patch impact;
   stop without implementation.

**Documentation:** approval and C0 preparation log; concise current milestone,
completed documentation, verification, limitations, blockers, and next action.
Commit and remote verification are reported in the final planning handoff.
**Migration:** none.
**Rollback/compatibility:** documentation only; ordinary revert.

### M1 / C1 — Deliver the notification lifecycle

**Outcome:** the application uses the shared timeout policy with audited producer
classifications.

**Affected areas:** `App.tsx`, a small notification lifecycle module/component,
movement callback plumbing where needed, and component tests.

**Acceptance criteria:**

- A transient notice remains visible at 9,999 ms and disappears at 10,000 ms.
- Replacement and repeated-text emissions each receive a fresh deadline.
- Stale callbacks cannot clear a replacement; manual dismissal remains functional.
- Errors, warning-bearing successes, and action-required movement guidance survive
  time advancement; routine confirmations expire.
- Cleanup, application unmount, project context, and focused-notice behavior pass.
- Use fake timers for deterministic boundaries/races and React Strict Mode cleanup.
  Test producer classification separately from routine success behavior.
- No dependency, durable-state, molecular-command, or renderer authority change.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/notifications.test.tsx \
  src/test/project-workspace.test.tsx \
  src/test/interactive-transform.test.ts \
  src/test/jobs.test.tsx
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```

`notifications.test.tsx` is planned new coverage, not an existing implementation.

**Documentation:** producer classification evidence, results, limitations,
checkpoint completion in this plan and project progress.
**Migration:** none.
**Commit:** `fix(notifications): expire transient viewer notices after ten seconds`.
**Rollback:** revert UI lifecycle; indefinite notice behavior returns without
data conversion.

### M2 / C2 — Qualify actual user workflows

**Outcome:** browser evidence establishes expiration, persistence, accessibility,
and unchanged workspace behavior.

**Affected areas:** new `tests/e2e/viewer-notifications.spec.ts`, adjacent workflows,
verification/accessibility documentation, scoped evidence.

**Acceptance criteria:**

- Real application workflows cover automatic and manual dismissal, successive
  emissions, persistent errors and warning summaries, project changes, and
  responsive viewer remounts in desktop Chromium and Pixel 7 emulation.
- Include at least one real-time 10-second expiration check. Controlled clocks
  may cover additional boundary/race cases after asynchronous operations settle.
- Verify both themes, keyboard dismissal/focus behavior, scoped axe checks, and
  existing responsive bounds.
- Compare settled project state and request counts across expiration. Dismissal
  causes no project mutation, normalized-structure refetch, or viewer reinitialization.
- Existing movement, recovery, and failure workflows retain their behavior.

**Focused validation:**

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-notifications.spec.ts \
  tests/e2e/project-lifecycle.spec.ts \
  tests/e2e/release-hardening.spec.ts \
  tests/e2e/viewer-transform-toolbar.spec.ts
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```

**Documentation:** retain commands, source commit, environment, results, and
screenshots where needed under `docs/assets/viewer-notifications/`; update
`docs/VERIFICATION.md`, accessibility guidance, this log, and progress.
**Migration:** none.
**Commit:** `test(notifications): qualify timeout and persistent-message workflows`.
**Rollback/compatibility:** tests/documentation are additive; runtime correction
remains independently revertible.

### M3 / C3 — Prepare and qualify the patch release

**Outcome:** reviewed release candidate passes the complete gate and actual
preceding-reader compatibility qualification.

**Affected areas:** five version sources, version assertions, archive compatibility
tests, release notes, documentation and evidence.

**Acceptance criteria:**

- All authoritative versions agree on final 0.13.2; no unrelated dependency upgrade.
- Complete release gate passes on the clean candidate before opening the
  implementation PR and before merge.
- Actual tagged v0.13.1 reads final candidate data and archives; the current reader
  accepts preceding-release archives.
- Verify exact originals, coordinates, retained Undo/Redo, save/re-export, and
  completed jobs using `tests.support.transform_reader_qualification` with the
  final producer metadata and an actual detached v0.13.1 checkout.
- Review complete diff and resolve consequential findings/review conversations.
  Distinguish local review from independent review.
- Recheck live base, release/tag availability, protections, rulesets, checks,
  reviews, and unresolved conversations before delivery.

**Complete release gate:**

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=/tmp/neistra-issue56-release-gate \
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

Use fresh disposable qualification storage, not a user's project directory.
Record isolated browser ports/data overrides. Repeat the complete gate and reader
qualification on the exact merged master before release tagging/publication.

**Documentation:** release notes, compatibility/rollback guidance, full-diff review
findings, exact verification evidence, and completion log.
**Migration:** no new migration; verify head `0013` and schema majors 1.
**Commit:** `chore(release): prepare 0.13.2 notification timeout correction`.
**Rollback:** qualified v0.13.1 needs no downgrade; frontend reload restores its
previous notice behavior.

## 6. Data, migration, API, UI, science, accessibility, and performance

Notification lifetime stays in transient frontend state. There are no new database
fields, molecular-schema fields, archive contents, history commands, job contract
changes, persisted preferences, or public endpoint changes. API version metadata
advances with the release. Existing migrations and archive guards remain applicable.

The UI retains the current single slot, replacement behavior, fixed position,
wording, roles, colors, and Close control. A notice's color is not a statement that
its content is safe to hide. Persistent notices can still be manually dismissed
or replaced, matching existing behavior.

Scientific calculations and geometry are outside scope. Detailed warning records
remain available and warning-bearing popup summaries stay persistent. Timeout
cannot erase parsing/chemistry/validation warnings or conceal uncertain movement
instructions through generic success classification.

Accessibility qualification covers live-region roles, keyboard focus, manual
dismissal, expiration deferral while focused, and established modal/native input
ownership. Existing scientific/help displays remain accessible through their
current controls. Pinned browser emulation does not establish arbitrary-device
or cross-browser qualification.

Runtime cost is one active timeout for the current transient notice. No polling,
worker, molecular serialization, or viewer rebuild is introduced. Existing release
performance budgets and request-count checks remain mandatory. Background/browser
throttling can delay timeout callbacks and is documented rather than represented
as an exact wall-clock guarantee.

## 7. Decisions and deviations

- Approval resolves the ambiguous independent-timer criterion as independent
  successive-emission lifetimes in the current single visible slot. Do not claim
  simultaneous display or a notification queue.
- Preserve consequential information conservatively, including warning-bearing
  success notices. Presentation and persistence are separate typed concerns.
- Focused notices may remain after the nominal deadline to preserve keyboard
  interaction; no global duration preference is added.
- Keep lifetime outside project/API/archive/Mol* state. D-089 records this
  accepted policy alongside D-013/D-084, without rewriting accepted decisions.
- The release-history premise is corrected from remotely verified evidence;
  this patch continues the established stable version sequence.
- Material changes to scope, compatibility, or the approved outcome require a
  recorded amendment before dependent work. Routine implementation choices may
  use this contract and repository conventions without additional approval.

## 8. Version and release plan

**SemVer impact: patch 0.13.1 → 0.13.2.**

This corrects notification lifecycle behavior while preserving capabilities,
public API shapes, persisted schemas, and archive compatibility. The correction
does not introduce a new molecular/tool capability warranting a minor release.
No breaking contract warrants a major release. A prerelease is unnecessary once
qualification passes; incomplete qualification blocks stable publication.

Update all five authoritative sources in the implementation PR:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update relevant assertions without unrelated dependency upgrades. Root
`package.json` has no authoritative version field. Recheck baseline and tag
availability before preparation; revise the proposed version if another delivery
advances the baseline or occupies the tag.

**Proposed tag:** annotated `v0.13.2`, created only from the verified merged
master commit after its complete gate and reader qualification pass.

**Release-note sections:** Fixes; Notification lifetime and exceptions;
Accessibility; Data/API/archive compatibility and rollback; Verification and
limitations.

## 9. PR, merge, issue response, publication, and cleanup

- Open the implementation PR only after the clean candidate's complete gate.
  Title: `fix(notifications): automatically dismiss transient viewer notices`.
- Link this approved plan and describe delivered, simplified, deferred, and
  rejected requirements, explicitly including the single-slot interpretation.
- Use `Closes #56` only once the approved outcome passes. Do not claim the literal
  simultaneous-notification interpretation has been implemented.
- Review the full diff, resolve consequential findings and conversations, and
  distinguish local versus independent review. Recheck live protection/review/check
  requirements and never bypass them.
- Use a normal merge commit to preserve independently verified checkpoint history.
- Update local master fast-forward-only; repeat every complete release and reader
  qualification command on the exact merged commit before publication.
- Create and remotely verify the annotated tag, GitHub release, release notes,
  and published verification artifacts where applicable.
- Publish a final issue reply with timeout behavior, persistent exceptions,
  single-slot semantics, exact verified release links, and remaining scope.
- No new follow-up issue is proposed. A later simultaneous-notification request
  should receive its own product plan; do not create speculative duplicate issues.
- Record final delivery through the repository documentation workflow; verify
  all remote claims, delete this issue branch after delivery, and confirm clean
  local master. Preserve unrelated branches.

## 10. Merge and release blockers

Block delivery for:

- Early expiration, replacement/repeated-emission races, or timer cleanup failures.
- Loss of persistent warning/error/action-required guidance through timeout.
- Focus/accessibility or existing movement/input-ownership regressions.
- Expiration-triggered project mutation, molecular refetch, viewer reinitialization,
  or other scientific/viewer state changes.
- Failed focused, complete, performance, migration, or compatibility checks.
- Inconsistent version metadata or an unverified/colliding release target.
- Unresolved consequential review findings/conversations or unmet protections,
  required checks, or required reviews.

Known historical build/Alembic/environment advisories remain separately reported;
they do not excuse new failures. No implementation or release evidence is claimed
by this approved-plan commit.

## 11. Progress and completion log

### 2026-10-14 — Approval and C0 documentation preparation

- User explicitly approved the read-only proposal, including the single-notice
  interpretation and conservative persistent-message policy.
- Issue #56 remains open and unchanged; latest stable release remains v0.13.1;
  no open PR, existing issue branch, or v0.13.2 tag was found at approval recheck.
- Clean local master was fetched and updated using a fast-forward-only merge;
  actual base remains `d81650ee0939d03a673c2a48ea44904213a8dd2f`.
- Created `fix/issue-56-viewer-notification-timeout`; this plan is its first file
  change. Project progress and accepted D-089 accompany the plan commit.
- C0 documentation validation passed: staged `git diff --check`, all 36 local
  Markdown links across the three changed documents, 11 plan sections, balanced
  fences, approval/base/version metadata, unique D-089, and the exact three-file
  documentation-only scope. Runtime version remains 0.13.1. The first commit and
  remote verification are reported in the planning handoff; the exact first
  commit cannot embed its own final hash.
- M1/C1, M2/C2, and M3/C3 are approved and not started. No runtime tests, build,
  implementation PR, release tag, or release have been produced for this issue.
- Known limits: one visible notice; conservative persistent exceptions; browser
  timer throttling and keyboard-focus deferral can extend visible duration.
- Blockers: none identified for the documentation handoff.
- Next action: stop after committing/pushing/verifying C0; await `/goal`.

For every later checkpoint append its commit, verification commands/results,
environment/source identity, scope deviations, blockers, and next action. Keep
`docs/PROGRESS.md` concise; this document remains the detailed source of truth.

### 2026-10-14 — M1/C1 lifecycle implementation and focused qualification

- C0 commit `e14b8fea2f684b564de5d1fe991a781eb178cd93` was pushed and verified remotely.
- Added the application notice component with stable emission identity, one
  10,000 ms timeout, obsolete-callback guards, cleanup, keyboard-focus deferral,
  and modal-aware manual focus restoration. No CSS or scientific state changed.
- Producer audit: routine success/recovery/organization/save/style/superposition/
  job confirmations expire; all errors remain persistent. Import, ligand edit,
  and protein edit summaries use structured warning counts. Pending previous-
  project movement and reconciled-coordinate/history instructions are persistent
  through typed metadata; no text matching. Separate warning/status displays stay
  unchanged. Job result import has no warning-bearing popup or warning field in
  its response; its ordinary acknowledgment remains transient.
- [Exact commands, source hashes, results and limitations](../assets/viewer-notifications/c1-verification.json):
  38 focused tests, all 193 frontend tests, ESLint, TypeScript, production build,
  and diff checks pass. Actual App handlers qualify both warned and warning-free
  import/ligand/protein outcomes; movement reconciliation metadata is covered.
- Existing nonblocking lazy Mol* chunk warning remains 976.99 KiB gzip; initial
  application chunk is 178.53 KiB gzip. No dependency/version/migration change.
- Local checkpoint diff reviewed for ownership, warning retention, scope, cleanup,
  and focus. No consequential finding remains; no independent review claimed.
- Initial harness and lint failures were fixed before commit; they are not passing
  qualification evidence. C1 command logs are retained beside the JSON record.
- No blocker. Next action: M2/C2 native browser, accessibility, and state invariance.

### 2026-10-14 — M2/C2 browser and accessibility qualification

- C1 committed at `63a6662`. New native browser workflows cover real expiration,
  successive identical emissions/theme rerenders, warning/error persistence,
  keyboard focus/departure/manual dismissal, responsive remounts, and project
  changes. Actual project snapshots, camera/native coordinates, renderer mounts,
  and mutation/normalized-request counts remain unchanged across expiration.
- [Exact results/environment/timing](../assets/viewer-notifications/c2-verification.json):
  full focused browser gate passes 39 workflows with three intentional layout
  skips in 4.7 minutes, no failures/retries. Final notification evidence capture
  passes all 10 desktop/mobile workflows, no skips/failures/flakes. Scoped axe
  passes light/dark warning notices; adjacent shell, recovery, API Retry, native
  movement, focus, interruption, accessibility and performance workflows pass.
- Repeated milestone frontend gates pass ESLint, TypeScript, all 193 frontend
  tests, production build and diff checks. No product code changed after C1.
- README explains the user-visible lifetime and exceptions; accessibility guidance
  records focus behavior. Screenshots and exact command logs are retained beside
  the evidence JSON. Attachments use test output, preserving clean future gates.
- Initial browser harness diagnostics were resolved before qualification: wait
  explicitly for the native instrumentation mount and seed the switch target
  before navigation so the application's cached project list owns it. These are
  test setup fixes, not product behavior changes or passing evidence.
- Local checkpoint review found no scope expansion, schema/migration change,
  scientific mutation, or consequential regression. No independent review claimed.
- No blocker. Next: M3/C3 version preparation, complete candidate and actual
  preceding-reader gates, full-diff review, PR and verified release delivery.
