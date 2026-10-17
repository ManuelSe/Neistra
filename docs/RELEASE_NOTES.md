# Neistra Release Notes

## 0.18.0 - 2026-10-17 - Geometry-aware hydrogen building

Implemented under the [approved issue #77 plan](plans/issue-77-geometry-aware-hydrogens.md).
Published in [PR #78](https://github.com/ManuelSe/Neistra/pull/78),
[correction #79](https://github.com/ManuelSe/Neistra/pull/79) and stable
[v0.18.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.18.0).
[Publication evidence](assets/hydrogen-modeling/c5-publication.json) verifies the
annotated exact-runtime tag, release notes and downloaded evidence archive.

### Highlights and fixes

Hydrogen building now uses operation-specific local proposals. Unspecified current
stereo, original format, navigation categories and covalent component boundaries
do not impose preparation eligibility on ordinary building. The mixed explicit-H
representation regression no longer blocks completion of equivalent branches.
Supported sites can succeed independently while uncertain sites skip precisely.

**Hydrogen tools** offers selection or explicitly chosen whole-entry completion,
and **Add a chosen number of H** with count1..4, linear/trigonal-planar/tetrahedral
geometry and six deterministic orientation choices. Inspect nonpickable ghosts and
reports before Apply. The general inspector opens the same workflow. Existing H
and coordinates remain fixed, with independent placement in every conformer and
one reversible command. Zero-addition requests leave revision, dirty state,
artifacts, counters, history and Redo unchanged.

Affected current stereo follows retained 3D evidence after consistent H analysis;
source facts and disconnected annotations remain unchanged. Conflicts, conformer
disagreement, planar/collinear ambiguity and resource-limited assessment warn.
Temporary analysis H cannot invent a configuration absent from retained geometry.
Optional completion remains nonfatal and off by default; a zero-H report cannot
disable an otherwise valid atom/fragment placement or restore explicitly deleted H.

The viewer host retains valid named-region semantics before renderer startup and
during API failure, including mobile dark-theme recovery.

### Data, migrations, API and compatibility

Stable minor **0.17.0 →0.18.0** adds public count/scope/preview/report functionality,
beyond correcting a refusal. Existing HTTP contracts and persisted schemas remain
compatible; no major increment or prerelease is warranted after qualification.
All five authoritative versions advance together, without dependency upgrades.

No new migration: head0014; project/viewer/archive2, normalized/selection1.
Original uploads, stable identities, canonical records, all conformers and generic
history remain authoritative. The existing model-edit/preview routes gain additive
H actions, applied:boolean and an optional structured report. Legacy helper and
protein preparation HTTP semantics remain unchanged. Preview/count choices add no
persistent constraints or portable history. Native archives retain literal drafts;
chemical exports keep their existing representability, implicit-H and loss limits.

The actual tagged v0.17.0 reader is qualified in a separate process for canonical
H/stereo/inferences, originals, coordinates, allocation floors, generic Undo/Redo,
save/archive/re-export and rich existing project state. Old runtimes lack the new
building actions/controls; continue authoring with matching current client/API.
Back up full managed data and preserve existing guarded schema downgrade rules.

### Verification and operation bounds

[C3 qualification](assets/hydrogen-modeling/c3-gate.json) passes754 Python,
252 frontend and20 final native tests; broader16native/8intentional layout skips
include actual100/200% zoom, themes, narrow/accessibility, archives and interaction
lifecycles. Ruff/mypy70/lint/types/build/diff and actual preceding-reader checks
pass. Final-version candidate/merged gates and publication evidence are recorded
in the feature plan; intermediate diagnostics do not replace those gates.

Server-owned bounds admit4096 target sites,4096 proposed H,16384 generated H rows,
1024 atoms per complete chemistry context,16384 analyzed atom visits and200 detailed
diagnostics with full reason counts. Failed work and conformer assessments consume
budgets. Request-scoped adjacency/coordinate/spatial indexes and complete oversized
closure caching avoid repeated scans or whole-protein chemistry conversion.
Existing viewer/surface/movement/interaction performance budgets remain unchanged.

The [clean final candidate](assets/hydrogen-modeling/c5-candidate-gate.json) at
a0aaef1 passes all16 release commands:756 Python,252 frontend,8 supervisor and
239 browser tests with47 intentional skips; zero failures/flakes/retries. All15
existing native performance profiles pass. Frozen installs, fresh0014/static/build/
diff and actual tagged0.17 reader with final0.18 producer pass. Full-diff local
self-review is [documented](assets/hydrogen-modeling/c5-local-review.md); exact
merged-master qualification also passes all16 commands at `6cb9faf3959a7409620f42bc2fdef396d838568b`,
with the same counts, zero failures/flakes/retries and15 passing profiles.
The [merged evidence](assets/hydrogen-modeling/c5-merged-gate.json) records source/log
hashes and clean trees. The [verified issue reply](https://github.com/ManuelSe/Neistra/issues/77#issuecomment-6235945892) records scope,
compatibility, final documentation integration and delayed branch-cleanup audit.

### Scientific limits and follow-up work

Automatic counts initially cover C0, N0/+1, O0/-1/+1, divalent S0 and neutral
halogens, requiring known target charges and incident authoritative orders.
Aromatic contexts must be complete, specified and bounded. Unsupported sites stay
editable through explicit controls. Ideal geometry/approximate lengths are
unoptimized; close contacts and insufficient geometric evidence remain visible.
This is not pH/protonation prediction, tautomer choice, minimization or preparation.

Deliberately rejected: prepared-component gates for ordinary building, silent
chemistry repair/defaults, automatic existing-H removal/repositioning and an
unnecessary engine/plugin redesign. Deferred: persistent geometry/count constraints
and broader preparation/optimization (#12/#11), broader fragments/rings (#71).
No new duplicate follow-up issue is needed. Molecular intent across import,
building, completion, preparation, analysis and export is documented in
[MOLECULAR_MODEL](MOLECULAR_MODEL.md).

## 0.17.0 - 2026-10-17 - Direct molecular modeling

Implemented under the [approved issue #74 plan](plans/issue-74-direct-molecular-modeling.md).
Delivered in [PR #75](https://github.com/ManuelSe/Neistra/pull/75) as stable
[v0.17.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.17.0);
[publication evidence](assets/direct-modeling/c5-publication.json) and
[issue close-out](https://github.com/ManuelSe/Neistra/issues/74#issuecomment-6226274182) are verified.

### Highlights and fixes

Direct atom/bond edits allow incomplete chemistry, unknown charges/orders,
covalently linked ligand/protein material and any successfully loaded format.
Navigation categories and preparation no longer disable unrelated editing. Bonded
orphan H derive unambiguous membership without artifact rewrites; new H inherit
their actual parent. All118 elements, absolute nullable charge, literal selected
atom/H deletion, same-entry bonds and unknown/aromatic orders are supported.

New molecule starts an honest generated entry at its first atom. Add atoms and six
existing fragments using pure nonpickable previews, six directions/six torsions,
Apply/Cancel and a compact inspection bar. Heavy anchors need no prepared terminal
H; terminal-H replacement remains available. Optional H completion defaults off
and failures retain the requested direct edit. Delete-last leaves an editable empty
entry. Advanced manual basic actions share the direct service and explicit target.

Drafts remain renderable independently of chemical export. Explicit removal of a
native inferred bond survives reload/Undo. Delayed replies cannot restore cancelled
previews or take over a newer selection/project visit. Unknown XYZ charges remain
unknown on new imports. MOL2 current output no longer reuses stale source types;
chemical export losses/refusals are explicit. Sparse-ID mmCIF model row serials and
PDB fixed-width overflow are handled without changing canonical data. Monotonic
atom/bond IDs also survive Undo/Redo of entry creation and later branching; higher
floors persist through existing generic history fields without another migration.

### Data, migrations, API and rollback

Stable **minor0.16.0 →0.17.0** adds substantial user-visible creation/building, beyond
a patch. Existing public schema/API shapes and legacy chemistry-edit contracts
remain; no incompatible persisted redesign requires a major. All five authoritative
versions advance consistently, with no dependency upgrades. Stable publication is
conditional on both complete release gates, not the issue's labels.

No new migration: Alembic0014; project/viewer/archive2, normalized/selection1.
Original bytes/source facts, unaffected records/coordinates, generic history and
reference reconciliation remain exact. Generated entries have nullable original/
source fields; native archives preserve empty entries, unknowns, all conformers and
versioned authored bond exclusions. New direct/create/preview routes are additive.
Chemical formats may require acknowledgement or refuse an unrepresentable graph;
SMILES requires assigned valid chemistry, and bond exclusions are not portable.

Actual tagged v0.16.0 reader qualification separates positive data/history/archive
retention from expected old aromatic-renderer/helper refusals. Unrestricted runtime
rollback is unsupported; back up full managed data and use matching client/server.
Never strip unknown/exclusion/draft data to force an older renderer to accept it.

### Verification, accessibility and performance

[C4 qualification](assets/direct-modeling/c4-verification.json) passes687Python,
248frontend and99native cases/13intentional skips, zero failures/flakes/retries;
Ruff/mypy68/lint/types/build/diff and the actual tagged preceding reader pass.
Ten native performance profiles and18screenshots are retained; diagnostic failures
and interrupted/pre-review results are clearly separated from final qualification.

[Final clean candidate](assets/direct-modeling/c5-candidate-gate.json) atb3238c0
passes all16release commands:693Python/248frontend/8supervisor/233native with47
intentional skips, zero failures/flakes/retries; frozen installs/fresh0014/static/
build/diff and actual tagged0.16.0 reader including recreated allocator floors.
Fifteen native performance profiles and clean/source/log evidence are retained.
[Full-diff local self-review](assets/direct-modeling/c5-local-review.md) records
resolved scientific/focus/allocator findings and is not independent approval.
[Exact released master](assets/direct-modeling/c5-merged-gate.json) at
`a6d62c85fbdefdf579fce68cf535285129364743` repeats every complete gate/count,
with clean trees and source equivalence. [Premerge audit](assets/direct-modeling/c5-premerge-audit.json)
verifies normal merge eligibility without bypass. Codex was requested but no
integration review returned at publication audit. Annotated exact tag, stable
release/notes, downloaded asset SHA256/CRC and 339 internal hashes are
[verified](assets/direct-modeling/c5-publication.json). Final documentation merge
and branch/clean-master audit live in the issue reply. See [verification](VERIFICATION.md).
Both themes, narrow320px layouts, expanded forms, keyboard/touch hit targets, real
100/200% browser zoom and scoped axe are covered. Existing performance budgets
remain; native movement also runs an authored1STP draft with bond overlay active.
These pinned Chromium/SwiftShader and emulation checks do not certify physical
phones, other browsers, interactive screen readers or arbitrary-size performance.

### Scientific limits, simplifications and follow-up work

Direct edits intentionally allow unusual valence and incomplete chemistry; warnings
are not certification of protonation, pKa/tautomers, geometry or force-field readiness.
Existing H and coordinates remain literal. Placement embeds only fixed small cap
templates, never the parent; clashes and unknown-radius fallback warn. Affected
stereo is cleared conservatively, and original labels describe source material.
Standalone H preparation, cleanup and residue mutation retain separate prerequisites.
The actual configured entry limit is not a throughput guarantee.

No canvas drawing or combining separate entries by explicit product choice. Six
existing fragments only; expanded catalogue/ring fusion remain[#71](https://github.com/ManuelSe/Neistra/issues/71),
peptide growth[#70](https://github.com/ManuelSe/Neistra/issues/70), preparation/CCD
[#12](https://github.com/ManuelSe/Neistra/issues/12)/[#52](https://github.com/ManuelSe/Neistra/issues/52).
Component names/subset export remain[#20](https://github.com/ManuelSe/Neistra/issues/20)/[#21](https://github.com/ManuelSe/Neistra/issues/21).
No new follow-up issue is required for the approved scope; assigning all elements
does not claim #71's broader building work complete.

MOL/SDF/SMILES may interpret absent H through format valence defaults, including
after explicit H deletion. A modeled export requires acknowledgement; native
archives retain the literal graph without implying a protonation specification.

## 0.16.0 - 2026-10-16 - Compact molecular editing

Released in [PR #72](https://github.com/ManuelSe/Neistra/pull/72) as stable
[v0.16.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.16.0), from verified
master `1ef42b1cc94c472a51a56e0420ea9b2df7cb3678`. Follow the
[approved plan](plans/issue-69-compact-molecular-editor.md).

### Added editing workflows

Edit beside Transform opens a compact nonmodal Atoms/Bonds/Fragments/Residues
panel. Canonical selection drives element/charge changes, heavy-atom deletion,
heavy-endpoint bond creation/breaking/order and six illustrated substitutions:
methyl, ethyl, hydroxyl, amino, carboxylic acid and phenyl. Select a terminal H;
there is no manual ID/coordinate form or hidden attachment mode. Complete standard
amino acids expose all 20 existing constrained template mutations and retain complete
result selection for successive operations. One edit produces one reversible
molecular command with monotonic identities and exact artifact Undo/Redo.

### Chemistry and hydrogen policy

Prepared connected ligand components inside standalone entries or complexes use
known orders/charges, one conformer, supported elements and usable coordinates;
protein, waters and unrelated atoms stay exact. Local valence reconciliation adds
actual explicit H within the same command. Hydrogen-free input may need one
explicit Prepare component hydrogens action before picking H. Show explicit H is
presentation only; cartoon needs an atomic Style to display atom detail.

Six fixed templates use deterministic bounded placement, preserving existing heavy
coordinates and validating generated distance/angle/overlap bounds. Geometry is
inferred and unoptimized, not protonation/pKa/tautomer or binding-pose validation.
Supported tetrahedral stereo follows fixed3D geometry in saved bond order; newly
created centers are marked inferred. Unspecified/conflicting source stereo, E/Z
decisions, aromatic direct changes and unsupported valence/coordination refuse.
Explicit side-chain crosslinks refuse template mutation. Protein mutation does not
implicitly prepare/protonate a protein. Full warnings/provenance remain available.

### Compatibility and rollback

**Minor0.15.0 →0.16.0** adds meaningful user-visible molecular building and an
additive API, beyond a patch fix. Public legacy routes, persisted schemas,
originals, archives/history/jobs remain compatible; no major break is introduced.
Complete supported workflows and release gates justify a stable minor, without a
prerelease suffix. All five authoritative versions advance consistently.

No new migration: Alembic0014; project/viewer/archive2, normalized/selection1.
Edited data uses existing generic history/actions. Actual tagged v0.15.0 reading,
save/reexport/archive import and new-command Undo/Redo pass on both final 0.16.0
candidate and exact released master. Back up full
managed data and restart matching client/server together. Qualified runtime rollback
needs no data stripping/schema downgrade; older0014 guards still apply. See
[compatibility guidance](DEVELOPMENT.md#selection-editing-compatibility-0160).

### Fixes, accessibility and performance

Preserve the focused camera across responsive viewer remounts; retain panel section
and owned focus. Capture project/revision/artifact/selection, preserve newer picks
and ignore other-project or previous-visit late replies. A previous visit cannot
clear a newer pending edit. Vendor popups clear the full measured launcher/header
area. Failed artifact reads offer explicit retry.
Native H/bond/residue/new-atom picking, keyboard/focus/notice hit testing,
light/dark320px layouts, actual100%/200%Chrome zoom and scoped axe are qualified.
These checks are distinct from manual screenshot review and do not certify
interactive screen-reader, physical-device or cross-browser support.

Only the affected entry reloads after topology changes; section/camera browsing
reuses artifact queries. Chemistry is bounded to256heavy/1,024resulting component
atoms, uses component RDKit projections and spatial context checks. These bounds
are not throughput promises. Existing native movement/surface/project budgets
remain unchanged.

### Verification

[C4 qualification](assets/molecular-editing/c4-verification.json):612Python,
235frontend,62broad browser passes/10intentional skips with no failures/retries;
Ruff/mypy (64 files)/lint/types/build/diff and actual tagged v0.15.0 reader pass. Scientific
stereo/graphs/H/geometry, reference reconciliation/branching allocation, originals,
archives/jobs/scenes/surfaces, async ownership and remounts are covered. Diagnostics
remain separate. [Final clean candidate](assets/molecular-editing/c5-candidate-gate.json) at `12a4375`
passes613 Python/236 frontend/8 supervisor/216 browser with46 intentional skips and no
failures/flakes/retries; every frozen-install/fresh 0014/static/build/diff command
and actual v0.15.0 reader passes against final 0.16.0 data. The initial mobile vendor
popup failure and cross-visit pending finding were repaired without weakening
checks. [Complete-diff local self-review](assets/molecular-editing/c5-local-review.md)
has no unresolved consequential finding and is not independent. Codex was requested;
no integration review returned at merge/publication audit. The [exact merged-master
gate](assets/molecular-editing/c5-merged-gate.json) repeats all commands, counts
and actual reader with zero failures/flakes/retries in 40.0 minutes. Annotated tag,
stable/latest release/notes and downloaded evidence ZIP SHA256/CRC/all 189 internal
checksums are [verified](assets/molecular-editing/c5-publication.json).
[Issue closeout](https://github.com/ManuelSe/Neistra/issues/69#issuecomment-6220230454)
records final documentation/cleanup audit. No new migration or version deviation.

### Deferred features and known limitations

Prepared closed components only; raw PDB/mmCIF chemistry is not guessed. C/N/O/S/F/
Cl/Br/I shortcuts, neutral divalent S and local charges-1/0/+1 are bounded, not a
full periodic table. H deletion is omitted because local saturation would restore
it; existing explicit removal tools remain. No Grow, ring fusion, arbitrary
catalogue, optimization, rotamer search or automatic protein-H policy is implied.

Terminal peptide growth is[#70](https://github.com/ManuelSe/Neistra/issues/70);
expanded fragment/element/ring-building qualification is[#71](https://github.com/ManuelSe/Neistra/issues/71).
Broader protein preparation remains[#12](https://github.com/ManuelSe/Neistra/issues/12),
CCD ligand assignment[#52](https://github.com/ManuelSe/Neistra/issues/52), component
names/classification[#20](https://github.com/ManuelSe/Neistra/issues/20) and subset
export[#21](https://github.com/ManuelSe/Neistra/issues/21). Source labels describe
the original molecule; review scientific warnings and use explicit cleanup tools
separately. The issue's complete speculative checklist is not claimed delivered.


## 0.15.0 - 2026-10-15 - Compact project navigation

Status: [released as v0.15.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.15.0)
through [PR #67](https://github.com/ManuelSe/Neistra/pull/67) on exact qualified master
`dccc5e6d2f3dc3d392144165ffd1f4237db4a2e5` (2026-10-15 Europe/Zurich).

### Added and changed navigation

Compact single-line entries retain selection, grouping, visibility, lock and entry
actions; Details exposes complete metadata and warnings. An independent desktop
split pane and mobile Entries/Components tabs keep expanded components from
displacing entries. Explicit Components browses without selecting; entry-name
activation selects and browses. Component/viewer selections keep the browse target
pinned. Session expansion/scroll survive entry switches and responsive remounts.

Direct category/component labels select exact canonical memberships. Disclosure,
shared visibility and full provenance Details are independent. Continuous virtual
scrolling reaches off-screen components by Up/Down/Home/End, preserving focus and
selecting full categories regardless of the mounted window. The artifact-keyed
index avoids repeated full-atom scans. Water and other solvent explicitly share
the existing Solvent switch.

### Fixes, accessibility and performance

Hidden-entry text preserves contrast, portal menus fit actual200% zoom, warnings
have explicit accessible descriptions, and loading/topology/project changes retain
correct focus ownership. Closing Details preserves a later focused tool. Qualified
200 grouped long-name entries and10,000 actual normalized components have32/44px
rows, bounded virtual DOM,240pxdesktop/320pxmobile layouts and light/dark actual
100/200% Chromium zoom. Automated keyboard/axe checks are distinct from manual
screenshot inspection; no screen-reader/device/cross-browser certification is claimed.

### Compatibility, migration and rollback

**Minor0.14.0 →0.15.0** adds meaningful navigation capability, beyond a patch fix.
No breaking public API or persisted contract warrants a major increment; complete
qualification supports a stable release. All five authoritative versions advance
together. Alembic stays0014, project/viewer/archive schemas2 and normalized/selection
schemas1. No new migration or endpoint/job/plugin change. Original molecular files,
coordinates, atom identities, classifications, history/scenes/surfaces and archives
retain their contracts. Only layout/collapse preferences persist in browser storage.

Final0.15.0 producer data passes the actual tagged v0.14.0 API/core reader,
including exact originals/coordinates, history/jobs/scenes/surfaces and archive
seed remapping. Runtime rollback to qualified0.14.0 needs no schema downgrade or
data stripping and restores the previous layout; earlier0014 guards still apply.
See [upgrade/rollback](DEVELOPMENT.md#compact-navigation-compatibility-0150).

### Scientific interpretation, limitations and follow-up work

Classification remains source/fallback/ambiguous evidence, not biological-function
or binding significance. Navigation never changes molecular state. The generated
O-only water fixture qualifies navigation, not solvent preparation. Existing surface,
interaction and chemistry limits remain. Browsing target/expansion/scroll are
session-only; visibility remains shared-category scope. Entry virtualization is
deferred after200-entry qualification; durable browsing has no approved requirement.
Duplicated headings/selection rows and per-component visibility were rejected as
proposed; direct labels and honest existing visibility deliver the accepted scope.
Mobile tabs replace the proposed split. No speculative follow-up issue is created.
Component override/extraction/export remain[#20](https://github.com/ManuelSe/Neistra/issues/20)/
[#21](https://github.com/ManuelSe/Neistra/issues/21); carbon defaults[#58](https://github.com/ManuelSe/Neistra/issues/58),
charge color[#64](https://github.com/ManuelSe/Neistra/issues/64) and ligand chemistry
[#52](https://github.com/ManuelSe/Neistra/issues/52) remain separate.

### Verification

[C3 qualification](assets/project-navigation/c3-verification.json):227frontend,
176integration +22domain Python (2overlap), static/build;51broad/25adjacent browser
passes with3/7intentional skips, no failures/retries. Repaired diagnostic findings
remain separate. [Complete clean candidate](assets/project-navigation/c4-candidate-gate.json) at
`9a176a1` passes557Python,227frontend,8supervisor and197browser/45intentional
skips in34.3m, with zero failures/retries; frozen installs/fresh0014/static/build/
diff pass. Actual tagged0.14.0 reader accepts final0.15.0 exact originals/coordinates/
history/jobs/scenes/surfaces/archive remapping. [Local complete-diff review](assets/project-navigation/c4-local-review.md)
is self-review, not independent; all consequential findings repaired. [Exact merged-master gate](assets/project-navigation/c4-merged-gate.json) repeats
every command/count and actual tagged-reader qualification, with197browser passes/
45intentional skips in34.2m and zero failures/retries. Annotated exact tag, stable
release/notes, downloaded archive SHA256 and132internal checksums are verified;
[publication](assets/project-navigation/c4-publication.json).
[Issue reply](https://github.com/ManuelSe/Neistra/issues/59#issuecomment-6179659377)
is verified; issue closed. Codex returned no independent review at merge/publication
audit; no required protection/approval bypass. Final documentation/master/cleanup
audit is maintained in that verified reply. [Approved plan](plans/issue-59-compact-project-navigation.md)
and [user guidance](PROJECT_NAVIGATION.md) retain dispositions and ownership.


## 0.14.0 - 2026-10-14 - Independent surface objects

### Highlights and changed workflows

Entry, captured-fragment and full-protein-context pocket surfaces are independently
named, selected as whole objects, highlighted, shown/hidden and removed. Multiple
surfaces may share an entry. The compact nonmodal Surfaces manager groups ownership
and edits existing themes/uniform color, opacity, solid/mesh and explicit atom-color
inheritance. Source-atom selection is explicit; pocket seeds are not surface membership.
Fragment replacement and pocket radius/seed replacement preserve identity. Repeated
creation creates distinct objects. Scenes, save/reload, Undo/Redo, duplication,
topology reconciliation and archive remapping preserve independent definitions.

### Persisted data, API, migration and rollback

This is a pre-1.0 **minor0.13.2 →0.14.0**, with documented persisted/API changes,
not a compatible patch. Project, viewer settings and portable archive majors become2;
normalized molecules and selections stay1; the route namespace remains `/api/v1`.
All five authoritative application versions advance together without dependency upgrades.

Back up the complete data directory before running Alembic0014. Migration converts
legacy native/singleton definitions in live state, checkpoints, scenes and retained
forward/inverse history, preserving original molecular bytes, warnings, timestamps,
revision/dirty state and jobs. New creation is atomic and revisioned; object PATCH/
DELETE is entry-owned. Legacy singleton POST commands return410 with guidance;
ordinary representation writes cannot create surfaces. General viewer updates
preserve objects and cannot bypass their commands. See [API](API.md),
[project schema](PROJECT_SCHEMA.md) and [upgrade/rollback](DEVELOPMENT.md#upgrading-independent-surfaces-0014).

Schema1 archives import and convert; exports are schema2. Actual tagged v0.13.2
readers reject schema2 archives cleanly. Downgrade refuses retained objects or empty
ordinary representation sets, including history; restore the complete pre-upgrade
backup rather than strip scientific state. Archives remain current snapshots and
omit Undo/Redo history. There is no preceding-reader round-trip claim.

### Scientific scope, accessibility and performance

Existing fragment/pocket geometry and native entry calculation paths are retained;
no new chemical assignment, surface profile, cavity/area/volume or export capability.
Pocket context remains the full current protein context, with captured cross-entry
seeds and explicit radius. Warnings and over-budget statuses remain visible.
Existing six color themes are supported. Ambiguous charge coloring is deferred to
[#64](https://github.com/ManuelSe/Neistra/issues/64), which must distinguish supplied
formal charge, partial charge and electrostatic potential scientifically. Carbon
color defaults [#58](https://github.com/ManuelSe/Neistra/issues/58) and a broader
browser redesign [#59](https://github.com/ManuelSe/Neistra/issues/59) remain separate.

C4 qualifies native GPU mesh pixels/whole-object marker buffers, actual mouse/touch
activation, keyboard/focus restoration, scoped light/dark axe,320px/long names and
real100%/200%Chrome zoom. Lazy input allocation, serial workers, individual cancellation,
retained-output accounting and established capacity/movement budgets pass.
Calculation2GiB/retained meshes1GiB bounds do not cap whole-browser or GPU memory.
Pinned Chromium/SwiftShader and Pixel 7 emulation do not establish physical-device,
cross-browser or hardware-GPU qualification. Native250k-atom reduced detail remains.

### Verification and review

The [approved plan](plans/issue-57-independent-surface-objects.md),
[C1](assets/surface-objects/c1-verification.json), [C2](assets/surface-objects/c2-verification.json),
[C3](assets/surface-objects/c3-verification.json) and [C4](assets/surface-objects/c4-verification.json)
record independently checked milestones, actual tagged producer/reader/backup
qualification and resolved diagnostic findings. C4 passes183 focused Python,
214frontend and10 final pointer/object/queue/access cases with2 intentional layout
skips; separate scientific/capacity/movement/zoom evidence is retained. [Complete clean candidate](assets/surface-objects/c5-candidate-gate.json) at`b6281bc` passes **556Python, 214frontend, 8supervisor, 190browser/44 intentional skips**, zero failures/flakes/retries; frozen installs/fresh0014/lint/types/build/diff all pass. Actual tagged0.13.2 upgrade/refusal/backup checks pass with final0.14.0. [Exact released-master gate](assets/surface-objects/c5-merged-gate.json) at`88e84b27a0fb6c4520333df236d788065fd7a788` repeats every command/count and actual tagged compatibility with zero failures/flakes/retries. Annotated exact tag, [stable release](https://github.com/ManuelSe/Neistra/releases/tag/v0.14.0), notes and downloaded evidence SHA256/internal checksums are verified; [publication](assets/surface-objects/c5-publication.json). [Issue reply](https://github.com/ManuelSe/Neistra/issues/57#issuecomment-6175474825) and feature cleanup are verified. Final documentation merge/clean-master audit is maintained in that reply. Local review was self-review; the Codex request returned no independent review at merge audit. See [surface guidance](SURFACES.md).

## 0.13.2 - 2026-10-14 - Viewer notification timeout

### Fixes and notification lifetime

Routine application notifications above the molecular viewer disappear after
10 seconds and can still be closed manually. Each replacement, including identical
text, receives a fresh lifetime; an obsolete callback cannot dismiss a newer
notice. Theme changes and viewer remounts retain the existing deadline.

Errors, warning-bearing import/ligand/protein edit summaries, and instructions to
inspect, retry, refresh, or reconcile movement remain visible until dismissed or
replaced. Presentation color is separate from lifetime; no warning text is
classified by string matching. Detailed scientific warnings, progress, viewer
failures, API retry controls, dialogs, job state, and vendor feedback retain their
existing lifecycles. Scientific calculations and supported chemistry are unchanged.

### Accessibility and limitations

Existing position, styling, wording, Close control, and status/alert roles remain.
Keyboard focus inside a notice defers automatic removal until focus leaves;
departure does not steal focus. Manual dismissal restores an appropriate connected
workspace target while respecting modal ownership. Browser timer throttling may
delay callbacks; ten seconds is the minimum ordinary lifetime, not a hard real-time
promise.

The approved interpretation retains one visible notification with independent
successive-emission lifetimes. Simultaneous stacks, queues/history, configurable
duration, animations, and timing every status display were excluded because they
add unrelated UI contracts or hide information with a different lifecycle. No new
follow-up issue is created. Ligand chemistry assignment remains separate #52.

### Data, API, archive compatibility and rollback

Patch **0.13.1 → 0.13.2** changes transient presentation only. All five application
version sources advance together without dependency upgrades. No new endpoint,
request/response field, molecular or project state, durable preference, or migration
is introduced. Alembic head remains 0013 and project/normalized/archive majors 1.
Original uploads, artifacts, coordinates, history, scenes, and jobs retain their
contracts. Rollback to qualified v0.13.1 requires no schema downgrade or data
stripping; reload the frontend to restore the earlier notice behavior.

### Verification and review

The [approved contract](plans/issue-56-viewer-notification-timeout.md),
[C1 evidence](assets/viewer-notifications/c1-verification.json), and
[C2 evidence](assets/viewer-notifications/c2-verification.json) record exact timing,
warning-producer, stale callback, cleanup, focus, actual native-state/network
invariance, and desktop/mobile light/dark accessibility checks. The focused browser
gate passes 39 workflows with three intentional layout skips; all 10 notification
workflows and 193 frontend tests pass. The [complete clean-candidate gate](assets/viewer-notifications/c3-candidate-gate.json)
at `494d533` passes **492 Python,194 frontend,eight supervisor,182 browser/44
intentional layout skips**, zero failures/flakes/retries, frozen installs/fresh0013/
lint/types/build/diff. [Actual tagged v0.13.1 reader](assets/viewer-notifications/c3-candidate-reader.json)
accepts final0.13.2 data/history/archives/jobs. [Local full-diff review](assets/viewer-notifications/c3-local-review.json)
reproduced/fixed stale-marker poisoning; no consequential finding remains and no
independent review is claimed. [Exact released-master gate](assets/viewer-notifications/c3-merged-gate.json) at
`c21de2e3f76241acb1705d7ec80aae9baf499bdf` repeats every complete command/count
with zero failures/flakes/retries; actual tagged v0.13.1 accepts final merged data.
Annotated v0.13.2/exact target, [stable release](https://github.com/ManuelSe/Neistra/releases/tag/v0.13.2),
notes and downloaded verification bytes/SHA256 plus72 internal checksums are
verified; [publication](assets/viewer-notifications/c3-publication.json).
Final documentation/cleanup audit is maintained in the verified issue reply.

## 0.13.1 - 2026-10-13 - Interaction corrections

### Highlights and fixes

- All six existing interaction types update their actual native geometry when
  combined, reordered or moved. Reuse attached line buffers and explicit current
  group counts so old endpoints, stale colors and undersized index capacity no
  longer misrepresent classifications or hide newly enabled markers.
- Contradictory observed acid H and supplied negative ASP/GLU side-chain charge
  now suppress affected ionic/H-bond assignments with a warning, implementing
  the existing conservative chemistry boundary.
- Exactly coincident clashes get a centered three-axis cross (0.15 Å half-length),
  preserving canonical endpoints. Interactions is the final viewer quick action.
- Type and Inter/Intra controls remain independent, cached and session-only.
  Preview/Cancel, committed edits, topology deletion and Undo/Redo retain their
  current-artifact and logical-visibility behavior.

### Scientific qualification and unchanged criteria

The fixed interaction-v1 profile and supported-chemistry boundary are unchanged.
Independent participants/endpoints, positive/negative/boundary cases and frozen
2REG choline geometry qualify the existing six types. Seven complete aromatic
ring contacts span four literature-identified residues; Asp45 at4.716 Å remains
outside Neistra's4.5 Å ionic cutoff. Manually supplied fixture chemistry is test
input, not a CCD assignment or preparation service. Neutral, ambiguous, modified,
missing-H and unsupported sites remain conservatively assessed with warnings.

### UI behavior and known limitations

Native buffers and marker pixels qualify each type in light/dark, all15 pairs,
all six together and independent scopes. Nonpickable patterned overlays retain
camera/selection and bounded keyboard/touch/zoom layouts. Geometric screening is
not binding energy; explicit donor H, warned protein conventions and a shared
Cartesian frame remain required. Metal coordination, symmetry/periodic images,
automatic preparation, editable profiles, persistent reports and new analysis
libraries remain outside scope. Raw ligand assignment stays in [#52](https://github.com/ManuelSe/Neistra/issues/52);
no duplicate or speculative follow-up issue was created.

### API, data, migration, compatibility and rollback

This is a **patch0.13.0→0.13.1**, restoring existing advertised behavior, without
new categories/endpoints or API/persisted changes. All five authoritative sources
advance to0.13.1; scientific dependencies remain pinned. No new migration;
head0013 and project/normalized/archive majors1 remain. Originals, immutable
molecular artifacts, retained history, scenes and jobs retain their contracts.
Interaction choices/results remain absent from portable current-state archives.
Actual tagged0.13.0 reader accepts final0.13.1 data/history/archives/jobs;
supported rollback needs no schema downgrade or data stripping,
but restores the old renderer and contradictory-acid typing defects. Restart
services and reload the workspace to reset transient derived caches; earlier
migration guards still apply.

### Verification and review

The [approved contract](plans/issue-55-interaction-corrections.md) and
[C1–C3 evidence](assets/interaction-corrections/c3-verification.json) distinguish
scientific/API facts from native buffers and actual marker pixels. C2 passes487
Python tests; C3 passes182frontend and44browser/6intentional layout skips, zero
failures/retries, with256 filter combinations, real100%/200%zoom,320px, scoped axe,
native touch, lifecycle and existing movement/measurement/surface regressions.
Pinned1010-atom analysis and cached-toggle budgets pass. Complete clean candidate at0b409a1 passes490Python,182frontend,8supervisor,
172browser/44intentional skips, zero failures/retries; frozen installs/fresh0013/
lint/types/build/diff and actual tagged0.13.0 reader pass. [Exact gate](assets/interaction-corrections/c4-candidate-gate.json).
Exact merged masterdfca45af3baac1e7395c6b39e73f93fc9651276f repeats every gate/count
and actual tagged0.13.0 reader. [Merged evidence](assets/interaction-corrections/c4-merged-gate.json).
Annotatedv0.13.1/exact target and stable [release](https://github.com/ManuelSe/Neistra/releases/tag/v0.13.1)
notes, downloaded verification archive and123internal checksums verified.
[Publication record](assets/interaction-corrections/c4-publication.json); issue55
reply verified and issue closed.
Review is local,
not independent unless a returned external review is explicitly recorded.
Known Alembic, lazy Mol* bundle and color-env advisories remain. Pinned Chromium/
SwiftShader and Pixel7 emulation do not establish arbitrary hardware/browser support.


## 0.13.0 - 2026-10-12 - Molecular interactions

### Highlights

- A compact network-icon control in the viewer menu bar independently toggles
  hydrogen bonds, hydrophobic contacts, π–π, cation–π, salt bridges and clashes,
  with separate Inter/Intra switches and scientific Help.
- Analysis reads immutable normalized artifacts and emits canonical participants,
  geometry, coverage and warnings. Molecule scopes follow covalent/source identity,
  including disconnected molecules within one entry and separate entries.
- Patterned, batched, nonpickable overlays preserve camera, selection, measurements
  and movement focus. Preview clears/pauses markers; Cancel restores cached results,
  while committed edits, Apply, Undo and Redo refresh current artifacts.

### Scientific criteria and supported inputs

Hydrogen-bond markers connect explicit donor H to acceptor heavy atoms, respecting
3.5 Å donor–acceptor /2.5 Å H–acceptor distances, ≥130° donor and applicable ≥90°
acceptor angles. Hydrophobic contacts require established nonpolar carbon sites.
Complete aromatic rings require planarity, distance, orientation and offset rules;
cation–π uses actual positive groups and directional geometry. Salt bridges use
opposite charged groups within 4.5 Å; resonance sites share a marker. Qualified
H-bond pairs are excluded from clashes even with H-bond display off, while salt
and H-bond classifications remain independently visible. Element radii and ≥0.4 Å
overlap define clashes with local covalent exclusions.

Prepared, validated ligand graphs and observed canonical amino-acid sites are
supported. Protein connectivity/side-chain charge conventions are warned analysis
assumptions; supplied contradictory charges, protonation or covalent modifications
prevent those assignments. Disulfides are not thiol donors. Missing/ambiguous
chemistry and unsupported sites remain unassessable. [Exact profile and preparation
limits](INTERACTIONS.md) are part of the delivered contract.

### UI behavior

Choices are transient per-project session state; renderer remounts retain them,
while project changes (including empty projects) and reload reset them. Opening
alone does no analysis. Type/scope/visibility switches reuse matching cached
results; new or changed artifacts debounce/cancel obsolete requests. Concise
Off/Analyzing/Paused/partial/unavailable/error states and explicit Retry remain
visible. Keyboard, touch, both themes, 320 px and real 100%/200% zoom are qualified.

### API, data, migrations and rollback

`POST /api/v1/projects/{project_id}/interactions` is additive in API v1. Requests
contain entry/artifact identities, `interaction-v1` and `workspace-cartesian`,
with no molecular payload retransmission or viewer export. One cancellable child
per API process is bounded by 100,000 atoms, 1 million candidate admissions,
20,000 records and 30 s; busy/limit/timeout failures publish no complete result.

This is a minor increment from 0.12.1: new public behavior and endpoint, with no
breaking existing API or persisted contract. All five authoritative versions are
0.13.0. No dependency upgrade or migration; Alembic remains 0013 and project,
normalized and archive contract majors remain 1. Originals, history, scenes and
jobs are unchanged; interaction results/choices are absent from archives. The
actual tagged v0.12.1 reader accepts final 0.13.0 producer data, retained history
and archives on both final candidate and exact merged master. Qualified rollback needs no schema downgrade
or data stripping; transient interaction state resets.

### Verification and review

The [approved feature plan](plans/issue-49-molecular-interactions.md) and
[C4 evidence](assets/molecular-interactions/c4-verification.json) record scientific
boundaries, native marker pixels/centroids/nonpickability, cache/preview/scene/
project lifetimes, cancellation/limits, accessibility/real zoom and host performance.
[Clean candidate evidence](assets/molecular-interactions/c5-candidate-gate.json)
passes **472 Python,179 frontend,8 supervisor,168 browser /44 intentional skips**,
zero failures/flakes/retries, frozen installs/fresh0013/lint/types/build/diff.
Final0.13.0 producer/actual tagged0.12.1 reader passes exact data/history/archives/jobs.
[Exact merged evidence](assets/molecular-interactions/c5-merged-gate.json) at
bf29b9a913be48dac95b8d9aa055a7310c21d5b2 repeats all commands/counts and actual
preceding-reader qualification. Annotatedv0.13.0/release/notes/downloaded evidence
bytes and issue reply are verified; [publication record](assets/molecular-interactions/c5-publication.json).
[PR#53](https://github.com/ManuelSe/Neistra/pull/53) preserves checkpoint history.
Review local, not independent; Codex requested without a returned review at merge.
Final documentation/cleanup audit is maintained in the linked issue reply.

### Limitations and deliberately deferred scope

Geometric screening does not predict binding energy. Explicit H/preparation is
required; analysis never adds atoms, guesses arbitrary ligand chemistry or
mutates source data. Canonical template/charge assumptions are visible warnings.
Raw PDB/mmCIF ligand CCD assignment is tracked in [#52](https://github.com/ManuelSe/Neistra/issues/52).
Automatic protonation/completion, configurable profiles, periodic/symmetry images,
metal coordination, durable analysis reports, new docking logic, and component
correction/extraction remain outside this approved slice. Pinned Chromium/SwiftShader
and Pixel 7 emulation establish host regression budgets, not physical-device or
arbitrary-system-size guarantees. Existing Alembic and lazy-bundle advisories remain.


## 0.12.1 - 2026-10-11

### Highlights and fixes

- Transform selection now uses its Move3d symbol with a hover/focus tooltip. The
  separate active strip contains camera, Apply, Cancel, More and warning/Help
  icons with accessible names. Guidance and scientific limits move into reachable
  nonmodal Help; More retains touch modes, depth, sensitivity, steps and zoom.
- Wide fine-pointer primary actions are 32 px; mobile widths or any coarse pointer
  retain 44 px targets. More/Help scroll below the primary strip; Apply/Cancel stay
  reachable through both themes, 320 px layouts and actual 200% browser zoom.
  Consequential errors and uncertain commit outcomes remain visible text.
- Repeated hold-Space camera drags retain canvas focus. Moving the mouse back from
  noneditable movement actions restores it; sliders, editable fields, unrelated
  controls and modals retain their own focus and native Space behavior. The
  Adjust view / Resume transform toggle remains the touch/keyboard alternative.
- Existing real-zoom qualification exposed an idle group-action focus race. Focus
  restoration now waits for the accepted project revision to render before
  resolving a remounted row, preserving later unrelated/project focus.

### Data, migrations and compatibility

Patch increment fixes released presentation/focus defects without a new public
capability or breaking data/API behavior. All five version sources advance to
0.12.1 without dependency changes. No new endpoint, schema, migration, scientific
math, history action or durable preference; head 0013 and contract majors 1 remain.
Original uploads, all conformers, unselected data, captured previews and submitted
jobs retain existing behavior. Navigation changes only the camera. Archives stay
current-state snapshots without portable history. Recent 0.11.0/0.12.0 archive
metadata joins the existing round-trip matrix; actual tagged 0.12.0 reader
accepts final 0.12.1 exact coordinates/originals, retained batch history,
save/reexport, archives and unchanged jobs. Complete candidate and exact merged
gates pass.
Rollback to the qualified 0.12.0 reader requires no schema downgrade/data stripping.

### Verification and review

The [approved correction contract](plans/issue-46-compact-transform-controls.md)
records exact commands/timings, diagnostics and scope decisions. Complete clean
candidate `f437c31767cd44be435d829ca4fb9ad033049214` passes **400 Python, 173 frontend, eight supervisor and
159 browser tests / 43 intentional layout skips**, zero failures/flakes/retries.
Frozen installs/fresh migration 0013/Ruff/mypy/web lint/types/build all pass.
Native first previews 145.0/37.6 ms, exact coordinate Cancel 18.1/19.7 ms and
longest tasks 130/0 ms pass unchanged 500/500/750 ms budgets; each case
retains six ownership cycles, first/latest two frames per 40 submissions, max one
active update, exact restoration and no molecular requests. Surface regeneration
is measured separately.

Coverage includes natural repeated Space without injected canvas focus, guarded
mouse return, latest-plane translation, exact transaction/history, interrupted
input, direct Help/More switching and focused Escape, true CDP touch, both themes/
scoped axe, 44 px mobile/320 px targets and actual 100%/200% Chrome zoom with
primary-action hit testing. Historical 0.12.0 tests manually refocused the canvas;
that missed natural-focus defect is now covered. Review findings were reproduced
and corrected before qualification. Full-diff review is local, not independent.
[PR #50](https://github.com/ManuelSe/Neistra/pull/50), exact merged
`39d5c7b4c142ffb6d327f3ed0eebbc4ce8eb4cda`, annotated tag/
[release v0.12.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.12.1), downloaded
verification bytes and the
[issue correction reply](https://github.com/ManuelSe/Neistra/issues/46#issuecomment-6112208278)
are verified. Exact merged qualification repeats the candidate counts and budgets;
commands and publication audit are linked from the contract.

### Limitations and scope decisions

Movement remains unconstrained and can distort bonds or create clashes; no repair,
minimization or docking validation. Qualification uses pinned Chromium/SwiftShader
and emulated Pixel 7, not physical-device or universal browser certification.
Existing Alembic and lazy Mol* bundle advisories remain. Space is fixable, so new
Shift/Ctrl shortcuts are rejected to avoid existing pan/translation conflicts.
Gizmos, durable/custom bindings, gesture transfer and broader device certification
remain deferred from the original contract; no speculative follow-up issue.



## 0.12.0 - 2026-10-11

### Viewer transformation workflow

- Start Move selection from a clearly separate viewer bar or the existing Transform
  inspector. Captured atom/hidden counts, Apply and Cancel remain above the viewer;
  More holds sensitivity, touch/keyboard Rotate/Translate/Depth, steps and limits.
- Mouse left drag always rotates; right or Ctrl-left drag translates in the current
  screen plane, independent of secondary-tool preferences. Defaults reset each session.
- Hold unmodified Space on the movement canvas for native camera orbit/pan/zoom;
  releasing it resumes positioning using the updated view. Adjust view / Resume
  transform provides the approved touch/keyboard alternative. Explicit toggle and
  held Space combine without losing the preview or captured selection.

### Input lifecycle, accessibility and fixes

- Native buttons/fields/disclosures/modals retain Space. Focus departure clears
  held Space; blur, hidden documents, modal takeover, phase exit and remount clear
  navigation. Valid previews and latest camera survive responsive remounts.
- Ownership changes end the gesture at its accepted pose/camera. Old held-pointer
  continuations and compatibility releases cannot leak into picking; pre-session
  native navigation keys are released at handoff; fresh drags
  resume. Selection clearing, implicit focus and styling remain suspended.
- Secondary tools scroll independently so primary actions remain reachable. Keep
  touch controls at least 44 CSS px, theme contrast, named status/focus and real
  200% zoom behavior. Existing viewer errors now sit clearly in the header stack;
  the styling palette fits available viewport space alongside the taller header.

### Scientific behavior, data and compatibility

- Preserve the existing proper rigid all-conformer/multi-entry transform, carried
  centroid pivot, complete hidden membership, unchanged unselected state/originals,
  no-op preservation, single atomic Apply/undo/redo and exact Cancel. Preview and
  camera changes do not submit jobs, refetch molecular projections or commit data.
- No API, history vocabulary, persisted preference, archive or database change.
  Migration head remains 0013; contract majors remain 1. The actual v0.11.0 reader
  checks final 0.12.0 coordinates, original hashes, retained batch history,
  save/reexport, current-state archives (without portable history) and unchanged jobs.
- Minor SemVer increment adds public functionality without incompatible data/API
  changes. All five authoritative versions agree; no unrelated dependency update.

### Verification and review

The [approved issue #46 plan](plans/issue-46-viewer-transform-toolbar.md) records
checkpoint commands, diagnostics/corrections and release evidence.
C1–C4 qualify native perspective/orthographic navigation/updated-plane movement,
exact state/history, interruption, true emulated touch, both themes/scoped axe,
actual 100%/200% zoom, inspected screenshots, scientific/archive/migration checks
and actual preceding-release readers. Clean candidate `545d3553557a8b442b45e9b37a14259751360aba` passes the complete
release gate: **398 Python, 169 frontend, eight supervisor and 155 browser tests /
43 intentional skips**, zero failures/flakes/retries; frozen installs/fresh0013,
Ruff/mypy/lint/types/build pass. Exact merged `427c050b32c5ae361c7c9da042616a5266600dcd` repeats the same complete
gates; final actual 0.11.0 reader qualification passes. [PR #47](https://github.com/ManuelSe/Neistra/pull/47), annotated
tag/[release v0.12.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.12.0), downloaded verification bytes and
[issue closeout](https://github.com/ManuelSe/Neistra/issues/46#issuecomment-6102912003) are verified. Exact commands/timings and native
performance are linked from the plan; final cleanup audit is maintained in the reply.

C4 native first preview 144.5/26.7 ms, exact Cancel 14.2/14.7 ms and longest task 125/0
observed ms pass unchanged 500/500/750 ms budgets. Six ownership cycles per case,
two rendered frames per 40-frame burst, one active update, exact restoration and
zero molecular requests pass. Surface restoration 18.9 ms/full regeneration 1074 ms
are separate. Review is local, not independent; Codex was requested without a returned review.

### Deferred scope and known limitations

Continuous transfer of an already-held drag is deferred; fresh gestures avoid
jumps. Gizmos, pivot markers, custom/durable bindings, scientific constraints and
broader-device certification are outside this issue; no speculative follow-up.
Restarting movement to adjust the view and removing depth/touch/keyboard/numerical
capabilities were rejected because they lose state or useful existing workflows.

Movement remains unconstrained: it can distort crossing bonds or create clashes,
without minimization, chemistry repair or docking validation. Qualification uses
pinned Chromium/SwiftShader and emulated Pixel 7, not physical-device certification.
Existing Alembic and lazy Mol* size advisories remain; historical migration
restrictions for older pocket/visibility schemas still apply.

## 0.11.0 - 2026-10-09

### Highlights and gestures

- Select atoms and open **Transform → Move selection**. Primary drag rotates;
  secondary/Ctrl drag translates in the screen plane. Explicit Rotate/Translate/
  Depth modes, sensitivity and named steps serve keyboard and touch users.
- Capture the complete canonical selection across entries, including hidden
  targets. Rotation uses the captured centroid carried by accumulated translation;
  all entries/conformers receive the same proper world-space rigid transform.
- Hold camera orientation/target during movement; wheel/named zoom remains usable.
  Responsive viewer remounts preserve the temporary pose and held camera.

### Apply, Cancel and fixes

- Multiple drags create one atomic Apply and one undo/redo command. Pointer release
  ends only the drag. Cancel/Escape restores exact captured coordinates; no-op
  preserves revision, artifacts, timestamps, history and redo.
- Task/selection/project changes discard unapplied movement with feedback. Closing
  the inspector alone retains it; dialogs/drawers own their focus and Escape.
- Conflicting/ambiguous requests block replay until captured-project reconciliation.
  Late results cannot revive previews or leak feedback into another project.
- Bounded first/latest rendering avoids queued stale frames. Selected-atom mesh
  cues avoid first-use impostor shader stalls. Surfaces/pockets suspend and restore;
  measurement values visibly pause, then recalculate from authoritative state.

- Restore focus to the replacement structure row after direct membership actions,
  coordinated with menu teardown and guarded by the captured project.

### API, persisted data and compatibility

- Additive `POST /api/v1/projects/{project_id}/selection-transform` accepts a finite
  proper rotation matrix, affine translation, captured selection and expected
  revision. Reject invalid whole batches before writes; numerical endpoints remain.
- No new migration: head remains **0013**; project/normalized/API/archive majors
  remain **1**. Reuse existing coordinate forward/inverse action vocabulary.
  No persisted session/draft or new job type; original uploads, connectivity,
  unselected state and immutable submitted job inputs remain unchanged.
- Applied state survives save/reload/API restart, molecular exports at their
  existing format precision, and exact current-state archives. Archives omit
  portable history. Actual **v0.10.0** reader qualification covers retained batch
  undo/redo, transformed artifacts, save/reexport, archive import and unchanged jobs.
  Readers predating pocket/visibility retain existing limitations; do not strip data.

### Verification and review

The [approved issue #4 plan](plans/issue-4-interactive-selection-transform.md)
records exact checkpoint evidence, both projections, hidden multi-entry targets,
lifecycle/conflict cases, light/dark scoped axe, keyboard/touch, actual 100%/200%
Chrome zoom and inspected screenshots.

Clean corrected candidate `74ced0225ac6520311de8fa5b4726274bf4c8b91` passes the complete README/DEVELOPMENT release gate: **398 Python, 164 frontend / 37 files, 8 supervisor and 138 browser tests / 42 intentional layout skips**, zero failed/flaky cases or configured retries (22.9 minutes). Frozen uv/pnpm installs, fresh migration through 0013, Ruff, mypy (54 files), frontend lint/typecheck, production build (3388 modules) and diff check pass.

Native ordinary 1STP protein-fragment/ligand first preview **132.2/42.6 ms**, exact coordinate Cancel **11.3/14.8 ms**, longest task **115 ms** pass unchanged budgets (preview/Cancel <500 ms, task <750 ms). Each 40-frame burst renders two frames, max active one, exact restoration and zero preview requests. Surface coordinate Cancel **14.1 ms** and regeneration **1056.5 ms** are accounted separately. Actual v0.10.0 reader accepts 0.11.0 data and retained undo/redo, save/reexport and archive import.

Final full-diff review covers proper matrix/atomic batches, canonical copied targets/all conformers/no-op/history, immutable provenance, numerical-preview ownership (D-081), membership/menu focus teardown (D-082), async/context failures, camera/queue/remount lifecycle, surface/measurement/visibility behavior, accessibility/performance, compatibility, versions and approved scope. All consequential findings are corrected and qualified. Review is **local, not independent**. Existing Alembic/bundle advisories and scientific/emulated-device limits remain. No migration or speculative follow-up issue is needed.

Published through [PR #43](https://github.com/ManuelSe/Neistra/pull/43) and [release v0.11.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.11.0) on `4ed61264d9006f81ca528bf42c0c21594121a55b`. The exact merged gate repeats **398 Python, 164 frontend, 8 supervisor and 138 browser tests / 42 intentional skips**, zero failures/flakes/retries. Annotated tag target and downloaded verification-report bytes are verified. [Issue closeout](https://github.com/ManuelSe/Neistra/issues/4#issuecomment-6085403742) records final cleanup. Codex review was requested without a returned review; the completed review is local, not independent.

### Scientific limitations and deferred scope

Movement is manual and unconstrained; partial selections can distort crossing
bonds and create clashes. Missing bond records do not prove safety. No repair,
minimization, preparation, scoring, alignment or docking is implied.

A pivot fixed at the original world location is rejected in favor of the
translated centroid; separate Exit is redundant with Apply/Cancel. Optional pivot
markers, extra launchers and live Euler-field synchronization are deferred to keep
one coherent workflow. Specialized manipulators, persisted drafts, physical-device
and cross-browser certification remain outside scope. No speculative follow-up
issue is created. Qualification uses pinned Chromium/SwiftShader and Pixel 7
emulation; performance is a host regression gate, not a universal guarantee.
Existing lazy Mol* chunk and Alembic configuration advisories remain.


## 0.10.0 - 2026-10-09

### Highlights

- Move complete structures into existing groups, between groups or back to
  Ungrouped. Select entries, open a row's Actions menu and choose **Move to group…**,
  **Remove from group** or **Add to new group**. Desktop grip handles perform the
  same batch command; keyboard and touch use named explicit controls.
- Scope is captured at activation and includes highlighted structures hidden by
  filters. A partial atom selection still moves its complete entry and remains
  unchanged. Duplicate stored names get distinct destination display labels.

### Membership and sorting semantics

- Empty groups remain reusable after moves, ungrouping and final-entry deletion.
  Filtered rows keep group headings accessible; heading counts show matching rows.
- Each changed batch makes one undoable command; same-destination actions make
  no revision/history/timestamp change and preserve redo. Locked entries can move.
- Existing name/type/atom-count/modified sorts retain deterministic ties.
  There is no persisted manual insertion order; undo restores derived placement.

### Fixes

- Response-derived dirty flags preserve entry timestamps through reads and
  checkpoint saves. Membership preserves Modified-sort keys (D-072/D-073).
- Late membership success/conflict feedback, refetch and focus stay with the
  captured project when users switch workspaces (D-074).

### Persistence and compatibility

- The revisioned `POST /api/v1/projects/{project_id}/group-membership` endpoint is
  additive. It rejects invalid whole batches and stale revisions before writes.
- No new migration: head remains 0013 and API/project/normalized/archive schema
  majors remain 1. Existing `group_id`, EntryGroup records and `entries.group`
  action payloads retain their shape. Archives remap IDs and capture current state;
  undo history remains local. Empty destinations and original bytes round-trip.
- Organization preserves molecular artifacts, modified-date entry timestamps,
  viewer state and job provenance. Dirty state remains checkpoint-derived (D-072/D-073).
- Reverting this feature to 0.9.0 needs no data stripping or schema downgrade.
  Existing limits for readers predating pocket/visibility support still apply.

### Verification and review

The [approved issue #9 plan](plans/issue-9-structure-group-membership.md) records
checkpoint evidence for atomicity/history/restart/archive tests, component/viewer
instrumentation, native desktop dragging, Pixel 7 explicit workflows, light/dark
scoped axe and real 100%/200% zoom. Clean candidate qualification passes
**379 Python, 134 frontend, 8 supervisor and
115 browser tests / 41 intentional layout skips**, with zero failed/flaky cases
in the final run. Exact merged qualification also passes the same complete gate on
`cad24628d9221fef26f667eae4275ab23438841f`; the annotated tag and
[release](https://github.com/ManuelSe/Neistra/releases/tag/v0.10.0) are verified. The
[published verification report](https://github.com/ManuelSe/Neistra/releases/download/v0.10.0/neistra-0.10.0-verification.json)
records both gates and exact evidence. Earlier diagnostic failures
are separate from passing release evidence.
Local review is identified accurately; it is not claimed as independent review.

### Scientific limitations and deferred scope

Grouping is organization, not molecular classification, extraction, preparation
or validation. It preserves coordinates, atom identity, selection, camera,
representations, surfaces and job inputs. Pixel 7 evidence is emulation, not
physical-device or cross-browser certification. The existing lazy Mol* chunk-size
advisory and Alembic configuration deprecation remain.

Automatic empty-group deletion is rejected so destinations stay reusable.
Manual order, saved sort/filter preferences, live tab synchronization, touch drag,
keyboard drag simulation and group lifecycle management are deferred. Nested,
multiple and automatic membership are out of scope. Component naming/classification
remains #20; extraction/subset export remains #21; no speculative follow-up is created.

## 0.9.0 - 2026-09-15

### Highlights

- Create a saved protein pocket view from captured ligand or site atoms through
  **Surface options → Pocket…**. Choose a receptor, set a 2–12 Å radius (5 Å
  default), and Apply. Use selection explicitly replaces captured seeds.
- Keep the existing compact palette: no permanent pocket row or layer list.
  Remove works with no selection; scenes retain alternate views.
- Fragment and Pocket have independent Cancel/Retry actions while sharing one
  bounded worker queue. Hidden seeds supply current coordinates without becoming
  visible.

### Scientific definition and limits

Pocket-v1 computes the complete current protein molecular surface with native
physical radii, a 1.4 Å probe, 0.5 Å grid and 36 probe positions. It keeps whole
triangles whose centroids are within the radius of any captured seed center.
Vertices, normals, winding, colors and picking retain receptor ownership.
Cut edges stay open; disconnected and empty patches are valid.

Supplied protein hydrogens contribute regardless of atomic display settings.
Separately classified ligands, water, ions and cofactors are excluded from receptor
context. Atomic hiding does not reshape the pocket; isolation filters owner
triangles without truncating calculation context. No alignment, preparation,
automatic cavity detection, volume/area/scoring or binding significance is implied.

### Fixes and lifecycle

Seed/receptor coordinate previews suppress obsolete pockets; cancel restores
committed geometry and commit regenerates from current coordinates. Already-applied
coordinate commits avoid duplicate invalidation. Current selection, colors and
camera do not silently retarget saved seeds. Topology/entry deletion prunes seeds
reversibly across owners and scenes; the last seed clears the pocket. Empty protein
context retains valid seed intent and still permits removal.

### Persisted data, migration and compatibility

Migration **0013** adds nullable pocket definitions at every documented live,
checkpoint, scene and forward/inverse settings path. Back up the database and
artifacts before upgrading. Downgrade to 0012 refuses any non-null retained pocket
before writing; removing the live view does not erase history. Restore a pre-upgrade
backup when a lossless downgrade refuses.

The revisioned selection-pocket-surface API provides exact no-ops and undo/redo.
Archives remap all exported entry/scene seed references and derive an imported
checkpoint. D-035/D-069 preserve current-state archives; command history is not
portable. API/project/archive/normalized majors remain 1. Prior archives default
null; older readers are unsupported for pocket-bearing archives. Original bytes,
normalized scientific artifacts, supplied conformers and warnings remain intact.

### Verification

C3 qualification passes 124 frontend tests and 30 pocket API tests, plus the full
focused browser matrix (33 passed / 9 intentional layout skips). The final UI
review retest passes three workflows / one layout skip. Native geometry, actual
colors/picking, hidden-seed coordinate dependencies, migration paths, archives,
light/dark accessibility and actual browser zoom are covered.

Clean candidate `18d8cf3` passes the complete gate: **366 Python, 125 frontend,
8 supervisor and 104 browser tests / 40 intentional layout skips**, frozen installs,
fresh migration 0013, lint/type/build and clean-tree checks, with zero failures or
flaky browser cases. The exact merged-master gate remains required before tag and
publication. Final commands, commits and results are recorded in the
[feature plan](plans/issue-36-pocket-surfaces.md) and release verification attachment.

### Scope decisions and follow-up work

This is the approved seed-centered, protein-only, one-pocket-per-receptor slice.
Automatic cavity discovery/ranking, custom nonprotein context, multiple managed
pocket layers, mesh export and analytical metrics remain deferred or rejected as
claims for this feature. They require separate scientific/product work; no
speculative follow-up issues were created. Classification #20 and coordinate-subset
export #21 remain separate.

The release is a **minor** increment: additive visible functionality, an additive
revisioned endpoint and a nullable persisted setting, with existing behavior and
prior-project/archive readers preserved in the new application. It does not require
a major or prerelease increment.


## 0.8.0 - 2026-09-14

### Highlights

- Hide or show arbitrary selected atom detail with one compact sixth tile. Mixed
  selections use Hide; Show restores prior styles. Polymer and surface geometry,
  selection, camera and measurements remain independent.
- Apply an atomic representation or Reset to reveal its target in the same saved
  command. Hidden atoms remain selectable through hierarchy, queries and visible
  polymer/surface picks; atom labels and incident atomic bonds are hidden.
- Generate larger whole-protein fragment surfaces with coordinated resource limits
  and staged native allocation accounting. Reuse immutable geometry inputs and
  allocate worker buffers only for calculations that are actually needed.

### Fixes and performance

Raise effective atom capacity to 100,000, padded grid cells to 64 million, mesh
allocation to 512 MiB, retained output to 1 GiB, accounted working buffers to 2 GiB
and calculation deadline to 120 seconds. Retain one worker and the existing
250,000-atom parent-entry degradation. Cancellation, retry and truthful fallback
remain available; limits are allocation policies, not browser/GPU heap ceilings.

Pinned whole 6VXX (23,694 atoms) and 1AON (58,870 atoms), plus a synthetic 100,000-atom
case, render within the approved desktop/Pixel 7 emulation gates. Qualification,
process memory and exact timings are in [Performance](PERFORMANCE.md); no physical
phone or arbitrary-hardware performance guarantee is implied.

### Persisted data, migration and compatibility

Migration **0012** defaults `selection_hidden_atoms` to `[]` in live entries,
checkpoints, scenes and retained forward/inverse commands. Back up before upgrade.
Downgrade to 0011 is allowed only when **every retained mask is empty**; showing
current atoms does not erase history. Refusal validates all retained locations
before writing. Otherwise restore the pre-upgrade backup.

The revision-checked, multi-entry `selection-atom-visibility` API supports exact
Hide/Show with no-op preservation. Generic settings updates cannot change masks.
Topology deletion prunes references reversibly; new atoms do not inherit hiding.
API/project/archive/normalized schema majors remain 1. New readers accept older
archives with absent masks; older readers are unsupported for visibility-bearing
archives. Original bytes, coordinates, bonds, conformers and warnings are unchanged.
Visible export remains entry-based. This additive user-visible capability warrants
a minor release; all five application version sources advance to 0.8.0.

### Verification

The [approved plan](plans/issue-38-selection-visibility-capacity.md) records exact
checkpoint, complete candidate and merged-commit evidence and publication audit.
Tests cover native incident bonds and unchanged polymers/surfaces, all/partial/
mixed hiding, hidden-atom reselection, cached projections, reload/history/scenes/
archives, every retained migration path, memory boundaries and cancellation.
Both themes, 44 px targets, keyboard interaction, Pixel 7 emulation and actual
100%/200% browser zoom are qualified. Full release gates remain mandatory before
publication; their final counts and commits are recorded with the release.

### Scientific limitations and deferred requests

The molecular-v1 algorithm remains unchanged: selected-fragment context, physical
radii, 1.4 Å probe, 0.5 Å grid and 0.45 opacity. Cut boundaries may create artificial
faces. There is no silent resolution reduction, chemistry repair or unlimited
allocation. Atom hiding does not reshape surfaces. Context-aware pocket patches
follow under approved [#36](https://github.com/ManuelSe/Neistra/issues/36), after
this release. Classification (#20), subset export (#21), adjustable profiles and
automatic cavity discovery remain outside this scope; no speculative issues added.


## 0.7.0 - 2026-09-12

### Highlights

- Add or remove selected atoms from one durable fragment-surface membership per
  entry, directly in the compact Style selection palette. Mixed counts and
  on-demand scientific help keep repeated styling quick.
- Keep atom/polymer representations, existing entry surfaces, selection colors
  (including carbon-only), hydrogen preferences and their resets independent.
  Memberships survive selection changes, saves, undo/redo, scenes and archives.
- Generate fixed-profile molecular surfaces asynchronously in a cancellable worker.
  Reuse geometry for color changes, hide stale geometry during coordinate previews,
  and regenerate for committed coordinates, membership and visibility changes.

### Fixes

- Preserve the application camera across asynchronous empty-scene rebuilds;
  dispose renderer state across cached project switches.
- Retain saved intent on cancellation or resource/worker failure, with explicit
  line fallback and Retry. Report rendering failure accurately if lines also fail.
- Prune deleted atoms reversibly; newly added atoms do not inherit membership.
- Preserve committed coordinates and active previews across visibility/style
  rebuilds without mutating application inputs; avoid redundant measurement
  rebuilds during camera updates and quadratic surface membership counting.

### Persisted data, migration and compatibility

Migration **0011** adds `selection_surface: null` defaults to live entries,
checkpoints, scenes and retained forward/inverse commands. Back up managed data
before upgrading. Downgrade to 0010 is allowed only when **every retained surface
value is null**; removing a visible surface does not erase history or scene values.
Otherwise restore the pre-upgrade backup. Refused downgrades leave state intact.

API/project/archive/normalized schema majors remain 1. The additive
`POST /api/v1/projects/{id}/selection-surface` action is revision-checked and atomic
across entries; no-ops do not create history. New readers accept older archives,
with absent memberships defaulting to null. Older readers are not supported for
new surface-bearing archives. Original uploads, normalized coordinates, bonds,
conformer data and scientific warnings are unchanged by styling. Application
version metadata advances consistently in all five authoritative sources.

### Scientific interpretation and limits

The fixed profile uses selected atoms alone, native physical radii, a 1.4 Å probe,
0.5 Å resolution and 0.45 opacity. Partial residues/cut boundaries can produce
artificial faces: this is **not a patch computed from the surrounding molecule**.
Visibility/isolation and full-projection hydrogen classification filter rendering
without changing membership. Entries do not fuse; entry and selection surfaces can
coexist and overlap. No repair, capping, protonation or conformer resolution occurs.

Limits: one worker per viewer; 20,000 effective atoms; four million padded grid
cells; 64 MiB mesh allocation per surface; 128 MiB retained selection meshes; a
30-second calculation deadline. The existing 250,000-atom parent-entry degradation
remains. These are bounded work/allocation policies, not browser/GPU heap ceilings.

### Verification

The [approved plan](plans/issue-30-selection-surfaces.md) records checkpoint,
full candidate and exact merged-commit gates, review and publication evidence.
Coverage includes analytic geometry, real WebGL element/carbon colors and picking,
partial residues, explicit H, coordinate invalidation, cancellation/retry, upload
failure, per-entry failure isolation, persistence/archive round trips, every
migration retention path, warning/original-byte invariance, keyboard/touch targets,
both themes and actual 100%/200% zoom. Performance and process-memory evidence is
in [Performance](PERFORMANCE.md). Qualification uses pinned Chromium/SwiftShader
and Pixel 7 emulation; physical devices and other engines are not claimed.

### Deferred and rejected requests

Context-aware selected surface patches are tracked in
[#36](https://github.com/ManuelSe/Neistra/issues/36), because they need a separate
scientific contract for context, boundaries and triangle ownership. Adjustable
profiles and additional algorithms are deferred pending need. A generic layer
manager is rejected as unnecessary complexity for this workflow. Classification
expansion (#20) and subset export (#21) remain separate; no mesh export, chemistry
repair or speculative profile/layer follow-ups were added.


## 0.6.1 - 2026-09-11

### Highlights

- Replace the large styling dialog with a compact non-modal palette that stays
  open while selecting atoms and rotating the molecule.
- Apply seven illustrated representation choices and eight color swatches in one
  activation. Preserve All atoms / Carbon only behavior, independent resets and
  explicit custom-color Apply behind Custom….
- Keep hydrogen controls compact and distance expansion/help initially collapsed.
  A live atom count, mixed states, concise feedback and a sticky close header make
  repeated styling easier. Touch controls are at least 44×44 px; narrow/zoomed
  layouts scroll within the palette.

### Fixes

- Capture the selection at command activation and suppress outdated success
  feedback after selecting another target; attribute previous-target errors.
- Serialize palette mutations, reject stale eligibility results, close across
  project switches and preserve outside workspace interaction and focus.
- Constrain the palette to the viewport and track toolbar/panel resizing without
  clipping it to the molecular canvas.

### Persisted data, migration and compatibility

No new migration, public API, project/archive schema or molecular data change.
Migration head remains 0010. v0.6.0 projects and archives remain compatible;
older supported archives retain their existing defaulting behavior. Original
uploads, coordinates, connectivity, chemistry warnings, scenes, history and
appearance assignments retain their established semantics. Only application
version metadata advances to 0.6.1 in all five authoritative sources.

### Verification

The [approved feature plan](plans/issue-34-compact-selection-styling.md) records
checkpoint gates, full candidate/released-commit gates and delivery references.
Coverage includes frontend components, real WebGL carbon/element colors,
explicit-H bounds, hidden-entry expansion, pending-request targeting, live picking
and orbit, persistence/archives, light/dark accessibility, touch sizes and actual
100%/200% zoom. Existing performance budgets remain unchanged. Screenshots and
usage are in [Selection styling](SELECTION_STYLING.md).

### Limitations and deferred work

This is an interface improvement, not a new chemistry or rendering capability.
Expansion still assumes a common Cartesian frame. Hydrogen preferences target
explicit selected H and use available connectivity; they do not infer attached
hydrogens, repair chemistry or determine protonation. Carbon-only assignments
retain the existing explicit element-override semantics. Qualification uses pinned
Chromium/SwiftShader and Pixel 7 emulation, not physical devices or other browsers.
General instructions moved into disclosures; scientific constraints remain
available. Presets, hover previews and new algorithms were deliberately deferred
because they are unnecessary for this workflow correction. Selection-specific
surfaces remain existing follow-up #30; no additional speculative issues were made.


## 0.6.0 - 2026-09-11

Status: [released as v0.6.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.6.0) from verified commit
`b747f0cccdb575d38022d4b42bfb7e8fa2e1c849` (PRs #31 and #32). Detailed evidence:
[feature plan and delivery closeout](plans/issue-29-selection-appearance.md).

### Highlights

Style selection now supports distance expansion, independent solid colors, and
local non-polar-hydrogen preferences in the existing molecular workflow.

### Added

- Expand around selected atoms with a positive cutoff (default 4 Å), to matching
  atoms or complete residues. Retain seeds and orphan matches, with cancellation
  and stale-result protection. Hidden project entries participate without
  becoming visible.
- Set/reset durable solid colors on exact selected atoms using Mol* overpaint.
  Choose All selected atoms or Carbon atoms only; the latter restores native
  element colors on other selected atoms, retaining unrelated assignments.
- Set Show/Hide/Use entry setting for explicit selected hydrogens. Mixed states,
  loading failures, empty targets and master-switch dependencies are explained.
- Reuse existing atomic styles, Backbone and Cartoon; keep each property's reset
  independent. Retain settings through history, duplication, scenes and archives.

### Fixes and display semantics

- Preserve the last valid camera while disposable Mol* scenes rebuild, preventing
  a transient zero-radius camera from reaching scene persistence.
- Local hydrogen preferences override the entry nonpolar setting; master
  hydrogen, component, entry visibility and isolation remain upper bounds.
  Classify on full projected connectivity before any subset filtering.
- Use indexed property membership lookups for selection summaries. Appearance
  changes reuse artifact caches and do not mutate molecular data or selection.

### Scientific limitations

Distance expansion assumes a shared Cartesian frame and supplies no alignment,
periodic geometry, contact classification or binding-site inference. Hydrogen
preferences target explicit selected H, never hydrogens implicitly attached to
selected heavy atoms. Polarity follows the pinned Mol* N/O/S/F/Cl/Br/I-neighbor
convention and available connectivity; there is no chemistry repair, generation
or protonation analysis. Continuous cartoon/surface color boundaries follow
atom-associated primitives. Ligand focus uses heavy atoms when local hydrogen
preferences exist.

### Migration and compatibility

Alembic 0010 defaults both appearance collections in live, checkpoint, scene and
retained command settings. Back up the managed directory, stop API/worker, and
upgrade before restarting. Downgrade refuses loss of non-default appearance in
any retained state, including history. See [migration guidance](DEVELOPMENT.md).

API v1, project/archive/normalized schema 1, immutable originals, scientific
artifacts, `.molweave.zip`, Python modules, plugin identifiers and `MOLWEAVE_*`
configuration remain compatible. Supported older projects and archives remain
readable; older applications are not guaranteed to read new appearance data.
This additive user-visible feature is a minor increment from 0.5.0 to 0.6.0.

### Accessibility and performance

Qualified integrated keyboard workflows and scoped axe checks in both themes on
desktop Chromium and Pixel 7 emulation, plus actual 100%/200% desktop browser zoom.
The established 1STP readiness, interaction, long-task and artifact-request budgets
remain release gates. No cross-browser, hardware-GPU or large-system throughput
certification is implied. The existing lazy Mol* bundle advisory remains.

### Verification

Checkpoint evidence includes domain, API, history/restart, migration/downgrade,
legacy archive, topology, component and real-WebGL tests. Pixel checks verify
actual color application/reset, selected C–H disappearance, polar O–H retention
and master/local precedence for explicit protein and ligand fixtures. The final candidate passed the complete README/DEVELOPMENT release gate:
237 Python tests, 80 frontend tests, eight supervisor tests, and 73 browser
workflows (39 documented layout skips), plus frozen setup, migrations, lint, type
checks and build, including the carbon-only amendment. The same complete gate
passed on the exact merged release commit. An initial
29 ms timing-budget excursion was followed by three passing unchanged isolated
checks and a passing fresh complete gate; no performance limits were relaxed.
Executed results and publication evidence are recorded in the feature plan.

### Deferred work

Selection-specific surfaces are deferred to [#30](https://github.com/ManuelSe/Neistra/issues/30)
for a defensible subset/context geometry, persistence and resource-limit contract.
Existing entry surfaces remain supported. Entry-wide controls were rejected as a
substitute for local controls. Extra color schemes, opacity, labels, presets,
overlays, live previews and duplicate menus are outside this approved scope.
Ligand designation, component classification and subset export remain #11, #20
and #21.

### Neistra presentation since the preceding numbered release

Includes the previously merged Neistra rebrand (PR #28): Sparked N identity,
“Shape molecular structure.” welcome, coordinated themes, responsive controls and
human-facing diagnostics. Private JavaScript packages use Neistra names; persisted
formats and backend identifiers remain compatible. The rebrand itself retained
0.5.0; this release's new version belongs to the selection-appearance feature.

## 0.5.0 - 2026-08-09

Status: released as annotated tag
[`v0.5.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.5.0)
from [PR #26](https://github.com/ManuelSe/MolWeave/pull/26), closing
[issue #1](https://github.com/ManuelSe/MolWeave/issues/1)

### Highlights

- Added a durable **Show non-polar hydrogens** preference beneath the existing
  master **Show hydrogens** control, providing all, polar-only, and none modes.
- Applied the mode consistently to protein and ligand projections, inherited
  and exact-selection atomic styles, and surfaces while preserving molecular
  state, original uploaded files, camera, selection, picking, and isolation.
- Added reversible history, checkpoint/reload recovery, named-scene and archive
  persistence, explicit-connectivity scientific fixtures, and responsive
  keyboard-accessible controls.

### Added

- Additive typed `components.nonpolar_hydrogens` state in backend and frontend
  viewer settings, defaulting to `true` for existing projects and archives.
- One centralized effective-mode projection to Mol* for Line, Thin/Thick
  sticks, Ball and stick, Space filling, and Surface layers, including exact
  selection-specific targets.
- Checksum-locked synthetic protein PDB and ligand MOL fixtures with one
  explicit C-bound hydrogen and one explicit O-bound hydrogen each, plus
  unit, integration, migration, component, and real-WebGL qualification.

### Hydrogen display semantics

- With both controls enabled, every explicit hydrogen allowed by the current
  structure and representation is shown. Disabling only non-polar hydrogens
  retains explicit hydrogens bonded to N, O, S, F, Cl, Br, or I and hides
  carbon-bound hydrogens. Disabling the master control hides all hydrogens while
  preserving the dependent preference for later re-enabling.
- Polar-only uses the pinned Mol* 5.11 `non-polar` ignore variant and projected
  bond connectivity. It does not persist a second chemical classification or
  infer attachment from coordinates, atom names, or application component
  labels.
- The existing all/none master setting, application-owned molecular state, and
  disposable Mol* projection architecture were already present and are reused.
  The issue's suggested toggle was adapted to MolWeave's existing Components
  controls rather than adding a separate settings system.

### Scientific limitations

- This is presentation filtering, not hydrogen generation, bond inference,
  protonation or tautomer assignment, pKa estimation, donor/acceptor analysis,
  hydrogen-bond detection, chemistry repair, or docking preparation.
- Atom labels remain independent. Aggregate ligand focus uses heavy atoms in
  polar-only and none modes as a deterministic navigation simplification, not
  as an application-owned polarity classification.
- Automated WebGL evidence covers explicit-connectivity protein and ligand
  fixtures in pinned Chromium/SwiftShader. It does not claim ambiguous or
  missing-bond behavior, every format, cross-browser equivalence, hardware-GPU
  behavior, WebXR, or subjective molecular aesthetics.

### Persistence and migrations

- Alembic `0009` adds the default to live entry, checkpoint, and named-scene
  viewer JSON. Downgrade removes it only while all stored values are `true`;
  otherwise downgrade stops with instructions to re-enable non-polar
  hydrogens, preventing silent preference loss.
- Undo/redo, reload and checkpoint recovery, named-scene application, and
  portable archive export/import preserve the exact setting. Molecular atoms,
  bonds, coordinates, conformers, artifacts, warnings/inferences, and original
  uploaded bytes remain unchanged.

### Accessibility and performance

- Both controls are named native pressed buttons. The dependent control stays
  discoverable with an explained disabled state while the master hides all
  hydrogens; desktop and Pixel 7 keyboard, viewport, overflow, and scoped axe
  workflows pass.
- Toggling rebuilds disposable Mol* representations while restoring camera and
  canonical selection. Repeated changes reuse the artifact-keyed structure
  query; qualification observes one normalized-structure request before reload.
- No incremental-rendering, new large-system latency/GPU-memory budget, or
  screen-reader access to individual WebGL atoms is claimed. Existing reduced-
  detail and manual accessibility boundaries remain in force.

### Verification

- Checkpoints passed Ruff, strict mypy across 50 source files, ESLint,
  TypeScript, all 65 Vitest tests, production build, 27 persistence/migration
  tests, and 17 focused scientific/integration tests.
- Fresh Alembic `0009` browser qualification passed all 6 applicable issue
  workflows with 4 intentional cross-layout skips in 50.6 seconds, covering
  all three modes, protein and ligand behavior, every required representation,
  durability, molecular/original invariance, hydrogen-free input, transient
  state, request reuse, accessibility, and responsive bounds.
- The complete gate passed frozen installs, Alembic `0009 (head)`, Ruff,
  strict mypy across 50 source files, all 209 Python tests, ESLint, TypeScript,
  all 65 Vitest tests, all 7 supervisor tests, the production build, and all 46
  applicable desktop/mobile Playwright workflows with 34 intentional layout
  skips in 9.1 minutes.
- The build keeps Mol* lazy at 966.42 KiB gzip and the initial application at
  154.84 KiB gzip. Complete local diff review findings were fixed and their
  affected frontend/configuration/WebGL checks rerun; no consequential finding
  remains. This review is not claimed as independent.

### Compatibility and deferred work

- This is a backward-compatible minor release from 0.4.0 to 0.5.0. `/api/v1`,
  `ProjectStateV1`, `ProjectManifestV1.schema_version`, archive schema version
  1, and `NormalizedStructureV1.schema_version` remain unchanged. Valid v0.1.0
  through v0.4.0 producer archives remain readable; missing additive fields
  retain all-hydrogen behavior. Older releases do not promise forward import
  of v0.5.0 archives.
- Per-selection and per-representation hydrogen modes and polarity-aware label
  suppression remain deferred pending demonstrated demand and precedence/UI
  design. No speculative follow-up issue is created for them.
- Hydrogen-bond analysis, protonation, pKa, and donor/acceptor analysis remain
  separate scientific workflows; docking preparation remains outside core.
  A new backend chemistry endpoint, persisted inferred attachment, and normalized
  bond rewriting were rejected as unnecessary or scientifically expansive.

## 0.4.0 - 2026-08-09

Status: released as annotated tag
[`v0.4.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.4.0)
from [PR #24](https://github.com/ManuelSe/MolWeave/pull/24), closing
[issue #7](https://github.com/ManuelSe/MolWeave/issues/7)

### Highlights

- Added durable representation styling for any exact canonical selection from
  the existing viewer, hierarchy, sequence, inspector, query, or saved-
  selection paths.
- Added five atomic presentation choices—Line, Thin sticks, Thick sticks, Ball
  and stick, and Space filling—plus Backbone and Cartoon for compatible exact
  complete polymer residues.
- Added one accessible **Style selection** workflow with reset, reversible
  history, project/scene/archive persistence, and unchanged camera, current
  selection, picking mode, coordinates, topology, and original uploads.

### Added

- A typed `selection_representations` field in application-owned viewer
  settings and one revisioned project-level apply/reset endpoint that updates a
  multi-entry selection atomically.
- Exact disposable Mol* bundle layers that preserve entry-level presentation,
  component/hydrogen/isolation visibility, independent surfaces, and
  two-selected-endpoint atomic bond boundaries.
- Fixed compatible Thin/Thick stick profiles, authoritative complete-residue
  protein/DNA/RNA validation, frontend availability reasons, topology-deletion
  reconciliation, and scene/history restoration.
- Desktop and Pixel 7 qualification for mixed protein/ligand/residue/ion/water
  styling, exact covalent boundaries, normalized-query reuse, nonblank WebGL,
  keyboard operation, focus restoration, axe, and responsive bounds.

### Styling and replacement semantics

- Atomic and polymer presentation are two independent replacement channels.
  Applying a style removes selected atoms only from other styles in that
  channel, so atomic detail can coexist with polymer context without arbitrary
  layer ordering.
- Reset removes the exact selected atoms from both channels and reveals the
  applicable inherited entry-level representations. Same-style records merge
  and each entry is bounded to seven selection-specific records.
- Backbone and Cartoon reject partial residues, unsupported material, missing
  trace atoms, and mixed-invalid multi-entry requests without partial changes.
  Atomic styles retain exact atom membership and never expand a target across
  a covalent boundary.

### Scientific and viewer boundaries

- Styling changes presentation only; it is not chemistry, structure
  preparation, ligand designation, bond-order interpretation, contact/clash
  analysis, or a modification of molecular artifacts.
- Space filling uses Mol* element-radius rendering. Thin and Thick sticks are
  fixed visual profiles and do not encode bond order, confidence, energy, or
  chemical type.
- Selection-specific layers use element coloring and full opacity. Current
  component and hydrogen visibility plus isolation can hide assigned atoms
  without deleting their durable styles.
- Mol* remains a disposable renderer. Canonical atom identity, validation,
  commands, scenes, archives, camera, and selection remain application-owned.

### Accessibility and performance

- The focusable launcher exposes unavailable reasons through `aria-disabled`;
  the named dialog provides semantic selection counts/groups, pressed/busy
  states, adjacent polymer reasons, and announced outcomes.
- Desktop and Pixel 7 automation covers keyboard application, Escape focus
  restoration, viewport containment, horizontal overflow, and scoped WCAG 2.2
  axe rules. WebGL molecular colors and subjective readability remain within
  the documented manual inspection boundary.
- Styling reuses the artifact-keyed normalized-structure query: repeated
  applications make no per-style structure request. Disposable rebuilds retain
  camera and selection; the existing 250,000-atom reduced-detail behavior and
  lazy Mol* bundle remain unchanged.

### Verification

- Pure domain/schema, API/service, migration, archive, edit-reconciliation,
  viewer-projection, adapter, component, and real-WebGL tests cover assignment
  algebra, compatibility, exact targets, one-revision history, scene/reload,
  immutable originals, camera/selection invariance, accessibility, and query
  reuse.
- Checkpoints passed Ruff, strict mypy, ESLint, TypeScript, up to 61 Vitest
  tests, production builds, 21 focused integration tests, and an affected
  browser matrix with all 11 applicable desktop/mobile workflows passing.
- The complete gate passed frozen installs, Alembic `0008 (head)`, Ruff, strict
  mypy across 49 source files, 201 Python tests, ESLint, TypeScript, 61 Vitest
  tests, 7 supervisor tests, the production build, and all 40 applicable
  desktop/mobile Playwright workflows with 30 intentional cross-layout skips
  in 9.3 minutes.
- The build keeps Mol* lazy at 966.43 KiB gzip and the initial application at
  154.58 KiB gzip. The complete `origin/master...HEAD` review found no
  consequential scope, scientific, persistence, migration, archive,
  accessibility, performance, dead-code, or compatibility issue.

### Compatibility and migrations

- This is a backward-compatible minor release from 0.3.0 to 0.4.0. `/api/v1`,
  `ProjectStateV1`, `ProjectManifestV1.schema_version`,
  `NormalizedStructureV1.schema_version`, and archive schema version 1 remain
  unchanged.
- Alembic `0008` adds an empty selection-representation list to live entry,
  checkpoint, and named-scene viewer JSON. It refuses downgrade while any
  assignment is non-empty, preventing silent data loss; reset those styles
  before an intentional downgrade.
- Valid v0.1.0 through v0.3.0 archives remain readable; a v0.3.0 archive that
  omits the additive field defaults it to empty. v0.4.0 archives preserve
  assignments and original bytes. Older releases do not promise forward import
  of v0.4.0 archives.

### Deferred and follow-up work

- Selection-specific colors, opacity, labels, surfaces, same-channel layering,
  advanced add/remove controls, and presets remain deferred until their
  precedence, editing, persistence, and large-structure behavior are designed.
  No speculative advanced-presentation or preset issue was created solely for
  this release.
- Hydrogen filtering remains covered by issue #1, ligand-of-interest state by
  issue #11, component classification overrides by issue #20, and component
  subset export by issue #21.
- A copied Maestro layout/assets/terminology, a duplicate Ribbon choice,
  context-menu duplication, automatic nearby-component presets, and a duplicate
  Molecule granularity were rejected as proposed. Existing MolWeave hierarchy
  and selection paths provide the bounded workflow instead.

## 0.3.0 - 2026-08-06

Status: released as annotated tag
[`v0.3.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.3.0)
from [PR #22](https://github.com/ManuelSe/MolWeave/pull/22), closing
[issue #2](https://github.com/ManuelSe/MolWeave/issues/2)

### Highlights

- Added an expandable per-structure hierarchy for protein, DNA, RNA, other
  polymers, ligands, water, solvent/additives, ions/metals, other heterogens,
  and explicitly unclassified material.
- Added deterministic source-aware component identities and conservative
  classification provenance without making the disposable Mol* viewer an
  authority for molecular state.
- Category and individual component actions now produce the same canonical
  atom selection used by the viewer, inspector, sequence, measurements, saved
  selections, and applicable editing paths.

### Added

- Optional normalized source entity, subchain, polymer-type, and tabulated
  residue-kind facts retained at the macromolecular adapter boundary.
- A typed, read-only `ComponentHierarchyV1` projection on the existing lazy
  structure response, with complete disjoint membership and surfaced fallback
  or ambiguity warnings.
- Hierarchy-owned projection for existing Protein, Ligands, Solvent, and Ions
  visibility settings plus aggregate visible-ligand focus.
- Desktop and Pixel 7 workflows for exact membership, modifier selection,
  camera neutrality, explicit focus, saved-selection reload, durable
  visibility, accessibility, viewport bounds, query reuse, and real WebGL.

### Fixed

- Newly added atoms and hydrogens in a standalone single-residue ligand retain
  that residue, so regenerated component membership does not split them into
  an unclassified component. Ambiguous multi-residue edits still avoid
  inventing membership.

### Scientific behavior and limitations

- Source entity/subchain/polymer facts take precedence. Documented residue and
  element rules are conservative fallbacks; unsupported evidence remains
  visible as unclassified with warnings.
- `ligand` is a putative non-polymer/cofactor class, not a validated binder,
  ligand-of-interest designation, substrate, inhibitor, docking input, or
  functional claim.
- Source component boundaries remain authoritative across explicit covalent
  links because PDB/PDBx connectivity can be incomplete. Detection organizes
  normalized identity; it does not validate or prepare chemistry.
- Durable component labels or reclassification, individual style/visibility,
  ligand-of-interest state, and arbitrary subset extraction/export are not
  included.

### Verification

- Domain, adapter, scientific, integration, archive, API, component, and
  browser evidence covers all ten categories, exact complete membership,
  coordinate-stable IDs, topology regeneration, source/fallback ambiguity,
  immutable originals, and legacy normalized artifacts.
- Checkpoint gates passed Ruff, strict mypy, ESLint, TypeScript, 56 Vitest
  tests, the production build, 35 focused integration tests, and 8 applicable
  hierarchy Playwright workflows with 8 intentional cross-layout skips.
- The complete v0.3.0 release-gate result is recorded in
  `docs/VERIFICATION.md` and the approved issue plan.

### Compatibility and migrations

- This is a backward-compatible minor release from 0.2.1 to 0.3.0.
- `/api/v1`, Alembic head `0007`, `ProjectStateV1`,
  `ProjectManifestV1.schema_version`, `NormalizedStructureV1.schema_version`,
  and archive schema version 1 remain unchanged.
- There is no database, project, selection, scene, job, browser-storage, or
  archive-schema migration. New normalized source fields are optional, and old
  artifacts or archives derive a conservative fallback hierarchy without
  rewrite. Archive round trips retain producer provenance through 0.2.1.

### Accessibility and performance

- Native disclosures and named pressed-state buttons expose counts,
  provenance, and warnings semantically. Keyboard, axe, focus restoration,
  responsive bounds, and horizontal overflow are covered in both layouts.
- The hierarchy reuses the artifact-keyed normalized-structure query and
  derives membership in linear passes plus deterministic sorting. Component
  instance lists remain unmounted until their category is expanded.
- The known large Mol* dependency remains lazy; no hierarchy interaction adds
  a repeated structure request.

### Deferred, rejected, and follow-up work

- Durable component names and classification overrides require a focused data,
  command, archive, and conflict-resolution design and are tracked separately.
- Component subset extraction/export requires an explicit product decision on
  boundary bonds, metadata, provenance, and lossy formats and is tracked
  separately.
- Selection-specific styling remains with issue #7; ligand-of-interest state
  remains with issue #11. Per-component style/visibility controls, speculative
  confidence badges, automatic primary-ligand selection, and docking-specific
  behavior were rejected from this release.

## 0.2.1 - 2026-08-06

Status: released as annotated tag
[`v0.2.1`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.1) from
[PR #17](https://github.com/ManuelSe/MolWeave/pull/17)

### Highlights

- Primary mouse and touch activations in the molecular viewer now update
  transient canonical selection without implicitly reframing or resetting the
  camera.
- Unmodified empty-space activation clears a non-empty selection while
  already-empty and modified-empty activation are no-ops.

### Fixed

- Removed primary, modified-primary, and primary-equivalent trigger bindings
  from Mol* camera-focus and representation-focus behavior.
- Preserved Atom, Residue, Chain, and Structure picking plus replace,
  Ctrl/Meta/Shift add, and Alt subtract semantics.

### Interaction behavior

- Mol* remains responsible for hit testing and its click-versus-drag threshold.
  Camera orbit, pan, zoom, secondary behavior, and a drag beyond that threshold
  remain unchanged.
- Focus selection and Fit all visible remain explicit application actions and
  continue to change the camera when invoked.
- Viewer clicks remain transient: they do not issue project commands, mutate
  molecular data, change artifacts or revisions, or refetch normalized
  structures.

### Verification

- Direct interaction tests inspect both configured Mol* focus behaviors,
  exhaust Primary/Trigger activation with every supported modifier, retain
  secondary camera bindings, and cover empty-space policy.
- All 54 frontend unit/component tests pass, together with ESLint, TypeScript,
  and the production build.
- A dedicated real-WebGL matrix passes 2 applicable desktop/mobile workflows
  with 2 intentional cross-layout skips. It covers all seven representations,
  four granularities, modifiers, exact camera invariance, empty clearing and
  no-ops, drag behavior, explicit focus, durable-state equality, request counts,
  and Pixel 7 touch activation.
- Existing viewer-control and synchronized-selection regressions pass 6
  applicable workflows with 6 intentional cross-layout skips.
- The complete release gate passes: frozen Python and JavaScript installs,
  Alembic `0007 (head)`, Ruff, strict mypy across 46 source files, 182 Python
  tests, ESLint, TypeScript, 54 Vitest tests, 7 supervisor tests, the production
  build, and 35 applicable desktop/mobile Playwright workflows. Playwright
  intentionally skips 25 cross-layout cases and completed in 8.3 minutes.
- The production build retains the known non-blocking lazy Mol* chunk warning:
  Mol* is 966.15 KiB gzip and the initial application chunk is 151.14 KiB gzip.

### Compatibility and migrations

- This is a backward-compatible patch release from 0.2.0 to 0.2.1.
- `/api/v1`, Alembic head `0007`, `ProjectStateV1`,
  `ProjectManifestV1.schema_version`, `NormalizedStructureV1`, and archive
  schema version 1 are unchanged.
- There is no database, project, molecular, selection, scene, browser-storage,
  API, or archive-schema migration. Archive round trips retain 0.1.0 and 0.1.1
  provenance and add explicit 0.2.0 producer compatibility evidence.

### Scientific, accessibility, and performance implications

- No atom identity, hierarchy, coordinates, topology, chemistry,
  classification, warning, or inference behavior changes.
- No new control or screen-reader object model is introduced; existing named
  toolbar, inspector, sequence, and selection-summary alternatives remain.
- No new network request or molecular projection is introduced. Removing
  unintended focus animations reduces work on ordinary selection clicks.
- Real-WebGL qualification remains bounded to the repository's pinned
  Chromium/SwiftShader desktop and Pixel 7 projects.

### Deferred and follow-up work

- Molecule/Component picking is not added; issue #2 owns the stable component
  identity and hierarchy model required for that capability.
- Box selection, new context behavior, a second application gesture detector,
  cross-browser qualification, and WebXR remain outside issues #5 and #6.
- No new follow-up issue is required unless qualification identifies a distinct
  device- or gesture-specific defect outside the approved contract.

## 0.2.0 - 2026-08-06

Status: released as annotated tag
[`v0.2.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.0) from
[PR #15](https://github.com/ManuelSe/MolWeave/pull/15)

### Highlights

- Added an always-visible viewer toolbar with synchronized Atom, Residue,
  Chain, and Structure picking controls on desktop and a compact labelled
  picker on narrow layouts.
- Added Fit all visible, Focus selection, and aggregate Focus visible ligands
  camera actions without opening the advanced inspector or display drawer.

### Added

- Generic typed viewer operations for fitting rendered content and focusing
  canonical `(structure_id, atom_id)` references.
- Context-aware, keyboard-reachable unavailable states with accurate focus and
  hover explanations.
- Real-WebGL desktop and Pixel 7 coverage for synchronized picking, camera
  snapshots, durable-state invariance, accessibility, and responsive bounds.

### Changed

- Focus selection and camera reset moved from the expandable display drawer to
  one stable quick-action surface. Camera reset is now named Fit all visible to
  describe its rendered-scene behavior.
- Persistent success/error notices pass pointer input through to underlying
  application controls except for their own dismiss button.

### Verification

- All 51 frontend unit/component tests pass, including focus-target,
  viewer-adapter, toolbar, structure-loading, and selection-invariance cases.
- The focused viewer-controls matrix passes 5 applicable real-WebGL workflows
  with 5 intentional cross-layout skips; release-hardening passes 5 applicable
  accessibility/responsive/performance workflows with 1 intentional skip.
- Focused archive round-trip coverage passes for both 0.1.0 and 0.1.1 producer
  provenance while retaining exhaustive project, molecular, scene, selection,
  artifact, and original-byte assertions.
- The complete release gate passes: frozen Python and JavaScript installs,
  Alembic `0007 (head)`, Ruff, strict mypy across 46 source files, 181 Python
  tests, ESLint, TypeScript, 51 Vitest tests, 7 supervisor tests, the production
  build, and 33 applicable desktop/mobile Playwright workflows. Playwright
  intentionally skips 23 cross-layout cases and completed in 7.9 minutes.
- The production build retains the known non-blocking lazy Mol* chunk warning:
  Mol* is 965.86 KiB gzip and the initial application chunk is 151.14 KiB gzip.

### Compatibility and migrations

- This is a backward-compatible minor release from 0.1.1 to 0.2.0.
- `/api/v1`, Alembic head `0007`, `ProjectStateV1`,
  `ProjectManifestV1.schema_version`, and `NormalizedStructureV1` are unchanged.
- There is no database, project, molecular, selection, scene, browser-storage,
  or archive migration. Valid 0.1.0 and 0.1.1 archives remain importable;
  0.2.0 archives retain manifest schema version 1.
- Picking mode, toolbar state, and ordinary camera navigation remain transient
  and are not written to projects, commands, checkpoints, scenes, or archives.

### Scientific and accessibility limitations

- Focus visible ligands frames all currently rendered atoms already classified
  as ligand by normalized application state. It does not infer, reclassify,
  rank, or designate a ligand of interest; ambiguous and unknown components are
  excluded.
- Individual atoms in the WebGL canvas are not exposed as screen-reader
  objects. Named controls, pressed/selected state, unavailable reasons,
  selection summaries, and inspector/sequence alternatives remain available.

### Deferred and follow-up work

- Per-ligand choice and broader component identity/reclassification remain with
  issues #2 and #11; this release deliberately aggregates all visible
  classified ligands.
- Durable picking mode, global picking shortcuts, active-ligand guessing, and
  changes to viewer click/drag/orbit semantics remain outside issue #3.

## 0.1.1 - 2026-08-05

Status: released as annotated tag
[`v0.1.1`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.1.1) from
[PR #13](https://github.com/ManuelSe/MolWeave/pull/13)

### Highlights

- Mol* now initializes its opaque Canvas3D background from the persisted
  MolWeave light or dark workspace theme.
- Theme consistency is protected across lazy startup, structure loading,
  topology replacement, responsive viewer remounts, and same-profile project
  restoration in another page.

### Fixed

- Fixed restored dark mode displaying Mol*'s light default because the former
  initialization callback ran before Canvas3D existed.
- Buffered theme changes that occur during lazy viewer startup are reapplied to
  the mounted renderer without rebuilding molecular structures.

### Verification

- Focused frontend tests, lint, type-checking, and production build pass.
- A dedicated desktop Chromium workflow verifies real WebGL corner-pixel
  luminance and state invariants for every approved lifecycle boundary.
- Archive round-trip and safety suites verify required semantic-version
  provenance, unchanged schema rejection, and 0.1.0 import compatibility.
- The complete release gate passed: frozen dependency installation, Alembic
  `0007 (head)`, Ruff, strict mypy, 180 Python tests, ESLint, TypeScript, 45
  Vitest tests, 7 supervisor tests, the production build, and 30 applicable
  desktop/mobile Playwright workflows. Playwright intentionally skipped 20
  cross-layout cases and completed in 7.6 minutes.
- The production build retains the existing lazy Mol* chunk warning; Mol* is
  about 965.86 KiB gzip and the initial application chunk is 150.15 KiB gzip.

### Compatibility and migrations

- This is a backward-compatible patch from 0.1.0 to 0.1.1.
- `/api/v1`, Alembic head `0007`, `ProjectStateV1`,
  `ProjectManifestV1.schema_version`, and `NormalizedStructureV1` are unchanged.
- There is no database, project, molecular, selection, scene, browser-storage,
  or archive migration.
- Valid 0.1.0 archives remain importable. Archive application version is
  validated producer provenance; schema version governs structural
  compatibility.

### Known limitations

- Real viewer lifecycle regression coverage is intentionally desktop Chromium
  with pinned SwiftShader WebGL; the approved fix adds no cross-browser theme
  matrix.
- Existing molecular, scientific, performance, and demonstration-plugin
  limitations documented for v0.1 remain unchanged.

### Deferred and follow-up work

- System-derived, custom, per-project, per-scene, or per-structure viewer themes
  remain outside issue #8.
- New routing/open-in-new-tab controls and unrelated camera, viewer-style, and
  grouping requests remain outside this patch.
- No follow-up issue is required for the approved scope unless release review
  identifies a distinct defect.
