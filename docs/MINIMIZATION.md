# Selection minimization

Select atoms and press **Ctrl+M** or the lightning icon beside **Edit molecule**.
Quick minimization starts immediately and applies a usable result as one
**Undo: Quick minimize selection** edit. Empty selections require an explicit choice;
there is no implicit whole-scene minimization. Selection changes cannot retarget work.

Selected atoms and their directly attached existing terminal hydrogens move by
default. Unselected binding-site atoms stay fixed. To move a side chain or nearby
residues too, select them explicitly. Settings beside the lightning icon lets you
turn off attached-H expansion for an exact atom mask, choose surroundings, disable
approximate repair or change the default500 iterations (range1–2000).

Automatic surroundings use visible entries, including their display-hidden atoms.
Selected entries always participate even if hidden. **Selected molecules only**
retains bonded context and excludes disconnected neighbors even inside the same entry. **Choose surroundings** permits
explicit hidden-entry context. A local6Å sphere plus2Å guard skin includes whole
encountered residues, small molecules and at least three covalent bonds around movers.
Observed standard protein fragments use fixed temporary ACE/NME boundary caps;
no whole-protein force field is built for ordinary ligand cleanup. Context extends
between bounded optimization segments and is rechecked around final coordinates.

Quick work uses bundled RDKit/SciPy without an AmberTools installation. It prefers
native MMFF94 with bonded, van der Waals and electrostatic interactions between
fragments, using a distance-dependent dielectric scale4. UFF fallback discloses
omitted electrostatics. Current assigned chemistry takes precedence; observed
protein templates and bounded ligand bond-order inference may supply temporary
unknown facts without changing connectivity. Missing historical isotope/radical
metadata alone does not block cleanup; known evidence remains protected.

Missing protein states use conventional temporary defaults: ASP/GLU negative,
LYS/ARG positive, neutral CYS/TYR and epsilon-H HIS unless supplied state/H evidence
specifies otherwise. Assumptions are reported; no pH prediction, missing heavy atom
or loop completion is performed. Temporary hydrogens and boundary helpers have no
canonical atom IDs and are never added to the saved structure.

When a draft cannot be parameterized, **Approximate repair** uses explicit native
bond/angle/planarity and overlap constraints. Unsupported fixed sites remain steric
obstacles while supported native components retain their forces. Reports identify
affected sites, assumptions and omitted electrostatic/coordination terms. Full repair
objectives use **penalty** units; they are not physical energies or binding scores.
No attraction, metal coordination or protonation is invented for unsupported sites.

The report distinguishes maximum-force convergence from a useful limited improvement.
Usable candidates must be finite, improve the same final objective, preserve declared
stereochemistry and exact fixed rows, and introduce no new nonbonded pair below0.6Å.
A relative-tolerance, iteration or cooperative time stop may apply with a warning;
that does not establish force convergence. No-op results create no history. Cancellation,
hard worker failure and invalid output cannot apply. Limits are2000 movable canonical
atoms,20000 local atoms including helpers and100 participating entries. Optimization
has a15s cooperative budget and the worker a30s deadline; these are upper bounds,
not a universal latency guarantee.

Only the active owning client automatically applies. **Cancel**, closing the panel,
changing tools/projects or leaving that client disarms late publication and clears
preview. Viewer remounts preserve the session. Reload and **Inspect minimization**
show retained reports without rearming automatic publication. Saved chemistry and
original files stay unchanged; only mapped selected active coordinates are published,
with provenance/warnings. Undo/Redo restores exact artifacts and inactive conformers.
An applied job cannot apply again, even after Undo. Original uploads remain available.

Live rendering uses real accepted optimizer steps at most five times per second.
Measurements, surfaces and interactions pause during preview. No animation is invented
for short runs. Exports use saved geometry until application. All quick input/model/
report/proposal artifacts are retained in Jobs; archived proposals remain historical.
Changed selected/local context, locks, conformers or final surroundings block publication.

## Advanced prepared AMBER

**Advanced AMBER** retains the existing preparation requirements, complete-component
context and explicit Apply workflow. The following sections describe that profile;
its API, scientific contracts and historical reports remain unchanged.

Advanced automatic mode includes complete covalent components/protein chains containing
selected atoms, plus complete components within12Å of those mandatory components.
Discovery is nonrecursive, across entries and independent of visibility. The server
captures current active conformers and reports the resolved fixed context. No nearby
component is silently omitted because it cannot be parameterized; the job refuses
with a preparation/unsupported-chemistry diagnostic. If no additional component is
nearby and only one component is required, the report explicitly identifies isolation.

