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
