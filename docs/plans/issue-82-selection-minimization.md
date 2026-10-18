# Issue #82 — Selection-based molecular minimization

## 1. Status, outcome and authority

Status: approved implementation contract; C0–M5/C5 complete; C6 release candidate next.
The user's 2026-10-18 `/goal` starts C1–C6 and release
delivery; C0's original planning-only stop has been satisfied.

Approval: user's “Implement the plan.”, 2026-10-18, following the complete proposed
plan and the confirmed product choices below.

| Item | Approved value |
|---|---|
| Issue | [#82 — Selection-based minimization with fixed context](https://github.com/ManuelSe/Neistra/issues/82) |
| Issue metadata | Open; updated 2026-10-17T15:51:45Z; no comments when rechecked for C0 |
| Persistent plan | `docs/plans/issue-82-selection-minimization.md` |
| Base | `master`, fast-forward checked against `origin/master` at `b1fad2c77517cbdc24a87877507539d5abe584fa` |
| Feature branch | `feat/issue-82-selection-minimization` |
| Implementation PR | `feat(modeling): add selection-based molecular minimization` |
| Proposed release | Stable minor **0.20.0**, annotated tag **v0.20.0** |
| Current delivery | User started `/goal` on 2026-10-18; complete checkpoints and release subject to the scientific/review gates |

Deliver an explicit workflow that minimizes captured selected atoms while all
unselected atoms remain fixed. Support isolated molecules, molecular subsets,
ligands in fixed protein environments, and combined ligand/residue selections
across entries.

Confirmed product decisions:

- Include qualified protein-pocket energetics.
- Generate supported parameters inside the workflow rather than requiring
  externally prepared parameter files.
- Optimize explicitly captured active conformers only.
- Defer covalent protein–ligand adducts; retain ordinary intramolecular and peptide
  boundary terms.

Authority follows the requested order: explicit user guidance and corrections;
repository instructions and accepted decisions; current architecture and product
boundaries; issue outcomes, constraints and non-goals; nonbinding issue
implementation suggestions.

Accepted decisions D-108–110 in [DECISIONS](../DECISIONS.md) cover the bounded
extension to D-003/D-031, active-conformer semantics, calculation context, native
tooling and atomic proposal application. This feature plan is the implementation
contract; it does not replace the decision log or global [PLAN](../PLAN.md).

### Inspection findings

- Read AGENTS.md, PRODUCT_SPEC, global PLAN, PROGRESS, relevant accepted DECISIONS,
  VERIFICATION and architecture/schema/API/model/editing/development/fixture/
  accessibility/performance documentation. Inspected molecular adapters and
  editing services, migrations, job contracts/registry/worker/publication,
  coordinate/molecular history, archives, frontend ownership/types/panels and
  scientific/API/native tests. Reviewed related issues #11/#12/#52/#71/#74/#77/
  #81/#83, PR conventions, version sources, release tooling and remote Git state.
- Canonical selection, immutable artifacts, generic jobs, command history and
  disposable viewer projections already exist.
- Legacy cleanup fixes unselected atoms within one entry, but lacks the proposed
  environment and application lifecycle. Its force-field helper defaults exclude
  disconnected-fragment nonbonded interactions; concatenation alone is inadequate.
- Ordinary protein imports retain sparse connectivity. Displayed Mol* bonds cannot
  establish calculation topology. Existing preparation is a separate explicit action.
- Project/viewer/archive schemas are version 2; normalized structures and selections
  remain version 1; Alembic head is `0014`.
- Contrary to the prompt's historical premise, remotely verified tags and releases
  extend through [v0.19.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.19.0).
  Its annotated tag targets `3fc106b215a8c39e943ad399710f43f116961aef`;
  current master additionally records release-evidence documentation.
- No repository GitHub Actions workflows, master protection or rulesets were found.
  All three merge methods are enabled; existing delivery uses documented local
  gates and normal merge commits. Recheck actual requirements before merge.
- Implementation tests were not run during this read-only investigation. Existing
  verification records establish the historical baseline, not evidence for #82.
- The installed environment has RDKit 2026.03.4, OpenMM 8.4, PDBFixer and
  Reference/CPU OpenMM platforms; no OpenFF or openmmforcefields installation was
  found. The proposed AmberTools package was verified in package metadata, not
  installed or scientifically qualified during planning.

## 2. Requirement disposition and approved boundaries

| Significant requirement | Disposition | Treatment and follow-up |
|---|---|---|
| Whole isolated molecule minimization | Essential | Complete supported molecule, starting from captured coordinates. |
| Partial molecule; every unselected atom and H fixed | Essential | Only selected coordinates become optimizer variables. |
| Ligand influenced energetically by fixed pocket | Essential | Supported bonded/nonbonded physics, not merely clash reporting. |
| Ligand plus selected protein atoms/residues | Essential | One calculation and one atomic Apply across existing entries. |
| Same-entry and separate-entry assemblies | Essential | Temporary assembly mapped to canonical references; no persisted entry merging. |
| Peptide and ordinary intramolecular movable/fixed boundaries | Essential | Complete topology, crossing terms, exclusions and 1–4 scaling. |
| Covalent protein–ligand adducts | Deferred | User-approved deferral: automatic compatible adduct parameterization needs separate qualification. Create one focused follow-up. |
| New cross-entry covalent topology | Deferred | Canonical bonds are entry-local. Include representation and parameter requirements in the covalent follow-up; never infer links from proximity. |
| Explicit isolated/environment choice | Essential | Default isolated mode; context requires explicit selection and confirmation. |
| Inspectable context inclusion/exclusion | Essential | Choose complete molecular components/chains, including hidden candidates. Mandatory covalent closure cannot be excluded. |
| Visibility-driven physical context | Rejected as proposed behavior | Display state cannot select physical inputs. No follow-up needed. |
| Distance-cropped protein shells and artificial caps | Deferred | Complete chosen chains avoid cut peptide boundaries. Consider a separate optimization issue only if measurements justify cropping. |
| Supported, compatible parameter model | Essential | One bounded AMBER-family profile; no silent fallback or mixed MMFF/protein energetics. |
| Unknown chemistry and parameter diagnostics | Essential | Whole-calculation refusal where prerequisites fail; no partial parameterization success. |
| Incomplete drafts remain editable | Already satisfied | Preserve direct editing; minimization adds operation-specific prerequisites only. |
| Automatic H addition, protonation, missing-atom repair | Rejected for this operation | Separate explicit workflows; reuse #12/#52/#77/#81 where applicable. No duplicate umbrella issue. |
| Start from current coordinates; preserve stereo intent | Essential | No embedding or conformer search; validate current geometry and supplied intent. |
| Energy, convergence, work, displacement and clash report | Essential | Versioned report with units, limitations and explicit outcome. |
| Active-conformer handling and pairing | Essential | User-confirmed active conformer per entry; all other conformers remain exact. |
| Batch conformer minimization | Deferred | Adds pairing and result-management complexity. No new issue until requested; record the boundary in #82 closeout. |
| Apply non-converged results | Optional, excluded | Report/preview inspection permitted; Apply disabled. A future request can justify a separate issue. |
| Generic job lifecycle and immutable inputs | Already satisfied foundation | Supporting integration adds the minimization job, bounded native tooling and result validation. |
| Icon beside Edit and Ctrl+M immediate calculation | Supporting, explicit subsequent user guidance | Capture current selection and start isolated500-iteration work; open progress/report and retain explicit Apply. Respect typing/modal/repeat ownership. D-111 records the interpretation communicated to the user. |
| Proposal rather than automatic mutation | Essential | Preview is transient and cannot enter exports or canonical queries. |
| Stale source/context and lock checks | Essential | Revalidate every dependency before atomic publication. |
| Exact Undo/Redo, no-op and failure behavior | Essential | Recognized history actions; no molecular command for unsuccessful or unchanged results. |
| Provenance, save/reload and archives | Essential | Retain inputs, model data, report and application provenance. |
| Reuse legacy cleanup | Supporting | Preserve its API/behavior; reuse identity, validation and publication infrastructure. Its mutating helper is not the new proposal boundary. |
| Universal calculation framework | Rejected | Focused minimization service and job plugin only. No follow-up needed. |
| Scientific/API/native/performance verification | Essential | Required before delivery, with retained source-bound evidence. |
| Coordinate with #12 repair minimization | Supporting | Reusable core calculation/proposal services; no repair workflow here. |

There are no unresolved product decisions at approval. Explicit non-goals include
docking, dynamics, binding-energy prediction, global conformer search, preparation
certification, arbitrary ligand/PTM coverage and guaranteed clash elimination.

## 3. Implementation contract

### Scientific model and calculation context

Use one versioned `amber-local-v1` model:

- Protein parameters: **ff14SB**, for complete supported standard-residue states.
- Supported organic molecules: **GAFF 1.81 with AM1-BCC charges**.
- Explicit complete waters: TIP3P when deliberately included.
- Initially refuse metals, unsupported ions/cofactors, nonstandard residues,
  unsupported crosslinks, isotope/radical uncertainty and covalent ligand adducts.

GAFF/AM1-BCC is an established combination; availability does not establish
universal chemical accuracy. The model remains subject to C1 qualification.
[Reference study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10767702/).

Use installed OpenMM **8.4.0** for energies/forces and existing SciPy L-BFGS-B for
optimization over a reduced vector containing selected coordinates only. Fixed
coordinates never become optimization variables. Independently verify the final
movable gradient; an optimizer termination flag alone does not establish
convergence. [SciPy stopping criteria](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-lbfgsb.html).

Parameter generation:

- Add an isolated, explicitly locked AmberTools **24.8**, CPU-only toolchain. Target
  the inspected Linux x86-64 deployment first.
- Pin build `cuda_None_nompi_py312h4265c8b_104` and resolve its complete dependency
  lock during C1. Verified package SHA256:
  `ce9fdcbdba9d665cb1d85f4d9df1c4bc70770a20b4ce25b43d69381f3027bfef`.
  [Package metadata](https://api.anaconda.org/package/conda-forge/ambertools).
- Keep the existing uv application environment and OpenMM pin.
- Configure the toolchain through `MOLWEAVE_AMBERTOOLS_PREFIX`; never install
  packages or download parameters during a job.
- Invoke only fixed, allowlisted executables and generated inputs in managed work
  directories. User names and metadata cannot become executable script text.
- Preserve generated parameter files, tool versions, checksums and diagnostics.
- Ignore parameter-generation geometry when initializing minimization: use
  captured current coordinates.
- Refuse failed charge generation, uncovered parameters, ambiguous mapping,
  unsupported inferred parameters, or generated atoms/bonds differing from the
  accepted input model.

Protein template assignment requires complete, unambiguous existing
atom/connectivity and explicit-H patterns. It may assign calculation parameters;
it cannot silently create missing bonds, select protonation, add atoms or overwrite
unknown canonical chemistry. Raw inputs lacking necessary topology receive
actionable preparation diagnostics.

Context rules:

- Isolated mode includes the complete covalent molecule containing the selection;
  its unselected atoms remain fixed.
- Environment mode additionally includes explicitly chosen complete protein chains
  and molecular components.
- Present nearby candidates using a 12 Å discovery radius, but do not equate that
  discovery radius with calculation membership.
- Show movable/fixed counts, included components, excluded candidates, conformer
  pairing and model limitations before submission.
- Hidden entries and hydrogens remain eligible physical inputs.
- Preserve full chosen-chain topology; no calculation caps or persisted topology
  changes.
- Environment calculations use nonperiodic 12 Å nonbonded cutoff, 10 Å
  Lennard-Jones switching and reaction-field dielectric 78.3. Report this
  finite-range approximation explicitly.
- Isolated bounded molecules use nonperiodic, uncropped nonbonded evaluation.
- Preserve native exceptions and scaling. Use engine neighbor handling so movement
  cannot escape a frozen initial contact list.

Initial admission limits:

| Limit | Value |
|---|---:|
| Assembly atoms, including H | 20,000 |
| Movable atoms | 2,000 |
| Organic components | 4 |
| Heavy atoms per organic component | 256 |
| Default / maximum optimization iterations | 500 / 2,000 |
| Movable maximum gradient component | 10 kJ mol⁻¹ nm⁻¹ |
| Parameterization / optimization / overall deadline | 240 / 300 / 600 seconds |
| Cancellation grace | 2 seconds |
| Address-space limit where supported | 4 GiB |
| Result artifact total | 100 MiB |

These are approved proposed limits to qualify, not measured claims. Exceeding them
must refuse the calculation rather than truncate chemistry. Material scientific or
scope changes require a plan revision, not silent substitution.

### API, jobs and proposal application

Add typed interfaces under existing `/api/v1` transport:

- `GET /minimization-capabilities`: model availability, prerequisites and limits.
- `POST /projects/{project_id}/minimizations`: capture revision, canonical
  selection, input artifact identities, active conformers, context choices and
  iteration limit; return an existing job representation.
- `GET /projects/{project_id}/minimizations/{job_id}/proposal`: return the validated
  report and bounded coordinate proposal.
- `POST /projects/{project_id}/minimizations/{job_id}/apply`: accept
  `expected_revision` and proposal digest; return `ProjectRead`.

Register an allowlisted `coordinates.minimize` job using existing lifecycle, events
and artifacts. Prevent generic submission from bypassing capture validation.
Expensive preflight, parameterization, optimization and final validation execute
outside the HTTP process.

Add bounded subprocess-tree supervision: cancellation, worker/child loss and
deadlines must stop AmberTools descendants as well as the Python job child. Retain
existing demonstration-job behavior.

Results distinguish blocked, failed, non-converged, converged and unchanged
calculations. Completion never automatically edits entries. Reports include:

- Immutable inputs and canonical calculation mapping.
- Selected/fixed sets and active conformer pairing.
- Model, charge method, parameter provenance and approximations.
- Initial/final energy in kJ/mol, gradient, iterations/evaluations and termination
  reason.
- Maximum/RMS displacement, residual clashes, stereo checks and warnings.

Apply accepts only converged, finite, validated proposals. Recheck project
ownership, result integrity, all captured source/context artifacts, identities and
movable-entry locks. Fixed context may be locked. Reject changed dependencies with
rerun guidance; do not silently rebase or recompute.

Unrelated project edits may precede Apply when dependency artifacts remain exact
and the Apply revision is current. Selection and camera changes do not retarget
the proposal.

Extend molecular publication to a batch while retaining existing single-entry
callers. Publish one command using existing `entry.molecule` actions and
affected-entry patches:

- Change only captured selected rows in captured active conformers.
- Preserve all other conformers and unselected rows exactly.
- Preserve topology, identities, source facts, original bytes and user metadata.
- Append operation provenance and warnings separately.
- Reuse measurement, surface, interaction and projection invalidation paths.
- Undo/Redo switches exact before/after artifacts across every affected entry.
- Coordinate no-ops use established `1e-9 Å` tolerance and create no molecular
  history/provenance change.
- Repeated Apply or ambiguous network responses cannot create duplicate history.

### Persistence and UI ownership

Use existing job/artifact records and extensible normalized annotations. No new
database migration or top-level schema version is planned. Do not introduce a new
persisted history action kind.

Archives retain scientific inputs, parameter/report artifacts and application
provenance. Imported archived proposals are historical, inspectable records; they
cannot apply against remapped entries. Archives continue to omit Undo history.

Add a compact, nonmodal **Minimize selection** workflow alongside editing/transform
tools. It owns transient capture, pending and preview state above responsive
remounts. TanStack Query owns server results; Mol* renders disposable, nonpickable
previews.

Provide progress, cancellation, report inspection, Preview, Apply and Discard.
Block incompatible simultaneous previews. Project changes clear presentation
ownership without retargeting or deleting the original job. Preview coordinates
never replace canonical query data.

Retain keyboard focus, Escape behavior, 44 px touch targets, both themes, 320 px
layouts and actual 100%/200% browser zoom. Toolchain absence must produce a specific
unavailable reason; legacy cleanup remains available under its existing
restrictions.

## 4. Milestones, checkpoints and verification

Each checkpoint leaves existing functionality coherent, updates this feature-plan
log and concise project progress, and commits only passing work. C1–C6 retain
existing APIs/history actions/schemas; until compatibility is qualified, rollback
uses a complete pre-change managed-data backup. No checkpoint may publish
unsupported chemistry or expose an unimplemented control as functional.

### C0 — Persist approved planning only

Outcome: approved implementation contract recorded on the dedicated branch.

- First file change: this feature plan at the approved path.
- Include append-only accepted decisions and a concise PROGRESS planning summary
  in this documentation checkpoint.
- Record approval, scope, baseline, planned checkpoints, limitations, blockers and
  next action.
- Validation: clean-tree checks, links/metadata review and `git diff --check`.
- Migration/version implications: none.
- Commit: `docs(plan): add approved plan for issue 82`.
- Push and verify the remote branch/commit; stop before implementation.
- Rollback: ordinary reversal of planning documentation; no runtime/data change.

### M1 / C1 — Qualified integrated model and isolated job

Outcome: a supported isolated molecule runs through the real worker and produces
an inspectable report/proposal.

Affected areas: core minimization, toolchain lock/setup, plugin registration and
worker subprocess control.

Acceptance:

- Reproducible parameter generation and exact atom/topology mapping.
- Full and subset minimization; unselected H remains fixed.
- No canonical mutation on job completion, failure or cancellation.
- No surviving native descendants after tested cancellation/loss.
- Missing toolchain and unsupported chemistry are explicit failures.

Focused validation:

```bash
.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization.py
.venv/bin/uv run pytest tests/integration/test_minimization_jobs.py tests/integration/test_worker_recovery.py
```

Document setup, model terms, units and prerequisites. No migration.
Commit: `feat(minimization): add bounded parameterized minimization jobs`.

Stop gate: inability to reproduce or scientifically qualify this model requires
plan revision, not substitution with weaker physics.

### M2 / C2 — Fixed protein context and multi-entry assembly

Outcome: ligand-only and ligand/residue movable selections work in explicit protein
context.

Affected areas: assembly mapping, protein templates, context capture and energy
evaluation.

Acceptance:

- Equivalent same-entry/separate-entry fixtures produce equivalent mapped
  calculations.
- Included context changes actual energy/gradient and optimized outcome.
- Peptide bond, angle, torsion, exclusion and scaled interactions survive selection
  boundaries.
- Hidden context participates; excluded components do not enter implicitly.
- Missing parameters and covalent adducts refuse without partial success.
- No caps or topology mutations.

Focused validation:

```bash
.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization_context.py
.venv/bin/uv run pytest tests/integration/test_minimization_jobs.py
```

Document boundaries, cutoff approximations and coverage. No migration.
Commit: `feat(minimization): include explicit fixed molecular context`.

### M3 / C3 — Atomic Apply, history and persistence

Outcome: accepted proposals update existing entries in one reversible command.

Affected areas: minimization API, batch publication, artifacts, archive handling
and client contracts.

Acceptance:

- All dependencies validated before publication.
- Stale, deleted, replaced, foreign or movable-locked inputs reject atomically.
- Exact multi-entry Undo/Redo, no-op and retry behavior.
- Original bytes, topology, metadata and inactive conformers remain exact.
- Reload/archive retains reports and provenance; archived proposals cannot Apply.
- Legacy cleanup API tests remain unchanged and passing.

Focused validation:

```bash
.venv/bin/uv run pytest tests/integration/test_minimization_apply.py tests/integration/test_archive_roundtrip.py tests/integration/test_ligand_edits.py
.venv/bin/uv run pytest tests/integration/test_coordinate_commands.py tests/integration/test_migrations.py
```

Document API and additive provenance shape. Verify fresh and existing `0014`
databases. Commit: `feat(minimization): apply proposals as atomic reversible edits`.

Rollback uses complete managed-data backups; preceding-reader qualification must
confirm retention before claiming compatibility.

### M4 / C4 — Native selection-to-preview-to-Apply workflow

Outcome: all accepted user cases work through canonical selection in the real
browser.

Affected areas: panel/session state, job/report presentation, viewer preview and
cache invalidation.

Acceptance:

- Context and conformer choices are inspectable before submission.
- Selection/project changes cannot retarget work or revive discarded previews.
- Cancel/Discard leaves canonical state exact.
- Non-converged reports are inspectable but cannot Apply.
- Measurements and dependent visuals restore correctly.
- Keyboard, touch, both themes, narrow layouts and zoom remain usable.

Focused validation:

```bash
corepack pnpm --dir apps/web test -- minimization jobs viewer-adapter
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-minimization.spec.ts tests/e2e/minimization-accessibility.spec.ts
```

Update user guidance and accessibility evidence. No migration.
Commit: `feat(editor): add selection minimization preview and apply`.

### M5 / C5 — Independent scientific, compatibility and performance qualification

Outcome: retained evidence supports every accepted requirement.

Affected areas: scientific/unit/API/native fixtures and tests, compatibility
harness, performance measurement and evidence documentation.

Add negative cases for unknown chemistry, missing H, alternate sites, incompatible
conformers, conflicting stereo, singular/nonfinite geometry, charge-generation
failure, limits and non-convergence. Check forces numerically on independent
fixtures; avoid exact cross-platform trajectory assertions.

Measure cold setup, optimization, memory and cancellation on ligand-only, prepared
1STP pocket and larger bounded assemblies. Preserve raw 1STP as a negative
prerequisite fixture and document any prepared derivative independently.

Targets on the pinned host:

- Prepared 1STP setup ≤120 seconds and optimization ≤60 seconds.
- Cancellation settles within 5 seconds.
- Peak aggregate RSS ≤2 GiB.
- Existing viewer responsiveness/request-shape budgets remain unchanged.
- No dense all-pairs browser/Python allocation.

Focused validation:

```bash
.venv/bin/uv run pytest tests/scientific tests/integration/test_minimization_jobs.py tests/integration/test_minimization_apply.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/minimization-performance.spec.ts tests/e2e/interactive-transform-performance.spec.ts
```

Add an executable actual-tagged-v0.19.0 reader harness for canonical data, generic
history, jobs and archive re-export. Older authoring need not implement
minimization. Document fixture provenance, limitations, performance and
compatibility. No migration.

Commit: `test(minimization): qualify scientific and workflow guarantees`.

### M6 / C6 — Release candidate and review

Outcome: complete, reviewed, final-version candidate ready for normal merge.

Affected areas: authoritative version sources, user/API/scientific/development/
release documentation, verification evidence and full-diff review.

Update all authoritative version sources to 0.20.0, documentation and requirement
evidence. Run the complete release gate before opening and before merging the PR:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<dedicated-disposable-data-dir> .venv/bin/uv run alembic upgrade head
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

Substitute a real dedicated disposable path for the placeholder. Also verify the
locked AmberTools installation and final-version producer/actual-v0.19.0 reader
harness. No database or structural schema migration is planned.

After every implementation milestone, run relevant static checks,
Python/frontend tests, build and native workflows. Retain source SHA, commands,
environment, timings, outcomes, intentional skips and log hashes; distinguish
diagnostics from passing evidence.

Review the complete diff and resolve consequential findings.
Commit: `chore(release): prepare v0.20.0`.

## 5. Release, merge and approval handoff

### Version decision

Stable minor **0.20.0** is appropriate:

- This adds substantial public functionality, APIs and persisted operation
  provenance, exceeding a patch.
- Existing cleanup contracts and structural schemas remain compatible.
- A major increment is unwarranted for this bounded pre-1.0 addition.
- A prerelease is unnecessary once qualification passes. Failed scientific gates
  block release rather than justify weaker claims.
- Existing release history determines the baseline; the enhancement label does
  not.

Update all five authoritative sources:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Recheck version/tag collisions before release preparation. If another minor has
shipped, advance from the actual latest release and record the adjustment.

### PR and publication

- Base PR on `master`; normal merge commit preserving checkpoint history.
- PR description identifies implemented, simplified, deferred and rejected
  requirements, prerequisites, scientific limitations and verification.
- Create/link the covalent-adduct follow-up before merge. Explicitly record the
  user-approved scope deviation.
- Use `Closes #82` only when the accepted contract passes; never claim the deferred
  adduct case works.
- Recheck protections, checks, reviews and unresolved conversations immediately
  before merge. Never bypass them.
- Repeat the complete gate on the exact merged master commit before creating the
  annotated tag or release.
- Release-note sections: user workflow; scientific model/prerequisites; limits and
  deferred scope; API/data/compatibility; installation/rollback;
  verification/performance.
- Publish verification artifacts and checksums; verify remote tag target, release,
  downloads and final issue reply.
- Delete the feature branch locally/remotely only after publication and
  documentation integration are verified. Never move a published tag to
  incorporate later evidence documentation.

Merge/release blockers include failed scientific guarantees, unsupported parameter
substitution, stale or partial Apply, coordinate/topology loss, leaked native
processes, compatibility failures, inaccessible controls, failed performance
budgets, incomplete evidence, version inconsistency or unmet repository
review/check requirements.

### Approval and persistence procedure

Approval has been given and the read-only planning restriction has been lifted.
Execute only C0 in this handoff:

1. Confirm a clean working tree.
2. Fetch `origin`; update local `master` by fast-forward only.
3. Confirm cleanliness and revalidate material baseline changes.
4. Create `feat/issue-82-selection-minimization`.
5. Perform C0 only, with this plan as the first branch change.
6. Commit `docs(plan): add approved plan for issue 82`.
7. Push and verify remote branch and commit.
8. Report the exact path, branch, commit, approved milestones and minor-release
   impact.
9. Stop with the repository ready for `/goal`.

## 6. Progress and completion log

| Checkpoint | Status | Outcome / evidence |
|---|---|---|
| C0 | Approved plan persisted | Documentation-only handoff commit; local checks pass. Final commit/remote identity is recorded by Git and the C0 handoff. |
| M1 / C1 | Complete | Integrated isolated worker proposals and process-tree lifecycle; [final gate](../assets/minimization/c1-gate.json), [self-review](../assets/minimization/c1-review.md). |
| M2 / C2 | Complete | Native ff14SB context, exact multi-entry mapping, water and boundary terms; [gate](../assets/minimization/c2-gate.json), [self-review](../assets/minimization/c2-review.md). |
| M3 / C3 | Complete | Server-owned capture, atomic Apply/history and archive retention; [gate](../assets/minimization/c3-gate.json), [self-review](../assets/minimization/c3-review.md). |
| M4 / C4 | Complete | Native workflow, adjacent icon and Ctrl+M; [gate](../assets/minimization/c4-gate.json), [self-review](../assets/minimization/c4-review.md). |
| M5 / C5 | Complete | Science/negative/state/1STP/18k/actual-reader qualification; [gate](../assets/minimization/c5-gate.json), [self-review](../assets/minimization/c5-review.md). |
| M6 / C6 | Not started | Final-version candidate and review. |
| Publication | Not started | Exact merged-master gate, tag/release verification, issue response and branch cleanup. |

2026-10-18 — Approval and C0 preparation:

- User approved the complete proposal with “Implement the plan.” after selecting
  integrated pocket parameters, active conformers and covalent-adduct deferral.
- Clean local master was `b1fad2c77517cbdc24a87877507539d5abe584fa`.
  `git fetch origin` followed by `git merge --ff-only origin/master` reported
  already up to date. Working tree was clean after the update.
- No local or remote branch with the approved feature name existed;
  `git switch -c feat/issue-82-selection-minimization` succeeded.
- Issue metadata was rechecked remotely; no changed issue input or baseline drift
  required a revised plan.
- Plan is the first file change; D-108–110 and concise project progress accompany
  the documentation-only checkpoint. Global PLAN and product specification remain
  unchanged.
- Verification performed: `git diff --check` and explicit UTF-8/final-newline/
  trailing-whitespace/relative-link checks pass for all three documentation files.
  Required contract metadata/checkpoints, D-108–110 uniqueness and byte-exact
  preservation of global PLAN, PRODUCT_SPEC and all five authoritative version
  sources were checked. Full added plan and decision/progress diff were reviewed.
- Commit message is fixed above; final commit SHA and pushed origin ref are
  verified and reported in the C0 handoff rather than embedded self-referentially
  in this commit. That remote verification completes C0; C1–C6 remain unstarted.
- No feature implementation, dependency installation, version increment, PR,
  follow-up issue, tag or release is part of C0.
- Known limitations: every proposed scientific model/limit, native toolchain,
  performance target and compatibility claim still requires implementation and
  qualification. Existing release results are historical evidence only.
- Blockers: none for the approved planning checkpoint. C1 scientific/toolchain
  feasibility remains a mandatory future stop gate.
- Next action after C0: await `/goal`; begin C1 only when implementation is started.

Each subsequent checkpoint must append its commit, commands and evidence, outcomes,
deviations, known limitations, blockers and next action. Only C0 can be completed
in this planning handoff. Remote commit/push verification is reported separately
without attempting to embed a self-referential commit SHA in its own contents.

2026-10-18 — `/goal` start and C1 implementation:

- C0 commit `3261486e3ac55c6f2c4c517d3b2bf7e73d9a0a60` is on the verified planned
  remote branch. Fetched origin before implementation; no upstream base drift.
- Read the approved contract, repository/product/global-plan/decision/progress and
  relevant verification/development/architecture/model records before code changes.
- Installed official checksum-verified micromamba2.9.0 outside the repository;
  resolved the approved AmberTools24.8 build to 137 exact URL/SHA256 packages.
  `tools/ambertools-linux-64.lock` is executable as an explicit micromamba lock.
  Application uv dependencies and all five application versions remain unchanged.
- Independent explicit-H ethanol probe generated AM1-BCC/GAFF1.81 parameters and
  reduced selected-O objective20.1952077429 to15.4960130825 kJ/mol in7 iterations,
  maximum gradient0.109681939 kJ/(mol nm); fixed optimizer rows remained exact.
  This is an isolated probe, not protein-context or final-release evidence.
- Implemented immutable-capture prerequisites, exact native atom/connectivity/
  bond-order checks, reduced-variable optimization and report/proposal/model
  artifacts. Added controlled process-group cleanup and coordinator-loss detection
  to the existing worker. New calculation is opt-in through existing plugin
  configuration at this checkpoint; dedicated capture/Apply/UI remain C3/C4.
- Scientific refinement: record bounded uniform AM1-BCC rounding normalization to
  the specified net charge, retaining raw/corrected files. This is calculation-only
  partial-charge bookkeeping, not formal-charge/protonation assignment; see D-108
  implementation note and tools setup guidance. Native carboxylate bond-order
  representation is conservatively blocked when strict mapping fails.
- Added real scientific full/subset/H-fixed/force-derivative/non-convergence/
  aromatic/charged/stereo/halogen/sparse-ID/conformer/parameter-tamper cases and
  real worker proposal, missing-toolchain and native-descendant lifecycle tests.
  Earlier diagnostics exposed and corrected nonfinite-input reporting, test-only
  empty-input submission and element-aware temporary atom-name handling. Initial
  strict charge checks identified finite-precision native rounding, now explicitly
  normalized and independently tested rather than silently ignored.
- Focused validation, full milestone checks, source-bound logs and checkpoint
  self-review are being completed before the C1 commit. No C2 functionality,
  molecular Apply, UI, PR, tag, release or completed-issue claim is made.

2026-10-18 — C1 completion:

- [Final source-bound checkpoint gate](../assets/minimization/c1-gate.json) passes
  all12 recorded commands with unchanged source: **862 Python**, **255 frontend**,
  **8 supervisor** and **2 native browser passes /2 intentional layout skips**;
  zero failures or retries. The46 focused prerequisite/scientific/worker cases
  pass with native AmberTools configured and no native scientific skips.
- Ruff, mypy79 source files, web lint/types/build, isolated0014 upgrade and diff
  checks pass. All existing migration/archive and generic-job suites are included
  in the Python gate. No migration, top-level schema or application-version change.
- [Toolchain provenance](../assets/minimization/c1-toolchain.json) retains actual
  application library versions, pinned package/dependency/model hashes and installer
  identity. Exact commands/environments/timings and lossless compressed raw logs
  retain SHA256 checksums. Pre-review gate evidence is explicitly separate.
- [Full C1 local review](../assets/minimization/c1-review.md) is implementer
  self-review. Its consequential E/Z-intent finding is repaired, positive/negative
  stereo cases pass, and the final milestone gate was repeated on repaired source.
  Convenience atom rows must match captured active-conformer rows; unsupported
  stereo encodings refuse. No unresolved consequential C1 finding remains.
- Known limits: organic isolated computation only at C1; strict native mapping can
  refuse resonance encodings; Linux-only qualified native profile. Protein/context,
  Apply, UI, actual preceding-reader and final performance/release qualification
  remain C2–C6. Existing398 Alembic warnings/lazy bundle advisory are unchanged.
- Checkpoint commit: `feat(minimization): add bounded parameterized minimization jobs`
  with `Refs #82`; resolve its final SHA from Git rather than embedding a
  self-reference. No current external blocker. Next action: C2 explicit protein
  context and multi-entry assembly under the same contract.


2026-10-18 — C2 completion:

- C1 commit `df550b390bfbfb9730a3c299906df067c924f5c7` is verified on the planned
  remote branch. C2 adds typed whole-component assembly, exact native ff14SB
  template matching and safe LEaP combination with per-entry/atom mapping. Source
  entry ownership, topology, originals and active/inactive conformers are unchanged.
- Complete explicit protein atoms/H/connectivity/termini establish a unique
  calculation template. Conflicting known chemistry, partial chains, unsupported
  states and crosslinks/adducts refuse. Separate protein preparation now records
  its own generated ordinary identity facts; no minimization repair is introduced.
- Fixed protein, organic components and complete waters participate independently
  of display visibility/locks. Environment uses approved nonperiodic12Å cutoff,
  10Å LJ switch and reaction-field78.3; native neighbors/exclusions/scaled1–4 and
  peptide boundary terms remain intact. Isolated complete supported protein/water
  components use NoCutoff, like isolated organic molecules. No caps or constraints.
- Native AMBER TIP3P's unconstrained internal H-H distance is explicitly accounted
  for as an engine term, never a canonical covalent bond. This is a pinned local
  representation, not a general flexible-water accuracy claim. See the appended
  D-108–110 C2 note. Actual captured start coordinates are retained separately from
  native generated geometry; organic model subdirectories/diagnostics remain in ZIP.
- [Fixture provenance](../../tests/fixtures/minimization/README.md) documents the
  synthetic complete L-AGS derivative and independently performed H preparation;
  the original editing fixture/raw1STP remain unchanged. Template snapshots are
  model-derived unit inputs, explicitly not independent physical reference data.
  [Checksums](../assets/minimization/c2-fixtures.json) and
  [native provenance](../assets/minimization/c2-toolchain.json) retain31 actual
  executable/data hashes and unchanged137-package lock. Added files are verified
  free of prefix relocation in the installed package metadata.
- [Final C2 gate](../assets/minimization/c2-gate.json): all12 commands pass on
  unchanged source: **886 Python**, including**70 focused** prerequisite/native/
  worker cases; **255 frontend**, **8 supervisor**, **4 browser passes /4 intentional
  layout skips**, zero failures/retries. Native minimization scientific tests did
  not skip. Ruff/mypy84, lint/types/build, disposable0014 upgrade and diff pass;
  exact commands/environments/timings/source hashes and lossless gzip logs retained.
- [Checkpoint review](../assets/minimization/c2-review.md) is local self-review.
  Repaired mapping, positive-fixture stereo, known-chemistry, actual-start retention
  and isolated-protein gaps before final gates. No consequential C2 finding remains.
  Browser log records an unchanged jobs-WebSocket transport-close race; inspect and
  repair disconnect cleanup in C4's job/session integration before final delivery.
- No migration, top-level schema, application dependency or version change. C2
  does not implement Apply/UI, exhaustive supported-state coverage, old-reader or
  prepared1STP/large-assembly performance qualification; these remain C3–C5. The
  existing398 Alembic warnings/lazy-bundle advisory remain. No external blocker.
- Checkpoint commit: `feat(minimization): include explicit fixed molecular context`,
  `Refs #82`; final commit and remote identity are verified separately. Next: C3
  dedicated capture/proposal/Apply API, one atomic reversible batch and archives.


2026-10-18 — C3 completion:

- C2 commit `8458b9d72fb4f76da8ba343d781b853df5ffa0f5` is remotely verified.
  Added typed capability/capture/proposal/Apply endpoints and client contracts.
  Server closure/capture owns artifact/hash authority, context and active conformers;
  generic job submission cannot bypass it. Expensive science remains in the worker.
- Apply validates report/result/input integrity, ownership, all fixed/movable source
  dependencies, selection/conformer identity, convergence, locks and no-op epsilon
  before after-artifact publication. SQLite writer lock precedes dependency/retry
  reads; durable application marker joins the molecular history transaction.
- One batch of recognized `entry.molecule` actions gives exact multi-entry Undo/Redo
  while preserving original bytes, topology, IDs, source/metadata and inactive
  conformers. Unrelated revisions/metadata and locked fixed context can pass;
  changed dependencies require rerun. Retries, Undo-then-retry, no-op, non-converged,
  foreign, stale, corrupt and semantically malformed proposals cannot publish.
- Existing molecular publication callers keep a single-entry wrapper. New batches
  preserve topology; multi-entry deletion explicitly refuses because independent
  reference pruning from original state could overwrite another deletion's pruning.
  This feature never deletes topology. See appended D-110 implementation note.
- Compact additive normalized application provenance refers to complete immutable
  job reports/memberships/models. Archive round-trip retains source/proposal/model
  and application marker. Imported jobs are historical via existing archive source
  provenance; reports remain inspectable and Apply against remapped IDs refuses.
- [Final C3 gate](../assets/minimization/c3-gate.json): all12 commands pass on
  unchanged source: **908 Python**, including**268 focused** capture/scientific/
  Apply/archive/legacy-cleanup/coordinate/migration cases; **255 frontend**,
  **8 supervisor**, **7 native passes /7 intentional layout skips**, zero failures/
  retries. Native scientific cases did not skip. Ruff/mypy87/lint/types/build,
  disposable0014 upgrade and diff pass. Existing migration upgrade/downgrade and
  persisted-project/archive cases pass; no structural schema or migration change.
- [Local complete C3 review](../assets/minimization/c3-review.md) is implementer
  self-review. Concurrency, corruption, independently malformed worker outputs,
  exact masked publication, no-op and historical-archive boundaries have direct
  integration evidence. Synthetic specimens use real atomic import publication and
  supported-format original bytes; actual tagged preceding-reader remains C5.
- No application version/dependency change. Plugin remains explicitly opt-in until
  C4 native UI/default registration. Existing398 Alembic warnings/lazy-bundle
  advisory remain. C2's observed jobs-WebSocket disconnect cleanup is still C4
  work. No external blocker or unresolved consequential C3 finding.
- Checkpoint commit: `feat(minimization): apply proposals as atomic reversible edits`,
  `Refs #82`; final SHA and remote identity are verified separately. Next: C4 native
  selection/context-to-job/report/nonpickable-preview/Apply workflow and accessible
  session ownership, followed by C5 full science/compatibility/performance gates.


2026-10-18 — C4 completion:

- Added native nonmodal context/conformer/count setup, progress/cancel, scientific
  report, nonpickable preview and explicit atomic Apply/Discard. Jobs reopens
  persisted work. The lightning icon is beside Edit; per subsequent user guidance,
  Ctrl+M captures and immediately submits isolated500-iteration work, retaining
  explicit Apply. Typing/composition/modal/modifier/repeat/concurrent starts are
  guarded; multi-molecule selections require explicit environment choice. D-111.
- App-owned generations/immutable artifact queries prevent retargeting or delayed
  resurrection across project changes/remounts. Review repaired pending numerical/
  minimization preview ownership in both directions; the actual App regression
  proves the handoff. Historical archived proposals stay nonapplicable.
- Default registration permits startup without native installation; generic capture
  bypass stays refused. Direct ASGI tests verify the repaired jobs-WebSocket idle/
  transport-race cleanup observed in C2.
- [Final C4 gate](../assets/minimization/c4-gate.json): all12 commands pass on unchanged
  source:912 Python (272 focused),265 frontend,8 supervisor,24 native browser /8
  intentional layout skips, no failures/retries or native scientific skips.
  Ruff/mypy87/lint/types/build, disposable0014 and diff pass. Native cases cover
  full/subset isolation, same/separate-entry ligand/residue selections, full GLY,
  fixed protein context, non-convergence/Discard, pure preview, exact one-command
  Undo/Redo, cancellation and Jobs inspection. Keyboard/touch, both themes,320px,
  actual100/125/150/200% browser zoom and scoped axe pass.
- Retained source/log/fixture/toolchain hashes, lossless logs and native images.
  [Complete local self-review](../assets/minimization/c4-review.md) is not independent
  approval. Interrupted diagnostics remain separately identified. Existing398
  Alembic warnings/lazy-Mol* advisory remain. Added [guidance](../MINIMIZATION.md)
  and API/architecture/accessibility/model documentation with append-only decisions.
- No migration/schema/dependency/application-version change or global-plan rewrite.
  Checkpoint: `feat(editor): add selection minimization preview and apply`,
  `Refs #82`; exact commit/push verified separately. Next: C5 broader science,
  prepared1STP/larger-assembly measurements and actual tagged0.19 reader. Stable
  minor0.20.0/final release gates remain C6; no external blocker.


2026-10-18 — C5 completion:

- Qualified70 supported native protein graph states and26 internal-state real native
  models with independent central energy-difference force checks. Added honest
  charge-generation/model/singular/ion negative cases. Review strengthened separate
  charge-group/local-valence/aromatic validation, all four native force kinds/
  exceptions/masses and pre-generation singular refusal. GAFF requires carbon-
  containing organics and respects ion classification; qualified TIP3P stays separate.
  No canonical chemistry is repaired or reinterpreted. Append-only D-112.
- Prepared/disclosed full159-residue1STP: all901 observed heavy rows preserved,
  missing termini/H modeled and generated-only L stereo repaired offline. Neutral
 32-atom CCD biotin has its original heavy frame and verified3D centers; this is
  not physiological/anionic biotin qualification. Raw1STP remains unchanged.
- Real-worker fresh setup, optimization/publication,20ms aggregate parent/descendant
  RSS and actual-SQM cancellation pass for ligand,2,304-atom pocket and18,208-atom
  full-chain assembly. [Exact maxima](../assets/minimization/c5-performance-summary.json)
  meet120s/60s/2GiB/5s. Browser PDB/MOL upload/capture/real calculations/preview/
  Discard pass; trusted-event500ms/750ms bounds and existing movement assertions
  remain unchanged. Automation-transfer latency is retained separately.
- [Final C5 gate](../assets/minimization/c5-gate.json): all15 commands pass on
  unchanged source:1036 Python (605 focused),265 frontend,8 supervisor,28 native
  browser /12 intentional layout skips; no failures/retries/native scientific skips.
  Ruff/mypy87/lint/types/build, fresh0014 and diff pass. Existing398 Alembic warnings/
  lazy-Mol* advisory remain. Lossless logs, source/fixture/toolchain references,
  preparation/measurement/browser artifacts and [complete self-review](../assets/minimization/c5-review.md)
  are retained. This is local implementer review, not independent approval.
- Actual tagged0.19.0 reader at3fc106b215a8c39e943ad399710f43f116961aef retains all
  canonical/conformer/original data, generic multi-entry Undo/Redo, job inputs/
  reports/models/provenance and save/archive import/re-export. Assert actual old
  module paths/version plus200-status downloads, sizes/SHA256/bytes. Development
  producer metadata is still0.19.0; final0.20 producer repetitions remain C6.
- Unsupported adducts/crosslinks, unqualified native carboxylate representations,
  noncarbon/inorganic components and other profile limits still refuse. No new
  migration/schema/dependency/application version or global-plan change. No blocker.
  Checkpoint: `test(minimization): qualify scientific and workflow guarantees`,
  `Refs #82`; commit/push verified separately. Next: C6 current-base/version checks,
 0.20.0 release preparation, complete release matrix/full-diff review and delivery.
