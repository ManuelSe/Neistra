# Accessibility Qualification

Status: Neistra shell contract; originally released in MolWeave v0.2.0.

Neistra targets WCAG 2.2 Level AA for the local application shell. The
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

`tests/e2e/viewer-controls.spec.ts` additionally qualifies the always-visible
viewer quick toolbar. Desktop uses four named pressed buttons for Atom,
Residue, Chain, and Structure picking; compact layout uses one labelled native
select. Fit all visible, Focus selection, and Focus visible ligands are named
buttons in both layouts. An unavailable focus action remains in the tab order,
uses `aria-disabled`, suppresses activation, and exposes its reason on focus or
hover. The compact exception keeps these toolbar help messages visible even
though unrelated narrow-layout tooltips remain suppressed.

`tests/e2e/structure-hierarchy.spec.ts` qualifies the component hierarchy in
desktop and Pixel 7 layouts. Entry and category disclosures use native
`details`/`summary` semantics; category and individual component selection use
named buttons with `aria-pressed` including mixed state. Counts, source versus
fallback versus ambiguous assignment, and warnings are semantic DOM text rather
than WebGL-only cues. Instance lists are mounted only after category expansion.
Keyboard Enter opens disclosures and selects a component; the compact drawer
remains within viewport bounds, has no horizontal overflow, restores focus on
Escape, and passes the configured axe rules while expanded.

`tests/e2e/selection-styling.spec.ts` qualifies the selection-style workflow.
The always-present **Style selection** button stays focusable when unavailable,
uses `aria-disabled`, and exposes a reason without pretending the action ran.
The non-modal palette has a programmatic name, a selected atom count, semantic
Atom detail and Polymer groups, pressed/mixed states and accessible help for
unavailable polymer styles. Entry counts are in Selection help. Color swatches
have accessible color names; native disclosures expose secondary actions and
scientific explanations. A single feedback area announces action results.
Outside workspace interaction stays available, including changing the selection.
Desktop and
Pixel 7 workflows prove keyboard launch/application, Escape focus restoration,
viewport containment, no horizontal overflow or clipped visible buttons, and
zero scoped axe findings. Canvas pixels and screenshots qualify WebGL output
separately; they are not treated as semantic accessibility evidence.

`tests/e2e/polar-hydrogen-visibility.spec.ts` qualifies the two explicit
hydrogen controls at desktop and Pixel 7 sizes. Both are native, named pressed
buttons. Turning off **Show hydrogens** keeps **Show non-polar hydrogens** in
the tab order with a disabled state and adjacent explanatory relationship; its
stored preference is preserved and restored when the master control is enabled.
Keyboard workflows, viewport containment, horizontal overflow, and the scoped
WCAG 2/2.1/2.2 axe rules pass in both layouts. Real WebGL pixel signatures
qualify molecular output separately and are not semantic accessibility evidence.

Run it with:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-hardening.spec.ts \
  tests/e2e/selection-styling.spec.ts
```

## Keyboard Model

- `Tab` and `Shift+Tab` traverse commands, fields, resizers, and composite
  controls in DOM order.
- `Enter` or `Space` activates focused buttons and selection rows.
- `Enter` or `Space` toggles focused hierarchy disclosures; component buttons
  then use the same replace/add/subtract selection semantics as other surfaces.
- Arrow Left/Right, Home, and End move and activate tabs in a tab list.
- Escape closes the topmost dialog or mobile drawer and returns focus.
- The Style selection launcher opens its dialog with `Enter` or `Space`;
  representation, swatch and reset buttons use native button activation. Escape
  while focus is inside the palette closes it and restores the launcher; Escape
  elsewhere belongs to that workspace control. Touch controls are at least 44 px
  high, and compact screens scroll inside the palette.
- Show hydrogens and Show non-polar hydrogens use native button activation.
  The dependent control remains discoverable but cannot be activated while
  the master setting hides all hydrogens; explanatory text communicates why.
- Mol* camera orbit/pan remains pointer-driven; named zoom, fit-visible,
  selection-focus, and ligand-focus buttons provide keyboard-operable camera
  commands.

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
properties. Neistra does not claim screen-reader access to individual 3D
atoms through the canvas; the synchronized inspector, query, sequence, project,
and property surfaces are the semantic alternatives. Automated selection-style
checks cover configured axe rules, focus, keyboard operation, and geometry at
the tested desktop/Pixel 7 sizes; they do not replace the release-level manual
zoom, contrast, readability, or hardware/browser inspection above.
Automated hydrogen-control coverage likewise does not claim screen-reader
interpretation of individual visible hydrogen atoms or cross-browser and
hardware-GPU rendering equivalence.
