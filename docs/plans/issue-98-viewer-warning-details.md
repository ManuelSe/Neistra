# Issue #98 — Viewer warning details

## 1. Status and issue metadata

- Status: **Approved implementation contract; planning-only checkpoint C0. Runtime
  implementation must wait for `/goal`.**
- Issue: [#98 — Make viewer warning indicator clickable to inspect warnings](https://github.com/ManuelSe/Neistra/issues/98).
- User approval: explicit acceptance in the planning conversation on 2026-11-13,
  followed by an instruction to persist the plan and wait for `/goal`.
- Base branch: `master`, fast-forwarded from `origin/master` before branch creation.
- Actual base commit: `00320ea9e9d60fd19f12279669a00d88e540e434`.
- Feature branch: `fix/issue-98-viewer-warning-details`.
- Planned PR title: `fix(viewer): make structure warnings inspectable`.
- Merge strategy: normal merge commit preserving passing checkpoints.
- Proposed release: stable patch **0.28.1**, annotated tag **`v0.28.1`**, subject
  to release/tag recheck before version preparation.
- Related decision: [D-152](../DECISIONS.md#d-152--read-only-viewer-warning-details-and-focused-input-ownership).

This document is the detailed implementation contract. It does not replace
`docs/PLAN.md`. Checkpoint outcomes, evidence, deviations, limitations and blockers
belong in its completion log; `docs/PROGRESS.md` retains the concise project view.
Approval of planning/persistence does not start runtime work or authorize immediate
PR creation, merge, issue comments, tagging or publication.

## 2. Core problem and approved outcome

The viewer reports warnings without providing direct access to their messages.
Users must leave that context and inspect individual entries.

Make the existing warning indicator open a compact, accessible details surface.
Show exactly the warning records represented by its count, grouped by current
structure name, without changing scientific or project state. Entry details
already expose warnings; this delivery corrects direct discoverability at the
aggregate indicator rather than creating a new warning system.

## 3. Authority, inspection and assumptions

Apply this authority order:

1. Explicit user guidance and subsequent corrections.
2. Repository agent instructions and accepted decisions in `docs/DECISIONS.md`.
3. Existing architecture, product boundaries, schemas and conventions.
4. The issue's user problems, outcomes, constraints and explicit non-goals.
5. The issue's non-binding technical suggestions.

Planning inspected AGENTS instructions, PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS,
VERIFICATION, relevant ARCHITECTURE/API/PROJECT_SCHEMA/NORMALIZED_SCHEMA,
DEVELOPMENT/PERFORMANCE, prior approved plans, frontend state and viewer/input
ownership, warning serialization, migrations, jobs, tests, version sources and
release evidence/tooling. Related warning notification, viewer interface and
presentation work remains separate; image export remains issue #128.

Observed baseline:

- `StructureViewer.tsx` derives `visibleEntries` by `entry.visible`, totals their
  warning arrays and renders a static indicator.
- `Entry.warnings` and `MolecularWarning` already supply message, severity and
  other metadata independently of lazy molecular loading.
- Existing entry details provide per-entry warning access.
- Project switching keys the viewer by project ID; local popup state can retire
  naturally with project changes/remounts.
- The status overlay deliberately passes pointer events through to the canvas.
- Installed Radix Dialog supports the existing non-modal composition patterns.
- Movement Escape handling runs on window capture, ahead of dialog handlers.
- Alembic head is `0014`; project/viewer/archive schemas are 2 and
  normalized/selection/component schemas are 1.
- All five authoritative application versions are 0.28.0.

The request's no-release-history premise is superseded by verified evidence:
stable [v0.28.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.28.0) was
published on 2026-11-05 and earlier stable releases exist. Its annotated tag targets
`f02ca386e97a200bbc39299c1f464cd4783a7b39`; current master includes delivery receipts.
Do not reset release numbering or retarget existing tags.

At planning, the working tree was clean, master matched the remotely inspected
commit, no PR was open, and GitHub reported no Actions workflows or rulesets and
an unprotected master. Normal merge commits are supported. These are observations,
not permission to bypass future policies; recheck before delivery. Local validation
remains mandatory. Adding CI is outside this issue.

All seven specialists contributed read-only planning assessments. Reference
research informed consistent warning presentation and progressive disclosure;
it did not establish an exact aggregate-counter workflow to reproduce. Identifying
external reference material stays outside repository artifacts. No implementation
or runtime tests were performed during planning.

## 4. Requirement disposition matrix

| Requirement or suggestion | Disposition | Approved treatment and follow-up |
| --- | --- | --- |
| Activate existing warning indicator | Essential | Accessible button supporting pointer, Enter and Space. |
| Preserve compact placement | Supporting | Retain icon/count location and status-row styling conventions. |
| Display exactly the counted warnings | Essential | Count and grouped content use the same current source. |
| Group by structure and show name | Essential | Separate groups by stable entry ID, including identically named entries. |
| Display complete messages | Essential | Selectable escaped plain text, without truncation. |
| Show severity | Supporting | Supplied severity with icon and perceivable label; color alone is insufficient. |
| Technical codes, tooltips or expandable metadata | Optional; omitted | Unnecessary for direct inspection; no follow-up issue now. |
| Scroll long lists in a compact surface | Supporting | Constrained height, wrapped text and persistent Close control. |
| Escape, outside and close-button dismissal | Essential | Preserve deliberate focus transfers and outside actions. |
| Synchronize additions, edits, visibility and deletion | Essential | Derive from current props; no stored warning snapshot. |
| Preserve scientific warning records | Essential | Inspection never acknowledges, resolves, deletes or modifies warnings. |
| Avoid viewer interference | Essential | Limit pointer handling to trigger/dialog; preserve camera, selection and movement. |
| Reuse Entry.warnings and MolecularWarning | Already satisfied foundation | Consume current records and types; no API/type extension. |
| Reuse dialog infrastructure | Supporting; adapted | Compose installed primitives in a small dedicated component. |
| Reuse an existing palette unchanged | Rejected as proposed | Existing palettes prevent outside dismissal; no follow-up needed. |
| Exact modality and zero-warning behavior | Unclear in issue; resolved by approval | Adopt the non-modal and current-empty-state behavior below. |
| Warning search/filtering/export | Deferred | Does not solve the reported access problem; no speculative follow-up now. |
| Scientific repair, acknowledgement or resolution actions | Deferred | Different product/scientific contracts; no speculative follow-up now. |
| Global warning log or persistent read state | Deferred | Unnecessary duplicate ownership for this workflow; no follow-up now. |

No essential or supporting accepted outcome is deferred. Future demonstrated needs
may justify separate issues; they are not unfinished approved scope here.

## 5. Accepted design and non-goals

### Data and ownership

Add a focused `ViewerWarningDetails` component beside the current status text.
Consume current `visibleEntries`: all project entries whose `visible` flag is true.
Include their warnings even during pending/failed molecular loading. Selection,
isolation, component masks and rendering success do not redefine membership.

Count and groups share one current source. Preserve project entry order, each
warning array's order and duplicate records. Key groups by stable entry ID; equal
names must never merge groups. Use supplied severity faithfully; do not infer it
from message text, warning code or `blocking`.

Do not combine renderer errors, reduced-detail notices, interaction diagnostics,
minimization warnings or notification summaries with this count. The title and
wording must not imply complete scientific validation or validation of previews.

Own only transient open, position and focus state. Add no store, warning snapshot,
request, polling, job, project command or molecular traversal. Scientific records,
original uploads and the normalized model remain authoritative and unchanged.

### Presentation

Use installed Radix Dialog as a non-modal anchored surface without a backdrop.
Set both `modal={false}` and `aria-modal="false"`. Do not reuse existing palettes'
outside-interaction prevention or centered modal positioning unchanged.

Title: **Structure warnings**. Display current entry-name headings, ordinary lists
of complete selectable messages, and severity labels/icons. Render source text
through React's ordinary escaping, never as HTML. Keep technical metadata out of
the default surface.

Constrain the panel to available viewport dimensions with a scrollable body and
persistent heading/Close control. Roughly 360–420px desktop width is a starting
point, not an immutable requirement; tune from rendered evidence. Wrap long names
and unbroken text. Preserve theme tokens, readable text, visible focus and existing
coarse-pointer target conventions. Only the warning button becomes pointer-active
inside the otherwise passive status overlay.

### Lifecycle, focus and Escape

While open, content follows rename, hide/show, import, edit, deletion, undo/redo and
query-cache refresh. Opening and closing do not mutate molecular/project state.

At zero, hide the ordinary warning trigger as today but retain an already-open
panel showing **No warnings for visible structures**. This describes current visible
scope and does not imply hidden warnings were resolved. Preserve a valid anchor
or status-container fallback after the trigger disappears. Project changes and
viewer remounts close the panel; it never persists or automatically reopens.

Escape and Close return focus to the live trigger or a suitable connected current
viewer control if the trigger vanished. Outside dismissal preserves the destination
action/focus. Project changes must not restore focus into the old project. Inspection
remains available during loading, locked-entry state and previews.

`MovementOverlay` listens for Escape on window capture. A dialog handler alone runs
too late to prevent movement cancellation. Include a narrowly scoped guard for
focus inside the warning dialog, leaving Escape available for that dialog. Do not
suppress movement Escape merely because a background warning dialog exists. First
Escape closes focused details without cancelling movement; later Escape on the
movement canvas retains normal cancellation. No general dialog refactor is included.

Non-goals: warning generation/reclassification, repair/preparation, acknowledgements,
scientific actions, warning filtering/export, persistent state, global message
systems, new chemistry/dependencies, renderer changes or image export.

## 6. Milestones and checkpoints

Every checkpoint leaves a coherent branch, records actual evidence/limitations and
uses a passing Conventional Commit. No empty checkpoint commits. Fix validation
failures before proceeding. Section 7 governs complete release qualification.

### M0 / C0 — Persist approved contract and stop

- Outcome: approved plan committed/pushed and remotely verified, ready for `/goal`.
- Procedure: verify clean tree; fetch origin; switch to master; fast-forward-only
  update from origin/master; verify clean tree/base; create planned branch; make
  this plan the first branch change; append planning-only D-152 and concise
  PROGRESS entry; commit and push; verify remote branch/commit.
- Affected areas: this plan, DECISIONS and PROGRESS only.
- Acceptance: user approval and actual base recorded; runtime checkpoints pending;
  no runtime, version, dependency or migration changes.
- Validation: `git diff --check`, document/relative-link and changed-file review,
  clean pre-branch status and remote commit/branch readback.
- Commit: exactly `docs(plan): add approved plan for issue 98`.
- Compatibility/rollback: documentation-only revert. Stop after this checkpoint.

### M1 / C1 — Complete warning-inspection workflow

- Outcome: usable synchronized warning details from the existing indicator, with
  correct dismissal and input ownership.
- Areas: StructureViewer, new warning-details component, scoped styles, narrow
  MovementOverlay Escape guard, component/integration tests and new browser workflow.
- Acceptance: exact count/content/grouping/order/duplicates/severity; complete text;
  pointer/keyboard opening; all dismissal/focus paths; live/empty/project/remount
  behavior; pending/failed-entry warning access; first Escape preserves movement
  and later canvas Escape cancels; inspection creates no molecular/project change.
- Focused validation:

  ```bash
  corepack pnpm --dir apps/web exec vitest run \
    src/test/viewer-warning-details.test.tsx \
    src/test/structure-loading.test.tsx \
    src/test/interactive-transform-controls.test.tsx
  corepack pnpm --dir apps/web lint
  corepack pnpm --dir apps/web typecheck
  corepack pnpm --dir apps/web test
  corepack pnpm --dir apps/web build
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
    tests/e2e/viewer-warning-details.spec.ts
  ```

- Documentation/migration: update plan, progress and concise viewer-ownership
  guidance; no migration.
- Commit: `fix(viewer): expose current structure warning details`.
- Rollback: remove component and narrow integration guard together; persisted
  data remains compatible.

### M2 / C2 — Accessibility, layouts and resource qualification

- Outcome: qualified supported layouts alongside existing viewer operations.
- Areas: component/browser tests, scoped corrective UI changes and evidence under
  `docs/assets/viewer-warning-details/`.
- Acceptance: desktop/mobile Chromium, light/dark and actual 100%/200% browser zoom;
  reachable Close and final row; no horizontal overflow; keyboard/axe/severity
  semantics; long names/messages and deterministic 500-warning workload; popup input
  does not manipulate molecules; surrounding status remains pass-through; listener/
  observer cleanup; zero additional normalized requests/mutations/renderer remounts/
  molecular serialization caused by inspection; real-import project/history/
  warning/artifact/original/coordinate invariants.
- Focused validation: repeat C1 checks and:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
    tests/e2e/viewer-warning-details.spec.ts \
    tests/e2e/viewer-controls.spec.ts \
    tests/e2e/viewer-notifications.spec.ts \
    tests/e2e/viewer-native-ui.spec.ts \
    tests/e2e/interactive-selection-transform.spec.ts
  ```

- Record screenshots, request observations and finite timing measurements; keep
  diagnostics separate. The 500-warning workload is not a capacity claim. Add no
  virtualization/caps without measured need; preserve D-148 and existing exclusions.
- Documentation/migration: evidence index, verification, plan and progress; no migration.
- Commit: `test(viewer): qualify warning details accessibility and lifecycle`.
- Rollback: qualification artifacts or associated corrections can be reverted
  without data conversion.

### M3 / C3 — Release candidate qualification

- Outcome: clean reviewed 0.28.1 candidate satisfying this contract.
- Areas: five version sources, affected producer/version assertions, release notes,
  verification/evidence, decision implementation status, plan and progress.
- Acceptance: version agreement, unchanged contracts/dependencies/migrations;
  complete clean-candidate gate, actual preceding-reader qualification and production
  audits pass; all seven final implementation assessments cover the same candidate;
  no consequential finding remains unresolved.
- Validation: section 7 complete gate, compatibility readers, version/production
  audits and remote policy/tag recheck. Correct findings and obtain updated
  assessments after changes; reuse unaffected valid evidence.
- Commit: `chore(release): prepare v0.28.1`, plus separate meaningful corrective
  commits where needed. Never create an empty review/milestone commit.
- Documentation/migration: report real results and limitations; no new migration.
- Rollback: preceding qualified application remains compatible with retained data.

### M4 / C4 — Integration, release and close-out

- Outcome: verified merge, exact-master qualification, publication, issue response
  and branch cleanup, subject to subsequent delivery authorization.
- Areas: PR/issue/release, verified refs/assets and integrated documentation receipts.
- Acceptance: candidate passes before PR; remote reviews/checks/conversations are
  satisfied; normal merge; exact merged-master gate/readers pass; annotated tag and
  stable release target verify; downloaded qualification assets match hashes;
  issue reply/state and final branch deletion verify remotely.
- Validation: section 7 on exact merged master; tag-object/target and release/asset
  readback; issue readback; clean tree and local/remote branch checks.
- Commit where appropriate: meaningful `docs(release): ...` receipts through normal
  PR integration. No empty delivery commits or existing tag retargeting.
- Compatibility/rollback: use preceding qualified application without conversion;
  preserve verified runtime tags while appending later documentation receipts.

## 7. Acceptance and verification evidence

Run the following complete gate on a clean committed candidate before opening the
implementation PR and on exact merged master before publication:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
.venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/neistra_core packages/neistra_demo_plugin
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

Use dedicated disposable stores/ports and the documented locked native scientific
toolchain. Do not qualify migrations against a user's managed store. Reuse the
preceding release recipe/evidence conventions, adapting paths and versions rather
than executing historical hard-coded version assertions unchanged.

Additional required evidence:

- Fresh disposable migration upgrade/downgrade/re-upgrade retains head 0014.
- Actual tagged 0.28.0 and final 0.28.1 producer/readers pass in both directions
  through existing harnesses with explicit implementation roots/expected versions.
  Version strings substituted into current code do not constitute an old reader.
- Preserve both archive filename conventions, originals, molecular identities,
  coordinates/conformers, history, selections, scenes, surfaces and jobs.
- Independently specified mixed-severity/duplicate fixtures prove exact count and
  content. Include identical entry names, hidden entries, loading failures and
  updates. Ordinary import fixture warnings establish real application integration.
- Opening, reading, scrolling and dismissal preserve project revision, dirty state,
  history, warnings, artifacts, normalized identity/coordinates and original bytes.
  Controlled test GETs may observe invariants; inspection itself adds no molecular
  requests, mutation or job.
- Native active-movement tests prove focused popup Escape ownership on content and
  Close, then normal canvas cancellation. Outside actions keep normal focus/input.
- Version consistency, unchanged dependencies/migrations, production test-harness
  exclusion and required license notices are audited.
- Retain command/environment/commit/source/log identities, screenshots and failures.
  Historical pass counts are not new evidence. Preserve registered exclusions and
  existing scientific/resource enforcement; do not weaken assertions to obtain passes.

D-148 portable correctness remains the default. Record finite nonnegative timings
and bounded readiness; enforce strict latency targets only under the established
reference-host performance profile. No universal speed or memory claim is made.

All seven specialists must independently inspect the complete implementation,
including new files, evidence and comparison base. Final verdicts must be PASS or
justified NOT_APPLICABLE on the same final candidate. Missing applicable evidence
means BLOCKED, not approval. Correct consequential findings and obtain updated
affected assessments and reconfirmations after changes. These agent assessments
supplement full-diff review/tests and do not replace required human/remote approval.

## 8. Cross-cutting implications

- Data/science: no changed chemistry, units, inference or validation semantics;
  warning inspection does not validate structures/previews or resolve uncertainty.
- Persistence/migrations: no new state or migration; head 0014, project/viewer/archive
  2 and normalized/selection/component 1 remain. Popup state is neither saved nor
  included in scenes, archives or history.
- API/jobs: existing project summaries suffice. No endpoint, schema, plugin, runner
  or background job change is planned. Version metadata advances only in C3.
- UI/accessibility: compact non-modal interface with explicit semantics, readable
  text, keyboard/touch access, focus recovery and scoped pointer/input ownership.
- Performance: existing warning arrays only; bounded open-time layout subscriptions,
  no frame loop or molecular work. Profile a demonstrated bottleneck before adding
  workers, caches, virtualization or pagination.
- Scientific tests: no new numerical/algorithm suite is justified solely by this
  UI; meaningful component/native invariance checks supplement the complete gate.

## 9. Decisions and deviations

D-152 records accepted current-warning projection, non-modal input ownership,
zero-state/focus behavior and the patch rationale. Historical decisions remain
unchanged. Approval resolves the issue's modality and zero-count ambiguities.

Deviations from non-binding suggestions: use a dedicated installed-primitive
composition rather than an unchanged existing palette; omit optional codes and
advanced actions; retain one source of current warning truth; include the narrow
movement Escape safeguard discovered by inspection. No approved essential outcome
is reduced. Material scope or contract changes require explicit reconciliation,
not silent changes to requirements.

## 10. Version and release plan

Use stable patch **0.28.1**, proposed annotated tag **v0.28.1**. Existing entry
details already expose warnings; this is a compatible correction to direct access
from the existing counter. It adds no scientific method, molecular operation,
public API or persisted contract. Minor/major/prerelease increments are unnecessary
for this accepted scope. Issue labels do not determine the version.

During C3 update all five authoritative sources together:

1. `apps/web/package.json`
2. `pyproject.toml`
3. `uv.lock` — root project version only
4. `apps/api/src/neistra_api/main.py`
5. `apps/api/src/neistra_api/archive_service.py`

Root package.json is unversioned. Update affected assertions and producer coverage
without dependency upgrades. Recheck versions/releases/tags before preparation.
If another release intervenes, reassess and record the resulting version; never
overwrite an existing tag/release. C0 changes no application version.

Release-note sections: **Fixed**, **Behavior and scope decisions**, **Compatibility
and rollback**, **Verification**, **Known limitations**. State the exact visible-entry
scope, transient inspection semantics, optional omissions and qualified layouts.
Distinguish portable correctness from strict reference timing and report actual
specialist agent review provenance.

## 11. PR, issue response, cleanup and blockers

PR title: `fix(viewer): make structure warnings inspectable`.
Use a normal merge commit preserving passing checkpoints. Document implemented,
simplified, omitted, deferred and rejected requirements, evidence, compatibility,
remaining limitations and review provenance for readers without this conversation.
Review the full intended diff, including new files, and resolve consequential
findings before merge. Recheck remote policies, required reviews/checks and
unresolved conversations; never bypass them.

Use `Closes #98` only when approved essential/supporting outcomes pass; otherwise
use `Refs #98` and keep the issue open. The final issue response explains actual
scope decisions, verification, limitations, verified publication and remaining work.
No speculative follow-up issue is proposed.

Block merge for incorrect membership/counts, lost/reinterpreted warnings, stale
cross-project content, inaccessible controls, focus/input regressions, unintended
state changes, leaks, unapproved contract/dependency changes, failed checks,
unresolved consequential findings or an incomplete seven-specialist gate.

Also block release for failed exact-master/readers, version inconsistency, tag
collisions, unmet remote requirements or unverified targets/assets. Create the
annotated tag only from the verified merged master commit after its complete gate.
Verify published notes/assets and downloaded hashes before claiming publication.

Integrate final delivery receipts before deleting the feature branch; verify local
and remote deletion. Preserve unrelated branches and the qualified runtime tag.
Back up the complete managed store before deployment; rollback uses the preceding
qualified application without data conversion.

## 12. Progress and completion log

| Checkpoint | Status and evidence | Limitations, blockers and next action |
| --- | --- | --- |
| Planning approval | Accepted by the user on 2026-11-13 after read-only inspection and all seven specialist planning consultations. | No runtime implementation or runtime test execution claimed. |
| M0 / C0 | Approved contract persisted as the first feature-branch change; planning-only D-152 and PROGRESS entries accompany it. Documentation validation, commit/push identities and remote readback are reported in the persistence handoff. | No runtime/version/schema/dependency change. Stop and wait for `/goal`. |
| M1 / C1 | Pending. | Complete warning-inspection workflow and focused validation after `/goal`. |
| M2 / C2 | Pending. | Native layouts/accessibility/lifecycle/resource qualification. |
| M3 / C3 | Pending. | Versions, full candidate gate, actual readers and final seven-specialist review. |
| M4 / C4 | Pending. | Authorized PR/integration, exact-master qualification, publication and cleanup. |

Planning consultation dispositions: architecture, scientific theory, scientific
implementation, performance, UI, UX and reference specialists found no unresolved
consequential planning concern in the reconciled scope. The movement capture-phase
Escape finding, explicit non-modal attribute, current empty state, focus fallback,
exact warning-source semantics and release-history correction are incorporated.
These are planning assessments, not final implementation verdicts.
