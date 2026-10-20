# Issue #91 — Hover previews that match picking mode

## 1. Status, outcome, and authority

**Status:** approved implementation contract; M1/C1 and M2/C2 implemented and focused-qualified; M3/C3 final-version release
qualification in progress under the explicit `/goal` authorization.

**Approval:** the user's “Implement the plan.” on 2026-10-20 approves the complete
proposal and its explicit C0 stop ready for `/goal`. This approval authorizes
planning persistence, not implementation or the subsequent delivery lifecycle.
The subsequent `/goal` on 2026-10-20 authorizes implementation and the complete
verified delivery lifecycle in this contract.

| Item | Planned value |
|---|---|
| Issue | [#91 — Make hover highlighting match the active selection mode](https://github.com/ManuelSe/Neistra/issues/91) |
| Issue state at C0 | Open |
| Persistent plan | `docs/plans/issue-91-selection-mode-hover.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked base | `2852e21295429b014287c7fd86c4467fa6bf7268` |
| Feature branch | `fix/issue-91-selection-mode-hover` |
| PR title | `fix(viewer): align hover previews with picking mode` |
| Release | Stable **0.22.1**, annotated tag **v0.22.1** |
| Merge strategy | Normal merge commit, preserving passing checkpoint commits |

**Outcome:** scientists can preview the entity targeted by ordinary picking
without changing their selection, camera, molecular data, or project state.

Two product choices are confirmed:

- Hover and ordinary clicks share target resolution, including a narrow
  Residue-mode correction for complete individual nonpolymer components.
- Hover previews the active-mode entity. It does not preview Shift ranges,
  toggle results, or subtraction results.

Authority follows the user's stated order: explicit user guidance and corrections;
repository instructions and accepted decisions; existing architecture and product
boundaries; issue problems/outcomes/constraints; nonbinding technical suggestions.
Existing decisions D-002, D-018–020, D-037, D-042, D-044–045, D-096, and D-120–123
constrain the work. [D-124](../DECISIONS.md#d-124--shared-picking-targets-and-viewer-local-hover-ownership)
records the accepted hover ownership decision. Preserve historical decisions and
the global [plan](../PLAN.md).

Inspection covered AGENTS.md, PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS,
VERIFICATION, architecture, normalized/project schemas, HTTP APIs, migration head,
jobs, application selection ownership, viewer/renderer implementation, tests,
related issues #90/#94/#95, local and remote branches/tags/releases, PR conventions,
GitHub workflow/protection settings, authoritative versions, and release tooling.

### Inspection findings

- Mol* 5.11.0 defaults its interactivity granularity to `residue`. Neistra's
  setter currently changes only its own picking field.
- Click handling normalizes Mol* loci separately. Existing application indexes
  already resolve normalized residues and individual components.
- Canonical selection belongs to the transient application store. Hover can
  remain entirely inside the viewer adapter.
- Active surface objects use highlight markers too; hover cleanup must preserve
  their activation.
- Project/viewer/archive schemas are **2**; normalized/selection schemas are
  **1**; Alembic head is **0014**.
- Contrary to the brief's premise, remotely verified releases already extend
  through stable [v0.22.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.22.0).
  Its tag targets `28d3a9bb59c6e786e0586ae589f0e0ebfee7678a`; current master
  additionally contains its documentation audit.
- No GitHub Actions workflows, repository rulesets, master protection, open PRs,
  or automated release script were found. Recheck before delivery.
- The proposed plan path, branch, and tag were unused before C0. The C0 ref check
  reconfirmed that the remote branch and v0.22.1 tag were absent.
- Focused baseline validation passed **28 frontend tests and 24 Python tests**.
  This establishes existing behavior, not completion of #91.

## 2. Requirement disposition and implementation contract

### Requirement disposition

| Significant requirement or suggestion | Classification | Treatment |
|---|---|---|
| Atom hover highlights one directly hit atom in proteins and small molecules | Essential | Resolve element-level hits without residue expansion. |
| Protein Residue hover includes backbone and side-chain atoms | Essential | Use complete normalized residue membership. |
| Small-molecule Residue hover includes its complete individual component | Essential | Use existing assigned nonpolymer component membership, including explicit component atom IDs. |
| Avoid neighboring residues, other ligands, or the containing complex | Essential | Preserve canonical residue/component boundaries. |
| Chain and Structure previews match ordinary clicks | Essential | Share existing target semantics between both paths. |
| Moving between entities updates the preview | Essential | Replace the previous transient target. |
| Empty space, viewer exit, and mode changes clear previews | Essential | Clear immediately and invalidate cached targets. |
| Hover never changes selection or emits selection events | Essential | Dedicated visual path; no selection-store calls. |
| Existing selection remains marked after hover clears | Essential | Keep highlight and selection marker operations separate. |
| Complete-molecule click alignment where renderer grouping differs | Supporting; explicitly approved | Apply the same narrow Residue resolver to ordinary clicks. |
| Reuse component hierarchy and `componentAtomIds()` semantics | Supporting | Reuse indexed equivalent membership rather than repeated full scans. |
| Set native granularity to fix everything | Rejected as a complete solution | This alone cannot guarantee component membership, lifecycle cleanup, or hover ownership. No follow-up for this approach. |
| Separate hover from persistence and project mutations | Already satisfied architecturally | Preserve and explicitly verify the boundary. |
| Preserve camera, movement, surfaces, and visibility | Essential | Retain existing ownership and rendering contracts. |
| Avoid competing highlight handlers and repeated work within one entity | Supporting | One molecular hover owner; cache the resolved target within the current scene generation. |
| Unit and real-viewer coverage | Essential | Assert exact membership, native markers, and state independence. |
| Modifier-aware range/toggle/subtract previews | Deferred by confirmed scope | Requires separate visual semantics and application state integration. No follow-up issue now; create one only if requested. |
| Configurable hover colors or gesture profiles | Optional; omitted | Existing distinct highlight/selection colors suffice. No follow-up needed. |
| Component hierarchy and sequence UI expansion | Deferred | Existing [#94](https://github.com/ManuelSe/Neistra/issues/94) and [#95](https://github.com/ManuelSe/Neistra/issues/95) retain this work. |
| Geometry-based molecule discovery or reclassification | Rejected as proposed | Conflicts with canonical component authority and uncertain chemistry. No follow-up for this approach. |

No unresolved product decision remains.

### Target resolution

Implement one internal viewer target-resolution path used by hover and ordinary
structural clicks:

- **Atom:** retain existing element-level atom and bond-endpoint picking. A
  direct atom hit targets exactly that atom; a bond hit retains its existing
  endpoint semantics.
- **Residue, protein:** target the complete normalized residue.
- **Residue, assigned nonpolymer:** target its existing individual ligand, water,
  solvent, ion, or other-heterogen component.
- **Other residue targets:** retain existing native residue normalization.
  Ambiguous classification does not authorize molecule expansion.
- **Chain and Structure:** preserve existing click-normalization semantics and
  use them identically for hover.
- For multi-atom hits, resolve the union of applicable targets; never choose an
  arbitrary first atom.
- Preserve canonical IDs, alternate-site identities, hidden membership, and
  entry boundaries.

Rendering highlights only existing visible representations. Resolving complete
membership must not reveal hidden atoms, load hidden entries, create geometry,
or change visibility.

### Hover ownership and lifecycle

In `apps/web/src/viewer/MolstarEngine.ts`:

- Replace Mol*'s default molecular `HighlightLoci` behavior with one adapter-owned
  hover subscription and marking provider. Retain label, camera, focus, and
  selection behavior.
- Pass explicitly resolved loci to the highlight manager with automatic
  granularity expansion disabled. Keep programmatic selection marking exact.
- Preserve the existing distinct highlight and selection colors.
- Clear transient hover on empty or unsupported hits, viewer exit, window blur,
  mode change, structural synchronization, coordinate presentation changes,
  navigation start, movement ownership changes, and disposal.
- Ignore hover while pointer buttons/navigation or movement ownership are
  active, or the requested scene generation is not bound.
- After clearing, the next valid hover sample resolves against the current
  scene. Do not synthesize clicks or selections.
- Managed surface hits retain their existing object-selection path and do not
  become molecular hover targets. Restore active surface highlighting after
  transient marker removal where necessary.
- Unsubscribe all listeners and remove the marking provider during disposal.

Reuse immutable normalized/hierarchy membership indexes. Cache the current
resolved entity and loci by generation and mode; moving among atoms of the same
entity must not rematerialize membership or repeat marker updates. Invalidate
caches with their owning scene.

### Interfaces and implications

| Area | Contract |
|---|---|
| Internal types | A typed private resolved target carries its identity and canonical references; no Mol* objects enter application stores. |
| Public APIs | No HTTP, WebSocket, job/plugin, or `MolecularViewer` public-interface addition. |
| Data and migrations | No durable hover field, migration, schema change, molecular rewrite, or original-file change. |
| UI | Existing picking controls remain; update selection guidance to explain entity-only previews and bond semantics. |
| Scientific | Reuse existing classification and identity. No connectivity inference, molecule reconstruction, protonation, or chemistry validation changes. |
| Accessibility | Hover is supplementary. Preserve keyboard selection paths, focus, themes, and existing summaries; avoid hover-driven live announcements. |
| Performance | No requests, serialization, jobs, surface recomputation, or React/store updates per hover. Preserve existing performance budgets. |

## 3. Milestones and checkpoints

Every checkpoint records its commit, acceptance results, exact commands, evidence,
deviations, limitations, blockers, and next action in this feature plan. Project
progress stays concise in [PROGRESS](../PROGRESS.md).

### C0 — Persist the approved contract

**Outcome:** approved planning documents are committed on the dedicated branch;
implementation has not started.

After explicit approval and when write execution is permitted:

1. Confirm a clean working tree; fetch origin; update local `master` using
   fast-forward only.
2. Reconfirm clean state, base identity, and branch/path/tag availability.
   Reassess any material upstream change before proceeding.
3. Create `fix/issue-91-selection-mode-hover`.
4. Create the approved feature plan as the first branch change, recording
   approval and actual base SHA.
5. Add a concise planning summary to `docs/PROGRESS.md` and append the material
   hover decision to `docs/DECISIONS.md`, marking implementation pending.
6. Check documentation links, approved scope, unchanged global plan, and
   `git diff --check`.
7. Commit exactly `docs(plan): add approved plan for issue 91`.
8. Push if remote access is available and verify the remote branch SHA.
9. Report path, branch, commit, milestones, and patch release impact.
   **Stop ready for `/goal`.**

No implementation, version bump, PR, issue publication, tag, or release occurs
in C0. Rollback is a documentation revert.

### M1 / C1 — Shared, exact picking targets

**Outcome:** ordinary picks use one reusable target resolver; complete nonpolymer
membership is corrected where native residue grouping differs.

**Affected areas:** viewer target mapping, indexed selection membership, click
integration, focused tests.

**Acceptance criteria:**

- Exact references for all four modes.
- Protein residue and individual ligand boundaries remain separate.
- Explicit component-only atoms are included for assigned nonpolymers.
- Sparse IDs, alternate locations, multi-atom bond hits, ambiguous
  classifications, and multiple entries behave deterministically.
- Existing modifiers, double-click expansion, range anchors, camera neutrality,
  and surface-object clicks remain correct.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  viewer-picking-targets selection-gestures viewer-interaction viewer-adapter
.venv/bin/uv run --frozen pytest \
  tests/unit/test_components.py tests/scientific/test_component_classification.py
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-click-selection.spec.ts \
  tests/e2e/selection-gestures.spec.ts
```

**Documentation/migration:** record exact targeting semantics, decision
implementation note, and progress. No migration.

**Expected commit:** `fix(viewer): share canonical picking targets`.

**Rollback:** revert resolver and click integration together; existing persisted
selections remain valid.

### M2 / C2 — Transient native hover previews

**Outcome:** hover matches the active-mode target and clears reliably without
changing selection.

**Affected areas:** Mol* behavior configuration, hover marking/lifecycle, surface
marker preservation, native browser tests.

**Acceptance criteria:**

- Direct atom, protein residue, standalone molecule, complex ligand, Chain, and
  Structure previews have exact expected membership.
- Switching entities, modes, and scenes cannot leave stale markers.
- Hover emits zero selection events and preserves current selection, range
  anchor, camera, project revision/history, artifacts, and original bytes.
- Persistent selection and active surface highlighting survive hover removal.
- Drag/navigation/movement ownership suppresses hover appropriately.
- Repeated samples within one resolved entity avoid redundant expansion and
  marking.
- Mount/dispose/remount leaves no duplicate subscriptions.

Add `tests/e2e/viewer-hover.spec.ts` using trusted pointer movement and test-only
native observations.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  viewer-hover viewer-picking-targets viewer-interaction viewer-adapter surface-objects
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-hover.spec.ts \
  tests/e2e/surface-objects.spec.ts \
  tests/e2e/selection-visibility.spec.ts \
  tests/e2e/interactive-selection-transform.spec.ts \
  tests/e2e/viewer-transform-toolbar.spec.ts
```

**Documentation/migration:** update selection guidance and verification evidence;
record lifecycle and surface coexistence decisions. No migration.

**Expected commit:** `fix(viewer): align transient hover with picking mode`.

**Rollback:** revert hover configuration, subscription, provider, and cleanup
together. Data needs no conversion.

### M3 / C3 — Qualification and release preparation

**Outcome:** reviewed, compatible, release-ready fix with final-version evidence.

**Affected areas:** native workflow/performance/accessibility tests, compatibility
qualification, documentation, version sources.

**Acceptance criteria:**

- Complete clean candidate gate passes.
- Actual tagged v0.22.0/current compatibility passes both directions.
- Both themes visually distinguish hover and selection; overlap restores
  selection correctly after exit.
- Existing visibility, surface, movement, live-minimization, responsive-remount,
  touch, keyboard, and actual browser zoom gates pass.
- No consequential unresolved diff findings or unexplained failures, retries,
  or exclusions.

**Focused validation:**

```bash
.venv/bin/uv run --frozen pytest \
  tests/integration/test_saved_selections.py \
  tests/integration/test_archive_roundtrip.py
corepack pnpm --dir apps/web test
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/viewer-hover.spec.ts \
  tests/e2e/release-hardening.spec.ts \
  tests/e2e/export-archive.spec.ts
```

Run the complete release gate below before opening and before merging the PR.

**Documentation/migration:** update user guidance, verification,
accessibility/performance evidence, development compatibility notes, release
notes, progress, and feature log. Confirm unchanged schema versions and migration
head.

**Expected commits:** substantive `test(viewer): ...` / `docs(viewer): ...`,
followed by `chore(release): prepare v0.22.1`. No empty checkpoint commits.

**Rollback:** restart/reload the previous qualified runtime; no downgrade or data
stripping. This restores its earlier hover behavior.

After each implementation milestone, also run relevant lint, type-check, full
frontend tests, production build, and the listed browser regressions. Fix failures
before proceeding.

## 4. Acceptance and verification evidence

### Required scenarios

Use exact canonical sets and native marker membership, not counts or screenshots
alone:

- Standalone SDF/MOL ligand and a protein–ligand complex with multiple individual
  ligands.
- A protein residue containing backbone and side-chain atoms.
- Explicit component atom membership outside native residue grouping.
- Multiple chains/entries, sparse identities, alternate sites, hidden hydrogens,
  isolated atoms, and selection-specific representations.
- Hover over an unselected entity, an already-selected entity, and an entity
  overlapping a partial selection.
- Empty space, viewer exit, mode changes, blur, queued rebuilds, topology
  replacement, coordinate previews, remount, and disposal.
- Surface activation followed by molecular hover and exit.
- Modifier-held hover remains entity-only; existing modifier clicks and range
  anchors remain unchanged.

Real-viewer tests must use trusted input. Read-only raster/marker observation may
confirm hit identity and results; it must not inject hover results or replace
native input. Check the production build excludes test harnesses.

### Complete release gate

Run on a clean final-version candidate and again on the exact remotely verified
merged commit, with the [locked AmberTools environment](../../tools/README.md)
and bounded native thread settings:

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

The data-directory placeholder must be replaced by a fresh task-specific absolute
path, never a live project directory. Set `MOLWEAVE_AMBERTOOLS_PREFIX` to the
qualified installation, `OPENBLAS_NUM_THREADS=1`, and `OMP_NUM_THREADS=1`.
Record isolated Playwright ports/data paths when defaults are occupied. Native
scientific skips are not acceptable release evidence.

Also verify five-version consistency and run the existing
`tests.support.selection_reader_qualification` harness with actual tagged
v0.22.0 modules and final 0.22.1 modules in separate processes, both
producer/reader directions, using fresh disposable data. Its `produce` and `read`
commands require `--data-dir`, `--evidence`, `--implementation-root`, and
`--expected-version`; select the corresponding actual API/core/plugin roots
through PYTHONPATH. Assert module provenance, originals, normalized artifacts,
named selections/scenes, surfaces, generic history/jobs, and archives. Version
strings alone are insufficient evidence.

Preserve existing 1STP import, minor-interaction, longest-task,
zero-repeat-request, movement, surface, and minimization budgets. Record hover
timing and redundant-update observations without inventing broader throughput
claims.

Store source identities, commands, environment, exit codes, counts, lossless logs,
timings, screenshots, compatibility results, and review findings under
`docs/assets/selection-mode-hover/`. Keep diagnostics distinct from final passing
evidence.

## 5. Version, delivery, and completion

### Release classification

**Patch 0.22.1** is appropriate:

- The change corrects the existing promise that picking follows the active
  granularity.
- The approved click adjustment makes Residue picking honor existing individual
  component membership.
- It introduces no public operation, new scientific capability, incompatible
  API, persisted representation, or archive format.
- A minor increment would overstate this bounded correction; a major increment
  is unwarranted.
- Existing stable 0.x releases and complete qualification support a stable
  patch, not a prerelease.

Update all five authoritative sources in the implementation PR:

- `pyproject.toml`
- Root `molweave-dev` package version in `uv.lock`
- `apps/web/package.json`
- FastAPI version in `apps/api/src/molweave_api/main.py`
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Update current-version assertions and archive provenance coverage without
upgrading dependencies. Recheck remote release availability before preparation;
a collision requires a recorded plan amendment.

### PR, merge, and issue strategy

- Target `master` with the planned PR title and use a normal merge commit.
- Document implemented behavior, click alignment, simplified implementation
  suggestions, deferred/rejected scope, compatibility, limitations, and evidence.
- Include `Closes #91`; reference #94/#95 without closing them.
- No new follow-up issue is required for this scope. Newly discovered independent
  defects require a separate issue; approved-scope failures must be fixed here.
- Incorporate upstream changes safely and rerun affected checks. Any runtime
  change after qualification invalidates the affected evidence.
- Review the complete diff and distinguish implementer self-review from
  independent review.
- Respect all protections, required reviews/checks, and unresolved review
  conversations discovered at delivery.

### Merge and release blockers

Block for incorrect target membership; hover-driven selection, anchor, camera,
project, or molecular mutation; stale markers or callbacks; surface/visibility/
movement regressions; unexpected schema/API/dependency changes; failed validation;
unexplained skips/retries; performance regressions; incompatible archives/history;
version/tag collisions; consequential unresolved findings; or missing required
approvals.

Release additionally requires the complete exact-merged-commit gate. A material
scope or architectural change requires a plan amendment.

### Publication and cleanup

After separately authorized implementation:

1. Verify the merge remotely and fast-forward local master.
2. Qualify the exact merged commit.
3. Create and push annotated `v0.22.1` from that commit.
4. Publish and remotely verify the stable GitHub release and evidence.
5. Use release-note sections: **Fixed behavior; Picking details and limitations;
   API/data compatibility and migrations; Verification; Follow-up work**.
6. Verify issue closure and publish a final reply linking PR, release, evidence,
   scope decisions, and remaining follow-ups.
7. Record publication through the existing documentation-audit convention
   without moving the runtime tag.
8. Verify documentation integration, then delete only the completed feature/
   qualification branches or worktrees and finish on clean master.

## 6. Progress and completion log

This document records approval, C0 commit/push, each checkpoint, final candidate
gate, actual-reader qualification, review, PR/merge, exact-master gate,
tag/release, issue reply, and branch cleanup. Unperformed events remain pending.

- **2026-10-20 — Inspection and product choices:** complete. The user explicitly
  chose shared hover/click complete-molecule targets and entity-only hover.
  Read-only exploration found a clean master, actual stable release history
  through v0.22.0, unchanged schema head0014, and no proposed path/ref collision.
- **Baseline verification:**
  `corepack pnpm --dir apps/web exec vitest run src/test/viewer-interaction.test.ts src/test/viewer-adapter.test.ts src/test/selection-gestures.test.ts src/test/component-hierarchy.test.tsx src/test/surface-objects.test.ts`
  passed **28 tests in 5 files**;
  `.venv/bin/uv run --frozen pytest tests/unit/test_selection.py tests/unit/test_components.py tests/scientific/test_component_classification.py`
  passed **24 tests**. These are existing-behavior checks, not feature acceptance.
- **2026-10-20 — Approval and C0 preparation:** the user approved the complete
  proposal with “Implement the plan.” Clean local master was fetched and
  fast-forward-checked against origin/master at
  `2852e21295429b014287c7fd86c4467fa6bf7268` (already up to date). The planned
  feature branch was created. This plan was the first file change. The concise
  project summary and append-only D-124 record accepted scope with implementation
  pending. No version, schema, dependency, application, or test change.
- **C0 documentation verification:** metadata/branch/base and documentation-only
  checks passed for exactly these three documents; the decision log is
  append-only, the global plan and all five version sources are unchanged, and
  99 local Markdown links plus the D-124 anchor resolve. `git diff --check`
  passed. These are documentation checks, not feature acceptance.
- **C0 publication:** the exact planning commit, push, and matching remote SHA
  verification form the C0 handoff. Its final response reports the verified
  commit; locate the initial plan commit with
  `git log --diff-filter=A --format=fuller -- docs/plans/issue-91-selection-mode-hover.md`.
  No implementation, PR, issue response, tag, or release belongs to this handoff.
- **M1/C1, M2/C2, M3/C3:** pending; no implementation started.
- **Candidate/actual-reader qualification, PR/review/merge, exact-master gate,
  tag/release, issue response, branch cleanup:** pending and separately authorized.
- **Known limitations:** the current hover bug remains; baseline tests do not
  qualify the planned fix. Modifier-outcome previews and #94/#95 UI work remain
  outside this contract.
- **Blockers:** no external blocker identified. Await `/goal` after C0 handoff.
- **C0 handoff and implementation authorization — 2026-10-20:** planning commit
  `6d82b925e2d68a7e9f0e90ce09e61ee2c4339712` was pushed and its remote SHA verified;
  the tree was clean. The explicit `/goal` now authorizes M1–M3 and verified
  review/merge/publication/issue-response/cleanup. Earlier pending C0 entries are
  historical; implementation and qualification progress is appended below.


### M1/C1 — Shared exact picking targets, 2026-10-20

- [Gate](../assets/selection-mode-hover/c1-gate.json) passes 31 focused and
  299 total frontend tests, 7 Python classification/domain tests, ESLint,
  TypeScript, production build and diff checks; 16 native desktop/mobile
  workflows pass with 2 existing intentional layout exclusions, no retries.
  Runtime/test/tool hashes remain unchanged throughout qualification.
- Shared adapter resolution preserves native Atom/Chain/Structure targets and
  uses indexed canonical protein residues/assigned nonpolymer components in
  Residue mode. Explicit component atoms, sparse IDs, mixed bond operands,
  ambiguity fallback, multi-entry identity and cached same-component targets
  have focused exact-reference assertions. Existing native toggle/range/double-
  click, saved-selection reload and camera-neutral tests pass unchanged.
- Local full-checkpoint diff review found no consequential issue, dead path,
  chemistry inference, molecular mutation, migration or API/dependency change.
  This is implementer self-review. The existing lazy-bundle advisory remains.
- Updated selection guidance. Hover remains unimplemented; M2/C2 and final
  performance/actual-reader/release qualification remain pending. No blocker.
  Next: commit this passing checkpoint, then M2/C2 transient hover ownership.

### M2/C2 — Transient native hover, 2026-10-20

- [Complete checkpoint gate](../assets/selection-mode-hover/c2-complete-gate.json)
  passes 301 frontend tests (including 25 focused tests), ESLint, TypeScript,
  production build, diff check and 58 native browser workflows /4 intentional
  exclusions (three desktop-hover cases on touch and one existing layout case).
  No failures/retries; runtime/test/tool bytes remain unchanged during the gate.
- One adapter-owned molecular highlight provider/subscription uses exact shared
  targets. Native equality avoids repeated Atom/Chain/Structure expansion; indexed
  canonical residue/component targets avoid repeated membership materialization.
  Mark counters stay unchanged across same-entity samples. No selection/store,
  request, persistence, chemistry or visibility mutation is introduced.
- Native tests verify both themes, complete residue/component targets, hidden
  membership, partial-selection overlap/restoration, entity-only modifier hover,
  original/project/selection/anchor/camera invariance, mode/exit/empty/blur/tool/
  coordinate/rebuild cleanup, old-generation refusal, and remount disposal.
  Atom screenshots were visually inspected: pink hover and green selection remain
  distinguishable in both themes. Final overview screenshots are after hover exit.
- Local [checkpoint review](../assets/selection-mode-hover/c2-review.md) records
  projection-jitter and old-root marker-clear corrections and diagnostic runs.
  These earlier failed runs are not acceptance evidence. Native surface tests
  now observe processed hits and initial worker readiness, retaining exact
  object/camera/selection/no-recalculation assertions. A controlled old/current
  fixed-delay test comparison is recorded before final release qualification.
- D-124 append-only notes and architecture, selection, accessibility/performance
  guidance are updated. No migration/schema/API/dependency/version change.
  Existing lazy Mol* bundle advisory remains. Automation-inclusive hover timings
  are observations, not native latency or production throughput claims.
- M3/C3 final-version compatibility, complete candidate/master gates and
  publication remain pending. Next: release preparation after checkpoint commit.

### M2 review amendment — native synchronous-read correction

The original no-dependency-change expectation is superseded only for a locked
Mol*5.11.0 package patch (no version upgrade/new dependency). [D-125](../DECISIONS.md#d-125--finish-pending-native-pick-reads-for-synchronous-clicks)
records why this is necessary to preserve approved surface interactions. This
changes implementation, not the approved product outcome or scientific scope.
Earlier complete M2 evidence predates the correction and must be repeated.

[Controlled comparison](../assets/selection-mode-hover/c2-surface-comparison-gate.json)
used the exact tagged renderer and original fixed80ms test in an otherwise
identical stack:3/3 baseline passes,2/3 candidate passes (one empty click).
[Extended baseline](../assets/selection-mode-hover/c2-surface-baseline-extended-gate.json)
passed10/10. The original fixed80ms native surface scenario is restored, keeping
its strengthened actual-camera observation. A processed-hover readiness wait
alone is not accepted as a regression fix. Failed comparison logs/trace remain
diagnostic evidence, not a passing qualification.

The narrow patch completes pending/failed native readbacks on synchronous clicks;
resolved-buffer reuse and dirty-scene native render/read remain. Add exact
regression tests for all four paths, frozen-install validation, repeated original
surface clicks, and rerun the complete M2 gate. Follow-up tracks eventual upstream
incorporation/removal; no unrelated feature or chemistry change is accepted.

### Corrected M2/C2 final checkpoint qualification

- [Final corrected gate](../assets/selection-mode-hover/c2-final-corrected-gate.json)
  passes29 focused/305 frontend, lint/types/build/diff and58 native browser cases
  /4 intentional exclusions; zero failures/flakes/retries, all source/patch/lock
  hashes unchanged. [Browser audit](../assets/selection-mode-hover/c2-final-corrected-browser-summary.json)
  retains individual results, exclusions and4 JSON attachments. Production build
  excludes test harnesses; all eight lossless gate log hashes verified.
- [Ten original-timing surface cases](../assets/selection-mode-hover/c2-readback-qualified-gate.json)
  pass. [CommonJS negative control](../assets/selection-mode-hover/readback-negative-control.json)
  demonstrates original unread pending/failed paths and corrected behavior; ESM
  unit tests assert those paths plus resolved reuse/dirty render-read.
- [Final local review](../assets/selection-mode-hover/c2-review.md) has no remaining
  consequential finding. Earlier M2 gates are historical pre-correction evidence.
  The final checkpoint supersedes the readiness-only test accommodation. D-124/125
  and architecture, selection, accessibility/performance guidance are current.
- No migration/schema/HTTP/public viewer API, scientific inference or dependency
  version upgrade. The pinned package correction is explicit. All five application
  versions remain0.22.0; next is M3/C3 stable patch0.22.1 release preparation.

### M2 commit/push and M3 preparation

- M1 `572e36139e03165bd9ef73134c30b56b3e8ab111` and corrected M2
  `c8a9c6e09b212f5dcb9850b4133ae7634cbc614d` are pushed on the planned branch;
  remote head verified at M2, working tree clean before release preparation.
- Created/verified [#107](https://github.com/ManuelSe/Neistra/issues/107) solely
  for upstream readback-patch maintenance/removal on future renderer upgrades.
  Current functionality is fixed; no approved scope is deferred to that issue.
- Fetched origin/master, still2852e21. Actual releases remain through0.22.0 and
  v0.22.1 is unused. Patch0.22.1 remains appropriate for existing behavior fixes,
  without public/scientific/persisted incompatibility.
- All five authoritative version sources now consistently0.22.1. Archive coverage
  adds the preceding0.22.0 manifest label. README, development/rollback guidance
  and release notes are prepared; focused final-version qualification is running.
  Actual tagged0.22 API/core/plugin provenance checks95 source files. No migration
  is added; existing head0014 and schema versions remain.

### M3/C3 focused release preparation

- [Final-version focused gate](../assets/selection-mode-hover/c3-focused-gate.json)
  passes35 Python saved-selection/archive tests,305 frontend, Ruff, ESLint,
  TypeScript, build/diff and12 browser cases /8 intentional layout/pointer
  exclusions, zero failures/flakes/retries; source/patch/lock hashes unchanged.
- [Browser summary](../assets/selection-mode-hover/c3-focused-browser-summary.json)
  retains individual results/exclusions and3 JSON attachments. Both-theme axe,
  keyboard/responsive controls, exact hover and deterministic archive workflows
  pass. Pinned1STP1001 atoms: import/viewer863ms, interactions4091ms, longest
  observed task628ms, zero repeated structure reads; unchanged budgets pass.
- Local release-preparation diff review confirms exactly five version updates,
  preceding archive-version coverage and user/development/release/progress docs.
  No dependency upgrade, migration, schema or public API change; pinned native
  correction remains explicit. All local plan/guide links and diff checks pass.
- Next: commit `chore(release): prepare v0.22.1`, then complete clean candidate
  gate including actual tagged0.22/current0.22.1 producer/readers both directions.
  No release or PR is claimed yet. Existing lazy-bundle advisory remains.

### Final review correction — duplicate camera publications

- The first candidate19dac96 passes frozen/fresh0014/version/static/1,108 Python/
  305 frontend/8 supervisor/build and actual0.22↔0.22.1 reader gates. Its browser
  run was deliberately interrupted for a consequential local review finding:
  native projection-jitter callbacks reached application React/camera stores
  despite unchanged CameraState. It is **not** complete candidate evidence.
- [Negative control](../assets/selection-mode-hover/c3-camera-negative-gate.json)
  observes8 extra callbacks (11→19) on first trusted hover, while exact camera
  equality still passes. Preserve failure logs/trace as diagnostic evidence.
- Deduplicate native camera publications by the existing application snapshot.
  Keep actual camera changes and immediate initial subscriber snapshots. This
  implements the approved no-application-state-update hover boundary without
  product/API/schema/scientific expansion. D-124's append-only note records it.
- Native hover now asserts zero additional camera publications. Focused camera,
  selection, surface, movement/remount, accessibility/archive regressions precede
  a new committed clean candidate, labeled `c3-final-candidate`. First interrupted
  candidate evidence is retained separately. No release/merge is claimed.

### Camera-publication correction checkpoint

- [Expanded gate](../assets/selection-mode-hover/c3-camera-gate.json) passes29
  focused/305 frontend, lint/types/build/diff and83 native browser cases /11
  intentional layout/pointer exclusions, zero failures/flakes/retries. It includes
  camera, gestures, surfaces, visibility, transforms, remount, accessibility and
  archive workflows. Source/patch/lock bytes remain unchanged. Pinned1STP:879ms
  import/viewer,4034ms interactions,637ms longest task, zero repeated reads.
- The new exact native hover assertions observe **zero** additional application
  camera publications across all four modes in both themes. The retained negative
  control fails on the old source with8 duplicates while exact pose equality
  passes. Actual camera navigation, initial subscription and remount remain valid.
- [Blur addition](../assets/selection-mode-hover/c3-blur-gate.json) passes lint,
  types/diff and3 native hover cases /3 intentional fine-pointer exclusions. The
  lifecycle blur event clears actual hover marks, preserves selection and permits
  fresh trusted-input hover; viewer exit is then qualified separately. Camera
  callback count remains unchanged. No physical window-focus certification claimed.
- Local checkpoint diff review confirms only adapter publication deduplication,
  observer/assertions, documentation and evidence. No scope/API/schema/migration/
  scientific/version expansion or unresolved consequential finding. The earlier
  candidate is superseded. Next: passing fix commit and a fresh complete clean
  `c3-final-candidate` gate, then final full-diff/evidence review and PR workflow.
