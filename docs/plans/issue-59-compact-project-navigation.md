# Issue #59 — Compact entry and component navigation

## 1. Status, outcome, and authority

**Status:** implementation authorized by `/goal` on 2026-10-14. C0 was committed
and remotely verified at `9f454c0eee7912aca623a3d239f9593a40b65235`. M1/C1 is
implemented and qualified. M2/C2 and M3/C3 are complete; M4/C4 release delivery
remains approved and pending.


- **Issue:** [#59 — Redesign the entry list and component hierarchy for compact,
  uncluttered navigation](https://github.com/ManuelSe/Neistra/issues/59), open,
  with no comments at planning inspection.
- **Persistent plan:** `docs/plans/issue-59-compact-project-navigation.md`.
- **Approval:** user instruction “Implement the plan.” on 2026-10-14, following
  the complete proposal and confirmation of the product choices below. The
  requested approval workflow limits this handoff to C0; it does not start
  runtime implementation.
- **Base:** `master` / `origin/master` at
  `430e7d0ccfb8643710ea13a26509e284e26550a7`.
- **Feature branch:** `feat/issue-59-compact-project-navigation`.
- **Proposed release:** **0.15.0**, annotated tag `v0.15.0`, subject to a collision
  recheck before release preparation.
- **Audience:** scientists navigating projects containing multiple entries and
  large molecular component collections.

Deliver a compact entry list and an independently scrolling component browser.
Scientists must retain access to warnings, metadata, selection, visibility,
grouping, and existing entry actions without expanded components pushing entries
out of view.

Authority follows the requested order: explicit user guidance; repository
instructions and accepted decisions; existing architecture and product boundaries;
issue outcomes; non-binding technical suggestions. This plan does not replace
the global [PLAN](../PLAN.md). Cross-project ownership is recorded in
[D-097](../DECISIONS.md#d-097--independent-component-browsing-context).

Inspection covered AGENTS, PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS, VERIFICATION,
browser/hierarchy components, workspace and selection stores, artifact-keyed
queries, component selection helpers, schema-2 surface objects, migration0014,
archives, generic jobs, relevant tests, related issues, versions, branches,
releases, and PR conventions.

**Confirmed product choices:**

1. Entry-name activation retains molecular selection semantics and sets the
   component browse target. A separate Components action changes only browsing
   context.
2. Component and viewer selections leave that browse target pinned.
3. Desktop uses split panes; mobile uses Entries/Components tabs.
4. Large component collections use continuous virtual scrolling. The user chose
   this over the proposed paged-row default.

The absent-release-history premise is outdated. The remotely verified
[v0.14.0 release](https://github.com/ManuelSe/Neistra/releases/tag/v0.14.0) targets
`88e84b27a0fb6c4520333df236d788065fd7a788`. Subsequent master changes contain
release-closeout documentation and evidence, without runtime changes. At approval
recheck, issue #59 remains open, no open PR exists, and the planned feature branch
and v0.15.0 tag do not exist remotely. Clean master was fetched and updated using
a fast-forward-only operation; its actual base remains the SHA above.

## 2. Requirement disposition

| Significant requirement | Classification | Planned treatment |
|---|---|---|
| Compact, single-line entry rows | Essential | Fixed-height rows prioritizing name, visibility, and status. |
| Metadata and warnings remain accessible | Essential | Keyboard/touch-accessible Details action; full warning text retained. |
| Modified and locked state remain discoverable | Essential | Accessible status indicators and existing lock control. |
| Groups, search, filtering, sorting, overflow actions | Already satisfied | Preserve behavior; compact the controls and presentation. |
| Separate component browser below entry list | Essential | Desktop vertical split with independent scrolling. |
| Resizable and collapsible component pane | Supporting | Reuse the existing panel library and layout preference conventions. |
| Parent-entry identity stays clear | Essential | Persistent pane header names the inspected entry and its visibility state. |
| Browsing context survives component selection | Essential | Explicit transient browse target, independent of canonical molecular selection. |
| Remember expansion while switching entries | Supporting | Session memory keyed by project and entry; retain across responsive remounts. |
| Direct category/component label selection | Essential | Existing canonical operands and modifier algebra. |
| Disclosure and visibility act independently | Essential | Separate sibling controls; no nested interactive buttons. |
| Repeated headings and “Select category” rows | Rejected as proposed | Remove duplication; the category label becomes the selection action. No follow-up needed. |
| Large collections stay collapsed initially | Supporting | Categories start collapsed; descendants enter the virtual row model only after expansion. |
| Continuous scrolling for large collections | Essential after user decision | Virtualize component rows, with complete keyboard navigation and focus retention. |
| Explicit shared visibility scope | Essential | Explain that Water and Other solvent share the Solvent switch. |
| Per-component visibility controls | Rejected as proposed | Would imply unsupported durable semantics. Existing category-group controls and selection styling remain available; no new follow-up. |
| Optional counts | Supporting | Show category component counts; put detailed atom counts in Details. |
| Keyboard-accessible supplementary information | Essential | Explicit Details controls, focus restoration, and accessible full labels. |
| Many-entry, large-collection, long-name, narrow-width tests | Essential | Component and native browser qualification. |
| Reuse classification and selection | Already satisfied | Preserve their existing authorities and contracts. |
| Surface-object compatibility | Already satisfied | Preserve the released manager and ownership; no surface redesign. |
| Split panes on mobile | Rejected as proposed | User chose tabs to preserve usable drawer height. No follow-up needed. |
| Entry-list virtualization | Optional, deferred | Ordinary compact rows suffice for this slice; qualify 200 entries. Create a focused follow-up only if measurements expose a remaining problem. |
| Persist browse target or expansion in projects/archives | Deferred | Session navigation does not belong in scientific project state. No follow-up without a reload-persistence requirement. |
| Rename/reclassify components; subset extraction/export | Deferred | Existing [#20](https://github.com/ManuelSe/Neistra/issues/20) and [#21](https://github.com/ManuelSe/Neistra/issues/21) own the necessary contracts. |
| Carbon defaults, charge coloring, chemistry assignment | Deferred | Existing #58, #64, and #52 remain independent. |
| Remaining product ambiguities | Unclear and requiring decision: none | Confirmed choices and defaults below complete the contract. |

## 3. Implementation contract and implications

### Compact entries and desktop/mobile layout

- Keep visibility, lock, and overflow actions directly available. Retain desktop
  group drag handles and existing keyboard/touch group actions.
- Remove the metadata subline. Entry Details exposes full name, description,
  filename, format/type, atom count, timestamps, and complete warning messages.
- Add **Components** to entry actions as a browse-only operation. Entry-name
  activation also sets the browse target while invoking the existing
  replace/add/subtract selection operation.
- Keep search visible. Place the existing labelled filter and sort selects in a
  compact disclosure, with an active-filter indicator.
- Use 32px rows for fine-pointer desktop layouts and 44px rows for coarse-pointer/
  mobile layouts. Truncate long labels visually while retaining accessible full
  names.
- Desktop starts with a 60/40 entry/component split. Reuse
  `react-resizable-panels`, with keyboard resizing, component collapse/restore,
  and minimum expanded heights that retain controls and at least two rows.
- Persist only split size and collapse preference through the existing safe
  workspace storage. Invalid or missing preferences use defaults.
- Mobile initially shows Entries. Explicit Components opens the Components tab;
  entry-name activation sets the target without forcing a tab change. Include a
  clear return to Entries.

### Browsing ownership and lifecycle

Introduce a small typed, application-owned session store containing the inspected
entry ID, per-entry category expansion, and scroll position. It stores no molecular
payload or component hierarchy.

- Start with no inspected entry and a concise “Choose an entry to browse
  components” state.
- Keep the target when its row is filtered out, grouped elsewhere, collapsed,
  hidden, renamed, or deselected. Indicate when it is outside the displayed entry
  list.
- Group selection does not choose an arbitrary browse target.
- Clear browsing state on project change. Deleting the inspected entry clears
  its target; Undo does not silently reactivate it.
- Preserve expansion across coordinate edits. After topology changes, reconcile
  against current category/component IDs and clamp obsolete scroll/focus positions.
- Browse target changes are synchronous and independent of asynchronous
  molecular-selection requests.
- Render loading, failure, and Retry states for the current target. Late responses
  for previous entries/projects cannot replace the current pane.
- Reuse the existing structure query key: project, entry, and current artifact.
  Opening a pane or returning to a cached entry must not duplicate normalized
  requests.

### Direct component interactions and virtualization

- Flatten the ten existing nonempty categories into compact category rows
  followed by expanded component rows. Remove duplicate section headings.
- Category labels select the complete category; component labels select its exact
  existing canonical membership. Preserve selection granularity and modifier
  semantics.
- Disclosure changes expansion only. Visibility changes only the existing mapped
  viewer setting. Details opens complete provenance, classification explanation,
  metadata, and warnings.
- Render visibility controls only for supported mappings. Water and Other solvent
  controls explicitly say they affect **all solvent, including water and
  additives**. Their states remain synchronized.
- Distinguish requested category visibility from a hidden parent entry. Do not
  imply that a hidden parent is rendering.

Use pinned `@tanstack/react-virtual@3.14.19`, updating only its required dependency
graph and `pnpm-lock.yaml`. Its headless API supports stable item keys and custom
rendered ranges; application code remains responsible for semantics and focus.
[Official virtualizer documentation](https://tanstack.com/virtual/latest/docs/api/virtualizer).
At planning inspection, npm declares React19-compatible peers and pinned
`@tanstack/virtual-core@3.19.4` for this adapter version.

- Use one component-pane scroller, stable category/component keys, fixed row
  heights, and eight rows of overscan on either side.
- Retain a focused row or open Details launcher in the rendered range until focus
  safely moves.
- Provide Up/Down and Home/End navigation across the complete expanded row model,
  including off-screen rows. Enter/Space invokes the focused label with existing
  selection modifiers; disclosure buttons remain separately keyboard accessible.
- Use native labelled buttons and list semantics with logical position/count
  information. Do not introduce an incomplete ARIA tree.
- Focus movement and scrolling never select atoms. Returning from Details restores
  its launcher; removal/collapse moves focus to the surviving category control or
  pane header.
- Build an artifact-keyed membership index once, avoiding the current repeated
  full-atom scan for every component. Derive selection coverage from one
  canonical-selection membership set. Construct full category operands on
  activation, without restricting selection to mounted rows.

### Data, API, scientific, and compatibility boundaries

- **No backend endpoint, public API/type shape, database migration, job/plugin, or
  archive-format change.**
- Alembic remains0014; project/viewer/archive schemas remain2; normalized molecules
  and selections remain1.
- Add only frontend presentation/session interfaces and additive layout
  preferences.
- Original uploads, normalized artifacts, atom identities, coordinates, bonds,
  classifications, inference records, and scientific warnings retain their
  existing authorities.
- Classification remains source/fallback/ambiguous evidence, not a claim of
  biological function or binding significance.
- Selection, browsing, disclosure, metadata viewing, resizing, and scrolling
  create no project command. Existing visibility, locking, grouping, and entry
  mutations retain revisioned history behavior.
- Surface activation and management do not retarget component browsing or become
  molecular selection.

Append D-097 for independent browsing ownership and its lifecycle. Preserve
D-013, D-018/019, D-045, D-071, and D-090–096; clarify only the superseded
inline-hierarchy presentation. Do not rewrite accepted decisions. D-097 is
available at the approval recheck.

## 4. Milestones, checkpoints, and verification

Every checkpoint must be coherent, locally reviewed, documented, and committed
only after passing its checks. Each implementation milestone also runs frontend
lint, type-check, all Vitest tests, build, relevant Python checks, and its focused
browser suite.

### C0 — Approved planning handoff

**Outcome:** approved persistent contract, ready for `/goal`.

- **Affected areas:** feature plan, concise project progress, appended
  architectural decision.
- **Acceptance:** approval metadata, actual base SHA, confirmed choices,
  dispositions, checkpoints, release plan, and completion log recorded;
  documentation-only diff.
- **Validation:** `git diff --check`, local Markdown links, unique decision
  identifier, exact staged-file review.
- **Commit:** `docs(plan): add approved plan for issue 59`.
- **Migration/rollback:** none; documentation can be reverted.
- Stop after pushing and remotely verifying this checkpoint.

### M1 / C1 — Separate browsing context and compact entry list

**Outcome:** functional desktop split/mobile tabs, compact entries, accessible
Details, and pinned component context. The existing hierarchy remains usable
inside the new pane.

- **Affected areas:** browser layout, workspace/session state, entry actions/
  details, styles, App wiring.
- **Acceptance:** confirmed activation semantics; independent scrolling; no
  entries displaced by hierarchy expansion; retained grouping/search/filter/sort/
  actions/modifiers; context survives filtering and responsive remounts; project/
  deletion cleanup and stale loading are correct.
- **Focused validation:**

  ```bash
  corepack pnpm --dir apps/web test -- project-browser project-workspace group-membership group-drag group-action-focus
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/project-navigation.spec.ts tests/e2e/group-membership.spec.ts tests/e2e/structure-hierarchy.spec.ts
  ```

- **Documentation:** progress, plan log, ownership and user guidance.
- **Commit:** `feat(browser): separate entry and component navigation`.
- **Migration/rollback:** additive browser preferences only; older clients ignore
  them. Runtime rollback restores the previous layout.

### M2 / C2 — Compact direct hierarchy with continuous virtual scrolling

**Outcome:** single-line category/component interactions, explicit visibility
scopes, preserved warnings, bounded rendering, and complete keyboard access.

- **Affected areas:** hierarchy projection, frontend membership index, virtual row
  model, Details/focus handling, dependency lock.
- **Acceptance:** exact operands equal existing selection behavior, including
  covalent boundaries and ambiguous material; categories select all members
  regardless of virtualization; disclosure/visibility/details never select;
  shared Solvent controls stay synchronized; off-screen navigation and focus
  restoration work.
- **Focused validation:**

  ```bash
  corepack pnpm --dir apps/web test -- component-hierarchy component-membership project-navigation project-browser
  .venv/bin/uv run pytest tests/integration/test_component_hierarchy.py tests/unit/test_components.py tests/unit/test_selection.py tests/scientific/test_component_classification.py
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/project-navigation.spec.ts tests/e2e/structure-hierarchy.spec.ts tests/e2e/synchronized-selection.spec.ts
  ```

- **Documentation:** keyboard interaction, visibility scope, virtualization
  budgets, decision rationale.
- **Commit:** `feat(browser): virtualize compact component navigation`.
- **Migration/rollback:** no durable change; revert frontend and dependency
  changes together.

### M3 / C3 — Workflow, accessibility, performance, and compatibility qualification

**Outcome:** independently demonstrated complete navigation workflow.

- **Affected areas:** component/browser tests, compatibility evidence,
  accessibility/performance documentation.
- **Acceptance scenarios:**
  - 200 entries across groups; 10,000 generated components; long and duplicate
    names; 240px desktop pane, 320px viewport, mobile drawers, light/dark,
    actual100%/200% browser zoom.
  - Equal row heights within each input mode; no horizontal overflow or clipped
    essential controls.
  - Component DOM rows remain bounded by viewport rows plus overscan and at most
    two pinned focus/details rows. Scrolling does not create per-component
    requests or repeatedly rebuild membership indexes.
  - Browser context, scroll, and expansion behave correctly through filtering,
    regrouping, lock/hide, deletion/Undo, coordinate/topology edits, project
    switching, and responsive remounts.
  - Exact project/artifact/history and camera snapshots stay unchanged for
    browse-only operations; canonical selection changes only for explicit
    selection actions.
  - Real WebGL selection and mapped visibility remain synchronized. Existing
    surface and movement workflows pass.
  - Keyboard access reaches off-screen components and full warning text; scoped
    axe reports no findings. Record manual keyboard/screen-reader checks
    separately from automated accessibility claims.
  - Actual tagged v0.14.0 reads final-version projects/archives, including surface
    objects, retained history/scenes, original bytes, coordinates, and completed
    jobs.
- **Focused validation:** C1/C2 suites plus `surface-objects.spec.ts`,
  `interactive-selection-transform.spec.ts`, `release-hardening.spec.ts`; archive,
  migration, and viewer-state integration tests.
- **Compatibility:** reuse the two-process tagged-reader qualification and add
  current surface-object coverage. Do not represent changed version strings as
  an actual old-reader test.
- **Documentation:** [VERIFICATION](../VERIFICATION.md), retained evidence under
  `docs/assets/project-navigation/`, architecture/user guidance, progress and
  plan log.
- **Commit:** `test(browser): qualify compact project navigation`.
- **Migration/rollback:** no downgrade; qualified v0.14.0 rollback preserves data
  and restores prior navigation.

### M4 / C4 — Release preparation and delivery

**Outcome:** versioned, reviewed, fully qualified release.

- **Affected areas:** five authoritative versions, provenance assertions, release
  notes, candidate/merged evidence, PR and issue closeout.
- **Acceptance:** complete gates pass on a clean candidate and the exact merged
  master; actual v0.14.0 compatibility passes; remote tag/release/issue state
  verified.
- **Commits:** `chore(release): prepare v0.15.0`, followed by substantive evidence/
  documentation commits. No empty checkpoint commits.
- **Documentation:** release notes and completion records; post-publication
  evidence uses a documentation PR.
- **Rollback:** redeploy qualified v0.14.0 and reload frontend; no data stripping
  or schema downgrade.

**Complete release gate, on candidate and exact merged master:**

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-disposable-directory> .venv/bin/uv run alembic upgrade head
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

Use disposable browser/compatibility storage and available isolated ports. Retain
source SHA, environment, commands, exit codes, timing, screenshots, checksums,
and intentional skips. Separate failing diagnostics from passing evidence; do not
count unexecuted scenarios as verified.

## 5. Release, approval handoff, and completion tracking

**SemVer:** **0.14.0 →0.15.0, minor**. Independent browsing, responsive panes/tabs,
and virtual navigation add meaningful user-visible functionality. This exceeds a
presentation bug fix, so a patch understates the change. Public API and persisted
contracts remain compatible, so no major increment is warranted. Existing stable
release practice and complete qualification support a normal release; incomplete
work blocks publication rather than becoming an unapproved prerelease.

Update all authoritative application versions together:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update version assertions/provenance cases and the approved virtualization
dependency lock only; avoid unrelated dependency upgrades.

- **PR title:** `feat(browser): compact entry and component navigation`.
- **Merge strategy:** normal merge commit preserving passing checkpoint history,
  following recent PRs.
- **PR content:** approved plan, implemented and simplified behavior,
  dispositions, compatibility, evidence, limitations, and review findings.
- **Closing strategy:** `Closes #59` only when accepted scope is complete. Link
  existing follow-ups; create no speculative duplicate issues.
- **Release notes:** Added; Changed navigation; Compatibility and rollback;
  Scientific interpretation; Accessibility and performance; Verification; Known
  limitations/follow-ups.
- Recheck branch protection, rulesets, checks, reviews, and conversations before
  merge. Inspection found no workflows/rulesets or protected master, but that is
  not permission to bypass later requirements.
- Request the existing Codex PR review convention during delivery; address
  actionable findings. Describe local review as self-review unless independent
  review actually returns.
- After merge, qualify exact master before creating annotated `v0.15.0` and a
  stable GitHub release. Verify peeled tag target, release state, notes, and
  evidence remotely.
- Publish a scoped final issue reply, complete any documentation-only closeout PR,
  then delete the feature branch locally/remotely and verify clean master.

**Merge/release blockers:** failed or incomplete gates; lost/inaccessible warnings;
incorrect selection or visibility scope; stale browsing data; unintended molecular/
API/schema changes; unbounded DOM or repeated membership scans; keyboard/focus
regressions; failed preceding-reader compatibility; inconsistent versions; release
collision; unresolved consequential findings/conversations; unmet checks or reviews;
unverified merged/tag target.

**After approval, C0 only:**

1. Recheck issue, remote master, branch/plan/version collisions, and clean working
   tree.
2. Fetch origin and fast-forward local master with `git merge --ff-only
   origin/master`. Stop on divergence or unrelated changes; do not discard them.
3. Create the planned feature branch.
4. Persist the approved feature plan as its first change. Add concise
   [PROGRESS](../PROGRESS.md) status and the accepted decision; leave global
   [PLAN](../PLAN.md) intact.
5. Validate and commit with the exact C0 message; push and verify remote branch/
   commit if access is available.
6. Report exact path, branch, commit, approved C1–C4 milestones, and minor-release
   impact. **Stop ready for `/goal`; do not implement.**

Later checkpoints append actual commits, evidence, deviations, limitations,
blockers, and next action. PROGRESS remains the concise project summary; this
feature plan remains the detailed contract.

## 6. Progress and completion log

### 2026-10-14 — Approval and C0 documentation preparation

- User explicitly approved the complete proposal by instructing “Implement the
  plan.” Confirmed choices retain entry-click selection plus explicit browse-only
  Components, pinned viewer/component context, desktop split/mobile tabs, and
  continuous virtual scrolling rather than paged components.
- Issue #59 remains open and unchanged. Latest stable release remains v0.14.0.
  No open PR, planned issue branch, or v0.15.0 tag was found at approval recheck.
- Fetched origin, confirmed clean master, and completed the fast-forward-only
  update. Base is `430e7d0ccfb8643710ea13a26509e284e26550a7`.
- Created `feat/issue-59-compact-project-navigation`. This plan is its first file
  change; project progress and accepted D-097 accompany the C0 commit.
- C0 documentation validation passed: `git diff --check`, all 51 local Markdown
  links across the three changed files (including the D-097 anchor), six plan
  sections, five checkpoint definitions, balanced code fences, exact approval/
  base/branch metadata, unique D-097, and the exact three-file documentation-only
  scope. All five authoritative versions and the global PLAN are unchanged.
  Commit/push/remote verification are reported in the planning handoff; the exact
  first commit cannot embed its own final hash.
- M1/C1, M2/C2, M3/C3, and M4/C4 are approved and not started. Application versions
  remain0.14.0; no dependency, API, schema, migration, runtime, or test change is
  part of C0. No implementation PR, release tag, release, or issue reply is
  produced by this handoff.
- Known limits: browse target/expansion/scroll are session-only; entry-list
  virtualization is deferred; visibility stays at existing shared-group scope;
  component overrides/export, surface redesign, carbon defaults and charge
  chemistry remain separate.
- Blockers: none identified for the planning handoff.
- Next action: complete the commit/push/remote handoff, then await `/goal` before
  M1/C1. No runtime implementation follows this planning commit.

For each later checkpoint append actual source/commit identity, commands/results,
acceptance evidence, scope deviations, blockers, and next action. Never claim an
unimplemented behavior, unrun check, or unverified remote action as complete.

### 2026-10-14 — M1/C1 complete: separate navigation and compact entries

- `/goal` authorizes implementation and full delivery. The planned feature branch
  is clean at C0; refreshed origin/master remains430e7d0 with no release collision.
- Compact single-line entry rows retain selection/modifiers, group scopes and
  existing actions. Details exposes full metadata/warnings with keyboard/touch
  focus restoration. Explicit Components changes browsing alone; entry-name
  activation also selects. Desktop split/collapse and mobile tabs are functional.
- Transient navigation remembers expansion/scroll across targets and remounts,
  retains filtered/hidden context, scopes queries and Retry to the current target,
  and clears project/deleted state without Undo auto-reactivation. App-level
  reconciliation also runs while the browser is unmounted. D-097 implementation
  note records focus/ARIA corrections without altering historical decisions.
- [Exact C1 evidence](../assets/project-navigation/c1-verification.json):10 focused
  and all218 frontend tests,12 Python integration tests, Ruff/mypy61, lint/types/
  build/diff pass. Final complete focused browser suite:17 passes/3 intentional
  layout skips in2.0minutes, no failures/retries. Native tests retain grouping,
  stale feedback, viewer/surface invariance, camera/selection, reload and axe.
- Initial JSDOM geometry and dialog-tooltip Escape findings were repaired.
  The first browser run's four filter-disclosure fixture failures are separate
  diagnostic evidence; all original late-response focus assertions remain and
  the complete corrected run passes. Earlier diagnostics are not passing gates.
- User guidance and architecture explain ownership and available C1 workflow.
  Versions remain0.14.0; no dependencies/backend/schema/migration/jobs change.
  C2 compact direct/virtual component rows remain unimplemented. Pinned emulation
  and existing lazy bundle advisory remain limitations, not new certification.
- Local full checkpoint diff review found no scope expansion, loss of warnings,
  molecular authority violation, migration or compatibility change. Not independent
  review. No blocker. Next: commit passing C1, then implement M2/C2.

### 2026-10-14 — M2/C2 complete: direct virtual component navigation

- C1 committed193b2e1. Replaced repeated headings, expanded selection-action rows,
  and inline provenance with compact direct category/component rows and accessible
  Details. Disclosure, selection, visibility and Details stay independent; shared
  Solvent controls explicitly include water and additives. Requested visibility
  retains hidden-parent context and current application membership authority.
- Added artifact-keyed atom/residue/component/category indexes with exact established
  canonical operands/granularities and one current selected-ID set.10k components
  visit the atom collection once. Stable virtual IDs,8-row overscan, bounded focus/
  Details retention and complete Up/Down/Home/End navigation keep off-screen members
  accessible. Complete-category selection never uses only the mounted window.
- [C2 evidence](../assets/project-navigation/c2-verification.json):9 focused/all221
  frontend and22 Python tests, Ruff/mypy61/lint/types/build/diff pass. Native broad
  suite23 passes/7 intentional layout skips in3.4minutes, zero failures/retries.
  Real normalized10k O-only water components pass both layouts: bounded DOM, last-row
  keyboard selection, Details return, complete10k category,1 normalized request and
  exact project invariance. Generated coordinates do not certify preparation science.
- Shared Solvent control fixture ambiguity is recorded separately: first broad run
 20passes/7skips/1failure; corrected category-scoped locator preserves shared scope,
  and the complete final run passes. No scientific rule or visibility field changed.
- Approved adapter3.14.19/core3.19.4 are the only new dependencies; versions stay0.14.0,
  head0014/schemas2/1. Legacy dead hierarchy styles were removed; current user/architecture
  guidance and D-097 implementation note record ownership and keyboard semantics.
- Local complete checkpoint review finds no new API/persisted/molecular authority,
  classification, source loss, scope expansion or incidental dependency upgrade.
  Not independent review. C3 broader lifecycle/performance/zoom/compatibility and C4
  full gates/publication remain. No blocker. Next: commit C2, implement/qualify C3.

### 2026-10-14 — M3/C3 complete: workflow and compatibility qualification

- C2 committed and remotely verified1b53671. Qualified200 actual grouped entries
  with long/duplicate names,32/44px rows,240px desktop/320px mobile,10k normalized
  components, light/dark and actual100/200% Chromium zoom. Exact camera/mount,
  normalized-request, canonical selection and project snapshots remain invariant
  for browse-only work. Surface/movement and adjacent grouping/style workflows pass.
- [C3 evidence](../assets/project-navigation/c3-verification.json):14focused/all227
  frontend;176archive/migration/viewer/surface/component Python plus22domain tests
  (2overlap); Ruff/mypy61/lint/types/build. Final broad browser51passes/3intentional
  skips in11.2m; adjacent25passes/7intentional skips in3.9m; zero failures/retries.
- Reproduced contrast, viewport-menu overflow, artifact/topology-owned focus,
  queued old-project focus and Details closing over a later tool were repaired.
  Focused regressions and complete corrected browser gates pass; earlier failed
  or interrupted diagnostics remain explicitly separate. D-097 appends rationale.
- Actual tagged v0.14.0 API/core module paths are asserted; preliminary reader
  accepts exact originals/coordinates/history/jobs/scenes/three surfaces and archive
  seed remapping. Producer still0.14.0 at this checkpoint: final0.15.0 producer
  qualification remains mandatory on candidate and exact merged master in C4.
- Manual screenshot inspection is recorded separately from automated keyboard/axe;
  no interactive screen-reader or hardware/cross-browser certification is claimed.
  Generated O-only waters qualify navigation, not preparation chemistry. Existing
  session/shared-visibility limits and pinned-browser/bundle/Alembic advisories remain.
- Local complete checkpoint diff review found no unrelated scope, scientific/API/
  persisted authority change, dead hierarchy controls or migration risk. Versions
  remain0.14.0 and Alembic0014; no new migration. No blocker. Next: commit C3 and
  begin C4 version preparation and complete candidate release gate.
