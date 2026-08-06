# MolWeave Release Notes

## 0.2.1 - 2026-08-06

Status: release candidate; planned annotated tag `v0.2.1`

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
