# Accessibility Qualification

Status: Neistra shell contract; originally released in MolWeave v0.2.0.

Neistra targets WCAG 2.2 Level AA for the local application shell. The
qualification combines deterministic browser automation with keyboard and
visual checks; an axe pass alone is not treated as complete coverage.

## Selection gestures (issue #90)

Issue #91 mouse hover is a supplementary transient entity preview. It retains the
renderer’s distinct hover and selection colors without changing keyboard focus
or issuing live-region announcements. Existing keyboard-operable picking and
component/sequence/inspector selection remain available, and touch interaction
does not depend on hover. Native marker/screenshot tests distinguish hover from
persistent selection; shell axe, keyboard and actual browser zoom remain separate
release gates. No new screen-reader or physical-device certification is claimed.

Native double-click is an additional Atom-mode shortcut. Existing explicit picking
modes, inspector expansion, and keyboard-operable component/sequence buttons remain
available. Panel Ctrl/Cmd uses the same complete-operand rule; panels do not silently
establish viewer range anchors. Gesture help explains protein-residue or individual-component expansion
and fixed residue starts. No new layout, focus model or gesture-only essential
action is introduced.

Qualification retains both themes, desktop/Pixel7 layouts, keyboard focus and
actual100%/200% browser zoom through existing navigation/toolbar/release-hardening
suites, plus native selection synchronization and remount tests. Screenshots and
automated axe assertions have distinct evidential roles. No interactive screen-
reader, physical touch double-tap or broader browser certification is claimed.
[Clean candidate](assets/selection-gestures/c4-candidate-gate.json) passes all
both-theme axe/keyboard/actual200%zoom and native layout cases. Light/mobile and
dark/desktop gesture screenshots were manually inspected separately.
[Exact released master](assets/selection-gestures/c4-merged-gate.json) repeats
these passing cases; no broader certification is inferred.

## Protein residue navigation (issue #94)

Components expands existing chain-instance rows into observed residue buttons.
Native list/listitem/button semantics remain; no incomplete ARIA tree is added.
Up/Down/Home/End traverse expanded rows; Right expands or enters children and Left
collapses or focuses the parent. Focus movement/disclosure never selects. Only
the active row's controls join the tab order; bounded retention preserves focused
and Details rows. Removed descendants fall back to their surviving parent/category
or pane heading without stealing unrelated focus.

Residues expose full, partial and unselected membership with pressed/mixed state;
partial coverage also has a dashed border. Accessible names include chain-instance
and entry context, with insertion codes and explicit internal-ID fallback. Fine
pointer rows remain32px and coarse/narrow targets44px. Sequence uses the same
coverage semantics. Native input, scoped axe, both themes, narrow/remount and real
browser zoom evidence are recorded in the approved plan; automated axe and manual
screenshot inspection remain distinct. No interactive screen-reader, physical
hardware or broader browser certification is claimed.

## Compact molecular editor (issue #69)

The nonmodal Edit launcher sits beside Transform with a named, viewport-bounded
panel. Native buttons expose symbols/fragment structures plus accessible names;
section buttons use pressed state rather than an incomplete ARIA tab pattern.
All20 mutation names are available for one complete eligible residue, with a
clear reason for partial/mixed/unsupported selection and no inferred default.
Current-type/no-op actions remain unavailable. Scientific limits and full
operation warnings are reachable through native keyboard-accessible disclosures.

Keyboard opening focuses a stable dialog container. An operation focuses that
container before pending controls disable, preserving focus through topology
replacement. Escape while the panel owns focus returns to its launcher. Outside
canvas/control interactions remain available and retain focus. Project-scoped
section/focus intent survives responsive remounts; project change clears it.
Tool handoffs suppress outgoing Style restoration; movement owns its controls
while active and numeric preview blocks chemistry editing.

