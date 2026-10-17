# Molecular editing

The current direct atom/bond workflow follows the
[issue #74 contract](plans/issue-74-direct-molecular-modeling.md). Direct editing and compact building are implemented; qualification and
release evidence are recorded checkpoint by checkpoint in that contract.

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
unjustified stereo labels and attach review warnings. Disconnected bond stereo remains; bond labels in an edited connected graph are
conservatively cleared because remote substituent priorities can change. Unaffected
local tetrahedral tags remain.
An unvalidated draft is not a protonation, preparation or optimized-geometry claim.
Source labels/properties can describe the original rather than modified chemistry.
Viewer projection displays drafts independently of chemical-format export.

**Hydrogen tools** separates additive completion from preparation. Choose
**Selection** or explicitly choose **Whole entry**, then **Preview completion**.
A terminal selected H identifies its heavy parent. Without selected atoms, choose
**Target entry** explicitly; there is no first-entry fallback. Supported sites can
complete while uncertain sites skip, with counts and expandable atom/conformer
diagnostics. The previous preparation HTTP helper remains available to existing
clients under its original restrictions; ordinary H building does not use it.

For deliberate incomplete-chemistry building, select one heavy atom, choose
**Hydrogens to add** (1–4), a visible **Hydrogen geometry** (default tetrahedral),
and **Preview added H**. This adds that many H without removing existing H or
assigning missing parent charges/bond orders. **Next orientation** cycles six
deterministic alternatives. Too few free ideal coordination positions produces a
no-change diagnostic; Add atom H remains available for arbitrary draft building.
Count/geometry are choices for one operation, not persistent constraints.

All standalone H building previews before **Apply placement**. Inspect the ghosts,
report and warnings through **Placement tools**; zero-addition proposals cannot be
applied from the UI. API no-op requests do not create history, advance counters,
mark dirty or clear Redo. The general inspector **Build H…** opens this same preview.

**Show explicit H** changes viewer settings only; atomic representations, isolation,
component visibility, local H preferences and atom hiding still control visibility.

Use **New molecule** in the project browser or empty-project view to name an entry
and choose its first element/charge. Carbon/zero defaults are visible; unknown
charge is explicit. The first atom starts at the origin and becomes focused and
selected only while its response still owns the active project visit/selection.
Creation is one Undo/Redo command. There is no original-file download for a
structure created in the application. Closing while creation is pending prevents
a late UI takeover; a result already stored remains in its original project.

In **Atoms → Add atom**, choose the added element and absolute charge (or unknown),
then **Preview atom**. This attaches to one selected atom, preserving existing H.
For an empty entry, choose **Target entry** explicitly and preview its first
atom at the origin. Deleting the last atom leaves that entry available for rebuilding;
there is no fallback to another loaded entry. The advanced inspector can also add
an explicitly positioned disconnected atom; its target must be chosen explicitly.

In **Fragments**, select a heavy atom to attach methyl, ethyl, hydroxyl, amino,
carboxylic acid or phenyl, or select a terminal explicit H to replace it. Terminal H
replacement needs an explicit heavy parent, but not complete charge/order chemistry.
The parent stays fixed and other H are preserved. Replacement consumes H identity
and maps it to the new root; ordinary element assignment instead retains identity.
All new records inherit their anchor's valid residue membership and alternate-site
label; terminal-H replacement prefers that H's alternate label.

A cyan, nonpickable **Placement preview** shows proposed atoms/bonds. The panel
collapses to a compact inspection bar at the bottom of the workspace so the
proposal stays visible. **Placement tools** restores inputs and warnings;
**Inspect placement** returns to the bar without recomputing. Use **Next
direction** to cycle six local directions and **Rotate fragment** for six60-degree
turns. **Apply placement** recomputes and saves one command; **Cancel placement**
discards the proposal without an artifact/history/allocator change. Selection,
project visit, revision/artifact, input, policy or tool/movement changes invalidate
it. Ghosts are not molecular atoms and cannot become canonical operands. Normal
canvas/camera gestures and explicit Transform remain available.

Only the six existing methyl-capped templates are embedded (ETKDGv3, seed690,
at most200 iterations); the parent is never embedded or minimized. Proper rigid
transforms retain template geometry. Six torsions compare distance to retained
material, with deterministic first-best ties, followed by a user turn offset.
Each conformer gets new coordinates without moving retained points. Overlap and
unoptimized geometry warn rather than block the requested draft. This is not
proof of favorable geometry, protonation or force-field readiness.

**Complete hydrogens when possible** is off by default. It attempts local
additive completion on changed/new heavy atoms and immediate canonical neighbors.
It does not require prepared components, known remote chemistry, a particular file
format or a closed ligand boundary. Existing H/coordinates stay fixed. Independent
supported sites can succeed; unsupported chemistry, ambiguous new configurations,
degenerate geometry and resource limits produce reports and warnings without
losing the direct edit. Explicit H deletion is never reversed automatically.

Completion uses the bounded initial profile and geometry-first current stereo
policy described in [Molecular model](MOLECULAR_MODEL.md). All conformers of a site
must succeed; each receives its own placement. Original stereo/source facts remain
unchanged. New XYZ imports preserve unknown charges; history is not reinterpreted.
Preparation, protonation, minimization, broad catalogues/rings and peptide growth
remain separate workflows or follow-up work.

Each edit publishes one immutable artifact/history command. Undo/Redo restores
exact molecular state; monotonic IDs are not reused after branching. Warnings
persist in entry Details. Locks, revisions, artifact ownership, valid references,
finite coordinates and aligned conformers remain required. The application entry
atom limit applies; the helper's256-heavy-atom limit is not a direct-edit limit.
No database or top-level schema migration is introduced (Alembic0014;
project/viewer/archive2, normalized/selection1). Native archives preserve drafts,
unknowns, generated/empty entries and conformers exactly. Chemical exports explain
representational defaults/losses or refuse a graph the format cannot represent;
SMILES requires assigned valid chemistry. Native bond exclusions are not portable
in chemical files. MOL2 types derive from the current draft with a review warning.
Use native archives for exact draft persistence. The actual v0.16.0 reader retains
data/history/archives but its old aromatic renderer/helpers can refuse drafts;
unrestricted runtime rollback is not supported. Back up complete managed data.
See [compatibility guidance](DEVELOPMENT.md#direct-molecular-modeling-compatibility-issue-74).

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

MOL/SDF/SMILES may interpret missing H through format valence defaults, even after
explicit H deletion. Modeled exports require acknowledgement of this limitation;
no H is added to canonical records. Use native archives to preserve the literal
draft rather than treating a chemical format as a protonation specification.


## Bond hydrogens

The Bonds panel defaults to **Reconcile local H — may add, remove or move H**.
Create, break and order controls apply immediately as one reversible command.
Choose **Preserve H** for literal incomplete/radical/over-valent draft building.
This bond preference resets per project visit and is separate from optional
additive completion for atom/fragment placement. Complete H and Add N H still add
only and preserve existing coordinates.

Enable **Preview changes before applying** for an optional inspect/Cancel/Apply
workflow. Nonpickable H ghosts, movement lines and removal crosses are transient;
the original model stays unchanged until Apply. Reports name added/removed/moved H
IDs and skipped sites. Source/protection uncertainty, unsupported aromatic/resonance
chemistry, ambiguous stereo and conformer failures retain the requested bond draft
with diagnostics. Use manual H and coordinate tools for skipped sites. Ideal H
geometry and contact warnings are not minimization, protonation or preparation.
