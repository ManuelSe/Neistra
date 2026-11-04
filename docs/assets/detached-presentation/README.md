# Issue #97 verification evidence

## C1 — Native capture feasibility

Source: planned branch after planning commit3631543. No application version,
dependency, backend or migration change. This is checkpoint evidence, not a
complete release gate or independent review.

Commands and outcomes:

- `corepack pnpm --dir apps/web test` —376passes,63files, retained in
  `c1-unit-final.log.gz`. The earlier plan-spelled `test -- presentation` also ran the
  whole suite; do not describe it as a filtered invocation.
- Frontend `lint`, `typecheck`, `build` —pass in `c1-lint-corrected.log.gz`,
  `c1-types.log.gz`, `c1-build.log.gz`. Existing build-size warning is retained.
- `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/detached-presentation.spec.ts tests/e2e/viewer-native-ui.spec.ts --project=chromium --reporter=list`
  —4passes, zero failures/retries. Isolated overrides:
  `NEISTRA_E2E_API_PORT=8210`, `NEISTRA_E2E_WORKER_PORT=8211`,
  `NEISTRA_E2E_WEB_PORT=5373`, `NEISTRA_E2E_DATA_DIR=/tmp/neistra97-c1d-e2e`.
  Exact output: `c1-native-final.log.gz`.

Actual molecular video pixels, changing navigation frames, native annotation raster
agreement above95% of content pixels within30channel units (capture color conversion
tolerance), coordinate-preview/cancel output, fullscreen, one-window reuse, main
camera/project/original invariants and no child API/renderer are observed. Existing
native UI/annotation/rebuild/remount/project workflows pass. Screenshots were visually
inspected: molecular label/measurement rendering is retained, including pre-existing
label overlap; no label-layout correction is claimed.

Diagnostics remain separate: initial lint findings were corrected; the first
annotation probe read before the asynchronously remounted viewer existed; a second
probe incorrectly compared capture with an element screenshot containing application
controls composited above the canvas. The final probe reads the actual canvas in a
requested native draw frame and retains the original strict raster tolerance.
Diagnostic logs/traces are not passing qualification. No production/scientific
assertion, fixture, timeout or dependency was relaxed.

Local checkpoint review: typed capture lives behind the viewer boundary, popup
entry avoids workspace/API/renderer imports, and molecular authority remains
unchanged. Source-health/connection/closure hardening is explicitly C2; pointer,
full visual/accessibility/resource coverage is C3. Complete final-version readers,
candidate/exact-master gates, physical second-monitor check and release remain.
