# Issue #36 — Saved selection-centered protein pocket surfaces

## Status and delivery metadata

- Status: **M1/C1 and M2/C2 complete; M2/C3 compact workflow next**.
- User approved the two-release plan on 2026-09-14, then requested detailed
  persistence and an explicit stop before implementation.
- Issue: [#36](https://github.com/ManuelSe/Neistra/issues/36).
- Dependency: [issue #38 visibility and capacity](issue-38-selection-visibility-capacity.md)
  must be released first. Pocket work must not block v0.8.0.
- Planning baseline: `master` / `origin/master` at
  `d962682d904eb274974da7ef620098b8dcfb7d84` (v0.7.0).
- Document initially persisted on `feat/issue-38-selection-visibility-capacity`
  together with the entire approved first-release contract.
- Future implementation base: up-to-date `origin/master` containing the verified
  issue #38 release. Record its exact commit before pocket implementation.
- Future branch: `feat/issue-36-pocket-surfaces`; created from verified v0.8.0 master.
- Planned version/tag: **v0.9.0**, subject to the dependency release and collision check.
- Proposed PR title: `feat(surface): add selection-centered protein pocket views`.
- Merge strategy: normal merge commit preserving coherent checkpoint history.

This is the complete second-release implementation contract. The original #36
exploration brief remains context; the user resolved its product choices. Do not
reintroduce automatic pocket discovery, arbitrary context selection or a layer
manager as necessary scope. The global `docs/PLAN.md` remains unchanged.

Persisting this document does not authorize implementation, PR creation, merging
or release publication in the current turn. Await the next user start instruction.

## Core problem, approved outcome, and authority

Scientists need to inspect a nearby protein surface around a selected ligand or
site without fragment-surface artificial faces. Add an on-demand workflow to the
existing compact Surface row, computing a patch from the complete receptor protein
context. This is a visualization of proximity on a molecular surface, not cavity
analysis or proof of binding.

Confirmed user decisions:

1. Use the current selection as a capturable ligand/site seed, not automatic
   cavity discovery.
2. Use **protein-only** receptor context in the first pocket release.
3. Store **one pocket per receptor**; scenes provide alternate saved views.
4. Deliver this after atom hiding and larger ordinary surfaces, in a separate release.

Authority is explicit user choices/approval, AGENTS and accepted decisions,
repository architecture/product/conventions, issue outcomes, then speculative
implementation suggestions. Relevant decisions are D-056–062 for existing
fragment/worker/camera/coordinate behavior and D-063–066 for this approved extension.
Historical decisions describing the earlier deferral remain historical rather
than being silently rewritten.

Planning inspected the current surface kernel/mesh groups, worker queue/runtime,
entry viewer settings, compact palette, application-owned projection loading,
command/history/scenes, topology pruning and archive reference remapping. Existing
surface geometry is a selected-atoms-only fragment; merely selecting nearby
residues and calling it a pocket does not meet this contract.

## Requirement disposition and non-goals

| Requirement | Disposition | Approved treatment / follow-up |
|---|---|---|
| Pocket surface around selected ligand or site | Essential | Capture stable seed atom references and crop a full protein-context molecular surface |
| Correct context at fragment boundaries | Essential | Full receptor computation before display filtering; never cap cut patch edges |
| Simple receptor choice | Essential | One protein-containing entry; preselect only when unambiguous |
| Adjustable displayed neighborhood | Supporting, accepted | Radius 5 Å default; 2–12 Å in 0.5 Å steps, inside the pocket popover |
| Persistent seeds and one view per receptor | Essential, explicit choice | Nullable entry setting, reversible commands, saved scenes for alternatives |
| Capture rather than live-bind current selection | Essential | Current selection changes do not silently retarget an existing pocket |
| Color/picking identity and scientific limitations | Essential | Preserve receptor atom ownership, vertex positions and normals; explain proximity-only meaning |
| Cross-entry ligand seeds, hidden seeds, coordinate changes | Essential | Application resolves all required projections; stable cross-entry references |
| Compact original UI | Essential | Existing Surface help/overflow footprint; no permanent extra row or layer list |
| Bounded workers and larger protein support | Supporting dependency, mandatory | Reuse released #38 budgets and qualification; combined accounting for both surface channels |
| Atomic Hide independent of pocket context | Essential | Hide atom detail does not reshape the pocket |
| Automatic pocket/cavity detection and ranking | Deferred | Separate scientific algorithm and product workflow; do not create a speculative issue now |
| Volume, area, scoring or binding significance | Rejected as claims for this feature | No measurements/analysis implied by a radius-cropped surface |
| Custom context including cofactors/waters/ions/multiple entries | Deferred by explicit choice | Explain excluded context; future need requires its own approved plan |
| Multiple independently managed pockets per receptor | Deferred by explicit choice | One view plus scenes is sufficient initially; no layer manager |
| Existing selected-fragment and whole-entry surfaces | Already satisfied | Preserve independent behavior and coexistence |
| Mesh export, chemistry repair or inferred preparation | Deferred/outside product slice | No implementation here; coordinate subset export #21 remains separate |
| Classification changes | Deferred | Use existing protein classification; #20 remains separate |

No speculative follow-up issues are required for the deferred optional directions.
Record them in release notes and the #36 closeout. If implementation uncovers an
independent concrete defect, evaluate a separate issue without expanding this scope.

## Detailed interaction contract

Replace the Surface row's current help button with an equally sized overflow menu
containing **Pocket…** and **About surfaces**. Keep fragment Add/Remove immediately
available. Preserve a compact nonmodal panel and existing keyboard/touch conventions;
do not add a permanent pocket row, advanced surface controls or generic layer list.

The pocket popover contains:

- Receptor selector: one protein-containing entry. Include an explicit choice
  when there is more than one eligible receptor; never guess the nearest receptor.
  If none exists, show a concise reason and disable creation.
- Radius field: default 5 Å; accepted values 2–12 Å, step 0.5 Å.
- Captured seed count with **Use selection**.
- Apply and Remove actions, plus normal close/dismiss behavior.

For a new receptor view, initialize the draft seeds from current selection. For an
existing receptor view, load its saved seeds/radius; current selection does not
replace them until Use selection is activated. Receptor switching reloads that
receptor's saved state or initializes its new draft. Apply validates and commits
that exact draft. Disable creation/Apply when seeds are empty or invalid; Remove
clears the existing pocket without requiring a nonempty current selection. Close
or project-switch dismissal discards uncommitted draft state.

Use existing busy locking, focus preservation and context-bound feedback. Stale
responses must not describe or alter a newly selected receptor/project. Surface
runtime statuses identify Fragment versus Pocket so Cancel/Retry target the right
channel. Closing the popover does not cancel a saved requested surface.

A pocket can coexist with fragment and whole-entry surfaces. Explain possible
overlap on demand in this popover/help; do not hide or merge other layers. Atomic
representation Reset, color reset and fragment Remove do not remove the pocket.
One pocket per receptor avoids a list; saving scenes is the supported way to retain
alternate seeds/radii for the same receptor.

All controls remain keyboard operable, accurately labelled and >=44 px for touch.
Both themes, Pixel 7 layout, actual 100%/200% zoom and narrow responsive breakpoints
must remain usable without horizontal overflow or focus traps.

## Scientific geometry contract: pocket-v1

The word pocket names a convenient view, not a discovered or validated binding site.

1. Resolve the chosen entry's **complete current protein component** using existing
   normalized classification and active coordinates, including supplied protein
   hydrogens. Exclude separately classified ligands, waters, solvents, ions and
   cofactors; do not silently complete/reclassify covalent or modified structures.
2. Compute its molecular surface with the pinned native routines: physical radii,
   1.4 Å probe, 0.5 Å grid spacing, 36 probe positions, no chemistry repair/capping,
   no inferred hydrogens, conformer choice, occupancy weighting, alignment or
   periodic/symmetry context. Display opacity remains 0.45.
3. Use a spatial index over captured seed atom centers in the current shared
   Cartesian project frame. Retain each full-context triangle whose centroid is
   within the radius of at least one seed center (inclusive cutoff).
4. Compact retained triangles while preserving their vertex positions, normals,
   winding and receptor atom-owner groups. Do not interpolate a new cutoff surface,
   generate caps or introduce artificial closure faces.

The radius is surface-triangle-centroid proximity to seed centers, not a solvent,
atom-radius, residue-completion or cavity-volume threshold. Mesh-triangle boundary
steps can be slightly jagged. Disconnected seeds can produce disconnected pieces;
all belong to the single saved view. Empty output is a valid explained result,
not a reason to fabricate geometry or enlarge the radius automatically.

Source algorithm: [pinned Mol* molecular surface](https://github.com/molstar/molstar/blob/v5.11.0/src/mol-math/geometry/molecular-surface.ts).
Use its existing mesh grouping for receptor-associated color and structural picking.
Retained triangles must match the corresponding full-context reference geometry;
selecting nearby residues and calculating a new fragment is specifically forbidden.

### Context versus display visibility

- Atomic Hide and atomic H display controls do not remove atoms from pocket
  calculation context or reshape its geometry. Supplied protein H atoms contribute
  regardless of whether atomic H detail is displayed. This distinct pocket-v1
  contract must not change existing molecular-v1 fragment semantics.
- Hiding the receptor entry or its protein component hides the pocket without
  deleting its saved definition. Avoid unnecessary calculation for a hidden owner.
- Isolation filters displayed triangles by their receptor atom-owner IDs, retaining
  full protein calculation context. Do not recompute a truncated receptor surface.
- Hidden seed entries still supply coordinates. Atom hiding, entry visibility and
  later current-selection changes do not remove valid captured seed references.
- If protein context becomes empty, explain unavailable context and retain the
  saved definition while references remain valid. Do not infer a replacement receptor.

Colors, including carbon-only assignments, use receptor ownership rather than
seed ownership. Picking returns receptor canonical atom references. Preserve
application camera/selection and existing transparent-picking compatibility.
These choices and excluded context must be discoverable through on-demand help
and documented scientific limitations, not lengthy text on the primary controls.

## State, API, lifecycle and compatibility

### Durable record and command

Add nullable `selection_pocket_surface` to receptor ViewerSettings, default null.
It contains `profile: pocket-v1`, canonical seed atom references and radius. The
owning entry is the receptor; no separate generated mesh record is persisted.
Use the existing AtomReference identity `(structure_id, atom_id)`, not a new
seed identity convention. Resolve full current protein context from the owning
entry rather than persisting a copied protein coordinate/atom-membership list.

Add `POST /api/v1/projects/{id}/selection-pocket-surface` with expected revision,
receptor entry ID, action `apply | remove`, and the apply definition. Validate
receptor eligibility, all cross-entry seed references and radius before any change.
Repeated identical Apply and removing an absent pocket are no-ops. Use existing
forward/inverse command patterns for exact undo/redo, one revision per change,
scenes, checkpoint/restart, duplication and archive persistence. Ordinary viewer-
settings updates preserve omitted pocket state and cannot bypass this action.

Topology deletion prunes seed references across all affected receptor definitions
and retained scenes, reversibly in the originating command. Clear a pocket when
no seeds remain. Deleting a receptor removes its owned setting with the entry;
undo restores it. New atoms never become seeds automatically; new current protein
atoms do contribute to the complete receptor context. Receptor duplication remaps
self-referencing seeds to the copy while retaining valid other-entry references
within that project. Archive import remaps all seed entry IDs, including settings
inside scenes/checkpoints/history, and validates against the appropriate retained
state rather than assuming every historical atom must be currently live.

### Application-owned inputs and invalidation

The application resolves receptor and seed projections through existing artifact-
keyed queries, including hidden seed entries. The viewer never performs API fetches
or becomes molecular authority. Extend the typed render input/dependency boundary
to carry resolved seed coordinates and their current source revisions. Do not make
hidden seed projections visible as an implementation side effect.

Use two explicit runtime channels, Fragment and Pocket, rather than the current
single per-entry surface key. Share one worker queue and the release-1 retained/
active allocation budgets across channels and entries. Cancellation, status, cache
bindings and disposal distinguish entry plus channel. No generic layer manager.

Geometry dependencies include the full receptor coordinate/topology/classification
state, seed coordinate/topology state, captured seed references, radius and profile.
Changing current selection, camera or colors never regenerates pocket geometry.
Isolation changes display filtering while preserving context. Color updates reuse
geometry. Keep exact stale-result guards for superseded or disposed dependencies.

Previewing coordinates of either receptor or seed hides obsolete pocket output.
Cancel restores a valid cached result or regenerates the committed state; commit
regenerates using authoritative coordinates. Invalidate dependents even if the
changed seed entry itself is hidden or not otherwise rendered. Preserve D-060–062
camera/cache/measurement safeguards and no redundant normalized GETs for style-only
changes after required inputs are loaded.

Compute the full receptor and crop inside the worker. Account for temporary full
mesh, spatial index, filtering and compact output simultaneously under the active
budget. Transfer/retain the compact patch only; do not keep an unbounded additional
full-receptor mesh cache. Retain saved intent on errors with accurate Cancel/Retry
and fallback state. An empty patch is explained as empty rather than a successful
visible mesh. Project switch, replacement and disposal terminate obsolete work.

### Migration and compatibility

Migration 0013 is provisional after release-1 migration 0012; recheck numbering.
Default null in all documented live/checkpoint/scene/forward/inverse settings paths,
without traversing user metadata. Extend cross-entry reference validation/remapping
at every path; existing per-entry-only appearance validation is insufficient.
Prevalidate all locations before downgrade and refuse any non-null retained pocket
definition. Removing the visible pocket does not erase retained history; explain
pre-upgrade backup restoration where needed.

Keep API/project/archive/normalized majors at 1; new readers accept prior archives
with missing pocket fields. Older readers are unsupported for new pocket-bearing
archives. Preserve original uploaded bytes, normalized scientific artifacts,
conformers, warnings and legacy fragment/visibility settings. Runtime mesh data,
allocation evidence and failures are disposable, not persisted molecular state.

## Milestones and checkpoints

These expand the approved global checkpoints 5–7 into independently verifiable
local steps. Their status is not started. Each checkpoint updates this plan's
exact evidence log and concise PROGRESS, appends material decisions, reviews the
diff and commits only a coherent passing state. No empty milestone commits.

### M1 / C1 — Full-context patch geometry and execution

Outcome: qualified worker patch geometry matches a full receptor reference and
retains correct scientific boundaries, color/pick ownership and bounded execution.
Affected areas: surface input/profile/worker/geometry, explicit runtime channels,
mesh display filtering, dev-only production harness and scientific fixtures.

Acceptance: correct centroid-radius inclusion and compact remapping; unchanged
reference vertices/normals; difference from fragment surfaces at cut residues;
empty/disconnected patches; full-protein H context; correct receptor-owned colors/
picking; safe geometry/display isolation; combined memory and one-worker limits,
cancellation, supersession, per-channel failure isolation and disposal.

Focused validation: frontend common gate from issue #38; new pocket geometry/
runtime Vitest suites; `playwright test tests/e2e/pocket-surfaces.spec.ts tests/e2e/selection-surfaces.spec.ts tests/e2e/surface-capacity.spec.ts`.
Docs: scientific contract/limitations, fixtures and performance measurements.
Migration: none yet. Commit:
`feat(surface): generate context-aware protein patches`.
Rollback: disposable renderer/profile code can be reverted before durable state
lands; never relabel fragment output as a pocket fallback. A dev-only harness is
acceptable for this coherent feasibility checkpoint, not a placeholder user feature.

### M2 / C2 — Reversible pocket definitions and cross-entry dependencies

Outcome: durable pocket commands, migration and all retained/remapped references
are correct without depending on UI rendering success.
Affected areas: schemas/routes/commands, topology lifecycle, scenes/checkpoint,
duplication/archive validation/remapping and migration 0013.

Acceptance: invalid/missing seeds and ineligible receptors reject atomically;
exact no-op/revision behavior; same-entry and cross-entry seeds; hidden entries;
receptor/seed deletion and undo; last-seed clearing; current-context additions;
scene/restart/duplication/archive round trips; all downgrade paths and atomic refusal.

Focused validation: Python common gate from issue #38; `pytest tests/integration/test_pocket_surfaces.py tests/integration/test_selection_visibility.py tests/integration/test_selection_surfaces.py tests/integration/test_archive_roundtrip.py tests/integration/test_migrations.py`.
Docs: API, PROJECT_SCHEMA, ARCHITECTURE and migration/backup notes.
Commit: `feat(surface): persist reversible pocket definitions`.
Rollback: safe downgrade only if every retained pocket is null; otherwise restore
a pre-upgrade backup. No silent cross-reference stripping.

### M2 / C3 — Compact saved pocket workflow

Outcome: complete on-demand Pocket workflow with application-owned inputs,
persistence, coordinate invalidation and truthful runtime behavior.
Affected areas: application projection dependencies, API bindings, Surface overflow/
popover, typed viewer boundary and runtime status routing.

Acceptance: unambiguous default receptor, explicit multiple-receptor choice,
seed capture/Use selection, existing draft retention, radius Apply/Remove, scenes,
coexistence without layer list, hidden seed loading, coordinate previews on either
dependency, no silent retargeting, exact camera/selection, style-only query reuse.
Keyboard/touch, light/dark, mobile/real zoom and empty/error states pass.

Focused validation: frontend common gate; `playwright test tests/e2e/pocket-surfaces.spec.ts tests/e2e/selection-visibility.spec.ts tests/e2e/selection-surfaces.spec.ts tests/e2e/coordinate-editing.spec.ts tests/e2e/measurements.spec.ts tests/e2e/export-archive.spec.ts tests/e2e/rebranding-zoom.spec.ts`.
Docs: SELECTION_STYLING, ACCESSIBILITY, VERIFICATION and concise PROGRESS.
Migration: uses C2. Commit: `feat(selection): add saved pocket surface views`.
Rollback: retain the reader/command semantics or use the safe migration path;
hiding a UI control alone does not remove persisted definitions safely.

### M3 / C4 — Qualified second release and closeout

Outcome: v0.9.0 reviewed, merged, qualified on exact master, tagged and published.
Affected areas: authoritative version sources, release/migration/user notes,
feature/progress evidence and verified remote delivery records.

Acceptance: all pocket and first-release regressions pass, reference geometry is
scientifically correct, resource accounting remains bounded, no unapproved context
or analysis claims, live repository protections/reviews satisfied. Full clean
candidate gate and exact merged gate pass before tag/release.

Commands: complete gate and delivery sequence from issue #38, with fresh isolated
data and current migration head. Commit: `chore(release): prepare v0.9.0`, Refs #36.
Rollback: do not move a published tag; preserve retained state and release any
correction through a new reviewed version.

## Verification matrix and release gates

The new test paths above are planned additions, not executed checks. Prefix focused
Playwright commands with `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec`.
Use the common lint/type/test/build and complete release commands in the
[issue #38 verification section](issue-38-selection-visibility-capacity.md#verification-commands-and-fixture-requirements).
Both feature plans therefore require the same full README/DEVELOPMENT gate, including
frozen installs, fresh migration, Ruff, mypy, all Python/frontend/supervisor tests,
production build and full Playwright matrix. Run it on a clean candidate before
PR/merge and again on the exact merged master commit before tagging.

Required scenarios:

- Compare every retained triangle against the same full-context native reference;
  assert vertex positions/normals/winding and canonical receptor ownership.
- Cut residues/covalent boundaries distinguish patch from fragment geometry;
  crop produces open edges without caps, inferred residue completion or repair.
- Seed ligand inside the receptor entry, ligand in another entry, protein-site
  seed atoms, hidden seeds, mixed/disconnected seeds, no nearby surface and empty
  receptor context; no automatic distance/alignment or replacement-receptor choice.
- Radius endpoints and inclusive boundary; invalid values and references; receptor
  ambiguity, Apply no-op, Remove absent state and stale project/receptor callbacks.
- Atomic Hide, H detail toggles, entry/protein visibility and isolation obey the
  explicit context/display distinction; ordinary fragment behavior remains intact.
- Coordinate edits, preview/cancel/commit and topology changes in both receptor and
  hidden seed entries; deletion/undo/redo, seed pruning and last-seed clearing.
- Scenes, checkpoints/restart, duplication and archive remapping/validation across
  all retained paths; originals, scientific artifacts and warnings remain unchanged.
- Fragment/Pocket coexistence, correct per-channel Cancel/Retry and failure state,
  one worker, combined retained memory, temporary full-mesh accounting, stale output,
  color-only reuse, camera stability and project/disposal cleanup.
- Real WebGL colors/picking, both themes, >=44 px targets, keyboard interaction,
  Pixel 7 layout, actual 100%/200% zoom, no permanent panel clutter or focus trap.

Use the release-1 resource policy and representative real larger proteins without
weakening its gates. Retain 1STP readiness <10 s and surface main-thread tasks
<750 ms on the qualification host, worker cancellation <500 ms, larger targets
within the 120-second calculation deadline. Record actual full-context and cropped
mesh sizes, allocations, RSS/timings and platform limits separately. Do not claim
physical-phone capacity or a universal browser/GPU heap ceiling from emulation.
Scientific or capacity failure blocks the pocket release; it does not retroactively
block or amend the independently shipped first release.

## Branch, version, PR and publication workflow

After issue #38 is released and the user authorizes pocket implementation, verify
clean local state, fast-forward master from origin/master and create
`feat/issue-36-pocket-surfaces`. The approved plan will already exist on that base.
Update its exact implementation base and any arithmetic version/migration collision
adjustments in a documentation checkpoint if needed; do not create an empty plan
commit. Do not rebase/force-push shared branches or implement directly on master.

Target v0.9.0: additive user-visible pocket capability, a nullable persisted setting
and additive revisioned API warrant a minor release, not a patch, major or mandatory
prerelease. Recheck live version/tag/release availability after the dependency ships;
if numbering advanced, choose the next noncolliding minor and record the adjustment.
Update all five authoritative version sources listed in issue #38, the current
archive producer assertions and compatibility matrix. Never rewrite historical
release evidence just to replace its version string.

PR title: `feat(surface): add selection-centered protein pocket views`.
Body includes `Closes #36`, implemented scientific/interaction contract, milestones,
D-065–066 and relevant earlier decisions, deferred/rejected requirements and reasons,
migration/reference/rollback compatibility, exact tests/performance/limitations and
existing #20/#21 separation. No automatic pocket-detection or quantitative claims.

Fetch/incorporate the latest base safely and review the full diff. Request
`@codex review` when available; if unavailable, document local implementing-agent
review without independence claims. Address consequential findings, resolve threads
and rerun affected checks. Required human approval or failing protections/checks
are blockers, never bypasses.

Use a normal merge preserving checkpoints. Verify the merge on origin/master;
switch and fast-forward master, run the complete exact-merged gate, create and push
an annotated v0.9.0 tag on that exact commit, and publish the GitHub release plus
verification attachment. Notes cover highlights/fixes, scientific patch definition,
excluded context/analysis, migrations/rollback/archive compatibility, qualification
and known limits. Verify remote tag target, release and asset, then post and verify
the #36 closeout; only then delete remote/local feature branches and leave clean
synchronized master. Never move a published tag for evidence bookkeeping.

## Decisions, deviations, progress and completion log

- 2026-09-14: user selected seed-centered pocket views, protein-only context and
  one saved pocket per receptor, and approved separate v0.8.0 then v0.9.0 delivery.
- 2026-09-14: detailed contract persisted alongside #38 on its docs-first feature
  branch. The future pocket implementation branch has not been created.
- Cross-project decisions: D-065–066, approved/not implemented; D-063–064 describe
  the independent first-release dependency.
- M1/C1, M2/C2–C3, M3/C4: **not started**. No pocket implementation, migration,
  tests, version bump, PR, merge or release has been performed under this plan.
- Known scientific limits: centroid-cropped full-protein molecular surface,
  supplied hydrogens, excluded nonprotein context, open triangle boundary, no
  automatic pocket discovery, alignment, preparation, metrics or binding inference.
- Blocker/dependency: issue #38 must be released before this implementation branch
  is created; implementation also awaits the user's explicit start instruction.
- Next action now: **wait**. Do not start either release from plan-persistence approval.

During implementation append checkpoint date/commit, concrete outcome, exact
commands/results, scientific/reference evidence, migration/compatibility outcomes,
material decisions/deviations, remaining limitations and next action. Complete
only after the PR, exact merged gate, annotated tag, release/asset, issue reply and
branch cleanup are verified. Final publication hashes may be recorded in an
immutable release verification attachment linked here when known after merge.

Plan-persistence validation (2026-09-14): local Markdown document links and code
fences checked; staged whitespace checks pass. Only the two feature plans and
project decision/progress documents are changed. No implementation qualification
is claimed, and the pocket implementation branch remains uncreated.

### 2026-09-14 — Implementation started after verified dependency release

The user's sequential `/goal` supersedes the historical persistence-only stop.
Issue #38 is fully delivered: PR #39 merged as
`ce3e4f761133caeff1ee76a827379f790fcad7cf`, exact merged gate passed, annotated
v0.8.0 tag object `bb4e053205592f540d240e92052252637ef4ca87` and release verified,
verification attachment downloaded byte-for-byte, and issue closeout
[5671366694](https://github.com/ManuelSe/Neistra/issues/38#issuecomment-5671366694)
verified. Its local/remote feature branches were then deleted.

Fetched/fast-forwarded clean master and created `feat/issue-36-pocket-surfaces`
from that exact released commit. Re-read repository authority, approved contract,
verification and affected viewer/API/archive boundaries before changing code.
Start with C1 full-context geometry, explicit channels and native qualification;
no durable pocket command or user-facing Pocket control exists yet.

### 2026-09-15 — M1/C1 complete: full-context geometry and execution

Implemented pocket-v1 crop input, radius-cell seed indexing, inclusive centroid
inclusion and compact remapping of unchanged native vertices/normals/winding/owner
groups. Empty and disconnected outputs are valid. Display isolation filters only
indices, preserving full protein context. Atom/H detail does not reshape context.
Two explicit Fragment/Pocket channels share one queue and combined retention;
Pocket cancellation/failure never substitutes fragment or full-receptor lines.
The dev-only production harness exercises typed resolved pocket inputs; no saved
pocket API or user-facing Pocket creation control is claimed at this checkpoint.

D-068 records channel identity, profile mismatch protection, seed-buffer admission,
full/compact/index allocation and isolation reservation. The shared surface provider
preserves receptor-owned colors/picks; changing carbon colors reuses geometry.
Existing fragment requests and their native qualification continue to pass.

Commands:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
MOLWEAVE_E2E_API_PORT=8110 MOLWEAVE_E2E_WORKER_PORT=8111 \
MOLWEAVE_E2E_WEB_PORT=5273 MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-36-c1-final \
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/pocket-surfaces.spec.ts tests/e2e/selection-surfaces.spec.ts \
  tests/e2e/surface-capacity.spec.ts
```

Results: lint/typecheck/build pass; **113 frontend tests in 29 files** pass;
**21 browser tests / 1 intentional layout skip (5.7 minutes)** pass with no failures.
Geometry unit tests use an independent brute-force cutoff and exact retained
triangle data; exercise radius endpoints, inclusive/just-outside boundaries, empty,
disconnected, fragment differences, ownership/isolation and active-memory refusal.
Runtime tests cover same-entry channels, cancellation/stale work, combined retention
and hidden-owner recovery. Native browser tests cover supplied protein H, exact
reference geometry, actual colors/picks, color reuse, camera, hide/show, isolation,
coexistence, empty output, Pocket cancellation/retry and all prior capacity cases.

1STP protein context: 901 of 1,001 entry atoms; ready 936.4/623.0 ms desktop/mobile.
Supplied-H fixture: four protein atoms including two supplied H, still contributing
when H detail is hidden. 1AON: all 58,674 protein atoms from the 58,870-atom entry;
196 separately classified nonprotein atoms are excluded. Ready 13.164/13.064 s;
full output 220,336,136 bytes becomes a 296,364-byte patch. All working bounds fit
2 GiB; largest observed surface task is 398 ms. Native cancellation takes 2.5–3.9 ms.
Detailed full/compact sizes, RSS (including independent reference/lifecycle work),
timings and captures are retained under `docs/assets/pocket-surfaces/c1-*` and in
PERFORMANCE. Qualification is emulation/host-specific, not a physical-phone claim.

Initial native run: 20 passed, one intentional skip, one desktop picking-test
failure. A fixed canvas grid missed the small visible 1AON patch; all its geometry/
allocation assertions and mobile picking had passed. The test now locates interior
rendered pixels and performs real mouse clicks/native picks, without synthetic loci
or weaker ownership assertions. The full corrected native run passes.

Local implementing-agent review checked scientific parameters/context, cutoff and
compaction, source-buffer lifetime, profile/channel identity, stale bindings,
retention and isolation accounting, truthful empty/failure states and compatibility.
Resource messages were made context-neutral after review: shrinking a displayed
pocket radius cannot solve full-receptor allocation. This final text-only adjustment
was followed by all frontend common gates (113 tests); native geometry/behavior is
unchanged from the full browser qualification. No unresolved consequential finding
remains. This is not an independent review. `git diff --check` passes.

Updated scientific limitations, fixtures, performance, progress and the #38 final
publication record. No migration/version change in C1; rollback remains disposable
renderer code. Commit: `feat(surface): generate context-aware protein patches`
(Refs #36). Next: C2 durable definitions and cross-entry reference lifecycle.

### 2026-09-15 — M2/C2 complete: reversible pocket definitions

Added the strict nullable pocket-v1 schema, revisioned Apply/Remove command,
normalized protein eligibility validation and ordinary viewer-settings guard.
Exact no-ops do not add revision/history. Cross-entry seeds remain valid while
hidden. Topology and entry deletion prune every affected owner and scene in the
originating command; undo/redo restore definitions exactly. Self-seeds remap on
receptor duplication; new protein atoms change current context without becoming
captured seeds. Validation indexes each referenced entry once.

Migration 0013 defaults null at all 17 documented retained path cases and refuses
any non-null state before writes on downgrade. Existing migration paths and user
metadata remain intact. D-069 clarifies the plan's archive/history wording through
D-035: portable archives contain current entries/scenes, with a newly derived
remapped checkpoint; command history remains database-local. Every exported
definition is validated/remapped, including a saved scene with no live pocket.
No archive-history schema extension or silent historical-reference stripping.

Validation commands/results:

```bash
MOLWEAVE_DATA_DIR=/tmp/neistra-36-c2-migration .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
git diff --check
```

Fresh upgrade reaches 0013; Ruff passes; mypy passes all 54 source files;
**365 Python tests pass in 57.90 s**, including 29 new pocket tests and the
retained-path migration matrix. The existing 237 Alembic configuration deprecation
warnings are unchanged infrastructure warnings, not failures. Tests cover strict
radii/references/profile, invalid atomicity, revision conflicts, no-ops, independent
styles/channels, hidden seeds, partial/last-seed deletion, scene restoration,
receptor duplication/deletion, topology additions, checkpoint/restart recovery,
legacy and remapped archives, invalid live/scene archive references, original bytes,
normalized structures, warnings and unresolved conformers.

Initial test setup used a protein type label for a mixed protein-containing fixture,
the wrong visibility route and a 200 scene-create expectation; corrected to actual
repository APIs/classification (201 creation). Exact scene comparisons exclude the
intentionally updated modification timestamp while checking all retained content.
No production behavior was weakened to satisfy those setup assertions.

Local implementing-agent review checked command atomicity, inverse ordering,
all-owner pruning, generic-PUT compatibility, canonical remapping and migration
prevalidation. No unresolved consequential finding. This is not independent review.
Updated API, PROJECT_SCHEMA, ARCHITECTURE and DEVELOPMENT migration/backup notes.
No version change yet. Commit: `feat(surface): persist reversible pocket definitions`
(Refs #36). Next: C3 application-owned projection dependencies and compact workflow.
