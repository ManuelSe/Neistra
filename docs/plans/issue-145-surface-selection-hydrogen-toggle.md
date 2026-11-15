# Issue #145 — Surface selection and hydrogen visibility

## 1. Status, authority and approved direction

**Status:** Approved scope implemented, verified, merged and released as v0.31.0. See the final issue reply for terminal receipt/branch-cleanup verification.
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


### 2026-11-14 — C1–C4 implementation and delivery authorization

The user's subsequent issue #145 `/goal` authorizes implementation, checkpoint
commits, full qualification, PR/review/merge, version/tag/release and closeout.
Its explicit `Closes #145` instruction supersedes the earlier Refs/late-close
timing only; normal merge may close the issue. Exact-master qualification,
verified publication and final issue reply remain mandatory. No acceptance,
protection or specialist gate is waived. C1 is in progress; no passing checkpoint
or future release is claimed by this authorization record.


### 2026-11-14 — C1 locally verified checkpoint

Manager rows toggle activation, ordinary empty picks clear surface-only activation,
and renderer activation wiring is removed. Solid/mesh/fallback visuals are
nonpickable and unmarked while molecular picks and feedback retain their normal
semantics. Source drafts and gesture/publication recovery survive deselection.
Native qualification also reproduced a newly created pocket losing activation
before query notifications published its canonical entries; entries-only functional
reconciliation fixes that race without timers or forced reactivation. The focused
regression fails before correction and passes afterward, including deletion pruning.

Final C1 validation: lint, types, **729 frontend cases/84 suites**, production build;
**37 native passes/3 exact existing layout exclusions** across the six surface/
viewer files, plus **4 native matrix passes/zero exclusions and 200 real clicks**
through surface-free, opaque solid, translucent mesh and actual fallback visuals
across all granularities/modifiers. Both layouts pass the explicit second keyboard
creation activation regression. Scoped native strict TypeScript gates pass.

The additional matrix command is:

```sh
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/surface-passive-picking.spec.ts
```

[C1 receipt](../assets/surface-selection-hydrogen-toggle/c1-checkpoint.json) records
21 source identities, retained logs/reports and 64 curated native observations
with an internal hash manifest. Final sources match native source readback. Earlier
failed attempts remain diagnostics. Obsolete surface-picking/idempotent-row test
contracts were corrected; the raw geometry ownership oracle uses an opaque
unregistered diagnostic fixture with the normal picking threshold, while managed
production surfaces retain their declared profile. No existing deadline, chemistry
assertion, budget or exclusion was relaxed. Representative native appearance was
visually inspected; no strict reference-host timing or universal capacity is claimed.

Architecture independently passes the bounded creation correction; this does not
replace final all-seven same-candidate review. No schema/API/migration/dependency
or version changes. Global plan and originals remain unchanged. Primary complete
C1 diff review found no further consequential issue after the correction.

Known limitations: C2 hydrogen control/targeting and C3/C4 qualification/release
remain. Existing unrelated standalone pocket-test typing gaps are outside the
registered strict gate and were not expanded. Blockers: none for C2. Next action:
C2, after committing this passing C1 state. Implementation is not ready to push.


### 2026-11-14 — C2 locally verified checkpoint

The primary original H icon now precedes Polymer, with All/Polar/Mixed pressed
state, secondary inheritance reset, actionable unavailable/master-hidden feedback
and retained keyboard focus during publication. Its pure resolver includes current
selected H and one-hop graph-attached H without source/global-selection mutation.
Typed captures reject changed project epochs, seed identities and artifacts before
construction and after awaited preflight; the existing API receives only explicit
H targets and the captured revision. Color and complete-projection polarity
classification remain independent.

Final gates: lint/types, **760 frontend cases/87 suites**, production build;
**26 API regressions/zero skips**; **24 native passes/8 exact existing exclusions**
across all five focused files. No final failure, flake or retry. Native scenarios
include exact heavy-C→H2 payloads and H visibility, unchanged selection/model/
originals/camera, Undo/Redo/reload, mixed/default/reset/master precedence, retired
hidden loads, both themes,320px and actual100%/200% keyboard/pointer interactions.
Native full-viewport CDP images were inspected in light/dark at200% and mobile320;
earlier cropped images were capture artifacts, not a product layout defect.
Three changed native specs pass scoped strict TypeScript.

