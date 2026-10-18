# Synthetic minimization fixtures

`peptide-heavy.pdb` is a synthetic complete AGS tripeptide derived from chain A of
`tests/fixtures/formats/protein_editing.pdb`. It is a test graph, not an experimental
structure. The source editing fixture intentionally lacks OXT and has mirrored SER
side-chain geometry. For this independently prepared positive test fixture only,
OXT is explicitly supplied at (8.130,2.780,0.000) angstrom and SER CB/OG z signs are
reflected to the standard L state. The original editing fixture is unchanged.

`peptide.normalized.json` is a frozen derivative from the current PDB adapter and
an explicit separate `PdbfixerProteinEditor.add_hydrogens(ph=7)` preparation action,
with next atom ID17 / bond ID1. It retains all existing heavy rows, establishes
canonical template bonds and records the generated ordinary identity evidence.
PDBFixer's inferred hydrogen positions are frozen, not regenerated during tests;
exact trajectories and a unique minimum are not scientific reference claims. The
calculation under test neither repairs this fixture nor uses LEaP-generated start
coordinates. Tests compare canonical masks, energy/forces, graph mapping and
convergence, including same-entry versus separate-entry temporary assemblies.

`template-graphs.json` snapshots NALA/GLY/CSER/TP3 from the locked AmberTools24.8
`amino12.lib`, `aminont12.lib`, `aminoct12.lib` and `solvents.lib` for offline unit
refusal tests. It is explicitly derived from the model, not independent validation
of its physics. Native scientific tests read and checksum-verify the installed
libraries; numerical energy differences independently check engine forces and
exceptions are checked against AMBER's charge1/1.2 and LJ1/2 scaling. The model
manifest retains hashes of all these scientific files.

The source/raw 1STP fixture remains unchanged. A larger independently documented
prepared 1STP derivative and actual preceding-reader/performance evidence belong to
C5; this small fixture does not establish those results.

C4 prepared native browser specimens are generated offline with:

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src .venv/bin/uv run python -m tests.support.generate_minimization_fixtures
```

`isolated.molweave.zip` contains explicit-H ethanol from RDKit seed82.
`separate.molweave.zip` contains the above frozen complete AGS peptide and explicit-H
ethanol translated by(2,4,3.5)Å; `same-entry.molweave.zip` combines those canonical
specimens with deterministic ID/protection remapping. These synthetic geometries
are controlled interaction fixtures, not experimental poses. Real atomic import
publication and archive export produce the fixtures; UUID/time fields make ZIP
regeneration nondeterministic. Archives deliberately retain assigned topology and
ordinary-identity facts that a PDB export/reimport cannot fully express. Browser
tests use the real archive reader and real native calculations, with no mocked
scientific result or production fixture route. `long-alkane.mol` is explicit-H
n-octacontane, RDKit seed82, exported through the normal MOL adapter, for cancellation
during bounded AM1-BCC generation. It is not a benchmark for large-protein accuracy.

C5 `1stp-protein.normalized.json` is an explicitly prepared independent benchmark
from unchanged raw `../complex/1stp.pdb`, SHA256
`6fbb3d5c324e717fe7284703426e74ea58191431720daab1b2faa0bbb6430f30`.
`prepare_minimization_1stp.py` uses PDBFixer Reference, missing-atom seed82, full159
SEQRES residues (including absent1–12 and134–159), and explicit H at pH7. All901
observed heavy rows remain within1e-6Å. Generated terminal side chains with a negative
(N−CA,C−CA,CB−CA) scalar triple product are reflected into the standard L frame before
H placement; the procedure refuses to correct observed residues. `1stp-preparation.json`
records the exact modeled residue/chirality list. This is offline, disclosed model
preparation, not production minimization repair. Frozen H/model coordinates are not
claimed to regenerate bit-for-bit or represent experimental unresolved termini.

`BTN.cif` is the [RCSB CCD](https://files.rcsb.org/ligands/download/BTN.cif) downloaded
2026-10-18, SHA256
`9fff069dc9e0387d49c3ef62cab0867a10dae56274931a779fb87f377b9c11ea`.
`1stp-biotin.normalized.json` assigns that explicit neutral-acid graph/charges to
all16 raw BTN heavy coordinates, checks CCD S/R/S center identities independently
with RDKit, and explicitly adds H. This32-atom benchmark is not a physiological
microstate claim or qualification of anionic biotin. Waters/ions are explicitly
excluded. No distance-cropped chain, artificial cap or binding-energy claim.

```bash
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 .venv/bin/python -m tests.support.prepare_minimization_1stp
PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src .venv/bin/python -m tests.support.generate_minimization_fixtures --benchmark
```

The latter exports `1stp-protein-prepared.pdb` (all canonical CONECT edges, rounded
PDB coordinates) and `1stp-biotin-prepared.mol`. Native browser tests perform real
uploads and calculations from these formats. The larger18,208-atom case retains
eight complete protein copies translated60Å apart plus one ligand; it is an
operational capacity fixture, not a biological oligomer. Core timing uses frozen
JSON precision; browser cases separately qualify format round-trip precision.

`protein-state-graphs.json` snapshots all70 supported native internal/terminal
states from the same locked libraries. Coverage/charge/valence tests use these
graphs;26 internal-state native tests compare the snapshot to the installed library,
construct real models and check forces against central energy differences. These
model-derived graphs are coverage evidence, not independent physical accuracy or
experimental protein structures. Generated chain coordinates are deliberately
separated coverage fixtures; prepared1STP provides independent observed geometry.

C5 negative qualification also refuses monoatomic halides and explicitly classified
ion components before native GAFF generation. This does not exclude supported
carbon-containing charged ligands or the distinct explicit TIP3P water path.
