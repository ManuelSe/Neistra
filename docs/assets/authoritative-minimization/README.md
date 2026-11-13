# Issue #137 qualification evidence

## C1 — Authoritative current connectivity

[Summary](c1-summary.json) records the focused checkpoint on the approved branch,
based on `bae090a`. This is uncommitted-checkpoint qualification, not the complete
release-candidate or exact-master gate. Application versions remain 0.28.1;
quick calculation implementation is 1.0.3. No dependency/schema/migration changed.

Final evidence:

- [Python log](c1-python.log.gz): 309 passes in 50.29 seconds.
- Complete frontend suite: 408 tests in 67 files; ESLint, typecheck and production
  build pass. The existing lazy bundle-size advisory remains nonblocking.
- Backend Ruff and strict mypy pass across 199 source files.
- [Native browser report](c1-browser.json.gz): 41 passes, one existing mobile
  exclusion for actual desktop extension zoom; zero failures/flakes/retries.
- [Source identities](c1-source-identity.json.gz): all 719 runtime/test/tool/patch
  files remain unchanged throughout the final native gate. Artifact hashes and
  exact browser environment are in the summary.

Final Python command uses the local interpreter, PYTHONDONTWRITEBYTECODE=1,
locked AmberTools and single-thread pools:

```bash
.venv/bin/python -m pytest -q tests/unit/adapters tests/unit/editing \
  tests/unit/test_quick_minimization.py tests/scientific/test_quick_minimization.py \
  tests/integration/test_quick_minimization.py tests/integration/test_import_export.py \
  tests/integration/test_model_edits.py tests/integration/test_selection_edits.py \
  tests/integration/test_job_implementation_version.py \
  tests/integration/test_quick_historical_policy.py \
  tests/unit/jobs/test_spawn_bootstrap.py tests/unit/test_namespace_compatibility.py
```

Frontend commands are `corepack pnpm --dir apps/web test`, `lint`, `typecheck`,
and `build`. Backend static commands are `.venv/bin/ruff check .` and
`.venv/bin/mypy apps/api packages/neistra_core packages/neistra_demo_plugin`.

Final native command:

```bash
corepack pnpm exec playwright test tests/e2e/canonical-connectivity.spec.ts \
  tests/e2e/quick-minimization.spec.ts tests/e2e/modeling-toolbar.spec.ts \
  tests/e2e/direct-molecular-modeling.spec.ts --reporter=line,json --max-failures=1
```

Outputs use `/tmp/neistra137-c1-native2-results`; the summary records disposable
data and ports. NEISTRA_PERFORMANCE=0 preserves portable correctness qualification,
not strict timing certification. Production scientific/resource checks remain.

Coverage includes import inference on/off, raw 1STP 17 explicit plus 923 supported
inferred edges, TER in later models with differing serials, conservative sequence/
geometry/entity checks, isotope/charge/coordinate preservation, current-only
calculation graphs, helper-path rejection, sparse-model approximate coverage,
metadata integrity across all editors, historical report refusal, and both worker
version boundaries. Native cases verify empty/sparse graphs, coordinate preview/
cancel/reload, canonical deletion/Undo/Redo, quick publication and existing toolbar
focus, mobile/theme/accessibility/real zoom behavior.

Scientific theory independently reproduced two consequential findings, then PASSed
their corrections: known nonpolymer entity boundaries prevent inferred peptide
links; sparse protein fragments retain native contributions but report approximate
coverage. Final all-seven implementation review remains C7 work.

Diagnostics remain separate:

- The first native run failed its new injected-harness readiness check (one
  failure, 41 not run). Its error context, screenshot and trace are retained as
  `c1-diagnostic-*`; it is not passing evidence.
- Review found native cross-unit distance/subset filtering could hide canonical
  edges. Strengthened unit regressions failed before the operator-aware canonical
  pair correction and pass afterward, including stretched bonds and source sorting.
- A historical fixture builder now explicitly disables import inference so its
  committed archive bytes remain unchanged. No archive fixture was rewritten.
- A new historical-refusal test initially compared a creation response with a
  later GET (timestamp serialization/job-link differences); it now compares fresh
  server state immediately before/after refusal. The preservation assertion remains.

C4–C8 and complete final-version candidate/master/reader qualification are pending.

## C2 — Reliable quick publication

[Summary](c2-summary.json) records the focused checkpoint over local C1 `b4ee31f`.
App-owned publication, verified session journal and source-project dispatch guards
cover automatic and manual quick Apply. Recovery reads fresh evidence; it never
blindly replays. Later Undo and edits retain authority. Export/Jobs stay usable.

- [Frontend log](c2-frontend.log.gz): **464 passes in 70 files**.
- [Lint](c2-lint.log.gz), [types](c2-types.log.gz) and
  [build](c2-build.log.gz) pass; existing lazy chunk advisory remains.
