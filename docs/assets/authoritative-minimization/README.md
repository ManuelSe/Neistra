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

C6–C8 and complete final-version candidate/master/reader qualification are pending.

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

## C4 — Supplied states and independent mixed models

[Summary](c4-summary.json) records **160 focused Python passes in 18.35 seconds**
over C3 `9e418d3`. [Full log](c4-python.log.gz), [Ruff](c4-ruff.log.gz),
[mypy](c4-mypy.log.gz) (199 files) and [735 source identities](c4-source-identity.json.gz)
verify the corrected checkpoint. Exact command and locked single-thread portable
environment are in the summary. Frontend/API shapes are unchanged; valid C3
frontend/static/build/browser evidence is reused rather than repeating unaffected
checks. Complete release gates/readers remain mandatory.

The [state baseline](c4-state-baseline.log.gz) fails five cases and passes 19
before correcting acid first-oxygen and coherent alternate-charge interpretation.
[State-focused](c4-state-focused.log.gz) passes 141 cases afterward. The new state
matrix covers nine supplied states, three alternative-charge cases, conflicts,
explicit/deleted disulfides, termini and exact 2/1/1/0 cap groups with 5/2/3/0
pre-H helper atoms. Synthetic coordinates establish graph/state expectations,
not equilibrium poses. Only unknown facts change in disposable models.

[Mixed science](c4-mixed.log.gz) passes four strengthened cases;
[combined science](c4-mixed-combined.log.gz) passes 70. Fresh native fields and
independent full-pair harmonic/steric sums qualify both moving components and
cross-interactions. Distance constraints use ½kδ²; native and surrogate units,
finite-difference steps and tolerances are explicit. The reference's initial
unsanitized combined-molecule setup was corrected before qualification.

[Two real API cases](c4-api.log.gz) protect current graphs and exact sparse/fixed/
inactive rows, originals/current artifact bytes, allocation floors, one command,
Undo/Redo, no repeated Apply and archive retention. Scientific theory independently
passes 96 cases, inspects the complete four-file change and all source identities,
and confirms additional supplied-charge probes. No consequential finding remains.

The checkpoint uses `fix(minimization)` because qualification exposed actual
scientific defects. This is the corrected C5 performance baseline. No force-field
redesign, canonical repair, pH prediction, dependency, migration, schema or version
change occurs. Final all-seven review and release qualification remain pending.

## C5 — Measured assembly indexes

[Summary](c5-summary.json) and [comparison](c5-comparison-summary.json) record
equivalent corrected-C4 `80adf97` baseline and indexed candidate runs. The
[permanent script](../../../scripts/benchmark_quick_indexes.py) and
[sequential recipe](c5-comparison-recipe.json) preserve explicit implementation
roots, fixtures, source identities, input/parameter hashes, locked toolchain,
one cold/five warm samples, cProfile and allocation/RSS observations.

Warm direct-plugin medians (ms): **13.793→13.749** small (neutral within noise),
**590.656→414.043** pocket, **861.735→569.399** 18k captured scene. These exclude
worker spawn, DB/API, browser and artifact-store publication. No overall application
speedup or strict reference-host timing is claimed. Tracked whole-job peaks rise
15.781→16.568 MB and 72.167→78.221 MB (decimal MB) for pocket/18k; index snapshots
have a linear memory cost. No whole-job memory reduction is claimed.

The separate [dense-query witness](c5-count-allocation-baseline.json) and
[reproducer](c5-count-allocation.py.txt) retain 262,144 neighbors while reducing
tracked query allocation 2,491,568→165,040 bytes. This microallocation proof is
distinct from application timing.

For each profile (`small`, `pocket`, `18k`), retained files are:

- `c5-baseline-final-<profile>.json.gz` and `c5-candidate1-<profile>.json.gz`:
  complete measurements, 128 core-source identities, fixture/input/parameter/tool
  hashes, all six sample identities/stages and instrumentation.
