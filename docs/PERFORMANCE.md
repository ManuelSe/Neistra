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
- Camera, selection, metadata, and representation interactions send compact
  state/command payloads, not complete normalized molecular JSON.
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
