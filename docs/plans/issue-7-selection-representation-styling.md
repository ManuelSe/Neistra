# Issue 7 - Selection-Based Representation Styling

Status: approved; implementation not started

## Issue metadata

- Issue: [#7 - Add selection-based molecular representation styling](https://github.com/ManuelSe/MolWeave/issues/7)
- Issue state at approval: open
- Issue author: `ManuelSe`
- Issue created: 2026-08-03
- Issue last updated at approval: 2026-08-03
- Plan approved: 2026-08-09
- Base branch: `master`
- Base commit at approval: `0526eb0b95db664a8d8fb837e75f9434090265f2`
- Planned feature branch: `feat/issue-7-selection-representation-styling`
- Planned application version: `0.4.0`
- Planned tag: `v0.4.0`
- Planned pull-request title: `feat(viewer): add selection-based representation styling`

This document is the approved implementation contract for issue #7. It
supplements, but does not replace, the global `docs/PLAN.md`. Changes to this
contract require explicit user approval and must be recorded in the decisions
and progress sections below.

## Core problem and approved outcome

MolWeave can persist one or more complete-entry representations, and its
application-owned component hierarchy can select protein, DNA, RNA, other
polymers, ligands, water, solvent/additives, ions/metals, other heterogens, and
unclassified material. It cannot give two subsets of the same structure
different representation styles. A scientist must therefore tolerate an
unclear all-entry view or split one molecular structure into artificial project
entries merely for display purposes.

The approved outcome is a compact, keyboard-accessible **Style selection**
action in the existing viewer toolbar. It applies a durable representation to
the exact canonical current selection without changing molecular data or
creating an entry. It supports:

- Lines.
- Thin sticks.
- Thick sticks.
- Ball-and-stick.
- Van der Waals spheres.
- Backbone for compatible polymer-residue selections.
- Cartoon for compatible polymer-residue selections.
- Reset to the entry-level inherited representation.

One atomic and one polymer representation channel may coexist on the same
atoms. This permits the primary protein-as-cartoon plus
selected-residues-as-sticks workflow without introducing unrestricted
representation layering.
Assignments within the same channel use replacement semantics. Different
structures and different subsets of one structure retain their own styles.

Applying or resetting a style is one application-owned, revision-checked,
undoable project command even when the current selection spans several entries.
It must preserve the current transient selection, selection granularity and
source, active picking mode, camera position/orientation/zoom/projection,
focus/rotation center, isolation, molecular artifacts, coordinates, topology,
chemistry, entry identity, and immutable original files.

Mol* remains a disposable renderer. It receives exact application-owned atom
memberships and representation profiles but never owns, serializes, or
classifies the durable assignments.

## Authority and assumptions

The plan applies this authority order:

1. User approval of this plan and any later explicit correction.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing molecular, project, API, archive, viewer, scene, command, and
   selection ownership boundaries.
4. Issue #7's underlying user problem, intended outcome, constraints, and
   explicit non-goals.
5. Technical and UI suggestions in the issue, which are non-binding.

Accepted decisions D-006, D-007, D-018 through D-020, D-022, D-023, D-035,
D-038, D-041 through D-045 remain authoritative:

- Every acknowledged durable change passes through the backend command bus.
- Canonical `(structure_id, atom_id)` references remain the one selection
  identity shared by every application surface.
- Current unsaved selection and ordinary camera state remain transient.
- Viewer settings and named scenes are typed application state, not Mol*
  snapshots.
- Mol* renders complete application state and is replaceable/disposable.
- Original uploads and normalized molecular artifacts remain unchanged by
  viewer-state edits.
- Component hierarchy membership is derived from normalized molecular state;
  styling does not persist or duplicate component-classification snapshots.
- Archive schema, rather than application version, governs structural import
  compatibility.

Implementation must append an accepted decision recording the selection-style
channel, persistence, replacement, and reconciliation contract. The feature
plan is not a substitute for that cross-project decision.

Planning assumptions:

- The existing persisted style value `stick` remains backward compatible and
  is presented to users as **Thin sticks**. A new `thick-stick` value provides
  the visibly heavier profile.
- Atomic styles are `line`, `stick`, `thick-stick`, `ball-and-stick`, and
  `space-filling`.
- Polymer styles are `backbone` and `cartoon`.
- Channel is derived and validated from style rather than stored as a second
  value that could disagree.
- Selection-specific colors, opacity, labels, and surfaces are separate
  product capabilities. Selection styles use element coloring and full opacity
  in this slice; entry-level surface and label layers remain independent.
- Atomic and polymer assignments are disjoint within their respective
  channels. Records with the same style are merged, bounding an entry to at
  most five atomic and two polymer assignments.
- Stable atom IDs, not Mol* loci, array positions, coordinates, display labels,
  or transient component objects, identify stored targets.
- The current derived hierarchy remains the convenient source for category and
  component selections, but a style persists exact atom IDs rather than a
  component snapshot. Coordinate edits therefore retain assignments, while
  topology deletion reconciles them.
- An atomic bond is drawn for a selection-specific atomic representation only
  when both endpoints are members of that target. No dangling half-bond or
  parent-structure bond may expose an unselected atom.
- Polymer assignments persist exact complete residue memberships. Mol* may use
  non-visible neighboring context internally only if necessary; no geometry
  outside the persisted target may appear styled. If this cannot be achieved
  safely for a selection, the operation is unavailable rather than silently
  expanded.
- Polymer styles accept complete supported protein, DNA, or RNA residues with
  usable trace data. Partial residues, mixed polymer/non-polymer selections,
  unsupported other-polymers, or missing trace data are rejected atomically
  with a clear explanation.
- Applying an atomic style to any valid non-empty atom selection is allowed.
- Reset removes both selection-specific channels from the exact selected atoms,
  revealing the applicable entry-level representation layers.
- A cross-entry current selection is handled as one command. A polymer request
  fails without mutation if any selected entry/atom makes the complete request
  incompatible.

## Repository findings

At approval, clean local `master`, local `origin/master`, and remote `master`
all matched `0526eb0b95db664a8d8fb837e75f9434090265f2`. The remote exposes only
the `master` branch. It has verified annotated tags and published GitHub
releases `v0.1.1`, `v0.2.0`, `v0.2.1`, and `v0.3.0`; the issue prompt's premise
that MolWeave lacks established tag/release history is therefore stale.

The repository has no `.github` workflow, configured branch protection,
repository ruleset, required status check, or required review at approval.
Releases are prepared through documented local gates, rebase-merged pull
requests, annotated tags on verified merged `master`, GitHub releases, and
verified issue replies. This remote state must be checked again before merge
and release and may not be bypassed if it changes.

Current authoritative versions are `0.3.0` in `pyproject.toml`, `uv.lock`,
`apps/web/package.json`, FastAPI metadata in
`apps/api/src/molweave_api/main.py`, and archive producer provenance in
`apps/api/src/molweave_api/archive_service.py`.

`ViewerSettings` currently stores one to twelve complete-entry
representations, coarse component visibility, and labels in the
`structure_entries.viewer_settings` JSON column. Checkpoint documents and named
scene entry states copy the same application-owned settings. Migration `0005`
introduced this domain. `ProjectService.update_viewer_settings` replaces one
entry's complete settings through a reversible `entry.update` command, while a
scene applies all saved entry viewer states in one command.

The frontend advanced display drawer can layer `cartoon`, `backbone`, `line`,
`stick`, `ball-and-stick`, `space-filling`, and `surface` over an entire entry.
Mol* currently creates one application-membership component per visible entry
and attaches every configured representation to it. `stick` maps to Mol*
ball-and-stick with a reduced sphere/bond profile. There is no target membership on
a representation and no selection styling API.

The issue #2 hierarchy already provides stable category and individual
component selection through canonical atom references, including modifier
semantics. It deliberately assigned selection styling to issue #7. A new
Molecule or Component selection granularity is unnecessary: the hierarchy
materializes exact atom selections that every existing tool can consume.

The existing viewer toolbar is always accessible and already owns transient
picking and explicit focus actions. Its unavailable-action pattern retains a
button in the tab order with `aria-disabled`, suppresses activation, and exposes
the reason on focus or hover. The styling entry point should reuse this pattern.

Mol* 5.11 supports independent component subsets and representations.
Its ball-and-stick representation exposes deterministic `sizeFactor` and
`sizeAspectRatio` parameters and defaults `includeParent` to false. Its public
documentation describes cartoon as a ribbon/arrow/coil secondary-structure
view and spacefill as element-radius van der Waals spheres. A distinct Ribbon
product value would duplicate Cartoon without an approved independent semantic.

The provided Maestro screenshot and current public Schrödinger documentation
show the useful workflow principle: common atom styles are close to the
workspace and operate on atom subsets. MolWeave will use only that interaction
principle. It will not copy Maestro's layout, icons, terminology, colors, or
other proprietary visual design. Relevant research:

- <https://www.schrodinger.com/platform/products/maestro/>
- <https://learn.schrodinger.com/public/python_api/2025-3/api/schrodinger.structure.html>
- <https://molstar.org/viewer-docs/glossary/>
- <https://molstar.org/viewer-docs/managing-the-display/>
- <https://molstar.org/molstar-components/state-builder-docs.html>

Related issues retain separate ownership:

- Issue #1: polar versus non-polar hydrogen visibility.
- Issue #11: ligand-of-interest designation and ligand-centric analysis.
- Issue #20: durable component names and classification overrides.
- Issue #21: scientifically defined component subset extraction/export.

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment |
|---|---|---|
| Apply a representation directly to current selection | Essential | Toolbar action submits canonical `SelectionV1` to one project command. |
| Lines | Essential | Exact atomic target; inherited atomic layers excluded on that target. |
| Thin sticks | Essential | Existing `stick` value, consistently labelled Thin sticks. |
| Thick sticks/licorice/tubes | Essential | New `thick-stick` value, labelled Thick sticks; no Maestro terminology. |
| Ball-and-stick | Essential | Exact atomic target using the existing public representation. |
| VDW/space-filling spheres | Essential | Existing `space-filling` value, labelled Van der Waals spheres with explanatory text. |
| Backbone | Essential | Exact compatible complete-polymer-residue target. |
| Cartoon | Essential | Exact compatible complete-polymer-residue target. |
| Separate Ribbon or Tube polymer representation | Rejected as proposed | Cartoon already has ribbon semantics; adding a duplicate name has no defensible distinct contract. No follow-up is needed without a distinct requested behavior. |
| Different styles within one structure | Essential | Disjoint per-channel atom assignments coexist in one entry. |
| Protein cartoon plus selected side-chain sticks | Essential | Polymer and atomic channels coexist on the same residue atoms. |
| Styling leaves unrelated atoms unchanged | Essential | Replacement subtracts only exact selected IDs in the matching channel. |
| Apply across more than one selected entry | Supporting | One atomic multi-entry command; polymer request validates all targets first. |
| Replace previous atom-based style | Essential | Same-channel assignment algebra is deterministic and disjoint. |
| Replace previous polymer style | Essential | Same-channel assignment algebra is deterministic and disjoint. |
| Reset to inherited/default style | Essential | Remove selected IDs from both targeted channels. |
| Remove representation as a separate operation | Optional | Reset supplies the useful initial behavior; no separate hide/remove semantic is added. |
| Add/layer representation within one channel | Deferred | Requires ordering, removal, editing, limits, and conflict UI. Create a focused follow-up only with product demand. |
| Boundary-bond handling | Supporting | Atomic bond renders only when both endpoints are in the exact target; tested on a covalent component boundary. |
| Neighbor context for polymer rendering | Supporting | Context may be renderer-internal but cannot emit unrelated visible styled geometry. Unsafe targets are rejected. |
| Empty-selection disabled state and reason | Supporting | Reuse the toolbar's focusable `aria-disabled` pattern. |
| Unsupported polymer-style reason | Essential | UI preflight plus authoritative backend validation and atomic error. |
| Selection remains highlighted | Essential | Rebuild restores the same canonical selection. |
| Picking mode remains unchanged | Essential | Styling has no picking-store mutation. |
| Camera/focus/rotation center remains unchanged | Essential | Capture/restore application camera around the disposable rebuild and assert exact equality. |
| Keyboard access | Essential | Named toolbar action and dialog controls; Escape and focus restoration. |
| Representation names/icons consistent | Supporting | One MolWeave label catalog; original Lucide/general-purpose iconography, no copied assets. |
| Selection context-menu duplicate | Optional and deferred | The always-accessible toolbar path is sufficient. Add only if usability evidence justifies duplicate commands. |
| Optional display presets | Deferred | Automatic nearby residues/solvent need explicit distance, visibility, ambiguity, and overwrite policies. Create a follow-up after the base capability if desired. |
| Presets implemented as ordinary assignments | Supporting future constraint | Any follow-up must call this command model, not add opaque viewer state. |
| Persistence on reopen/checkpoint | Essential | Viewer settings, project snapshots, migration, and archive round trips cover it. |
| Named scenes retain selection styles | Essential | Scene entry states contain complete extended viewer settings. |
| One undoable operation | Essential | One multi-entry backend command with exact forward/inverse states. |
| Styling does not alter molecular data | Essential | Artifact IDs, normalized data, coordinates, topology, and originals remain invariant. |
| Stable target rather than transient highlight | Essential | Persist stable entry-local atom IDs; API command snapshots canonical references. |
| Atom/residue/chain/structure selections | Essential | Already materialize canonical atoms and feed the same action. |
| Automatic category/component selections | Already satisfied; reused | v0.3.0 hierarchy nodes feed the same action. |
| Molecule selection mode | Rejected as duplicate | Stable hierarchy components already solve the intended workflow without a new granularity. |
| Selection-specific color, transparency, labels | Deferred | Require independent precedence and UI contracts. Recommend one advanced presentation follow-up. |
| Selection-specific surface | Deferred | Surface boundary, large-structure degradation, and cost need a focused contract. Include in the advanced presentation follow-up. |
| Changing coordinates, bonds, atom types, or secondary structure | Rejected/out of scope | This is viewer state only. |
| Docking or ligand-of-interest semantics | Rejected/out of scope | Core remains docking-neutral; issue #11 owns ligand designation. |
| Polar-only hydrogen behavior | Deferred to existing issue | Issue #1 remains the source of truth. |
| Copy Maestro layout, terminology, or icons | Rejected | Conflicts with `docs/PRODUCT_SPEC.md`. |

## Accepted scope

### Durable model

Add `selection_representations` to `ViewerSettingsV1`:

```text
SelectionRepresentationV1
  style: line | stick | thick-stick | ball-and-stick |
    space-filling | backbone | cartoon
  atom_ids: sorted, unique, non-empty positive stable atom IDs

ViewerSettingsV1
  representations: existing complete-entry layers
  selection_representations: SelectionRepresentationV1[] = []
  components: existing component visibility
  labels: existing label visibility
```

Validation requires:

- At most one record for each supported style.
- Every atom ID exists in its containing current entry.
- IDs are canonical, sorted, and unique.
- Records in the same derived channel are disjoint.
- Empty records are removed rather than persisted.
- Polymer records contain complete supported residue memberships with the
  required normalized trace evidence.
- Existing complete-entry `stick` remains accepted and rendered compatibly.
- `thick-stick` is accepted for both complete-entry and targeted settings so
  representation names remain consistent throughout the application.

### Command and API

Add a project-level endpoint consistent with existing revisioned mutations:

```text
POST /api/v1/projects/{project_id}/selection-representations

expected_revision: non-negative integer
selection: SelectionV1
action: apply | reset
style: required for apply; absent for reset
```

The service validates the complete canonical selection before creating any
forward action. For `apply`, it partitions references by entry, subtracts each
entry's selected IDs from every assignment in the requested channel, merges
the IDs into the requested style, canonicalizes the result, and updates all
affected entries. For `reset`, it subtracts the selected IDs from both channels.
It records complete before/after viewer settings for every affected entry,
affected entry IDs, and the exact selection snapshot. A rejected request does
not increment revision or partially modify an entry.

The command description names the user-facing style and selected atom/entry
count. Undo and redo restore complete prior/next settings as one revisioned
operation. Ordinary entry-level viewer-setting controls continue to use the
existing endpoint and must preserve selection assignments when changing global
representations, colors, opacity, component visibility, or labels.

### Topology reconciliation

Extend the existing atom-reference reconciliation performed by molecular edit
commands:

- Remove deleted atom IDs from the affected entry's live selection styles.
- Remove empty style records.
- Apply the same pruning to every named scene entry state for that entry.
- Include exact inverse viewer settings/scene states so undo restores styles.
- New atoms are not styled implicitly.
- Coordinate-only edits do not change assignment membership.
- Entry deletion already removes the complete entry and scene entry state; undo
  restores them.

### Viewer projection

For each visible, non-isolated or isolated entry:

1. Derive the current visible atom membership from application component and
   hydrogen settings.
2. Intersect selection assignments with visibility and isolation.
3. For each complete-entry atomic representation, render visible atoms minus
   the union of selection-specific atomic targets.
4. For each complete-entry polymer representation, render visible atoms minus
   the union of selection-specific polymer targets.
5. Leave surface and other independent complete-entry layers unaffected.
6. Build one exact component per non-empty selection-style record and attach
   its deterministic representation profile.
7. Use `includeParent: false` and verify two-endpoint boundary bonds.
8. Restore the application camera and canonical highlight after rebuild.

Thin and thick stick parameter profiles must be named, centralized, visibly
distinct, unit-tested at the Mol* adapter boundary, and qualified in real WebGL.
The exact visual constants may be tuned during Checkpoint 2 without changing
the public product contract, but may not become user-configurable in this
issue.

At or above the existing 250,000-atom reduced-detail threshold, selection
surfaces are irrelevant because they are not supported. Atomic and polymer
selection styles remain eligible unless profiling shows that a particular
request cannot render responsibly; any new degradation must be visible and
documented rather than silent.

### User interface

Add one original MolWeave quick action to `ViewerToolbar`. It opens a compact
dialog/panel with:

- Current selection atom and entry counts.
- An Atom detail group containing the five atomic styles.
- A Polymer group containing Backbone and Cartoon.
- Reset to entry defaults.
- Concise help for inherited versus selection-specific representations.

The launcher remains focusable but `aria-disabled` when the selection is empty,
busy, or otherwise cannot be acted on, and exposes the reason on focus/hover.
Atomic actions remain available for every valid non-empty selection. Polymer
buttons expose selection-specific reasons when unavailable. Native buttons,
visible pressed/busy feedback where applicable, semantic grouping, Escape
closure, and focus restoration are required. Mobile layout must remain within
the Pixel 7 viewport without horizontal overflow.

Successful application closes or leaves the panel in one consistently tested
state, retains selection highlight, and reports success without intercepting
the viewer. Backend validation errors remain visible and do not change current
selection or camera.

## Non-goals

- Selection-specific colors, color schemes, opacity, transparency, labels, or
  surfaces.
- User-editable stick radii, sphere scales, cartoon thickness, or other detailed
  Mol* parameters.
- Same-channel additive layering, arbitrary layer ordering, or per-assignment
  edit/delete lists.
- A separate Hide selection representation that changes component visibility.
- Automatic protein-ligand, small-molecule, compact-overview, binding-site, or
  solvent presets.
- Automatic nearby-residue, nearby-water, active-site, metal-coordination, or
  ligand-of-interest inference.
- A second context-menu path.
- A new Molecule/Component selection granularity or persisted component
  selection model.
- Durable component names/reclassification, ligand designation, or component
  extraction/export.
- Polar/non-polar hydrogen classification.
- Molecular coordinate, topology, element, charge, bond, secondary-structure,
  validation, preparation, or editing changes.
- Docking-specific concepts or behavior.
- Copying Maestro controls, assets, terminology, layout, or visual design.

## Milestones and checkpoints

Every checkpoint must leave a coherent, independently verifiable branch state.
Focused failures are fixed before the checkpoint commit. Commands run from the
repository root with the documented project-local environments.

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Create the approved feature branch from clean, fast-forwarded `master`.
- Persist this document as the detailed source of truth.
- Record the concise handoff in `docs/PROGRESS.md`.
- Do not begin implementation.

Affected areas:

- `docs/plans/issue-7-selection-representation-styling.md`
- `docs/PROGRESS.md`

Acceptance criteria:

- The approved scope, dispositions, milestones, release plan, blockers, and
  progress log are present.
- The global `docs/PLAN.md` is unchanged.
- No implementation file is changed.
- Branch and base commit match the approved metadata.

Focused validation:

```bash
git diff --check
git status --short --branch
```

Documentation/migration implications: documentation only; no migration.

Expected commit:

```text
docs(plan): add approved plan for issue 7
```

Rollback/compatibility: revert the documentation commit before implementation;
no application behavior or data changes.

### Checkpoint 1 - Establish durable selection-style assignments

Concrete outcome:

- Add typed assignment models and validation.
- Add pure deterministic apply/reset algebra.
- Add migration `0008` for live entries, checkpoints, and scene entry states.
- Add one project-level command/API mutation.
- Extend molecular-edit and scene reconciliation.
- Preserve archives and undo/redo.
- Append the accepted architectural decision.

Affected areas:

- `apps/api/src/molweave_api/schemas.py`
- `apps/api/src/molweave_api/viewer_state.py`
- `apps/api/src/molweave_api/project_service.py`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `apps/api/migrations/versions/0008_*.py`
- API client/types needed to represent the additive response
- focused unit and integration tests
- `docs/DECISIONS.md`

Acceptance criteria:

- Empty, stale, duplicate, noncanonical, overlapping, and incompatible targets
  reject without state change.
- Valid single- and multi-entry atomic application is one command.
- Valid complete-polymer application is one command; partial or mixed targets
  reject atomically with a useful reason.
- Applying a style changes only the matching channel's selected membership.
- Reset changes only exact selected memberships in both channels.
- Same-style assignments merge; empty assignments disappear.
- Undo/redo, checkpoint/save/revert/reopen, scene save/apply, archive export/
  import, and history descriptions retain exact state.
- Atom deletion reconciles live and scene assignments; undo restores them.
- Coordinate edits and topology additions retain existing targets.
- Existing v0.1.x, v0.2.x, and v0.3.0 archives import with empty default
  assignments and unchanged originals.

Focused validation:

```bash
.venv/bin/uv run ruff check apps/api packages/molweave_core tests
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest \
  tests/unit/test_commands.py \
  tests/unit/test_history.py \
  tests/integration/test_viewer_state.py \
  tests/integration/test_archive_roundtrip.py \
  tests/integration/test_ligand_edits.py \
  tests/integration/test_protein_edits.py \
  tests/security/test_archive_safety.py
git diff --check
```

Run an isolated Alembic upgrade from the preceding revision and through head,
including populated legacy entry/checkpoint/scene JSON fixtures.

Documentation/migration implications:

- Append the durable channel/assignment/reconciliation decision.
- Add data migration `0008`; no SQL table or column is expected.
- Retain `ProjectStateV1`, `ProjectManifestV1.schema_version: 1`,
  `NormalizedStructureV1.schema_version: 1`, and `/api/v1`.
- Downgrade must not silently erase non-empty assignments. It must fail with a
  clear recovery requirement or preserve data in a demonstrably safe form.

Expected commit:

```text
feat(viewer): persist selection representation styles
```

Rollback/compatibility:

- Application rollback is safe before selection assignments exist.
- After assignments exist, use a verified database backup or reset/export them
  explicitly before running an older application; older releases do not promise
  forward compatibility with v0.4.0 archives.
- Existing archives and projects remain backward inputs to v0.4.0.

### Checkpoint 2 - Render exact application-owned targets

Concrete outcome:

- Project inherited and selection-specific representation memberships into
  disposable Mol* components.
- Add the thick-stick representation profile.
- Preserve camera, selection, visibility, isolation, and performance behavior.

Affected areas:

- `apps/web/src/api/types.ts`
- `apps/web/src/viewer/settings.ts`
- `apps/web/src/viewer/MolecularViewer.ts`
- `apps/web/src/viewer/MolstarEngine.ts`
- `apps/web/src/viewer/componentVisibility.ts` or a focused projection helper
- `apps/web/src/components/StructureViewer.tsx`
- frontend unit/adapter tests

Acceptance criteria:

- Inherited atomic and polymer memberships exclude only overridden atoms from
  the same channel.
- Independent surface/label/color/component settings retain current behavior.
- Every targeted component is an exact intersection of persisted membership,
  current visibility, and isolation.
- Thin and thick sticks are visibly and parametrically distinct.
- Only two selected endpoints create a target atomic bond.
- Protein cartoon plus selected residue sticks coexist.
- Selection highlighting remains exact after every rebuild.
- Camera state is exactly preserved across apply/reset/undo/redo.
- Hidden entries remain lazy; repeated setting changes do not refetch normalized
  structures.
- Existing large-structure degradation remains visible and correct.

Focused validation:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- \
  representations structure-loading viewer-adapter component-hierarchy
corepack pnpm --dir apps/web build
git diff --check
```

Documentation/migration implications: no additional migration; record any
verified renderer-specific boundary limitation without changing the approved
public contract.

Expected commit:

```text
feat(viewer): render selection representation styles
```

Rollback/compatibility: renderer state is disposable; persisted assignments
remain application-owned and undo/resettable.

### Checkpoint 3 - Add accessible selection styling controls

Concrete outcome:

- Add the always-accessible toolbar launcher and responsive style dialog/panel.
- Route actions through the project mutation path with accurate eligibility,
  busy, success, and error states.

Affected areas:

- `apps/web/src/components/ViewerToolbar.tsx`
- a focused selection-style component
- `apps/web/src/components/StructureViewer.tsx`
- `apps/web/src/components/WorkspaceCanvas.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/api/client.ts`
- `apps/web/src/styles.css`
- component tests

Acceptance criteria:

- Empty selection keeps a named, focusable unavailable action with a reason.
- Atomic styles are available for every valid non-empty selection.
- Polymer style eligibility and reasons match backend rules.
- All controls are keyboard reachable, named, grouped, and operable.
- Escape closes the dialog/panel and restores focus to its launcher.
- Applying/resetting reports outcome and retains current selection and picking
  mode.
- Controls remain within desktop and Pixel 7 bounds with no horizontal
  overflow.
- No copied Maestro asset, icon, terminology, layout, or color treatment is
  introduced.

Focused validation:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test -- \
  viewer-toolbar project-workspace representations structure-loading
corepack pnpm --dir apps/web build
git diff --check
```

Documentation/migration implications: none beyond Checkpoint 1.

Expected commit:

```text
feat(viewer): add selection styling controls
```

Rollback/compatibility: removing the UI cannot mutate molecular data; existing
commands remain revisioned and reversible.

### Checkpoint 4 - Qualify scientific and user workflows

Concrete outcome:

- Add focused integration and real-WebGL browser evidence for the complete
  issue workflow, boundary cases, persistence, and invariants.

Affected areas:

- new `tests/e2e/selection-styling.spec.ts`
- focused frontend/backend tests
- existing `1STP` and component-hierarchy fixtures
- add a small redistributable fixture only if existing data cannot prove an
  approved boundary invariant; document its source and checksum if added

Acceptance criteria and evidence:

- `1STP` demonstrates protein Cartoon, ligand Thick sticks, and selected
  binding-site residues Thin sticks in one entry.
- The hierarchy fixture demonstrates an ion as Van der Waals spheres and water
  as Ball-and-stick, including the covalent boundary rule.
- Atom, residue, chain, structure, category, individual component, and
  saved-selection reload paths feed the same command.
- Different same-entry targets coexist and unrelated membership remains exact.
- Complete project reads prove one revision/command per application and exact
  undo/redo state.
- Named scenes preserve styles and restore them with camera/selection behavior.
- Save, reopen, interrupted-session recovery, and portable archive round trip
  preserve assignments.
- Ligand and protein atom deletion prune targets and undo restores them.
- Exact camera snapshots, current selection, picking mode, coordinates,
  topology, molecular artifacts, original artifact IDs/bytes, and component
  classification remain invariant under style-only actions.
- Empty/incompatible actions remain no-ops with visible reasons.
- Real SwiftShader WebGL remains nonblank through apply/reset/undo/redo and
  proves the requested components/representation parameters through the typed
  adapter boundary.
- Desktop and Pixel 7 keyboard, focus restoration, axe, viewport, and overflow
  checks pass.
- One artifact-keyed normalized structure request serves repeated style
  operations after initial load.

Focused validation:

```bash
.venv/bin/uv run pytest \
  tests/integration/test_viewer_state.py \
  tests/integration/test_archive_roundtrip.py \
  tests/integration/test_ligand_edits.py \
  tests/integration/test_protein_edits.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/selection-styling.spec.ts \
  tests/e2e/structure-hierarchy.spec.ts \
  tests/e2e/synchronized-selection.spec.ts \
  tests/e2e/viewer-controls.spec.ts
git diff --check
```

Documentation/migration implications: capture exact fixture/evidence and any
scientific boundary finding; do not weaken accepted requirements silently.

Expected commit:

```text
test(viewer): qualify selection styling workflows
```

Rollback/compatibility: tests and fixtures only; no runtime data change.

### Checkpoint 5 - Document the verified contract

Concrete outcome:

- Document the implemented ownership, API/schema, behavior, scientific limits,
  accessibility, performance, compatibility, and evidence without claiming
  deferred functionality.

Affected areas:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_SCHEMA.md`
- `docs/API.md`
- `docs/ACCESSIBILITY.md`
- `docs/PERFORMANCE.md`
- `docs/SCIENTIFIC_LIMITATIONS.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- this feature plan

Acceptance criteria:

- Documentation distinguishes entry-level inherited representations from
  selection-specific atomic and polymer replacement channels.
- Exact identity, boundary, compatibility, migration, reconciliation, camera,
  selection, and Mol* ownership semantics match executable evidence.
- Accessibility and performance claims identify their automated/manual bounds.
- Presets, same-channel layering, context menu, ribbon alias, colors, opacity,
  labels, surfaces, molecule granularity, hydrogen filtering, component
  overrides/export, ligand designation, and docking are not claimed.
- Verification maps every approved user-visible claim to passing evidence.

Focused validation:

```bash
.venv/bin/uv run ruff check apps/api packages/molweave_core tests
.venv/bin/uv run mypy apps/api packages/molweave_core
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
git diff --check
```

Documentation/migration implications: final documentation for migration `0008`
and unchanged public schema versions.

Expected commit:

```text
docs(viewer): document selection styling semantics
```

Rollback/compatibility: documentation follows verified behavior and can be
reverted independently only if the associated claims are removed elsewhere.

### Checkpoint 6 - Prepare and qualify MolWeave 0.4.0

Concrete outcome:

- Align every authoritative application version.
- Add release notes and archive producer compatibility evidence.
- Pass the complete release gate on the final branch state.
- Review the complete diff and record qualification evidence.

Affected areas:

- `pyproject.toml`
- `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `tests/integration/test_archive_roundtrip.py`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- this feature plan

Acceptance criteria:

- All five authoritative sources report `0.4.0`.
- Archive round trips retain producer provenance through `0.3.0` and selection
  assignments for `0.4.0` output.
- Release notes accurately classify implemented, simplified, deferred, and
  rejected issue scope.
- Migration head and downgrade policy are verified.
- Every focused and complete gate passes on the final candidate.
- The complete `origin/master...HEAD` diff has no unresolved consequential
  finding, debug/test-only production path, dead code, or unsubstantiated
  scientific claim.
- Remote branch, tag, release, protection, ruleset, check, and review state are
  rechecked before PR and release actions.

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
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

Documentation/migration implications: publish final migration, compatibility,
evidence, and release documentation.

Expected commits:

```text
chore(release): prepare v0.4.0
docs(plan): record v0.4.0 release qualification
```

Rollback/compatibility: do not release a candidate whose database downgrade,
old-project/archive import, or selection-style preservation policy is
unverified.

## Acceptance and verification evidence

The feature is complete only when passing evidence supports all of the
following claims:

| Claim | Required evidence |
|---|---|
| Exact durable assignment algebra | Pure backend tests for canonicalization, channel subtraction, merging, reset, overlap rejection, and multi-entry atomicity |
| Polymer compatibility | Normalized protein/DNA/RNA complete-residue acceptance and partial/mixed/unsupported/missing-trace rejection tests |
| Command/history behavior | Integration evidence for one revision, description/selection snapshot, undo, redo, branching, checkpoint, and recovered dirty state |
| Topology reconciliation | Ligand/protein deletion plus scene/live assignment prune and undo restoration |
| Archive compatibility | Exhaustive v0.1.0 through v0.3.0 producer imports plus v0.4.0 style round trip and immutable original-byte equality |
| Exact Mol* projection | Adapter tests for inherited exclusions, targeted bundles, channel coexistence, two-endpoint bonds, visibility, isolation, and stick profiles |
| Camera and selection invariance | Named real-WebGL camera snapshots and exact selection/picking state before/after apply/reset/undo/redo |
| Mixed scientific workflow | Real-WebGL protein/cartoon, ligand/thick-stick, residue/thin-stick, ion/VDW, and water/ball-and-stick workflow |
| Scene persistence | Save/apply scene after later style changes with exact viewer settings, camera, and selection behavior |
| Molecular invariance | Project/artifact/normalized coordinates/topology/original bytes unchanged by style commands |
| Accessible UI | Component tests plus desktop/Pixel 7 keyboard, focus restoration, `aria-disabled` reasons, axe, bounds, and overflow evidence |
| Performance | No normalized refetch for repeated styling, bounded seven assignment groups per entry, existing 1STP budget retained, and no eager hidden-entry load |

Manual evidence remains supplementary and is limited to subjective readability
of the thin/thick visual distinction, selection highlight visibility against
each style and theme, and 200% zoom inspection. Functional, identity,
persistence, accessibility, and WebGL-state claims require automation.

## Data, migration, API, UI, and quality implications

### Data and migrations

- Migration `0008` is a JSON data migration, not a new table/column.
- Current entry settings, checkpoint entry settings, and named-scene entry
  settings receive `selection_representations: []` when absent.
- The application model also defaults the field for legacy data validation.
- Non-empty targeted state must not be silently discarded on downgrade.
- `ProjectStateV1` and normalized molecular schema version 1 remain unchanged.
- Molecular artifacts and immutable originals are never rewritten.

### Archive compatibility

- `ProjectManifestV1.schema_version` remains 1 because the field is additive
  and has an empty legacy default, consistent with accepted schema evolution.
- v0.4.0 imports valid archives produced by v0.1.0 through v0.3.0.
- v0.4.0 exports include targeted settings and application-version provenance.
- Older MolWeave releases do not promise forward import of v0.4.0 archives;
  this limitation must be explicit. No release may imply forward compatibility.
- Original upload files and all required current artifacts retain checksum and
  byte equality through round trip.

### API

- `/api/v1` remains the major prefix.
- Project/entry/scene viewer settings gain one additive typed field.
- One project-level revisioned apply/reset endpoint is added.
- Existing entry viewer-settings updates must round-trip the new field.
- Structured validation errors explain empty/stale targets and polymer
  incompatibility.
- No normalized-structure, job, export, or docking contract changes.

### UI and interaction

- One always-accessible toolbar launcher is the sole new entry point.
- Existing advanced full-entry Display controls remain available and preserve
  targeted settings.
- Current selection stays visibly highlighted; style is not communicated by
  highlight color alone.
- Success/error notices cannot block pointer access to the viewer.
- No automatic camera, focus, selection, isolation, or active-entry change.

### Scientific behavior

- A representation is visualization state, not a chemistry or structure claim.
- Van der Waals spheres use Mol* element-radius rendering; they do not calculate
  steric complementarity, clashes, contacts, or energies.
- Cartoon/backbone availability follows current normalized polymer evidence and
  usable trace atoms; it does not infer or change secondary structure.
- Component category provenance and ambiguity remain visible. Styling a
  putative ligand does not designate a ligand of interest.
- Boundary bonds are deliberately exact-target, two-endpoint geometry. No bond,
  atom, cap, valence, or missing context is inferred.

### Accessibility

- The launcher and every style/reset action have stable accessible names.
- Unavailable actions remain understandable without hover-only content.
- Dialog/panel focus is contained and restored, with Escape support.
- Style groups and selection counts are semantic DOM content.
- Canvas atoms remain outside the screen-reader object model; synchronized
  hierarchy, selection summary, inspector, and controls remain alternatives.
- Style is never the only carrier of selection or warning state.

### Performance

- Records with the same style merge and same-channel memberships are disjoint,
  bounding selection components to seven per entry.
- Viewer changes reuse the artifact-keyed normalized query and existing
  application membership; no complete normalized payload is sent in the style
  command.
- The command sends canonical selected references and returns normal project
  state; no Mol* snapshot or molecular artifact is serialized.
- Disposable full rebuild remains accepted for viewer-setting changes, with
  camera/selection preservation. Incremental Mol* mutation remains deferred
  unless profiling proves the current path fails the existing budget.
- Hidden entries remain unloaded until an explicit action needs their molecular
  state; styling an explicitly selected hidden entry is such an intentional
  load.

### Security

- The feature executes no user code and accepts no Mol* query expression.
- Every reference is validated against the current project and stable atom IDs.
- Existing request-size, optimistic revision, archive-size, and JSON validation
  boundaries remain in force.
- No path, artifact publication, job, plugin, or filesystem behavior changes.

## Decisions and deviations

Approved decisions:

1. Use exact stable atom assignments embedded in application viewer settings,
   not persisted Mol* components or hierarchy snapshots.
2. Use two replacement channels so atomic detail can coexist with polymer
   context while avoiding unrestricted layer ordering.
3. Keep `stick` as the compatible value and expose the user-facing name Thin
   sticks; add `thick-stick` rather than renaming stored legacy state.
4. Make Reset clear both selection-specific channels for the exact target and
   reveal inherited entry settings.
5. Require complete supported residues for polymer styles and reject ambiguous
   requests rather than silently expanding or partially applying them.
6. Use two-selected-endpoint bond semantics at atomic boundaries.
7. Use one project-level multi-entry command so a cross-entry selection is not
   partially styled.
8. Keep archive/project/normalized schema versions unchanged with an additive
   data migration and explicit lack of older-release forward compatibility.
9. Use Maestro only as workflow inspiration; use original MolWeave UI and
   terminology.

Approved deviations from issue suggestions:

- No separate Ribbon option because Cartoon already supplies ribbon semantics.
- No same-channel Add representation action in the first slice.
- No separate Remove action beyond exact Reset to inherited state.
- No context-menu duplication.
- No automatic presets or nearby-component styling.
- No selection-specific surface, color, opacity, or label parameters.
- No Molecule picking mode; component hierarchy selection already satisfies the
  intended stable component workflow.

Follow-up strategy:

- After release, create one focused advanced selection-presentation issue if
  product demand exists for color, opacity, labels, surfaces, or same-channel
  layering. It must define precedence, editing, limits, scene/archive behavior,
  and large-structure degradation before implementation.
- Create a separate preset issue only if desired. It must define component
  ambiguity, distance cutoffs, solvent/ion behavior, overwrite/reset semantics,
  and whether preset configuration is project or preference state. Presets must
  call ordinary selection-representation commands.
- Do not create duplicate issues for hydrogen filtering, ligand designation,
  component overrides, or subset export; reference existing #1, #11, #20, and
  #21 respectively.

## Version and release plan

### SemVer determination

This work is a backward-compatible minor release from `0.3.0` to `0.4.0`.

Rationale:

- It adds substantial user-visible selection styling and a new durable command
  workflow.
- It adds an additive viewer-settings/API/archive field and endpoint.
- It removes no public behavior and retains legacy `stick`, project, archive,
  molecular, selection, scene, and API-major compatibility.
- It requires a data migration but no incompatible SQL, archive, normalized,
  or HTTP-major change.
- A patch would understate the feature. A major release would overstate its
  compatibility impact.
- A prerelease is unnecessary once focused and complete release gates pass.
- The repository has established final releases through v0.3.0; `v0.4.0` is the
  next non-colliding feature release.

Authoritative version sources to update only during Checkpoint 6:

1. `pyproject.toml`
2. `uv.lock`
3. `apps/web/package.json`
4. `apps/api/src/molweave_api/main.py`
5. `apps/api/src/molweave_api/archive_service.py`

### Pull request

- Title: `feat(viewer): add selection-based representation styling`
- Base: `master`
- Head: `feat/issue-7-selection-representation-styling`
- Body: include `Closes #7`; document implemented, already-satisfied,
  simplified, deferred, and rejected requirements; exact channel/boundary/
  polymer semantics; scientific and accessibility limits; validation;
  compatibility/migration; version impact; and follow-ups.
- Merge strategy: rebase-and-merge after approval, complete validation, and
  full-diff review.
- Request review but do not claim independent review unless one is returned.
- Recheck branch protection, rulesets, checks, reviews, and unresolved
  conversations immediately before merge and do not bypass any requirement.

### Issue and follow-up handling

- Use `Closes #7` so GitHub closes the issue only when the feature PR merges.
- The final issue reply is published only after the tag and release are remotely
  verified.
- The reply must distinguish delivered, already-satisfied, simplified,
  deferred, rejected, and existing-related-issue scope.
- Link any approved advanced-presentation and preset follow-up issues.
- Reference existing #1, #11, #20, and #21 without broadening them.

### Tag, release notes, and branch cleanup

- Proposed annotated tag: `v0.4.0`.
- Create it only from the verified merged commit on clean, fast-forwarded
  `master` after the complete final gate.
- Push and remotely dereference the annotated tag to the merged commit before
  creating the GitHub release.
- Never reuse or move an existing tag.

Release-note sections:

1. Highlights
2. Added
3. Styling and replacement semantics
4. Scientific and viewer boundaries
5. Accessibility and performance
6. Verification
7. Compatibility and migrations
8. Deferred and follow-up work

- If post-merge release/issue/cleanup evidence changes tracked documentation,
  use a small documentation-only closeout branch and PR; do not move the tag.
- Delete the remote feature branch only after PR merge, tag, GitHub release,
  issue reply, and any required closeout PR are remotely verified.
- Fast-forward local `master` to verified remote merged state before deleting
  the local feature branch.

## Merge and release blockers

Merge is blocked when any of the following is true:

- This approved plan was not the first feature-branch change or ceased to be
  the implementation contract without explicit approval.
- Mol* or transient selection becomes authoritative for durable assignment
  identity or persistence.
- Styling changes molecular artifacts, coordinates, conformers, topology,
  chemistry, component classification, entry identity, or immutable originals.
- A style affects an atom outside its exact persisted target.
- Same-channel records overlap, fail to merge deterministically, or make
  replacement/reset ambiguous.
- Atomic boundary rendering exposes a bond or atom outside the exact target.
- Polymer rendering visibly expands beyond exact complete selected residues or
  silently accepts an incompatible selection.
- Apply/reset/undo/redo changes camera, focus, rotation center, current
  selection, picking mode, or isolation.
- A multi-entry operation partially succeeds.
- Entry-level display edits discard selection-specific assignments.
- Undo/redo, checkpoint/reopen/recovery, scene save/apply, atom deletion,
  archive import/export, or migration loses or silently rebinds assignments.
- Valid existing projects or v0.1.0 through v0.3.0 archives become unreadable.
- A migration downgrade can silently discard non-empty assignments.
- Empty/incompatible controls lack accurate keyboard-reachable explanations.
- Desktop/Pixel 7 accessibility, real-WebGL, request-count, or existing
  performance evidence fails.
- Presets, same-channel layering, context menu, ribbon alias, color, opacity,
  labels, surfaces, molecule granularity, hydrogen filtering, component
  overrides/export, ligand designation, or docking is represented as working.
- Any focused or complete validation command fails.
- `git diff --check` fails.
- Version sources disagree or documentation claims evidence that did not pass.
- Consequential full-diff findings or newly configured required checks,
  reviews, protections, rules, or conversations remain unresolved.

Release is additionally blocked when:

- The feature PR is not remotely verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The complete release gate did not pass on the PR's final state.
- `v0.4.0` already exists or points to another commit.
- Any authoritative version differs from `0.4.0`.
- The annotated tag cannot be pushed and remotely dereferenced to the exact
  merged commit.
- The GitHub release or final issue reply cannot be remotely verified.
- Release notes omit material simplification, deferral, rejection, migration,
  compatibility, scientific limitation, or failed evidence.

## Progress and completion log

### 2026-08-09 - Plan approved and persisted

- Inspected `AGENTS.md`, product/global plan, progress, decisions,
  verification, architecture, project/normalized schemas, API, migrations,
  jobs, frontend state ownership, viewer adapter, tests, related issues,
  version sources, tags, releases, PR conventions, remote protection/rules,
  CI/release tooling, and the provided screenshot.
- Researched the current public Maestro selection/style workflow and Mol* 5.11
  component/representation capabilities without adopting proprietary design.
- Classified all significant issue requirements and approved the bounded
  replacement/reset vertical slice described above.
- Verified clean local and remote `master` at
  `0526eb0b95db664a8d8fb837e75f9434090265f2`.
- Created `feat/issue-7-selection-representation-styling` from that baseline.
- Persisted this plan and the project-level handoff as the first branch change.
- Implementation has not started.

### 2026-08-09 - Checkpoint 1 implemented

- Added typed, canonical selection-representation records to viewer settings,
  including the additive `thick-stick` value and empty legacy default.
- Added deterministic same-channel replacement and two-channel reset algebra,
  exposed through one revisioned project endpoint for canonical multi-entry
  selections with exact command snapshots and undo/redo state.
- Added authoritative complete-residue protein/DNA/RNA polymer validation from
  current normalized artifacts and atomic rejection for partial, unsupported,
  stale, empty, duplicate, or noncanonical requests.
- Prevented the existing entry-level viewer-settings endpoint from changing
  selection assignments while allowing unrelated controls to preserve them.
- Reconciled deleted IDs from live entry and named-scene assignments with
  empty-record removal and exact undo restoration; additions and coordinate
  edits do not implicitly alter membership.
- Added JSON migration `0008` for live entry, checkpoint, and scene viewer
  state. Verified populated `0007` upgrade, empty downgrade/re-upgrade, and
  refusal to downgrade with a non-empty assignment.
- Appended accepted decision D-046. Project, normalized, archive, and API
  schema major versions remain unchanged.
- Focused evidence before commit:
  - `.venv/bin/uv run ruff check apps/api packages/molweave_core tests`: pass.
  - `.venv/bin/uv run mypy apps/api packages/molweave_core`: pass (49 files).
  - The planned focused pytest set: pass (48 tests), covering command/history,
    viewer state, archives through v0.3.0, edit reconciliation, and safety.
  - `.venv/bin/uv run pytest tests/integration/test_migrations.py -q`: pass
    (1 test; upgrade/downgrade paths above).
  - `corepack pnpm --filter @molweave/web typecheck`: pass.
  - `git diff --check`: pass.
- Review repaired response-fixture drift from the additive default and added
  exact membership comparisons after rejected multi-entry requests. No
  schema-major, SQL-column, molecular-artifact, or original-upload change was
  introduced.
- Remaining limitation: renderer projection and interaction UI are
  deliberately absent until Checkpoints 2 and 3. Next action: commit this
  passing checkpoint, then implement exact Mol* projection.

### 2026-08-09 - Checkpoint 2 implemented

- Added a pure projection from application-owned viewer settings to inherited
  and selection-specific representation layers. Atomic and polymer inherited
  memberships subtract only their own channel's visible targets; surface and
  other independent settings remain unchanged.
- Every targeted layer is the exact intersection of persisted IDs, component
  visibility, hydrogen visibility, and active isolation. Empty intersections
  do not create Mol* components.
- Replaced the prior shared component loop with deterministic per-layer bundle
  components. Exact atomic profiles set `includeParent: false`, so a selected
  bond can be rendered only when both endpoints are in the target bundle.
- Centralized representation profiles. Existing `stick` retains its v0.3.0
  thin profile (`sizeFactor: 0.22`, `sizeAspectRatio: 0.35`); `thick-stick` uses
  a visibly heavier fixed profile (`0.36`, `0.78`). Both map to Mol* ball-and-
  stick and remain non-configurable in this issue.
- Selection layers use element coloring and full opacity. Entry-level color,
  opacity, surface, labels, component visibility, and large-structure fallback
  remain independent.
- Existing atomic rebuild flow continues to restore canonical selection and an
  exact application camera snapshot, retain isolation, avoid loading hidden
  entries, and reuse artifact-keyed normalized-structure queries. A focused
  structure-loading regression proves representation changes do not refetch.
- Focused evidence before commit:
  - `corepack pnpm --dir apps/web lint`: pass.
  - `corepack pnpm --dir apps/web typecheck`: pass.
  - `corepack pnpm --dir apps/web test -- representations structure-loading viewer-adapter component-hierarchy`:
    pass (18 files, 59 tests; Vitest applies the repository command to the
    complete frontend suite).
  - `corepack pnpm --dir apps/web build`: pass. Vite retained the known
    non-blocking chunk-size advisory for the lazy Mol* bundle.
  - `git diff --check`: pass.
- Review confirmed that no normalized data, persistent viewer authority,
  camera ownership, selection ownership, or public API changed in this
  checkpoint. The renderer remains disposable.
- Remaining limitation: real-WebGL visual and camera qualification is assigned
  to Checkpoint 4 after the Checkpoint 3 controls provide the complete user
  workflow. Next action: commit and add the accessible styling controls.

### 2026-08-09 - Checkpoint 3 implemented

- Added an always-present **Style selection** quick action with an original
  MolWeave palette icon and treatment. The native button remains keyboard
  focusable with `aria-disabled`, dialog state, and an exact reason when the
  selection is empty, a project mutation is busy, or the workflow is absent.
- Added a compact responsive dialog with selected atom/entry counts, concise
  inherited-channel help, semantic Atom detail and Polymer fieldsets, all seven
  accepted styles, Reset to entry defaults, pressed state, action progress, and
  local success/error announcements.
- Added frontend polymer preflight from normalized structures and the derived
  hierarchy. It matches backend rules for supported protein/DNA/RNA residues,
  exact complete-residue membership, trace atoms, and all-or-nothing rejection
  of an incompatible multi-entry request. Opening the dialog explicitly loads missing
  structure through the existing artifact-keyed query cache; ordinary hidden
  entries remain lazy.
- Routed apply/reset through `projectApi.updateSelectionRepresentations` and
  the one revisioned backend mutation. Neither the handler nor dialog modifies
  current selection, picking granularity, camera, isolation, or molecular data.
- Radix dialog behavior supplies focus trapping, Escape dismissal, and exact
  launcher focus restoration. Unavailable polymer actions have a persistent
  adjacent reason; available atomic actions remain keyboard operable for every
  non-empty valid selection.
- The two-column minmax layout and viewport-bounded shared dialog shell contain
  all controls without fixed wide children; Pixel 7 and desktop browser bounds
  remain assigned to Checkpoint 4 real-browser evidence.
- Focused evidence before commit:
  - `corepack pnpm --dir apps/web lint`: pass.
  - `corepack pnpm --dir apps/web typecheck`: pass.
  - `corepack pnpm --dir apps/web test -- viewer-toolbar project-workspace representations structure-loading selection-style-dialog`:
    pass (19 files, 61 tests; repository Vitest command runs the complete
    frontend suite).
  - `corepack pnpm --dir apps/web build`: pass with the existing non-blocking
    lazy Mol* chunk advisory.
  - `git diff --check`: pass.
- Checkpoint review confirmed no Maestro asset, icon, label, layout, palette,
  or control grouping was copied. The screenshot informed only the high-level
  value of a compact representation workflow, as approved.
- Remaining limitation: visual distinctness, exact camera/selection invariance,
  bond boundaries, and responsive bounds require real-WebGL/browser evidence
  in Checkpoint 4. Next action: commit and qualify the complete workflow.

### 2026-08-09 - Checkpoint 4 implemented

- Added one focused real-browser suite using the existing redistributable
  `1STP` and component-hierarchy fixtures; no new fixture or scientific source
  claim was required.
- The desktop `1STP` workflow proves inherited Cartoon protein, visually
  distinct ligand Thin and Thick sticks, and Thin sticks on the nearest exact
  complete protein residue. It also proves one revision per application, exact
  coexistence, picking/selection retention, reset, undo/redo, named-scene
  camera/selection/style restoration, saved-selection reuse, project reload,
  nonblank WebGL, unchanged topology/coordinates/current and original artifact
  IDs/original bytes, and one normalized-structure request per application
  load.
- The boundary workflow proves exact Space filling for an ion, Ball and stick
  for water, Line for a ligand, a visible incompatibility reason for polymer
  styling on the ion, and no selected-bond expansion across the fixture's
  covalent protein-ligand boundary.
- The Pixel 7 workflow proves keyboard selection through the responsive project
  hierarchy, keyboard dialog launch and application, Escape focus restoration,
  viewport containment, no horizontal overflow, and zero scoped axe findings.
  Existing focused integration coverage continues to prove portable archive
  round trip, legacy defaulting, edit reconciliation, and exact deletion undo.
- Focused evidence before commit:
  - `.venv/bin/uv run pytest tests/integration/test_viewer_state.py tests/integration/test_archive_roundtrip.py tests/integration/test_ligand_edits.py tests/integration/test_protein_edits.py`:
    pass (21 tests).
  - `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-styling.spec.ts tests/e2e/structure-hierarchy.spec.ts tests/e2e/synchronized-selection.spec.ts tests/e2e/viewer-controls.spec.ts`:
    pass (11 applicable tests, 11 intentional desktop/mobile project skips;
    1.7 minutes).
  - The new selection-styling suite also passed as a complete isolated run,
    and each of its three applicable workflows passed independently while
    diagnosing runner behavior.
  - `corepack pnpm --dir apps/web lint`: pass.
  - `corepack pnpm --dir apps/web typecheck`: pass.
  - `git diff --check`: pass.
- Qualification repaired two test-harness findings without changing runtime
  behavior: the mobile workflow now selects through the compact project drawer
  instead of the unavailable desktop inspector, and each WebGL workflow leaves
  the document before teardown to avoid a Chromium SwiftShader disposal hang.
- Checkpoint review found no molecular mutation, broader style semantics,
  copied Maestro design, new migration, or production-code scope expansion.
  Real-WebGL evidence remains limited to the repository's pinned Chromium and
  SwiftShader projects. Next action: commit and document the verified contract.

### 2026-08-09 - Checkpoint 5 implemented

- Documented selection-representation ownership from durable
  `ViewerSettingsV1` and the authoritative project command through the exact
  disposable Mol* layer projection. Current selection, camera, molecular data,
  component derivation, and original artifacts retain their existing owners.
- Documented the additive schema/API field, atomic multi-entry action,
  same-channel replacement and two-channel reset, complete-residue polymer
  validation, scene/history/topology behavior, legacy default, migration `0008`
  upgrade, and loss-preventing downgrade rule. Public project, archive,
  normalized, and API schema major versions remain 1.
- Documented exact atom/bond boundaries, fixed Thin/Thick presentation,
  visibility intersections, scientific non-claims, keyboard/semantic dialog
  behavior, automated/manual accessibility boundary, normalized-query reuse,
  disposable rebuild cost, reduced-detail retention, and real-WebGL scope.
- Added the v0.4.0 candidate verification matrix and kept every deferred,
  rejected, and follow-up feature out of user-visible claims. Accepted D-046
  already records the architectural decision; this checkpoint introduced no
  new cross-project decision.
- Focused evidence before commit:
  - `.venv/bin/uv run ruff check apps/api packages/molweave_core tests`: pass.
  - `.venv/bin/uv run mypy apps/api packages/molweave_core`: pass (49 files).
  - `corepack pnpm --dir apps/web lint`: pass.
  - `corepack pnpm --dir apps/web typecheck`: pass.
  - `git diff --check`: pass.
- Documentation review repaired the stale issue #2 limitation that said no
  selection-specific styling existed; it now accurately distinguishes issue
  #7's exact selection styling from still-absent automatic per-component
  styling and classification overrides. Next action: commit and prepare the
  v0.4.0 release candidate.

### Checkpoint log template

For every completed checkpoint append:

- Date and final commit.
- Concrete implemented outcome.
- Exact focused validation commands and results.
- Findings and repairs made before commit.
- Migration, compatibility, performance, accessibility, or scientific evidence.
- Remaining limitations/blockers and next action.

## Completion

Checkpoints 1-5 are implemented and verified. Checkpoint 6 remains in progress
under this approved contract.