[C2 receipt](../assets/surface-selection-hydrogen-toggle/c2-checkpoint.json) records
17 final source identities, exact logs/reports and26hashed native observations.
Earlier fixture diagnostics remain separate. Existing test dropdown/idempotence
expectations were migrated without weakening chemistry, input, identity or state
assertions, timing/resource policy or registered exclusions.

Independent performance work profiles the actual browser control at128/10k/100k
synthetic atoms, with zero repeated graph reads on warm/busy/focus/click updates.
The real large loaded scene has58,870protein atoms plus4ligand atoms:2initial
structure reads,0repeat reads,4exact ligand-H commands and unchanged selection,
camera, artifacts and protein settings. Warm actions observed1.87–4.70sdesktop/
2.58–5.21smobile include existing conservative renderer work. Retain this limitation;
no speedup, universal capacity, strict-host or peak-memory/leak qualification is
claimed. Reproducible profile scripts and source hashes are retained with evidence.

Scientific implementation's7independent resolver cases,19command-boundary cases,
UI state/focus/memoization tests, and independent architecture/performance/UI
checkpoint assessments support the implementation. These overlap the complete
frontend count and do not replace final all-seven same-candidate review.
Primary complete C2 diff review found no further consequential finding.

Known limitations: C3 final-version complete gate/actual v0.30.0 readers and C4
delivery remain. No schema/API/migration/dependency or version change yet;
versions remain0.30.0. Blockers:none for C3. Next:commit C2, prepare stable0.31.0
and qualify the committed final-version candidate. Implementation is not ready to push.


### 2026-11-14 — C3 release preparation

C1/C2 are committed as `0fd897e3`/`90aee46e`. A fresh fetch confirms master
remains `923fc2497cff0dc8bd23bf94d2631e8c5bf38b33`; v0.30.0 is the latest stable
release and v0.31.0 has no remote collision. All five authoritative version files
prepare stable minor 0.31.0 for the new graph-attached-H authoring workflow.
No persisted or REST contract, dependency or migration changes; head remains0015.
The compatibility regression preserves historical producer cases and adds0.30.0.

The explicit33-step recipe, runner, audit and summary tools are adapted from the
preceding release without dropping gates, budgets or exclusions. Actual v0.30.0
source is extracted from tagged runtime851ccf34;786source identities match Git.
Tool ASTs and five-version/schema/dependency/migration audit pass. User and release
documentation describes the implemented outcomes and retained measured limits;
reader/full-gate/final-review publication assertions remain explicitly pending.

Next: commit the recipe and release preparation, run the clean final-version gate,
inspect complete diff and obtain seven read-only specialist assessments covering
the same final candidate. No implementation push, PR, merge or release is claimed.


### 2026-11-14 — C3 obsolete native expectation correction

Clean candidate31d6527e passed the first14gate steps (including1543Python,
760frontend and14supervisor cases) then stopped after146native passes/4existing
exclusions. The old rebranding-zoom workflow pressed Enter on an already active
newly created row, correctly deselecting it, then waited for the hidden editor.
This partial run is diagnostic only; no complete qualification is claimed.
The exact failed trace/report/log hashes remain in c3-candidate1-diagnostic.json.

The corrected workflow explicitly proves creation autoactivation, keyboard
deselection/details hidden/focus retained, then keyboard reactivation before all
existing appearance/viewport/axe assertions. Focused zoom file:4passes/4exact
existing exclusions, zero failures/flakes/retries. A bounded audit found no other
obsolete selectors; three historical inline descriptions now say passive picking.
No runtime, title, input modifier, timing, resource limit or exclusion changes.
Architecture and UX independently pass this correction.

Final specialist reviews of the full intended implementation return seven PASS
verdicts; reconfirmation after the final candidate/evidence commit remains. The
scientific reviewer also caught a stale selected-H-only limitations paragraph; it
is corrected to graph-attached targets without global selection mutation.
Next: fresh committed candidate and complete33-step qualification from step1.

Exploratory standalone strict native compilation reports the same existing
TS2345 in unchanged `support/interactions.ts:20` for baseline923fc249 and the
corrected test: zero new diagnostics. This is outside the registered frontend
type gate, which passes. Baseline/current comparison is retained; no suppression
or unrelated shared-helper change is introduced to this scoped correction.


### 2026-11-14 — C3 exact polymer picking oracle

