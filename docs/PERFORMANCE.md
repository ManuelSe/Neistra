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

## Bounded selection surfaces (issue #30)

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
