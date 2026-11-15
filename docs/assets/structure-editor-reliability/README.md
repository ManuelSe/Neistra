# Structure editor reliability — issue 147

The [authorized feature contract](../../plans/issue-147-structure-editor-reliability.md)
owns scope. Evidence is checkpoint-specific until the complete final-version and
exact-master release gates pass. Specialist planning/audit assessments are separate
from the required final seven-role application review.

## C1 — Immutable projection identity

[Checkpoint receipt](c1-checkpoint.json) records 35 API tests, 772 frontend tests
across 89 suites, Ruff/mypy and frontend lint/types/build. The complete focused
native run passes **77 cases / three unchanged existing exclusions**, all 80 listed
cases across seven files, zero failures/flakes/retries/new exclusions. Parent checks
verify every registered case and the exact exclusion identities against the qualified
0.31.0 browser baseline. All 709 scoped code/lock identities and lossless log hashes
remain unchanged. This is focused checkpoint evidence, not the complete release gate.

- [Historical runner](c1-runner.py.txt) retains exact commands, isolated ports,
  disposable data, environment and source-inventory scope. Its checkout/output paths
  describe this run and must be changed to fresh owned paths for reproduction.
- [Focused receipt](c1-focused-receipt.json.gz), [browser report](c1-browser.json.gz)
  and [inventory](c1-inventory.json.gz) retain full machine-readable records.
- [Native observations](c1-native-observations.zip) retain all 196 output files;
  ZIP CRC and every internal manifest hash verify.
- [Diagnostics](c1-diagnostics.zip) retain 53 files from the earlier partial runs,
  locator correction, StrictMode negative control and unchanged native navigation
  regression. They are not combined into the passing run.
- `c1-*.log.gz` are lossless logs; `c1-checkpoint.json` stores uncompressed hashes.
- [Primary checkpoint review](c1-review.md) is implementer self-review.

The initial new race-test locator matched C and Cl; exact matching corrects that
fixture. The next run exposes a real redundant-request regression: consuming the
AbortSignal makes synchronous HTTP dispatch race development StrictMode's observer
retirement/re-subscription. A one-microtask dispatch boundary and captured-signal
check eliminate the abandoned first request while preserving live cancellation.
The actual StrictMode component negative control observes two reads before the fix.
The original 10,000-component native test then passes in both layouts with exactly
one read, without changing its assertion, deadline, capacity, exclusion or retry.

Current portable correctness does not establish strict reference-host timing,
universal capacity, release completion or human approval. C2–C7 remain separate.

## C2 — Retained topology, admission and bounded diagnostics

[Checkpoint receipt](c2-checkpoint.json) records 223 integrated Python tests,
Ruff/default mypy (204 sources) and all 42 focused native cases: **40 pass / two
exact existing exclusions**, zero failures/flakes/retries/new exclusions. All 713
scoped identities and lossless logs verify; only the six reviewed scientific/test
files differ from C1. Frontend checks are reused on unchanged frontend sources.
[Primary review](c2-review.md) records the PRO closure, numerical error-boundary and
norm-reduction corrections and their independent negative controls.

[Focused receipt](c2-focused-receipt.json.gz), [browser report](c2-browser.json.gz),
[inventory](c2-inventory.json.gz), [runner](c2-runner.py.txt) and `c2-*.log.gz`
retain actual commands/environment/results. [Native observations](c2-native-observations.zip)
retain all 29 files with verified ZIP CRC and internal manifest hashes.

[Validator qualification](c2-validator-performance.zip) retains the independent
performance report, reproduction harness, all measured outputs/resource samples,
analysis, original audit script and verified baseline gate. Its [receipt](c2-validator-performance-receipt.json)
binds all 47 files by SHA-256/CRC/internal hashes. Actual validator qualification
passes 19 workloads/57 calls, 24 original-expression oracles, three nonfinite
refusals and two active-frame checks. Coincident input through one million normalized
atoms queries one row; later batches remain at most 32. Whole-process peaks include
fixture construction/native allocations. Different baseline/candidate harness
footprints and host load prohibit a controlled speedup ratio or universal-capacity
claim; production settings are unchanged by this external profile.

