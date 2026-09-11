# Issue #34 — Compact selection styling

Status: approved by the user; implementation authorized. Approved 2026-09-11.
Issue: https://github.com/ManuelSe/Neistra/issues/34
Base: `master` at `25187d9`; branch: `fix/issue-34-compact-selection-styling`.

## Problem, outcome, and authority

The v0.6.0 styling dialog devotes too much space to instructions and secondary
actions, and blocks changing the selection. Deliver an original compact non-modal
palette with illustrated, briefly labeled buttons and immediate color swatches.
These three interaction choices were explicitly selected by the user.
User guidance, AGENTS.md, accepted decisions, product boundaries and the approved
plan govern implementation. Preserve D-051–D-054 and existing molecular ownership.

## Accepted scope and dispositions

| Requirement | Disposition | Outcome |
| --- | --- | --- |
| Quick, compact styling | Essential | Primary representation/color actions visible without scrolling at 1366×768 |
| Stay-open palette | Essential | Picking and camera gestures remain available; viewport-constrained, about 340 px wide; bottom-positioned on narrow screens |
| Original illustrated short-label buttons | Essential | Five atomic and two polymer styles; independent channels, current/mixed/unavailable indicators |
| Immediate color swatches | Essential | Blue/cyan/green/yellow/orange/red/purple/gray; one activation applies current All atoms / Carbon only mode |
| Custom color | Supporting | Custom… disclosure with explicit Apply; mode alone does not mutate |
| Reset actions | Essential | Existing representation and independent color reset semantics |
| Hydrogen controls | Supporting | Compact three-choice row with explicit-H eligibility and visibility-limit explanations |
| Distance expansion | Supporting | Initially collapsed; same distance/granularity/cancellation semantics |
| Help and feedback | Supporting | Accessible help disclosures; one concise status area; actionable errors stay visible |
| Keyboard/touch/responsive/light/dark | Essential | Focus management, accessible names, ≥44 px touch targets, 200% zoom without horizontal overflow |
| Persistence/history/scientific semantics | Already satisfied; preserve | Existing commands, schemas, API, archives, scenes and scientific constraints |
| Presets, hover previews, new inference/rendering algorithms | Deferred | Unnecessary for correcting this workflow; no speculative follow-up issue |
| Selection-specific surfaces | Deferred | Existing follow-up #30 owns geometry and persistence |
| Copied layout/icons/terminology | Rejected | Original Neistra design required |

Open from the existing toolbar button. Close through close button, toolbar toggle,
or Escape while focus is inside; outside interaction does not close it. Show one
heading with atom count; place entry count and general instructions in help.
Use a dedicated non-modal dialog without changing unrelated dialogs. Empty
selection keeps the palette open with disabled actions; project changes close it.

Changing coloring mode alone has no molecular effect. Carbon mode retains the
brief visible explanation “Other selected atoms use element colors.” Keep mode
and custom color while open, reset them on reopening; add no persisted preferences.
Capture action targets at activation, serialize pending mutations, retain workspace
viewing/selection, and prevent stale eligibility/feedback from describing a newer
selection. Preserve expansion context cancellation. No API/schema/migration changes.

## Checkpoints and acceptance

1. **Palette shell** — responsive non-modal container, existing controls, picking,
   rotation, focus and selection-context handling. Affected: frontend presentation
   and workflow state. Tests: component and selection-styling/viewer-picking browser
   tests. Commit `refactor(selection): introduce non-modal styling palette`.
2. **Compact controls** — illustrated styles, mixed states, immediate swatches,
   custom color, compact hydrogen and collapsed expansion. One activation per
   representation or swatch after opening. Tests: action/reset/error/disabled/mixed
   component tests and actual rendered representation/element-color browser checks.
   Commit `feat(selection): streamline styling controls`.
3. **Hardening/documentation** — responsive, keyboard, touch, light/dark and actual
   200% zoom; before/after screenshots at matching viewports; user documentation and
   exact evidence. Tests: relevant appearance/styling/expansion/accessibility/zoom
   and existing performance budgets. Commit
   `test(selection): verify compact styling workflows`.
4. **Release** — complete passing gate, reviewed final candidate, versions and release
   notes. Commit `chore(release): prepare v0.6.1`.

