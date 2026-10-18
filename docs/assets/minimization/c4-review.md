# Issue #82 C4 checkpoint review

Implementer local full-diff self-review; this is not an independent review or
release approval. Exact source identity and passing command evidence are recorded
in c4-gate.json after the milestone gate completes.

Reviewed all new context, session, immutable-source queries, proposal geometry,
workflow hook, shortcut, panel, App/viewer/job integration, default plugin
registration, WebSocket lifetime cleanup, fixtures and tests. Renderer changes
narrow an existing geometry interface without changing canonical molecular state
or introducing a second viewer state owner.

- Full canonical covalent components/chains define context;12 Å is discovery only.
  Hidden candidates are labelled and require the same explicit inclusion. Mandatory
  closure, active conformers, assembly/organic/movable limits and selected locks
  are checked before submission; the server remains authoritative.
- Captures use immutable artifact queries, never live entry data cached under an
  obsolete artifact key. Project/generation guards precede delayed submission and
  result presentation. Discard/project switches cannot resurrect a preview; later
  selection cannot retarget a draft/job. App ownership survives responsive remount.
- Ctrl+M follows explicit user steering: immediate isolated500-iteration submission,
  one captured selection, progress/report, explicit Apply. Typing/modal/modifier/
  repeat/concurrent-start guards remain. Multi-molecule selection diagnoses the
  need for an explicit environment rather than inferring physical context.
- Preview geometry validates finite selected rows, uniqueness, complete coverage
  and active conformer against immutable inputs. Native shapes remain nonpickable;
  no preview enters canonical queries, measurements, exports, IDs or history.
  Invalid preview diagnostics are surfaced. Other editing/movement/modal
  ownership clears presentation; canonical mutations clear geometry and refresh
  applicability. Server-side stale/lock/digest checks remain the final authority.
- Panel exposes prerequisites, immutable capture, inclusion/exclusion, conformers,
  progress/cancel, scientific outcome/units/warnings and explicit Apply/Discard.
  Non-convergence remains inspectable, never applicable. Historical archived jobs
  cannot preview against remapped IDs. Jobs reopens persisted work explicitly.
- Focus belongs to an explicitly opened nonmodal panel; Escape respects external
  focus and Apply, closing restores a connected trigger without stealing an
  external control's focus.44px controls, bounded scrolling and real zoom are
  exercised in native Chromium rather than CSS/pinch substitutes.
- Default registration is additive; missing native tools keep startup/editing
  available and return a visible capability diagnostic. Generic-job capture bypass
  stays refused. No schema/migration, application version or dependency changes.
- The existing jobs WebSocket now observes idle disconnect and cleans up its reader
  on expected transport-close races. Unrelated RuntimeError still propagates.
  Direct ASGI tests assert task settlement instead of allowing client teardown to
  conceal a polling leak.

Diagnostics preceding the final gate exposed test assumptions about persisted Help
state, asynchronous desktop→compact remount and case-sensitive Jobs labels, plus a
Node dynamic import incompatible with the repository test loader. Those tests were
corrected without relaxing product assertions or scientific gates. The interrupted
obsolete diagnostic run is not passing evidence. No independent review is claimed.

C5 retains independent broader science, prepared1STP/large-assembly measurements
and actual tagged preceding-reader qualification; C6 retains final-version/full
release review. Existing Alembic/lazy-Mol* advisories remain limitations.

A consequential review finding was repaired before the final gate: pending
numerical transforms could otherwise arrive after minimization capture and a
suppressed minimization preview could later reappear. Both entry points now retire
the other presentation; minimization invalidates the numerical generation before
asynchronous capture. The real App regression proves both directions. Submission/
Apply guards also read current store state rather than an older render closure.
The interrupted first gate is retained as c4-diagnostic-gate.json with lossless logs;
it is not milestone passing evidence.

Final passing source SHA256 `4b336cfd192c843920a7ad574a1ac6865692d64a59a908fe60c370d2eb683a95`. All12 commands pass:
912 Python (272 focused),265 frontend,8 supervisor,24 browser /8 intentional layout
skips, zero failures/retries and no native scientific skips. Ruff/mypy87/lint/types/
build, disposable0014 and staged diff pass. Native cancellation settles within the
asserted5sec; whole workflow time is not cancellation latency. Screenshots visually
confirm bounded readable controls. Source/log/toolchain/fixture hashes and lossless
logs are retained. No unresolved consequential C4 finding.
