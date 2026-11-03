# Issue #96 — Application-owned viewer interface

## 1. Status, approval, and metadata

**Status:** implementation authorized by the user's `/goal` on 2026-11-02.
M1/C1, M2/C2 and M3/C3 are complete; PR/merge and exact-master publication remain.

**Approval:** on 2026-11-02, the user replied, “Implement this plan. Wait for
the /goal command.” This approves the preceding proposal, including its explicit
C0 stop, deferred image-export replacement, and planned patch release 0.26.2.
It authorizes planning persistence now, not runtime implementation or delivery.

| Item | Approved value |
|---|---|
| Issue | [#96 — Remove all native Mol* UI elements from the 3D viewer](https://github.com/ManuelSe/Neistra/issues/96) |
| Issue metadata at C0 | Open; enhancement; no comments or milestone; updated 2026-10-19T13:49:53Z |
| Plan | `docs/plans/issue-96-application-owned-viewer.md` |
| Base branch | `master` |
| Fast-forward-checked local/remote base | `8c92dfd8d92dec4d450775ee8a0f74254a24b707` |
| Feature branch | `fix/issue-96-application-owned-viewer` |
| PR title | `fix(viewer): remove native viewport interface` |
| Merge strategy | Normal merge commit preserving passing checkpoints |
| Planned release | Stable patch **0.26.2** |
| Proposed annotated tag | **v0.26.2** |
| Implementation PR | [#129](https://github.com/ManuelSe/Neistra/pull/129), open against master; tag/release pending |
| Verified image-export follow-up | [#128](https://github.com/ManuelSe/Neistra/issues/128) |

## 2. Core problem, outcome, authority, and assumptions

The viewer currently exposes two interface systems. Neistra hides the main
native panels, but Mol* still renders viewport controls, information overlays,
tasks, notifications, and branding. Application CSS and DOM observers then
maintain those native elements.

**Approved outcome:** one Neistra-owned interface around the existing molecular
rendering engine. Rendering, navigation, picking, hover highlighting, selection,
surfaces, editing previews, interaction markers, molecular labels, and
measurements retain their existing owners and behavior.

Authority, in descending order:

1. Explicit user guidance and subsequent corrections.
2. [AGENTS.md](../../AGENTS.md) and accepted [decisions](../DECISIONS.md).
3. Existing architecture, product boundaries, schemas, and repository conventions.
4. The issue's user problems, intended outcomes, constraints, and explicit non-goals.
5. Nonbinding technical suggestions in the issue.

Preserve the global [plan](../PLAN.md) and [product specification](../PRODUCT_SPEC.md).
Removing native UI does not require reproducing every feature exposed through
that UI. D-149 records the approved interface boundary and the specific provisions
of earlier decisions that it supersedes. D-002, D-013, D-017–024, D-037–038,
D-041–042, D-049, D-124–125, and D-148 remain relevant ownership/qualification
constraints except where D-149 explicitly supersedes native interface retention.

### Inspected baseline

Inspection covered AGENTS.md; PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS and
VERIFICATION; architecture and schema/API documentation; actual viewer code,
frontend state ownership, backend schemas/models, migrations through 0014,
archive provenance/validation, generic job contracts, and tests/reader harnesses.
Related issues #56, #91, #97, #98, and #107 and recent delivery PRs were reviewed.
Git branches, tags, remote releases, workflow availability, version sources and
qualification/publication conventions were checked.

Contrary to the original brief's absent-release-history premise, stable releases
exist through [v0.26.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.26.0),
whose annotated tag targets `582617139527cf22dd7ec9514632b121a628959a`.
Current master declares 0.26.1, unreleased after PR #126. Mol* remains pinned to
5.11.0 with the D-125 pick-readback patch tracked by #107.

Project, viewer, and archive schemas are version 2; normalized molecular,
selection, and component schemas remain version 1. Alembic head is 0014.
No open PRs, GitHub Actions workflows, master protection, or repository rulesets
were exposed at inspection. All three merge methods are enabled; recent delivery
provides normal-merge precedent. No dedicated release command or PR template was
found. Recheck requirements before delivery; this observation never authorizes
bypassing checks, reviews, protections, or unresolved conversations.

Reference workflow research was performed during planning. External product
references remain outside repository artifacts. The installed Mol* 5.11.0 source
and [official plugin documentation](https://molstar.org/docs/v5/plugin/instance/)
support the custom viewport boundary; installed pinned source governs actual APIs.

The proposal was read-only. Tests were inspected, not executed; no feature
qualification is claimed. At C0, `git pull --ff-only origin master` reported
already up to date, the working tree was clean, and local/remote master matched
the recorded base. The branch, plan path, and proposed tag were unused.

## 3. Requirement disposition matrix

| Significant requirement | Classification | Approved treatment and follow-up |
|---|---|---|
| Remove native viewport buttons, menus, settings and toolbars | Essential | Omit their components entirely. |
| Remove native hover-information text and tooltips | Essential | Omit native informational overlays; retain molecular hover highlighting. |
| Remove native notifications and progress overlays | Essential | Omit them while preserving actionable application feedback. |
| Remove native logo and viewer branding | Essential | Render the canvas without its logo component. |
| Existing canvas orientation axes | Essential exception by explicit user correction | Retain the existing axes. Do not add a replacement widget or disable the helper. |
| All remaining viewer controls and information belong to Neistra | Essential | Preserve existing application controls, status, errors and notifications. |
| Preserve rendering, camera navigation, picking, selection and hover | Essential | Require real WebGL regression coverage. |
| Preserve application-managed molecular annotations and measurements | Essential | Keep representation and measurement-manager paths intact. |
| No native UI after loads, rebuilds, project changes or remounts | Essential | Test lifecycle transitions and transient appearances. |
| Prefer configuration or a minimal custom viewport | Supporting | Use the pinned version's custom viewport component seam. |
| Remove obsolete native UI CSS and DOM handling | Supporting | Delete obsolete overrides, attribution observer and popup-clearance machinery. |
| Preserve dependency licensing and attribution outside the viewer | Essential | Ship the complete Mol* notice outside the canvas interface. |
| Regression tests for absence and functionality | Essential | Combine component, adapter and native browser coverage. |
| App-owned camera, selection, styling, measurements, warnings and job controls | Already satisfied by the repository | Reuse and verify the existing controls. |
| Loading feedback throughout actual scene rebuilding | Essential | Extend the existing indicator through the rendering promise lifecycle. |
| Automatically reproduce every native function | Rejected as proposed | Would expand the issue into unrelated product work. No blanket follow-up. |
| New application-owned hover-information overlay | Optional | Omit; existing selection inspection remains available. No follow-up now. |
| Native screenshot/image-export replacement | Deferred | Useful but needs its own export scope. Create a bounded image-export follow-up during delivery. |
| Native fullscreen, XR, illumination, animation and advanced renderer panels | Deferred | No replacements here. Detached presentation remains #97; no speculative omnibus issue. |
| Clickable scientific-warning popup | Deferred | Already tracked by #98. Warning visibility and inspection elsewhere must remain intact. |
| Renderer upgrade or pick-patch removal | Rejected as proposed | Unnecessary risk; retain the pin and #107 maintenance boundary. |
| Material unresolved product decisions | None | Approval accepts the explicit scope choices above. |

No essential outcome is deferred. No issue/comment is created during C0.

## 4. Accepted scope, non-goals, and implementation contract

### Rendering and interface boundary

Use a small Neistra-owned viewport component containing the existing
`ViewportCanvas`, without its logo or default native controls, hover text, toasts,
snapshot descriptions, trajectory controls, or background-task widgets. Preserve the existing canvas orientation axes by explicit user
correction. Disable
the outer native task and drag overlays explicitly. Native initialization/WebGL
failure presentation must also resolve through application-owned feedback.

Retain `PluginUIContext`, structure builders, representations, managers, camera
behavior and the existing `MolecularViewer` adapter. A conversion to a different
plugin architecture is unnecessary. Keep the pinned dependency, lockfile patch
and renderer semantics. Required `.msp-plugin`/`.msp-viewport` implementation
wrappers and canvas layout styles are not user-facing controls and may remain.
Do not implement suppression by CSS hiding, DOM deletion or production observers.

### Feedback and lifecycle

Neistra catches mounting, synchronization, measurement, interaction and preview
failures. Preserve those paths and audit removed native feedback for any remaining
actionable gap. Extend the existing loading indicator to actual scene
synchronization, with operation/current-viewer guards so obsolete completion
cannot clear newer feedback. Preserve import, surface, minimization, jobs and
application-notification feedback and their separate lifecycles. Do not mirror
all vendor log entries or create a second notification system, invented
percentage progress or unsupported cancellation promise.

Initialization failure, disposal during asynchronous mounting, responsive remounts
and project switches must release resources and reject obsolete completion.
Native UI must never briefly appear while waiting for suppression.

### Cleanup, attribution, and existing tests

Remove `observeViewerAttribution`, `domPresentation.ts` once unused, native
popup/control/theme overrides, and `useChromeClearance` plus its CSS variable,
whose current consumers serve native popups. Retain canvas sizing/background,
application overlays and required dependency layout styles.

Ship the complete Mol* license in `apps/web/public/licenses/molstar.txt`, document
attribution in `docs/THIRD_PARTY_NOTICES.md`, and link it from repository
documentation. Verify that production output contains the notice. No new viewer
About panel or general dependency-license audit is required.

Existing rebranding tests explicitly require native screenshot/settings controls.
Replace those obsolete assertions in the same coherent runtime checkpoint,
preserving applicable theme, contrast, focus, zoom, layout and hit-target coverage.

### Non-goals

No new chemistry, annotation system, hover-information overlay, renderer upgrade,
snapshot format, image exporter, fullscreen/XR/illumination panel, trajectory
playback, detached viewer, warning popup, generic task mirror, or persisted
presentation preference. Existing #97, #98 and #107 remain separate.

## 5. Milestones and independently verifiable checkpoints

Every runtime milestone runs frontend lint, type-check, unit tests, build and
`git diff --check`, plus its focused checks below. Fix validation failures before
continuing. Each checkpoint updates this log, concise project progress and material
decision/evidence records; preserve failed/interrupted diagnostics. Commit passing
states using Conventional Commits. Do not create empty milestone commits.

### C0 — Persist approval and stop

- **Outcome:** approved planning branch ready for `/goal`.
- **Areas:** this plan, concise PROGRESS summary, appended D-149 only.
- **Actions:** confirm clean tree; fast-forward local master from origin/master;
  recheck issue/base/branch/tag/release facts; create the planned branch; write
  this plan as the first branch change, then its supporting records.
- **Acceptance:** approved contract is persistent; no runtime, test, dependency,
  schema, migration or application-version changes; global PLAN remains intact.
- **Validation:** inspect `git diff --check`, document links, scope/approval
  consistency, branch/base, changed-file list and clean committed tree. Verify
  the pushed remote branch SHA if remote access is available.
- **Commit:** exactly `docs(plan): add approved plan for issue 96`.
- **Compatibility/rollback:** documentation only; no application effect.
- **Stop:** report path, branch, commit, milestones and release impact, then wait
  for `/goal`. Do not begin M1 or open a PR.

### M1/C1 — Deliver the complete viewer cleanup

- **Outcome:** only Neistra UI surrounds the existing molecular canvas, with
  loading and failure feedback preserved.
- **Areas:** viewport component, MolstarEngine, StructureViewer, obsolete
  presentation helpers/CSS, license artifacts, affected tests.
- **Acceptance:** forbidden native elements are absent from the DOM; rendering
  and app controls work; mount/rebuild errors remain visible; delayed mounting
  and disposal release resources; native UI does not flash. Update tests requiring
  native controls in this checkpoint, not in a later broken state.
- **Focused validation:**

  ```bash
  corepack pnpm --dir apps/web test -- viewer-presentation viewer-adapter structure-loading viewer-hover native-pick-readback
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/viewer-native-ui.spec.ts tests/e2e/viewer-controls.spec.ts tests/e2e/viewer-theme.spec.ts tests/e2e/rebranding.spec.ts tests/e2e/rebranding-surfaces.spec.ts tests/e2e/rebranding-zoom.spec.ts
  ```

  `viewer-native-ui.spec.ts` is planned new coverage, not an existing feature.
- **Documentation:** architecture, branding, accessibility, attribution,
  decision log, feature log and progress.
- **Migration:** none. Reverting the frontend restores prior UI without data
  conversion; preserve current renderer/patch pins.
- **Expected commit:** `fix(viewer): remove native viewport interface`.

### M2/C2 — Qualify lifecycle and scientific-display preservation

- **Outcome:** regression evidence proves cleanup survives normal workspace use.
- **Areas:** native browser tests, existing observation harnesses where needed,
  component tests, verification/evidence records.
- **Acceptance:** no native UI during import, representation changes, topology
  rebuilds, project switching, responsive remounts, reload, hover or task execution.
  Verify orbit/pan/zoom/focus, all picking modes, exact hover/selection membership,
  surface activation, previews and visible distance/angle/dihedral and molecular
  labels. Presentation-only operations preserve revisions, originals, coordinates,
  history and expected request counts.
- **Focused validation:**

  ```bash
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/viewer-native-ui.spec.ts tests/e2e/viewer-hover.spec.ts tests/e2e/viewer-click-selection.spec.ts tests/e2e/measurements.spec.ts tests/e2e/surface-objects.spec.ts tests/e2e/interactive-selection-transform.spec.ts tests/e2e/viewer-notifications.spec.ts tests/e2e/release-hardening.spec.ts
  ```

  Cover both themes, desktop/mobile, 320px, keyboard and existing actual-browser
  zoom qualification. Observe transient forbidden nodes where needed using
  test-only observation, without requiring every `.msp-*` wrapper to disappear.
- **Documentation:** evidence map, visually inspected screenshots, failed
  diagnostics and explicit limitations; feature/progress/verification updates.
- **Migration/compatibility:** none; no scientific/model ownership changes.
- **Expected commit:** `test(viewer): qualify interface ownership across lifecycle changes`.
  Necessary behavior corrections use a suitable `fix(viewer)` commit rather than
  disguising production fixes as tests.

### M3/C3 — Prepare and qualify the release candidate

- **Outcome:** reviewed, compatible, versioned candidate ready for a PR.
- **Areas:** five version sources, archive assertion/producer matrix, release
  notes, actual-reader evidence, feature/progress/development documentation.
- **Acceptance:** versions agree; schemas/API/job/plugin contracts and migration
  head remain; compatibility and the complete gate pass on the final candidate;
  full-diff review has no unresolved consequential finding.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/integration/test_archive_roundtrip.py
  ```

  Run actual tagged v0.26.0 and final-candidate producer/readers in both directions
  with the existing `tests.support.selection_reader_qualification` harness,
  disposable stores and explicit implementation-root/version assertions. Inspect
  retained originals, coordinates, selections/scenes/surfaces, generic jobs,
  history and archive remapping through existing relevant qualification. Compare
  the inspected 0.26.1 base where useful, without claiming it is a published release.
  Then run the complete release gate in section 7 before opening the PR.
- **Documentation:** release notes, compatibility/upgrade/rollback guidance,
  evidence and honest review provenance. Do not claim independent review if only
  implementer self-review was obtained.
- **Migration/rollback:** none; no schema downgrade or data stripping.
- **Expected commit:** `chore(release): prepare v0.26.2`.

### M4/C4 — Verify merged delivery and publish

- **Outcome:** qualified merged runtime, remotely verified release and accurate
  issue close-out.
- **Areas:** GitHub PR/merge/release/issue lifecycle and documentation/evidence.
- **Acceptance/actions:** recheck branch head, reviews, checks, protection and
  conversations; merge normally; run the complete gate and actual-reader checks
  on the exact merged master. Only then create annotated tag and stable release.
  Verify tag target, release metadata/notes and downloaded evidence checksums.
- **Validation:** complete gate plus remote PR/commit/tag/release/asset/reply
  receipts; verify cleanup remotely and locally after delivery.
- **Documentation:** record publication receipts and completion log. If meaningful
  documentation changes are needed, use
  `docs(release): record verified v0.26.2 publication`; no empty runtime commit.
- **Compatibility:** never retarget a published tag. Later documentation audits
  must preserve qualified runtime bytes and identify the tagged runtime precisely.

## 6. Data, migration, API, UI, scientific, accessibility, and performance implications

- **Data/API/jobs:** no endpoint, payload, persisted field, job/plugin contract,
  archive schema or migration changes. Preserve project/viewer/archive 2,
  normalized/selection/component 1 and Alembic 0014. Application version metadata
  changes are producer provenance, not schema gates (D-042).
- **State:** backend artifacts remain authoritative; renderer state remains
  disposable. Loading/operation state is transient and scoped to the active viewer;
  do not persist it into projects, scenes, history, archives or browser preferences.
- **Science:** no chemistry, coordinates, molecular identities, measurement
  calculations or inference change. Removing DOM information must not remove
  rendered molecular annotations or hide parsing/conversion/validation warnings.
- **UI:** native screenshot/settings and other vendor entry points disappear
  deliberately. Existing Neistra controls form the supported interface. Do not
  silently present deferred replacements as implemented.
- **Accessibility:** retain named viewer region, accessible app controls, focus
  behavior, loading feedback and alerts. Replace obsolete vendor assertions while
  retaining applicable theme, contrast, layout, zoom and keyboard coverage.
- **Performance:** no new molecular serialization/refetches, per-hover React
  updates or extra renderer instances. Preserve bounded work/request/memory
  checks. Do not claim a performance improvement without measurement.
- **Rollback:** deploy the prior compatible application and reload clients;
  no data stripping or database downgrade is required. Maintain normal complete
  managed-store backup practices for deployments.

## 7. Acceptance and verification evidence

Run the complete gate on the final candidate and exact merged master with
disposable data and the locked native scientific toolchain:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave-issue96-gate .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

The E2E configuration owns its separate disposable data/API/worker/web resources;
use documented isolated overrides when necessary and record them. Use compatible
documented execution environments for locked binaries rather than changing pins
or skipping native scientific tests.

Follow D-148 and current [development](../DEVELOPMENT.md),
[verification](../VERIFICATION.md), [accessibility](../ACCESSIBILITY.md), and
[performance](../PERFORMANCE.md) guidance. Portable correctness is mandatory.
Strict reference-host timing is separate qualification with
`NEISTRA_PERFORMANCE=1`; do not require AC power or describe portable results as
strict performance qualification. Preserve scientific checks, production
deadlines/resource limits, bounded work, request counts and finite measurements.

For each acceptance criterion, record the actual pure/component/native-browser
evidence. DOM absence alone does not prove working rendering: retain real WebGL
pixels, trusted input, canonical identities and visible label/measurement checks.
Record exact commands, source/log hashes, environment, outcomes, exclusions,
screenshots and failed/interrupted attempts. Keep test observation code out of
production output. Requalify affected results after source changes; do not
substitute historical baseline results for new feature evidence.

## 8. Decisions and deviations

D-149 is the cross-project architectural record for this contract. It supersedes
only D-049's native-control/visible-attribution retention and related native-popup
clearance guidance, including the D-100 release-review note. Native label/focus
preservation notes in D-124/125 do not require retaining informational DOM after
this approved change; preserve their picking, highlighting, camera and surface
contracts. Retain D-148's current qualification policy.

Approved simplifications are the minimal custom viewport, reused app controls and
feedback, no automatic vendor feature parity, no new hover overlay, and separately
scoped image export. No essential outcome is deferred. Append material new
decisions to DECISIONS and explain implementation deviations here; do not silently
rewrite accepted history. Irreversible or material scope changes require a product
decision. No implementation deviation has occurred at C0.

## 9. Version and release plan

Use a **patch increment, 0.26.1 to 0.26.2**. This corrects presentation ownership
without adding a scientific capability or changing public APIs, persisted schemas,
archive compatibility or supported modeling behavior. Existing precedent treats
compatible viewer corrections as patches. A major, minor or prerelease increment
is not justified by this scope, irrespective of the enhancement label.

There is no requirement to publish 0.26.1 first. If it remains unreleased, the
v0.26.2 notes must acknowledge its inherited changes. Recheck release/version/tag
availability before release preparation and record any required adjustment.

Update these five authoritative sources together:

- `apps/web/package.json`
- `pyproject.toml`
- `uv.lock`
- `apps/api/src/molweave_api/main.py`
- `apps/api/src/molweave_api/archive_service.py`

Update the archive test's version assertion and retain previous producer-version
coverage. Do not upgrade dependencies while updating root application metadata.

Proposed annotated tag: **v0.26.2**, created only from the verified merged master
commit. Planned release-note sections:

- Viewer changes.
- Preserved scientific workflows.
- Removed native entry points and follow-up.
- Compatibility and upgrade/rollback.
- Inherited unreleased changes.
- Verification.
- Known limitations.

## 10. PR, merge, issue response, cleanup, and blockers

Open the planned PR only after complete candidate qualification. Reference #96
without automatic closure; keep it open until verified release delivery. Describe
implemented, simplified, deferred and rejected requirements, scientific/state
invariants, validation, compatibility and limitations. Use a normal merge commit
preserving passing checkpoints, subject to actual repository requirements.

During delivery, create one bounded follow-up for application-owned image export:
define image scope, dimensions/background behavior, overlays/labels and download
semantics in its own product plan. It is nonblocking for #96 and must not turn
into native-feature parity. Keep #97, #98 and #107 independently tracked; do not
create speculative omnibus issues. No remote communication is part of C0.

After merged-master qualification, tag/release/asset verification and publication,
publish a final #96 reply linking actual PR, runtime commit, tag, release, plan and
evidence. Explain the removed entry points, scope choices, follow-up and remaining
limitations; then close #96. Never claim remote artifacts without readback.

Delete only this feature branch and temporary qualification worktrees after
confirming their changes are retained and publication/issue receipts are verified.
Preserve unrelated branches. Fast-forward local master and verify local/remote
branch cleanup. Later documentation-only publication receipts must not retarget
the qualified runtime tag.

Merge/release must stop for unresolved consequential findings; missing required
approvals/checks; unresolved review conversations; forbidden native UI returning;
lost warnings/loading feedback; broken rendering, interaction or annotations;
compatibility failures; missing license artifacts; unexplained test exclusions;
inconsistent versions; or source changes invalidating qualification. Tagging and
publication additionally require the exact merged-master gate. Follow D-148 for
portable versus strict timing qualification; no new timing/power exclusions.

## 11. Progress and completion log

| Checkpoint | Status | Evidence / next action |
|---|---|---|
| C0 | Approved planning persistence | User approval 2026-11-02; clean fast-forward-checked base above; planned branch created. This checkpoint contains the plan, decision and progress records only. Commit/push receipts are reported in the C0 handoff after verification. |
| M1/C1 | Complete | 373 frontend tests, lint/types/build, license byte identity and 30 native browser passes / 10 existing layout exclusions; zero final failures/retries/flakes. See C1 evidence below. |
| M2/C2 | Complete | 55 native browser passes / 7 existing exclusions, real WebGL failure 1 pass / 1 existing exclusion, 373 frontend and static/build gates; cold-cache annotation cases pass both layouts. |
| M3/C3 | Complete | Clean final candidate passes all20 commands, real tagged readers both ways and complete local diff review; evidence below. |
| M4/C4 | In progress | PR#129 is qualified and reviewed locally; normal merge, exact-master gate and verified publication remain. |

**Current limitations:** exact merged-master qualification/publication remain;
existing scientific limits and annotation overlap are unchanged. **Blockers:** none.
**Next action:** reviewed PR and normal merge, exact-master gate and release.
C0 remains the historical planning-only checkpoint; the later `/goal` authorizes
implementation and delivery.

### Implementation authorization — 2026-11-02

The user invoked `/goal` for the complete approved implementation and delivery
lifecycle after C0 commit `461c2be0a6ff9d96cf14c588de193438333d3ae3` was pushed and
verified. This ends C0's wait. The subsequent explicit PR requirement to include
`Closes #96` supersedes section 10's no-auto-close strategy; the implementation
PR will close the issue on merge, followed by the verified release close-out
reply. Publication still requires exact merged-master qualification. No other
approved scope, deferred requirement or qualification policy is expanded.

### User correction — orientation axes, 2026-11-02

During C1 screenshot review, the user explicitly stated: “Actually, the
orientaion axes can stay.” Preserve the existing canvas-rendered orientation
axes as an exception to the native-interface cleanup. Their defaults and camera
behavior remain unchanged; native DOM controls/labels/toasts/task UI/logo are
still omitted. The browser gate asserts the retained helper is on. This overrides
the interim axes-disable implementation note; the decision log retains both the
interim rationale and the explicit correction.

### M1/C1 completion — 2026-11-02

The minimal viewport, explicit React/plugin cleanup, guarded scene loading,
obsolete CSS/helper removal, shipped byte-identical license and attribution,
updated application-focus/zoom tests and native-UI absence monitor are implemented.
Existing orientation axes remain by explicit user correction. No API/schema/
migration/dependency/version/scientific-model change.

Final [browser gate](../assets/application-owned-viewer/c1-final-browser.json)
passes **30 native cases / 10 existing layout exclusions**, with zero failures,
flakes or retries, unchanged source hashes and actual 100%/200% zoom. Both new
absence/axes/reload cases run on desktop and mobile. The final
[frontend suite](../assets/application-owned-viewer/c1-final-unit.json) passes
**373 tests**; [static/build/license gate](../assets/application-owned-viewer/c1-final-static.json)
passes lint, types, production build, byte-identical shipped notice and diff checks.
Initial lint/isolation/focus/mobile-target attempts remain diagnostic; the first
browser run changed source during execution and is not qualification. No scientific
assertion, deadline or exclusion was relaxed. The [C1 review](../assets/application-owned-viewer/c1-review.md)
is implementer self-review. Both-theme desktop/mobile screenshots were retained
and inspected. C2 scientific-display/lifecycle and complete candidate/master
qualification remain required. Next: M2/C2, then final release preparation.

### M2/C2 completion — 2026-11-02

[C2 summary](../assets/application-owned-viewer/c2-summary.json) records **55 native
browser passes / 7 existing exclusions**, zero failures/flakes/retries, plus the
updated actual WebGL-failure case (**1 pass / 1 existing exclusion**). All **373
frontend tests**, lint/types/build/diff and production-harness exclusion pass.
Source hashes remain unchanged in every final gate. The two-layout annotation
workflow additionally passes after clearing generated Vite optimization cache;
the observation harness is included only by the existing development qualification
HTML and dynamic test imports, absent from production output.

Native distance/angle/dihedral/structure text and positive visible glyph draw
counts survive appearance rebuild/restoration, responsive remounts and project
teardown/reopen. Real native toast entries and overlay task-progress events never
mount native UI. Camera, exact before/after database state and original bytes
remain; renderer-only rebuilds issue zero normalized reads. Existing hover/picking,
independent surfaces, movement, notifications and both-theme accessibility pass.
1STP records 682ms import, 4542ms interactions, 365ms longest task and zero repeated
structure reads; D-148 portable mode records these without claiming strict timing
qualification. Existing annotation overlap/placement remains unchanged.

Earlier fixture/cache/navigation/timestamp diagnostics remain separate. Corrected
fixtures use the existing four-carbon 3D structure and a project-list target
created before application caching; state comparison uses exact database GETs.
No assertion, production deadline, scientific policy or exclusion is relaxed.
[Review](../assets/application-owned-viewer/c2-review.md) is local self-review.
Both-theme desktop/mobile screenshots are retained and inspected. No production
runtime change beyond C1, schema/migration/dependency or version change. Next:
M3/C3 version preparation, actual tagged readers and complete release gate.

### M3/C3 release preparation — 2026-11-02

C1 `e2df929` and C2 `e899ab9` are committed and pushed. A fresh fetch confirms
origin/master remains `8c92dfd`; it is already an ancestor of this branch. No
v0.26.2 tag/release or other open PR collides with the approved patch. All five
versions advance to0.26.2; archive tests retain producer0.26.1 coverage. Release/
compatibility notes explicitly include inherited unreleased0.26.1 changes.

The bounded, remotely verified image-export follow-up is
[#128](https://github.com/ManuelSe/Neistra/issues/128). Actual detached v0.26.0 reader
worktree `/tmp/neistra96-reader-0260` is at tagged runtime `582617139527cf22dd7ec9514632b121a628959a`.
Focused archive, complete candidate/actual-reader, full-diff review and exact-master
qualification remain pending; no PR, tag or release is claimed at preparation.

### M3/C3 candidate diagnostic and focused correction — 2026-11-02

The clean `a66bf7c` candidate passes all pre-browser release steps: 1262 Python
with zero skips, 373 frontend, 12 supervisor/policy and static/build checks. Its
full browser invocation ends **351 passed / 1 failed / 62 existing exclusions**.
[c3-candidate1-gate.json](../assets/application-owned-viewer/c3-candidate1-gate.json),
full report and failed mobile trace are retained. This is not release qualification;
the gate stops at browser failure before actual-reader steps.

The new annotation observer dereferenced a newly created replacement engine while
its asynchronous plugin mount was incomplete. The test now requires the actual
replacement engine on each breakpoint crossing and polls until its four annotation
representations exist. The observer returns an empty set while the plugin is absent;
it does not catch render errors or weaken text/draw-count/state assertions. Native
feedback stimulation still requires a mounted plugin. Production code, deadlines,
scientific policies, fixture data and exclusions are unchanged. Focused validation
and a fresh clean complete candidate gate are required before PR creation.

Focused correction validation passes all373 frontend tests, lint/type-check/build,
version/schema/dependency/license/production-harness exclusion and diff checks.
[c3-remount-browser](../assets/application-owned-viewer/c3-remount-browser.json)
passes all4 desktop/mobile native-interface and annotation cases, zero failures/
flakes/retries. Exact replacement engines and all four annotations are required;
source/log identities verify. Complete local review of this additional test-only
diff finds no unresolved consequential issue. Commit the passing correction and
retained diagnostic evidence, then run a fresh clean complete candidate gate.

### M3/C3 nested-root review finding — 2026-11-02

Review of the retained candidate1 trace exposes a production lifecycle warning:
React defers a nested root unmount invoked during its parent's commit, allowing
plugin disposal before canvas cleanup. Candidate2 is deliberately interrupted
(exit254 after browser case63) for this correction, not called qualification.
Its pre-browser checks pass1262 Python/373 frontend/12 supervisor/static/build;
logs/source identities and interruption provenance remain retained. Actual-reader
steps did not run. Owned interrupted API/worker/web process groups are stopped.

The fail-first unit regression proves the actual wrong order (`plugin`, `canvas`).
A single queued microtask now exits the parent commit and completes root unmount
before context disposal, once, including failure/late-mount paths. Immediate engine
invalidation remains. Five mounting/composition unit cases pass after correction.
Native lifecycle checks additionally reject the exact React root warning through
responsive and project teardown. D-149 appends this implementation correction;
no assertion/deadline/scientific policy/fixture/exclusion is relaxed. Requalify the
focused runtime checkpoint and then a fresh clean full candidate before PR.

The cleanup correction passes **374 frontend tests**, lint/types/build and
version/schema/dependency/license/harness-exclusion audits. Focused native checks
pass **5 / 1 existing layout exclusion**, including both-layout annotation/remount/
project workflows with zero React root warnings and real WebGL failure feedback.
Source/log identities verify; no failures/flakes/retries in final focused checks.
The additional complete diff is reviewed locally, including lazy mount cancellation
and idempotent/failure cleanup. The initial unit failure and minor lint correction
remain diagnostic evidence. Commit this coherent runtime repair, then start a
fresh clean complete candidate gate; no PR/tag/release is claimed yet.

### M3/C3 camera-event regression — 2026-11-03

Candidate3 completes **351 browser passes / 1 failure / 62 existing exclusions**;
all pre-browser steps pass1262 Python/374 frontend/12 supervisor/static/build.
Both new native-interface/annotation/cleanup cases pass desktop and mobile. The
remaining failure is the existing mobile light-theme native double-click case:
only the picked atom remains selected instead of the full residue. Trace/report/
screenshot/context are retained; there is no unexpected reload. The full gate is
not qualified and stops before actual readers.

Inspection finds unconditional double-click invalidation on camera.changed,
including native projection jitter. A deterministic regression performs actual
subpixel projection updates before the trusted dblclick reaches the adapter.
[Evidence](../assets/application-owned-viewer/c3-jitter-fail-first-evidence.json)
proves2 updates/2 native events and exactly equal physical snapshots, while the
old adapter fails the unchanged complete-membership assertion. This reproduces
the failure mode; the original uninstrumented trace does not itself identify the
specific camera event. The first regression invocation is a cold dependency-scan
navigation diagnostic, not the fail-first proof. The existing development-only
qualification HTML now exposes the harness to Vite's scan; production excludes it.

D-149 records the correction: compare full physical camera snapshots before
clearing transient double-click history. Physical movement/drag/wheel and scene/
mode/lifecycle invalidation remain. No new gesture/scientific algorithm, renderer
pin/patch, fixture, assertion/deadline or exclusion change. All374 frontend and
static/build/version/schema/license audits pass. Focused cold-cache native checks
and a fresh clean complete candidate remain required.

Actual detached tagged v0.26.0/current0.26.2 producer/readers now pass both ways in
[a separate preflight](../assets/application-owned-viewer/c3-reader-preflight-results.json),
with explicit module-root/version assertions. Originals/coordinates, retained
batch history, named selections/scenes/surface identities, generic jobs and archive
remapping pass; no schema downgrade/data stripping. Complete-gate readers still
repeat on final clean candidate and exact merged master before publication.

The corrected camera-event checkpoint passes all374 frontend/static/build/version/
schema/license/production-exclusion checks and **28 native cases / 8 existing
layout exclusions** after clearing generated Vite optimization cache. Zero final
failures/flakes/retries; source/log hashes verify. All4 desktop/mobile and both-theme
projection-jitter records prove2 true updates/2 events/equal full snapshots while
exact native residue/ligand expansion succeeds. Hover, camera/navigation, WebGL
failure, annotations/tasks/remounts/projects and zero React root warnings pass.
[Summary](../assets/application-owned-viewer/c3-jitter-summary.json) retains the
four positive records; fail-first/raw reports/traces remain separate diagnostics.

The complete additional diff is reviewed locally: only full physical camera
snapshot changes invalidate gesture history; drag/wheel/scene/mode/lifecycle guards
remain. No canonical model, membership/math, API/schema/migration/renderer pin,
fixture/deadline or exclusion change. Actual reader preflight passes both ways.
Commit the coherent passing repair, then run a fresh clean complete candidate gate
before PR creation. No independent approval, tag or release is claimed.

### M3/C3 completion — 2026-11-03

Clean release-prepared candidate `117c35480586edffc2bb1cc72a06df934e0b59b8` passes the
[complete 20-command gate](../assets/application-owned-viewer/c3-candidate4-gate.json):
**1,262 Python (zero skips), 374 frontend, 12 supervisor/policy and 352 browser passes / 62 exactly unchanged exclusions**. Frozen installs, fresh Alembic 0014, Ruff/mypy 102 files,
frontend lint/types/build, versions/dependency/schema/license checks and diff pass.
Zero failures/flakes/automatic retries; no Python or required scientific skips.
All **595 source identities** and lossless log checksums verify.
The full browser invocation is clean; no replay is needed. The exclusion set is
exactly the accepted preceding baseline, with no new exclusions.

[Summary and actual readers](../assets/application-owned-viewer/c3-candidate4-summary.json)
record actual detached tagged v0.26.0 and current 0.26.2 modules/versions in separate
producer/reader processes both ways. Retained originals/coordinates, saved
selections/scenes/surfaces, generic jobs/history and archive remapping pass without
migration, schema downgrade or data stripping. Backend changes are version metadata
only; approved-base frontend transport types remain unchanged.

[Complete-diff review](../assets/application-owned-viewer/c3-full-diff-review.md)
is implementer self-review, with no unresolved consequential finding. Native
render screenshots are inspected; axes and existing annotation placement remain.
D-148 portable measurements do not qualify strict reference-host timing. Exact
commands, environment, full report, observations, reader evidence, source/log hashes
and power samples are retained. Next: request external review on the PR, recheck
protections/base/version and normally merge; then repeat the complete gate on
exact merged master before annotated tag, release, issue reply and cleanup.

Presubmit fetch on2026-11-03 confirms master remains8c92dfd and is already in the
branch. Planned v0.26.2 remains unused; latest stable isv0.26.0. Current repository
policy exposes no master protection/rulesets or CI workflows, allows normal merge,
and disables automatic branch deletion. [Receipt](../assets/application-owned-viewer/c3-presubmit.json)
records this observation; required PR reviews/checks/conversations and policy are
rechecked before merge. Runtime/test/version/lock bytes remain identical to the
clean qualified117c354 candidate after documentation/evidence additions.

### M4/C4 review and merge handoff — 2026-11-03

[PR#129](https://github.com/ManuelSe/Neistra/pull/129) is created against master,
with Closes#96, approved scope/deferrals, patch impact, compatibility and immutable
candidate evidence. GitHub connector write access is insufficient (403); the
already authenticated user CLI creates the authorized PR normally. Connector
readback verifies its exact body, branch/head and base. No protection is bypassed.

[Codex request](https://github.com/ManuelSe/Neistra/pull/129#issuecomment-6592134908)
is remotely verified. No external result, review submission or unresolved thread
has returned at the [recorded review receipt](../assets/application-owned-viewer/c3-remote-review.json).
Review remains complete local implementer self-review; no independent approval is
claimed. Current policy requires no human approval/status check; PR is mergeable
and CLEAN, with no configured check runs. Recheck before the normal merge.
All595 qualified runtime/test/version/lock source identities remain unchanged
through these documentation-only records. Next: normal merge, exact merged-master
complete gate/readers, annotatedv0.26.2, verified release/asset/reply and cleanup.
