# Scientific Limitations

Status: Neistra scientific limits; originally documented for MolWeave v0.2.0.

Neistra reports known uncertainty but does not replace specialist
structure preparation or validation software.

## Macromolecular Formats

- PDB and PDBx/mmCIF connectivity does not establish reliable ligand bond
  order. Imported connection bonds therefore use `order: null`.
- Alternate locations are distinct atom records with their identifiers and
  occupancies. Neistra does not choose or optimize one alternate state.
- Multiple PDB/PDBx models become conformers only when every model has identical
  atom identity. Mismatched topology is rejected instead of flattened.
- The normalized model covers core hierarchy and coordinates, not every
  PDBx/mmCIF category. Unmodeled category names are reported and their bytes
  remain in the immutable original.
- PDB fixed-width serial and coordinate limits can prevent PDB export; use
  PDBx/mmCIF when that occurs.

## Small Molecules

- RDKit sanitization defines accepted valence/aromaticity for SDF, MOL, MOL2,
  XYZ, and SMILES. A producer accepted by another toolkit may be rejected with
  a structured parse error.
- MOL2 is not fully standardized. Source SYBYL types are retained when they map
  one-to-one; generated types are deterministic heuristics and are not a
  force-field assignment.
- Resonance-equivalent MOL2 bond placement may canonicalize during RDKit
  import. Tests assert chemical equivalence and retained source typing, not
  byte-identical bond arrays.
- XYZ never contains connectivity or bond order. Optional connectivity is a
  distance/radius inference; its bonds remain marked inferred with unknown
  order.
- SMILES 3D coordinates and added hydrogens are deterministic ETKDGv3/UFF
  inferences, not experimental conformations or an energy-ranked ensemble.
- Zero coordinates are retained with a warning when a supported source has no
  coordinates and generation was not requested.

## Ligand Editing

- RDKit sanitization is the v0.1 authority for edited valence, aromaticity, and
  formal charge. Neistra rejects edits that RDKit cannot sanitize; this is not
  a comprehensive quantum-chemical or tautomer/protonation-state assessment.
- Explicit hydrogen addition uses RDKit valence inference. It does not choose a
  biologically correct pH, protonation microstate, tautomer, metal coordination,
  or solvent environment. Added atoms and coordinates are marked inferred.
- Bond rotation only accepts an acyclic single nonterminal bond and a selected
  atom set exactly equal to one component after cutting it. It does not search
  conformers, avoid all clashes, or optimize the resulting torsion.
- MMFF and UFF cleanup operates on the current coordinates and reports the
  chosen method and convergence. Explicitly requested unavailable parameters
  fail; `auto` may try MMFF then UFF. A converged local minimum is not evidence
  of the correct conformer or binding pose.
- Local cleanup fixes atoms outside the requested set. Whole and local cleanup
  can change stereochemical perception or reveal close contacts; Neistra
  compares stable-atom stereo assignments and surfaces structured warnings but
  does not silently claim preservation.
- Stable atom and bond IDs describe Neistra project identity, not source-file
  serials. Deleted IDs leave gaps and newly allocated IDs are never reused.

## Protein Editing

- Neistra pins PDBFixer 1.12 source commit
  `94cfa4c0ca551cdc5f13320f9a658efd59f2b881` and OpenMM 8.4.0 for v0.1
  protein templates and hydrogen placement. A dependency upgrade is a
  scientific change that requires fixture and regression review.
- Standard amino-acid mutation accepts only the 20 canonical residue names.
  It preserves the existing `N`, `CA`, `C`, and `O` coordinates and uses the
  pinned template for missing side-chain atoms. It does not select or optimize
  a rotamer, preserve a nonstandard side chain, or assert that the result is a
  favorable conformation.
- Template mutation and hydrogen addition require an unambiguous single-model
  polymer mapping. Alternate conformers, duplicate target atom names, or
  missing required backbone atoms are rejected instead of being guessed.
- Hydrogen addition uses PDBFixer's residue templates at the requested pH.
  It does not determine experimental protonation microstates, resolve ligand or
  metal coordination, optimize a hydrogen-bond network, add missing heavy
  atoms, or guarantee a force-field-ready system. Neistra surfaces the
  resulting uncertainty.
- Unsupported residues are retained for generic deletion and coordinate
  movement but are reported and excluded from template-based mutation or
  hydrogen inference. Terminal residues are also reported because template
  capping and protonation may require specialist preparation.
- Severe-clash warnings are a deterministic Cartesian screen for nonbonded
  atom pairs closer than 0.4 angstrom. This intentionally catches obvious
  overlaps; it is not a van der Waals, symmetry, bonded-geometry, or
  force-field validation.