Clean candidate5b97cf8d again passed the first14gate steps and the corrected
zoom workflow, then stopped at190native passes/5existing exclusions. The visibility
test's seven coarse canvas positions missed narrow cartoon/backbone geometry.
Its former surface-shell hit mapping had never established polymer provenance.
Candidate2 logs, report and failed trace/images remain diagnostic, not qualification.

The corrected test fixes CA7/GLY2 and independent normalized residue IDs6–9, then
locates an exact actual-polymer pixel in a bounded projected neighborhood before
one real Shift-click. It requires exactly one add/atom event and exact IDs, with
unchanged hidden mask, camera and polymer/surface geometry. Native proof succeeds
on desktop(584,450) and mobile(173,473);6focused cases pass with zero exclusions,
failures/flakes/retries. Architecture and scientific implementation independently
confirm the oracle and evidence, resolving the diagnostic runtime uncertainty.
No production behavior, granularity, identity, resource/deadline or exclusion
change is made. Final type-only/camera-evidence refinements receive another
focused run before the fresh committed complete gate.

Final focused refinement:6passes/0exclusions, zero failures/flakes/retries;
[c3-polymer-final-receipt](../assets/surface-selection-hydrogen-toggle/c3-polymer-final-receipt.json)
records the exact final source and both native observations. Exploratory strict
native comparison has20existing dynamic-import/shared-harness diagnostics versus
21on candidate5b97cf8d, zero new diagnostics and no blanket suppression. Registered
frontend types pass; this standalone gap is not presented as a passing gate.
Fresh complete qualification restarts from step1 on the next clean commit.


### 2026-11-14 — C3 native warning-fixture sequencing

Candidate89ff156f passed the first14gate steps and437browser cases, with75exact
existing exclusions, before an unchanged mobile warning-dialog Home check failed;
13cases did not run. Both-layout new surface/H workflows and the two prior test
corrections pass within this attempt. It remains partial diagnostic evidence.

The failed trace issues Home170ms afterEnd and leaves the list at its end. Three
instrumented mobile cases/six theme trials pass: End's native scrollend occurs
171–183ms after input, and successful Home follows it by0.5–0.9ms. This supports a
settlement hypothesis without proving a browser or product defect. The bounded
test correction observes the body's own passive scrollend at its real terminal
position before reversing or wheeling, with success/failure listener cleanup.
Original real End/Home/wheel, both viewport assertions,15s assertion limits,
records/read-only/native/accessibility checks and exclusions remain unchanged.
Six repeated both-layout cases/12theme terminal observations pass.

A subsequent full-warning-file focused run catches an initial camera autosave
after the read-only audit starts. The trace proves initialnullcamera/revision0,
native baseline before the sole expected_revision0 PUT acknowledgement to1.
Preparation now waits for the actual public mirror to be clean and match server
revision/camera; it never flushes/forces a pose, ignores writes or adds sleeps.
Stable native baseline capture follows this acknowledgement. All later PUTs remain
forbidden. Final exact-source warning/zoom sweep:13passes/1existing exclusion,
zero failures/flakes/retries. See c3-warning-receipt.json and retained raw profiles.
Architecture, UI and performance read-only assessments support these bounded
fixture corrections. No warning application source or product scope is changed.

Independent17-step tool/actual-reader preflight passes versions/production/legacy
CLI and actual0.30.0↔0.31.0 rich/connectivity producer/readers, both archive
suffixes and deep retention controls. Its manifests/logs remain focused evidence,
not a substituted complete gate. Next: commit and rerun all33steps on a clean
final-version candidate; exact-master and all-seven final reconfirmation remain.


### 2026-11-14 — C3 complete clean candidate qualification

Candidate **636040bdfd289e39b1bc0be34591e044faed37fc** completes all33sequential
steps from a clean tree, without partial-run reuse:1543Python/zero skips,760frontend,
14supervisor,451browser/75exact existing exclusions. All526cases/71files execute;
zero failures/flakes/retries/new exclusions.798current source identities remain
unchanged throughout;786actual tagged0.30.0 identities match before/after. All
recipe/runner/lossless logs, exact exclusion identities and reader reports verify.
Duration5288.287s sums complete commands (5290s wall).

