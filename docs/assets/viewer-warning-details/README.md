# Issue #98 qualification evidence

## C1 — Complete warning-inspection workflow

[Checkpoint summary](c1-summary.json) verifies the final focused evidence against
matching source identities and lossless log hashes. This is uncommitted-checkpoint
qualification, not a clean release-candidate or exact-master gate.

Final commands and results are recorded exactly in `c1-final-web-recipe.json` and
`c1-attempt7-recipe.json`, with completed `*-gate.json` manifests:

- 28 focused frontend tests, including exact records, focus/dismissal, geometry,
  observer cleanup, pending/failed projections and active movement Escape.
- 402 complete frontend tests, lint, type-check, production build and diff checks.
- 8 native browser passes across desktop/mobile Chromium, zero exclusions,
  failures, flakes or automatic retries in the final invocation.

The browser command is `corepack pnpm exec playwright test
tests/e2e/viewer-warning-details.spec.ts --reporter=list,json --max-failures=1`,
with a dedicated output directory. Its environment uses `.playwright`, isolated
ports 8410/8411/5573, `/tmp/neistra98-c1-attempt7/e2e`, the locked AmberTools 24.8
prefix, single-thread native pools and portable performance profile. Frontend
commands match the approved feature plan and the recorded recipe.

Actual warning-bearing PDB imports and a ligand exercise exact current grouping,
messages/severity, duplicate names and source records, keyboard and outside
dismissal, real API rename/hide/undo/delete with query-cache refresh, current empty
state, responsive/project retirement and active movement. Original download bytes,
complete molecular projections, project/history/dirty state, camera/selection and
native renderer mounts remain unchanged by inspection. Browser-test observation
and refetch globals are injected only into test responses, never production code.

Both-theme screenshots are extracted from the lossless browser report:
[desktop light](c1-chromium-light-structure-warnings.png),
[desktop dark](c1-chromium-dark-structure-warnings.png),
[mobile light](c1-mobile-chromium-light-structure-warnings.png),
[mobile dark](c1-mobile-chromium-dark-structure-warnings.png).
Desktop light and mobile dark were visually inspected during C1. Native axe checks
pass without rule suppression. Source strings remain complete and selectable.

Earlier diagnostics are retained separately, not counted as passing qualification:

1. `c1-attempt1`: the full theme contract found undeclared runtime position
   variables. Scoped CSS defaults corrected this without weakening the assertion.
2. `c1-attempt2`: a test assumed the first two response entries carried warnings.
   The assertion now selects the two actual warning-bearing fixture entries while
   retaining the exact duplicate-record expectation. Trace/screenshot are retained
   under `c1-attempt2-diagnostics/`.
3. `c1-attempt3` and `c1-attempt4`: native axe found duplicate named landmarks.
   Local named groups now use ordinary containers rather than landmark sections;
   entry headings, source names and stable IDs remain intact. No axe rule changed.
4. `c1-attempt5`: the immediate zero-state focus assertion ran before the installed
   dialog's scheduled close-focus callback. It now waits for the same connected
   focus invariant, without sleeps, replayed keys or increased deadlines.
5. `c1-attempt6`: a focused Close tooltip consumed Escape ahead of the dialog.
   This one Close button now uses the existing icon-button styling and accessible
   name without a redundant tooltip. Global controls are unchanged; focused-Close
   keyboard and native movement regressions preserve first-Escape semantics.

Lossless reports use `.json.gz`; recipes retain their original output filenames.
Incomplete attempts distinguish failed and not-run cases from registered exclusions.
No schema, migration, API, scientific method, dependency or application version
change occurred. C2 stress/actual zoom and wider regression checks, final-version
actual readers, clean candidate/exact-master release gates and seven-specialist
implementation review remain pending.
