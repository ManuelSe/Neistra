# Molecular model and operation intent

Neistra's normalized model is the authoritative authored structure. The viewer is
a projection. Original uploads and source facts describe the original evidence;
current atoms, bonds, coordinates and annotations describe the scientist's draft.
Editing never rewrites source facts to make the draft appear prepared.

A draft can contain missing atoms, isolated sites, unknown charges/orders, unusual
valence or conflicting annotations. Structural integrity (valid references,
identities and coordinate rows) is required for storage. Chemical plausibility is
a separate, operation-specific question. Unknown charge is null, not neutral;
unknown bond order is not single. Missing explicit H does not establish a chosen
protonation state or promise that a format reader will retain the literal graph.

## Import and building

Import preserves the original bytes and records parsing/conversion assumptions.
Direct atom/bond/coordinate edits are literal reversible changes. They do not imply
valence repair, protonation, energy minimization or preparation. Explicit values
and generated/inferred coordinates remain distinguishable through inferred fields,
operation warnings and inference records. Navigation categories do not determine
chemical editing eligibility; authoritative bonds can cross component boundaries.

## Hydrogen completion

Completion adds H only. Existing H, heavy-atom coordinates and original source
facts remain unchanged. Automatic counts require an assigned target charge and
known incident canonical bond orders. The initial profile covers neutral C,
N0/+1, O0/-1/+1, neutral divalent S and neutral F/Cl/Br/I. These are local valence
rules, not protonation-state prediction. Aromatic perception uses bounded complete
specified chemical contexts; an uninterpretable context produces a site diagnostic.
Unknown or unsupported sites can still be edited explicitly.

A proposal fits ideal linear, trigonal planar or tetrahedral coordination using
proper rotations and approximate covalent bond lengths. It does not reflect or
move retained coordinates, embed a parent or optimize geometry. Underdetermined
orientation, angle mismatch and close contacts need inspection. Independent
supported sites may complete while others skip. Per-site additions must succeed in
every retained conformer; each conformer gets independently generated coordinates.
Generated atoms inherit the actual parent's residue and alternate-site identity;
conflicting alternate geometry is not silently resolved.

Current stereo is reconciled from retained 3D geometry after consistent H
representation in a temporary analysis copy. An absent tag is not an automatic
refusal. Changed dependent tags may be re-expressed or cleared, with warnings.
Disconnected annotations and original source facts remain unchanged. Conformer
disagreement cannot be represented as one agreed current tag. A genuinely new
configuration not determined by retained geometry requires an explicit placement
choice. Neither an inferred tag nor a successful completion certifies preparation.

Completion is bounded and synchronous. Reports distinguish completed, unchanged,
skipped and budget-unprocessed sites; capped detailed diagnostics retain full
reason counts and a truncation indicator. No site is partially added across
conformers. Optional completion cannot discard a successful direct edit, and
explicit H deletion is preserved instead of immediately restoring deleted H.

## Preparation, analysis and export

Preparation has stronger prerequisites and a distinct purpose. Protein preparation,
cleanup, force fields, protonation and optimization retain their own explicit
workflows and limitations. Ordinary building does not silently invoke them.

Analysis must state what chemistry it consumes. Distance measurements can use draft
coordinates; chemistry-dependent interactions/properties may be unavailable or
uncertain. Jobs receive immutable input snapshots, never mutable viewer state.

Native artifacts and project archives retain the literal draft, unknown values,
source provenance and conformers. Chemical formats have different representability
and implicit-H conventions: export may warn, require loss acknowledgement or refuse
an unrepresentable structure. Do not repair the canonical graph merely to make an
export pass. Native archives contain current state, not portable Undo history.

No persistent geometry/count constraints are introduced. Building choices describe
one operation; they do not impose future preparation or analysis intent. Reopen
and Undo/Redo use the same existing normalized artifacts and command history.
