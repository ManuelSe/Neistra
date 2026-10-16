# Issue #69 — Compact selection-driven molecular editing

## 1. Status, metadata, and approved outcome

**Status:** `/goal` authorized full implementation/delivery on 2026-10-16.
C0 through M4/C4 are complete; M5/C5 release preparation/delivery is next.

- **Issue:** [#69 — Add a compact, interactive molecular Edit panel to the
  viewer](https://github.com/ManuelSe/Neistra/issues/69), open with no comments at
  planning inspection.
- **Plan:** `docs/plans/issue-69-compact-molecular-editor.md`.
- **Approval:** user message “I approve the plan.” on 2026-10-16, following the
  complete proposal in this session. Approval includes the reduced fragment
  library, deferred Grow/fusion, prepared-component eligibility, initial
  hydrogen-preparation exception, and minor-release recommendation below.
- **Base:** `master` / `origin/master`,
  `f34d4aeb52076584108e33ce3cc908ed2945049e`.
- **Feature branch:** `feat/issue-69-compact-molecular-editor`.
- **Planned release:** 0.16.0, annotated tag `v0.16.0`, subject to collision
  recheck before release preparation and publication.
- **Audience:** scientists making common molecular modifications without typing
  atom IDs or coordinates.

Deliver selection-driven atom and bond editing, six fragment substitutions, and
existing residue mutation through a compact Edit panel next to Transform. Each
supported small-molecule edit includes automatic local hydrogen reconciliation in
one reversible command. Peptide growth, ring fusion, and general chemistry repair
are separate work.

This is the approved implementation contract, not a claim that these features
already work. The global [PLAN](../PLAN.md) remains unchanged.

## 2. Authority, inspection, and assumptions

Authority is: explicit user guidance and corrections; [AGENTS](../../AGENTS.md)
and accepted [decisions](../DECISIONS.md); existing architecture, product
boundaries, schemas and conventions; issue problems/outcomes/constraints; then
non-binding technical suggestions in the issue and its mockup.

Inspection covered AGENTS, PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS, VERIFICATION,
ARCHITECTURE, NORMALIZED_SCHEMA, PROJECT_SCHEMA, API, scientific limits,
development/performance guidance, editors and chemistry adapters, API services,
command/history publication and reconciliation, migrations, archives, generic
jobs/plugins, frontend state and mutation ownership, toolbar/panels, viewer
picking, domain/API/browser tests, issue mockup, related issues, branches, tags,
releases, version sources, PR conventions, CI and release tooling.

Relevant accepted decisions include D-002/003/007, D-018/020, D-028–034,
D-038/042, D-089, and D-091–097. New cross-project decisions are appended as
D-098–100; this plan does not replace the decision log.

Inspection findings:

- Ligand editing accepts only whole entries classified as ligand; automatic
  hydrogen addition is currently separate from ordinary graph edits.
- The existing RDKit conversion substitutes neutral charges and single bonds
  for missing values. The new editing path must reject uncertain chemistry
  before conversion rather than rely on those defaults.
- The protein service already mutates to all 20 standard amino acids under
  explicit PDBFixer/OpenMM template restrictions.
- Canonical selection owns atom references. Two endpoints can identify a bond
  without a new persisted bond-selection schema.
- Immutable artifacts, monotonic IDs, reversible molecular commands,
  affected-entry patches and reference reconciliation already exist.
- Current migration head is 0014; project/viewer/archive schemas are 2;
  normalized/selection schemas are 1.
- The prompt's absent-release-history premise is outdated. Remotely verified
  [v0.15.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.15.0) is the latest
  stable release, targeting `dccc5e6d2f3dc3d392144165ffd1f4237db4a2e5`.
  Subsequent master changes are release-closeout documentation/evidence.
- Recent PRs use normal merge commits preserving passing checkpoints. No
  `.github` directory, GitHub Actions workflows, active rulesets, protected
  master, or open PRs were found. Recheck all requirements at delivery; this is
  not authorization to bypass requirements introduced later.

At approval recheck, issue #69 remains open and unchanged, master is clean and
matches origin, and the plan path, feature branch and v0.16.0 tag are available.
Do not broaden scope or silently weaken a gate when implementation is difficult.
Material changes require an amended approved contract.

## 3. Requirement disposition matrix

| Significant requirement | Classification | Approved treatment and follow-up |
|---|---|---|
| Edit launcher beside Transform | Essential | Add adjacent launcher in the current viewer control area. |
| Compact nonmodal panel that stays open | Essential | Atoms, Bonds, Fragments and Residues sections. |
| Chemical symbols, icons and fragment illustrations | Supporting | Symbols and simple SVG structural diagrams with readable names and accessible labels. |
| Context-sensitive availability and feedback | Essential | Explain unavailable targets; retain full errors and scientific warnings. |
| Selection-first operation without manual IDs/coordinates | Essential | Canonical operands only; never fall back to the first entry or residue. |
| Existing atom/residue picking | Already satisfied | Preserve and qualify mappings and modifier behavior. |
| Reliable bond targeting | Supporting | Exactly two selected endpoints; qualify native bond hits mapping to them. No new persisted selection schema. |
| Hydrogen substitution for atom growth | Essential | One terminal H with a known single bond to a supported heavy atom. |
| Element change and formal-charge adjustment | Essential | Supported local valence states with automatic local H reconciliation. |
| Common element shortcuts | Supporting | C, N, O, S, F, Cl, Br, I; S initially limited to neutral divalent chemistry. |
| Phosphorus, arbitrary elements and full periodic table | Deferred | Element availability would imply unqualified valence/geometry support. Expand through chemistry follow-up. |
| Atom deletion | Essential | Selected heavy atoms in one eligible component; reconcile surviving boundary atoms. |
| H deletion under automatic saturation | Rejected as proposed | Would immediately regenerate H. Existing explicit hydrogen-removal tools remain; no separate follow-up needed. |
| Create/break bonds and single/double/triple changes | Essential | Known heavy-atom endpoints within one component; reject invalid topology or unsupported geometry. |
| Aromatic-bond handling | Essential | Preserve aromatic systems; reject direct aromatic order cycling and unsupported aromatic element/charge edits. |
| Complete proposed fragment catalogue | Deferred | Start with six qualified fragments; expand only with per-fragment chemistry and geometry evidence. |
| Methyl, ethyl, hydroxyl, amino, COOH and phenyl | Essential | Fixed attachment atoms, complete explicit H and deterministic initial geometry. |
| Ring fusion through a bond | Deferred | Separate attachment, ring geometry, aromaticity and stereo contracts; track separately. |
| All 20 standard amino-acid mutations | Already satisfied backend; supporting UI | Selection-driven access to the existing constrained template service. |
| N-/C-terminal peptide growth | Deferred | New polymer building needs terminal chemistry, numbering, stereo and geometry qualification. Dedicated follow-up. |
| Distinct Grow/Mutate actions | Supporting | Show Mutate; omit Grow until implemented. |
| Automatic explicit H after supported small-molecule edits | Essential | Actual normalized atoms/coordinates included in the single edit command. |
| Automatic H for every protein/destructive operation | Rejected as proposed | Polymer deletion/mutation cannot imply complete protonation or preparation. Preserve documented protein semantics and warnings; broader preparation remains #12. |
| No separate H-addition step | Essential during successive edits; limited initially | Hydrogen-free input may need one explicit Prepare component hydrogens action before selecting H. Opening Edit or showing H never changes chemistry. |
| Convenient explicit-H display | Supporting | Existing display controls; explain isolation and atom-hide constraints. |
| Optional constrained optimization | Optional; deferred | Bounded initial generation; retain existing explicit cleanup tools. |
| Preserve surrounding coordinates and stereo | Essential | Exact unaffected coordinates; validate supported mapped stereo and reject unsupported cases. |
| Visible scientific uncertainty and clashes | Essential | Structured warnings and inference provenance; sanitization is not preparation certification. |
| Editing inside complexes | Essential, bounded | Prepared closed small-molecule components with known chemistry; never sanitize a whole protein as ligand. |
| Raw PDB/mmCIF ligand chemistry repair | Deferred | Missing orders/charges block editing. Related #52 concerns assignment and does not already supply durable preparation. |
| Stable identity, persistence, atomic history, viewer updates | Already satisfied infrastructure; essential integration | Existing artifact commands and reconciliation. |
| Retain or sensibly update selection | Essential | Preserve surviving IDs; map substituted H to its replacement explicitly. |
| Separate editing/transformation and normal navigation | Essential | Panel actions execute edits; normal canvas selection/navigation continues. Movement blocks chemistry edits. |
| Mouse, keyboard, touch, themes and responsiveness | Essential | Native browser qualification and accessible controls. |
| Chemistry/workflow/accessibility tests | Essential | Independent scientific expectations plus domain, API, component and real-WebGL tests. |
| Product choices requiring decision | Unclear at proposal; resolved by approval | User approved the six-fragment limit, deferred Grow/fusion, prepared-component restriction and initial H-preparation exception. |

During later implementation delivery, create or link focused follow-ups for
**peptide growth** and **expanded fragment/ring-building chemistry**. Reuse
[#12](https://github.com/ManuelSe/Neistra/issues/12),
[#20](https://github.com/ManuelSe/Neistra/issues/20),
[#21](https://github.com/ManuelSe/Neistra/issues/21) and
[#52](https://github.com/ManuelSe/Neistra/issues/52) for their existing concerns;
do not create duplicates. No follow-up is created during C0.

## 4. Accepted scope, ownership, and scientific contract

### Atomic selection-driven service

Add a typed selection-driven molecular-edit endpoint under `/api/v1`. Capture
project revision, current artifact identity, canonical selection, operation and
bounded parameters. Existing ligand/protein endpoints retain their behavior.

Resolve targets from authoritative normalized data, prepare and validate the
complete result, then publish one artifact and one history command. Mutation
delegates to the existing protein editor. Chemistry adapters stay outside UI and
viewer state. Record the actual operand selection in command history.

Small-molecule editing initially requires:

- One unlocked entry and one complete, unambiguous, closed component.
- One conformer, finite usable coordinates, supported chemistry, known bond
  orders and formal charges.
- No covalent boundary to protein, unresolved alternate sites, unsupported metal
  coordination, radicals, or unsupported stereo encoding.
- At most 256 heavy atoms and 1,024 resulting component atoms. These are admission
  bounds, not performance promises.

Project a complex component temporarily into the chemistry adapter and merge back
by stable IDs. Preserve protein, waters, other components, hierarchy, source facts
and untouched metadata. The prepared-complex fixture must enter through the
normal portable archive path, not a test-only route. Ordinary raw PDB complexes
remain visibly ineligible when their chemistry is incomplete. Do not invent an
unapproved preparation/import workflow to disguise this limitation.

### Hydrogen, geometry, identity, and warnings

Local H reconciliation affects edited atoms and immediate affected neighbors.
Preserve unaffected H, allocate IDs monotonically, and never silently choose pH,
tautomers or aromatic protonation. H substitution consumes the H identity and
allocates a new heavy-atom identity. Generated atoms are actual molecular state.

RDKit supports adding H coordinates on selected atoms; that is a primitive, not
sufficient validation. Use pinned RDKit 2026.3.4 and repository source as authority;
do not upgrade dependencies incidentally. The
[official API documentation](https://www.rdkit.org/docs/source/rdkit.Chem.rdmolops.html)
describes `AddHs`, `addCoords` and `onlyOnAtoms` but may describe a newer release.

Use fixed fragment attachment definitions and deterministic bounded coordinate
generation. Unchanged heavy atoms remain fixed. New geometry must pass declared
bond-length/angle and overlap checks. Element/order changes that affect retained
heavy-atom geometry receive explicit unoptimized-geometry warnings where
appropriate. No whole-molecule re-embedding, implicit force-field fallback or
invented ring-fusion algorithm is included.

Validate supported mapped stereo; a changed CIP label alone must not be mistaken
for proof of geometric inversion. Unsupported cases reject rather than silently
losing stereo. Invalid geometry, failed preparation, stale revision or unsupported
chemistry publishes no molecular change. Record generated atoms/bonds/coordinates,
method/version and seeds through existing inference/metadata facilities. Invalidate
stale derived chemistry metadata; retained source labels must not imply the
modified molecule is chemically unchanged.

### UI and asynchronous ownership

Keep panel state transient and survive responsive remounts within the project.
Captured project/artifact/selection ownership prevents late results from changing
another project or overwriting a later selection. Preserve surviving selection;
explicitly map a substituted H to its replacement. Do not auto-select every new H.
Opening/browsing the panel creates no chemistry command.

The panel uses symbols/icons, accessible labels and full warning details. Existing
hydrogen display controls remain presentation commands; they do not create atoms.
Explain atom-hide/isolation constraints. Existing advanced inspector capabilities
remain accessible. Panel actions do not introduce a canvas drawing mode or steal
camera gestures. Active movement blocks chemistry edits and requires explicit
completion/cancellation rather than implicit application.

### Non-goals

No peptide growth, ring fusion, complete fragment library, periodic-table-wide
editing, arbitrary component extraction/reclassification, raw chemistry repair,
protonation/tautomer search, rotamer search, full protein preparation, global
optimization, docking, new plugin type, or new molecular-selection authority.
Existing scientific product requirements are preserved; these exclusions concern
new issue scope and do not remove advanced functionality.

## 5. Milestones and checkpoints

Every checkpoint leaves a coherent, independently usable state, receives local
review, updates documentation/progress/evidence and is committed only after its
checks pass. Do not create empty milestone commits. New test filenames below are
planned deliverables, not existing evidence.

Every implementation milestone also runs Ruff, mypy, frontend lint/typecheck,
all frontend tests, production build and relevant browser workflows before its
passing checkpoint commit. Fix failures before proceeding.

### C0 — Approved planning handoff

- **Outcome/areas:** persistent approved plan, concise PROGRESS summary and
  appended D-098–100. No runtime implementation.
- **Acceptance:** complete approved scope and limitations recorded; global PLAN,
  application versions, dependencies, schemas and runtime unchanged.
- **Validation:** local Markdown links, `git diff --check`, staged-diff review,
  clean-tree and remote branch/commit verification.
- **Commit:** `docs(plan): add approved plan for issue 69`.
- **Migration/rollback:** documentation only; no migration or release artifact.
- **Stop:** ready for `/goal`; do not begin C1.

### M1 / C1 — Atomic selection-driven atom editing

- **Outcome:** working Edit launcher/Atoms section: element/charge changes,
  heavy-atom deletion, H preparation and H substitution, for standalone and
  eligible complex components. Unimplemented sections do not expose working
  placeholder actions.
- **Areas:** core component projection/merge and chemistry, typed API/service,
  command publication, application mutation ownership and compact panel.
- **Acceptance:** no manual operands; complete edit/H transaction; exact
  unaffected coordinates; monotonic IDs; clear atomic refusal; one Undo restores
  the prior artifact; prepared-complex fixture uses normal archive import.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/unit/editing tests/scientific/test_selection_editing.py tests/integration/test_selection_edits.py
  corepack pnpm --dir apps/web test -- edit
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/molecular-editing.spec.ts
  ```

- **Documentation:** API, architecture, scientific limits, fixture provenance,
  progress and checkpoint evidence.
- **Commit:** `feat(editing): add atomic selection-driven atom edits`.
- **Compatibility/rollback:** additive API; old endpoints/stored action formats
  retained. No migration. Actual old-reader proof remains C4/C5.

### M2 / C2 — Bonds and six fragment substitutions

- **Outcome:** working Bonds/Fragments sections using canonical endpoints and
  qualified attachment templates.
- **Areas:** bond-target resolution, geometry and catalogue, chemistry reports,
  structural SVG diagrams and viewer pick mapping.
- **Acceptance:** all six fragments produce independently expected graphs and
  explicit H; known single/double/triple edits work; unsupported aromatic edits,
  boundary targets, invalid geometry and ambiguous stereo fail atomically.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/scientific/test_selection_editing.py tests/scientific/test_edit_fragments.py tests/integration/test_selection_edits.py
  corepack pnpm --dir apps/web test -- edit
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/molecular-editing.spec.ts tests/e2e/viewer-click-selection.spec.ts
  ```

- **Documentation:** attachment definitions, geometry thresholds, provenance,
  supported/refused cases and checkpoint log.
- **Commit:** `feat(editing): add bond and fragment operations`.
- **Compatibility/rollback:** existing generic history actions; no persisted
  bond-selection schema or migration. Preserve rollback qualification gate.

### M3 / C3 — Residue workflow and complete panel interaction

- **Outcome:** select one amino-acid residue and mutate through the compact
  panel; complete keyboard/touch/focus/display-H/warning/tool-handoff behavior.
- **Areas:** residue resolver, existing protein service, panel lifecycle,
  toolbar and responsive styling.
- **Acceptance:** 20 targets retain existing template restrictions/backbone
  guarantees; partial/mixed targets are explained; no fallback residue; movement
  and camera remain correct; Grow is absent. Automatic small-molecule H policy
  does not silently change existing protein mutation semantics.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/unit/editing/test_protein_editor.py tests/scientific/test_protein_templates.py tests/integration/test_protein_edits.py
  corepack pnpm --dir apps/web test
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/molecular-editing.spec.ts tests/e2e/protein-editing.spec.ts tests/e2e/viewer-transform-toolbar.spec.ts
  ```

- **Documentation:** editing guide, accessibility behavior, mutation/H limits,
  progress and checkpoint evidence.
- **Commit:** `feat(editing): integrate residue mutation and compact controls`.
- **Compatibility/rollback:** existing protein chemistry semantics retained;
  transient UI state only; no migration.

### M4 / C4 — Scientific, lifecycle, accessibility and compatibility qualification

- **Outcome:** evidence for the complete workflow and repaired consequential
  findings.
- **Areas:** independent scientific fixtures, domain/API/frontend/native tests,
  actual old-reader harness, performance/accessibility evidence and docs.
- **Acceptance:**
  - Independent expected graphs, H counts, declared geometry tolerances and
    supported stereo outcomes; unsupported cases fail before publication.
  - Exact artifact Undo/Redo; allocator non-reuse after branching.
  - Saved selections, measurements, scenes, appearance masks and surface
    sources reconciled atomically, with exact inverse state.
  - Save/reopen, export/archive reimport, original-byte preservation and
    completed-job stability.
  - Real atom/bond/residue picks, camera invariance, project switches, stale
    requests, lock states and failures.
  - Desktop and Pixel 7 emulation, light/dark, 320px width, actual 100%/200%
    browser zoom, keyboard/focus and axe. Do not claim broader certification.
  - No per-control molecular refetch; only the affected entry reloads after
    topology change.
  - Representative prepared-component editing inside a protein complex;
    bounded chemistry/contact work and existing performance budgets retained.
- **Focused validation:** repeat C1–C3 suites, then:

  ```bash
  .venv/bin/uv run pytest tests/integration/test_archive_roundtrip.py tests/integration/test_selection_edits.py
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/molecular-editing.spec.ts tests/e2e/surface-objects.spec.ts tests/e2e/project-navigation.spec.ts tests/e2e/interactions-lifecycle.spec.ts tests/e2e/release-hardening.spec.ts tests/e2e/rebranding-zoom.spec.ts
  ```

  Add `tests.support.editing_reader_qualification`, extending the existing
  qualification patterns, and run it against an actual detached v0.15.0 reader.
  Document exact produce/read commands and assert actual imported reader paths;
  a changed version string is not old-reader evidence.
- **Documentation:** VERIFICATION, PERFORMANCE, ACCESSIBILITY, schema
  clarification, fixture provenance and retained evidence under
  `docs/assets/molecular-editing/`. Correct NORMALIZED_SCHEMA's stale
  “contiguous IDs” statement to match D-028.
- **Commit:** `test(editing): qualify chemistry and workspace workflows`.
- **Compatibility/rollback:** prove old-reader handling of edited normalized
  artifacts, existing generic history actions, scenes/surfaces/jobs and archives.
  An unexpected compatibility break requires a revised approved plan.

### M5 / C5 — Release preparation and delivery

- **Outcome:** consistent versions, full candidate gate, reviewed PR, verified
  merged commit and publication.
- **Areas:** five authoritative version sources, release notes, full gates,
  complete diff review, PR/release/issue workflow and final documentation.
- **Acceptance:** all checkpoints pass; consequential findings fixed; actual
  prior-reader qualification passes against final producer data on both candidate
  and exact merged master; required checks/reviews/conversations satisfied.
- **Validation:** complete release gate below and actual v0.15.0 reader; verify
  remote merge SHA, annotated tag target, release, assets and final issue reply.
- **Commit:** `chore(release): prepare v0.16.0`, followed only by substantive
  evidence/repair commits.
- **Documentation:** release notes, final plan/progress log, PR scope accounting,
  verification records and final issue response.
- **Compatibility/rollback:** no planned migration; failed compatibility requires
  revising the contract rather than silently changing it or stripping data.

## 6. Acceptance evidence and release gate

For each checkpoint record source commit, commands, exit results, environment,
fixtures, screenshots, limitations, review findings and next action. Separate
failed/interrupted diagnostics from passing evidence. Existing repository test
counts are historical, not evidence for this feature. No application tests were
run during read-only planning or C0 documentation preparation.

Run on both the clean candidate and exact merged master, using dedicated
disposable data and isolated ports where needed. Replace the data-directory
placeholder with an actual dedicated path and record it:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<disposable-data-dir> .venv/bin/uv run alembic upgrade head
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

Maintain existing scientific/performance budgets. No unbounded whole-complex
sanitization or pairwise distance allocation may be introduced for local edits.
Report actual native timings/request counts on the pinned environment rather
than claiming admission bounds are speed guarantees.

## 7. Data, migration, API, UI and architectural implications

- **Data:** immutable originals; existing NormalizedStructureV1 artifacts and
  monotonic entry allocators; inferred changes and stale derived chemistry remain
  visible. Stable residue/chain identity survives component edits.
- **Migration:** none planned; head 0014 and project/viewer/archive2,
  normalized/selection1 remain. No new durable bond-selection or panel state.
- **API:** additive typed selection-driven route/reports under `/api/v1`;
  existing low-level ligand/protein endpoint semantics retained. Document actual
  transport and errors alongside frontend types and tests.
- **History/persistence:** one before/after molecular command including automatic
  H, existing generic action shapes, full operand selection and reference pruning.
- **UI/accessibility:** compact nonmodal panel; meaningful symbols/diagrams plus
  names; explained availability; owned focus/tool handoff; full keyboard/touch
  access and warning text. Existing advanced tools remain.
- **Science:** known prepared chemistry only; local H is valence inference, not
  pH/protonation determination; bounded generated geometry is not an optimized
  binding pose; protein mutation retains its template limitations.
- **Performance:** bounded component processing, artifact-keyed cache reuse,
  affected-entry replacement and existing responsiveness budgets. Do not rebuild
  or retransmit unrelated entries for minor interactions.
- **Jobs/plugins:** unchanged. Editing remains usable without the job worker;
  no docking concepts or new persistent plugin job type.
- **Decisions/deviations:** D-098–100 record ownership and chemistry policy;
  Section 3 records approved deviations from the issue. Broader requirements
  cannot return implicitly during implementation.

## 8. Version, release, rollback and delivery plan

**SemVer: 0.15.0 → 0.16.0, minor.** New building workflows and an additive API
operation family exceed a patch correction. Existing API behavior, generic
persisted actions and archive readers are intended to remain compatible, so no
major increment is justified. This follows the established pre-1.0 stable release
history. Incomplete science/verification blocks release rather than becoming an
implicit prerelease. Recheck actual behavior and compatibility before publication.

Update all five authoritative application versions together:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update relevant assertions/provenance tests without unrelated dependency upgrades.
No version changes occur in C0.

Rollback requires coordinated application restart/reload and a full-data backup.
Claim compatibility with v0.15.0 only after the actual reader accepts edited
artifacts, retained Undo/Redo, archives, scenes, surfaces and jobs. Existing 0014
downgrade restrictions remain; do not delete history or strip data to bypass them.

- **PR title:** `feat(editing): add compact selection-driven molecular editing`.
- **Merge:** normal merge commit preserving passing checkpoint history.
- **PR content:** approved contract; implemented/simplified/deferred/rejected
  requirements; scientific and compatibility limits; evidence; review findings.
- **Issue:** create/link approved follow-ups during implementation delivery;
  `Closes #69` only after accepted scope is complete and every remaining original
  request is accounted for. Do not mark all original checkboxes delivered.
- **Review:** review complete diff and address consequential findings; observe
  actual required reviews/checks/conversations. Local self-review is not an
  independent review. Do not claim an unreturned integration review occurred.
- **Release notes:** Added editing workflows; Chemistry and hydrogen policy;
  Compatibility and rollback; Accessibility and performance; Verification;
  Deferred features and known limitations.
- **Publication:** after merge, verify exact master and repeat full gates and
  actual-reader qualification before annotated `v0.16.0` and stable GitHub release.
  Verify peeled tag target, release state/notes and evidence assets remotely.
- **Closeout:** publish scoped final issue reply; complete documentation closeout;
  delete local/remote feature branch and verify clean master and remote cleanup.

**Merge/release blockers:** failed/incomplete gates; unqualified chemistry;
identity/coordinate drift; partial commands; missing warnings; stale-target
execution; selection/camera regressions; inaccessible controls; failed preceding
reader; unexpected schema changes; inconsistent versions; release collision;
unresolved consequential findings/conversations; unmet protection/review/check
requirements; unverified merged/tag target. Do not bypass branch protection or
silently reduce requirements.

## 9. C0 execution and progress/completion log

After explicit approval, C0 only:

1. Recheck issue, clean tree, remote master and branch/plan/tag collisions.
2. Fetch origin and fast-forward master with `git merge --ff-only origin/master`;
   stop on divergence/unrelated changes without discarding them.
3. Confirm clean tree; create the planned feature branch.
4. Persist this approved plan as the first branch change. Add concise PROGRESS
   status and append accepted decisions; leave global PLAN untouched.
5. Validate documentation/diff; commit with
   `docs(plan): add approved plan for issue 69`.
6. Push if remote access is available; verify remote branch/commit and clean
   local tree. Report exact path/branch/commit, milestones and release impact.
7. Stop ready for `/goal`. No runtime implementation, PR, issue comment,
   follow-up issue, application test gate, version change, tag or release in C0.

### 2026-10-16 — Approval and C0 documentation preparation

- User explicitly approved the complete proposal and its scope deviations.
- Fetched origin; local master fast-forward-only operation succeeded and remained
  `f34d4aeb52076584108e33ce3cc908ed2945049e`. Working tree was clean before
  feature branch creation. Remote issue #69 remained open and unchanged;
  branch/plan/v0.16.0 collision checks passed.
- Created `feat/issue-69-compact-molecular-editor`; this plan is its first file
  change. PROGRESS and D-098–100 accompany the documentation checkpoint.
- M1/C1 through M5/C5 are approved and not started. Application versions remain
  0.15.0, migration head remains 0014, schema versions remain unchanged.
- Known limits and follow-ups are approved scope boundaries, not completed
  functionality. No implementation blocker is established; scientific feasibility
  and compatibility still require their implementation gates.
- C0 documentation validation passed: `git diff --cached --check`, all six added
  local Markdown links resolve, exactly three documentation files are staged,
  required plan sections/checkpoints and unique D-098–100 headings are present,
  and staged/worktree contents match. Local review confirms the approved scope;
  it is not independent review. No application tests were run or required for
  this documentation-only checkpoint.
- Commit/push/remote verification is the remaining publication step. The final
  handoff reports its actual result and exact planning commit without embedding
  a self-referential commit hash here. No implementation work follows C0.

### Checkpoint ledger

| Checkpoint | State | Evidence / next action |
|---|---|---|
| C0 | Complete | Planning commit238e5dd remotely verified; `/goal` now authorizes delivery. |
| M1/C1 | Complete; passing checkpoint | Atomic atom/H edit vertical slice; evidence below. |
| M2/C2 | Complete; passing checkpoint | Endpoint bond operations and six qualified fragments; evidence below. |
| M3/C3 | Complete; passing checkpoint | Standard-residue workflow, result selection, focus/position/accessibility; evidence below. |
| M4/C4 | Complete; passing |612Python/235frontend/62browser with10intentional skips; actual tagged reader, science/lifecycle/real zoom and existing budgets. |
| M5/C5 | Approved; not started | Full gates, reviewed PR and verified release delivery. |

### 2026-10-16 — M1/C1 complete: atomic atom/H editing

- Added the additive typed selection-edit route, strict prepared-component
  projection/merge, local H reconciliation, H replacement identities, element/
  charge/heavy deletion, immutable publication and full operand history snapshots.
  Existing low-level API semantics and generic stored molecular actions remain.
- Edit sits beside Transform; canonical selection supplies operands, the panel
  stays open, and explicit H preparation/display are distinct. Transient panel
  ownership survives remounts and resets with project; captured mutation feedback
  and selection replacement cannot retarget another project or later selection.
- Prepared synthetic complex is imported through the public archive path.
  Tests preserve unrelated records and original bytes, restore exact artifacts
  through Undo/Redo and reject invalid/uncertain/no-op edits before publication.
  Supported supplied stereo is re-perceived from fixed geometry in final bond
  order; generated distance/angle/overlap bounds are explicit, not pose validation.
- [C1 evidence](../assets/molecular-editing/c1-verification.json) retains exact
  commands, final source hashes, exits, timings and log/screenshot checksums:
  **23 focused Python, all230 frontend and2 desktop/mobile browser tests pass**;
  Ruff, mypy63, ESLint, TypeScript, production build and diff check pass.
  Legacy ligand/protein integration regression separately passed16 tests.
- Failed diagnostics are separate: a formula expectation was corrected to
  C2H6O; the unchanged legacy collinear ethanol correctly rejects degenerate
  generated H instead of being silently re-embedded. Positive fixture uses
  documented ETKDGv3 seed690. Initial exact-label and tooltip-consumed mobile
  Escape test helpers were corrected to accessible roles/explicit drawer close;
  final complete dedicated browser run passes both layouts in18.7s.
- Local checkpoint review guarded arbitrary-order/aromaticity conversion defaults,
  duplicate endpoints and new-ID bounds. It is self-review, not independent.
  No API removal, dependency/version/schema change or migration. Existing lazy
  Mol* bundle/color-environment advisories remain.
- C1 does not claim compact bond, fragment or residue operations, full preparation,
  raw PDB chemistry assignment, prior-reader compatibility or release completion.
  No blocker. Next: commit passing C1, then implement M2/C2.

### 2026-10-16 — M2/C2 complete: bonds and six fragments

- C1 committed and remotely verified at e26419f. Added single/double/triple bond
  controls using two canonical endpoints and single-H substitutions for methyl,
  ethyl, hydroxyl, amino, carboxylic acid and phenyl. There is no bond-ID input,
  new persisted bond selection, Add/Attach mode, ring fusion or broader catalogue.
- Cap-only ETKDGv3 templates use seed690, bounded embedding, a proper alignment
  and six fixed torsions. All parent heavy atoms remain fixed; complete explicit
  fragment H and local endpoint H changes publish in the same molecular command.
  Fixed attachment/cap SMILES and geometry criteria are documented. Source
  metadata/history/original preservation and monotonic allocators remain intact.
- Aromatic changes, missing/invalid endpoints, distant creation, impossible
  geometry and order changes requiring E/Z decisions reject atomically. Positive
  creation, break/order changes and all six graphs/formulas are independently
  asserted; fragment H are actual atoms with zero implicit H in the prepared case.
- [C2 evidence](../assets/molecular-editing/c2-verification.json):38Python,
  all232frontend and8browser workflows/2intentional layout skips pass; Ruff,
  mypy64, lint/types/build/diff pass. Both layouts use a real native bond-loci hit,
  assert exact canonical endpoints and unchanged camera, then change bond order.
  Both layouts perform illustrated COOH substitution and preserve unchanged atoms.
- Exact source/log/screenshot hashes and commands are retained. Preliminary
  diagnostics remain separate: temporary untagged generated H are omitted from
  the post-reconciliation ID lookup; catalogue constants moved out of a component
  for Fast Refresh; Testing Library role options corrected. Final gates use the
  corrected source. Local self-review removed unrelated formatter changes and
  corrected the ethyl drawing to two carbons; no independent review is claimed.
- Compact residue mutation and final focus/layout/lifecycle/accessibility work
  remain C3; actual preceding-reader/performance/release qualification remain
  C4/C5. The notification can overlap the open panel header; launcher/Escape
  closing remains available, and C3 will qualify positioning/tool handoff.
  No migration/version/dependency/API removal or scope expansion. Next: commit
  passing C2, then implement M3/C3.

### 2026-10-16 — M3/C3 complete: residue workflow and panel interaction

- C2 committed and remotely verified at95ba696. The selection-driven residue
  action requires one exact complete amino acid, delegates to the existing
  PDBFixer/OpenMM service and publishes once through generic molecular history.
  No Grow, protein saturation, rotamer search or broader template eligibility.
- Added transient `selection_after` to the new edit response. It selects the
  entire mutated residue (including new side-chain IDs) or preserves/maps
  surviving small-molecule operands. The client applies it only under captured
  project/revision/selection ownership; it adds no project/archive schema field.
  All20 target amino acids pass API backbone/unrelated-atom/Undo assertions.
- Completed four sections, current-element/type no-op availability, named
  warning/limits disclosures, coarse44px controls, project-scoped visibility,
  stable pending focus and responsive owned-focus restoration. Viewport portal
  placement observes notices/resize; Close/header remain hit-testable. Style/
  Surface/Interaction/movement handoffs preserve new focus ownership; numeric
  preview blocks chemistry. Eligibility is memoized against projection/selection.
- [C3 final evidence](../assets/molecular-editing/c3-verification.json):72Python,
  all234frontend and31native browser workflows/3intentional layout skips pass;
  Ruff, mypy64, ESLint, TypeScript, build and diff pass. The final browser set
  takes4.4m and includes existing protein/transform regressions. Dedicated native
  residue picks support successive VAL/LEU mutations without reselection and
  exact Undo. Both themes,320px, notice clearance, keyboard and scoped axe pass.
- Exact source/log/screenshot hashes retained; screenshots manually inspected
  separately from automation. Preliminary diagnostics remain separate: an old
  theme-button selector run was intentionally interrupted(exit130), a duplicate
  test-shim method addition was reverted, and an earlier dedicated10-pass run is
  not substituted for final source/broad gates. No independent review is claimed.
- Local review confirms preserved low-level endpoints, actual operand history,
  response-owned selection, surface-pruning notice propagation and no new
  persistent fields/migration/dependency/version. Current versions0.15.0;
  planned0.16.0minor. C4 still owes actual reader, archive/reconciliation/lifecycle,
  real200% zoom and representative performance/scientific qualification. C5
  still owes complete release gates, review/PR/merge and publication.
- No blocker. Next: commit passing C3, then implement/qualify M4/C4.


### Follow-up tracking — 2026-10-16

After checking open/all-state issue searches for duplicates, created and remotely
verified [#70 — terminal peptide growth](https://github.com/ManuelSe/Neistra/issues/70)
and [#71 — expanded fragment/element/ring-building qualification](https://github.com/ManuelSe/Neistra/issues/71).
These are future problem briefs requiring their own approved bounded plans, not
new implementation scope. They explain the scientific reasons for deferral and
reuse #12/#20/#21/#52 for preparation, naming/classification and subset export.
Optional new constrained optimization remains a separate product/scientific decision;
existing explicit cleanup remains available. No original issue checkbox is marked
delivered merely because a follow-up exists.


### M4/C4 complete — 2026-10-16

- [Final C4 evidence](../assets/molecular-editing/c4-verification.json) binds final
  runtime/test source hashes to612Python,235frontend and62broad native browser
  passes/10intentional layout or desktop-timing skips in11.0minutes. No failure or
  retry. Ruff, mypy64, ESLint, TypeScript, production build and diff checks pass.
  Existing Alembic deprecation and large-bundle notices remain nonfatal and logged.
- Scientific qualification covers independent six-fragment graphs/formulae,
  explicit local H, geometry/identity, supplied/new tetrahedral stereo and source
  refusal, opposite enantiotopic H and CIP-priority changes without inversion.
  Final saved bond order owns stereo tags. Explicit side-chain crosslinks and
  nonfinite surrounding clash coordinates refuse before publication.
- API workflows prove exact artifact Undo/Redo, non-reuse after branching,
  revision/artifact/lock refusal, originals and saved selections/measurements/
  scenes/appearance/hide/H masks/fragment and pocket sources. Audit modification
  timestamps advance; scientific/reference content and artifact bytes restore.
  Save/reopen/export/archive reimport and snapshot history omission are qualified.
- New `tests.support.editing_reader_qualification` produces five new selection edit
  commands alongside existing scenes/three surface kinds/measurements/selections/
  styling/completed jobs, then runs the actual detachedv0.15.0 API/core at
  `dccc5e6d2f3dc3d392144165ffd1f4237db4a2e5`. Module paths and clean checkout are
  verified. It opens/saves/reexports/imports and undoes/redoes new generic history,
  retaining originals, exact molecular records, jobs/scenes/surfaces and remapped
  archive seeds. Exact produce/read/migration commands and zero exits are retained
  in C4 evidence. Current producer still identifies0.15.0; C5 must repeat against
  final0.16.0 candidate and exact merged master before release.
- Native atom/bond/residue/H/new-atom picks, exact surrounding coordinates/camera,
  project switches, late replies, newer selection, failed affected-artifact read/
  explicit retry, responsive section/focus, both themes/320px/scoped axe and actual
  Chrome100%/200% zoom pass. Fixed a real remount camera reset by seeding transient
  active-project camera before the disposable viewer's first scene commit.
- Prepared complex uses the normal portable archive/API path and an ordinary
  atomic representation (cartoon alone has no H detail). Section browsing and
  remount add zero structure reads; topology change loads one affected entry.
  Synthetic25,000-atom context enters RDKit only as3-/9-atom component projections;
  this is algorithmic scope evidence, not a physical/throughput claim.
- Existing pinned movement budgets pass: first preview102.8/36.2ms, exact coordinate
  Cancel9.8/14.4ms, longest tasks87/0ms for protein-fragment/bound-ligand cases.
  Surface Cancel9.5ms/regeneration1034.6ms; no molecular requests during gestures.
  Representative-project and existing native surface/toolbar/navigation budgets pass.
- [Local self-review](../assets/molecular-editing/c4-local-review.md) records repaired
  findings and separate harness diagnostics; no independent review is claimed.
  Source checksums remain exact. Manually inspected retained dark200% desktop and
  narrow mobile screenshots; no screen-reader/physical-device/cross-browser claim.
- NORMALIZED_SCHEMA's stale contiguous-ID wording now matches accepted D-028.
  D-098–100 qualification notes are append-only; global PLAN remains unchanged.
  No migration/schema/legacy API change. Follow-ups#70/#71 are verified above.
- No blocker or remaining C4 implementation. Next: commit passing C4, fetch/recheck
  base/version/protections, prepare0.16.0, then complete candidate/exact-master
  gates, review/PR/merge and verified publication/closeout under M5/C5.