- Matching `.log.gz`: exact command output.
- Matching `-scientific.json.gz`: complete timing-free model/field/provenance,
  proposal and report. Baseline and candidate decompressed bytes match exactly;
  no cooperative-budget stop changes work (101/115 or 53/63 iterations/evaluations).

[Combined Python log](c5-python.log.gz) passes 178 in 19.27 seconds;
[final discovery log](c5-discovery.log.gz) passes 19 in 0.16 seconds. One ARG
incident-order test was added afterward, so these cover **179 unique cases**.
It catches stale unknown-order lookup before charge assignment. Only that test
file changed; final [scoped Ruff](c5-discovery-ruff.log.gz), independent reviewer
delta checks and source inventory were updated. [Global Ruff](c5-ruff.log.gz) and
[mypy](c5-mypy.log.gz) (199 files) pass.

[Native report](c5-browser.json.gz) and [log](c5-browser.log.gz): **17 passes /
five existing mobile exclusions**, zero failures/flakes/retries/global errors in
146.36 seconds. Small/pocket/18k cold+repeat publication, genuine preview/Cancel,
current graphs, quick settings and actual zoom run unchanged. Seven observed
native measurement files are indexed in the summary; D-148 portable correctness
does not certify their strict elapsed-time targets. The final
[737-file inventory](c5-source-identity.json.gz) matches the qualified sources.
Unchanged C3 frontend/static/build evidence remains applicable.

Scientific implementation independently passes 73 tests, 60 additional oracle
comparisons and four final-delta cases. Theory passes 87 tests and the final ARG
case. Both inspect lifetimes, closed radii, closure/induced graphs, order readthrough,
rebuild replacement, fresh Apply and full scientific byte equality. No consequential
finding remains; final seven-role review and complete release gates remain C7/C8.

Initial profiling records are separate exploratory inputs. The final uniform
baseline/candidate cohorts above run sequentially without competing heavy work;
the earlier 0.26-second query probe overlapped an initial cold-start measurement
that is not used for the final comparison. No timing/resource limit is relaxed.


## C6 — Shared publication infrastructure

[Summary](c6-summary.json) records the six-file extraction from C5 `0742184`.
The [mechanical service diff](c6-service-diff.txt.gz) and [frozen file hashes](c6-source.txt.gz)
show shared lookup/integrity/parsing/locking/coordinate replacement, independent
quick-service construction and a legacy identity alias. Acceptance policies,
annotations, dependencies, warnings, history and transaction completion remain
owned by each service. No schema, migration, dependency, version or scientific
policy changes.

[Service log](c6-services.log.gz): **87 passes, zero skips, 140.25 seconds**;
[helper log](c6-helpers.log.gz): 19 focused passes. [Global Ruff](c6-ruff.log.gz)
and [mypy](c6-mypy.log.gz) (201 files) pass. Architecture independently passes 27
cases and verifies every frozen hash, the exact no-op threshold, inactive/fixed
rows and one-command concurrent Apply behavior.

[Browser report](c6-browser.json.gz) and [log](c6-browser-log.log.gz): **37 passes /
one existing mobile desktop-zoom exclusion**, zero failures/flakes/retries/global
errors in 280.16 seconds. Both layouts exercise prepared/quick publication,
preview/Cancel, Undo/Redo and publication recovery. The [741-file inventory](c6-source-identity.json.gz)
remains exact. Exact commands and isolated environment are in the summary.
Unchanged frontend sources reuse C3 lint/typecheck/500 tests/build. These are
checkpoint results; final all-seven assessment and complete candidate/exact-master
gates remain required.

## C7 — Release preparation

[Preflight summary](c7-preflight-summary.json) retains the reproduced/fixed boolean
metadata-version mismatch, 53 focused passes,43 archive passes, TypeScript/scoped
Ruff and actual tagged-reader diagnostics. The [reader recipe](c7-preflight-reader-recipe.json)
records exact commands, implementation paths, environments and six lossless logs.
Earlier failed harness snapshot diagnostics are separate; no application defect
was inferred from that harness failure. Full qualification repeats actual readers
after the final metadata correction.

