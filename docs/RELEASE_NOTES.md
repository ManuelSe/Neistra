# MolWeave Release Notes

## 0.1.1 - 2026-08-05

Status: locally qualified release candidate pending merge and remote release
verification

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
