# Neistra rebranding verification

Status: M1–M3 verified. M4 and M5 have
not started. This is local implementation evidence, not a release announcement.

Baseline: `2b22cc4` (v0.5.0 documentation closeout). Work is isolated on
`feat/neistra-rebranding`; `.rebranding/` is never staged or committed.
Source files, original molecular uploads and protected backend paths remain
outside the implementation diff. See [BRANDING](BRANDING.md) and D-048/D-049
for identity, contrast, theme ownership and compatibility decisions.

## Milestone evidence

- M1, `43d95f4`: identity assets, metadata and working project entry points.
  Frontend gate passed with 65 unit/component tests; 7 browser workflows passed
  with one existing layout skip. Source assets and baseline screenshots were
  recorded before changes.
- M2, `ce94127`: shared typed themes, restored first paint, legacy preferences,
  opaque CSS/WebGL agreement and vendor DOM appearance. Frontend gate passed
  with 69 tests; 16 focused browser checks passed with two existing layout
  skips. The live viewer check compares whole project state, camera snapshots,
  isolation/selection, exact canvas RGBA and normalized-request counts.
- M3: frontend gate passed with 70 tests. The new browser test files
  also pass an explicit standalone TypeScript check. Full-surface reviews,
  warning/job-state checks, synthetic ambiguity/locked-state review and real
  browser-zoom qualification passed separately. The refreshed 12-case layout
  matrix passed (10 applicable, two explicit desktop-only skips). An attempted
  complete browser run ended with SIGTERM (143), without a final result; its
  partial execution is not counted as a passing gate. Complete coverage then
  passed in deterministic shards after the vendor-popup review fixes:
  32 + 16 + 18 applicable tests, 4 + 16 + 16 explained skips, in
  6.6 + 5.4 + 2.2 minutes. Total: 66 passed, 36 skipped (34 existing layout
  skips plus two new desktop-only zoom/breakpoint skips). The corrected native zoom
  capture passed independently (one test, 21.2 seconds), with full-frame
  200% viewer/settings, inspector and export images reviewed.

## M3 visual and interaction review matrix

Every row below is exercised in light and dark themes, in desktop Chromium and
the configured Pixel 7 emulation, unless explicitly marked desktop-only.
`tests/e2e/rebranding-surfaces.spec.ts` captures named PNG evidence and runs
scoped WCAG A/AA axe checks after finite entrance animations settle. It also
checks page overflow and inspector tab label fit. Screenshots document visual
review; they do not replace molecular assertions in the existing workflow tests.

| Surface / state | Screenshot prefix or browser evidence | Review outcome |
| --- | --- | --- |
| Header, welcome, loading, empty/populated project | `rebranding.spec.ts`, `welcome-*`, `workspace-*` | M1/M2 identity and theme lifecycle pass. |
| Browser hierarchy, selection, entry menu and rename | `*-hierarchy`, `*-entry-menu`, `*-rename` | Shared panel/menu treatment; original download link retained. |
| Selection, inspect, measurements, transform, ligand, protein, sequence, details | `*-inspector-*` | All eight tabs fit; variable-height tab grid and labelled keyboard-scroll panel. Existing units and warnings remain. |
| Display and selection styling | `*-viewer-controls`, `*-selection-style` | Scientific colors unchanged; readable controls and explicit unavailable polymer styles. |
| Mol* screenshot/settings popups | `*-vendor-screenshot`, `*-vendor-settings` | Nested theme/contrast, accessible row labels, bounded scrolling and unobstructed header/picking actions reviewed in both themes/layouts. Inline scientific color swatches preserved. |
| Properties, history, empty jobs | `*-lower-*` | Reachable tabs; wide tables scroll inside their own labelled region. |
| Project chooser, import/export and archives | `*-project-chooser`, `*-structure-import`, `*-export`, `*-archive-*` | Familiar actions remain; `.molweave.zip` compatibility is explained. |
| Parsing failure and blocked/acknowledged export loss | `*-parse-failure`, `*-blocked-export-loss`, `*-export-ready-with-warnings` | Original diagnostic detail stays visible; consent is required before lossy export. |
| Job parameters, running/completed/failed/cancelled, confirmation, results/logs | `*-job-*` | Real isolated worker exercised; labelled statuses, readable error detail, keyboard-scroll logs and JSON. |
| API failure/retry and recovered workspace | `*-api-failure`, `*-api-recovered` | Client-owned text says Neistra; existing retry and persisted recovery work. |
| Ambiguous classification, locked entry, legacy user/server text | `*-ambiguous-locked-fixture` | Explicitly synthetic warning projection; supplied MolWeave text is preserved, not globally replaced. |
| Desktop 100%/200% browser zoom | `rebranding-zoom.spec.ts`, `*-100-*`, `*-200-*` | Real `chrome.tabs.setZoom`; verified zoom factor, device pixel ratio and CSS viewport width. Controls, all inspector tabs and export remain reachable. |
| 840px / 520px boundaries and 360px narrow width | `rebranding-zoom.spec.ts`, `*-<width>` | Widths 1440, 841, 840, 839, 521, 520, 519, 360 checked. At ≤400px the redundant name button is hidden; logo still opens Projects. |

