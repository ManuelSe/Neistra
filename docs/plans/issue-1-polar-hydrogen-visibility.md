# Issue 1 - Polar-Only Hydrogen Visibility

Status: completed and released in MolWeave v0.5.0

## Issue metadata

- Issue: [#1 - Add an option to hide non-polar hydrogens while displaying polar hydrogens](https://github.com/ManuelSe/MolWeave/issues/1)
- Issue state at approval: open
- Issue author: `ManuelSe`
- Issue created: 2026-08-03
- Issue last updated at approval: 2026-08-03
- Plan approved: 2026-08-09
- Base branch: `master`
- Base commit at approval: `e3187b22e5da76ff22850b5c5fee1c32adad63e5`
- Planned feature branch: `feat/issue-1-polar-hydrogen-visibility`
- Planned application version: `0.5.0`
- Planned tag: `v0.5.0`
- Planned pull-request title: `feat(viewer): add polar-only hydrogen visibility`

This document is the approved implementation contract for issue #1. It
supplements, but does not replace, the global `docs/PLAN.md`. Changes to this
contract require explicit user approval and must be recorded in the decisions
and progress sections below.

## Core problem and approved outcome

MolWeave currently persists one `components.hydrogens` boolean for each
structure entry. The setting provides only two display states: all explicit
hydrogens or no hydrogens. Scientists inspecting protein-ligand systems cannot
reduce non-polar hydrogen clutter while retaining chemically relevant polar
hydrogens.

The approved outcome adds an additive `nonpolar_hydrogens` viewer setting,
defaulting to `true`, with three effective modes:

| Hydrogens | Non-polar hydrogens | Effective display |
|---|---|---|
| Off | Either | Hide all explicit hydrogens |
| On | Off | Show polar hydrogens only |
| On | On | Show all explicit hydrogens |

The existing hydrogen setting remains the master control. Turning it off hides
all explicit hydrogens without erasing the stored non-polar preference. Turning
it on again restores either all or polar-only display according to that
preference.

MolWeave will use the pinned Mol* 5.11 covalent-neighbor display classifier.
Hydrogen bonded to N, O, S, F, Cl, Br, or I is treated as polar. The mode applies
to inherited and selection-specific line, stick, thick-stick, ball-and-stick,
space-filling, and molecular-surface representations for protein, complex, and
ligand viewer projections. Cartoon and backbone representations do not render
explicit hydrogen geometry, so their behavior remains unchanged.

This is presentation state only. Toggling either setting must not add, delete,
infer, or move hydrogen atoms; alter bonds, coordinates, conformers, chemistry,
component classification, artifacts, entry identity, or original uploads; or
change the current selection, picking mode, camera, focus, rotation center, or
isolation.

The setting is durable application-owned viewer state. It is revisioned and
undoable, and it survives checkpoints, recovery, reopen, named scenes, and
portable project archives. Mol* receives the effective display mode but remains
a disposable renderer and does not own or serialize the setting.

## Authority and assumptions

The plan applies this authority order:

1. User approval of this plan and any later explicit correction.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing molecular, project, API, archive, viewer, scene, command, and
   selection ownership boundaries.
4. Issue #1's underlying user problem, intended outcome, constraints, and
   explicit non-goals.
5. Technical and UI suggestions in the issue, which are non-binding.

Accepted decisions D-002, D-006, D-007, D-022, D-023, D-035, D-038, D-041,
D-043, D-045, and D-046 remain authoritative:

- `NormalizedStructureV1` and immutable current artifacts remain molecular
  authority.
- Durable viewer settings use the backend command bus and never become Mol*
  snapshots.
- The viewer renders complete application state and may rebuild its disposable
  projection after a settings change.
- Selection-specific representation assignments remain exact stable-atom
  targets and receive the same entry-level hydrogen visibility mode.
- Archive schema, rather than application version, governs structural import
  compatibility.
- Current selection, ordinary camera navigation, focus, picking, and isolation
  remain transient.

Implementation must append an accepted cross-project decision recording the
durable setting, three-mode precedence, renderer-classification boundary,
focus behavior, migration, and compatibility policy. This feature plan does
not replace that decision record.

Planning assumptions:

- `components.nonpolar_hydrogens` is additive and defaults to `true`, preserving
  the behavior of every existing entry, checkpoint, scene, and archive.
- `components.hydrogens` is retained without a type or meaning change.
- The UI uses explicit human-readable labels rather than rendering raw component
  keys.
- Mol*'s `ignoreHydrogens` and `ignoreHydrogensVariant` parameters are the
  bounded renderer mechanism. MolWeave does not create a second chemistry or
  covalent-neighbor classifier.
- The operational term *polar hydrogen* means a rendered hydrogen with a polar
  covalent neighbor according to Mol*'s pinned element set. It is not a claim
  about hydrogen bonds, donor strength, pKa, protonation correctness, acidity,
  energetics, or structure preparation.
- A hydrogen without a polar covalent neighbor is hidden in polar-only mode.
  Classification quality therefore depends on connectivity available to the
  disposable viewer projection. This limitation must be visible in scientific
  documentation and qualification evidence.
- Aggregate ligand focus excludes all hydrogen atoms in polar-only mode rather
  than duplicating Mol* connectivity classification in application state. The
  heavy-atom ligand extent remains a stable, deterministic camera target.
- Atom labels remain controlled independently by the existing Labels settings.
  Issue #1 changes molecular representation geometry, not annotation policy.
- A failure to classify ordinary explicit-hydrogen protein and ligand fixtures
  correctly is a blocker. It must not be hidden with ligand-only scope or
  unrecorded bond inference.

## Repository findings

At approval, clean local `master`, local `origin/master`, and remote `master`
all matched `e3187b22e5da76ff22850b5c5fee1c32adad63e5`. The remote exposed only
the `master` branch.

The repository has verified annotated tags and published non-prerelease GitHub
releases `v0.1.1`, `v0.2.0`, `v0.2.1`, `v0.3.0`, and `v0.4.0`. The request's
premise that MolWeave lacks established tag or release history is stale.
`v0.4.0` is the compatibility and SemVer baseline.

The repository has no `.github` workflow, configured branch protection,
repository ruleset, required status check, or required review at approval.
Squash, merge-commit, and rebase merge are enabled; auto-merge and automatic
branch deletion are disabled. Established delivery uses a documented complete
local gate, full-diff review, rebase-and-merge, an annotated tag on verified
merged `master`, a published GitHub release, and a verified final issue reply.
Remote requirements must be checked again before merge and release and may not
be bypassed if they change.

Current authoritative application versions are `0.4.0` in:

1. `pyproject.toml`
2. `uv.lock`
3. `apps/web/package.json`
4. FastAPI metadata in `apps/api/src/molweave_api/main.py`
5. Archive producer provenance in
   `apps/api/src/molweave_api/archive_service.py`

`ViewerSettingsV1` currently stores complete-entry representations, exact
selection-specific representation assignments, component visibility, and
labels. Live entries store it in JSON; checkpoint entries and named-scene
entry states copy the same typed value; portable archives validate it through
the same model. Migration `0008` is current Alembic head.

The frontend currently filters all hydrogens from application representation
memberships when `components.hydrogens` is false and also passes Mol*'s
`ignoreHydrogens` flag to every representation profile. Mol* 5.11 additionally
supports `ignoreHydrogensVariant: "non-polar"` for the relevant line,
ball-and-stick, space-filling, surface, label, point, and bond visuals. Its
implementation defines polar hydrogen by a polar covalent neighbor and uses
the element set N, O, S, F, Cl, Br, and I.

Issue #2, released in v0.3.0, already supplies derived application-owned
component hierarchy and mapped component visibility. Issue #7, released in
v0.4.0, already supplies inherited and exact selection-specific representation
layers and explicitly retained issue #1 as the hydrogen-filtering follow-up.
Issue #1 does not need a new component model or styling architecture.

Jobs, plugins, molecular editing, format adapters, export filtering, normalized
molecular schemas, artifact storage, and worker lifecycle do not need runtime
changes for this feature.

## Requirement disposition matrix

| Issue requirement or significant implication | Classification | Approved disposition |
|---|---|---|
| Display polar hydrogens without non-polar hydrogens | Essential | Implement one polar-only mode through the existing viewer-settings path. |
| Work for proteins and ligands | Essential | Qualify both macromolecular/complex and ligand projections with explicit-hydrogen fixtures. |
| Re-enabling restores all explicit hydrogens | Essential | Preserve an independent non-polar preference and prove all/polar-only/none transitions. |
| Do not add or infer absent hydrogens | Essential | Enforce molecular-artifact, topology, coordinate, count, ID, and original-byte invariants. |
| Remain consistent when representations change | Essential | Apply the effective mode to every inherited and exact relevant representation profile. |
| A `Show non-polar hydrogens` toggle | Supporting | Add an explicitly labelled control in the existing Components group; exact layout is adapted to MolWeave. |
| Preserve polar-only state across reload and recovery | Supporting | Required by accepted durable viewer-state ownership. |
| Undo and redo display changes | Supporting | Reuse the existing revisioned viewer-settings command. |
| Preserve the setting in named scenes and archives | Supporting | Required for consistency with all other viewer settings. |
| Show or hide all hydrogens | Already satisfied | Retain the existing master `hydrogens` field and behavior. |
| Existing protein/ligand representation architecture | Already satisfied | Extend the current shared representation profile and projection path. |
| New backend analysis endpoint or chemistry classifier | Rejected as proposed | It would duplicate pinned renderer connectivity semantics without adding user value. |
| Persist inferred hydrogen attachment or rewrite normalized bonds | Rejected | It would broaden display scope into molecular normalization and export behavior. |
| Per-selection or per-representation hydrogen modes | Deferred | Requires precedence and user-workflow decisions beyond issue #1. Create a follow-up only on demonstrated demand. |
| Hydrogen-bond detection, protonation, pKa, or donor/acceptor analysis | Deferred | Scientifically separate workflows; no follow-up is created solely for this issue. |
| Polarity-aware atom-label suppression | Optional and deferred | Labels are independent annotations. Create a focused follow-up only if users require it. |
| Docking-specific hydrogen preparation | Rejected | Docking remains outside the core application. |

No speculative follow-up issue is required by this plan. If qualification shows
that Mol* cannot classify ordinary explicit-hydrogen protein and ligand fixtures
reliably, implementation must stop for an explicit product/scientific decision
rather than silently reduce the requirement or infer new normalized bonds.

## Accepted scope

- Add `components.nonpolar_hydrogens: boolean` with a default of `true` to the
  Python and TypeScript viewer-setting contracts.
- Add Alembic revision `0009` to populate the default in live entry,
  checkpoint-entry, and scene-entry-state JSON.
- Refuse downgrade while any stored live, checkpoint, or scene value is
  `false`; otherwise remove the additive default safely.
- Preserve `/api/v1`, `ProjectStateV1.schema_version: 1`,
  `ProjectManifestV1.schema_version: 1`, archive schema version 1, and
  `NormalizedStructureV1.schema_version: 1`.
- Accept legacy project and archive payloads that omit the field, defaulting
  them to all-hydrogen behavior.
- Retain `components.hydrogens` as the master visibility setting.
- Translate the two values to one effective renderer mode:
  `none`, `polar-only`, or `all`.
- Pass Mol* the matching `ignoreHydrogens` and
  `ignoreHydrogensVariant` values for every relevant inherited and
  selection-specific representation layer.
- Keep component visibility and isolation intersections unchanged.
- Use explicit `Show hydrogens` and `Show non-polar hydrogens` control labels,
  with a clear explanation when the master setting currently hides all
  hydrogens.
- Exclude all hydrogen atoms from aggregate ligand camera targets in
  polar-only mode without persisting a second polarity classification.
- Prove no extra normalized-structure request is introduced by repeated
  setting changes.
- Add focused unit, integration, migration, component, real-WebGL,
  accessibility, responsive, persistence, archive, and invariant evidence.

## Non-goals

- Adding, deleting, inferring, or repositioning hydrogens.
- Inferring new normalized bonds or changing molecular warnings/inferences.
- Protonation-state selection, pKa estimation, tautomer enumeration,
  donor/acceptor classification, or hydrogen-bond analysis.
- Changing import, export, or archive molecular filtering policies.
- Changing atom labels, measurement labels, selection highlighting, or saved
  selection membership according to hydrogen polarity.
- Per-representation, per-selection, per-component, or per-scene override
  precedence beyond the persisted entry setting already captured by scenes.
- Component overrides, ligand-of-interest designation, component extraction,
  subset export, or docking behavior.
- A new viewer snapshot or Mol*-owned persistence format.
- A normalized-molecular, project-state, API-major, or archive-schema-major
  revision.
- Incremental Mol* state-tree surgery; the accepted serialized disposable
  rebuild remains valid unless profiling finds a regression.

## Milestones and checkpoints

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Fast-forward clean local `master` from `origin/master`.
- Create the approved feature branch from the verified base commit.
- Persist this document as the detailed source of truth.
- Record the concise handoff in `docs/PROGRESS.md`.
- Do not begin implementation.

Affected areas:

- `docs/plans/issue-1-polar-hydrogen-visibility.md`
- `docs/PROGRESS.md`

Acceptance criteria:

- Approved scope, assumptions, dispositions, checkpoints, implications,
  release plan, blockers, and progress log are present.
- The global `docs/PLAN.md` is unchanged.
- No implementation file is changed.
- Branch and base commit match the approved metadata.

Focused validation:

```bash
git diff --check
git status --short --branch
```

Documentation and migration implications: documentation only; no migration.

Expected commit:

```text
docs(plan): add approved plan for issue 1
```

Rollback and compatibility: revert this documentation commit before
implementation; no application behavior or data changes.

### Checkpoint 1 - Establish the durable setting contract

Concrete outcome:

- Add the typed additive setting and deterministic defaults.
- Add migration `0009` for live entries, checkpoints, and scenes.
- Preserve viewer-setting command, history, archive, and scene behavior.
- Append accepted decision D-047.

Affected areas:

- `apps/api/src/molweave_api/schemas.py`
- `apps/api/src/molweave_api/viewer_state.py`
- `apps/api/src/molweave_api/project_service.py` only if existing generic
  replacement needs an explicit compatibility guard
- `apps/api/src/molweave_api/archive_service.py`
- `apps/api/migrations/versions/0009_*.py`
- `apps/web/src/api/types.ts`
- unit, integration, archive, and migration tests
- `docs/DECISIONS.md`

Acceptance criteria:

- Existing projects, checkpoints, scenes, and archives default to
  `nonpolar_hydrogens: true` and retain their existing rendering behavior.
- Both settings validate and round-trip in project, checkpoint, scene, and
  archive state.
- One viewer-setting update creates one project revision with an accurate
  history description and affected entry.
- Undo/redo, save/revert, recovery/reopen, scene save/apply, and archive
  export/import restore the exact setting.
- Migration upgrade populates every stored viewer-settings location.
- Downgrade refuses to discard any `false` value and explains how to restore a
  safe default before retrying.
- Valid v0.1.0 through v0.4.0 producer archives remain readable with immutable
  original bytes and molecular artifacts unchanged.
- No normalized molecular model, SQL table, SQL column, or public endpoint is
  added or changed incompatibly.

Focused validation:

```bash
.venv/bin/uv run ruff check apps/api packages/molweave_core tests
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest \
  tests/unit/test_commands.py \
  tests/unit/test_history.py \
  tests/integration/test_viewer_state.py \
  tests/integration/test_archive_roundtrip.py \
  tests/integration/test_migrations.py
git diff --check
```

Run isolated Alembic upgrade and downgrade tests from `0008` with populated
legacy live, checkpoint, and scene JSON, plus an explicit unsafe downgrade case.

Documentation and migration implications:

- Append D-047 with the accepted durable-state and renderer boundary.
- Add JSON data migration `0009`; no relational schema shape changes.
- Keep every public schema-major version at 1.

Expected commit:

```text
feat(viewer): persist polar-only hydrogen setting
```

Rollback and compatibility:

- Application rollback is safe while every stored value remains `true`.
- Once a project or scene stores `false`, downgrade must refuse rather than
  silently replace polar-only state with all-hydrogen behavior.
- Older releases do not promise forward import of 0.5.0 archives containing
  the non-default value.

### Checkpoint 2 - Render and control polar-only hydrogens

Concrete outcome:

- Add one typed effective hydrogen-display mode helper.
- Project the mode through every relevant disposable Mol* representation.
- Add accessible controls to the existing viewer Components group.
- Preserve focus, selection, isolation, lazy loading, and camera behavior.

Affected areas:

- `apps/web/src/viewer/settings.ts`
- `apps/web/src/viewer/representationProjection.ts`
- `apps/web/src/viewer/MolstarEngine.ts`
- `apps/web/src/viewer/focusTargets.ts`
- `apps/web/src/components/ViewerControls.tsx`
- `apps/web/src/styles.css` only if contextual control treatment requires it
- frontend unit, adapter, and component tests

Acceptance criteria:

- All-hydrogen mode maps to `ignoreHydrogens: false` without a restrictive
  variant.
- Polar-only mode maps to `ignoreHydrogens: true` and
  `ignoreHydrogensVariant: "non-polar"`.
- No-hydrogen mode maps to `ignoreHydrogens: true` and the all-hydrogen ignore
  variant.
- Protein, complex, and ligand viewer projections receive the same semantics.
- Line, thin stick, thick stick, ball-and-stick, space-filling, and surface
  layers honor the mode.
- Entry-level inherited and exact selection-specific layers honor the same
  mode, including after style apply/reset and representation changes.
- Cartoon and backbone output is unchanged.
- Re-enabling non-polar hydrogens restores every existing explicit hydrogen.
- A structure without explicit hydrogens gains no atom or geometry.
- Aggregate ligand focus excludes hydrogen in polar-only mode and remains a
  deterministic heavy-atom target.
- Applying, undoing, redoing, and rebuilding preserves the exact camera,
  current selection, picking mode, focus/rotation center, and isolation.
- Hidden entries remain lazy; repeated toggles reuse the existing normalized
  structure query.
- Controls are explicitly named, keyboard operable, and explain the dependency
  on the master hydrogen control without copying an external product design.

Focused validation:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- \
  representations structure-loading viewer-adapter \
  viewer-toolbar project-workspace focus-targets
corepack pnpm --dir apps/web build
git diff --check
```

Documentation and migration implications: no additional migration. Record any
renderer limitation discovered by the focused tests without weakening the
approved protein-and-ligand outcome.

Expected commit:

```text
feat(viewer): add polar-only hydrogen display
```

Rollback and compatibility: Mol* state is disposable. Reverting the renderer
and UI before release restores all/none behavior without altering molecular
data; persisted non-default state must be handled with the Checkpoint 1
downgrade policy.

### Checkpoint 3 - Qualify scientific and user workflows

Concrete outcome:

- Add small explicit-hydrogen protein and ligand fixtures with known C-H and
  heteroatom-H connectivity.
- Add real-WebGL evidence for all three modes and every required invariant.
- Qualify desktop and Pixel 7 interaction and accessibility.

Affected areas:

- focused fixtures under `tests/fixtures/`
- `docs/FIXTURES.md`
- `tests/e2e/polar-hydrogen-visibility.spec.ts`
- relevant frontend unit/component and backend integration tests

Acceptance criteria:

- Protein and ligand fixtures each contain explicit carbon-bound and
  N/O/S-bound hydrogens with documented expected classification.
- All mode visibly renders both classes.
- Polar-only mode removes carbon-bound hydrogen geometry and retains
  heteroatom-bound hydrogen geometry.
- None mode removes all explicit hydrogen geometry.
- Re-enabling restores the original explicit hydrogen display.
- Representation changes and exact selection-specific styles cannot bypass the
  mode.
- Project responses prove atom count, atom IDs, bond count, coordinates,
  conformers, current artifact, warnings/inferences, and original artifact are
  unchanged except for viewer settings and expected project history.
- Original uploaded bytes remain byte-identical.
- Undo/redo, reload, checkpoint recovery, named-scene application, and archive
  round-trip retain exact mode behavior.
- A hydrogen-free structure gains no atom, bond, artifact, or rendered
  hydrogen geometry.
- Camera snapshots, current selection, picking mode, and isolation remain
  invariant across display toggles.
- Repeated toggles do not add normalized-structure requests.
- Desktop and mobile controls remain within viewport bounds, have no
  horizontal overflow, and pass scoped axe rules and keyboard workflows.
- Qualification uses real pinned Chromium/SwiftShader WebGL and does not claim
  cross-browser, hardware-GPU, WebXR, protonation, or hydrogen-bond evidence.

Focused validation:

```bash
.venv/bin/uv run pytest \
  tests/integration/test_viewer_state.py \
  tests/integration/test_archive_roundtrip.py \
  tests/scientific/test_release_fixture.py
corepack pnpm --dir apps/web test -- \
  representations structure-loading project-workspace
PLAYWRIGHT_BROWSERS_PATH=.playwright \
  corepack pnpm exec playwright test \
  tests/e2e/polar-hydrogen-visibility.spec.ts
git diff --check
```

Documentation and migration implications:

- Record fixture source or synthetic construction, checksum where appropriate,
  explicit connectivity, and exact scientific assertions.
- No new migration beyond `0009`.

Expected commit:

```text
test(viewer): qualify polar-only hydrogen visibility
```

Rollback and compatibility: test and fixture rollback changes no runtime or
persisted state. A failed scientific fixture blocks the feature rather than
causing scope reduction.

### Checkpoint 4 - Document the verified contract

Concrete outcome:

- Document architecture, schema/API, scientific, accessibility, performance,
  compatibility, migration, and evidence boundaries.
- Update project-level progress and the feature-plan completion log with only
  verified results.

Affected areas:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_SCHEMA.md`
- `docs/API.md`
- `docs/SCIENTIFIC_LIMITATIONS.md`
- `docs/ACCESSIBILITY.md`
- `docs/PERFORMANCE.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`
- this feature plan

Acceptance criteria:

- Documentation defines the three effective modes and their precedence.
- Mol*'s pinned polar-neighbor element set and connectivity dependency are
  explicit.
- Presentation filtering is clearly distinguished from molecular editing,
  hydrogen inference, protonation, and hydrogen-bond analysis.
- Atom-label independence, ligand-focus simplification, real-WebGL boundary,
  migration/downgrade behavior, archive compatibility, and performance
  expectations are explicit.
- Verification evidence maps every approved claim to a named passing unit,
  integration, component, migration, or browser workflow.
- Documentation does not claim cross-browser, hardware-GPU, chemical
  preparation, or absent evidence.
- The global `docs/PLAN.md` remains unchanged.

Focused validation:

```bash
.venv/bin/uv run ruff check apps/api packages/molweave_core tests
.venv/bin/uv run mypy apps/api packages/molweave_core
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
git diff --check
```

Documentation and migration implications: finalize D-047 and all public
documentation for migration `0009`; no additional data change.

Expected commit:

```text
docs(viewer): document polar-only hydrogen visibility
```

Rollback and compatibility: documentation-only rollback cannot change runtime
behavior, but merge is blocked if documentation and verified behavior disagree.

### Checkpoint 5 - Prepare and qualify MolWeave 0.5.0

Concrete outcome:

- Recheck the remote base, branches, tag/release collision, workflows,
  rulesets, branch protection, checks, reviews, and merge settings.
- Advance every authoritative version source to 0.5.0.
- Add accurate release notes and final evidence.
- Run the complete release gate and review the complete diff.

Affected areas:

- `pyproject.toml`
- `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- this feature plan
- compatibility tests that enumerate accepted producer versions

Acceptance criteria:

- All five authoritative version sources report `0.5.0`.
- Archive producer provenance advances to 0.5.0 while valid prior archives
  remain readable under schema version 1.
- Migration `0009` is Alembic head and isolated upgrade/downgrade behavior is
  verified.
- Focused and complete gates pass on the final candidate.
- Full `origin/master...HEAD` review finds no unresolved consequential scope,
  scientific, state-ownership, schema, migration, archive, renderer,
  representation, selection/camera, accessibility, performance, dead-code,
  debug-path, or compatibility issue.
- Release notes distinguish implemented, already-satisfied, simplified,
  deferred, rejected, and limited behavior.

Complete release gate:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright \
  corepack pnpm exec playwright test
git diff --check
```

Documentation and migration implications:

- Add the 0.5.0 release section, compatibility evidence, migration guidance,
  and final project records.
- Do not revise a public schema-major version solely for the additive field.

Expected commits:

```text
chore(release): prepare v0.5.0
docs(plan): record v0.5.0 release qualification
```

Rollback and compatibility:

- Before publication, revert release preparation and feature commits normally.
- Never reuse or move a published tag. A post-release defect requires a later
  compatible release.
- Do not publish or tag a partially reverted 0.5.0 build.

## Acceptance and verification evidence

Status at plan approval: planned; no implementation evidence is claimed.

| Approved claim | Required evidence |
|---|---|
| Three durable display modes | Schema/default, command/history, migration, scene, and archive integration tests |
| Correct protein and ligand polarity filtering | Explicit-connectivity scientific fixtures, representation-profile unit tests, and real-WebGL browser workflow |
| Consistency across representations | Exhaustive profile tests plus inherited and exact selection-style browser transitions |
| Re-enabling restores all explicit hydrogens | Unit state transition and real-WebGL before/after evidence |
| No addition or inference | Exact normalized/project/artifact/original-byte assertions, including a hydrogen-free fixture |
| Viewer-state invariance | Exact camera, selection, picking, isolation, and query-count assertions |
| Legacy compatibility | Migration from `0008` and archive producer fixtures through 0.4.0 |
| Safe downgrade | Successful default-only downgrade and explicit refusal for stored polar-only state |
| Accessibility and responsiveness | Keyboard, labels/help, focus, axe, bounds, and overflow evidence on desktop and Pixel 7 |
| No broader regression | Complete documented release gate and full-diff review |

Every checkpoint must update the progress log below with exact commands, pass
counts, known advisories, limitations, and commit IDs. A test name or planned
command is not passing evidence until it has run successfully on the relevant
candidate.

## Data, migration, API, UI, and quality implications

### Data and migrations

- Add no SQL table or column.
- Migration `0009` rewrites viewer-settings JSON in live entries, checkpoint
  entry state, and named-scene entry state with `nonpolar_hydrogens: true`.
- A non-default `false` value is meaningful user data. Downgrade must refuse to
  erase it in any of those locations.
- Molecular artifacts, originals, job artifacts, command retention, and
  normalized schemas are unchanged.

### Archive compatibility

- `ProjectManifestV1.schema_version` remains 1.
- Missing `nonpolar_hydrogens` defaults to `true` for valid legacy archives.
- A 0.5.0 archive preserves the exact value in entry and scene viewer settings.
- Application version remains producer provenance and not a structural
  compatibility gate.
- Older releases do not promise forward import of non-default 0.5.0 state.

### API

- `/api/v1` remains unchanged.
- No endpoint is added.
- Existing viewer-settings request and response objects gain one additive
  boolean field with a backward-compatible default.
- Generated TypeScript types remain aligned manually with the FastAPI contract
  under the repository's current convention.

### UI and viewer

- The existing Components fieldset gains explicit ordered labels for the
  hydrogen master and non-polar preference.
- The setting applies per active entry, consistent with other entry viewer
  settings.
- Mol* receives only the effective mode. It does not persist classification or
  viewer state.
- Existing serialized rebuild ownership preserves camera and selection.

### Scientific behavior

- The feature filters only explicit hydrogen atoms already present in the
  viewer projection.
- Polar-only is an operational covalent-neighbor display rule using the pinned
  Mol* element set N, O, S, F, Cl, Br, and I.
- Missing or inferred connectivity can affect display classification. MolWeave
  does not claim this control repairs source chemistry.
- The mode does not identify hydrogen bonds, validate protonation, determine
  donors/acceptors, or perform structure preparation.
- Atom labels remain a separate annotation layer.

### Accessibility

- Controls require explicit accessible names and descriptions.
- Keyboard users can change both settings and reach any dependency explanation.
- Busy state, mutation errors, and successful setting changes use existing
  accessible status patterns.
- Desktop and Pixel 7 layouts must remain within bounds without horizontal
  overflow.

### Performance

- A mode change uses the existing viewer-settings mutation and serialized
  disposable rebuild.
- It adds no chemistry process, worker task, API endpoint, or molecular payload.
- Repeated changes must reuse the artifact-keyed normalized-structure query.
- No new large-system performance claim is made; existing representation
  rebuild limitations remain documented.

### Security and jobs

- No new file, path, command, plugin, job, or external-input surface is added.
- Job snapshots, workers, events, artifacts, and plugin contracts are unchanged.

## Decisions and deviations

Approved decisions:

- Use one additive boolean rather than replacing the existing boolean with an
  enum. This preserves public field meaning and legacy data while still
  representing all three modes.
- Use Mol*'s pinned renderer classifier rather than adding a backend or
  normalized-structure polarity model.
- Treat polar-only classification as presentation semantics, not durable
  chemistry.
- Use heavy-atom ligand focus in polar-only mode rather than duplicating
  renderer connectivity semantics in application state.
- Leave atom labels independent because the issue concerns molecular
  representations, and exact polarity-aware label filtering would require a
  second classification path.
- Add a loss-preventing JSON migration and downgrade guard because viewer
  settings are durable user state.

Deviations from the issue or request:

- The issue's suggested checkbox is retained in substance, but exact grouping,
  wording, and dependency explanation follow MolWeave's existing Components UI.
- The issue examples mention N, O, and S. The pinned Mol* operational set also
  includes F, Cl, Br, and I and is documented exactly rather than silently
  narrowing library behavior.
- The request's lack-of-release-history premise is rejected as stale. Verified
  `v0.4.0` is the release baseline.
- No chemistry service, molecular inference, or new API is introduced merely
  to implement renderer presentation.

Qualification findings:

- The synthetic protein fixture retains a recognized SER polymer identity but
  uses non-template atom names. Standard SER names on an intentionally
  incomplete four-atom residue caused Mol* to add its existing component-
  template neighbors, invalidating the fixture's claimed three-bond graph.
  The corrected fixture locks its explicit `struct_conn` graph and does not
  alter production connectivity or weaken protein qualification.
- The local development supervisor already occupied ports 8000 and 5173 with
  a pre-checkpoint API process. Playwright configuration now accepts optional
  API, worker, web, and data-root environment overrides while retaining every
  existing default. Final focused evidence used isolated ports and a fresh data
  root so no stale service or shared SQLite state could satisfy the gate.

## Version and release plan

### SemVer determination

This work is a backward-compatible minor release from `0.4.0` to `0.5.0`.

Rationale:

- It adds a new user-visible viewer capability and durable preference.
- It adds an additive viewer-settings field to API, project, scene, checkpoint,
  and archive representations.
- It removes no public behavior and preserves existing all/none semantics by
  default.
- It requires a loss-aware data migration but no incompatible SQL, normalized,
  archive-major, project-major, or HTTP-major change.
- A patch would understate the feature. A major release would overstate its
  compatibility impact.
- A prerelease is unnecessary after focused and complete qualification passes.
- The repository has established final releases through v0.4.0; `v0.5.0` is
  the next non-colliding feature release.

Authoritative version sources to update only during Checkpoint 5:

1. `pyproject.toml`
2. `uv.lock`
3. `apps/web/package.json`
4. `apps/api/src/molweave_api/main.py`
5. `apps/api/src/molweave_api/archive_service.py`

### Pull request

- Title: `feat(viewer): add polar-only hydrogen visibility`
- Base: `master`
- Head: `feat/issue-1-polar-hydrogen-visibility`
- Body: include `Closes #1`; document implemented, already-satisfied,
  simplified, deferred, and rejected requirements; exact polar-neighbor
  semantics; scientific/accessibility/performance limitations; migration and
  archive compatibility; exact validation; SemVer impact; and follow-ups.
- Merge strategy: rebase-and-merge after explicit approval, complete
  validation, and full-diff review.
- Request review but do not claim independent review unless one is returned.
- Recheck branch protection, rulesets, checks, reviews, and unresolved
  conversations immediately before merge and do not bypass any requirement.

### Issue and follow-up handling

- Use `Closes #1` so GitHub closes the issue only when the feature PR merges.
- Publish the final issue reply only after the tag and release are remotely
  verified.
- The reply must distinguish delivered, already-satisfied, simplified,
  deferred, rejected, and limited behavior and state the exact scientific
  classification rule.
- Do not create speculative follow-up issues for chemistry, labels, or
  per-selection modes. Create one only if qualification exposes a bounded
  unresolved problem or the user approves additional product scope.

### Tag, release notes, and branch cleanup

- Proposed annotated tag: `v0.5.0`.
- Create it only from the verified merged commit on clean, fast-forwarded
  `master` after the complete final gate.
- Push and remotely dereference the annotated tag to that exact commit before
  creating the GitHub release.
- Never reuse or move an existing tag.

Release-note sections:

1. Highlights
2. Added
3. Hydrogen display semantics
4. Scientific limitations
5. Persistence and migrations
6. Accessibility and performance
7. Verification
8. Compatibility and deferred work

- If post-merge release, issue, or cleanup evidence changes tracked
  documentation, use a small documentation-only closeout branch and PR; do not
  move the tag.
- Delete the remote feature branch only after PR merge, annotated tag, GitHub
  release, issue reply, and any required closeout PR are remotely verified.
- Fast-forward local `master` to verified remote merged state before deleting
  the local feature branch.

## Merge and release blockers

Merge is blocked when any of the following is true:

- This approved plan was not the first feature-branch change or ceased to be
  the implementation contract without explicit approval.
- Protein or ligand polar-only behavior is missing, unreliable, or unverified.
- The feature adds, deletes, infers, or changes atoms, bonds, coordinates,
  conformers, chemistry, warnings/inferences, artifacts, or original bytes.
- Any relevant inherited, selection-specific, or surface representation
  bypasses the effective mode.
- Re-enabling non-polar hydrogens fails to restore all existing explicit
  hydrogens.
- A hydrogen-free structure gains hydrogen state or geometry.
- Apply/undo/redo/rebuild changes camera, focus, rotation center, current
  selection, picking mode, or isolation.
- Repeated changes refetch normalized molecular structures unnecessarily.
- Undo/redo, checkpoint/reopen/recovery, scene save/apply, archive import/export,
  or migration loses or silently changes the setting.
- Migration downgrade can silently discard a non-default value.
- Valid existing projects or v0.1.0 through v0.4.0 producer archives become
  unreadable.
- UI controls are ambiguously named, lack dependency explanation, are not
  keyboard operable, overflow supported layouts, or fail scoped accessibility
  checks.
- Documentation implies hydrogen-bond, protonation, preparation, or chemistry
  validation behavior.
- Any focused or complete validation command fails.
- `git diff --check` fails.
- Version sources disagree or documentation claims evidence that did not pass.
- Consequential full-diff findings or newly configured required checks,
  reviews, protections, rules, or conversations remain unresolved.

Release is additionally blocked when:

- The feature PR is not remotely verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The complete release gate did not pass on the PR's final state.
- `v0.5.0` already exists or points to another commit.
- Any authoritative version differs from `0.5.0`.
- The annotated tag cannot be pushed and remotely dereferenced to the exact
  merged commit.
- The GitHub release or final issue reply cannot be remotely verified.
- Release notes omit a material simplification, deferral, rejection, migration,
  compatibility boundary, scientific limitation, or failed evidence.

## Progress and completion log

| Date | State | Evidence and next action |
|---|---|---|
| 2026-08-09 | Plan proposed | Read-only inspection covered repository guidance, product/global plan/progress/decision/verification documentation, architecture, molecular/project schemas, API, migrations, jobs, frontend state ownership, viewer profiles and projection, controls, tests, related issues #2 and #7, local/remote branches, tags, releases, PR conventions, workflows, rules/protection, version sources, and release tooling. The current release history supersedes the request's stale no-history premise. |
| 2026-08-09 | Plan approved | User approved the additive durable setting, Mol* polar-neighbor display semantics, three-mode precedence, protein/ligand qualification, non-mutation invariants, migration/downgrade policy, checkpoints, and backward-compatible v0.5.0 release plan. |
| 2026-08-09 | Checkpoint 0 complete locally | Clean local `master` fast-forwarded from `origin/master` and verified at approved base `e3187b22e5da76ff22850b5c5fee1c32adad63e5`; created `feat/issue-1-polar-hydrogen-visibility`; persisted this plan and the concise project handoff without implementation changes; `git diff --check` passed. Commit and push this documentation-only checkpoint, then stop ready for `/goal`. |
| 2026-08-09 | Checkpoint 1 complete locally | Commit `ab9f21c59c527180de82bff857d221ffb07c8be1` added typed `components.nonpolar_hydrogens` defaults in backend and frontend state, Alembic `0009` coverage for live/checkpoint/scene JSON with loss-preventing downgrade refusal, durable undo/redo/scene/archive compatibility coverage, and accepted D-047. Focused Ruff passed; strict mypy passed across 50 source files; all 27 focused Python tests passed with 15 known Alembic configuration deprecation warnings; frontend TypeScript and `git diff --check` passed. |
| 2026-08-09 | Checkpoint 2 complete locally | Commit `209f362a22fbf9c11f5fd0b4f7f16cf12f05f620` added one typed effective-mode helper and projected all/polar-only/none to Mol* `ignoreHydrogens` and `ignoreHydrogensVariant` for every representation layer; no-hydrogen application filtering, exact targets, inherited/surface layers, hydrogen-free structures, heavy-atom ligand focus, query reuse, and explicit dependent controls have focused coverage. ESLint and TypeScript passed; both the approved focused Vitest command and the explicit control test run passed all 65 tests across 20 files; production build passed with the existing 966.42 KiB gzip lazy Mol* advisory and 154.84 KiB gzip initial bundle; `git diff --check` passed. |
| 2026-08-09 | Checkpoint 3 complete locally | Commit `5351029cd4074e97caa3279bb2f0f5771c4d3d7e` added checksum-locked explicit-connectivity protein and ligand fixtures and documented the exact C-H/O-H assertions. The focused Python gate passed 17 integration/scientific tests; the focused frontend run passed all 65 tests across 20 files; Ruff, ESLint, TypeScript, and `git diff --check` passed. From a fresh isolated data root migrated through `0009`, pinned Chromium/SwiftShader passed all 6 applicable scientific, durability, representation, state-invariance, archive, hydrogen-free, accessibility, bounds, and request-reuse workflows with 4 intentional cross-layout skips in 50.6 seconds. The default-port attempt was invalidated because it reused a pre-checkpoint local API; optional Playwright port/data-root overrides now preserve defaults and enable isolated evidence. |
| 2026-08-09 | Checkpoint 4 complete locally | Documented application/Mol* hydrogen ownership, effective-mode precedence, the pinned N/O/S/F/Cl/Br/I connectivity rule, additive API/project/archive compatibility, migration `0009` downgrade refusal, presentation-only scientific boundary, label and focus behavior, accessible dependent controls, rebuild/query reuse, and WebGL/performance limitations. The candidate evidence matrix maps every approved claim to passing named tests without claiming chemistry preparation or cross-browser/hardware behavior. Ruff passed; strict mypy passed across 50 source files; ESLint, TypeScript, and `git diff --check` passed. Accepted D-047 already owns the material cross-project decision; no additional decision was introduced. The coherent checkpoint commit is the commit containing this row. Next: checkpoint 5 version and release qualification. |
| 2026-08-09 | Checkpoint 5 release preparation complete locally | Re-fetched `origin/master` and verified it remains the feature base at `e3187b22e5da76ff22850b5c5fee1c32adad63e5`. No `v0.5.0` tag, GitHub release, or prior branch PR collides; issue #1 remains open; the repository exposes no workflow, branch protection, ruleset, required check, or required review; and rebase merge remains enabled. Advanced all five authoritative application versions to 0.5.0, retained v0.1.0 through v0.4.0 archive producer compatibility, and added release notes for implemented, already-satisfied, simplified, deferred, rejected, scientific, migration, accessibility, performance, and compatibility scope. `uv lock --check` and `git diff --check` passed. The coherent release-preparation commit is the commit containing this row. Next: complete release gate and full-diff review. |
| 2026-08-09 | Checkpoint 5 qualified locally | Release-preparation commit `df007c9087c8d8e7e4ada44e2c87f2c43041629b` advanced all authoritative versions. The complete gate passed frozen installs, normal-store Alembic `0008 -> 0009`, Ruff, strict mypy across 50 source files, all 209 Python tests with 15 known Alembic configuration deprecation warnings, ESLint, TypeScript, all 65 Vitest tests, all 7 supervisor tests, production build, and `git diff --check`. A fresh isolated store migrated `0001 -> 0009`; all 46 applicable desktop/mobile Playwright workflows passed with 34 intentional layout skips in 9.1 minutes. Build output retained the expected 966.42 KiB gzip lazy Mol* advisory and 154.84 KiB gzip initial bundle. Full local review found and fixed unsafe Playwright override interpolation (`59bd216`) and accidental existing-label capitalization (`d88291d`); rerun ESLint, TypeScript, all 65 Vitest tests, valid/invalid configuration checks, and all 6 applicable affected browser workflows passed with 4 intentional skips in 50.9 seconds. No unresolved consequential finding remains; the review is not claimed as independent. Next: base refresh, PR, remote review, merge, tag, release, issue reply, and cleanup. |
| 2026-08-09 | Remote delivery complete | [PR #26](https://github.com/ManuelSe/MolWeave/pull/26) rebase-merged to `bb60e921506ccdcfb19535b6b6cc5328c2b1718a`, closing issue #1. Annotated tag `v0.5.0` remotely dereferences to that exact commit; [GitHub release v0.5.0](https://github.com/ManuelSe/MolWeave/releases/tag/v0.5.0) is published, non-draft, and non-prerelease. The final issue reply is remotely visible and records delivered behavior, verification, migration/compatibility, scientific and scope limits, and no speculative follow-up. The requested `@codex review` integration did not return a review; the PR records the local review without claiming independence. The original feature branch was deleted locally and remotely after all delivery artifacts were verified. This documentation-only closeout does not move the released tag. |

Future checkpoint entries must record exact commits, commands, pass counts,
known warnings, limitations, remote identifiers, and the next action. Do not
mark the issue, PR, merge, tag, release, or branch cleanup complete until each
has been verified remotely.

## Completion

The approved scope is implemented, qualified, merged, released as v0.5.0, and
closed out on issue #1. All remote delivery artifacts and branch cleanup are
verified; no follow-up issue was required.
