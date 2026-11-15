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
