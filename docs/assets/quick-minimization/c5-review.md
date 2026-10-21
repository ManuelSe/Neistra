# Issue #110 candidate review

Local self-review, 2026-10-21. No independent review or release gate is claimed by
this document. The complete candidate gate is the next checkpoint.

Reviewed the implementation against the approved issue plan, including the current
API/core/UI changes and preserved prepared-model contracts.

Consequential findings addressed before freezing:

- Keep the quick job/report/capture independent from historical AMBER serialization.
  Generic submission cannot bypass server-owned selection, conformer and source capture.
- Preserve assigned chemistry and isotope/radical evidence. Protein templates fill
  unknown facts; assigned current connectivity and aromatic evidence are retained.
  Observed H wins over default states. Missing heavy atoms and metal coordination
  are not invented. Unsupported material receives explicit repair/omission reporting.
- Include bonded boundaries, complete encountered residues and interfragment forces.
  Initialize combined native ring information after context rebuilding. Retain all
  local native nonbonded pairs; rebuild bounded repair candidates with original targets.
- Compare both objectives under the final model. Abnormal, nonfinite, stereo-invalid,
  stale, overlap-producing and cancelled output cannot publish. Bound projected
  convergence is checked against the independent full movable gradient.
- A final-discovery proof remains valid only while exact participating immutable
  identities match. Changed modeled context refuses; changed formerly distant context
  is checked spatially at final coordinates. Participation/locks/conformers/digests
  are revalidated. There is no persistent chemistry cache in the quick path.
- Scope automatic Apply to the owning App session, disarm before cancellation or
  publication, and never rearm from Jobs, reload or archives. Responsive viewer
  remounts preserve the draft and initiating launcher focus.
- Avoid opening/progress/frame subscriptions in App. Coordinate publication uses the
  existing atomic coordinate batch, with existing generic warning-summary actions,
  rather than rebuilding molecular topology. Keep overlays paused during publication.
- Retain full temporary chemistry, mappings, original/candidate/helper coordinates,
  assumptions and package versions in immutable model/report artifacts.
- Preserve originals, fixed rows, inactive conformers, allocators and exact Undo/Redo.
  Actual tagged 0.22.1 preflight retains all four new quick datasets and archive/job
  artifacts. No DB, molecular or history-action schema migration is required.

Focused evidence before freeze: 38 Python cases, 310 frontend tests and targeted
native desktop/mobile, accessibility/zoom, timing and previous-reader qualification.
Earlier diagnostic failures prompted the above fixes; they are not release evidence.
Complete frozen candidate and exact merged-master gates remain mandatory, including
all historical native scientific and browser checks. No required scope is deferred
or silently replaced by a successful-looking placeholder.

Candidate attempt1 stopped at a stale archive test version assertion (1118 passed,
28 failed). Focused correction passes33 archive cases. An additional cache review
finding now patches active conformer rows and invalidates seeded full projections
so provenance/warnings refresh for Apply/Undo/Redo, including after reload. Two
regression cases verify it without mutating the prior cached artifact. Full candidate
qualification must restart from a clean committed state.

Candidate attempt2 was explicitly interrupted during Python qualification (227
passed, no complete result) after review found a settings-switch race. Opening settings
now disarms automatic publication/preview synchronously before cancellation. A settings
draft stays unarmed until Run; a regression holds cancellation pending and delivers a
late completion. Restart the entire gate from the corrected checkpoint.

### Candidate attempt3 — full diagnostic result

All1147 Python/313 frontend/8 supervisor and static/build/fresh dependency/migration
checks pass. Native browser finishes297 passed/1 failed/60 documented exclusions,
zero retries. All quick/AMBER scientific/workflow/performance cases pass, including
all supplied files on desktop/mobile and actual zoom. The sole failure is an existing
surface-manager test awaiting a forced native rebuild promise through DevTools:
execution context destroyed. Its mobile counterpart and a fresh unchanged desktop
comparison pass. Preserve full logs/source identities and failing trace; this failed
gate is diagnostic. Reader/version/final-diff steps did not run after browser failure.

The test now starts rebuild completion without transferring its native promise across
a long-lived DevTools context, then polls explicit serializable success/failure state.
Native rejection remains a failure; a real navigation loses the state and fails the
poll. The bounded wait is stricter than the old unbounded evaluation; every visual,
picking, history, camera and worker-count assertion remains unchanged. Repeated
focused desktop/mobile checks precede a complete frozen candidate restart. Product
runtime and acceptance budgets are unchanged.

The corrected wait passes all four independent focused runs (two desktop/two mobile),
with no failures, retries or skips. The unchanged desktop comparison also passes.
Commit this test-only correction and evidence, then restart all20 gate commands.

### Candidate attempt4 — first-frame diagnostic and startup correction

Full1147 Python/313 frontend/8 supervisor/static/build checks pass. Cold quick Apply
and repeat small/pocket/18k cases pass, but the first genuine live frame is1038ms
against1000ms;Cancel38ms. Explicitly interrupt the remaining browser matrix:94 passed,
1 failed,1 interrupted,4 exclusions reached,258 not run. This is diagnostic only.

Profiling identifies unneeded spawned-child coordinator/API/schema/engine imports.
Defer coordinator-only imports while preserving fresh child isolation, input/target
identity, IPC, resource policy and cancellation/supervision. D-134 records the boundary.
Combined import cost falls about290ms.34 focused job/recovery/quick/AMBER tests and
Ruff/mypy pass, including a fresh-interpreter dependency regression. Initial regression
setup lacked subprocessPYTHONPATH; it now inherits the test's source paths. Repeated
real native timing and a full frozen gate restart are required; limits stay unchanged.

All8 repeated native quick performance cases pass, zero failures/skips/retries.
First real frame/Cancel pairs:[(686.8000000119209, 51.29999999701977), (684.2999999970198, 48.1000000089407)]. Cold/repeat small, pocket and18k scenes
meet unchanged thresholds. Freeze this startup correction and restart all20 gate
commands. Focused timing establishes margin; complete qualification is still pending.

### Candidate attempt5 — current unresolved qualification

The startup correction passes1148 Python/313 frontend/8 supervisor/frozen/static/build
checks. The browser run experiences broad navigation/compute slowdown. Current host
is observed in power-saver on battery with AC disconnected. Explicitly interrupt at
93 passes/4 failures/1 interrupted/4 exclusions reached/256 not run. Failures are
cold small Apply2561ms,18k6774ms,first frame1326ms and a1000ms zoom-layout wait.
Prior attempts did not record power state, so attribution remains provisional until
repeated under stable reference conditions. No power settings or limits changed.

An isolated current-power diagnostic also fails: cold small1834ms but repeat2254ms,
first frame1236ms/Cancel76ms. Retain it and the full failed-run evidence. Independent
compatibility preflight completes both actual reader directions (four cases each),
versions and diff checks. The user has been asked to reconnect AC for qualification.
The implementation is reviewable on its branch; C5/C6 remain incomplete. A complete
frozen candidate gate must pass before opening the implementation PR. Then normal
merge, exact-master gate and verified release remain required. Debug files unchanged.
