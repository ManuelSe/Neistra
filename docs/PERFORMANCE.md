# Performance Qualification

Status: Neistra regression budgets, established for MolWeave v0.1.

Performance thresholds are regression gates on the pinned Playwright desktop
Chromium host. They are not hardware-independent throughput promises or
recommended maximum scientific system sizes.

## Representative Project

The profile uses official RCSB PDB `1STP`, a 1,001-atom streptavidin-biotin
complex with protein, ligand, and water components. Its immutable checksum and
scientific expectations are documented in `FIXTURES.md` and asserted before the
browser profile.

`tests/e2e/release-hardening.spec.ts` requires:

| Measure | Budget |
|---|---:|
| Upload, normalization, API commit, projection fetch, and nonblank viewer readiness | `< 30 s` |
| Entry selection, zoom in/out, reset, and representation change after load | `< 5 s` total |
| Longest observed main-thread task during those minor interactions | `< 750 ms` |
| Repeated normalized-structure GETs during those minor interactions | `0` |

Each run attaches `performance-profile.json` with observed timings, longest
task, fixture, atom count, and request count. A canvas pixel assertion guards
against treating an empty WebGL surface as ready.

Run the profile with:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-hardening.spec.ts --project=chromium
```

## Architectural Controls

- Only visible entries request normalized projections; structure query data is
  cached by project, entry, and artifact ID.
- Opening a hidden or visible entry hierarchy reuses that same artifact-keyed
  query. Repeated category/component actions do not refetch or serialize the
  normalized document; the dedicated browser workflow requires one total
  structure request before reload.
- Opening selection styling explicitly loads only selected entries whose
  artifact-keyed normalized data is missing. Repeated style applications reuse
  that query; the qualified workflow requires one structure request before
  reload and one after reload, with no per-style refetch.
- Component derivation performs linear identity/membership passes followed by
  deterministic bounded sorting. Category unions are built from individual
  memberships rather than duplicated full category atom arrays.
- Entry and category disclosures start collapsed. Water/solvent instance lists
  are absent from the DOM until explicitly expanded.
- Camera, selection, metadata, and representation interactions send compact
  state/command payloads, not complete normalized molecular JSON.
- One multi-entry style application sends one canonical selection command and
  increments the project revision once. The renderer performs one deterministic
  linear membership projection per affected loaded entry and rebuilds its
  disposable exact Mol* bundle components while restoring camera and selection.
- Hydrogen-mode changes update only viewer settings and rebuild each affected
  disposable Mol* entry projection while restoring camera and canonical
  selection. Repeated changes reuse the artifact-keyed normalized-structure
  query; the qualified protein/ligand workflow observes one structure request
  before reload rather than a request per toggle.
- Spatial selection runs in a browser worker.
- Mol* is a lazy production chunk and loads only when structures are present.
- Coordinate commands return affected atom spans; topology commands replace
  disposable viewer projections from authoritative artifacts.
- At 250,000 atoms, surfaces degrade to lines and dense atom/residue labels are
  suppressed with a visible reduced-detail notice. Imports above 1,000,000
  atoms are rejected by default.
- Import and export execute in cancellable child processes; jobs execute in a
  separate worker and spawned plugin child.

## Interpretation

The `1STP` gate detects startup, serialization, query invalidation, WebGL, and
main-thread regressions in an ordinary protein-ligand project. It does not
bound surface generation on very large structures, GPU memory, spatial-query
complexity, chemistry cleanup, force-field convergence, plugin runtime, or
network-mounted storage. Those operations expose loading/progress,
cancellation where applicable, limits, or documented degradation instead.
Selection-styling qualification proves query reuse and nonblank output for the
1,001-atom representative project and the compact hierarchy fixture. It does
not establish an incremental-rendering advantage or a new large-system
latency/GPU-memory budget; the existing 250,000-atom reduced-detail behavior
continues to apply while retaining exact selection assignments.
Polar-only hydrogen qualification detects request-cache and rebuild regressions
on compact explicit-connectivity fixtures. It establishes neither incremental
rendering nor a new latency, GPU-memory, or large-system budget. Neistra does
not silently fall back to atom-name or coordinate heuristics when projected
connectivity is absent; the existing reduced-detail threshold and WebGL limits
still apply.

## Historical v0.7.0 bounded selection surfaces (issue #30)

This extends the historical baseline above for the fixed `molecular-v1` fragment
profile. One browser worker runs per viewer, with preallocation admission at
20,000 effective atoms and four million padded grid cells. Extraction checks a
conservative mesh allocation bound before marching cubes (64 MiB per surface);
retained selection meshes are limited to 128 MiB per viewer. Calculation has a
30-second deadline. Failed or oversize targets retain membership and show labelled
lines. The inherited 250,000-atom parent-entry degradation still applies.

C4 production 1STP measurement, without competing builds/tests:

| Measure | Desktop Chromium | Pixel 7 emulation |
|---|---:|---:|
| Production surface ready (budget <10 s) | 727.2 ms | 490.1 ms |
| Longest observed surface main-thread task (budget <750 ms) | 385 ms | 129 ms |
| Worker cancellation qualification (budget <500 ms) | 21.7 ms | 20.7 ms |
| Summed browser-descendant RSS baseline → peak | 800,176 → 982,204 KiB | 768,936 → 876,160 KiB |

Both produce 91,194 vertices / 71,012 triangles, 567 atom-owner groups, a 3,405,576-byte
mesh and a 133,020,368-byte conservative working-allocation estimate. RSS samples
include browser processes and potentially duplicated shared pages; they are not
worker heap or GPU measurements. These bounds do not promise a browser/GPU memory
ceiling or latency across arbitrary hardware. The recorded measurements and
allocation evidence are [desktop](assets/selection-surfaces/c4-chromium.json) and
[mobile emulation](assets/selection-surfaces/c4-mobile-chromium.json).

Production tests verify geometry reuse across color changes, cancellation/retry,
coordinate-preview invalidation, per-entry failure isolation and disposal of every
worker. The actual palette Add/reset/selection-clear workflow issues zero additional
normalized-structure GETs before reload. C4 and final release commands/results are
recorded in the [feature plan](plans/issue-30-selection-surfaces.md).


## Qualified capacity — issue #38 C1

The current molecular-v1 resource policy is 100,000 effective atoms, 64 million
padded grid cells, 512 MiB mesh allocation, 1 GiB retained mesh output per viewer,
2 GiB accounted active calculation buffers and 120 seconds, with one worker.
The 250,000-atom parent reduced-detail policy is unchanged. Mesh-byte evidence now
includes the returned stable atom-ID mapping as well as vertices/normals/groups/
indices. Staged bounds include native lookup, extraction/grouping chunk rounding,
compaction and transfer copies (D-067); no resolution or science changes.

Host: Linux 6.17.0-119029-tuxedo, Ryzen 7 8845HS (8 cores/16 threads), 60 GiB RAM;
Playwright 1.55.0 / Chromium 140.0.7339.16, SwiftShader WebGL, desktop and Pixel 7
emulation. No competing test/build jobs were run. These are host qualifications,
not physical-phone guarantees. RSS sums browser descendants with possible shared-
page double counting and includes test inspection; it is separate from allocation
bounds and is not a JavaScript heap or GPU limit.

Complete imported entries, all components/H enabled; fixed native profile and
source coordinates unchanged. Synthetic-100k is the single artificial component
specified in FIXTURES, not a protein or chemical preparation. All cases assert
checksums, exact atom membership and coordinate mapping, rendered pixels, readiness
<120 s, longest surface task <750 ms, bounded output and disposal of every worker.

| Fixture / browser | Atoms | Ready ms | Longest task ms | Retained output bytes | Accounted working bytes | RSS baseline → peak KiB |
|---|---:|---:|---:|---:|---:|---:|
| 6vxx / chromium | 23,694 | 4332.6 | 187 | 85,392,860 | 606,979,788 | 650,752 → 1,352,056 |
| 6vxx / mobile-chromium | 23,694 | 3956.3 | 181 | 85,392,860 | 606,979,788 | 661,588 → 1,359,996 |
| 1aon / chromium | 58,870 | 9538.5 | 437 | 219,986,372 | 1,326,940,068 | 670,724 → 2,422,480 |
| 1aon / mobile-chromium | 58,870 | 8845.9 | 428 | 219,986,372 | 1,326,940,068 | 667,472 → 2,405,116 |
| synthetic-100k / chromium | 100,000 | 8459.2 | 168 | 49,639,320 | 381,667,584 | 716,008 → 3,361,424 |
| synthetic-100k / mobile-chromium | 100,000 | 8115.4 | 194 | 49,639,320 | 381,667,584 | 712,324 → 3,354,008 |

Raw measurements, grid dimensions and checksums: [capacity evidence](assets/selection-capacity/).
The unchanged 1STP <10-second readiness and <500 ms cancellation gates also pass
on both configurations; their raw files are in the same directory. Additional
production regressions cover camera, coordinate preview/commit/cancel, reuse,
per-entry failure, H filtering, exact fragments and palette persistence.

The initial mobile picking test checked before the native render-loop event;
it now waits for delivery after each real canvas click, preserving the canonical
atom assertion. The corrected focused rerun passes all eight cases; full command
and prior unchanged-workflow evidence are recorded in the feature plan. Initial
synthetic projection with 100,000 separate components timed out; this qualification
does not claim capacity for that unrelated component-count stress case.


## Full-protein pocket qualification — issue #36 C1

Same Linux/Chromium/SwiftShader and Pixel 7 emulation host as #38. Each pocket uses
the first protein atom as a captured seed, radius 5 Å, all classified protein
context and supplied protein H, even with atomic detail/H display hidden. It
computes the complete native surface before retaining centroid-near triangles.
No competing builds/tests ran during qualification.

| Fixture / browser | Protein context atoms | Ready ms | Longest task ms | Full → compact output bytes | Accounted working bytes | RSS baseline → peak KiB |
|---|---:|---:|---:|---:|---:|---:|
| 1aon / chromium | 58,674 | 13164.2 | 398 | 220,336,136 → 296,364 | 1,577,129,988 | 649,956 → 2,406,632 |
| 1aon / mobile-chromium | 58,674 | 13064.4 | 289 | 220,336,136 → 296,364 | 1,577,129,988 | 654,280 → 2,411,864 |
| 1stp / chromium | 901 | 936.4 | 396 | 3,452,740 → 65,268 | 27,904,624 | 563,276 → 917,296 |
| 1stp / mobile-chromium | 901 | 623.0 | 207 | 3,452,740 → 65,268 | 27,904,624 | 556,988 → 841,100 |
| supplied-h / chromium | 4 | 424.6 | 300 | 30,252 → 24,776 | 2,522,564 | 651,080 → 898,856 |
| supplied-h / mobile-chromium | 4 | 235.0 | 130 | 30,252 → 24,776 | 2,522,564 | 669,912 → 828,264 |

All required readiness (<10 s for 1STP, <120 s larger cases), main-thread (<750 ms),
working/retained bounds and one-worker limits pass. Native Pocket cancellation on
small fixtures takes 2.5–3.9 ms, below 500 ms, without cancelling the Fragment
channel; retry restores the pocket. Tests compare every triangle against a separate
full-context reference, preserve native normals/ownership, and exercise color
reuse, hiding, isolation, empty results, coexistence and real pixel-targeted picks.
Only compact geometry and the receptor identity mapping are retained; isolation
index allocation is reserved within the combined 1 GiB retained budget.

RSS includes the independent reference calculation and subsequent display
lifecycle, and can count shared pages repeatedly. It is distinct from accounted
calculation buffers, not a browser/GPU heap bound or physical-phone guarantee.
Raw evidence and actual native captures: [pocket assets](assets/pocket-surfaces/).
The complete fragment/capacity regression command passes 21 browser cases with
one intentional layout skip; exact commands and review are in the feature plan.

### Pocket saved-workflow qualification (C3)

The C3 native rerun again qualifies the complete 58,674-atom 1AON protein context,
including supplied protein H where present, before cropping. Desktop/mobile
readiness is 13.631/13.026 s; the full 220,336,136-byte mesh becomes a
296,364-byte patch. 1STP readiness is 922.8/593.0 ms (901 protein atoms);
its full 3,452,740-byte mesh becomes 65,268 bytes. The supplied-H fixture preserves
all four protein atoms and produces a 24,776-byte patch.

Largest observed steady surface task: 400 ms; tested native cancellation:
2.3–3.4 ms. Both channels retain one worker and respect combined allocation bounds.
Peak summed descendant RSS is 2,451,060 KiB including independent reference
calculation and display lifecycle; shared pages may be counted repeatedly. This is
not a measured worker heap ceiling or a physical-phone guarantee. Full evidence:
[qualification JSON](assets/pocket-surfaces/c3-native-qualification.json).

Application tests additionally check hidden-seed input loading without visibility
changes, style-only projection reuse, exact camera/selection during dependent
coordinate preview/cancel/commit, and prevention of duplicate invalidation for an
already-applied commit. A final UI-only receptor-default correction is independently
rechecked by component/workflow/real-zoom tests; it does not change this native
geometry or resource evidence.
