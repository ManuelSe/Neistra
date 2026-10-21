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
