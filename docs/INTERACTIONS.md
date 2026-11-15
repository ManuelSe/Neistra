# Molecular interactions

Open **Interactions** (network icon) at the right end of the viewer quick-action
toolbar. Choose independent interaction types and **Inter** / **Intra** scopes.
The eye control hides/reveals markers while retaining types, scopes, target and
appearance. A quick eye action is also available beside the configured launcher.
Opening, closing or collapsing the panel does not change molecular data. Opening
alone starts no analysis; no category is automatically enabled. Choices last for
the current project session and survive renderer remounts. Switching projects or
reloading restores types off, Inter on, Intra off and default appearance.

## Targets and contact inspection

**All visible** uses current visible entries. **Ligand** requires an explicit
assigned instance choice; repeated names/copies remain separate. A navigation
component is not universally an entire multi-residue molecule. Known links to
another nonpolymer instance require explicit selection rather than guessed grouping.
This target is transient and does not create a durable ligand designation.

**Selection** captures exact existing atoms only when **Use current selection**
or **Update from selection** is activated. Later selection changes, including
Select atoms in contact details, do not change that target. Contacts touching one
captured participant site and not the other are included. Complete donor/H, ring
and charge groups are retained; no partial-ring chemistry or global selection
expansion is performed. Inter/Intra remains the scientific molecule relationship.

Captured selection IDs survive valid coordinate/chemistry changes. A whole-ligand
target additionally requires identical full instance membership; adding/removing
members requires deliberate Update. Invalid targets are never silently pruned or
replaced. Hidden targets retain their identity. Missing current ligand data means
validation is pending, not that the target has disappeared.

Open **Contacts** to inspect a paged list, with at most 30 rows displayed at once.
Details identify canonical entry/residue/atom participants and named evidence in
Å/degrees. **Focus** changes the camera for an installed eligible contact;
**Select atoms** explicitly selects the full participant union. Neither action
changes chemistry or the captured interaction target. Old details retire when
immutable analysis inputs change. Passive canvas lines do not intercept molecular
picking. Contact-specific canvas text and the separate 2D diagram are not included.

**Warnings** groups input explanations by entry and cause, retaining distinct
messages and exact known affected IDs. Select affected atoms is available only
when those identities are current. Known IDs are not a claim that all affected
sites were mapped. Follow the explicit preparation guidance; no automatic repair
or hydrogen generation occurs. Scientific criteria remain in Help; category
color/width/reset controls are under **Advanced appearance**, for this session only.

## Counts and readiness

Detected counts describe qualified records for current visible-entry analysis
inputs, the captured target and scopes; a reusable cached superset does not add
excluded entries back into this count. Component/H/isolation display gates within
those entries can suppress shown markers without removing detected records. Counts
do not mean unique residue partners or complete chemical assessment. Shown
counts acknowledge eligible native installation for the current display generation,
including native hydrogen visibility. Installed records may be occluded or outside
the camera view. Pending/error/preview states cannot claim an exact shown count.
Hidden participants can therefore yield zero shown while qualified records exist.
Coincident interaction endpoints also prevent a nonclash line from being drawn;
that contact remains detected, with its full participants and metrics available.
Details explain the unavailable marker, disable Focus under the installed-marker
policy, and retain Select atoms. The existing coincident-clash cross remains drawn.
The closed launcher uses distinct supplementary pause, uncertainty, loading and
error cues alongside its accessible status description.

Input coverage is conservative: the existing typed/radius-bearing atom counters
and warnings are not per-kind eligible-site or pair completeness percentages.
Partial/unavailable guidance must not be interpreted as an independently measured
percentage of every potential interaction family.

## Scientific profile and lifecycle

Analysis uses immutable normalized structures from visible entries in the current
workspace Cartesian frame. Separate entries have no cross-entry covalent bonds.
Disconnected small molecules inside one entry remain separate molecules. Source
polymer instances stay together when coordinates change. It does not apply
crystallographic symmetry, periodic boundaries or automatic alignment.

Results are geometric screening, not evidence of binding or an energy estimate.
**Partial coverage** means some chemistry or connectivity could not be assessed;
zero detected does not imply a complete assessment. Warnings shows preparation
guidance and grouped structured warnings. Unsupported metal coordination and unresolved
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

Drawing has a separate ceiling of **500,000 conservatively estimated line
segments** for the entire current overlay. A single unusually long group-center
marker can exceed it even when the scientific result is below 20,000 records.
Preflight refuses the whole overlay before native allocation or previous-buffer
mutation. It does not truncate contacts, simplify patterns, substitute endpoints
or change detection. The error keeps detected contacts, evidence and Select atoms
available; Focus and confirmed shown counts stay unavailable. Narrow the target
or choose fewer types to recover from cached analysis. This is a drawing admission
bound, not a promise of latency or total browser memory at the ceiling.

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

Exactly coincident clash endpoints use a three-axis cross centered at their true
shared coordinate (0.15 Å half-length). This is a marker, not inferred molecular
geometry. Native overlay updates reuse attached geometry buffers; type additions
and coordinate changes preserve current endpoints and group/color assignments.

Observed acid H conflicting with supplied negative ASP/GLU side-chain charge
suppresses its acid oxygen typing and ionic/H-bond markers, with an explicit
warning. Resolve the contradictory input; no replacement protonation is guessed.
