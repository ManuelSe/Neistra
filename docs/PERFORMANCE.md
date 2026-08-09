# Performance Qualification

Status: MolWeave v0.1 regression budgets

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
