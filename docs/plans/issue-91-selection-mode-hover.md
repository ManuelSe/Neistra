# Issue #91 — Hover previews that match picking mode

## 1. Status, outcome, and authority

**Status:** approved implementation contract; C0 planning persistence only.
Implementation has not started.

**Approval:** the user's “Implement the plan.” on 2026-10-20 approves the complete
proposal and its explicit C0 stop ready for `/goal`. This approval authorizes
planning persistence, not implementation or the subsequent delivery lifecycle.

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
- **Next action:** after the verified C0 commit/push handoff, stop on the clean
  feature branch and await `/goal` for M1/C1.