Each checkpoint runs frontend lint, typecheck, component tests, build and focused
Playwright. Review the diff before each passing commit; update this log and concise
project PROGRESS. Append material cross-project decisions to DECISIONS. No empty
commits. Rollback is an ordinary revert and subsequent patch release, retaining
v0.6.0-compatible appearance data. No migration upgrade/downgrade is introduced.

Focused commands (from repository root):

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-styling.spec.ts tests/e2e/viewer-click-selection.spec.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-appearance.spec.ts tests/e2e/rebranding-zoom.spec.ts tests/e2e/release-hardening.spec.ts
git diff --check
```

Regression acceptance: change selection during open/pending/eligibility states;
carbon-only selected heteroatoms use element colors, outside atoms unchanged;
undo/redo/reload/scenes/archive semantics survive; hydrogen bounds, hidden expansion
and cancellation remain; no unsolicited camera movement, repeated structure loads,
or weakened performance budgets. Scrolling is allowed on small/zoomed viewports.

## Release and remote workflow

Patch **0.6.1** corrects existing functionality's usability without new scientific
capabilities, APIs or compatibility changes; no prerelease is planned. Recheck tags
and releases before preparing versions. Update pyproject.toml, root package in
uv.lock, apps/web/package.json, FastAPI version and archive APPLICATION_VERSION.

Safely incorporate origin/master before PR. PR title:
`fix(selection): make representation styling compact and immediate`; `Closes #34`.
Describe outcomes, checkpoints, simplifications, deferred #30, compatibility,
scientific limitations, exact checks and release impact. Request automated review
if available; otherwise accurately document local review. Address consequential
findings and all required approvals/checks without bypassing protection.

Run complete README/DEVELOPMENT release gate: frozen uv/pnpm installations,
isolated Alembic upgrade, Ruff, mypy, all Python tests, frontend lint/typecheck/tests,
supervisor tests, production build, all Playwright tests and diff whitespace check.
Record isolated ports/data root when overriding defaults; never reset user data.
Use a normal merge commit preserving checkpoints. Verify remote master and rerun
the complete release gate on the exact merged commit before annotated tag v0.6.1.
Publish and remotely verify the tag and GitHub release, then post issue close-out
with PR/release links and verification/compatibility/deferred-scope information.
Delete only this local/remote feature branch after all remote results are verified.

Block merge/release for failed gates, unresolved consequential findings, missing
required approvals, stale-selection targeting, accessibility regressions, unplanned
compatibility changes or version collision. Release notes cover improvements,
fixes, persisted-data/migrations, compatibility, verification, limitations and #30.

## Progress and evidence

- Planning checkpoint: clean master fast-forward verified; issue #34 created;
  dedicated branch created. This approved plan is the first branch change.
- Implementation and validation: pending.

### Checkpoint 1 — complete

Dedicated non-modal Radix shell retains external workspace interaction, closes on
project change, supports toolbar toggle and handles empty selection. Regression
coverage verifies outside Escape, pending-action disabling and stale representation
feedback. Browser qualification exposed disabled-button focus loss; focusing the
palette before disabling the activated control fixes Escape and focus restoration.
The unchanged baseline workflow passed and its 1366×768 screenshot was captured.

Passing: frontend lint, typecheck, 81 tests / 24 files and production build;
`selection-styling.spec.ts viewer-click-selection.spec.ts` reports 5 passed and 5
intentional layout skips. Isolated ports 8110/8111/5273, data root
`/tmp/neistra-34-c1-fixed`; logs `/tmp/neistra-34-c1-{unit,build}.log` and
`/tmp/neistra-34-c1-fixed-e2e.log`. Diff reviewed for scope, ownership, compatibility
and dead code; no domain/API/migration changes. Existing Mol* chunk-size advisory
remains. Next: compact controls and consolidated action feedback.

### Checkpoint 2 — complete

Seven original SVG glyphs, short-label style buttons with mixed membership,
independent resets, eight immediate swatches and all/carbon segmented mode are
implemented. Custom color, distance expansion and detailed help use native
keyboard/touch disclosures. Explicit hydrogen controls retain loading, mixed and
master-bound explanations. One context-bound feedback area handles appearance
commands; pending commands serialize all palette mutations. Older-selection errors
remain visible and explicitly attributed; older successes are suppressed. Closing
unmounts drafts. Eligibility cannot use a previous selection's loaded result.

The viewport-constrained portal avoids the viewer's size-container clipping while
remaining below application dialogs. The initial 1366×768 palette fits without
scrolling; original baseline screenshot showed color entirely below the fold.
No API, molecular, persisted state, dependencies or migrations changed.

