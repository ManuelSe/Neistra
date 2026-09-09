# Neistra rebranding verification

Status: M1–M5 implemented and verified; no implementation gate remains.
This is local implementation evidence, not a release announcement.

Baseline: `2b22cc4` (v0.5.0 documentation closeout). Work is isolated on
`feat/neistra-rebranding`; `.rebranding/` is never staged or committed.
Original brand source files, molecular uploads and protected backend paths remain
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
- M3, `8cd7de1`: frontend gate passed with 70 tests. The new browser test files
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
- M4, `25bb2cc`: private JavaScript names, current documentation, supervisor diagnostics,
  padded repository identity and real light/dark 1STP screenshots delivered.
  Frozen JS install required no lock/dependency changes. All 8 supervisor tests,
  frontend lint/type-check/70 tests/build, 15 focused browser tests (one existing
  skip, 31.1 seconds) and 27 local Markdown/image targets passed. Repeated icon
  generation is byte-identical after metadata stripping; decoded pixels match
  M3. Product requirements and historical decision/release bodies were compared
  directly; supervisor changes are exactly display-string substitutions.
  See [residual-name audit](REBRANDING_NAME_AUDIT.md). The external cutover
  checklist is prepared locally, not executed or committed.

## M3 visual and interaction review matrix

Every row below is exercised in light and dark themes, in desktop Chromium and
the configured Pixel 7 emulation, unless explicitly marked desktop-only.
`tests/e2e/rebranding-surfaces.spec.ts` captures named PNG evidence and runs
scoped WCAG A/AA axe checks after finite entrance animations settle. It also
checks page overflow and inspector tab label fit. Screenshots document visual
review; they do not replace molecular assertions in the existing workflow tests.

Review captures use fixed local molecular fixtures, repeatable UI actions,
settled animations and explicit viewport/theme settings. Real project IDs,
timestamps and job logs remain visible; these are repeatable state captures,
not pixel-identical golden-image comparisons that conceal live provenance.

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
The final M5 gate used the separate fresh disposable store documented below.

| Initial application JS gzip | Size |
| --- | ---: |
| Captured baseline | 154.82 kB |
| M1 | 155.01 kB |
| M2 | 156.03 kB |
| M3 and final M5 candidate | 156.20 kB |

Mol* remains lazy-loaded; its current compressed chunk is 966.82 kB. The
existing large-lazy-chunk build advisory remains. No remote font, molecule
palette change, viewer upgrade, dependency-version bump or schema migration
was introduced. Final performance and compiled-delivery qualification passed in M5.

## Qualification complete

M3 is qualified, including full-diff review of its presentation/accessibility
changes and unchanged API, original-file and archive behavior.
M4 is qualified; repository/documentation rewording, private JavaScript names
and the unexecuted external checklist are complete. M5 passed the complete
frozen-install, Python, frontend, supervisor and browser gate, compiled delivery
smoke and full-diff audit, and records the final implementation handoff below.
External rename/publication and all version bumps remain excluded from this
frontend-only implementation.

## M5 fresh qualification

Candidate: `25bb2cc`, following passing checkpoints `43d95f4`, `ce94127`,
and `8cd7de1`. Fresh root: `/tmp/neistra-qualification-Tkxv1q/`; API, worker
and development web ports are 8020, 8021 and 5174. Compiled preview uses 4174.
These services were started for this qualification and checked healthy; no
normal user data directory is used.

Completed:

- Frozen Python and JavaScript installs; existing migrations `0001`–`0009`.
- Ruff; mypy across 50 source files; all 209 Python tests in 31.08 seconds.
  Only 15 known Alembic configuration deprecation warnings were reported.
- ESLint, TypeScript, 70 Vitest tests, all 8 supervisor tests and production
  build. New browser test sources also pass their standalone type-check.
- Four compiled-delivery checks: desktop 1440×900 and Pixel 7, each light/dark.
  The entry bundle was held before execution to verify restored first paint;
  every shipped brand asset was fetched and byte-compared. A real 1STP import
  then verified lazy Mol* loading, exact opaque RGBA and no remote branding/
  font, source-module, old-logo requests or page errors. Local replay script:
  `/tmp/neistra-qualification-Tkxv1q/verify-production.mjs`; captures use
  `production-<layout>-<theme>-<state>.png` in the same directory.
