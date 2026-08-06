# Issue 2 - Automatic Component Detection And Structure Hierarchy

Status: approved; all five checkpoints implemented and verified; release candidate qualified

## Issue metadata

- Issue: [#2 - Add automatic component detection and a structure hierarchy for molecular complexes](https://github.com/ManuelSe/MolWeave/issues/2)
- Issue state at approval: open
- Issue author: `ManuelSe`
- Issue created: 2026-08-03
- Plan approved: 2026-08-06
- Base branch: `master`
- Base commit at approval: `da54b10116175d6232882caa8359f7c47d1548f1`
- Planned feature branch: `feat/issue-2-structure-hierarchy`
- Planned application version: `0.3.0`
- Planned tag: `v0.3.0`
- Planned pull-request title: `feat(components): add automatic structure hierarchy`

This document is the implementation contract for issue #2. It supplements, but
does not replace, the global `docs/PLAN.md`.

## Core problem and approved outcome

MolWeave already has stable normalized atom, residue, and chain identities,
canonical atom-reference selection, project-entry and sequence selection,
coarse component visibility, named selections, and explicit focus actions. It
does not have stable molecular component instances or a component hierarchy.
Its current macromolecular importer also classifies nearly every residue that
is not polymer, water, or a recognized single-atom ion as ligand and records
each macromolecular chain's entity type as `mixed`. Presenting that coarse state
as comprehensive detection would overstate scientific certainty.

The approved outcome is an application-owned, deterministic structure
hierarchy derived from `NormalizedStructureV1`. Import preserves useful source
entity, subchain, and polymer facts. The hierarchy exposes stable individual
components and category groups, records whether each assignment came from
source metadata, a documented fallback, or unresolved ambiguity, and makes
every node selectable through the existing canonical atom-reference model.

The project browser remains the top-level entry list. Each entry gains a lazy,
expandable hierarchy. Selecting a category or component synchronizes the
project browser, viewer, inspector, sequence view, named-selection workflow,
measurements, and applicable editors without making the hierarchy or Mol* a
second molecular authority. Existing Protein, Ligands, Solvent, and Ions
visibility settings use application-owned component membership where their
semantics apply. Current explicit Focus selection remains the camera action.

The hierarchy is reproducibly regenerated from the current normalized
artifact rather than stored as a duplicate project snapshot. Detection does not
modify coordinates, bonding, conformers, residue identifiers, source files, or
chemistry. It does not designate a ligand of interest, prepare a structure, or
claim that inferred component roles are experimentally validated.

## Authority and assumptions

The plan applies this authority order:

1. User approval of this plan and any later explicit correction.
2. `AGENTS.md` and accepted decisions in `docs/DECISIONS.md`.
3. Existing molecular, project, API, archive, viewer, and selection ownership
   boundaries.
4. Issue #2's underlying user problem, intended outcomes, constraints, and
   explicit non-goals.
5. Technical and UI suggestions in the issue, which are non-binding.

Accepted decisions D-002, D-015 through D-023, D-035, D-038, D-042 through
D-044, and the new D-045 remain authoritative:

- `NormalizedStructureV1` remains the molecular authority.
- Mol* remains a disposable renderer and never owns component identity.
- Every hierarchy selection materializes as canonical `(structure_id,
  atom_id)` references.
- Original uploads remain immutable.
- Parsing and classification warnings remain visible.
- Stable component IDs do not use display labels, coordinates, array indices,
  or Mol* references.

Planning assumptions:

- Component IDs are entry-local, opaque, deterministic identifiers anchored to
  stable normalized entity/subchain/chain/residue identity.
- Polymer components represent individual source chain or subchain instances.
- Non-polymer, water, solvent, ion, and heterogen components normally represent
  individual source residue/entity instances.
- Covalent connectivity between a polymer and non-polymer instance does not
  erase the source component boundary.
- Incomplete PDB/PDBx connectivity is not sufficient to split one source
  residue into invented molecular components. Separate source instances remain
  separate; a suspected compound with ambiguous boundaries is warned about.
- "Ligand" in this hierarchy means a putative non-polymer or cofactor class. It
  is not a ligand-of-interest designation or binding-role assertion.
- Classification provenance is qualitative (`source`, `fallback`, or
  `ambiguous`), not an unsupported numeric confidence score.
- Unknown atoms and residues remain accessible through an unclassified
  fallback. No atom may disappear from the hierarchy.
- Hierarchy selections reuse the existing selection schema. Polymer chain
  components use chain granularity, residue-backed components use residue
  granularity, and mixed category groups materialize atom granularity. No new
  persisted selection enum is introduced.
- New optional normalized source-fact fields have defaults so existing
  artifacts remain valid `NormalizedStructureV1` documents.

## Repository findings

`NormalizedStructureV1` currently stores application-owned chains, residues,
atoms, bonds, conformers, warnings, inferences, and source facts. Residues carry
only `polymer`, `ligand`, `water`, `ion`, or `unknown`; chains carry a free-text
entity type. The Gemmi macromolecular adapter calls `setup_entities()` but then
discards per-entity/subchain/polymer distinctions. Its fallback residue table
can distinguish amino acids, DNA, RNA, water, buffer/crystallization agents,
sugars, other ligands, and unknown names, but that information is not retained.

The lazy structure endpoint already returns the authoritative normalized
document and viewer projection for one entry. Visible structures use an
artifact-keyed TanStack Query cache, and selecting a hidden structure already
loads authoritative molecular data on demand. Adding the derived hierarchy to
this response preserves the existing lazy ownership boundary without placing
large molecular payloads into ordinary project responses.

The central selection store is transient Zustand state containing canonical
atom references. Higher-level residue, chain, and structure selections are
already materialized as atom sets, and saved selections persist the same atom
references through the command bus. Component and category selection can use
this path without a second selection identity model.

Mol* currently builds its visible components using Mol* static component
classification. Focus visible ligands separately consumes normalized
`residue.component_type` because D-043 prohibits Mol* from classifying
application focus targets. Issue #2 establishes the one application component
projection that both visibility and focus must consume.

The current export workflow is entry-scoped. It can export all, selected, or
visible entries and filter hydrogens, water, and ions, but it cannot export an
arbitrary atom/component subset. Selection-specific representations are also
not persisted. Issue #7 owns the latter; component subset extraction/export
needs a separate product contract.

At approval, clean local `master`, `origin/master`, and the remote default
branch matched `da54b10116175d6232882caa8359f7c47d1548f1`. The repository has
verified annotated tags and GitHub releases `v0.1.1`, `v0.2.0`, and `v0.2.1`.
The issue-era assumption that release history was not established is therefore
superseded by current repository and remote state.

The remote has no GitHub Actions workflows, branch protection, rulesets,
required status checks, or required reviews. Merge, squash, and rebase merge are
enabled; automatic branch deletion is disabled. Recent feature PRs use rebase
merge and a documented complete local release gate.

Related issue boundaries:

- Issue #7 owns durable selection-specific representation and visibility
  assignments.
- Issue #11 owns ligand-of-interest designation and ligand-centric analysis.
- Issue #9 concerns top-level project group membership, not molecular
  components inside an entry.
- Issue #1 concerns explicit hydrogen display and does not change component
  identity.

## Requirement disposition matrix

| Requirement | Disposition | Approved treatment |
|---|---|---|
| Automatically analyze imported complexes | Essential | Preserve source facts during import and derive the hierarchy automatically when authoritative structure data is read. |
| Separate project entries from internal hierarchy | Essential | Keep entries in the project browser and add an expandable hierarchy beneath each entry. |
| Stable component identities | Essential | Add deterministic application component IDs independent from Mol*. |
| Protein chains individually selectable | Essential | Create one protein component per source chain/subchain instance. |
| DNA and RNA chains | Supporting | Classify from source polymer type with documented residue fallback. |
| Other or hybrid polymers | Supporting | Expose as Other polymer rather than forcing them into protein, DNA, or RNA. |
| Multiple ligands separately selectable | Essential | Expose separate source residue/entity instances as separate putative ligand/cofactor components. |
| Water independently selectable | Essential | Provide a Water category and individual water instances. |
| Non-water solvent | Essential with narrowed terminology | Use Other solvent / crystallization additive; do not claim every agent is biologically meaningful solvent. |
| Metals and ions | Essential | Identify single-atom metal/ion instances before broader heterogen classification. |
| Other heterogens | Essential | Preserve carbohydrate/branched and other recognized non-polymer material separately. |
| Ambiguous material remains accessible | Essential | Place unresolved instances under Unclassified and expose classification warnings. |
| Category-level selections | Essential | Union deterministic component memberships into canonical atom selections. |
| Additive and subtractive selection | Already satisfied | Reuse Ctrl/Meta/Shift add and Alt subtract semantics. |
| Focus a component | Already satisfied after selection | Use the existing explicit Focus selection action; add no duplicate camera system. |
| Category visibility | Supporting / partly satisfied | Connect Protein, Ligands, Solvent, and Ions groups to existing durable viewer settings using application memberships. |
| Individual component visibility | Deferred | Requires selection-specific display assignments; issue #7 owns that architecture. |
| Apply separate styles to components | Deferred | Issue #7 owns persistent selection-specific representation styling. |
| Named component selections | Already satisfied after selection | Save the selected atom set through the existing named-selection command. |
| Use components in measurements and editing | Already satisfied where scientifically applicable | Existing tools consume the same canonical selection and retain normal applicability checks. |
| Export a component subset | Rejected as part of this slice; follow-up recommended | Current export is entry-scoped. Subset export needs extraction, boundary-bond, metadata, and filename semantics. |
| Rename detected components | Deferred; follow-up required | Needs durable labels, commands, archive behavior, and invalidation rules. |
| Manually reclassify components | Deferred; follow-up required | Needs a typed override model that preserves the original assignment and survives edits safely. |
| Reproduce classification after reopening | Essential | Regenerate from the normalized artifact and retained source facts; test deterministic IDs and memberships. |
| Preserve classifications through coordinate edits | Essential | Coordinate-only edits retain component IDs, category, and membership exactly. |
| Reconcile topology edits | Essential | Recompute from current stable residue/atom identities; removed components disappear without stale references. |
| Split one residue solely by connectivity | Rejected as proposed | PDB/PDBx connectivity may be incomplete; source instance boundaries are safer and ambiguity is reported. |
| Covalently bound ligands remain selectable | Supporting | Source entity/residue identity takes precedence over graph connectivity to polymer atoms. |
| Add Component as a viewer picking mode | Rejected as unnecessary for this slice | The hierarchy provides explicit component selection without changing Mol* picking granularity or persisted selection enums. |
| Ligand-of-interest designation | Rejected for issue #2 | Issue #11 owns that durable semantic model. |
| Preparation, validation, docking, or protonation | Explicit non-goal | Add no chemistry or docking behavior. |

No unresolved product decision blocks the approved slice. Before issue #2 is
closed, create a focused follow-up for durable component labels and
classification overrides. Record component extraction/subset export as a
separate product-design follow-up. Reuse issues #7 and #11 rather than creating
duplicates for their accepted scopes.

## Accepted scope

- Preserve optional source entity, subchain, entity type, and polymer type facts
  during macromolecular normalization.
- Add a typed `ComponentHierarchyV1` domain projection with deterministic
  individual components, categories, membership, provenance, and warnings.
- Classify protein, DNA, RNA, other polymer, putative ligand/cofactor, water,
  other solvent/additive, ion/metal, other heterogen, and unclassified material.
- Prefer source metadata, then use documented Gemmi/normalized fallbacks, and
  retain ambiguity rather than silently dropping or confidently guessing.
- Add the hierarchy to the lazy entry structure response.
- Add an expandable, accessible per-entry hierarchy to the project browser.
- Select individual and category nodes through canonical atom references and
  existing replace/add/subtract semantics.
- Keep hierarchy selection transient and camera-neutral.
- Use application component membership for existing category visibility and
  aggregate ligand focus where applicable.
- Regenerate hierarchy after molecular changes and verify identity stability
  after coordinate-only changes.
- Add domain, adapter, API, component, viewer, archive, accessibility,
  responsive, and real-WebGL workflow evidence.
- Document scientific semantics and prepare a compatible minor release.

## Non-goals

- Durable manual component names or classification overrides.
- Ligand-of-interest designation, ranking, active-ligand state, or descriptors.
- Selection-specific styles, colors, labels, opacity, surfaces, or presets.
- Individual-component show/hide persistence beyond issue #7's future model.
- Arbitrary component extraction or atom-subset export.
- Connectivity repair, bond-order inference, chemical validation, preparation,
  protonation, docking, or binding-site analysis.
- New viewer picking granularities, box selection, or gesture semantics.
- Replacing top-level entry groups or implementing issue #9.
- A Mol* snapshot, Mol* component ID, or client-only molecular authority.
- A database migration or duplicate persisted hierarchy snapshot.

## Component hierarchy and scientific semantics

The public hierarchy contract contains:

```text
ComponentHierarchyV1
  schema_version: 1
  components[]
    id
    category
    display_label
    chain_ids[]
    residue_ids[]
    atom_ids[] only for atoms without usable hierarchy
    classification_source
    classification_status
    warnings[]
  warnings[]
```

Approved categories are:

```text
protein
dna
rna
other_polymer
ligand
water
solvent
ion
other_heterogen
unclassified
```

The UI groups these values as:

```text
Entry
├── Polymers
│   ├── Protein
│   ├── DNA
│   ├── RNA
│   └── Other polymer
├── Ligands / cofactors
├── Solvent
│   ├── Water
│   └── Other solvent / additives
├── Ions / metals
└── Other / unclassified
    ├── Other heterogens
    └── Unclassified
```

Empty groups are omitted. Category disclosures start collapsed so water-heavy
structures do not render every instance immediately.

Classification precedence is:

1. PDBx/Gemmi source entity and polymer facts for polymer, water, branched, and
   non-polymer identity.
2. Exact polymer type for protein, DNA, RNA, hybrid, carbohydrate, PNA, or
   other polymer classification.
3. Tabulated residue facts for amino acid, nucleotide, water,
   buffer/crystallization agent, sugar, or other ligand/cofactor fallback.
4. A documented single-atom metal/ion element fallback.
5. Existing normalized coarse component facts for legacy artifacts.
6. Unclassified when the remaining evidence cannot support a narrower class.

Putative non-polymers that are not recognized as water, ion, additive, sugar,
or another heterogen may be exposed as ligand/cofactor with an explicit
fallback marker. The UI and documentation must not present that inference as a
ligand-of-interest or experimental binding role.

Every individual component owns a disjoint membership. Every atom belongs to
exactly one component, including atoms without residue hierarchy. Category
selections are unions of individual memberships and contain no duplicate atom
references. Sorting and labels are deterministic but labels are not identity.

## Milestones and checkpoints

### Checkpoint 0 - Persist the approved plan

Concrete outcome:

- Store this approved implementation contract as the first branch change,
  record a concise project handoff, and append D-045.

Affected areas:

- `docs/plans/issue-2-structure-hierarchy.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`

Acceptance criteria:

- Status records approval and implementation not started.
- Base commit and feature branch are verified.
- The global `docs/PLAN.md` is unchanged.
- No runtime, test, version, schema, or migration file changes.

Focused validation:

```bash
git diff --check
git status --short
```

Documentation and migration implications:

- Creates the detailed source of truth, updates project-level progress, and
  records the accepted component identity decision.
- No migration.

Expected commit:

```text
docs(plan): add approved plan for issue 2
```

Rollback and compatibility:

- Revert the documentation commit. There is no runtime, data, API, or archive
  compatibility effect.

### Checkpoint 1 - Establish the component domain and scientific classifier

Concrete outcome:

- Add typed deterministic component detection to `molweave_core`, retain
  optional source facts, expose the hierarchy through the lazy structure API,
  and support legacy artifacts through conservative fallback.

Affected areas:

- `packages/molweave_core/src/molweave_core/molecular.py`
- New `packages/molweave_core/src/molweave_core/components.py`
- Macromolecular and ligand adapters
- `apps/api/src/molweave_api/schemas.py`
- `apps/api/src/molweave_api/import_export.py`
- Scientific fixtures and Python tests

Implementation constraints:

- Keep classification library-independent outside the adapter boundary.
- Preserve optional source facts without changing existing field semantics.
- Generate component identity from stable normalized source/entry-local
  anchors, never display labels, coordinates, ordering, or viewer state.
- Produce disjoint complete membership and deterministic ordering.
- Surface ambiguous classification as warnings.
- Do not introduce a database table or persisted duplicate hierarchy.

Acceptance criteria:

- Source entity/polymer metadata takes precedence.
- Standalone RDKit molecules remain one explicit ligand component.
- All approved categories and unclassified fallbacks are deterministic.
- Covalent ligand-to-polymer bonds do not merge source component identities.
- Old v0.2.1 normalized artifacts generate a usable fallback hierarchy.
- Stable IDs do not depend on coordinates, display names, or list order.
- Detection alone changes no atom, bond, coordinate, conformer, residue number,
  chain name, or original byte.
- Every atom belongs to exactly one individual component.

Focused validation:

```bash
.venv/bin/uv run ruff check packages/molweave_core apps/api tests
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest \
  tests/unit/test_components.py \
  tests/unit/adapters \
  tests/scientific/test_component_classification.py \
  tests/scientific/test_release_fixture.py \
  tests/integration/test_import_export.py
git diff --check
```

Documentation and migration implications:

- Additive optional normalized source facts retain schema version 1.
- `StructureRead` gains an additive hierarchy field.
- No Alembic, project-state, selection, scene, job, or archive migration.

Expected commit:

```text
feat(components): add deterministic component hierarchy
```

Rollback and compatibility:

- Before release, revert the additive domain/API changes. After release, older
  data remains readable; rollback would remove hierarchy display but does not
  require transforming stored projects.

### Checkpoint 2 - Add the selectable hierarchy and authoritative viewer projection

Concrete outcome:

- Add the expandable per-entry hierarchy, route node selection through the
  central selection store, and use application hierarchy membership for
  existing component visibility and ligand focus.

Affected areas:

- New `apps/web/src/components/StructureHierarchy.tsx`
- `apps/web/src/components/ProjectBrowser.tsx`
- `apps/web/src/App.tsx`
- Frontend API types and selection helpers
- Viewer structures, focus targets, and Mol* projection
- Component, selection, browser, and viewer tests

Implementation constraints:

- Reuse artifact-keyed TanStack Query data and current selection callbacks.
- Keep selection transient and camera-neutral.
- Use native disclosures and buttons with stable accessible names.
- Lazily render individual component lists only after category expansion.
- Use application membership for Protein, Ligands, Solvent, and Ions
  visibility; never hide Other/unclassified material as an accidental fallback.
- Do not add style, rename, override, ligand designation, or subset-export
  controls.

Acceptance criteria:

- Expanding an entry uses the existing structure query cache.
- Category and individual nodes produce exact canonical atom references.
- Replace/add/subtract behavior matches all other selection surfaces.
- Selection changes neither camera nor durable project state.
- Existing Focus selection frames a hierarchy selection explicitly.
- Existing mapped group visibility remains durable and undoable.
- Aggregate visible-ligand focus consumes the new component projection.
- Inferred and ambiguous assignments have accessible explanations.
- Desktop and compact controls are keyboard operable.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- \
  component-hierarchy project-browser selection focus-targets \
  structure-loading viewer-adapter
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
git diff --check
```

Documentation and migration implications:

- Implements D-045 through existing query, selection, viewer-settings, and
  viewer-adapter boundaries.
- No migration.

Expected commit:

```text
feat(components): add selectable structure hierarchy
```

Rollback and compatibility:

- Frontend/viewer rollback restores the former coarse projection. No database
  rollback is required.

### Checkpoint 3 - Qualify scientific and user workflows

Concrete outcome:

- Protect import, hierarchy, selection, reopen, edit, archive, responsive, and
  real-WebGL workflows with focused integration and browser evidence.

Affected areas:

- New hierarchy integration tests
- New `tests/e2e/structure-hierarchy.spec.ts`
- Existing selection, viewer, edit, and archive regressions where needed

Acceptance criteria:

- A representative complex exposes separate polymer chains, ligand instances,
  water, solvent/additive, ion/metal, heterogen, and unclassified material.
- Category selection equals the exact union of member atoms.
- Individual ligand, water, and ion selections contain only that instance.
- PDB fallback and PDBx metadata-first paths both pass.
- Selection highlights the viewer without moving the camera or mutating the
  project.
- Solvent group visibility hides and restores the correct detected members.
- A component-derived named selection survives reload.
- Coordinate edits preserve component IDs and membership.
- Topology edits regenerate membership from current identities.
- Reopen and archive round-trip regeneration are deterministic.
- Desktop and Pixel 7 layouts remain accessible and within viewport bounds.
- Cached visible structures are not repeatedly fetched for hierarchy actions.

Focused validation:

```bash
.venv/bin/uv run pytest \
  tests/integration/test_component_hierarchy.py \
  tests/integration/test_import_export.py \
  tests/integration/test_archive_roundtrip.py \
  tests/integration/test_coordinate_commands.py \
  tests/integration/test_ligand_edits.py \
  tests/integration/test_protein_edits.py

PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/structure-hierarchy.spec.ts \
  tests/e2e/synchronized-selection.spec.ts \
  tests/e2e/viewer-controls.spec.ts
git diff --check
```

Documentation and migration implications:

- Records planned evidence in this plan; passing results are added only after
  commands complete successfully.
- No migration.

Expected commit:

```text
test(e2e): cover structure hierarchy workflows
```

Rollback and compatibility:

- Test-only rollback removes release evidence without changing runtime or
  persisted behavior.

### Checkpoint 4 - Document the verified contract

Concrete outcome:

- Document component ownership, schema, API, classification limitations,
  accessibility, performance, and verified evidence accurately.

Affected areas:

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/NORMALIZED_SCHEMA.md`
- `docs/SCIENTIFIC_LIMITATIONS.md`
- `docs/ACCESSIBILITY.md`
- `docs/PERFORMANCE.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- This plan's progress log

Acceptance criteria:

- Every category and classification source is defined.
- Putative ligand is distinguished from ligand of interest.
- Ambiguous roles and incomplete connectivity are documented.
- Deferred overrides, styling, and subset export are not claimed.
- Passing evidence is recorded only after execution.
- D-045 remains consistent with executable behavior.

Focused validation:

```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
git diff --check
```

Documentation and migration implications:

- Updates architecture, contract, limitation, quality, and evidence documents.
- No migration.

Expected commit:

```text
docs(components): document hierarchy semantics
```

Rollback and compatibility:

- Documentation-only rollback. Runtime behavior remains.

### Checkpoint 5 - Prepare and qualify MolWeave 0.3.0

Concrete outcome:

- Align authoritative versions, preserve archive compatibility, run the
  complete release gate, review the full diff, and prepare an accurate release
  candidate.

Affected areas:

- `pyproject.toml`
- Generated `uv.lock`
- `apps/web/package.json`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`
- `tests/integration/test_archive_roundtrip.py`
- `docs/RELEASE_NOTES.md`
- `docs/VERIFICATION.md`
- `docs/PROGRESS.md`
- This plan's progress log

Authoritative version changes:

- Python project/application version: `0.3.0`.
- Generated `molweave-dev` lock entry: `0.3.0`.
- Web package version: `0.3.0`.
- FastAPI/OpenAPI application version: `0.3.0`.
- Archive producer application version: `0.3.0`.

Versions explicitly not changed:

- `/api/v1`.
- Alembic head `0007`.
- `ProjectStateV1`.
- `ProjectManifestV1.schema_version`.
- `NormalizedStructureV1.schema_version`.
- Demonstration plugin implementation version `1.0.0`.

Acceptance criteria:

- All five authoritative sources report `0.3.0`.
- Archive round trips include 0.2.1 producer provenance while retaining 0.1.x
  and 0.2.0 coverage; 0.3.0 output retains archive schema version 1.
- No original upload or existing archive content is rewritten merely to add a
  hierarchy.
- Release notes distinguish delivered behavior, scientific limitations,
  deferred work, and follow-up ownership.
- Every focused and complete validation passes on the final candidate.
- Full-diff review finds no unresolved scientific, accessibility,
  compatibility, performance, dead-code, or scope issue.

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

- Adds v0.3.0 release notes, compatibility evidence, and final project records.
- No database, project, selection, scene, job, or archive-schema migration.

Expected commits:

```text
chore(release): prepare v0.3.0
docs(plan): record v0.3.0 release qualification
```

The second commit is made only if qualification produces real documentation
changes. Do not create an empty checkpoint or verification commit.

Rollback and compatibility:

- Revert release preparation before merge if qualification fails. Never move
  or reuse a published tag. No data downgrade is required for the additive
  feature, but a partially reverted release must not be tagged.

## Acceptance and verification evidence

| Claim | Planned evidence |
|---|---|
| Source-aware classification and conservative fallback | Component-domain and adapter scientific tests for PDBx metadata, PDB fallback, and legacy normalized artifacts |
| Complete disjoint atom membership | Domain invariant tests across every category and atoms lacking residue hierarchy |
| Stable component identity | Exact ID/membership comparisons across repeated derivation, reopen, archive import, and coordinate edits |
| Topology reconciliation | Ligand/protein edit integration tests proving removed or changed hierarchy is regenerated without stale membership |
| Category and individual selection | Component tests and browser atom/residue/chain/structure summaries |
| Central synchronization | Existing selection store/viewer paths plus `structure-hierarchy.spec.ts` |
| Camera-neutral selection | Exact named camera snapshots before and after hierarchy selection |
| Existing explicit focus | Focus selection changes the camera only after explicit activation |
| Category visibility | Application-owned membership and real-WebGL visible-content/state assertions |
| Named selection persistence | Save, reload, and restore a component-derived canonical atom set |
| Warning visibility | Component/API/UI assertions for inferred and unclassified material |
| Original molecular invariance | Exact coordinate, bond, residue/chain identity, original-byte, project revision, and artifact assertions where applicable |
| Responsive accessibility | Keyboard, focus, viewport, overflow, and Pixel 7 browser evidence |
| Query and rendering performance | Structure-request counts, cached expansion, collapsed large category lists, and existing release profile |
| Release compatibility | Complete gate and archive round trips through 0.2.1 provenance |

Automated evidence is the acceptance authority. Manual inspection may
supplement hierarchy readability and meaningful WebGL content but cannot
replace molecular identity, selection, compatibility, or state-invariance
assertions.

## Data, migration, API, UI, and quality implications

### Data and migrations

- Add optional normalized source entity/subchain/polymer facts with defaults.
- Do not persist a duplicate hierarchy in SQLite, checkpoints, commands, or
  browser storage.
- No Alembic migration; head remains `0007`.
- Existing normalized artifacts derive through fallback without rewrite.

### Archive compatibility

- `ProjectManifestV1.schema_version` remains 1.
- New optional normalized facts travel inside current normalized artifacts.
- Existing archives without those facts remain importable.
- Application version remains validated producer provenance and advances to
  0.3.0.
- Archive round-trip tests retain 0.1.0, 0.1.1, 0.2.0, and 0.2.1 provenance.

### API

- Add a typed hierarchy field to `StructureRead`.
- Keep `/api/v1` and every existing request/response field.
- Do not add a mutation endpoint because the approved hierarchy is derived and
  manual overrides are deferred.

### UI and interaction

- Keep project entries as the top-level structure list.
- Add per-entry and per-category disclosures with counts and warnings.
- Keep large instance categories collapsed until requested.
- Selection buttons use existing modifiers and pressed state.
- Mapped category visibility uses existing undoable viewer-setting commands.
- Component selection itself remains transient and camera-neutral.
- Direct node style, rename, reclassify, and subset-export controls are omitted.

### Scientific behavior

- Classification records source/fallback/ambiguous provenance.
- Putative ligand/cofactor does not mean ligand of interest or validated binder.
- Buffer/crystallization-agent fallback is labelled as solvent/additive rather
  than asserted to be biologically meaningful solvent.
- Connectivity does not override explicit source entity/residue boundaries.
- Incomplete or unknown evidence remains unclassified and visible.
- Coordinates, bonds, residue identities, original bytes, and chemistry are
  not changed by detection.

### Accessibility

- Use native disclosures and buttons with meaningful names, expanded state,
  counts, pressed selection state, and warning descriptions.
- Retain logical keyboard order and visible focus.
- Exercise both desktop panel and Pixel 7 drawer layouts.
- Keep classification and selection state available as semantic DOM content;
  do not depend on WebGL pixels as the only information carrier.

### Performance

- Derive hierarchy in linear passes over normalized hierarchy and membership,
  followed by deterministic bounded sorting.
- Reuse artifact-keyed structure query data.
- Do not refetch or serialize a complete structure for repeated selection of an
  already loaded hierarchy.
- Do not duplicate full atom lists in every category payload; derive unions
  from individual memberships.
- Render large water/solvent instance lists only after explicit expansion.

### Security

- Add no new path, upload, remote service, plugin, arbitrary command, or code
  execution surface.
- Continue validating normalized documents and archive members through current
  strict boundaries.

## Decisions and deviations

- D-045 makes the normalized artifact and deterministic hierarchy projection
  authoritative for components; Mol* component state remains disposable.
- The issue's broad node-action menu is reduced to selection and mapped group
  visibility. Existing explicit focus, named selection, measurement, and editor
  surfaces consume the selected atom set; styling belongs to issue #7.
- Durable rename/reclassification is deferred because it requires a distinct
  override schema, command/history semantics, archive handling, topology-edit
  reconciliation, and preservation of the automatic assignment.
- Component subset export is rejected from this slice because extracting atoms
  raises boundary-bond, hierarchy, metadata, file-format, and new-entry versus
  download decisions that the issue does not resolve.
- Connectivity-only splitting is rejected for PDB/PDBx sources because missing
  bonds would create false components. Explicit source instances remain the
  primary boundary and ambiguity is surfaced.
- No new Component picking granularity is introduced. The hierarchy is the
  explicit selection surface and materializes the existing selection schema.
- Ligand-of-interest state remains with issue #11 and is not inferred from
  hierarchy category or recent selection.

Any implementation deviation that reduces an essential requirement, changes
state ownership, adds a persisted override, changes an archive/schema version,
or broadens chemistry behavior requires plan amendment and renewed approval.

## Version and release plan

### SemVer determination

This work is a backward-compatible minor release from `0.2.1` to `0.3.0`.

Rationale:

- It adds substantial user-visible component detection, hierarchy, selection,
  and visibility functionality.
- It adds an additive lazy-structure API field and optional normalized source
  facts.
- It removes no public behavior and does not break existing projects or
  archives.
- It requires no database or archive-schema migration.
- A patch would understate the new feature; a major release would overstate its
  compatibility impact.
- A prerelease is unnecessary after all focused and complete gates pass.

The repository has established annotated tags and releases through v0.2.1.
`v0.3.0` is therefore the next non-colliding feature release.

### Pull request

- Title: `feat(components): add automatic structure hierarchy`
- Base: `master`
- Head: `feat/issue-2-structure-hierarchy`
- Body: document implemented, already-satisfied, simplified, deferred, and
  rejected requirements; include scientific semantics, validation,
  compatibility, migration status, release impact, follow-ups, and `Closes #2`.
- Merge strategy: rebase-and-merge after approval, complete validation, and
  full-diff review.
- Request review but do not claim an independent review unless one is returned.

The repository currently exposes no CI, protection, required check, or required
review. The complete local release gate is therefore a merge blocker, not an
optional substitute. Any protections configured before merge take precedence
and may not be bypassed.

### Issue and follow-up handling

- Use `Closes #2` so the issue closes only when the PR merges.
- Before closing, create and link a focused follow-up for durable component
  names and classification overrides.
- Create a separate product-design follow-up for component extraction/subset
  export and its chemical/file-format boundary semantics.
- Reference existing issue #7 for selection-specific styling and visibility.
- Reference issue #11 for ligand-of-interest designation and ligand analysis.
- Publish a final issue reply after release verification covering delivered,
  already-satisfied, simplified, deferred, and rejected scope.

### Tag, release notes, and branch cleanup

- Proposed annotated tag: `v0.3.0`.
- Create the tag only from the verified merged commit on `master`.
- Push and remotely verify the tag before creating the GitHub release.
- Never reuse or move an existing release tag.

Release-note sections:

1. Highlights
2. Added
3. Component classification semantics
4. Selection, visibility, and accessibility
5. Verification
6. Compatibility and migrations
7. Known scientific limitations
8. Deferred and follow-up work

- Delete the remote feature branch only after PR merge, annotated tag, GitHub
  release, and issue reply are verified.
- Fast-forward local `master` to the verified remote merged commit before
  deleting the local branch.
- Do not rely on automatic branch deletion; it is disabled remotely.

## Merge and release blockers

Merge is blocked when any of the following is true:

- This plan is not the approved implementation contract or was not the first
  branch change.
- Classification silently promotes ambiguous material without provenance.
- Any atom is omitted without an unclassified fallback or belongs to multiple
  individual components.
- Component IDs change after reopen or coordinate-only edits.
- Mol* becomes authoritative for component classification or identity.
- Hierarchy selection bypasses canonical atom references, moves the camera, or
  mutates project state.
- Known category visibility accidentally discards Other/unclassified material.
- Detection changes coordinates, bonds, conformers, residue identifiers, chain
  names, original bytes, or chemistry.
- Old normalized artifacts or valid existing archives become unreadable.
- Styling, manual overrides, ligand-of-interest, or subset export is
  represented as implemented.
- PDB fallback, PDBx metadata, archive, topology-edit, accessibility,
  responsive, or real-WebGL evidence fails.
- A focused or complete validation command fails.
- Version sources disagree or documentation claims evidence that did not pass.
- `git diff --check` fails.
- Consequential full-diff review findings or newly configured required checks,
  reviews, or conversations remain unresolved.

Release is additionally blocked when:

- The PR is not verified merged into `origin/master`.
- The release commit is not the checked-out clean `master` commit.
- The final complete gate did not pass on the PR's final state.
- `v0.3.0` already exists or points to another commit.
- Any authoritative version differs from 0.3.0.
- The annotated tag cannot be pushed and dereferenced remotely to the merged
  commit.
- The GitHub release or final issue reply cannot be remotely verified.

## Progress and completion log

| Date | Status | Evidence / notes |
|---|---|---|
| 2026-08-06 | Plan proposed | Read-only inspection covered repository guidance, product/global plan/progress/decision/verification documentation, molecular and project schemas, APIs, migrations, jobs, frontend state ownership, viewer projection, selection, tests, related issues, current branches, tags, releases, PR conventions, CI/protection state, version sources, and release tooling. Current release history supersedes the issue-era no-history assumption. |
| 2026-08-06 | Plan approved | User approved the deterministic derived hierarchy, conservative source-aware classification, central component/category selection, mapped group visibility, deferred durable overrides/styling/subset export, and v0.3.0 release plan. |
| 2026-08-06 | Branch prepared | Fast-forward-only update confirmed clean local `master`, `origin/master`, and base commit `da54b10116175d6232882caa8359f7c47d1548f1`; created `feat/issue-2-structure-hierarchy`. |
| 2026-08-06 | Checkpoint 1 verified | Added optional residue-level source entity, subchain, polymer, and tabulated-residue facts; a Gemmi-independent deterministic `ComponentHierarchyV1` classifier; stable source-identity-based component IDs; complete disjoint atom membership; conservative legacy fallback; and the additive lazy `StructureRead.hierarchy` projection. Focused Ruff, strict mypy across 47 source files, 46 component/adapter/scientific/import-export tests, and `git diff --check` passed. Detection creates no database/archive migration and does not alter molecular coordinates, topology, source bytes, or chemistry. |
| 2026-08-06 | Checkpoint 2 verified | Added a lazy native-disclosure hierarchy beneath project entries, category/component selection through canonical atom references and existing modifier semantics, accessible provenance/warnings/pressed state, mapped durable visibility actions, hierarchy-owned aggregate ligand focus, and Mol* bundle projection from application memberships. Other heterogens and unclassified atoms remain visible when mapped groups are disabled, and instance lists render only after category expansion. ESLint, TypeScript, all 56 Vitest tests across 18 files, production build, and `git diff --check` passed. The build retained the expected lazy Mol* warning at 966.21 KiB gzip; the initial application chunk is 152.59 KiB gzip. |
| 2026-08-06 | Checkpoint 3 verified | Added a compact covalently linked protein/ligand/water/additive/ion/heterogen PDB fixture and integration/browser workflows for exact membership, central selection, camera neutrality, explicit focus, durable mapped visibility, named-selection reload, coordinate identity, topology regeneration, archive/reopen determinism, query reuse, keyboard/accessibility, Pixel 7 bounds, original-byte preservation, and real WebGL. Qualification found and fixed new standalone-ligand atoms losing their sole residue; unit/integration evidence now keeps those atoms in the same derived component. All 35 focused integration tests passed. The focused desktop/Pixel 7 Playwright matrix passed 8 applicable workflows with 8 intentional cross-layout skips in 1.1 minutes; `git diff --check` passed. |
| 2026-08-06 | Checkpoint 4 verified | Documented application ownership and identity, additive API and normalized source facts, non-persisted derivation, classification limits, focus semantics, accessibility, query reuse/lazy rendering, fixture provenance, compatibility, and the exact Checkpoints 1 through 3 evidence. Ruff, strict mypy across 47 source files, ESLint, TypeScript, and `git diff --check` passed. Documentation review found no claim for deferred renaming/reclassification, individual styling/visibility, ligand designation, or subset export, and no new architectural decision beyond accepted D-045. |
| 2026-08-06 | Checkpoint 5 verified | Confirmed `origin/master` remained at the approved base, `v0.3.0` did not collide with a tag or release, advanced all five authoritative application versions, retained archive producer compatibility through 0.2.1, and documented the bounded minor release. The complete gate passed frozen Python/JavaScript installs, Alembic `0007 (head)`, Ruff, strict mypy across 47 source files, 192 Python tests, ESLint, TypeScript, 56 Vitest tests, 7 supervisor tests, the production build, 37 applicable desktop/mobile Playwright workflows, 27 intentional cross-layout skips, and `git diff --check`; Playwright completed in 8.2 minutes. The build retained the expected lazy Mol* warning at 966.21 KiB gzip and 152.59 KiB initial app gzip. Full `origin/master...HEAD` review found no unresolved scope, scientific, persistence, schema, API, migration, archive, accessibility, performance, dead-code, or compatibility finding. |

## Completion

All five checkpoints are implemented and verified. The v0.3.0 release candidate
is qualified for its pull request; merge, remote release, issue response, and
branch cleanup remain delivery operations rather than feature implementation.
