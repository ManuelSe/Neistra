# Issue #38 — Selection atom visibility and protein surface capacity

## Status and delivery metadata

- Status: **complete; v0.8.0 published and verified**.
- Approved by the user on 2026-09-14. The user authorized detailed persistence,
  then explicitly required waiting for a subsequent implementation instruction.
- Issue: [#38](https://github.com/ManuelSe/Neistra/issues/38).
- Base: `master` / `origin/master`, fast-forward verified at
  `d962682d904eb274974da7ef620098b8dcfb7d84` (released v0.7.0).
- Feature branch: `feat/issue-38-selection-visibility-capacity`.
- Planned release/tag: **v0.8.0**, subject to an upstream version/tag collision check.
- Proposed PR title: `feat(selection): add atom hiding and larger protein surfaces`.
- Merge strategy: normal merge commit preserving coherent checkpoint history.
- Companion approved contract: [issue #36 pocket surfaces](issue-36-pocket-surfaces.md),
  a later v0.9.0 release. Pocket work must not delay this release.

This document is the implementation contract. The global `docs/PLAN.md` remains
unchanged. The subsequent user `/goal` instruction on 2026-09-14 authorized full
implementation and delivery of #38 followed by #36; the original persistence-only
restriction below is historical. #36 starts after verified publication of #38.

## Problem, outcome, and authority

The compact selection panel works well, but it cannot suppress arbitrary atom
detail. Users need reversible hiding while retaining ribbon/cartoon and surfaces.
The 64 MiB conservative mesh allocation check and other resource limits also
reject useful whole-protein surfaces. Merely changing that constant is insufficient.

Deliver a working vertical workflow for saved atom-detail visibility and qualify
substantially larger, cancellable molecular surfaces. Keep the existing panel
compact and preserve molecular authority, scientific interpretation, and original
uploaded files.

Authority: explicit user choices and approval; `AGENTS.md` and accepted decisions;
existing architecture/product boundaries/conventions; issue context; suggested
technical designs. The approved user choices are:

1. Hide affects **atomic detail only**, preserving polymer and surface channels.
2. Qualify whole-protein surface capacity toward **100,000 effective atoms**.
3. Ship this work first; selection-centered pocket surfaces are a separate release.

Planning inspected the product/global plan/progress/decision/verification documents,
viewer projection and lifecycle, surface worker/kernel/bounds, compact palette,
API schemas and command service, migration 0011, scene/archive validation/remapping,
export visibility, fixtures/tests, version sources, branches/tags/releases and
repository merge conventions. At persistence, local master and origin/master match;
v0.7.0 is latest. Earlier claims that the repository has no release history no
longer apply. Normal merges are allowed; no rulesets were returned. Recheck live
protections, reviews and checks at delivery rather than relying on this snapshot.

Relevant foundations: D-046/051–055 (independent styling and compact interaction),
D-056–059 (fragment surface state/science/bounds), D-060–062 (camera, coordinate
snapshots and idempotent measurement updates). D-063–064 record this approved
extension; historical decisions must not be silently rewritten.

## Requirement disposition

| Requirement | Disposition | Contract / follow-up |
|---|---|---|
| Hide arbitrary selected atoms | Essential | Durable exact atom IDs; atomic detail only; no scientific atom-count cap on the hiding command |
| Preserve ribbon/cartoon when residue atoms are hidden | Essential | Never remove hidden atoms from polymer projection inputs |
| Preserve surfaces while hiding atom detail | Essential, explicit user choice | Keep existing surface inputs, memberships and geometry independent |
| Restore previous atom styling | Essential | Show removes the hide mask; atomic style application also reveals its target |
| Keep compact intuitive controls | Essential | Sixth Atom detail tile, mixed state, no permanent new row |
| Persistence/history/scenes/archives | Essential | Extend existing revisioned settings and command paths |
| Larger whole-protein surfaces | Essential | Coordinated bounds and staged accounting, with real rendering qualification |
| Unbounded memory or unlimited structure size | Rejected as proposed | Preserve explicit allocation/time limits and truthful failure; no follow-up needed |
| Raise only the 64 MiB constant | Rejected as proposed | Other admission checks and inflated estimates would still reject useful targets |
| Reduce surface resolution silently | Rejected | Preserve molecular-v1 science; alternate profiles remain outside this release |
| Existing element/carbon-only color and H preferences | Already satisfied | Preserve accepted behavior and regressions |
| Accurate progress/cancel/retry/resource explanation | Supporting, required for capacity delivery | Retain memberships; distinguish atom, grid, memory, timeout and rendering failures |
| Pocket surfaces | Deferred from this release, approved separately | Implement under #36 after v0.8.0; do not close #36 with this PR |
| Automatic cavity discovery, custom context, multiple pocket layers | Deferred/outside this contract | See companion plan; do not create speculative follow-ups now |
| Coordinate subset export or classification changes | Deferred | Existing #21/#20 remain separate; no new issues needed |

## Accepted behavior: atom hiding

### Compact interaction

Add a sixth tile within the existing Atom detail group, using an original eye/eye-off
style glyph from the existing icon system and visible Hide/Show text. Keep the
nonmodal palette, 44 px touch targets, keyboard operation, context-bound feedback,
and focus retention before disabling controls.

- No selection: disable the action.
- None hidden: show Hide; activation hides all captured selected atom references.
- All hidden: show Show; activation reveals those references with their prior styles.
- Mixed: show Hide with the established mixed-state treatment; activation hides
  the entire target. Convey the mixed state accessibly, not through color alone.
- Applying any atomic representation clears hidden membership for its captured
  target in the same revisioned command. Do not create a separate unhide revision.
- Applying Backbone/Cartoon does not change atomic hidden membership.
- Representation Reset clears atomic/polymer overrides and hidden membership for
  its target. Colors, H preferences and surface memberships remain independent.
- Changing current selection does not retarget earlier hides. Hidden atoms remain
  selectable from hierarchy, sequence, queries and saved selections. Polymer/surface
  picks may still select their canonical atoms; atomic hiding is not deletion.

### Projection and ownership

Persist canonical `selection_hidden_atoms: number[]`, default `[]`, on entry
ViewerSettings. Preserve existing representation assignments so Show can restore
them. Apply the mask only to atomic representation layers after ordinary
visibility/isolation/representation assignment, without subtracting from shared
polymer or surface inputs. Show does not override entry/component/isolation or
hydrogen visibility bounds.

Remove atomic bonds incident to hidden endpoints; do not allow inherited/native
parent-bond behavior to reveal them. Hide the corresponding atom labels. Preserve
residue/chain labels, measurements and their references, original files, coordinates,
bonds, warnings and conformers. Do not introduce a new global visibility model.

Entry-level Visible export continues to mean visible entries, as it does today;
this display action does not turn export into an atom-subset operation. Document
that distinction in user-facing selection styling/export guidance.

### API and durable state

Add `POST /api/v1/projects/{id}/selection-atom-visibility` with expected revision,
canonical SelectionV1 and `action: hide | show`. Use the existing command/service
pattern for atomic multi-entry validation, deterministic union/subtraction and
full forward/inverse viewer-settings state. Reject invalid/missing references
before any changes; unchanged actions return the current project without a new
revision/history record. The ordinary entry-settings endpoint preserves omitted
hidden state and cannot bypass the dedicated action to change it.

Extend the existing representation apply/reset command to update hidden state
atomically as described above. No new molecular artifact is created by hiding.
Support scene capture/restore, checkpoint/restart, duplication, archive import/export
and command replay. Deletion prunes live/scene hidden IDs with exact undo; new IDs
never inherit the hide mask. Use existing stable-ID rules and strict canonical
validation rather than a second selection identity system.

## Accepted behavior: larger surfaces

### Fixed science and coordinated limits

Retain pinned Mol* 5.11.0 routines and `molecular-v1`: selected atoms alone, native
physical radii, probe 1.4 Å, grid spacing 0.5 Å, 36 probe positions, opacity 0.45,
no parent context, capping, repair, alignment or conformer inference. Existing
fragment-boundary warnings and full-projection hydrogen classification still apply.

| Resource | v0.7.0 | Approved target |
|---|---:|---:|
| Effective atom input | 20,000 | 100,000 |
| Padded grid cells | 4,000,000 | 64,000,000 |
| Mesh allocation per surface | 64 MiB | 512 MiB |
| Retained surface meshes per viewer | 128 MiB | 1 GiB |
| Accounted active computation buffers | Estimate only | 2 GiB admission limit |
| Calculation deadline | 30 s | 120 s |
| Concurrent calculations per viewer | 1 | 1 |

These are explicit bounded policies, not a guarantee that every arrangement of
100,000 atoms fits the grid/memory budgets. Preserve the 250,000-atom parent-entry
reduced-detail policy. Large dispersed selections may still be rejected with a
specific explanation. Do not lower scientific quality or weaken acceptance gates
to make a benchmark pass; a failure to establish the approved capacity is a blocker
requiring further engineering or an explicit user-approved amendment.

### Allocation and execution changes

Replace the blanket per-active-cell estimate with staged accounting using the
pinned marching-cubes tables, intersected edges, triangle counts and native group-
duplication requirements. This is allocation accounting, not a fork of the surface
scientific algorithm. Validate dimensions/counts/overflow before allocation and
check every relevant stage: field and lookup construction, edge caches, extraction,
chunk capacity, group duplication, compaction, output/transfer and retained buffers.
Do not count only the final visible mesh. Recorded allocation estimates must bound
the applicable buffers; actual browser/GPU memory is measured separately and is
not claimed to have a hard per-worker ceiling.

Preallocate dense typed atom inputs rather than growing parallel JS number arrays.
Replace large typed-array JSON cache keys with explicit dependency keys covering
artifact/current coordinate revisions, membership, visibility/isolation and profile.
Exclude ordinary current selection, camera and colors. Preserve exact correctness
across preview/commit/cancel, coordinate cache rebuilds and topology changes.

Keep one worker queue per viewer. Bound admission before expensive allocation;
terminate obsolete/cancelled workers, ignore late results and release all obsolete
CPU/native renderer bindings on replacement, project switch and disposal. Keep
membership on cancellation/failure and show resource-specific fallback with Retry.
If line fallback also fails, report unavailable rendering rather than claiming
lines are displayed. No new memory-budget controls in the selection palette.

## Data, migration and compatibility

Migration 0012 is reserved provisionally; recheck the next migration number before
coding. Default `selection_hidden_atoms` to `[]` at every documented retained
settings path: live entries, project checkpoints (including nested scenes), scenes,
forward actions and inverse actions. Follow the safe targeted traversal pattern;
never recurse into arbitrary user metadata/jobs. Prevalidate all retained locations
before downgrade; refuse any nonempty hidden membership without writing anything.
Removing currently hidden state does not remove history, so restore a pre-upgrade
backup when a downgrade is refused. Test all paths, refusal atomicity, upgrade,
safe downgrade and re-upgrade.

Keep API/project/archive/normalized schema majors at 1. New readers accept v0.7.0
and older supported archives with an absent hide mask defaulting to empty. Older
readers are not supported for new visibility-bearing archives. Preserve original
uploaded bytes, scientific artifacts, warnings and command semantics. Geometry
and runtime status remain disposable, never archived molecular state.

## Milestones and coherent checkpoints

The following are implementation work to perform only after the next user start
instruction. New test paths below are planned additions, not existing evidence.
Every checkpoint updates this plan's log and the concise project progress summary;
append material decisions rather than rewriting accepted history. Inspect its diff
for scope expansion, dead code, scientific errors, migration loss and regressions.
Commit only coherent passing states; do not create empty milestone commits.

### M1 / C1 — Qualified capacity and execution

Outcome: native worker surfaces render representative larger proteins under the
approved bounds, with truthful admission and unchanged scientific geometry.
Affected areas: surface protocol/geometry/worker/runtime/input projection/cache,
scientific fixtures, geometry/worker/runtime tests and performance documentation.

Acceptance:
- Deterministic old-fixture geometry/ownership invariants remain valid.
- Real larger proteins previously rejected by old limits produce rendered meshes.
- Admission covers all named limits and staged allocations, with no silent LOD.
- Cancellation <500 ms, unchanged 1STP readiness <10 s, surface-related main-thread
  task <750 ms on the recorded qualification host; larger qualification targets
  render within the 120-second deadline.
- Stale/replaced/disposed work cannot attach, memory is reclaimed and simultaneous
  surfaces count against the combined retained budget.

Focused commands: frontend common gate below; Vitest surface geometry/worker/runtime
suites; `playwright test tests/e2e/selection-surfaces.spec.ts tests/e2e/surface-capacity.spec.ts`.
Docs: PERFORMANCE, FIXTURES, SCIENTIFIC_LIMITATIONS and selection-surface help/limits.
Migration: none. Commit: `perf(surface): expand bounded protein surface capacity`.
Rollback: before durable hiding lands, resource-policy changes can be reverted
without data loss; never change molecular-v1 geometry to disguise a rollback.

### M2 / C2 — Durable atomic-detail visibility

Outcome: API and domain behavior support exact reversible hide/show, atomic
representation reveal/reset, archive compatibility and safe migration.
Affected areas: API schemas/routes/command service, viewer-state helpers, scene/
checkpoint/topology/archive paths and migration 0012.

Acceptance: arbitrary subsets/multiple entries, invalid-target atomicity, no-op
revisions, exact history/scene/restart/duplication/archive round trips, pruning and
new-ID behavior; ordinary settings updates cannot bypass the dedicated action.
All retained-state downgrade refusal paths pass before UI integration.

Focused commands: Python common gate; `pytest tests/integration/test_selection_visibility.py tests/integration/test_viewer_state.py tests/integration/test_archive_roundtrip.py tests/integration/test_migrations.py`.
Docs: API, PROJECT_SCHEMA, ARCHITECTURE, DEVELOPMENT migration/backup guidance.
Commit: `feat(selection): persist atom-detail visibility`.
Rollback: safe downgrade only if every retained hide mask is empty; otherwise
restore the pre-upgrade backup. Do not silently strip retained state.

### M2 / C3 — Compact Hide/Show vertical workflow

Outcome: the sixth Atom detail tile hides/reveals real atomic geometry while
preserving polymer/surface channels and prior styling.
Affected areas: application command closures, compact palette, viewer projection,
atomic label handling, component/browser tests and accessibility documentation.

Acceptance: partial/all/mixed/empty targets, Hide/Show/atomic-style reveal/reset,
full-residue and trace-atom hiding with unchanged ribbon/cartoon geometry, absent
incident bonds, unchanged surface buffers, exact camera/selection, no redundant
normalized structure fetches for style-only actions, hidden-atom reselection.
Keyboard/touch 44 px, both themes, Pixel 7 layout and actual 100%/200% zoom pass;
no new permanent row, trapping modal, or stale-target feedback.

Focused commands: frontend common gate; `playwright test tests/e2e/selection-visibility.spec.ts tests/e2e/selection-styling.spec.ts tests/e2e/selection-surfaces.spec.ts tests/e2e/viewer-controls.spec.ts tests/e2e/measurements.spec.ts tests/e2e/rebranding-zoom.spec.ts`.
Docs: SELECTION_STYLING, ACCESSIBILITY, VERIFICATION and concise PROGRESS.
Migration: uses C2; no additional schema. Commit:
`feat(selection): add compact hide and show controls`.
Rollback: disabling the control alone is not safe rollback of persisted intent;
keep reader support or use the documented data-compatible rollback path.

### M3 / C4 — Release qualification and delivery

Outcome: v0.8.0 is implemented, documented, reviewed, merged and remotely published
only after every local and repository gate passes.
Affected areas: all five authoritative version sources, release/user/migration
notes, feature/progress evidence and remote delivery artifacts.

Acceptance: C1–C3 gates pass; current upstream base safely incorporated; version
unallocated; complete candidate gate and final local full-diff review pass; no
unresolved consequential findings or unmet protections/reviews; exact merged
master passes the complete gate before tagging.

Commands: complete release gate below plus live GitHub PR/check/review/protection
and remote tag/release verification. Commit:
`chore(release): prepare v0.8.0`, referencing #38. Later documentation-only evidence
commits are allowed with clear identification of the tested source commit; never
claim a modified candidate was tested. No empty milestone markers.
Rollback: never move a published tag. Release fixes through a new reviewed version;
respect migration retained-state safeguards.

## Verification commands and fixture requirements

Frontend common gate:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
```

Python common gate:

```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
```

Focused Playwright commands above use `PLAYWRIGHT_BROWSERS_PATH=.playwright` and
`corepack pnpm exec` before `playwright`. Use unique fresh test data and exclusive
API/worker/web ports; inspect and stop only this task's orphaned test processes
before reuse. Never run competing builds/benchmarks during performance qualification.

Retain the 1STP baseline; add pinned, attributed/checksummed
[6VXX](https://www.rcsb.org/structure/6VXX) and
[1AON](https://www.rcsb.org/structure/1AON) fixtures and a deterministic 100,000-atom
capacity fixture explicitly labelled synthetic, not a new scientific structure.
Record import/selection choices, effective atom counts and grid dimensions. Real
fixtures must exercise whole-protein targets rather than a small successful subset.
Record mesh/working bounds, actual output sizes, timings, host/browser versions,
process memory and known limitations. The 100,000-atom stress target must fit the
stated geometric bounds; rejection tests separately cover dispersed coordinates.
Do not claim performance on arbitrary hardware or physical phones from emulation.

Test atom hiding, complete residues, atomic bonds/labels, unchanged polymer/surface
geometry, all visibility precedence, editing, history, scenes, restart, archives,
original/warning invariance and entry-based export. Test boundary values just
inside/outside every resource limit, overflow/invalid input, timeout, cancellation,
retry, upload failure, per-entry isolation, multiple surfaces and disposal.

The complete README/DEVELOPMENT gate runs before opening/merging the PR and again
on the exact released merge commit, from a clean tree:

```bash
.venv/bin/uv sync --frozen
CI=1 corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR="$gate_root/migration" .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
MOLWEAVE_E2E_API_PORT=8110 MOLWEAVE_E2E_WORKER_PORT=8111 \
MOLWEAVE_E2E_WEB_PORT=5273 MOLWEAVE_E2E_DATA_DIR="$gate_root/e2e" \
PLAYWRIGHT_BROWSERS_PATH=.playwright \
corepack pnpm exec playwright test
git diff --check
```

Allocate a fresh `gate_root` under `/tmp` per run; the variable is not a shared
user data path. Capture exact commit, commands, results, intentional skips and
limitations. Current v0.7.0's 275 Python / 97 frontend / 8 supervisor / 82 browser
passes and 40 layout skips are historical baseline evidence, not a result for this
work or a target to achieve by omitting new cases.

## Version, PR, issue and publication plan

v0.8.0 is a **minor** release: new user-visible hiding behavior and backward-readable
persisted state plus greater rendering capacity. It is not a patch-only change,
major break or prerelease. Recheck origin/master, version sources, remote tags and
releases before preparation; if upstream advances, select the next appropriate
noncolliding minor version and record that arithmetic adjustment consistently.

Update all authoritative versions in the release PR:

1. `pyproject.toml` project version.
2. Root `molweave-dev` package version in `uv.lock`.
3. `apps/web/package.json` version.
4. FastAPI application version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update current-version assertions and archive producer compatibility cases, not
historical release records. Release notes include highlights, fixes, migration/
rollback, API/archive compatibility, scientific meaning, verification/performance,
known platform limits, deferred #36 and unchanged #20/#21 scope.

PR body: `Closes #38`; implemented outcome, milestones, D-063–064, scope dispositions,
exact gates, migration safeguards, compatibility and limitations. Request
`@codex review` when available; otherwise perform/document local review without
claiming independence. Resolve actionable findings and rerun affected checks.
Never bypass protected-branch requirements or an unavailable required human review.

Fetch and safely incorporate upstream before PR/merge. Use normal merge preserving
checkpoint commits, with verified head matching the reviewed candidate. After
merge, verify its commit on origin/master, switch/fast-forward local master and
run the exact merged gate. Create an annotated v0.8.0 tag on that exact commit,
push it, publish GitHub release notes and a verification attachment, verify remote
tag target/release/asset, then post the issue closeout. Only then delete remote
and local issue #38 branches. Leave clean synchronized master.

Do not create issue #36's implementation branch now. Its approved plan is persisted
alongside this plan to keep the full user contract available. After v0.8.0 is
released, that plan will already be on master; create the pocket branch from the
then-current released base only when implementation is authorized. No empty
"plan already exists" commit is required.

## Decisions, deviations, and progress log

- 2026-09-14: user approved two sequential releases; atom-only hiding, capacity
  toward 100,000 atoms, protein-only selection-centered pockets and one pocket per
  receptor. This document covers only the first release.
- 2026-09-14: issue #38 created and verified; master fast-forward verified at
  d962682d904eb274974da7ef620098b8dcfb7d84; planned feature branch created for docs.
- 2026-09-14: detailed contract and companion #36 plan persisted. Architectural
  extensions are recorded as approved/not implemented in D-063–066.
- Implementation evidence: **none**. No feature code, tests, migrations, dependency
  versions or release metadata changed during plan persistence.
- Checkpoints M1/C1, M2/C2–C3, M3/C4: **not started**.
- Blockers: none for planning. Scientific capacity budgets still require actual
  implementation qualification; do not treat approval as measured feasibility.
- Next action: wait for the user's explicit implementation start instruction.

For each later checkpoint append date, source commit, outcome, exact commands and
results, deviations/decisions, compatibility findings and next action. At release
record candidate/merge/tag/PR/release/issue-reply/cleanup verification, using an
immutable publication report when final hashes are known only after merge. Never
move a release tag for bookkeeping or mark this plan complete before delivery.

Plan-persistence validation (2026-09-14): local Markdown document links and code
fences checked; D-063–066 IDs unique; staged diff whitespace checks pass. Changed
paths are restricted to these two approved feature plans, DECISIONS and PROGRESS.
No implementation/release gate was run or claimed. Commit/push verification is
reported to the user after the documentation commit is created.

### 2026-09-14 — Implementation authorization and C1 preparation

The user authorized the complete sequential delivery goal for #38 then #36.
Verified the clean planned branch at approved-plan commit `8871299`, origin/master
at `d962682`, and latest release v0.7.0. Read required authority/verification
sources and inspected native Mol* allocation and state ownership before edits.

C1 implements staged native edge/triangle/group allocation, coordinated limits,
preallocated atom arrays and lazy revision/membership cache inputs. No schema,
scientific profile or UI controls changed. D-067 records the buffer/key contract.
Focused tests caught and corrected a local identifier collision; an additional
boundary test guards native fractional chunk rounding. Frontend lint/typecheck,
101 tests across 28 files, and build pass (existing chunk-size advisory only).

Initial whole-protein qualification rendered all 23,694 atoms of 6VXX and all
58,870 atoms of 1AON in 4.4/9.1 seconds respectively. These preliminary timings
are not final checkpoint evidence. The 1AON assertion was corrected to compare
exact stable membership without assuming native unit traversal order. An initial
synthetic generator created 100,000 separate components and timed out in structure
projection, before surface calculation. The final stress fixture keeps identical
100,000 carbon coordinates but one artificial residue/component; it makes no
chemical claim. No scientific resolution or acceptance budget was reduced.
Final desktop/mobile-emulation browser qualification is pending; C1 not committed.

### 2026-09-14 — M1/C1 complete: qualified protein capacity

Implemented and reviewed the capacity checkpoint without schema/migration changes.
Final common gate commands all pass on this source state:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test     # 102 tests, 28 files
corepack pnpm --dir apps/web build    # existing Mol* chunk-size advisory only
corepack pnpm --dir apps/web exec vitest run src/test/selection-surface # 17 tests
```

Browser command (fresh data, exclusive ports; no competing build/test jobs):

```bash
MOLWEAVE_E2E_API_PORT=8110 MOLWEAVE_E2E_WORKER_PORT=8111 \
MOLWEAVE_E2E_WEB_PORT=5273 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-38-capacity-2 \
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/selection-surfaces.spec.ts tests/e2e/surface-capacity.spec.ts
```

Result: 14 passed, 1 intentional mobile layout skip, 1 mobile test failure caused
by checking for a native pick event immediately after the click. Corrected the
real-click test to wait for render-loop delivery, without bypassing picking or
weakening the atom assertions. Added fixture checksum/count and exact coordinate
mapping assertions and reran affected cases on fresh `/tmp/neistra-38-capacity-3`
with the same ports/command plus
`--grep 'qualifies worker geometry|renders the complete'`: **8 passed**, both
browser projects, no retries. All remaining unchanged workflow cases passed in
the preceding full focused run. Raw measurements are persisted under
`docs/assets/selection-capacity/c1-*.json`; PERFORMANCE records the host and tables.
No failed check remains unresolved.

- Full 6VXX: 23,694 atoms, 85,392,860 retained output bytes; ready 4.33/3.96 s.
- Full 1AON: 58,870 atoms, 219,986,372 bytes; ready 9.54/8.85 s.
- Synthetic: 100,000 atoms, 49,639,320 bytes; ready 8.46/8.12 s.
- Longest large-case main-thread task: 437 ms; all bounds and <120 s gates pass.
- 1STP: 674.6/476.6 ms ready, 221/116 ms longest task, 20.3/20.3 ms cancellation.
  Native geometry remains 91,194 vertices / 71,012 triangles / 567 owner groups.
- The largest accounted working allocation is 1,326,940,068 bytes; measured RSS
  is reported separately and includes browser/native/testing overhead.
- All native corner configurations, fractional chunk rounding, atom/grid/mesh/
  working/retained boundaries, stale results, timeout and disposal are covered.

Local checkpoint review: inspected the complete application/test diff, native
Mol* 5.11.0 field/lookup/chunk/mesh implementation and scientific parameters;
corrected the triangle-chunk fractional rounding and included atom-ID output
mapping in retention. No algorithm fork, silent resolution change, new UI, dead
compatibility shim, persisted-data change or additional scope remains. This was
an implementing-agent review, not independent review. `git diff --check` passes.
Rollback remains resource-policy-only. C1 commit:
`perf(surface): expand bounded protein surface capacity` (Refs #38).
Next: M2/C2 durable atom-detail visibility and migration 0012.

### 2026-09-14 — M2/C2 complete: durable atom-detail visibility

Added strict canonical `selection_hidden_atoms` defaults, revisioned multi-entry
Hide/Show with exact no-op behavior, generic PUT protection, atomic Apply/Reset
reveal in the same command, archive reference validation and reversible topology
pruning. Existing scenes/checkpoints/restart/duplication carry the authoritative
settings; original bytes, warnings, artifacts and conformers are unchanged.

Migration 0012 adds empty masks to all documented retained settings paths.
The migration suite now runs the existing explicit retained-path matrix for both
0011 and 0012: live/checkpoint/nested checkpoint scene/scene plus every forward/
inverse entry.create, entry.update, entry.molecule, entries.viewer_state,
scene.create and scene.update path. Tests prove upgrade preservation, safe
downgrade/re-upgrade, nonempty refusal before writes and metadata invariance.
No accepted historical migration was edited. D-063 is implemented without a new
architectural deviation; its earlier planning status remains a historical record.

Validation:

```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
```

Final results: Ruff passes; mypy passes (53 source files); **319 Python tests pass**
in 50.06 s (185 existing Alembic path-separator warnings across migration runs).
This includes all focused visibility/viewer-state/archive/migration suites. The
initial focused run had 106 passes and three test-expectation failures: persisted
SQLite timestamps versus immediate mutation-response timestamps, and the newly
added empty default in an existing settings fixture. Assertions now compare
persisted no-op state, and the modern fixture includes the default; explicit legacy
omission compatibility remains tested. The full rerun passes every corrected test.

Additional coverage proves all atomic styles reveal, both polymer styles preserve
the mask, Reset and Show retain independent channels, partial targets leave other
hidden IDs alone, invalid multi-entry references cannot partially mutate, new IDs
do not inherit hiding, and no surface-capacity cap applies to the hide mask.
Archive older-mask omission and malformed/missing-atom masks are verified.

Local implementing-agent review checked revision/validation ordering, complete
forward/inverse state, all topology/scene paths and downgrade prevalidation. API,
PROJECT_SCHEMA, ARCHITECTURE and DEVELOPMENT document ownership and compatibility;
no molecular schema-major bump or scientific change. `git diff --check` passes.
Commit: `feat(selection): persist atom-detail visibility` (Refs #38).
C2 provides the API/persistence contract; renderer/UI behavior remains C3 work.

### 2026-09-14 — M2/C3 complete: compact Hide/Show workflow

Added the sixth Atom detail tile with none/all/mixed/empty selection behavior,
44 px targets, keyboard focus retention and context-bound feedback. The changing
Hide/Show label describes an action, rather than an `aria-pressed` toggle; mixed
visibility has an accessible name and the existing dashed visual treatment.
Application-owned commands preserve captured selection and cached projections.
The renderer masks only assigned atomic layers and their labels, using exact
native targets to suppress incident bonds. Polymer and surface inputs remain intact.

Validation commands: all frontend and Python common gates above, followed by the
exact C3 focused Playwright command with ports 8110/8111/5273, fresh data directory
`/tmp/neistra-38-m2-qualified` and `PLAYWRIGHT_BROWSERS_PATH=.playwright`.
Results: lint/typecheck/build and Ruff/mypy pass; **107 frontend tests (28 files)**,
**319 Python tests (49.61 s)** and **26 browser tests / 12 intentional layout skips
(4.0 minutes)** pass. No failed or flaky test remains. The existing bundle-size
advisory and 185 Alembic path-separator warnings remain unchanged.

Native tests exercise all five atomic styles and central-atom incident bonds,
atom labels, trace atoms, complete residues and all-atom hiding. Exact native
polymer arrays and retained surface buffer identity remain unchanged; camera,
selection, residue/chain labels and measurements are preserved. Hidden canonical
atoms remain pickable through polymer/surface geometry. Real application tests
cover mixed/partial targets, atomic-style reveal, Show/Reset, reload, hierarchy and
query reselection, zero structure GETs for style-only changes, and nonblank
rendering after reopening a fully hidden project. Both themes, desktop/Pixel 7,
axe checks, six tiles in one row and actual 100%/200% browser zoom pass.

Initial focused tests incorrectly counted native unbonded line crosses as bonds;
assertions now distinguish short crosses around visible atoms from former bond
segments. Mobile setup was corrected to dismiss existing notices and close the
inspector using its actual keyboard focus path before opening the palette. These
were test corrections, without forced clicks, reduced requirements or application
workarounds. The final full milestone run passes all corrected cases.

Screenshots and hashed native evidence are retained under
`docs/assets/selection-visibility/c3-*`. Desktop/light, mobile/dark and actual
200% zoom captures were visually inspected. Updated SELECTION_STYLING,
ACCESSIBILITY, ARCHITECTURE, API and VERIFICATION. D-063 is implemented; no new
cross-project decision or migration is required beyond C2.

Local implementing-agent review inspected all application/test changes for
channel leakage, parent bonds, persisted intent, focus, stale selection and scope.
No consequential finding remains; `git diff --check` passes. This is not an
independent review. Commit: `feat(selection): add compact hide and show controls`
(Refs #38). Next: C4 version preparation, complete release gate and delivery.

### 2026-09-14 — C4 release preparation

Fetched origin/master: unchanged at `d962682d904eb274974da7ef620098b8dcfb7d84`,
an ancestor of this branch. Remote releases remain latest v0.7.0; v0.8.0 is
unallocated. The additive durable visibility API and user workflow justify the
approved minor increment, with schema majors retained and downgrade guards intact.
All five authoritative sources advance to 0.8.0; the current-version archive
assertion is updated while the legacy v0.7.0 compatibility fixture is preserved.
README, release notes and migration guidance describe the delivered behavior,
scientific limits and #36 follow-up. Complete candidate qualification and final
full-diff review are next; this record does not claim release or merge completion.

### 2026-09-14 — Complete candidate gate found desktop palette overflow

Clean candidate `c147827` passed frozen installs, fresh migration 0012, Ruff/mypy,
319 Python tests, frontend lint/typecheck, 107 frontend tests, 8 supervisor tests
and production build. The complete Playwright run finished with **93 passed,
40 intentional skips, 1 failed, 0 flaky** in 917.33 s. The failure was the existing
1366×768 desktop no-scroll assertion in selection-appearance.spec.ts: six tiles
made the ball-and-stick label wrap to three lines and increased palette height.
All native visibility and large-capacity cases passed on both browser projects.
This candidate is not release-qualified.

Correct the visible label to “Ball & stick” while retaining the full “Ball and
stick” accessible name. Keep six equal-width tiles, 44 px targets, the existing
palette width and the unchanged no-scroll assertion. No molecular/persistence or
scientific change is involved. Focused layout/visibility/zoom verification and a
new clean complete candidate gate are required before PR creation.

Correction validation: frontend lint/typecheck and all 107 tests pass. Focused
Playwright selection-appearance, selection-visibility and rebranding-zoom suites
pass **13 cases / 3 intentional layout skips (3.0 minutes)** on fresh
`/tmp/neistra-38-label-qualified`, ports 8110/8111/5273. The original desktop
no-scroll assertion is unchanged and passes. Both themes, full accessible labels,
native visibility, mobile and actual zoom pass; the corrected desktop capture was
visually inspected. Updated captures are retained as `c4-*-visibility.png`.
Local review confirms this two-line UI change has no state or scientific effect.
Commit: `fix(selection): keep six-tile palette compact` (Refs #38).

### 2026-09-14 — Clean corrected candidate qualified

Exact tested commit: `4e2f14987603662889a922eb208467c9ae96c71f`.
Executed every complete-gate command above from a clean tree, using fresh data
and exclusive ports. Frozen uv/pnpm installs pass; fresh migration reaches 0012;
Ruff/mypy, frontend lint/typecheck/build and `git diff --check` pass.
**319 Python, 107 frontend, 8 supervisor and 94 browser tests pass**, with
**40 intentional layout skips, zero failures and zero flaky cases**. The browser
matrix contains 134 cases and took 934.47 s. Existing Alembic path-separator and
large-bundle advisories remain; there are no new qualification warnings.

All large cases pass on desktop/mobile: 6VXX ready 4.397/4.088 s, 1AON
9.081/8.790 s, synthetic 100k 8.511/8.160 s; longest task 443 ms. These are
host-specific Chromium/SwiftShader and Pixel 7 emulation results, not physical
phone claims. The original no-scroll test passes unchanged in the complete gate.

Final implementing-agent full-diff review covered API validation/no-op atomicity,
retained migration/history/archive paths, topology pruning, native mesh/chunk/
group accounting, immutable coordinate dependencies, exact atomic targets,
labels, channels, focus and scientific claims. The desktop overflow finding was
fixed in `4e2f149` and fully requalified. No consequential finding remains. This
local review is not independent review. No unapproved pocket implementation,
algorithm fork, silent resolution change or unrelated cleanup was introduced.

Fetched origin/master again: unchanged at `d962682d904eb274974da7ef620098b8dcfb7d84`
and already an ancestor. v0.8.0 remains unallocated. Normal merge is enabled;
master currently has no protection, rulesets, workflows or required checks.
Recheck live PR conversations/reviews/checks before merge. This subsequent evidence
commit changes documentation only; application/test sources match the tested SHA.
The exact merged master must pass the complete gate again before tagging.

### Publication and completion records

The following records are populated during delivery after exact merged qualification;
links here do not claim that publication has already occurred:

- [v0.8.0 release](https://github.com/ManuelSe/Neistra/releases/tag/v0.8.0): release
  notes, compatibility, limitations and verification attachment.
- [Release verification report](https://github.com/ManuelSe/Neistra/releases/download/v0.8.0/neistra-0.8.0-verification.json):
  exact candidate/merged commits, annotated tag object, complete gate results,
  large-surface measurements and review/delivery audit.
- [Issue #38 delivery reply](https://github.com/ManuelSe/Neistra/issues/38): merged
  PR, verified release, verification evidence and scope decisions.
- [Approved #36 follow-up](issue-36-pocket-surfaces.md): implementation begins only
  after #38 merge/tag/release/reply verification and feature-branch cleanup.

This preserves immutable qualified source without moving a release tag for later
bookkeeping. Clean up only this feature branch after every publication step is
verified remotely. No human approval or repository protection may be bypassed.

### 2026-09-14 — Delivery complete

PR [#39](https://github.com/ManuelSe/Neistra/pull/39) merged normally as
`ce3e4f761133caeff1ee76a827379f790fcad7cf`. The exact merged gate passed 319 Python,
107 frontend, 8 supervisor and 94 browser tests / 40 intentional layout skips,
zero failures/flakes (browser 935.21 s), plus every install/migration/lint/type/build
check. Annotated v0.8.0 tag object `bb4e053205592f540d240e92052252637ef4ca87` points
to that commit. Release and verification attachment are remotely verified;
downloaded report matches local bytes. Closeout
[reply](https://github.com/ManuelSe/Neistra/issues/38#issuecomment-5671366694)
is verified. Codex returned no review; documented local review and live repository
policy allowed normal merge without bypass. Local/remote feature branches were
deleted only after all publication checks. #38 is complete; #36 now proceeds on
its own branch. This completion record is appended on the #36 branch, without
changing the immutable v0.8.0 released source or tag.
