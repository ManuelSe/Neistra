# Geometry-aware hydrogen completion — issue #77

Status: approved; C0–C3 complete; C4/C5 release workflow pending.
Issue: https://github.com/ManuelSe/Neistra/issues/77
Approval: user's “Implement the plan”, 2026-10-17.
Base: origin/master, 88a2a9d8909ab1ff06f025a29ec56132b063eb5a.
Branch: feat/issue-77-geometry-aware-hydrogens.
Workflow reference: issue #74 (the user's corrected reference).

## Problem and approved outcome

The v0.17.0 optional completion path rejects incomplete stereo annotations before
reconciling hydrogen representation. Equivalent branches can therefore appear
stereogenic only because one branch lacks explicit H. A molecular draft must
remain editable without passing a preparation gate. Deliver bounded, deterministic,
geometry-aware automatic completion and explicit Add N H tools, independently of
file format, navigation category and covalent component boundaries. Retain original
uploads, existing coordinates/H/identities, reversible commands and native archives.

## Authority and assumptions

User guidance and corrections take precedence, followed by AGENTS.md and accepted
decisions, architecture/product boundaries, issue outcomes, then issue suggestions.
This approved plan is the implementation contract; docs/PLAN.md remains global.
The normalized model is authoritative. Viewer-inferred bonds are not chemistry.
Geometry is authoritative for current stereo in this workflow, with warnings for
conflicting annotations; original source facts are immutable. Missing information
must not be represented as known neutral/complete chemistry. Necessary dependency
imports and technical identifiers are permitted; new product prose, issue and PR
must not name other molecular software. Do not rewrite historical decisions.

## Requirement disposition

| Requirement | Disposition | Reason / follow-up |
|---|---|---|
| Remove preparation eligibility from ordinary H building | Essential | Reproduced user blocker |
| Local automatic H counts and geometry-aware placement | Essential | Meaningful completion without whole-entry preparation |
| Explicit count/geometry controls and preview | Essential | User approved draft-building operation |
| Selection and explicit entry scope | Essential | User confirmed both |
| Independent partial results with diagnostics | Essential | Remote uncertainty must not block supported sites |
| Preserve existing coordinates/H/source/IDs/history/references | Essential | Existing model contract |
| All conformers, inherited alternate/residue identity | Essential | Never copy active coordinates into other conformers |
| Geometry-first affected current stereo reconciliation | Essential | User confirmed policy; never imply preparation |
| Shared typed service and preview ownership | Supporting | Reuse existing command/rendering interfaces |
| Capacity budgets, diagnostics caps and index reuse | Supporting | Bounded synchronous work on growing models |
| Molecular-model intent and qualification documentation | Essential | Distinguish draft from prepared/analysable/exportable state |
| Original uploads, revision guards, generic history | Already satisfied | Reuse and qualify existing contracts |
| Unknown charge/orders in automatic inference | Rejected as proposed | Do not invent missing chemistry; explicit Add N remains usable |
| Whole-component sanitization/stereo gate for completion | Rejected as proposed | Unrelated uncertainty and representation-sensitive refusal; replace within this scope |
| Remove/reposition existing H automatically | Rejected as proposed | Adds only; explicit deletion remains available |
| Persistent count/geometry constraints | Deferred | User chose operation-only settings; separate design if requested |
| Full protonation prediction, preparation, optimization | Deferred | Distinct scientific intent, tracked by #12/#11 where relevant |
| Broader fragments/elements/ring fusion | Deferred | #71; no additional scope here |
| New chemistry engine/plugin architecture | Rejected as proposed | Focused service boundary is sufficient; no follow-up needed |
| New schema/migration or persistent preview | Rejected as proposed | Existing records/history suffice |
| Automatic arbitrary aromatic/resonance repair or capping | Rejected as proposed | Cannot justify invented context; report skipped sites |
| Further product decisions | None outstanding | Count, scopes, partial policy and stereo policy explicitly approved |

No duplicate follow-up issue is required for rejected implementation strategies.
Create a narrowly justified follow-up only if qualification reveals a distinct
valuable gap; link it in PR/release/issue close-out.

## Accepted scope and non-goals

A focused typed domain service owns snapshot/target validation, counts, candidate
positions per conformer, per-site validation, stereo reconciliation and a proposal
with additions, permitted annotation updates, diagnostics and provenance. It owns
no persistence, viewer, project history or durable identity allocation. Publication
uses existing allocation floors and one generic command. Reuse generated atom,
residue/alternate inheritance, warnings, geometry/radius utilities and native ghost
rendering; extract shared helpers only where needed.

