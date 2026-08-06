# Scientific Limitations

Status: MolWeave v0.2 release candidate

MolWeave reports known uncertainty but does not replace specialist
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

## Ligand Editing

- RDKit sanitization is the v0.1 authority for edited valence, aromaticity, and
  formal charge. MolWeave rejects edits that RDKit cannot sanitize; this is not
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
  can change stereochemical perception or reveal close contacts; MolWeave
  compares stable-atom stereo assignments and surfaces structured warnings but
  does not silently claim preservation.
- Stable atom and bond IDs describe MolWeave project identity, not source-file
  serials. Deleted IDs leave gaps and newly allocated IDs are never reused.

## Protein Editing

- MolWeave pins PDBFixer 1.12 source commit
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
  atoms, or guarantee a force-field-ready system. MolWeave surfaces the
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
- MolWeave v0.1 does not build missing loops, choose alternate locations, add
  caps, assign force-field parameters, solvate, neutralize, optimize side
  chains, minimize proteins, or perform a complete structure-preparation
  protocol.

## Conversion And Viewing

- No normalized conversion is assumed lossless. Export warnings enumerate known
  coordinate, conformer, hierarchy, metadata, connectivity, charge, and stereo
  losses; blocking losses require acknowledgement.
- The original upload remains the source of truth for fields not modeled by
  `NormalizedStructureV1`.
- Mol* renders application-owned representation, component, label, and camera
  settings. Viewer state is a disposable projection; named scenes store typed
  MolWeave settings and never Mol* snapshots.
- Focus visible ligands is a camera-navigation aid, not ligand designation or
  chemical perception. It frames every currently rendered atom whose normalized
  residue has `component_type: ligand`, subject to entry, ligand-component,
  hydrogen, and isolation visibility. Water, ions, polymers, and unknown
  components are excluded. Ambiguous or incomplete source classification is not
  repaired from residue names, size, proximity, connectivity, ordering, or Mol*
  internals; use the surfaced classification limits and original upload when
  specialist interpretation is required.
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
  MolWeave does not guess a sequence alignment, repair missing residues, match
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
- Importable outputs must be valid `NormalizedStructureV1` artifacts. MolWeave
  validates representation and provenance, not whether a pose, score, energy,
  or ranking is scientifically correct.
