# Issue #145 — Surface selection and hydrogen visibility

## 1. Status, authority and approved direction

**Status:** approved plan, C0 planning persistence only; runtime implementation pending.
Approval: the user's “Implement the plan.” on 2026-11-14, following the proposal
and explicit product choices below. Approval authorizes C0 only. Stop ready for
`/goal` after committing and pushing this plan; do not begin application changes.

- Issue: [#145](https://github.com/ManuelSe/Neistra/issues/145).
- Plan: `docs/plans/issue-145-surface-selection-hydrogen-toggle.md`.
- Base: `master` / `origin/master` at `923fc2497cff0dc8bd23bf94d2631e8c5bf38b33`.
- Branch: `fix/issue-145-surface-selection-hydrogen-toggle`.
- Proposed release: stable **0.31.0**, annotated tag **v0.31.0**, subject to a fresh collision check.
- Decisions: D-156 and D-157 in `docs/DECISIONS.md`.

The authority order is explicit user guidance and corrections; repository
instructions and accepted decisions; existing architecture, product boundaries,
schemas and conventions; issue outcomes and constraints; then non-binding issue
implementation suggestions. Do not replace the global `docs/PLAN.md` or rewrite
historical decisions.

The user resolved the material product questions:

- A surface shell with no molecular geometry behind the cursor behaves as empty space.
- Hydrogen visibility includes existing hydrogens directly attached to selected heavy atoms.
- The control is one minimalistic icon, prominently placed among the main representation controls.

Planning inspected AGENTS and its local override; product/global-plan/progress/
decision/verification documents; architecture, schemas, APIs, migrations and job
boundaries; frontend state, native picking/marking, previews, commands and tests;
related issues #140/#141/#107 and isotope scope #83; branches, tags/releases,
PR conventions, CI/protection/rulesets, version sources and release tooling.
All seven specialists supplied planning assessments. They inform this design;
they do not qualify an implementation. Exact current reference iconography was
not verified. Use original artwork and neutral repository terminology. Identifying
reference research remains in conversation, outside repository artifacts.

### Requirement disposition

| Requirement | Classification and decision |
| --- | --- |
| Toggle active surface off from its manager row | Essential. Retain row focus and surface visibility. |
| Clear surface activation through empty viewer clicks | Essential. Work even when molecular selection is already empty. |
| Remove unwanted fragment outlines | Essential. Prevent both activation highlighting and molecular selection marks on managed surfaces. |
| Select molecular geometry through surfaces | Essential. Exclude surfaces from native picking rather than discard intercepted hits. |
| Select the molecule through a surface-only shell pixel | Rejected as proposed. User selected ordinary empty-space behavior; no follow-up. |
| Replace hydrogen dropdown | Essential. One prominent H icon toggle with All/Polar/Mixed state. |
| Preserve the dropdown's exact selected-H scope | Rejected as proposed. User explicitly requires attached-H targeting. |
| Include existing directly bonded H | Essential. One-hop current-graph resolution without changing global selection. |
| Reset, inheritance, mixed state and master visibility | Supporting. Preserve existing preference semantics through the new control. |
| Draft, preview, stale-response and focus recovery | Supporting. Preserve current lifecycle guarantees during deselection and toggling. |
| Scientific surface calculation, canonical state, originals and shared camera | Already satisfied, with required regression protection. |
| New REST targeting flag, migration or persistent activation model | Rejected as unnecessary. Existing explicit-H appearance API is sufficient. |
| Isotope-targeting redesign and broader local appearance controls | Deferred to existing #83 and #141 respectively; create no duplicate issues. |
| Additional surface modes, selection proxies or outline preferences | Optional, excluded. They do not address this correction; no speculative follow-up. |
| Product ambiguities | Resolved. No outstanding product decision blocks this plan. |

## 2. Implementation contract

### Surface interaction and rendering

Keep active surface identity in application UI state as the manager's editing
target, separate from molecular selection and visibility.

- Clicking an inactive row activates it; clicking it again clears activation.
  Visibility buttons remain independent.
- An ordinary empty primary viewer click clears activation and follows existing
  molecular deselection semantics. Modified empty clicks retain existing behavior.
- Molecular picks preserve the manager's editing target, use current granularity/
  modifiers, and never open the manager.
- Creation continues to reveal and activate the exact newly created surface
  through the manager workflow.
- Closing/reopening the manager preserves its existing transient editing target
  unless explicitly deselected; introduce no new persistence.

Every managed surface representation—solid, mesh and fallback lines—receives
`pickable: false` and `markerActions: 0` before installation acknowledgement and
after relevant updates. Clear existing markers before masking any reused marked
visual. The pinned renderer supports both state controls; native tests must still
prove actual click-through and absence of outlines.

Remove renderer activation/highlighting subscriptions and surface-driven picking-
threshold adjustments. Remove obsolete internal `subscribeSurfaceSelection` and
`setActiveSurface` wiring from the viewer contract, lazy adapter, engine, callers
and test doubles. Retain identity/retirement bookkeeping to reject obsolete queued
hits. Preserve rendered-atom accounting, bounds, geometry caches and resource limits.

Reuse the existing viewer selection event: emit an empty replace event for every
accepted ordinary empty pick, including zero-selection cases. The application
clears active surface state on an empty replace event without a molecular pick.
Keep primary-input, movement, rebuild and generation guards. No new event channel
or public API is needed. Make the manager's activation callback nullable.

Deselection preserves session-owned source drafts. Existing rules govern
unfinished preview cancellation and completed/pending appearance saves. Valid
input blur may complete an existing gesture before deselection; that appearance
command is not a deselection command. Late completion must not reactivate a row,
reopen details or steal focus. Object-specific uncertainty and recovery remain.

### Prominent hydrogen icon

Place an always-visible **Hydrogens** row immediately after atomic representation/
Hide controls and before Polymer. Use one original 18px neutral H glyph with the
existing icon-button styling and a secondary reset icon. Remove the former bottom
dropdown block. Do not add a seventh tile to the existing six-column style grid.

| Effective preference | Accessible state | Appearance and action |
| --- | --- | --- |
| All | `aria-pressed="true"` | Accent plus Check; activation selects Polar. |
| Polar | `aria-pressed="false"` | Neutral H glyph; activation selects All. |
| Mixed | `aria-pressed="mixed"` | Existing mixed-state dash; activation selects All. |

Use the stable accessible name **Show non-polar hydrogens**. Tooltip and accessible
description communicate current mode and next action: “Hydrogens: All. Show polar
only.”, “Hydrogens: Polar. Show all.” or “Hydrogens: Mixed. Show all.” Convey entry-
default provenance separately in the tooltip. The mixed-state dash is a state
badge, not chemical minus imagery. Avoid charge or atom-addition imagery.

Reset is **Use entry hydrogen setting**. Disable it when no target override exists.
Keep loading, unavailable-data and no-target states distinct, with accessible
reasons. Master-hidden preferences remain editable with concise existing feedback,
without enabling the hydrogen master switch. Reuse shared success/error feedback;
do not add a popup or duplicate live region.

Use Enter/Space activation and preserve keyboard focus during pending work with
guarded `aria-disabled` handling; prevent repeated dispatch. Do not restore focus
after the user moves elsewhere. Retain at least existing coarse-pointer 44px
targets and adequate desktop spacing/target sizes. Both modes must work on touch
without requiring a tooltip to operate. Put uncommon explanation in existing help.

### Attached-hydrogen targeting

One pure resolver supplies the target for displayed state, toggle and reset:

> Existing selected element-H atoms, plus existing element-H endpoints directly
> bonded in the current normalized graph to selected heavy atoms.

Heavy seeds exclude H/D/T. Deduplicate by entry and stable atom ID. Include hidden
H and recorded edges with unknown order or inferred provenance. A bridging H is
included once; an explicitly selected isolated H remains eligible. Do not traverse
further, infer missing bonds, use distance, generate atoms or alter global selection.
Missing edges supply no attached target; preserve existing connectivity warnings.

Preserve current isotope handling and complete-projection polarity classification.
Element-H isotope metadata is unaffected; D/T element targeting remains outside
this correction. All/Polar expresses the nonpolar-display preference; polar H
remains unaffected by that preference and remains subject to existing visibility
gates. A polar-only target may store a preference without a visible change.

Resolve effective state using local override over entry default. Equal effective
values remain uniform even when inheritance differs. Rendering never publishes an
override. Reset removes overrides from the same resolved target.

Use a hydrogen-specific internal callback carrying the captured project, project
epoch, seed selection, participating artifact identities and resolved sorted H
operand. Keep the color callback/targeting unchanged. Capture only after current
styling structures have loaded for the matching palette context. Validate active
project/epoch, seed and artifacts before dispatch and again after asynchronous
mutation preflight through the established project-command path. Reject stale
captures with actionable feedback rather than retarget or retry automatically.

Submit the explicit operand through the existing appearance endpoint and captured
revision guard. The server retains authoritative current-artifact H validation.
Once dispatched, completion belongs to the captured project and target. Preserve
existing monotonic cache/feedback ownership. No REST expansion flag is needed.

### Data, science and performance boundaries

No HTTP schema, database migration, archive format, job, plugin, dependency or
scientific-method change is planned. Alembic remains **0015**; project/viewer/
archive remain schema **2**, normalized/selection/component remain schema **1**.
Keep the installation-wide camera policy and original molecular files unchanged.

Memoize target derivation by current immutable participating projections and seed
selection; resolve preferences separately. Avoid repeated atom/bond scans on
camera, tooltip or busy-state renders. Add no persistent index, worker or
speculative cache. Expected target derivation is one bounded atom/bond/selection
pass plus target ordering, not a new performance claim.

Plain surface activation/deselection must cause zero worker calculations,
normalized reads, structure reloads or project mutations, excluding legitimate
completion of an already edited appearance gesture. Hydrogen actions submit one
existing appearance command without serializing structures. Measure cold opening,
warm repeated toggles, resolver work counts and lifecycle retention on ordinary
explicit-H fixtures and a representative large loaded scene. Preserve D-148.

Append narrowly scoped decisions:

- D-156: manager-only surface activation and passive surface rendering,
  superseding D-155's selectable-surface behavior.
- D-157: attached-H display targeting and prominent icon control, superseding
  D-053's prohibition on heavy-atom targeting.

Preserve the remaining accepted geometry, polarity, persistence and camera decisions.

## 3. Checkpoints and validation

| Checkpoint | Outcome, affected areas and acceptance | Documentation, commit and compatibility |
| --- | --- | --- |
| C0 — Persist approved plan | Clean, fast-forwarded master; dedicated branch; approved contract recorded. No runtime changes. Validate clean diff, links, branch/tag availability and remote commit readback. | Write feature plan first; append decisions and concise progress summary. Commit exactly `docs(plan): add approved plan for issue 145`. Versions unchanged. |
| C1 — Correct surface interactions | Manager toggle, empty-click clearing, passive surfaces and obsolete activation wiring removed. Native picks reach real molecular geometry; surface markers remain absent through updates/rebuilds. | Update surface guidance, feature log and progress. `fix(viewer): keep surfaces passive during molecular selection`. No migration; rollback restores previous UI behavior without data conversion. |
| C2 — Add hydrogen control | Prominent icon, graph-based targets, effective state/reset, captured dispatch guards and keyboard behavior. One command per action; molecular selection and scientific data unchanged. | Update styling guidance, feature log and progress. `feat(viewer): add prominent attached-hydrogen visibility toggle`. Existing API/storage contract retained. |
| C3 — Qualify release candidate | Integrated regressions, final versions, compatibility readers, complete release gate, full-diff review and seven specialist assessments cover the final candidate. | Prepare release recipe/evidence and verification records. `chore(release): prepare v0.31.0`; corrective commits use their appropriate scope. No empty checkpoint commits. |
| C4 — Deliver verified release | Normal PR merge; fresh exact-master qualification; annotated tag, release, evidence download and final issue response remotely verified. | Record delivery normally with `docs(release): record verified v0.31.0 delivery` when records change. Never move the runtime tag for later documentation receipts. |

Each runtime checkpoint runs focused tests, frontend lint/typecheck/full unit
suite/build, and its relevant native workflows. Fix validation failures before
proceeding. Run Python static checks/tests if backend boundaries change.

### C1 focused validation

```sh
corepack pnpm --dir apps/web exec vitest run src/test/surface-objects.test.ts src/test/surface-manager.test.tsx src/test/surface-editor.test.tsx src/test/viewer-adapter.test.ts src/test/viewer-interaction.test.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/surface-objects.spec.ts tests/e2e/viewer-click-selection.spec.ts tests/e2e/entry-surfaces.spec.ts tests/e2e/pocket-surfaces.spec.ts
```

### C2 focused validation

```sh
corepack pnpm --dir apps/web exec vitest run src/test/selection-hydrogen-targets.test.ts src/test/selection-style-dialog.test.tsx src/test/representations.test.ts
.venv/bin/uv run pytest tests/integration/test_viewer_state.py tests/integration/test_appearance_inheritance.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-appearance.spec.ts tests/e2e/polar-hydrogen-visibility.spec.ts tests/e2e/hydrogen-membership.spec.ts tests/e2e/selection-style-recovery.spec.ts
```

The new resolver test file is an implementation deliverable, not existing evidence.
Keep the existing API regression rejecting heavy-only operands: the UI resolves
them to an explicit H operand, rather than changing server targeting semantics.

Required independent scenarios:

- Empty-click clearing with zero/nonzero molecular selection; keyboard row
  toggling; unchanged visibility/camera/history.
- Actual molecular hits beneath opaque/translucent solid, mesh, overlapping and
  fallback surfaces; granularity/modifier preservation and no automatic manager opening.
- Surface marker buffers remain clear while ordinary molecular feedback remains.
  Rendered checks distinguish unwanted outlines from legitimate green surface coloring.
- Draft retention and unfinished/completed/pending appearance gestures during deselection.
- Exact H sets for heavy/H mixtures, isolated H, bridging H, sparse IDs and multiple entries.
- Distant recorded neighbors included; nearby unbonded H excluded; unknown/inferred
  edges counted; deleted edges excluded; no H–H propagation or D/T expansion.
- Mixed→All, inherited-equal state, reset, master-hidden, unavailable targets,
  Undo/Redo, scenes, reload and archives. Selecting heavy atoms with attached hidden
  H enables the control; no attached H remains a clear no-target state.
- Selection/artifact changes during loading or mutation preflight, project
  A→B→A switching, and revision conflicts without automatic replay.
- Exact molecular-selection, coordinate, graph, conformer, warning, original-byte
  and isotope/protection-metadata invariance.
- Both themes, 320px width, touch targets and actual 200% browser zoom.

For C3/C4, adapt the established release recipe into
`docs/assets/surface-selection-hydrogen-toggle/`, using actual tagged **v0.30.0**
as the previous reader and comparing all migrations unchanged. Commit source/tool
changes before starting clean candidate qualification. Retain the complete gate
from `docs/DEVELOPMENT.md`:

```sh
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
```

Use disposable data and recorded environments; include migration roundtrip,
production/version/license/dependency audits, legacy CLI checks, and actual
bidirectional readers with both archive suffixes in separate implementation
processes. Keep rich surface/style/scene/original comparisons and corruption
controls. The preceding tag's exact runtime is
`851ccf34b639e3974815aede9979c22f334a5767`.

Preserve lossless logs, source identities, failed attempts and exact exclusions.
Do not weaken assertions, deadlines, budgets or exclusions to pass. Follow D-148;
portable checks do not establish strict reference-host timing. No optimization
speedup is promised. Final-version candidate and exact merged master each require
their complete qualification, not partial-run substitution.

Baseline planning evidence: **65 frontend tests passed across six suites**
(surface objects/manager/editor, selection styling, viewer adapter/interaction).
Scientific implementation independently ran the existing hydrogen API case:
**1 passed, 20 deselected**. These results do not demonstrate proposed behavior.
New click-through, outline, attached-H and icon regressions remain pending.

## 4. Version, PR and release plan

The prompt's missing-history assumption is outdated. Remotely verified latest
stable release is **v0.30.0**, with an annotated tag targeting
`851ccf34b639e3974815aede9979c22f334a5767`.

Use **minor 0.31.0**. Surface corrections alone could be a patch, but user-approved
heavy-atom-to-attached-H targeting adds functionality. No incompatible API or
stored-format change warrants a major increment, and this is intended as stable
functionality rather than a prerelease.

During C3 update all five authoritative version sources:

1. `pyproject.toml`.
2. The root `neistra-dev` package in `uv.lock`.
3. `apps/web/package.json`.
4. `apps/api/src/neistra_api/main.py`.
5. `apps/api/src/neistra_api/archive_service.py`.

Recheck version/tag collisions before preparation. Preserve historical archive
producer expectations; final metadata is provenance, not reader qualification.

- PR title: `feat(viewer): add attached-hydrogen toggle and correct surface selection`.
- Merge: normal merge commit preserving checkpoints.
- Closure: use `Refs #145`; close through the verified final reply after exact-
  master qualification and publication, unless subsequent explicit guidance
  changes closure timing.
- PR and final reply distinguish implemented, simplified, deferred and rejected
  requirements, including the user's attached-H/icon/prominence amendments.
- Follow-ups: retain #83/#107/#141 boundaries; create no additional issue for
  excluded optional work.
- Release notes: surface selection and outlines; prominent hydrogen toggle and
  target scope; compatibility/rollback; limitations and deferred work; verification.
- Rollback: matching v0.30.0 components can retain existing settings/data without
  schema conversion, subject to actual-reader qualification; older UI restores
  older interaction behavior. Back up the complete managed store before deployment.
- Verify tag target, published stable release, notes, qualification asset download
  and checksums, issue response and branch cleanup remotely. Delete only this
  feature branch after delivery/readback and clean-tree checks; preserve unrelated branches.

Block merge for failing applicable checks, unresolved consequential findings,
stale-target publication, scientific/state/camera regressions, missing same-
candidate specialist assessments, unapproved scope/schema/dependency changes,
version disagreement, or unmet remote requirements.

Block publication until exact merged master passes its complete gate and tag/
release evidence verifies remotely. Planning inspection found no Actions workflows
or master protection/rulesets; recheck before merge and never bypass subsequently
configured requirements.

All seven final implementation assessments must be `PASS` or justified
`NOT_APPLICABLE` on the same candidate: scientific theory, scientific implementation,
software architecture, performance, UI design, UX design and modeling reference.
Review the complete intended diff, reconcile consequential findings and revalidate
corrections. After candidate changes, affected specialists reassess and the others
inspect the intervening diff and explicitly reconfirm. Missing applicable evidence
is `BLOCKED`, not approval. These assessments supplement required remote review
and do not constitute human approval. Primary complete-diff review remains required.

## 5. Approval, persistence and completion log

Approval authorizes the following C0 actions only:

1. Confirm a clean working tree.
2. Fetch origin and update local master using fast-forward-only operations. Stop
   on divergence or consequential intervening changes.
3. Recheck branch/version collisions and create the planned branch.
4. Persist the approved feature plan as the first branch change, then append
   decisions and update the concise project progress summary. Leave global
   `docs/PLAN.md` unchanged.
5. Commit with `docs(plan): add approved plan for issue 145`.
6. Push when remote access is available and verify the remote commit.
7. Report exact plan path, branch, commit, C0–C4 checkpoints and minor-release
   impact. **Stop ready for `/goal`; do not begin C1.**

This document retains status/approval metadata, requirement dispositions, the
implementation contract, milestone evidence, deviations, limitations, blockers,
release/cleanup records and the chronological completion log. Project progress
stays concise; architectural decisions remain append-only.

### 2026-11-14 — Approved C0 planning persistence

Read-only investigation and all seven specialist planning assessments completed;
user choices incorporated and the complete proposal approved. Clean master
fetched/fast-forward checked at `923fc249`; the dedicated branch was created after
confirming branch/tag availability. This document is the first branch file change.
D-156/D-157 and the project summary accompany the C0 commit. Commit/push/readback
verification is the handoff evidence reported to the user, without a self-referential
commit hash in this document.

Known limitations: reported surface behavior and the existing hydrogen dropdown
remain unchanged; no application fix, candidate qualification, PR or future release
is claimed. Versions remain 0.30.0. Blockers: none for C0. Next action: `/goal`.