- [Final browser report](c2-browser.json.gz) and [log](c2-browser.log.gz):
  **61 passes / one existing mobile actual-desktop-zoom exclusion**, zero failures,
  flakes or retries in 450.28 seconds. This covers new recovery, existing quick,
  toolbar and movement workflows in desktop/mobile, themes, axe, narrow layouts
  and actual desktop 100–200% zoom.
- [Source manifest](c2-source-identity.json.gz): all **726 files** remain unchanged
  during the final gate. Exact command/environment and artifact hashes are in the
  summary. Portable correctness uses `NEISTRA_PERFORMANCE=0`; no strict timing
  certification is claimed.
- Architecture independently reran 82 focused cases and PASSed after captured-ID
  dispatch and read-availability corrections. Final all-seven review remains C7.

Backend evidence from C1 is reused: C2 changes no backend code, scientific method,
schema, dependency, migration or app version. Frontend commands remain `test`,
`lint`, `typecheck`, `build` through `corepack pnpm --dir apps/web`.

The separate first [diagnostic report](c2-diagnostic-browser.json.gz) stopped on
an alternate-project test precondition: it created that project after browser
navigation/cache capture. The [context](c2-diagnostic-error-context.txt),
[screenshot](c2-diagnostic-test-failed-1.png) and [trace](c2-diagnostic-trace.zip)
remain diagnostic evidence, not passing qualification. Creating projects before
navigation changes no runtime code, assertion or timeout. The corrected focused
[14-case recovery report](c2-recovery-browser.json.gz), followed by the complete
broader rerun above, both pass.

## C3 — Controls and effective calculation fields

[Summary](c3-summary.json) records focused qualification over C2 `36df747`.
Capability retry, explicit recapture, staged counts, settings disclosure and typed
actual-field provenance preserve quiet execution and current connectivity.

- **93 backend passes** in 17.58 seconds: 27 provenance cases, existing quick
  unit/scientific/API/historical tests and persisted-job/both-suffix archive retention.
  The scientific implementation specialist executed the exact command recorded in
  the summary. Complete lossless backend release logs remain C7/C8 work.
- [Ruff](c3-ruff.log.gz) passes; the specialist's full mypy passes 199 files.
- [Frontend](c3-frontend.log.gz): **500 tests in 72 files**. Full ESLint plus scoped
  decoder lint pass; [types](c3-types.log.gz) and [build](c3-build.log.gz) pass.
- [Final browser report](c3-browser.json.gz) and [log](c3-browser.log.gz):
  **51 passes / one existing mobile desktop-zoom exclusion**, zero failures, flakes,
  retries or global errors in 366.30 seconds. This includes 12 new controls, 14
  recovery and existing quick/toolbar/actual desktop 100–200% zoom cases.
- [Focused controls](c3-controls-browser.json.gz) independently passes 12/12.
- [Source identities](c3-source-identity.json.gz): all **732 files** remain fixed
  throughout final native qualification; exact command/environment and hashes are
  in the summary. Portable correctness is separate from strict host timing.
- Scientific theory independently passes 32 cases and the backend design. UX
  independently passes 118 frontend cases and inspects reports/identities/screenshots,
  returning checkpoint PASS. The final all-seven assessment remains C7 work.

Expanded method details were visually inspected in [light](c3-mobile-light-methods.png)
and [dark](c3-mobile-dark-methods.png), alongside 320px setup/recheck screenshots.
Native bounds/overflow, keyboard focus and scoped axe pass. Helper atoms (including
cap atoms) and boundary cap groups have explicit different units. Metadata is
validated against final report membership; missing/invalid historical details do
not affect scientific eligibility. Strict report1 and all existing durable schemas,
versions, dependencies and original bytes remain unchanged.

Earlier diagnostics are separate from passing qualification:

- [First report](c3-diagnostic1-browser.json.gz) selected fixture atom3, an existing
  H, for an attached-H expansion precondition. Carbon1 is the corrected observed
  heavy atom; H membership is still independently derived/asserted from the graph.
- [Second report](c3-diagnostic2-browser.json.gz) used a left-side scrim point
  covered by the left Project browser. Genuine Escape closes it and assertions
  preserve the open minimization setup. The original right-Inspector pattern did
  not apply to that drawer.
- Adjacent `c3-diagnostic1-*` and `c3-diagnostic2-*` context/screenshots/traces retain
  both failures. Runtime, assertion strength and timeouts were unchanged by these
  corrections. Final expanded-method theme/axe coverage was strengthened.

Checkpoint full-diff self-review has no consequential unresolved finding.
Nonblocking singular component copy is scheduled before C7's final candidate gate.
C4's supplied-state corrections/independent scientific matrix remain next; this
checkpoint is not readiness to push or release.
