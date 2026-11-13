# Issue #140 — Correct representations, improve surfaces, and preserve the shared camera

## 1. Status, authority, and approved direction

**Status:** approved contract; C0 planning persistence only. C1–C7 remain pending.
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
- Use **Refs #140**; close only after exact-master qualification and verified
  publication.
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
