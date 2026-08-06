# Fixture Provenance And Assertions

Status: MolWeave v0.1

Fixtures are committed immutable inputs. Tests must assert scientific or
format behavior, not only successful parsing. Run all scientific fixture gates
with `.venv/bin/uv run pytest tests/scientific`.

## Release Complex

`tests/fixtures/complex/1stp.pdb` is the official RCSB Protein Data Bank PDB
download for entry `1STP`, the streptavidin-biotin complex. Source:
`https://files.rcsb.org/download/1STP.pdb`; entry DOI:
`https://doi.org/10.2210/pdb1STP/pdb`. It was downloaded unchanged for release
profiling.

- SHA-256: `6fbb3d5c324e717fe7284703426e74ea58191431720daab1b2faa0bbb6430f30`
- Expected normalized type: `complex`
- Expected content: 1 chain, 1,001 atoms, 121 polymer residues, 84 waters, one
  `BTN` ligand; C572/N158/O270/S1
- Expected connectivity: 17 explicit PDB bonds, all with unknown bond order,
  and warning `pdb_bond_orders_unknown`

`tests/scientific/test_release_fixture.py` locks the checksum and every stated
assertion. The browser performance test uses the same file.

## Component Hierarchy Fixture

`tests/fixtures/complex/component_hierarchy.pdb` is a purpose-built MolWeave
regression input, not an experimental structure. It contains one GLY polymer,
one two-atom `LIG`, water, GOL additive, monatomic zinc, and NAG heterogen. An
explicit `CONECT` bond joins the polymer to `LIG`, proving that source instance
identity—not connectivity—owns component boundaries.

- SHA-256: `4cf143697c30164224ceb6771cf61718aef05d4370b61929261bf55645d48f7f`
- Expected categories: one each of protein, ligand, water, solvent/additive,
  ion/metal, and other heterogen
- Expected membership: ten atoms exactly once; ligand atoms 5 and 6 remain
  separate from polymer atom 3 despite their explicit bond
- Intended use: deterministic hierarchy integration plus desktop/Pixel 7
  selection, visibility, focus, cache, accessibility, and WebGL qualification

## Format Fixtures

The files under `tests/fixtures/formats/` are small purpose-built regression
fixtures maintained with MolWeave. `tripos_benzene.mol2` and
`corina_carboxylate.mol2` model representative Tripos- and Corina-style MOL2
typing conventions; they are minimal interoperability cases, not claims of
vendor certification. Their expected behavior is:

| Fixture | SHA-256 prefix | Expected assertion |
|---|---|---|
| `protein_models_altloc.pdb` | `54a95af37dc7c` | Two models become conformers; residue 10A and CA altloc occupancies A=0.6/B=0.4 survive. |
| `protein_models.cif` | `3e55b8620155` | Two conformers; `_exptl.` is retained as an original-only category and warned. |
| `protein_editing.pdb` | `5ef49469bfc6` | ALA/GLY/SER plus second chain, water, and zinc support hierarchy/template editing gates. |
| `ligand_conect.pdb` | `ceddfd987f08` | One explicit non-inferred bond with unknown order and a PDB bond-order warning. |
| `ethanol.mol` | `0f7eda18db9c` | Three-atom editable ligand with explicit chemistry and original-byte recovery. |
| `molecules.sdf` | `35fec5e91d93` | Two records become Ethanol and Carbonyl entries; scalar `SOURCE` survives and carbonyl order is 2. |
| `molecules.smi` | `1d542b37cb1f` | Two records; fixed-seed 3D generation is deterministic and recorded as inference. |
| `tripos_benzene.mol2` | `d06945aba16a` | Six `C.ar` atoms and aromatic bonds survive. |
| `corina_carboxylate.mol2` | `571df68c4c9e` | `C.3/C.2/O.co2/O.co2` types survive; resonance-equivalent C-O orders are 1 and 2. |
| `water.xyz` | `8462a3cbefa2` | Two inferred bonds retain unknown order; inference and warning are explicit. |
| `malformed.pdb` | `99b5427e119a` | Import fails with file/operation-bound `no_atoms`; no project/artifact partial commit occurs. |

Full hashes are reproducible with:

```bash
sha256sum tests/fixtures/formats/* tests/fixtures/complex/*
```

Adapter record counts, round trips, export-loss policy, malformed inputs,
multi-file atomicity, safe filenames, cancellation, and byte/atom limits are
covered by `tests/unit/adapters`, `tests/scientific/test_format_fidelity.py`,
`tests/unit/test_export_policy.py`, and
`tests/integration/test_import_export.py`.
