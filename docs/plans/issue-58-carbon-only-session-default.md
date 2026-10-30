# Issue #58 — Carbon-only coloring default

## 1. Status, metadata, and approved outcome

**Status:** implemented and validated on the feature branch; publication pending
pull-request review and merge. The user approved the proposal on 2026-10-30 and
authorized implementation and pull-request delivery in the same instruction.

- **Issue:** [#58 — Make carbon-only coloring the default in the styling panel](https://github.com/ManuelSe/Neistra/issues/58).
- **Issue metadata at planning:** open; created and last updated 2026-10-13 at
  06:19:30 UTC; no comments, labels, assignees, or milestone.
- **Plan path:** `docs/plans/issue-58-carbon-only-session-default.md`.
- **Base branch:** `master`.
- **Inspected and actual feature-branch base:**
  `d8544d494a11e05a11883a2cb0df4e9cef43b15f`, matching `origin/master` and
  released v0.26.0.
- **Feature branch:** `fix/issue-58-carbon-only-session-default`.
- **Planned release:** patch **0.26.1**, annotated tag **`v0.26.1`**, created
  only from a verified merged `master` commit.
- **PR title:** `fix(viewer): default selection coloring to carbon only`.
- **Merge strategy:** normal merge, preserving the passing checkpoint commits.

**Core problem:** the styling panel applied a chosen color to every selected
atom by default. Conventional molecular presentation colors carbon and retains
element colors for heteroatoms, so the default required an extra click for the
common case.

**Approved outcome:** **Carbon only** is the mode when the application starts.
**All atoms** remains available and unchanged. After the user explicitly picks a
mode, that choice is remembered for the current application runtime: it survives
closing and reopening the palette, changing the selection, responsive viewer
remounts, and switching projects. Reloading the page mounts a fresh application
and restores Carbon only.

Explicitly approved scope interpretations, from the user's clarification rounds:

1. The remembered lifetime is the **current application runtime**, not durable
   storage. A page reload resets to Carbon only.
2. The memory is **global**, not per project or per entry.
3. The choice is remembered **immediately on click**, before any color is
   applied.

## 2. Authority, inspection, and assumptions

Authority order: explicit user guidance and corrections; `AGENTS.md` and accepted
decisions; existing architecture, product boundaries, schemas, and conventions;
issue problems, outcomes, and acceptance criteria; non-binding implementation
suggestions.

Inspection covered `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/PLAN.md`,
`docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`,
`docs/SELECTION_STYLING.md`, `docs/API.md`, the selection-appearance API
contract, the frontend state-ownership boundary, the existing component and
browser tests for selection styling, related issues, Git branches, tags,
releases, GitHub configuration, and all authoritative version sources.

Preserve accepted D-013 (transient UI versus persisted preference boundary),
D-046, D-052, D-054 (carbon-only color assignment semantics), and D-055 (nonmodal
palette with transient draft state).
[D-147](../DECISIONS.md#d-147--carbon-first-selection-coloring-uses-application-session-memory)
records the accepted mode lifetime and supersedes D-055 for that lifetime only.

### Baseline findings

- `SelectionColorControls` owned the mode in component-local state initialized to
  `"all"`. The control is unmounted when the palette closes, so any earlier
  choice was discarded.
- `StructureViewer` is keyed by `project.id` and the palette is conditionally
  mounted, so neither can retain a value across project switches.
- `useWorkspaceStore` is a Zustand store with `persist` to browser storage. It
  would incorrectly survive a page reload and become a durable preference.
- Carbon mode already had a complete backend contract: the appearance request
  accepts `color_mode: "all" | "carbon"`, and omitting it means all atoms.
- A stale cached remote branch `origin/feat/issue-58-carbon-only-default` existed
  with a one-line default flip and unrelated v0.16.0 release preparation. It was
  not reused: the one-line change does not satisfy the approved runtime memory,
  and its release commit is stale.

## 3. Requirement disposition matrix

| Issue requirement | Disposition |
|---|---|
| Carbon-only coloring selected by default when opening the styling panel | Implemented. Mode starts as Carbon only at application mount. |
| All-atom coloring remains available and works as before | Implemented. All atoms stays selectable and keeps omitting `color_mode` on the wire. |
| No other coloring behavior is affected | Implemented. Element overrides, custom color, reset, undo/redo, rendering, and scientific interpretation are unchanged. |
| Users can switch freely between the two modes | Implemented, and extended by explicit user guidance so the chosen mode is remembered for the application runtime. |

## 4. Accepted implementation scope and non-goals

In scope:

- Typed `SelectionColorMode` shared between the API request type and the UI.
- One application-owned `App` state value, threaded as required props through
  `WorkspaceCanvas`, `StructureViewer`, `SelectionStyleDialog`, and
  `SelectionColorControls`.
- `SelectionColorControls` becomes controlled for the mode and keeps its own
  transient custom-color draft.
- Focused component regressions plus one browser workflow covering panel reopen,
  selection change, project switch, and reload.
- Documentation, decision record, and all authoritative version sources.

Out of scope:

- Durable persistence of the mode in browser storage, project state, scenes,
  history, archives, or the API.
- A per-project or per-entry mode.
- Additional color schemes, opacity, labels, or presets.
- Any change to the element-override semantics accepted in D-054.

## 5. Milestones and checkpoints

**C1 — typed controlled mode (complete).** Added `SelectionColorMode`, the `App`
state value, prop threading, and the controlled control. Fail-first component
tests asserted the Carbon default and reopen memory and failed on the unchanged
source with two `aria-pressed` mismatches, then passed after implementation.
Focused component tests, the complete frontend suite, lint, type-check, and the
production build pass.

**C2 — lifecycle qualification (complete).** Extended
`tests/e2e/selection-appearance.spec.ts` with a workflow that selects All atoms,
closes and reopens the palette, changes the selection, switches to a second
imported project, verifies the mode is still All atoms, reloads, and verifies the
reset to Carbon only. Existing all-atom scenarios now click **All atoms**
explicitly so they remain valid under the new default.

**C3 — release records and complete gate (complete).** Updated
`docs/SELECTION_STYLING.md`, appended D-147, added this plan, recorded progress
and release notes, advanced all authoritative version sources to 0.26.1, and
extended the archive round-trip producer matrix with `0.26.0`. Ran the complete
documented release gate.

## 6. Data, migration, API, UI, science, accessibility, and performance

- No database migration. Alembic head remains `0014`.
- No persisted schema change. Project, viewer, and archive payloads remain
  schema 2; normalized, selection, and component schemas remain 1.
- No HTTP, job, or plugin contract change. The appearance request already
  accepted `color_mode`; All atoms continues to omit it.
- No dependency change.
- No molecular, chemical, or rendering behavior change. Carbon mode retains the
  explicit element-override semantics accepted in D-054, so selected
  heteroatoms show element colors while unrelated atoms are untouched.
- Accessibility is unchanged: the two modes remain native pressed buttons with
  their existing accessible names. The newly pressed default is Carbon only.
- No measurable performance impact. Changing the mode performs no request,
  project command, or molecular refetch.

## 7. Decisions and deviations

- D-147 records the accepted lifetime and ownership. `App` state is the narrowest
  owner that survives the project-keyed viewer replacement without becoming a
  durable user or scientific preference.
- Rejected alternatives: component-local state (destroyed on close),
  `StructureViewer` or dialog state (reset by the `project.id` key and
  conditional mount), the persisted workspace store (would wrongly survive
  reload), a new non-persisted Zustand store (unnecessary abstraction for one
  two-value preference), and module-level mutable state (non-reactive and leaks
  between tests).
- Deviation from the user's initial "code and tests only" answer: `AGENTS.md`
  requires recording material decisions and updating every authoritative version
  source, so the documentation, decision, progress, release-note, and version
  changes are included.

## 8. Version and release plan

Patch **0.26.1** from released 0.26.0. This is a compatible presentation
correction with an added transient runtime memory; no public API, persisted
contract, dependency, or scientific model changes. A minor increment would
overstate it and a major increment is unwarranted.

All five authoritative sources advance together: `pyproject.toml`, `uv.lock`
(`molweave-dev`), `apps/web/package.json`,
`apps/api/src/molweave_api/main.py`, and
`apps/api/src/molweave_api/archive_service.py` (`APPLICATION_VERSION`).
`tests/integration/test_archive_roundtrip.py` adds `0.26.0` to its accepted
producer matrix and asserts the new application version.

The annotated tag and GitHub release are created only from the verified merged
`master` commit, after review and a passing merged-state gate.

## 9. Validation environment and results

The development host runs glibc 2.31. The locked Rollup native binary requires
glibc 2.34 and the locked `openmm==8.4.0` wheel is `manylinux_2_34_x86_64`, so
the documented commands cannot execute natively here. Validation therefore ran
inside purpose-built container images against this same checkout, without
changing any locked dependency, threshold, or assertion:

- `neistra-dev:node22-python312` — `node:22-bookworm` with Python 3.12 copied
  from `python:3.12-bookworm`.
- `neistra-e2e:playwright-1.55-python312` — the pinned
  `mcr.microsoft.com/playwright:v1.55.0-noble` image with the same Python.

The locked AmberTools 24.8 environment from `tools/ambertools-linux-64.lock`
was installed to `/home/sagerch1/Dev/.neistra-tools/ambertools-24.8` and exposed
through `MOLWEAVE_AMBERTOOLS_PREFIX`, so no native scientific test skipped.

Results on the feature branch:

| Command | Result |
|---|---|
| `uv sync --frozen` | 49 packages installed |
| `ruff check .` | passed |
| `mypy apps/api packages/molweave_core` | 102 source files, no issues |
| `pytest tests/integration/test_minimization_jobs.py` | 9 passed |
| `pytest --ignore=tests/integration/test_minimization_jobs.py` | 1,242 passed, 0 skipped |
| `pnpm --dir apps/web lint` | passed |
| `pnpm --dir apps/web typecheck` | passed |
| `pnpm --dir apps/web test` | 370 passed |
| `pnpm test:dev` | 8 passed |
| `pnpm --dir apps/web build` | passed |
| `playwright test tests/e2e/selection-appearance.spec.ts` | 6 passed, 2 intentional mobile layout skips |
| `playwright test` (complete gate) | 310 passed, **34 failed**, 62 skipped, 2.1 h |

The Python gate is executed as two invocations. The test-only
`test.native_tree` plugin in `tests/support/native_job_plugin.py` declares a
2-second wall-time budget and allocates 768 MiB, and one of its parameterized
deadline cases intermittently reports `wall_time_exceeded` instead of the
expected resident-memory failure when the complete suite runs concurrently on
this host. Both orderings pass in isolation. No source, threshold, assertion, or
plugin budget was changed to accommodate this; the split is a host scheduling
accommodation and is recorded rather than hidden.

### The complete browser gate does not pass on this host

This is stated plainly: the documented complete browser gate **fails** here and
is therefore **not** qualified by this work. All 34 failures fall in eleven
wall-clock budget, native-minimization latency, or bounded-capacity spec files:
`export-archive`, `interactions`, `minimization-accessibility`,
`minimization-live`, `minimization-performance`,
`quick-minimization-performance`, `quick-minimization`, `release-hardening`,
`selection-minimization`, `sequence-viewer`, and `surface-capacity`. No
functional, semantic, accessibility, chemistry, persistence, or selection-styling
test failed, and no test touched by this change failed.

The host was running an unrelated sustained workload during qualification: load
average about 50 on 72 cores, swap exhausted at 973 MiB of 979 MiB, and the root
filesystem 96% full. `docs/PERFORMANCE.md` describes these budgets as pinned-host
regression gates rather than hardware-independent guarantees.

Pre-existence was demonstrated against the unmodified base rather than assumed:

1. The same eleven spec files on stashed-clean `d8544d49` produced **29 failed,
   42 passed, 15 skipped** in 31 minutes — the same failure signature.
2. Five candidate failures did not reproduce in that shorter base run, so the
   four files containing them were re-run on base and then on the candidate
   under matched conditions. Both produced an **identical** outcome: the same
   4 failed and 13 passed, in 3.7 and 3.8 minutes. `release-hardening`
   reported 5,185 ms against its 5,000 ms interaction budget on the unmodified
   base.

The divergence between the long and short runs is itself load nondeterminism:
individual budget tests pass or fail depending on concurrent host activity, on
both the base and the candidate. The reviewer or maintainer must run the complete
browser gate on a quiet machine before merge; this work does not claim that
result.

## 10. Merge and release blockers

1. The complete browser gate must pass on a quiet host, on the final candidate
   and again on the exact merged `master` commit. It fails on this development
   host for the pre-existing, base-reproduced budget reasons recorded in section
   9, so that gate is explicitly **not** satisfied by this work.
2. The complete diff must be reviewed and consequential findings addressed. The
   review performed here is implementer self-review; independent review is not
   claimed.
3. The pull request must document implemented, simplified, deferred, and
   rejected issue requirements and the SemVer rationale.
4. Branch protection, required checks, and unresolved conversations must not be
   bypassed. The repository currently exposes no workflows, rulesets, or branch
   protection.
5. The tag and release must come from the verified merged commit, not the
   feature branch.

## 11. Progress and completion log

- **2026-10-30 — planning.** Read the repository instructions, product
  boundaries, decisions, styling documentation, and existing tests. Confirmed
  the defect at `SelectionColorControls` and the unsuitability of every
  pre-existing state owner. Collected three rounds of user clarification on
  lifetime, scope, and timing. Proposal approved.
- **2026-10-30 — C1.** Fail-first component tests reproduced the defect, then
  the typed controlled implementation passed focused and complete frontend
  checks, type-check, lint, and build.
- **2026-10-30 — C2.** Added and passed the cross-project and reload browser
  workflow; updated existing all-atom scenarios for the new default.
- **2026-10-30 — C3.** Added documentation, D-147, this plan, progress and
  release records, and the 0.26.1 version advance. Ran the Python, frontend,
  supervisor, and focused browser gates successfully in the container
  environment described in section 9.
- **2026-10-30 — complete browser gate.** The gate failed with 34 budget-test
  failures on this loaded host. Rather than report that as a pass or relax any
  assertion, pre-existence was demonstrated against the stashed-clean base and
  then confirmed with a matched like-for-like re-run that produced identical
  results on base and candidate. Section 9 records the exact counts; the gate
  remains an open merge blocker for a quiet host.