**Advanced AMBER** in minimization settings opens prepared-model setup. Change iterations or choose **Isolated molecule** / **Explicit environment**.
An isolated calculation includes the complete selected molecule; explicit environment
lets you choose additional complete chains/molecules. **Show all components** exposes
distant manual candidates. The setup lists counts and active conformers. Automatic
multi-entry selections need no separate manual context selection. No entry merging
or cross-entry covalent bonds are created.

The model requires the separately installed [locked native toolchain](../tools/README.md)
on Linux x86-64, complete assigned topology, explicit existing H and supported
chemistry. Both the API and worker need `MOLWEAVE_AMBERTOOLS_PREFIX`. Normal
application startup and editing still work when it is missing. Use separate
preparation tools for missing atoms/H, protonation or unknown chemistry; this
operation never repairs them. Protein display connectivity is insufficient.
Unknown/unsupported inputs produce whole-calculation diagnostics, not a partly
parameterized success. Covalent protein–ligand adducts, crosslinks, metals, ions,
unsupported cofactors and arbitrary modified residues are outside this profile.
GAFF components require carbon-containing organic chemistry; charged organic
ligands remain eligible, while explicit inorganic ion components refuse. Complete
canonical waters use the separately qualified TIP3P path.

Only captured selected coordinates are optimizer variables. Included unselected
atoms, including H, stay exact. Original uploads, topology, IDs, metadata and
inactive conformers remain unchanged. The model combines ff14SB proteins, GAFF1.81
organics with AM1-BCC charges and optional complete neutral TIP3P waters. Isolated
molecules use nonperiodic NoCutoff; environment mode uses a 12 Å nonperiodic cutoff,
10 Å LJ switch and reaction-field dielectric78.3. This is local model relaxation,
not a binding-energy estimate, global search, native-pose certificate or solvent
simulation. Inspect residual contacts and scientific warnings independently.

Jobs run in the background. Cancel immediately clears temporary coordinates and
requests worker termination. Closing/discarding the panel or changing tools/projects
also ends preview and requests cancellation. The job remains in **Jobs**, where
**Inspect minimization** opens the retained report without restoring a live session.
Changing selection cannot retarget submitted work. Drafts and previews survive
responsive viewer remounts but are transient across reloads. The persisted job and
its immutable input/model/report artifacts remain inspectable after reload.

A completed report gives outcome, initial/final energy, maximum movable gradient,
iterations/evaluations, movement, close pairs and warnings. A local solver success
must also pass the independent maximum-gradient threshold, finiteness, mapping and
stereochemistry checks. The interactive default permits **Accept unconverged coordinates** only for an
ordinary iteration limit with finite energy/forces, objective improvement beyond
numerical tolerance, valid mapping/stereo/fixed rows, and no new nonbonded pair
within0.6Å. That named action explicitly acknowledges the displayed residual gradient.
It does not imply convergence or a validated pose. **Require convergence before
acceptance** in settings retains strict behavior; existing API requests default to
strict. Abnormal/line-search/evaluation-limit/cancelled/resource failures cannot
Apply, and older nonconverged reports gain no retrospective eligibility.

Live steps and final previews update actual selected display coordinates, retaining
canonical atom identities for picking. Measurements/interactions/surfaces pause
during preview; chemical exports and archived molecular coordinates use the saved
applied state. Native archives retain immutable job
proposals as historical artifacts; preview display/session state stays transient.
Discard removes the display without a molecular edit.

Apply revalidates every selected and fixed dependency, active conformer, result
digest and movable-entry lock. Changed source/context requires a new calculation;
automatic mode also rechecks discovery against current project structures and final
positions. Newly relevant omitted context blocks Apply and requires a rerun;
unrelated edits are allowed when all exact dependencies still match. Fixed locked
entries may be included; selected locked entries cannot move. One atomic Apply
updates all affected entries and creates one **Undo: Apply selection minimization**
command. Undo/Redo restore exact artifacts. Unchanged proposals create no history;
a previously applied job cannot apply again, including after Undo.

Native project archives preserve applied coordinates, provenance, report and model
artifacts. Imported archived proposals are historical and cannot Apply against
remapped entry IDs. Archive Undo history remains nonportable under existing rules.
No database or structural-schema migration is introduced. See the
[interactive plan](plans/issue-89-interactive-minimization.md) and
[verification evidence](VERIFICATION.md) for qualified cases and limits.

## Resource and identity diagnostics (issue #89 C1)

