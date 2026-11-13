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

## C2 — Layout, accessibility, input and resource qualification

[C2 summary](c2-summary.json), `c2-final1-recipe.json` and its complete gate retain
28 focused / 402 complete frontend passes, lint/types/build/diff and **54 native
passes / 6 registered exclusions**. Final failures, flakes and automatic retries
are zero. All 718 source identities and lossless log hashes verify against the
qualified source. Five exclusions are exactly retained existing cases; the one
new exclusion is actual desktop extension-driven zoom under mobile emulation.
The 12 ordinary feature cases run across both configured layouts, plus one real
desktop zoom case: 13 new native passes. [Exclusion identities](c2-exclusions.json)
and [case records](c2-browser-cases.json) make that scope explicit.

The final browser invocation includes both new warning files and existing
`viewer-controls`, `viewer-notifications`, `viewer-native-ui` and
`interactive-selection-transform` files. Its actual command/environment/output
paths are recorded in the recipe; the isolated store is
`/tmp/neistra98-c2-final1/e2e` with ports 8410/8411/5573. The locked toolchain and
portable performance policy are unchanged. Reports are lossless `.json.gz`.

The deterministic 500-record response fixture exercises complete mixed-severity
messages, repeated names/messages, long unbroken strings, keyboard Tab/End/Home,
wheel scrolling to the final row, current replacement to 499 records, repeated
open/close cycles, reachable Close and 44px coarse-pointer targets. Native input
inside the panel preserves camera/selection/project state; ordinary status text
passes through to the canvas, and outside canvas navigation still works. Escape
from content, Close and the warning list preserves movement until canvas Cancel.
Originals, normalized projections, backend state, native mounts and application
request counts retain their established invariants. The fixture is presentation
data, not 500 scientific findings or a declared capacity limit.

[Actual browser zoom](c2-actual-browser-zoom.json) records native extension zoom 1/2,
DPR 1/2 and viewport 1440/720 in both themes, with accessible bounds and native
screenshots. Tests wait for the real replacement viewer when crossing responsive
layout ownership, rather than opening a popup on a retiring viewer. No CSS zoom,
replayed action or increased deadline substitutes for actual browser behavior.

[Presentation measurements](c2-presentation-profile.json) retain finite open/update
and longest-task observations. The final 500-record opens span about 347–922ms;
the longest observed task is 344ms. These portable observations do not certify
reference-host timing, universal throughput or a speedup. Existing 5s/750ms policy
targets and production limits remain unchanged.

An independent read-only payload-access experiment found that closed portal
children were still constructing warning rows: 500 messages and 1,000 severity
reads for 500 closed records, despite absent DOM. The narrow open guard now avoids
that work. [Reproducible script](closed-warning-work.mjs.txt) and
[current results](closed-warning-work-after.json) verify zero message/severity
reads at 0/1/500 closed records; the unit regression separately proves complete
rows on opening. This is a payload-access measurement, not browser latency evidence.

Final screenshots include [desktop dark at real 200%](c2-chromium-dark-200-warning-zoom.png),
[mobile long list](c2-mobile-chromium-dark-500-warning-start.png) and
[its reachable end](c2-mobile-chromium-dark-500-warning-end.png). Current final mobile
dark and the separate [actual-app UI probe](c2-ui-status-probe.png) were visually
inspected. A preliminary screenshot appeared to clip ordinary status text; the
[bounded geometry/axe probe](c2-ui-status-probe.json) and final frozen screenshot
show full text and no ancestor overflow/scroll. No speculative layout change was
made. Original preliminary screenshots remain inside their lossless reports.

Retained C2 diagnostics:

- `c2-attempt1`: 22 existing desktop regressions pass before the zoom test opens
  during a responsive viewer replacement. It now waits for actual new-owner mount
  and loaded scene readiness. The original lifecycle contract is unchanged.
- `c2-attempt2`: native axe finds a scrollable region without explicit focus
  semantics. The body now has `tabIndex=0`, a named region and existing focus
  styling. Actual keyboard End/Home and focused-list Escape qualify the correction;
  no accessibility rule was suppressed.
- `c2-attempt3`: all 13 feature cases pass with the single real-zoom exclusion.
  Later measured closed-row correction and list-focused movement coverage are
  covered by the complete final C2 invocation above.

