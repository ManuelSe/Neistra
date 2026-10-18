# Issue #82 C3 checkpoint review

Status: implementer local full-diff self-review, not independent review or release
approval. Source SHA256 `29239343251b0d80bd9e23d9439e6e84141ba4fe3e354861eda16189726b38fe`; all12 recorded commands
ran on unchanged runtime/test/tool source. See `c3-gate.json` for exact commands,
file/environment hashes, elapsed times and lossless raw-log gzip checksums.

Reviewed all C3 routes/wire types/service/capture closure, generic-job guard,
existing molecular publication wrapper/batch, TypeScript transport/contracts,
fixtures and integration/unit tests, and documentation. Scientific engines and
native pins remain unchanged from C2. No DB/model/schema migration, new history
action kind, application version/dependency change or global project-plan rewrite.

Reviewed boundaries and addressed concerns before the gate:

- Server authority: explicit selection/context/conformer confirmation becomes
  immutable current artifact/hash capture; a generic-job request cannot bypass it.
  Cheap membership closure exposes missing protein topology without repairing it.
- Proposal/report fields and artifact/job metadata bind to the same digest/capture.
  Corrupted bytes, foreign jobs, inconsistent mask/conformer and malformed results
  reject. Apply independently checks semantic identity and no-op behavior.
- SQLite writer lock precedes dependency/retry reads. Two concurrent requests with
  independent sessions produce exactly one command. Application marker and batch
  artifacts/actions join the same commit. This does not claim to redesign all
  unrelated project-write concurrency.
- Validate every included fixed/movable dependency before publication. Exact
  dependencies allow unrelated rename/metadata/revision edits and locked fixed
  context; movable locks, changed/deleted/replaced dependencies require action.
- Multi-entry batch preserves topology and existing single-entry call semantics.
  Explicitly refuse multi-entry deletion, whose independent reference-pruning
  snapshots could otherwise overwrite another deletion's reconciliation.
- Only selected rows in captured active conformers change. Undo/Redo restores exact
  artifacts/summaries, including warnings/annotations; inactive conformers, IDs,
  source facts, metadata and original upload bytes remain exact. All-coordinate
  no-ops and later retry/Undo-then-retry create no duplicate molecular history.
- Keep per-entry provenance compact; full member lists/reports/models remain in
  durable job artifacts. Archive round-trip retains them. Historical proposals
  refuse Apply before attempting remapped dependency matching.
- Test specimen publication now carries actual supported molecular export bytes/
  format metadata rather than a fictitious source-format value. Sparse/nonfirst
  conformer specimens use the real atomic import publisher; separate tests retain
  real raw-upload/preparation/worker paths. Request-fixture mismatches were repaired
  before final focused/full gates, not relabelled as passing evidence.

Final evidence: **908 Python** including268 focused cases;255 frontend;8 supervisor;
7 existing native browser passes /7 intentional layout skips, no failures/retries.
Ruff/mypy87/lint/types/build, disposable0014 upgrade and all existing migration/
archive/legacy-cleanup/coordinate suites pass. Native scientific cases did not skip.
Existing398 Alembic warnings/lazy-bundle advisory remain.

Known limits: minimization remains operator opt-in until C4 UI/default registration.
C2's observed existing WebSocket disconnect cleanup race remains assigned to C4.
Small synthetic/C3 archive retention is distinct from actual tagged0.19.0 reader,
final producer, exhaustive scientific and prepared1STP/large-assembly/performance
qualification in C5/C6. No consequential unresolved C3 finding; no claim of complete
issue delivery, independent science review or final release readiness.