Portal placement observes resize/zoom and notification bounds, coalescing updates
without focus timers; persistent notices do not cover the heading/Close action.
The launcher and coarse-pointer controls use44px targets. Dedicated C3 browser
coverage asserts actual native picks/controls, keyboard focus and notice hit
testing, light/dark scoped axe and320px layout. C4 also passes actual100%/200%Chrome zoom in both themes, all enabled panel
controls/disclosures by keyboard, responsive owned-focus restoration and async
read-failure recovery. [Evidence](assets/molecular-editing/c4-verification.json)
retains exact commands and screenshots. Evidence and manual screenshot inspection are
separate; no interactive screen-reader or physical-device certification is claimed.

C5 full-gate review additionally found a mobile vendor-popup overlap with the new
Edit launcher. Measured complete-header clearance, bounded vendor scrolling,
launcher hit testing and unchanged full-shell axe assertions qualify the repair.
A session generation prevents a previous project visit's completion from clearing
or publishing feedback over a newer pending operation. Exact evidence is retained
in the editing plan's C5 repair log; the complete release gate remains mandatory.

## Compact project navigation (issue #59)

Entries have single-line32px fine-pointer/44px coarse-pointer rows with explicit
visibility, lock, action and status controls. Full metadata/warnings are available
through keyboard/touch Details. Hidden rows use muted text without dimming controls
below contrast requirements. Entry menus scroll within the real available viewport,
including200% browser zoom. Details initially focuses its dialog container so its
Close tooltip does not consume the first Escape; dismissal restores the launcher.

The separate component pane uses native list/listitem/button semantics with logical
positions/counts, labelled disclosure/selection/shared-visibility/Details actions,
pressed/mixed selection state and explicit warning descriptions. Up/Down/Home/End
reach unmounted rows through the complete expanded model; focus movement does not
select. Current-row controls join the tab sequence. Focus/Details rows are retained
within a bounded virtual window. Removed rows/loading transitions return owned
focus to the surviving category or pane heading; other workspace focus is preserved.

Desktop split/collapse controls are keyboard accessible; narrow drawers use labelled
tabs with valid panel references. Browsing state survives responsive remounts but
does not become molecular selection or persisted scientific data. See the
[approved contract](plans/issue-59-compact-project-navigation.md) and
[user guide](PROJECT_NAVIGATION.md). Automated keyboard, axe, screenshots and real
zoom evidence are recorded separately from manual inspection. No interactive
screen-reader certification or physical-device/cross-browser claim is made.

## Application notifications (issue #56)

Routine application notices expire after 10 seconds, using the existing `status`
role and Close control. Errors keep their `alert` role and remain visible;
warning-bearing summaries and action-required movement instructions also stay
visible regardless of success styling. Separate molecular warnings, progress,
viewer failures, and retry controls retain their existing displays.

Keyboard focus inside a notice defers expiration until focus leaves. Departure
does not move focus. Manual dismissal restores a connected prior workspace target
or an appropriate toolbar fallback, respecting an open modal's focus ownership.
New emissions receive fresh deadlines; theme changes and viewer remounts do not
restart the timer. Browser throttling may delay removal.

The approved [notification plan](plans/issue-56-viewer-notification-timeout.md)
defines component/fake-timer and desktop/Pixel 7 browser qualification, including
real-time expiration, keyboard entry/departure/dismissal, and scoped axe checks
in both themes. Evidence and known limits are recorded in its checkpoint log.

## Viewer transformation toolbar (issue #46)

The separate viewer bar exposes an icon-only Transform selection action and
explained focusable unavailable states. Primary icons have accessible names and
hover/focus tooltips. Apply, Cancel and Adjust view / Resume transform remain
reachable while the nonmodal More tools panel scrolls independently. The warning/
Help icon opens gesture guidance, captured/hidden counts and complete scientific
limits on touch as well as desktop. Consequential errors remain visible text.
Primary icons are 32 CSS px on wide fine-pointer layouts and at least 44 CSS px
at mobile widths or with any coarse pointer; secondary controls, including
sensitivity, retain at least 44 CSS px targets. Escape closes
a focused movement panel before canceling the transaction. Conflicting selection/style/focus actions expose
explained unavailable states throughout the captured transaction.

