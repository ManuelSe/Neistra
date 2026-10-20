# Issue #90 — Consistent molecular selection gestures

## 1. Status, outcome, and authority

**Status:** M1/C1–M3/C3 committed; M4/C4 focused qualification passed; complete final-version release gates pending.
**Approval:** user's “Implement the plan.” on 2026-10-20, following the complete
proposal. C0 persistence stopped as required. The explicit `/goal` request on
2026-10-20 authorizes implementation and the complete verified delivery lifecycle.

| Item | Planned value |
| --- | --- |
| Issue | [#90](https://github.com/ManuelSe/Neistra/issues/90) |
| Issue title | Improve selection interactions: double-click expansion, Ctrl-toggle, and Shift-range selection |
| Issue state | Open; last update inspected: 2026-10-19T12:48:43Z; no comments at analysis |
| Persistent plan | `docs/plans/issue-90-selection-gestures.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked base | `9d56d25aa8d384109a4f11fdf3db9e0791257278` |
| Feature branch | `feat/issue-90-selection-gestures` |
| Implementation PR title | `feat(selection): add toggle, double-click expansion, and residue ranges` |
| Release target | Stable `0.22.0`; annotated tag `v0.22.0` |

**Approved outcome:** scientists can replace selections, toggle complete entities,
expand an Atom-mode pick to its protein residue or individual molecular component,
and add inclusive protein-residue ranges without disturbing the camera.

Confirmed preferences are part of the contract:

- Ctrl/Cmd toggling applies across the viewer, project browser, Components panel,
  and existing Sequence tab.
- Repeated Shift-range gestures retain the last explicitly selected residue as
  their fixed anchor.
- Residue-range gestures remain viewer-only in this issue.

Authority follows the specified order: explicit user guidance; repository
instructions and accepted decisions; existing architecture and product boundaries;
issue problems/outcomes/constraints; nonbinding issue implementation suggestions.
Accepted decisions D-002, D-018–020, D-037, D-042, D-044–045, and movement ownership
decisions constrain implementation. D-120–122 record the accepted issue #90
selection decisions, with implementation pending. Preserve previous decisions
and the global `docs/PLAN.md`.

Inspection covered the required documents, selection algebra/store, Mol* adapter
and input implementation, component derivation, molecular normalization, frontend
selection consumers, APIs, migration head, jobs, archives, tests, related issues,
GitHub settings, version sources, and release conventions.

Verified baseline:

- Working tree clean; local and remote `master` match at the recorded base.
- Stable releases already exist through **v0.21.0**, contrary to the brief's
  release-history premise. Its annotated tag targets
  `1024f46531a73f58c15d14b19dd86b923563176b`; the current base includes the later
  publication-audit merge.
- Project/viewer/archive schemas are 2; normalized/selection schemas are 1;
  Alembic head is `0014`.
- No open PRs, GitHub Actions workflows, repository rulesets, or `master`
  protection were reported. Recheck before delivery.
- Proposed feature branch and `v0.22.0` tag were unused remotely before C0.
- Focused baseline: **15 frontend tests and 20 Python tests passed**. These
  establish existing behavior, not feature or release qualification.

## 2. Requirement disposition and implementation contract

### Requirement disposition

| Significant requirement | Disposition | Treatment |
| --- | --- | --- |
| Single-click replaces at all four picking granularities | Already satisfied | Preserve and regress exact membership. |
| Unmodified empty-space click clears selection | Already satisfied | Preserve without camera movement. |
| Atom-mode double-click selects a protein residue | Essential | Resolve through normalized residue identity and protein classification. |
| Atom-mode double-click selects an individual small molecule within a complex | Essential | Select its existing component membership, never the entire complex. |
| Expanded selection replaces prior selection | Essential | Apply one canonical replacement after recognizing the double-click. |
| Component hierarchy defines molecule boundaries | Essential | Reuse existing membership, including explicit component atom membership. |
| Ctrl/Cmd toggles the complete picked entity | Essential | Remove a fully selected operand; otherwise add its complete membership. |
| Partial selections become complete on toggle | Essential | Use whole-operand containment, not atomwise symmetric difference. |
| Preserve unrelated selected atoms | Essential | Shared selection algebra handles this consistently. |
| Ctrl/Cmd toggle across existing selection panels | Supporting; explicitly approved | Apply the same rule to entry, group, category, component, chain, and residue operands. |
| Inclusive Shift-residue ranges in both directions | Essential | Use normalized residue sequence order. |
| Numbering gaps and insertion codes | Essential | Never calculate ranges from residue-number arithmetic. |
| Range in Residue mode and Atom mode after residue double-click | Essential | Track an explicit transient residue anchor. |
| Invalid/cross-boundary range falls back to additive picking | Essential | Add the ordinary active-granularity operand. |
| Shared selection synchronization | Already satisfied | Preserve the central canonical selection; test all consumers. |
| Explicit add/subtract operations remain available | Essential | Extend toggle without redefining these operations. |
| Alt subtraction, camera, drag, touch navigation, and movement ownership | Already satisfied | Preserve and regress. |
| Transient selection and anchor | Essential | No autosave, history, preference, archive, or schema fields. |
| Unit and real viewer-interaction coverage | Essential | Pure-domain, store, component, and native browser tests. |

No unresolved product decision remains. The defaults below were accepted with
approval of this plan.

### Selection algebra and modifiers

- Add `toggle` to the internal selection-operation type and implement matching
  TypeScript/Python algebra, preserving the existing parity convention.
- A nonempty operand toggles as one entity: subtract it when wholly selected;
  otherwise union it with the current selection. Empty operands are no-ops.
- Preserve canonical ordering, deduplication, stable references, and operand
  source/granularity metadata.
- Use one modifier policy across UI adapters: **Alt → subtract; Ctrl/Cmd → toggle;
  Shift → add/range; otherwise replace**. Alt wins combinations; Ctrl/Cmd wins
  over Shift.
- Group/category clicks toggle their whole materialized operand. They do not
  toggle each child independently.
- Keep existing lazy loading. Delayed panel selections must retain project/entry
  ownership and cannot apply into another project. Resolve toggle against the
  current selection when applying it.

No HTTP request or persisted selection object gains an operation-mode field.

### Double-click expansion

- Recognize **unmodified primary double-clicks in Atom mode only**.
- Continue using Mol* for hit testing and click-versus-drag recognition.
- Correlate the browser's native `dblclick` event with the two preceding accepted
  Mol* primary hits. Both hits must resolve to the same expandable target and
  current viewer generation.
- Apply ordinary single-click selection immediately; do not delay it with a
  double-click timer. The double-click subsequently replaces it with the expanded
  operand.
- Protein targets expand to the complete normalized residue.
- Assigned nonpolymer targets—ligand, solvent, water, ion, or other heterogen—expand
  to the complete individual component.
- Ambiguous/unclassified material and unsupported polymer types retain ordinary
  picking. Do not infer molecular identity from proximity, residue names, missing
  connectivity, or entry size.
- Preserve Atom-mode bond-endpoint picking. Expand a bond hit only when its
  canonical endpoints resolve unambiguously to the same eligible target.
- Empty, surface, modified, dragged, stale, or mixed-target input cannot trigger
  expansion. Preserve surface-object selection and non-primary camera behavior.
- Clear gesture correlation on navigation, ownership changes, mode changes,
  rebuilds, blur, and disposal. Listener cleanup is mandatory.

The viewer event contract gains typed gesture/raw-hit context sufficient for
application-owned resolution. Mol* objects never enter the selection store.

### Residue ranges and anchor ownership

- Keep the anchor in the nonpersisted application selection store, above
  responsive viewer remounts.
- Identify it by project, entry, current molecular artifact, protein component,
  chain, and normalized residue ID. Never derive it from sorted selected atom
  references.
- Establish an anchor through an unmodified Residue-mode selection, a Ctrl/Cmd
  toggle that adds a complete protein residue in Residue mode, or an eligible
  Atom-mode residue double-click.
- Shift and Alt gestures do not establish or advance it.
- A valid range requires both endpoints in the same entry, chain, and derived
  protein component. Separate source polymer components sharing a chain label
  must not be bridged.
- Determine the inclusive interval from the normalized residue-list order
  filtered to that protein component and chain. Do not sort by author numbers,
  insertion-code strings, atom IDs, or component display labels.
- Include all existing atoms of interval residues, including hidden atoms and
  explicit hydrogens. Do not invent absent residues or atoms.
- Atom-mode Shift-click uses whole-residue ranges only with a valid anchor.
  Otherwise retain ordinary Atom-mode additive selection.
- Preserve unrelated selections when adding ranges.
- Clear the anchor on project change, clear/replacement outside an explicit
  eligible viewer selection, picking-mode change, source-artifact change, or loss
  of complete anchor-residue selection.
- Additive/toggle/subtractive panel actions may preserve an otherwise valid
  anchor; panel clicks do not establish one in this issue.
- Responsive remounts preserve valid application anchor state; reload clears it.

### Boundaries and implications

| Area | Contract |
| --- | --- |
| Data and migrations | No migration, new durable field, molecular rewrite, or original-file change. |
| HTTP APIs and jobs | Existing endpoints and job behavior remain unchanged. |
| Internal interfaces | Extend operation types, viewer gesture context, and transient selection-store actions. |
| Scientific behavior | Reuse canonical identities/classification; no chemistry inference, reconstruction, or preparation. |
| UI | Update gesture help; preserve picking controls, camera controls, panel layouts, and existing selection summaries. |
| Accessibility | Retain keyboard-operable panel selection and explicit selection tools. Double-click is an additional shortcut, not the only expansion path. |
| Performance | Reuse indexed atom/residue/component membership; no molecular refetch per viewer gesture, whole-structure serialization, or per-residue full atom scans. |

### Deferred and rejected alternatives

These are scope boundaries, not additional requirements attributed to #90.

| Proposal | Disposition | Reason and follow-up |
| --- | --- | --- |
| Hover highlighting redesign | Deferred | Separate visual ownership problem; retain [#91](https://github.com/ManuelSe/Neistra/issues/91). No duplicate issue. |
| Expandable component residue lists and cross-panel ranges | Deferred | Requires additional navigation UI and anchor participation; retain [#94](https://github.com/ManuelSe/Neistra/issues/94). |
| New docked sequence viewer | Deferred | Independent layout/accessibility work; retain [#95](https://github.com/ManuelSe/Neistra/issues/95). |
| Dedicated touch double-tap recognition or configurable gesture profiles | Optional; omitted | Unnecessary for the requested desktop gestures. Preserve current touch behavior; no speculative follow-up. |
| Geometry-based molecule discovery or selection-time reclassification | Rejected as proposed | Conflicts with canonical component authority and scientific uncertainty. No follow-up for this approach. |
| Persisted range anchors or viewer-owned selection state | Rejected as proposed | Conflicts with accepted transient/application-owned selection decisions. No follow-up. |
| New backend selection endpoint, schema version, dependency upgrade, or general gesture framework | Rejected as proposed | Existing infrastructure is sufficient. No follow-up. |

## 3. Milestones and checkpoints

Each checkpoint must remain usable independently. Record outcome, commit, exact
verification evidence, deviations, limitations, blockers, and next action in this
feature plan. Maintain a concise current summary in `docs/PROGRESS.md`.

### C0 — Approved planning checkpoint

**Outcome:** approved documentation exists on the dedicated branch; implementation
has not started.

After explicit approval, when repository writes are permitted:

1. Fetch `origin`, confirm a clean working tree, switch to local `master`, and
   fast-forward only from `origin/master`.
2. Reconfirm clean state, base identity, branch/path availability, and
   release-target availability.
3. Create `feat/issue-90-selection-gestures`.
4. Make the approved feature plan the first changed file. Record approval date,
   actual base SHA, confirmed preferences, and pending milestones.
5. Add a concise planning summary to `docs/PROGRESS.md` and append the accepted
   material selection decisions to `docs/DECISIONS.md`, explicitly marking
   implementation pending.
6. Validate documentation links and `git diff --check`.
7. Commit exactly: `docs(plan): add approved plan for issue 90`.
8. Push if remote access is available and verify the remote branch SHA.
9. Report plan path, branch, commit, approved milestones, and minor release
   impact. **Stop ready for `/goal`.**

No version bump, implementation, PR, issue closure, tag, or release belongs to C0.

### M1 / C1 — Entity toggling across existing surfaces

**Outcome:** Ctrl/Cmd toggles correctly throughout the current UI.

**Affected areas:** shared selection algebra/types, modifier adapters, transient
store integration, project/component/sequence consumers.

**Acceptance:** all four viewer granularities; complete and partial operands;
unrelated selections; empty operands; modifier combinations; group/category
operands; lazy-loading ownership; unchanged explicit add/subtract.

**Focused validation:**

```bash
.venv/bin/uv run pytest tests/unit/test_selection.py
corepack pnpm --dir apps/web exec vitest run selection viewer-interaction project-browser component-hierarchy sequence
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-click-selection.spec.ts \
  tests/e2e/synchronized-selection.spec.ts \
  tests/e2e/structure-hierarchy.spec.ts
```

**Documentation/migration:** gesture help, decision implementation note,
progress/evidence; no migration.

**Expected commit:** `feat(selection): toggle complete entities across selection views`.

**Rollback:** revert behavior/type changes together; no data conversion.

### M2 / C2 — Native double-click expansion

**Outcome:** Atom-mode double-click selects one protein residue or individual
assigned nonpolymer component.

**Affected areas:** viewer adapter/input boundary, pure target resolution,
canonical selection application.

**Acceptance:** standalone ligand, ligand within a complex, multiple ligands,
protein residue, complete component membership, bond-hit safeguards, unsupported
classification fallback, immediate single-click response, unchanged camera, clean
listener lifecycle.

Add `tests/e2e/selection-gestures.spec.ts` for targeted native gestures and exact
expected reference sets.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run selection-gestures viewer-interaction viewer-adapter
.venv/bin/uv run pytest tests/unit/test_components.py tests/scientific/test_component_classification.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/selection-gestures.spec.ts \
  tests/e2e/viewer-click-selection.spec.ts
```

**Documentation/migration:** expansion semantics and narrow D-044 extension; no
migration or HTTP change.

**Expected commit:** `feat(selection): expand atom double-clicks to residues and components`.

**Rollback:** remove expansion handling and associated internal event context;
ordinary selection remains coherent.

### M3 / C3 — Fixed-anchor protein ranges

**Outcome:** Shift-click adds exact inclusive residue intervals in both supported
modes.

**Affected areas:** pure residue indexing/range resolution, selection store,
viewer-to-application event flow, lifecycle reconciliation.

**Acceptance:** forward/reverse/same-endpoint ranges; fixed repeated anchor;
gaps/insertion codes; sparse IDs; same-entry/chain/component boundaries; hidden
atoms; invalid/missing anchor fallback; project/edit/clear/mode/remount lifecycle;
synchronized panels.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run selection-gestures selection viewer-interaction sequence
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/selection-gestures.spec.ts \
  tests/e2e/synchronized-selection.spec.ts \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/viewer-transform-toolbar.spec.ts
```

**Documentation/migration:** anchor lifecycle, sequence-order authority, follow-up
boundaries, progress/evidence; no migration.

**Expected commit:** `feat(selection): add anchored protein residue ranges`.

**Rollback:** revert range handling/store state together; existing additive
Shift-click remains available.

### M4 / C4 — Qualification and release preparation

**Outcome:** complete feature, compatibility evidence, reviewed diff, and
release-ready PR.

**Affected areas:** workflow/performance/accessibility tests, archive/version
assertions, documentation, five application-version sources.

**Acceptance:** complete candidate gate, actual preceding-reader compatibility,
documented limitations, exact version consistency, and no consequential unresolved
findings.

**Focused validation:**

```bash
.venv/bin/uv run pytest \
  tests/integration/test_saved_selections.py \
  tests/integration/test_archive_roundtrip.py
corepack pnpm --dir apps/web test
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/selection-gestures.spec.ts \
  tests/e2e/release-hardening.spec.ts \
  tests/e2e/export-archive.spec.ts
```

Also run the complete gate below and actual tagged-v0.21.0 compatibility
qualification using existing reader helpers.

**Documentation/migration:** update selection guidance, architecture notes,
verification, performance/accessibility evidence, release notes, progress, and
feature log. Confirm unchanged schema versions/head; no migration.

**Expected commits:** substantive `test(selection): ...` / `docs(selection): ...`,
followed by `chore(release): prepare v0.22.0`. No empty checkpoint commits.

**Rollback:** application rollback requires no issue-specific migration. Qualify
data retention separately from availability of the new gestures.

## 4. Acceptance and verification evidence

Tests must assert exact canonical references, not selection counts alone.

Required scenarios include:

- Full/partial/absent operands and unrelated multi-entry selections.
- Protein–ligand complexes, multiple components, explicit component-only atoms,
  alternate locations, sparse identities, and unsupported classifications.
- Residue order deliberately differing from numbering and identity sorting.
- Duplicate residue numbers across chains/entries; separate polymer components
  sharing chain labels.
- Native single/double/modifier click sequences; empty space; surfaces;
  drag/wheel navigation; movement and temporary camera ownership.
- Project changes, responsive remounts, topology/artifact changes, clear,
  saved-selection load, and scene restoration.
- Named selections and saved scenes retaining the resulting canonical references
  while anchors remain absent from persistence.
- Keyboard panel selection, focus behavior, both themes, desktop/mobile layouts,
  and actual 200% browser zoom.

Measure representative 1STP selection interactions using existing performance
budgets: no additional normalized-structure requests after loading,
minor-interaction sequence below 5 seconds, and longest main-thread task below
750 ms. Do not weaken existing movement, surface, or minimization budgets.

Run after each implementation milestone: focused tests plus relevant lint,
type-check, build, and browser workflows. Run this complete gate before opening
and merging the PR, and again on the exact merged release commit:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-disposable-directory> .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

Use the locked AmberTools configuration and documented native-thread limits for
the complete existing scientific suite. Missing prerequisites must not become
passing skipped qualification.

Compatibility qualification must use the actual tagged v0.21.0 API/core
implementation against disposable final-v0.22.0 data/archive fixtures. Verify
original hashes, normalized artifacts, named selections, scenes, viewer settings,
generic history, and jobs remain retained. Also verify current readers accept
preceding-version archives. No claim that older releases provide the new gestures.

Retain commands, environment, source identities, exit codes, test counts, logs,
timings, compatibility results, and review findings under
`docs/assets/selection-gestures/`. Separate exploratory failures from final passing
evidence.

## 5. Version, PR, merge, and release lifecycle

### Release classification

**Stable minor `0.22.0` is appropriate.**

This adds double-click expansion and residue ranges and intentionally changes
Ctrl/Cmd selection behavior across existing surfaces. It exceeds a patch
correction. Canonical data contracts, archives, explicit add/subtract operations,
and HTTP APIs remain compatible, so no major increment is justified. Existing
stable 0.x history and a fully qualified bounded feature do not call for a
prerelease.

Update all five authoritative sources in the implementation PR:

- `pyproject.toml`
- The root `molweave-dev` package version in `uv.lock`
- `apps/web/package.json`
- FastAPI application version in `apps/api/src/molweave_api/main.py`
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Keep dependency pins unchanged. Update current-version assertions and producer
provenance expectations. Recheck remote versions before preparation; a collision
requires an explicit plan amendment.

### PR and merge

- Target `master` with the planned title.
- Use a normal merge commit to retain passing checkpoint commits.
- Safely incorporate current `origin/master`, rerun affected validation, and
  review the complete diff before submission/merge.
- PR description must identify implemented behavior, approved defaults,
  simplifications, deferred/rejected alternatives, compatibility, evidence, and
  known limits.
- Include `Closes #90`; reference #91, #94, and #95 without closing them.
- No new follow-up issue is required for the accepted scope. Record dependencies
  on the shared helpers in the final issue reply.
- Address consequential findings and unresolved review conversations. Respect
  all protections, checks, and required approvals discovered at delivery; do not
  bypass them.
- Distinguish implementer self-review from independent review.

### Merge and release blockers

Block merge or release for:

- Incorrect molecular membership, range boundaries, canonical references, or
  partial-entity toggle behavior.
- Camera/navigation/movement ownership regressions or stale asynchronous
  selection publication.
- Persisted anchors, changed originals/artifacts, unexpected schema changes, or
  archive/history incompatibility.
- Failed required validation, unexplained skips/retries, insufficient native
  browser evidence, or performance regressions.
- Version/tag collisions, unresolved consequential findings, unavailable required
  approvals, or unresolved review conversations.
- A new material product or architectural decision outside this contract.

### Publication and close-out

After separately authorized implementation and merge:

1. Verify the merge remotely and fast-forward local `master`.
2. Run the complete gate on the exact merged commit.
3. Create and push annotated `v0.22.0` only from that verified commit.
4. Publish and remotely verify a stable GitHub release.
5. Use release-note sections: **Selection improvements; Changed gestures;
   Scientific boundaries and limitations; API/data compatibility and migrations;
   Verification; Follow-up work**.
6. Verify issue closure and post a final reply linking the PR, release, evidence,
   scope decisions, and existing follow-ups.
7. Record publication evidence through the repository's documentation-audit
   convention without moving the release tag.
8. Delete feature branches only after merge, publication, and issue-response
   verification; preserve unrelated branches and finish on clean `master`.

The completion log must track approval, C0 persistence, every checkpoint, final
candidate/merged verification, PR/merge, tag/release, issue response, and branch
cleanup. Until those events occur, mark them pending.

## 6. Progress and completion log

- **2026-10-20 — Approval and C0:** user approved the complete proposal with
  “Implement the plan.” The approved proposal explicitly authorizes C0 persistence
  only and requires a stop ready for `/goal`. `origin` was fetched; clean `master`
  was fast-forward-checked at `9d56d25aa8d384109a4f11fdf3db9e0791257278` (already up
  to date). The planned feature branch was created. This plan was its first file
  change. The accompanying progress summary and appended D-120–122 document
  accepted scope with implementation pending. No scope deviation, migration,
  dependency change, authoritative application-version bump, or implementation.
- **Baseline verification (proposal):**
  `corepack pnpm --dir apps/web exec vitest run src/test/selection.test.ts src/test/viewer-interaction.test.ts src/test/sequence.test.tsx src/test/component-hierarchy.test.tsx src/test/project-browser.test.tsx`
  passed 15 tests in 5 files;
  `.venv/bin/uv run --frozen pytest tests/unit/test_selection.py tests/unit/test_components.py tests/scientific/test_component_classification.py`
  passed 20 tests. These are baseline results, not completed feature acceptance.
- **C0 documentation verification:** local-link, approved-contract metadata,
  branch/base, append-only decision, unchanged-global-plan and documentation-only
  checks passed; `git diff --check` passed. This is not feature acceptance.
- **C0 publication:** the exact required commit, push, and matching remote SHA
  verification form the C0 handoff. Locate the planning commit with
  `git log -1 --format=fuller -- docs/plans/issue-90-selection-gestures.md`;
  the final handoff reports its remotely verified identity. No PR/tag/release or
  issue-response publication is part of C0.
- **M1/C1, M2/C2, M3/C3, M4/C4:** pending; implementation has not started.
- **Candidate release gate, actual v0.21.0 compatibility, PR/review/merge,
  exact-master gate, tag/release, issue close-out, branch cleanup:** pending.
- **Known limitations:** all new gestures remain unimplemented; baseline tests
  cover existing functionality only. Deferred UI/hover work stays with #91/#94/#95.
- **Blockers:** no current external blocker. Await `/goal` before implementation.
- **Next action after the C0 commit/push handoff:** stop on the clean feature
  branch and await `/goal` for M1/C1.

### M1/C1 — Shared entity toggle, 2026-10-20

- C0 committed/pushed as `8c001e377e65c53d3364ac4dfb057f0d21e24f81`, matching
  remote SHA verified. Explicit `/goal` now authorizes implementation/delivery.
- Complete-operand toggles share modifier policy across current views; Python
  algebra matches TypeScript. Empty toggles preserve state. Existing add/subtract
  and camera ownership remain. Async entry/group picks verify current project,
  entry and artifact before applying against current selection.
- [Focused/static/build/browser gate](../assets/selection-gestures/c1-initial-gate.json):
  17 Python, 60 focused frontend, Ruff, mypy91, ESLint, types, build and diff pass;
  5 native browser workflows pass with 5 existing intentional layout exclusions.
  Native four-granularity Ctrl-off/Meta-on and panel synchronization pass.
- [Final frontend gate](../assets/selection-gestures/c1-final-gate.json): all278
  frontend, lint, types and diff pass. The broader initial frontend run exposed
  one preexisting expectation of Ctrl-add in project navigation; updated it to
  the approved toggle policy. This was an obsolete assertion, not a runtime failure.
- Checkpoint diff reviewed locally: no dead paths, inferred chemistry, molecular
  writes, migration, schema, dependency or version change. No independent review
  is claimed. Existing lazy Mol* bundle advisory remains.
- New user guidance: `docs/SELECTION_GESTURES.md`; toolbar help reflects C1.
  Double-click/ranges/compatibility/release remain pending. No external blocker.
  Next: M2/C2 native double-click expansion.

### M2/C2 — Native double-click expansion, 2026-10-20

- C1 committed as `e0769b1`. C2 resolves raw canonical picks through indexed
  normalized residues and current derived component membership, including explicit
  component atom IDs. Unclassified/unsupported targets do not expand. Native
  dblclick correlates accepted Mol* hits without timers or replacing drag detection.
- [Final C2 gate](../assets/selection-gestures/c2-final-gate.json):17 frontend,
  7 Python classification/domain tests, ESLint/types/build/diff pass;6 native
  browser cases pass /2 existing layout exclusions, in both themes/layouts.
  Exact residue/individual-ligand references include hidden H; camera/revision
  stay unchanged. [Standalone SDF supplement](../assets/selection-gestures/c2-standalone-gate.json)
  passes2 native desktop/mobile cases. No retries or failing assertions.
- Earlier [pre-review gate](../assets/selection-gestures/c2-initial-gate.json)
  passed; local review then restored the old nonmolecular-loci no-op guard during
  mapping extraction. Final gate qualifies the corrected runtime. This is not an
  independent review. Listener teardown/generation/navigation/ownership reset and
  mixed bond-hit refusal were reviewed; no consequential finding remains.
- `docs/SELECTION_GESTURES.md` documents supported expansion and fallbacks.
  No HTTP/schema/migration/dependency/version or molecular-file change. Existing
  lazy-bundle advisory remains. Ranges, performance/compatibility/release remain
  pending. No external blocker. Next: commit C2, then M3/C3.

### M3/C3 — Fixed-anchor residue ranges, 2026-10-20

- C2 committed as `4f81175`. App-owned transient anchors and typed raw-pick
  callbacks resolve against current cached molecular artifacts. Inclusive ranges
  use source residue-list order within entry/component/chain, retain unrelated
  selected atoms and hidden H, and never infer missing residues. Shift keeps its
  fixed start; unsupported/invalid targets retain ordinary additive selection.
- Store tests cover both directions, same endpoint, gaps/insertion codes, sparse
  IDs, separate components in one chain, identical chain labels, cross-entry
  fallback, Atom-mode double-click starts and lifecycle invalidation. Project
  visit epochs additionally reject old lazy picks after leaving/returning.
- [Final gate](../assets/selection-gestures/c3-final-gate.json):66 focused/290 total
  frontend, Ruff/mypy91/ESLint/types/build/diff pass;52 native browser workflows
  pass /2 existing intentional layout exclusions, no failures/retries. Native
  exact ranges, unrelated ligands, hidden H, both remount directions, reload,
  camera/movement/touch/keyboard/accessibility ownership regressions pass.
- [Local full checkpoint review](../assets/selection-gestures/c3-review.md) is
  implementer self-review, not independent approval. The initial gate had51 native
  passes and one responsive qualification failure: a cropped endpoint, then a
  projected center outside the resized native pick raster. Fitting plus a bounded
  read-only native pixel observation fixed qualification. Trusted clicks and exact
  membership assertions remain; no runtime source or threshold was changed during
  these diagnostics. Timing did not fix the raster miss.
  [Probe observations](../assets/selection-gestures/c3-diagnostic-observations.json),
  all probe logs, and initial/decisive traces remain separate from the passing gate.
- User/architecture guidance describes starts, invalidation and scope. No schema,
  migration, HTTP, dependency, authoritative application-version or molecular-file
  change. Full performance/old-reader/candidate/merged/release qualification remains
  C4. No external blocker. Next: commit C3, then M4/C4 qualification/release prep.

### M4/C4 focused qualification — 2026-10-20

- C3 committed and remotely verified at `43a49b872f841e3d613fe01c6bd1402c1e2c2bb8`.
- Added real modified-double-click/partial-residue-toggle and named-selection
  save/reload tests, exact canonical membership and transient-anchor absence.
  [Native final gate](../assets/selection-gestures/c4-native-final-gate.json)
  passes all14 desktop/mobile gesture cases, lint/types/diff, no retries/skips.
- [Focused diagnostic gate](../assets/selection-gestures/c4-focused-gate.json)
  passes33 saved-selection/archive Python and290 frontend, Ruff/lint/types/build;
  browser22 pass/5 intentional skips/1 failed mobile standalone projected hit.
  Its trace is retained separately. Only test readiness/pixel observation changed:
  await native committed scene/stable camera and confirm an actual nearby atom
  pixel before a trusted double-click. Runtime and exact membership unchanged.
- [Reader fixture qualification](../assets/selection-gestures/c4-fixture-reader-gate.json)
  passes both directions using actual tagged v0.21.0 source and the current
  preversion0.21.0 implementation. This validates the fixture, **not** final0.22
  compatibility. Original hashes, coordinates, history/jobs, surfaces, named
  selections/scenes and archive UUID remapping pass; no anchor is serialized.
- Reviewed this checkpoint's diff locally: no new production behavior beyond more
  precise protein-only help; test-only observation never alters camera/selection.
  No new migration/schema/API/dependency. Complete final-version performance,
  scientific/native, candidate/merged gates, review and publication remain pending.
