# Issue #90 C3 checkpoint review

Implementer self-review, 2026-10-20; not independent approval.
Base checkpoint: 4f81175 (C2). Reviewed the complete checkpoint diff before commit.

- Central canonical selection remains authoritative. Raw viewer context resolves
  against current artifact-keyed cache; no gesture refetch or molecular write.
- Anchor/result publish together. Explicit starts, fixed repeated ranges,
  source-list order, hidden H and entry/component/chain boundaries are covered.
- Clear/replacement/subtraction/mode/project/artifact invalidation and responsive
  retention are covered. Project visit epochs close old-visit lazy-pick publication.
- Existing callbacks without gesture metadata remain supported. Scenes/saved
  selections do not establish anchors. No persisted shape, HTTP route, database
  migration, chemistry inference, dependency or version change.
- Qualification initially attempted a cropped endpoint after narrowing the view.
  Explicit fitting restores visibility; its floating projected center was still
  outside the native pick raster footprint. Dimension/generation/context checks
  and direct native picking show the intended atom at nearby raster samples.
  A failed 500ms timing probe did not change that result. The final test chooses
  a real native single-atom pixel within four CSS pixels, then sends a trusted
  click and independently asserts exact application references. No injected pick,
  force-click, changed application behavior or weakened membership assertion.
- Runtime/domain sources are identical between the initial diagnostic gate and
  final gate. Only the browser test and new read-only qualification helper differ.
  All probe console logs/source identities remain; initial and decisive full
  traces plus extracted intermediate observations are retained. Redundant
  intermediate trace bundles were reduced to observations, explicitly recorded
  in c3-diagnostic-observations.json.
- Final c3-final-gate.json passes all commands:66 focused/290 total frontend,
  Ruff/mypy91/lint/types/build/diff and52 native browser cases,2 existing intentional
  layout exclusions, no failures/retries. Domain ranges, remounts, both themes,
  camera/movement/touch/keyboard/selection ownership regressions pass.

No consequential unresolved checkpoint finding. Final old-reader, performance,
complete candidate/exact-master gates and publication remain C4, not established
by this review. Existing lazy Mol* bundle and Alembic advisories remain disclosed.