No version, dependency, scientific method, API, schema or migration changed in C2.
Final-version actual readers, clean candidate/exact-master gates and final
all-seven specialist implementation assessments remain required before delivery.

## C3 preparation — Final-version preflight

`c3-preflight-recipe.json` and its complete gate qualify 42 archive integration
cases, frozen uv, coordinated 0.28.1 version/schema/dependency/migration identity,
production harness/license checks and diff validation. All five versions agree;
external packages, pnpm graph, schema versions and migration history remain intact.
The preceding 0.28.0 producer remains covered by the archive matrix.

Fresh fetch/merge leaves origin/master at 00320ea; stable latest remains 0.28.0
and the 0.28.1 tag is available. The actual tagged 0.28.0 source was extracted to
`/tmp/neistra98-reader-0280`, retaining its real API/core roots and 0.28.0 metadata.
Its separate producer/reader execution is still pending at this preflight stage.

`release-recipe.py.txt` adapts the preceding release's 24-step convention to this
issue, actual 0.28.0 readers and final 0.28.1. `versions.py.txt`,
`production-audit.py.txt` and `qualification-summary.py.txt` retain explicit
version/dependency/schema/production/exclusion checks. Candidate and exact-master
recipes are prepared before committing, so each can begin from a clean committed
state. Generated evidence never substitutes for executing the commands. Complete
candidate/exact-master qualification and final specialist assessments remain pending.

## C3 — Clean final-version candidate qualification

The clean committed candidate `bf502040c77b2542112cf1134dd4f3d45f563e10` passes all **24 release steps**:
**1,334 Python (zero skips), 402 frontend, 14 supervisor, 377 browser passes / 75 registered exclusions**, with zero final failures, flakes or automatic retries. All
718 source identities remain unchanged and all lossless log hashes verify.
The 74 preceding browser exclusion identities are exact; one new exclusion
is actual desktop extension-driven zoom under mobile emulation. Frozen installs,
Ruff/mypy, lint/types/build, disposable upgrade/downgrade/re-upgrade, version/schema/
dependency/production/license audits and legacy CLI pass. Actual tagged v0.28.0 and
final 0.28.1 producer/readers run in separate processes in both directions and
accept both archive filename conventions. No Python or native scientific case is
newly excluded. [Candidate summary](c3-candidate1-summary.json).

The complete browser command was restarted after the original process ended
without a final report. No partial browser result counts. The 13 earlier completed
checks were verified and reused on the identical frozen source; the restarted
whole browser suite and remaining reader/audit commands then completed. The
[interruption receipt](c3-candidate1-interruption.json)
and explicit continuation recipe retain that boundary. The gate completed with this documented continuation.

The original invocation is `.venv/bin/python docs/assets/viewer-warning-details/qualification.py.txt
docs/assets/viewer-warning-details/c3-candidate1-recipe.json`. The continuation uses
`.venv/bin/python -u docs/assets/viewer-warning-details/resume-qualification.py.txt
docs/assets/viewer-warning-details/c3-candidate1-resume1-recipe.json` in a detached
process with a fresh disposable browser store. The final verifier is
`.venv/bin/python docs/assets/viewer-warning-details/qualification-summary.py.txt c3-candidate1`.
The committed recipe retains all 24 command vectors, implementation roots, disposable
stores/ports and locked native environment. The gate manifest retains clean start,
commit, source and lossless-log hashes; case/exclusion files and compressed report
retain every browser result. Portable profile 0 makes no strict reference-host claim.

[Full-diff local review](c3-full-diff-review.md) is primary implementer self-review.
[Seven runtime role assessments](c3-runtime-assessments.json) are specialist agent
review, not independent human approval. All found no consequential defect; final
same-candidate documentation/evidence reconfirmations are still required before push
and are recorded in the PR. Exact merged-master qualification and remotely verified
publication remain pending. Existing build chunk/Alembic deprecation warnings are
retained in logs, not silently removed or counted as failures.

