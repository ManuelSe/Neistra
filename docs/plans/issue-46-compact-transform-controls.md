# Issue #46 correction — Compact transform controls and reliable Space navigation

## Status and metadata

Status: approved by the user's “Implement the plan”; C1/C2 complete, C3 release pending.
Issue: [#46](https://github.com/ManuelSe/Neistra/issues/46), correction to released
v0.12.0 and the [original approved contract](issue-46-viewer-transform-toolbar.md).
Base: `master`, verified up to date at `2782d80956f8c5af356f226678f124f7dbd2ac59`.
Branch: `fix/issue-46-compact-transform-controls`.
PR: `fix(viewer): compact transform controls and restore Space navigation`.
Normal merge preserves checkpoint history. Planned patch: **0.12.1**, annotated
`v0.12.1`, subject to collision/base checks before release preparation.

## Problem and approved outcome

The launcher and active banner consume too much viewer space. Repeated camera
navigation fails when native mouse-down blurs the movement canvas to the body,
or when users return from movement controls without restoring canvas focus.
Deliver icon-only primary controls with accessible names, hover/focus tooltips,
tap-accessible help and secondary tools, and reliable repeated hold-Space camera
navigation without changing molecular previews or native control behavior.

The user explicitly selected **Icons throughout**. Preserve the approved
Adjust view / Resume transform toggle, including touch support.

## Authority, assumptions and requirement dispositions

Explicit correction and approval take precedence, followed by AGENTS.md, accepted
D-083 and other decisions, repository architecture, original approved scope, and
issue suggestions. Historical release evidence is retained; its injected canvas
focus did not test the newly reproduced natural-focus workflows.

| Requirement | Disposition | Treatment |
|---|---|---|
| Icon-only launcher and tooltip | Essential | Existing Move3d icon, accessible name and unavailable explanation. |
| Compact active controls | Essential | Content-sized icon strip: camera, Apply, Cancel, More, warning/help. |
| Gesture and scientific guidance | Supporting | Tap-accessible Help; persistent visible warning icon, screen-reader guidance. |
| Captured counts | Supporting | Small desktop count; complete counts, including hidden atoms, in Help. |
| Actual errors / uncertain outcome | Essential | Keep meaningful visible plaintext and reconciliation action. |
| Secondary movement capabilities | Already satisfied; preserve | More panel retains modes, sensitivity, steps and zoom. |
| Repeated Space navigation / returning from controls | Essential | Repair pointer/focus ownership; retain exact scientific invariants. |
| Native Space in buttons, fields and dialogs | Essential | Scope focus restoration to mouse canvas return and safe movement controls. |
| Touch, themes, accessibility and 200% zoom | Essential | >=44px coarse-pointer actions; bounded nonmodal panels; focused Escape. |
| Alternative Shift/Ctrl shortcut | Rejected as proposed | Space is fixable; existing modifiers already own pan/translation. No follow-up. |
| New math, APIs, schemas, migrations or persistent preferences | Rejected as proposed | Presentation/focus correction needs none. No follow-up. |
| Broader device certification / gesture transfer | Deferred, unchanged | Preserve pinned emulation and fresh gestures; no speculative follow-up. |

No unresolved product decision remains. Do not expand into a general toolbar or
viewer refactor, new dependencies, docking, chemistry repair or new shortcuts.

## Milestones and checkpoints

### C1 — Compact controls

Outcome: icon-only launcher and primary strip; separate bounded nonmodal More
and Help panels. Primary actions stay reachable while secondary content scrolls.
Affected: MovementOverlay/controls, styles, relevant component/browser tests and
user/accessibility documentation. Accessible names remain stable. Escape closes
the focused panel before canceling movement. Ordinary phase/status is announced;
errors and uncertain-commit warnings remain visible. Warning/help remains visible
and exposes all unconstrained-movement limits. Desktop actions compact; touch
minimum 44 CSS px; light/dark and actual 200% browser zoom remain usable.

Acceptance: textless named primary buttons, tooltips, touch-operable Help/More,
full counts and scientific details, preserved secondary capabilities and normal
Apply/Cancel/reconciliation. No data migration. Reverting presentation requires
no state conversion. Expected commit: `fix(viewer): compact transformation controls`.

Validation: web lint, typecheck, all frontend tests, production build; focused
`interactive-selection-transform`, `viewer-transform-toolbar` and actual zoom
browser workflows. Update selectors without weakening scientific assertions.

### C2 — Reliable natural focus and Space navigation

Outcome: repeated native camera drags retain canvas focus; returning the mouse
from noneditable movement controls restores it. Prevent the native mouse-down
focus default without stopping native propagation. Do not suppress compatibility
mouse events through pointer-down preventDefault. Never steal editable, slider,
unrelated UI or modal focus; restore only on actual idle mouse canvas movement.
Affected: StructureViewer focus handling, overlay focus/Escape guards and tests.
Preserve held-Space OR explicit-toggle ownership, interruptions, retained pose,
latest camera and fresh-gesture rules. No API/interface or scientific math change.
Expected commit: `fix(transform): preserve focus for Space camera navigation`.

Acceptance: real Mol* repeated Space drags and return from More/mode/steps/Resume
without test-injected canvas focus; camera changes, coordinates/selection/project
remain exact; translation uses the updated plane. Native Space still activates
controls; fields, sliders, other UI and modals retain focus. Blur/remount and
held-pointer protections remain valid. Rollback needs no migration.

Validation: same frontend gates, focused navigation/lifecycle/component and native
browser tests; scoped axe, touch hit testing, both themes and real browser zoom.
At each checkpoint record exact evidence, review scope/science/dead code/risks,
and commit only coherent passing states. Project summary belongs in PROGRESS.

### C3 — Review and patch delivery

Fetch/incorporate origin/master safely; check latest versions/tags/releases.
Update all five authoritative sources: pyproject.toml, root project uv.lock entry,
web package.json, FastAPI version and archive APPLICATION_VERSION; update the
producer-version test, release/user/migration documentation and evidence.
Commit `chore(release): prepare v0.12.1`. Run the complete release gate in README
and DEVELOPMENT against disposable data, including frozen installs, migration,
Ruff/mypy/Python, frontend lint/types/tests/build, supervisor tests and full E2E.
Qualify compatibility against actual tagged v0.12.0 using the existing reader
helper. Perform/document a full local diff review, explicitly not independent.

Open PR against master referencing/closing #46, explain corrected outcomes,
accepted decisions, scope dispositions, compatibility/science limitations and
exact verification. Request @codex review; address actionable findings and rerun
checks. Merge only with required protections/checks/reviews satisfied, no unresolved
findings, final versions/notes and complete local gate. Never bypass approval.

Verify merge remotely, fast-forward master; repeat the complete exact merged
release gate. Create annotated tag on that qualified master commit, push and
publish GitHub release with highlights, fixes, data/migration/compatibility,
verification, limitations and deferred/rejected requirements. Verify remote tag,
release and evidence asset bytes. Reply anew to #46 linking correction PR/release,
verification and scope; do not rewrite historical release evidence. Close out
current documentation via normal reviewed workflow if needed. Delete feature
branches only after merge, release and issue reply verification; end clean on
up-to-date master. Record exact blockers if any external authorization is absent.

## Implications, decisions and release plan

Application molecular ownership, transaction/pivot/quaternion math, originals,
all-conformer transforms, atomic history, submitted jobs, archives and APIs are
unchanged. Head remains 0013; all contract majors remain 1. No durable navigation
or panel preference. No geometry repair, minimization or docking validation.
Warning icon plus reachable Help surface scientific limits; consequential errors
remain text. Public DOM input/focus APIs and existing Radix primitives suffice.
Pointer focus repair must not enqueue/refetch molecular or surface data. Preserve
existing bounded rendering and native performance budgets.

D-084 records the material correction without replacing D-083. Patch increment
is justified by fixing released usability/focus defects without new public
capability or persistence/API incompatibility; neither minor/major nor prerelease
is warranted. Release sections: Highlights; Fixes; Data/migrations; Compatibility;
Verification; Scientific/device limitations; Scope and follow-up. No new follow-up
issue is planned. Merge/release blockers: failing gates or regression, schema/math
scope expansion, clipped/unreachable controls, altered scientific data while
navigating, unresolved review/product decision, version collision, authentication
or unsatisfied repository protection.

## Progress and completion log

- 2026-10-11: approval recorded; clean master fast-forward confirmed; correction
  branch created. Prior read-only native investigation reproduced body/summary/
  button focus failures. Existing test passed only with explicit focus injection.
  Plan persisted as the first branch change; implementation pending.

- C1 complete: icon-only strip, bounded nonmodal Help/More, retained errors and
  secondary tools. Lint/types/build, 170 frontend tests and four targeted browser
  cases/two intentional skips pass. Exact commands, corrected diagnostics and
  visually inspected touch/zoom screenshots are in
  [C1 evidence](../assets/compact-transform-controls/c1-verification.md).
  Full C1 diff reviewed for scope, data/science invariants, focus, dead CSS and
  accessibility. No migration or blocker; C2 remains required.

- C2 verification deviation: four natural-focus/native cases pass in both layouts;
  broader three-file qualification passes42 with three skips but real zoom finds
  an existing idle group-menu focus race. An isolated no-movement diagnosis fails
  after four membership cycles. Supporting repair (D-084 implementation note):
  typed transient group-action focus waits for accepted rendered revision, preserves
  unrelated/project focus, and retains menu-teardown recovery. App/groups and
  focused unit/native regression tests join affected areas. No new product scope,
  API, data or scientific algorithm; no speculative follow-up. Final C2 gates
  remain required before committing.

- C2 complete: native canvas focus retained; deliberate mouse return restores
  keyboard ownership from movement tools, preserving editable/unrelated/modal
  focus. Narrow group-focus gate repair waits for accepted rendered revision.
  Lint/types/build,173 frontend tests and final 34 native browser cases / four
  intentional skips pass. [Exact C2 evidence](../assets/compact-transform-controls/c2-verification.md)
  records the prior failing diagnostics and scoped correction; no unresolved
  finding or migration. C2 diff reviewed. Next: consistent0.12.1 metadata, complete
  clean release gates, compatibility reader, full review and normal publication.

- C3 release preparation: origin/master remains 2782d809; safely incorporated with
  no upstream source changes. Remote latest v0.12.0; no v0.12.1 tag collision.
  All five versions 0.12.1; uv's third-party 0.12.0 package remains pinned unchanged.
  Producer assertion updated;0.11.0/0.12.0 archive metadata joins compatibility
  matrix. Release/user/migration guidance current. Complete clean gates and actual
  tagged 0.12.0 reader, full review and publication remain pending.

- Actual annotated v0.12.0 reference checkout at427c050b32c5ae361c7c9da042616a5266600dcd
  accepts final0.12.1 data. [Producer](../assets/compact-transform-controls/candidate-producer.json) /
  [reader](../assets/compact-transform-controls/candidate-reader.json) record exact
  coordinates/original hashes, retained multi-entry undo/redo, save/reexport, archive
  import without portable history and unchanged completed jobs. Fresh disposable
  `/tmp/neistra-compact-candidate-reader` migrated to0013; actual reader module
  resides in `/tmp/neistra-reader-012`. Focused archive tests19 pass; frozen UV
  sync and focused Ruff pass. Full clean release gates and review remain pending.
