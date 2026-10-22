# Issue #93 — Compact molecular toolbar and quiet quick minimization

## 1. Status, authority, and intended outcome

**Status:** approved implementation complete; PRs#117/#118 normally merged.
C4 test-harness corrections and clean candidate4 pass complete qualification.
PR#119 is open; exact merged5 qualification remains before v0.24.1 publication.
No exception is assumed and no tag/release exists.

**Approval:** the user's “Implement the plan.” on 2026-10-22 approves the complete
proposal and its explicit C0 stop ready for `/goal`. This authorizes planning
persistence, not implementation or the subsequent delivery lifecycle.

| Item | Approved value |
|---|---|
| Issue | [#93 — Unify transform, editing, and minimization tools in a single compact toolbar](https://github.com/ManuelSe/Neistra/issues/93) |
| Issue state at C0 | Open; updated 2026-10-22T10:41:26Z |
| Plan path | `docs/plans/issue-93-compact-modeling-toolbar.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked local/remote base | `8ed344b018e005da785bc6aba565577ee4389f27` |
| Feature branch | `fix/issue-93-compact-modeling-toolbar` |
| PR title | `fix(viewer): unify molecular tools and separate minimization setup from execution` |
| Merge strategy | Normal merge commit, preserving passing checkpoints |
| Planned release | Stable **0.24.1** |
| Proposed annotated tag | **v0.24.1** |

**Approved outcome:** scientists have one compact group containing Transform,
Edit, and Minimize. Clicking Minimize opens setup without calculating. Ctrl+M
starts quick minimization without opening the panel or adding progress,
cancellation, or results displays.

The user's confirmed choices override the issue's older instruction to preserve
immediate minimization on icon click:

- Minimize opens setup; calculation requires an explicit Run action.
- Ctrl+M starts quick minimization and never automatically opens the panel.
- No additional progress, Cancel, or results UI is required for shortcut runs.
- Clicking Minimize during a shortcut run reveals that run without submitting
  another calculation. The user also allowed fresh setup as an alternative;
  revealing the existing run is the approved default, avoiding concurrency.
- Jobs → Inspect minimization remains an explicit report-opening action.

Authority follows the requested order: explicit user guidance;
[repository instructions](../../AGENTS.md) and accepted
[decisions](../DECISIONS.md); existing architecture and conventions; issue
outcomes; nonbinding technical suggestions. Preserve the global
[implementation plan](../PLAN.md).

Inspection covered PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS, VERIFICATION,
architecture, affected components and stores, APIs, schemas, migrations, jobs,
tests, related issues #46/#69/#82/#89/#92/#110, Git refs, releases, PR conventions,
and delivery tooling.

### Inspection findings and baseline evidence

- Session ownership, polling, preview, and automatic publication currently depend
  partly on panel visibility. Removing the settings icon alone would not satisfy
  the confirmed workflow.
- Molecular authority already belongs to normalized artifacts; minimization uses
  existing validated jobs and reversible coordinate commands.
- Alembic head is **0014**; project/viewer/archive schemas are **2**,
  normalized/selection schemas **1**.
- An established release history exists through stable
  [v0.24.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.24.0). Its annotated
  tag resolves to `afea0f19efc4cdfb7d1ee497df4a670a1e73a14c`; current master includes
  its documentation audit.
- All five application version sources contain `0.24.0` at C0.
- Remote inspection found no open PRs, GitHub Actions workflows, repository
  rulesets, or master protection. No dedicated release script or PR template was
  found. Recheck before delivery.
- The plan path, feature branch, and tag were unused before C0. After approval,
  `git fetch origin` and `git merge --ff-only origin/master` confirmed the same
  clean master base; the remote branch and proposed tag were still absent.

Read-only baseline validation passed:

```bash
corepack pnpm --dir apps/web exec vitest run minimization movement-navigation molecular-edit-panel
# 52 tests passed across three files; 4.06 seconds.

.venv/bin/python -m pytest tests/integration/test_archive_roundtrip.py -q
# 34 tests passed; 18.16 seconds.
```

These results establish the baseline, not completion of #93.

## 2. Requirement disposition

| Significant requirement | Classification | Treatment |
|---|---|---|
| One shared Transform/Edit/Minimize group | Essential | Exactly three launchers in that order in the normal idle workspace. |
| Remove Quick settings and Advanced AMBER toolbar icon | Essential | Remove the button, obsolete launcher reference, and launcher-specific focus state. |
| Retain settings and Advanced AMBER access | Essential | Access through Minimize's setup panel; retain explicit Jobs inspection. |
| Keep the group below selection controls | Already satisfied | Preserve its current placement. |
| Match Edit's desktop button size | Supporting | All three buttons become 32 × 32 CSS px with centered 16 px icons. |
| Shared background, border, and corners | Supporting | One group frame; remove launcher-specific chrome inside it. |
| Consistent spacing and interaction states | Essential | Shared launcher styles for hover, expanded/active, unavailable, and focus states. |
| Accessible names and tooltips | Essential | Preserve names; provide hover/focus tooltips and accurate unavailable explanations. |
| Larger mobile touch targets | Essential | All three controls become 44 × 44 CSS px on coarse pointers or widths ≤840 px. |
| Preserve every existing launch behavior | Rejected as proposed | Superseded by the user's explicit click/shortcut distinction. No follow-up needed. |
| Quiet Ctrl+M execution | Essential; explicit guidance | Execute and publish through the existing owning session without opening the panel. |
| Additional shortcut progress/Cancel/results display | Optional; omitted | User explicitly does not need it. No follow-up issue. |
| Preserve expanded transformation controls | Essential | Preserve the existing active-mode strip and availability rules; the three-launcher count applies to idle mode. |
| Preserve panel positioning and keyboard ownership | Essential | Keep bounded nonmodal panels, owned Escape, external focus, and remount-safe restoration. |
| Reuse the named container and existing components | Supporting | Use the existing composition and scoped styling; no general toolbar framework. |
| Desktop/mobile layout and workflow regressions | Essential | Verify dimensions, actual interactions, both themes, narrow layouts, and real browser zoom. |

No issue requirement remains unclear or is deferred. Chemistry expansion, new
minimization engines, broader editing work, and dependency upgrades remain outside
this issue; existing follow-ups retain their scope. No new follow-up issue is
planned. In particular, #83/#107/#114 retain their separate identity, renderer
maintenance, and chemistry-qualification boundaries.

## 3. Implementation contract and implications

### Shared toolbar

Reuse `.viewer-edit-transform-actions` as a named control group with ordinary Tab
navigation. Use one surface, border, existing radius token, 3 px padding, and 3 px
gaps. Buttons have transparent neutral backgrounds and no individual border.

Scope these styles to the three launchers. Preserve selection-toolbar styling and
active transformation controls. During transformation, retain the existing
expanded strip and hidden/disabled tool rules without adding a second frame
around it.

Keep current conditional rendering when a host does not supply a workflow; do not
introduce placeholder tools.

### Minimize setup and shortcut execution

Separate panel visibility from application-owned calculation lifetime using narrow
internal TypeScript interfaces.

- **Idle icon activation:** open quick setup without submitting a job or changing
  project revision/history. Keep explicit Quick Run and Advanced AMBER actions.
- **Ctrl+M:** capture the current selection and start the existing default quick
  calculation. Keep current scientific defaults and one-command automatic
  publication. If the panel was closed, it stays closed; if already open, do not
  forcibly close or reopen it.
- **Icon activation during submission/running/publication:** reveal the current
  owned session without cancellation, recapture, or duplicate submission.
- **After a terminal shortcut run:** icon activation opens fresh setup. Historical
  reports remain accessible through Jobs.
- Repeated shortcut events cannot create concurrent owned runs. Preserve typing,
  modal, composition, repeat-key, and modifier guards.
- Panel visibility must not gate required job/report polling, automatic Apply, or
  existing live coordinate rendering.
- Preserve project/generation ownership, exact-once publication, revision/digest
  validation, late-response rejection, and cancellation on actual session
  retirement.
- Preserve existing explicit close, Cancel, tool-change, project-change, and
  App-disposal behavior. Responsive viewer remounts do not retire the session.
- Jobs inspection never arms automatic publication.

Remove the obsolete settings-launcher focus discriminator. Closing an explicitly
opened panel restores its connected initiating control, falling back to Minimize
after responsive remounts while preserving unrelated focus. Shortcut execution
must not steal focus.

Update launcher guidance to distinguish setup from Ctrl+M execution; do not
advertise Ctrl+M as opening setup.

### Data, science, accessibility, and performance

- **Public interfaces:** no HTTP, WebSocket, job/plugin, or viewer API change. Only
  private frontend launch/presentation interfaces change.
- **Persistence:** no new field, preference, artifact format, migration, or
  molecular rewrite.
- **Scientific behavior:** preserve force fields, context/mask rules, chemistry
  interpretation, validation, fixed/inactive coordinates, original files, and
  Undo/Redo.
- **Quiet operation:** add no routine start/progress/completion display. Failures
  and consequential scientific warnings use the existing application notice
  policy; detailed reports remain in Jobs.
- **Accessibility:** retain focus tooltips, explicit labels, visible focus,
  unavailable explanations, touch targets, and panel-owned Escape.
- **Performance:** retain render-local subscriptions and existing polling/frame
  intervals. Do not add App updates per frame, repeated normalized-file reads, or
  new computation.

[D-143](../DECISIONS.md#d-143--compact-molecular-launchers-and-panel-independent-quick-execution)
records the accepted shared-launcher and session/visibility separation decision.
It explicitly amends D-111/D-129's launcher/opening behavior without rewriting
historical decisions. D-084/D-089/D-093 continue to govern focus and meaningful
warning presentation.

## 4. Milestones, checkpoints, and verification

Every checkpoint records its commit, exact commands/results, evidence, deviations,
limitations, blockers, and next action here. Project progress remains concise in
[PROGRESS](../PROGRESS.md).

### C0 — Persist the approved plan, then stop

After approval and once write execution is enabled:

1. Confirm a clean tree; fetch origin and update local master using a
   fast-forward-only operation.
2. Reconfirm cleanliness, base SHA, and plan/branch/tag availability. Reassess
   material upstream changes.
3. Create `fix/issue-93-compact-modeling-toolbar`.
4. Create this approved feature plan as the first branch change.
5. Add the concise progress entry and append the accepted decision.
6. Validate local links, approved scope, unchanged global plan, and
   `git diff --check`.
7. Commit exactly: `docs(plan): add approved plan for issue 93`.
8. Push if available and verify the remote branch SHA.
9. Report the plan path, branch, commit, milestones, and patch-release impact.

**Compatibility/rollback:** documentation only; revert the planning commit if
needed.

**Stop ready for `/goal`.** C0 creates no implementation, version bump, PR, issue
update, tag, or release.

### M1 / C1 — Separate setup from quiet execution

**Outcome:** icon activation opens setup; Ctrl+M completes a quick calculation with
the panel closed.

**Affected areas:** minimization store, command hook, presentation observer,
shortcut integration, focus restoration, and affected workflow tests.

**Acceptance:** zero submissions on setup opening; exactly one
submission/publication for an eligible shortcut run; no implicit panel opening or
focus theft; active-run reveal works; late responses, cancellation, remounts, and
inspection cannot republish.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run minimization movement-navigation
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/quick-minimization.spec.ts \
  tests/e2e/minimization-live.spec.ts \
  tests/e2e/selection-minimization.spec.ts
```

Also run web lint, typecheck, complete frontend tests, build, and
`git diff --check`.

**Documentation/migration:** update minimization guidance and decision
implementation notes; no migration.

**Expected commit:**
`fix(minimization): separate setup from quick shortcut execution`.

**Rollback:** revert the coordinated frontend lifecycle changes; stored jobs/data
remain compatible.

### M2 / C2 — Unify the three launchers

**Outcome:** one compact toolbar with the extra settings launcher removed.

**Affected areas:** launcher composition, scoped CSS, tooltips, panel anchors, and
browser helpers.

**Acceptance:** three idle launchers in the required order; equal button/icon
dimensions; one frame; correct 44 px responsive targets; unchanged active
transformation controls; no obsolete settings-button focus dependency.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  minimization movement-navigation molecular-edit-panel viewer-presentation
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/modeling-toolbar.spec.ts \
  tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/minimization-accessibility.spec.ts \
  tests/e2e/molecular-editing.spec.ts
```

Add `modeling-toolbar.spec.ts` for geometry and integrated launcher behavior.
Update existing helpers to use the remaining Minimize launcher. Run the same
frontend gates as C1.

**Documentation/migration:** update accessibility and toolbar guidance; no
migration.

**Expected commit:** `fix(viewer): unify molecular tool launchers`.

**Rollback:** revert scoped presentation and helper changes together; no data
conversion.

### M3 / C3 — Compatibility and release-ready qualification

**Outcome:** a reviewed final-version candidate ready for PR and merge.

**Acceptance scenarios:**

- Setup opening changes no molecular/project state.
- Quiet Ctrl+M preserves panel/focus state and exact fixed rows, applies once, and
  supports exact Undo/Redo and reload.
- Submission failures, refusals, warning-bearing results, stale revisions, project
  changes, delayed responses, duplicate starts, and responsive remounts are handled
  correctly.
- Explicit run inspection and Advanced AMBER remain usable without rearming
  publication.
- Desktop, Pixel 7, 320 px, both themes, keyboard/touch, scoped axe, and actual
  100–200% browser zoom pass.
- Existing native minimization, movement, editing, archive, and performance gates
  remain intact.

Update existing performance tests to observe actual publication instead of waiting
for an automatically opened report. Preserve the ≤2 s small-molecule, ≤5 s
pocket/18k, ≤1 s first-frame, and ≤500 ms explicit-cancellation budgets.

Run the complete documented gate on a clean, fixed candidate:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
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

Use disposable issue-specific data/ports, the locked AmberTools environment, and
one native thread. Set `MOLWEAVE_DATA_DIR` to a dedicated disposable directory for
migration/API qualification; never migrate user-managed data for a gate. Record
exact environment, commands, source hashes, logs, and documented exclusions under
`docs/assets/compact-modeling-toolbar/`.

Reuse the existing automatic-hydrogen reader harness against an actual detached
**v0.24.0** checkout. Run separate producer/reader processes in both directions
with final **0.24.1** metadata, fresh migrated stores, explicit module roots, and
expected-version assertions. Retain rich molecular/history/appearance/jobs/
original/archive coverage; no new compatibility framework.

The existing command is
`python -m tests.support.automatic_hydrogen_reader_qualification produce|read`,
with `--data-dir`, `--reader-root`, `--expected-reader`, and `--evidence` for each
phase. Use the selected implementation's API/core/plugin paths on `PYTHONPATH`.
Both releases support automatic-H operations, so neither producer needs the
`--legacy` flag used for the earlier 0.23 reader. Qualify current→0.24 and
0.24→current in separate disposable stores on candidate and exact merged master.

**Documentation/migration:** complete verification, accessibility, development,
release notes, progress, and plan evidence; confirm unchanged schemas/head.

**Expected commits:** substantive `test(viewer): ...` and
`chore(release): prepare v0.24.1`. No empty milestone commits.

**Rollback:** matching v0.24.0 client/API using qualified retained data and full
managed-directory backups; no schema downgrade.

### M3 / C4 — Verified delivery and close-out

**Outcome:** verified merged runtime, stable release, accurate issue response, and
completed audit.

**Affected areas:** PR/review, exact-master qualification, release evidence and
documentation, remote issue/ref cleanup. No planned runtime or migration change
at this checkpoint.

Open the implementation PR only after the complete candidate gate passes. Review
the entire diff, resolve consequential findings, and satisfy all current required
checks, reviews, and conversations.

After normal merge, repeat the complete gate and reader qualification on the exact
merged master commit. Only then create and remotely verify the annotated tag and
stable release.

Record publication evidence through a documentation-audit PR, using
`docs(release): record verified v0.24.1 publication`. Verify release assets after
download, issue state/reply, and actual branch cleanup. Never move the runtime tag
to the later documentation commit.

**Validation:** C3's complete gate on the exact merged SHA; remote PR/tag/release/
issue/ref verification; downloaded asset hashes and ZIP integrity; documentation
links and `git diff --check` for the audit-only PR.

**Rollback/compatibility:** stop publication on failure; correct and requalify a
new candidate rather than weakening gates or moving a published runtime tag.

## 5. Version, release, and completion strategy

**SemVer: patch, 0.24.0 → 0.24.1.** This corrects presentation and access to existing
functionality. The setup/shortcut distinction changes interaction behavior but
introduces no new scientific capability, public API, persisted contract, or
archive incompatibility. Minor, major, and prerelease increments are unnecessary
for this qualified scope.

Update all five authoritative sources together:

- `apps/web/package.json`
- `pyproject.toml`
- The root project version in `uv.lock`
- FastAPI application version in `apps/api/src/molweave_api/main.py`
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Update version assertions and archive tests without upgrading dependencies. If
another release consumes 0.24.1, reassess against the new verified baseline before
qualification.

The PR documents implemented, simplified, omitted, and rejected requirements, the
user's overrides, compatibility, validation, and limitations. Use `Closes #93`;
publish a final issue reply after verified release with real PR/tag/evidence
links. No new follow-up issue is currently necessary.

Release-note sections:

1. Unified molecular toolbar.
2. Minimize setup and quiet Ctrl+M behavior.
3. Accessibility and responsive layout.
4. Compatibility, migration, and rollback.
5. Verification and scientific limitations.

**Merge/release blockers:** incomplete approved behavior; consequential unresolved
findings; failed required checks/reviews; unexpected schema/API/dependency changes;
silent scientific warnings; duplicate or stale publication; focus/accessibility
regressions; relaxed performance thresholds; unqualified native scientific skips;
inconsistent versions; changed source during qualification; failed actual-reader
retention; or missing exact merged-commit verification.

After documentation-audit merge, fast-forward local master, verify the clean tree
and actual local/remote refs, then delete only this issue's merged feature branch
and disposable qualification worktrees. Preserve unrelated branches, user data,
and the annotated runtime tag. Report cleanup only after verifying it remotely.

## 6. Progress and completion log

| Checkpoint | Status |
|---|---|
| C0 | Complete: `b7197f27936cdcfc8eff652d2f2c8fe6d08f4125`, remotely verified. |
| M1/C1 | Complete: `00ce320`, passing checkpoint, evidence below. |
| M2/C2 | Complete: `f477288`, passing checkpoint, evidence below. |
| M3/C3 | Complete: clean final-version candidate2 passes all20 commands; evidence below. |
| M3/C4 | In progress: PR/review/merge, exact-master qualification and verified publication/cleanup. |

### 2026-10-22 — Approval and C0 preparation

- User approved the full proposal, including the explicit persistence-only stop.
- Master was clean, fetched, and fast-forward-checked at
  `8ed344b018e005da785bc6aba565577ee4389f27`; no upstream reassessment was needed.
- Planned remote branch and tag were absent; latest release remained v0.24.0.
- Created the dedicated branch and this plan as its first file change. Added the
  concise project summary and append-only D-143 decision.
- Baseline evidence is 52 frontend and 34 archive tests, recorded above. C0's
  relevant checks are documentation links/scope and whitespace, not a claim of
  passing implementation or release gates.
- C0 validation passed: eight local documentation links/anchors, Markdown fence/
  whitespace checks, approved-contract checks, append-only decisions, retained
  previous progress, unchanged global plan/product, exactly three documentation
  files, and all five versions still 0.24.0. `git diff --check` passed; the staged
  documentation set is checked again before commit.
- Known limitations: the current application still has four launchers and opens
  the panel for Ctrl+M; C1–C4 have not begun. No API/schema/dependency/version change
  is made by C0.
- Blockers: none identified for plan persistence. Implementation authorization is
  intentionally pending `/goal`.
- Next action: after the verified C0 handoff, stop ready for `/goal`.


### 2026-10-22 — Implementation authorization

The user's `/goal` authorizes C1–C4, including verified PR/review/normal merge,
exact-master qualification, annotated tag/release, issue reply and cleanup.
Work continues on the planned branch from the verified C0 commit. The base remains
unchanged at8ed344b; no implementation occurs on master. No new product decision
or scope expansion is introduced.


### M1/C1 complete — 2026-10-22

[Final gate](../assets/compact-modeling-toolbar/c1-final-gate.json),
[summary](../assets/compact-modeling-toolbar/c1-summary.json) and
[full-diff self-review](../assets/compact-modeling-toolbar/c1-review.md) retain
exact commands/environment, source identities and lossless logs. All7 commands
pass on unchanged source:26 focused/328 total frontend, lint/types/build/diff and
27 native browser cases/3 existing layout exclusions, zero failures/flakes/retries.
Native quick hidden publication and prepared AMBER/fixed rows, cancellation,
Undo/Redo/reload,320px/themes and actual100–200%zoom pass. Inspection never rearms.
Quiet no-op/external cancellation emits no new notices; errors/warnings remain
visible through existing notice ownership. No API/job/scientific/schema/migration/
dependency/version change. Attempts1–2 are diagnostic; attempt3 predates the final
quiet-notice correction and is not the final qualification. Next: C2 removes the
extra launcher and consolidates chrome/geometry. Complete release gates remain C3/C4.


### M2/C2 implementation notes — 2026-10-22

Use the existing named group and scoped launcher styles; no toolbar framework or
roving-tabindex keyboard model. A backwards-compatible optional tooltip prop on
the existing IconButton keeps accessible names stable while explaining unavailable
states and setup/shortcut behavior. Remove obsolete settings-launcher chrome and
focus references. The one launcher remains revealable during publication as well
as loading/running. The focused Vitest filter uses the actual existing
viewer-presentation suite rather than the proposal's nonexistent structure-viewer
filename; this is a validation-path correction, not reduced coverage.


C2 preflight3 passes all6 new desktop/mobile cases without failures/skips/retries.
Earlier preflights revealed the narrow-screen generic-tooltip suppression and an
invalid test focus target (native canvas is not focusable). Apply the established
viewer-toolbar tooltip exception and test focus on the real stable launcher.
No production focus injection, artificial viewer target or weakened focus
assertion is used. Eight retained native screenshots include32px desktop and44px
mobile/320px layouts in both themes; light desktop and dark320px were visually
inspected. The broader C2 gate is still required before completion.


### M2/C2 complete — 2026-10-22

[Final gate](../assets/compact-modeling-toolbar/c2-final-gate.json),
[summary](../assets/compact-modeling-toolbar/c2-summary.json) and
[full-diff self-review](../assets/compact-modeling-toolbar/c2-review.md) pass all7
commands on unchanged source:61 focused/328 total frontend, lint/types/build/diff,
77 browser cases/3 unchanged layout exclusions, zero failures/flakes/retries.
Three launchers share one frame and32px/44px/16px geometry; actual native touch,
keyboard, narrow themes, quick/AMBER and transform/Space/More/Help/Cancel/Undo/Redo
and actual200%zoom pass. Six new cases execute without skips. Preflight diagnostics
and eight native screenshots are retained separately. No API/job/schema/migration/
dependency/version/scientific-model change. Next: C3 updates the old panel-based
performance witness for quiet publication, adds final failure-path coverage,
qualifies actual0.24 readers, prepares0.24.1 and runs the complete release gate.


### M3/C3 qualification preparation — 2026-10-22

C2 is committed/pushed atf477288. Fresh origin inspection still finds master8ed344b,
latest stable0.24.0 and unused v0.24.1, so the approved patch target stands.
An actual detached v0.24.0 worktree atafea0f1 is available for both reader directions.
Quiet performance now measures trusted command acceptance and real canonical/native
publication rather than waiting for an intentionally absent panel. The≤100ms
acceptance observation is explicitly distinct from historical UI feedback; no
claim compares those metrics. All original cold publication/frame/Cancel/long-task
budgets remain. Added hidden refusal, job-read and Apply-rejection regressions pass
alongside prior lifecycle cases (28 focused tests). Preflight runs at0.24.0 before
the release-preparation version commit and cannot qualify final0.24.1.


### C3 review refinement and preflight — 2026-10-22

[Preflight1](../assets/compact-modeling-toolbar/c3-preflight1-gate.json) passes341
archive/scientific tests with no skips before a test-helper rejection-typing lint
failure. [Preflight2](../assets/compact-modeling-toolbar/c3-preflight2-gate.json)
passes28 focused/331 frontend, lint/types/build/diff,4 native performance cases /
4 existing mobile timing exclusions and15 workflow cases/5 existing layout
exclusions. Cold small/pocket/18k canonical paint1.480/2.458/3.668s remains within
2/5/5s; first-frame/Cancel/long-task assertions pass. These0.24.0 preflights are not
final release qualification.

Full-diff review identified that failed observation disarmed publication but could
leave an owned job consuming its remaining budget. Retire it with best-effort
cancellation; no new UI or worker rule. [Final failure-path native gate](../assets/compact-modeling-toolbar/c3-failure2-gate.json)
passes all8 integrated desktop/mobile cases without skips/retries, including a
real cancellation after injected503 with closed panel/unchanged coordinates.
[Static/frontend gate](../assets/compact-modeling-toolbar/c3-failure-final-gate.json)
passes331 frontend/lint/types/build before that native fixture's incorrect error
envelope was corrected to the existing detail schema. Its2 native text-assertion
failures are diagnostic; all8 final cases pass with the corrected fixture. The
production retirement change is covered by28 passing lifecycle unit cases.

This supporting correction uses a fix(minimization) checkpoint before the planned
release-preparation commit. Complete final-version source-frozen gates and actual
reader retention remain mandatory; no milestone/release completion is inferred.


### Final-version release preparation — 2026-10-22

Supporting failure/performance qualification is committed at85be04c. All five
authoritative version sources now consistently0.24.1; prior0.24.0 archive-version
coverage is added without relaxing structural-schema checks. Version/dependency/
production-build audit confirms backend changes are version metadata only, no
resolution/JS lock/native tools/patch/API-schema/migration change. Fresh origin
remains8ed344b and v0.24.1 is unused. Patch impact remains justified by corrected
existing presentation/access with unchanged public/data/scientific capability.

Prepared the exact20-command clean-candidate and exact-master recipes under
`docs/assets/compact-modeling-toolbar/`, with locked native environment, isolated
data/ports, actual0.24.0 reader roots and both final-version directions. The release
evidence runner streams native case progress and records15-second power samples
without changing host settings; source/log identities remain mandatory. Release
notes, rollback/development and scientific-limit guidance are prepared. This is
preparation only: final candidate/master gates, PR/review/merge/tag/release/issue
reply and cleanup are not yet complete.

Release-preparation focused validation passes35 archive integration cases at final
0.24.1, including prior0.24.0 producer metadata. The version/dependency/production-
harness audit and evidence-runner smoke pass; local documentation links and
`git diff --check` pass. This qualifies preparation only. Next: commit
`chore(release): prepare v0.24.1`, freeze source and run the complete20-command gate.


### C3 final-review focus correction — 2026-10-22

Full-diff self-review found Style's close autofocus could reclaim focus after
explicit Minimize activation. Extend D-093's existing handoff guard, with no new
focus mechanism. [Keyboard fail-first](../assets/compact-modeling-toolbar/c3-handoff-red2-gate.json)
reproduces the original mobile failure; desktop happened to retain focus.
[Passing correction](../assets/compact-modeling-toolbar/c3-handoff-green2-gate.json)
passes28 focused/331 frontend, lint/types/build/diff and all10 native desktop/mobile
toolbar cases, zero failures/skips/flakes/retries. The regression checks panel and
next-Tab focus plus unchanged revision. Earlier pointer-based attempts are
diagnostic: desktop Style geometry can cover the launcher, so keyboard activation
tests the intended explicit handoff without forcing pointer events.

Candidate1 was intentionally interrupted during browsers to address this finding.
It passed frozen installs/migration/static,1248 Python/331 frontend/8 supervisor
and build, but its partial browser run does not qualify a release. The interrupted
export case is not a completed failure. Retained logs/manifests are diagnostic.
A fresh isolated candidate2 recipe repeats all20 commands on committed, clean,
fixed source, including both actual0.24.0 reader directions. No gate is waived.
The [full-diff self-review](../assets/compact-modeling-toolbar/c3-review.md) records
both consequential corrections and requires final qualification before PR.


### M3/C3 complete — 2026-10-22

Final [candidate2](../assets/compact-modeling-toolbar/c3-candidate2-gate.json)
and [summary](../assets/compact-modeling-toolbar/c3-candidate2-summary.json) pass
all20 commands on cleand50da9c:1248 Python,331 frontend,8 supervisor,316 browser /
60 unchanged documented layout/timing exclusions; zero failures/flakes/retries/
Python or native scientific skips. All568 source/test/tool/patch/lock identities
remain fixed, digestc73befeaca7949e8e2d80fdeeba0a796a78ebd3ec19f282128488ff08d530226;
all lossless log hashes verify. Frozen installs, fresh0014, static/types/build,
actual tagged0.24.0↔final0.24.1 reader processes and version/dependency/production-
harness audits pass. Both reader directions retain six automatic cases and rich
three-entry canonical/conformer/history/original/appearance/job/surface/scene/
counter/archive data. The reused harness's generic matching-client limitation is
historical guidance, not a new authoring difference: both0.24 releases support the
same tested automatic-H operations. Native archives retain current state, not
portable Undo history. No migration/data rewrite or dependency upgrade.

Cold small/pocket/18k native canonical paint0.867/2.106/3.617s; repeat0.890/2.027/
3.896s; first actual frame674.4ms, explicit Cancel50.9ms; all unchanged2/5/5s,
1s,500ms and<750ms long-task budgets pass. Command acceptance0.2–1.0ms is a
separate metric from old panel-render feedback, never a speedup comparison.
Power samples retain the actual environment without host-setting changes.

The complete [implementer self-review](../assets/compact-modeling-toolbar/c3-review.md)
finds no unresolved consequential issue after read-failure retirement and Style
handoff corrections. Candidate1 and red/preflight attempts remain diagnostic only.
Fresh fetch still finds master8ed344b, latest stable0.24.0 and unused v0.24.1, so
no upstream incorporation/version change is required. M3/C3 is complete; next C4:
PR/Codex review request, normal merge without bypass, exact-master all20-command
gate before tag/release, verified issue reply, docs audit and delayed cleanup.


### C4 quiet-handoff review correction — 2026-10-22

Initial implementation was normally merged in [PR#117](https://github.com/ManuelSe/Neistra/pull/117)
at798b4a8 after complete candidate2 qualification. Codex review was requested but
not returned; no required approval/check/protection/thread was bypassed. Before
publication, further focus audit found that Ctrl+M retiring Style could restore
its old trigger over connected external focus. Interactions had the same handler,
including explicit setup handoff. The existing explicit Style fix did not cover
hidden execution. This is a missed contract edge, not new product scope.

The exact-master merged1 run was intentionally interrupted to fix the finding.
Its1248 Python/331 frontend/8 supervisor/static/build and partial browser passes
are diagnostic only; no tag/release was created. The planned feature branch was
fast-forwarded to the actual merged base before corrective implementation.
[Initial quiet fail-first](../assets/compact-modeling-toolbar/c4-quiet-style-red-gate.json)
fails both layouts. [Expanded fail-first](../assets/compact-modeling-toolbar/c4-quiet-handoff-red2-gate.json)
fails5 of8 Style/Interactions explicit/quiet handoffs on original merged handlers.
A held real submission proves focus during quiet ownership before canonical edit.
The corrective guard covers visible setup and hidden automatic publication;
Interactions adopts the existing typed restoration flag with its default retained.
Other closing paths were reviewed: Surface Manager's blur tracking already
preserves external focus, Edit has no imperative external restoration, modal
shortcuts are guarded and Minimize preserves unrelated connected focus.

Fresh candidate3/merged2 recipes repeat all20 gates on isolated stores and fixed
source before release. Version0.24.1 remains reserved but unpublished. A focused
corrective PR will preserve history and reference#93; initial PR#117 remains part
of delivery. Neither earlier passing candidate2 nor interrupted master qualifies
the corrected source. No API/schema/migration/scientific/dependency change.

[Corrective focused gate](../assets/compact-modeling-toolbar/c4-quiet-handoff-green-gate.json)
passes28 focused/331 total frontend, lint/types/build/diff and all24 native
toolbar/interaction cases, zero failures/skips/flakes/retries. All16 toolbar cases
execute, including both outgoing tools, explicit setup and held real quiet
submission with preserved external focus and eventual single publication. Existing
interaction markers/lifecycle/failure/accessibility/analysis limits pass. No new
framework, API, durable state or scientific change. Complete clean candidate3 and
exact corrected merged2 gates remain mandatory; this supporting checkpoint does
not complete release qualification.


### C4 corrected candidate3 complete — 2026-10-22

Corrected clean [candidate3](../assets/compact-modeling-toolbar/c4-candidate3-gate.json)
and [summary](../assets/compact-modeling-toolbar/c4-candidate3-summary.json) pass all20
commands on`8a3c3c607e0bb72164f677e1d35ba884575d1144`: **1248 Python,331 frontend,8 supervisor,322 browser /
60 unchanged documented layout/timing exclusions**, zero failures/flakes/retries/
Python or native scientific skips. All568 source/test/tool/patch/lock identities
remain fixed, digest`a079429f753cc2a266bb0eba3c2c56fa756f0bce3e3faa176b453c5a83dd8705`; lossless log hashes verify. Frozen
installs, fresh0014, static/types/build, production-harness exclusion, all five
0.24.1 versions and actual tagged0.24.0↔final0.24.1 reader directions pass.
Both directions retain all six automatic cases and rich three-entry canonical/
conformer/history/original/appearance/job/surface/scene/counter/archive records.
No migration/API/job/schema/dependency/scientific-model change.

All16 toolbar cases execute without skips/retries, covering both outgoing tools,
explicit setup and quiet submission/publication focus, plus existing compact
layout/transform/reveal/failure workflows. Full native interaction, quick/AMBER,
editing,320px/themes/accessibility/actual100–200%zoom regressions pass. Cold small/
pocket/18k native paint1.402/2.067/3.579s, first frame
706.4ms, Cancel41.4ms; original2/5/5s,1s,500ms
and<750ms long-task budgets remain. Command acceptance is distinct from former
panel-render feedback, with no speedup comparison. Power/environment samples are
retained without host-setting changes.

The focused correction follows [initial PR#117](https://github.com/ManuelSe/Neistra/pull/117)
and extends D-093/D-143's existing restoration suppression through visible setup
and hidden autoApply. Other close paths were reviewed; no unresolved consequential
finding remains in implementer self-review. No independent approval is claimed.
Candidate2 is historical; merged1 was intentionally interrupted. This corrected
candidate is the source for the corrective PR. Publication still requires a normal
merge, complete exact merged2 gate and verified tag/release/issue/audit/cleanup.


### Exact-master qualification diagnostics — 2026-10-22

Corrective [PR#118](https://github.com/ManuelSe/Neistra/pull/118) was normally merged
at `83aae8c36edc01abedfd7e4f98d9900774ce1d13`. The clean exact-master
[merged2 gate](../assets/compact-modeling-toolbar/c4-merged2-gate.json) passed frozen
installs, fresh0014, static/type/build,1248 Python,331 frontend and8 supervisor
tests. Its browser run failed the unchanged representative-project5s interaction
budget at6.101s and was stopped; it is not release qualification. A focused repeat
measured6.234s. Actual released0.24.0 also failed the same unchanged check at7.678s
on the then-discharging host; this supports a shared capacity concern but does not
establish its cause or waive the gate. The same final source passed earlier at
3.758s in complete candidate3. Both exact-master reader directions and version/
compatibility audits subsequently pass independently; these do not convert the
failed full gate into a pass. All diagnostic logs/traces/recipes are retained.

The user reported AC unavailable, then restored AC and requested limited focus
on responsiveness. A fresh unchanged focused check measured5.048s; retain the
failure without further isolated timing investigation. Run fresh complete
merged3 qualification on the same exact master with isolated stores/ports and
unchanged thresholds, host settings and source. No tag/release has been published.


### Exact-master final coverage and qualification decision — 2026-10-22

The fresh [merged3 attempt](../assets/compact-modeling-toolbar/c4-merged3-gate.json)
stopped in Python after1247 passes when an existing `/proc/<pid>/stat` test helper
raised ProcessLookupError as its observed process exited. No source/assertion was
changed. Fresh [merged4](../assets/compact-modeling-toolbar/c4-merged4-gate.json)
passes1248 Python,331 frontend,8 supervisor, frozen installs/fresh0014/static/types/
build. Its complete browser run has321 passes,60 unchanged exclusions and one
mobile notification-test failure; zero retries. All16 toolbar cases, all native
scientific workflows/budgets, real zoom and the formerly failing5s responsiveness
check pass. The [summary](../assets/compact-modeling-toolbar/c4-merged4-summary.json)
explicitly marks qualification incomplete.

The [completion checks](../assets/compact-modeling-toolbar/c4-completion1-gate.json)
pass both actual tagged0.24.0↔final0.24.1 reader directions, both migrations,
version/dependency/production-harness audit and diff. Its unchanged notification
rerun passes desktop and repeats the mobile failure. The
[trace diagnosis](../assets/compact-modeling-toolbar/c4-notification-diagnostic.json)
shows the pre-expiry assertion starts at least10.282s/full and10.029s/focused
after the saved notice is present, beyond its documented10s expiry. The test waits
8.5s after inspection/screenshot overhead instead of anchoring to emission. This
cannot establish premature product expiry. The notification component is unchanged.
Both full/focused failures, raw reports, traces, screenshots and logs are retained.
All568 runtime/test/tool/patch/lock identities match complete candidate3, digest
`a079429f753cc2a266bb0eba3c2c56fa756f0bce3e3faa176b453c5a83dd8705`.

All20 release commands have coverage:19 pass, the full browser command fails only
on this existing mobile harness timing assertion. This is not a passing complete
release gate. No threshold, source, host setting or scientific requirement was
changed. No exception is inferred from the user's request to limit responsiveness
investigation. Publication, final issue close-out and branch cleanup remain held
until the user approves a precise qualification deviation or the harness is fixed
and source is requalified. Runtime master remains83aae8c.


### C4 validation repair — 2026-10-22

No qualification exception was approved. Continue the authorized validation work
with two bounded test-only corrections: measure real notification expiry from
existing DOM observations with the original>=10000ms assertion and13500ms total
wait; treat `/proc` ESRCH as an exited process alongside ENOENT. Production notice/
worker code, all scientific/performance thresholds and product scope are unchanged.
D-143 records the rationale. The [focused gate](../assets/compact-modeling-toolbar/c4-harness1-gate.json)
and [summary](../assets/compact-modeling-toolbar/c4-harness1-summary.json) pass all8
commands on unchanged source:9 native worker integration tests,331 frontend, Ruff/
ESLint/types/build/diff and all10 notification browser cases, zero failures/skips/
flakes/retries. Desktop/mobile real expiry remains>=10s; original native/project/
request and focus/persistent-warning assertions pass.

Review confirms only two test files change after83aae8c; permissions/other process
errors still surface, expiry lower bound is retained and total wait is unchanged.
No new framework, product/API/schema/migration/dependency/scientific change. No
separate follow-up is needed if the harness repair is delivered here. Failed old
attempts remain diagnostic. Fresh complete candidate4/merged5 recipes retain all20
commands, isolated stores/ports and actual0.24.0 reader roots. Version0.24.1 remains
the correct unused patch target. Commit the passing test checkpoint, then prepare
release documentation and requalify committed, clean source before its focused PR.


### C4 final corrected candidate4 complete — 2026-10-22

Clean [candidate4](../assets/compact-modeling-toolbar/c4-candidate4-gate.json) and
[summary](../assets/compact-modeling-toolbar/c4-candidate4-summary.json) pass all20
commands on`83933b9818bdaa10985c249c16274b2340a216bf`:1248 Python/331 frontend/8 supervisor/
322 browser with60 unchanged exclusions, zero failures/flakes/retries/Python or
required scientific skips. Both actual0.24.0↔0.24.1 reader directions retain all
six cases and rich three-entry data/history/original/settings/job/surface/scene/
counter/archive records. All568 source/test/tool/patch/lock identities and log
hashes verify, digest`6523643a55d4da81df3c41001746d4b6aac5eed89d97cfc9ed80778e4de04dc3`. All five versions0.24.1;
no API/job/schema/migration/dependency/scientific-model change.

All16 toolbar cases and all10 notification cases execute. The corrected actual
real-time>=10s lifetime and original13.5s total wait remain. Original native
cold small/pocket/18k paint0.953/2.065/3.452s, first frame
700.3ms, Cancel64.6ms and unchanged responsiveness
budget pass. Earlier attempts remain diagnostic; no exception or threshold
relaxation is used. Full-diff implementer review finds no unresolved consequential
issue. Fresh fetch still finds master83aae8c, latest stable0.24.0 and unusedv0.24.1.
Next: focused normal PR for test-only C4 repairs, review/policy audit, normal merge
preserving checkpoints, then complete exact merged5 qualification before tag,
release, issue close-out, documentation audit and delayed cleanup.
