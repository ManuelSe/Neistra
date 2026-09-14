# Issue #38 — Selection atom visibility and protein surface capacity

## Status and delivery metadata

- Status: **approved; planning only; implementation has not started**.
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
unchanged. Approval to persist this document is **not** an instruction to start
implementation, open an implementation PR, merge, or publish a release now.

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