Automatic initial profile: neutral C; N 0/+1; O 0/-1/+1; neutral divalent S;
neutral F/Cl/Br/I. Other states skip with a specific reason. Require target known
charge and sufficient authoritative incident bonds. Count cross-component bonds.
Local aliphatic counts do not sanitize the whole entry. Broader perception requires
complete sufficiently specified bounded contexts: do not cut/cap arbitrary
aromatic/resonance context. Unresolved sites skip, supported independent sites apply.
Post-edit completion targets changed/new heavy atoms and immediate authoritative
neighbors. Explicit H deletion continues to skip automatic post-edit completion;
standalone completion may restore H when explicitly requested.

Selection scope targets heavy atoms; a terminal selected H maps unambiguously to
its heavy parent. Entry scope requires an explicit entry, never a first-entry
fallback. Preserve every existing H and coordinate. A site's additions are atomic
across conformers: failure in one skips that site in every conformer. Optional
completion failure must retain the direct edit.

Explicit Add N H requires exactly one heavy parent; count 1..4 (default 1),
geometry linear/trigonal_planar/tetrahedral (visible default tetrahedral),
orientation 0..5 deterministic alternatives. Choices apply only to this operation
and its history/provenance. Use ideal coordination fits with proper rotations,
shared radius/frame helpers and deterministic ties. No random placement, parent
embedding or minimization. Warn about angle mismatch, clashes, approximate bond
lengths and underdetermined orientation. Insufficient free geometry positions
means no change with a diagnostic. Ordinary Add atom H remains available. Explicit
placement may use unknown charge/orders without assigning values to retained data.

Assess stereo after consistent H representation in an analysis copy. Absent tags
are not a blanket refusal. Preserve physical orientation; re-express or clear
only affected incompatible current annotations, warn, and preserve disconnected
annotations/source facts. Conformer disagreement must not choose one universal
tag. A genuinely new configuration undetermined by retained geometry skips in
automatic mode; explicit preview allows the user to choose. Stereo inference is
not a preparation certificate. Standalone zero-H operations are diagnostic-only,
without annotation-only publication.

Fixed internal budgets: 4096 target sites, 4096 new H, 16384 generated H coordinate
rows across conformers, 1024 atoms per broader analysis context, 16384 total context
atoms per request, 200 detailed diagnostics with complete reason counts and an
explicit truncation indicator. Stable site-ID order and whole-site budget skipping;
no silent truncation. Preserve entry hard limit. Request-scoped atom/adjacency
indexes, reuse contexts and at most one spatial index per conformer. No whole
protein conversion, quadratic scans, persistent cross-request cache or automatic
job switching in this release.

## API and UI

Extend model-edits and its preview with:
- hydrogens.complete, scope selection|entry (default selection).
- hydrogens.add, count 1..4, geometry linear|trigonal_planar|tetrahedral,
  orientation 0..5.

Use existing revision/artifact/entry/canonical-selection guards. Explicit H actions
require hydrogen_policy preserve, avoiding recursive completion. Ordinary direct
optional policy remains. Add a model response subtype with applied:boolean and
optional hydrogen_report. Report status complete|partial|unchanged|unresolved,
target/completed/unchanged/skipped/unprocessed/added-H counts and bounded diagnostics
with canonical atom IDs, stable reasons and relevant conformer IDs. Preview returns
the same report with noncanonical ghosts; Apply recomputes, never trusts submitted
candidate coordinates. A standalone no-op/unresolved request returns applied=false
without revision, dirty, artifact, history, redo, counters or persisted warnings
changes. Preserve legacy HTTP semantics.

Existing Edit panel gains Hydrogen tools disclosure, scope, explicit count/geometry,
shared compact preview/inspection bar and concise partial summary with expandable
diagnostics. Standalone operations preview before Apply. Route general inspector H
building controls through the same workflow; preparation/optimization stay distinct.
Notices/cache updates respect applied=false. Preserve project-visit, selection,
revision, artifact, input, policy, movement, remount, refetch and camera/focus guards.

## Milestones and checkpoints

Every checkpoint updates this evidence log and concise docs/PROGRESS.md, appends
material decisions, reviews the diff for scope/dead code/science/migrations and
regressions, then commits only a coherent passing state. No empty milestone commits.