Manual contact-sheet review found and resolved inherited blue link-buttons and
native input accents, clipped outward tab focus outlines, crowded narrow-panel
summary labels, unthemed vendor forms and missing keyboard targets in read-only
scroll areas. The final complete run refreshes evidence
after these refinements. All scientific operations are still validated by the
existing import, selection, editing, measurement, archive and job suites.

The ambiguity scenario intercepts only one browser's hierarchy response and
labels the diagnostic as a fixture. It does not modify the backend, normalized
atoms/bonds or actual project classification, and it makes no scientific claim
about the test molecule. Real backend classification remains covered by the
unchanged hierarchy workflow and backend tests.

The zoom extension lives only under `tests/e2e/support/zoom-extension`. It is
loaded into a disposable browser profile with no emulated viewport, because a
forced CSS viewport masks actual browser zoom. It is not a product plugin,
service worker, runtime dependency or shipped application asset. Desktop zoom
and exact-width sweeps each have one explicit mobile-project skip; Pixel 7
uses the separate full workflow matrix.

At real 200% zoom, Playwright 1.55's usual screenshot clipping confuses CSS
dimensions with native pixels. Zoom evidence therefore uses unclipped Chromium
surface capture and verifies the PNG dimensions against the native viewport.
The zoom-factor, CSS-width, DPR and control-bound assertions are unchanged.
Earlier cropped zoom images are superseded by `zoom-native-capture/` and the
final M5 execution, not treated as proof of full-frame visual review.

## Local evidence and integrity

Evidence root: `/tmp/neistra-evidence-RvHbBz/`.

- `baseline/`: pre-change screenshots and SHA-256 hashes of all 11 supplied
  PNG/PDF files; all hashes rechecked unchanged during M3.
- `m1/`, `m2-final/`: identity and shared-theme evidence.
- `m3-surfaces/`, `states/`, `ambiguity/`, `zoom-final/`: focused M3 captures.
- `m3-layout-final/`: passing refreshed surface/state/zoom matrix.
- `m3-full-gate/`: interrupted browser execution, not a passing gate.
- `m3-shard-1/`, `m3-shard-2/`, `m3-shard-3/`: complete matrix in three
  passing deterministic batches, with no omitted test files.
- `vendor-review/`, `vendor-qualified-2/` (desktop), `vendor-mobile-final/`:
  nested viewer-popup review and passing refined surface journeys.

These are local execution artifacts, not remotely published evidence. The
backend/API/worker use only the isolated `data/` directory beneath this root.
The final M5 gate must use a new disposable store and verified current servers.

| Initial application JS gzip | Size |
| --- | ---: |
| Captured baseline | 154.82 kB |
| M1 | 155.01 kB |
| M2 | 156.03 kB |
| M3 candidate | 156.20 kB |

Mol* remains lazy-loaded; its current compressed chunk is 966.82 kB. The
existing large-lazy-chunk build advisory remains. No remote font, molecule
palette change, viewer upgrade, dependency-version bump or schema migration
was introduced. Final performance and compiled-delivery qualification are M5.

## Remaining gates

M3 is qualified, including full-diff review of its presentation/accessibility
changes and unchanged API, original-file and archive behavior.
M4 owns repository/documentation rewording, JavaScript package names and the
external cutover checklist. M5 owns the complete frozen-install, Python,
frontend, supervisor and browser gate, compiled delivery smoke, full-diff audit
and final implementation handoff. External rename/publication and all version
bumps remain excluded from this frontend-only implementation.