The five committed gate tools and current `c7-candidate3-recipe.json` /
`c8-merged3-recipe.json` require a clean start, 30 sequential steps, unchanged
current source/tool identities and 720 actual preceding-tag identities. Browser
qualification requires the exact 75 previous exclusions and zero new skips, flakes
or retries; Python skips are forbidden. These recipes are preparation, not passing
evidence. Complete candidate/master gates and final seven-role review are pending.


### Candidate1 diagnostic and correction

[Diagnostic receipt](c7-candidate1-diagnostic.json) preserves the failed clean
`07d18d6` attempt and its [complete Python log](c7-candidate1-python.log.gz).
It stops at Python with 1350 passes/131 failures; no later step or partial passing
release gate is claimed. 130 migration cases fail because the recipe's canonical
data-directory override defeats tests' legacy-directory monkeypatch. Independent
[environment red](c7-canonical-global-conflict.log.gz)/[green](c7-legacy-compatible-global.log.gz)
reproduces the same case without changing assertions. One scientific fixture
assertion still expects the previous import default's 17 bonds.

Retain default inference and assert 940 bonds (17 explicit/923 inferred), exact
warnings and matching inference endpoint/bond IDs. Independent scientific review
confirms supplied bonds, atoms and conformers remain exact. [Focused corrections](c7-gate-corrections.log.gz)
pass155 cases in 37.71 seconds with zero skips; [Ruff](c7-gate-corrections-ruff.log.gz),
gate-script syntax and five targeted tool lint checks pass. No application source
changes. The new recipe uses the legacy test directory override and clears all
four inherited datastore aliases before overlaying explicit environments, keeping
migration/test/reader stores disposable. Failedcandidate1 and unexecutedmerged1
recipes remain historical; never use them for final qualification. Freshcandidate2
and merged2 recipes replace them, with all 30 steps rerun and no partial reuse.


### Candidate2 interruption and user-requested notice correction

[Interruption receipt](c7-candidate2-interruption.json) records why the second
clean run stops intentionally at browser exit 130.1481 Python, 500 frontend and 14
supervisor passes precede 78 native passes, 3 actual exclusions, 1 interruption and
400 unrun cases. JSON skipped 404 includes interrupted/unrun cases; it is not an
approved exclusion set. No complete candidate qualification is claimed or reused.
The user's screenshot/data is not a publication input.

[Notice correction summary](c7-notice-summary.json) records 503 complete frontend
passes in 11.89 seconds, lint/types/build, and **14 native passes / zero exclusions,
failures, flakes, retries or global errors**. The actual warned Ctrl+M calculation
creates one edit, preserves focus/closed setup, shows only the ordinary short
publication confirmation, retains full entry/report/Jobs warnings and exactly
reverses/redoes coordinates, graph, chemistry and originals. A 500-warning hook
regression reproduces the prior dump; refused/failed reports now show controlled
review text without losing stored diagnostics. Existing prerequisite/API and
uncertain-publication messages remain distinct.

The shared notice's complete long paragraphs/tokens remain readable through wheel,
trusted touch events and keyboard scrolling. Both themes and 1280×900/320×568/
320×180 viewports keep Close visible, narrow/touch targets 44px, full content,
no horizontal page overflow, no autofocus, unchanged focus/expiry behavior and
no project changes/reload. Independent UI review catches scroll inheritance when
replacing long messages; the corrected identity effect starts a new message at 0
while resize/theme/unrelated renders preserve reading. Its actual-component
[probe](c7-notice-ui-replacement-probe.json.gz) confirms 500→500→500→0 with focus
preserved; 92 independent UI tests pass. Final generic native6 passes 12 in 110.468
seconds; real quick native2 passes 2 in 20.31 seconds. Latest source inventory 759
matches. Short-viewport screenshots are linked from the summary.

Earlier harness diagnostics and experimental gesture-driver attempts remain local,
separate from passing evidence. Public inputs use a synthetic UUID. Fresh
candidate3/master3 recipes repeat every release step and actual reader, with the
exact 75 prior browser exclusions and no new skip allowance. Seven final integrated
verdicts and remote delivery remain pending.