### C0 — approved plan

Outcome: issue, clean current base, feature branch, this contract as first change.
Validation: remote issue readback, clean base and branch/commit readback.
Commit: docs(plan): add approved plan for issue 77. Push and verify remote branch.
No runtime/version/migration change.

### C1 — automatic vertical slice

Outcome: typed bounded proposal service, local counts/placement, optional direct
integration, affected stereo/provenance, report and molecular-intent documentation.
Areas: core editing, model API response, domain/API tests, docs.
Acceptance: reported representation case, genuine tetrahedral/E/Z cases, remote
uncertainty isolation, exact retained coordinates and single-command Undo.
Focused: tests/unit/editing/test_hydrogen_completion.py,
tests/scientific/test_hydrogen_completion.py, tests/integration/test_hydrogen_completion.py.
Run shared checkpoint gate below and focused native direct-modeling/H-membership.
Commit: feat(modeling): add local geometry-aware hydrogen completion.
No migration; legacy helper eligibility is unchanged. Revert service integration
without stripping model state; generic existing history retains additions.

### C2 — standalone controls

Outcome: standalone complete/Add N APIs, previews, scope controls, partial/no-op
reports, all-conformer placement and native UI. Areas: core/API/web/viewer tests/docs.
Acceptance: explicit entry ownership, exact counts/geometry, unknown-state explicit
placement, preview purity/stale rejection, no-op invariants and one-command Apply.
Focused: C1 tests, web tests matching hydrogen, native hydrogen-completion.spec.ts.
Run shared gate and existing focused direct-modeling/H-membership native specs.
Commit: feat(modeling): add hydrogen completion controls.
Additive API; client/server upgrade together. No persisted preview/preferences.

### C3 — qualification

Outcome: robust scientific/capacity/lifecycle and actual preceding-reader evidence,
complete molecular-intent/user/developer documentation. Areas: tests/docs/helpers.
Acceptance matrix below, fresh migration/guard checks, real100/200% browser zoom.
Focused: hydrogen tests plus existing modeling/protein/ligand/transforms/interactions/
surfaces/navigation/archive tests and actual tagged v0.17.0 reader commands.
Run shared gate and broaden native qualification. Commit:
test(modeling): qualify hydrogen workflows and molecular intent.
No new schema; document old-runtime authoring limitations, do not imply equivalent UI.

### C4 — release candidate

Fetch latest master, incorporate safely, re-evaluate next version/tag collision,
update all five authoritative sources, release notes and compatibility docs.
Commit: chore(release): prepare v0.18.0. Run complete documented release gate on
clean candidate, full-diff local review, fix consequential findings and rerun affected
checks; runtime fixes require repeat qualification. Commit substantive evidence docs.

### C5 — delivery

Push, open reviewed PR, normal merge preserving checkpoints after all gates and
protections, verify exact merged master and repeat full gate. Tag/release only
verified exact tested master. Publish evidence/notes, final issue reply, documentation
integration PR if needed, verify and delete feature branch only after completion.
No bypass of unavailable required human review. Record exact blocker if any.

## Acceptance matrix and verification

Synthetic fixtures only; do not publish user projects. Qualify mixed explicit-H
representation, real tetrahedral/E/Z/conflicting/degenerate/new configuration,
sparse/reordered IDs, profile charge/amide/aromatic/unknown/unsupported chemistry,
covalent complexes/disconnected/orphan/exclusions/remote-invalid atoms, explicit
count/geometry/clash/insufficient-position/no-op cases, conformers/alternates/site
atomicity, preview purity/ownership/stale/locks/refetch, allocation floors/recreation/
history/redo/references/scenes/surfaces/archive/originals, request budgets and native
picking/H visibility/interactions/measurements/320px/themes/keyboard/touch/scoped
accessibility/real100and200% zoom. Retain legacy negative assertions unchanged.

Shared checkpoint gate (from repository root):
```bash
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```
Run focused native specs with the documented Playwright supervisor/environment and
fresh disposable data. Preserve exact commands, source commit, pass/fail/skip/retry
counts and limitations; failed diagnostics must not be presented as passing runs.

