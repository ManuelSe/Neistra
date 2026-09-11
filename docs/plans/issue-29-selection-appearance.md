# Issue #29 — Selection appearance

## Status and metadata

- Status: **approved; implementation active — M4/C5 release candidate**.
- Issue: [#29 — Enhance selection representation controls](https://github.com/ManuelSe/Neistra/issues/29).
- Issue created/updated: 2026-09-10; inspected and plan approved: 2026-09-11.
- Approval: the user explicitly approved the complete proposal and instructed:
  “I approve the plan. Persist it and wait with the implementation for my /goal prompt.”
- Base branch: `master`, integrating `origin/master` by fast-forward-only operation.
- Inspected and refreshed remote base: `8b68909d3b33500a130e9c9a7dae52ceda1ff8a4`.
- Local branch base: `06cae490fc9d73302a6d0891c6e0636c0a9ea376`, the user's
  separately requested `chore(git): ignore local rebranding workspace` prerequisite.
  Local `master` is one commit ahead of the remote base, not divergent.
- Feature branch: `feat/issue-29-selection-appearance`.
- Proposed release: **0.6.0**, annotated tag **`v0.6.0`**.
- This document is the implementation contract. Do not replace `docs/PLAN.md`.
- The user supplied `/goal` on 2026-09-11, authorizing implementation, verification,
  checkpoint commits, PR/review/merge, version/tag/release, issue response, and cleanup.

## Core problem and approved outcome

Scientists must currently leave the selection styling workflow to perform
distance queries, while available color and hydrogen controls act on whole
entries. Provide distance expansion, selection-local solid color, and
selection-local non-polar-hydrogen visibility inside the existing **Style
selection** dialog. Retain its existing atomic and polymer representation choices.

A scientist can select a ligand or region, open Style selection, expand to its
local environment, and apply representation, color, or hydrogen-display changes
without leaving the workflow. Display changes remain durable and reversible;
distance expansion changes only the shared transient selection.

Selection-specific surfaces are explicitly deferred. Existing entry surfaces
remain supported, including application of the accepted appearance overrides.

## Authority, inspection, and assumptions

Authority order:

1. Explicit user guidance and subsequent corrections.
2. `AGENTS.md` and accepted `docs/DECISIONS.md` decisions.
3. Existing architecture, product boundaries, schemas, and conventions.
4. Issue user problems, outcomes, constraints, and non-goals.
5. Non-binding issue implementation suggestions.

Read-only planning inspected repository guidance, PRODUCT_SPEC, PLAN, PROGRESS,
DECISIONS, VERIFICATION, architecture and schema/API documents, frontend state
and spatial-query ownership, viewer projection and pinned Mol* capabilities,
backend commands, migrations through `0009`, archive validation, generic jobs,
relevant tests, related issues #1/#7/#11/#20/#21, branches/tags/releases, PR
conventions, workflow/protection metadata, version sources, and tooling.

Findings that govern this contract:

- Atomic selection styles, Backbone, and Cartoon already exist. Inspector
  distance queries support atoms/residues and default to 4 Å. Entry-wide color,
  surfaces, and non-polar-hydrogen filtering also exist.
- Selection-local color and hydrogen visibility are additions. Relabelling
  entry-wide controls would affect unrelated atoms and fail the user outcome.
- The request's no-release-history premise is stale. Remote releases exist
  through [v0.5.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.5.0).
  PR #28 rebranded the product while deliberately retaining version 0.5.0.
- D-018/019 own canonical/transient selection; D-022/023 own durable display
  state and disposable rendering; D-042 owns archive compatibility; D-046/047
  own selection representations and hydrogen filtering.
- The rebranding no-version-change exception applies to that completed work.
  This separately approved feature has its own version increment.
- Remote inspection found no GitHub Actions workflows, repository rulesets,
  or master branch protection. Recheck these facts before delivery.
- Existing feature PRs generally use rebase merge. The rebranding merge-commit
  exception preserved its checkpoint tag and does not govern this feature.

The user approved exact-selected-hydrogen targeting, project-wide distance
expansion, the surface deferral, and the minor-release plan below. These are
resolved product decisions, not outstanding clarification requests.

## Requirement disposition matrix

| Requirement | Classification | Approved treatment and follow-up |
|---|---|---|
| Improve selection adaptation workflow | Essential | Extend the existing dialog and reuse its toolbar launcher and shared selection. |
| Toggle non-polar hydrogens for selection | Essential | Durable local overrides with inheritance and master-switch precedence. |
| Customizable distance expansion, default 4 Å | Essential | Explicit Expand action using existing worker infrastructure. |
| Matching atoms or complete residues | Essential | Both modes, seed retention, and explicit residue completion. |
| Change selection color | Essential | One solid custom color and reset to existing coloring. |
| Lines, sticks, spheres and existing atomic choices | Already satisfied | Retain established style vocabulary and replacement behavior. |
| Protein Cartoon and Backbone | Already satisfied | Retain authoritative complete-residue and trace-atom validation. |
| Selection-specific surface | Deferred | Subset geometry, neighbor context, boundaries, and cost need their own contract. Tracked in [#30](https://github.com/ManuelSe/Neistra/issues/30); no new subset-surface control here. |
| Reuse existing capabilities | Supporting | Shared commands, cache, worker, viewer adapter, dialog primitives, and tests. |
| Local hydrogen/color precedence and expansion scope | Unclear and requiring a product decision at proposal time; resolved by approval | Use the explicit semantics below. |
| Relabel entry-wide controls as selection controls | Rejected as proposed implementation | Violates locality; no follow-up needed. |

Additional color schemes, opacity, labels, presets, same-channel overlays, live
distance previews, and duplicate context menus are optional extensions outside
this contract. Do not create speculative follow-up issues for them. Ligand
designation, classification overrides, and subset export remain with #11, #20,
and #21. No docking, preparation, contact-analysis, or new job system is included.

## Accepted interaction scope

### Distance expansion

- Default to **4 Å** and matching atoms; require a positive finite cutoff.
- Use inclusive Euclidean distance from active-conformer coordinates.
- Search all entries in the current project, including hidden entries via
  intentional on-demand loading, matching existing inspector scope. State this
  scope in the UI; expansion does not make hidden entries visible.
- Atom mode adds matching atoms. Residue mode adds complete residues containing
  matches. Matching atoms without residue membership remain individual atoms.
- Retain the original seed and return canonical duplicate-free references.
- Change only the shared transient selection. Do not style automatically,
  move the camera, change visibility, or create durable history.
- Show busy/error state and support cancellation. A superseded selection,
  changed coordinates/topology, closed dialog, or changed project invalidates
  outstanding results; late results cannot overwrite newer state.
- Assume a meaningful shared Cartesian frame. Do not align structures, search
  periodic images, classify contacts, or infer a binding site.
- Preserve the inspector's existing general replace/add/subtract query behavior.

### Selection color

- Apply a validated solid `#RRGGBB` color to exact selected atom references
  through existing rendered representations, independently of style assignment.
- Reset color restores the underlying existing color scheme.
- Different selections retain different colors. Overlap replaces color only
  for newly targeted atoms.
- Cartoon and surface coloration follows atom-associated rendering primitives;
  continuous geometry does not promise atom-shaped color boundaries.

### Selection non-polar hydrogens

- Offer **Use entry setting**, **Show**, and **Hide**, with an explicit mixed state.
- Target explicit hydrogen atoms contained in the current selection. A selected
  heavy atom does not silently include bonded hydrogens. Explain when no explicit
  hydrogens are selected rather than implying a visual change occurred.
- Local Show/Hide overrides the entry non-polar preference for those atoms.
  The existing Show hydrogens master, entry/component visibility, and isolation
  remain upper bounds.
- Use the pinned Mol* connectivity classifier on the complete disposable
  projection before subset filtering. Do not add a backend polarity classifier.
- Retain the established N/O/S/F/Cl/Br/I polar-neighbor convention and existing
  connectivity warnings. Classification depends on explicit projected bonds.
- Do not generate hydrogens, infer bonds, or claim protonation or hydrogen-bond
  analysis. Hydrogen-free inputs remain hydrogen-free.

Representation, color, and hydrogen resets remain separately named. Do not
silently extend the existing representation-reset API to reset other properties.

## Data, migration, API, and ownership implications

Add two narrowly typed collections to existing entry viewer settings: color
assignments and non-polar-hydrogen overrides. Use stable atom IDs, canonical
membership, deterministic merging, and disjoint membership within each property.
Empty collections mean existing behavior. Do not replace the established
representation schema with a general layer system.

Use a dedicated revision-checked selection-appearance command to set/reset a
property. Each successful multi-entry action is atomic and undoable, with exact
before/after settings. Invalid targets and stale revisions fail without partial
changes. Existing entry-setting requests preserve new assignments when omitted
and cannot bypass their dedicated mutation path.

The additions must survive undo/redo and retained command replay; checkpoints,
recovery, reopen, duplication and named scenes; archive round trips and entry-ID
remapping; and topology deletion with transactional pruning and exact undo
restoration. Coordinate edits preserve membership. Newly added atoms receive no
inferred assignment.

Plan Alembic `0010`, subject to checking the current head before implementation.
Default legacy live/checkpoint/scene settings to empty collections and validate
old history replay. Refuse downgrade whenever any retained state, including
history, would lose non-default appearance data. Extend the same unreleased
migration coherently between the color and hydrogen checkpoints; do not claim
intermediate development schemas are released upgrade contracts.

Retain `/api/v1`, project schema 1, archive schema 1, normalized schema 1,
immutable originals, scientific artifacts, jobs, plugin identifiers, and
`.molweave.zip` compatibility names. New readers must accept supported older
data. Forward import of new appearance data by older applications is not promised.
Test authentic missing-field legacy payloads, not just changed producer strings.

TanStack Query retains server and artifact-cache ownership; current selection
remains transient application state. Mol* reconstructs appearance from settings.
Prefer Mol* overpaint for colors to avoid splitting continuous polymer geometry.
Hydrogen filtering consistently reaches inherited, selection-specific, and
existing surface representations without becoming molecular authority.

No normalized schema, chemistry, original-file, generic-job, or plugin redesign
is required. Existing molecular warnings remain visible and unchanged.

## Decisions and deviations

During implementation, append material decisions to `docs/DECISIONS.md`:

- Extend D-046's formerly deferred scope to independent durable local color and
  hydrogen properties while retaining its representation replacement algebra.
- Extend D-047 with approved exact-target local precedence, complete-projection
  classification, and retained master visibility bounds.
- Document transient project-wide seed-preserving expansion and stale-result
  ownership under D-018/019.

Allocate decision numbers from the then-current log. Do not rewrite historical
decisions or use this feature plan as their replacement. Checkpoint 0 writes
only the approved plan and project-level handoff; implementation decisions are
appended with their relevant implementation checkpoints.

Deviations from the issue's examples are deliberate: no new selection surface,
no entry-wide control masquerading as local, no automatic hydrogen attachment
expansion, no new color-scheme catalog, and no duplicate style architecture.
Material changes to the approved outcome require explicit user approval.

## Milestones and independently verifiable checkpoints

Every implementation checkpoint records evidence in this plan and updates the
concise current project summary in PROGRESS. Every milestone ends with repository
lint/type checks, relevant tests, production build, and affected browser workflows.
Fix failures before proceeding. Commit only coherent passing states, never empty
milestone commits. Validation groups are executable commands below.

| Checkpoint | Concrete outcome and affected areas | Acceptance and focused validation | Documentation, migration, commit, and rollback |
|---|---|---|---|
| 0 — Approved planning handoff | Fast-forward-only base refresh, clean-tree check, feature branch, plan persisted as first branch change. | Review against approval; `git diff --check`; verify commit and remote branch. | Plan and concise progress handoff only. `docs(plan): add approved plan for issue 29`. Stop awaiting `/goal`. |
| M1 / C1 — Expansion workflow | Shared distance orchestration/cancellation, App/inspector/dialog wiring, worker/client, selection tests. | Default/custom cutoff, atom/residue/orphan results, seed retention, scope, cancellation/stale-result protection, no durable/camera mutation. V1. | Document scientific scope/transient ownership. No migration. `feat(selection): expand selection from styling dialog`. Revert without data migration. |
| M2 / C2 — Local color vertical slice | Typed assignments, command/API, migration, history/scenes/archive, renderer and dialog. | Overlapping/multi-entry exact color; reset/history; legacy defaults/current round trip; topology pruning; camera/query invariance; rendered color evidence. V2. | Update architecture/API/schema/decision/evidence docs. `feat(viewer): add durable selection colors`. Guarded downgrade. |
| M2 / C3 — Local hydrogen vertical slice | Show/Hide/inherit records, shared command/persistence, complete-projection classifier, masks, mixed/dependent controls. Extend C2's unreleased migration. | Protein/ligand C–H/O–H fixtures, selected/unselected independence, master precedence, no-H input, inherited/exact/surface coverage, persistence/reset/molecular invariants. V3. | Record exact-target semantics, precedence and limits. `feat(viewer): add selection-local hydrogen visibility`. Guarded rollback. |
| M3 / C4 — Integrated qualification | Expand→style→color→hydrogen journey; failures; both themes; desktop/mobile; keyboard/zoom; archive/topology regression. | Shared selection, no stale updates or molecular changes, accessible controls, stable camera/request counts and existing budgets. V4. | Complete evidence, migration guidance, limits/deviations. `test(viewer): qualify selection appearance workflow`; separate `docs(viewer)` only if independently meaningful. |
| M4 / C5 — Release candidate | Consistent versions, release notes, full gate/diff review, reviewable PR. | V5 on final candidate; reconcile master and repeat affected validation after consequential changes. | `chore(release): prepare v0.6.0`. No release tag before verified merge. |
| M4 / C6 — Delivery | Approved merge, merged-commit qualification, annotated tag/release, issue response and cleanup. | Verify remote merge SHA, tag dereference, publication, issue/follow-up links and branch deletion. | Record actual evidence; later tracked closeout uses a documentation PR. Never move the release tag. |

C2 must be a complete usable color slice before C3 starts. Neither introduces
placeholder controls. Detailed implementation remains blocked on `/goal`, not
on further approval of these already accepted product decisions.

## Acceptance and verification evidence

Commands below are planned gates, not executed feature evidence. Newly named
`selection-expansion.test.tsx` and `selection-appearance.spec.ts` are planned
test artifacts. Run from the repository root with project-local Python.

### V1 — Expansion

```bash
.venv/bin/uv run pytest tests/unit/test_selection.py
corepack pnpm --dir apps/web exec vitest run src/test/selection.test.ts src/test/selection-style-dialog.test.tsx src/test/selection-expansion.test.tsx
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/synchronized-selection.spec.ts tests/e2e/selection-appearance.spec.ts
```

### V2 — Color, persistence, migration

```bash
.venv/bin/uv run pytest tests/unit/test_commands.py tests/integration/test_viewer_state.py tests/integration/test_migrations.py tests/integration/test_archive_roundtrip.py tests/security/test_archive_safety.py tests/integration/test_ligand_edits.py tests/integration/test_protein_edits.py
corepack pnpm --dir apps/web exec vitest run src/test/representations.test.ts src/test/selection-style-dialog.test.tsx src/test/structure-loading.test.tsx
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-styling.spec.ts tests/e2e/selection-appearance.spec.ts tests/e2e/export-archive.spec.ts
```

### V3 — Hydrogen

Run V2 plus:

```bash
.venv/bin/uv run pytest tests/scientific/test_release_fixture.py
corepack pnpm --dir apps/web exec vitest run src/test/viewer-controls.test.tsx src/test/focus-targets.test.ts
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/polar-hydrogen-visibility.spec.ts
```

### V4 — Integrated qualification

Run combined affected suites plus:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/release-hardening.spec.ts tests/e2e/viewer-click-selection.spec.ts tests/e2e/rebranding-zoom.spec.ts
```

### V5 — Complete release gate

Run on the final candidate and to qualify the exact merged release commit:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave-issue29-qualification .venv/bin/uv run alembic upgrade head
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

Browser qualification uses fresh isolated data and verified current services.
Set the documented `MOLWEAVE_E2E_DATA_DIR`, API/worker/web port overrides when
necessary and record exact values. Do not reuse stale servers or reset development
databases. The migration gate's data root is dedicated qualification data.
Record actual counts, intentional skips, warnings, timings, and commit IDs.

Required evidence includes exact scientific/original-artifact invariance;
durable history/recovery/scene/archive state; old missing-field payloads;
multi-entry failure atomicity; no stale asynchronous writes; and real rendered
appearance, not merely passing settings assertions. Historical test counts in
VERIFICATION/PROGRESS do not establish that this new feature passes.

## UI, accessibility, scientific, and performance implications

Reuse existing dialog/toolbar primitives, named controls, and shared selection
summary. Explain empty/incompatible targets, mixed/inherited state, master-switch
dependencies, loading, cancellation, and errors. Preserve keyboard operation,
Escape/focus restoration, both themes, supported viewport bounds and zoom.
Include scoped axe and explicit keyboard evidence; do not claim whole-product
or cross-browser certification from Chromium/Pixel 7 emulation.

Retain normalized identity and active coordinates. Distances are geometric
neighborhoods, not interaction predictions. Hydrogen display uses the established
pinned connectivity convention; missing/incorrect connectivity can affect display.
No chemistry repair, inference, preparation, periodic geometry, or meaningful
cross-entry alignment is supplied by this feature.

Keep distance work off the main thread; avoid unnecessary normalized refetches
and serializations. Reuse artifact-keyed cache entries and disposable viewer
rebuilds with camera/selection restoration. Preserve established 1STP budgets:
readiness under 30 seconds, existing minor-interaction sequence under 5 seconds,
longest observed main-thread task under 750 ms, and zero repeated normalized GETs
during those minor interactions. Retain existing reduced-detail behavior at
250,000 atoms. Do not invent new large-system throughput guarantees or expand
scope into spatial indexing without demonstrated need and an approved change.

## Version and release plan

Choose **minor: 0.5.0 → 0.6.0**. This adds user-visible functionality and durable
optional viewer settings. It is more than a patch, introduces no intended breaking
public/molecular/archive contract requiring a major increment, and has no approved
experimental limitation warranting a prerelease. Existing 0.x releases are already
non-prereleases; the rename does not reset version history.

Update all five authoritative version locations in the implementation PR:

1. `pyproject.toml`.
2. Root project version record in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update corresponding assertions and release documentation. Do not bump plugin
implementation or schema versions merely to match the application version.
Recheck the remote release/version baseline and tag availability before preparing
the release; do not overwrite an existing tag if intervening work changes it.

Release-note sections:

1. Highlights.
2. Added.
3. Selection/display semantics.
4. Scientific limitations.
5. Migration and compatibility.
6. Accessibility and performance.
7. Verification.
8. Deferred work.
9. Neistra presentation since the preceding numbered release.

## PR, merge, issue response, and branch cleanup

- PR title: `feat(viewer): enhance selection appearance controls`.
- Target `master`; use **rebase merge**, respecting all then-current protections.
- Include and identify the user's `.gitignore` prerequisite commit in the PR.
- Document implemented, reused, simplified, deferred, and rejected scope and
  link this contract, verification, and the focused selection-surface follow-up.
- Create that follow-up during delivery, after checking for a suitable existing
  issue. Specify subset/context geometry, boundary interpretation, precedence,
  persistence, resource limits, and acceptance design as its unresolved scope.
- Use `Closes #29` only after the approved bounded outcome is complete and the
  surface deferral is explicitly tracked. Do not claim all original suggestions
  shipped. Do not duplicate #11/#20/#21 or create speculative optional issues.
- Complete the full release gate before opening/merging the PR. Review the full
  diff and address consequential findings. Do not claim an independent review
  if none occurred, or bypass required reviews/checks/conversations.
- Recheck workflows, protections, rulesets, version/tag collisions and current
  master before delivery, even though none blocked the planning baseline.
- Qualify clean merged `master` at the remotely verified merged commit. Create
  annotated `v0.6.0` only there; push and dereference it to the exact commit before
  creating the release. Do not move existing tags.
- Publish scope-accurate release notes and a final issue reply with actual test
  evidence, compatibility, scientific limits and follow-up links. Verify remotely.
- Delete the feature branch only after merge, tag, release, issue response, and
  follow-up verification. Fast-forward local master before local branch deletion.
  Preserve unrelated branches and existing tags.
- Any later tracked delivery closeout uses a small documentation branch/PR and
  does not move the release tag. No delivery messages or publications occur in
  the current planning-only handoff.

## Merge and release blockers

Block merge for failed validation; molecular or original-file mutation;
incorrect selection locality, hydrogen precedence or classifier behavior; stale
asynchronous writes; persistence/history/archive loss; unsafe downgrade;
inaccessible controls; consequential performance regressions; unresolved full-diff
findings; inconsistent versions; unapproved scope changes; or unmet remote
protections, required checks/reviews, or unresolved review conversations.

Release additionally requires the exact verified clean merged commit, passing
qualification, unused tag name, consistent 0.6.0 versions, successful annotated
tag dereferencing and remotely verified publication. Do not mark final delivery
complete without the scope-accurate issue reply, surface follow-up and cleanup
evidence. An inability to publish is not evidence that publication occurred.

## Progress and completion log

| Date | State | Evidence and next action |
|---|---|---|
| 2026-09-11 | Inspected and proposed | Read-only repository/remote analysis established existing capabilities, authority, scope decisions, release history, and the detailed contract. No feature tests were run or claimed. |
| 2026-09-11 | Prerequisite committed | At the user's explicit request, committed only the pre-existing `.gitignore` exclusion for `.rebranding/` as `06cae490fc9d73302a6d0891c6e0636c0a9ea376`. Working tree clean afterward. |
| 2026-09-11 | Approved | User approved the complete proposal and explicitly required waiting for `/goal` after persistence. |
| 2026-09-11 | Checkpoint 0 prepared | Fetched origin; `git merge --ff-only origin/master` reported already up to date. Verified clean local master at `06cae49` and remote base at `8b68909`; created `feat/issue-29-selection-appearance`; persisted this approved plan as the first branch file change. Commit/push verification is reported by the handoff and identifiable from the commit containing this row. No implementation started. |

| 2026-09-11 | Checkpoint 0 verified | Plan commit `711509d3d52cbec7de10cedb374b3ace3c0123e4` was pushed and remotely verified; clean tree at handoff. |
| 2026-09-11 | M1/C1 qualified | Shared worker expansion, cancellation/load and worker context guards, canonical seed/orphan retention, project-wide hidden-entry scope, and refreshed polymer eligibility implemented. D-051 records ownership. V1: 13 Python selection tests and 10 focused frontend tests passed; full frontend suite passed 75 tests. Ruff, strict mypy (50 files), ESLint, TypeScript and production build passed. Fresh `/tmp/neistra-issue29-c1` migrated through 0009, ports 8110/8111/5273: 2 browser workflows passed, 2 documented desktop-only skips, 26.2 s. Build retains the lazy Mol* advisory (966.82 KiB gzip; initial 157.32 KiB gzip). Fixed stale pre-rename Python launchers by frozen reinstall of the same 49 packages, with no dependency change. Checkpoint diff reviewed; no schema or molecular changes. The commit containing this row is the checkpoint evidence commit. |

| 2026-09-11 | M2/C2 qualified | M1/C1 commit `0c2d12e`. Implemented independent color records, atomic revisioned command, entry-update bypass protection/legacy omission handling, exact disposable overpaint, dialog mixed state/reset, history/scenes/archive/topology reconciliation and migration 0010 including retained command/checkpoint-scene settings. D-052 records architecture. V2 passed 65 Python tests (37 existing Alembic deprecation warnings), 19 focused frontend tests, Ruff, mypy (51 files), ESLint, TypeScript and production build (initial 157.79 KiB gzip; lazy Mol* 966.92 KiB advisory). Fresh `/tmp/neistra-issue29-c2`, ports 8110/8111/5273: 7 existing browser workflows passed with 8 explained layout skips; initial new reset pixel assertion detected 2 colored orientation-axis pixels outside the molecule. Restricted the molecular-color assertion to the central canvas; the corrected new workflow passed (1 pass/1 layout skip, 17.3 s), proving actual magenta application/reset and hidden-entry persistence. No product fallback or assertion tolerance was introduced. Full checkpoint diff reviewed and diff checks passed. |

| 2026-09-11 | M2/C3 qualified | C2 committed as `2ab4c49`. Added exact-selected explicit-H preferences, full-projection native classification, independent reset/mixed/master controls, persistence/pruning and guarded migration extension (D-053). V3: 75 Python tests passed (59 existing Alembic warnings); 25 focused and 78 full frontend tests passed, including focus extension. Ruff/mypy (51 files), ESLint/TypeScript/build passed (initial 158.40 KiB gzip; lazy Mol* 967.43 KiB advisory). `/tmp/neistra-issue29-c3`, ports 8110/8111/5273, head 0010: combined V2/V3 browser run passed 15 workflows with 14 layout skips and exposed one existing scene-saving radius-zero failure. Retained valid camera across disposable rebuilds; affected scene/local-H rerun passed 3 workflows with 3 layout skips in 1 minute, completing all 16 applicable workflows across runs. Exact full-frame hashes proved unsuitable for rebuilt lighting; actual left/right hydrogen-sphere presence checks now verify C-H removal, O-H retention, local Show and master precedence on protein and ligand fixtures without relying on settings alone. Full checkpoint diff reviewed, no molecular artifacts or chemistry changes. |

| 2026-09-11 | M3/C4 qualified | C3 committed as `c47e999`. Added integrated expansion→representation→color→hydrogen journeys, intercepted revision-failure/retry, both themes and desktop/Pixel 7 keyboard/axe/control bounds, real 100%/200% browser-zoom dialog checks, exact artifact/request-count and reopen checks, and duplicate/multi-entry-failure/checkpoint/restart undo/redo evidence. V4 combined affected browser gate: 29 passed, 19 intentional layout skips, 4.3 minutes. Review found failed/pending structure loading could be described as no-H and property summary lookups could scan memberships quadratically; fixed both, with a new component regression. Renamed the unchanged representation-only reset to “Reset representation” to distinguish properties. Affected appearance/zoom/hardening rerun: 12 passed/4 skips, 1.9 minutes; representation/reset rerun: 3 passed/3 skips, 36.1 seconds. All used `/tmp/neistra-issue29-c4`, head 0010, ports 8110/8111/5273. V3 plus lifecycle: 77 Python tests passed (59 known Alembic warnings); updated legacy archive assertions reran 10 passing tests. Full frontend: 79 passed; final label focused suite: 5 passed. Ruff/mypy (51 files), ESLint/TypeScript/build and diff review passed (158.50 KiB initial gzip; lazy Mol* 967.43 KiB advisory). Reviewed the actual dark 200% screenshot. Scientific limits/migration guidance updated; focused surface follow-up [#30](https://github.com/ManuelSe/Neistra/issues/30) created and verified. No material scope deviation. |

| 2026-09-11 | M4/C5 prepared | C4 committed as `7d4e554`. Re-fetched origin and fast-forward-only base incorporation reported already current at `8b68909`. Verified no rulesets, workflows or master protection and no v0.6.0 tag/release collision; baseline remains v0.5.0. Updated all five authoritative versions and archive assertion, release notes and current README. Complete final candidate gate and final review are next; no PR/merge/release is claimed by this row. |

Future entries must record exact commits, commands, results, known warnings,
limitations, remote identifiers, blockers, and next action. Populate feature
acceptance evidence only after execution. Do not mark the PR, issue, merge,
tag, release, or cleanup complete until remotely verified.

## Completion and next action

M4/C5 release preparation is complete. Next: complete release gate and final review, then PR and delivery.