- Full baseline-to-candidate review covered presentation source, shared theme,
  storage restoration, viewer lifecycle, accessibility additions, CSS,
  tests, assets and documentation. Protected paths and all five version values
  are unchanged. Source artwork hashes still match all 11 originals.

The final 102-case browser matrix passed in `browser-1/`, `browser-2/`
and `browser-3/`: 32 + 16 + 18 passed, 4 + 16 + 16 explained skips,
in 6.2 + 5.7 + 2.4 minutes. All three result manifests report `passed` with
no failed test IDs. Total: 66 passed and 36 skipped, comprising 34 pre-existing
layout skips and two explicit desktop-only zoom/breakpoint checks skipped in
the mobile project. No test file was omitted and no scientific assertion was
weakened. Fresh captures cover the complete both-theme desktop/mobile matrix;
real 100%/200% native zoom and breakpoint qualification passed again.

All eight M5 acceptance criteria are satisfied by these fresh gates, the
compiled asset/network checks, scope audit and handoff. No consequential
review finding remains. Final documentation changes do not alter the tested
application candidate. All 32 local documentation/image targets resolve and the
residual-name inventory was refreshed after the final documentation edits.

Final production sizes: initial JS 156,196 gzip bytes; lazy Mol* 966,816 gzip
bytes; CSS 25,683 gzip bytes. Initial JS growth is about 1.4 kB (0.9%) from the
captured baseline. All 11 shipped brand derivatives total 13,577 uncompressed
bytes versus the old 499-byte single SVG. The added variants/icons are small
standalone assets; original brand sheets and repository screenshots do not ship.

## Scope and rollback handoff

| Disposition | Delivered boundary |
| --- | --- |
| Implemented | Neistra identity/metadata, canonical assets, welcome/loading/empty states, shared light/dark CSS/WebGL theme, dense workflows, accessible focus/scroll regions and vendor labels, archive compatibility help, frontend errors, private JS naming, repository presentation, real screenshots, tests and local cutover materials. |
| Simplified as approved | System sans-serif/serif/monospace categories instead of unsupplied font masters; compact toolbar icon treatment instead of squeezing standalone clear space into the header. No blocking splash or logo animation. |
| Deferred/excluded | Backend identity/code, all version bumps, repository/remotes/domains/checkout rename, PR/merge/tag/release/publication and social-preview upload. A local preview image and actionable checklist are prepared, not externally applied. |
| Rejected | Recoloring molecules for branding, changing archive suffix/MIME/provenance or preference keys, replacing arbitrary server/user text, rewriting historical evidence, and representing guide account/marketplace/docking mockups as working features. |

Compatibility impact: a backward-compatible presentation rebrand, with no API,
schema, archive, project or preference migration. Existing technical identifiers
remain deliberately visible. All authoritative versions stay at `0.5.0` until
a separately authorized coordinated release decision resolves the no-backend
boundary. No new release number is proposed or claimed here.
Custom external web-package filters must use `@neistra/web`; root scripts run
from the repository root without a filter. Documented workspace commands remain
unchanged, and the new web filter was resolved during qualification.

Rollback: redeploy the frontend built from baseline `2b22cc4`, or review and
revert the presentation commits in reverse order. Preserve server data,
uploaded originals, archives and browser preferences. No migration, reset,
deletion or other destructive cleanup is required. External cutover would
need its own separately verified reversal if it is performed later.

Limitations: scoped shell accessibility checks are not a whole-product
certification or screen-reader access to individual WebGL atoms. Pixel 7 is
Chromium emulation, not a physical-device certification; Safari/Firefox were
not qualified. The known large lazy-chunk advisory, blocked optional Scarf
install script and scientific limitations remain. Review was local and is not
claimed as an independent or remote PR review. Evidence directories are local
artifacts and should be retained/copied before temporary-directory cleanup.