Complete release gate: README.md and docs/DEVELOPMENT.md frozen Python and frontend
installs, fresh0014 upgrade, Ruff/mypy/all Python tests, lint/types/all web tests,
eight supervisor checks, production build, full native suite, diff check plus the
three executable actual previous-reader qualification steps. Repeat on clean
candidate and exact merged master with fresh data and source hash. Preserve raw
logs/reports and downloadable ZIP evidence with checked hash/CRC/manifest.

## Model, compatibility and documentation implications

Create docs/MOLECULAR_MODEL.md: source facts vs current authored state; literal
drafts vs chemical projections; unknown null and absent H; explicit/inferred
provenance; geometry-first current stereo vs source intent; operation choices vs
persistent constraints; conformers/alternates; distinct preparation/analysis/export
requirements; structural integrity vs scientific plausibility; unsupported automatic
states and explicit controls. Update architecture/schema interpretation, editing,
API/scientific limits/verification/development and progress. Append D-105/D-106
(or next available) for service boundary and geometry/model intent; historical
accepted decisions remain intact.

No new migration/top-level schema: head0014, project/viewer/archive2,
normalized/selection1. Existing warnings, inferences and generic history suffice.
Actual tagged v0.17.0 reader in separate clean checkout/process must assert module
paths and qualify canonical data, annotations/inferences, original bytes, archives,
counters/history. Native archives preserve incomplete drafts; format export retains
existing loss/refusal semantics. Old runtime authoring may lack new behavior.
Fresh upgrade and existing guarded downgrade tests use disposable data only.

## Version, release and repository workflow

Planned stable minor0.18.0, tag v0.18.0. New public operations, controls and partial
completion behavior deliver user-visible functionality, rather than just correcting
a refusal. Persisted schema and existing HTTP compatibility do not warrant a major
increment. The bounded supported workflow is suitable for a stable release, not a
prerelease. Recheck latest tags/releases before finalizing. Authoritative files:
pyproject.toml, root molweave-dev package in uv.lock, apps/web/package.json,
apps/api/src/molweave_api/main.py and archive_service.py.

PR title: feat(modeling): add geometry-aware hydrogen completion.
PR against master, normal merge preserving meaningful checkpoints, Closes #77.
Include outcomes, milestones/decisions, deliberate simplifications/rejections,
migrations/compatibility/scientific limits/release impact, exact verification and
follow-up links. Request repository review integration when available; otherwise
record honest local full-diff review, never claim it independent. Inspect remote
review threads/checks and protections; address actionable findings and rerun checks.

Merge/release blockers: failing gates or consequential findings; stale ownership or
preview writes; lost coordinates/source/IDs/history; misleading scientific claims;
missing no-op/partial/conformer/reader evidence; incompatible unplanned schema;
version collision/inconsistent sources; unresolved required reviews/protections;
missing remote permissions or infrastructure. Never force-push/bypass protections.

After merge verify merge commit M on origin/master and fast-forward clean local
master. Complete exact-M gate, annotated tag on M, push/readback tag and peeled M,
stable latest release and remote notes/evidence verification. Notes cover highlights,
fixes, persisted-data/migrations, compatibility, verification, scientific limits,
deferred/rejected requests and follow-up work. Final issue reply links PR/release,
verification and compatibility plus choices/deferrals. Only then delete local/remote
feature branch. A final documentation-only integration PR may record publication
and branch-cleanup evidence; tag remains the exact tested source-equivalent M.
Verify default branch includes M, latest documentation, clean working tree and all
remote artifacts before claiming completion.

## Decisions, deviations and progress/evidence log

- 2026-10-17 C0: approved issue created and verified as #77; master clean and
  fast-forward current at88a2a9d; dedicated planned branch created. This document
  is the first branch change. No implementation started before approval.
- C1–C5: pending; record exact evidence and limitations as each checkpoint completes.

- 2026-10-17 C1 complete: typed additive proposal service, local canonical counts,
  ideal proper-rotation placement, bounded complete aromatic/stereo contexts,
  per-conformer site atomicity and geometry-first affected current annotations.
  Optional direct completion targets touched heavy sites and neighbors; failures
  retain direct edits and existing H. Additive model response exposes H report;
  legacy helper untouched. D-105/106 and MOLECULAR_MODEL document intent.
  [Passing evidence](../assets/hydrogen-modeling/c1-gate.json): Ruff, mypy69,
  711 Python, web lint/types/248tests/build, native14/14, diff check.
  Synthetic mixed-H false-centre, genuine tetrahedral/E/Z, partial unknowns,
  conformer translation/failure, exact originals/one-command Undo/Redo pass.
  Initial focused diagnostics (NONE/null normalization and a test using an invalid
  no-op trigger) were corrected, then the full passing gate ran. Local diff
  self-review checked identity/source/coordinate retention, bounded projections
  and eliminated repeated full-entry bond scans per chemical context.
  No migration, dependency or version change. C2–C5 remain pending.

