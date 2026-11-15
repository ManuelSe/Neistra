# C1 primary complete-diff review

Scope: the complete C1 intended change from authorized C0 `82d41588`, including
new source/tests and checkpoint evidence. This is primary implementer self-review,
not independent human approval or the final seven-role application assessment.

Reviewed the structure API/schema/error boundary, shared query factory/client read,
every production projection consumer, coordinate cache, all changed/new frontend
and API regressions, native observer harness and request audits/interceptors.
The API captures one artifact and entry identity before reading its bytes; a stale
condition returns 409 before artifact access. Legacy current reads retain explicit
response identity. The client validates both identities before cache insertion,
passes AbortSignal and keeps one common artifact-keyed query contract.

Coordinate seeds receive the new identity and explicit provisional state. Complete
chemistry/provenance, sequence inputs, interaction inputs and edit controls require
verified complete data; viewer continuity remains disposable. Query-aware endpoint
matching preserves request-count oracles. Native observation reads the installed
model's element table, rather than merely echoing the normalized source.

The held C→N read/Undo/release/Redo regression verifies server, cache-backed controls,
real native element identity and unchanged original bytes. Independent API tests
cover identity/legacy reads, history transitions, mismatch-before-read and a mutable
pointer changing after immutable capture. Other coverage checks shared observers,
project retirement, missing/wrong identities and coordinate provenance refresh.

Two consequential verification findings were corrected: exact C/Cl locator matching
in the new test, and redundant StrictMode HTTP dispatch after signal consumption.
The latter has a real component negative control and the unchanged native one-read
oracle. Late-response fixtures now await real dispatch before simulating retirement.
No original molecular, request-count, capacity, timing or exclusion assertion is
weakened. Complete final focused execution has unchanged source and zero failures,
flakes or retries; earlier incomplete attempts remain diagnostic.

All intended additions use neutral repository terminology. Dependency versions,
portable schemas, migration head, originals, global plan and molecular editing
algorithms remain unchanged by C1. C2's scientific method clarifications are recorded
in the feature plan and append-only decisions; its implementation remains isolated.

No unresolved consequential C1 finding remains after these checks. Remaining work
includes C2 integration, execution/cancellation/publication, torsion/fragments,
compact workflow/UI, actual reader compatibility, complete candidate/exact-master
qualification and final all-seven same-candidate review. C1 is a local checkpoint;
application implementation is not ready to push at this stage.