C3 execution/cancellation/publication and C4–C7 remain separate; no complete feature,
release, strict-host or final seven-role review claim is made here.

## C3a — Integrated bounded execution

[C3a receipt](c3a-checkpoint.json) records 103 integrated API/lifecycle passes,
Ruff/default mypy216 and the focused native regression: **40 passes/two exact
existing exclusions**, all 42 inventory cases, zero failures/flakes/retries/new
exclusions. All 728 scoped code/lock identities remain unchanged through the native
run. The transcript records the initial Python checks; the final integrated C3b
run will retain its own lossless backend logs. Frontend sources remain identical
to the qualified C1/C2 versions.

[Native observations](c3a-native-observations.zip) retain all 29 files with verified
CRC and internal manifest hashes. [Focused receipt](c3a-receipt.json.gz),
[browser](c3a-browser.json.gz), [inventory](c3a-inventory.json.gz),
[historical runner](c3a-runner.py.txt) and `c3a-*.log.gz` retain exact native
commands, isolated resources, source identities and lossless logs.

[Execution evidence](c3a-execution-evidence.zip) and its
[receipt](c3a-execution-evidence-receipt.json) retain 31 verified files: the frozen
C0-based author handoff/source/logs/profile, actual Chromium-to-proxy abort probe,
diagnostic harness attempts and the integrated synthetic-100k API size probe.
The successful abort reaps a SIGTERM-ignoring child in about 2.1 seconds, removes
its private operation directory and leaves the exact GET project and canonical
artifact hashes unchanged. Earlier attempts used an incorrect endpoint or compared
import-response patches with a GET response; those failed harness attempts remain
diagnostics and are never combined into success. The proxy runner has no independent
source inventory, which is distinct from the source-bound focused native run.

The integrated 100,000-atom charge edit preserves original bytes and before/after
Python source identities. It observes 2.60 s total, 1.75 s child computation,
0.62 s off-loop loading, 0.20 s synchronous publication and a 0.46 s maximum loop
heartbeat lag. Sampled child peak is approximately 533 MB; parent whole-process
peak approximately 829 MiB includes fixture/archive construction. Concurrent test
load, synthetic topology and one sample prohibit general capacity/timing claims.
The isolated author's ordinary-size measurements remain separately identified.

C3b Apply outcomes, C4/C5 integration, performance interpretation and all complete
final-version/seven-role/exact-master gates remain pending. These receipts do not
declare the implementation complete or ready to push.

## C3 — Integrated execution and ephemeral outcomes

[Checkpoint receipt](c3-checkpoint.json) records the exact integrated five-step
run: **177 Python passes/zero skips**, Ruff/default mypy218, and **40 native
passes/two exact preceding exclusions**, all 42 listed cases with zero failures,
flakes, retries or new exclusions. All 731 scoped source identities remain unchanged
through the run; every lossless log hash verifies. The scoped inventory is distinct
from the complete final release input inventory. Frontend validation is reused on
byte-identical sources.

[Native observations](c3-native-observations.zip) retain all 29 files with CRC and
internal hashes. [Focused receipt](c3-receipt.json.gz),
[browser](c3-browser.json.gz), [inventory](c3-inventory.json.gz),
[runner](c3-runner.py.txt) and `c3-*.log.gz` retain exact commands, environment,
source identities and lossless backend/native logs.

[Outcome handoff](c3b-outcome-handoff.zip) retains all eight frozen author files,
six-file source archive/delta, typed wire contract and four lossless logs. Parent
verifies all changed and 20 retained C3 identities before integration, preserving
C1's route/schema additions. The integrated run includes every new receipt case.
The registry remains ephemeral/process-local; missing proof is unknown. Duplicate
tokens cannot execute or reset the original owner. Saved proof survives later
response/read/cleanup failure. Actual unavailable-filesystem cleanup can leave
private work residue and cannot be described as rollback or guaranteed cleanup.

