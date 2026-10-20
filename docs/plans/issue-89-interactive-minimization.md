# Issue #89 — Interactive, environment-aware minimization

## 1. Approval record and requirement disposition

**Status:** released as stable [v0.21.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.21.0) through [PR#103](https://github.com/ManuelSe/Neistra/pull/103).
**Approval:** implementation authorized 2026-10-20 by “Implement the plan.”
**Issue:** [#89](https://github.com/ManuelSe/Neistra/issues/89).
**Plan path:** `docs/plans/issue-89-interactive-minimization.md`.
**Base:** `master`, `f12dd18377c8410976381f4b96ad81c198e921e0` at approval.
**Feature branch:** `feat/issue-89-interactive-minimization`.

**Approved outcome:** select exact atoms, invoke Minimize or Ctrl+M, automatically
capture their supported molecular environment, watch transient relaxation, then
accept or discard. Acceptance remains explicit and produces one reversible edit.

Authority: user guidance; repository instructions and accepted decisions; existing
architecture/product boundaries; issue outcomes; issue implementation suggestions.
Append decisions superseding relevant defaults in D-109–111; preserve their history.

Confirmed product decisions:

- **Conservative parameter reuse:** regenerate geometry-dependent ligand charges
  when their input geometry changes.
- **Warned acceptance:** permit eligible nonconverged results through explicit
  acknowledgement, retaining a convergence-only option.

Inspection covered required project documents, minimization/editing domain code,
worker supervision, APIs, frontend ownership/viewer previews, migrations, archives,
tests, related issues, Git history, version sources and repository settings.

Approval baseline:

- Clean master; no issue89 branch or plan existed.
- Thirty focused preflight/failure-report/capture tests passed.
- In-memory reproduction confirms preflight catches its own identity refusal and
  incorrectly reports malformed metadata. The originally reported input was
  unavailable; its complete failure sequence has not been reproduced.
- Stable releases exist through v0.20.0, contrary to the brief's history premise.
- Normal merge commits preserve checkpoints. No Actions workflows/master protection
  were found; recheck before delivery.
- Exact-selection minimization, native boundary terms, atomic Apply and Undo/Redo
  already provide the foundation.

| Requirement | Disposition | Treatment / follow-up |
| --- | --- | --- |
| Exact selected atoms move; all other atoms including H fixed | Already satisfied | Preserve; regress live display and automatic context. |
| Whole/partial/scientifically valid multi-entry selections | Already satisfied | Retain bounded canonical membership and active conformers. |
| Complete bonded boundaries, exclusions and scaled1–4 terms | Already satisfied | Retain qualified complete model; verify cached/uncached equivalence. |
| Automatic nearby context across entries/visibility | Essential | Backend discovery/capture; complete chains/components, no cropped shells. |
| Explicit isolation/manual environment | Supporting | Retain advanced controls and explicit API semantics. |
| Refuse unsupported required context, no silent omissions | Essential | Identify components and preparation requirements. |
| Optional movable-selection expansion | Optional | Existing explicit selection tools suffice; no new tool/follow-up. |
| Live intermediate Mol* coordinates | Essential | Latest-snapshot delivery and actual coordinate previews. |
| Transient frames/immediate Cancel/stale-state protection | Essential | No frame events/project/archive state; generation/dependency guards. |
| Final Accept/Discard and one atomic Undo/Redo edit | Already satisfied | Extend existing publication safeguards. |
| Receptor/ligand/assembled-model caching | Supporting | Bounded validated caches with dependency keys/provenance. |
| Reuse after selection/coordinate changes | Supporting | Only where parameter dependencies remain valid. |
| Blanket reuse after changed AM1-BCC geometry | Rejected as proposed | Conflicts with confirmed conservative policy; no fixed-charge-session follow-up. |
| Cold/warm/first-visible benchmarks | Essential | Separate preparation/optimization/delivery/rendering measurements. |
| Eliminate fixed-only energy work | Deferred | Profile; create follow-up only for material cost and an equivalence-preserving approach. |
| OpenFF/Sage/NAGL/Interchange feasibility | Supporting | Document compatibility/coverage/dependencies/gaps; retain AMBER. |
| Production OpenFF transition/experimental head-to-head qualification | Deferred | One focused follow-up before implementation PR; no new force-field dependency. |
| Virtual-memory and misleading identity failures | Essential | Supervised resident-memory accounting; exception/provenance fixes. |
| Actionable preparation/metadata/resource/numerical diagnostics | Essential | Typed diagnostics with available entry/residue/atom refs and exceptions. |
| Useful nonconverged acceptance | Supporting | Explicit acknowledged restricted eligibility; strict option retained. |
| Scientific/concurrency/cancel/persistence/compatibility tests | Essential | Milestone/release gates. |
| Separate PR per suggested stage | Rejected as proposed | One branch, coherent checkpoint commits and implementation PR; no follow-up. |
| Docking/implicit repair/arbitrary metals-adducts/proprietary reproduction/general framework | Deferred / excluded | Preserve boundaries; adduct follow-up #86, no duplicate umbrella issue. |

No unresolved product decision remains. Editing redesign #92 and toolbar
unification #93 remain separate.

## 2. Implementation contract

### Automatic context and scientific boundaries

- Minimize/Ctrl+M immediately submit automatic mode with exact canonical selection
  and current active conformers; retain typing/composition/modal/repeat/busy guards.
- Mandatory closure includes complete bonded components/protein chains. Discover
  additional components within12Å of complete selected components using canonical
  active coordinates. Nonrecursive, independent of visibility.
- Include complete discovered chains/organics/supported waters. Discover before
  qualification so unsupported nearby material cannot disappear through filtering.
- Keep2000 movable/20000 calculation atoms/100 included entries. Refuse limits,
  never truncate membership.
- Show context/counts/conformers/limits without second confirmation for automatic
  mode. Advanced controls retain isolation/manual membership.
- Report no-additional-context resolution explicitly. Unsupported discovered context
  blocks calculation; never silently falls back to isolation.
- Recheck automatic membership before acceptance against proposed final positions
  and current structures. Newly relevant omitted context requires rerun.
- Retain amber-local-v1 ff14SB/GAFF1.81-AM1-BCC/qualifiedTIP3P and existing nonbonded
  settings. No implicit H/protonation/repair/caps/cross-entry covalent topology.

### Public interfaces and compatibility

- Extend submission with explicit mode automatic and acceptance policy. Keep omitted
  mode isolated and existing explicit context/conformer semantics.
- Server owns automatic context/conformer capture; reject conflicting manual input.
- Dedicated project/job latest-frame read endpoint returns job/capture identity,
  monotonic sequence/status/selected rows with Cache-Control:no-store.
- Apply gains explicit nonconvergence acknowledgement bound to proposal digest.
- Version2 calculation contracts where required, preserving version1 decoding and
  historical inspection. Increment plugin implementation, not physical model ID.
- No DB migration/new history action/structural schema change: Alembic0014,
  project-viewer-archive2, normalized-selection1.
- Archives retain final inputs/parameters/reports/proposals/application provenance;
  exclude frames/caches. Imported proposals stay historical.

### Live execution and acceptance

- Publish accepted optimizer iterates, never last line-search trials. Validate finite
  coordinates/exact selected mapping before publication.
- Atomic latest snapshot in existing private job work directory; max1MiB, max5Hz,
  no trajectory. Poll every200ms while owning a running session.
- Renderer has one active update plus newest pending frame. Reuse transform coordinate
  patches; canonical/query state unchanged. Pause dependent measurements/surfaces.
- Cancel immediately clears preview and requests cancellation. Discard/panel-close
  restores canonical geometry and cancels if running.
- Project/tool changes invalidate session; late frames cannot revive it. Reload
  restores canonical geometry; Jobs retains final inspection, no live recovery.
- Short runs may finish without intermediate display; never manufacture animation.
- Converged acceptance retains qualified gradient threshold.
- Nonconverged acceptance only for ordinary iteration-limit termination, finite final
  energy/forces, objective decrease beyond numerical tolerance, exact fixed rows and
  chemistry, valid mapping/stereo, no newly introduced severe nonbonded overlap under
  existing disclosed0.6Å criterion.
- Cancel/resource/timeout/abnormal/validation failures never yield acceptable partials.
- Interactive “Accept unconverged coordinates” requires acknowledgement and shows
  residual gradient; advanced convergence-only mode disables it. Outcome stays honest.

### Reliability and caching

- Fix exception handling masking missing identity as malformed metadata.
- Audit atom-generation/element replacement. Record known authored identity at source,
  preserve protected facts, recover legacy evidence only by strict D-107 original-file
  matching. Unknown stays unknown.
- Distinguish missing chemistry, missing/conflicting/malformed identity, unsupported
  parameters, allocation/budget/numerical failures; retain internal tracebacks.
- Remove minimization4GiB RLIMIT_AS; optional supervised process-tree RSS policy with
  default4GiB resident budget, operator configuration, sampled enforcement/tree kill.
  Other plugins retain address-space semantics. Document sampled versus hard OS limits.
- Worker-managed parameter cache under data directory: default2GiB disk budget,
  bounded entries, atomic publish, cancellation-aware contention/disposable staging.
- Cache protein/template contributions, valid ligand parameters and assembled systems.
  Keys cover ordered chemistry/mapping/protonation/charges and inputs/settings/toolchain/
  components. Selection not a dependency; geometry-independent protein coordinates not
  a dependency; AM1-BCC ligand input geometry is.
- Verify mappings/digests/settings/finite parameters on reuse. Corruption is explained
  miss; no pickle/client filesystem paths. Each job retains complete independent model
  artifacts, cache origin and charge-generation geometry identity. Deleting cache cannot
  affect projects/completed jobs.

Retain qualified AMBER. OpenFF combination/charge behavior and NAGL's domain require
separate pinned experimental qualification, not unmeasured substitution:
[Interchange](https://docs.openforcefield.org/projects/interchange/en/stable/using/edges.html),
[NAGL model card](https://github.com/openforcefield/openff-nagl-models/blob/main/docs/models/openff-gnn-am1bcc-1.0.0/index.md).

## 3. Milestones and checkpoints

Every checkpoint records exact commands/results/limitations/diff review here and
concise PROGRESS. Append material decisions. At each milestone run relevant Python/
frontend lint/type/tests/build, native focused browser workflows and diff checks;
fix consequential failures before committing. All commits reference #89.

### M1/C1 — Reliable native execution and diagnostics

- Outcome/areas: worker supervision, identity validation/editing provenance give correct
  outcomes without address-space failure.
- Acceptance: prepared inputs run; memory exhaustion/descendant cleanup controlled;
  missing/malformed/conflicting identity distinguishable; new ordinary atoms have
  evidence without erasing protected facts.
- Focus: `.venv/bin/uv run pytest tests/unit/minimization tests/integration/test_minimization_jobs.py tests/integration/test_job_lifecycle.py`,
  relevant editing/protection tests and native selection-minimization browser smoke.
- Docs: RSS config/diagnostics/recovery and decisions; no migration.
- Commit: `fix(minimization): correct native resource and identity failures`.
- Compatibility/rollback: other plugin policies/version1 inspection retained; no downgrade.

### M2/C2 — Automatic selection-preserving context

- Outcome/areas: canonical discovery/capture, submission API and quick-start UI.
- Acceptance: same/separate/hidden context agrees; full chains; unsupported/oversize
  refusal; manual/isolation controls; changed/newly relevant context blocks acceptance.
- Focus: `.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization_context.py tests/integration/test_minimization_jobs.py tests/integration/test_minimization_apply.py`,
  Ctrl+M/partial/manual browser workflows.
- Docs: automatic membership/conformers, bounded D-109 supersession, calculation contracts;
  no structural migration.
- Commit: `feat(minimization): capture automatic molecular context`.
- Compatibility/rollback: legacy explicit request semantics and existing history unchanged.

### M3/C3 — Validated parameter reuse

- Outcome/areas: preparation/optimization separated by managed component/system cache.
- Acceptance: selection reruns skip native preparation; protein coordinate reuse valid;
  changed ligand geometry misses; chemistry/settings/tools invalidation; safe concurrent/
  cancelled/corrupt cache; native energies/gradients/mapping equivalent.
- Focus: `.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization.py tests/scientific/test_minimization_context.py tests/integration/test_minimization_performance.py`,
  new focused cache integration cases and native equivalence checks.
- Docs: keys/geometry restrictions/quotas/clear-bypass/provenance; no migration.
- Commit: `perf(minimization): reuse validated force-field preparation`.
- Compatibility/rollback: deleting/bypassing disposable cache restores cold preparation.

### M4/C4 — Bounded transient snapshot delivery

- Outcome/areas: optimizer accepted-iterate callback, private publisher, dedicated API.
- Acceptance: latest-only bounds; no frames in events/artifacts; mapping/sequence checks;
  cancel/completion/restart/partial-write handling; no rejected trial publication.
- Focus: `.venv/bin/uv run pytest tests/unit/minimization tests/integration/test_minimization_jobs.py tests/integration/test_job_lifecycle.py`,
  new endpoint/stale-capture/lifecycle/event-volume cases.
- Docs: transient transport/lifecycle; no migration.
- Commit: `feat(minimization): publish transient optimization snapshots`.
- Compatibility/rollback: completed-result APIs/canonical state independent of snapshots.

### M4/C5 — Live viewer and warned acceptance

- Outcome/areas: App sessions, coordinate previews, panel and guarded Apply complete UX.
- Acceptance: only selected visibly move; exact fixed/inactive; Cancel/Discard no history;
  stale/concurrent guards; warned eligible acceptance one Undo/Redo; strict refusal.
- Focus: `.venv/bin/uv run pytest tests/integration/test_minimization_apply.py`,
  `corepack pnpm --dir apps/web test`,
  `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-minimization.spec.ts tests/e2e/minimization-accessibility.spec.ts tests/e2e/minimization-performance.spec.ts`.
- Docs: workflow/a11y/scientific limits, scoped D-110/111 changes; no migration/action.
- Commit: `feat(minimization): add live relaxation and explicit result acceptance`.
- Compatibility/rollback: existing publication/history; old nonconverged jobs gain no
  retrospective eligibility.

### M5/C6 — Qualification and release preparation

- Outcome/areas: scientific/compatibility/performance/release evidence, OpenFF decision.
- Acceptance: final-version gates; actual v0.20 reader retains data/archives; cache/live
  criteria below; consequential full-diff findings fixed.
- Focus: complete gate, native performance and current-producer/actual-reader harness.
- Docs: user/API/science/development/release/verification/progress; fresh0014 upgrade,
  no new downgrade migration needed.
- Commits: substantive test/docs changes, then `chore(release): prepare v0.21.0`;
  no empty milestone commits.
- Compatibility/rollback: qualify older retention/Undo, not older interactive API;
  complete managed-data backup for runtime rollback.

## 4. Verification and evidence

Locked AmberTools configured for API and worker; bounded native threads. Native
scientific skips block release. Scenarios:

- Partial ligand growth, selected/unselected H, whole ligand, multi-entry.
- Boundary bonded terms/pocket energy-forces/finite differences/stereo/unsupported chemistry.
- Hidden/separate context, inactive conformers, new omitted context/dependency changes.
- Accepted versus rejected iterates/coalescing/cancel races/tool-project changes/reload/
  worker loss/malformed frames.
- Strict/warned acceptance, abnormal refusal, concurrent Apply, retry after Undo, exact
  Undo/Redo, original files.
- Cache hit/miss/geometry/mapping/corruption/quota/contention/cancel.
- Save/reopen/archive/actual preceding-reader retention.

Performance uses prepared1STP and existing18208-atom manual capacity fixture.
Automatic discovery must omit distant translated chains; not a biological assembly.

- Existing cold limits:120s setup/60s optimization-publication/2GiB measured aggregate
  RSS/5s native cancellation.
- Warm compatible hits: zero native preparation calls; at least2x median preparation
  improvement across three cold/warm pairs on same machine.
- Coordinate-changing ligand reruns separately reported, no unsafe-charge hit claims.
- Available accepted iterate delivered/rendered within1s on qualification fixtures;
  Ctrl+M-to-first-visible measured separately including cold preparation.
- Preserve500ms restoration/750ms longest-task; desktop/mobile/320px/keyboard/focus/
  themes/zoom/scoped accessibility.

Complete gate (fresh disposable directory, native configuration inherited):

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-disposable-directory> .venv/bin/uv run alembic upgrade head
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

Retain exact commands/environment/toolchain/source hashes/exits/counts/timing/RSS/logs.
Separate exploratory failures from final passing evidence. Planning establishes only
30-test baseline and diagnostic reproduction, not implementation/release qualification.

## 5. Persistence, PR and release lifecycle

### Approval and plan-only checkpoint C0

Confirm clean tree; fetch; switch master/ff-only origin/master; recheck base/path/branch;
create feature branch; persist this as first/only change; commit exactly
`docs(plan): add approved plan for issue 89`; push if available and verify remote.
Report path/branch/commit/milestones/minor impact. Implementation follows only explicit
authorization; “Implement the plan” supplies it on2026-10-20.

This detailed contract is source of truth. Each log entry records checkpoint/commit/
outcome/exact evidence/decisions-deviations/limits/blockers/next action. Keep global
PLAN intact and PROGRESS concise.

### Version and PR

Stable0.21.0 / annotated v0.21.0, recheck collisions. Minor adds auto context/live/
acceptance capabilities beyond patch fixes; no major because explicit requests and
persisted formats stay supported; no prerelease after complete native qualification.
Use actual stable0.x history, not issue label/history premise.

Five authoritative versions:

- pyproject.toml
- root molweave-dev package in uv.lock
- apps/web/package.json
- FastAPI version in apps/api/src/molweave_api/main.py
- APPLICATION_VERSION in apps/api/src/molweave_api/archive_service.py

PR `feat(minimization): add automatic context and live relaxation` targets master.
Normal merge preserves checkpoints. Before PR safely incorporate latest master,
recheck version, finalize release notes, full gate/full-diff review.

PR includes Closes #89, milestones/evidence/decisions/compatibility/simplifications/
follow-ups. Create focused OpenFF qualification follow-up before submission; reference
#86, no duplicates of92/93. Request @codex review when available, otherwise explicitly
document local self-review; address consequential findings/resolve conversations.

### Blockers

Failed required checks/native scientific skips/incomplete evidence; fixed/stereo/
mapping/dependency/archive/Undo regression; invalid reuse/silent omitted context or
fallback; unbounded data/failed cleanup/performance failures; unacknowledged unsafe
acceptance; version conflicts/unresolved review/unavailable required approval; new
material product/scientific decision. Recheck remote protections; never bypass.

### Publication and close-out

After authorized implementation merge: verify merge on origin/master; ff localmaster;
qualify exact merged candidate; annotate/push v0.21.0 on that commit; publish and
verify GitHub release. Notes cover highlights/fixes/scientific limits/APIs/data-
migrations/compatibility/verification/deferred-rejected/follow-ups. Reply to89 with
implementation/PR/release/evidence/compatibility/scope. Record publication evidence
through repository docs-audit convention. Delete feature branches only after remote
merge/tag/release/reply verification; finish clean master.

## Progress and completion log

- 2026-10-20 — Plan approved and implementation authorized. C0: master fast-forward
  checked at f12dd18377c8410976381f4b96ad81c198e921e0; clean tree; planned branch
  created. This document is its first change. Baseline30 tests passed during review.
  Implementation/qualification/publication remain pending. Next: commit/push C0,
  then M1/C1 under explicit implementation authorization.
- C0 committed/pushed as a00ca90b61ac0532a447e259f73053fbfd5f1a64; matching remote
  branch verified. No implementation was included in that commit.
- M1/C1 implementation: optional process-tree RSS policy, minimization AS-limit removal,
  specific identity/cause diagnostics and authored identity in selection/legacy/direct
  element paths. D-113 records the bounded decision. Initial210 focused tests and
  final125 editing/protection cases pass; broader final gate is in progress. No
  migration/schema/model/dependency/version change. Original failing user input is
  unavailable; do not claim its complete scenario reproduced. Next: final gates/review.
- M1/C1 final gate:306 Python,265 frontend,8 supervisor,2 native browser; no failures/
  retries/native skips. Ruff/mypy87/lint/type/build/fresh0014/diff pass. Exact commands
  and lossless logs: [c1-gate](../assets/interactive-minimization/c1-gate.json);
  [source identities](../assets/interactive-minimization/c1-source.json);
  [self-review](../assets/interactive-minimization/c1-review.md). C1 adds no structural
  migration/schema/dependency/version/model change. Archive round-trip and existing
  molecular history tests pass; actual preceding-reader qualification remains C6.
  No blocker. Next: commit C1, then C2 automatic discovery/capture/UI.
- M1/C1 committed as f9f4c6f. M2/C2 implements canonical nonrecursive12Å discovery,
  schema2 automatic capture with legacyv1 semantics, negative/final-position context
  validation, immediate toolbar/Ctrl+M and retained manual setup. D-114 records bounded
  supersession; global PLAN remains intact. Final206 Python/265 web/8 supervisor/
  19 native browser pass,3 intentional mobile layout skips; static/types/build,
  fresh0014 and unchanged prepared1STP/18k performance bounds pass. Evidence:
  [gate](../assets/interactive-minimization/c2-gate.json),
  [source](../assets/interactive-minimization/c2-source.json),
  [local review](../assets/interactive-minimization/c2-review.md). Initial fixture-order
  failure was corrected without product changes; Vite disconnect reset/bundle
  advisories retained. No migration/structural-schema/dependency/application-version/
  physical-model change. Actual previous-reader retention remains C6. No blocker.
  Next: coherent C2 commit, then C3 validated parameter reuse.
- M2/C2 committed/pushed as e2f8b009a94fb6b930449f01e0cb48bb1fb82b61. M3/C3
  implements bounded native file preparation caches, validated reconstruction,
  independent artifacts and conservative geometry-aware reuse (D-115). Gate:
  232 broad Python,9 final cache checks after bound review,1 paired native benchmark,
  265 web/8 supervisor/16 native browser pass,2 intentional mobile exclusions;
  static/build/fresh0014/existing performance bounds pass. Evidence:
  [gate](../assets/interactive-minimization/c3-gate.json),
  [paired timings](../assets/interactive-minimization/c3-cache-pairs.json),
  [source](../assets/interactive-minimization/c3-source.json),
  [self-review](../assets/interactive-minimization/c3-review.md). Median preparation
  5.468665s cold/0.385609s warm(14.1819x); compatible hits have zero native calls.
  This is not a changed-organic-geometry or live-visible claim. No structural
  migration/schema/dependency/application-version/physical-model change. No blocker.
  Next: commit C3, then C4 transient accepted-iterate snapshots.
- M3/C3 committed/pushed as 2f052c0. M4/C4:192 Python,265 web,8 supervisor,2 native
  browser pass; static/mypy90/build/fresh0014 pass. [Evidence](../assets/interactive-minimization/c4-gate.json)
  and [self-review](../assets/interactive-minimization/c4-review.md) retain scope/limits.
  D-116 defines transient accepted-iterate delivery and local process ownership. No
  structural migration/schema/dependency/application-version/model change. One doc
  EOF whitespace failure was corrected and diff check repeated. No blocker. Next C5.
- M4/C5 implementation in review: actual transform previews; render-local reads;
  immediate Cancel presentation; schema2 guarded warned acceptance with legacy strict
  default, explicit digest-bound acknowledgement and one Undo/Redo. D-117 records
  ownership/eligibility. Preliminary expanded-selection timings required investigation; retained exploratory
  logs and focused follow-up [#100](https://github.com/ManuelSe/Neistra/issues/100). Planned bounds
  remain unchanged; running transport also qualifies30 selected protein heavy atoms.
  Required separate OpenFF experimental follow-up created as
  [#101](https://github.com/ManuelSe/Neistra/issues/101), production AMBER unchanged.
  Investigation correction: actual full heavy selection is1166, not the earlier901
  estimate. Excessive full-coordinate test readback distorted latency; bounded status
  and exact in-browser fixed-row checks correct it. Mol* auto-quality also overrode
  intended low cue detail; explicit custom quality fixes that native upload cost.
  Focused18k/1166-heavy-atom native bounds now pass. #100 is addressed on this branch,
  pending complete qualification/merge. Final C5 gate/evidence and actual older-reader
  release qualification remain pending.
- M4/C5 passes:260 Python (identical Python hashes after frontend-only fixes),273 web,
  8 supervisor,25 native browser /7 intentional mobile exclusions; static/mypy90/
  types/build/fresh0014/diff pass. [Gate](../assets/interactive-minimization/c5-gate.json),
  [source](../assets/interactive-minimization/c5-source.json),
  [self-review](../assets/interactive-minimization/c5-review.md),
  [18k timings](../assets/interactive-minimization/c5-performance-18k.json),
  [partial live](../assets/interactive-minimization/c5-live-partial.json) and
  [1166-heavy live](../assets/interactive-minimization/c5-live-whole.json) retain exact
  evidence. Earlier901 counts were estimates; corrected bounded readback, cue quality,
  duplicate-packet suppression and abortable GPU readiness address the investigation
  recorded in#100. Thresholds unchanged. No structural schema/migration/dependency/
  application-version/model change. No external blocker. Next: C5 commit, then required
  C6 legacy recovery/qualification/release work; do not claim issue89 complete yet.

- M4/C5 committed/pushed as02ee835d668b8dec2da5e8227e4ed3a93aa37953. C6 review
  adds required strict legacy recovery (D-118), checksum/pointer Apply dependency,
  unchanged canonical metadata, protected/unknown refusal and shared edit recovery.
  Focused45 cases pass. Actual tagged0.20 API/core reads four current-producer
  automatic/active7/multi-entry/warned/recovered cases, retains canonical/history/
  originals/jobs/models/parameters and archives exactly. Final0.21 producer must
  repeat this qualification after version preparation. Fixed-only profiling and
  OpenFF feasibility are qualification tasks, with no production model substitution.
  Complete checkpoint/release evidence remains pending.
- C6 qualification checkpoint passes282 Python,273 frontend,8 supervisor,21 native
  browser /3 intentional mobile timing exclusions; Ruff/mypy91/lint/types/build/
  fresh0014/diff pass with unchanged runtime/test source hashes. [Gate](../assets/interactive-minimization/c6-checkpoint-gate.json),
  [source](../assets/interactive-minimization/c6-checkpoint-source.json),
  [self-review](../assets/interactive-minimization/c6-review.md). Warned controls pass
  at320px in both themes with scoped accessibility checks. Fixed-only reference
  cost is material; focused#102 created/verified for equivalence-preserving omission,
  with no production term change. OpenFF assessment retains AMBER and defers actual
  alternative-model experiment to#101. Raw C5 long records compressed losslessly
  with uncompressed digests; no evidence discarded. Earlier recovery fixture/static
  and profiling setup failures were corrected before this passing checkpoint.
  No structural migration/model/dependency/application-version change yet. Next:
  commit checkpoint, bump five versions0.21.0, complete clean candidate release gate.

- C6 checkpoint committed asb1b7ba2. Refetched origin/master remainsf12dd18; merge
  incorporates no additional changes. Stable latestv0.20.0, v0.21.0 absent remotely.
  Prepared all five authoritative application versions0.21.0 and release notes.
  Minor impact follows additive automatic/live/warned capabilities with unchanged
  structural data/archive/API defaults, rather than issue labels. Stable history
  already exists, so no speculative initial major/prerelease. No dependency update.
  Next: complete clean candidate gate and final-version actual0.20 reader, then PR.

- Release preparation committed/pushed as5546e5fd0b650909ff57dd7735bc363c94e7de2b.
  Initial complete gate caught the existing archive fixture's hard-coded0.20.0
  current-version assertion (25 cases). Updated assertion to0.21.0 and added0.20
  historical archive coverage; all30 archive cases pass. This is a test fixture
  correction, no runtime/archive acceptance change. The first full run is diagnostic
  only; preserve its failures and repeat the complete clean candidate gate.

- Corrected candidate1095f99 passes1102 Python/273 frontend/8 supervisor/static/
  build/fresh0014. Browser attempt2 interrupted for Chromium page-fixture startup
  failures, also reproduced independently of Neistra with GPU kernel DRM waiting.
  Isolation smoke passes; host restart clears the standard SwiftShader startup
  failure. No application, assertion or launch-configuration change. Incomplete
  attempts do not qualify release. Retained attempt2 exact logs/source; attempt1
  temporary full logs lost on restart (stale version assertion/fix is recorded).
  Next: repeat clean complete candidate gate and final producer/actual0.20 reader
  using persistent task tooling/data as needed. No current infrastructure blocker.

- Current-host attempt3 passes1102 Python/273 frontend/8 supervisor/static/build,
  61 browser cases and3 intentional exclusions before interruption. The one failure
  was the new warned320px test dereferencing a null bounding box during responsive
  dialog remount, not failed acceptance or missing UI. Enter narrow layout before
  computation and poll the unchanged exact bounds. Both desktop/mobile warned
  cases now pass (both themes/scoped axe/exact Undo/Redo), lint/types/diff pass.
  Existing responsive-remount/actual-zoom tests remain separate and passed. Runtime
  code/assertion bounds unchanged; attempt3 source-unchanged flag is false because
  the failing test was corrected before interrupting that diagnostic run. Exact
  logs/native timings and failure snapshot retained; full trace stored in task
  evidence for publication. Next: commit test fix, clean complete candidate rerun.

- M5/C6 final clean candidate13e8b45aa04b9f022f409869ad4d80410f48c0d2 passes all16
  commands:1102 Python,273 frontend,8 supervisor,268 browser/52 intentional layout/
  timing exclusions; zero failures/retries/native scientific skips. Frozen/fresh0014/
  static/build/diff pass. Final0.21 producer and actual tagged0.20 API/core retain
  four automatic/active7/multi-entry/warned/recovered cases exactly. [Gate](../assets/interactive-minimization/c6-candidate-gate.json),
  [summary](../assets/interactive-minimization/c6-candidate-summary.json),
  [source](../assets/interactive-minimization/c6-candidate-source.json),
  [review](../assets/interactive-minimization/c6-review.md). Runtime/test/tool SHA256
  a2c05ac9d9d77896c34decd0cac42c0c0668d4674936c0f3946aa007ee21e27c.
  All raw log digests/current source identities verified. D-119 records qualified
  AMBER retention and separate#101/#102 work. Candidate preparation4.803/.350s,
  13.72x;18k20.5ms preview/249ms restore/233ms longest; live30/1166-heavy bounds
  pass. No universal changed-geometry speed claim. Base remainsf12dd18, lateststable
  v0.20.0 and v0.21.0 absent on recheck. Only docs/evidence change after this tested
  source. Next: evidence commit/PR/review, normal merge and exact-master gate before
  publication. No external blocker; issue is not complete until release/close-out.

- Delivery: PR#103 normal-merged as1024f46531a73f58c15d14b19dd86b923563176b,
  verified onorigin/master and localmaster fast-forwarded. Codex request received
  no acknowledgement/independent review; implementer self-review is explicit, with
  no unresolved finding or required check/review/protection bypass. Complete clean
  exact merged-master gate repeats all16 commands/counts:1102 Python/273 frontend/
  8 supervisor/268 browser,52 intentional exclusions, zero failures/retries/native
  scientific skips; final0.21 producer/actual0.20 reader four cases pass. Candidate
  and merged runtime/test/tool source hashes are identical. [Merged gate](../assets/interactive-minimization/c6-merged-gate.json),
  [summary](../assets/interactive-minimization/c6-merged-summary.json).
- Publication verified: annotatedv0.21.0 object78e2c2618e015907cba547bf50bcb823216dc102
  targets exact verified runtime1024f46531a73f58c15d14b19dd86b923563176b. Stable
  GitHub release418334494 is public, not draft/prerelease; notes and asset digest
  verify remotely. Public downloaded ZIP SHA256
  1724fd721542ae773ac724aa3f17396c8f34679d93cac1afac3a47289ef72867, CRC/255
  internal hashes pass, including four public compatibility archives. [Publication](../assets/interactive-minimization/c6-publication.json).
- Issue89 closed by runtime PR and [close-out reply](https://github.com/ManuelSe/Neistra/issues/89#issuecomment-6290103509)
  body verified. #100 is closed; #101/#102 remain deliberate separate qualification.
  No approved-scope implementation remains. This docs-only publication snapshot
  follows the repository audit convention; runtime tag stays fixed. Actual final
  docs integration and delayed remote/local branch cleanup are recorded at the
  linked reply after those events, avoiding self-referential predicted Git facts.
  Next product work requires a separate approved plan.