The Linux worker supervises resident memory of the calculation child and native
descendants. `MOLWEAVE_MINIMIZATION_MAX_RSS_BYTES` sets its budget (default4GiB,
minimum16MiB) for both API/worker configuration. Minimization no longer imposes a
virtual-address-space ceiling. Sampling is not a hard OS/cgroup allocation limit;
the existing setup/optimization/deadline/cancellation bounds remain in force.
`resident_memory_exceeded` reports sampled usage and budget; `memory_allocation_failed`
reports an actual allocation exception. Native/internal tracebacks remain in job logs.

Missing atom identity, identity mismatching the current element/source index, and
unknown/unsupported isotope/radical evidence identify the first affected atom and
residue. Malformed/conflicting evidence retains its underlying diagnostic cause.
The operation still requires verified ordinary identity. Newly authored atoms and
verified ordinary element replacements record applicable evidence at editing time;
unknown/protected facts are never converted into ordinary identity to permit a run.

## Parameter reuse

Minimization reuses compatible native receptor, organic and assembled preparation.
The scientific report retains cache origin and charge-input SHA256; cached files
are copied into each job's own model artifact. Preflight/mapping/finite-parameter
checks still run, and optimization uses current captured coordinates. Selection
changes permit reuse. Protein template parameters survive coordinate-only edits;
AM1-BCC ligand parameters do not survive changed charge-input geometry. This release
does not freeze ligand charges across coordinate edits or change the force field.

The disposable cache lives under the managed data directory's `cache/minimization`,
with a2GiB/128-entry default bound. `MOLWEAVE_MINIMIZATION_CACHE=0` disables reuse;
`MOLWEAVE_MINIMIZATION_CACHE_BYTES` controls bytes. Clear it only with workers idle.
Clearing affects latency, never existing projects/jobs/archives. Invalid entries
produce diagnostics and cold preparation under the same qualified model. Cache
contents are not part of portable project archives; per-job native artifacts are.

## Transient computation snapshots

The worker publishes accepted optimizer steps, at most five per second into one
latest-only private file. These are temporary, unvalidated intermediate coordinates;
they cannot be applied before successful final report publication. Frames are
excluded from durable events, model artifacts and archives. Live process validation
requires the qualified local Linux shared-PID deployment. Transport loss ends preview
without changing final scientific checks. The UI polls every200ms during its owned session, keeps one active renderer update
and only the newest pending frame, and restores canonical coordinates on Cancel or
ownership loss. Short runs may finish before any intermediate display; no animation
is manufactured. Reload starts from saved geometry.

Qualification measures prepared1STP and18k calculation fixtures with32 selected
ligand atoms. Running transport additionally uses30 selected protein heavy atoms
and the full1166-heavy-atom selection of a complete2272-atom chain. These samples
are not a universal latency guarantee near the2000-movable cap. Earlier exploratory
large-selection timings included excessive test readback and an automatic-quality
override of the intended coordinate cue detail. Bounded in-browser geometry checks
and explicit custom cue quality correct both problems; [#100](https://github.com/ManuelSe/Neistra/issues/100)
records the investigation. The passing [C5 gate](assets/interactive-minimization/c5-gate.json) records qualified
cases and timing. Final candidate/exact released-master gates and actual0.20 reader
qualification also pass; see [verification](VERIFICATION.md) and [release notes](RELEASE_NOTES.md).

Legacy structures missing identity facts can use verified original-file evidence
without a reimport or a canonical metadata edit. Recovery uses strict stable import
identity and original byte checksums, never coordinates or names alone. Unknown,
protected, contradictory or malformed facts are not made ordinary. The report/job
retains a calculation-local attestation; acceptance rechecks the original source.
Unverifiable identity still requires an explicit preparation/reimport decision.

OpenFF feasibility and the decision to retain qualified AMBER are documented in
[OPENFF_FEASIBILITY](OPENFF_FEASIBILITY.md); experimental qualification remains
[#101](https://github.com/ManuelSe/Neistra/issues/101). Fixed-only CPU evaluation
profiling identifies substantial potential work in fixed receptor terms, but no
production energy terms are omitted. Equivalence-preserving optimization is
[#102](https://github.com/ManuelSe/Neistra/issues/102). These measurements do not
establish a production speedup from term removal or accuracy across force fields.

Released as stable0.21.0 in[PR#103](https://github.com/ManuelSe/Neistra/pull/103).
Recovery does not write isotope/radical facts back into canonical annotations.
Explicit acceptance publishes selected coordinate changes with the normal operation
provenance annotation; it does not rewrite the immutable input artifact or uploads.
