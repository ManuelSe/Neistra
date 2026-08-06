# MolWeave Release Notes

## 0.2.0 - 2026-08-06

Status: release candidate for issue #3

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