[Architecture and performance method assessments](c3-continuation-method-review.json)
independently verify the same original clean candidate, retained 13 checks/logs,
complete 718-file inventory and 11-command suffix. The final summary additionally
verifies original/resume command vectors and recipe/runner hashes, and the
[actual-reader audit](c3-candidate1-reader-audit.json) verifies all 713 preceding
source identities and both filename conventions. The optional automated inventory
hardening suggestion is addressed by this final verifier; no runtime change follows.

Completed-command duration is 4,237.625s; total wall time is 8,393s and includes the
interruption and continuation preparation. These are qualification durations,
not application performance measurements. The interrupted manifest and 14,348-file
partial inventory remain separate. Raw partial native files are locally retained
under `/tmp/neistra98-c3-candidate1-interrupted-native`; the planned qualification
bundle will include the receipt/inventory; raw files remain locally retained.

## C4 — Exact merged-master qualification and verified publication

Both the originally clean frozen candidate and exact merged runtime `d7ea8e91b6ba4ecf0298f4bd92ffea69b44100c2`
complete all **24 release steps**: **1,334 Python (zero skips), 402 frontend, 14 supervisor, 377 browser passes / 75 registered exclusions**, with zero final failures, flakes or
automatic retries. All 718 current source identities and lossless logs verify;
all 713 actual preceding-source identities verify.
The 74 previous browser exclusion identities remain exact; one approved
addition is actual desktop zoom under mobile emulation. Actual tagged 0.28.0 ↔
final 0.28.1 readers pass in separate processes in both directions and accept both
archive suffixes. Frozen/static/build/version/schema/dependency/production/license,
legacy CLI and disposable migration round-trip checks pass.

[Exact-master summary](c4-merged1-summary.json), `c4-merged1-recipe.json`, the
complete gate, lossless logs, case/exclusion records and compressed browser report
retain this separate run from clean merged master `d7ea8e91b6ba4ecf0298f4bd92ffea69b44100c2`. The exact command
is `.venv/bin/python docs/assets/viewer-warning-details/qualification.py.txt
docs/assets/viewer-warning-details/c4-merged1-recipe.json`, followed by
`.venv/bin/python docs/assets/viewer-warning-details/qualification-summary.py.txt c4-merged1`.
The detached process survives goal handoffs; no tracked source or HEAD changes
during the gate. All 718 source identities equal the qualified candidate; actual
old reader/source verification remains 713 identities. Final native screenshots,
metrics, axe, actual zoom and scientific/resource regressions remain attached.

All seven specialist agent assessments are PASS for final candidate
`09015f15d8c8395ccfee5c71f78ef8dd398e4267`; its entire tree is identical to the released merge.
Primary full-diff local review and the PR record corrections, verification and
limits. Codex review was requested; no external result returned as of the verified
pre-merge check. These are agent assessments, not independent human approval.

[All seven final candidate assessments](c3-final-assessments.json) cover the same
candidate `09015f15d8c8395ccfee5c71f78ef8dd398e4267`. Its entire tree equals the released normal
merge. The PR records role verdicts and local review provenance without claiming
independent human approval or remote CI success.

The annotated tag, stable/latest release, notes and anonymous qualification ZIP
download verify: SHA-256, CRC and all 1,309 internal manifest files.
[Publication receipt](c4-publication.json) and
[verified issue reply](https://github.com/ManuelSe/Neistra/issues/98#issuecomment-6851862559) retain delivery evidence. The issue reply is the
receipt location for final documentation integration and local/remote branch cleanup.
Later documentation receipts preserve the qualified runtime tag.

Asset SHA-256: `ea54e10e9b8605e89b03efbcb0215c6c9d4882ded51acf1c1118276e7fff4940`. Release/tag object and target, stable/latest
flags, exact notes and API digest are read back remotely. An anonymous download
matches local bytes and passes ZIP CRC plus every included manifest hash. The
qualification bundle includes the interrupted receipt/inventory, while raw
partial native files remain locally retained as described in C3.

No new migration, persisted contract, scientific method, API or dependency change.
Version 0.28.1 is a compatible correction to existing warning access. Optional
technical metadata/actions and global warning tooling remain outside this scope;
no essential approved outcome is deferred and no speculative follow-up was created.
Portable correctness is qualified; no strict reference-host or universal capacity
claim is made. Final documentation and cleanup receipts are maintained in the
verified issue reply, preserving the qualified runtime tag.
