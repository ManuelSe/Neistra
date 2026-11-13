# Issue #137 — Authoritative connectivity and reliable minimization

## 1. Contract, authority, and scope decisions

**Status:** approved 2026-11-13 by the user's “Implement the plan.” C0 is complete;
the subsequent `/goal` authorizes C1–C8. C1 is implemented and focused-qualified;
C2–C6 are implemented and focused-qualified; C7 is in progress; C8 remains pending.

- **Issue:** [#137](https://github.com/ManuelSe/Neistra/issues/137).
- **Plan path:** `docs/plans/issue-137-authoritative-minimization.md`.
- **Base:** `master`, fast-forward checked against `origin/master` at
  `5f6a2b869d9f8a32a1f921eccb6863c3148188e6`.
- **Branch:** `fix/issue-137-authoritative-minimization`.
- **Proposed release:** stable **0.29.0**, annotated tag **`v0.29.0`**.
- **Implementation begins only after a separate `/goal` instruction.**

The approved outcome is a coherent viewer-icon/Ctrl+M workflow that respects
current connectivity, recovers ambiguous publication outcomes, explains
unavailable capabilities, and includes the review's bounded usability,
scientific, performance, and maintainability improvements.

Authority follows the user's stated order:

1. Explicit user guidance and subsequent corrections.
2. Repository agent instructions and accepted decisions.
3. Existing architecture, product boundaries, schemas and conventions.
4. The issue's underlying problems, outcomes, constraints and non-goals.
5. Non-binding implementation suggestions in the issue.

These subsequent user decisions govern the plan:

1. **The current molecular model is authoritative.** Original uploaded files
   never decide current connectivity.
2. Address all specialist findings and improvement opportunities, rather than
   only the three defects.
3. **Leave existing projects unchanged.** Add no automatic repair, migration,
   or new connectivity-repair action.

Inspection covered repository instructions, PRODUCT_SPEC, PLAN, PROGRESS,
DECISIONS, VERIFICATION, relevant molecular/project schemas and APIs,
import/edit/viewer/minimization paths, jobs, tests, migrations, performance policy,
version sources, and release evidence. Specialist planning assessments informed
the design; disagreements about original-file evidence are resolved by the user's
explicit decision above. See [D-153](../DECISIONS.md#d-153--current-connectivity-and-reliable-quick-publication).

The no-release-history premise is superseded by remote evidence: stable
[v0.28.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.28.1) exists, along
with earlier releases. At inspection there were no open PRs, Actions workflows,
or repository rulesets; master was unprotected. Recheck before delivery. These
facts do not replace local validation or authorize bypassing future protections.

### Requirement disposition

| Significant requirement or suggestion | Classification | Treatment |
| --- | --- | --- |
| Respect current connectivity and deleted bonds | Essential | Enforce across rendering, editing, calculation, and publication. |
| Preserve useful connectivity for new protein imports | Supporting | Record supported inference during import using the existing option. |
| Repair existing sparse projects automatically | Rejected | Explicit user decision: retain current artifacts and connectivity. No follow-up issue now. |
| Add a new connectivity-repair action | Deferred | Explicitly excluded from this delivery. Existing manual bond editing remains available; no follow-up issue now. |
| Compare original files to authorize current bonds | Rejected | Conflicts with current-state authority. No follow-up. |
| Recover lost/malformed Apply responses | Essential | Application-owned publication transaction with reconciliation and explicit safe retry. |
| Explain capability loading/unavailability/failure | Essential | Accessible status and retry beside Run. |
| Correct success styling for refused results | Supporting | Reuse existing success/error notices with accurate outcomes. |
| Quiet successful shortcuts and dismissible long notices | Essential, subsequent user correction | Remove successful quick scientific-warning popups; retain full reports/entry warnings. Keep plain failure/refusal/recovery messages and viewport-bounded scrollable notices with reachable Close. |
| Show captured targets and actual calculation context | Supporting | Compact, staged details using authoritative server data. |
| Use current selection in quick setup | Supporting | Explicit recapture without starting work. |
| Component-level field provenance | Supporting | Typed summary in extensible job results and the model artifact. |
| Broader scientific qualification | Supporting | Bounded edited-graph, state, mixed-field, and boundary cases. |
| Count-only discovery and per-job indexes | Supporting | Implement after scientific corrections; qualify against that corrected baseline. |
| Shared publication/artifact helpers | Supporting | Small extraction; retain distinct scientific services. |
| Move uncommon settings behind disclosure | Optional, included | Repair policy and iterations under More settings. |
| New shortcut progress/busy/results surface | Rejected as proposed | Preserve quiet execution; improve the existing tooltip only. No follow-up. |
| Original preservation, fixed masks, history, controlled jobs | Already satisfied foundations | Preserve and regression-test. |
| Replacement engine, persistent cache, generic transaction framework | Rejected | No demonstrated need. No follow-up. |
| Broader force-field or unsupported-chemistry expansion | Deferred | Existing related issues, including #86 and #101, remain separate. No duplicate issue. |

No product decision remains unresolved in this contract.

## 2. Implementation design

### Current connectivity, import, and editing

Use the normalized model's bond endpoint set as the sole connectivity authority.

**New PDB/mmCIF imports**

Honor the existing `infer_bonds` option, currently discarded by these adapters.
Keep its default true; relabel the existing import control **Infer missing
connectivity**.

When enabled:

- Preserve supplied connectivity, assigned orders, charges, atoms, and coordinates.
- Add missing supported standard-amino-acid edges between observed, uniquely
  named, element-matching atoms. Reuse the existing corrected templates for the
  20 standard amino acids.
- Store additions as canonical bonds with deterministic IDs, `inferred=true`,
  unknown order, inference records, and concise warnings.
- Add peptide links only for unambiguous sequence neighbors in the same
  chain/subchain, without explicit breaks, duplicate names, or alternate-site
  ambiguity. Require **0.9 <= C–N distance < 1.8 angstrom in every conformer**.
- Detect PDB TER boundaries before normalization loses them. Preserve explicit
  supplied connections; do not infer a link across a break.
- Create no missing atoms and infer no loops, metal coordination, adducts,
  disulfides, nucleic-acid connectivity, or unknown ligand graphs. Retain their
  explicit connections and report limitations.

When disabled, retain supplied connectivity only. Existing XYZ inference remains
unchanged.

Extract templates into a neutral chemistry module so import does not depend on
minimization. Keep connectivity inference separate from temporary force-field
interpretation.

**Existing projects**

Opening, rendering, reloading, importing native archives, and minimizing must not
add canonical bonds. Display stored connectivity exactly, even if sparse or empty.

Provide factual calculation diagnostics when connectivity limits the model. Do
not assume every disconnected structure is erroneous or silently rewrite stored
warning records. Existing manual editing remains the way to change these structures.

**Editing**

Extract and reuse the existing typed `neistra_modeling.excluded_bonds` helpers.
All supported bond-edit paths must consistently record exclusions, clear them
upon explicit re-addition, and prune deleted endpoints. Preserve compatibility imports.

Malformed metadata or a present bond contradicting an exclusion produces an
actionable validation error. Rendering must not hide a canonical bond that
calculations retain.

### Viewer and scientific calculation

Always install the canonical bond graph in the viewer, including an explicitly
empty graph. Remove the union with renderer-inferred connectivity.

Quick minimization may interpret unknown orders on existing edges and retain its
disclosed temporary states, hydrogens, and boundary caps. It must never add a bond
between currently disconnected canonical atoms. Helpers must not indirectly
recreate a deleted connection.

Validate this invariant before accepting output:

> The temporary model's bonds between canonical atoms equal the corresponding
> modeled current bond set.

Preserve current coordinates as the optimization starting point, exact fixed/
inactive rows, geometry/stereo/overlap checks, same-final-model objective
comparison, cancellation, and coordinate-only publication.

Keep `quick-local-v1`; increment the quick implementation from **1.0.2 to 1.0.3**.
Historical reports remain inspectable/downloadable, but earlier quick proposals
cannot Apply; explain that minimization must be rerun.

At worker dispatch, verify the queued implementation version matches the loaded
definition, including inside the child process. Mismatches fail explicitly
without executing under misleading provenance.

### Apply recovery and state ownership

Introduce a small App-owned quick-publication transaction, separate from panel
visibility and preview ownership. Both automatic and manual quick Apply use it.

Capture project ID, job ID, proposal digest, expected revision, and automatic/
manual origin. Persist this small descriptor in session storage before dispatch;
store no molecular data. A failed journal write prevents dispatch and preserves
the proposal.

States are **submitting -> reconciling -> settled**, or **uncertain** when evidence
is insufficient.

After an ambiguous response failure:

1. Read fresh project state, then fresh job state.
2. Validate the existing application marker against the captured job/digest.
3. If its application revision exceeds the project snapshot, fetch the project again.
4. Publish current project state through the existing monotonic cache-update function.

Interpretation:

- **Matching application marker:** recorded once; refresh current state without
  reapplying. Later Undo or edits remain authoritative.
- **No marker, newer project revision:** the old revision-bound request cannot
  subsequently commit; refresh and require a new calculation.
- **No marker, unchanged revision:** remain uncertain. Reads alone cannot prove
  that a delayed request will not commit.

Offer **Refresh result** for reads only and **Retry application** for an explicit
retry of the same captured job, digest, and expected revision. Server locking,
revision checks, and recorded application prevent duplicate commands. Never
automatically replay Apply.

While unresolved, guard that project's revision-changing operations at their
actual dispatch boundaries, including direct editing, movement, imports, result
import, and save—not only disabled buttons. Selection, camera inspection, project
switching, export, and job inspection remain usable.

Closing the panel or switching projects cannot erase a dispatched transaction.
Valid pending descriptors restore into reconciliation after reload, never
automatic publication. Invalid descriptors cannot authorize requests; retain a
bounded source-project diagnostic/guard rather than silently claiming resolution.

Quiet execution must not reopen panels or steal focus. The existing icon reveals
recovery for the affected project.

### Controls, diagnostics, and maintainability

- Show capability checking, unavailable reasons, and transport errors beside Run.
  Rechecking preserves settings and selection and never submits work.
- Add **Use current selection** to quick setup. Replace the captured selection/
  revision explicitly, retain settings and valid manual choices, and clear old
  summaries. Disable during calculation/publication.
- Before submission, label the requested selection and H policy accurately.
  After capture, show resolved movers; after calculation, show actual modeled
  entries, movable/fixed atoms, helpers, and caps. Never equate all captured atoms
  with local fixed context.
- Keep context and attached-H controls visible. Put repair policy and iterations
  under **More settings**.
- Preserve quiet Ctrl+M. During an active run, use the existing tooltip to explain
  that the icon opens inspection/cancellation.
- Use success styling only for confirmed application. Refused, stale, or failed
  outcomes use existing error presentation; unchanged results remain quiet.
- Add typed, internally versioned effective-field provenance to extensible job
  results and the model ZIP: component identity, canonical atom membership,
  actual method, coverage, and omissions. Validate at the frontend boundary.
  Retain existing quick-report schemas and readable assumptions.
- Extract genuinely shared project/artifact verification, publication-lock, and
  coordinate-replacement helpers. Remove the quick service's dependence on
  another specialized service's private helpers. Keep acceptance rules,
  dependencies, warnings, and history semantics separate.

### Performance

After the corrected scientific checkpoint:

- Replace neighbor-list allocation with exact count-only radius queries using
  `return_length=True`; preserve closed-radius behavior at 6/7/8 angstrom.
- Keep immutable adjacency, residue/component membership, and captured-coordinate
  indexes per assembly/job. Replace the whole index on model rebuild; never
  share across jobs or reuse worker indexes for Apply validation.
- Index protein bonds and current temporary adjacency rather than scanning all
  bonds per residue. Updates must reflect temporary order interpretation correctly.

No dependency upgrades, persistent cache, approximation, or relaxed scientific
tolerance is included.

## 3. Milestones and checkpoints

Every checkpoint records actual outcomes, focused evidence, limitations, and the
next action here and in concise project progress. Fix consequential validation
failures before proceeding. No empty commits.

| Checkpoint | Outcome, affected areas, and acceptance | Focused validation | Commit and documentation |
| --- | --- | --- | --- |
| **C0 — Approved plan** | Fast-forward clean master, create branch, persist this approved contract as the first branch change. No runtime changes. | Clean-tree/base checks, document/link review, `git diff --check`, remote branch/commit readback. | `docs(plan): add approved plan for issue 137`. Append decisions and project progress. **Push and stop ready for `/goal`.** |
| **C1 — Authoritative connectivity** | Import normalization, neutral templates/metadata helpers, editor exclusions, viewer bonds, quick graph invariant, historical-proposal gating, worker version checks. Imported supported connectivity is recorded; deleted/empty current graphs remain exact. | Adapter/editing tests; focused quick unit/scientific/integration suites; new native canonical-connectivity workflow; frontend lint/types/tests/build. | `fix(modeling): make current connectivity authoritative`. Update molecular/import/minimization guidance, decisions, and evidence. No migration. |
| **C2 — Reliable publication** | App-owned transaction, journal, cache reconciliation, project guards, recovery controls, automatic/manual Apply integration. Lost responses never cause blind replay or a false outcome. | Focused transaction/cache tests; real-server response-loss tests; direct-write guard tests; frontend validation/build and existing quick/toolbar browser cases. | `fix(minimization): reconcile uncertain coordinate publication`. Document recovery and compatibility. No server publication endpoint or schema change. |
| **C3 — Complete controls and provenance** | Capability feedback/retry, recapture, staged context summaries, field provenance, settings disclosure, outcome notices, active tooltip. Preserve quiet focus and frozen targeting. | Focused component/API tests; desktop/mobile quick/toolbar tests; 320px, both themes, axe, keyboard, and actual desktop 100–200% zoom. | `feat(minimization): clarify targets context and calculation outcomes`. Update API/minimization guidance and verification. |
| **C4 — Scientific qualification** | Independent edited-graph, protein-state, mixed-field, and boundary regression coverage. Correct consequential findings. | Expanded scientific suite plus complete quick API tests; existing prepared-engine tests remain intact. | `test(minimization): qualify current graphs and mixed calculation models`. Record assumptions, tolerances, and limits. |
| **C5 — Measured performance** | Count-only queries and immutable indexes preserve C4 behavior. Compare against the corrected C4 baseline. | Brute-force membership/closure oracle; boundary/allocation tests; three equivalent small/pocket/18k profiles; existing native performance workflows. | `perf(minimization): reuse bounded molecular discovery indexes`. Record measurements without unsupported speedup claims. |
| **C6 — Shared boundaries** | Extract only the shared helpers described above; quick and prepared behavior remains unchanged. | Both services' integration suites; fixed-row/sparse-ID/inactive-conformer tests; Ruff/mypy and relevant browser regression. | `refactor(minimization): share artifact and coordinate publication helpers`. Update architecture notes. |
| **C7 — Release candidate** | Five versions agree at 0.29.0; complete candidate gate and actual readers pass; all seven specialists assess the same final candidate. | Complete gate below, compatibility/production/version audits, full-diff review, remote policy/tag checks. | `chore(release): prepare v0.29.0`, plus meaningful evidence/correction commits. |
| **C8 — Delivery** | Normal PR merge, exact-master qualification, verified annotated tag/release, issue reply, documentation receipts, branch cleanup. Requires subsequent delivery authorization. | Exact merged gate/readers; remote tag/release/asset/issue verification. | Meaningful `docs(release): ...` receipts through normal PR integration. Never retarget an existing release tag. |

C1–C6 are independently revertible through normal commits. No rollback requires a
schema downgrade. Rollback to an older application restores its older behavior,
including its known inference defects; data retention compatibility does not
imply behavioral equivalence.

## 4. Acceptance and verification

### Scientific and workflow cases

Require independent expected results and justified tolerances:

- Raw 1STP retains its explicit ligand edges and gains the supported protein edges
  during new import; originals and charges remain exact.
- Import inference on/off, TER, chain/subchain changes, gaps, insertions,
  alternate/duplicate sites, missing endpoints, threshold boundaries, and
  conformer disagreement.
- Deleted peptide/intraresidue bonds with unrelated unknown charges/orders; all
  edit paths; add/delete/re-add; Undo/Redo/archive.
- Exact zero-edge and sparse-edge rendering, including close atoms that native
  rendering would otherwise connect.
- Canonical-to-canonical graph equality throughout temporary modeling, guard
  rebuilding, preview, and Apply.
- Existing sparse projects remain byte-identical on reads/reloads; calculations
  use their stored graph and disclose limitations.
- Supplied histidine states, acid H, Lys states, explicit disulfides, and
  gap/terminus handling.
- Mixed moving native/repair and MMFF/UFF components, independent finite
  differences, honest omitted interactions, and fixed-row preservation.
- Independent boundary/cap/exclusion checks; retain existing force, stereo,
  overlap, and objective-offset regressions.
- Real server commit followed by lost response, malformed response, or substituted
  5xx; failure before commit; failed recovery reads; delayed request/retry race;
  exactly one command.
- Undo or later edits before recovery, project switching, panel dismissal,
  remount, reload, and every guarded dispatch bypass.
- Capability state/retry, recapture without submission, actual H/context counts,
  historical provenance fallback, and accurate notifications.

### Focused commands

Extend the existing suites and add dedicated canonical-connectivity and
publication-recovery tests:

```bash
.venv/bin/uv run pytest tests/unit/adapters tests/unit/editing
.venv/bin/uv run pytest \
  tests/unit/test_quick_minimization.py \
  tests/scientific/test_quick_minimization.py \
  tests/integration/test_quick_minimization.py \
  tests/integration/test_import_export.py \
  tests/integration/test_model_edits.py
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/canonical-connectivity.spec.ts \
  tests/e2e/minimization-recovery.spec.ts \
  tests/e2e/quick-minimization.spec.ts \
  tests/e2e/modeling-toolbar.spec.ts
```

### Complete release gate

Run on a clean committed candidate before opening the implementation PR, and on
the exact merged master before publication:

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

Use dedicated disposable stores/ports, the locked scientific toolchain, and
single-thread native qualification settings. Also run migration upgrade/downgrade/
re-upgrade, version/dependency/schema/production/license audits, and actual
**v0.28.1 <-> final 0.29.0** readers in separate processes.

Extend existing reader harnesses to cover old/new quick jobs, structured result
provenance, imported bond inference, exclusions, both archive suffixes,
original/artifact hashes, coordinates/conformers, allocation floors, history,
scenes, and surfaces. Historical proposals remain readable but cannot regain
Apply eligibility.

Preserve D-148: portable correctness gates remain mandatory; strict timing is
separate reference-host qualification. Keep existing timing targets unchanged.
Record cold/warm stages and allocation/work bounds; do not claim microbenchmark
ratios as application speedups.

The prior review's 56 Python, 28 frontend, and 25 browser passes are baseline
evidence only—not qualification of this future implementation.

## 5. Compatibility, release, and persistence

### Interfaces and data

- No database migration; Alembic remains **0014**.
- Project/viewer/archive schemas remain **2**; normalized/selection/component
  schemas remain **1**.
- Existing import request parameters remain unchanged.
- Existing quick create/proposal/report formats remain unchanged.
- Add only typed/versioned output provenance inside extensible job results/model
  artifacts and private frontend transaction interfaces.
- New imports can contain additional explicitly recorded inferred bonds.
  Existing project artifacts are never rewritten automatically.
- Preserve immutable originals; never consult them to restore current connectivity.
- Keep advanced prepared minimization scientifically unchanged apart from tested
  shared-helper extraction and project write guards.

### Version decision

Use **minor 0.29.0**, not patch, major, or prerelease.

The three defects alone could support a patch, but the approved broader delivery
adds context/recapture controls, effective-field diagnostics, and meaningful import
behavior. These are backward-compatible additions to existing stable functionality.
There is no incompatible stored-schema change requiring a major increment and no
planned experimental-only release requiring a prerelease suffix.

Update all five authoritative sources:

1. Root `pyproject.toml`.
2. The `neistra-dev` package entry in `uv.lock`.
3. `apps/web/package.json`.
4. API application version in `main.py`.
5. `archive_service.APPLICATION_VERSION`.

Keep dependency versions fixed. Recheck tag availability and the latest release
before reserving 0.29.0; a conflicting intervening release requires an explicit
version-plan update.

### PR and publication

- **PR title:** `fix(minimization): respect current connectivity and recover publication outcomes`.
- **Merge:** normal merge commit, preserving checkpoint commits.
- PR body documents delivered behavior, user-directed exclusions, simplified
  proposals, compatibility limits, verification, and all seven final specialist
  verdicts.
- The subsequent `/goal` explicitly requires **`Closes #137`** in the PR. This
  supersedes the original closure timing: normal merge may close the issue; the
  mandatory final reply follows verified exact-master qualification/publication.
- Create no speculative follow-up issues. Explain excluded repair functionality
  and existing related research issues in the final issue reply.
- Release-note sections: **Connectivity and editing**, **Minimization recovery**,
  **Controls and diagnostics**, **Performance**, **Compatibility and limitations**,
  **Verification and upgrade guidance**.
- Create annotated `v0.29.0` only from the verified merged runtime commit. Verify
  the tag target, release, qualification asset hashes/download, and final issue
  reply remotely.
- Integrate later documentation receipts normally without moving the runtime tag.
- Delete the feature branch only after merge/publication/readback and clean-tree
  checks; preserve unrelated branches.

**Block merge or release** for unresolved consequential findings, any missing
required specialist assessment, failed applicable checks/readers, connectivity
resurrection, duplicate/ambiguous publication handling, unjustified scientific
claims, changed performance policy, unapproved schema/dependency expansion,
version disagreement, or unmet remote review/check/thread requirements.

### Approval and planning-only persistence

After approval, in an execution-enabled turn:

1. Confirm a clean working tree.
2. Fetch and fast-forward local master from origin/master; never reset or merge
   divergent local work.
3. Recheck the base, release target, and branch availability.
4. Create the planned branch.
5. Persist the approved plan first; append accepted decisions in
   `docs/DECISIONS.md` and a concise planning milestone in `docs/PROGRESS.md`.
   Do not replace the global plan.
6. Commit as **`docs(plan): add approved plan for issue 137`**.
7. Push and verify the remote branch/commit if access is available.
8. Report the exact path, branch, commit, milestones, and minor-release impact.
9. **Stop with the repository ready for `/goal`; do not start implementation.**

## 6. Progress and completion log

### C0 — 2026-11-13: approved planning persistence

The user's “Implement the plan.” approves the preceding contract with the explicit
C0 stop. Clean local master was fetched and fast-forward checked against origin at
`5f6a2b869d9f8a32a1f921eccb6863c3148188e6`; the planned branch was absent remotely
before creation. Stable latest remains v0.28.1; neither a v0.29.0 release nor tag
exists at this checkpoint. The feature branch was created from that verified base.

Only this approved plan, append-only D-153, and the concise project progress entry
are part of C0. Runtime, versions, dependencies, schemas and migrations remain
unchanged. Documentation validation, commit, push and remote readback complete C0;
the exact verified commit/branch receipt is reported in the delivery conversation
to avoid a self-referential commit claim.

| Checkpoint | State |
| --- | --- |
| C0 | Complete: verified local/remote `bae090a337d7cc5371d4cd448eae95ced6b591a1`. |
| C1 | Complete local checkpoint `b4ee31f`; focused evidence below. |
| C2 | Complete local checkpoint `36df747`; focused evidence below. |
| C3 | Complete local checkpoint `9e418d3`; focused evidence below. |
| C4 | Complete local checkpoint `80adf97`; focused evidence below. |
| C5 | Complete local checkpoint `0742184`; measured evidence below. |
| C6 | Complete local checkpoint `013ab2a`; focused evidence below. |
| C7 | In progress: release preparation and actual-reader qualification; no final candidate qualification claimed. |
| C8 | Pending; no release publication claimed. |

Known limitations: current application defects remain until implementation;
existing sparse projects will intentionally remain unchanged; portable data
compatibility does not restore fixes in old binaries. Blockers: none identified
for planning persistence. The subsequent `/goal` resumes runtime work as recorded below.

### C1 — 2026-11-13: current graph authority

New PDB/mmCIF imports honor inference options and record supported 20AA/peptide
edges, with conservative geometry, TER, entity and all-conformer checks. Current
viewer bonds exactly match canonical graphs, including empty graphs, sorted source
rows, stretched cross-unit bonds and representation subsets. Quick interpretation
cannot add canonical edges or helper shortcuts; sparse modeled protein fragments
receive explicit approximate coverage. All editors maintain existing exclusions.
Originals/existing project graphs remain unchanged. Historical quick reports retain
inspection/download but cannot Apply; both worker definitions must match provenance.

[Evidence](../assets/authoritative-minimization/README.md) and
[summary](../assets/authoritative-minimization/c1-summary.json): **309 Python,
408 frontend, 41 native browser passes / one existing mobile zoom exclusion**;
zero final failures/flakes/retries. Ruff and mypy (199 source files), lint/types/
build/diff pass. All 719 source identities remain fixed during the final native
gate. Earlier diagnostic runs remain separate. Scientific theory PASSes corrected
C1 methods/invariants; the final seven-role assessment remains C7 work.

Corrections include known nonpolymer/entity peptide vetoes, honest sparse-fragment
coverage, helper-path guards, native subset/operator bond authority, harness-mount
readiness, historical fixture inference disabled, and protein-editor exclusion
pruning. No essential C1 outcome is deferred. No migration, dependency, app-version,
quick-report schema or original artifact rewrite occurs. C1 is a coherent local
checkpoint, not feature completion or readiness to push. Next: C2 publication
transaction/recovery, followed by C3–C8 under this contract.

### C2 — 2026-11-13: publication ownership and recovery

The App owns per-project quick-publication sessions independently of panel and
preview generations. Both automatic and manual Apply journal the captured job,
digest and revision before dispatch. Ambiguous responses reconcile fresh project
and job evidence; Refresh performs reads only, and explicit Retry retains the
same request. A matching marker preserves subsequent edits/Undo. An unchanged
revision without a marker remains uncertain, including after reload.

Revision-changing operations recheck source-project guards at dispatch. Generic
commands capture their source before asynchronous mutation preflight; direct edits,
movement, imports and job-result import are guarded too. Export, job inspection,
selection, camera and project switching remain available. Recovery neither opens
panels nor steals focus. Invalid/unavailable journal records cannot authorize writes.

Focused unit coverage includes **43 publication cases, 33 hook/panel cases, four
import/read-control cases and two actual TanStack dispatch-boundary cases**.
The complete frontend suite passes **464 tests in 70 files**, with lint, types
and build passing. Architecture review independently reran those 82 focused cases
and PASSed after correcting read-only availability and captured-source dispatch.
All seven final integrated assessments remain C7 work.

The [final focused evidence](../assets/authoritative-minimization/c2-summary.json)
records **61 native browser passes / one existing mobile desktop-zoom exclusion**,
zero failures/flakes/retries in 450.28 seconds. All 726 runtime/test/tool source
identities remain fixed. Real committed Apply responses are aborted, malformed
or replaced with 503; reconciliation creates exactly one command and exact
Undo/Redo survives reload. Unconfirmed/committed recovery, failed reads, explicit
retry, project switching, panel dismissal, journal failure and later Undo pass in
both layouts, alongside existing movement, toolbar, theme/axe, narrow and real
desktop zoom regressions. The first diagnostic run exposed a test setup
ordering error: an out-of-band project was created after the browser cached the
project list. Creating both projects before navigation corrects the precondition;
all 14 new recovery cases then pass without runtime, assertion or timeout changes.
The complete broader rerun above passes. Full-diff checkpoint self-review found no
remaining consequential C2 issue; final seven-role review remains pending.
No backend, schema, migration,
dependency, app-version or scientific-method change occurs in C2. Next: record
the passing checkpoint commit, then begin C3.

### C3 — 2026-11-13: controls and effective-field diagnostics

Setup distinguishes checking, unavailable, failed and paused capability checks.
Explicit recheck preserves the draft; failed/in-flight/paused cached availability
cannot authorize Run or a shortcut. Recheck retains keyboard focus. Explicit
recapture updates selection/revision while retaining settings and valid manual
entry choices; known stale setup requests recapture before submission. Server
revision checks remain independent. Repair/iterations use More settings.

Requested, server-resolved and actual local counts are distinct. Temporary helper
atoms include cap atoms; boundary cap groups use a separate count. Approximate
native coverage is labeled as an approximate model rather than necessarily repair.
The existing active icon explains inspection/cancellation or publication recovery;
quiet execution retains its existing focus/ownership rules.

Additive effective-field schema1 records actual installed methods after fallback,
canonical component membership and six scoped omission keys in generic job values
and identical model ZIP data. The frontend validates structure/internal membership
and equality with the final report's modeled membership before display. Missing
historical and invalid/unsupported metadata have distinct fallbacks. Strict quick
report/proposal1 and scientific Apply eligibility remain unchanged. Both archive
suffixes retain opaque provenance and exact model ZIP bytes.

Focused backend qualification: **93 tests pass in 17.58 seconds**, including
27 provenance cases, existing quick unit/scientific/API/historical cases and the
new persisted-job/both-suffix archive case. Ruff passes and mypy covers 199 source
files. Scientific theory independently inspects the changes and passes 32 cases.
Frontend: **500 tests in 72 files**, lint/types/build pass; 69 focused author
cases and 118 independently rerun UX cases pass. Earlier query-notification timing
and test-fixture typing diagnostics are corrected. [Final browser evidence](../assets/authoritative-minimization/c3-summary.json)
records **51 passes / one existing mobile desktop-zoom exclusion**, zero failures,
flakes, retries or global errors in 366.30 seconds. All **732 source identities**
remain fixed. This includes 12 new controls cases, 14 recovery cases and existing
quick/toolbar/real desktop 100–200% zoom regressions. The focused 12-case controls
rerun also passes. Primary visual inspection and UX reassessment PASS, with no
remaining consequential finding. Singular component copy is nonblocking C7 polish;
the final release gate and seven-role assessment remain pending.

The first new native diagnostic selected fixture atom3 (an existing hydrogen)
instead of a heavy atom for attached-H expansion. The corrected test uses actual
carbon1 and independently counts its canonical terminal H. The second diagnostic
clicked a point underneath the left mobile drawer, following a pattern suitable
for the right Inspector. Genuine Escape now closes the drawer with assertions
that minimization remains open. Neither correction changes runtime, reduces an
assertion, or increases timeouts. Expanded method details also receive both-theme
screenshots, bounds/overflow and scoped axe checks in the final rerun.

C4 scientific preparation identified a reproducible supplied-acid-H first-oxygen
interpretation defect. Its bounded correction/independent matrix belongs to C4,
before performance baseline/qualification and release. No product scope changes
or schema/dependency/app-version changes are introduced in C3.

### C4 — 2026-11-13: observed states and independent mixed-model qualification

The new 24-case state matrix reproduced **five failures / 19 passes** before the
bounded correction: acid H on first-named ASP/GLU O and three coherent alternate
supplied charge placements. Joint unknown-fact interpretation corrects these
without changing assigned orders/charges, existing H, coordinates or connectivity.
Contradictory assigned facts remain preserved and warned/repaired/refused under
the existing policy. No state enumeration, new residue aliases, pH prediction or
canonical repair is added.

Four independent mixed-model cases qualify actual moving MMFF/repair and MMFF/UFF
contributions, nonzero gradients/displacement, full-pair steric exclusions and
fresh native-field references. Central differences and exact cap coordinates have
independent expectations, not production-helper-derived expected outputs. Native
and surrogate units/tolerances are explicit. Two real worker/API cases extend
this to sparse IDs, active7/inactive conformers, exact fixed rows, literal graphs,
immutable current/original artifacts, allocation floors, a single command, exact
Undo/Redo, no repeated Apply and archive round-trip.

The final combined focused gate passes **160 Python cases in 18.35 seconds**,
global Ruff and strict mypy across 199 files. All **735 source identities** remain
fixed. Theory independently passes **96 cases in 6.17 seconds** and the complete
four-file change; additional supplied-charge probes pass. No consequential finding
remains. C3 frontend/static/build/browser evidence is reused: C4 changes only
temporary scientific interpretation and Python tests, with no UI/API-shape change.
No applicable prepared-engine code is changed; its full release regression remains
mandatory in C7/C8.

Deviation: use a meaningful **`fix(minimization)`** checkpoint commit instead of
the planned test-only type, because qualification exposed actual interpretation
defects within the approved correction scope. The optional third UFF/repair
profile is unnecessary: two required moving profiles plus C3's assignment matrix
cover the distinct branches. No essential outcome is deferred and no follow-up is
needed. App versions, quick implementation 1.0.3, dependencies, migrations and
canonical/project/archive/report contracts remain unchanged. Next: commit C4, then
measure C5 against this corrected baseline before changing discovery/index code.

### C5 — 2026-11-13: measured immutable assembly indexes

Corrected C4 `80adf97` was copied into an isolated implementation root; all 128 core
file identities match the committed source. Initial profiling identified repeated
protein bond scans and discovery as meaningful costs before changing them.
The final uniform sequential recipe uses the same permanent script, fixtures,
input/parameter/toolchain hashes, one cold and five warm samples per profile.

Exact count-only queries retain closed 6/7/8 angstrom membership. Immutable
assembly indexes preserve final interpreted/isolation graphs, closure order,
induced components and source row ordering. Source/classification mismatches reject
reuse; whole rebuilding replaces discovery/helper adjacency. Incident endpoint
keys read current interpreted bond orders. Independent/Apply calls remain fresh.
No global cache, approximation, dependency, schema or limit change is introduced.

The three timing-free scientific documents are **byte-identical**, including full
temporary models, fields/provenance, proposals, reports, geometry, objectives,
reported maximum gradients and termination. Small/pocket/18k work retains identical iterations/
evaluations (101/115 or 53/63), without cooperative-budget stops.

| Captured atoms | Corrected baseline warm median | Indexed warm median |
| --- | ---: | ---: |
| 18 | 13.793 ms | 13.749 ms |
| 2,304 | 590.656 ms | 414.043 ms |
| 18,208 | 861.735 ms | 569.399 ms |

These are local direct-plugin CPU measurements, excluding worker startup, DB/API,
browser and artifact-store publication. Small work is unchanged within noise;
no overall application speedup is claimed. Index retention raises whole-job tracked
peak memory (15.781→16.568 MB pocket; 72.167→78.221 MB 18k). A separate bounded
query witness retains 262,144 neighbors while reducing tracked query allocation
2,491,568→165,040 bytes. No whole-job memory reduction or strict host certification
is claimed. [Evidence](../assets/authoritative-minimization/c5-summary.json) and
[performance notes](../PERFORMANCE.md#issue-137-measured-quick-discovery-indexing)
retain exact recipes, ranges, cold stages, cProfile, memory and scientific documents.

Final focused qualification: **178 combined Python passes in 19.27 seconds**, then
**19 discovery cases in 0.16 seconds**, covering 179 unique cases. One additional
ARG interpreted-order readthrough test landed after the combined run; no runtime
or benchmark source changed, and both scientific reviewers explicitly reconfirmed
the delta. Global Ruff/mypy (199 files) and final-file Ruff pass. Native small/
pocket/18k publication, live preview/Cancel, canonical graphs, quick controls and
real zoom pass **17 cases / five existing mobile layout exclusions**, zero failures,
flakes/retries/global errors in 146.36 seconds. Final 737 source identities match.
Unchanged frontend/static/build evidence from C3 remains applicable.

Scientific implementation independently passes 73 cases plus 60 additional oracle
comparisons and the final ARG case; theory passes 87 cases and the final ARG case.
Both verify scientific-document byte equality and the measured source identities.
No consequential finding remains; final all-seven review is C7 work. Next: commit
C5, then the approved bounded C6 API helper extraction. No essential outcome or
performance qualification policy is reduced.


### C6 — Shared publication boundaries

Based on C5 `07421849338a9a143c7de609bd2989781c0ddab9`, extract six small
functions for project/entry lookup, verified artifact reads, normalized-source
parsing, pre-read publication locking and pure coordinate replacement. Quick
minimization no longer inherits prepared-service private helpers. The legacy
namespace aliases the same module. Scientific acceptance, dependencies,
annotations, warnings, provenance, history and artifact publication stay separate.
Error mappings, caller transaction ownership and the strict >1e-9 angstrom
component displacement rule are unchanged. See D-153 and architecture notes.

[Retained evidence](../assets/authoritative-minimization/c6-summary.json): **87
Python passes, no skips, 140.25 seconds**, global Ruff and mypy (201 files).
**37 native passes / one existing mobile desktop-zoom exclusion**, zero failures,
flakes, retries or global errors in 280.16 seconds, exercise quick/prepared
publication, preview/Cancel, exact Undo/Redo and ambiguous-response recovery in
both layouts. All **741 source identities** remain exact. Unchanged frontend
sources reuse C3 lint/types/500 tests/build; complete C7/C8 gates remain mandatory.

Architecture independently inspects all six files and hashes and passes 27 tests,
including independent concurrent Apply requests with exactly one successful
publication, one conflict and one history/revision increment. Parent full-diff
review finds no consequential issue or scope expansion. No migration, schema,
dependency, app version or scientific policy changes. Next: commit C6, then C7
actual-reader qualification, five-version release preparation, complete gate and
all-seven final-candidate assessment. No feature completion/readiness to push is
claimed yet.


### C7 preparation and delivery clarification

C6 committed as `013ab2a`. A fresh fetch finds origin/master unchanged at the
approved base `5f6a2b869d9f8a32a1f921eccb6863c3148188e6`; stable v0.28.1 remains
latest and the proposed v0.29.0 reference is absent. Actual previous-runtime source
is a detached worktree at tagged `d7ea8e91b6ba4ecf0298f4bd92ffea69b44100c2`.
All five app versions are being prepared consistently at 0.29.0; dependency versions
stay fixed. Minor remains appropriate for additive controls/diagnostics and new
import behavior without incompatible schemas, APIs or archive conversion. Final
remote checks, gate/readers and all-seven review remain required.

The latest explicit `/goal` requires a PR with `Closes #137`. That instruction
supersedes the original plan's post-publication closure timing; no acceptance
criterion is removed. The final issue response still follows verified release.
C7 also includes the previously recorded nonblocking singular-component copy fix.

C7 preflight is recorded in [evidence](../assets/authoritative-minimization/c7-preflight-summary.json).
All four actual reader phases and both disposable migrations pass using the final
439-line harness. Current readers refuse a real unapplied old1.0.2 proposal before
archive import, without writes; old readers preserve new fields/graphs through
both suffixes and re-export. Twelve module roots and actual versions are asserted.
A harness-only stale project/job-link snapshot was corrected before the final
preflight; failed diagnostics are separate. The existing archive suite passes43
cases and TypeScript/scoped Ruff pass.

Primary full-diff review additionally reproduced boolean metadata-version
coercion inconsistent with viewer validation (red:1 failure/16 passes). Reject that
malformed value before literal coercion;53 focused metadata/import/quick cases
pass. Normal numeric-version fixtures and measured C5 algorithms are unaffected.
The release gate repeats everything on the frozen candidate. Prepared30-step
candidate and exact-master recipes are committed before execution, with locked
installs, migration round trip, all real native workflows, actual reader families,
all source/tool identities and the exact 75 existing browser exclusions. No new
exclusion or scientific/resource-limit relaxation is permitted. Next: clean
release-preparation commit, complete gate, integrated review and all-seven verdicts.


#### C7 full-gate diagnostic and fresh qualification

The first clean candidate `07d18d6` stops at Python:1350 passes/131 failures,
with no later step executed.130 are recipe isolation errors (canonical DATA_DIR
beats migration tests' legacy override); an independent same-node environment
red/green proves this without changing migration assertions. The remaining
release fixture expects prior17-bond default import instead of approved940.
Scientific review independently confirms17 explicit plus923 inferred connections,
unchanged supplied atoms/conformers/bonds and exact provenance/warnings. Retain
default inference and strengthen the release expectation accordingly.

[Retained diagnostic](../assets/authoritative-minimization/c7-candidate1-diagnostic.json)
and full failed logs remain separate. Focused migration/release/import correction
suite passes 155 in 37.71 seconds, zero skips. No application code changes follow.
Use legacy DATA_DIR for pytest and clear inherited canonical/legacy DATA_DIR and
DATABASE_URL before explicit recipe settings to preserve disposable-store isolation.
The invalidated unusedmerged1 recipe is not executed. Commit corrections and both
freshcandidate2/merged2 recipes, then rerun all 30 steps from a clean candidate;
no partial passing attempt is reused. Seven preliminary specialist assessments
report no consequential application finding but all final verdicts remain pending.


#### Subsequent user correction — shortcut notification UX

During candidate2 browser qualification the user reproduced a Ctrl+M notification
that concatenates per-residue scientific warnings/UUIDs into a viewport-height
text wall with an unreachable Close control. The user additionally rejects that
bulk message as too long/cryptic to be meaningful. This explicit guidance extends
the approved outcome: remove successful shortcut scientific-warning popups rather
than summarize their warning count into another popup. Retain the existing short
publication confirmation, full stored report/proposal warnings, model assumptions/
effective-field provenance, applied entry warning details/badge and Jobs inspection. Refused/failed scientific reports use controlled
plain review text; prerequisite/API failures retain actionable diagnostics in the
bounded notice. Never conflate publication
uncertainty with a confirmed failure. Add no new progress/results surface.

Bound the shared notice to the viewport, wrap long tokens and scroll only its
message body; keep Close outside that scroll area and reachable in narrow/short
viewports. Preserve live-region, focus and expiration behavior. UI/UX/theory
reviews support this approach without changing science or acceptance policies.
Candidate2 is intentionally interrupted (browser exit 130); its1481 Python,
500 frontend and 14 supervisor passes are partial evidence only, not a complete
release gate.78 browser passes/3 exclusions/1 interruption/400 unrun cases are
retained separately. New focused regressions and an entire fresh candidate3 gate
will qualify the correction before final seven-role review and remote delivery.


UX correction review rejects generic pre-job wording that directs users to a fresh
setup which clears its prior error. Preserve existing prerequisite/API error
messages and their diagnostics; the viewport-bound notice makes them reachable.
Only stored refused/failed scientific reports use the short Jobs review message.
No retained-error/setup lifecycle is added; no follow-up issue is needed.


The notice correction is focused-qualified: **503 frontend tests**, lint/types/
build, and **14 native passes, zero skips/failures/flakes/retries/global errors**.
A real warned calculation remains quiet and retains full entry/job/report warnings,
originals, graph, charges and one exact Undo/Redo command. Generic notice native6
qualifies both themes, touch/wheel/keyboard reading,320×180/320×568/1280×900,
reachable Close and unchanged lifetime/focus/project state. Independent UI review
finds inherited scroll on replacement; reset only for a new notice identity,
retain reading on resize/theme/unrelated renders, and independently reproduce the
corrected 500→500→500→0 behavior with focus preserved.92 independent UI tests and
UX correction assessment pass. No consequential correction finding remains.

[Notice evidence](../assets/authoritative-minimization/c7-notice-summary.json)
records 759 source identities, exact commands/environments, lossless hashes,
synthetic-only fixtures and explicit earlier diagnostic limitations. Prepared
candidate3/master3 recipes replace the interrupted/unused candidate2/master2
cohort; no partial command counts as final evidence. Commit the passing correction,
then run all 30 steps and final all-seven review before readiness to push.


#### C7 complete-gate pointer finding

Candidate3's full native run identifies a real UI regression after155 passes:
short passive import-notice text captures pointer input over Close viewer controls,
so the unchanged hardening workflow reaches its120s timeout.4 actual exclusions
and326 unrun cases are not complete coverage; the extra reporter error is merely
maximum-failure stopping. The [retained diagnostic](../assets/authoritative-minimization/c7-candidate3-diagnostic.json)
records cause and exact evidence without a passing-gate claim.

Restore pointer pass-through for ordinary short text; enable pointer input only
for measured overflowing text. Preserve interactive Close and all long reading,
focus, identity and lifetime behavior. New native overlap tests exercise ordinary
clicks without hiding the still-visible notice; the original failing hardening
test is unchanged and passes. No forced clicks, extra exclusions, timeout/resource
changes, scientific edits or relaxed assertions are accepted.503 complete frontend
cases,11 notice cases, static/build checks and15 native cases / one existing
mobile performance exclusion pass. Independent UI actual-component probes and92
cases reconfirm the correction.759 source identities match the focused candidate.

[Focused pointer evidence](../assets/authoritative-minimization/c7-pointer-summary.json)
includes exact structured commands/environments. Commit the coherent passing fix
and fresh candidate4/master4 recipes, then repeat all30 steps and final same-candidate
seven-role review. Source/core/API contracts and planned stable minor0.29.0 remain.

### C7 — Complete clean candidate qualification

Candidate `5b14fff1f333f49c0c90e25256de2bd778eb8b28` passes the entire fresh
30-step recipe, with no reuse of earlier partial attempts. The verified
[summary](../assets/authoritative-minimization/c7-candidate4-summary.json) records
**1,481 Python (zero skips), 503 frontend, 14 supervisor and 413 browser passes /
75 unchanged existing exclusions**. There are zero failures, flakes, automatic
retries or new exclusions. Every lossless log hash verifies; all 759 current and
720 actual tagged 0.28.1 source identities remain unchanged. Sequential command
duration is 4,562.346 seconds; elapsed wall time is 4,564 seconds. The profile is
portable correctness, with no strict reference-host timing claim.

Frozen installs, disposable migration upgrade/downgrade/re-upgrade, Ruff, mypy
(201 files), lint/types/build, version/schema/dependency/license/production audits,
legacy CLI and both actual-reader families pass. Separate old/current processes
qualify both directions and both archive suffixes, preserving original/artifact
bytes, current inferred/deleted graphs, exclusions, results and supported history/
scene/surface state. A real old unapplied proposal remains inspectable but refuses
Apply without writes. Data retention does not qualify old-code authoring or new
jobs under an old worker. Archives remain snapshots without portable Undo.

Primary local complete-diff review inspects the full intended C1–C7 change and new
files, including corrected metadata validation, supplied-state interpretation,
source/native row permutation mapping, publication ownership/locks/guards, source
index lifetime and the user-requested notice correction. Resolved findings and
limitations are retained in the evidence index. Optional larger disclosure touch
targets are deferred polish without a new issue. Performance guidance now states
that source indexes scale with captured scene size; the 20,000 limit bounds the
local model, and existing job RSS/deadline guards remain unchanged.

No runtime source changes follow the passing gate. Final seven-role assessments
must cover the integrated candidate and documentation before readiness to push.
Next: record those verdicts, then normal PR/review/merge and the complete C8 gate
on exact merged master before tagging, release publication, issue reply and cleanup.
