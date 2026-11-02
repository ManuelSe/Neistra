# PR #126 portable correctness qualification

D-148 separates mandatory correctness from reference-host latency targets. All
workflows execute with NEISTRA_PERFORMANCE=0. No strict reference-host qualification
or performance improvement is claimed.

- candidate-summary.json: unique outcomes, source/version audit, recorded power,
  explicit interruption/replay accounting and both actual-reader directions.
- candidate-gate.json.gz / candidate-browser.json.gz: unmodified initial reports.
  The complete browser command returned 1: 347 passed, one interrupted case failed,
  and 62 documented exclusions. This is NOT represented as a clean invocation.
- resolved-gate.json.gz / resolved-browser.json.gz: unchanged-source targeted replay
  (one passed), both actual v0.26.0/current readers and remaining checks (all passed).
- candidate-logs.json.gz: lossless output and hashes for every qualification command.
- interrupted-minimization-trace.zip: browser trace of the failed attempt.

The trace shows Vite's connection loss and automatic document reload clearing the
transient selection/panel. The native job converged in 1.443 seconds, with no error.
Telemetry records a 216-second sampling gap and transition from battery to AC.
Power causality is not isolated. The replay changes no source, fixture, assertion,
selection or chemistry. There are no automatic retries; one targeted manual replay
resolves the externally interrupted case. Every other executed case passed on its first run.

Complete verified coverage: 348 unique browser cases plus 62 documented exclusions;
1,261 Python with no skips; 370 frontend; 12 supervisor/policy. The v0.26.0 baseline
has 61 exclusions (9 desktop, 52 mobile). The original PR adds one desktop-only mode
workflow with its mobile exclusion; the portability amendment adds no exclusions.

Power is sampled, not controlled. Python/frontend/desktop and much mobile coverage
ran on battery; the run finished after AC was connected. It is not claimed to be an
entirely-on-battery run. Source identity is unchanged across all test executions.
Remote integration is tracked in PR #126. A tag/release is outside this request.
