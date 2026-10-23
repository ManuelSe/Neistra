# Issue #94 — Protein residue browsing and shared range selection

## 1. Status, authority, and outcome

**Status:** approved scope implemented, fully qualified and published stable v0.25.0.
Runtime delivery is remotely verified; this documentation audit records publication.
Its final integration and delayed ref/worktree cleanup are recorded at the linked
[issue close-out](https://github.com/ManuelSe/Neistra/issues/94#issuecomment-6371430529)
after verification. The released runtime tag remains fixed.

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
| Implementation PR | [#121](https://github.com/ManuelSe/Neistra/pull/121), merged |
| Merge strategy | Normal merge commit, preserving passing checkpoints |
| Planned release | Stable **0.25.0**, now [published](https://github.com/ManuelSe/Neistra/releases/tag/v0.25.0) |
| Annotated tag | **v0.25.0**, remotely verified at runtime `2adeaac973a6047ee537fd8c639f3b3e18d216b0` |
| Qualified runtime correction | [PR #122](https://github.com/ManuelSe/Neistra/pull/122), normally merged |

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


### C2 qualification diagnostics — 2026-10-23

The initial C2 attempt passes focused/static checks but fails TypeScript because a
new Testing Library test used Playwright's `exact` option; remove that unsupported
option without changing assertions. Attempt2 passes17 Python/42 focused/347 total
frontend and static/type/build checks,14 native cases/4 existing layout exclusions,
but fails both large-list long-task gates. The desktop task is3179ms versus the
unchanged750ms limit. Retained native traces record the actual failure. No retry or
performance exemption qualifies it.

C2 therefore also replaces existing quadratic selection-summary and App reference
membership scans with immutable identity indexes/sets, preserving exact behavior.
Large-range native qualification remains pending on corrected source. Add explicit
expanded-residue actual100%/200%zoom evidence and320px native coverage before
checkpoint completion. The large synthetic fixture profiles navigation/selection
with a hidden, loaded entry and the unvirtualized property table unmounted; no
full-table throughput or chemical completeness claim is inferred. Existing1STP and
all release budgets retain their requirements.


C2's first corrected full attempt still fails the native long-task bound
(desktop1721ms). A separate profiler run remains diagnostic at1630ms and retains
its [CPU sample artifact](../assets/protein-residue-hierarchy/c2-profile-cpu.json.gz).
It attributes1340 samples to the closed Edit launcher's repeated atom-array
membership predicate. A memoized atom-ID set preserves eligibility and removes
that remaining quadratic path. Native nonprofiled correction and complete C2
requalification remain required. No budget or assertion is weakened.


### M2/C2 complete — 2026-10-23

[Final2 gate](../assets/protein-residue-hierarchy/c2-final2-gate.json) passes all11
commands:17 Python,125 focused/349 total frontend, all static/type/build/diff
checks,16 native workflows/4 existing layout exclusions and one separate actual
browser-zoom case. There are zero failures, flakes or retries. All source
identities remain unchanged through qualification and all lossless log hashes
verify. [Browser results](../assets/protein-residue-hierarchy/c2-final2-browser-results.json.gz)
and [zoom results](../assets/protein-residue-hierarchy/c2-final2-zoom-results.json.gz)
retain actual100%/200%, both themes,320px, remount/scroll/focus, cross-panel exact
memberships, complete hidden H, camera/project/request invariance and existing
component controls. [Local review](../assets/protein-residue-hierarchy/c2-review.md)
and manually inspected desktop dark/mobile light screenshots are retained;
independent review is not claimed.

[Large-list profile](../assets/protein-residue-hierarchy/c2-final2-performance.json)
uses10,000 observed residues/30,000 atoms. Desktop/mobile expand-and-first selection
is213.6/161.5ms; off-screen endpoint focus81.6/55.0ms; complete range674.7/624.8ms;
longest tasks220/196ms; mounted rows13/22 versus bounds24/33; repeated reads0/0.
Every original5s/750ms/bounded-DOM criterion passes without profiling or weakened
assertions. Context remains the explicitly documented loaded hidden entry with
atom property table unmounted. Real1STP/full release budgets remain C3 work.

Earlier [initial](../assets/protein-residue-hierarchy/c2-initial-gate.json),
[attempt2](../assets/protein-residue-hierarchy/c2-attempt2-gate.json),
[first corrected](../assets/protein-residue-hierarchy/c2-final-gate.json) and
[CPU profiler](../assets/protein-residue-hierarchy/c2-profile-gate.json) attempts
remain diagnostic, not passing qualification. The nonprofiled
[focused large correction](../assets/protein-residue-hierarchy/c2-large-corrected-gate.json)
independently passes both layouts before final2. Source-order/coverage semantics
are unchanged by the bounded summary/reconciliation/Edit eligibility lookup
repairs. No API, molecular artifact, schema/migration, dependency or application
version change occurs in C2. Next: C3 final-version actual-reader and complete
candidate qualification, then C4 verified merge/publication/close-out.


### C3 release preparation — 2026-10-23

C2 committed as `f5d1a75`. Fresh origin fetch still has master`d3bac6f`, already an
ancestor of this branch; no unrelated upstream work needs integration. Remote
stable latest remains0.24.1 and v0.25.0 is unused. All five authoritative sources
advance together to0.25.0 without dependency resolution or schema changes. Add an
explicit0.24.1 archive-producer regression while retaining historical producer
coverage. Release/migration/rollback/scope notes are prepared as candidate text;
actual-reader and complete clean candidate/exact-master gates remain pending.


Release-preparation focused verification passes: all five versions0.25.0,
unchanged dependency resolution/native tools/patches/API schemas/migrations,
production harness exclusion,36 archive tests (including0.24.1 producer) and
whitespace checks. Actual tagged0.24.1 reader checkout is detached at`d9bc489`.
These checks authorize a coherent release-preparation commit, not publication;
complete clean final-version candidate and exact-master gates remain mandatory.


### C3 initial full-candidate diagnostic — 2026-10-23

The clean final-version run on`6f1c919` passes frozen installs, fresh0014, static/
type checks,1249 Python(no skips),349 frontend,8 supervisor and production build.
The first127 browser passes include issue#94 desktop themes/10,000 residues and
actual zoom, original1STP/18k/native cancellation, source/history/archive and
navigation regressions. The broad release journey then times out on its old exact
Sequence name`ALA 1`; the intended accessible name now includes chain/entry
context. [Retained trace](../assets/protein-residue-hierarchy/c3-candidate-journey-trace.zip)
proves that stale locator. Update that one locator to the complete expected
identity, without changing production behavior, timing or membership assertions.

The candidate is explicitly incomplete/diagnostic: one genuine locator failure,
one subsequent case intentionally interrupted,4 existing layout exclusions and
259 cases not run (not counted as qualification skips). The actual-reader steps
did not run. [Manifest](../assets/protein-residue-hierarchy/c3-candidate-gate.json)
and [raw browser results](../assets/protein-residue-hierarchy/c3-candidate-browser-diagnostic.json.gz)
retain exact commands/source/logs and the interruption. Verify the corrected full
journey, commit the coherent test/evidence correction, then restart every20-command
release gate from a clean fixed source. No exception or partial gate qualifies it.


The corrected complete release journey passes in 41.642s with one native desktop
workflow, zero failures, skips, retries or flakes; source identities remain
unchanged during the run. [Focused manifest](../assets/protein-residue-hierarchy/c3-journey-corrected-gate.json)
retains its exact command and lossless log. The one-line locator diff and the
full interrupted-run evidence were reviewed locally. Commit this passing focused
correction before a new clean, complete candidate qualification.


### C3 responsiveness comparison and independent compatibility — 2026-10-23

The second clean candidate on `075da9e` passes the same full Python (1,249),
frontend (349), supervisor (8), frozen-install/migration/static/type/build checks.
Its new residue cases, actual expanded-residue zoom and corrected release journey
pass. The existing representative 1STP interaction test exceeds its unchanged
5,000 ms limit at 5,745 ms. Stop this run as diagnostic: 129 browser passes, one
genuine timing failure, one intentionally interrupted case, four existing layout
exclusions and 257 cases not run. No reader step ran in this full attempt.
[Manifest](../assets/protein-residue-hierarchy/c3-candidate2-gate.json),
[raw results](../assets/protein-residue-hierarchy/c3-candidate2-browser-diagnostic.json.gz)
and [failure trace](../assets/protein-residue-hierarchy/c3-candidate2-responsiveness-trace.zip)
retain the observations without treating unrun cases as qualified exclusions.

Three unchanged isolated candidate repeats also fail on battery at 7,649 / 6,905 /
7,574 ms. Run the identical unchanged test/fixture against actual tagged v0.24.1
source (`d9bc489`), using task-owned dependency links and a configuration that sets
all server working directories to its detached checkout: both baseline repeats
fail at 8,093 / 7,348 ms. Verify tagged tracked source, App/test/fixture identities
and the old API module/version; no baseline source is edited. These comparisons
identify a qualification-environment dependency, not an isolated cause or a
release exception. [Environment comparison](../assets/protein-residue-hierarchy/c3-responsiveness-environment.json)
records exact setup, limits and results. No host setting is changed by the agent.

The user then confirms AC connection; sysfs reports AC online and Charging. Under
the unchanged limits, [actual baseline](../assets/protein-residue-hierarchy/c3-baseline-ac-gate.json)
passes twice at 4,202 / 4,905 ms and
[candidate](../assets/protein-residue-hierarchy/c3-responsiveness-ac-gate.json)
passes three times at 4,241 / 4,957 / 4,703 ms. All have zero structure refetches
and longest tasks below 750 ms. Power samples, raw results and lossless logs are
retained. This is focused evidence; restart every release command on a clean
source with the qualification environment available. No timeout, fixture,
assertion, runtime behavior or required gate is weakened.

The separate [nine-command compatibility gate](../assets/protein-residue-hierarchy/c3-compatibility-gate.json)
passes actual module identity, fresh forward/reverse migrations, final 0.25.0 ↔
tagged 0.24.1 producer/reader processes, version/dependency/harness audit and diff
checks. Exact canonical selections, scene selections, coordinates, original
bytes, history Undo/Redo, surfaces, jobs, settings and archive remapping survive;
portable archives retain current state rather than Undo history. Transient
anchors remain absent. This supports the planned minor release and migration-free
compatibility; both complete candidate and exact-master gates must repeat it.

README selection guidance now describes shared anchors rather than the obsolete
viewer-only limitation. The new evidence-report/publication helpers reuse the
previous release workflow, parse successfully and enforce completed clean gates,
source/log hashes, unchanged exclusion sets plus the desktop-only residue-zoom
exclusion, exact runtime tag and public asset integrity. They do not publish or
claim future results merely by being present.


### M3 / C3 complete — clean final-version candidate, 2026-10-23

[Candidate3 manifest](../assets/protein-residue-hierarchy/c3-candidate3-gate.json)
and [audited summary](../assets/protein-residue-hierarchy/c3-candidate3-summary.json)
qualify clean commit `c65ab0f9f56a79ffcc71eb64f8d70dff50bb9b32`: **all 20 release
commands pass**, including frozen Python/JS installs, fresh migration through 0014,
Ruff, mypy (102 files), ESLint, TypeScript, **1,249 Python / 349 frontend / 8
supervisor / 331 browser tests**, production build, both actual tagged v0.24.1 ↔
final v0.25.0 producer/reader directions, five-version/dependency/harness audit
and whitespace checks. Zero failures, flakes, retries, Python or required native
scientific skips. The 61 browser exclusions are exactly the prior release's 60
plus the new desktop-only actual-residue-zoom case's mobile entry; each reason is
retained in the summary and raw report. Both layouts' residue workflows run.

All **571** runtime/test/tool/patch/lock identities remain unchanged; source digest
`1a8d90cfcac3270dd8592868158cfbfbcd0c60285e5191b0b7bd9971d3a06198` and every
lossless log hash verify. All 249 recorded power samples report AC online. No
agent changed host settings. Earlier incomplete runs remain diagnostic, with
limits/fixtures/assertions unchanged. The corrected journey and representative
1STP timing test pass in this complete run: 4,489 ms interactions, 575 ms longest
task and zero structure refetches.

The 10,000-residue / 30,000-atom navigation fixture selects exact full membership
in 608.2 / 573.6 ms (desktop/mobile), longest tasks 195 / 183 ms, mounted rows
13 / 22 within bounds 24 / 33, and zero repeated reads. Its loaded hidden entry
and unmounted property table remain explicit limitations of that profile.
Existing native quick small/pocket/18k cold paint passes at 0.927 / 2.049 / 3.608 s;
first actual frame 685.3 ms and Cancel 52.8 ms, within all original budgets.

Actual readers preserve exact rich state, canonical saved references and scenes,
all conformers/originals, appearance, three surface objects, jobs, Undo/Redo and
archive remapping both ways. No new schema/migration/API/job/plugin/science or
dependency change; portable archives still omit Undo history. All five versions
are 0.25.0. Expansion and anchors remain transient.

Final local full-diff self-review covers all runtime/test/version/doc/evidence
changes and finds no consequential unresolved issue; it is not independent
approval. Inspected final desktop-dark/mobile-light screenshots show the approved
compact chain-to-residue layout, insertion codes and partial/full feedback.
Screenshots and actual zoom captures are retained with the candidate evidence.
Fresh origin fetch remains at master `d3bac6f`, already an ancestor; stable latest
is v0.24.1 and v0.25.0 remains unused. No upstream conflict or version collision.

Commit the passing C3 evidence/documentation, push, then open the planned PR.
M4 still requires remote review/policy checks, normal merge, all 20 commands on
the exact merged runtime, annotated tag, stable release/public asset verification,
issue close-out, documentation audit and delayed branch/worktree cleanup.


### M4 / C4 premerge review and policy — 2026-10-23

C3 evidence is committed/pushed at `a42ced9`; [PR #121](https://github.com/ManuelSe/Neistra/pull/121)
is remotely verified open against current master, with the planned Conventional
title, `Closes #94`, all implemented/simplified/deferred/rejected scope decisions,
compatibility, scientific/performance limitations, release impact and immutable
verification links. The connector permits reads but denies integration PR-write
permission; existing authenticated `gh` creates/updates it through normal GitHub
endpoints. This changes no repository protection or authorization.

[Codex review request](https://github.com/ManuelSe/Neistra/pull/121#issuecomment-6369668475)
is remotely verified. At the [premerge audit](../assets/protein-residue-hierarchy/c4-premerge-audit.json),
no review has returned and no review thread exists. Independent review is not
claimed. The complete local implementer review finds no consequential unresolved
issue. GitHub reports a clean/mergeable current base/head, no master protection,
ruleset, workflow, required approval, status or check run. The empty combined
status's `pending` value does not represent a configured required check. No
approval/check/protection override is used. All 571 source identities still match
the complete candidate; all versions and release baseline remain final/available.

This audit precedes its own docs-only commit. Recheck the actual head, policy,
reviews and conversations, use the exact-head guard and normal merge preserving
checkpoints, then fast-forward master. Repeat all 20 commands on the exact merged
runtime before any tag/release. Publication and cleanup remain pending.


### C4 administrative restart — publication-helper correction, 2026-10-23

PR #121 normally merges as `b4b3bddd307770acd8eb243c5428ecd14e6351c9` and that
commit is verified on origin/master; local master fast-forwards cleanly. Its two
parents preserve the base and complete checkpoint history, and its tree is exactly
the reviewed feature tree. All 571 qualified source identities match. The first
exact-master run passes frozen installs, fresh 0014, Ruff/mypy, 1,249 Python,
ESLint/TypeScript, 349 frontend, 8 supervisor and production build (11 commands).

Continued review catches stale `/tmp/neistra93-*` and previous reader-worktree
paths in the documentation publication helpers, missed when adapting the prior
workflow. These could read the wrong release-note/receipt files or audit the wrong
worktree. Correct this consequential delivery-tooling finding through the planned
feature branch and a reviewed docs-only PR before publication. No product runtime
or test changes are needed, and the clean C3 candidate remains applicable to its
571 unchanged source files.

Administratively stop the first exact-master run after browser startup, preserving
its [incomplete manifest](../assets/protein-residue-hierarchy/c4-merged-gate.json),
lossless completed logs and [interruption record](../assets/protein-residue-hierarchy/c4-merged-interruption.json).
No complete browser or reader result is captured and no release qualification is
claimed. No test failure, relaxed assertion or limit motivates this restart.
Fast-forward the existing planned feature branch to merged master, correct every
helper path to issue #94 and actual tagged reader 0.24.1, and point final delivery
tools to a fresh `c4-merged2` run. Add issue/version/commit guards to release notes
and receipt data, and distinguish implementation PR #121 from the eventual exact
released-master PR.

[Focused helper evidence](../assets/protein-residue-hierarchy/c4-publication-helper-check.json)
passes Python syntax/AST inspection, task-owned path checks, all 571 unchanged
source identities and helper hashes. JSON/log integrity, Markdown links and
whitespace are checked before commit. Actual bundle/receipt checks remain gated
by the complete corrected exact-master run; no synthetic success data is used.
Version stays 0.25.0: it is unreleased, and this changes documentation delivery
tools only. No schema, migration, public API, dependency or scientific change.


### M4 / C4 exact-runtime qualification and publication — 2026-10-23

[PR #122](https://github.com/ManuelSe/Neistra/pull/122) normally merges the helper
correction as **`2adeaac973a6047ee537fd8c639f3b3e18d216b0`** on origin/master;
local master fast-forwards cleanly. The correction is docs-only and all 571
qualified runtime/test/tool/patch/lock identities remain unchanged. The
[merge proof](../assets/protein-residue-hierarchy/c4-merge-proof.json) and
[helper premerge audit](../assets/protein-residue-hierarchy/c4-helper-premerge-audit.json)
retain exact refs, review requests and current policy. No required approval/check,
protection, unresolved thread or override exists at merge. Codex requests on both
PRs return no review; local implementer review is explicitly not independent.

[Exact merged2 manifest](../assets/protein-residue-hierarchy/c4-merged2-gate.json)
and [summary](../assets/protein-residue-hierarchy/c4-merged2-summary.json) pass all
**20 release commands** from clean master: **1,249 Python / 349 frontend / 8
supervisor / 331 browser tests**, 61 documented layout/timing exclusions, zero
failures/flakes/retries/Python or required native scientific skips. Frozen
dependencies, fresh 0014, all static/type checks, production build/harness audit,
actual tagged 0.24.1 ↔ final 0.25.0 processes and both archive/managed-state reader
directions pass. Saved canonical references/scenes, coordinates/conformers,
originals, appearance, three surface objects, jobs, Undo/Redo and archive remapping
remain exact. All five versions are 0.25.0; no schema/migration/API/job/plugin,
dependency or scientific-model change.

The complete candidate and merged runtime match all **571** source identities and
every lossless log hash, digest
`1a8d90cfcac3270dd8592868158cfbfbcd0c60285e5191b0b7bd9971d3a06198`.
All 251 merged power samples report AC online. Merged large navigation ranges
take 604.4/586.3 ms desktop/mobile, longest tasks 199/185 ms, mounted rows 13/22
within 24/33 bounds, zero repeated reads. Loaded hidden entry / unmounted property
table context remains explicit. Standard 1STP interactions take 3,763 ms, longest
task 642 ms, zero refetches. Native cold small/pocket/18k paint is
0.874/2.076/3.597 s; first actual frame 709.3 ms and Cancel 53.6 ms. Original
5 s / 750 ms navigation/1STP and 2/5/5 s paint, 1 s frame, 500 ms Cancel budgets
remain unchanged. Earlier incomplete or failing attempts remain diagnostic.

After all 20 commands pass, result postprocessing exposes a second documentation
helper-reference mistake: a broad evidence-label replacement changed the prior
release's `c4-merged5-summary.json` filename to nonexistent `c4-merged25-summary.json`.
Use the byte-exact committed report from qualified C3 (`c65ab0f`) to process the
complete merged gate. Its only difference restores that actual preceding-release
filename; all exclusion/result/source assertions remain identical. It passes on
merged2. [Report provenance](../assets/protein-residue-hierarchy/c4-report-tool.json)
retains both hashes and complete executed source. Persist that exact report here
in the planned publication documentation audit, adding literal evidence-path and
executed-report hash checks. No runtime/test/gate/limit changes or tag movement
are involved; the mandatory gate had already passed independently.

[Prepublication audit](../assets/protein-residue-hierarchy/c4-prepublication-audit.json)
rechecks exact remote master, both merged PRs/reviews/conversations, unused next
tag, preceding stable release, current rulesets/protection, all source/log hashes
and open existing #95. The annotated **v0.25.0** tag object
`54ff2dabe3235af1a49efd64f79fd13b6c741d3d` is pushed and its peeled runtime SHA
is remotely verified. Stable latest [release v0.25.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.25.0)
(ID 422152304) targets that exact qualified runtime. Full notes cover highlights,
fixes, data/migrations, compatibility/rollback, verification, scientific/performance
limits, scope decisions and follow-up work.

The public `neistra-v0.25.0-verification.zip` is **421,337,420 bytes**, downloaded
from the published release and verified against SHA256
`3e133ff2e6f008a7ee46a7e309ba81f9e269ef5453b32421cef63cad33b7a8fa`,
ZIP CRC and all **5,961** internal member hashes. It includes exact runtime source,
both complete command/source/log records, raw native evidence, compatibility
stores/archives and release notes. [Publication audit](../assets/protein-residue-hierarchy/c4-publication.json)
verifies real release/tag/assets and the exact published
[issue reply](https://github.com/ManuelSe/Neistra/issues/94#issuecomment-6371430529).
Issue #94 is closed through implementation PR #121. #95 remains separate; no new
follow-up or essential approved-scope deferral is needed.

### Final publication documentation audit and delayed cleanup

This docs-only audit persists current publication evidence and source-of-truth
status, restores the proven report reference and validates actual helper oracle
paths. Its checks cover relative links, JSON/gzip/log integrity, helper syntax,
report provenance, all five versions/dependencies/build harness and all 571 source
identities. No new runtime tests are needed for unchanged bytes after the complete
exact-runtime gate. Review and normally merge the documentation PR; recheck the
remote default branch and unchanged runtime tag/source. Only then remove the
planned feature branch and the task-owned old-reader dependency links/worktree.
Actual final integration, cleanup and clean-tree refs are appended to the linked
issue reply with a public final audit receipt after verification. No earlier
statement claims that future cleanup already happened.


The [documentation validation](../assets/protein-residue-hierarchy/c4-documentation-check.json)
passes current relative links, asset JSON/gzip and complete-gate log hashes, all
571 unchanged source identities, five versions/dependencies/production harness,
helper syntax and actual literal evidence-oracle paths. The persisted report
exactly matches the committed executed source in its provenance record. The full
docs-only diff has implementer review with no consequential unresolved finding.
Commit this publication checkpoint as `docs(release): record verified v0.25.0 publication`,
push and normally merge its audit PR after current policy/conversation checks.
Final actual integration/ref/worktree cleanup is verified externally at the linked
issue reply; keep the runtime tag fixed.
