# Issue #110 — Quick local minimization

Status: approved; implementation authorized2026-10-21 by “Implement the plan.”
Issue: https://github.com/ManuelSe/Neistra/issues/110
Branch: `feat/issue-110-quick-minimization`; base master15b88c65df2fb91d83fe55636d894ebd66a8f210.
Target stable0.23.0, subject to final availability/compatibility checks.

## Approved implementation contract

Ctrl+M/lightning requires an explicit selection, starts immediately and automatically
publishes a usable result as one coordinate-only Undo/Redo command. Move selected
atoms and attached terminal H by default; advanced exact-selection disables expansion.
Keep every other existing atom and inactive conformer exact. Selected locked entries
refuse; fixed locked entries participate. Selection changes cannot retarget work.
Cancel/tool/project/session loss immediately clears preview and forbids delayed Apply.

Automatic surroundings use visible entries including their display-hidden atoms;
selected entries are mandatory even if hidden. Advanced isolated/manual entry choices
can include hidden entries. Fixed site atoms contribute bonded and nonbonded forces,
including attractive polar interactions. Explicitly selected site residues can move;
unselected heavy neighbors never expand automatically. Keep prepared AMBER under
Advanced with its existing model/APIs/report serialization/scientific requirements.

Use installed RDKit/SciPy, distinct `quick-local-v1`/`coordinates.quick_minimize` in
the existing plugin. No extra job framework, persistent parameter cache, or native
AmberTools prerequisite for quick work. Current state remains independent of Mol*.

### Temporary chemistry and local context

Map source entry/atom/active-conformer identities exactly. Precedence: assigned current
chemistry; standard observed protein templates; bounded ligand bond-order perception
on unchanged connectivity; explicitly approximate repair. Check known elements/orders/
charges/connectivity after perception. Unknown ligand net charge permits a reported
neutral attempt, not protonation enumeration. Connected organic material containing
attached H under UNK is not rejected as a protein adduct based only on classification.
Stale aromaticity never becomes silently corrected canonical chemistry.

Honor existing isotope/radical facts; missing historical identity evidence alone does
not block coordinate cleanup or become invented canonical evidence. Add temporary H
and boundary helpers without canonical IDs. Do not publish atoms/bonds/charges/stereo/
protonation/source metadata changes. Preserve originals. No embedding/global search.

Protein states honor supplied charge/H/state evidence first; otherwise ASP/GLU−,
LYS/ARG+, neutral CYS/TYR and epsilon-H HIS, charged termini at established actual ends.
Report assumptions. No pH prediction, missing heavy/loop completion or invented termini
at gaps. Helpers on fixed parents stay fixed; helpers on moving parents may optimize.

Discover real context within6Å of movers plus2Å guard skin. Include complete selected
small molecules, encountered residues/rings, and at least three covalent bonds of closure
around movers to retain boundary bonds/angles/torsions/exclusions/scaling. Use fixed
temporary ACE/NME caps at peptide cuts outside required closure; disclose local-model
effects. Preserve actual source boundary identity separately. Do not parameterize whole
proteins for normal ligand cleanup. Immutable participating snapshots permit guarded
neighborhood extension. Rebuild before skin exhaustion; verify final discovery at Apply.
Outer limits2000 movable canonical atoms/20000 model atoms including helpers/100 entries;
never truncate silently. Compare original/candidate under the same final model.

### Force fields, repair, execution and acceptance

Prefer native MMFF94 with distance-dependent dielectric scale4, bonded/VdW/electrostatic
terms, explicit interfragment interactions, native exclusions/scaling and fixed mask.
The native nonbond threshold is dimensionless, not an Å cutoff; retain relevant pairs
through movement. UFF fallback reports its cause and omitted pocket electrostatics.

Unsupported fixed sites remain reported steric obstacles using native flat-bottom
distance restraints, preserving supported force-field contributions. Unsupported moving
chemistry uses an empty native field with bond lengths, established coordination angles/
planarity, and nonbonded repulsion. No invented attraction, metal coordination or protonation.
Repair constants: bond100,angle20,planarity10,overlap20; overlap distance0.75 summed VdW
radii excluding bonded/angle neighbors. Fallback covalent-radius bond factors single1,
double0.87,triple0.78,aromatic0.93; unknown uses reported single-like length. Report repair
units as penalty rather than physical energy. Coincident movers permit deterministic small
initial offsets; never perturb fixed canonical rows. Partial coverage always labeled
Approximate repair with affected sites/omissions, never full parameterization.

Reduced-coordinate SciPy L-BFGS-B through native RDKit energy/gradient:500 iterations
default,range1–2000,maximum movable force0.01kcal/(mol Å),relative tolerance1e-7; bounded
segments allow0.5Å per-axis displacement before neighborhood reassessment. A bound-stop
projected gradient is not convergence.15s cooperative optimization budget/30s worker
deadline; cancellation checkpoints and existing supervised RSS/process handling.