[Summary](../assets/surface-selection-hydrogen-toggle/c3-candidate4-summary.json),
[gate](../assets/surface-selection-hydrogen-toggle/c3-candidate4-gate.json) and
[reader audit](../assets/surface-selection-hydrogen-toggle/c3-candidate4-reader-audit.json)
retain exact evidence. Actual0.30.0↔0.31.0 rich/connectivity producers/readers in
separate implementation processes pass both suffixes, deep styles/surfaces/scenes/
coordinates/original/history/jobs retention and corruption controls. Locks,
migration roundtrip/head0015, static/build/version/production/license/legacy checks
pass. No schema/API/dependency/migration change. All five versions agree0.31.0.

Earlier attempts remain diagnostic and do not contribute partial qualification.
All final native outputs are retained with CRC/internal-hash checks. Source-state,
selection/camera, exact H payloads, manager activation/deselection, passive surface
picking/markers, keyboard/zoom/themes/accessibility and scientific conventions
pass. Existing performance and physical approximations remain; portable success
is not strict-host timing, speedup, universal capacity or leak qualification.

Primary full intended-diff review is recorded separately as self-review. Seven
specialists must inspect intervening corrections/evidence and reconfirm the same
final candidate before implementation push. The prepared c4-master1 recipe will
run afresh on exact merged master before tagging. No PR/merge/release is claimed.


### 2026-11-14 — C3 same-candidate specialist reconfirmation

All seven specialists independently reconfirm PASS for qualified636040bd plus
the documentation/evidence receipt after inspecting the complete intervening diff:
scientific theory, scientific implementation, architecture, performance, UI, UX
and documented workflow reference. No consequential finding remains.
[c3-specialist-review.json](../assets/surface-selection-hydrogen-toggle/c3-specialist-review.json)
records scopes, corrections and limits; [primary review](../assets/surface-selection-hydrogen-toggle/c3-review.md)
is self-review, not independent human approval. All596nativefiles retain CRC and
internal hashes; complete798source/log/reader/inventory verification passes.

A fresh fetch still finds master923fc249, latest stable0.30.0 and no0.31.0 tag
collision. Normal merge preserves checkpoint history. Commit this coherent C3
receipt, obtain each specialist's explicit affirmation of that exact committed
head, then push/open PR. Remote requirements and exact-master33-step qualification
remain mandatory; no merge/tag/release is asserted by this checkpoint.


### 2026-11-15 — C4 verified release delivery

[PR #146](https://github.com/ManuelSe/Neistra/pull/146) merges normally as
cc54cd324c5aebe86024c1b85165715691ddcbb3, with both expected parents and a tree
identical to reviewed `7ed58d98`. All seven specialists explicitly PASS that exact
reviewed head. No required human approval, status check, ruleset or protection
was bypassed. Codex was requested; no external review result returned.

Fresh exact-master qualification completes all 33 steps:1,543 Python/zero skips,
760 frontend,14 supervisor,451 browser/75 exact existing exclusions,526 cases/71 files,
zero failures/flakes/retries/new exclusions.798 current and786 actual tagged-source
identities, complete lossless logs, both reader families/directions/suffixes,
corruption controls and596 native observations verify. Source digest equals the
qualified candidate. Master durations sum to 5,192.411 s (5,195 s wall).

Earlier master attempts remain separate diagnostics: unexplained SIGTERM before
Python completed, then a dev-module HTTP socket reset after442 browser passes.
Six unchanged focused camera cases pass; no source/transport retry, input,
assertion, deadline, resource or exclusion change was made. The successful run
starts from fresh data and re-executes every command. An unsupported-field audit
recorder error and corrected postmerge verification are retained transparently.

Annotated v0.31.0 tag6331147b targets exact qualified master `cc54cd32`. The stable
latest [release](https://github.com/ManuelSe/Neistra/releases/tag/v0.31.0) is verified.
Its qualification archive of 177,651,530 bytes has SHA-256
4b65be17d806ec81f75616c1885b3b8aa2c0b337fecb7ecc01010ba18e03393c; anonymous
download, CRC and all 337 internal manifest entries verify.
[c4-publication.json](../assets/surface-selection-hydrogen-toggle/c4-publication.json)
and [delivery report](../assets/surface-selection-hydrogen-toggle/c4-delivery-report.md)
retain scope, each specialist verdict, corrections, verification and limits.

The [issue reply](https://github.com/ManuelSe/Neistra/issues/145#issuecomment-6887471495)
records implementation/release/compatibility/follow-ups. Terminal documentation
integration and branch-cleanup readbacks are retained there. This receipt changes
only documentation/evidence; no qualified source or runtime tag is changed.