- Chain rename changes authored/display labels while stable normalized identity
  remains intact. Residue renumbering changes authored sequence numbers and
  clears insertion codes. Neither operation performs sequence alignment,
  resolves author-label ambiguity, or changes polymer chemistry.
- Atom and residue deletion and movement are reversible project commands, but
  movement is an unconstrained Cartesian transform. These operations can
  create broken polymers, distorted bonds, clashes, invalid chirality, or
  chemically unreasonable structures.
- Neistra does not build missing loops, choose alternate locations, add
  caps, assign force-field parameters, solvate, neutralize, optimize side
  chains, minimize proteins, or perform a complete structure-preparation
  protocol.

## Conversion And Viewing

### Automatic component classification

- Component detection organizes current normalized identity; it does not
  validate chemistry, prepare a structure, or establish experimental function.
- Source entity/subchain/polymer metadata takes precedence when present.
  Tabulated amino-acid/nucleotide/water/buffer/sugar facts, common monatomic
  ion elements, and legacy coarse component values are documented fallbacks.
  Remaining uncertainty is exposed as `unclassified` with warnings.
- `ligand` means a putative non-polymer or cofactor component. It does not mean
  ligand of interest, validated binder, active compound, substrate, inhibitor,
  or docking input. Neistra does not rank or designate detected ligands.
- `solvent` means a recognized buffer, crystallization agent, or other additive
  fallback. It is not a claim about biological solvent relevance.
- PDB/PDBx connectivity can be incomplete. Source residue/entity boundaries
  therefore take precedence over graph connectivity: a covalently linked
  ligand remains separately selectable, and one residue is not split solely
  because recorded bonds appear disconnected.
- DNA, RNA, hybrid/PNA/saccharide/other polymers, sugars/branched material,
  ions/metals, and unknown material remain distinct categories where evidence
  supports them. Every atom remains accessible even when no narrow class is
  justified.
- Durable user labels and classification corrections, per-component styling or
  persisted visibility, ligand-of-interest state, and arbitrary component
  extraction/export are not implemented. The latter requires explicit
  boundary-bond and file-format semantics.

- No normalized conversion is assumed lossless. Export warnings enumerate known
  coordinate, conformer, hierarchy, metadata, connectivity, charge, and stereo
  losses; blocking losses require acknowledgement.
- The original upload remains the source of truth for fields not modeled by
  `NormalizedStructureV1`.
- Mol* renders application-owned representation, component, label, and camera
  settings. Viewer state is a disposable projection; named scenes store typed
  Neistra settings and never Mol* snapshots.
- Focus visible ligands is a camera-navigation aid, not ligand designation or
  chemical perception. It frames rendered atoms in application hierarchy
  `ligand` components, subject to entry, ligand-group, hydrogen, and isolation
  visibility. Water, solvent, ions, polymers, heterogens, and unclassified
  components are excluded. Mol* does not classify focus targets; use the
  surfaced provenance, warnings, and original upload when specialist
  interpretation is required.
- Mol* requires WebGL. Unsupported or disabled WebGL produces an explicit error;
  it does not affect stored molecular state.
- At or above 250,000 atoms, Neistra substitutes line rendering for surfaces
  and suppresses dense atom/residue labels with a visible reduced-detail
  notice. The threshold is not a performance guarantee; browser, GPU,
  representation, and topology still determine interactivity.

### Hydrogen display

- The viewer has three effective presentation modes: all explicit hydrogens,
  polar-only, and none. The master **Show hydrogens** setting wins over the
  preserved **Show non-polar hydrogens** preference when disabled.
- Polar-only uses the pinned Mol* `non-polar` ignore variant. It retains an
  explicit hydrogen only when projected bond connectivity associates it with
  N, O, S, F, Cl, Br, or I. Carbon-bound hydrogens and hydrogens without that
  qualifying connectivity are hidden. This element set and connectivity rule
  are a fixed display convention for this release, not a polarity calculation.
- Toggling either setting changes no atom, bond, coordinate, conformer,
  artifact, warning, inference, or original uploaded byte. It never adds
  missing hydrogens, infers bonds, assigns protonation or tautomer states,
  repairs chemistry, or identifies hydrogen bonds.
- The mode applies to inherited and exact selection-specific atomic styles and
  surfaces. Atom labels are independent: enabling atom labels does not override
  geometry filtering or make a hidden hydrogen representation visible.
- Focus visible ligands uses heavy atoms outside all-hydrogen mode. This is a
  deterministic navigation simplification, not evidence that every hydrogen
  shown or hidden by Mol* was independently classified by Neistra.
- Automated qualification uses small explicit-connectivity protein and ligand
  fixtures in pinned Chromium/SwiftShader. It does not establish behavior for
  missing or ambiguous bonds, every file-format convention, other browsers,
  hardware GPUs, WebXR, or chemically prepared systems.

