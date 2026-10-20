# Selection minimization

Select atoms, then invoke **Minimize selection** (the lightning icon beside **Edit
molecule**) or **Ctrl+M**. Both start an automatic-context calculation immediately, with the current
selection captured and a maximum of 500 iterations. The shortcut ignores text
fields, modal dialogs and repeated keypresses. It shows temporary relaxation and the report. Saved coordinates change only after
explicit acceptance.

Automatic mode includes complete covalent components/protein chains containing
selected atoms, plus complete components within12Å of those mandatory components.
Discovery is nonrecursive, across entries and independent of visibility. The server
captures current active conformers and reports the resolved fixed context. No nearby
component is silently omitted because it cannot be parameterized; the job refuses
with a preparation/unsupported-chemistry diagnostic. If no additional component is
nearby and only one component is required, the report explicitly identifies isolation.

**Minimization settings** cancels/supersedes a running interactive request and opens
setup. Change iterations or choose **Isolated molecule** / **Explicit environment**.
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
cases and timing; final release/older-reader qualification remains pending.