- 2026-10-17 C2 complete: standalone selection/entry completion and explicit
  Add1..4 H/count/geometry/orientation actions share preview and existing atomic
  publication. Model responses expose applied and detailed partial/no-op reports.
  Zero-addition requests retain history/Redo/revision/dirty/counters/artifacts;
  explicit actions reject recursive policy. UI supports explicit entry ownership,
  compact ghost inspection, choices/diagnostics and no-op-aware feedback. General
  inspector Build H opens the same proposal. Removed the unused old UI eligibility
  helper; legacy HTTP behavior and protein preparation remain unchanged.
  [Passing evidence](../assets/hydrogen-modeling/c2-gate.json):714 Python,
  251 web, Ruff/mypy69/lint/types/build/diff,38 native with2 intentional layout
  skips, zero failures/retries. Native selection/camera/pending/project-visit/
  refetch ownership and old atom/bond/fragment/protein workflows pass.
  Initial assertion/preview-mode diagnostics are recorded separately from the
  fresh complete passing run. Local diff self-review checked additive API,
  identity allocation, preview purity, no-op paths and unused code. No migration,
  dependency or version change. C3–C5 remain pending.

- 2026-10-17 C3 complete:38 scientific qualification cases cover profiles,
  equivalent-H representations, genuine/conflicting/degenerate/virtual-H stereo,
  mirrored/translated/active conformers, sparse IDs, alternates, covalent ligand/
  unknown-protein boundaries, selected terminal H and free orphan H. Real budgets,
  attempted-site work, conformer atom visits, context closure, array/index reuse
  and shared high-degree neighbors are qualified. Shared public geometry helpers
  eliminate duplicate frame/radius implementations. API snapshots retain artifact/
  command/counter/no-op/Redo invariants and recreated-entry floors.
  [Passing C3 evidence](../assets/hydrogen-modeling/c3-gate.json):754 Python,
  252 web, Ruff/mypy70/lint/types/build/diff;20final native, plus broader16native/
  8intentional layout skips including actual100/200% zoom and archive/interaction
  lifecycles. Final native reran after scientific/optional-preview findings; initial
  runs and red regressions are diagnostic, not final gate evidence.
  Actual tagged0.17 reader in a clean separate checkout/process passes exact new
  H artifacts/annotations/inferences/all-conformer coordinates/originals/counters/
  generic Undo/Redo/save/archive/re-export, with rich existing jobs/scenes/surfaces.
  This producer is checkpoint0.17; final0.18 producer qualification remains C4/C5.
  Local full-diff self-review found/fixed temporary-H invented stereo on planar/
  collinear retained geometry, repeated scans, failed-site budget reuse, shared
  analysis budgeting and optional zero-H reports incorrectly disabling normal atom
  placement. Component/API/scientific/native regressions cover consequential fixes.
  Docs now explain model intent, operation/scientific/resource/compatibility limits.
  No new migration/dependency/schema. Existing migration upgrade/downgrade guards
  pass in the full Python gate; all data roots are disposable, not user projects.
  C4/C5 remain pending; no blocker or deferred-scope expansion.

- 2026-10-17 C4 release preparation: fetched origin/master/tags; base remains
  88a2a9d and merges without conflict. Remote latest is0.17.0; no0.18.0 tag/release
  collision. Master is unprotected, rulesets empty, normal merge allowed and
  automatic branch deletion disabled; recheck before merge. Five authoritative
  sources advance to0.18.0 without dependency updates. Archive producer expectation
  advances and the preceding0.17 provenance round-trip joins the existing matrix;
  actual preceding-reader qualification remains independent evidence.
  Frozen installs and focused archive validation run before the release-preparation
  commit; complete clean candidate gate and final review are next. No PR/merge/tag/
  release is claimed at this stage.
  Frozen Python/frontend installs pass; focused final-version archive matrix:
  `uv run pytest tests/integration/test_archive_roundtrip.py -q` →27 passed,
  including prior0.17 producer provenance. Ruff/mypy70/diff checks pass. No
  dependency lock drift beyond the root application version.
