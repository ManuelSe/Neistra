# Final implementation diff review

Provenance: local implementer self-review, not independent approval. Review spans
base e6d8f63 through the issue97 implementation and final release preparation.

Reviewed bootstrap splitting, controller/window ownership and passive source bridge,
exact sender/origin/session and stale source/frame/play guards, source failures,
renderer hooks, project retirement, pointer/preview/fullscreen UI and accessibility,
unit/native workflow assertions, production boundary, compatibility and release
metadata. Cross-project state remains in existing owners. There is no child command
path, second molecular renderer, molecular request, durable presentation state,
new dependency, migration or scientific implementation. Backend changes are the two
application version literals. The lock changes only the root project version.

Consequential final finding: binding cleanup used the source generation, which can
advance after a capture exception. An unsupported capture could therefore make its
own binding release ineffective. Use a separate binding lease, retaining source
epochs for frame/state invalidation. Extend the unsupported-source regression to
assert release retires the source, while retaining the old-binding/replacement
regression. This is within approved lifecycle scope. Final focused logs and the
complete clean-candidate gate qualify the correction before PR creation.

Prior C3 review findings and diagnostic failures remain in c3-review.md. Requirement
coverage is indexed in requirements.md. Complete candidate/master gates, actual
prior-reader processes, remote review/protection/check/conversation inspection,
publication and issue receipts remain separate required evidence. No independent
review, reference-host timing or broader browser certification is inferred.

Correction verification:392frontend,6native presentation/lifecycle cases, lint,
type checking and production build pass. Focused logs are c4-review-*.log.gz.

Candidate2 diagnostic: all nonbrowser gates pass (1,333Python/392frontend/
14supervisor), then an existing movement test fails because its direct store
injection races project initialization after reload. The trace shows0selected and
correct empty-target feedback instead of the expected locked-target feedback.
Gracefully stop the already-failed run after63browser passes; one in-flight test is
interrupted and371do not run. Preserve the partial report and failing trace rather
than reporting a passing gate. Use existing UI selection/query controls and their
acknowledged summary for that case. Both desktop/mobile variants then pass with
all error, revision and coordinate invariants retained. No timeout, exclusion,
scientific assertion or production behavior changes. A new clean full candidate
is mandatory before PR creation; this is an explicit diagnostic correction, not
automatic test retry.
