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

## C3 — Complete feature workflow and focused regression qualification

Final feature command uses the isolated8210/8211/5373 ports and
`NEISTRA_E2E_DATA_DIR=/tmp/neistra97-c3-final2`, locked
`NEISTRA_AMBERTOOLS_PREFIX=/datadisk/dev/.neistra-tools/ambertools-24.8`,
`PLAYWRIGHT_BROWSERS_PATH=.playwright` and
`PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/neistra97-c3-final2-browser.json`:

```bash
corepack pnpm exec playwright test tests/e2e/detached-presentation.spec.ts \
  tests/e2e/detached-presentation-workflows.spec.ts \
  tests/e2e/detached-presentation-resources.spec.ts \
  tests/e2e/detached-presentation-zoom.spec.ts --project=chromium --reporter=list,json
```

All12cases pass without retry. `c3-browser.json.gz`/`c3-browser-summary.json`
retain outcomes and attachments; source raster covers labels/distance/angle/
dihedral. Feature workflows observe appearance, H, surfaces, interaction markers,
selection/isolation, visibility, scenes, placement/cancel/apply, topology edits,
Undo/Redo, explicit translation/numerical previews and real running native
minimization with exact committed restoration on Cancel. Both owning windows are
isolated; native initialization/context-loss and fullscreen-denial feedback pass.

All392frontend tests pass in `c3-commit-web.log.gz` (18presentation unit cases),
with lint/types/build in `c3-final2-{lint,types,build}.log.gz`. Existing82-case
desktop/mobile regression invocation passes69cases with13exactly retained baseline
layout exclusions, zero failures/flakes/retries. `c3-regressions-summary.json` and
`c3-regression-exclusions.json` verify identities against released0.27.0. It uses
the same port/toolchain values, `/tmp/neistra97-c3-regressions`, and these files:
`viewer-transform-toolbar`, `direct-molecular-modeling`, `minimization-live`,
`viewer-controls`, `interactions-lifecycle`, `surface-objects`, `modeling-toolbar`
and `rebranding-zoom` (all `.spec.ts`, both configured projects).

The separate headed command runs `detached-presentation-workflows.spec.ts
--project=chromium --headed --grep 'maps the leader pointer' --reporter=list,json`
with `/tmp/neistra97-c3-headed` and an isolated output directory. One case passes;
`c3-headed-window-bounds.json` records Chromium140.0.7339.16/Linux, movement to80,70
at1100x750 and reported maximized state. Source/child portrait dimensions, focus,
fullscreen and themes are observed. Actual extension-driven zoom1/2 yields child
width800/400, DPR1/2 and reachable44px controls. These satisfy the explicit user
amendment; no separate physical second-monitor check is required or claimed.

The 58,870-atom1AON resource profile observes one renderer and one active capture
per owner; all tracks stop across three cycles, with zero repeated structure reads.
Open-to-frame4688/3046/7778ms and longest task371ms are portable measurements, not
strict reference timing or total GPU-memory qualification. See
`c3-presentation-resource-profile.json`. `c3-production-audit.json` verifies the
4,593-byte presentation entry avoids workspace/API/renderer code, production
excludes harnesses and the shipped notice is byte-identical.

Local self-review is recorded in `c3-review.md`. Initial failed runs remain
diagnostic: asynchronous controlled-checkbox checks needed acknowledged state,
ethane totals8atoms, the toolbar uses Transform selection, and the accessible
scene-only shell needs a hidden heading. An actual initial media-width0 observation
led to hiding video until a current frame paints; logs/reports retain that failure,
but its trace was not copied before the output directory reset. Available other
failure traces are preserved. No assertions/tolerances, production scientific
behavior, fixtures or existing deadlines were relaxed. Final-version compatibility
readers, complete candidate/exact-master gates and delivery remain C4/C5.

## C4 preparation and local review

All five application version sources advance to0.28.0 with no dependency changes.
41archive integration cases pass, retaining older producer assertions and adding
0.27.0. `c4-reader-preflight-gate.json` and its forward/reverse produce/read reports
qualify actual0.27.0 module roots in separate processes with both filename styles.
This nonclean preflight does not substitute for the clean final candidate gate.
`c4-full-diff-review.md` records implementer review and the binding-lease cleanup
finding; focused review logs and the final gate qualify its correction.

`release-recipe.py.txt` generates fresh disposable run directories and explicit
24-step recipes; `release-qualification.py.txt` requires a clean committed starting
state and records lossless logs, command/environment/commit identities and source
hashes before/after. Candidate and exact merged-master runs include migration
upgrade/downgrade/re-upgrade, full Python/frontend/supervisor/native browser gates,
production/license/schema/dependency audits and actual tagged0.27.0 readers both
ways. Portable correctness is explicit; no strict reference timing claim.

`c4-candidate2-gate.json` is a failed/interrupted diagnostic, not qualification.
Its nonbrowser steps pass (1,333Python,392frontend,14supervisor); the browser run
records63passes, one movement setup-race failure, one intentionally interrupted
case, two existing skips and371not run. Raw Playwright skipped totals also include
not-run/interrupted entries; the diagnostic summary preserves that distinction.
`c4-candidate2-movement-diagnostic-*` retains the failing screenshot, trace and
snapshot. `c4-movement-focus*` verifies both desktop/mobile variants after replacing
premature store injection with acknowledged workspace selection. Existing error,
revision and coordinate checks remain; no production/scientific behavior, timeout
or exclusion is changed. Candidate3 must run all24steps from a clean commit.

Candidate3 is also a failed/interrupted diagnostic, not a passing gate. Its final
summary records93browser passes, one lifecycle pixel-sampler failure, one deliberate
interruption, three existing exclusions and340not run. The lifecycle trace/snapshot
are preserved; other candidate3 artifacts were not copied before output reset.
The sampler read videoWidth0 during a legitimate responsive source replacement;
it now atomically waits for a visible current frame before reading pixels, retaining
all frame/color/hash/raster assertions. `c4-frame-focus*` records12passing native
cases with zero failures/retries, including the responsive case. No application,
scientific, timeout or exclusion change. Candidate4 repeats all24steps; its browser
command adds `--max-failures=1` to stop diagnostic failures immediately. A passing
run still executes every applicable case, with whole-log failure monitoring.

Candidate4 is failed qualification:251browser passes/one mobile movement setup
failure/29encountered registered exclusions/157not run. The raw report's global
error records intentional fail-fast termination. Diagnostic screenshot/trace and
monotonic request/click timings prove Apply query preceded completed project data
after reload. UI acknowledgement alone did not establish readiness. The test now
explicitly awaits visible/loaded viewer status before selecting; all original error,
coordinate/revision assertions remain. `c4-project-ready*` records6passes: each
existing desktop/mobile variant repeated three times deliberately after the fix,
with zero automatic retries. Candidate5 reruns the complete gate from a clean commit.
