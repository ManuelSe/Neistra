# Molecular interactions

Open **Interactions** (network icon) in the viewer menu bar. Choose independent
interaction types and **Inter** / **Intra** scopes. Opening the panel alone does
not start analysis; turning every type or scope off hides markers. Choices last
for the current project session and survive renderer remounts. Switching projects
or reloading restores defaults: types off, Inter on, Intra off.

Analysis uses immutable normalized structures from visible entries in the current
workspace Cartesian frame. Separate entries have no cross-entry covalent bonds.
Disconnected small molecules inside one entry remain separate molecules. Source
polymer instances stay together when coordinates change. It does not apply
crystallographic symmetry, periodic boundaries or automatic alignment.

Results are geometric screening, not evidence of binding or an energy estimate.
**Partial coverage** means some chemistry or connectivity could not be assessed;
zero detected does not imply a complete assessment. Help shows preparation
guidance and structured warnings. Unsupported metal coordination and unresolved
alternate sites are skipped. Analysis-only templates never change molecular
artifacts, original uploads, history, jobs, scenes or archives.

Markers pause during coordinate previews. Cancel restores matching committed
results; Apply analyzes the new committed artifacts. Type/scope and visibility
changes filter a cached analysis. Camera, selection and theme do not rerun it.

The fixed `interaction-v1` clash rule uses pinned RDKit element radii and at least
0.4 Å overlap, with exclusions through three covalent bonds. Incomplete covalent
connectivity suppresses within-molecule screening. Analysis has explicit limits:
100,000 atoms, one million candidate admissions, 20,000 records, 30 seconds, and
one active request per API process. A limit failure returns no complete result.

Hydrogen bonds require chemically typed donors/acceptors and supplied explicit H.
Markers connect H to the acceptor heavy atom. Donor–acceptor ≤3.5 Å, H–acceptor
≤2.5 Å, donor–H–acceptor ≥130°, and applicable H–acceptor–heavy-base ≥90°.
Undefined required geometry is skipped. Qualified H-bond contact pairs are exempt
from clash detection even when H-bond display is off. Deliberately hidden polar H
hides its markers; no automatic preparation or donor-heavy substitute is used.

Hydrophobic contacts connect nonpolar carbon pairs within 4.0 Å, requiring an
established carbon/hydrogen-only neighborhood and local covalent exclusions.
Small-molecule typing validates supplied bond orders and charges with pinned
RDKit. Canonical amino acids use only observed, unambiguous OpenMM template sites;
missing/contradictory sites and uncertain ligand chemistry produce warnings.

π–π requires complete aromatic 5/6-member rings, center distance≤5.5 Å and either
parallel planes (acute angle≤30°, both offsets≤2 Å) or T geometry (angle≥60°,
minimum offset≤2 Å). Ring plane RMS≤0.1 Å; degenerate rings are unassessable.
Cation–π connects a positive charge-group center to a ring center within 6.0 Å,
offset≤2 Å and vector≤30° from the ring normal. Salt bridges use opposite charged
groups with nearest group site≤4.5 Å and no H-bond angular requirement. Shared
carboxylate/guanidinium charge sites produce one group marker. Salt and H bonds
can both be present. Patterns and colors distinguish all six marker types.

Canonical ASP/GLU negative and LYS/ARG positive side-chain conventions are warned
analysis assumptions only when supplied charges/protonation do not contradict
them. Histidine and terminal charges are never assumed. Histidine acceptor N
requires observed tautomer evidence. Neutral ionizable groups are not cations.
Protein connectivity uses observed template bonds and warned consecutive source
peptide links within a polymer instance, preserving grouping under movement.
Missing heavy atoms, gaps or ambiguous cross-residue links suppress affected
scope-dependent results or unsafe within-molecule exclusions. Chemically defined
ligands use supplied graph evidence; CCD assignment remains separate.

An immutable cached superset can serve hidden/deleted-entry subsets without a new
request; revealing a new or changed artifact requires analysis. Coverage warnings
remain conservative for that superset. Busy/limit/timeout errors never publish a
truncated result; use the retry icon after resolving the cause. CCD ligand
assignment is tracked separately in [#52](https://github.com/ManuelSe/Neistra/issues/52).