### Selection-specific representations

- A style assignment changes presentation only. It does not mutate coordinates,
  topology, components, residue chemistry, original bytes, artifact identity,
  selection membership, picking granularity, or camera state.
- Atomic styles target exact canonical atom IDs. Exact Mol* bundles disable
  parent-bond inclusion, so an atomic representation does not imply that a
  covalently connected atom outside the selection is part of the target.
- Backbone and Cartoon accept only the exact complete atom set of supported
  protein, DNA, or RNA residues with required trace atoms. This conservative
  rule avoids displaying a partial residue as a complete polymer trace. It
  does not infer missing atoms, repair residue classification, prepare a
  polymer, or validate secondary structure.
- Atomic and polymer styles are independent replacement channels. A selected
  atom can retain one style in each channel; applying another style replaces
  only same-channel membership. Reset removes both selection-specific channels
  for the target so entry-level styles become visible again. Independent
  entry-level surfaces are never subtracted by these replacements.
- Thin and Thick sticks are fixed display profiles mapped to Mol* ball-and-stick
  with different radii. “Thick” is a visual distinction, not a bond-order,
  confidence, contact, or chemical-type assertion.
- Selection-specific layers use element coloring and full opacity. This release
  has no selection-specific colors, opacity, labels, surfaces, presets,
  same-channel overlays, component overrides/export, ligand designation, or
  docking semantics. Component and hydrogen visibility plus active isolation
  can hide assigned atoms without deleting their durable assignment.

## Selection And Spatial Queries

- The canonical identity is `(structure_id, atom_id)`. Viewer projections are
  disposable and map Mol* source indices through an explicit ordered normalized
  atom-ID vector. Projection writers that filter or reorder atoms must update
  that vector.
- Residue, chain, and structure selections are materialized as atom-reference
  sets. Alternate locations and symmetry copies can therefore collapse to the
  same canonical identity when they represent the same normalized atom.
- Distance selection uses current Cartesian coordinates without periodic
  boundary conditions, crystallographic minimum-image handling, alignment, or
  unit-cell transforms. Separate structures are compared in their current
  shared project frame; unaligned coordinates can make cross-structure results
  scientifically meaningless.
- Spatial work runs outside the UI thread, but the v0.1 worker uses a direct
  seed-by-candidate calculation rather than a spatial index. Very large queries
  may take time and allocate substantial worker memory even though the
  interface remains responsive.

## Measurements And Contacts

- Distance, angle, and signed dihedral values use the active normalized
  conformer's Cartesian coordinates in angstroms and degrees. They do not apply
  periodic boundaries, crystallographic symmetry, alignment, or unit-cell
  transforms.
- Degenerate angles and dihedrals are rejected rather than assigned an
  arbitrary value. The signed dihedral convention is matched between the
  Python reference implementation and the browser.
- Close-contact detection uses a SciPy `cKDTree`, excludes explicit normalized
  bonds, and returns deterministic pairs within one structure. It does not infer
  missing bonds, classify clashes or hydrogen bonds, include symmetry mates, or
  compare separate structures.
- Contact thresholds are user-supplied geometric cutoffs, not
  element-specific van der Waals validation. Results require scientific
  interpretation.

## Coordinate Transforms And Superposition

- Transforms are Cartesian rigid matrices in the current shared project frame.
  Degree rotations compose X, then Y, then Z. They do not use camera axes,
  crystallographic fractional coordinates, symmetry, periodic boundaries, or
  minimum-image conventions.
- Whole-entry rotation defaults to the active-conformer centroid. Selected-atom
  rotation can use the selected scope centroid, entry centroid, or an explicit
  finite Cartesian pivot. The same matrix is applied to the requested stable
  atom IDs in every conformer.
- Free selected-atom transforms can create distorted bonds, invalid chirality,
  clashes, or chemically unreasonable geometry. They remain unconstrained
  placement tools; use the M6 ligand rotation/cleanup operations for their
  narrower validation and force-field reports. The M7 protein editor adds
  limited template operations and warnings, not full protein preparation.
- Protein superposition is a proper float64 Kabsch fit over active-conformer
  coordinates. It requires equal, unambiguous protein hierarchy identities,
  at least three matches, and non-collinear geometry. Reported RMSD is the
  post-fit value over those matched active coordinates.
- Backbone matching supports compatible `N`, `CA`, `C`, and `O` identities.
  Neistra does not guess a sequence alignment, repair missing residues, match
  ligands by graph isomorphism, accept reflection-only solutions, or silently
  pair atoms by selection order.
- A protein fit is applied to every atom in every conformer of the moving
  entry. The reference entry and immutable original uploads are unchanged.

