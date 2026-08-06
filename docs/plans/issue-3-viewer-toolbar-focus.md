# Issue 3 - Viewer Selection And Focus Toolbar

Status: implementation in progress; Checkpoint 1 complete

## Issue metadata

- Issue: [#3 - Add always-accessible selection modes and context-aware focus shortcuts](https://github.com/ManuelSe/MolWeave/issues/3)
- Issue state when planned: open
- Issue author: `ManuelSe`
- Issue created: 2026-08-03
- Plan approved: 2026-08-06
- Base branch: `master`
- Base commit at approval: `34a2b480cea67a509bb396375b58b4f7841f7cbc`
- Planned feature branch: `feat/issue-3-viewer-toolbar-focus`
- Planned application version: `0.2.0`
- Planned tag: `v0.2.0`
- Planned pull-request title: `feat(viewer): add selection and focus toolbar`

This document is the implementation contract for issue #3. It supplements, but
does not replace, the global `docs/PLAN.md`.

## Core problem and approved outcome

MolWeave already has one application-owned picking-granularity value and a
typed Mol* viewer boundary. Atom, residue, chain, and structure picking are
synchronized through the Selection inspector, while focus-selection and camera
reset operations exist only inside an expandable display panel. Users must
therefore leave the current inspector task or open another panel to reach
frequent viewer interactions.

The approved outcome is a compact toolbar that remains visible over the
molecular workspace while any inspector tab is open. It exposes Atom, Residue,
Chain, and Structure picking modes plus Fit all visible, Focus selection, and
Focus visible ligands. The toolbar and Selection inspector consume the same
transient Zustand picking state. Camera actions remain transient and cannot
modify molecular data, current selection, isolation, entry visibility, viewer
settings, project revision, command history, artifacts, or archives.

Ligand focus consumes `NormalizedStructureV1.residues[].component_type` from
already loaded application state. It does not infer ligands from residue names,
size, proximity, ordering, or Mol* internals. When several visible ligands are
present, one action frames all of them. Individual-ligand choice is deferred
until issue #2 or issue #11 establishes the required component identity or
ligand-designation product model.

## Authority and assumptions

The plan applies this authority order:

1. User approval of this plan and any later explicit correction.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing application/viewer ownership boundaries, schemas, and repository
   conventions.
4. Issue #3's underlying workflow problem, desired outcomes, constraints, and
   non-goals.
5. Technical and interface suggestions in the issue.

Accepted decisions D-018 through D-020, D-022, D-023, D-041, D-042, and D-043
govern the implementation:

- Canonical atom references remain the common selection and focus identity.
- Current selection and picking mode remain transient application session state.
- Normalized molecular structures remain authoritative; Mol* remains a
  disposable renderer.
- Ordinary focus, fit, and camera navigation never create project commands.
- Persisted project, molecular, archive, and browser-preference schemas do not
  gain toolbar or focus state.
- Application code derives context-sensitive focus targets and sends canonical
  atom references through a generic viewer operation.

Planning assumptions:

- "Remains active until the user changes it" means within the current browser
  session, including inspector changes and project switches. Reload continues
  to restore the safe Atom default under the accepted transient-tool boundary.
- "Visible ligand" means confidently ligand-classified atoms in loaded visible
  entries whose ligand component is enabled. Hidden hydrogens and atoms outside
  an active isolation target are excluded.
- Fit all visible delegates to the bounds of the currently rendered Mol* scene,
  including active visibility, component, hydrogen, and isolation state.
- Unknown components are not promoted to ligands. Incomplete classification is
  reported as a limitation rather than repaired with a toolbar-specific guess.
- Both standalone ligand entries and ligand residues within complex entries are
  eligible when their normalized residues carry `component_type: ligand`.
- "Structure" remains the public term, matching the current model and inspector.
- Approval resolves the multiple-ligand ambiguity in favor of framing all
  visible classified ligands.

## Repository findings

`useSelectionStore` owns one `pickingGranularity` value. `App` passes it to the
Selection inspector and `StructureViewer`; the inspector setter updates the same
store, and `StructureViewer` forwards the value to `MolecularViewer`. Changing
it does not touch `selection`. The lazy viewer buffers it until Mol* loads, and
`MolstarEngine` maps the public Atom term to Mol* element loci while supporting
residue, chain, and structure normalization.

`ViewerControls` already contains Focus selection and Center and reset view, but
only inside its expandable display panel. The typed viewer interface supports
focus of the current pending selection and camera reset. It does not yet accept
an arbitrary application focus target or expose an explicitly named fit-visible
operation.

`NormalizedStructureV1` already stores per-residue component classifications:
`polymer`, `ligand`, `water`, `ion`, and `unknown`. The frontend receives those
records through the lazy structure endpoint. The immutable `1STP` scientific
fixture proves one biotin residue is classified as ligand inside a complex.
This is sufficient for aggregate ligand focus without adding a component,
candidate, or ligand-of-interest schema.

Related GitHub scope:

- Issue #2 owns comprehensive component detection, hierarchy, individual
  component identity, correction, and reclassification.
- Issue #11 owns durable ligand-of-interest designation and ambiguity handling.
- Issues #5 and #6 concern keeping viewer picks and empty-space clicks separate
  from implicit camera movement. Issue #3 adds explicit camera commands but
  does not close or broaden into those issues.
- Issue #7 concerns selection-specific representation persistence and is not
  part of this toolbar slice.

Remote inspection at approval found:

- Local `master` was clean and matched `origin/master` at `34a2b48`.
- `master` was the only remote branch.
- Annotated tag and GitHub release `v0.1.1` exist and dereference to released
  commit `fb92de6`.
- PR #13 delivered issue #8 through rebase-and-merge; PR #14 recorded its
  release closeout.
- No GitHub Actions workflows, branch protections, rulesets, required checks,
  or required reviews were configured.
- Squash, merge-commit, and rebase merges were enabled; auto-merge and automatic
  branch deletion were disabled.

The issue brief's statement that MolWeave lacks tag or release history is stale.
The verified `v0.1.1` release is the compatibility and SemVer baseline.

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment |
|---|---|---|
| Always-accessible viewer toolbar | Essential | Add a toolbar independent from the inspector and expandable display panel. |
| Expose Atom, Residue, Chain, and Structure picking | Essential | Reuse the existing four public values and the term Structure. |
| Active picking mode visible at a glance | Essential | Use pressed buttons on desktop and a labelled selected value in compact layout. |
| Toolbar and Selection-tab controls stay synchronized | Essential | Both read and update the existing Zustand value. |
| Changing picking mode does not modify current selection | Essential | Preserve the existing state boundary and add direct regression evidence. |
| Picking mode remains active until changed | Already satisfied by the repository | Retain session and project-switch behavior. |
| Persist picking mode across page reload | Rejected as proposed if implied | Conflicts with D-019 and the documented browser-preference boundary. |
| Descriptive tooltips | Supporting | Provide focus/hover help and actionable unavailable reasons. |
| Keyboard reachability | Essential | Use native controls, logical tab order, visible focus, names, and pressed state. |
| Compact-layout dropdown | Supporting | Replace the four-button group with a labelled select at narrow widths. |
| Global picking keyboard shortcuts | Optional | Defer until a separate shortcut model addresses conflicts and discoverability. No follow-up issue is required now. |
| Fit all visible | Essential | Add an explicit typed viewer operation that frames the rendered scene. |
| Retain Focus selection | Essential | Move it to the quick toolbar and keep it unavailable for an empty selection. |
| Focus ligand only when one is visible | Essential | Enable only for loaded, display-enabled, application-classified ligand atoms. |
| Disabled context action explains why | Essential | Use an accurate loading or no-ligand explanation. |
| Ligand target uses component classification | Essential | Consume normalized `component_type`; add no focus-specific chemical heuristic. |
| Multiple-ligand behavior | Unclear and requiring a product decision | Approval selects framing all visible ligands as one target. |
| Per-ligand dropdown | Deferred | Depends on stable component/instance identity from #2 or ligand designation from #11. No new issue is needed. |
| Active or most-recent ligand focus | Rejected as proposed | MolWeave has no authoritative active-ligand state and must not guess. |
| Comprehensive automatic component detection | Already satisfied by the repository for this consumer; broader work deferred | Existing normalized residue classification supports aggregate focus; #2 owns richer detection. |
| Focus actions alter only the camera | Essential | Add component and browser invariance evidence. |
| Advanced Selection tab remains | Essential | Retain query, spatial, expansion, inversion, and saved-selection tools. |

No unresolved product decision remains after approval. No new follow-up issue is
required by this plan.

## Accepted scope

- Add an always-visible, application-owned viewer toolbar.
- Expose the four existing picking granularities through the toolbar.
- Keep toolbar, Selection inspector, and Mol* synchronized through one transient
  value.
- Add generic typed viewer operations for fitting the rendered scene and
  focusing canonical atom references.
- Move Focus selection into the always-visible toolbar.
- Add Focus visible ligands using normalized component classifications.
- Frame all visible classified ligands when several are present.
- Account for entry visibility, ligand and hydrogen component settings, loading,
  and active isolation when deriving availability and targets.
- Provide desktop and compact layouts, keyboard access, pressed state, visible
  focus, and usable unavailable explanations.
- Add component, adapter, real-WebGL, accessibility, and state-invariance tests.
- Document focus semantics, classification limitations, release evidence, and
  the new application-owned focus-target decision.
- Advance the backward-compatible application feature release to 0.2.0 while
  retaining schema version 1 and 0.1.x archive compatibility.

## Non-goals

- A new component hierarchy, component persistence model, or reclassification
  workflow.
- Durable ligand-of-interest state, ligand candidate selection, or a per-ligand
  dropdown.
- New ligand detection heuristics or scientific reclassification.
- Selection-specific representations, styles, colors, or presets.
- Changes to viewer click, empty-space, drag, orbit, pan, or scroll semantics.
- Global keyboard shortcuts.
- Persisting picking mode, camera navigation, or toolbar state in projects,
  scenes, archives, browser preferences, or command history.
- Backend HTTP endpoints, database migrations, normalized-schema changes, or
  archive-schema changes.
- Closing or implementing issues #2, #5, #6, #7, or #11.

## Visibility and scientific semantics

Application code derives visible ligand references from loaded
`ViewerStructure` values. An atom is eligible only when:

1. Its project entry is visible and has loaded successfully.
2. Its normalized residue has `component_type: ligand`.
3. The entry's ligand component setting is enabled.
4. It is not hydrogen when hydrogen display is disabled.
5. It belongs to the captured isolation target when isolation is active.

Targets are canonical `(structure_id, atom_id)` references. Duplicate references
are removed and ordering is deterministic before the viewer receives them.
Unknown residues, water, ions, polymers, hidden ligand components, failed loads,
and unloaded structures are excluded. The helper does not inspect residue names,
connectivity, atom counts, coordinates, or Mol* component types.

The toolbar distinguishes at least these unavailable states:

- Viewer or structures still loading.
- No current selection for Focus selection.
- No ligand detected in visible structures for Focus visible ligands.
- No rendered molecular objects for Fit all visible.

Unavailable context actions remain keyboard reachable with `aria-disabled`
rather than an unfocusable native disabled state, and activation is suppressed.
Their help text remains available at compact widths even though unrelated
focus-triggered tooltips are normally suppressed there.

## Milestones and checkpoints

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Store this approved implementation contract, concise project handoff, and
  accepted focus-target decision before any application change.
- Leave the branch ready for `/goal` with implementation explicitly not started.

Affected areas:

- `docs/plans/issue-3-viewer-toolbar-focus.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`

Acceptance criteria:

- Status is approved and implementation is not started.
- Issue metadata, branch, requirement dispositions, scope, checkpoints,
  implications, evidence, release plan, blockers, and logs are present.
- The global `docs/PLAN.md` is unchanged.
- No application, test, version, schema, migration, or runtime file changes.

Focused validation:

```bash
git diff --check
git status --short
```

Documentation and migration implications:

- Creates the detailed issue-specific source of truth.
- Updates project-level status and appends D-043.
- No migration.

Expected commit:

```text
docs(plan): add approved plan for issue 3
```

Rollback and compatibility:

- Revert the documentation commit. There is no runtime, data, API, or archive
  compatibility effect.

### Checkpoint 1 - Add synchronized picking controls

Concrete outcome:

- Add an always-visible toolbar with four picking modes on desktop and a
  labelled compact select, backed by the existing selection store.

Affected areas:

- New `apps/web/src/components/ViewerToolbar.tsx`
- `apps/web/src/components/StructureViewer.tsx`
- `apps/web/src/components/WorkspaceCanvas.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- Focused frontend component and store tests

Acceptance criteria:

- Every picking granularity is available without opening the inspector.
- Toolbar and Selection inspector display the same active value.
- Selecting a mode on either surface updates the other and the viewer adapter.
- Mode changes do not clear, expand, replace, add to, subtract from, or rewrite
  the current selection.
- Controls use native keyboard interaction, accessible names, visible focus,
  and `aria-pressed` where applicable.
- Desktop and compact variants do not overlap the display-controls trigger,
  viewer notices, or status text.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- structure-loading selection project-workspace
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
git diff --check
```

Documentation and migration implications:

- No persisted state or documentation claim changes yet beyond this plan.
- No migration.

Expected commit:

```text
feat(viewer): add always-accessible picking controls
```

Rollback and compatibility:

- Removing the duplicate toolbar access surface restores the previous inspector
  path. Selection data and projects remain compatible.

### Checkpoint 2 - Add explicit camera focus targets

Concrete outcome:

- Add typed viewer operations for fitting the rendered scene and focusing
  canonical atom references, then expose Fit all visible, Focus selection, and
  Focus visible ligands in the quick toolbar.

Affected areas:

- `apps/web/src/viewer/MolecularViewer.ts`
- `apps/web/src/viewer/MolstarViewer.ts`
- `apps/web/src/viewer/MolstarEngine.ts`
- `apps/web/src/components/StructureViewer.tsx`
- `apps/web/src/components/ViewerToolbar.tsx`
- `apps/web/src/components/ViewerControls.tsx`
- A pure application focus-target helper
- Viewer adapter, component, and helper tests

Acceptance criteria:

- Fit all visible frames current rendered bounds, including isolation.
- Focus selection frames current canonical selection and is unavailable when
  selection is empty.
- Focus visible ligands is enabled only when the approved helper returns one or
  more visible ligand references.
- Multiple visible ligands are combined into one deterministic target.
- Unavailable actions explain their current state on pointer hover and keyboard
  focus without executing.
- Focus actions do not modify selection, isolation, visibility, viewer settings,
  project revision, artifacts, coordinates, topology, history, or archives.
- Mol* accepts only application concepts; normalized or Mol* state does not
  migrate into the other owner.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- viewer-adapter structure-loading
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-controls.spec.ts --project=chromium
git diff --check
```

Documentation and migration implications:

- D-043 supplies the ownership and aggregate-ligand rationale.
- No API, database, project, molecular, browser-storage, or archive migration.

Expected commit:

```text
feat(viewer): add context-aware focus shortcuts
```

Rollback and compatibility:

- Revert the internal viewer-interface and toolbar changes together. No durable
  state needs conversion or repair.

### Checkpoint 3 - Qualify responsive and scientific behavior

Concrete outcome:

- Add real-WebGL desktop and compact evidence for synchronized picking,
  context-aware availability, aggregate ligand focus, fit recovery, and
  camera-only invariants; document the behavior and limits.

Affected areas:

- `tests/e2e/viewer-controls.spec.ts`
- Focused frontend tests where browser evidence needs deterministic support
- `docs/ACCESSIBILITY.md`
- `docs/SCIENTIFIC_LIMITATIONS.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`, only if implementation exposes a material amendment
- This plan's progress log

Acceptance criteria:

- The toolbar remains usable without clipping, overlap, or horizontal overflow
  at supported desktop and Pixel 7 viewports.
- Active modes, unavailable reasons, and focus states are not communicated by
  color alone.
- The Selection inspector and toolbar synchronize in a real browser while the
  current selection is unchanged.
- Camera snapshots demonstrate selection, ligand, and all-visible framing.
- Project/API snapshots demonstrate camera actions cause no durable mutation.
- Protein-only input disables ligand focus; standalone and complex ligands
  enable it; multiple visible ligands are framed together.
- The existing `1STP` classification fixture remains authoritative and no new
  heuristic classification claim is introduced.

Focused validation:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-controls.spec.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-hardening.spec.ts
corepack pnpm --dir apps/web test
git diff --check
```

Documentation and migration implications:

- Record exact passing evidence, aggregate focus behavior, accessibility
  qualification, and classification limits.
- No migration.

Expected commits:

```text
test(e2e): cover viewer toolbar workflows
docs(viewer): document toolbar focus semantics
```

Rollback and compatibility:

- Browser evidence and documentation must remain paired with the behavior they
  qualify. No partial claim is retained if the feature is reverted.

### Checkpoint 4 - Prepare and qualify MolWeave 0.2.0

Concrete outcome:

- Align authoritative versions at 0.2.0, retain 0.1.x archive compatibility,
  add release notes/evidence, run the complete gate, and review the complete
  diff before opening the pull request.

Affected areas:

- `pyproject.toml`
- `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `tests/integration/test_archive_roundtrip.py` or equivalent focused
  predecessor-archive evidence
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- This plan's progress and completion log

Acceptance criteria:

- All five authoritative version sources declare 0.2.0.
- `ProjectStateV1`, `ProjectManifestV1.schema_version`,
  `NormalizedStructureV1`, `/api/v1`, and Alembic head remain unchanged.
- Valid 0.1.0 and 0.1.1 archives remain importable without migration or data
  loss; 0.2.0 archives retain schema version 1.
- Release notes distinguish added behavior, limitations, deferred scope, and
  verified evidence.
- Focused and complete gates pass on the final candidate.
- Complete diff review has no consequential unresolved finding.

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

Documentation and migration implications:

- Add the 0.2.0 release section and exact evidence.
- No persisted-schema or Alembic migration.

Expected commit:

```text
chore(release): prepare v0.2.0
```

Rollback and compatibility:

- Before publication, revert release preparation and feature commits normally.
- Never reuse or move a published tag. A post-release defect requires a later
  compatible release.

## Acceptance and verification evidence

| Requirement | Planned evidence |
|---|---|
| Toolbar is always accessible | Component role/name assertions and desktop/compact browser visibility |
| Four picking modes and active state | Toolbar component tests plus real-browser pressed/select state |
| Inspector synchronization | Shared-store component workflow and Playwright transition in both directions |
| Picking change preserves selection | Before/after canonical selection assertions in component and browser tests |
| Viewer receives updated mode | Fake-viewer granularity history and real Mol* pick behavior |
| Fit all visible | Adapter invocation plus real camera snapshot after a focused local view |
| Focus selection availability and effect | Empty/non-empty accessibility assertions and camera snapshot around a known selection |
| Ligand availability | Protein-only disabled state; standalone and `1STP` classified-ligand enabled states |
| Multiple ligand behavior | Combined standalone/complex target assertion and one aggregate camera focus |
| Component classification boundary | Pure helper tests using normalized residue types, including water/ion/unknown exclusions |
| Hidden and isolated state | Target-helper and component tests for component settings, hydrogens, and captured isolation |
| Camera-only invariance | Project revision, artifact, visibility, viewer-settings, coordinate, and selection snapshots |
| Keyboard and unavailable help | Focus/activation tests, accessible names/descriptions, axe, and compact browser workflow |
| Responsive layout | Pixel 7 viewport bounds, no horizontal overflow, and no toolbar/control overlap |
| No full-structure traffic | Normalized-request counter remains unchanged for toolbar-only interactions |
| Archive compatibility | Explicit predecessor-version round trip plus existing archive and safety suites |
| No broader regression | Complete documented release gate |

Passing commands and exact counts must be recorded in this plan and summarized
in `docs/PROGRESS.md`. Planned evidence must not be described as passing before
it has run successfully.

## Implications

### Data and migrations

- No SQLite, Alembic, project-state, normalized-molecular, selection,
  measurement, scene, job, or browser-storage migration.
- Picking mode and camera actions remain transient and do not enter checkpoints
  or command history.
- No project revision changes for toolbar interactions.

### Archive compatibility

- `ProjectManifestV1.schema_version` remains 1.
- `application_version` advances to 0.2.0 as producer provenance.
- Valid 0.1.0 and 0.1.1 archives remain readable under D-042.
- The toolbar and transient camera state are absent from archives.

### API

- No endpoint, request, response, or `/api/v1` compatibility change.
- FastAPI application metadata advances to 0.2.0.
- Normalized structures are consumed from the existing lazy endpoint without
  additional focus requests.

### UI and viewer

- A new always-visible toolbar coexists with the expandable representation,
  projection, zoom, isolation, and scene controls.
- Duplicate focus/reset actions leave the expanded panel so each camera command
  has one stable accessible surface.
- `MolecularViewer` gains generic application concepts for fitting visible
  content and focusing atom references; it does not gain ligand-specific logic.
- Compact layout uses a labelled select for picking granularity and retains
  named focus actions.

### Scientific behavior

- No parsing, conversion, coordinates, topology, bond, charge, inference,
  validation, or classification change.
- Ligand focus trusts current normalized component classification and exposes
  its limitations.
- Ambiguous or unknown components are excluded rather than guessed.
- Aggregate focus is navigation only and does not designate a ligand of interest.
- Original uploads and normalized artifacts remain untouched.

### Accessibility

- The toolbar has a stable name and logical DOM order.
- Active picking state uses text plus `aria-pressed` or a selected option.
- Unavailable context actions remain focusable, expose `aria-disabled`, suppress
  activation, and provide a reason reachable without hover.
- Focus indicators, control bounds, zoom 100%/200%, light/dark contrast, desktop,
  and compact layouts remain in release qualification.
- No claim is made that individual canvas atoms become screen-reader objects.

### Performance

- Focus-target derivation is a pure memoized scan over already loaded normalized
  residue/atom data and relevant display state.
- Focus interactions cause no network request, project mutation, scene rebuild,
  or complete-structure serialization.
- Mol* loci construction remains linear in loaded atomic units and selected
  target references. Ordinary protein-ligand projects are the required scale.
- Fit visible uses Mol*'s current rendered bounds rather than rebuilding a
  parallel browser-side spatial model.

### Security

- No new file, path, upload, remote, job, plugin, expression, or execution input.
- Toolbar state and targets are derived from validated application records.

## Decisions and deviations

- D-043 records that application state owns focus targets and Mol* owns only
  camera execution and rendered bounds.
- The separate picking control reuses existing transient state instead of
  creating a toolbar-specific store.
- "Structure" remains the public term; Molecule and Component are not added as
  parallel selection identities.
- Picking mode is not persisted across reload because active tools are session
  state under the accepted ownership boundary.
- Existing reset behavior is exposed as the more precise Fit all visible command
  through a typed viewer method and must frame rendered scene bounds.
- Ligand focus uses normalized component classification, not Mol* classification
  or hard-coded residue names.
- Multiple ligands are framed together. A dropdown is deferred because current
  residue IDs are not an approved durable component/ligand-interest model.
- Keyboard traversal and activation are approved; global shortcuts are not.
- The existing Selection inspector remains the advanced selection surface.

Any implementation deviation that changes persistence, schemas, classification,
state ownership, aggregate-ligand behavior, or an essential requirement needs a
documented plan amendment and renewed approval before proceeding.

## Version and release plan

### SemVer determination

This work is a minor release: `0.1.1` to `0.2.0`.

It adds backward-compatible user-visible functionality: an always-accessible
interaction surface and a new ligand-aware camera action. It removes no supported
behavior and keeps the advanced inspector. It makes no incompatible HTTP API,
database, project, archive-schema, normalized-molecular, or browser-storage
change. A patch would understate the new behavior; a major increment would
overstate compatibility impact. A prerelease is unnecessary after all focused
and complete gates pass.

The repository has established release history: annotated tag and GitHub
release `v0.1.1` are the verified baseline. The planned annotated tag is
`v0.2.0`.

Authoritative version sources that must change together:

1. `pyproject.toml`
2. The local project record in `uv.lock`
3. `apps/web/package.json`
4. FastAPI metadata in `apps/api/src/molweave_api/main.py`
5. Archive producer provenance in `apps/api/src/molweave_api/archive_service.py`

### Pull request

- Title: `feat(viewer): add selection and focus toolbar`
- Base: `master`
- Head: `feat/issue-3-viewer-toolbar-focus`
- Body: document implemented, simplified, deferred, rejected, and already
  satisfied requirements; include exact verification, migration status,
  compatibility, SemVer impact, and `Closes #3`.
- Merge strategy: rebase-and-merge after approval and all gates.

Rebase-and-merge retains coherent Conventional Commit checkpoints and matches
the issue #8 feature-delivery precedent. The absence of configured CI or
protection does not reduce the documented local release gate. Any protection,
check, or required review added before merge becomes binding.

### Issue handling

- Use `Closes #3` so GitHub closes the issue only when the feature PR merges.
- Do not close or claim implementation of issues #2, #5, #6, #7, or #11.
- Publish a final issue reply only after merge, tag, and release are remotely
  verified.
- The reply must state shared picking behavior, aggregate ligand semantics,
  verification, compatibility, version/tag, and deferred per-ligand work.
- No new follow-up issue is planned: #2 and #11 already own deferred identity
  and designation, and shortcuts need demonstrated demand first.

### Tag and GitHub release

- Proposed annotated tag: `v0.2.0`.
- Create it only from the verified merged commit on clean `master`.
- Push and dereference the tag before creating the GitHub release.
- Never reuse or move an existing release tag.

Release-note sections:

1. Highlights
2. Added
3. Changed
4. Verification
5. Compatibility and migrations
6. Scientific and accessibility limitations
7. Deferred and follow-up work

### Release closeout and branch cleanup

- If verified remote PR, tag, release, or issue-response identifiers must be
  recorded after publication, use a documentation-only closeout PR without
  changing version or moving the tag.
- Delete the remote feature branch only after feature merge, annotated tag,
  GitHub release, issue response, and any closeout PR are verified.
- Delete the local feature branch only after local `master` is fast-forwarded
  to the final verified remote commit.
- Do not rely on automatic branch deletion; it is disabled remotely.

## Merge and release blockers

Merge is blocked when any of the following is true:

- The approved plan is missing or changed materially without renewed approval.
- Any focused or complete validation command fails.
- Toolbar and Selection inspector can diverge.
- Changing picking mode modifies current selection.
- A supported layout clips, overlaps, obscures, or removes the only action path.
- Active or unavailable state is communicated by color alone.
- An unavailable context action lacks a keyboard-reachable explanation.
- Ligand focus relies on residue names, size, ordering, proximity, connectivity
  guesses, or Mol* internal classification.
- Water, ions, polymer, unknown, hidden, failed, unloaded, or isolated-out atoms
  enter the ligand target.
- Multiple-ligand behavior is not deterministic and documented.
- Focus or fit changes selection, isolation, visibility, representations,
  molecular state, project revision, artifacts, history, or archives.
- Toolbar interactions trigger normalized-structure network requests, project
  commands, or complete viewer rebuilds without a separately approved reason.
- A valid 0.1.0 or 0.1.1 archive cannot be imported.
- API, project, normalized, browser-storage, or archive compatibility changes
  beyond this plan.
- Authoritative version sources disagree.
- `git diff --check` or full-diff review has a consequential unresolved finding.
- Required checks, protections, reviews, or conversations configured before
  merge remain unresolved.
- Documentation claims evidence that did not pass.

Release is additionally blocked when:

- The feature PR is not verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The complete release gate did not pass on the final candidate.
- `v0.2.0` already exists or points to another commit.
- Any authoritative version source differs from 0.2.0.
- The annotated tag cannot be pushed, dereferenced, or verified remotely.
- The GitHub release cannot be verified against the tag and merged commit.
- The final issue response would claim unverified delivery or deferred behavior.

## Progress and completion log

| Date | Status | Evidence / notes |
|---|---|---|
| 2026-08-06 | Plan proposed | Read-only inspection covered repository guidance, product/architecture/schema/API/release documentation, frontend selection and viewer ownership, normalized component classification, migrations, tests, version sources, git state, issue #3, related issues, remote branches, pull requests, release/tag history, merge settings, CI, and protection state. |
| 2026-08-06 | Plan approved | User approved the complete proposed scope, including aggregate focus of all visible classified ligands, the 0.2.0 release path, checkpoints, blockers, and delivery workflow. |
| 2026-08-06 | Branch prepared | Local clean `master` was fast-forward checked against `origin/master` at `34a2b480cea67a509bb396375b58b4f7841f7cbc`; branch `feat/issue-3-viewer-toolbar-focus` was created. |
| 2026-08-06 | Plan persisted | This plan, concise project handoff, and D-043 are the first branch change. No implementation, tests, versions, schemas, migrations, or runtime behavior changed. |
| 2026-08-06 | Checkpoint 1 complete locally | Added a controlled always-visible viewer toolbar with Atom, Residue, Chain, and Structure buttons plus a compact labelled select, wired through `App` and `WorkspaceCanvas` to the existing selection-store setter. Direct tests cover every mode, controlled state, keyboard-native interaction, and selection invariance. The focused Vitest command passed all 47 tests across 15 files; ESLint, TypeScript, the production build, and `git diff --check` passed. The build retained the established lazy Mol* chunk warning at 965.86 KiB gzip; the initial application chunk is 150.46 KiB gzip. Diff review found no persistence, schema, API, molecular, camera, or classification change and no unrelated scope. |

## Completion

Checkpoint 1 is implemented and verified. Checkpoints 2 through 4, pull-request
delivery, and release closeout remain in progress under this approved contract.
