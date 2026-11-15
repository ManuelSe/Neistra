# C3 primary complete-diff review

Reviewed the complete execution/outcome delta over C2 `b67ab74c`, including all
new modules, compatibility aliases and boundary tests. This is primary implementer
self-review. Scoped architecture/performance assessments supplement it; the final
seven-role implementation gate remains separate.

Input capture owns a short session and closes it before awaited work. A spawned
child receives immutable artifact identities and a private manifest, without ORM
or publication responsibility. Control messages are bounded descriptors; staged
path/type/size/hash checks, normalized parsing and response encoding run off-loop.
The generic no-change branch avoids artifacts/history/floor changes. Pure summary,
selection, protection, appearance and report extraction preserve existing callers.
Legacy module aliases and the coordinate-publication lock wrapper remain available.

The final fresh session acquires the neutral project lock before authoritative
reads, checks revision/artifact/entry lock/allocation floors and publishes one
existing command without awaiting. The response derives from the captured committed
project rather than rereading a later revision. Only the verified staged file moves
into canonical storage; source uploads remain immutable. C1's conditional structure
GET and required projection identity survive both integration patches.

One active child, one preview waiter, deadlines, sampled process-tree RSS and
graceful/kill/reap cleanup bound execution. Cancelling an awaited capture/load thread
drains its owned work before removing files or releasing admission. Acknowledged
process-group ownership survives a fast root exit. A real Chromium AbortController
through the development proxy reaps an uncooperative child and leaves project and
artifact bytes unchanged. Failed harness endpoint/response-shape attempts remain
separate diagnostics. Filesystem removal refusal can leave private staging residue;
it cannot retroactively undo a committed edit or erase its saved receipt.

Optional Apply-only UUID tracking reserves bounded identity before fingerprinting.
One fingerprint slot/no queue and bounded TTL/LRU records prevent uncontrolled
tracking work; active/finishing records cannot expire. Duplicate requests never
dispatch or reset the original owner. Commit observers read already-loaded values
without queries/raises and record proof before post-commit response construction.
Saved proof survives response/read/cleanup failure. Unproven publication remains
unknown; proven nonpublication settles only after owned work. Missing/restarted/
expired/different-process records stay unknown. Previews remain outside tracking.

Architecture independently inspects both frozen handoffs, hashes and fault tests
and returns scoped PASS. Performance independently verifies the size-probe boundary
and function continuity and returns scoped PASS with a responsiveness limitation.
The source-bound 100k probe belongs to C3a, not the later exact C3b candidate:
publication observes 200 ms and maximum loop heartbeat lag 461 ms. Health handler
time excludes scheduling delay and is not a response-latency bound. No universal
capacity, strict-host, aggregate-memory or completely unstalled-loop claim is made.
Keep the shared synchronous publication boundary; no writer-reservation redesign
is justified by this single observation.

The exact integrated C3 run passes 177 Python cases, Ruff/default mypy218 and all
42 focused native cases: 40 passes/two exact preceding exclusions, zero failures,
flakes, retries or new exclusions. All 731 scoped source identities remain unchanged
through all five steps, and every lossless log hash verifies. Earlier frontend
lint/types/772 tests/build evidence is reused on unchanged frontend sources.

The compact client must still implement preview-only busy retry, submitted-attempt
ownership and the reviewed unknown-outcome continuation workflow. C4/C5, full old
reader qualification, final candidate/exact-master gates and all seven final
same-candidate assessments remain pending. No application push or release readiness
is asserted by this checkpoint review.
