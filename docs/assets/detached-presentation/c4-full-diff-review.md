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

Candidate3 diagnostic: a responsive-remount pixel read can race the browser's media
source replacement and observe videoWidth0. The helper previously threw inside
expect.poll rather than reporting readiness; preserve that trace/snapshot. Stop
the failed run with93passes/one failure/one intentional interruption/three existing
skips/340not run. Earlier progress-tail monitoring missed this failure; replace it
with whole-log failure scanning and stop-on-first-failure full-run execution.

Correct only the test pixel sampler: atomically wait for visible, current media
with nonzero dimensions before reading actual pixels. It never returns a zero/hash
sentinel that could falsely satisfy a changed-frame assertion. Keep every raster,
color/hash, chemistry/state assertion, timeout and exclusion unchanged. All12native
presentation cases then pass, zero retry/failure (c4-frame-focus logs/report).
Production remains unchanged. Require a fresh complete clean candidate4 gate.

Candidate4 diagnostic:251browser passes precede one mobile movement setup failure;
29registered exclusions encountered and157not run. The global error is the
intentional stop-on-first-failure notice. Retained trace proves the reload project
GET started at2590046.177ms and took391.706ms, while Apply query began at2590208.743ms.
The query therefore ran with project data pending. Acknowledgement alone was not
a sufficient setup precondition. Explicitly await the current visible/loaded viewer
status before selecting, then retain all existing error/coordinate/revision checks.
Both desktop/mobile variants pass three deliberate repetitions each (6total, zero
failure or automatic retry). No application, timeout, exclusion or scientific
assertion changes. A complete clean candidate5 remains mandatory.

Final clean candidate 663c5fa passes all 24 steps:1,333 Python (zero skips),392 frontend,
14 supervisor and364native browser passes, with62 unchanged baseline exclusions and
12 approved desktop-only presentation cases excluded on mobile. All 713 source
identities and lossless log hashes verify. Actual tagged 0.27.0 readers pass both
ways, both suffixes accepted. Schema/dependency/migration and production/license
checks pass. No unresolved consequential local finding. Review covers final test
preconditions; no application/scientific behavior or assertion relaxation was used
to obtain the pass. Rechecked origin/master remains e6d8f63, normal merge enabled,
unprotected/no rulesets, automatic branch deletion disabled, no 0.28 tag/release.
PR review/conversation policy and exact merged-master qualification remain required.
