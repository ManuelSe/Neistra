# Selection-driven molecular editing

Issue #69 follows the [approved contract](plans/issue-69-compact-molecular-editor.md).
This document currently describes C1 only; bonds, fragments and compact residue
mutation are not yet implemented by this checkpoint. Existing advanced inspector
tools remain available.

Select atoms, open **Edit molecule** beside **Transform selection**, and choose
an element, charge adjustment or heavy-atom deletion. The nonmodal panel stays
open. Operations resolve the current canonical selection; they never choose a
default entry or require typed atom IDs/coordinates. A terminal explicit H can be
replaced by an element to grow the molecule. H substitution consumes the H ID,
creates a new heavy atom and adds its valence H in one command. Undo/Redo restores
the exact molecular artifact. New IDs are never reused after undo or branching.

Hydrogen-free prepared input may need one **Prepare component hydrogens** action
before an H can be selected. **Show explicit H** only changes existing viewer
settings. Isolation, component visibility and exact atom hiding can still hide
those atoms. Opening Edit does not add H or change chemistry. Use advanced tools
for explicit hydrogen removal; automatic saturation would undo H deletion here.

Editing requires one unlocked, connected ligand component with known formal
charges/orders, one conformer and usable coordinates. Prepared components inside
complexes use the same controls, preserving the protein and other components.
Ordinary raw PDB/mmCIF ligand chemistry is generally incomplete and is rejected,
not repaired by neutral-charge or single-bond defaults. Covalently attached
components, alternate sites, unsupported elements/stereo/metal/radical chemistry,
more than 256 heavy atoms or more than 1,024 resulting component atoms reject.
Shortcuts cover C/N/O/S/F/Cl/Br/I; S is limited to neutral divalent chemistry.
Local formal charges are -1/0/+1; aromatic element/charge edits are unsupported.

Generated bonds must be 0.65–1.35 times the sum of RDKit covalent radii. Generated
angles use the local hybridization reference: SP 180° ±20°, SP2 120° ±30°,
otherwise 109.47° ±35°. Generated atoms closer than 0.4 Å to another atom reject.
These are conservative admission screens, not a comprehensive validation of
bonding, environment, binding pose or force-field readiness. Fixed existing heavy
geometry may prevent valid H generation; collinear/degenerate input rejects
rather than being silently re-embedded. Use existing explicit cleanup tools for
input preparation. Original bytes remain unchanged.

Local hydrogen reconciliation is valence inference, not pH, tautomer or biological
protonation determination. Existing heavy coordinates remain fixed; warnings mark
unoptimized geometry and the fact that retained source labels describe the
original molecule. Supplied supported tetrahedral centers use their fixed 3D
orientation in the final normalized bond order; edits can change CIP priorities
or remove centers and require scientific review. Other stereo encodings reject.
Generated identities/method/version are recorded in inference provenance. Raw
canonical-SMILES metadata is invalidated after chemistry changes.

Warnings remain attached to the entry and are available through entry Details.
Active coordinate movement blocks chemistry edits. Complete movement explicitly
before using Edit; normal camera and molecular-selection gestures are preserved.
Empty/mixed/stale/locked targets fail with a reason rather than modifying another
entry. Project-owned asynchronous responses cannot select atoms in another project.

No new database migration is introduced. Existing project/viewer/archive2 and
normalized/selection1 remain, with Alembic0014. Prior-reader compatibility and
release publication require the later qualification checkpoints; no released
feature or rollback qualification is claimed at C1.