Space enables native camera navigation only when the movement canvas has focus
and no modifier/modal owns the key. Native controls retain their Space behavior. Native camera mouse-down retains
canvas focus; an idle mouse return from noneditable movement controls restores
it. Editable/slider controls, unrelated UI and modals keep their focus.
Focus departure clears held Space; blur, hidden documents, modal takeover and
viewer remount clear temporary navigation while retaining preview/latest camera.
Final focus returns to the connected launcher or visible Transform selection
launcher when closing the inspector removed the originating launcher.

Original v0.12.0 toolbar, real-zoom and release-hardening specs passed 18 cases / four intentional
layout skips; final held-release checks pass four cases across both owners and
layouts. Eight screenshots were visually inspected and retained:
[light 100%](assets/viewer-transform-toolbar/c3-light-100-interactive-movement.png),
[dark 200%](assets/viewer-transform-toolbar/c3-dark-200-interactive-movement.png),
[touch camera](assets/viewer-transform-toolbar/c3-toolbar-light-touch-camera.png),
[touch transform](assets/viewer-transform-toolbar/c3-toolbar-dark-touch-transform.png).
True CDP touch, scoped light/dark axe, primary-action hit testing during scrolling,
real Chrome zoom and responsive remounts are qualified. Pinned Chromium/SwiftShader
and emulated Pixel 7 do not certify physical devices, other browsers or individual
canvas atoms for screen readers. Exact commands are in the
[feature plan](plans/issue-46-viewer-transform-toolbar.md).

## Interactive movement (issue #4)

The named Transform launcher and persistent movement region expose captured atom
and hidden counts, unconstrained-editing warnings, pressed Rotate/Translate/Depth
states, a labelled sensitivity slider, directional steps, zoom and Apply/Cancel.
Buttons and the slider are at least 44 CSS px high. Arrow keys on the movement
canvas use the same transaction as the step buttons; fields keep their own keys.
The region scrolls internally at compact sizes and real 200% zoom. Its heading
clears the separate viewer-status badge. The scientific warning remains DOM text.

Movement starts with canvas focus when no modal is open. Open dialogs/drawers own
their focus and Escape; closing them retains the preview. Workspace Escape cancels
movement and restores the connected launcher, or visible Fit all visible action
if closing the mobile inspector removed that launcher. Context-changing actions
keep their focus; late responses cannot focus another project's launcher.

`interactive-selection-transform.spec.ts` qualifies desktop keyboard and Pixel 7
touch, light/dark scoped WCAG 2/2.1/2.2 axe, modal/drawer dismissal, final focus and
explained invalid-target feedback. `rebranding-zoom.spec.ts` uses the actual Chrome
zoom extension at 100%/200%, verifies the zoom factor and CSS viewport, and checks
every control's reachability and the banner/status geometry. Full native-surface
screenshots were inspected in all four theme/zoom combinations; see the
[feature-plan evidence](plans/issue-4-interactive-selection-transform.md).
These checks do not certify physical phones, other browsers or screen-reader
access to individual canvas atoms. Coordinates and WebGL cues are qualified
separately from semantic accessibility.

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

## Selection surfaces (issue #30)

The compact Surface row has named Add/Remove buttons and a live membership count;
mixed membership is text, not color alone. Add/Remove and the scientific-help
summary have at least 44×44 CSS-pixel targets. Rendering status and named
Cancel/Retry buttons remain outside the non-modal palette. Membership changes use
the existing captured-selection mutation and focus/error-feedback behavior.

C4 passed the real browser zoom extension's 100%/200% checks in light/dark,
including keyboard Add/Remove, scientific-help expansion and viewport reachability.
The desktop palette still passes its no-scroll baseline at 1366×768; narrow/zoomed
layouts scroll within the bounded palette. Desktop Chromium and Pixel 7 emulation
are qualified, not physical devices or other browser engines. Exact results and
final gate evidence are in the [feature plan](plans/issue-30-selection-surfaces.md).


## Selection Hide/Show (#38)

The sixth Atom detail tile stays in the existing row. It has a visible Hide/Show
label, decorative eye glyph, and a named button action. Mixed visibility uses the
same dashed border/dash treatment as mixed styling and an explicit accessible
name; it is not conveyed through color alone. Since the action label changes,
it is a normal action button rather than a toggle with a misleading pressed state.
Empty selection and pending work disable the action; focus moves to the palette
before disabling the active control. Existing context-bound success/error feedback,
nonmodal workspace interaction and keyboard closure are retained.