[Primary full-diff review](c3-review.md) distinguishes self-review, early scoped
architecture/performance assessment and the still-required final seven roles.
The large-size diagnostic is C3a evidence; AST/source comparison establishes its
scope, not exact C3b profiling. Large edits can briefly delay scheduling. The
health-handler sample excludes blocked scheduling time and cannot bound queued
request latency. No shared-writer reservation redesign is justified by that single
observation; retain synchronous lock/check/commit ownership.

Architecture and UX accept an explicit unknown-only current-state review and
acknowledgment that retains uncertainty, discards the old proposal and never replays.
Its client implementation, preview-only busy retry and submitted-attempt ownership
remain C5 work. C4/C5, complete preceding-reader checks, final candidate/exact-master
gates and all seven final same-candidate verdicts remain pending.

## C4a — Corrected torsion and compact API

[Checkpoint receipt](c4a-checkpoint.json) records 147 corrected focused passes,
Ruff/default mypy218 and one additional, nonoverlapping distal-bond case. The latter
is the only intervening test-only addition; its source delta is verified. The
complete corrected domain/API candidate includes it in the 585-case run below.
[Focused receipt](c4a-integrated-receipt.json.gz), [runner](c4a-runner.py.txt) and
`c4a-*.log.gz` retain exact commands and lossless backend logs. Runner dependencies
are retained in the correction archive; paths describe historical owned runs.

The initial 100 passing cases missed configured-size admission, extreme finite-angle
periodicity and inactive-frame diagnostics. That evidence is retained under
`c4a-preliminary-*`; [original source/API handoff](c4a-source-and-api-evidence.zip)
is a historical candidate, not corrected qualification. Independent scientific
review identifies all three gaps. Seventeen new core and ten spawned API controls
fail against the predecessor before correction.

[Correction/domain evidence](c4-corrections-and-domain-evidence.zip) retains the
original author snapshot/logs, all four correction paths, failed negative controls,
exact corrected thirteen-path source and manifest, and focused runner dependencies.
ZIP CRC and all 38 internal hashes verify. [Primary review](c4a-review.md) explains
the corrections and distinguishes self-review from scoped scientific agent review.

[Complete corrected focused receipt](c4-full-receipt.json.gz),
[runner](c4-full-runner.py.txt) and `c4-full-*.log.gz` record **585 passes/zero skips**,
Ruff/default mypy218 and all **737 scoped source identities unchanged**. This run
uses the full prospective C4 scientific/API candidate in the isolated owned tree,
including the five fragments, before their separate primary integration. Its
unused historical E2E environment values do not imply that browsers ran: the three
actual steps are Python, Ruff and mypy. These cases overlap focused and author
results; do not add their counts.

Scientific theory and a fresh scientific implementation reviewer return **scoped
PASS** for the same complete corrected thirteen-path candidate after reassessment.
Implementation separately executes 465 overlapping cases. The configured cap,
periodicity, raw angle/sign, exact fixed material, no-op state, bounded all-frame
warnings and distal moving bonds have explicit regression coverage. The original
template-ownership and precision seams remain unchanged and qualified separately.

C4b primary integration and C5 native controls remain pending. No native compact
rotation control, final seven-role implementation approval, reader compatibility
or release qualification is claimed by this checkpoint.

## C4b — Five qualified common fragments

[Checkpoint](c4b-checkpoint.json) and [primary review](c4b-review.md) record the
seven-path primary integration. All thirteen corrected scientific/API paths match
both scoped scientific PASS assessments. [Integration bindings](c4b-integration-bindings.json.gz)
prove all 737 source identities and 52 fixture hashes match the completed 585-case
corrected run. [Environment](c4b-environment.json) proves identical Python and 49
distribution versions. The existing Python/Ruff/mypy218 evidence is reused because
these inputs are unchanged; it is not represented as a new execution.

