# Neistra residual-name audit

M4 source audit after the visible/frontend package rename. Matching is case-
insensitive; each row disposes of **all** old-name matches on the listed lines.
This inventory is evidence, not a request to replace technical names.

- **C — compatibility:** executable identifiers, storage/archive formats,
  server provenance and explicit compatibility explanations. Preserve.
- **H — history:** accepted past plans/decisions/releases, original provenance,
  old GitHub URLs and explicit former-name transition statements. Preserve.
- **D — user/scientific test data:** legacy project names, diagnostic fixtures,
  Windows/path fixtures and negative-control assertions. Preserve verbatim.
- **Unintended branding:** none found in the audited current frontend/prose.

Protected backend, Python metadata/locks/migrations and scientific fixtures/tests
are outside the rename scope: 304 matching lines remain unchanged.
Their path diff against `2b22cc4` is empty. This audit document itself is
excluded from the matching inventory because it describes the retained names.

| File | Disposition | Matching source lines |
| --- | --- | --- |
| `.gitignore` | C | 2, 3 |
| `README.md` | H | 10 |
| `README.md` | C | 27, 51, 72, 76, 77, 78, 82, 83, 143, 145 |
| `apps/web/src/components/ArchiveFormatHelp.tsx` | C | 5, 6 |
| `apps/web/src/components/ArchiveImportDialog.tsx` | C | 95 |
| `apps/web/src/test/export-dialog.test.tsx` | C | 225, 227, 279, 280, 284, 305, 326 |
| `apps/web/src/test/jobs.test.tsx` | C | 14, 15, 40, 50, 82, 90 |
| `apps/web/src/theme.ts` | C | 3 |
| `apps/web/src/viewer/MolstarEngine.ts` | C | 502 |
| `docs/ACCESSIBILITY.md` | H | 3 |
| `docs/API.md` | C | 3, 102, 133 |
| `docs/ARCHITECTURE.md` | C | 67, 177 |
| `docs/BRANDING.md` | H | 3 |
| `docs/BRANDING.md` | C | 39, 40, 41 |
| `docs/DECISIONS.md` | H | 3, 42, 70, 231, 270, 302, 404, 595, 704, 998, 1009, 1018, 1031, 1119, 1123, 1138, 1484, 1563, 1584, 1709, 1771, 1775, 1781 |
| `docs/DECISIONS.md` | C | 37, 369, 629, 966, 1228, 1229, 1232, 1790, 1817 |
| `docs/DEVELOPMENT.md` | C | 24, 29, 51, 55, 56, 57, 61, 62, 87, 89, 99, 112, 113, 114, 115, 128, 132, 133, 138, 145, 146, 147 |
| `docs/FIXTURES.md` | H | 3, 32, 50, 57, 80 |
| `docs/NORMALIZED_SCHEMA.md` | C | 58 |
| `docs/PERFORMANCE.md` | H | 3 |
| `docs/PLAN.md` | H | 1, 10, 17, 81, 120, 128, 275, 336, 625 |
| `docs/PLAN.md` | C | 60, 62, 467, 729 |
| `docs/PLUGIN_GUIDE.md` | C | 13, 14, 20, 21, 30, 35, 39, 131, 132, 219, 237 |
| `docs/PROGRESS.md` | H | 82, 90, 93, 183, 186, 252, 305, 308, 387, 392, 395, 461, 464, 518, 554, 556, 641, 1144, 1412, 1496, 1622, 1881 |
| `docs/PROGRESS.md` | C | 1156, 1163, 1390, 1636, 1640, 1643, 1658, 1857, 1879 |
| `docs/PROJECT_SCHEMA.md` | C | 325, 348 |
| `docs/REBRANDING_VERIFICATION.md` | C | 64 |
| `docs/REBRANDING_VERIFICATION.md` | D | 68 |
| `docs/RELEASE_NOTES.md` | H | 5, 28, 29, 30, 67, 146, 147, 148, 266, 272, 273, 274, 372, 373, 456, 457, 534, 535, 540 |
| `docs/RELEASE_NOTES.md` | C | 15, 16 |
| `docs/SCIENTIFIC_LIMITATIONS.md` | H | 3 |
| `docs/VERIFICATION.md` | H | 6, 88, 177, 249, 302, 345, 349, 356, 385, 389, 395, 414, 416 |
| `docs/VERIFICATION.md` | C | 46 |
| `docs/plans/issue-1-polar-hydrogen-visibility.md` | H | 3, 7, 27, 47, 106, 133, 187, 578, 723, 774, 940 |
| `docs/plans/issue-1-polar-hydrogen-visibility.md` | C | 150, 152, 308, 309, 310, 312, 339, 340, 559, 560, 593, 594, 621, 623, 823, 824 |
| `docs/plans/issue-2-structure-hierarchy.md` | H | 3, 7, 24, 621, 965 |
| `docs/plans/issue-2-structure-hierarchy.md` | C | 367, 373, 374, 376, 377, 405, 406, 600, 634, 635, 645, 677, 679 |
| `docs/plans/issue-3-viewer-toolbar-focus.md` | H | 3, 7, 18, 20, 27, 138, 163, 464, 785, 786, 787 |
| `docs/plans/issue-3-viewer-toolbar-focus.md` | C | 477, 478, 503, 505, 676, 677 |
| `docs/plans/issue-5-viewer-click-selection.md` | H | 3, 7, 8, 29, 257, 738, 747, 748 |
| `docs/plans/issue-5-viewer-click-selection.md` | C | 457, 458, 483, 485, 620, 621 |
| `docs/plans/issue-7-selection-representation-styling.md` | H | 3, 7, 27, 147, 196, 243, 367, 779, 891, 981, 1237, 1400, 1415, 1419, 1441 |
| `docs/plans/issue-7-selection-representation-styling.md` | C | 158, 159, 473, 474, 475, 476, 477, 503, 504, 760, 761, 793, 794, 821, 823, 1035, 1036, 1179, 1180, 1185, 1339, 1340, 1371, 1374 |
| `docs/plans/issue-8-viewer-theme-persistence.md` | H | 3, 7, 17, 19, 26, 32, 62, 120, 341, 693, 694, 699 |
| `docs/plans/issue-8-viewer-theme-persistence.md` | C | 75, 345, 375, 411, 412, 420, 452, 454 |
| `playwright.config.ts` | C | 13, 20, 26, 27, 28, 57, 63 |
| `scripts/dev.mjs` | C | 39, 40, 43, 44, 51, 96, 107 |
| `scripts/dev.test.mjs` | D | 42, 53, 79 |
| `scripts/dev.test.mjs` | C | 44, 45, 46, 57, 58, 70, 73, 74 |
| `tests/e2e/export-archive.spec.ts` | D | 254 |
| `tests/e2e/export-archive.spec.ts` | C | 279, 338, 348, 406 |
| `tests/e2e/polar-hydrogen-visibility.spec.ts` | C | 568 |
| `tests/e2e/rebranding-surfaces.spec.ts` | C | 143, 150 |
| `tests/e2e/rebranding-surfaces.spec.ts` | D | 151, 248, 256 |
| `tests/e2e/rebranding.spec.ts` | C | 6, 26, 37, 57 |
| `tests/e2e/release-hardening.spec.ts` | D | 172, 197, 223 |
| `tests/e2e/release-journey.spec.ts` | D | 154, 161 |

The root/web package names are `neistra` / `@neistra/web`; no former package
name remains in their manifests or pnpm lock metadata. The API client only
changes its own three network-error messages. No arbitrary server response,
user name, download filename, MIME value or archive byte is rewritten.

Historical external links are intentionally retained, not remotely reverified
by this task. Current local Markdown/image links were checked for existing
targets. External rename/link cutover remains separately authorized work.
