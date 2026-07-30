# Normalized Molecular Schema

Status: `NormalizedStructureV1`, Milestone 2

`NormalizedStructureV1` is the application-owned molecular authority. Gemmi,
RDKit, and Mol* objects are adapters or projections and are not persisted as
project state.

## Identity And Coordinates

- Atom and bond IDs are stable, entry-local, contiguous one-based integers.
- Every bond endpoint must reference a current atom and cannot self-reference.
- Every conformer contains one float64 `(x, y, z)` tuple per atom.
- `active_conformer_id` names the coordinate set projected onto each atom's
  convenience `coordinates` field.
- Source array position is retained separately as zero-based `source_index`.

## Records

```text
NormalizedStructureV1
  schema_version: 1
  title
  structure_type
  source: SourceFacts
  active_conformer_id
  chains: Chain[]
  residues: Residue[]
  atoms: Atom[]
  bonds: Bond[]
  conformers: Conformer[]
  metadata
  annotations
  warnings: MolecularWarning[]
  inferences: InferenceRecord[]
```

Chains have an application ID, source name, and entity type. Residues keep
author number, label number, insertion code, component type, and chain
reference separately. Atoms retain name, element, coordinates, residue,
formal charge, alternate location, occupancy, B factor, source index, and
inferred-field markers. Bonds retain endpoints, optional order, aromaticity,
stereo text, and an inference flag.

`SourceFacts` identifies the safe filename, adapter format, multi-record index,
model count, source categories, and format-specific facts. `MolecularWarning`
has a stable code, message, operation, severity, affected field, and blocking
flag. `InferenceRecord` names generated chemistry or coordinates and may cite
the affected atom/bond IDs.

## Persistence And Projection

The normalized document is immutable artifact content with media type
`application/vnd.molweave.normalized-structure+json`. Entry commands reference
artifact IDs. Original upload bytes are a separate immutable artifact.

The project response returns only counts and warnings. Visible entries are read
through the lazy structure endpoint, which also generates a disposable
PDBx/mmCIF projection for macromolecular/complex/solvent entries or SDF for
ligands. Mol* state and viewer snapshots are never used to recover a project.

Incompatible changes require `NormalizedStructureV2` and explicit migration or
conversion. Readers must not guess at unknown schema versions.
