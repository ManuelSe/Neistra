# Supported Format Matrix

Status: MolWeave v0.1

| Format | Extensions | Import behavior | Export behavior and notable loss |
|---|---|---|---|
| PDB | `.pdb`, `.ent` | Gemmi hierarchy; models become conformers; alternate locations, occupancy, B factor, author numbering, insertion codes, and `CONECT` connectivity retained. Bond order remains unknown. | Writes models, hierarchy, coordinates, charge, and `CONECT`; warns for metadata, known bond order/aromaticity, and stereochemistry loss. Rejects PDB serial/coordinate field overflow. |
| PDBx/mmCIF | `.cif`, `.mmcif` | Requires PDBx `_atom_site`; models/conformers and hierarchy retained. Enumerates categories represented only by the immutable original. | Preferred macromolecular output; writes `_atom_site` and `_struct_conn`. Producer-specific and unsupported source categories are not reconstructed. |
| SDF | `.sdf` | RDKit strict parsing; each record becomes a separate entry; scalar properties and conformers retained where provided. | Writes one record per conformer and scalar properties. |
| MOL | `.mol` | RDKit V2000/V3000 parsing with coordinates, charges, connectivity, and stereo. | Writes V3000 when atom/bond counts exceed V2000 limits; one active conformer; warns for hierarchy/metadata loss. |
| MOL2 | `.mol2` | RDKit chemistry plus source SYBYL atom types; Tripos and Corina fixtures cover aromatic and carboxylate typing. | Deterministic MolWeave writer retains explicit source types when mapped and emits `un` for unknown bond order; warns for unsupported hierarchy/metadata/stereo semantics. |
| XYZ | `.xyz` | Elements and coordinates are native. Optional RDKit distance/radii connectivity inference is recorded; inferred bond order remains unknown. | Writes elements and active coordinates only. Connectivity, bond order, charge, names, stereo, and multiple conformers produce explicit warnings where present. |
| SMILES | `.smi`, `.smiles` | Each non-comment line is an entry. Optional fixed-seed ETKDGv3 generation adds hydrogens and 3D coordinates and records inference; UFF cleanup is used only when parameterized. | Writes canonical isomeric SMILES and title. Coordinates, atom names, hierarchy, metadata, and multiple conformers produce warnings where present. |

All text inputs must be UTF-8. The registry selects import adapters by safe
filename extension and export adapters by declared format name. General
crystallographic CIF without PDBx `_atom_site` is rejected rather than treated
as a biomolecular mmCIF.

## Batch And Limits

- 100 MiB per structure file.
- 500 MiB per multipart request.
- Warning above 250,000 atoms per resulting entry.
- Hard rejection above 1,000,000 atoms per resulting entry.
- Filenames are reduced to safe display basenames and never become storage
  paths.
- A complete batch is validated before any original, normalized artifact, entry,
  or command is committed.

Blocking export warnings require explicit acknowledgement before artifact
generation. The immutable original is the only lossless record of unsupported
source categories or producer-specific fields.