Usable output requires finite mapped coordinates/objective, exact fixed rows, preserved
declared stereo, objective improvement beyond numerical tolerance under one final model,
and no new nonbonded pair below0.6Å. Useful iteration/cooperative-budget limits can apply
with warnings; hard failure/cancellation/invalid output cannot. No-op creates no history.
Native accepted iterates only,max5Hz/latest-only live rendering,no invented animation.

### API, UI, persistence and compatibility

Dedicated quick capability/submission/proposal/live/apply routes follow current conventions.
Independent typed quick contracts preserve all AMBER serialization. Submission includes
revision/selection,automatic-visible/isolated/manual entries,attached-H/repair policies and
iterations. Server owns capture/conformers/expanded mask/context; generic jobs cannot bypass.
Reports retain method/coverage/assumptions/helpers/counts,objectives/units/gradient/work,
displacement/contacts/timing/termination/eligibility. Reuse immutable job/model/report/
proposal artifacts and atomic multi-entry publication. No new engine/cache framework.

Only the owning active client automatically applies completed eligible proposals. Revalidate
source/context/participation/conformer/locks/digest/final discovery. No worker/reload Apply;
no repeat application even after Undo. One “Quick minimize selection” command preserves
all molecular fields except selected active coordinates, appending provenance/warnings.

Compact progress/Cancel/result by default; secondary context/exact mask/repair/iterations
settings and Advanced AMBER. Reuse actual coordinate previews, pause geometry-dependent
overlays and refresh through existing paths. Preserve camera/navigation and avoid high-rate
main-App subscriptions. Original exports remain saved state until application.

No DB/canonical-schema migration. Keep legacy ligand-cleanup API unchanged; its topology-
writing path is not quick publication. Archives retain historical jobs, not live sessions;
imported proposals cannot apply against remapped IDs. Actual tagged0.22.1 reader must retain
new data/history/jobs/archives. Append decisions superseding defaults only for quick work.

## Checkpoints and validation

- C0: approved contract,issue/branch,progress,append-only decisions; docs checkpoint.
- C1: isolated/partial real quick jobs/API/coordinate-only publication without AmberTools;
  `feat(minimization): add quick local force-field calculations`.
- C2: local pocket/protein chemistry,boundaries,interfragment forces,guard rebuilding;
  `feat(minimization): respect local pocket and bonded context`.
- C3: debug inputs,legacy metadata,stale aromaticity and labeled repair;
  `feat(minimization): repair incomplete molecular drafts`.
- C4: default UI/live/automatic Apply/Cancel/Undo/advanced;
  `feat(minimization): make quick relaxation the default`.
- C5: final scientific/workflow/performance/compatibility/release gates,versions/docs.
- C6: reviewed PR/verified remote merge/exact-master gate/annotated tag/release/issue reply.

Commit coherent passing states. Focused Python/integration tests per checkpoint; relevant
frontend lint/type/tests/build/native browser checks after milestones. Complete gate before
PR opening/merge and on exact master: frozen uv/pnpm,isolated fresh migration,Ruff,mypy,full
pytest with configured AMBER/no new scientific skips,web lint/type/tests,supervisor/build/
full Playwright,versions/diff. Fix consequential findings before continuing.

Required scenarios: byte-exact copies of three user debug inputs; sanitized assigned edited
paracetamol and stale-aromatic draft without private project metadata; build/edit→Ctrl+M;
partial substituent/ring/H/sidechain/mixed entries; exact fixed/inactive rows,hidden H,mask
toggle,locks,sparse IDs,empty selection; raw/prepared1STP pocket attractive/repulsive forces,
independent finite differences,boundary terms/exclusions/scaling; states/caps/waters/unknown
sites; hidden problematic entry cannot poison unrelated visible work; visible obstacles
stay represented/reported; guard movement/changed/newly visible context; stereo/overlap/
finite failure/limits/no-op/worker loss/cancel/repeat Apply; exact Undo/Redo/reload/export/
archives/old reader; trusted native input,themes/mobile/200%zoom/remount,coexistence with
selection/camera/movement/surfaces/measurements/interactions.

Reference gates: start feedback<=100ms,Cancel preview<=500ms,cold small molecules<=2s,
cold32-atom1STP pocket<=5s also in18k scene,first actual frame<=1s when sufficiently long.
Retain existing longest-task/movement budgets. Record capture/interpretation/field/
optimization/transport/apply/render separately,cold/warm; solver timing is not user latency.

## GitHub and release delivery

Update issue110 at passing checkpoints with verified commits/evidence. One implementation
PR after C5, title “feat(minimization): add fast selection and pocket relaxation”,Closes#110.
Record implemented/simplified/deferred/rejected requirements,scientific limits,compatibility/
rollback and exact gates. Keep external comparison product/company names out of issue/PR
titles,bodies,comments and release notes. Existing #83,#86,#52,#101,#102,#92 remain separate;
no new framework,docking,global search,missing loops,durable preparation or adduct qualification.

