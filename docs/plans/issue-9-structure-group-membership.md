# Issue #9 — Reversible structure group membership

## Status and issue metadata

- Status: **M1/C1 and M2/C2–C3 complete; M3/C4 qualification underway; implementation authorized by `/goal`**.
- Approval: the user explicitly approved the complete proposed plan on 2026-10-08.
- Issue: [#9 — Allow structure entries to be added to, moved between, and removed from groups](https://github.com/ManuelSe/Neistra/issues/9).
- Base branch: `master`, updated from `origin/master` using fast-forward-only integration.
- Planning and branch base: `94fdcd54e53e674c036e46894669f46f7edc2e66`.
- Feature branch: `feat/issue-9-structure-group-membership`.
- Planned version: **0.10.0**; proposed annotated tag: **`v0.10.0`**.
- PR title: `feat(groups): allow moving and ungrouping structure entries`.
- Merge strategy: normal merge commit preserving passing checkpoint history.
- Implementation checkpoints: M1/C1, M2/C2–C3, M3/C4 below.

This feature plan is the approved implementation contract. The GitHub issue is a
product/problem brief, not a binding technical specification. The global
`docs/PLAN.md` remains unchanged. Persisting this contract authorizes only the
planning handoff in this turn: documentation, commit, push and verification.
The user subsequently invoked `/goal` on 2026-10-08, authorizing implementation
and the complete PR/review/merge/release/issue-response/cleanup workflow.

## Core problem and approved outcome

Users can create groups but cannot conveniently change existing membership as
additional structures arrive or a project's organization evolves.

Deliver a focused organizational workflow that lets users:

- Move one or more complete entries into an existing group.
- Move entries between groups or return them to Ungrouped.
- Create a new group containing the affected entries.
- Perform the same operations through keyboard and touch accessible controls.
- Use desktop drag and drop for these membership changes.
- Undo or redo each complete membership operation once.
- Recover the same membership after reload, reopen, API restart and portable
  archive import.

The work changes project organization only. It must not reload, duplicate,
delete, transform, chemically modify, or restyle the affected structures.

## Authority, inspected baseline and assumptions

Authority, in descending order:

1. Explicit user guidance, approval and subsequent corrections.
2. `AGENTS.md` and accepted `docs/DECISIONS.md` decisions.
3. Existing architecture, documented product boundaries, schemas and conventions.
4. The issue's user problems, intended outcomes, constraints and non-goals.
5. Technical implementation suggestions in the issue.

Relevant accepted decisions include D-006/D-007 for durable commands/history,
D-013/D-018/D-019 for state and selection ownership, D-035/D-042 for archives,
and D-045 for the separate molecular component hierarchy. D-071 records the
approved organizational boundary and product choices without replacing them.

Planning inspected AGENTS, PRODUCT_SPEC, the global PLAN, PROGRESS, DECISIONS,
VERIFICATION, architecture, project/normalized schema documentation, API and
development/accessibility/performance guides; group models, route/schema/service
code and command actions; checkpoint, archive and migration paths; job ownership
and immutable inputs; App, ProjectBrowser, selection stores, query caching and
viewer synchronization; and relevant Python, component and Playwright tests.
Related issue #2 is delivered; component corrections #20 and subset export #21
remain separate. Top-level project groups are not molecular components.

The inspected base has nullable `StructureEntry.group_id`, persisted groups and
reversible `entries.group` command actions. The API supports group creation with
multiple IDs, while the UI currently submits one entry. The browser derives
entry order from its sort mode, which is transient; there is no manual position
field. Empty groups persist already but are omitted from the current browser.

The premise that Neistra has no release history is outdated. Published releases
exist through [v0.9.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.9.0).
Its annotated tag points to the exact base commit above, merged through PR #40;
issue #36 is closed. The release reports complete candidate and exact-merged
qualification. Those historical results are not newly executed issue #9 tests.

At planning time there were no open PRs, no `.github` directory or configured
GitHub Actions workflows, no repository rulesets and no master protection.
Normal merge commits are enabled. The proposed feature branch, tag and release
were unallocated. Recheck live repository policy and version availability before
delivery; the absence of remote gates does not replace local validation/review.
No dedicated release script exists in the inspected scripts; use the established
Git/GitHub delivery workflow rather than adding unrelated release automation.

Approval resolves three product choices: retain reusable empty groups, preserve
existing derived sorting instead of adding manual ordering, and support desktop
dragging with equivalent explicit mobile actions. Changes to this accepted scope
require an explicit recorded deviation; material changes require user approval.

## Requirement disposition matrix

| Significant requirement | Disposition | Approved treatment and follow-up |
|---|---|---|
| Add entries to an existing group | Essential | One validated membership command |
| Move entries between groups | Essential | Same command with another destination |
| Remove entries without deleting them | Essential | Destination is Ungrouped |
| Move multiple selected entries together | Essential | One atomic operation over captured entry IDs |
| Explicit alternatives to dragging | Essential | Entry actions and a labelled destination dialog |
| Create a new group | Already satisfied in backend; supporting UI extension | Reuse existing command; extend UI to the captured batch |
| Desktop drag into, between and out of groups | Supporting, accepted | Separate drag handles and group headings |
| Valid target highlighting and invalid-drop rejection | Supporting, accepted | Clear target feedback; only active internal entry drags are accepted |
| No duplicate entries or accidental unrelated actions | Essential | Membership only; dragging starts from a separate handle |
| Same-group drop is a no-op | Essential | No revision, history, timestamp or redo changes |
| Predictable empty-group behavior | Unclear in brief; product decision approved | Retain empty groups and expose them as destinations |
| Automatically delete empty groups | Rejected as proposed default | Existing storage retains them; deletion adds lifecycle work and removes reusable destinations; no follow-up required |
| One undo/redo operation | Essential | Reuse `entries.group` forward/inverse actions |
| Restore previous list position | Supporting, clarified | Restore membership and derived position under unchanged sort/filter |
| Persist arbitrary manual entry ordering | Deferred | No ordering field exists; membership is the core problem; no speculative follow-up |
| Persist chosen browser sort/filter | Deferred | Existing transient preference behavior suffices; no speculative follow-up |
| Save/reopen and another browser session | Existing persistence foundation; essential new evidence | Verify new operations through the durable model |
| Live synchronization between tabs | Deferred | Existing revision conflicts and refetch behavior suffice; no collaboration transport or speculative follow-up |
| Molecular and viewer state remain unchanged | Essential | Verify artifacts, coordinates, visibility, representations, selection, camera and viewer lifecycle |
| Mobile reorganization | Essential | Explicit actions provide equivalent operations |
| Touch drag and drop | Optional, deferred | Avoid long-press/scroll/selection conflicts in this slice; no speculative follow-up |
| Keyboard drag simulation | Optional, deferred | Complete explicit actions provide keyboard access; no speculative follow-up |
| Nested groups, multiple memberships, automatic grouping | Rejected for this feature | Explicit issue non-goals; no follow-up required |
| Molecular component extraction or classification | Deferred to existing issues | #20/#21 remain separate; do not create duplicate follow-ups |

No speculative follow-up issues are required. Record deferrals and limitations in
the PR, release notes and issue closeout. Create a follow-up only for a concrete,
independently scoped discovered problem that cannot reasonably be fixed here.

## Accepted scope and detailed interaction contract

### Captured operation scope

Reuse current entry highlighting derived from canonical selection. When the
originating row is selected, affect all selected entries; otherwise affect that
entry alone. Capture target IDs when the action or drag begins. Do not introduce
a second persisted or molecular entry-selection model.

Controls state the number of complete structures affected, including any hidden
by the browser filter. Partial atom selection still identifies an entire entry
for this organizational operation. Grouping neither expands nor replaces that
atom selection. Capture selection context for command history without retargeting
an in-progress action when the selection changes.

### Explicit actions

- **Move to group…** opens a labelled destination dialog.
- **Remove from group** is available when at least one affected entry is grouped.
- Existing **Create group** uses the same captured batch.
- Include empty and collapsed groups among destinations.
- Disambiguate repeated group names consistently in the browser and destination
  controls without changing stored names or adding a uniqueness restriction.
- Prevent duplicate submission during pending work. Errors retain a clear path
  to recovery; revision conflicts use the existing refresh behavior, without
  silently replaying the action against changed scope.
- Preserve keyboard navigation, touch access and focus restoration after a row
  moves. If its prior control is no longer mounted or visible, restore focus to
  a suitable destination heading or browser control.

### Desktop drag and drop

Use a dedicated handle separate from selection, visibility, hierarchy and action
controls. Capture project ID, revision, entry IDs and selection context in
transient application state. Transfer no molecular payload. Reject external or
obsolete drag data instead of trusting arbitrary dropped IDs.

Group headings accept drops while collapsed. During dragging provide a labelled
Ungrouped target even if no entry is currently ungrouped. Relevant destinations
remain reachable while filtering. Highlight valid destinations clearly. Escape,
drag end, project changes and obsolete project revisions clear drag state.
Same-group drops do not duplicate entries, create history, or discard redo.

Touch layouts use explicit controls and do not advertise unsupported touch
dragging. Keyboard users use the same explicit actions; no separate drag-widget
interaction model is required.

### Empty groups and ordering

Retain group ID/name after moving, ungrouping or deleting its final member.
Genuine empty groups remain usable, including those restored from archives.
Apply this policy consistently across existing creation/deletion and new moves.

Preserve existing sorting, with deterministic tie handling where necessary.
Membership changes alter the containing group, not a saved insertion position.
Undo restores prior membership and the derived position under the unchanged
sort/filter. Reload restores the existing default name-sorted view. Archives
preserve membership and sortable data; they do not gain a manual order contract.

### Non-goals

No nested-group UI, multiple simultaneous memberships, automatic grouping,
manual order storage, persistent sort/filter extension, live collaborative
synchronization, touch drag, keyboard drag simulation, group lifecycle manager,
molecular component extraction/classification, chemistry changes, docking logic,
new jobs, or broad virtualization/performance-infrastructure refactor.

## Data, command, migration and API design

Reuse nullable `StructureEntry.group_id` and persisted EntryGroup records.
No new database fields, migration, ordering schema, molecular schema or archive
shape is planned. Alembic head stays `0013`; API, project, normalized and archive
schema majors remain 1.

Add one typed revisioned action, proposed endpoint:

```text
POST /api/v1/projects/{project_id}/group-membership

expected_revision
entry_ids
group_id: string | null
selection: optional canonical selection for history context
```

The exact typed names may follow repository conventions without changing this
contract. `null` means Ungrouped. Return existing `ProjectRead`.

The service must:

1. Validate the complete entry batch and destination belong to the same project.
2. Reject empty/duplicate IDs and missing/foreign references before writes.
3. Check revision even for an otherwise unchanged operation.
4. Record only changed memberships in one reversible command.
5. Return the unchanged project for a genuine no-op, preserving redo history.
6. Reuse existing `entries.group` forward/inverse actions.
7. Preserve molecular artifacts, entry timestamps used for sorting, visibility,
   locks, metadata, warnings, viewer settings and job links; derived project/entry
   dirty state and successful command revision/history changes remain expected.
8. Allow organizational moves of locked entries, consistent with group creation.

Existing group creation stays backward compatible. An optional selection snapshot
may be added without requiring it from existing clients. Capture meaningful
affected IDs and selection context using existing command conventions. Validate
references through existing summaries; grouping must not fetch molecular artifacts
solely for organization. Keep the existing structured error conventions.

## Ownership, scientific, accessibility and performance implications

TanStack Query owns API-backed project data. Dialog/drag drafts remain transient
component state. Mol*, normalized molecular data and the molecular component
hierarchy gain no organizational authority.

Grouping produces no coordinate/topology patch, artifact, chemistry operation or
background job. Existing immutable job inputs and result provenance remain
unchanged. Named scenes retain their camera/visibility/representation/selection
meaning; they do not become organization snapshots.

Archives remain current-state snapshots under D-035/D-042: groups and membership
remap on import, while command history remains database-local. Preserve all
scientific bytes, atom identities, conformers, bonds, warnings and inferences.
No preparation or scientific-validity claim follows from grouping.

Use labelled existing dialogs/menu controls, keyboard/touch operation, visible
focus, appropriate disabled/pending states and accessible status/error messages.
Scope controls explain complete-entry actions for partial atom selections.
Qualify light/dark, desktop/Pixel 7, scoped axe and actual 100%/200% browser zoom.
Pixel 7 evidence is emulation, not physical-device or cross-browser certification.

Use bounded metadata projections and one batch mutation rather than atom
traversal or one request per entry. Instrument requests and the viewer boundary
after initial loading: membership operations must not refetch normalized data,
reload/rebuild structures or regenerate surfaces. No new broad benchmark or
virtualization project is required; retain existing performance regression gates.

## Decisions, deviations and compatibility

D-071 records approved membership ownership, retained empty groups, derived
ordering and unchanged molecular/viewer boundaries. Append accepted decisions;
do not replace or rewrite earlier accepted records.

Approved deviations from the brief are explicit: no automatic empty-group
deletion, manual order persistence, saved sort/filter preferences, live tab
synchronization, touch dragging or keyboard drag simulation. These choices retain
the core membership outcome with a smaller maintainable contract.

Rollback uses existing schema and action vocabulary. Verify that retained
membership history is interpretable by the preceding implementation. Reverting
new controls/endpoint should require no data stripping. Any newly discovered
incompatibility must be documented and resolved before release, not hidden by
removing history or weakening archive checks.

## Milestones and independently verifiable checkpoints

Implementation checkpoint statuses and evidence are tracked in the log below. Each leaves coherent working
behavior, passes focused checks, records exact evidence/deviations/limitations,
updates concise project progress and commits only a passing state. At every
milestone boundary run relevant lint/type/test/build/browser gates. Fix failures
before proceeding; no empty checkpoint commits or placeholder user controls.

### M1 / C1 — Durable membership command

Outcome: independently usable API for atomic moves and ungrouping.

Affected areas: typed request schema, route, project service/history, existing
group creation where needed and Python tests.

Acceptance: single/mixed batches; grouped/ungrouped destinations; locked entries;
invalid/foreign references; stale revisions; exact no-ops retaining redo; one-command
undo/redo; dirty/checkpoint behavior; retained empty groups; unchanged molecular
and job state. Include API restart and archive ID-remapping evidence.

Focused commands:

```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest tests/unit/test_commands.py \
  tests/integration/test_group_membership.py \
  tests/integration/test_project_lifecycle.py \
  tests/integration/test_archive_roundtrip.py
corepack pnpm --dir apps/web typecheck
```

`test_group_membership.py` is a planned new suite. Complete relevant frontend
lint/test/build and existing project-lifecycle browser checks at the M1 boundary
to ensure the additive API leaves the working application intact.

Docs/migration: API and project-schema semantics, D-071 references and
progress/evidence; no migration. Expected commit:
`feat(groups): add reversible membership commands`.
Compatibility/rollback: additive endpoint, existing action payloads/readers.

### M2 / C2 — Accessible explicit workflow

Outcome: complete move, ungroup and batch-create workflows on desktop/mobile.

Affected areas: ProjectBrowser, App orchestration, typed API client, existing
dialog/menu primitives, component and browser tests.

Acceptance: captured scope/counts; filter-hidden selected entries; repeated names;
empty destinations; partial selections; busy/error/conflict handling; keyboard/touch
operation; focus restoration after moving rows; unchanged canonical selection.

Focused commands:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- project-browser group-membership project-workspace
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/group-membership.spec.ts tests/e2e/project-lifecycle.spec.ts
```

The group-membership browser/component suites are planned additions.
Docs/migration: user workflow, accessibility and verification evidence; no
migration. Expected commit:
`feat(groups): add accessible move and ungroup actions`.
Rollback: reverting presentation leaves membership/history intact.

### M2 / C3 — Desktop drag and drop

Outcome: desktop dragging invokes the same membership command.

Affected areas: browser handles/targets, transient drag state, styling and tests.

Acceptance: all three move directions; selected batches; collapsed/empty targets;
Ungrouped availability; invalid external drops; unchanged selection/visibility;
same-group no-op; Escape/obsolete-context cancellation; no duplicate requests.

Run C2 frontend lint/type/build and:

```bash
corepack pnpm --dir apps/web test -- project-browser group-membership
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/group-membership.spec.ts \
  tests/e2e/project-lifecycle.spec.ts \
  tests/e2e/release-hardening.spec.ts
```

Desktop tests exercise real browser drag events; mobile tests verify equivalent
explicit actions. At the M2 boundary rerun focused Python C1 checks plus relevant
frontend lint/type/test/build/browser validation.

Docs/migration: document desktop dragging and touch alternatives; no migration.
Expected commit: `feat(groups): support desktop membership drag and drop`.
Rollback: explicit actions remain a complete workflow if dragging is reverted.

### M3 / C4 — Qualification and release preparation

Outcome: reviewed compatible release candidate with evidence for every claim.

Affected areas: durability/archive/browser regressions, authoritative version
sources, release notes and verification/progress documents.

Acceptance:

- Save/reopen, unsaved recovery, API restart, second-session reads and stale-tab
  conflicts work correctly.
- Exact membership undo/redo preserves sorting keys.
- Archives round-trip with empty groups, ID remapping, existing producer
  compatibility and byte-identical originals.
- Membership changes cause no normalized refetch, structure reload/rebuild,
  surface regeneration, camera/selection or representation/visibility change.
- Light/dark, desktop/Pixel 7, keyboard, scoped axe and actual 100%/200% zoom pass.
- Complete diff review leaves no consequential unresolved finding.
- Complete candidate gate passes on a clean tree.

Focused validation: C1–C3 suites, archive/migration suites, viewer adapter/loading
tests, export/archive and zoom browser workflows, then the complete gate below.

Docs/migration: release/upgrade notes, current evidence references in VERIFICATION,
preserved historical evidence and concise PROGRESS; no migration.
Expected commit: `chore(release): prepare v0.10.0`.
Rollback: ordinary corrective commit/subsequent release; never retarget a published
tag. Publication follows candidate qualification rather than being claimed here.

## Acceptance evidence and complete release gate

Maintain a claim-to-evidence table with actual test names, commands, results and
commit IDs. Planned evidence categories:

| Claim | Planned evidence |
|---|---|
| Atomic membership, rejection, no-op and history | Command unit tests and group-membership API integration suite |
| Save/restart/session/archive persistence | Project lifecycle, group-membership integration and archive round-trip tests |
| Original and normalized artifact invariance | Snapshot/byte comparisons in API and archive suites |
| Selection/camera/representation/visibility/job invariance | Component/viewer instrumentation, browser state and API comparisons |
| Explicit and drag workflows, cancellation/error/focus | Group-membership component and real browser workflows |
| Accessibility, responsive layout and zoom | Keyboard/touch, scoped axe, desktop/Pixel 7 and real zoom workflows |
| Request counts and viewer lifecycle | Post-load request observers and viewer-boundary assertions |

Prefer outcome assertions over tests mirroring implementation. Historical counts
are baseline evidence only; no issue #9 implementation tests ran during planning.

Run the complete gate before opening/merging the PR and again on the exact merged
master commit before creating a tag/release:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-isolated-data> .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
MOLWEAVE_E2E_DATA_DIR=<fresh-isolated-e2e-data> \
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
git status --short
```

Angle-bracket directory names are placeholders: allocate real isolated directories
before executing commands. Use documented port overrides when needed and record
them. Browser tests must use candidate services, not older reused servers.
Record intentional layout skips separately from failures/flakes. Changes after
qualification require appropriate renewed validation.

## Version and release plan

Advance **0.9.0 to 0.10.0**, a minor release. The feature adds meaningful public
functionality and an additive endpoint. It is more than a patch, has no planned
breaking contract requiring a major increment and needs no prerelease if the
full gate passes. Pre-1.0 numbering does not excuse incompatible persisted data.

Update all five authoritative sources together during C4:

- `pyproject.toml`.
- Root development-project version in `uv.lock`.
- `apps/web/package.json`.
- FastAPI version in `apps/api/src/molweave_api/main.py`.
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update current producer assertions and compatibility tests, retaining older
archive coverage and historical release records. Do not upgrade unrelated
dependencies or invent a root package version. Recheck tag/release/version
availability; record any ordinary sequencing adjustment before delivery.

Release-note sections:

1. Highlights and example workflow.
2. Membership, multi-selection, empty groups and sorting semantics.
3. Desktop dragging and keyboard/touch alternatives.
4. Persistence, history, archive and rollback compatibility.
5. Verification and review evidence.
6. Deferred scope and known limitations.

## PR, merge, issue response and branch cleanup

The PR describes implemented, simplified, deferred and rejected requirements,
compatibility, exact validation and limitations. Use the approved title and
`Closes #9`. Merge may close the issue before publication; publish the final
scope-accurate issue reply only after the release is remotely verified.

Review the complete diff, resolve consequential findings and accurately identify
whether review was local or independent. Recheck live protection, required reviews,
checks and unresolved conversations; never bypass them. Normal-merge to master,
fast-forward the local branch, verify the remote merged SHA and run the complete
gate on that exact commit. Only then create annotated `v0.10.0` and the GitHub
release. Verify remote tag type/target and published non-draft release.

After publication post the scope-accurate final issue reply, then delete the feature
branch locally/remotely and verify cleanup. Leave unrelated branches unchanged.
Any PR/comment/merge/tag/release operation belongs to later authorized delivery,
not this planning-persistence handoff.

Merge blockers: failed checks, unexplained flakes, partial membership changes,
broken history/no-ops, lost persistence, molecular/viewer side effects,
inaccessible core actions, incompatible archives, version disagreement,
consequential unresolved review findings or unmet repository policy.

Release blockers: failed exact-merged gate, unverified merged SHA, version/tag
collision, incorrect tag target, incomplete evidence or unresolved consequential
findings. Do not bypass blockers or silently reduce accepted scope.

## Progress and completion log

| Checkpoint | Status | Evidence / next action |
|---|---|---|
| Planning review | Complete | Inspected architecture/product/delivery inputs; repository stayed read-only until approval |
| Approval | Complete | User explicitly approved the full proposal on 2026-10-08 |
| Planning persistence | Documentation complete and validated | Fast-forward-only master integration; clean base `94fdcd54e53e674c036e46894669f46f7edc2e66`; dedicated branch created; this document is its first file change |
| M1 / C1 | Complete | Typed atomic membership API; focused and M1 boundary gates passed; evidence below |
| M2 / C2 | Complete | Accessible explicit workflow; scope, focus, stale-tab and viewer checks pass |
| M2 / C3 | Complete | Native desktop drag; explicit mobile equivalents; boundary gates pass |
| M3 / C4 | Not started | Compatibility, full gate, review and release preparation |
| PR / merged gate / publication / closeout | Not started | Later delivery; no remote artifact existence implied |

Planning handoff commits this file with concise PROGRESS and appended D-071 as
`docs(plan): add approved plan for issue 9`, pushes the branch when remote access
is available and verifies its commit. Exact resulting commit/push evidence is
reported in the handoff; no self-referential commit hash is fabricated here.

Planning-document verification on 2026-10-08: `git diff --check` passed; a
standard-library Python check passed all required plan-section/checkpoint checks,
local Markdown link targets, final newlines and whitespace across the three
changed documents, and confirmed exactly one appended D-071. Full documentation
diff review checked the approved scope and historical-evidence boundary. No
runtime, dependency, migration, version or application code changed; implementation
lint/type/test/build/browser gates remain unexecuted.

During implementation append checkpoint date/commit, concrete outcome, exact
commands/results, compatibility evidence, deviations, limitations, blockers and
next action. Keep detailed evidence here and only concise current summaries in
PROGRESS. Next action: **M3/C4 qualification and release preparation**.

### 2026-10-08 — M1/C1 complete

Implemented `POST /group-membership`, optional history selection context on this
action and existing group creation, complete same-project validation, changed-only
legacy `entries.group` actions, stale-revision rejection and exact no-ops retaining
redo. Empty groups survive moves/deletion. Stable name/ID ties make API ordering
deterministic. D-072 fixes automatic membership/blanket-dirty timestamp updates;
checkpoint-derived dirty state already owns entry flags. No migration or new
history vocabulary. Locked entries, originals, normalized documents, settings,
scenes, saved selections, measurements and queued job inputs stay unchanged.

Passing focused commands: `.venv/bin/uv run ruff check .`; `.venv/bin/uv run mypy
apps/api packages/molweave_core` (54 files); `.venv/bin/uv run pytest
tests/unit/test_commands.py tests/integration/test_group_membership.py
tests/integration/test_project_lifecycle.py tests/integration/test_archive_roundtrip.py
-q` (**31 passed**, 10.87 s). The new suite includes invalid batch atomicity,
mixed destinations, complete snapshots, history/redo no-ops, API restart,
checkpoint, archive remapping/empty groups/original bytes and existing action format.

M1 boundary: `corepack pnpm --dir apps/web lint`, `typecheck`, `test` and `build`
all pass (**125 frontend tests**). Existing lazy Mol* build-size advisory remains.
`MOLWEAVE_E2E_API_PORT=8110 MOLWEAVE_E2E_WORKER_PORT=8111
MOLWEAVE_E2E_WEB_PORT=5273 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-issue9-c1-e2e
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
tests/e2e/project-lifecycle.spec.ts` passes **5 tests / 1 intentional layout skip**
in 16.2 s, using fresh migration through 0013. `git diff --check` passes.

Initial checks identified timestamp side effects and test setup snapshot/lifespan
assumptions; all were corrected before the passing run. Local full checkpoint
diff review found no remaining scope, data, scientific, migration or history
finding. Review is local, not independent. No placeholder UI was added. Next: C2.

### 2026-10-08 — M2/C2 complete

Explicit Move to group, conditional Remove from group and batch Add to new group
capture canonical entry scope/revision/selection at activation. Scope includes
filter-hidden highlighted entries and complete-entry meaning for partial atom
selections. Empty groups remain visible; repeated stored names use stable distinct
display labels. Local menu/dialog drafts do not enter molecular or viewer state.
Pending duplicate submission guards, inline errors, stale-revision handling,
keyboard/touch controls and visible focus fallbacks are implemented. See GROUPS.md.

Passing commands: frontend lint, typecheck, full test (**132 passed**) and build;
focused `exec vitest run src/test/project-browser.test.tsx
src/test/group-membership.test.tsx src/test/project-workspace.test.tsx
src/test/structure-loading.test.tsx` (**23 passed**). The viewer boundary verifies
no projection refetch, remount, synchronization, replacement, coordinate patch,
fit or canonical selection mutation for membership-only responses.

Browser command: C1 port overrides 8110/8111/5273, fresh data directory
`/tmp/neistra-issue9-c2d-e2e`, pinned browser path `.playwright`, `corepack pnpm
exec playwright test tests/e2e/group-membership.spec.ts
tests/e2e/project-lifecycle.spec.ts`: **9 passed / 1 intentional layout skip**,
51.1 s. Both layouts qualify filtered batch move/create/ungroup, no-op revision,
history, save/reopen, preserved entry metadata/selection, post-load request counts,
partial multichain selections and second-session conflicts. Scoped WCAG axe checks
pass light/dark after awaiting the existing dialog animation; transient animation
opacity was a test timing finding, not a changed contrast threshold.

Earlier test fixture/schema and ambiguous status selectors were corrected. Local
checkpoint diff review checked captured scope, metadata-only operations, focus,
compatibility and accidental expansion. No new migration/architectural deviation.
Lazy Mol* build-size advisory remains. Next: C3.

### 2026-10-08 — M2/C3 complete

Dedicated desktop grips use a transient, captured project/revision/entry/selection
session. Only that internal session authorizes a drop; the transfer marker contains
no entry IDs or molecular payload. One drop consumes the session before mutation.
Collapsed/empty groups and Ungrouped accept batches; Ungrouped appears while dragging
even when empty. Escape/end/blur/context/busy changes cancel. Touch grips are hidden;
explicit controls remain the complete keyboard/touch workflow.

Native qualification uncovered drag-start layout movement and first-entry hover
feedback. Feedback now overlays without moving rows, headings have stable minimum
height and remain available under filtering (counts show matching rows), and both
dragenter/dragover highlight valid destinations. Leaving child elements does not
clear the containing target. Stored “Ungrouped” names are also disambiguated from
the virtual destination. These are bounded presentation refinements, not new data
or ordering contracts. No scope expansion, schema or migration change.

Passing frontend lint/typecheck/full tests (**134 passed**) and build; focused
`exec vitest run src/test/group-drag.test.tsx src/test/group-membership.test.tsx
src/test/project-browser.test.tsx` (**10 passed**). M2 backend boundary: Ruff,
mypy (**54 files**) and C1 focused Python suites (**31 passed**, 11.62 s).
Browser command uses 8110/8111/5273, fresh `/tmp/neistra-issue9-c3-qualified-e2e`,
pinned `.playwright`, `corepack pnpm exec playwright test
tests/e2e/group-membership.spec.ts tests/e2e/project-lifecycle.spec.ts
tests/e2e/release-hardening.spec.ts`: **15 passed / 3 intentional layout skips**,
1.4 min. The native workflow qualifies all move directions, filtered selected
batches, collapsed targets, immediate hover, absent Ungrouped, exact no-op preserving
redo, unchanged selection, Escape, forged drops and one mutation per drop.
Both layouts pass shell keyboard/axe/containment regressions; desktop performance
budget remains passing. Earlier exploratory failures were fixed and are not passing
evidence. Local full checkpoint diff review and `git diff --check` pass.

Checkpoint commits already verified locally: C1 `fe86a39`, C2 `b3ff555`.
No consequential finding remains; lazy Mol* build-size advisory is unchanged.
Next: C4 compatibility, explicit zoom/viewer instrumentation, versions and full gate.

### 2026-10-08 — C4 review correction: checkpoint timestamp invariance

C3 commit is `268c28b`. Full-diff qualification review identified a remaining
cached-dirty ORM write on reads/checkpoint save that could change sorting timestamps.
D-073 appends the decision to compute dirty only on response copies and preserve
entry timestamps through save. The stored redundant column remains; no migration,
archive shape or reader contract changes. Public checkpoint-derived flags are
unchanged. This fixes the approved sort/persistence contract rather than adding
scope. The new same-session read/move/no-op/save/reopen regression is meaningful:
it fails against C3's service and passes after correction.

Current focused backend gate: Ruff, mypy (**54 files**) and C1 suites
(**35 passed**, 13.38 s, including the in-progress producer compatibility expansion).
The isolated old-service regression is expected failure evidence, not a failed
release gate. C4 release preparation/full qualification remains pending.