Five fixed neutral templates retain graph/formula/root-H/identity/original/history
coverage and 360 final-automatic placement cases across both attachment modes,
every direction/turn and three conformers. The preservation seam certifies internal
construction ownership; unoptimized or precision-limited geometry remains warned.
No ring fusion, custom library, wider H chemistry or preparation claim is added.

C5 native compact controls, actual preceding-reader qualification, full release
gates and all seven final whole-feature assessments remain outstanding.

## Deferred completeness follow-ups

Refreshed open title/body searches confirm that the existing linked issues do not
own dedicated length/angle or intentional stereochemistry authoring. [#149](https://github.com/ManuelSe/Neistra/issues/149)
and [#150](https://github.com/ManuelSe/Neistra/issues/150) retain those deferred
capabilities as bounded product briefs, with scientific planning and independent
acceptance criteria before implementation. [Verified receipt](followup-issues.json)
records exact title/body hashes and open state after connected/CLI readback.
The connected app rejects creation with 403; authenticated CLI creation succeeds.
These issues neither expand #147 implementation scope nor authorize their delivery.


## C5 corrective evidence (qualification still in progress)

`c5-corrective-evidence.zip` retains 162 hashed entries: original/corrected frontend
handoffs, the retention correction, the frozen 40-path pre-ghost-review candidate,
author logs, both independent retention probes and lossless primary diagnostic
logs/receipts/failure images. SHA-256
`3a3ff4c3149fdffd0203e76fe8559eade0ce985f8f42e2ca40fef998d9a8baa4`;
29,798,841 bytes. CRC and every internal hash verify. The actual contrast-failure
trace is included; repeated harness traces are retained separately for release
packaging, rather than duplicating them in the repository. Their complete local
ZIP is 99,813,848 bytes, SHA-256
`c65347b0aac28eb542f00cd0fdbafbce7c1e7d754a11e25cc0d69e1dc011fdd3`.

The integrated web gate passes 835 tests/95 files, lint and TypeScript/build with
752 unchanged scoped source identities. Primary verifies every lossless log hash.
The independent 32-cycle retention probe changes from 31 previous/32 persisted
records to the intended 20 previous/21 persisted, preserving the latest owner
across reload. Prior bridge, failed-Apply feedback, torsion scope, coarse targets,
unknown/unavailable journal and final quick-dispatch guard findings are corrected.
Actual desktop extension 100%/200% zoom, both themes, controls/hit targets/focus/axe
and empty-project reviewed recovery pass; page-scale screenshots remain separate.

A complete focused pre-ghost-review run subsequently passes all 60 listed cases:
56 pass/four exact preceding exclusions, zero failures/flakes/retries. This run
misses a real defect: the panel and viewer use different rotation context policies,
so no cyan proposal appears despite a qualified DTO and correct Apply. Rendered
specialist review identifies it in both layouts. New actual-native geometry/Cancel
regressions and the shared-context correction are required before C5 qualification.
Neither the earlier partial runs nor that uncovered green run establishes feature
completion. Final whole-candidate seven-role and release gates remain separate.


## C5 — Corrected compact workflow checkpoint

[Checkpoint](c5-checkpoint.json) binds the exact 42-path candidate to integrated
843 frontend tests/95 files, lint and TypeScript/build plus the complete focused
60-case browser run: 56 pass/four exact preceding exclusions, zero failures,
flakes/retries/new exclusions. All 752 scoped code identities and lossless logs
match between web and browser runs. `c5-qualified-native-and-web.zip` retains all
171 native outputs and source/runner/report evidence: 225 manifest entries,
18,593,293 bytes, SHA-256
`756b11e9a15caa0936cc73b372cd1b89bd9fc906c9c3f7ab89e02ae8a00a0694`.
CRC and every internal hash verify.

`c5-rotation-preview-correction.zip` retains the typed shared-policy correction,
its exact pre/postimages, independent actual-native negative and positive evidence,
and the preceding green-run reports/images that missed the defect. It has 36
manifest entries, 4,747,960 bytes, SHA-256
`28107162c40051b59cc574c31bff17524082f1e8d0659c0453009d0ba9efef04`.
The live native oracle verifies exact moving geometry, nonpickable GPU draw,
representation attachment and visible cyan pixels; Cancel removes it without a
canonical/history change, and later deliberate Apply/Undo preserves originals.
UI independently reassesses the same final 42 paths and returns scoped PASS.

The two historical 70 px preview assertions now use a shared content-derived
one-status-row/one-44 px-action-row bound. Visible Ready/warnings, 44 px targets,
hit testing, focus, axe, native picking/cyan and canonical assertions remain.
The existing held-response/project-return case now requires the actual first
Saved receipt (UUID/revision/artifact, one GET/no replay) before a second deliberate
UUID while the first response stays held; its late response cannot clear the
new owner. Workflow review accepts this reconciliation, without relaxing ownership.

This is a passing local checkpoint. Final-version readers/full gates, all seven
same-final-candidate assessments, remote merge/release and closeout remain.


[Primary self-review](c5-review.md) records the complete checkpoint reconciliation.
[Scientific bindings](c5-scientific-bindings.json) prove all 384 Python source
identities and 52 fixtures are unchanged from the passing 585-case C4 domain/API
qualification; its Ruff/mypy evidence is reused, without claiming a fresh run.


## C6 release preparation and reader diagnostics

All five version sources prepare 0.32.0. `c6-preparation-evidence.zip` retains the
failed formatting-only preparatory attempt separately from seven passing focused
checks: frozen install, all-version/schema/dependency audit, Ruff, mypy218,
reader-tool mypy1, 46 archive cases and diff checks. The passing run freezes 846
scoped identities and lossless log hashes. The ZIP has 14 manifest entries,
172,064 bytes, SHA-256
`eb08524263c386367a0aa64012ca547f8bcacc98d368f8db1eef0059092d98cb`.

The new helper `tests/support/structure_editing_reader_qualification.py` matches
frozen SHA-256 `534a22a5120b8887890d262340eb7263356bf68071024b1f02387bd2292f0acf`.
`c6-editing-reader-diagnostic.zip` preserves all 278 source/evidence/store/archive
files from its passing three-process diagnostic: 1,482,314 bytes, SHA-256
`69fc720d4f92e51fbc282604355b7dc461126ce20518b65a8bf4fb1b87ffe1b7`.
It covers 12 current-authored projects/13 transitions, all five fragments and both
attachment modes/multiple conformers, cut-preserving mutation and analytic torsion.
Actual preceding 0.31.0 retains current-authored states and reexports them; a current
reader retains that old writer's generic edit/history and both archive suffixes.
Corruption, stale and deep-oracle controls preserve canonical publication invariants.
The diagnostic explicitly reports `release_qualification=false` because its current
runtime still declares 0.31.0. It does not replace actual final 0.32.0 execution or
rich/connectivity/opaque-job qualification.

The generated [35-step candidate recipe](c6-candidate1-recipe.json) requires a clean
committed candidate. The source-bound runner, strict summary auditor, version audit
and production/license audit are retained as executable `.py.txt` evidence tools.
Candidate and exact merged-master complete gates remain separate requirements.


## C6 candidate 1: complete review, incomplete release gate

All seven specialists independently PASS `bc241a8c`, with no consequential finding.
The bounded [diagnostic receipt](c6-candidate1-diagnostic.json) and ZIP retain those
neutral assessments, the complete comparison, original gate/source/log records,
all retained named screenshots, self-contained failed-test trace and the separate
actual final-version reader preflight stores/archives. The ZIP has 362 manifest
entries, 9,948,174 bytes, SHA-256
`9c4db61b1fefffaa46cff721c9359586b1124355099f3ebbd8bf5bd433da043c`.
Duplicate temporary browser capture resources remain outside the repository;
the complete originals are preserved. CRC and all internal hashes verify.

Actual final 0.32.0→tagged 0.31.0→current preflight passes all three processes,
12 projects/13 transitions, retained old generic-command history, both suffixes,
corruption/stale controls and module/source identities (846 current/793 tagged).
It resolves the reviewers' earlier evidence-only compatibility gap. It is not
substituted for the mandatory complete gate's reader step.

The full gate passes 2,165 Python/zero skips, 843 frontend/95 files, 14 supervisor,
frozen installs, migration up/down/up, static checks and build. Browser execution
stops at 70 passes/two preceding exclusions/one obsolete-copy failure; 469 cases
are not run. This is not a complete qualification. Shared target capture correctly
shows Select atoms / Unlock named entry before editing coordinates; the test still
expects older movement-only words. UX accepts a semantic oracle reconciliation
rather than changing valid product copy. The test retains every locked/hidden/
canonical/revision assertion and adds empty-target no-controls/no-mutation checks.

`c6-movement-guidance-focused.zip` records the corrected two-layout regression:
two passes, no exclusions/failures/retries, 753 stable scoped code identities and
lossless logs. Eight manifest entries, 104,407 bytes, SHA-256
`ce51d8fb0ce90d0ddc41a39f53a12fbbe91d1698e11b6e90dfab2555fa5ddc0f`.
The [fresh 35-step recipe](c6-candidate2-recipe.json) requires a clean corrective
candidate. All seven final assessments must explicitly cover that new candidate;
earlier approval is not carried forward automatically.


## C6 candidate 2 — complete clean final-version qualification

Exact `5f9fbeb8229c801563180364322c04c01dd49692` passes all **35 fresh sequential commands**:
**2,165 Python/zero skips, 843 frontend, 14 supervisor, 467 browser/75 exact preceding exclusions across 542 cases**; zero failures/flakes/retries/new exclusions. The
[summary](c6-candidate2-summary.json), [full gate](c6-candidate2-gate.json),
[recipe](c6-candidate2-recipe.json), [reader audit](c6-candidate2-reader-audit.json),
complete browser inventory/cases and lossless `c6-candidate2-*.log.gz` records verify.
All 846 current/793 actual preceding-tag source identities remain unchanged.
All 75 preceding exclusion identities match exactly; none are introduced or renamed.

Actual 0.32.0↔0.31.0 rich/connectivity readers cover both directions/suffixes and
opaque jobs. The new three-process editing qualification covers 12 projects/13
transitions, all five fragments in both attachment modes/multiple conformers,
cut-preserving mutation and analytic torsion. The preceding writer retains and
reexports current-authored states; it does not author the new fragment operations.
Current readers also preserve old-authored generic history. Corruption, deep-oracle,
allocator and stale no-publication controls pass with actual source/module proofs.

All 632 native observations, gate records, tools and lossless
logs are retained with CRC and every internal hash verified:

- [c6-candidate2-qualified-01.zip](c6-candidate2-qualified-01.zip): 69,704,394 bytes, SHA-256 `3d586fb1a8d85f90aa34fd749aa2cf07b46d75b56b84ee21ed3356d89a414c3b`; 698 internal manifest entries.

[Packaging receipt](c6-candidate2-packaging.json) enumerates every native file.
The separate [captured-geometry archive](c6-captured-geometry-qualified.zip) and
[receipt](c6-captured-geometry-packaging.json) retain 45 passes/one exact preceding
exclusion across 46 cases, 846 unchanged source identities and all native/log files.
That focused run is separate from this complete gate.

[Neutral seven-role reconciliation](c6-candidate2-specialists.json) records explicit
whole-candidate PASS for this runtime, corrected findings and limits. The final
reporting/evidence-only delta still requires all-seven same-head reconfirmation;
agent review is not human approval. The [primary review](c6-candidate2-review.md)
records scope, provenance and remaining delivery stages. The committed
[exact-master recipe](c7-master1-recipe.json) is a future fresh gate, not evidence of
an executed merged-master run or a published release.


## C6R — Owner validation corrections before publication

Original PR #151 merges the reviewed tree at `3f0fa1b9`. Owner validation then
requires aromatic carbon H maintenance and a genuine attached-H toggle in Edit.
The [authorized amendment](../../plans/issue-147-structure-editor-reliability.md)
and appended D-162 define the bounded corrections. No v0.32.0 tag or release exists.
Earlier complete qualification covers its recorded original source only.

The [interrupted-run receipt](c7-master1-interrupted-receipt.json) and
[bounded diagnostic archive](c7-master1-interrupted.zip) retain the intentionally
stopped exact-master attempt: 15 successful commands with lossless log hashes,
846 unchanged source inputs and native progress through case63. No final browser
report exists. The interrupted browser stdout was not persisted losslessly by the
runner; its filtered progress is retained. It is not a complete gate or assertion
failure and cannot be combined with another run as qualification.

The archive has75 internal manifest entries,5,734,980bytes,SHA-256
`814cb1736efe13e5f8f229f5b4fc3de5405a2ee145bb61effd03c6d96ff87320`.
Duplicate temporary browser capture resources remain in the complete local
386,436,588-byte preservation archive (SHA-256
`841891c8fa89ebe10636d0bb5d789891e4840484998d2db94696092b38a96ed9`).
All retained ZIP CRCs and internal hashes verify; owned test services are stopped.
New before/after scientific, component and actual-native evidence will remain
separate, followed by a fresh complete candidate and exact-master qualification.


## C6R focused integrated qualification

[Checkpoint](c6r-hydrogen-checkpoint.json) separates the complete focused checks
from pending full release qualification. Final scientific source passes39cases;
matching final predecessor tests fail25unit/oneAPI while13controls still pass.
The broader310-case run overlaps; a docstring-only clarification during that run
is separately covered by final39/static validation. All863 frontend tests/96files
pass. Nine static/build/version/license checks pass with850unchanged inputs.

The complete36-case desktop/mobile native run passes without exclusions, failures,
flakes or retries and retains49native outputs. It verifies actual attached-H
rendering/picking, exact scope/toggle/reset/history, both themes, real desktopzoom,
keyboard/44px containment, selection/artifact/camera/original invariants and all
existing compact/chemistry workflows. Only the separate reader fixture's canonical
closing-edge selection changes afterward; production/native-test bytes remain
identical. [Focused evidence](c6r-hydrogen-focused.zip):7,470,324bytes,SHA-256
`374699eb918a4c8ea976e3b416d9a75229674cc430b5097cb780762fdb9255cd`,112manifest entries.

[Actual-reader preflight](c6r-hydrogen-reader-preflight.zip) retains every synthetic
store/archive/report from0.32.0→tagged0.31.0→current:15projects/24transitions, including
partial/sequential aromatic authoring and exact H-appearance history,30old-written
archives and60current imports/reexports across bothsuffixes. All current/source/
module/version/log hashes and corruption/stale/allocator/deep controls verify.
Archive1,864,563bytes,SHA-256
`6d8651c2f62860efa7b9b97fc514ee77c7274351e59cd59ecdc2f82437db69b4`,353manifest entries
and60nested ZIP CRCs. This preflight does not replace the full gate's reader step.

[Diagnostics](c6r-hydrogen-diagnostics.zip) retains before-fix tests and incomplete
native attempts: v1 waits only for viewportwidth before responsive replacement;
v2 incorrectly expects Polar in an All fixture. The repaired tests retain all
native/history/zoom assertions and deadlines. The reader launch executes no phase;
a subsequent attempt correctly refuses noncanonical fixture selection. Sorting the
fixture input preserves production validation. Full raw local folders retain
duplicate capture resources; the public ZIP retains named observations, reports
and self-contained traces:24,266,725bytes,SHA-256
`7394162e124d302a16e1d7a1b3dedec2f547fd1f52d8098308db22ed79c9c844`,138manifest entries
and28nested ZIP CRCs. Every ZIP CRC/internal hash verifies. No partial attempt is
combined into a full pass or release claim.
