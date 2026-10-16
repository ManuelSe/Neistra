# Issue #74 — Direct molecular modeling

## Status and metadata

Approved by the user's “Implement the plan.” on 2026-10-16 after the complete
proposal and four confirmed product choices. C0 and C1 are complete; C2 direct editing is next. This document is the implementation
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
