# Issue #140 — Correct representations, improve surfaces, and preserve the shared camera

## 1. Status, authority, and approved direction

**Status:** approved contract; C0–C5 complete; C6 first candidate qualified and merged; C7 corrective qualification in progress.
The subsequent `/goal` authorizes C1–C7 implementation and delivery.
Approval: the user's “Implement the plan.” on 2026-11-13, following review and
the explicit choices recorded below. Approval authorizes C0 only, not application
implementation. Stop ready for `/goal` after committing and pushing this plan.

- Issue: [#140](https://github.com/ManuelSe/Neistra/issues/140).
- Plan: `docs/plans/issue-140-representation-surfaces-session-camera.md`.
- Base: `master` / `origin/master` at `a1f2e2fd92d19e4a85b3237b41f2d552eff3a0d9`.
- Branch: `feat/issue-140-representation-surfaces-session-camera`.
- Planned release: stable **0.30.0**, subject to a fresh collision check.
- Decisions: D-154 and D-155 in `docs/DECISIONS.md`.

The user's subsequent corrections supersede the issue's per-molecule camera
suggestions:

1. Representations remain persistent properties of each entry.
2. **One camera belongs to the entire application**, across molecules and projects.
3. Switching entries/projects, importing, changing representations, and rebuilding
   surfaces must preserve that camera.
4. Reopening restores the installation's last camera automatically.
5. A brand-new installation may fit its first drawable content once, provided no
   camera has been saved or adjusted.
6. Remembered cameras remain installation-local and do not enter project archives.
7. Surface appearance changes apply immediately with Undo.
8. This is a focused release; new polymer visibility and local opacity/theme
   controls move to one linked follow-up.

Authority follows: explicit user guidance/corrections; AGENTS and accepted
decisions; architecture, product boundaries, schemas and conventions; issue
problems/outcomes/constraints/non-goals; then non-binding technical suggestions.
Do not replace the global `docs/PLAN.md` or silently rewrite historical decisions.

Planning inspected required product/global-plan/progress/decision/verification
documents; architecture, schemas, API, migrations, jobs and frontend ownership;
viewer/native providers, selection/surface/camera lifecycles and tests; related
issues #64/#107; local/remote branches, tags/releases, PR conventions, workflow and
protection configuration, five version sources and release recipes/readers.
Seven specialist planning assessments informed this proposal. Their earlier audit
found defects in the current implementation; it does not qualify future code.
Reference research remains in conversation; this document uses neutral terminology.

## 2. Requirement disposition

| Requirement | Disposition | Treatment |
| --- | --- | --- |
| Correct thin/thick sticks | Essential | Uniform tube/cap sizing; retain distinct ball-and-stick. |
| Correct whole-entry surface context | Essential | Combined calculation across included units using the bounded worker path. |
| Preserve Redo on unchanged styling | Essential | Suppress complete no-op commands. |
| Truthful surface readiness and visibility | Essential | Separate calculation success from installed/displayed geometry. |
| Clear stale pocket success feedback | Essential | Associate feedback with the submitted definition. |
| Persistent entry representations | Already satisfied, with regression protection | Keep authoritative settings; fix lifecycle regressions exposed by tests. |
| Shared camera across molecules and projects | Essential | One App-owned camera with automatic persistence. |
| Per-entry camera bookmarks/view selectors | Rejected as proposed | Contradicted by explicit user correction; no follow-up. |
| Automatic camera data in archives | Rejected as proposed | Installation-only preference; named scenes remain portable. |
| One initial fit on a pristine installation | Supporting | Globally claimed once; cancelled by user navigation. |
| Effective inherited/explicit/mixed/hidden styling state | Supporting | Derived summary without new persisted styling fields. |
| Independently scoped representation resets | Supporting | Add atomic/polymer reset scope; preserve all-channel reset. |
| Independent polymer hiding | Deferred | New durable visibility contract; include in one styling follow-up. |
| Local opacity/themes and inheritance | Deferred | Same follow-up; retain documented current defaults here. |
| Explicit complete-residue expansion | Supporting | Reuse central selection expansion; show scope before acceptance. |
| Backbone trace label | Supporting | Clarify existing representation; stored identifier unchanged. |
| New backbone-atom/ribbon/tube families | Optional, deferred | Separate scientific/product justification; no speculative issue now. |
| Unified three-source surface creation | Essential | Shared chooser for selected atoms, protein-context patch and whole entry. |
| Reveal/activate newly created surfaces | Essential | Identify exact results without changing molecular selection or camera. |
| Bounded manager with persistent header | Essential | Compact list and separate details. |
| Immediate appearance with Undo | Essential | One command per completed gesture. |
| Explicit source-edit lifecycle | Supporting | Captured drafts, Apply/Revert, stale-target validation. |
| Select pocket seeds versus protein context | Supporting | Separate accurately named actions. |
| Select displayed patch atoms | Deferred | Additional ownership semantics unnecessary here; no follow-up now. |
| Duplicate, bulk visibility, show-only, filtering, presets | Optional, deferred | Useful extensions, not prerequisites; no speculative issues. |
| Avoid unrelated rebuilds for surface edits | Supporting | Narrow reconciliation, retaining conservative full rebuild. |
| Shared receptor mesh across pockets | Deferred | Additional retained-memory tradeoff; measure separately if needed. |
| Additional surface families, quality selectors, property calculations, area/export | Deferred | Separate scientific contracts; charge coloring remains #64. |
| Existing identities, originals, scenes, history, archives and resource controls | Already satisfied, with required extension/regression checks | Preserve foundations; extend bounded calculation to entry surfaces. |
| New server last-project navigation model | Rejected as unnecessary | Browser active-project preference remains. |
| Complete validation and seven-role final assessment | Essential | Required before completion or readiness to push implementation. |

At delivery create **one follow-up issue** for independent polymer visibility and
local appearance controls. Link existing #64 and preserve picking protections in
#107. Do not create issues for every optional capability.

## 3. Implementation contract

### Representation correctness and selection controls

Use the existing native ball-and-stick provider for sticks, with an explicit
**uniform size theme of 1**, `sizeAspectRatio: 1`, and existing size factors
**0.22** and **0.36**. Spheres become matching-radius joints/caps and isolated-atom
markers. Ordinary ball-and-stick and space filling retain physical-size themes.
These stick values are presentation defaults, not physical atomic radii.

Preserve native multiple/aromatic-bond notation, exact canonical endpoints,
hydrogen preferences and coloring. Multiple-bond subsidiary cylinders retain
native reduced-radius/spaced drawing. Display changes must not infer chemistry.

Compare complete before/after settings, including hidden atoms, before recording
selection commands. Complete no-ops preserve revision, dirty state, history and
Redo. Genuine restoration of hidden atoms remains a command; mixed changed and
unchanged entries remain one atomic operation.

Extend reset requests with optional `channel: atomic | polymer | all`, defaulting
to existing all-channel behavior. Atomic reset clears the target's atomic
assignment and atomic hiding; polymer reset affects only polymer assignments.
Applying a style still derives its channel from the style. No stored-schema
change is required.

Show effective inherited/explicit/mixed/hidden state. Label the existing mode
**Backbone trace**. Offer explicit residue expansion for partial supported-residue
selections; do not expand automatically or change molecular state.

### Combined, bounded surfaces

Route whole-entry surfaces through the existing combined worker calculation.
Remove the old unit-based entry visuals so surfaces cannot render twice.

Retain the fixed scientific definition: physical atomic radii, probe **1.4 Å**,
grid **0.5 Å**, **36** probe positions, and no implicit repair, cavity filling or
undeclared surrounding context.

Add an internal source-kind discriminator, validated before extraction and again
inside the worker:

- Fragment/pocket: at most **100,000 effective atoms**.
- Entry: fewer than **250,000 effective atoms**.
- Preserve the normalized-parent-count **≥250,000** reduced-detail rule before
  extraction, even when filters leave a small effective subset.

These are admission ceilings, not universal capacity promises. Retain **64 million
cells, 512 MiB mesh, 1 GiB retained output/display buffers, 2 GiB accounted working
buffers, 120-second deadline**, and one serial worker. Never silently coarsen
resolution. Refusal preserves the definition with an explanation; entry/fragment
fallback uses exact-membership lines, while pockets retain no-lines behavior.
Entry objects gain object-specific terminating cancellation/retry.

Calculate in canonical atom order and validate mapping into disposable component
serial order for coloring, picking and overpaint. Account remapping buffers.
Equal atom counts alone do not establish identity. Keep calculation geometry
immutable; display mapping must not corrupt cached ownership or wireframe groups.

Retain fragment cut-face and complete-protein pocket semantics. Source changes
invalidate only their dependencies; camera, selection, names and appearance do
not enter scientific geometry keys. Keep immutable lazy calculation snapshots.

Emit Ready only after the current representation installs successfully. Derived
display status explains isolation, component filters, hidden parents/objects,
zero opacity, preview suspension and empty crops. Retire obsolete bindings and
reject late calculation/upload results.

### Surface workflow and incremental updates

Use one chooser from Style, Display and Surfaces:

- **Selected atoms:** one independently owned fragment per affected entry,
  created atomically.
- **Around selection:** existing protein-context pocket with explicit owner,
  captured seeds and radius.
- **Whole entry:** explicit entry owner.

Keep scientific source distinctions visible. Creation returns frontend identities
derived from the successful project response; reveal all created rows, activate
the first in request order, and announce the count. Preserve selection and camera.

The nonmodal manager has a persistent Create/Close header, compact independently
scrollable rows, and separate details. Rows expose name, kind, visibility and
status with a non-color active indicator.

Appearance uses transient viewer preview and existing durable commands:

- Theme, inheritance and solid/mesh choices commit once.
- Opacity/color gestures preview locally and commit once when completed.
- Escape/pointer cancellation restores confirmed appearance without history.
- Serialize mutations; no unbounded slider queue or merging of distinct completed
  Undo steps. Capture project/object identity before asynchronous work.
- Ambiguous responses trigger fresh reads, never blind replay or an unfounded
  claim that the old value was restored.
- Preserve control focus and use quiet saving/error feedback.

Source drafts remain manager-local, keyed by object identity, and survive row
changes and manager reopening while that project remains open. Provide
**Apply source** and **Revert**, with an unapplied-change indicator. Project
switching discards transient source drafts with a concise notice. Captured seeds
never follow later selection implicitly; invalidated identities require explicit
recapture. Rename remains explicit Save/Cancel.

Add **Select seeds** and **Select protein context** for pockets; preserve accurate
entry/fragment source selection.

Introduce a narrow surface-only reconciliation path:

- Names/status/activation: no molecular reload or field calculation.
- Appearance: update only the affected representation/overpaint.
- Solid/mesh: rebuild only that visual from retained geometry.
- Hide/remove: retire only that object's resources.
- Other molecular/display changes retain conservative full rebuild, preserving
  the shared camera.

No general scene-diff framework or shared receptor-mesh cache is included.

### One persistent application camera

Add a singleton installation presentation record through migration **0015**, after
verifying that revision remains available. `WorkspacePresentationV1` contains
schema version, independent revision, nullable saved camera and update timestamp.

Add `GET`/`PUT /api/v1/workspace/presentation`. PUT uses its own expected revision.
Camera writes must not alter project revisions, dirty state, entry timestamps,
checkpoints, history or Redo. Identical writes are no-ops.

Use a separate typed session-camera value containing mode, position, target, up,
radius and FOV. Zoom derives from these values and viewport; do not store a second
zoom scalar or unrestricted renderer snapshot. Validate finite, nondegenerate
values. Existing named-scene wire formats remain unchanged.

Replace project-reset camera ownership with one App-owned session controller:

- Hydrate once; buffer the latest camera through lazy viewer creation/remount.
- Capture immediately in memory; persist after **250 ms quiet time**, with a
  **2-second maximum interval** during continuous navigation.
- Keep one in-flight write and latest unsent camera.
- Maintain a small validated same-browser recovery mirror; flush synchronously
  on page hiding and attempt a keepalive server save.
- Recover a dirty mirror automatically only when its base presentation revision
  matches the server. Conflicts preserve the live pose and offer explicit
  **Save current view**.
- Late hydration, save acknowledgements, surface completion and initial-fit
  callbacks never overwrite newer user navigation.
- Failed saves leave navigation working with concise unsaved/retry feedback.

Claim the one initial-fit opportunity only after hydration establishes that no
saved or locally adjusted camera exists. Claim it before asynchronous scene
installation; user navigation cancels it. Never fit automatically again on
molecule/project changes, imports, new molecules, visibility changes or
empty/repopulated scenes.

Explicit Fit, Focus, Reset, projection changes and named-scene application remain
effective and become the remembered camera. Ordinary renderer/preview rebuilds
preserve the latest camera. Derive safe native clipping bounds without using
scene changes to overwrite orientation, target or zoom.

Automatic presentation data stays outside project/viewer/archive schema 2.
Downgrade removes only this installation preference; retaining it requires the
backup. Browser-close recovery cannot guarantee persistence through simultaneous
storage, network and power failure; failures must be surfaced honestly. The
existing browser active-project pointer remains; no server navigation model is
introduced.

## 4. Milestones and checkpoints

Each checkpoint updates this progress log with actual evidence, a concise project
progress entry, limitations, blockers and next action. Documentation distinguishes
checkpoint evidence from release qualification.

| Checkpoint | Outcome and affected areas | Acceptance and focused validation | Commit, documentation and compatibility |
| --- | --- | --- | --- |
| **C0 — Approved planning persistence** | Contract, decision entries and project summary only. | Clean base, branch/tag collision checks, neutral terminology, valid links and `git diff --check`. | `docs(plan): add approved plan for issue 140`. No runtime/version changes. Stop for `/goal`. |
| **C1 — Correct atomic styling and history** | Viewer profiles, selection command algebra/API, effective-state summary, scoped resets and residue recovery. | Independent tube/cap geometry, isolated/mixed elements, multiple/aromatic bonds, no-op Redo, exact reset/expansion. Representation/canonical-bond/selection-style tests, viewer-state integration, styling native workflows and frontend gate. | `fix(viewer): correct stick profiles and selection styling history`. Update display/API guidance. No migration/stored-field change; reversible code change. |
| **C2 — Correct combined surface calculations** | Worker protocol/admission, canonical/display mapping, all-kind lifecycle and truthful status. | Partition/interface oracles, source equivalence, solid/mesh ownership/picking, cancellation/deadline/allocation boundaries, held-upload readiness and isolation. Geometry/runtime/worker/allocation suites; surface integration; selection/pocket/entry/capacity native workflows. | `fix(surface): calculate entry surfaces with complete context`. Document profile, eligibility and fallback. Definitions unchanged; geometry intentionally corrected. |
| **C3 — Cohesive surface editing** | Shared chooser, list/details manager, result activation, appearance gestures, source drafts and narrow reconciliation. | Sixteen-object navigation; one Undo/completed gesture, none/cancelled gesture; stale-target/failure/switching recovery; zero unrelated reloads/fields for surface appearance. Manager/editor/component and native surface/styling/accessibility suites. | `feat(surface): unify creation and immediate appearance editing`. User guidance and measured work evidence. No new surface schema; broad rebuild remains recovery. |
| **C4 — Durable shared camera** | Singleton migration/API, session controller, lazy buffering and lifecycle. | A→B→A/project switching one pose; reload/fresh browser/app restart; late hydration, first-fit cancellation, empty scene, explicit navigation/scenes, save failure/conflict, history independence. New presentation integration/controller/native suites, migrations, adapter and scene regressions. | `feat(viewer): persist the shared application camera`. Ownership/API/schema/upgrade guidance. Downgrade drops only automatic camera preference. |
| **C5 — Integrated qualification** | Scientific identity, lifecycle, compatibility, accessibility and resources. | Originals/artifact hashes, styles/scenes/history/archive round trips, actual 0.29.0 readers, entry >100k, existing capacity profiles, 320px/200% zoom, both themes/layouts and disposal. | `test(viewer): qualify styling surfaces and session restoration`. Results and limitations; consequential findings fixed before release preparation. |
| **C6 — Release candidate** | Five versions, notes, complete candidate gate and final review. | Clean committed candidate, full gate/readers, primary full-diff review, all seven final specialist verdicts PASS/justified NOT_APPLICABLE on same final candidate. | `chore(release): prepare v0.30.0`, plus meaningful evidence/correction commits. No empty milestones. |
| **C7 — Delivery** | Normal merge, exact-master qualification, tag/release, issue reply and cleanup. | Exact merged gate; remote publication/download verification; linked follow-up and scope disposition. Requires subsequent execution/delivery authorization. | Meaningful `docs(release): ...` receipts through normal integration; runtime tag never retargeted. |

The common frontend gate after each application checkpoint is lint, typecheck,
frontend tests and production build. Run Python lint/types/tests when backend
boundaries change. Applicable checks must pass before proceeding.

### Focused commands

Extend existing tests and add dedicated presentation and combined-entry suites.
Planned new test names below are implementation deliverables, not existing evidence.

```bash
corepack pnpm --dir apps/web exec vitest run src/test/representations.test.ts src/test/canonical-bonds.test.ts src/test/selection-style-dialog.test.tsx
.venv/bin/uv run pytest tests/integration/test_viewer_state.py
corepack pnpm --dir apps/web exec vitest run src/test/selection-surface-geometry.test.ts src/test/pocket-surface-geometry.test.ts src/test/selection-surface-runtime.test.ts src/test/selection-surface-worker.test.ts src/test/selection-surface-allocation.test.ts src/test/surface-objects.test.ts
.venv/bin/uv run pytest tests/integration/test_surface_objects.py tests/integration/test_selection_surfaces.py tests/integration/test_pocket_surfaces.py
corepack pnpm --dir apps/web exec vitest run src/test/surface-manager.test.tsx src/test/surface-editor.test.tsx src/test/viewer-adapter.test.ts
.venv/bin/uv run pytest tests/integration/test_workspace_presentation.py tests/integration/test_migrations.py
corepack pnpm --dir apps/web exec vitest run src/test/workspace-presentation.test.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-styling.spec.ts tests/e2e/selection-surfaces.spec.ts tests/e2e/pocket-surfaces.spec.ts tests/e2e/surface-objects.spec.ts tests/e2e/surface-capacity.spec.ts tests/e2e/entry-surfaces.spec.ts tests/e2e/workspace-presentation.spec.ts
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```

Run the appropriate subset at each checkpoint, then integrated coverage. C5 also
runs archive, movement/preview, scene and original-preservation regressions.

## 5. Verification and blocking criteria

Important independent cases:

- Equal C–C/C–O tube/cap radii; isolated atoms and known bond multiplicities.
- Contacting units, buried interfaces, reordered/sparse canonical IDs and correct
  colors/picks; deterministic mapping and fixed-profile source equivalence.
- Admission at 100,000/100,001 and 249,999/250,000; parent threshold remains active
  with a tiny visible subset.
- Grid admission at/above 64 million cells; wide thin boxes never silently coarsen.
- At least one real rendered entry above 100,000 atoms; high-count admission alone
  does not qualify rendering capacity.
- Appearance while calculation/upload is pending, followed by Undo, hide/remove
  or project switch.
- Same camera across ordinary actions; preserve FOV/orientation/framing at the
  same viewport. Empty scenes and responsive remounts must not reset it.
- Real restart, same-browser immediate-close recovery, and acknowledged server
  state in a fresh browser context.
- Camera persistence leaves molecular revisions, dirty state, timestamps and
  Redo unchanged.

Run the complete gate on a clean committed candidate and exact merged master:

```bash
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
git diff --check
```

Use a feature-specific explicit recipe with disposable stores/ports and cleared
inherited datastore aliases. Adapt established release tooling under feature
evidence assets; retain source/log hashes, native identities, failed attempts and
exact exclusions.

Also qualify empty-store upgrade/downgrade/re-upgrade; populated
0014→0015→0014 preservation of project/history/artifact data; actual tagged
**0.29.0 ↔ 0.30.0** archive readers in separate processes and both suffixes;
camera exclusion from archives and portable scenes; locked dependencies,
historical migrations, production bundle, version/schema/license audits.

Preserve D-148: portable correctness, work/resource bounds and production deadlines
are mandatory. Strict timing remains separate reference-host qualification. Do not
relax budgets or claim microbenchmarks as application latency gains.

Block merge/release for unresolved consequential findings, missing specialist
assessments, failed applicable checks/readers, identity/color/picking errors, lost
Redo, unrequested camera motion, stale publication, silent quality/capacity
reductions, unapproved schema/dependency expansion, version disagreement, or unmet
remote reviews/checks/conversations. Capacity failure requires correction or an
explicit product decision, never a weakened test.

## 6. Compatibility, release, and planning handoff

### Version and release

The repository has established stable tags/releases. Latest verified release is
**v0.29.0**; the planning prompt's contrary assumption was outdated.

Use **minor 0.30.0**: fixes alone could be a patch, but durable application-camera
restoration, an additive API/migration and the consolidated editing workflow add
user-visible functionality. Project/viewer/archive stay schema 2;
normalized/selection/component stay schema 1. No incompatible portable-format
change, experimental-only release or dependency upgrade is planned.

Update all five authoritative sources during C6:

1. `pyproject.toml`.
2. Root `neistra-dev` package version in `uv.lock`.
3. `apps/web/package.json`.
4. API application version in `apps/api/src/neistra_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/neistra_api/archive_service.py`.

Proposed annotated tag: **v0.30.0**, only from the qualified merged runtime.
Recheck availability before preparation. Release-note sections: corrected
representations; combined surfaces/limits; surface workflow; shared camera;
compatibility/upgrade/rollback; deferred scope; verification.

### PR, closure and cleanup

- PR title: `feat(viewer): correct representations and surfaces and preserve the shared camera`.
- Normal merge commit preserves coherent checkpoint commits.
- The subsequent explicit `/goal` requires **Closes #140** in the PR, superseding
  the original Refs/late-close instruction. Normal merge may close the issue;
  exact-master qualification, publication and final issue reply remain mandatory.
- PR/final reply distinguish implemented, simplified, deferred and rejected work,
  including the user's global-camera correction.
- Create the single approved styling follow-up before closing #140; link #64/#107
  as relevant. No speculative issue proliferation.
- Verify tag target, release, notes, qualification asset download/checksums and
  issue response remotely.
- Integrate later documentation receipts normally without moving the runtime tag.
- Delete only the feature branch after delivery, remote readback and clean-tree
  verification. Preserve unrelated branches.

Inspection found no Actions workflows or active master protection/rulesets.
Recheck before merge; this does not waive subsequently configured gates or replace
required human reviews with specialist agent assessments.

### Approval and persistence-only handoff

Approval authorizes **C0 only**, not implementation:

1. Confirm clean tree; fetch and fast-forward master from origin/master using
   fast-forward-only operations.
2. Recheck base/branch/release collisions; stop on divergence or consequential
   intervening changes.
3. Create the planned feature branch.
4. Write the approved feature plan first, including dispositions and progress log.
5. Append accepted decisions and concise planning progress; preserve history.
6. Commit **docs(plan): add approved plan for issue 140**.
7. Push if available and verify exact remote branch/commit.
8. Report path, branch, commit, checkpoints and minor-release impact.
9. **Stop ready for /goal.**

## 7. Progress and completion log

### C0 — 2026-11-13: approved planning persistence

The user approved this contract through “Implement the plan.” The explicit
handoff limits this turn to C0. Clean master was fetched and fast-forwarded;
origin/master remained `a1f2e2fd92d19e4a85b3237b41f2d552eff3a0d9`. Stable latest
release is v0.29.0. No remote planned-branch or v0.30.0 tag collision was found.
The dedicated branch was created before this plan was the first file change.

Baseline audit evidence: 41 focused frontend tests, 68 API integration tests,
additional overlapping specialist checks, five passing native workflows and one
intentional desktop exclusion for a mobile-only case, plus independent geometry
and history probes. These establish existing defects/behavior, not future
implementation qualification. Seven planning assessments informed the contract;
all seven final implementation assessments remain required on future code.

C0 writes only this plan, D-154/D-155 and project-level progress. Documentation
validation, commit and exact remote readback are the C0 delivery checks; their
commit/push receipt is reported in the final handoff. No runtime, dependency,
version, migration, API or stored-schema implementation is introduced. Current
application versions remain 0.29.0 and migration head remains 0014.

Known limitations: all audited defects remain until implementation. The planned
combined-entry capacity and session-camera behavior are unqualified. No PR,
application fix, future release gate, follow-up issue, merge, tag or release is
claimed. Blockers: none for the planning handoff. Next action: **/goal** for C1–C7.

### C1 — Implementation authorization and qualification in progress

The subsequent user `/goal` authorizes the full contract and explicitly requires
Closes #140 in the PR. C0 commit `3d94394a425855540898a828edc10b10347ddf70`
was verified on the remote planned branch with a clean tree before implementation.

Implemented C1 changes: uniform stick sizing/native forwarding, complete no-op
suppression, scoped atomic/polymer reset, effective display-intent summaries,
Backbone trace label and explicit complete-residue recovery. Backend integration
regressions cover Redo, exact no-op state, hidden-detail restoration, scoped Undo
and mixed changed/unchanged entries. Initial no-op comparisons exposed existing
SQLite timezone serialization differences; compare equal fresh read projections
without weakening unchanged-state assertions. No application timezone policy
change is introduced.

Qualification is in progress. Initial backend gate: 27 Python cases pass, Ruff
passes and mypy passes 201 sources. Initial frontend integrated gate: lint/types,
509 tests and production build pass (existing large renderer chunk warning).
Native styling/recovery and expanded C–C/C–O geometry evidence are pending.
These are checkpoint checks, not release qualification or all-seven final review.

The final native geometry correction adds explicit C–C/C–N/C–O cases for both
styles at absolute radius error ≤1e-6 Å. Scientific checkpoint reassessment
independently passes 30 focused cases; architecture checkpoint review passes
the current contract/history boundaries. The subsequent full frontend gate
passes 520 tests, lint/types and build. Backend final C1 gate passes 27 tests,
full Ruff and mypy (201 sources). Existing styling native invocation passes three
applicable cases with three established layout exclusions.

The first expanded appearance/recovery invocation records seven passes, two
existing exclusions and one failure: additional channel-summary rows repositioned
the palette over the viewer-controls Close button. The unchanged interaction
test exposed pointer interception. Retain `/tmp/neistra140-c1-recovery` trace and
failure screenshot; do not force the click, weaken the assertion or count that
invocation as passing. A compact legend layout correction and fresh native
qualification are required before the C1 commit.

#### C1 passing checkpoint

The compact channel legends and minimum clearance below the sibling viewer
launcher correct the overlap; the unchanged failed case passes in 31.7 seconds.
The fresh complete affected native invocation passes **11 cases / 5 established
layout exclusions**, zero failures or retries. Exact commands/environment, source
hashes, native log, fixture screenshots and the separate failed trace are retained
in [C1 evidence](../assets/representation-surfaces-session-camera/c1-checkpoint.json).
Desktop/mobile fixture screenshots were inspected. A semantic span correction
inside legends additionally passes 20 focused UI cases, scoped lint and types;
the complete 520-test frontend gate and production build pass. Backend 27 tests,
full Ruff/mypy and diff checks pass. No schema, migration, dependency or version
change. Scientific and architecture checkpoint findings are resolved; these do
not replace all-seven final feature review. The primary reviewed the complete C1
diff including new files, no-op/scoped-reset compatibility and scientific tests.

Next: C2 combined-context surfaces and bounded worker lifecycle. No C2 application
work, release qualification, PR or push-readiness claim is included in C1.


### C2 — Combined surface calculation complete (2026-11-14)

All source kinds now share the combined worker path. Entry eligibility remains
<250,000 effective atoms with normalized-parent ≥250,000 fallback before input
extraction; fragment/pocket limits and all resource budgets remain fixed. Input
and cached ownership use canonical IDs, with independently validated/accounted
native display remapping. Obsolete/cancelled uploads cannot become Ready; entry
objects gain terminating Cancel/Retry. Definitions, originals, project/viewer/
archive schemas, migration head and application versions remain unchanged.

Verification: **540 frontend tests / 75 files**, lint/types/build; **57 backend
surface integration cases**. New entry browser tests also pass strict scoped
TypeScript/ESLint. Across the affected native suites **37 unique cases pass / one
unchanged mobile palette exclusion**. Evidence reuses 16 unaffected desktop cases
from the initial run, adds 17 mobile passes and all eight corrected object cases
(four overlaps). Application sources were frozen throughout these runs. The
initial run's failed case and subsequent diagnostic attempts are not counted as
passes. [C2 receipt](../assets/representation-surfaces-session-camera/c2-checkpoint.json)
retains source/log hashes, fixtures, actual allocation/work/timing and native data.

Independent scientific exclusion plus a separate-shell negative control verifies
buried-interface removal; the actual wide/thin calculation keeps its 0.5 Å grid
(809×809×9), and canonical entry/full-fragment geometry agrees across three units.
The 100,001-atom native entry succeeds on both layouts, preserving exact IDs and
coordinates, with bounded buffers and complete disposal. Existing complete 6VXX,
1AON and synthetic-100k capacity profiles pass. These are specific observed
workloads, not universal throughput or strict reference-host certification.

Corrections: cancelled line fallback no longer requests memory on an aborted
request; disposal tests await documented deferred teardown. Native picking first
waits for installed geometry, then validates the exact integer client point used
by trusted input. The diagnostic proves subpixel coordinate rounding caused the
old wireframe mismatch. Expected original identity, ignored obsolete hits,
selection, camera, persisted state and whole-object markers remain checked.
Scientific theory/implementation checkpoint assessments pass; performance review
independently confirms the input-coordinate correction. Final seven-role feature
review remains pending.

Known limitations: C3 surface workflow/incremental updates and C4 camera remain.
An optional malformed empty-atomic-output defense is unnecessary for valid worker
output because the kernel already rejects zero triangles. An extra ad hoc strict
audit of the pre-existing object browser test exposes baseline typing/unsafe-JSON
patterns outside the configured gate; introduced diagnostic typing was corrected.
Consolidate that browser-test typing during C5. Blockers requiring user input: none.
Next: C3 cohesive surface editing; no application changes pushed yet.


### C3 — Cohesive surface editing complete (2026-11-14)

One chooser now handles captured fragments, protein-context pockets and explicit
whole-entry owners from Style, Display and Surfaces. Exact returned identities
reveal created rows and activate the first in request order, preserving selection,
parent visibility and camera. The nonmodal manager separates its persistent
header, independently scrolling compact list and details; sixteen long-named
objects remain keyboard accessible in light/dark, desktop/mobile and narrow views.

Appearance previews locally and publishes one existing command per completed
gesture. Escape cancels the gesture before dismissing the manager; stale trailing
inputs cannot republish it. Immediate choices preserve focus and quiet feedback.
Captured source drafts have Apply/Revert, survive row changes, closing and
responsive remounts, and are discarded with one notice on real project switching.
Source selection distinguishes saved seeds and protein context. Rename remains
explicit. Ambiguous creation/appearance publication uses fresh reads without
blind command replay; pending/uncertain shader appearance survives replacement
viewers through token-guarded replay after canonical installation.

The narrow surface path preserves unrelated molecular structures and field work:
rename is metadata-only, appearance updates its representation, solid/mesh reuses
geometry, and hide/remove/source changes retire only affected bindings. Managed
retired hits cannot activate or become molecular picks. Only eligible translucent
meshes lower the mesh picking threshold; opaque fallback lines remain selectable.

Verification: **601 frontend tests / 80 files**, lint/typecheck/build; unaffected
57 backend surface integration cases reused from C2. **50 unique native passes /
10 unchanged layout exclusions** across both layouts, including exact result
ownership, three gestures/three revisions and Undo, cancelled edits, held writes,
uncertain response recovery, actual native shader values after remount, stale
queued pixels, sixteen-object accessibility and actual 100/200% browser zoom.
Actual 100,001-atom entries preserve geometry, representation and accounted bytes
through appearance edits. [C3 receipt](../assets/representation-surfaces-session-camera/c3-checkpoint.json)
retains source/log hashes, independent native observations, screenshots, failures,
corrections and explicit reuse boundaries. No strict timing gain is claimed.

Native diagnostics corrected fixture lifecycle assumptions rather than production
identity guards: standalone objects now use real definitions/bindings and explicit
framing before installation. Accessibility opens disclosures before checking their
controls and asserts first-Escape cancellation followed by second-Escape dismissal.
Original camera/selection/history/ownership/resource assertions remain. No new
skip, retry or relaxed timing budget was added. Primary complete C3 diff review and
`git diff --check` pass; architecture, UX and scientific checkpoint assessments
pass. Final all-seven assessment remains required on the complete C6 candidate.

No migration, project/viewer/archive schema or version change in C3. Current
versions remain 0.29.0 and head 0014. Known limitations: C4 automatic global camera
and C5–C7 integrated qualification/delivery remain; pre-existing additional strict
native-test typing audit is a C5 consolidation item. Next: C4. No application
changes pushed, and no PR, merge, tag or release claimed.


### C4 — Durable shared camera complete (2026-11-14)

One App-owned controller now persists the complete shared SessionCamera across
entries, projects and disposable viewers. Migration 0015 and GET/PUT workspace
presentation add one independent singleton with strict native-compatible numeric
validation, atomic revision comparison, stale-identical rejection and exact no-op
revision/timestamp preservation. Camera writes do not enter project commands or
alter molecular/history/Redo/checkpoint/timestamp/artifact state. Existing named
scene fields and project/viewer/archive 2 remain unchanged; FOV stays separate and
legacy scene application retains the current FOV.

The controller hydrates once, buffers lazy restoration, serializes one write plus
latest intent, and saves after 250 ms quiet time or at most 2 seconds during
continuous navigation. Validated 4 KiB recovery retains the original dirty base;
refresh cannot silently authorize overwriting another saved view. Page hiding and
binding retirement capture the exact final known pose, including unnotified small
native changes. Explicit Save resolves conflicts; failed saves and viewport
restoration refusal leave navigation usable. A typed display-failure path prevents
fallback autosaves and keeps lazy startup alive. Failed scene intent cancels only
its owning generation/binding, with newer navigation preserved.

First fit is globally reserved before installation, after successful empty
hydration. It requires canonical targets plus actual committed visible geometry
and a usable viewport. Actual fitting or navigation consumes the opportunity;
ordinary content/style/surface changes, empty/repopulated scenes, new molecules,
project switching and remounts cannot repeat it. Native clipping derives from
current committed render-object spheres, preserving logical radius, FOV and pose.
The pinned provider's cached public spheres can remain stale with automatic reset
disabled; BoundaryHelper98 aggregation over visual objects resolves that defect
without scanning molecular atoms. Existing native cadence and guarded final
sampling retain sub-epsilon poses; no additional animation loop is introduced.

Verification: **723 frontend tests / 84 files**, lint/typecheck/build; Ruff and
mypy (**203 files**); **202 backend integration cases** combining presentation,
all migrations and viewer-state regressions. Actual concurrent insert/update races
produce one success and one presentation conflict. Empty and populated
0014→0015→0014→0015 preserve every old table and original/current artifact byte;
downgrade removes only the preference. Focused tests include 71 controller, 30
component lifecycle, 14 independent numerical, 12 actual-camera Engine and eight
recovery cases within the frontend total.

**18 native passes / zero exclusions** across desktop and mobile verify both
projection modes, rolled/nondefault-FOV poses and independently observed projected
landmarks, entry/project/empty-project switching, responsive remounts, reload,
fresh contexts and actual API process restart. Same-browser actual close recovers
a final raw 1e-7 update injected before pagehide flush with no next renderer frame.
Held hydration/upload/scene responses preserve newer input; first surface Fit must
produce a real positive radius and changed pose, not merely a call count. Recovery
passes axe at 320px, remains reachable beside the surface manager, keeps its focused
action during a held real acknowledgement and requires explicit conflict Save.
Legacy scene application omits stored FOV while retaining current FOV; a native
matrix-suppressed tiny pose still persists and reloads exactly.

[C4 receipt](../assets/representation-surfaces-session-camera/c4-checkpoint.json)
retains source/log hashes, actual API process logs, native observations/screenshots,
failed attempts, corrections and exact reuse. Earlier first-fit count-only evidence
was insufficient and led to the real drawable/bounds corrections; it is not final
qualification. Native dependency-optimizer reload and an overlay-intercepted test
gesture remain separate diagnostics. No assertion, resource budget, skip or retry
was relaxed. Architecture and performance correction assessments pass; these are
checkpoint assessments, not the final seven-role feature gate. A reviewer corrected
an early probe that had awaited start rather than hydration; controlled regressions
and the corrected probe establish final capture behavior independently.

README, API, architecture, upgrade/recovery guidance and D-154 are current. Fetch
reconfirmed origin/master `a1f2e2fd` and availability of 0015. All five versions
remain 0.29.0 until release preparation; planned impact remains stable minor
0.30.0. Known limitations: C5 integrated native/scientific/archive compatibility
qualification and test consolidation, C6 final-version full gate/readers/all-seven
assessment, and C7 normal delivery remain. Browser recovery is best effort under
simultaneous storage/network/process failure. No application push, PR, merge,
tag or release is claimed. Next: C5.

### C5 — 2026-11-14: integrated qualification and test consolidation

The [integrated receipt](../assets/representation-surfaces-session-camera/c5-checkpoint.json)
retains **182 unique native passes / 25 existing registered exclusions** across
explicit development invocations. Every observed failing case is corrected and
has a later passing result; there are no automatic retries or new case exclusions.
The final complete viewer invocation passes **23 / 5 existing exclusions**, and
all 100 selected mobile cases finish **78 passes / 22 existing exclusions**.
Earlier partial commands remain diagnostics, not complete frozen qualification.

The integration work adapts old test assumptions to the accepted behavior:

- Pixel/picking fixtures explicitly frame their own final drawable specimen.
  Preparation, inspection, ordinary synchronization and camera feature tests remain
  camera-neutral. A short protein chain absent from default cartoon geometry is
  framed only after the fixture's final ball-and-stick definition is installed.
- Native movement observers inspect installed combined entry representations and
  explicitly await worker/upload completion. Coordinate-cancellation measurement
  stays independent of later surface regeneration. Selection observation uses the
  public drawable subscription instead of a retired initial-fit flag.
- End-to-end creation follows the shared chooser. Surface readiness is installation
  state, not an obsolete unit-provider message. Channel assertions preserve exact
  polymer/surface geometry while verifying that all atomic detail disappears.
  Tile geometry checks target the actual grid, separately from new scoped resets.
- Molecular-request observations distinguish the independent presentation endpoint
  while retaining exact project/history/structure assertions. The notice test title
  now describes that scope. Hover retirement tests request a genuinely fresh
  immutable molecular frame; identical synchronization correctly preserves visuals.
- The legacy surface-object native file now passes strict TypeScript and typed
  ESLint without suppressions. Runtime-equivalence checking preserves interactions,
  assertions, payloads, existing exclusions and timing limits.

Full Python qualification found **1,539 passes / two failures / zero skips**:
new `workspace_presentation` lacked the required historical namespace forwarding
module. The repository-standard alias fixes both import orders; all **eight**
namespace compatibility tests pass. Unaffected Python results are retained; this
is not described as a clean final-version full run. Final frontend qualification
passes **723 tests / 84 files**, lint, types and build; Ruff/mypy **204** sources,
production/passive-entry/license audit and strict surface-native checks pass.
The existing renderer chunk warning remains nonblocking.

[Actual tagged-reader preflight](../assets/representation-surfaces-session-camera/c5-preversion-reader.json)
verifies all **754** selected v0.29.0 source identities and eight separate actual
producer/reader commands, both directions and archive suffixes. Fixtures now retain
representative atomic/polymer styles, colors, explicit hydrogen overrides and
nondefault appearances for all three surface kinds. Full portable scene records,
including camera and entry settings, are compared after only documented identity
remapping. Three copied-corruption controls reject changed scene cameras and
surface appearances. Imported helper provenance is checked after lazy imports.
The current reader upgrades old-produced 0014 stores to 0015 before reading; the
old reader never runs its Alembic on a newer store. Both applications use quick
implementation 1.0.3/current-canonical policy. This remains **pre-version 0.29.0**
development evidence and must repeat with the final 0.30.0 producer.

Seven independent early specialist agent assessments PASS the full C1–C4 runtime
and inspected C5 changes; final C6 same-candidate reconfirmation is still mandatory.
They independently ran focused scientific, ownership, workflow and UI tests and
checked retained native/source hashes. The primary integrated suite additionally
caught and corrected the missing compatibility alias. A narrow architecture
follow-up confirms that detached presentation streams the owning canvas's pixels,
so nondefault FOV needs no second camera wire contract. Optional P3 feedback polish
(shared input validation can expose an unrelated source-context Retry action) is
nonblocking and deferred without a speculative extra issue.

Five feature-specific release tools now define **33** explicit steps: the complete
release gate, full browser inventory, audits, legacy CLI, actual preceding readers
and current upgrades before reverse reads. They preserve all historical migration
bytes, require only new 0015, clear inherited datastore aliases including
`DATABASE_URL`, and compare exact prior exclusion identities. Current inventory is
**516** cases; final execution and counts remain unclaimed. Native production
budgets, scientific fixtures, dependency locks and portable timing policy remain
unchanged. Source/log hashes, failed-attempt contexts and successful observations
are retained; raw browser RPC scratch/trace data is not a portable qualification
artifact.

Fresh fetch confirms unchanged origin/master `a1f2e2fd`; stable latest remains
v0.29.0 and v0.30.0 is available. Merge commits are enabled and automatic branch
deletion is disabled. All five application versions remain 0.29.0 at this
checkpoint. No further durable-schema or architectural decision is needed.
Known remaining work: C6 final-version frozen candidate/readers/full gate/final
seven-role reconfirmation, then C7 protected delivery, exact-master gate,
publication, one styling follow-up, issue reply and cleanup. Blockers requiring
user input: none. Next: **C6, stable minor 0.30.0**. No application push, PR,
merge, tag or release is claimed.

### C6 preparation — 2026-11-14: stable 0.30.0 candidate

C5 is committed at `d1ab63815914264391c31e4590f2c9df91d5e229`.
Fresh remote reads confirm origin/master remains `a1f2e2fd`, latest stable release
is v0.29.0 and v0.30.0 is free. Actual compatibility and new durable functionality
support the approved **stable minor** increment; there is no portable-format break,
major-release commitment or experimental-only scope requiring a different class.
All five authoritative versions now agree at **0.30.0**, without dependency changes.
Historical archive-producer assertions remain and add 0.29.0; all **44** archive
round-trip cases pass under the frozen environment. Version/schema/dependency/
historical-migration audits pass. [Preparation receipt](../assets/representation-surfaces-session-camera/c6-preparation.json)
retains lossless logs; it is not complete release qualification.

The candidate and exact-master **33-step** recipes are persisted before their
clean-start execution. Release notes cover implemented outcomes, scientific/resource
limits, migration/rollback, shared-camera scope and deliberate deferrals. The
complete C6 gate, final actual 0.30.0 producer/readers, primary full-diff review
and seven-role final reconfirmation remain required before pushing application
changes or opening the PR. No remote feature completion/publication is claimed.

### C6 correction — 2026-11-14: explicit native fixture framing

The first clean candidate `eb7ee674` passes frozen installs, empty migration round
trip, Ruff/mypy204, **1,542 Python / zero skips**, **723 frontend / 84 files**,
**14 supervisor**, build and the full **516-case** inventory. Its complete browser
command stops on the synchronized-selection fixture's missing native hit after
**205 passes / 6 executed existing exclusions / one failure / 304 not run**.
[Failed-attempt receipt](../assets/representation-surfaces-session-camera/c6-candidate1-diagnostic.json)
retains the exact clean source/log evidence, report and 329 observations. This is
not a completed release gate, and the partial browser run does not qualify it.

The fixture had relied on automatic import fitting, contrary to the approved shared
camera. It now explicitly chooses Fit after import before its existing picking
baseline. A real migrated disposable installation is first seeded through the
public API with off-screen target `[1000,1000,1000]`; the corrected native workflow
passes, and a later real GET confirms that Fit's in-frame pose was persisted.
A read-only scan of the unexecuted late files identifies the transform-toolbar
fixture's related framing dependency. It now waits for actual drawable content and
explicitly fits once before its original selection/camera baseline. All **19**
applicable desktop/mobile toolbar cases pass, with **one unchanged touch-layout
exclusion**. Camera, Cancel, held-pointer, accessibility and remount assertions
remain. No production code, automatic fitting policy, molecular assertion,
scientific fixture, deadline, retry or case exclusion is changed.

[Focused correction evidence](../assets/representation-surfaces-session-camera/c6-framing-correction.json)
retains lossless logs/reports and the real off-screen seed/after observations.
Raw browser RPC scratch/traces remain outside the repository; portable diagnostic
observations and contexts are losslessly retained. A fresh precommitted
**c6-candidate2 33-step recipe** repeats the whole clean gate, including the entire
browser matrix and final-version readers. The exact-master recipe remains required.
Seven-role reconfirmation must cover the corrected candidate; earlier approvals
are not carried forward automatically. Versions remain 0.30.0; scope/release class
and migration0015 are unchanged. No application push or PR is claimed.

### C6 correction — 2026-11-14: unambiguous opacity assertion

Clean candidate `7019a3d7` again passes the 14 preceding release steps, including
1,542 Python / zero skips, 723 frontend, 14 supervisor and the 516-case inventory.
The previously failing synchronized-selection case passes. The browser command
then stops at the viewer-controls assertion after **207 passes / 7 executed
existing exclusions / one failure / 301 not run**. Its substring label matches
both correctly distinct controls, `Surface opacity` and `Surface opacity slider`.
[Diagnostic receipt](../assets/representation-surfaces-session-camera/c6-candidate2-diagnostic.json)
preserves the frozen source, all lossless logs/report and 329 observations; this
partial run is not release qualification.

The numeric-field assertion now uses its exact accessible label. Its expected
value, all remaining assertions, product controls, scientific behavior, deadlines,
retries and exclusions are unchanged. A repository-wide opacity-locator scan finds
no other ambiguous numeric-field locator. The complete viewer-controls command
passes **5 applicable cases / 5 existing exclusions**, including representations,
named scenes, explicit camera actions, focus, compact controls and WebGL failure.
[Correction evidence](../assets/representation-surfaces-session-camera/c6-controls-correction.json)
retains the source identity and lossless report/log hashes.

The fresh precommitted **c6-candidate3** recipe repeats all 33 steps and the entire
browser matrix. Final seven-role reconfirmation and exact-master repetition remain
mandatory. The single approved deferred-styling issue now exists as
[#141](https://github.com/ManuelSe/Neistra/issues/141), with its remote body verified;
it preserves the global camera contract and coordinates #64/#107. No new runtime,
schema, dependency, version or scope decision is introduced by this correction.

### C6 — 2026-11-14: complete stable 0.30.0 candidate qualification

Clean committed candidate `c8468c89472b2c67fbb70eea433bce71c3a13a5c` passes all
**33 complete sequential release steps** in the precommitted `c6-candidate3` recipe.
[Verified summary](../assets/representation-surfaces-session-camera/c6-candidate3-summary.json)
records **1,542 Python / zero skips, 723 frontend, 14 supervisor, and 441 browser
passes / 75 exact existing exclusions**. All 516 inventoried cases execute or have
their registered exclusion; there are zero failures, flakes, automatic retries or
new exclusions. All **791 current source identities**, **754 actual tagged
v0.29.0 source identities**, recipe/runner identities and 33 lossless log hashes
verify. No partial browser command or preceding command result is reused in this
complete candidate gate. The two failed attempts remain separate diagnostics.

Frozen installs, empty upgrade/downgrade/re-upgrade, Ruff/mypy204, lint/types,
production build, version/schema/dependency/historical-migration/license audits,
legacy CLI and complete native matrix pass. Actual **0.29.0 ↔ final 0.30.0**
producer/readers run in separate processes for rich display/history and canonical
connectivity/unapplied-proposal specimens. Both archive suffixes pass deep
entry/surface/scene/selection/measurement/canonical/original comparisons and copied
corruption controls. Module paths and source identities prove actual tagged code
rather than a current-code stand-in. Both versions retain quick1.0.3/current-canonical
policy; this is not a historical-model-refusal claim.

[Native receipt](../assets/representation-surfaces-session-camera/c6-candidate3-native-receipt.json)
verifies **563 observations/screenshots**, ZIP CRC and internal hashes. Hidden RPC
scratch and raw traces are retained outside the repository. Final desktop/light,
320px/mobile/dark and managed mesh screenshots were visually inspected. Full native
coverage includes the real 100,001-atom entry, existing 100k capacities, all source
kinds, exact picks/colors, 16-object management, accessibility, both camera
projections, API restart/fresh browser, immediate close, conflict/display recovery,
legacy scenes and remount/held-intent cases.

[Seven specialist assessments](../assets/representation-surfaces-session-camera/c6-specialist-review.json)
all PASS the qualified candidate. The [complete local review](../assets/representation-surfaces-session-camera/c6-review.md)
is implementer self-review; no independent human approval or remote CI success is
claimed. The final evidence/documentation diff is reconfirmed by all seven before
application push, with the exact final feature head recorded in the PR pre-merge
receipt. No consequential finding remains; the shared source-context Retry label
suggestion is nonblocking P3 polish, deferred without another speculative issue.
The one approved scope follow-up is [#141](https://github.com/ManuelSe/Neistra/issues/141).

All five versions remain **0.30.0**; migration0015 adds only the installation
camera preference. Portable schemas, historical migrations, dependencies and
scientific profiles remain unchanged. No further cross-project architectural
decision was required. Known limits: approximate fixed-grid visualization,
specimen-specific capacity, best-effort browser recovery, and portable rather than
strict reference-host timing qualification. Next: final same-head review, fresh
remote/base/version/protection checks, normal PR/merge and the mandatory complete
exact-master `c7-merged1` gate, then tag/release/download verification, issue reply,
normal receipt integration and branch cleanup. No PR, merge, tag or release exists
at this receipt's creation.

### C7 — 2026-11-14: normal merge, release hold and bounded entrance correction

[PR #142](https://github.com/ManuelSe/Neistra/pull/142) normally merges the reviewed
feature head `4ee4fea4` at **`54277903cba52bd56881bee070bafdca5b0eeeea`**. Remote
readback verifies parents `a1f2e2fd`/`4ee4fea4` and exact tree equality. Local master
is fast-forwarded from a clean tree. No required review/check/ruleset or Actions
workflow is configured; no protection is bypassed. Codex review is requested but
returns no external result before merge. All seven final specialist agents PASS
that exact feature head; this is not independent human approval. The requested
Closes #140 closes the issue on merge; publication and final closeout remain work.

The first clean exact-master `c7-merged1` run passes 14 release steps, including
1,542 Python / zero skips, 723 frontend and14 supervisor. Its complete browser
command stops after **146 passes / 4 executed existing exclusions / one failure /
365 not run** at the real browser-zoom surface-manager bounds assertion.
[Failed-master receipt](../assets/representation-surfaces-session-camera/c7-merged1-diagnostic.json)
retains all source/log hashes, the report and218 curated observations. This is
not successful exact-master qualification. **No tag or release is created.**

Independent UI/UX investigation identifies a real entrance defect: the right/top
anchored manager inherits the centered dialog's140ms transform from
`translate(-50%, -48%)`, despite its resting transform being none. The failed
assertion occurs inside that animation. Its clipped framework screenshot alone
cannot establish settled width overflow. A deterministic native negative control
samples the actual CSS animation at start/midpoint/end: the old rule puts its top
at **−273.60px / −36.99px /72px** in the recorded100% viewport.

Implementation resumes only on the planned feature branch, fast-forwarded to
merged master. The correction adds one manager-specific **opacity-only fade-in**,
matching other positioned tools. Position, size, scientific calculations, camera,
API, persistence, migration and resource limits remain unchanged. The existing real
100%/200% zoom workflow now deterministically samples the actual entrance timeline
in both themes, retaining its original strict immediate bounds assertion. All
**12 native samples** are bounded and position-invariant; the old rule is rejected.

An initial positive preflight stops earlier at the200% Space-key precondition:
programmatic canvas focus races the Inspector's scheduled return to its launcher.
The existing navigation hook correctly requires canvas focus. The fixture now
awaits the established panel-hidden/launcher-focus handoff, then explicitly focuses
and checks the canvas before the original Space assertions. No production focus
policy, assertion, deadline, retry or case exclusion is changed. The complete
focused zoom workflow then passes, including all original camera/keyboard/
accessibility controls. Lint/types, **723 frontend /84 files**, build and diff checks
pass; the later test-only handoff synchronization leaves frontend evidence valid.
[Correction evidence](../assets/representation-surfaces-session-camera/c7-opening-correction.json)
retains lossless logs, source provenance, native samples and75 observations.

Fresh precommitted **c7-candidate1** and **c7-merged2** recipes require complete
33-step clean candidate and exact-master gates. Final seven-role assessments must
cover the corrected full implementation and evidence before push. A corrective
normal PR will preserve history; the runtime will be tagged only after its verified
merge and exact-master gate. Five versions remain **0.30.0** because the first0.30
release is still unpublished; no patch tag is invented. No new architectural or
scientific method decision is required. The approved follow-up remains #141.

### C7 — 2026-11-14: complete Components fixture handoff

The first corrected clean candidate `83dcee26` passes the strengthened actual
100%/200% both-theme entrance workflow and395 browser cases, then stops in the
mobile hierarchy keyboard fixture after **64 executed existing exclusions / one
failure /56 not run**. All14 preceding release steps pass. [Diagnostic receipt](../assets/representation-surfaces-session-camera/c7-candidate1-diagnostic.json)
retains the exact frozen source/log/report identities and532 observations. No
partial browser command qualifies the release.

Independent UX source/trace assessment identifies another incomplete expected
focus handoff: explicit Components inspection schedules its heading focus in an
animation frame, while `browseComponents` only awaits parent text. The fixture
forces disclosure focus before that landing completes; Enter reaches the heading
and leaves the category collapsed. Application hierarchy and focus-policy code
are unchanged. The shared helper now awaits the existing Components heading focus;
the mobile keyboard case verifies disclosure focus and expanded state before its
original ligand-selection assertions. It retains keyboard activation, geometry,
accessibility, deadlines, retries and exclusion policy.

The complete previously unexecuted mobile surface/viewer/camera command passes
**46 cases /12 registered existing exclusions**, and the desktop hierarchy workflow
passes **1 case**. No failures, flakes or retries occur. [Handoff correction receipt](../assets/representation-surfaces-session-camera/c7-handoff-correction.json)
retains both complete command reports, all hashes and37 observations. All current
application/backend/frontend/tool bytes match the first corrected candidate;
only two additional e2e files change. The14 preceding passing steps, including
1,542 Python/zero skips and723 frontend/lint/types/build, remain valid focused
evidence. A fresh **c7-candidate2** clean33-step recipe repeats every command and
the complete browser matrix. The precommitted **c7-merged2** recipe remains the
mandatory exact-master gate after a corrective normal PR.

The bounded manager animation remains the sole production correction. Versions
remain0.30.0; no tag/release exists. All seven assessments of83dcee26 are historical
source assessments; final reconfirmation must cover this fixture change and final
qualification evidence before push. No new scientific/architectural decision,
product scope or follow-up issue is introduced. Next: corrected candidate2 complete
gate, final review, normal corrective PR/merge, exact-master2 gate and publication.