`selection-visibility.spec.ts` checks six tiles in one row, >=44 px targets,
light/dark axe, real changes and persistent selection in desktop/Pixel 7 layouts.
`rebranding-zoom.spec.ts` exercises Hide/Show through keyboard activation at actual
100%/200% browser zoom in both themes. Final executed results and screenshots are
recorded in the issue #38 plan; passing a specific emulation is not physical-device
qualification. Native geometry and picking checks are separate from DOM/axe checks.

### Pocket controls

The compact Surface row uses one labelled **Surface options** trigger. Its
keyboard-operable menu opens a nonmodal Pocket panel or on-demand explanation.
Receptor/radius fields and Apply/Remove/Use selection have explicit labels and
44 px minimum control heights; menu targets are also 44 px. Opening does not lock
the workspace. Closing returns focus to the options trigger; Escape closes the
surface panel without closing the containing selection palette. Apply focuses the
panel before disabling its pending controls. Empty selection does not disable
removal of saved pockets. Scientific detail stays in help, not the primary row.

C3 qualification passes desktop/Pixel 7 light/dark axe checks and all measured
44 px targets, keyboard Apply/focus return, and actual 100%/200% browser zoom.
Final captures: [mobile light](assets/pocket-surfaces/c3-mobile-light-pocket-workflow.png)
and [dark 200% zoom](assets/pocket-surfaces/c3-zoom-dark-200-pocket.png).
The complete milestone and final UI-review retest evidence is in the #36 plan.

## Structure group controls

`tests/e2e/group-membership.spec.ts` exercises named row actions, native group
destination and name controls, captured complete-entry counts, keyboard launch,
Escape and focus restoration on desktop and Pixel 7 emulation. Move dialogs run
scoped axe checks in both themes. Explicit actions are the touch and keyboard
workflow; dragging does not replace them.


## Compact transform correction qualification

The [correction plan](plans/issue-46-compact-transform-controls.md) records C1/C2
gates and natural-focus regressions. The original Space regression explicitly
refocused the canvas and missed real pointer/toolbar focus loss. Current tests
exercise repeated native drags and mouse return from tools without that injection.
C2 passes 34 focused browser cases / four intentional skips and 173 frontend tests.
Real-zoom checks hit-test Apply/Cancel while More scrolls; touch Help and 320 px
actions pass both themes/scoped axe. [Compact screenshots and commands](assets/compact-transform-controls/c1-verification.md)
supplement functional evidence. Qualification remains pinned emulation.

## Molecular interaction controls (issue #49)

The viewer menu-bar network icon opens a bounded nonmodal panel with six concise
type buttons, independent Inter/Intra pressed states, named Help/Close and an
explicit Retry action on failure. Patterns supplement color and permanent labels
are omitted. Secondary Help contains scientific thresholds and coverage warnings;
consequential status/errors remain visible. Coarse-pointer controls are at least
44 CSS px. Escape dismisses only while focus belongs to the panel and restores its
connected launcher; movement/native focus rules remain unchanged.

Chromium/Pixel 7 emulation qualify light/dark scoped axe and 320 px bounds. The
existing real browser zoom extension qualifies 100%/200%, keyboard launch/close,
bounds and focus in both themes. [Screenshots/evidence](assets/molecular-interactions/)
include actual H-bond pixels, not just a nonblank canvas. Visual inspection confirms
H-to-acceptor dashed geometry and bounded readable controls. This does not certify
physical devices, other browsers, whole-product accessibility or screen-reader
access to individual molecular atoms.

## Issue #55 interaction correction

Interactions is the final quick-action toolbar button, after Style selection in
DOM and keyboard order. C3 verifies light/dark scoped axe, keyboard/focus, true
touch,320px and actual100%/200%browser zoom alongside all six patterned markers.
Native pixel evidence and existing movement/measurement/surface workflows pass;
qualification remains pinned Chromium/SwiftShader and Pixel7 emulation.
[Evidence](assets/interaction-corrections/c3-verification.json).

