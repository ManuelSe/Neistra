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

### AC-powered requalification

The user reconnected AC. Ten focused native checks pass without failures, retries or
skips: two repetitions of cold/repeat small, pocket and18k Apply, genuine live/Cancel
and actual100–200%zoom. AC is online before/after; the existing power-saver profile
was unchanged. First set: small1.16s/pocket2.46s/18k4.11s, first frame699ms,Cancel53ms.
The same runtime and original thresholds now pass; retain prior battery failures as
diagnostics. Restart all20 frozen candidate commands, recording power state at each
step. C5/C6 remain incomplete until full qualification and verified delivery.

### C5 complete — frozen candidate6

All20 commands pass atb0c8208189e7e1537e23a115bbe8a6726b5b31fa:1148 Python,313
frontend,8 supervisor,298 browser/60 documented exclusions; zero failures, flakes,
retries or Python/native scientific skips. Both actual tagged0.22.1/current reader
directions pass four cases.553 source/test/lock identities and compressed logs verify.
Cold AC small/pocket/18k Apply0.915/2.104/3.659s; feedback9–54ms, first real frame
690ms,Cancel61ms,longest task258ms. All historical/supplied-file/zoom/accessibility
gates pass. Power was unchanged and AC online at every step boundary. Earlier
diagnostics remain separate. Complete diff self-review finds no remaining consequential
issue; no independent review claimed. C6 PR/normal merge/exact-master/release remains.

### C6 merged attempt1 — zoom observation correction

Normal PR#111 merge is exact remote master e698b43fc01145fa7cf3cc582a2bc31d9780923e.
All553 candidate source identities match. All1148 Python/313 frontend/8 supervisor
and static/build/frozen/migration checks pass. Native quick small/pocket/18k timing,
real first frame713ms/Cancel62ms, all three supplied-file workflows and320px axe pass.
Actual zoom fails a1000ms polling window. Explicitly interrupt remaining browsers:
98 passed,1 failed,1 interrupted,4 exclusions reached,254 not run. No tag/release.

Trace shows responsive viewer replacement during zoom: separate rectangle and
viewport calls can observe different layout generations; a later DevTools response
also exceeds the polling window. Final screenshot/snapshot fits. Independent unchanged
zoom reproduces twice in three runs, so do not dismiss it or count this gate as passed.
Read the rectangle and viewport atomically in one browser evaluation, retaining
1000ms polling, exact containment, actual native zoom, axe, focus, capture and no-edit
assertions. All three independent corrected runs pass; ESLint/types pass. Runtime
source is unchanged. Freeze the test-only correction on a dedicated fix branch and
repeat the full candidate gate before the follow-up PR, then full exact-master gate.
Supplied PDB fixtures retain byte-exact format padding; scoped source diff check
passes excluding only those original fixed-column fixture bytes. Debug files untouched.

Candidate7 stops during Ruff because two retained scratch qualifier scripts were
archived as executable-looking Python instead of compressed evidence. Compress
the exact bytes like all existing qualifier evidence; do not lint-fix or execute
archived scripts as repository source. No runtime/test source change. Record this
packaging diagnostic, pass Ruff, then restart the full clean candidate gate.

### Release hold — observed bound-ligand repair failure

The user reports good isolated cleanup but severe pocket distortion. Stop candidate8
at the user's investigation request:51 browsers passed,1 interrupted,3 exclusions
reached,303 not run; no browser failure. Prior1148 Python/313 frontend/8 supervisor/
static/build checks pass. Retain this as an interrupted diagnostic. A brief AC
disconnection during early non-minimization cases is logged; the user reconnected
before interruption. No0.23.0 tag/release exists.

Read-only local history/model replay confirms: a source metal–ligand–cofactor–protein
connected component falls wholesale into repair because unresolved bonds and any
protein membership are tested per connected component. Supported ligand chemistry
therefore receives no native pocket electrostatics. More seriously, repair's cross-
product sign selects the opposite0/180°dihedral. An independent planar four-carbon
probe produces324000 penalty with the current target for either cis or trans. Native
RDKit2026.03.4 angle/torsion constraints square degree errors; current weights greatly
outweigh covalent distances. A replay lowers torsion penalty while worsening bond
penalty and can collapse a bonded carbon pair. Fixed-only native energy also adds a
large constant to the solver's relative-energy stopping criterion. Current eligibility
checks objective improvement and severe nonbonded overlaps but no bonded geometry
guard, allowing collapsed bonded atoms to auto-apply. All fixed canonical coordinates
and chemistry stayed unchanged in the audited operations; no user state was edited.

This is release-blocking implementation behavior, not evidence of adequate pocket
qualification. Keep private project/artifact/history data outside version control.
Correct torsion orientation and unit-balanced repair, make optimization insensitive
to fixed-only constants and add bonded-geometry acceptance independent of objective
decrease. Add synthetic native regression cases for unsupported connected context,
partial rings, damaged drafts and mixed fixed/native/repair fields. Investigate a
calculation-only boundary around unsupported coordination without claiming qualified
metal physics or changing canonical connectivity. Requalify both candidate and exact
merged master; do not publish the prior implementation on the basis of older passes.