Passing: lint, typecheck, 83 frontend tests, production build; appearance and styling
Playwright suites: 8 passed / 4 intentional skips, light/dark and desktop/Pixel 7,
including real carbon/heteroatom pixel checks, hidden-entry expansion, camera/data
invariance, local H and scoped axe. Ports 8110/8111/5273, root `/tmp/neistra-34-c2`,
logs `/tmp/neistra-34-c2-{unit,build,e2e}.log`. Diff reviewed; next: additional
live-selection/pending tests, zoom/performance gate and published visual evidence.

### Checkpoint 3 — complete

Added actual canvas picking and orbit while open, held-request target capture and
selection change, empty-target disabling and toolbar toggle browser regressions.
Component coverage verifies stale eligibility rejection, project-switch closure and
the optional loader fallback. Touch dimensions are asserted for both axes; a more
specific polymer CSS rule initially defeated the 44 px minimum and was corrected.
Visual review added a sticky close/count header and panel-resize anchoring.
User workflow, accessibility and verification docs now link persisted before/after
1366×768 captures and a Pixel 7 dark capture in `docs/assets/selection-styling/`.

Final frontend lint/typecheck, 84 tests / 24 files and production build pass.
Appearance/styling/zoom/release-hardening suites pass 15 applicable workflows with
7 intentional layout skips at ports 8110/8111/5273, root `/tmp/neistra-34-c3-final`.
Real 100%/200% zoom, light/dark scoped axe, 44×44 px touch targets, scientific/data
invariance, camera orbit and unchanged 5-second/750-ms performance budgets pass.
An earlier performance run measured 7054 ms while frontend validation ran
concurrently; the complete hardening rerun without that competing work passed.
Budgets and retries were not relaxed. After full-diff review repaired the optional
loader fallback, frontend checks and both integrated light browser layouts passed
again (`/tmp/neistra-34-c3-reviewed`, 2 tests). Exact logs are
`/tmp/neistra-34-c3-{unit,build}.log`, `/tmp/neistra-34-c3-final-e2e.log` and
`/tmp/neistra-34-c3-reviewed-e2e.log`.

Local full-diff review was performed by the implementing agent, not independently.
Reviewed ownership, scientific semantics, stale targets, focus/accessibility,
responsive clipping, dead code and compatibility. No consequential findings remain
at this checkpoint. No API/schema/migration changes or extra dependencies. Next:
version/release preparation and complete candidate gate.

### Checkpoint 4 — release preparation

Fetched origin/master before preparation; base unchanged and feature history retained.
Remote latest is v0.6.0 and v0.6.1 is unallocated. Updated all five authoritative
version sources to 0.6.1 and the archive-version assertion; added explicit 0.5.0
and 0.6.0 archive compatibility cases. Ruff and all 12 archive-roundtrip tests pass.
Release notes, upgrade/compatibility guidance and user documentation are prepared.
No new migration or protocol change. Complete candidate gate is the next gate;
no merge, tag or release is claimed by this preparation entry.

### Complete-gate integration repair

The first complete candidate gate passed frozen installs, isolated migration, Ruff,
mypy, 239 Python tests, 84 frontend tests, 8 supervisor tests and production build.
Its full browser pass reported 70 passed / 39 intentional skips / 3 failures.
Two hydrogen precedence tests still matched the old expanded master-warning copy;
update them to assert the exact compact warning inside the palette. The mobile
viewer-toolbar test raced the inspector's existing requestAnimationFrame focus
restoration; its trace left Inspector focused. Wait explicitly for that established
restoration before testing the next toolbar tooltip. No application behavior or
scientific assertions were weakened. The same run's performance profile passed:
3962 ms interactions, 552 ms maximum task, zero repeated structure GETs.

Focused repaired cases pass (3 passed / 3 intentional skips):
`playwright test tests/e2e/polar-hydrogen-visibility.spec.ts tests/e2e/viewer-controls.spec.ts --grep 'selection-local|keeps compact picking'`.
Ports 8110/8111/5273, data `/tmp/neistra-34-gate-repair`; log
`/tmp/neistra-34-gate-repair.log`. Full original evidence:
`/tmp/neistra-34-candidate-gate.log` and `candidate-report.json` in `/tmp` (report
filename prefix `neistra-34-`). A fresh complete gate follows this passing repair.
