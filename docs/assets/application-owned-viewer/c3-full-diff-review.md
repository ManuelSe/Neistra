# Complete local diff review — issue #96

Reviewer: implementer self-review; this is not independent approval.
Reviewed base8c92dfd through release-prepared sourcea66bf7c, including new files,
removed helpers/CSS, tests, notices, versions, delivery scripts and plan/decisions.
Complete candidate qualification and any external review remain separate evidence.

Final reviewed candidate: `117c35480586edffc2bb1cc72a06df934e0b59b8`. Follow-up
sections below record the two consequential qualification findings and their
passing corrections. Complete candidate evidence verifies all 20 commands and 595
source identities; no consequential finding remains unresolved locally.

## Findings and disposition

No unresolved consequential source-review finding. Earlier diagnostic test/setup
findings are corrected and retained in C1/C2 evidence. No scientific assertion,
production policy, original timing target or test exclusion is weakened.

## Review coverage

- The custom viewport uses the existing context/canvas. Native UI is omitted at
  composition, never hidden/deleted after rendering. Orientation axes remain as
  explicitly requested; no disabled-axes production checkpoint was committed.
- All plugin behavior filters, rendering representations, camera/picking paths,
  normalized identity mappings and D-125 patch pins remain. Canonical molecular,
  selection, project, scene and history owners are unchanged.
- The explicit root follows the prior init/render/canvas-readiness sequence and
  unmounts before context disposal. Failed/late mounting and duplicate disposal
  are covered. No alternate renderer architecture or native model authority added.
- Scene feedback uses only a transient boolean and current-operation/viewer guards.
  Obsolete completion cannot restore focus/camera or clear active loading/errors;
  current failures still reach the app alert. App import/job/surface/minimization
  and scientific-warning paths remain separate. SDK toast emission used by the
  removed screenshot UI does not justify a generic log/toast mirror.
- Required canvas/layout/background CSS remains. Removed attribution/clearance
  helpers have no remaining callers. Molecular colors, labels and measurements
  are representation content, retained independently of native informational DOM.
- New native checks observe actual glyph text/draw counts, real task/toast events,
  transient DOM absence, responsive/project lifecycle, camera, original bytes and
  exact before/after database GETs. Existing focus/theme/zoom/hit-target coverage
  replaces assertions about deliberately removed vendor controls. Test-only
  observation remains excluded from production. Cold optimization cache passes.
- Existing annotation overlap/placement is unchanged and explicitly documented;
  no collision-avoidance or new measurement algorithm claim is made.
- Complete MIT text is shipped byte-identically and documented outside the viewer.
  The narrow Git attribute preserves upstream CRLF bytes; no scientific fixture or
  dependency license is removed or rewritten. No general license audit is claimed.
- All five versions agree on0.26.2. Backend changes are version metadata only;
  scientific packages, schemas, migrations0014, tools, patches and JS lock remain.
  The inherited frontend color-mode type alias is identical to the approved base.
  Archive producer0.26.1 is retained. Actual tagged readers are required, not
  synthetic version-relabeling alone. Rollback needs no schema/data conversion.
- Patch classification follows actual compatible behavior and existing precedent;
  inherited unreleased0.26.1 changes are clearly included. No tag/release claimed
  before verified publication. Image export is independently tracked in#128;
  #97/#98/#107 remain outside scope. No deferred feature is represented as working.
- Meaningful checkpoints are preserved; the approved global PLAN is untouched.
  New decisions append to the accepted log. The user's later Closes#96 guidance
  supersedes the plan's initial no-auto-close convention and is recorded explicitly.

Merge requires completed candidate qualification, current base/version and actual
review/protection checks. Publication additionally requires exact merged-master
qualification, annotated tag/release/asset readback and accurate issue close-out.

Follow-up after candidate1: reviewed the complete additional test-only diff.
The annotation observer reads the plugin after awaiting synchronization, returns
no annotations while a replacement is still mounting, and retains a hard failure
for feedback stimulation without a plugin. Each responsive crossing must create
a replacement engine before waiting for all four annotations. No blanket catch,
assertion removal, timeout/exclusion change or production modification is added.
The failed invocation/trace is retained; a fresh clean complete gate is required.

Consequential follow-up: the retained trace exposed React deferring a nested root
unmount during the parent's commit. A fail-first regression proves plugin-before-
canvas cleanup. The corrected helper queues one idempotent microtask, unmounts the
root outside that commit, and disposes context in finally afterward. Immediate
engine invalidation remains. Native tests reject the exact React warning; there
is no diagnostic suppression. Candidate2 is interrupted and retained, not qualified.
Review the final focused/full evidence before claiming this finding resolved.

Focused repair qualification resolves the ordering finding:374 frontend and
static/build/audits pass; native5/1existing exclusion passes with no React root
warning on both-layout remounts/project switches. Lazy adapter cancellation and
microtask ordering are reviewed. Full release qualification is still separate.

Further consequential qualification finding: candidate3 loses one mobile native
residue expansion. The original trace has no unexpected reload but no camera-event
telemetry. A deterministic regression reproduces the same failure mode with actual
projection-only updates and two camera events, physically identical snapshots and
trusted input. The adapter's unconditional gesture reset is now guarded by the
full physical SDK snapshot; real camera/drag/wheel/scene/mode invalidation remains.
No renderer upgrade, canonical membership/math/fixture/deadline/exclusion change.
The test-only entry enables cold dependency scanning; production remains excluded.
Review final focused/full evidence before marking this finding resolved.

Camera-event repair focused evidence resolves that defect:374 frontend and all
static/build/audits pass; cold native28/8existing exclusions passes with four
actual-jitter records (two true projection updates/two events/identical physical
snapshots) and exact trusted-input expansion. Drag/wheel/scene/mode invalidation
and full native camera snapshots remain; no canonical membership/math/state or
renderer pin change. Actual tagged/current readers pass both ways. Complete
candidate and exact-master gates are still required before merge/publication.

Final candidate 117c35480586edffc2bb1cc72a06df934e0b59b8 passes all twenty release commands: 1,262 Python (zero skips), 374 frontend, 12 supervisor/policy and 352 browser passes / 62 exactly unchanged exclusions. All 595 source identities, lossless log hashes, unchanged exclusions and actual tagged reader roots/versions verify. No automatic retry. This does not replace external review or the exact-master gate.