Interaction contrast qualification waits for the panel's fade-in to reach
`opacity: 1` before running axe. This samples the settled user interface while
retaining all WCAG assertions; it does not change production colors or disable
animation. The issue55 plan retains the initial transient sample separately.


## Independent surface management (issue #57)

C4 qualifies keyboard-only Style-to-Surfaces handoff, grouped-row activation,
editor controls and close restoration. The nonmodal manager preserves external
workspace focus and Escape ownership. Closing while focus belongs to the manager
restores a meaningful connected launcher or Style selection. Canvas activation
leaves canvas focus in place. D-093 records two reproduced and repaired focus races.

Scoped light/dark axe checks,120-character names, desktop/mobile/320px layouts,
coarse-pointer44px targets and real Chrome100%/200% zoom pass. Actual native mouse
and touch surface activation does not change molecular selection, camera or project
state. Pending structural rebuilds reject retired pixel hits (D-096). Complete
object highlighting is verified in native marker buffers. These checks qualify the
repository's pinned Chromium/SwiftShader and Pixel 7 emulation, not whole-product
accessibility or physical-device/cross-browser support. See [retained evidence](assets/surface-objects/c4-verification.json).

## Selection minimization (issue #82)

The shared molecular group contains Transform, Edit, and the lightning Minimize
button, with named focus/hover tooltips and ordinary Tab order. All launchers have
32 × 32 px desktop targets and 16 px centered icons, enlarged uniformly to44px for
coarse pointers or widths≤840px. One shared frame replaces individual chrome.
Minimize opens setup without submitting; Ctrl+M executes quick work without opening
the panel or stealing focus. The shortcut is described separately from the setup
action rather than falsely assigned as its aria-keyshortcuts. The nonmodal panel has bounded positioning, scrollable contents,
labelled controls, explicit focus on opening, owned Escape and connected-trigger
focus restoration. Ctrl+M respects typing and modal keyboard ownership. Preview
geometry is nonpickable; reports and prerequisites remain textual. Native
minimization-accessibility.spec.ts checks keyboard/touch, both themes,320px and
actual Chrome100/125/150/200% zoom using the extension zoom API, with scoped axe.
Recorded checkpoint/release evidence distinguishes passing runs from diagnostics.
Qualification is Chromium/SwiftShader and Pixel7 emulation, not physical devices or
whole-product/screen-reader atom accessibility.


The issue #94 [complete candidate](assets/protein-residue-hierarchy/c3-candidate3-gate.json)
passes expanded residue workflows in both themes and desktop/mobile layouts,
320 px controls, parent/child keyboard focus, mixed/full feedback, retained focus
and actual 100%/200% desktop browser zoom. Representative automated accessibility
checks pass in both themes for their tested scopes. Final candidate screenshots
retain disclosure/selection separation, source numbering/insertion labels and
compact 32 px fine / 44 px coarse controls. This is tested-scope evidence, not a
claim that every application state has been audited. The [exact merged-master gate](assets/protein-residue-hierarchy/c4-merged2-gate.json)
confirms these same workflows before verified stable v0.25.0 publication.

## Workspace protein sequences (issue #95)

The docked sequence uses native region/list/button semantics, one active residue
in the tab order, horizontal/Home/End and cross-row Up/Down navigation. Focus
moves without selecting; Enter/Space keeps shared modifier semantics. Mixed
coverage has a dashed border and pressed/mixed state. Entry/chain context remains
in accessible residue names and focus tooltips. Independent collapse/hide and
connected restore controls preserve owned focus without selecting or moving the
camera; transient focus/scroll survive responsive remounts.

C2 passes both themes,320px,44px coarse targets, actual100%/200%browser zoom,
scoped axe and trusted keyboard/remount input. Screenshots are separately
inspected. See the [feature evidence](assets/workspace-sequence-viewer/c2-final2-summary.json).
The [clean final candidate](assets/workspace-sequence-viewer/c3-candidate4-gate.json)
repeats all tested scopes, including the relocated sequence region in the existing
all-surface audit, with no new exclusion or retry. Exact merged-master repetition
remains pending. No interactive screen-reader,
physical-device or broader-browser certification is claimed.
