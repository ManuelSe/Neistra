# Full-diff local self-review — issue #77

Review type: local self-review by the implementing assistant; not independent.
Range: base88a2a9d through final candidate22b28f5e71101aecaa560172b8db3909642618ba.
Contract: docs/plans/issue-77-geometry-aware-hydrogens.md; D-105/106.

Reviewed the full core/API/UI/test/documentation diff, including version sources,
legacy routes, native preview integration and generic publication/history reuse.

## Findings addressed

- Prepared-component eligibility was incorrectly reused for draft completion.
  The focused proposal service uses canonical incident chemistry and bounded
  complete contexts; no navigation/format/closed-boundary gate remains on building.
- Temporary analysis H could invent current stereo on planar neighbors or
  collinear alkenes. Retained geometry must determine orientation; regression
  probes now leave those assignments unresolved and preserve explicit building.
- Conformer disagreement needs an explicit warning even without an incoming tag.
  A universal tag is never selected from one active conformer alone.
- Repeated coordinate conversion/shared-neighbor scans and overlapping truncated
  contexts threatened scaling. Cached arrays/closure/pi summaries remove them.
  Attempted failed work, repeated conformer visits and temporary H share budgets.
- An optional zero-H report incorrectly disabled otherwise valid atom placement.
  Only standalone zero-H proposals disable Apply; component/native regressions
  cover unknown-chemistry P attachment with optional completion enabled.
- Final review found contacts between simultaneously proposed H were missed by a
  retained-only index. One combined batch index per conformer now checks both
  retained/proposed and proposed/proposed contacts, with a red-green regression.
  Warning-only contacts do not remove atoms or prevent the requested draft.

## Reviewed invariants

- Authoritative normalized state remains independent of native/viewer state.
  Original source facts/uploads, existing H/coordinates and disconnected current
  annotations remain exact; only affected current stereo may reconcile/clear.
- Automatic profile requirements and explicit-count intent are distinct. Unknown
  charges/orders are never coerced into assigned retained chemistry. Ideal lengths/
  coordination are unoptimized; no pH, tautomer, energetic or preparation claim.
- All conformers of each admitted site succeed together; active-coordinate rows,
  alternate/residue inheritance, sparse IDs and translated/mirrored frames qualify.
- Preview is pure, noncanonical and nonpickable. Apply recomputes under existing
  revision/artifact/entry/lock guards; project visit, selection, inputs, policy,
  movement/refetch/remount ownership remain captured by the shared workflow.
- Publication reuses one generic reversible command and retained allocation floors.
  No-op/unresolved requests skip publication entirely and retain Redo, counters,
  dirty state, artifacts, current warnings and revision. Database snapshots qualify
  this; recreated-entry allocation and exact original/history/archive checks pass.
- Work is bounded without random fallback, parent embedding, arbitrary chemistry
  capping, quadratic distance matrices or a new cache/job/plugin architecture.
  Complete chemical contexts and generated/analysis work have explicit budgets;
  reports retain complete reason counts despite bounded detailed diagnostics.
- Legacy selection/ligand/protein HTTP helper contracts and their negative tests
  remain intact. No new database migration, normalized/archive schema or persistent
  geometry/count constraint is introduced. Actual tagged0.17 reader qualification
  is separate from producer-version string tests and repeats with final0.18 data.
- Five authoritative application versions advance consistently to0.18.0; existing
  dependencies remain frozen. This is a minor feature release, not a persisted/API
  break or an unqualified prerelease. Global docs/PLAN.md remains unchanged.
- The approved dedicated branch and meaningful checkpoint history are retained.
  Required protections/reviews/checks must be rechecked before normal merge; no
  force push, admin bypass or early branch deletion is authorized or used.

No unresolved consequential local finding remains after the focused correction
checks. The clean final-version release gate, remote review/check audit and exact
merged-master gate remain mandatory before publication. Repository integration
review will be requested on the PR; absence of a returned review is not an
independent approval. Known limits and follow-up scope are explicit in the plan,
MOLECULAR_MODEL, editing guide and release notes.

## Final clean candidate evidence

All16 release commands pass on clean22b28f5:756 Python,252 frontend,8 supervisor,
239 native browser tests with47 intentional skips; zero failures/flakes/retries.
Frozen installs, fresh0014 migration, static/build/diff and actual0.17 reader with
final0.18 producer pass. All15 existing native performance profiles retain their
budgets. Source/log hashes, exact commands and environments are in
[candidate gate](c5-candidate-gate.json); raw artifacts are retained for publication.
Later evidence/documentation-only commits must retain every non-document source hash.

The complete merged-master gate and remote review/status/protection audit remain
required before tag/release. No independent review is claimed here.


## Post-merge release-gate correction

The first exact-master gate exposed one mobile dark API-failure accessibility
violation: the labelled host lacked a stable role while empty/native startup was
incomplete. Publication stopped. A static named region and empty-renderer/native
failure assertions address the lifecycle root cause without waiting away or
suppressing the accessibility check.252frontend/4native/lint/types/build/diff pass.
Diff self-review: one runtime role, three component assertions/comment lines and
one native assertion, plus honest failed/focused evidence. No molecular changes.
Fresh complete candidate and exact-master qualification remain required.
