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

## C2 — Source lifecycle and current-frame ownership

The user explicitly removes separate physical second-monitor checking: qualify
ordinary headed desktop movement/fullscreen and unequal viewports in C3. This
supersedes the equipment requirement in the historical C1 remaining-work note.

Final source passes384frontend tests (10presentation cases), frontend lint/types/
build and4presentation native cases. A preceding9-case native invocation also
passes existing project-lifecycle and native-UI regressions; final review then
strengthens only the presentation frame-epoch guard, revalidated by the4native
presentation cases and complete384frontend suite. Exact final logs are
`c2-final-{web,lint,types,build,native}.log.gz`;9-case preservation evidence is
`c2-native-final.log.gz`. No retries or final failures. Intermediate successful
runs and the corrected unbound-method lint diagnostic are retained separately.

Final native command: the C1 isolated8210/8211/5373 ports and `.playwright` browser
path, with `NEISTRA_E2E_DATA_DIR=/tmp/neistra97-c2d-e2e`, running
`corepack pnpm exec playwright test tests/e2e/detached-presentation.spec.ts --project=chromium --reporter=list`.
The9-case invocation additionally includes `tests/e2e/viewer-native-ui.spec.ts`
and `tests/e2e/project-lifecycle.spec.ts`, using `/tmp/neistra97-c2b-e2e`.

Observed: child reload, responsive source remount, empty/returned project, owner
reload/terminal disconnection, blocked popup recovery, real WEBGL_lose_context
source loss, main project invariance, native pixels and annotation/preview raster.
Unit evidence additionally covers exact sender/origin/session checks, stationary
heartbeat redraw bounds, closure cleanup, muted/hidden/unacknowledged sources,
retired updates/bindings, unsupported capture and stale frame/playback handling.

Local self-review found and corrected same-generation replacement-frame ownership
and kept popup errors independent of scientific renderer status. No backend,
migration, persisted contract, dependency or scientific code change. C3 pointer,
comprehensive live workflows/accessibility/resources and final gates remain.
