# Selection-driven molecular editing

Issue #69 follows the [approved contract](plans/issue-69-compact-molecular-editor.md).
This document describes the atom, bond, fragment and residue workflow implemented
in C1–C3. Release qualification/publication remain later checkpoints. Existing
advanced inspector tools remain available.

Select atoms, open **Edit molecule** beside **Transform selection**, and choose
an element, charge adjustment or heavy-atom deletion. The nonmodal panel stays
open. Operations resolve the current canonical selection; they never choose a
default entry or require typed atom IDs/coordinates. A terminal explicit H can be
replaced by an element to grow the molecule. H substitution consumes the H ID,
creates a new heavy atom and adds its valence H in one command. Undo/Redo restores
the exact molecular artifact. New IDs are never reused after undo or branching.

Hydrogen-free prepared input may need one **Prepare component hydrogens** action
before an H can be selected. **Show explicit H** only changes existing viewer
settings. Use an atomic Style representation to see H; a cartoon alone has
no atomic detail. Isolation, component visibility, local H preferences and exact
atom hiding can still hide those atoms. Opening Edit does not add H or change chemistry. Use advanced tools
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
orientation in the final normalized bond order. Source labels that conflict with
3D geometry or leave potential stereo unspecified reject. Newly created tetrahedral
centers follow the selected H direction and are marked inferred; choosing the other
enantiotopic H can select the opposite configuration. Edits can change CIP priorities
without geometric inversion, or remove a center; scientific review remains necessary.
E/Z decisions and other unsupported stereo encodings reject.
Generated identities/method/version are recorded in inference provenance. Raw
canonical-SMILES metadata is invalidated after chemistry changes.

Warnings remain attached to the entry and are available through entry Details.
Active coordinate movement blocks chemistry edits. Complete movement explicitly
before using Edit; normal camera and molecular-selection gestures are preserved.
Empty/mixed/stale/locked targets fail with a reason rather than modifying another
entry. Project/session-owned asynchronous responses cannot select atoms in another project
or clear a newer operation after leaving and returning to the same project.

No new database migration is introduced. Existing project/viewer/archive2 and
normalized/selection1 remain, with Alembic0014. Prior-reader compatibility and
release publication require the later qualification checkpoints; no released
feature or rollback qualification is claimed at C1.

In **Bonds**, select two heavy-atom endpoints, either by a rendered bond hit in
Atom picking mode or by additive atom selection. Create a single bond when none
exists, break a known nonaromatic bond, or increase/decrease its order from one
through three. No typed bond IDs are needed. Creating a bond requires endpoints
already within the documented covalent-distance bound. Direct aromatic bond
changes and order changes requiring an E/Z stereochemistry decision reject.
Breaking a bond can disconnect a source component; a warning explains that
subsequent building requires connected topology. Fixed coordinates can make
newly saturated fragments clash or have unsupported angles; the entire edit then
rejects. Explicit movement/cleanup remains separate.

In **Fragments**, select one terminal explicit H and choose methyl, ethyl,
hydroxyl, amino, carboxylic acid or phenyl. The root replaces that H at its
original attachment direction, with new monotonic identities, complete explicit
fragment H and one history command. Source heavy coordinates remain exact.
Structural previews mark the attachment with a dot. There is no Add/Attach mode,
ring-fusion action or unrestricted fragment catalogue.

Fragment-v1 uses methyl-capped templates `CC`, `CCC`, `CO`, `CN`, `CC(=O)O`,
and `Cc1ccccc1`. The first carbon is the removable cap, and atom1 is the root.
Only the template is embedded using pinned RDKit ETKDGv3, seed690, at most200
iterations. A proper rotation aligns its cap/root axis to the selected H direction;
the root distance uses covalent radii. Six fixed 60° torsions are compared by
minimum distance to retained non-anchor atoms, with deterministic first-best
ties. The generated geometry still passes distance/angle/overlap admission.
This limited placement is not environment minimization, ring fusion, pKa
assignment, conformer ranking or proof of a favorable pose. Template/version/seed
are retained in inference provenance. All six reference graphs/formulas and
explicit H, deterministic bytes and exact unchanged atoms are scientifically
tested. Publication and actual old-reader qualification still require C4/C5.

In **Residues**, pick exactly one complete amino-acid residue and click one of
the 20 replacement names. Selecting only an atom, multiple residues or an
unsupported residue explains the restriction; there is no default residue or
typed ID. The current amino-acid name is unavailable as a no-op. The result uses
the existing pinned PDBFixer/OpenMM template service: retain present backbone
N/CA/C/O IDs and coordinates, preserve chain identity and unrelated records,
allocate new side-chain identities and expose template/terminal/clash warnings.
The complete result residue becomes selected, so another mutation needs no
reselection. Undo/Redo restores exact molecular state; ordinary transient
selection reconciles surviving IDs. Protein mutation does not invoke the
small-molecule H policy, choose rotamers or determine protonation. Explicit
side-chain crosslinks (including disulfides and ligand attachments) are refused
before template replacement. Resolve modified-residue chemistry separately. No Grow action
is implemented.

The panel stays nonmodal: canvas selection/camera gestures remain available and
outside controls retain focus. Open it by keyboard to focus its stable dialog
container, Tab through named controls, and Escape while it owns focus to return
to Edit. A submitted edit focuses the stable container before disabling pending
actions, avoiding focus loss as topology changes. Responsive remounts retain the
current section, owned keyboard focus and camera; project changes reset the session.
Camera retention is transient presentation state, separate from molecular artifacts.
A failed affected-artifact read disables edits and offers Retry molecule; it does
not undo a successful server command or overwrite newer selection.
Opening Style, Surfaces, Interactions or active movement hands off tool ownership
without restoring an outgoing tool over the new one. Active movement temporarily
replaces the launchers with its own controls; numeric preview blocks chemistry.

Viewport-bounded placement responds to resize/zoom and observed notices, keeping
the heading/Close action reachable. Scientific limits and full operation warnings
are available in labelled disclosures; persisted entry Details remains the durable
warning source. Touch controls/launcher use44px targets. H display is presentation
only and local H preferences/isolation/exact hiding can still hide an atom.
