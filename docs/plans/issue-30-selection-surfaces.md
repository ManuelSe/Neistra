# Issue #30 — Selection-specific surfaces

Status: implementing; M1–M3 / C1–C4 complete. User approved the proposal on 2026-09-11
and authorized implementation with `/goal` on 2026-09-11.

- Issue: [#30 — Define selection-specific surface geometry and persistence](https://github.com/ManuelSe/Neistra/issues/30), open at approval.
- Base branch: `master` / `origin/master`.
- Inspected and fast-forward-verified base: `9624ebcca24a1164c34d31a7f7d9cef3183b8775`.
- Feature branch: `feat/issue-30-selection-surfaces`.
- Planned release: **v0.7.0**, subject to upstream version/tag recheck.
- This document is the implementation contract. The original issue is context,
  not permission to expand scope. The global `docs/PLAN.md` is not replaced.

## Authority and repository evidence

Authority order: explicit user guidance and corrections; `AGENTS.md` and accepted
decisions; existing architecture, product boundaries, schemas and conventions;
issue problems/outcomes/constraints/non-goals; issue implementation suggestions.

Planning inspected `AGENTS.md`, `PRODUCT_SPEC.md`, `PLAN.md`, `PROGRESS.md`,
`DECISIONS.md`, `VERIFICATION.md`, architecture, API/project/normalized schemas,
development, scientific limitations and performance documentation; viewer
projection/settings, Mol* 5.11.0 surface routines, frontend state and palette,
selection services, command/history/scene/archive paths, migration 0010, jobs,
relevant Python/frontend/browser tests, and related issues #20/#21/#29/#34.
Branches, remote refs, tags/releases, recent PRs, merge options, protections,
workflows, version sources and scripts were inspected read-only before approval.

The repository now has verified releases through v0.6.1, superseding the brief's
no-release-history premise. No GitHub Actions workflows, rulesets or master
branch protection were configured at inspection; recheck at delivery. Normal
merge commits preserve checkpoint history. Current application migration head
is 0010; API, project, archive and normalized schema majors are 1.

Relevant accepted foundations: D-002/007 (authority and commands), D-022/023
(durable viewer settings and disposable rendering), D-042 (archive compatibility),
D-046 (independent representation channels), D-051–054 (selection/appearance),
and D-055 (non-modal palette). D-056–058 record the approved extension, not a
claim that it is implemented.

## Core problem and approved outcome

Scientists need a quick surface view for selected atoms without making an entire
entry a surface or disrupting atomic/polymer detail. Add compact Add/Remove
surface controls to the existing selection styling palette. Persist exact
memberships, preserve independent appearance properties, and generate bounded,
cancellable geometry with truthful scientific interpretation.

The approved geometry choice is **selected atoms alone**, not a selected patch
computed using surrounding atoms. The initially unanswered preference was
explicitly included in the proposal subsequently approved by the user.

## Scientific and interaction contract

- One selection-surface membership per entry. Add unions selected IDs into it;
  Remove subtracts them. Recompute geometry from the resulting union.
- A multi-entry command is atomic, but geometry remains separate per entry.
  Do not fuse entries or assume their coordinates should interact.
- Capture canonical stable atom IDs at activation. Ordinary later selection
  changes never retarget the surface or generate new geometry.
- Compute from current active-conformer coordinates intersected with entry,
  component, isolation and effective hydrogen visibility. Hidden state retains
  durable membership. Coordinate changes regenerate geometry; topology deletion
  prunes IDs reversibly; new atoms do not inherit membership.
- Fixed `molecular-v1` profile: molecular surface, probe radius 1.4 Å, grid spacing
  0.5 Å, 36 probe positions, physical radii from pinned Mol*, no parent context,
  no cavity flood filling, opacity 0.45. This is a fixed scientific profile,
  not a new user-adjustable parameter system.
- Compute the selected union across internal Mol* rendering units within an
  entry. Unit partitioning must not alter the intended geometry.
- Base color is element color. Existing selection colors, including carbon-only
  mode, apply through atom-associated surface coloring. Preserve full-projection
  hydrogen classification and local/master/component/isolation precedence;
  never reclassify an H after dropping its bonded neighbor from a subset.
- Existing entry surfaces remain unchanged and can coexist. Do not silently
  hide them, subtract geometry from them or alter their opacity. Explain overlap
  when relevant. Atomic and polymer channels and their resets remain independent.

This is a **fragment surface**: omitting neighbors may expose artificial faces
at cut residues or covalent boundaries. It is not a patch of the intact molecule,
a solvent-accessible-area measurement or evidence of a binding pocket. No residue
completion, bond capping, chemistry repair, alignment, periodic geometry,
alternate-location resolution or occupancy weighting is inferred. Preserve
source warnings and explain alternate-location/unknown-radius limitations.

Primary references verified during planning:

- [Pinned Mol* calculation parameters and algorithm](https://github.com/molstar/molstar/blob/v5.11.0/src/mol-math/geometry/molecular-surface.ts).
- [Pinned Mol* parent-context and surface input behavior](https://github.com/molstar/molstar/blob/v5.11.0/src/mol-repr/structure/visual/util/common.ts).
- [Pinned Mol* surface representation](https://github.com/molstar/molstar/blob/v5.11.0/src/mol-repr/structure/representation/molecular-surface.ts).

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment / follow-up |
|---|---|---|
| Selected-only versus surrounding-context geometry | Essential; product decision resolved by approval | Selected atoms alone, with fragment-boundary explanation |
| Convenient selection surface display | Essential | Compact Add/Remove in existing palette |
| Exact membership and selection-change behavior | Essential | Durable captured IDs; union/subtraction; no live selection binding |
| Probe, solvent and boundary interpretation | Essential | Fixed documented profile; no quantitative solvent claim |
| Covalent/residue boundaries | Essential | No expansion, capping or repair |
| Topology/coordinate changes | Essential | Reversible deletion pruning; regenerate changed geometry; no membership inference |
| Entry surfaces and representation channels | Essential | Independent coexistence; retain existing behavior |
| Local colors and hydrogen preferences | Essential | Reuse accepted semantics and complete-projection H classification |
| Visibility and isolation | Essential | Upper bounds on effective geometry; retain membership while hidden |
| Persistence/history/scenes/archives/migration | Essential | Extend existing viewer settings and command model |
| Cancellation/resources/large systems | Essential | Bounded worker, explicit cancellation/fallback/retry |
| Scientific fixtures, real geometry, camera/accessibility | Essential | Geometry assertions plus real-browser qualification |
| Existing whole-entry surfaces | Already satisfied | Preserve native renderer and controls |
| Application-owned molecular state and generic jobs | Already satisfied | Preserve ownership; no new backend surface job |
| Compact explanatory feedback/documentation | Supporting | Explain fragment meaning, overlaps and rendering state without verbose primary controls |
| Context-aware surface patches | Deferred | Different scientific contract; tracked in [#36](https://github.com/ManuelSe/Neistra/issues/36) |
| Adjustable probe/resolution/opacity; more algorithms | Optional; deferred | Fixed profile is sufficient for first workflow; no speculative follow-up yet |
| Generic layer manager/unlimited editable surfaces | Rejected as proposed architecture | Unnecessary ordering/overlap/naming/state complexity; no follow-up without concrete need |
| Subset extraction/export | Deferred | Existing #21 owns it |
| Component naming/classification overrides | Deferred | Existing #20 owns it |

## Data, migration and API

Add one nullable `ViewerSettings.selection_surface`, conceptually:

```json
{"selection_surface": {"profile": "molecular-v1", "atom_ids": [1, 2, 3]}}
```

Null means no selection surface. IDs are positive, unique, sorted, nonempty and
valid for the entry. The profile preserves interpretation without a general
parameter system. Add a revisioned action at
`/api/v1/projects/{project_id}/selection-surface`, accepting the existing canonical
selection and `add` or `remove`. Validate all entries first; record one command
with exact forward/inverse settings and captured selection. Stale revisions or
invalid references fail atomically. Unchanged membership creates no history entry.

Existing entry-settings updates preserve omitted surface state and cannot mutate
it by bypassing the dedicated action. Update Pydantic/OpenAPI and the current
typed frontend client together. Scenes, checkpoints, duplication and archive
remapping preserve the field. Topology deletion prunes live and scene membership
in the same reversible molecular command; empty membership becomes null.

Add migration **0011**, rechecking availability first. Add the null default to
live entries, checkpoint entries and checkpoint scenes, named scenes, and every
documented forward/inverse history path containing viewer settings. Do not
traverse user metadata or rewrite molecular artifacts. Validate every retained
location before downgrade writes; refuse if any non-null surface state remains,
including history that could restore it. Removing a visible surface does not
erase that history. Document pre-upgrade backup restoration as the reliable
rollback after feature use; never instruct users to discard history silently.

Retain `/api/v1` and project/archive/normalized schema major 1 under the existing
additive-settings contract. New readers accept old archives with absent fields.
New archives preserve memberships/profiles and validate target IDs after remapping.
Older applications are not guaranteed to preserve new surface settings. Original
uploads, normalized coordinates/bonds, warnings and artifact identities do not
change through styling. Archive history remains omitted by the existing contract.

## UI, ownership and computation

Add a compact Surface row with accessible Add/Remove actions, membership count or
mixed-state feedback, and short on-demand explanation. Preserve the non-modal
palette, keyboard focus, 44×44 px touch targets, both themes and usable 200% zoom.
Surface removal is separate from existing atomic/polymer reset. Capture mutation
targets and prevent stale feedback from describing a later selection.

Saving membership and completing geometry are distinct states. Show progress,
Cancel, failure, reduced-detail fallback and Retry without claiming that saved
settings guarantee successful rendering. Runtime status belongs to transient
application/viewer integration; Mol* never owns durable molecular or surface state.

Reuse pinned Mol* field/mesh routines in a dedicated browser worker and a small
viewer-boundary adapter. Do not fork the scientific algorithm or add backend
scientific jobs. C1 must prove transferred geometry preserves atom mapping,
coloring, picking, normals and resource disposal. Generation counters alone do
not cancel computation: terminate cancelled and obsolete workers.

| Resource / qualification measure | Approved initial limit or target |
|---|---|
| Concurrent calculations | One per viewer |
| Effective atoms per calculation | 20,000 |
| Padded scalar-grid cells | 4 million |
| Mesh buffers accepted for upload | 64 MiB per surface |
| Retained selection-surface mesh buffers | 128 MiB per viewer |
| Calculation deadline | 30 seconds per entry |
| Cancel feedback and worker termination | Within 500 ms on qualification host |
| Representative 1STP surface readiness | Under 10 seconds on pinned desktop host |
| Main-thread work attributable to surface interaction | No task ≥750 ms |
| Additional normalized structure GETs for existing minor interactions | Zero |

These are engineering admission limits and host qualification targets, not
measured results or universal throughput promises. Check grid dimensions before
allocation and account for mesh working allocations before accepting generation,
not only after receiving an oversized result. Record allocation accounting and
peak memory measurements; do not advertise a hard per-worker browser/GPU process
memory cap. If the pinned routines cannot meet these bounds reliably, C1 blocks
further work: obtain an approved amendment rather than silently relaxing limits
or substituting an algorithm.

Oversized/failed requests retain membership and show an explicit reduced-detail
line fallback. Preserve the existing ≥250,000-atom parent-entry degradation
policy. Exhausted viewer mesh budget yields deterministic explained fallback.

Coordinates, membership, visibility and isolation invalidate affected geometry.
Color changes reuse valid geometry; ordinary selection and camera changes do not
regenerate it. During coordinate previews hide obsolete surfaces, then regenerate
or restore after commit/cancellation. Never show stale geometry as current.
Palette closure does not cancel saved requests. Explicit Cancel stops rendering
without undoing settings. Project switches, disposal and superseding geometry
requests terminate obsolete work and prevent stale publication.

## Milestones and independently verifiable checkpoints

Each checkpoint updates this plan's evidence/progress log and the concise project
summary in `PROGRESS.md`; appends material cross-project decisions; reviews scope,
dead code, scientific accuracy, migration risks and regressions; then commits only
a coherent passing state. No empty checkpoint commits.

### M1 / C1 — Scientific and execution feasibility

- Outcome/areas: fixed profile, bounded worker, identity-preserving viewer mesh
  adapter and scientific fixtures. No unfinished public controls.
- Acceptance: single-atom radius behavior, overlapping/disconnected atoms,
  cross-unit union, omitted-neighbor independence, valid real geometry, cancellation,
  bounds, correct coloring/picking/normals and disposal.
- Focused commands: `corepack pnpm --dir apps/web test -- selection-surface-geometry selection-surface-worker`;
  `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-surfaces.spec.ts`.
- Documentation: profile, boundary semantics, resource evidence, adapter decision.
  No migration. Unmet scientific/execution gates block progression.
- Commit: `feat(viewer): add bounded selection surface rendering` (Refs #30).
  Revert leaves existing entry surfaces untouched.

### M2 / C2 — Durable surface membership

- Outcome/areas: schemas, service, commands, API/client, 0011, scenes, topology
  pruning and archive validation.
- Acceptance: atomic multi-entry actions, no-op behavior, exact undo/redo,
  legacy defaults, retained-history downgrade refusal, molecular invariance.
- Focused command: `.venv/bin/uv run pytest tests/integration/test_selection_surfaces.py tests/integration/test_viewer_state.py tests/integration/test_migrations.py tests/integration/test_archive_roundtrip.py tests/security/test_archive_safety.py`.
- Documentation: API/project schema, upgrade/rollback and persistence decisions.
  Demonstrate fresh upgrade and permitted `0010 → 0011 → 0010 → 0011` on disposable
  data, plus non-destructive refusal for every retained-state location.
- Commit: `feat(selection): persist reversible surface memberships` (Refs #30).
  Downgrade only with all retained state null; otherwise restore backup.

### M2 / C3 — Complete user workflow

- Outcome/areas: compact controls, captured mutation state, renderer integration,
  status/cancel/retry, appearance/visibility/isolation, scenes and coordinate invalidation.
- Acceptance: actual user action → durable state → correct geometry → reload/undo;
  independent resets, preserved entry surfaces, no stale async results/camera resets.
- Focused commands: `corepack pnpm --dir apps/web test -- selection-surface selection-style-dialog representations viewer-adapter`;
  `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-surfaces.spec.ts tests/e2e/selection-styling.spec.ts tests/e2e/selection-appearance.spec.ts`.
- Documentation: styling guide, limitations, architecture. No additional migration.
- Commit: `feat(selection): expose compact surface controls` (Refs #30).
  Preserve independently reversible settings and compatibility established in C2.

### M3 / C4 — Scientific and workflow hardening

- Outcome/areas: qualify cut boundaries, partial residues, explicit H,
  alternate-location warnings, hidden entries, multi-entry failures, topology
  deletion/undo, interrupted rendering, resource cleanup and repeated use.
- Acceptance: geometry-specific WebGL evidence, accessible responsive controls,
  camera stability, measured performance and no consequential unresolved findings.
- Focused commands: `.venv/bin/uv run pytest`; `corepack pnpm --dir apps/web test`;
  `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-surfaces.spec.ts tests/e2e/selection-appearance.spec.ts tests/e2e/coordinate-editing.spec.ts tests/e2e/export-archive.spec.ts tests/e2e/release-hardening.spec.ts`.
- Documentation: fixtures, accessibility, performance, verification and limitations.
  Fix findings and rerun affected checks; do not weaken budgets to obtain a pass.
- Commit: `test(selection): qualify surface workflows and limits` (Refs #30).
  Any fixes use appropriate Conventional Commit types; no new migration expected.

### M4 / C5 — Release preparation and delivery

- Outcome/areas: safely incorporate current base, finalize version/docs, complete
  gate, full-diff review, PR, protection-compliant merge, exact merged qualification,
  annotated tag and published release.
- Acceptance: all delivery conditions below satisfied and remotely verified.
- Validation: complete release gate before PR/merge and on exact merged commit
  before publication. Recheck upstream versions/tags and migration head.
- Documentation: final migration/compatibility notes, release notes, publication audit.
- Commit: `chore(release): prepare v0.7.0` (Refs #30), adapting version only after
  the required upstream collision check. Never move a released tag; failed merged
  qualification blocks publication.

## Common milestone and complete release gates

New test filenames above are planned additions, not claims of existing tests.
Each milestone runs its focused Python/browser checks plus:

```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```

The complete README/DEVELOPMENT release gate, using disposable application data:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave-release-issue30 .venv/bin/uv run alembic upgrade head
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

Use dedicated disposable application/E2E directories and documented isolated
ports where needed. Never reset developer data. Record exact commits, commands,
environment, results, intentional skips, geometry evidence, timing and limitations.
Run performance qualification without competing builds/tests. Existing v0.6.1
evidence is baseline context, not proof of this feature.

Scientific acceptance inspects finite vertices/normals, valid indices and atom
ownership, reference bounds within declared grid tolerances, selected-only versus
full-context differences, and real surface coloring/picking—not just a nonblank
canvas. Qualify desktop Chromium and Pixel 7 emulation, both themes, keyboard,
44×44 targets and actual 100%/200% zoom. Do not imply physical-device or broader
browser qualification. Styling preserves originals, coordinates, bonds, warnings
and molecular artifact identities.

## Version and release plan

Provisional **0.7.0 minor**: this adds user-visible functionality, a durable
setting and an API action. It is not merely a correction warranting a patch.
Under the approved additive backward-reading/migration contract no major bump
is needed. No prerelease is needed after scientific and release qualification;
failed gates are not permission to publish a prerelease instead.

Recheck remote tags/releases/upstream before allocation. Update all five sources:

- `pyproject.toml`;
- root application package record in `uv.lock`;
- `apps/web/package.json`;
- FastAPI version in `apps/api/src/molweave_api/main.py`;
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Do not blanket-update schema or plugin implementation versions. Proposed
annotated tag: **v0.7.0**, on the exact qualified merged master commit.

Release-note sections: highlights/fixes; scientific interpretation/limitations;
persisted data/migration; API/archive compatibility/rollback; verification/resource
limits; deferred/rejected requests and follow-up work.

## PR, review, merge, issue response and cleanup

PR title: `feat(selection): add bounded selection-specific surfaces`.
Base: `master`. Include `Closes #30`. Keep #30 open during plan persistence;
no implementation completion is claimed by the approved design document.

Fetch and incorporate latest `origin/master` safely, preserving unrelated work.
Use a normal merge commit preserving checkpoints; never force-push shared history.
PR description covers outcomes, checkpoints, scientific decisions, deferred context
patches, migration/downgrade, compatibility, exact evidence and follow-up links.
Create one follow-up for context-aware selected surface patches during authorized
delivery; refer to existing #20/#21 rather than duplicating them. No speculative
issues for optional controls/layer architecture without a concrete need.

Request `@codex review` if available; otherwise document local full-diff review
without claiming independence. Address consequential findings and unresolved
conversations. Recheck current protections, required reviews and status checks.

Block merge/release for failed gates, unreliable geometry/cancellation, unbounded
allocation, stale geometry, wrong atom mapping, migration/archive loss,
camera/selection regressions, inaccessible controls, missing required approvals,
unresolved findings, version collisions or scope changes needing renewed approval.
No protections or human approval requirements may be bypassed.

After merge verify its commit on `origin/master`, switch to master and fast-forward,
qualify that exact commit, create/push the annotated tag and publish the release.
Verify tag/release remotely, then post the issue close-out with implementation,
PR/release links, evidence, migration/compatibility, simplifications/deferred work
and follow-up links. Delete only this feature branch after publication and reply
verification. Verify remote/local cleanup and synchronized clean master.

Publication records must identify exact candidate/merged commits, gate results,
tag object/target, PR, release, issue comment and follow-ups. Store final publication
evidence in the release/issue audit linked from this plan when it cannot be known
before merge; never fabricate self-referential final commit IDs or retag a release
for documentation. Keep project-level progress concise and current.

## Decisions and deviations

- D-056: selected-fragment geometry, fixed profile and explicit scientific limits.
- D-057: bounded durable surface membership independent of other channels.
- D-058: cancellable bounded browser computation and truthful runtime feedback.
- The brief's no-tag-history assumption is superseded by verified v0.6.1 history.
- Context patches are deferred, not silently substituted for selected-only geometry.
- No other approved-scope deviations. Changes to interpretation, budgets or product
  scope require a recorded approved amendment when gates cannot be met.

## Progress, acceptance evidence and completion log

| Date / stage | Evidence and state |
|---|---|
| 2026-09-11 — analysis | Required repository/issue/release inspection completed read-only; no new implementation tests claimed |
| 2026-09-11 — approval | User: “I approve the plan.” Approved selected-only geometry, resource gates, checkpoints and provisional v0.7.0 |
| 2026-09-11 — persistence preparation | Clean master fetched and fast-forward verified at `9624ebcca24a1164c34d31a7f7d9cef3183b8775`; planned feature branch created; this plan is its first file change |
| 2026-09-11 — documentation validation | `git diff --check` passed; local Markdown links, required plan sections and unique D-056–058 identifiers checked; global `docs/PLAN.md` unchanged; diff reviewed as documentation-only |
| M1/C1 | Complete: bounded native geometry worker and structural mesh adapter; 91 frontend tests, lint/type/build and two real-browser checks pass; evidence below |
| M2/C2 | Complete: durable membership/API/history/scenes/archives and guarded migration 0011; 272 Python tests and all checkpoint gates passed |
| M2/C3 | Next: complete production palette/renderer workflow |
| M3/C4 | Not started |
| M4/C5 | Not started |

Planning completion: validate documentation links/scope/whitespace, commit as
`docs(plan): add approved plan for issue 30`, push and verify the remote branch.
The planning commit identifies itself through Git history. No implementation,
version increment, migration, PR, follow-up issue, tag or release is created in
that planning stage. The user subsequently authorized implementation; next: M2/C2.


### M1/C1 evidence — 2026-09-11

Implemented fixed profile, input/grid admission, intersected-cell mesh allocation
accounting, serial worker queue with cancellation/deadline/disposal, and a native
Mol* complex mesh visual preserving structural group iteration and loci. No
production controls, API changes or migration yet. A development-only HTML entry
makes the renderer qualification reproducible without adding it to production
build inputs. Internal unit partitioning preserves exact input arrays.

Commands passed: Ruff; mypy (51 files); frontend lint, typecheck, full Vitest
(91 tests / 26 files), production build; focused Playwright selection-surfaces
(two passed: Chromium and Pixel 7 emulation); `git diff --check`.
Logs: `/tmp/neistra-30-c1-{ruff,mypy,lint,typecheck,vitest,build}.log` and
`/tmp/neistra-30-c1-final-e2e.log`. Isolated E2E data:
`/tmp/neistra-30-c1-final-e2e`, ports 8110/8111/5273. No developer data changed.

Persisted [desktop](../assets/selection-surfaces/c1-chromium.json) and
[mobile](../assets/selection-surfaces/c1-mobile-chromium.json) evidence: 1,001 atoms,
734,160 grid cells, 35,503 intersected cells, 71,012 triangles, 3,405,576 mesh bytes;
conservative mesh bound 28,970,448 and working allocation accounting 133,020,368
bytes. Desktop readiness 549 ms, longest surface task 210 ms, cancellation 22 ms;
mobile 486/177/20 ms respectively. Linux summed descendant RSS peaked at
887,156/754,652 KiB, including browser, shared pages, projection and renderer;
these measurements are not worker-heap or GPU caps.

Unit tests cover physical sphere tolerance, overlapping/disconnected atoms,
selected-only input independence, stable IDs, admission failures and worker
lifecycle. Browser qualification isolates the new surface, verifies nonblank
colored geometry and actual picks mapped to normalized IDs, and checks disposal.
C4 will broaden workflow/scientific/accessibility coverage.

Initial integration checks exposed a bad one-unit fixture assumption, native
opacity picking threshold, and dev dependency discovery reloads. Explicit
partition-invariance evidence, a dedicated scanned test HTML entry, and the
0.45 picking threshold in the isolated renderer harness resolve those checks.
Production integration must preserve inherited opacity picking semantics (D-059).
Lint/type findings were fixed; the final checks above passed without retry or
budget relaxation. The existing lazy Mol* chunk-size advisory remains.

Diff reviewed for scope, scientific identity, cancellation and allocation risks.
No native scientific algorithm was copied. C1 is a renderer foundation, not a
claim of available durable selection-surface functionality. Next: M2/C2.


### M2/C2 evidence — 2026-09-11

Added nullable fixed-profile membership, strict persisted IDs, dedicated revisioned
Add/Remove action, exact atomic multi-entry history and no-op suppression. Legacy
entry settings preserve omitted membership and cannot bypass the action. Pruning,
scenes, duplication, checkpoints, restart recovery and archive remapping retain
or reconcile memberships without changing molecular bytes/artifacts. Migration
0011 defaults every documented path and refuses non-null retained state before
writing; 17 scenarios cover 16 live/checkpoint/scene/history locations plus the
permitted upgrade/downgrade/re-upgrade cycle. Metadata sentinels remain unchanged.

Passed focused Python gate (102 tests), then complete Python suite after additional
restart/archive-error checks (**272 passed**, 133 existing Alembic deprecation
warnings). Ruff and mypy (52 files), frontend lint/typecheck, 91 Vitest tests and
production build passed. Focused Playwright selection-surfaces + export-archive:
**6 passed, 4 intentional layout skips**. Logs `/tmp/neistra-30-c2-{ruff,mypy,pytest,
lint,typecheck,vitest,build,e2e}.log`; focused Python log
`/tmp/neistra-30-c2-focused.log`. E2E directory `/tmp/neistra-30-c2-e2e`, isolated
ports 8110/8111/5273, upgraded freshly through 0011. No developer data changed.

Initial new assertions exposed existing SQLite timestamp serialization differences
between mutation responses and subsequent reads; no-op/atomicity checks now compare
persisted reads. Updated the existing viewer-settings fixture for the additive null
field. Archive rejection checks assert actual error codes, not merely HTTP status.
These were test corrections, not relaxed compatibility checks. Final full suite passed.

Diff reviewed for retained-history coverage, mutation bypass, no-op revision behavior,
archive reference validation, pruning and unrelated molecular changes. No further
architectural deviation from D-057. The API is available; production surface UI and
rendering integration remain C3. Next: M2/C3.


### C3 / M2 completion — 2026-09-11

Implemented compact Surface Add/Remove controls, exact mixed counts, on-demand
fragment explanation and coexistence notice. Mutation ownership stays in App;
current selection and artifact state are captured at activation. Runtime status,
cancel and retry remain accessible outside the palette. Durable memberships drive
independent geometry, full-context hydrogen classification and visibility/isolation
intersection. Color-only rebuilds reuse geometry; edits remove obsolete components.
One serial worker queue and bounded cache discard obsolete requests/results.

Validation on the C3 candidate:
- Ruff and mypy (52 files), frontend lint/typecheck, all 96 frontend tests in 27
  files, production build and `git diff --check`: passed. Logs
  `/tmp/neistra-30-c3-{ruff,mypy,lint,typecheck,vitest,build}.log`.
- Planned C3 browser command (`selection-surfaces`, `selection-styling`,
  `selection-appearance`): **11 passed, 5 intentional layout skips**, 1.8 minutes.
  Fresh data `/tmp/neistra-30-c3-final-e2e`, API/worker/web ports 8110/8111/5273;
  log `/tmp/neistra-30-c3-final-e2e.log`. Add → reset → reload → Remove → Undo
  verifies durable membership and unchanged molecular artifact.
- Final review corrected threshold restoration when another entry has only a
  line fallback. All common gates reran; focused surface browsers then **3 passed,
  1 intentional layout skip**, 20.6 seconds, fresh data
  `/tmp/neistra-30-c3-review-e2e`, log `/tmp/neistra-30-c3-review-e2e.log`.
- Initial browser failures exposed a desktop palette overflow (fixed by one compact
  row), an obsolete duplicate test-provider registration and a test locator that
  omitted Undo's command description. No assertion/budget was relaxed.
- Diff reviewed for scope, independent resets, original artifacts, atom mapping,
  stale callbacks, cancellation and inherited pick eligibility. No new migration
  or compatibility change beyond C2. Scientific/browser/performance hardening is C4;
  complete release qualification and publication remain pending.


### C4 / M3 completion — 2026-09-12

Production WebGL qualification now covers carbon/element color coexistence,
geometry identity across recoloring, exact camera preservation, coordinate
preview/cancel/commit, isolation, full-projection C–H/O–H classification, hidden
targets, per-entry grid failure, cancellation/retry, upload failure/recovery,
worker disposal and partial-residue fragments. The real palette workflow proves
zero extra normalized GETs before reload, durable undo/reload and disposal when
returning to a cached project. New Python cases retain conformers/alternate-location
warnings/original bytes and prove newly created atoms do not inherit membership.

Material findings fixed during hardening:
- Empty-scene automatic camera resets could clamp radius to 0.01, clipping a
  surface-only view during recoloring. D-060 records explicit camera-reset/scene
  ownership and project-keyed viewer lifetime. Same camera/color assertions pass;
  navigation, named scenes and coordinate checks also passed in the focused review.
- Color intersections now use a set; failed uploads remove partial representations
  and release attached mesh references. Failure of both surface and line rendering
  reports unavailable rendering rather than falsely claiming lines are visible.
- The production cancellation test originally timed termination *plus* subsequent
  line upload (739.9 ms in one run). It now asserts the unchanged <500 ms worker
  termination boundary and zero active workers immediately, then independently
  waits for line fallback. The separate real-worker qualification remains <500 ms.
- The new cached-project test originally created its second fixture after the UI's
  project list was cached. Fixture creation now precedes opening the UI; the
  corrected focused workflow passed. No product assertion or resource budget was
  weakened, and no unresolved consequential finding remains.

Evidence:
- `.venv/bin/uv run pytest`: **274 passed**, 133 existing Alembic deprecation
  warnings, 40.13 seconds (`/tmp/neistra-30-c4-pytest.log`). C2's migration upgrade,
  downgrade and every retained-state refusal case remain covered.
- Ruff/mypy (52 files), frontend lint/typecheck, **96 tests / 27 files**, production
  build and diff check passed; `/tmp/neistra-30-c4-{ruff,mypy,lint,typecheck,vitest,build}.log`.
- Focused camera/upload review: surface, viewer-controls and coordinate browser
  suites **15 passed / 7 intentional skips**, 1.5 minutes
  (`/tmp/neistra-30-c4-review-e2e.log`).
- Final broad C4 command: planned surface/appearance/coordinate/archive/release-
  hardening suites plus `rebranding-zoom.spec.ts`; **25 passed / 10 intentional
  skips**, with the sole stale fixture-order failure described above, 4.8 minutes
  (`/tmp/neistra-30-c4-accepted-e2e.log`). Corrected workflow rerun:
  `playwright test tests/e2e/selection-surfaces.spec.ts -g 'adds and removes'`,
  **1 passed / 1 intentional skip**, 18.3 seconds
  (`/tmp/neistra-30-c4-workflow-e2e.log`). All 26 distinct applicable C4 cases
  therefore have passing results; the complete clean release gate remains C5.
- Browser commands used API/worker/web ports 8110/8111/5273, `PLAYWRIGHT_BROWSERS_PATH=.playwright`
  and dedicated fresh `/tmp/neistra-30-c4-{accepted,workflow}-e2e` data. No developer
  data was reset. Real 100%/200% zoom and light/dark accessibility passed; inspected
  screenshots are linked in `SELECTION_STYLING.md`.
- Final renderer evidence: [desktop](../assets/selection-surfaces/c4-chromium.json),
  [Pixel 7 emulation](../assets/selection-surfaces/c4-mobile-chromium.json). Production
  ready 727.2/490.1 ms, longest observed surface task 385/129 ms; real-worker
  cancellation 21.7/20.7 ms. Geometry and allocation bounds remain the C1 values.
  RSS is measured summed process memory, not a worker/GPU heap ceiling.
- Deferred context-aware patches: [#36](https://github.com/ManuelSe/Neistra/issues/36)
  created and verified open. Existing #20/#21 remain separate; no speculative
  optional-profile/layer-manager issues were created.

C4 uses a `fix(viewer)` checkpoint commit because qualification exposed consequential
camera and failure-cleanup defects. Documentation, tests and evidence are included;
there is no new migration or approved-scope expansion. Next is C5 version/release
preparation, clean complete gate, final review and protected remote delivery.


### C5 release preparation — 2026-09-12

Fetched origin and tags; `origin/master` remains
`9624ebcca24a1164c34d31a7f7d9cef3183b8775`, already an ancestor of this branch.
Remote tags/releases show v0.6.1 latest and no v0.7.0 allocation. Normal merge is
allowed; no rulesets/master protection or CI workflows are configured at this
inspection. Recheck live PR state before merging.

Prepare **v0.7.0 minor** in all five authoritative files. This is additive user
functionality, a defaultable setting and API action; original molecular data and
backward reading remain intact, while forward reading by older versions is not
promised. Therefore neither patch, major nor prerelease is appropriate. Release
notes, README and migration guidance describe rollback, scientific limits and #36.
The complete clean candidate gate and full-diff review follow this preparation
commit; publication still requires the exact merged gate and verified tag/release.

Preparation validation: all five version values equal 0.7.0; `uv sync --frozen`,
Ruff, diff check and 31 archive/surface integration tests passed (8.16 seconds,
`/tmp/neistra-30-version-{sync,ruff,tests}.log`). Updated the release-specific
archive-version assertion and added v0.6.1 to the legacy compatibility matrix;
the initial assertion failures were outdated test expectations, not archive loss.

### C5 preflight review correction — 2026-09-12

Move the projected atom-count rejection ahead of input-array construction; the
250,000-atom parent degradation also bypasses surface input extraction. This
honors the existing limits without first serializing oversized selections. A
negative test proves oversized components are rejected before any atom-array
access. Frontend lint/typecheck, all **97 tests / 27 files**, production build and
diff check pass (`/tmp/neistra-30-preflight-{lint,typecheck,vitest,build}.log`).
No schema/API/profile change. Record this as a separate `perf(viewer)` correction
before the complete clean candidate gate.

### C5 coordinate-cache review correction — 2026-09-12

Full-diff review found committed coordinates missing from the adapter's cached
rebuild input. A production geometry assertion reproduced a 5.000166 Å error
after isolation (required error <0.5 Å). D-061 records the fix: clone committed
input and retain transient preview coordinates separately through style rebuilds,
without mutating application query state. Preview surfaces stay hidden.

Frontend lint/typecheck, **97 tests / 27 files**, build and diff check pass;
`/tmp/neistra-30-coordinate-cache-{lint,typecheck,vitest,build}.log`. Focused command:
`PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-surfaces.spec.ts tests/e2e/coordinate-editing.spec.ts`,
with isolated ports 8110/8111/5273 and fresh
`MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-30-coordinate-cache-final`: **10 passed /
2 intentional skips**, 59.0 seconds (`/tmp/neistra-30-coordinate-cache-final.log`).
The red reproduction is `/tmp/neistra-30-coordinate-cache-red.log`.

The earlier full candidate run on 98e8ff3 was deliberately interrupted when this
finding emerged; it is not a passing release gate. The following run on ea7f799
was stopped before browser qualification for a palette performance correction:
use memoized per-entry membership sets rather than repeatedly scanning arrays
for each selected atom. This preserves mixed counts and avoids quadratic work.
A fresh complete gate follows the correction. No schema, API or scope change.

Palette count correction validation: frontend lint/typecheck and all **97 tests /
27 files** pass (`/tmp/neistra-30-count-{lint,typecheck,test}.log`). Existing mixed
membership and disabled-action assertions remain unchanged. Diff review confirms
only membership lookup cost changed; no new behavior or migration is introduced.
