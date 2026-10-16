# Normalized Molecular Schema

Status: Neistra, `NormalizedStructureV1`

`NormalizedStructureV1` is the application-owned molecular authority. Gemmi,
RDKit, and Mol* objects are adapters or projections and are not persisted as
project state.

## Identity And Coordinates

- Atom and bond IDs are stable, entry-local, positive, unique integers in increasing
  order. Deletions leave gaps; IDs are never compacted or reused (D-028).
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
author number, label number, insertion code, coarse component type, and chain
reference separately. Optional `source_entity_id`, `source_subchain_id`,
`source_entity_type`, `source_polymer_type`, and `source_residue_kind` fields
retain adapter facts used by component classification. Their `null` defaults
keep pre-v0.3.0 normalized artifacts valid without rewrite. Atoms retain name,
element, coordinates, residue,
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
ligands. That response also derives `ComponentHierarchyV1` from the normalized
document. The hierarchy is not persisted into normalized bytes, project state,
or the archive manifest; it is reproducible from current stable identities and
optional source facts. Mol* state and viewer snapshots are never used to
recover a project.

`ComponentHierarchyV1.schema_version` is independently 1. Components carry an
opaque stable ID, one of ten documented categories, display label, chain/residue
membership, orphan atom membership where needed, classification provenance and
status, and warnings. Every atom must resolve to exactly one component.
Coordinates, list order, and labels are not component identity.

Incompatible changes require `NormalizedStructureV2` and explicit migration or
conversion. Readers must not guess at unknown schema versions.

## Authored draft metadata (issue #74)

Normalized schema1 remains authoritative for incomplete chemistry. Null charge/order
means unknown, never an implicit neutral/single assignment. Direct edits preserve
source facts, retained coordinates and stable identities, invalidate computed
chemistry descriptors and expose scientific warnings. Generated entries use
`source.format = "generated"` and explicit origin facts without an original upload.
Empty atoms/bonds with aligned empty conformers remain valid native data.

The reserved metadata namespace is:

```json
{"neistra_modeling": {"schema_version": 1, "excluded_bonds": [[1, 7]]}}
```

Each exclusion contains two distinct positive retained atom IDs, sorted within
pairs; pairs are unique/sorted. Exclusions suppress native display inference and
cannot contradict a canonical bond. Adding a bond clears that exclusion; atom
removal prunes it; generic history restores exact artifact bytes. Unknown versions,
malformed/missing references or contradictory authored state refuse further direct
publication rather than guessing. This namespace is separate from the top-level
normalized schema. Native archives retain it; chemical files cannot encode this
intent reliably. Disposable SDF defaults and Mol* overlays never write chemistry
back into these records. See [D-101–103](DECISIONS.md#d-101--direct-molecular-edits-preserve-incomplete-chemistry).