Update five authoritative versions for0.23.0 after availability/compatibility review. Respect
protection/checks/reviews/conversations and review full diff. Normal merge preserves checkpoints.
Verify remote merge/exact-master gate before annotated tag/release; verify downloaded artifacts,
post final issue scope/validation/follow-up with real links,close only when criteria satisfied.

## Execution log

### C0 — 2026-10-21

Verified local/remote master15b88c6 and untracked user debug inputs. Connector write403;
authenticated GitHub CLI created/verified issue110. Dedicated local feature branch created.
Approved contract and decisions recorded. Implementation/qualification pending.

### C1 — 2026-10-21

Separate native quick job and server-owned typed capture/proposal/live/apply path.
Partial/attached-H/exact masks, cancellation, stale revision, immutable originals,
coordinate-only atomic publication and exact Undo/Redo are exercised by six passing
new tests without AmberTools. Ruff/mypy pass; four pre-existing native live scientific
tests pass with configured AmberTools. C1 intentionally awaits C2/C3 context/repair
and C4 client publication. No full feature claim.

### C2 — 2026-10-21

Local spatial/covalent/residue discovery, observed protein templates and disposable
ACE/NME caps now build a native interfragment field. Reduced bounded segments extend
captured context and compare both energies under the final model. Apply rediscovers
current final surroundings, guarding newly nearby context. Eight quick tests and
Ruff/mypy pass; native attractive forces agree with independent finite differences.
1STP local field is about850 atoms; mixed masks/caps are exercised. Local warned
solver probe about1.1s is diagnostic, not full cold workflow qualification.

### C3 — 2026-10-21

Bounded order perception retains connectivity/assigned facts; missing legacy isotope/
radical metadata no longer gates quick work. Separate native repair constraints retain
known graph/state and report omissions/penalty units. Unsupported fixed sites are steric
obstacles while supported components keep native contributions. Repair targets remain
original when candidate neighbor lists rebuild. Deterministic collocated mover offsets
leave fixed rows exact. Sixteen quick tests/Ruff/mypy pass, including byte-exact copies
of all three supplied inputs and real raw paracetamol upload/Apply preserving chemistry
and originals. C4/UI and complete compatibility/performance gates remain pending.

### C4 — 2026-10-21

Default quick Ctrl+M/lightning now uses server capture and owning-client automatic
publication; real native steps reuse render-local preview. Cancel/late callback/
inspection/remount ownership have focused unit coverage. Quick settings retain explicit
context/H/repair controls and an independent Advanced AMBER entry. Existing native
AMBER scenarios explicitly select Advanced; their scientific assertions remain intact.

Sixteen Python quick tests and310 web tests pass, with Ruff/mypy/lint/type/build. All
three supplied structures pass real desktop/mobile auto-Apply/Undo/Redo/reload. Native
quick/Advanced320px theme/axe/focus tests and retained Advanced isolated workflow pass.
Initial remount-ownership/launcher-focus failures were corrected and affected native
tests rerun. A mobile fixture setup stalled before minimization while repetitively
selecting atoms; whole-structure tests now use the native structure query. No full
release or cold-performance claim yet; C5 qualification remains.

### C5 — candidate preparation, 2026-10-21

Independent pair sums/finite differences verify native exclusions/scaling/dielectric,
with real boundary masks, protein states, raw1STP and guarded context extension. Added
stereo, isolation, sparse IDs/inactive conformers, changed/hidden/locked context, native
cancellation, no-op/archive and generic-capture refusal cases.38 focused Python tests
pass. Actual tagged0.22.1 reader preflight retains four new quick cases. Version0.23.0
is an additive minor; all five sources updated without dependency/schema changes.

Consequential review fixes: initialize combined native ring information; honor supplied
H/assigned connectivity and aromatic evidence; never accept abnormal solver stops; retain
full temporary model/candidate helper states; use coordinate batches with existing
warning-summary actions; validate final immutable-context proofs and newly changed
negative dependencies; keep App outside quick presentation subscriptions.

Native preflight fixed the18k start/paint/longest-task failures without relaxing gates.
Cold small/pocket/18k now pass about1.4/2.4/4.4s,12–52ms feedback/max task241ms. Pinned
live first frame904ms/Cancel40ms and actual100–200%zoom pass after startup polling and
settled-native-layout checks. Complete frozen candidate/reverse-reader/release gates
remain pending; no release completion claim.

### C5 — candidate attempt1 diagnostic and correction

The frozen candidate0a47553 passed dependency installs, fresh0014 migration, Ruff and
mypy. Full Python collected1146:1118 passed,28 failed solely at the archive helper's
obsolete0.22.1 version assertion. It stopped there; remaining gate commands did not
run. Retain attempt1 logs/fingerprints as diagnostic evidence. The corrected archive
file passes33 tests, now including retained0.22.1 cases. Review also corrected shared
coordinate-cache seeding to refresh full provenance/warnings and update only active
conformer rows; regressions cover Apply/Redo and Undo after reload. Restart the entire
frozen candidate gate after committing passing fixes. No acceptance limits changed.

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
