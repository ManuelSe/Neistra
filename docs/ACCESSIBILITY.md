# Accessibility Qualification

Status: MolWeave v0.1

MolWeave targets WCAG 2.2 Level AA for the local application shell. The
qualification combines deterministic browser automation with keyboard and
visual checks; an axe pass alone is not treated as complete coverage.

## Automated Scope

`tests/e2e/release-hardening.spec.ts` opens a populated protein/ligand project
with a real Mol* WebGL canvas and runs `@axe-core/playwright` rules tagged
WCAG 2 A/AA, 2.1 A/AA, and 2.2 AA. It runs in desktop Chrome and Pixel 7 layouts
and covers both light and dark themes.

The same spec verifies:

- Project and export dialogs open from the keyboard, move focus inside, close
  with Escape, and restore focus to their opener.
- Mobile project/inspector/history drawers expose dialog semantics, focus their
  active control, close with Escape, and restore their toolbar trigger.
  Focus-triggered tooltips are suppressed at narrow width so the restored
  trigger cannot place transient text over application notices; accessible
  names remain available on the controls themselves.
- Inspector, lower-panel, job-detail, and export tab lists implement roving
  focus with Arrow keys plus Home/End.
- Structure selection is a named pressed button independent from its row action
  buttons; resize handles and panels have stable names/relationships.
- Visible buttons, inputs, and selects remain inside the viewport and the
  document has no horizontal overflow at desktop and Pixel 7 dimensions.

Run it with:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-hardening.spec.ts
```

## Keyboard Model

- `Tab` and `Shift+Tab` traverse commands, fields, resizers, and composite
  controls in DOM order.
- `Enter` or `Space` activates focused buttons and selection rows.
- Arrow Left/Right, Home, and End move and activate tabs in a tab list.
- Escape closes the topmost dialog or mobile drawer and returns focus.
- Mol* camera orbit/pan remains pointer-driven; named zoom, focus, and reset
  buttons provide keyboard-operable camera commands.

## Manual Release Check

At least once per release, open a populated project at 1440x900 and Pixel 7
emulation, in both themes, at browser zoom 100% and 200%. Confirm visible focus,
readable status/error/warning text, distinguishable selected/disabled states,
no clipped labels, and no control or notice that blocks the only path to its
underlying action. Inspect the rendered molecular canvas separately because
canvas content is not exposed as semantic document content; selection counts,
property tables, sequence controls, and named camera actions provide the
accessible application state around it.

## Limits

Automated contrast rules evaluate DOM-rendered text and controls, not molecular
colors inside WebGL. Molecular color schemes communicate structure visually but
are not the sole carrier of selection identity, warnings, measurements, or
properties. MolWeave v0.1 does not claim screen-reader access to individual 3D
atoms through the canvas; the synchronized inspector, query, sequence, project,
and property surfaces are the semantic alternatives.
