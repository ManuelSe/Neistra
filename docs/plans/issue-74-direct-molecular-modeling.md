# Issue #74 — Direct molecular modeling

## Status and metadata

Approved by the user's “Implement the plan.” on 2026-10-16 after the complete
proposal and four confirmed product choices. C0–C4 and the C5 repair checkpoint are complete; the clean final candidate passes. PR review/merge and exact-master release delivery remain. This document is the implementation
contract. Historical checkpoint entries record their state at that time.

- Issue: [#74](https://github.com/ManuelSe/Neistra/issues/74).
- Base: master/origin/master `a0ad65b5509bef15935ff97f46633a2a45cd0602`.
- Branch: `feat/issue-74-direct-molecular-modeling`.
- Planned stable release: **0.17.0**, annotated `v0.17.0`, recheck before publication.
- PR title: `feat(modeling): support direct molecular building`.
- Merge: normal merge commit preserving passing checkpoints; `Closes #74`.
- Authority: explicit current user corrections; AGENTS and amended accepted
  decisions; repository architecture/product; issue brief. This supersedes #69's
  prepared-component restrictions for the new direct editor, without rewriting
  #69's historical plan or changing legacy API behavior.

## Problem, evidence and approved outcome

Paracetamol with three bonded H lacking residue membership appears as one ligand
plus three unclassified atoms. Selecting a different atom fails the whole-component
boundary check. A deterministic in-memory reproduction confirms it. Another probe
confirms normalized incomplete aromatic graphs serialize, but current viewer SDF
export fails aromatic normalization; a display-only non-kekulizing writer works.

Deliver direct editing of incomplete chemistry, including covalently connected
ligand/protein structures, and a New molecule workflow from the first atom. The
user explicitly chose direct edits by default, including new-molecule creation,
compact-panel building with previews, and bonds within one entry. Combining
separate entries and canvas drawing are excluded from this release.

## Requirement dispositions and scope

| Requirement | Disposition / approved treatment |
|---|---|
| Bonded orphan H must not block unrelated edits | Essential: repair generated membership and derive unambiguous historical H membership. |
| Edit incomplete chemistry independent of file format | Essential: direct normalized-record operations; unknown values stay unknown. |
| Covalent ligand/protein component boundaries | Essential within one entry: not an editing boundary. |
| Complete chemistry required before any edit | Rejected: helpers have per-operation prerequisites; direct edits enforce structural integrity. |
| Automatic H completion | Optional, off by default; failure warns and saves direct change alone. |
| New molecule from scratch | Essential: first-atom creation, attached atoms/fragments, preview and empty-entry rebuilding. |
| Compact panel instead of canvas drawing | Approved supporting interaction boundary. |
| Stable IDs, history, original bytes and exact unaffected data | Essential, reuse existing artifact/command/reconciliation infrastructure. |
| Multi-conformer and empty-entry persistence | Essential. |
| Separate-entry combining | Deferred by explicit choice; record separately if requested, not a hidden prerequisite. |
| Peptide growth, broad catalogue and ring fusion | Deferred to existing #70/#71; do not reintroduce. |
| Comprehensive preparation / CCD chemistry | Deferred to #12/#52, not prerequisites for direct edits. |
| Component naming/subset export | Existing #20/#21 remain separate. |

## Direct editing and scientific contract

Implement basic atom/bond changes directly against authoritative normalized
records. Whole-molecule RDKit sanitization is not a prerequisite. Allow:

- All recognized chemical elements through shortcuts plus searchable More elements.
- Absolute formal-charge assignment and clearing to unknown.
- Atom addition/deletion including H; exact selected deletion and incident bonds,
  without silently removing other H or re-saturating explicitly deleted H.
- Bonds between any distinct endpoints within one entry, including H, disconnected
  components and ligand/protein attachment atoms. Unknown/single/double/triple/
  aromatic order assignment; remove displayed inferred bonds as explicit intent.
- Incomplete/disconnected/over-valent/unresolved aromatic or stereo states.
- Multiple conformers and alternate-site-labelled atoms; literal canonical IDs
  resolve operands without choosing an alternate site automatically.

Direct element assignment preserves atom identity/coordinates, including H.
Fragment replacement consumes the terminal H identity and maps it to a new root.
Deleting the last atom leaves an editable empty entry. Preserve residue/chain
identity and source facts; do not reclassify a chemically modified protein as a
ligand. Unchanged records and coordinates remain exact.

Enforce valid references, unique monotonically allocated atom/bond IDs, supported
assignment element identifiers, finite generated coordinates, aligned conformer
arrays, locks, expected revision/artifact, captured owners and existing resource
limits. The 256-heavy-atom helper bound is not a direct-edit restriction. Avoid
whole-protein RDKit conversion and N-by-N distance matrices.

Unknown source charges/orders never become neutral/single in authoritative data.
Invalidate stale computed descriptors, retaining immutable original/source facts
with warnings. Preserve unaffected stereo; clear affected annotations that can no
longer be justified and explain the loss. Report unusual valence, unresolved
aromaticity, clashes, long bonds and unvalidated chemistry without certification.
Coordinate/H inference has explicit provenance; authored assignments are not
misrepresented as inferred chemistry.

Optional Complete hydrogens when possible is off by default. Attempt it in memory
following the direct operation. If prerequisites/generation fail, publish the
requested direct change alone with a clear warning, preserving existing H.
Explicit H deletion is never reversed by completion. Standalone H preparation,
cleanup/minimization and residue mutation retain operation-specific prerequisites,
without disabling unrelated controls or sanitizing a protein as a ligand.

## Hydrogen membership

Newly generated H inherit the explicit bonded parent's valid residue membership
across current generation paths. Attached new atoms/fragments inherit anchor
membership. For historical orphan H with one explicit heavy parent with valid
membership, derive navigation membership from that bond, retaining component IDs
and source hierarchy elsewhere. Ambiguity remains visibly unclassified/editable.
Do not rewrite artifacts on load or infer ownership from proximity. Any persisted
molecular changes remain normal reversible commands.

## UI, placement and asynchronous ownership

New molecule is available in the project browser and empty-project view. Ask name,
first element and charge, visibly defaulting to carbon/zero; create one atom at
origin, then focus/select it only under captured response ownership.

Extend the nonmodal Edit panel with Add atom, separate from element assignment;
attach to one selected atom, or explicitly choose an empty target entry for its
first atom. Never default to the first loaded entry. Support six existing fragments
on a selected heavy atom without requiring H, plus terminal-H replacement.

Preview proposed placement with Apply/Cancel, deterministic local direction
candidates and bounded fragment torsions, direction cycling and fragment rotation.
Reuse qualified templates and rigid transforms; never embed/minimize the parent.
Existing Transform remains available for positioning. Clashes warn rather than
block direct placement. Generate positions for each conformer without moving
retained atoms. Preview allocates no durable identity/artifact/command; selection,
project, artifact or input changes invalidate it. Ghosts cannot become canonical
operands. Preserve current project-visit/pending/focus/camera/read-retry guards.

## Architecture, API, rendering and data

Add typed /api/v1 endpoints:

- POST `/projects/{p}/molecules`: atomic entry plus first atom.
- POST `/projects/{p}/entries/{e}/model-edits`: expected revision/artifact,
  canonical operands and discriminated direct action, optional H policy.
- POST `/projects/{p}/entries/{e}/model-edits/preview`: same placement computation
  without publication/identity allocation.

Return project patches, reports, warnings and resulting selection. Reuse immutable
artifact publication and reference reconciliation; extract shared publication
rather than creating two commits for one operation. Route compact/manual inspector
atom/bond actions through the direct service; legacy API calls remain compatible.

Separate viewer projection from chemical export. Use a display-only non-kekulizing
ligand projection and an application-owned Mol* bond overlay for authoritative
changes/aromatic flags/unknown-order display, preserving native protein display
inference elsewhere. Persist authored inferred-bond removals in versioned
`neistra_modeling` metadata keyed by stable endpoint pairs. Adding a bond clears
its exclusion; deletion prunes references; Undo restores exact metadata. Prevent
renderer inference from resurrecting an explicit deletion after reload. Merely
viewing inferred connectivity does not assign authoritative chemistry.

No planned Alembic or top-level schema change (head0014; normalized/selection1,
project/viewer/archive2). Generated entries use existing nullable original/source
fields and explicit generated-source provenance; never fabricate an uploaded file.
Empty entries skip nonexistent viewer models but remain saveable/archiveable.

Native project/archive round-trips preserve draft values exactly. Chemical-format
exports explain representational loss or reject an unrepresentable output, never
silently repair. SMILES may require assigned valid chemistry. Existing successfully
loaded input formats remain editable; broadening malformed-file acceptance is not
part of this contract.

## Checkpoints and focused validation

Every checkpoint updates this log, concise PROGRESS, relevant documentation and
verification evidence; review the entire checkpoint diff before committing.
Application checkpoints also run Ruff, mypy, frontend lint/types/all frontend tests,
production build and relevant native workflows. Fix failures before proceeding.
Record actual commands/exits/source/environment/diagnostics and known limitations.

| Checkpoint | Outcome and acceptance | Focus / commit |
|---|---|---|
| C0 | Issue/clean dedicated branch/approved plan and architectural amendments, no runtime change. | Links/staged diff/remote verification; `docs(plan): add approved plan for issue 74`. |
| C1 | Reproduce orphan H; fix generated ownership and historical derived membership without rewrites, unrelated component identities stable. | Component/ligand/selection Python, hierarchy/membership frontend, native orphan H; `fix(editing): preserve bonded hydrogen membership`. |
| C2 | Direct compact atom/bond editing of incomplete molecules/covalent complexes; render drafts and retain explicit removals/unknowns/unaffected records. | New direct unit/scientific/API tests, panel tests, desktop/mobile aromatic-break/inferred-bond removal; `feat(editing): allow direct edits of incomplete structures`. |
| C3 | New molecule/first atom/attached atoms/fragments/optional H, pure preview/Cancel and empty rebuilding. | Creation/history, deterministic all-six-fragment placement, native creation/ownership/helper failures; `feat(modeling): add compact molecule building`. |
| C4 | Draft/generated/empty/multiconformer persistence, references and allocation; accessibility/performance and actual preceding reader. | Archive/history integration and broad native/scientific qualification; `test(modeling): qualify draft editing and persistence`. |
| C5 | Consistent versions, both complete gates, reviewed normal merge, verified tag/release/issue/docs/branch closeout. | Full release workflow; `chore(release): prepare v0.17.0`, substantive evidence/repair commits only. |

Focused C1 commands:

```bash
.venv/bin/uv run pytest tests/unit/test_components.py tests/unit/editing/test_ligand_editor.py tests/integration/test_selection_edits.py
corepack pnpm --dir apps/web test -- component
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/molecular-editing.spec.ts
```

C2/C3 add focused direct-modeling domain/scientific/API and molecule-creation tests,
plus `tests/e2e/direct-molecular-modeling.spec.ts`. C4 includes archive/security/
history and existing editing/movement/surface/navigation suites. Evidence records
exact final filenames/commands. Documentation-only changes use link/diff/source
checks, without claiming unrun application tests.

Required scenarios: orphan-H paracetamol (select ordinary and orphan atoms), raw
PDB/mmCIF/XYZ unknown chemistry, equivalent supported formats, ligand/protein
attachments, invalid valence/broken aromatics/unspecified stereo, disconnected/H-
free drafts, native inferred deletion/reload/Undo, multiconformers, empty project
creation/delete-last/rebuild, failed optional H preserving direct edit, stale/lock/
artifact/project/newer-selection/read-failure/remount ownership, both themes,
narrow layouts, keyboard/touch, real200% zoom and unchanged performance budgets.

Each checkpoint rolls back through normal history/artifact states or a reviewed
code revert; no data stripping or hidden migration. Chemistry-helper eligibility
and old-reader limitations must remain documented rather than weakening tests.

## Version, verification, release and closeout

0.16.0 -> **0.17.0 minor**: direct building and creation add substantial user-visible
capability beyond a patch. Existing API calls/projects and persisted schema shapes
remain supported, so no major increment is proposed; complete qualification is
required for stable publication. Recheck latest tag/version before preparation.

Update all five authoritative sources: pyproject.toml, root application in uv.lock,
apps/web/package.json, FastAPI application version and archive application version.
Do not alter unrelated dependency versions or historical fixture provenance.

Run on both clean candidate and exact merged master with dedicated disposable data:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-disposable-path> .venv/bin/uv run alembic upgrade head
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

Use documented isolated browser ports/data where needed and record actual values.
Qualify the actual tagged v0.16.0 reader for retained data/archive/generic history.
Its old renderer/helpers may reject new incomplete states; record expected negative
cases explicitly, never claim unrestricted runtime rollback or strip draft values.
New native round-tripping is mandatory; back up managed data before rollback.

Before PR: fetch/incorporate latest master safely, review complete diff, fix all
consequential findings, finalize versions/docs/release notes/evidence. PR includes
Closes #74, scope/decisions/migrations/science/compatibility/exact tests/deferrals.
Request @codex review where available; identify local self-review honestly if no
integration returns. Do not bypass protections/reviews/checks/conversations.

After eligible normal merge: verify remote SHA; switch/fast-forward master and run
exact-master gates; create annotated v0.17.0 on that exact verified commit; push,
publish stable release with highlights/fixes/compatibility/verification/limits and
deferred work; upload/download verification asset and verify hashes; post/verify
issue closeout; integrate final evidence/docs via normal PR if needed; only then
delete local/remote feature branch and verify clean master/remote state. Keep final
cleanup audit in the verified issue reply to avoid self-referential commit hashes.

Block merge/release on data loss, invented chemistry, disappearing drafts,
resurrected deleted bonds, ownership regressions, incomplete/failed gates,
unqualified compatibility claims or unmet repository protections. No new workflow,
plugin/job type or dependency upgrade is implied.

## Progress and evidence log

### C0 — 2026-10-16

- Read AGENTS, product/global plan/progress/accepted decisions and relevant
  verification/architecture/schema/editor/viewer/archive/release sources.
- User approved all scope choices and instructed full implementation/delivery.
- Created and remotely verified #74 before any repository mutation.
- Fetched origin; clean master fast-forwarded, unchanged at a0ad65b; created the
  planned feature branch. This plan is its first file change. No implementation
  or version change yet. No blocker. Next: validate/commit/push C0, then C1.


### C0 publication and C1 development — 2026-10-16

- Planning commit932cfb3e57f0b7b70c7d72704df999c6c8e26828 pushed; remote branch and
  all local Markdown links verified. [Issue plan link](https://github.com/ManuelSe/Neistra/issues/74#issuecomment-6222094384)
  posted and returned URL verified. Global PLAN and runtime/version files unchanged.
- Two regression tests fail on prior source: historical three-orphan-H membership
  yields four components, and generated H in a two-residue ligand lose their
  parent's residue. The ambiguous/unbonded negative case already passes.
- Implemented explicit-bond-only derived historical membership and per-parent
  generated-H ownership. Source artifacts remain exact; positive and ambiguous
  negatives pass. Synthetic paracetamol archive uses the normal import path and
  identifies its0.16.0 producer. No claim to reconstruct the user's exact file.
- Focused Python run passes66tests; full C1 static/frontend/build/native gate is
  still running. No release or complete direct-editing claim at this checkpoint.


### C1 complete — 2026-10-16

- [Final evidence](../assets/direct-modeling/c1-verification.json) binds final
  runtime/tests/fixture hashes to66Python/236frontend/20desktop-mobile native
  browser passes in2.5minutes, with no failures/flakes/retries; Ruff/mypy64,
  lint/types/build/diff pass. Exact argv/env/exits/timings and log hashes retained.
- Browser imports the synthetic archive through the public route, makes a native
  pick on an unrelated atom and confirms enabled controls, one complete ligand,
  three unchanged orphan source records, unchanged artifact/project revision.
  Component projection accepts ordinary and orphan-H operands in domain tests;
  multi-residue generation preserves each parent; ambiguous/unbonded H remain
  unclassified. Original prepared-complex fixture generation remains unchanged.
- First browser run19/20 passes; the new desktop observer queried before mount
  completion. Correct the harness by waiting for observation/camera settlement,
  then repeat the complete C1 gate with fresh dedicated data. Failed evidence is
  separately labelled c1-diagnostic-initial, never final qualification.
- Local self-review removed unrelated formatter edits, guarded invalid generated
  residue membership and reviewed linear bond-only ownership/no source rewrites.
  Both retained screenshots inspected; no independent review claimed.
- No migration/version/API or direct-chemistry policy change yet. No blocker.
  Commit/push passing C1, then implement C2's direct editor and draft rendering.


### C1 publication and C2 development — 2026-10-16

- C1 committed/pushed as d494149cdb8ec29c5ef93880ed567cddbc9df34b;
  remote branch SHA verified before C2.
- Direct normalized-record actions now share immutable publication with legacy
  selection edits. New HTTP model-edits endpoint preserves old endpoint behavior.
  Compact atoms/bonds use direct actions: nullable absolute charge, all recognized
  elements, literal H/last-atom deletion, unknown/aromatic assignment and explicit
  inferred-display bond removal. Helper eligibility explains only helper controls.
- Display-only non-kekulizing SDF and the native model decorator render incomplete
  drafts while retaining canonical unknown values and protein display inference.
  Authored exclusions survive reload; Undo restores exact graph/metadata.
- New domain/API cases and panel assertions preserve originals, unrelated records,
  source unknowns, reversible single-command history and structural refusals.
  Existing native H-to-C tests now assert retained identity/coordinates, as approved;
  the mixed helper/direct visit-ownership test observes both distinct API routes.
- Initial lint found an unsafe untyped array element in metadata validation; add an
  explicit unknown/number guard. Separately, first complete browser run23/24 passed;
  duplicate imported fixture names made mobile's project chooser ambiguous. Give
  each archived test project a unique name, keeping all native assertions. Both
  diagnostic runs remain separately labelled and do not qualify final source.
- No migration/version/release change. Fragment/creation/preview and advanced
  inspector direct-routing remain C3; full persistence/science/reader audit C4.

- C2 local self-review additionally reproduced a real successful H helper whose
  result exceeds the entry atom limit. Preserve the direct-only result when that
  optional candidate is too large; the new regression fails before and passes
  after this repair. Retain the earlier82-Python/238-frontend/24-browser passing
  gate as pre-review evidence and repeat the entire focused gate on final source.


### C2 complete — 2026-10-16

- [Final reviewed-source gate](../assets/direct-modeling/c2-verification.json)
  passes83Python,238frontend and24native desktop/mobile browser cases in2.7minutes,
  with zero failures/flakes/retries/skips. Ruff/mypy67, lint/types/build/diff pass;
  exact argv/env/exits/durations/source/log/report/screenshot checksums retained.
- Native checks break an aromatic ring without losing display/picking, remove an
  inferred protein edge across reload and restore it with exact Undo. Existing
  native atom/H/bond/fragment/residue, camera/remount/focus, themes/narrow axe and
  asynchronous project/selection/refetch/visit ownership regressions all pass.
- [Local self-review](../assets/direct-modeling/c2-local-review.md) is not independent.
  Real optional-helper resource-limit red/green regression is included. Earlier
  diagnostic and passing pre-review evidence remain distinctly labelled. Desktop/
  mobile aromatic screenshots inspected; no broader device certification claimed.
- Updated API, molecular-editing guide and append-only D101/103 implementation
  note. No migration/version change. C2 does not claim creation, direct fragments,
  placement previews, advanced-inspector routing, final compatibility or release.
  No blocker. Commit/push passing C2, then implement C3.


### C2 publication and C3 development — 2026-10-16

- C2 committed/pushed as4d192766cabec8fb3ee626dc3e9c476cb6a92bf2; remote SHA
  and clean tree verified before C3. Implemented generated first-atom creation,
  direct atom/six-fragment placement in all conformers and explicit empty rebuilding.
- Pure preview returns noncanonical string ghosts; native shape is nonpickable and
  separate from the molecular model map. Context/policy/input changes invalidate it;
  Cancel writes nothing. Apply recomputes under revision/artifact/owner guards.
- Advanced manual atom/bond controls share direct publication; explicit target
  selection replaces first-ligand fallback and unknown charges are no longer shown
  as a default zero. Legacy helper HTTP behavior remains unchanged.
- Local review limits successful optional completion to new H/bonds only, keeping
  direct records exact. Real helper success/resource failure, all-six fragment
  graphs/determinism/membership, multiconformer coordinates, creation/Undo/Redo,
  allocator branching, pure preview/refusals and generated empty archives pass.
- Initial new native run5/8: desktop preview count was observed before the canvas
  frame (wait for attachment), and two XYZ cases exposed existing invented neutral
  charges. New XYZ imports now preserve null charges/warnings and omit assumed
  canonical SMILES; saved historical records and original bytes remain exact.
  Both layouts then pass8/8. New dialog unit harness needed the same Tooltip provider
  as the application; all243 frontend tests pass after correction. Initial lint/
  type diagnostics remain separate. No migration/version change. Complete C3 gate
  is running; no release/full compatibility claim yet.


### C3 checkpoint complete — 2026-10-16

- [Final reviewed-source gate](../assets/direct-modeling/c3-verification.json)
  passes108Python,246frontend,31desktop/mobile native browser cases and3intentional
  layout skips in3.8minutes, no failures/flakes/retries.
  Ruff/mypy68/lint/types/build/diff pass. Exact source/command/env/log/report and
  screenshot hashes retained; earlier diagnostics/pre-review passes are distinct.
- New molecule, pure native ghost preview/Cancel, direction/rotation/Apply, literal
  delete-last/rebuild, unknown-chemistry attachment and failed optional H all pass.
  All six fragment graphs/membership/determinism and multiconformer new positions
  preserve retained records; generated/empty archives and allocator/history guards
  pass. Successful optional H merges only new H/bonds with exact direct records.
- Native advanced controls now qualify permissive triple-O draft/warning/exact Undo,
  followed by unchanged H/geometry/cleanup helper successes/refusals. Explicit target
  choice and theme lifecycle remain asserted. New remount-input, empty-target pending
  and cancelled delayed-preview regressions pass. Human-readable history labels.
- [Local self-review](../assets/direct-modeling/c3-local-review.md), not independent,
  records repairs and required C4 work. Desktop/mobile screenshots inspected: full
  tool controls can cover a mobile proposal at the default camera. C4 must provide
  compact inspection and qualify expanded forms/contrast/real zoom before release.
- API/guide/format matrix and append-only decisions describe generated provenance,
  literal direct actions, helper fallback and honest new XYZ unknown charges. No
  migration/version/release change. No external blocker. Commit/push C3, then C4
  scientific/persistence/reference/actual-reader/performance/accessibility gates.


### C3 publication and C4 qualification — 2026-10-16

- C3 de9877f86453fa23357378608091093767ebbc29 committed/pushed with remote SHA
  verified and clean tree. C4 addresses the required preview inspection gap with
  a bottom-docked compact bar, retained inputs/warnings and theme-adaptive ghosts.
- New scientific red/green cases cover remote bond-stereo dependencies, unknown
  attachment radii, extreme charges, typed export refusals and explicit unknown
  representation losses. MOL2 output follows authored elements, preserving source
  types as facts. Alternate-site additions inherit the actual anchor/H label.
- New integration cases cover all seven supported loaded formats, real conformers/
  alternate sites, rich reference reconciliation, pure preview DB counters and
  acknowledged chemical export. Initial683Python tests pass; native narrow/theme/
  expanded-form axe and actual100/200% zoom pass, plus delayed preview/closed
  creation ownership. These are diagnostic results, not the final source gate.
- The actual tagged v0.16.0 reader retains new direct data/history/archives and
  generated empty/multiconformer states. Its old broken-aromatic projection refuses
  as expected; no full runtime rollback claim. C5 repeats with final0.17 producer.
- Full-diff self-review reproduced sparse-ID multi-model mmCIF row collisions;
  six rows had five unique IDs. Fix serial stride without changing canonical IDs.
  Interrupt the incomplete pre-review gate and repeat all C4 commands on reviewed
  source; no interrupted run is represented as passing final qualification.
- No version/migration/dependency change. Final broad C4 gate is running.


### C4 additional review and restart — 2026-10-16

- Broad native run49passes found a real closed-launcher focus race across the
  actual200% responsive remount. Interrupt the remaining tests, retain the failed
  report/trace and reproduce in a component regression. Preserve focus only for
  the captured project visit; a newer external focus remains authoritative.
  Targeted broad zoom/placement then passes5cases/3intentional layout skips.
- Three real chemical exports of a literal H-free draft demonstrate implicit H
  interpretation on re-read. Require acknowledgement for MOL/SDF/SMILES while
  keeping canonical H deleted; native archives remain exact. Red/green evidence
  is retained. This is representation honesty, not forced chemistry completion.
- Final reviewed-source C4 rerun passes687Python/248frontend and all static/build
  checks; broad native and actual-reader commands remain running. No passing
  milestone/release claim is based on the interrupted run.


### C4 complete — 2026-10-16

- [Final reviewed-source gate](../assets/direct-modeling/c4-verification.json)
  passes687Python,248frontend,99native cases/13intentional layout skips in
  17.0minutes, zero failures/flakes/retries; Ruff/mypy68/lint/types/build/diff
  and actual clean tagged v0.16.0 reader pass. Exact commands/env/source/log/report/
  reader/profile/screenshot hashes retained. No migration or version change.
- All seven loaded formats remain directly editable. Real alternate sites and
  conformers retain every unaffected coordinate, including empty protein archives.
  Rich references/scenes/surfaces reconcile through deletion/H replacement and
  Undo/Redo. Pure previews leave DB artifacts/history/allocators unchanged.
- Scientific red/green cases cover remote bond stereo, unknown-radius fallback,
  extreme charge display, unknown mapping/typed export refusal, current MOL2 types,
  fixed-width PDB fields, sparse-ID mmCIF rows and implicit-H format interpretation.
  Literal H deletion remains exact; chemical export interpretation needs consent.
- Compact inspection exposes native nonpickable ghosts in both themes/320px and
  actual100/200% zoom, with scoped axe/44px/focus/hit checks. Fix reproduced closed-
  launcher responsive-focus loss without overriding newer external focus. Native
  delayed preview/closed creation guards pass. Earlier failures/interrupted runs
  remain diagnostic; [self-review](../assets/direct-modeling/c4-local-review.md) is
  not independent. Final mobile/200%zoom screenshots inspected in both themes.
- Native original/authored1STP movement retains unchanged budgets, with surface/
  navigation/pocket regressions. The25k parent test forbids whole-parent helper
  conversion; it is a scope test, not a throughput guarantee. Complete C5 repeats
  all existing capacity/interaction/performance suites on both final-version trees.
- Actual0.16.0 reader retains new direct canonical data, generic history, generated
  empty/multiconformer archives/re-export, originals/jobs/scenes/surfaces, while
  old broken-aromatic projection/helper refusals are expected and recorded. No
  unrestricted runtime rollback or data stripping. Repeat with final0.17 producer.
- C4 passing state ready to commit/push; next C5 versions/release notes/clean full
  candidate gate/full review/normal PR/merge/exact-master gate/tag/release/closeout.


### C4 publication and C5 preparation — 2026-10-16

- C4 committed/pushed as1500af0027bac4c1e72b20af26ddfa8d33166261; clean tree/remote branch verified before preparation.
  Fetch origin/master/tags and safely incorporate current basea0ad65b5509bef15935ff97f46633a2a45cd0602.
  No0.17.0 tag/release collision; preceding stable release remains0.16.0.
- Advance all five authoritative versions to0.17.0 without dependency changes.
  Stable minor adds direct building/creation; no top-level schema/database/API
  redesign requires a major. Honest chemical export refusal/loss acknowledgement
  corrects unrepresentable drafts without changing legacy helper edit contracts.
- README/user/API/schema/science/compatibility/release notes describe implemented
  scope and limits. No migration:0014; project/viewer/archive2, normalized/selection1.
  Complete clean final-version candidate gate and full-diff self-review are next;
  no PR/merge/tag/release claim yet. Exact-master qualification follows eligible
  normal merge, then annotated tag/release/evidence/issue/docs/branch closeout.


### C5 initial version guard diagnostic — 2026-10-16

- First unpublished release-preparation candidate passes frozen installs/fresh0014/
  Ruff/mypy, then21archive matrix cases fail only because their explicit producer
  guard still expects0.16.0. The other666Python cases pass. This failed gate is
  retained as c5-diagnostic-version evidence, never final release qualification.
- Update the guard to0.17.0 and add0.16.0 to the preceding-producer matrix without
  changing historical fixtures. Focused archive checks must pass before amending
  the unpublished release-preparation commit; no shared history/force push.
  Restart the entire clean final-version gate with fresh disposable data.

- Corrected focused archive suite passes26cases in12.31s; Ruff passes. Retain the
  explicit producer guard and every historical assertion, plus preceding0.16.0.
  Amend only the unpublished preparation commit, then rerun all release commands.


### C5 allocator review finding and repair — 2026-10-16

- Full-diff self-review reproduces ID reuse: addatom2, Undo Add, Undo New molecule,
  Redo New molecule, then another add allocates2again. Stop the candidate browser
  gate after71passes/3skips (one interrupted/203notrun), retaining it as diagnostic,
  not qualification. Five new API regressions fail on previous source.
- D-104 implements the approved stable-ID contract using bounded existing history
  fields, with no migration or chemical normalization. Direct and legacy cores read
  floors; publication advances past actual new IDs; committed creation snapshots
  retain floors across row recreation/branching. Preview/refusal counters stay exact.
- Focused76Python/mypy68/Ruff/type checks pass; native desktop/mobile Undo Creation/
  Redo/branch/new-atom picking passes2/2. Extend the actual preceding-reader harness
  to grow then empty a generated entry and assert recreated/archive counters exact.
- Run the coherent repair checkpoint's full Python/frontend/static/build/focused
  native/actual-reader gate, commit/push passing state, then restart the complete
  clean final0.17.0 release gate with fresh data. No PR/merge/tag/release yet.


### C5 allocator repair checkpoint complete — 2026-10-16

- [Source-bound repair gate](../assets/direct-modeling/c5-allocator-verification.json)
  passes693Python/248frontend/39native with7intentional skips, zero failures/flakes/
  retries; Ruff/mypy68/lint/types/build/diff and extended actual v0.16.0 reader pass.
  Reader retains produced allocator floors through grown/empty entry Undo/Redo and
  archive re-export. No migration/version/dependency change beyond prepared0.17.0.
- Five API cases fail before and pass after repair. Native desktop/mobile confirms
  a new atom is pickable with an ID above prior allocations after creation Undo/
  Redo and branching. Initial test harness read private counters from ProjectRead;
  use actual DB/archive values without weakening domain assertions. Earlier partial
  candidate and diagnostics remain distinct from this passing checkpoint.
- Reviewed only allocator-related service changes, removed unrelated formatter
  churn, retained chemical artifacts/other history values and pure preview/refusal
  counters. D-104 documents bounded known-path bookkeeping, not chemical validation.
  Local self-review is not independent. Commit/push repair, then run every clean
  final-version release command again with fresh data before opening the PR.


### C5 clean candidate complete — 2026-10-17

- [Complete candidate gate](../assets/direct-modeling/c5-candidate-gate.json) on
  `b3238c018649410a3bcc1efd2f45e11def61f0d8` passes all16commands in42.0minutes:693Python,
  248frontend,8supervisor,233native/47intentional skips, no failures/flakes/retries.
  Frozen installs/fresh0014/Ruff/mypy68/lint/types/build/diff and actual tagged
  v0.16.0 reader pass against final0.17.0 data, including allocator recreation.
  Fifteen native performance profiles retain unchanged budgets. Exact raw/retained
  log/source hashes and clean start/end proofs distinguish this final gate from
  earlier failed/interrupted diagnostics. No source change follows qualification.
- Fetched master/tags again; base remainsa0ad65b, normal incorporation is already
  current, and no0.17.0 tag/release collision exists. Five authoritative versions
  match0.17.0. [Local full-diff self-review](../assets/direct-modeling/c5-local-review.md)
  records resolved scientific/focus/allocator findings and is not independent.
- [Policy audit](../assets/direct-modeling/c5-candidate-policy.json): master is
  unprotected, rulesets empty, workflows0, normal merge allowed. Actual PR checks,
  review conversations and policy must be audited again before merge; no approval
  or protection bypass is authorized. Request @codex review on the PR.
- Finalize/commit this evidence and release notes as documentation only, preserving
  source equivalence to b3238c0. Next: push/open normal PR, review/eligible merge,
  verify remote master, run every exact-master release command, then tag/release/
  asset verification/issue response/final docs/branch cleanup. No publication yet.
