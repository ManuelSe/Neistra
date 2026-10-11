# C2 focus ownership — 2026-10-11

Native camera mouse-down now prevents the browser's focus default while retaining
Mol* propagation. Pointer-down compatibility events remain intact. An idle mouse
return from body/noneditable movement controls restores canvas focus; editable,
slider, unrelated and modal focus is preserved. Existing navigation flags, fresh
gestures, preview, scientific math and public viewer interface are unchanged.

Passing commands:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright MOLWEAVE_E2E_API_PORT=8210 \
  MOLWEAVE_E2E_WORKER_PORT=8211 MOLWEAVE_E2E_WEB_PORT=5373 \
  MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-compact-c2-fixed-data \
  corepack pnpm exec playwright test tests/e2e/viewer-transform-toolbar.spec.ts \
  tests/e2e/group-membership.spec.ts tests/e2e/rebranding-zoom.spec.ts \
  --output=/tmp/neistra-compact-c2-fixed-browser
git diff --check
```

173 frontend tests / 39 files, lint/types/build pass. Final focused browser gate:
34 pass / four intentional layout-specific skips, zero failures or retries, 6.3 min.
Four preceding natural-focus/native cases pass in 1.1 min across both layouts.
Repeated Space orbit, return from mode/steps/More/Resume, latest-plane translation,
unchanged exact coordinates/selection/project and no molecular requests pass.
Native slider/button Space, unrelated/modal focus, blur/remount, held input,
true touch, both themes/scoped axe and real 100/200% zoom remain qualified.
The natural-focus regressions omit artificial canvas focus; separate keyboard
ownership tests retain deliberate native control/canvas focus setup.

A broader diagnostic gate passed 42 / three skips but failed old group-menu focus
at real zoom. Separate idle/no-movement repetition reproduced failure on cycle 4:
focus reached the old grouped row before query notification remounted it. This
was not a passing qualification. The narrow supporting repair waits for the
accepted project revision to render before resolving focus. It preserves later
unrelated interaction, discards stale/project-switched requests and retains fast
menu-teardown recovery. Three unit workflows and 12 native membership cycles per
layout pass; existing late success/conflict, scientific/surface invariance, batch
history and drag tests pass. D-084 records this necessary gate correction.

C2 full diff reviewed for timing dependencies, scientific/data changes, accidental
scope, dead code and regressions. No schema/API/history/math migration. Pinned
Chromium/SwiftShader/Pixel 7 emulation is not physical-device certification. Existing
lazy Mol* bundle advisory remains. Full release gate/review/publication pending.
