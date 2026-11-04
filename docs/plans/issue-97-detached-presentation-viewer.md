# Issue #97 — Detached read-only presentation viewer

## 1. Status and issue metadata

- Status: **Approved; implementation complete through M3/C3 — release qualification pending**.
- Issue: [#97 — Add a detached, read-only presentation viewer with live synchronization](https://github.com/ManuelSe/Neistra/issues/97).
- Issue inspected: open, enhancement label, no comments, assignee or milestone;
  issue updated 2026-10-19. Recheck material changes before implementation.
- Plan approved: 2026-11-04, by explicit user response: "Implement this plan.
  Wait for the /goal command."
- Approval covers the preceding proposal, including local canvas mirroring,
  source-resolution/background limits and exceptional transient status feedback.
- Approval authorizes this planning checkpoint. Runtime implementation must wait
  for `/goal`; persisting this document does not start implementation.
- Implementation authorized by explicit `/goal` on 2026-11-04 after C0 was
  committed/pushed as36315430faba0325a624784cd201802558db9895.
- Verification amendment, 2026-11-04: the user approved headed desktop
  window/fullscreen tests plus automated unequal-viewport coverage in place of a
  physical second-monitor check, then clarified that moving a window to a second
  monitor needs no separate test from ordinary window movement. Verify ordinary
  desktop movement/resizing/fullscreen; do not require or claim a physical
  second-monitor test. This supersedes the original physical-equipment requirement.
- Base branch: `master`, fast-forwarded from `origin/master` before branching.
- Inspected and actual branch base:
  `e6d8f63670e3a3819f1a6dbceba7411438861d72`.
- Feature branch: `feat/issue-97-detached-presentation-viewer`.
- Planned release: stable minor **0.28.0**, subject to release/tag recheck.
- Detailed source of truth: this document. Keep [global PLAN](../PLAN.md)
  unchanged; maintain concise project status in [PROGRESS](../PROGRESS.md).
- Architectural decision: [D-151](../DECISIONS.md#d-151--local-read-only-presentation-mirrors-the-molecular-canvas).

## 2. Core problem and approved outcome

A scientist needs to operate the normal workspace while colleagues watch the
same molecular scene on another monitor, without editing controls or interface
clutter. The presentation must include the visible consequences of navigation,
appearance, selection and molecular changes, including uncommitted previews.

Deliver one local, detached, read-only window that mirrors the main molecular
canvas. Opening or closing it must preserve the main viewer and project. The
audience cannot navigate independently, change selection or modify project state.

Use canvas capture rather than independently rebuilding and synchronizing a second
molecular scene. This delivers the presentation workflow without duplicating
geometry, surface calculations or molecular state ownership. Native feasibility
qualification is mandatory; this plan does not claim that capture already works.

## 3. Authority, inspected baseline and assumptions

Apply authority in this order:

1. Explicit user guidance, corrections and recorded approval.
2. `AGENTS.md` and accepted architectural decisions.
3. Existing architecture, product boundaries, schemas and repository conventions.
4. The issue's underlying problems, outcomes, constraints and explicit non-goals.
5. The issue's technical suggestions, which are non-binding.

Planning inspected `AGENTS.md`, PRODUCT_SPEC, global PLAN, PROGRESS, DECISIONS,
VERIFICATION, ARCHITECTURE, PROJECT_SCHEMA, NORMALIZED_SCHEMA, API, DEVELOPMENT,
PERFORMANCE, recent approved plans and release evidence, relevant frontend state,
renderer/preview interfaces, persistence/migration/API boundaries, native tests,
reader harnesses, package/version sources, Git refs and remote delivery policies.

Key baseline facts:

- Backend immutable normalized artifacts remain authoritative molecular data.
  TanStack Query retains API-backed state; ordinary selection/camera and active
  previews remain transient application state. Mol* is a disposable renderer.
- The current molecular canvas renders labels, measurements, interactions,
  surfaces, highlights and geometry previews. Application controls/panels are
  outside it. Retain canvas-rendered orientation axes under D-149's user correction.
- Viewer instances change on project switches and responsive remounts. A
  presentation session therefore cannot be owned by a particular viewer instance.
- Project, viewer-settings and archive schemas are 2; normalized, selection and
  component schemas are 1; Alembic head is `0014`.
- Existing stable history includes annotated `v0.27.0`, targeting verified runtime
  `e702a3d12aabbd1d5bd4eb10bc50ee44ba7c1782`, and preceding stable releases.
  The original request's no-release-history premise is superseded by this evidence.
- The local tree was clean and local/remote master agreed before branching.
- Remote inspection found no Actions workflows, branch protection or rulesets.
  Normal merge commits are enabled and preserve recent checkpoint history.
  Recheck policy before integration; present absence is not permission to bypass
  future required checks, reviews or unresolved conversations.
- Existing reader harnesses, scientific toolchain and candidate/exact-master gate
  conventions remain binding. D-148 separates portable correctness from strict
  reference-host timing qualification.

Related issues: delivered #96 owns the application viewer interface; #95 owns
sequence placement; #107 tracks the pinned native picking patch; #98 owns warning
inspection; [#128](https://github.com/ManuelSe/Neistra/issues/128) owns image-export
design. Do not absorb their independent scope into this feature.

Approved product assumptions:

- Resolution follows the main canvas. Enlarging the detached window does not
  generate additional molecular detail. Preserve its aspect ratio by letterboxing.
- The main workspace must remain rendering. A hidden, minimized, suspended or
  unavailable source produces a paused/disconnected state; do not promise invisible
  background rendering or bypass browser throttling.
- Normal steady presentation has no persistent controls. Necessary loading,
  disconnected/error feedback and a compact temporary preview indicator are
  deliberate exceptions to the issue's absolute no-overlay wording.
- Qualify desktop Chromium using existing pinned browser tooling first. Standards
  support alone does not establish certification for every browser family.
- Native capture failure requires replanning, not an unreviewed second-renderer
  fallback or a silent reduction in accepted visual coverage.

## 4. Requirement disposition matrix

| ID | Significant requirement | Disposition | Approved treatment, rationale and follow-up |
|---|---|---|---|
| P01 | Separate presentation window; original remains functional | Essential | Open from an icon action without moving/replacing the main viewer. |
| P02 | Clean viewer-only presentation | Essential | Dedicated entry point with molecular output and necessary transient feedback. |
| P03 | No persistent toolbars, panels or editing controls | Essential | Neither workspace UI nor native video controls mount in the child. |
| P04 | Absolutely no information overlays under any condition | Rejected as proposed | Connection failure and uncommitted-preview status must remain truthful. No follow-up needed. |
| P05 | Repeat activation focuses existing window | Essential | One window per owning workspace; reopen after closure. |
| P06 | Manual second-monitor placement and maximization | Essential | Ordinary OS/browser window movement/maximization. Per explicit user correction, no separate physical second-monitor test is required. |
| P07 | Native fullscreen and unobtrusive access | Supporting | Keyboard access and a transient keyboard-reachable control; handle denial. |
| P08 | Main viewer is sole presentation authority | Essential | No independent camera, selection or molecular input handlers in child. |
| P09 | Camera position/orientation/target/zoom/projection | Essential | Mirror actual rendered output rather than reconstruct camera state. |
| P10 | Visible structures, additions/removals and committed edits | Essential | Include undo/redo and named scene application through main output. |
| P11 | Selection highlights and representations | Essential | Include styles, colors, opacity, hydrogen modes, isolation and surfaces. |
| P12 | Molecular labels, measurements and interaction markers | Essential | Mirror actual visibility and existing preview pause/removal behavior. |
| P13 | Movement, placement, numerical and minimization previews | Essential | Show existing rendered previews; child never persists or recomputes them. |
| P14 | Project switching without stale molecular data/highlights | Essential | Obscure retired content immediately; expose only current-source output. |
| P15 | Different window sizes/aspect ratios | Essential | Preserve complete source image without stretching/cropping. |
| P16 | Session leader pointer indicator | Supporting | Include a subtle normalized screen-space marker mapped through displayed-image bounds. |
| P17 | Hide pointer on exit/inactivity | Supporting | Clear on leave, blur, source change, disconnection and bounded inactivity. |
| P18 | Molecular/3D pointer reconstruction | Rejected as proposed | Raster mirroring preserves projection; image-space mapping is sufficient. No follow-up needed. |
| P19 | Dedicated presentation application entry point | Supporting | Adopt without mounting normal workspace. |
| P20 | Independent molecular renderer | Rejected as proposed | Duplicate geometry/surface work and synchronization complexity are unnecessary for approved outcome. Higher-resolution demand may justify separate work. |
| P21 | BroadcastChannel synchronization | Rejected as proposed | A bounded same-origin bridge suffices for one owned local window. No follow-up needed. |
| P22 | Full molecular snapshots/artifact fetches/revision synchronization | Rejected as proposed | Child consumes frames, not another molecular model. No backend sync feature or follow-up needed. |
| P23 | Session handshake and stale-update protection | Supporting | Retain for window/source lifecycle, pointer and status. |
| P24 | Throttled camera messages | Already satisfied by design | Camera changes travel in frames; no separate camera stream is introduced. Capture itself remains unimplemented. |
| P25 | Lightweight bounded pointer updates | Supporting | Latest-value coalescing without event-proportional queues. |
| P26 | Closure, reload, owner loss and initialization failure | Essential | Explicit bounded lifecycle states and resource cleanup. |
| P27 | Independent high-resolution output | Deferred | Accept source resolution for this slice. Create a follow-up if demonstrated presentation needs require more detail. |
| P28 | Full browser-family qualification | Deferred | Desktop Chromium first. Create separately scoped qualification work before broader certification claims. |
| P29 | Automatic monitor placement | Optional, omitted | Manual placement avoids experimental APIs. No follow-up needed now. |
| P30 | Remote sharing, multi-user control or recording | Deferred | Separate transport/privacy/lifecycle products, outside issue's local scope. No speculative follow-up now. |
| P31 | Source-resolution/background expectations | Unclear and requiring a product decision; resolved by approval | Explicit approval accepts the source-resolution and source-visibility limitations above. Reopen decision if requirements change. |
| P32 | Existing scientific rendering and molecular ownership | Already satisfied by repository | Protect existing owners and qualified scientific semantics. |
| P33 | Automated/desktop synchronization and differing-size tests | Essential | Observe actual frames, input isolation, lifecycle, aspect ratio and resource behavior. |
| P34 | Smooth reliable operation during rapid navigation/large loading | Essential | Bounded live output, current-source guards and profiling; no universal constant-frame-rate claim. |
| P35 | Surface/GPU/memory capacity handling | Supporting | Avoid second renderer/surface calculation; measure capture/compositing costs and cleanup. |

## 5. Accepted scope, design and non-goals

Expose a typed capture boundary through `MolecularViewer`, its lazy adapter and the
engine. Capture only the main molecular canvas through `HTMLCanvasElement.captureStream`
and show the resulting live source in a muted, control-free video element. Use
the browser's media pipeline rather than per-frame image encoding or readback.
Request a maximum capture rate of 30 frames per second; do not guarantee a constant
rate. First-frame and WebGL resize behavior require native qualification.

The presentation entry point must avoid mounting App/workspace UI, a molecular
renderer, project queries, editing handlers or job subscriptions. Keep its scene
noninteractive. Fullscreen/window actions cannot affect main camera or selection.

An application-level controller above responsive renderer remounts owns the child
window, source binding and cleanup. Source/project changes retire the prior
generation and clear displayed content before accepting a replacement. Session
handles and state remain transient; do not put them in persisted workspace prefs.

Use a narrow same-origin bridge. Validate exact window identity, origin, session
and source generation. Share the media object directly through the same-origin
relationship rather than trying to serialize it through BroadcastChannel. Permit
only bounded readiness/lifecycle acknowledgements from the child. There is no
child-to-parent camera, selection, editing or project-command channel.

Pointer/status messages are small and latest-value coalesced. Map normalized
canvas pointer coordinates through the actual letterboxed image rectangle, not
the entire child viewport. Hide stale pointers. Preserve main input behavior;
pointer publication cannot mutate canonical selection or intercept navigation.

Differentiate source health from frame activity: a stationary valid scene need
not emit changing frames. Detect unavailable/muted/ended sources, owner loss,
playback failure and bounded missing lifecycle acknowledgement without treating
unchanged molecular pixels as failure. Exceptional states obscure stale output.

Child reload reconnects to the current owner/session. Parent reload or closure
ends that session and requires a new explicit opening action. Handle blocked
popups, unsupported capture, denied playback/fullscreen and WebGL loss without
changing the project. Opening is synchronous with a trusted user action. Enter
fullscreen only from a child user gesture; preserve browser exit behavior.

Non-goals: independent high-resolution scene rendering, remote sharing, recording,
automatic monitor placement, new molecular algorithms, new annotations, image
downloads/export controls, persisted presentation sessions, backend synchronization,
and arbitrary parity with native renderer options. Image export remains #128.

## 6. Milestones and checkpoints

All checkpoints must leave a coherent branch. Record actual outcomes and failures,
run focused validation plus relevant lint/types/tests/build/browser commands after
each implementation milestone, and fix consequential failures before proceeding.
Use passing Conventional Commits, never empty milestone commits. Section 7 defines
the complete release gate and evidence policy.

### M0 / C0 — Persist approved planning and stop

- Outcome: approved contract committed/pushed on the dedicated branch, ready for
  `/goal`; no implementation starts.
- Affected areas: this plan as the first branch change, followed by planning-only
  D-151 and a concise PROGRESS summary.
- Acceptance: actual approval/base recorded, all runtime milestones pending,
  no runtime/version/schema/dependency changes.
- Focused validation: `git diff --check`, document/relative-link review,
  `git diff --name-only`, clean pre-branch status, and remote commit/branch readback.
- Documentation/migration: approved planning documents only; no migration.
- Commit: exactly `docs(plan): add approved plan for issue 97`.
- Rollback: documentation-only revert.

### M1 / C1 — Working local presentation and native feasibility gate

- Outcome: toolbar opens one scene-only window with actual canvas output;
  repeat activation focuses it; closure preserves main viewer and project.
- Affected areas: MolecularViewer capture boundary, lazy adapter, MolstarEngine,
  presentation controller/entry point, bootstrap, toolbar, styles and tests.
- Acceptance: actual molecular pixels and annotations appear; camera navigation
  updates output; child drag/wheel/click/keyboard/context-menu input cannot alter
  camera, selection or project. Fullscreen succeeds through a gesture or reports
  denial. Child creates neither a second renderer nor project requests. Qualify
  real WebGL capture, resizing and representative live preview output.
- Focused validation: frontend lint/typecheck/build, proposed
  `corepack pnpm --dir apps/web test -- presentation`, and proposed
  `PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/detached-presentation.spec.ts --project=chromium`.
  Add tests before invoking those new targets. Retain relevant adapter/toolbar tests.
- Documentation/migration: begin presentation usage/limitations guidance and D-151
  implementation notes; update PROGRESS; no migration.
- Commit: `feat(presentation): add local read-only viewer window`.
- Rollback/compatibility: remove launcher/capture integration; no data conversion.
  If native feasibility fails, stop and revise the approved plan instead of silently
  replacing architecture or omitting essential visuals.

### M2 / C2 — Source ownership, recovery and cleanup

- Outcome: trustworthy presentation across projects, responsive remounts, child
  reload/closure and source failures.
- Affected areas: App-level controller, WorkspaceCanvas/StructureViewer source
  binding, lifecycle protocol, child status and tests.
- Acceptance: project/source retirement immediately obscures stale content; retired
  callbacks cannot reconnect it. Child reload reconnects current owner; parent
  reload/closure requires a new explicit session. Blocked popup, unsupported capture,
  playback failure, context loss, hidden source and lost heartbeat have visible
  bounded outcomes. Stationary output is not classified as a lost connection.
  Repeated close/reopen/remount releases tracks, timers, listeners and references.
- Focused validation: presentation/lifecycle unit tests; detached-presentation native
  lifecycle cases; `viewer-native-ui.spec.ts` and `project-lifecycle.spec.ts`
  regressions; frontend lint/typecheck/test/build.
- Documentation/migration: source-visibility/reconnection guidance, progress and
  decision implementation notes; no migration.
- Commit: `fix(presentation): guard source lifecycle and stale output`.
- Rollback/compatibility: revert presentation controller changes; persisted project
  and existing scientific workflows remain unaffected.

### M3 / C3 — Visual workflows, pointer, accessibility and resource qualification

- Outcome: audience can follow molecular design sessions and presenter pointer,
  with truthful temporary-state and connection feedback.
- Affected areas: pointer/status projection, presentation UI styles, unit/native
  visual/accessibility/performance tests and evidence.
- Acceptance: observe actual appearance/H modes/surfaces/isolation/selections,
  labels/measurements/interactions, coordinate/topology edits, undo/redo, named
  scenes and supported movement/placement/numerical/minimization previews.
  Cancellation restores committed output. Existing geometry-dependent annotation
  pauses remain. Pointer respects letterboxing, stays distinct from selection,
  hides on lifecycle/inactivity boundaries and never changes selection.
- Accessibility: launcher/fullscreen keyboard access, visible focus, truthful status
  announcements, both themes, unequal window sizes and actual 100%/200% zoom.
  Transient controls remain available while focused.
- Resource acceptance: one active capture source, no second molecular renderer,
  duplicated surface work or molecular requests, bounded pointer/status work and
  released resources after repeated lifecycle cycles. Measure capture/compositing
  overhead without claiming a constant frame rate.
- Focused validation: presentation unit/native suites plus relevant existing
  movement, direct-modeling/placement, minimization-live, measurements, interactions,
  surfaces and accessibility regressions. Profile representative protein-ligand
  and existing large-scene fixtures with presentation active. Run frontend
  lint/typecheck/test/build. Preserve D-148 and existing strict timing targets.
- Documentation/migration: screenshots, keyboard guidance, measured limits and
  requirement-to-evidence table; update decision/progress notes; no migration.
- Commit: `feat(presentation): mirror pointer and qualify live scene workflows`.
- Rollback/compatibility: presentation-only overlays can be removed independently;
  never alter molecular behavior to simplify mirrored output.

### M4 / C4 — Final compatibility, version and candidate qualification

- Outcome: reviewed release candidate satisfying the approved contract.
- Affected areas: five authoritative version sources, affected version/producer
  assertions, release notes, verification evidence, plan, progress and relevant
  architecture/accessibility/performance/development guidance.
- Acceptance: essential/supporting outcomes pass; full diff reviewed and
  consequential findings resolved; actual tagged 0.27/current readers pass both
  ways; complete clean-candidate release gate passes. No unintended scientific,
  schema, API, dependency or production resource-policy change.
- Validation: complete section 7 gate; disposable fresh migration round trip;
  actual-reader processes; production-bundle/license/test-harness exclusion checks;
  version consistency; remote policy/tag availability recheck.
- Documentation/migration: final usage, known limits, upgrade/rollback, actual
  review provenance and evidence. No new migration; head remains 0014.
- Commit: `chore(release): prepare v0.28.0` (explicit delivery instruction), plus meaningful test/docs commits when
  appropriate rather than combining unrelated corrections into an empty milestone.
- Rollback/compatibility: use the preceding qualified client/server together;
  no new data conversion is planned. Back up the managed store before deployment.

### M5 / C5 — Verified integration, release and cleanup

- Outcome: normal PR merge, exact-master qualification, annotated tag/stable
  release, verified issue close-out and branch cleanup.
- Affected areas: GitHub PR/issue/release, verified refs/assets and documentation
  delivery receipts, only after implementation authorization and qualification.
- Acceptance: remote merge SHA/content verified, complete exact-master gate and
  actual readers pass before tagging, required reviews/checks/conversations
  satisfied, release notes/assets verified and downloaded evidence hashes match.
- Validation: section 7 gate/readers on exact merged master; annotated tag object
  and target, published release state, asset identity/download, issue reply and
  branch-deletion readbacks.
- Documentation/migration: append actual delivery receipts without changing
  qualified runtime bytes or retargeting tags; no migration.
- Commit only substantive receipts, e.g.
  `docs(release): record verified v0.28.0 publication`; no empty checkpoint commit.
- Rollback/compatibility: preserve published tags; corrective runtime delivery is
  a new verified release. Later documentation integration cannot retarget runtime.

## 7. Acceptance and verification evidence

Tests named as proposed above do not exist at planning time. Add meaningful tests
for domain-independent presentation behavior and actual user workflows; mocked
capture cannot qualify native visual output.

The complete release gate, on both a clean final candidate before opening the
implementation PR and exact merged master before publication, is:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
.venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/neistra_core packages/neistra_demo_plugin
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

Select unique unused disposable data directories and ports per run. Use the
documented locked native chemistry toolchain, AmberTools prefix and bounded native
thread pools. Do not run migration qualification against a user's store.

Additional required evidence:

- Fresh disposable upgrade/downgrade/re-upgrade retains existing migration head.
- Reuse existing reader harnesses with explicit implementation roots and expected
  producer/reader versions in separate processes. Actual tagged v0.27.0 and final
  v0.28.0 must retain originals, coordinates, history, scenes, selections, surfaces,
  jobs and archive round trips in both directions. Do not substitute version
  strings on the current implementation for an actual preceding reader.
- Observe actual child frames and changing molecular features, not only successful
  stream setup, DOM presence or mocked protocol messages. Verify main canonical
  selection, camera, project revisions and original bytes are unaffected by child
  input/open/close actions. Existing edit tests separately verify intended edits.
- Exercise popup/unsupported API/playback/fullscreen errors, child reload, owner
  loss, source remount/context loss, late callbacks, project change/empty project,
  multiple owning tabs, different aspects and pointer lifecycle.
- Verify no child project/structure/job requests, no second molecular renderer,
  no duplicated surface computation and bounded live capture/control resources.
- Inspect actual production output for test-harness exclusion and required license
  notices. Preserve pinned dependencies and native picking patch.
- Headed desktop evidence: ordinary window movement, resizing/maximization,
  fullscreen entry/exit and denial, source visibility/minimization behavior and
  browser/OS/version. Automated unequal-viewport coverage completes the amended
  release requirement; no separate physical second-monitor test is required.

Keep logs, commands, source identities, screenshots, native frame observations,
timings, failures/resolutions and review provenance under
`docs/assets/detached-presentation/`. Map P01-P35 to exact evidence or the approved
disposition, with explicit remaining gaps. Do not claim unexecuted tests or an
unimplemented feature works.

D-148 applies: portable correctness runs real scientific/rendering/performance
workflows and retains exact state, bounded work/memory, production policies and
finite readiness waits. Strict reference-host latency targets are separate
qualification using `NEISTRA_PERFORMANCE=1`, retain original limits and record
whether enforced. A portable pass is not reference-performance certification.

## 8. Data, migration, API, UI, scientific, accessibility and performance implications

- Data/migration: no new durable schema or migration. Session/source identifiers,
  handles, pointer/status and generations remain transient and absent from prefs,
  history, scenes, checkpoints, jobs, archives and molecular artifacts. Preserve
  original uploads and current immutable molecular identity.
- API/jobs: no new HTTP/backend synchronization endpoints, calculation profiles,
  jobs or plugin concepts. Child neither requests molecular payloads nor publishes
  project changes. Only coordinated application metadata versions advance.
- UI: icon launcher in existing viewer toolbar, dedicated scene-only child,
  transient fullscreen access and necessary exceptional status. Preserve main
  molecular controls, clean themes and existing orientation axes.
- Science: no chemistry, inference, coordinate change, interaction analysis or
  measurement recomputation in the child. Mirror qualified source semantics,
  including preview-dependent annotation pauses. Identify uncommitted previews
  temporarily so audience output does not imply saved molecular results.
- Accessibility: keyboard launcher/fullscreen, focus, truthful announcements,
  contrast and zoom are required. A visual presentation is not a complete
  nonvisual scientific interface; do not imply whole-product certification.
- Performance: capture/compositing costs need measurement. Avoid second molecular
  context, duplicate geometry/surfaces, per-frame image readback/encoding and
  molecular message serialization. Source resolution/visibility and browser
  throttling limit output. No arbitrary-size, hardware-independent, high-resolution
  or cross-browser throughput guarantee is approved.
- Compatibility/rollback: retain schema2 project/viewer/archive and schema1
  normalized/selection/component, Alembic0014, public APIs and archive suffixes.
  Existing .neistra.zip and legacy naming continue unchanged. Roll back with
  qualified prior client/server; presentation sessions end rather than migrate.

## 9. Decisions and deviations

D-151 records the cross-project ownership and capture boundary, references this
approved contract and preserves earlier decisions. Append implementation findings
rather than rewriting accepted historical rationale.

Material deviations from speculative issue design: rendered-output mirroring
instead of an independent renderer; a same-origin local bridge instead of
BroadcastChannel scene synchronization; image-space pointer mapping instead of
3D target reconstruction; explicit temporary feedback instead of an absolute
overlay ban; source-resolution/visible-source limits instead of independent
high-resolution or hidden-background promises. Approval accepts these choices.

No deviation reduces PRODUCT_SPEC's existing scientific capabilities. If capture
cannot preserve the accepted visual workflow, stop for a plan revision. A change
to second-renderer architecture or essential scope requires renewed approval.

## 10. Version and release plan

Use stable **minor 0.28.0**, proposed annotated tag **v0.28.0**. This adds meaningful
user-visible functionality beyond a compatible correction, so patch is too small.
Retained public/persisted compatibility does not justify major. Verified stable
history through0.27.0 rules out a first-release reset or automatic prerelease.
The enhancement label is not the versioning rationale.

Update all five authoritative sources together during M4:

1. `apps/web/package.json`
2. `pyproject.toml`
3. `uv.lock` — root project version only
4. `apps/api/src/neistra_api/main.py`
5. `apps/api/src/neistra_api/archive_service.py`

Update affected version assertions and final-producer compatibility coverage
without dependency upgrades. Root package.json is unversioned. Recheck remote
releases/tags and current versions before preparation. If another release
intervenes, record the adjusted version before metadata changes; never overwrite
an existing tag/release. C0 changes none of these sources.

Release-note sections: **Added**, **Behavior and scope decisions**,
**Compatibility and rollback**, **Verification**, **Known limitations**. Disclose
source resolution/visibility, tested browsers, uncommitted preview feedback,
portable versus strict timing and any inherited unreleased behavior.

## 11. PR, merge, issue response, blockers and cleanup

PR title: `feat(presentation): add detached read-only molecular view`.

Use a normal merge commit preserving passing checkpoints. The implementation PR
must document implemented, simplified, deferred and rejected issue requirements,
evidence, exact compatibility and review provenance for a reviewer without this
conversation. Run the complete gate before opening or merging it; no PR is opened
as part of C0. Recheck branch protection, required checks/reviews and conversations.
Inaccessible policy information never authorizes bypass.

Use `Closes #97` only after approved essential/supporting outcomes pass. Otherwise
use `Refs #97` and keep it open. Final reply explains actual implementation,
deviations, evidence, limitations, verified release and remaining work.

Do not create speculative follow-ups. Demonstrated need for independent
high-resolution presentation or broader desktop-browser certification merits
separately scoped work. Reuse #128 for image export; no duplicate issue. Remote
sharing/recording require their own future product briefs, not unfinished #97
essential scope under this approval.

Block merge for failed native capture feasibility, missing essential visuals or
previews, reverse input, stale cross-project output, lifecycle leaks, inaccessible
controls, unresolved consequential findings, compatibility regressions, unapproved
scope/schema/science/dependency changes or failing required validation/policies.

Additionally block release for failed exact-master gate/readers, inconsistent
versions, tag collisions, unverified targets/assets or unmet required reviews and
conversations. Only tag the verified merged commit on master after its complete
gate. Verify annotated tag object/target, stable release/notes, asset download and
hashes, issue response and remote branch states. Never claim these resources exist
before successful remote readback.

Preserve qualified runtime tags while appending later documentation receipts.
Delete local and remote feature branch only after verified delivery, integrated
documentation and a clean tree; verify remote deletion. Never delete unrelated
branches or user work.

## 12. Progress and completion log

| Checkpoint | Status and evidence |
|---|---|
| Planning review, 2026-11-04 | Read-only investigation and complete proposal reviewed; explicit user approval recorded above. Clean master fast-forwarded from origin/master, unchanged base e6d8f63670e3a3819f1a6dbceba7411438861d72. |
| Verification amendment, 2026-11-04 | Explicit user approval replaces physical second-monitor checking with headed desktop window/fullscreen and automated unequal-viewport coverage; subsequent correction confirms ordinary window movement needs no separate second-monitor test. |
| M0 / C0 | Approved contract persisted as first feature-branch change, with planning-only D-151 and PROGRESS records. Commit/push identities and document validation are reported in the handoff after remote verification. No runtime work or application-version change. |
| M1 / C1 | Qualified: typed native canvas capture, separate lightweight entry, one-window reuse/read-only/fullscreen and annotation/coordinate-preview raster.376frontend and4native desktop cases pass; lint/types/build/diff pass. [Evidence](../assets/detached-presentation/README.md) retains diagnostics and local self-review. No schema/API/dependency/scientific/version change. |
| M2 / C2 | Qualified: application-owned source retirement, exact session/source checks, child reload, parent disconnection, hidden/muted/context-lost feedback, bounded first-frame waiting, cleanup and stationary-scene heartbeat separation.384frontend (including10presentation unit cases),9native lifecycle/regression cases and4final presentation cases after frame-epoch review pass; lint/types/build pass. [Evidence](../assets/detached-presentation/README.md). Explicit user correction removes separate physical-monitor testing. |
| M3 / C3 | Qualified: bounded passive pointer, focused transient fullscreen access, preview/error fidelity and all approved native visual/edit/minimization workflows.392frontend,12new native cases,1headed desktop case and69existing desktop/mobile regressions pass, with13exactly retained baseline layout exclusions. Lint/types/build, production-entry/license audit and local self-review pass. [Requirement/evidence index](../assets/detached-presentation/requirements.md) and C3 receipts retain diagnostics separately. No API/schema/migration/dependency/scientific/version change. |
| M4 / C4 | In progress: five authoritative versions updated to0.28.0, preceding producer assertion retained, release notes and reproducible clean-candidate/exact-master recipes prepared. Remote master remains e6d8f63, normal merge allowed, unprotected/no rulesets,0.28.0 tag/release available at preparation. Actual0.27.0 preflight passes both ways. Candidate2 passes all nonbrowser gates, then fails one existing movement setup case; stopped with63browser passes, one failure/one interruption. Retained trace demonstrates premature selection injection during reload. Both variants pass using acknowledged UI selection, with unchanged scientific/state assertions. Candidate3 then exposed a responsive pixel-helper readiness race (93passes before stop); current-frame sampling now waits atomically and12native feature cases pass with unchanged assertions, timeouts and production. Candidate4 full gate and PR review remain required. |
| M5 / C5 | Pending; no issue97 PR, merge, tag, release, issue reply or cleanup claimed. |

Current limitations: final version, actual preceding readers, complete candidate/
exact-master gates and delivery remain. The feature code is implemented on pinned desktop
Chromium; broader browser/hardware throughput certification is not claimed.
Next action: prepare the version and complete C4 before opening the PR. No release
or independent review is claimed.
