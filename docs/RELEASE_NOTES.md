# Neistra Release Notes

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
