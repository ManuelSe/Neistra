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
