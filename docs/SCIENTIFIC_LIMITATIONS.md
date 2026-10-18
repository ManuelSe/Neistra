# Scientific Limitations

Status: Neistra scientific limits; originally documented for MolWeave v0.2.0.

Neistra reports known uncertainty but does not replace specialist
structure preparation or validation software.

Notification timeout applies to routine confirmations. Errors, warning-bearing
import/edit summaries, and action-required movement guidance remain visible until
dismissed or replaced; detailed scientific warning records and panels are unchanged.
Hiding a confirmation does not change or validate molecular data.

## Molecular interactions

Transient `interaction-v1` analysis is geometric screening, not binding energy.
It requires explicit donor H and chemical evidence; missing coordinates, uncertain
charges/orders, incomplete template sites, alternate locations and unsupported
metal coordination are reported. Analysis-only protein templates do not prepare
the structure. Raw PDB/mmCIF ligands receive no name/distance-based chemistry
assignment. Scope uses connectivity/source molecule instances in the current
workspace frame, without periodic/symmetry images. Incomplete covalent exclusions
suppress within-molecule clashes. Fixed thresholds and display/visibility rules
are documented in [Interactions](INTERACTIONS.md). These results are transient;
archives and history are unchanged. Known covalent modifications override residue
name conventions; unsupported modified template sites and contradictory water
charges are skipped with warnings. Disulfides are not unprepared thiol donors.
CCD assignment remains [follow-up #52](https://github.com/ManuelSe/Neistra/issues/52).

## Macromolecular Formats

- PDB and PDBx/mmCIF connectivity does not establish reliable ligand bond
  order. Imported connection bonds therefore use `order: null`.
- Alternate locations are distinct atom records with their identifiers and
  occupancies. Neistra does not choose or optimize one alternate state.
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
  formal charge. Neistra rejects edits that RDKit cannot sanitize; this is not
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
  can change stereochemical perception or reveal close contacts; Neistra
  compares stable-atom stereo assignments and surfaces structured warnings but
  does not silently claim preservation.
- Stable atom and bond IDs describe Neistra project identity, not source-file
  serials. Deleted IDs leave gaps and newly allocated IDs are never reused.

## Selection-driven small-molecule editing (issue #69 C1)

The legacy selection-edit HTTP helper accepts prepared, connected, closed ligand components with
known charges/orders and usable single-conformer geometry, including eligible
components inside complexes. It rejects uncertainty before RDKit's low-level
conversion defaults. Raw PDB/mmCIF ligand chemistry is not automatically repaired.
Existing protein/ligand inspector endpoints retain their scientific contracts.

Local H inference does not determine pH, tautomer, metal coordination or an
optimized pose. Unsupported aromatic changes, non-divalent S, radicals,
unrepresented stereo and covalent component boundaries reject. Initial H
preparation may be necessary. Fixed heavy atoms mean degenerate input can make H
generation fail; it is not silently re-embedded. Generated distance/angle/overlap
screens and supported tetrahedral orientation handling are documented in
[Molecular editing](MOLECULAR_EDITING.md); they do not certify preparation.
C2 adds six bounded fragment templates and endpoint-based bond actions.
Template-only ETKDGv3 seed690 and six fixed torsions do not optimize an environment;
ring fusion, wider element/catalogue chemistry and E/Z decisions remain unsupported.
Some bond breaks cannot saturate at fixed coordinates without clashes/angle
failures and reject atomically. See the editing guide for exact placement rules.
C3 compact mutation delegates to the existing protein service, with exactly one
complete residue operand and a complete transient result selection. It does not
extend template eligibility, automatically reconcile protein H or add Grow.

## Protein Editing

- Neistra pins PDBFixer 1.12 source commit
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
  atoms, or guarantee a force-field-ready system. Neistra surfaces the
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
- Neistra does not build missing loops, choose alternate locations, add
  caps, assign force-field parameters, solvate, neutralize, optimize side
  chains, minimize proteins, or perform a complete structure-preparation
  protocol.

## Conversion And Viewing

### Automatic component classification

- Component detection organizes current normalized identity; it does not
  validate chemistry, prepare a structure, or establish experimental function.
- Source entity/subchain/polymer metadata takes precedence when present.
  Tabulated amino-acid/nucleotide/water/buffer/sugar facts, common monatomic
  ion elements, and legacy coarse component values are documented fallbacks.
  Remaining uncertainty is exposed as `unclassified` with warnings.
- `ligand` means a putative non-polymer or cofactor component. It does not mean
  ligand of interest, validated binder, active compound, substrate, inhibitor,
  or docking input. Neistra does not rank or designate detected ligands.
- `solvent` means a recognized buffer, crystallization agent, or other additive
  fallback. It is not a claim about biological solvent relevance.
- PDB/PDBx connectivity can be incomplete. Source residue/entity boundaries
  therefore take precedence over graph connectivity: a covalently linked
  ligand remains separately selectable, and one residue is not split solely
  because recorded bonds appear disconnected.
- DNA, RNA, hybrid/PNA/saccharide/other polymers, sugars/branched material,
  ions/metals, and unknown material remain distinct categories where evidence
  supports them. Every atom remains accessible even when no narrow class is
  justified.
- Durable user labels and classification corrections, per-component styling or
  persisted visibility, ligand-of-interest state, and arbitrary component
  extraction/export are not implemented. The latter requires explicit
  boundary-bond and file-format semantics.

- No normalized conversion is assumed lossless. Export warnings enumerate known
  coordinate, conformer, hierarchy, metadata, connectivity, charge, and stereo
  losses; blocking losses require acknowledgement.
- The original upload remains the source of truth for fields not modeled by
  `NormalizedStructureV1`.
- Mol* renders application-owned representation, component, label, and camera
  settings. Viewer state is a disposable projection; named scenes store typed
  Neistra settings and never Mol* snapshots.
- Focus visible ligands is a camera-navigation aid, not ligand designation or
  chemical perception. It frames rendered atoms in application hierarchy
  `ligand` components, subject to entry, ligand-group, hydrogen, and isolation
  visibility. Water, solvent, ions, polymers, heterogens, and unclassified
  components are excluded. Mol* does not classify focus targets; use the
  surfaced provenance, warnings, and original upload when specialist
  interpretation is required.
- Mol* requires WebGL. Unsupported or disabled WebGL produces an explicit error;
  it does not affect stored molecular state.
- At or above 250,000 atoms, Neistra substitutes line rendering for surfaces
  and suppresses dense atom/residue labels with a visible reduced-detail
  notice. The threshold is not a performance guarantee; browser, GPU,
  representation, and topology still determine interactivity.

### Hydrogen display

- The viewer has three effective presentation modes: all explicit hydrogens,
  polar-only, and none. The master **Show hydrogens** setting wins over the
  preserved **Show non-polar hydrogens** preference when disabled.
- Polar-only uses the pinned Mol* `non-polar` ignore variant. It retains an
  explicit hydrogen only when projected bond connectivity associates it with
  N, O, S, F, Cl, Br, or I. Carbon-bound hydrogens and hydrogens without that
  qualifying connectivity are hidden. This element set and connectivity rule
  are a fixed display convention for this release, not a polarity calculation.
- Toggling either setting changes no atom, bond, coordinate, conformer,
  artifact, warning, inference, or original uploaded byte. It never adds
  missing hydrogens, infers bonds, assigns protonation or tautomer states,
  repairs chemistry, or identifies hydrogen bonds.
- The mode applies to inherited and exact selection-specific atomic styles and
  surfaces. Atom labels are independent: enabling atom labels does not override
  geometry filtering or make a hidden hydrogen representation visible.
- Focus visible ligands uses heavy atoms outside all-hydrogen mode. This is a
  deterministic navigation simplification, not evidence that every hydrogen
  shown or hidden by Mol* was independently classified by Neistra.
- Automated qualification uses small explicit-connectivity protein and ligand
  fixtures in pinned Chromium/SwiftShader. It does not establish behavior for
  missing or ambiguous bonds, every file-format convention, other browsers,
  hardware GPUs, WebXR, or chemically prepared systems.

### Selection-specific representations

- A style assignment changes presentation only. It does not mutate coordinates,
  topology, components, residue chemistry, original bytes, artifact identity,
  selection membership, picking granularity, or camera state.
- Atomic styles target exact canonical atom IDs. Exact Mol* bundles disable
  parent-bond inclusion, so an atomic representation does not imply that a
  covalently connected atom outside the selection is part of the target.
- Backbone and Cartoon accept only the exact complete atom set of supported
  protein, DNA, or RNA residues with required trace atoms. This conservative
  rule avoids displaying a partial residue as a complete polymer trace. It
  does not infer missing atoms, repair residue classification, prepare a
  polymer, or validate secondary structure.
- Atomic and polymer styles are independent replacement channels. A selected
  atom can retain one style in each channel; applying another style replaces
  only same-channel membership. Reset removes both selection-specific channels
  for the target so entry-level styles become visible again. Independent
  entry-level surfaces are never subtracted by these replacements.
- Thin and Thick sticks are fixed display profiles mapped to Mol* ball-and-stick
  with different radii. “Thick” is a visual distinction, not a bond-order,
  confidence, contact, or chemical-type assertion.
- Selection-specific layers use element coloring and full opacity. This release
  has no selection-specific colors, opacity, labels, surfaces, presets,
  same-channel overlays, component overrides/export, ligand designation, or
  docking semantics. Component and hydrogen visibility plus active isolation
  can hide assigned atoms without deleting their durable assignment.

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
  Neistra does not guess a sequence alignment, repair missing residues, match
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
- Importable outputs must be valid `NormalizedStructureV1` artifacts. Neistra
  validates representation and provenance, not whether a pose, score, energy,
  or ranking is scientifically correct.

## Selection appearance and neighborhood expansion

Style selection expands around active-conformer coordinates in all project
entries, including hidden entries, without making them visible. It uses inclusive
Euclidean distance and assumes entries already share a meaningful Cartesian
frame. It performs no alignment, periodic-image search, contact classification,
or binding-site inference. Residue mode completes matching residues and retains
matching atoms without residue membership.

Color follows atom-associated primitives; continuous cartoon and surface geometry
does not provide atom-shaped color boundaries. Local hydrogen preferences target
only explicit selected H. Selecting heavy atoms does not select attached H, and
polar H is unaffected by a nonpolar preference. Full-projection Mol* connectivity
owns display polarity using the established polar-neighbor convention. No hydrogen
generation, protonation assignment or chemistry repair occurs. Master hydrogen,
component and isolation bounds still apply. Fragment-surface science and capacity are described below.

## Selection fragment surfaces

Selection surfaces use only effective member atoms. Partial residues and cut bonds
can expose artificial faces and change cavities relative to a complete molecule.
No context patch, capping, repair, protonation, alternate-conformer resolution,
periodic transform, assembly generation or cross-entry fusion is performed.
Existing parse/conformer warnings remain authoritative. The fixed native Mol*
molecular-surface profile uses physical radii, a 1.4 Å probe and a 0.5 Å grid;
coordinates and chemical topology remain unchanged. Resource-limit line fallback
is explicitly labelled and must not be interpreted as a computed surface.


The increased #38 capacity preserves this same molecular-v1 profile. It admits
100,000 effective atoms, 64 million padded grid cells, 512 MiB mesh output/chunks,
1 GiB retained outputs and 2 GiB accounted active calculation buffers, with a
120-second deadline and one worker. These are independent bounds: a dispersed
or complex 100,000-atom selection can still exceed grid/mesh/working limits.
There is no automatic coarsening, residue truncation or geometry substitution.
Pinned whole-protein fixtures and a labelled synthetic lattice qualify specific
cases; they do not establish physical-phone performance or a browser/GPU memory
ceiling. Detailed current evidence belongs in PERFORMANCE and the feature plan.

## Protein pocket geometry (issue #36)

The pocket-v1 renderer computes the complete current protein component, including
supplied protein hydrogens, with the same native physical radii, 1.4 Å probe,
0.5 Å grid and 36 probe positions. Separately classified ligands, water, ions and
cofactors do not provide context. It then retains whole triangles whose centroids
are within the radius of a captured seed center, in the existing Cartesian frame.
No caps, interpolated closure faces, chemistry repair, alignment, periodic context,
conformer resolution or inferred preparation are introduced. Vertex positions,
normals, winding and receptor atom ownership remain those of the full surface.

This is a proximity view, not automatic cavity discovery, a volume/area measurement
or evidence of binding. The cutoff may leave jagged open boundaries, disconnected
pieces, or no triangles. Empty output is explicitly explained. Atomic Hide and H
detail preferences do not reshape protein context; entry/protein visibility hides
the view and isolation filters displayed owner triangles only. Colors and modified molecular picks
belong to receptor atoms, not seed atoms. Fragment surfaces retain their different
selected-atom context and may coexist with pockets.

All fragment/pocket objects share one worker and the released capacity bounds. Temporary full
geometry, crop marks/remapping, seed index and compact output count toward active
allocation; only the compact patch and receptor identity mapping are retained.
Pocket failure/cancellation retains intent without substituting fragment geometry.
Durable pocket definitions capture stable seed references and a radius; the compact
Pocket control does not discover sites. Coordinate previews suppress obsolete
patches, including hidden-seed dependencies. If current protein context disappears,
retain valid seed intent and explain unavailable context; do not choose a replacement
receptor. Originals, supplied conformers and warnings remain unchanged.

## Structure organization

A group is organizational membership of complete entries. Grouping a partially
selected structure does not extract those atoms or change the selection. Names
such as “receptor” or “ligand” express user organization, not a classification,
preparation or validation result. Membership changes preserve scientific data,
viewer presentation and job provenance; component extraction and subset export
remain separate work (#20/#21).

## Interactive movement

Move selection is unconstrained manual positioning. It applies one proper rigid
world transform to the exact captured multi-entry selection in every conformer,
around the active-conformer centroid carried by translation. This preserves
distances within the target, without constraining its relationship to unselected
atoms. Partial selections may distort crossing covalent bonds or introduce clashes.
Known crossing bonds are counted from normalized records; missing records do not
prove chemical safety. The operation neither minimizes nor repairs chemistry and
does not establish suitability for docking or preparation.

Hidden selected atoms move with visible targets; visibility is never a filter for
scientific targeting. Previews leave authoritative coordinates untouched and never
enter exports, archives or jobs. Original uploads, connectivity, charges, metadata,
warnings and previous job inputs remain unchanged. Surfaces and measurements pause
during preview and restore from the appropriate committed coordinates. See
[transform workflow](TRANSFORMS.md) for gesture, cancellation and history semantics.

## Interaction correction evidence (#55)

The supplied-chemistry and frozen2REG qualification fixtures establish defined
interaction-v1 behavior, not universal chemistry support or equilibrium geometry.
Frozen choline chemistry is explicit test input, not automatic PDB ligand typing.
Cation–π evidence covers the four literature-identified aromatic residues; separate
complete Trp rings produce multiple records. A reference contact outside Neistra's
fixed cutoff remains absent:2REG Asp45 has nearest charge-site distance4.716Å,
so it is not a salt bridge under the4.5Å profile. CCD assignment remains#52.

Contradictory observed acid H and supplied negative ASP/GLU side-chain charge
are skipped for ionic and H-bond assignments, with a structured warning. This
conservative correction does not infer a new protonation state or modify uploads.


## Independent surface appearance and source selection (issue #57)

Object identity is independent of residue/atom ownership used for themes and
modified molecular picking. Whole-object activation changes neither molecular
selection nor scientific state. Select source atoms explicitly selects current
entry content, captured fragment atoms, or full pocket protein context; seeds are
not pocket membership. Overlapping geometry uses the native foremost hit; the list
provides deterministic access to obscured and zero-opacity objects.

Solid/mesh mode uses the same geometry and fixed profile. Independent colors,
opacity and atom-color inheritance change presentation only. No surface charge,
partial-charge or electrostatic-potential contract is inferred from existing atom
fields. A focused scientific follow-up is required before offering charge colors.

Worker-output/allocation bounds include additional mesh-line/isolation buffers and
apply across identified fragment/pocket requests. They do not cap native entry
calculations, browser memory or GPU memory. A saved object can exceed rendering
limits; status retains and explains it. Hiding/removing it releases runtime work.


### Issue #69 qualification refinements

Selection edits reject unspecified potential stereo and supplied tetrahedral tags
that conflict with 3D coordinates. Final tetrahedral tags are perceived in actual
serialized bond order; newly created centers are inferred from fixed geometry,
with explicit provenance/warnings. A CIP-label change need not mean spatial
inversion. E/Z building remains unsupported. The compact mutation route refuses
explicit side-chain crosslinks rather than losing a disulfide or ligand connection;
legacy editor behavior is unchanged. An atomic representation is needed to see
explicit H; toggling H display never creates atoms or enables cartoon atom detail.


## Geometry-aware additive hydrogen building (issue #77)

Current H building uses operation-specific requirements, independently of legacy
prepared-component eligibility. Automatic local counts cover C0, N0/+1, O0/-1/+1,
S0 divalent and neutral halogens. Known incident canonical bonds count across
navigation boundaries. Aromatic contexts must be complete, specified and within
budgets; no arbitrary cut/cap or remote-unknown default is used. Explicit Add N H
can build with unknown chemistry, without interpreting it as neutral or complete.

Ideal coordination and approximate bond lengths are unoptimized proposals. Proper
rotations preserve retained geometry; existing atoms/H never move. Underdetermined
orientation, angle mismatch and sub0.6angstrom contacts with retained or proposed atoms warn.
A new configuration lacking retained geometric evidence skips automatic completion;
explicit preview records a placement choice. Current affected stereo follows 3D
geometry after consistent H representation, with warnings for changed/cleared tags.
Different conformers may prevent a universal tag. Source facts are not rewritten.

Partial completion and unchanged/unresolved results are normal, explicit outcomes.
Successful completion does not choose pH, tautomer/protonation state, force field,
energetic favorability, or full preparation. See MOLECULAR_MODEL.md for how drafts,
chemical interpretation, preparation, analysis and export differ.


### Isotope/radical protection evidence

Import now retains narrow source isotope/radical protection facts in extensible
normalized annotations. These do not supply complete canonical isotope/radical
modeling. Chemical exports warn and require acknowledgement when protected facts
cannot be reproduced; native archives and original uploads preserve the evidence.
Missing evidence is not evidence of ordinary H. Automatic local bond-H
reconciliation skips uncertain mappings and protected sites. Full isotope/
radical authoring/export remains follow-up work under the issue #81 plan.


### Local bond-H reconciliation

The separate reconcile_if_possible policy can remove/move ordinary endpoint H;
Complete H/Add N H remain additive. It requires assigned supported charges/orders
and usable source/generated identity evidence. Unknown/protected states and
aromatic reconciliation skip conservatively. Fixed collinear heavy neighbors in
substituted alkyne-to-alkene drafts cannot define an automatic trigonal plane;
manual H/coordinate choices remain available. Potential new tetrahedral identity
requires complete bounded context and retained geometric orientation. No isotope,
radical, protonation or stereo choice is inferred from absent H alone.

Every accepted site succeeds in all retained conformers. Other sites may succeed
independently while unresolved sites retain their literal H state and the requested
bond edit. Ideal local geometry and approximate lengths can still distort angles or
clash in a fixed environment; no heavy atom moves and no minimization/preparation
is performed. Source identity facts are protection evidence, not full canonical
isotope/radical authoring/export (#83). #82 owns context minimization; #71 owns
broader building. Use matching current client/API for continued authoring; older
runtime retention does not implement or enforce the new policy.

## Selection minimization — amber-local-v1 (issue #82)

[Selection minimization](MINIMIZATION.md) requires complete existing supported
chemistry, explicit H and the separately locked Linux native environment. It uses
ff14SB proteins, GAFF1.81/AM1-BCC organics and optional complete neutral TIP3P waters.
Only selected active-conformer coordinates vary; all included unselected atoms,
including H, stay exact. Preparation/protonation/repair remains a separate action.
Unknown/contradictory fields, unsupported standard states/termini, adducts,
crosslinks, inorganic ions/metals, unsupported cofactors and unqualified parameter
or mapping outputs refuse
the whole calculation. Known protein charge groups cannot compensate one another;
assigned local valence/aromaticity must be compatible with the explicit-H state.

The initial organic profile is conservative about native bond representations.
GAFF components must contain carbon and cannot be explicitly classified as inorganic
ions; noncarbon molecules require a separate qualified model. Complete canonical
water uses TIP3P. Charged organic components remain eligible. For example, native
two-single carboxylate output is not yet qualified as preserving
the supplied canonical representation and refuses. A successful positive ammonium
case does not establish all anionic/charged-ligand coverage. No silent parameter
extrapolation, force-field fallback, automatic chemistry choice or partial model.

Local convergence means the independently checked largest movable gradient
component is at most10kJ/(mol nm), with finite energy/forces, consistent mapping,
fixed mask and stereochemistry. It does not certify a global/native conformation,
binding pose, physiological microstate, clash elimination, complete preparation or
experimental force-field accuracy. Energy is the declared full local model's
objective, including fixed contributions, not a binding/solvation energy. Residual
close pairs use a0.6Å screen rather than a universal clash definition.

Isolated models use nonperiodic NoCutoff. Environment models use a12Å nonperiodic
cutoff,10Å LJ switch, reaction-field dielectric78.3 and no dispersion correction.
Complete chosen chains/components remain intact;12Å discovery does not crop them.
Native bonded terms, exclusions/1–4 scaling and dynamic neighbor handling remain.
Explicit TIP3P has unconstrained native internal distance terms, including an
auxiliary H–H engine term; no new canonical bond is made and general flexible-water
accuracy is not promised. No periodic solvent, counterions or long-range PME.

The prepared1STP benchmark preserves the full159-residue chain and all901 observed
heavy rows, with explicitly modeled terminal residues/H and disclosed generated
stereo repair. Neutral32-atom CCD biotin is a chosen benchmark state, not pH
prediction or anionic-biotin qualification. Eight translated full chains plus
ligand measure18,208-atom operational capacity, not an oligomeric pose. See
[fixture provenance](../tests/fixtures/minimization/README.md). Bounded native timing/
RSS/cancellation evidence and actual tagged preceding-reader retention do not
establish portability to other hardware/platforms or equivalent old authoring.
