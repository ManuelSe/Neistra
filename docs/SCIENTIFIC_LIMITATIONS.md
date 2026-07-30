# Scientific Limitations

Status: Milestone 4

MolWeave v0.1 reports known uncertainty but does not replace specialist
structure preparation or validation software.

## Macromolecular Formats

- PDB and PDBx/mmCIF connectivity does not establish reliable ligand bond
  order. Imported connection bonds therefore use `order: null`.
- Alternate locations are distinct atom records with their identifiers and
  occupancies. MolWeave does not choose or optimize one alternate state.
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

## Conversion And Viewing

- No normalized conversion is assumed lossless. Export warnings enumerate known
  coordinate, conformer, hierarchy, metadata, connectivity, charge, and stereo
  losses; blocking losses require acknowledgement.
- The original upload remains the source of truth for fields not modeled by
  `NormalizedStructureV1`.
- Mol* renders application-owned representation, component, label, and camera
  settings. Viewer state is a disposable projection; named scenes store typed
  MolWeave settings and never Mol* snapshots.
- Mol* requires WebGL. Unsupported or disabled WebGL produces an explicit error;
  it does not affect stored molecular state.
- At or above 250,000 atoms, MolWeave substitutes line rendering for surfaces
  and suppresses dense atom/residue labels with a visible reduced-detail
  notice. The threshold is not a performance guarantee; browser, GPU,
  representation, and topology still determine interactivity.

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

These limitations and all per-structure warnings remain visible without
preventing retrieval of the original bytes.