These limitations and all per-structure warnings remain visible without
preventing retrieval of the original bytes.

## Generic Jobs

- A job input is the entry's normalized artifact at submission time, not a
  promise that it is prepared for a particular method. Plugins must validate
  protonation, charge, bond orders, missing atoms, cofactors, metals, alternate
  conformers, search regions, and units for their scientific domain.
- Wall time, output count/size, and optional platform CPU/address-space limits
  are operational safeguards, not scientific convergence criteria.
- Worker loss produces `worker_lost` and never retries automatically. Partial
  native-library work may have occurred, but the parent publishes no result
  until the plugin returns and every artifact passes validation.
- The demonstration translation/statistics job tests infrastructure only. It
  is not docking, scoring, minimization, preparation, or evidence of physical
  plausibility.
- Importable outputs must be valid `NormalizedStructureV1` artifacts. Neistra
  validates representation and provenance, not whether a pose, score, energy,
  or ranking is scientifically correct.

## Selection appearance and neighborhood expansion

Style selection expands around active-conformer coordinates in all project
entries, including hidden entries, without making them visible. It uses inclusive
Euclidean distance and assumes entries already share a meaningful Cartesian
frame. It performs no alignment, periodic-image search, contact classification,
or binding-site inference. Residue mode completes matching residues and retains
matching atoms without residue membership.

Color follows atom-associated primitives; continuous cartoon and surface geometry
does not provide atom-shaped color boundaries. Local hydrogen preferences target
only explicit selected H. Selecting heavy atoms does not select attached H, and
polar H is unaffected by a nonpolar preference. Full-projection Mol* connectivity
owns display polarity using the established polar-neighbor convention. No hydrogen
generation, protonation assignment or chemistry repair occurs. Master hydrogen,
component and isolation bounds still apply. Fragment-surface science and capacity are described below.

## Selection fragment surfaces

Selection surfaces use only effective member atoms. Partial residues and cut bonds
can expose artificial faces and change cavities relative to a complete molecule.
No context patch, capping, repair, protonation, alternate-conformer resolution,
periodic transform, assembly generation or cross-entry fusion is performed.
Existing parse/conformer warnings remain authoritative. The fixed native Mol*
molecular-surface profile uses physical radii, a 1.4 Å probe and a 0.5 Å grid;
coordinates and chemical topology remain unchanged. Resource-limit line fallback
is explicitly labelled and must not be interpreted as a computed surface.


The increased #38 capacity preserves this same molecular-v1 profile. It admits
100,000 effective atoms, 64 million padded grid cells, 512 MiB mesh output/chunks,
1 GiB retained outputs and 2 GiB accounted active calculation buffers, with a
120-second deadline and one worker. These are independent bounds: a dispersed
or complex 100,000-atom selection can still exceed grid/mesh/working limits.
There is no automatic coarsening, residue truncation or geometry substitution.
Pinned whole-protein fixtures and a labelled synthetic lattice qualify specific
cases; they do not establish physical-phone performance or a browser/GPU memory
ceiling. Detailed current evidence belongs in PERFORMANCE and the feature plan.

## Protein pocket geometry (issue #36)

The pocket-v1 renderer computes the complete current protein component, including
supplied protein hydrogens, with the same native physical radii, 1.4 Å probe,
0.5 Å grid and 36 probe positions. Separately classified ligands, water, ions and
cofactors do not provide context. It then retains whole triangles whose centroids
are within the radius of a captured seed center, in the existing Cartesian frame.
No caps, interpolated closure faces, chemistry repair, alignment, periodic context,
conformer resolution or inferred preparation are introduced. Vertex positions,
normals, winding and receptor atom ownership remain those of the full surface.

This is a proximity view, not automatic cavity discovery, a volume/area measurement
or evidence of binding. The cutoff may leave jagged open boundaries, disconnected
pieces, or no triangles. Empty output is explicitly explained. Atomic Hide and H
detail preferences do not reshape protein context; entry/protein visibility hides
the view and isolation filters displayed owner triangles only. Colors and picks
belong to receptor atoms, not seed atoms. Fragment surfaces retain their different
selected-atom context and may coexist with pockets.

Both channels share one worker and the released capacity bounds. Temporary full
geometry, crop marks/remapping, seed index and compact output count toward active
allocation; only the compact patch and receptor identity mapping are retained.
Pocket failure/cancellation retains intent without substituting fragment geometry.
Durable pocket definitions capture stable seed references and a radius; the compact
Pocket control does not discover sites. Coordinate previews suppress obsolete
patches, including hidden-seed dependencies. If current protein context disappears,
retain valid seed intent and explain unavailable context; do not choose a replacement
receptor. Originals, supplied conformers and warnings remain unchanged.
