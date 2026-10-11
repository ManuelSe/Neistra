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

Hydrophobic contacts connect nonpolar carbon pairs within4.0 Å, requiring an
established carbon/hydrogen-only neighborhood and local covalent exclusions.
Small-molecule typing validates supplied bond orders and charges with pinned
RDKit. Canonical amino acids use only observed, unambiguous OpenMM template sites;
missing/contradictory sites and uncertain ligand chemistry produce warnings.

Checkpoint status: clashes, hydrogen bonds and hydrophobic contacts are available.
Aromatic and ionic controls are omitted until their C3 vertical slice is complete.
