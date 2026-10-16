# Issue #58 — Carbon-only selection coloring default

## 1. Status, outcome, and authority

**Status:** implementation complete, release gates pending; ready for PR publication as 0.16.0.

- **Issue:** [#58 — Make carbon-only coloring the default in the styling panel](https://github.com/ManuelSe/Neistra/issues/58), open with no comments at approval recheck.
- **Persistent plan:** `docs/plans/issue-58-carbon-only-default.md`.
- **Approval:** user instruction “Implement the plan.” on 2026-10-16, following the complete
  proposal and confirmation of the single product choice below.
- **Base:** `master` / `origin/master` at
  `f34d4aeb52076584108e33ce3cc908ed2945049e` (v0.15.0 release closeout).
- **Feature branch:** `feat/issue-58-carbon-only-default`.
- **Proposed version:** **0.15.0 → 0.16.0 (minor)**.
- **Audience:** scientists using the Style selection palette for routine coloring.

Deliver “Carbon only” as the initial coloring mode of the Style selection palette while
keeping “All atoms” fully available and leaving every other coloring behavior unchanged.

Authority follows the requested order: explicit user guidance; repository instructions and
accepted decisions; existing architecture and product boundaries; issue outcomes;
non-binding technical suggestions. This plan does not replace the global
[PLAN](../PLAN.md). Cross-issue ownership of the remaining follow-ups is already recorded
in the [v0.15.0 release notes](../RELEASE_NOTES.md) (“carbon defaults #58”).

Inspection covered AGENTS, SELECTION_STYLING, PROGRESS, DECISIONS, RELEASE_NOTES, the
color controls component, the selection style dialog, the API appearance service and
schemas, the relevant Vitest and Playwright tests, versions, branches, and releases.

**Confirmed product choice:**

1. The palette opens with **Carbon only** selected on every open. Because the palette is a
   transient component that remounts on each open (D-055), flipping the component default
   makes the new default apply on every open; no persisted preference is introduced.

## 2. Requirement disposition

| Significant requirement | Classification | Planned treatment |
|---|---|---|
| Carbon-only coloring selected by default when opening the styling panel | Essential | `useState` default in `SelectionColorControls.tsx` becomes `"carbon"`; palette remounts on each open, so the default applies every time. |
| All-atom coloring remains available and works as before | Essential | The **All atoms** toggle stays; its requests omit `color_mode` exactly as today, preserving the all-atoms API semantics. |
| No other coloring behavior is affected | Essential | API schema, service, and persistence are untouched; carbon-mode semantics (carbons chosen color, other selected atoms element colors) are unchanged. |
| Free switching between the two modes | Already satisfied | Existing aria-pressed toggle group; no change. |
| Help text explaining carbon-mode behavior | Already satisfied | “Other selected atoms use element colors.” already shows while Carbon only is active; it now shows on open. |
| Custom color, reset, representation, hydrogen, and expand controls | Already satisfied | Unchanged. |
| Persist the user's last mode choice | Rejected as proposed | No request or issue scope; D-055 keeps palette state transient. No follow-up without a persistence requirement. |
| Charge coloring or chemistry-based defaults | Deferred | #64 and #52 remain independent; this issue changes the default mode only. |
| Remaining product ambiguities | Unclear and requiring decision: none | The confirmed choice and the two existing API modes complete the contract. |

## 3. Implementation contract and implications

### Default flip and API semantics

- Change the initial mode state in
  `apps/web/src/components/SelectionColorControls.tsx` from `"all"` to `"carbon"`.
- The request builder is unchanged: `apply` sends `color_mode: "carbon"` only while the
  carbon mode is active; omitted `color_mode` keeps the released all-atoms semantics.
  `SelectionAppearanceUpdate.color_mode` remains `Literal["all", "carbon"] | None`.
- Carbon-mode behavior at the API is unchanged: selected atoms receive the chosen color,
  then selected non-carbon atoms are recolored to `element`; atoms outside the selection
  are untouched (see `selection_style_service.py` and
  `project_service.py: update_selection_appearance`).

### Tests

- `apps/web/src/test/selection-style-dialog.test.tsx`:
  - The mixed-residue test now asserts the palette opens with **Carbon only** pressed and
    its help text visible, then explicitly switches to **All atoms** so the first swatch
    apply remains the released all-atoms request; the later explicit **Carbon only**
    interaction still exercises the carbon request.
  - The reopen/reset test asserts **Carbon only** (not **All atoms**) is pressed after
    the draft controls reset.
- `tests/e2e/selection-appearance.spec.ts` (first test only):
  - Assert the palette opens with **Carbon only** pressed.
  - Explicitly switch to **All atoms** before the two all-atoms applies whose payloads
    assert every selected atom carries the applied color.
  - The second (light/dark) test already clicks **Carbon only** before applying and is
    unchanged.
- Other specs that open the palette without depending on the initial mode
  (`pocket-surfaces.spec.ts`, `selection-styling.spec.ts`) are unaffected.

### Data, scientific, and compatibility boundaries

- **No backend endpoint, public API/type shape, database migration, job/plugin, or
  archive-format change.**
- Alembic remains 0014; project/viewer/archive schemas remain 2; normalized molecules and
  selections remain 1.
- Original uploads, normalized artifacts, atom identities, coordinates, bonds,
  classifications, history, scenes, surfaces, and archives retain their existing
  authorities.
- The change is view-only: it changes which mode is pre-selected in a transient UI, not
  what an apply request means or what is stored.

Append D-098 for the UI default and its relationship to the unchanged API contract and
D-055 transient palette state. Do not rewrite accepted decisions.

## 4. Milestones, checkpoints, and verification

Every checkpoint must be coherent, locally reviewed, documented, and committed only after
passing its checks.

### C0 — Approved planning handoff

**Outcome:** approved persistent contract on the feature branch.

- **Affected areas:** feature plan, concise project progress, appended architectural
  decision, and the one-line default flip with its required test updates.
- **Acceptance:** approval metadata, actual base SHA, confirmed choice, dispositions,
  checkpoints, release plan, and completion log recorded; the core diff is exactly the
  `useState` default plus the three test files.
- **Validation:** `git diff --check`, exact staged-file review.
- **Commit:** `feat(viewer): default selection color mode to carbon only`.
- **Migration/rollback:** none; reverting the one-line diff restores the previous default.

### C1 — Documentation, version, and release gate

**Outcome:** 0.16.0 documentation and versioning complete; full release gate passing.

- **Affected areas:** DECISIONS (D-098), SELECTION_STYLING, PROGRESS, RELEASE_NOTES,
  DEVELOPMENT, the five authoritative versions, the archive roundtrip version list.
- **Acceptance:** all five sources read 0.16.0; the archive provenance list includes
  0.15.0; docs describe the new default and its reset-on-reopen behavior; release notes
  are scoped to the user-visible default change.
- **Validation:**

  ```bash
  corepack pnpm --dir apps/web lint
  corepack pnpm --dir apps/web typecheck
  corepack pnpm --dir apps/web test
  corepack pnpm --dir apps/web build
  corepack pnpm test:dev   # or the repository's Python check entrypoints
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/selection-appearance.spec.ts
  git diff --check
  ```

- **Commit:** `docs: record carbon-only default plan, decision, and v0.16.0 release`
  (or a release-prep commit mirroring `fb099b4`).
- **Migration/rollback:** documentation-only; no durable change.

### C2 — Publication

**Outcome:** merged PR and qualified 0.16.0 stable release (only after C1).

- **Acceptance:** normal-merge PR with `Closes #58`; exact merged master passes the full
  gate; annotated `v0.16.0` tag and stable release verified remotely; issue reply posts
  the implemented/simplified/deferred/rejected scope; branch cleanup.
- **Validation:** merged-master gate commands above; tag/release/issue-state checks.

Use disposable browser/compatibility storage and available isolated ports. Retain source
SHA, environment, commands, exit codes, timing, and screenshots; separate failing
diagnostics from passing evidence; do not count unexecuted scenarios as verified.

## 5. Release, approval handoff, and completion tracking

**SemVer:** **0.15.0 → 0.16.0, minor.** A changed user-visible default is a meaningful
capability change beyond a patch fix, while the public API and persisted contracts remain
fully compatible, so no major increment is warranted.

Update all authoritative application versions together:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Add `0.15.0` to the archive roundtrip provenance list and advance its assertion to
`0.16.0`, mirroring the v0.15.0 release commit.

- **PR title:** `feat(viewer): default selection color mode to carbon only`.
- **Merge strategy:** normal merge commit, following recent PRs.
- **PR content:** approved plan, implemented behavior, dispositions, compatibility,
  evidence, limitations.
- **Closing strategy:** `Closes #58` only when all three acceptance criteria are complete.
  Link existing follow-ups (#64, #52); create no speculative duplicate issues.
- **Release notes:** Changed (default mode); Compatibility and rollback (no API/persisted
  change); Verification; Known limitations/follow-ups.
- After merge, qualify exact master before creating annotated `v0.16.0` and a stable
  GitHub release; verify peeled tag target, release state, notes, and evidence remotely.
- Never tag or release from the feature branch.

**Merge/release blockers:** failed or incomplete gates; regression of the all-atoms
request or carbon split semantics; persisted/API/schema changes; inconsistent versions;
release collision; unresolved consequential findings; unverified merged/tag target.

## 6. Progress and completion log

### 2026-10-16 — Approval and C0 implementation

- User explicitly approved the proposal by instructing “Implement the plan.” The single
  confirmed choice is the on-open carbon default with free switching to All atoms.
- Issue #58 remains open and unchanged; latest stable release remains v0.15.0. No open
  PR, planned issue branch, or v0.16.0 tag was found at approval recheck.
- Base is `f34d4aeb52076584108e33ce3cc908ed2945049e`; branch
  `feat/issue-58-carbon-only-default` created from it.
- C0 core diff: `SelectionColorControls.tsx` initial mode `"all"` → `"carbon"`, plus the
  required updates in `selection-style-dialog.test.tsx` (2 assertions) and
  `selection-appearance.spec.ts` (3 interactions/assertions). The `apply` request builder,
  API schema/service, and all other styling behavior are untouched.
- This plan, the D-098 decision, progress/release/development documentation, and the
  0.16.0 version bump accompany the C0 commit(s).
- Known limits: mode choice remains transient per D-055 (no persisted preference);
  charge/chemistry coloring stays with #64/#52.
- Blockers: none identified. Next: pass the C1 release gate, publish the PR, and
  complete release/close-out from merged master.

### 2026-10-16 — C1 release gate and PR publication

- Base SHA: `f34d4aeb52076584108e33ce3cc908ed2945049e` (= origin/master, v0.15.0
  closeout). Branch: `feat/issue-58-carbon-only-default`.
- Gate command (full release gate, run in a fresh `node:24` container, glibc 2.36;
  CPU-only, no GPU): `docker run --rm -u 0:0 -e CI=true -v <repo>:/work \
  -v gate.sh:/gate.sh:ro -w /work node:24 bash -c '...'`, where `gate.sh` performs
  `pnpm install --frozen`, `uv sync --frozen`, and `playwright install chromium`, then
  runs ruff, mypy, pytest, and the web lint/typecheck/test/test:dev/build plus the
  focused `tests/e2e/selection-appearance.spec.ts`.
- Per-step exit codes (all 0): py:ruff=0, py:mypy=0, py:pytest=0 (558 passed, 593.54s),
  js:lint=0, js:typecheck=0, js:test=0 (227 passed, 49 files;
  selection-style-dialog.test.tsx 13/13), js:test:dev=0 (8 passed), js:build=0,
  e2e:selection=0 (5 passed, 1 skipped, 3.4m). GATE_RESULT=PASS.
- Acceptance evidence: AC1 (carbon-only default on open) and AC2 (all-atoms remains
  available and works) are covered by `selection-style-dialog.test.tsx` (unit) and
  `tests/e2e/selection-appearance.spec.ts` (E2E); AC3 (no other coloring affected) by
  the unchanged API schema/service and the round-trip e2e assertions.
- e2e-timeout rationale: the first E2E test is long, multi-step, and
  canvas/WebGL/timing-sensitive under CPU-only swiftshader. Measured at ~96–120s in fresh
  `node:24` containers (focused run 1.6m; full spec 216.7s), at/over the prior 90s
  budget. Raised only line 7 of the spec from 90s to 240s (line 191, the integrated
  light/dark test, intentionally left at 90s). This is a test-infrastructure change for
  CPU-only headroom, not a weakened assertion; all assertions are intact.
- Scope deviations: none. Blockers: none.
- Next action: publish the PR (head `feat/issue-58-carbon-only-default` → `master`) with
  `Closes #58`; release/tag/close-out happen post-merge from master (C2), out of scope
  for this checkpoint.

For each later checkpoint append actual source/commit identity, commands/results,
acceptance evidence, scope deviations, blockers, and next action. Never claim an
unimplemented behavior, unrun check, or unverified remote action as complete.
