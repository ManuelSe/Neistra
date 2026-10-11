# C1 compact transformation controls — 2026-10-11

Wide fine-pointer primary controls are icon-only 32px actions; mobile widths or
any coarse pointer retain 44px targets. Help/More are bounded nonmodal panels.
Scientific limits, complete counts and gestures remain reachable; uncertain
outcomes and errors remain visible text. Focused panel Escape closes it before
canceling movement. No scientific/API/data changes.

Passing commands:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright MOLWEAVE_E2E_API_PORT=8210 \
  MOLWEAVE_E2E_WORKER_PORT=8211 MOLWEAVE_E2E_WEB_PORT=5373 \
  MOLWEAVE_E2E_DATA_DIR=/tmp/neistra-compact-c1-qualified-data \
  corepack pnpm exec playwright test tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/viewer-transform-toolbar.spec.ts tests/e2e/rebranding-zoom.spec.ts \
  -g 'qualifies keyboard/touch|keeps actions and dialogs|qualifies native touch' \
  --output=/tmp/neistra-compact-c1-qualified-browser
git diff --check
```

170 frontend tests / 38 files; lint/types/build pass. Four focused browser cases
pass with two intentional device-specific skips, zero retries. True CDP touch,
light/dark Help and More, all primary hit targets while secondary content scrolls,
320px touch widths and actual 100%/200% Chrome zoom pass with zero scoped axe
findings. Retained screenshots were visually inspected. Earlier comprehensive
three-file run passed 38 scientific/history/lifecycle/error cases with three skips,
and exposed three UI diagnostics; it is not a complete passing qualification.

Corrected diagnostics: explicit aria-modal=false distinguishes nonmodal panels;
size assertions distinguish compact desktop icons from secondary actions; CDP
session detach can change pointer classification, so mobile targets stay44px;
generic dialog CSS had overridden workspace placement, now scoped more strongly
and checked by primary-action hit tests at real zoom. No failing assertion was
removed to hide these regressions. Existing lazy Mol* bundle advisory remains.
C2 natural-focus/Space repair remains pending; no physical-device certification.
