# Issue #140 evidence

C1 corrects stick geometry, no-op history, reset scope and selection styling
feedback/recovery. [Checkpoint receipt](c1-checkpoint.json) records commands,
environment, changed application/test source hashes and qualification limits.

- [Native log](c1-native.log.gz): 11 passes, 5 existing layout exclusions.
- [Desktop fixture](c1-desktop.png) and [mobile fixture](c1-mobile.png).
- [Failed overlap attempt](c1-palette-overlap-failed-trace.zip), deliberately
  separate from the successful corrected invocation. Additional summary rows
  covered the viewer-controls Close action. Compact legends and launcher
  clearance fixed the real interaction; no force-click or assertion reduction.

The complete frontend gate passes 520 tests, lint/types and build. Python focused
qualification passes 27 cases, full Ruff and mypy (201 sources). A semantic
legend-markup correction also passes 20 focused UI tests/lint/types. Scientific
and architecture checkpoint assessments pass; final all-seven review and full
candidate/exact-master release gates remain pending. Existing renderer bundle
size warning and portable timing policy remain; no strict timing claim is made.

All screenshots/traces use repository fixtures and isolated test data, not user
molecular uploads. This folder does not establish C2–C7 completion.
