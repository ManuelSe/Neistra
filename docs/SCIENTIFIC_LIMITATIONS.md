# Scientific Limitations

Status: Milestone 2

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
- Milestone 2 uses Mol* default basic representations for simultaneous
  inspection. Representation, component, selection, label, and camera controls
  scheduled for later milestones are not claimed here.
- Mol* requires WebGL. Unsupported or disabled WebGL produces an explicit error;
  it does not affect stored molecular state.
- The 250,000-atom threshold is a warning, not a performance guarantee. Browser,
  GPU, representation, and topology determine actual interactive performance.

These limitations and all per-structure warnings remain visible without
preventing retrieval of the original bytes.
