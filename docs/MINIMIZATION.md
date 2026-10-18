# Selection minimization

Select atoms, then open **Minimize selection** (the lightning icon beside **Edit
molecule**). **Ctrl+M** starts an isolated calculation immediately, with the current
selection captured and a maximum of 500 iterations. The shortcut ignores text
fields, modal dialogs and repeated keypresses. It opens progress and the report;
coordinates change only after **Apply coordinates**.

Use the panel to change iterations or choose **Explicit environment** before Run.
An isolated calculation includes the complete selected molecule. Environment mode
includes mandatory complete covalent components and protein chains containing
selected atoms; choose additional complete chains/molecules explicitly. Nearby
candidates are discovered within 12 Å, and **Show all components** exposes others.
Hidden entries are labelled and remain eligible. Visibility never chooses physical
context. The panel lists included/excluded candidates, movable/fixed counts and
captured active conformers. Selections spanning separate molecules require explicit
environment mode. No entry merging or cross-entry covalent bonds are created.

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

Jobs run in the background. Cancel terminates calculation work; closing the panel
keeps the job in **Jobs**, where **Inspect minimization** reopens progress/report.
Changing selection cannot retarget submitted work. Drafts and previews survive
responsive viewer remounts but are transient across reloads. The persisted job and
its immutable input/model/report artifacts remain inspectable after reload.

A completed report gives outcome, initial/final energy, maximum movable gradient,
iterations/evaluations, movement, close pairs and warnings. A local solver success
must also pass the independent maximum-gradient threshold, finiteness, mapping and
stereochemistry checks. Non-converged results can be inspected and previewed but
cannot Apply. A preview is nonpickable and cannot enter measurements, canonical
queries, exports or archives. Discard removes it without a molecular edit.

Apply revalidates every selected and fixed dependency, active conformer, result
digest and movable-entry lock. Changed source/context requires a new calculation;
unrelated edits are allowed when all exact dependencies still match. Fixed locked
entries may be included; selected locked entries cannot move. One atomic Apply
updates all affected entries and creates one **Undo: Apply selection minimization**
command. Undo/Redo restore exact artifacts. Unchanged proposals create no history;
a previously applied job cannot apply again, including after Undo.

Native project archives preserve applied coordinates, provenance, report and model
artifacts. Imported archived proposals are historical and cannot Apply against
remapped entry IDs. Archive Undo history remains nonportable under existing rules.
No database or structural-schema migration is introduced. See the
[approved plan](plans/issue-82-selection-minimization.md) and
[verification evidence](VERIFICATION.md) for qualified cases and limits.
