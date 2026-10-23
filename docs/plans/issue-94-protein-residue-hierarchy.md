# Issue #94 — Protein residue browsing and shared range selection

## 1. Status, authority, and outcome

**Status:** approved implementation contract; implementation and verified delivery
authorized by the user's `/goal` on 2026-10-23. M1/C1 is implemented and passes its focused gate; M2/C2 is next.

**Approval:** the user's “Implement the plan.” on 2026-10-23 approves the complete
proposal, including its mandatory C0 stop ready for `/goal`. This authorizes
planning persistence, not implementation or the subsequent delivery lifecycle.
The approved product choices are compact expansion of existing chain rows and
minimal shared-behavior changes to the existing Sequence tab.

| Item | Approved value |
|---|---|
| Issue | [#94 — Add expandable residue lists to protein chains in the Components panel](https://github.com/ManuelSe/Neistra/issues/94) |
| Issue metadata at C0 | Open; enhancement; no milestone or comments; last updated 2026-10-19T13:37:59Z |
| Plan document | `docs/plans/issue-94-protein-residue-hierarchy.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked local/remote base | `d3bac6f85df840a8c45abb8177a88b2a7f5ea273` |
| Feature branch | `feat/issue-94-protein-residue-hierarchy` |
| PR title | `feat(selection): browse protein residues and share range selection` |
| Merge strategy | Normal merge commit, preserving passing checkpoints |
| Planned release | Stable **0.25.0** |
| Proposed annotated tag | **v0.25.0** |

**Approved outcome:** scientists can expand existing protein-chain component
rows, browse available residues, and select complete residues or inclusive ranges
using one selection model shared with the viewer and existing Sequence tab.

The user confirmed:

- Expand existing protein-chain component rows directly into residues.
- Make only the shared-behavior changes needed in the existing Sequence tab.
  Its relocation and redesign remain with
  [#95](https://github.com/ManuelSe/Neistra/issues/95).

Authority follows the requested order: explicit user guidance;
[repository instructions](../../AGENTS.md) and accepted
[decisions](../DECISIONS.md); existing architecture and product boundaries;
issue outcomes; nonbinding implementation suggestions. Preserve the global
[plan](../PLAN.md) and [product specification](../PRODUCT_SPEC.md).

Relevant accepted decisions include D-018/019, D-042, D-045, D-097, and
D-120–125. D-144/145 record the approved cross-panel residue actions and expanded
navigation state. Supersede only D-122's viewer-only anchor-establishment
limitation; do not rewrite historical decisions.

### Inspected baseline and assumptions

The working tree was clean on `master`. Remote refs confirmed the approved
feature branch and tag were absent. C0 revalidation found the issue and release
baseline unchanged, and `git pull --ff-only origin master` reported already up
to date at the base above.

There is an established stable release history through
[v0.24.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.24.1), contrary to the
brief's assumption. At planning inspection, GitHub exposed no workflows, master
protection, rulesets, required checks, or open PRs. Recheck before delivery; this
does not authorize bypassing any later requirement. No dedicated release script
or PR template was found; use the documented command-based qualification and
publication conventions.

Inspection covered architecture, normalized/project/archive schemas, structure
API and derived component memberships, migrations through 0014, generic jobs,
frontend state ownership, tests, related issues #2/#59/#90/#91/#95, Git branches,
tags, releases, PR conventions, and verification/release tooling. External
workflow research was completed during planning; external product references
remain outside repository artifacts.

No significant product decision remains unresolved. The approved defaults keep
the existing classifier, source-instance boundaries, canonical atom references,
transient anchor ownership, and nonprotein behavior.

## 2. Requirement disposition

| Significant requirement | Classification | Disposition and rationale |
|---|---|---|
| Expand protein chains into residues | Essential | Extend existing protein-chain component rows beneath the Protein category. |
| Additional component → chain nesting | Rejected as proposed | Current components already represent source chain instances. A duplicate level adds navigation without information. User approved the simpler layout; no follow-up needed. |
| Residue names, numbering, insertion codes, and sequence order | Essential | Use normalized residue identity and list order; preserve source labels without inventing missing sequence. |
| Distinguish overlapping numbering and chain names | Essential | Scope identity to entry/component/chain/residue; disambiguate colliding visible labels. |
| Compact scrolling and large-protein responsiveness | Essential | Extend the existing continuous virtual list and cached membership indexes. |
| Keyboard navigation | Essential | Extend existing list/button navigation to expanded residue rows and disclosures. |
| Expansion independent from selection | Essential | Separate disclosure and label actions at every expandable level. |
| Existing component selection and visibility controls | Already satisfied | Preserve component operands, Details, warnings, and category visibility scopes. |
| Complete residue selection regardless of picking mode | Essential | Residue buttons explicitly target normalized residue membership. |
| Ctrl/Cmd toggles complete or partial operands | Already satisfied | Reuse shared whole-operand algebra; integrate new residue actions with it. |
| Inclusive same-chain Shift ranges | Essential | Extend existing fixed-anchor range behavior to panel residue actions. |
| Cross-chain additive fallback | Essential | Also enforce entry and source-component boundaries. |
| Shared anchor across viewer, Components, and Sequence | Essential | One transient selection-store anchor; no panel-local anchor. |
| Bidirectional full/partial selection display | Essential | Derive coverage from canonical selected atom references in both panels. |
| Preserve expansion and scroll during selection changes | Essential | Extend transient navigation state; selection does not retarget or scroll browsing. |
| Preserve camera, visibility, and picking mode | Already satisfied | Retain existing ownership boundaries and verify new actions respect them. |
| Reuse normalized data, cached queries, and shared modifier policy | Supporting | Required implementation constraint to prevent state and behavior divergence. |
| Minimal Sequence labels, coverage, and range integration | Supporting | Necessary for the issue's three-interface acceptance criteria; user confirmed scope. |
| Horizontal sequence strip, chain selector, and Inspector-tab removal | Deferred | Existing #95 owns this separate layout feature. No duplicate follow-up issue. |
| Tests for chain boundaries, insertion codes, partial coverage, and modifiers | Essential | Include pure, component, and native browser coverage. |

No essential #94 outcome is deferred. No additional optional issue feature is
required for acceptance.

Non-goals are sequence alignment, missing-residue reconstruction,
reclassification, nonprotein hierarchy expansion, new chemistry, per-residue
visibility, automatic camera focus, and persistent browsing or anchor state.
These are not prerequisites for this issue; no new follow-up is required.

## 3. Implementation contract and implications

### Shared residue identity and actions

- Reuse or extract the immutable-projection index behind existing gesture
  helpers. Provide residue membership, source-order protein intervals, labels,
  and selection coverage without scanning all atoms for every row.
- Iterate `NormalizedStructure.residues` in its existing order, restricted to
  the assigned protein component and chain. Neither component membership-array
  order, numerical residue IDs, author numbering, insertion-code sorting, nor
  geometry defines a range.
- Use every existing normalized atom belonging to the residue, including hidden
  hydrogens and alternate sites. Do not infer residue membership for orphan atoms
  or reconstruct absent atoms.
- Show the recorded residue name, author number with label-number fallback, and
  insertion code. If both numbers are absent, identify the internal residue ID
  explicitly rather than presenting it as a sequence number. Preserve nonstandard
  names.
- Keep separate source instances distinct even when chain names and residue
  numbers overlap. Add a compact instance qualifier only where display labels
  collide.

Add one typed frontend residue-selection callback routed through App to the
shared store. Its request carries project ID/visit epoch, entry ID, current
artifact ID, residue ID, existing selection source, selection mode, and Shift
state. Resolve membership from the current artifact-keyed query cache and reject
stale ownership or missing targets.

Generalize the existing atomic selection/anchor transition for explicit panel
residues. Viewer events retain their existing typed adapter and use the same
underlying range policy. Do not add an HTTP operation, persisted field, selection
granularity, or second selection store.

### Selection behavior

- Plain residue activation replaces selection and establishes its anchor.
- Ctrl/Cmd completes a partially selected residue or removes a fully selected
  residue. Toggle-on establishes an anchor when Shift is absent.
- Shift adds the inclusive range within the same entry, protein component, and
  chain. Repeated Shift operations retain the original anchor.
- Without a valid matching anchor, Shift adds only the clicked residue.
- Preserve modifier precedence: Alt subtracts, then Ctrl/Cmd toggles, then Shift
  adds/ranges, then ordinary replacement. Shift and Alt never establish or
  advance an anchor.
- Preserve invalidation on clear, unrelated replacement, picking-mode change,
  project/visit change, artifact replacement, or incomplete anchor membership.
  Responsive remounts preserve valid anchors; reload clears them.
- Panel residue actions work in every picking mode. Viewer range eligibility
  remains Atom/Residue mode; Chain/Structure viewer picks retain their existing
  behavior.
- Preserve source metadata as `project`, `sequence`, or `viewer`; range helpers
  must not incorrectly stamp panel results as viewer selections.

Generic chain/component/category actions retain their existing operands. Saved
selections and scenes restore references without establishing anchors.

### Components and Sequence presentation

Extend `EntryBrowsingState` with expanded protein-component IDs. Preserve
expansion and scroll across entry switching and responsive remounts; reconcile
removed IDs after artifact changes. Molecular payloads remain in TanStack Query.

Use the existing flat virtual list:

- Protein category → existing protein-chain component → residue.
- Categories and protein components have independent disclosures.
- Residue leaves contain a compact selection button; retain existing component
  Details and warning access.
- Navigation never automatically follows viewer or Sequence selections.
- Preserve 32px fine-pointer and 44px coarse-pointer rows, eight-row overscan on
  either side, and at most two retained focus/Details rows.

Keep the Sequence tab's location and layout. Reuse indexed membership and shared
label/coverage helpers; route protein residue buttons through the new action.
Retain existing nonprotein polymer and whole-chain selection behavior without
extending protein-range eligibility to them.

### Accessibility, science, data, and performance

- Keep native list/listitem/button semantics. Expose full, partial, and
  unselected states through `aria-pressed`, with a visible partial-state
  distinction beyond color.
- Up/Down/Home/End move focus without selecting. Right expands or enters
  children; Left collapses or returns to the parent. Enter/Space activate the
  focused label or disclosure.
- Collapsing or deleting a focused descendant returns owned focus to its
  surviving parent, then category or pane heading. Delayed work cannot steal
  focus from another project or control.
- Qualify both themes, narrow layouts, actual 200% zoom, keyboard operation, and
  scoped axe checks.
- Preserve classification and parsing warnings. Browsing makes no claim that a
  residue is chemically complete or that numbering defines uninterrupted
  biological sequence.
- No database migration, normalized artifact rewrite, API/job/plugin change,
  chemistry calculation, or dependency upgrade is planned. Alembic remains
  0014; project/viewer/archive schemas remain 2; normalized/selection/component
  schemas remain 1.
- Selection and browsing must produce no project mutations, normalized
  refetches after loading, molecular serialization, or changes to camera,
  visibility, revision, history, or original-file bytes.

## 4. Milestones, checkpoints, and verification

Each checkpoint updates this detailed log and the concise
[progress summary](../PROGRESS.md). Append material architectural decisions to
[the decision log](../DECISIONS.md). Record actual commands, outcomes, source
identities, limitations, and failed attempts accurately. Follow
[verification](../VERIFICATION.md), [development](../DEVELOPMENT.md),
[accessibility](../ACCESSIBILITY.md), and [performance](../PERFORMANCE.md)
conventions.

### C0 — Persist approved planning; stop before implementation

**Outcome:** an approved, committed, remotely verified planning branch ready for
`/goal`.

After explicit approval, when write operations are enabled:

1. Confirm a clean working tree, switch to local `master`, fetch origin, and
   fast-forward only to `origin/master`. Stop on divergence or unexpected changes.
2. Revalidate the issue, base, branch/tag availability, and release baseline.
   Material changes require plan revision.
3. Create `feat/issue-94-protein-residue-hierarchy`.
4. Create this approved plan document as the first branch change. Record approval
   metadata, then append the accepted decisions and concise progress handoff.
5. Validate Markdown links, the staged diff, whitespace, and documentation-only
   scope.
6. Commit with **`docs(plan): add approved plan for issue 94`**.
7. Push with upstream tracking when remote access is available; verify the remote
   SHA.
8. Report the exact path, branch, commit, milestones, and minor-release impact.

**Acceptance:** only planning documents changed; implementation and version
changes remain pending.

**Rollback:** documentation-only revert; no data or migration implications.

**Mandatory stop:** no implementation, PR, issue messages, tag, or release at C0.

### M1 / C1 — Shared residue actions through the existing Sequence tab

**Outcome:** viewer and Sequence protein-residue gestures share one anchor and
selection transition.

**Affected areas:** selection helpers/store, App routing, Inspector Sequence
rendering, focused tests.

**Acceptance:** exact forward/reverse ranges, fixed anchors, toggle
completion/removal, modifier precedence, source metadata, invalidation,
stale-event rejection, insertion-code labels, and partial coverage pass. Existing
viewer gestures and nonprotein behavior remain intact.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run selection selection-gestures sequence structure-loading
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-gestures.spec.ts tests/e2e/synchronized-selection.spec.ts
```

Also run frontend lint, typecheck, complete frontend tests, build, and
`git diff --check`.

**Documentation/migration:** update [gesture guidance](../SELECTION_GESTURES.md),
accepted anchor decision, progress, and evidence; no migration.

**Commit:** `feat(selection): share residue ranges with sequence selection`.

**Rollback:** revert frontend changes; persisted references remain compatible.

### M2 / C2 — Expandable virtual residue hierarchy

**Outcome:** Components provides the complete browsing-and-selection workflow.

**Affected areas:** hierarchy rows, navigation state, browser callback plumbing,
styling, component and browser tests.

**Acceptance:**

- Assigned protein-chain components expand into correctly ordered residue leaves.
- Viewer, Components, and Sequence can establish and extend ranges in both
  directions.
- Duplicate chain labels/numbers, insertion codes, gaps, source-component
  boundaries, hidden atoms, and partial selections behave correctly.
- Disclosure, focus movement, scrolling, and selection remain independent.
- Expansion/scroll survive selection changes, entry switching, and responsive
  remounts.
- Artifact replacement, deletion/Undo, loading errors, and retries retain safe
  focus and current ownership.
- Existing component selection, visibility scopes, warnings, and Details remain
  accessible.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run component-hierarchy project-navigation selection-gestures sequence
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/protein-residue-hierarchy.spec.ts tests/e2e/project-navigation.spec.ts tests/e2e/structure-hierarchy.spec.ts tests/e2e/synchronized-selection.spec.ts
```

Add `tests/e2e/protein-residue-hierarchy.spec.ts`. Also run the frontend checks
required at C1.

**Performance acceptance:** a deterministic 10,000-residue navigation fixture
reaches off-screen endpoints and selects complete membership with DOM bounded by
viewport rows + 16 overscan + 2 retained rows. On the pinned qualification host,
expansion/scroll/selection interactions complete within 5 seconds, with no
observed task ≥750ms and no repeated normalized GETs. Identify this as a
navigation fixture, not chemistry qualification. Retain existing native 1STP
budgets.

**Documentation/migration:** update navigation, accessibility, performance,
gesture guidance, and evidence; no migration.

**Commit:** `feat(navigation): expand protein chains into selectable residues`.

**Rollback:** revert hierarchy/navigation additions; session browsing state is
disposable.

### M3 / C3 — Final-version candidate and compatibility qualification

**Outcome:** a reviewed, reproducible release candidate ready for a PR.

**Affected areas:** regression coverage, five version sources, compatibility
evidence, release notes, documentation.

Run the complete gate from a clean, fixed candidate:

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

Use disposable migration/browser stores and unused ports. Set `MOLWEAVE_DATA_DIR`
to the dedicated disposable migration store before running Alembic, never to
user-managed data. Supply the documented locked AmberTools environment and
single-thread native settings; required scientific cases must not skip.

Reuse `tests.support.selection_reader_qualification` with separate
producer/reader processes in both directions against an actual detached
**v0.24.1** checkout and final **0.25.0** source. Use its `produce`/`read` commands
with explicit `--implementation-root`, `--expected-version`, `--data-dir`, and
`--evidence` arguments.

**Acceptance:** exact saved references, scene selections, archive remapping,
molecular state, originals, history, appearance, surfaces, and jobs survive
compatible readers. Expansion and anchors are absent from durable output. Native
browser tests independently prove gesture authoring; older-reader retention does
not imply older UI support.

Retain evidence under `docs/assets/protein-residue-hierarchy/`, including commands,
environment, source/log hashes, timings, screenshots, and documented exclusions.
Review the full diff and requalify consequential corrections.

**Documentation/migration:** finish verification, accessibility/performance notes,
compatibility statement, release notes, progress, and plan log. Confirm unchanged
schema/head and dependency pins.

**Commits:** substantive `test(selection): ...` and
`chore(release): prepare v0.25.0`; no empty checkpoints.

**Rollback:** qualified matching v0.24.1 client/API with retained managed data; no
schema downgrade.

### M4 / C4 — Verified merge, publication, and close-out

**Outcome:** verified delivery with accurate remote references and cleanup.

Open the PR only after C3 passes. Document implemented, simplified, deferred, and
rejected requirements, compatibility, limitations, and evidence. Satisfy all
current required checks, reviews, and conversations without bypass.

After normal merge, repeat the complete gate and actual-reader qualification on
the **exact merged master SHA**. Only then create the annotated tag and stable
GitHub release.

Publish verification assets and verify downloaded hashes and ZIP integrity.
Record publication in a documentation-audit PR using
`docs(release): record verified v0.25.0 publication`; keep the runtime tag fixed.

**Acceptance/validation:** remotely verify PR merge, tag target, release
state/assets, final issue reply, and branch cleanup. Documentation-only audit
changes require link/integrity checks and `git diff --check`.

**Rollback:** block publication on failed merged qualification. Fix through a
reviewed PR and requalify; never move a published runtime tag.

## 5. Version, release, issue strategy, and progress log

**SemVer: stable minor, 0.24.1 → 0.25.0.** This adds meaningful
residue-navigation and cross-interface selection functionality. A patch
understates the added capability. A major increment is unwarranted because public
APIs, durable schemas, archives, and existing scientific behavior remain
compatible. A prerelease is unnecessary once the established stable qualification
gates pass.

Update these five authoritative version sources together:

- `apps/web/package.json`
- `pyproject.toml`
- Root project version in `uv.lock`
- FastAPI version in `apps/api/src/molweave_api/main.py`
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Update relevant assertions without dependency upgrades. Reassess the increment if
another release advances the baseline or consumes v0.25.0. All five sources remain
0.24.1 at C0; the version change belongs to the implementation PR.

Use `Closes #94` in the implementation PR. After verified publication, post the
final issue reply with actual PR/tag/release/evidence links, scope decisions, and
remaining limitations. Keep #95 open for the sequence-layout redesign; do not
create duplicate follow-ups.

Release-note sections:

1. Expandable protein residue browsing.
2. Shared selection ranges and partial-selection feedback.
3. Keyboard, accessibility, and large-list behavior.
4. Compatibility, migration, and rollback.
5. Verification, scientific limitations, and #95 follow-up.

**Merge blockers:** incomplete approved behavior; incorrect
membership/order/boundaries; stale selection publication; camera or visibility
side effects; lost browsing/focus; consequential unresolved findings; failed
required reviews/checks; inconsistent versions; unexpected API/schema/dependency
changes; missing compatibility evidence; or relaxed performance/scientific gates.

**Additional release blockers:** failed exact-merged qualification, changed
source during qualification, unqualified required skips, tag collision/wrong
target, or unverifiable release assets.

After the documentation audit merges, fast-forward local master and verify clean
local/remote refs. Delete only this issue's merged branch and disposable
qualification worktrees. Preserve unrelated branches, managed user data, and the
runtime tag.

### Progress and completion log

| Stage | Evidence/status at C0 |
|---|---|
| Repository and issue analysis | Complete; inspected architecture, schemas, APIs, migrations, jobs, state ownership, tests, related issues, refs, releases, and tooling. |
| Product choices | Compact chain-row expansion and minimal Sequence integration confirmed. |
| Frontend baseline | 26 tests passed across selection gestures, sequence, component hierarchy, and project navigation. |
| Python baseline | 58 selection, component, hierarchy-integration, and archive tests passed. |
| Approval | User approved the complete proposal on 2026-10-23; C0 stop remains binding. |
| C0 persistence | Approved plan, appended D-144/145, and concise project handoff are this documentation checkpoint. Exact commit and remote verification are reported in the completion handoff. |
| M1–M4 implementation/delivery | Not started; baseline tests do not qualify the proposed feature. |
| Known limitations | No new residue browsing or cross-panel anchor functionality is claimed at C0. Existing classifier and scientific limitations remain. |
| Blockers | No planning blocker identified; implementation awaits a subsequent `/goal`. |
| Next action | Complete C0 documentation verification/commit/push, report verified refs, and stop ready for `/goal`. |

2026-10-23 — Planning baseline commands, run read-only before approval:

```bash
corepack pnpm --dir apps/web exec vitest run selection-gestures component-hierarchy project-navigation sequence
.venv/bin/uv run pytest tests/unit/test_selection.py tests/unit/test_components.py tests/integration/test_component_hierarchy.py tests/integration/test_archive_roundtrip.py -q
```

Results: four frontend files / 26 tests pass; 58 Python tests pass in 19.91s.
An earlier Python invocation was interrupted by the server restart and is not
counted as evidence; the completed rerun supplies the reported result.
No complete implementation, browser, or release gate was run or claimed at C0.

2026-10-23 — C0 documentation verification passes: all 133 relative file links
across this plan, progress and decisions resolve; only the three approved
planning documents changed; all five application versions remain 0.24.1; the
new text follows repository naming policy; checkpoint/handoff metadata and
whitespace checks pass. The complete documentation diff is reviewed before the
required planning commit. Commit and remote-ref verification belong to the final
handoff rather than a self-referential commit hash in this document.


### Implementation authorization and C1 progress — 2026-10-23

C0 completed at `b857f99af87f61bf5325ff00b2f7e1a33910275d`, pushed with the
exact remote ref verified. The subsequent user `/goal` authorizes M1–M4 and
verified delivery under this unchanged scope. The earlier C0-only stop is
historical, not a restriction on the explicitly authorized implementation run.

C1 implements owned explicit residue requests, shared atomic anchor transitions,
indexed Sequence membership, insertion-code/ID labels and mixed coverage.
Initial focused/static/build results pass:17 Python,86 focused/342 total frontend,
Ruff, strict mypy102, ESLint, TypeScript and build. Native validation remains in
progress. An initial new project-invariance assertion compared an immediate PUT
response to a later GET; trace shows only SQLite timezone serialization differences,
not a mutation. Use a GET baseline for exact GET-after comparison. Preserve the
initial attempt as diagnostic and rerun on the corrected test source before
claiming C1 completion. No threshold, scientific membership or production
behavior is changed by that observation correction.


### M1/C1 complete — 2026-10-23

[Final gate](../assets/protein-residue-hierarchy/c1-final-gate.json) passes all10
commands:17 Python,86 focused/342 total frontend, Ruff/strict mypy102/ESLint/
TypeScript/build/diff and17 native browser workflows, with one existing mobile
cross-layout exclusion and no failures or retries. Source identities remain
unchanged through qualification; all lossless log hashes verify. Desktop/mobile
native inputs prove fixed cross-interface ranges, hidden-H complete membership,
partial feedback, exact camera/project/GET/request invariance and retained viewer
behavior. Pure cases additionally prove all four picking modes, source boundaries,
retired project visits/artifacts, modifier precedence and entry-independent indexes.
[Implementer review](../assets/protein-residue-hierarchy/c1-review.md) records
full-diff assessment and manual screenshot inspection; independent review is not
claimed.

[Initial gate](../assets/protein-residue-hierarchy/c1-initial-gate.json) is
diagnostic:15 native passes,2 new-test failures,1 existing exclusion. Retained
traces prove a PUT/GET timestamp serialization mismatch and the mobile background
overlay being covered by its drawer. Final tests compare two GET snapshots and
use the documented focused-panel Escape action. No runtime change, threshold
relaxation, retries or scientific assertion reduction occurred during correction.
C1 changes no schema, migration, API, dependencies, molecular files or application
version. Next: C2 compact virtual Components residue browsing. Full final-version
candidate/exact-master/reader/release gates remain mandatory C3/C4 work.
