# Issue 147 — Structure editor reliability and selection-driven workflows

## Status and identity

- Status: **Authorized within agreed scope; not individually reviewed**.
- Repository: `ManuelSe/Neistra`; [issue #147](https://github.com/ManuelSe/Neistra/issues/147).
- Authority: the owner's explicit durable request to wait for full issue #145 delivery,
  then plan and deliver #147, including linked work that requires little additional
  implementation. Early answers accept all twelve findings and cyclopropyl,
  cyclobutyl, cyclopentyl, cyclohexyl and methoxy. A second answer chooses preservation
  of deliberately cut backbone connectivity during mutation, with a specific warning.
  The owner subsequently confirms autonomous delivery without another plan approval.
- Mode: plan and deliver through verified implementation, seven-role review, normal
  merge, exact-master qualification, annotated tag, release, issue reply and cleanup.
- Observed base: `master`, `2b5400deef2ab09850a9f677050b33fa2775bded`.
- Branch: `feat/issue-147-structure-editor-reliability`.
- Worktree: `/datadisk/dev/neistra-worktrees/issue-147`; preserve the owner's checkout.
- Plan: `docs/plans/issue-147-structure-editor-reliability.md`.
- Evidence refreshed 2026-11-15. Issue #145's final report and full remote delivery
  are verified; no #147 repository changes preceded that completion. No material
  scope question remains. Ordinary equivalent engineering choices are delegated.

## Problem, accepted outcome, and authority

The viewer toolbar's compact molecular editor must show the current immutable
structure, preserve authored chemistry through subsequent operations, communicate
warnings and operation state visibly, and provide coherent access to existing
geometry workflows. Passing isolated editing tests does not establish correctness
across history, delayed reads, multiple conformers or successive residue edits.

Keep normalized application state authoritative, immutable artifacts and original
uploads intact, stable identities and exact reversible molecular history. Preserve
deliberate incomplete drafts with precise diagnostics. A template mutation or
coordinate adjustment does not constitute comprehensive molecular preparation.

The product specification, global plan, accepted decisions, verification and
performance policies remain binding. All seven specialists contributed read-only
audit and planning assessments before this contract. Their final implementation
review is a separate requirement. Documented reference workflow research informs
compact controls, explicit targets, previews and progressive disclosure; repository
artifacts use neutral terminology and original controls/glyphs.

## Assumptions and exclusions

Use existing pinned scientific libraries, normalized schemas and artifact/history
publication. No dependency upgrade or database migration is anticipated. An optional
conditional structure-read parameter and required response identity are additive
API changes; deploy matching client/server versions. Older unqualified GET callers
retain current-structure reads. No persisted molecular/schema expansion is planned.

New bond-length/angle/stereochemistry authoring, ring fusion, arbitrary reusable
fragments, isotope/radical schema changes, chemistry assignment, comprehensive
protein preparation, rotamer search and terminal peptide growth remain separate.
Broader hydrogen chemistry is not required by the five fixed neutral C/O fragments.
Existing warnings, production deadlines, resource policies, scientific assertions,
registered test exclusions and portable/reference-host qualification remain binding.

## Requirement disposition

| Requirement | Classification | Accepted treatment and independent acceptance | Follow-up |
| --- | --- | --- | --- |
| F1: stale data cached under a different artifact | Essential | Conditional immutable projection reads, response identity and shared verified query options across every consumer; held-read/history/publication races | None |
| F2: mutation restores retained-atom cuts | Essential | Preserve retained bonds and exclusions; new-endpoint template edges plus the narrowly qualified new target PRO closure; specific cut/topology warnings | None |
| F3: mutation accepts incompatible backbone elements | Essential | Validate N/CA/C/existing O identities before computation/publication; atomic refusal with precise diagnostics | None |
| F4: inactive conformer diagnostics missing | Essential | Check affected bonds in every retained frame, identify conformer/bond/atoms, bound details with explicit truncation | None |
| F5: quadratic protein overlap validation | Essential | Exact bounded-memory nearest-neighbor existence test preserving active-frame all-pair strict 0.4 Å semantics; independent oracle and scaling evidence | None |
| F6: inline expensive backend computation | Essential | Immutable snapshot, bounded cancellable pure child, resource admission, fresh locked atomic publication and serviceability tests | None |
| F7: compact preview hides warnings/state | Essential | Visible preparing/ready/warning/partial indicator and one-action details before deliberate Apply | None |
| F8: successive mutation after Undo loses target | Essential | Explicit guarded Select whole residue recovery; preserve newer selections and exact molecular Undo | None |
| F9: chemistry/prerequisites concealed | Essential | Compact atom name/element/q including unknown, or residue/chain identity; actionable disabled reasons | None |
| F10: geometry/cleanup handoff loses target | Essential | Exact captured selection handoff to existing move/rotate, Quick/Advanced minimization and eligible bond torsion; opening never executes | None |
| F11: eye/H compound control overflows | Essential | Scoped contained compound control; real zoom, narrow and coarse-pointer hit-target verification | None |
| F12: Apply/failure recovery unclear | Essential | Visible Applying/error/recovery on active surface, owned operand, no blind uncertain replay or false cancellation | None |
| Five common neutral fragments | Supporting, expressly accepted | Qualify cyclopropyl/cyclobutyl/cyclopentyl/cyclohexyl/methoxy through the current builder, final automatic H reconciliation and all conformers | Partial #71; leave remaining scope open |
| Existing torsion correctness before exposure | Supporting prerequisite | Per-conformer axes, exact endpoints/fixed side/spectators, explicit graph-cut movable side, atomic invalid-frame refusal | None |
| Bond length/angle and new stereo authoring | Deferred | Substantially new fixed/moving-side and scientific contracts; current measurement/movement/torsion remain available | Search for equivalent issues; create bounded follow-ups only if absent |
| Ring fusion, arbitrary/custom fragment library and unrestricted elements | Deferred | Five fixed fragments only; no new fusion/connection method | #71 |
| Isotopes/radicals and wider H states | Deferred | Preserve current identity, uncertainty and H policy; no new canonical fields or chemical profile | #83, #114 |
| Explicit chemistry assignment/repair | Deferred | Retain diagnostics and supported existing methods; no guessed bond orders/protonation | #52 |
| Rotamer alternatives and comprehensive protein preparation | Deferred | No search, repair or preparation claim from side-chain templates | #12 |
| Peptide growth | Deferred | New terminal-building contract is separate | #70 |
| Element-aware nonbonded clash model | Deferred | Preserve existing overlap warning semantics; do not substitute a new physical model under a performance fix | #12 for preparation diagnostics; separate model issue if needed |

## Milestones and independently verifiable checkpoints

All Python commands below use the owned worktree's local `.venv`, created with the
frozen graph. Browser runs use dedicated disposable data and owned ports, recording
their overrides. Do not operate another session's stack. At each application
milestone run applicable Ruff/mypy, web lint/typecheck/tests/build and focused native
workflows; fix failures before the next milestone. Evidence records exact commands,
candidate/source identities, host/profile, results and limitations. Earlier audit
results are baseline evidence only.

### C0 — Authorized contract persistence

Persist this plan first, concise project progress and append-only D-158–D-161.
Check links, neutral naming, diff scope, unchanged runtime/global plan/versions and
clean base. Commit only these paths as
`docs(plan): add approved plan for issue 147`, push the dedicated branch and verify
the exact remote head. The retained commit convention does not claim individual
review. Continue implementation without another approval or C0 stop.

### C1 — Immutable structure projection identity

- Areas: structure-read API/schema, shared frontend query helper, every projection
  consumer, coordinate cache and affected request audits/interceptors.
- Add optional `expected_artifact_id`; mismatch returns 409 before capture. Capture
  one immutable artifact ID, read that artifact and return its ID even if current
  state changes during the read. Require/validate response entry and artifact IDs
  before query-cache insertion; propagate AbortSignal. No old-server fallback.
- Cover App loaders and bond preflight, viewer visible/hidden/surface reads, compact
  editor, inspector, hierarchy, lower panel and coordinate cache. Coordinate seeds
  carry the new identity plus explicit provisional status; retain full refresh and
  prevent chemistry/provenance controls from treating provisional values as complete.
- Qualify the held ethanol C→N/read/Undo/release/Redo race against server graph,
  cache, controls and viewer; coordinate publication, project switches, shared
  observers and missing/mismatched response IDs. Compare URL pathname in native
  request audits so the query parameter cannot silently bypass interceptions.
- Focus: `.venv/bin/uv run pytest tests/integration/test_structure_projection_identity.py
  tests/integration/test_model_edits.py`; frontend projection/cache suites; native
  `tests/e2e/molecular-editing.spec.ts` and affected held-load/navigation workflows.
- Commit: `fix(structures): bind projection reads to immutable artifact identity`.
- Additive API; no migration. Roll back matching client/server together.

### C2 — Retained topology, template admission and bounded diagnostics

- Areas: protein/direct editors, modeling metadata, validators and regression tests.
- Preserve retained bond IDs, endpoints, orders, aromaticity, exclusions and fixed
  coordinates. Add ordinary template bonds only with a new endpoint. Cut intraresidue and
  peptide bonds remain cut; mutation succeeds with a residue/chain/atom-specific
  unresolved-backbone warning. Unrelated cuts remain untouched; new proline
  side-chain closure is legitimate. Missing O retains existing template behavior;
  existing N/CA/C/O element contradictions refuse atomically. Unknown PDB charge or
  order alone is not a global admission veto. Protein mutation retains its existing
  single-conformer admission; unsupported multiple frames refuse atomically.
- A narrow target-chemistry exception permits PRO N–CD closure between retained
  compatible IDs for ARG/GLN/GLU/LYS→PRO: the source standard template does not
  require it, the pair is absent and no authored exclusion prohibits it. Allocate
  one inferred bond with provenance; preserve coordinates and show its measured
  distance in Å with explicit unoptimized-closure feedback. Excluded N–CD stays
  open with a precise warning. Existing N–CD is never duplicated/reidentified.
  Reverse PRO→ARG/GLN/GLU/LYS preserves the current edge under retained-topology
  policy and explicitly warns about target-template disagreement. Do not repair
  geometry or silently delete retained bonds. Independent pinned-template comparison
  identifies exactly these four standard-residue target-edge additions.
- Affected-bond checks cover all conformers with existing <0.4/>3.0 Å thresholds,
  stable identities and explicit bounded diagnostic detail/truncation. Refuse
  nonfinite affected geometry before publication. Do not silently omit frames.
- Replace active-frame N×N allocation with an exact spatial existence query. Validate
  the full coordinate input first. Query the first row alone at k=2, exact Euclidean
  search, one worker; inspect both indices excluding absolute self, recompute the
  original NumPy explicit-axis float64 norm and strict threshold; a scalar no-axis
  norm uses a different reduction and can change boundary decisions. Continue only in fixed small batches
  with immediate early exit. Avoid all-N queries, pair enumeration and approximation.
  Coincident points otherwise cause repeated full-leaf scans in the pinned library.
- Independent small dense predecessor-expression oracle covers coincident/tied/collinear/nonclashing cases
  and adjacent floating-point values around 0.4 Å. Qualify increasing supported
  sizes, peak process memory and actual query work, including coincident input at
  the configured atom bound. No universal linear-CPU or throughput claim.
- Focus: `.venv/bin/uv run pytest tests/unit/editing/test_protein_editor.py
  tests/scientific/test_protein_templates.py tests/scientific/test_direct_modeling.py
  tests/integration/test_protein_edits.py tests/integration/test_model_edits.py`;
  isolated validator profile and mutation→Undo/Redo/reload/archive/original checks.
- Commit: `fix(editing): preserve authored topology and bound protein validation`.
- No new persisted representation or scientific overlap model; exact history remains.

### C3 — Bounded computation and fresh atomic publication

- Areas: edit services/routes, shared execution/resource seam, publication locking,
  settings, lifecycle/integration tests and measured API serviceability.
- Capture plain immutable input, source protection, allocation floors and operand
  using a short owned session; close before awaited compute. A spawned pure child
  has no ORM/session or canonical publication responsibility. Reuse established
  process/resource lifecycle patterns; avoid synchronous heavy service calls in an
  async route and avoid wrapping an ORM service wholesale in a thread.
- Stage output bytes outside canonical state; pass a small bounded result descriptor,
  verify expected path/type/size/hash and perform expensive read/parse/serialization
  off the event loop. Do not receive a complete large model pickle on the loop.
- Reuse a neutral project publication lock with the existing compatibility wrapper.
  In a fresh session, lock before reads, recheck revision/artifact/entry lock/floors,
  then publish one existing command. Keep the final critical section synchronous
  with no await from lock to commit because current other writers share loop
  serialization. Do not offload only edit publication and create lost-update races.
- Qualify proposed admission: one active editor child per API process, no unbounded
  queue, preview 30 s/edit compute 300 s, separately named 4 GiB sampled process-tree
  RSS budget and 2 s graceful-then-kill/reap cleanup. These are proposed production
  settings to validate, not the earlier diagnostic 1 GiB ceiling or a universal
  aggregate-memory guarantee. Preserve entry atom limits and existing H work bounds.
- Preview cancellation/disconnect before publication leaves canonical artifacts,
  floors and history unchanged and reaps children on every path. Superseded placement
  intents retain latest-only behavior and bounded admission/retry. Submitted Apply
  owns its operation after panel closure; a committed edit is recoverable/Undoable,
  not retroactively cancelled. Reconcile uncertain responses, never blindly replay.
- Measure residual final publication. If materially blocking, first establish shared
  revision reservation across every project writer in a separate verified checkpoint
  before any off-loop publication. No premature cross-project redesign.
- Focus: `.venv/bin/uv run pytest tests/integration/test_edit_execution.py
  tests/integration/test_model_edits.py tests/integration/test_selection_edits.py
  tests/integration/test_protein_edits.py`; native rapid proposal/Cancel/close/Apply
  races, real health/project responsiveness, stale competing writes, lock changes,
  timeout/RSS/failure cleanup and exact history/original invariants.
- Commit: `fix(editing): isolate bounded computation from atomic publication`.
- Ephemeral computation, not a new durable job/schema; document cancellation truth.

### C4 — Qualified torsion reuse and five fragments

- First correct existing ligand torsion to compute each conformer's own axis and
  matrix, prevalidate every frame and preserve both endpoints exactly. Moving side
  is a canonical graph-cut component; fixed side and disconnected spectators stay
  exact. Keep existing supported sanitized ligand, nonaromatic single/nonring and
  nonterminal admission. New compact typed action/preview reuses the same method;
  pure coordinate rotation must not accidentally invoke destructive H maintenance.
- Independent rotated/translated multi-conformer fixtures verify signed dihedral
  change, distances, endpoints, both sides, spectators, inverse and atomic refusal
  when one inactive frame is invalid.
- Add only fixed neutral cyclopropyl, cyclobutyl, cyclopentyl, cyclohexyl and methoxy
  using the current seeded template/placement method and one external single bond.
  Final attached fragment formulas are C3H5/C4H7/C5H9/C6H11/CH3O respectively.
- Preserve qualified complete generated-fragment H geometry through an internal
  trusted condition; parent attachment still follows ordinary automatic maintenance.
  No client bypass or general reconciliation disable. Small-ring geometry must not
  be forced to tetrahedral angles and then mislabeled as a failed build.
- Qualify final automatic DirectEditor output for heavy attachment and H replacement,
  all placement directions/turns and conformers, independently expected graph/formula,
  root H counts, ring closure, proper rigid transforms, exact unrelated heavy rows,
  IDs, originals and history. Deliberately poor placements retain truthful warnings.
- Focus: `.venv/bin/uv run pytest tests/unit/editing/test_ligand_editor.py
  tests/scientific/test_ligand_validation.py tests/scientific/test_edit_fragments.py
  tests/scientific/test_direct_modeling.py tests/integration/test_model_edits.py`;
  native attachment/rotation preview/Apply/Cancel/history tests.
- Independently passing commits: `fix(editing): rotate each conformer around its own
  bond axis`, then `feat(editing): add five qualified common fragments`.
- No fusion, new stereo authoring, charge profile or schema change.

### C5 — Compact feedback and exact-target geometry workflow

- Retain the four-section, bounded nonmodal compact panel, original icon-led controls,
  both themes, keyboard focus, narrow layout, real 100–200% zoom and coarse targets.
  Give every one of eleven fragments a distinct truthful glyph/label; one bounded
  scroll region keeps Close and operation actions reachable.
- Visible target identity/chemistry and prerequisite reasons update only from a
  verified complete projection. Show preparing/ready/warnings/partial/details,
  Applying and local error/recovery on the active panel/strip. Details disclose the
  full reports without a wall of scientific text; warned drafts remain deliberate.
- Explicit Select whole residue recovery uses the current verified projection and
  selection guard, remains reachable for an incomplete residue and adds no history.
  Never silently expand arbitrary partial or newer selections.
- One contextual Geometry menu opens existing move/rotate and Quick/Advanced
  minimization setup with captured project/epoch/selection/artifacts; eligible ligand
  torsion shows endpoints, explicit moving-side counts, degree value and preview.
  No stale inspector target, implicit whole-entry fallback, new cleanup engine or
  execution merely from opening. Existing movement toolbar controls remain coherent.
- Qualify delayed/rejected/uncertain Apply, close/remount/project switch, stale
  selection, disabled reasons, unknown q, residue-chain ambiguity, successive
  mutations/history, warned placement, native pointer/keyboard and eye/H containment.
- Focus: `corepack pnpm --dir apps/web test` plus lint/typecheck/build; native
  `tests/e2e/molecular-editing.spec.ts tests/e2e/direct-modeling-accessibility.spec.ts
  tests/e2e/modeling-toolbar.spec.ts tests/e2e/rebranding-zoom.spec.ts` and new compact
  workflow cases. Preserve existing mobile zoom exclusions rather than adding skips.
- Commit: `feat(editing): connect compact feedback and captured geometry workflows`.

### C6 — Final-version qualification and complete-diff review

Prepare consistent versions/notes in `chore(release): prepare v0.32.0` after collision
and base checks. Run the complete current release gate: frozen installs, disposable
migration upgrade/downgrade/re-upgrade, Ruff/mypy, all Python tests, frontend
lint/types/all tests, supervisor tests, production build, full browser inventory and
suite, version/schema/dependency/production/license/legacy audits and actual tagged
reader qualifications. Reuse and adapt established source-bound recipe/runner
patterns; do not assume the historical 33-step count remains sufficient.

Run actual preceding v0.31.0 and final producers/readers in separate processes,
both directions and both archive suffixes. Retain rich/connectivity coverage and add
the five new fragments, cut-preserving mutation and coordinate/history states;
verify deep originals, all conformers, IDs, chemistry/exclusions, history and opaque
job/provenance data plus negative corruption controls. Old rich fixtures alone do
not qualify newly introduced feature states.

Record unchanged full source inventories, command vectors, lossless log hashes,
native reports/screenshots/CRC/manifests and exact existing exclusion identities.
No failed or partial browser run substitutes for the complete final run. Preserve
portable correctness and all real scientific/capacity workflows; strict reference-host
timing remains an explicitly selected additional profile.

Perform primary complete-diff self-review against the refreshed base, including all
new files. Obtain independent read-only assessments from scientific theory,
scientific implementation, architecture, performance, UI, UX and workflow reference.
Provide the contract/base/candidate/working delta/files/criteria/evidence. Batch within
available slots; no further spawning by specialists. Reconcile consequential
findings, correct and revalidate; affected roles reassess and every other role
inspects the delta and explicitly reconfirms. All seven PASS or justified
NOT_APPLICABLE verdicts must cover the same final candidate before application push.
Record nonblocking suggestions without enlarging scope. No human approval claim.

### C7 — Normal merge, exact-master release and verified closeout

Push/read back the qualified head; open a normal history-preserving PR against
`master`, with `Closes #147`, implemented/simplified/deferred/rejected dispositions,
scientific/API/compatibility limits and verification. Recheck actual protection,
reviews/checks and conversations; request Codex review when available and distinguish
request from result. No bypass, force push or premature branch deletion.

Verify the actual merged commit and its reachability on remote master. In an owned
checkout qualify that exact commit with a fresh complete release gate and actual
reader checks before tagging. If it fails, withhold publication and correct through
a normal PR. Never edit the owner's master or retarget a failed/existing tag.

Publish an annotated exact-commit tag and stable release with highlights/fixes,
API/data/migration compatibility, verification, scientific/performance limitations,
scope dispositions and linked follow-ups. Retain the established qualification ZIP
asset with exact commands/sources/lossless evidence and internal hashes; read back
tag annotation/target, notes/state/latest and anonymously downloaded size/SHA-256,
ZIP CRC and manifest contents.

Post/read back the final #147 reply and partial #71 completion explanation; leave
#71 open for remaining scope. Verify issue state. Integrate any terminal documentation
receipt by the normal protected PR process, without moving the runtime tag or
starting a receipt/release loop. Then delete only owned delivered branches and
worktrees, preserving the owner's checkout and unrelated state. Verify clean owned
delivery state, merged PRs, release, issue reply and cleanup before declaring done.

## Cross-cutting decisions and compatibility

D-158 establishes immutable projection identity and provisional cache truth.
D-159 preserves authored retained topology and all-conformer diagnostics while
retaining the exact active-frame overlap model. D-160 establishes bounded pure
computation and fresh atomic publication ownership. D-161 covers explicit compact
targets/recovery, existing geometry reuse and the five qualified fragments.

No migration or portable schema increment is anticipated: project/viewer/archive 2,
normalized/selection/component 1, migration head 0015. Current normalized data remains
the authority; original bytes and artifacts are immutable. Actual old readers must
prove compatibility, not merely tolerate a version string. Any material unapproved
compatibility/scope change needs an early owner decision; routine corrections and
equivalent implementations do not reopen settled questions.

## Version and release plan

Verified v0.31.0 is the preceding stable release, tagged at
`cc54cd324c5aebe86024c1b85165715691ddcbb3`; the base includes its documentation
receipt merge. **Minor 0.32.0** is provisional: new fragments and integrated geometry
access add public functionality while API identity and chemistry corrections improve
reliability. No major compatibility break is intended. Recheck remote versions and
tags before preparation/publication; document a compatible next-minor collision
resolution without routine new consent.

Update all five authoritative sources together: root `pyproject.toml`, root package
entry in `uv.lock`, `apps/web/package.json`, API version in
`apps/api/src/neistra_api/main.py` and `APPLICATION_VERSION` in
`apps/api/src/neistra_api/archive_service.py`. Dependencies and historical migrations
remain fixed unless an independently justified material decision is authorized.

## Progress, evidence, and completion log

| Stage/candidate | Actual work and evidence | Limitations and next action |
| --- | --- | --- |
| Read-only intake; audited 7ed58d98, refreshed base 2b5400de | Seven specialist audit and planning assessments; twelve findings, concrete scientific/cache reproductions, visible-control inspection and validator profiles. Baseline 18 browser/760 frontend/155 scientific-API tests pass; overlapping runs are not additional coverage. Owner accepts scope and cut behavior. | Baseline tests do not qualify fixes; no #147 implementation exists yet. |
| Prerequisite issue #145 | Final completed-session report, implementation PR #146 and receipt #148 merges, exact-master 33-step success, 798 current/786 preceding identities, all lossless log hashes, annotated v0.31.0, stable/latest release and closed issue reply verified. Anonymous 177,651,530-byte asset SHA-256 4b65be17d806ec81f75616c1885b3b8aa2c0b337fecb7ecc01010ba18e03393c, CRC/337 outer manifest entries and all nested files verify; branch absent locally/remotely and master clean. | Prerequisite complete before any #147 repository change. |
| C0; base 2b5400de | Fresh fetch; clean isolated planned branch/worktree; authorized contract and append-only decisions. `git diff --check` and Python documentation invariants pass: exact three-path scope, base identity, append-only decisions, all twelve findings/five fragments/checkpoints, metadata, neutral additions, local links and unchanged application/versions/dependencies/global plan. Remote planned branch is absent before creation. | Commit/push/read back C0, then proceed to C1 without a new approval. No application qualification claimed. |
| C0 publication | Commit `82d415886132db95cbcdda92af7b4a18069e3178` and exact dedicated remote branch head verified; owned worktree clean. Frozen Python/JavaScript installs complete in isolated worktrees. | C1 implementation underway; no application implementation pushed or declared complete. |
| C2 technical reconciliation | Scientific implementation identified retained-CD PRO closure; theory independently enumerated all pinned standard templates. Accepted narrow target-connection exception, explicit excluded/open and retained-extra topology diagnostics, and unchanged one-conformer mutation limit; append-only D-159 clarification. | Implement and independently qualify; no new preparation method or owner scope question. |
| C2 numerical reconciliation | Parent diff review identifies scalar versus axis norm reduction; theory reproduces strict 0.4 Å decisions changing in both directions on pinned NumPy. Explicit-axis recomputation and an actual predecessor dense oracle are accepted; four regression negative controls fail before correction. Bounded theory probes across 128 clouds and three leaf sizes show no corrected nearest-rank/decision discrepancy. | Candidate profiling/integrated qualification remain pending; no threshold, precision, library or capacity policy change. |
| C1 local qualification; working delta from 82d41588 | Conditional immutable reads, required response identity and shared verified frontend query/cancellation; explicit coordinate seeds and complete-data gates. 35 API, 772 frontend/89 suites, Ruff/mypy204, lint/types/build; complete focused native 77 pass/three exact existing exclusions across all 80 listed cases, zero failures/flakes/retries/new exclusions. 709 scoped identities and lossless logs verify. [Evidence/review](../assets/structure-editor-reliability/README.md) retains all 196 native outputs and 53 diagnostic files with CRC/hashes. | Locator correction and actual StrictMode redundant-dispatch regression are fixed without changing original oracles. Commit locally; no application push or full-feature/release qualification claimed. C2 integration next. |
| C1 local checkpoint | Commit `10e7eef2` contains the passing implementation and evidence; owned working tree was clean before C2 integration. | Application push remains held for the final all-seven gate. |
| C2 local qualification; exact six-file delta over C1 | Retained topology/exclusions, precise template admission, all-conformer bounded diagnostics and exact bounded-memory overlap predicate. Integrated 223 Python, Ruff/default mypy204 and focused native 40 pass/two exact existing exclusions across all 42 cases, zero failures/flakes/retries/new exclusions. 713 scoped source identities and lossless logs verify; all 29 native files retained. [C2 evidence/review](../assets/structure-editor-reliability/README.md) also retains verified actual-validator profiles: 19 workloads/57 calls, 24 old-expression oracles, three nonfinite refusals, two active-frame checks, 66 identities/40 outputs and original baseline provenance. | Parent complete-diff review reconciles PRO closure, typed nonfinite boundaries and exact-axis arithmetic. Frontend evidence reused on unchanged source. Commit locally; C3–C7 and final seven-role review remain. |
| C2 local checkpoint | Commit `b67ab74c` contains the passing implementation and evidence. | Application pushes remain held for the final same-candidate seven-role gate. |
| C3 integration underway | Parent verifies the frozen 22-file execution handoff and five lossless logs, integrates its tracked patch/new files over C2 without overwriting C1's structure GET, and reviews the full delta. Integrated 103 API/lifecycle tests, Ruff and default mypy216 pass. Scoped architecture review passes the frozen execution delta. A real Chromium AbortController through the development proxy reaps an uncooperative child in about 2.1 seconds and leaves the exact GET project and canonical artifact hashes unchanged. | Focused native regression is running. Ephemeral Apply-outcome evidence and compact recovery remain in progress; no final C3/full-feature gate claimed. |
| C3 residual-cost probe | One synthetic 100,000-atom charge edit preserves originals and source identities: total 2.60 s, child computation 1.75 s, off-loop load 0.62 s, synchronous publication 0.20 s and maximum loop heartbeat lag 0.46 s. Child sampled peak 533 MB; parent whole-process peak approximately 829 MiB includes fixture/archive import. | Diagnostic observation under concurrent native test load, not strict-host or universal capacity. Preserve the shared synchronous publication boundary; seek performance interpretation before concluding qualification. |
| C3/C4 technical reconciliation | D-160 adds bounded ephemeral Apply outcome evidence, because an unchanged project read cannot establish that an upstream request has stopped. D-161 defines five-only template-owned construction and direct numerical representation-loss diagnostics instead of a runtime rigid fit or small-ring H idealization. | Ordinary engineering choices within the authorized contract; implementation and independent integrated qualification remain required. |
| C3a focused native qualification | All 42 listed cases pass with 40 passes/two exact preceding exclusions, zero failures/flakes/retries/new exclusions. All 728 scoped code/lock identities, lossless logs, inventory equality and all 29 retained native file hashes/CRC verify. [Evidence](../assets/structure-editor-reliability/README.md) distinguishes the integrated run, successful proxy abort, failed diagnostic harness attempts and isolated-author profiles. | C3b outcome receipts, C4/C5 integration, performance interpretation and final gates remain required. No complete C3/release qualification is claimed. |
| C3 integrated local qualification | The exact five-step integrated run passes 177 Python/zero skips, Ruff/default mypy218 and all 42 native cases: 40 passes/two exact existing exclusions, zero failures/flakes/retries/new exclusions. All 731 scoped identities, lossless logs and 29 native outputs verify. Ephemeral Apply receipts have bounded reservation/fingerprinting/retention and commit proof before response construction; no persisted schema/job. [Primary review/evidence](../assets/structure-editor-reliability/README.md) records scoped architecture/performance PASS and separately accepted unknown-only client acknowledgment semantics. | Commit this passing backend checkpoint locally. Large edits can briefly delay API scheduling; the 100k probe is C3a diagnostic evidence, not exact C3b or universal timing qualification. Compact client ownership/retry/recovery remains C5; C4–C7 and final seven-role gate remain. |
