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

C2–C8 and complete final-version candidate/master/reader qualification are pending.
