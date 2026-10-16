# Molecular editing

The current direct atom/bond workflow follows the
[issue #74 contract](plans/issue-74-direct-molecular-modeling.md). C2 implements
basic direct editing; New molecule, attached atom/fragment previews and optional
hydrogen completion are subsequent checkpoints and are not available yet.

Select atoms, open **Edit molecule** beside **Transform selection**, and use
**Atoms** or **Bonds**. Direct editing works on incomplete normalized structures
regardless of input format, navigation classification, component boundaries or
conformer count. Covalent ligand/protein links within an entry are editable.
Select current canonical atoms in one unlocked entry; finish active movement
before editing. Selection, camera and molecular state remain separate.

Element shortcuts cover C/N/O/S/F/Cl/Br/I; **More elements and formal charge** offers
all118 recognized element symbols and absolute integer charge assignment, including
**Set charge unknown**. Unknown source charges/orders stay unknown until explicitly
assigned. The q± shortcuts need a known charge. Element assignment preserves the
selected atom's identity and coordinates, including H. **Delete selected atoms**
removes exactly those atoms and their incident bonds; it does not saturate remaining
atoms or delete other H. Deleting the last atom retains an empty, saveable entry.

In **Bonds**, select any two distinct atoms in one entry, including H, using a
native bond pick or additive atom selection. Create, break or assign unknown,
single, double, triple or aromatic order. Broken aromatic graphs and unusual
valence are allowed as draft states. No proximity, closed-component or whole-
molecule sanitization test blocks these direct operations. **Break bond** can
also remove native inferred display connectivity absent from authoritative bond
records; its exclusion persists across reload and Undo/Redo.

Direct edits preserve unrelated records, coordinates, original uploaded bytes and
source facts. They invalidate computed chemistry descriptors, clear affected
unjustified stereo labels and attach review warnings. Unchanged stereo remains.
An unvalidated draft is not a protonation, preparation or optimized-geometry claim.
Source labels/properties can describe the original rather than modified chemistry.
Viewer projection displays drafts independently of chemical-format export.

**Prepare component hydrogens** is a separate chemistry helper. Its existing
single-conformer, prepared closed small-molecule component restrictions may disable
that button while direct edits remain available. It uses valence inference, not
pH/tautomer/protonation determination, and may reject unsuitable geometry/stereo.
**Show explicit H** changes viewer settings only; atomic representations, isolation,
component visibility, local H preferences and atom hiding still control visibility.

At C2, **Fragments** retains the existing terminal-H substitution helper and its
prepared-component requirements: methyl, ethyl, hydroxyl, amino, carboxylic acid
or phenyl. It consumes H identity and places a new root with explicit fragment H
in one reversible command. The six ETKDGv3 seed690 methyl-capped templates and
bounded torsions remain the qualified template source. Direct attachment and
placement preview are not yet implemented at this checkpoint. Broad catalogue,
ring fusion, peptide growth and combining separate entries remain outside #74.

Each edit publishes one immutable artifact/history command. Undo/Redo restores
exact molecular state; monotonic IDs are not reused after branching. Warnings
persist in entry Details. Locks, revisions, artifact ownership, valid references,
finite coordinates and aligned conformers remain required. The application entry
atom limit applies; the helper's256-heavy-atom limit is not a direct-edit limit.
No database or top-level schema migration is introduced (Alembic0014;
project/viewer/archive2, normalized/selection1). Native save/archive qualification,
actual preceding-reader limitations and release publication remain C4/C5 work.

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
