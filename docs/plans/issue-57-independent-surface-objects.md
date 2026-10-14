# Issue #57 — Independent molecular surface objects

## Status, outcome, and authority

**Status:** approved implementation contract; implementation has not started.

- Issue: [#57 — Manage molecular surfaces as independent, editable objects](https://github.com/ManuelSe/Neistra/issues/57), open at planning inspection.
- Plan: `docs/plans/issue-57-independent-surface-objects.md`.
- Approval: user instruction “Implement the plan.” on 2026-10-14, following review of the complete proposal and confirmation of the four product choices below.
- Base: `master` / `origin/master` at `1c5467c7639d8152d136044d4ae208eb479c8c95`.
- Feature branch: `feat/issue-57-independent-surface-objects`.
- Target release: **0.14.0**, subject to a collision check before release preparation.
- Implementation starts only under a subsequent `/goal`. This handoff persists the approved plan, commits and pushes its branch, then stops.

Scientists should be able to identify, select, hide, remove, and restyle individual surfaces without manipulating their constituent residues or replacing another surface belonging to the same entry.

Confirmed product choices:

1. Surface selection activates object controls independently of molecular atom selection.
2. Management covers whole-entry, fragment, and pocket surfaces.
3. Appearance includes supported colors, opacity, and solid/mesh display.
4. A canonical object collection and explicitly versioned migration are acceptable. Old archives remain importable; new archives need an upgraded reader.

Authority follows the user's specified order: explicit guidance and corrections; AGENTS and accepted decisions; architecture, product boundaries, schemas and conventions; issue problems/outcomes/constraints/non-goals; then non-binding issue implementation suggestions.

Append decisions superseding the singleton restrictions in D-057 and D-066, relevant fixed-display restrictions, and the minimum-one-representation consequence of D-022. Preserve the scientific, authority, history, and lifecycle principles in D-002, D-007, D-013, D-035, D-042, and D-056–070. Do not rewrite accepted historical decisions or the global `docs/PLAN.md`.

The issue's description does not establish that surface geometry is calculated separately per residue. Current atom-owner groups support structural picking and coloring. This work changes object identity and management without treating those groups as a scientific defect.

Planning inspected AGENTS, product/global plan/progress/decision/verification documents; architecture, project and normalized schemas, API and development guidance; surface workers, runtime, native visuals, representation projection, selection/pocket controls and application-owned input loading; command/history, topology reconciliation, duplication, migration and archive paths; related issues #30, #36, #58 and #59 and the broader issue list; branches, tags, releases, recent PR conventions, workflow/protection configuration and version sources.

## Requirement disposition

| Significant requirement | Classification | Treatment and follow-up |
|---|---|---|
| Each generated surface has distinct identity | Essential | Stable entry-owned objects covering all three surface kinds. |
| Select an entire surface | Essential | Activate one object from its list row or canvas representation; highlight the complete representation without replacing atom selection. |
| Independently show/hide/remove | Essential | Reversible object commands; parent visibility remains an upper bound. |
| Multiple surfaces per entry | Essential | Separate definitions and settings; creation never unions into or replaces another object implicitly. |
| Clear parent ownership and distinguishable names | Essential | Parent grouping, kind labels, generated names, and rename support. |
| Compact management UI | Essential | One on-demand nonmodal manager using existing surface controls; no permanent layer sidebar. |
| Appearance editable after creation | Essential | Independent color scheme/custom color, opacity, solid/mesh mode. |
| Uniform, element, residue, and other existing supported colors | Supporting, accepted | Reuse existing element, chain, residue, secondary-structure, structure, and custom themes. |
| Charge coloring | Deferred | Formal charge, partial charge, and electrostatic potential require different scientific contracts. Create one focused follow-up proposing those distinctions and validation requirements. |
| “Etc.” as unrestricted themes or representations | Rejected as proposed | An open-ended renderer/theme framework adds unsupported scope. No follow-up for unspecified capabilities. |
| Scenes, saves, reloads, undo/redo | Essential | Preserve complete object definitions through all durable paths, including retained command history. |
| Existing fragment/pocket geometry and immutable originals | Already satisfied | Preserve and requalify; do not replace either algorithm. |
| Visibility, warnings, cancellation, resource limits | Supporting, mandatory | Extend existing safeguards to object identity and multiple requests. |
| General entry/component navigation redesign | Deferred to existing #59 | Keep this manager compatible with that future layout; do not implement #59 here. |
| Carbon-only styling default | Deferred to existing #58 | Preserve current atomic-color behavior. |
| Mesh export, automatic pocket discovery, area/volume calculations, arbitrary scientific profiles | Optional, excluded | Separate capabilities without evidence they are needed to solve #57. No speculative follow-up issues. |

No unresolved product decision remains for this approved contract.

## Implementation contract

### Authoritative data and commands

Introduce `ViewerSettingsV2.surface_objects`, an ordered collection of entry-local objects containing:

- Stable ID, name, requested visibility, and kind.
- Kind-specific source definition.
- Color settings, opacity, and `solid`/`mesh` display mode.

Use three explicit kinds:

- **Entry:** the entry's current molecular content, rendered through the existing native entry-surface path.
- **Fragment:** captured canonical atom IDs with the unchanged `molecular-v1` profile.
- **Pocket:** captured canonical seed references and radius with the unchanged `pocket-v1` profile and complete protein context.

New IDs use UUIDv7. Migrated IDs are deterministic from entry identity and legacy surface identity so the same object remains identifiable across live settings, scenes, checkpoints, and historical snapshots. Identity is `(entry_id, surface_id)`.

Limit the collection to **16 objects per entry**. Existing valid state has at most twelve entry representations plus two singleton surfaces, so migration accommodates all existing surfaces. Resource limits can prevent rendering without discarding saved objects.

Move legacy entry-surface representations and singleton fragment/pocket fields into this collection. Ordinary atomic/polymer representations remain in their existing channels and may become empty. Removing or hiding the last surface must not invent another representation.

Add revisioned surface commands:

- Project-level creation accepts a batch of entry-owned definitions, allowing one captured multi-entry fragment action to create one object per entry atomically.
- Entry-owned update changes name, visibility, appearance, or an explicitly replaced source definition.
- Entry-owned removal targets one surface ID.

Use existing forward/inverse viewer-setting actions and history infrastructure. Validate all targets before writes; stale revisions return 409, invalid operations change nothing, and exact no-ops create no history.

General viewer-setting updates preserve omitted surface objects and reject attempts to bypass dedicated surface commands. Historical union/subtraction actions retain their original effects through migrated before/after snapshots; new creation semantics do not rewrite history.

Topology reconciliation:

- Prune captured fragment atoms; remove an empty fragment reversibly.
- Prune deleted pocket seeds across owners and scenes; remove a pocket when no seeds remain.
- Keep an explained unavailable pocket when valid seeds remain but protein context is unavailable.
- Newly added atoms do not join captured fragments or seed sets.
- Entry surfaces and pocket protein context follow current authoritative topology.
- Preserve exact inverse state and surface affected-definition warnings.

Duplication preserves entry-local surface IDs while remapping self-references. Archive import remaps entry references, including pocket seeds, consistently across current state and scenes.

### Versioned migration and API compatibility

Use Alembic **0014**, provided that revision remains available.

Advance project snapshots/responses and portable manifests to **schema 2**. Keep normalized molecular schema 1, artifact formats, molecular exports, jobs, and plugin interfaces unchanged.

- Upgrade live settings, checkpoint entries and nested scenes, named scenes, and every documented forward/inverse viewer-settings path.
- Preserve original/normalized bytes, scientific warnings, metadata, revisions, history positions, timestamps, and checkpoint-relative dirty state.
- Traverse documented state paths only.
- Validate legacy schema-1 archives before conversion, then normalize them into schema 2.
- Write schema-2 archives exclusively. Preserve the current-snapshot archive boundary; do not export database history.
- Reject unknown schemas and conflicting mixed legacy/current definitions.

Keep `/api/v1` transport routes, with an explicit project/viewer payload migration documented in OpenAPI and API guidance. Complete project responses declare schema 2; current viewer-setting writes require their schema-2 discriminator. Obsolete singleton surface endpoints return a structured 410 migration explanation. Legacy surface-style viewer writes are rejected with actionable guidance.

This is **not** an old-client compatibility promise. Update frontend contracts and callers together; do not introduce parallel writable legacy authorities.

Downgrade prevalidates every retained location and refuses if any surface object remains or ordinary representation state cannot be represented by the previous contract. Refusal changes nothing. The supported rollback is restoration of a pre-upgrade backup containing both database and artifacts.

### Selection and compact UI

Replace selection-membership Add/Remove behavior with:

- **Create fragment:** capture the current selection and create separate objects per affected entry.
- **Manage surfaces:** open the compact manager, available whenever objects exist, including with an empty atom selection.
- Existing overflow access to pocket creation and surface help.

Route whole-entry surface creation from existing representation controls into the same command and manager.

The nonmodal manager lists objects grouped by parent entry. Each row shows name, kind, requested visibility, and concise rendering status. Only the active object expands editing controls. Provide rename, show/hide, remove, appearance controls, and explicit source replacement; pocket editing retains receptor, captured-seed, and radius behavior.

Interaction rules:

- An unmodified primary canvas hit on a surface activates that object and opens its controls without changing molecular selection or camera.
- Modified structural hits retain established molecular add/subtract semantics.
- Surface-list activation has the same object-selection effect.
- **Select source atoms** explicitly selects fragment membership, current entry atoms, or complete protein calculation context for a pocket. Label the scope and count; pocket seeds are not surface membership.
- Object activation is transient and excluded from scenes, archives, history, and dirty state.
- Clear stale activation on project changes, removal, or scene application that removes the object.
- Overlapping surfaces use the native foremost hit; the list provides deterministic access to obscured objects.

Use existing focus ownership and pending-command patterns. Preserve errors and scientific warnings under D-089. Do not claim a surface is rendered merely because its definition was saved.

### Scientific and rendering behavior

Preserve native entry geometry and both existing worker profiles. Do not unify their geometry algorithms merely to unify management.

- Fragment cut-face limitations remain explicit.
- Pocket geometry remains a crop of complete protein-context geometry using the existing radius rule.
- Mesh display changes presentation, not calculation membership or scientific meaning.
- Use native wireframe visuals for entry surfaces. Derive fragment/pocket mesh lines from their existing triangles with bounded allocation.
- Preserve atom-owner mappings for themes and molecular-selection operations.
- Preserve migrated colors, including existing atom-color overrides. Provide source-color inheritance; choosing an independent surface theme removes atom-overpaint precedence for that object.
- New objects default to element coloring, solid display, opacity 0.45, and independent surface colors.
- Changing an object's appearance does not recolor atoms or neighboring objects.

Key runtime state by object identity rather than entry/channel alone. Extend status, Cancel, Retry, dependency resolution, stale-result rejection, representation bindings, and cleanup accordingly.

Keep one surface worker per viewer. Queue lightweight request descriptors and allocate typed calculation inputs only when admitted to execution. Cancellation/removal of one object must not cancel unrelated objects.

Retain existing fragment/pocket limits: 100,000 effective atoms, 64 million cells, 512 MiB mesh allocation, 1 GiB combined retained worker output, 2 GiB accounted active buffers, and 120-second calculation deadline. Include mesh-line and isolation buffers in accounting. Retain entry reduced-detail behavior at 250,000 atoms.

These accounting limits do not bound native entry calculations, browser memory, or GPU memory; documentation and evidence must distinguish them. Do not silently lower resolution or change scientific profiles.

Color, name, and opacity changes reuse valid worker geometry. Preview/commit/Cancel and hidden seed dependencies retain existing invalidation rules. Hidden or removed objects release their runtime allocations. Transparent surface picking must not make unrelated low-opacity representations newly pickable; zero-opacity surfaces remain manageable from the list.

## Milestones and checkpoints

Every checkpoint records outcome, commands, results, limitations, and next action in this feature plan, with a concise project summary in `docs/PROGRESS.md`. Append material decisions to `docs/DECISIONS.md`.

The shared frontend gate is:

```bash
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build
git diff --check
```

Each milestone also runs relevant Python lint/types and browser regressions before proceeding.

### M1 / C1 — Identified surface rendering primitives

**Outcome:** a development harness renders and independently activates two same-entry surfaces with solid/mesh modes and independent appearance.

**Affected areas:** typed viewer boundary, native representation identity, custom mesh visuals, runtime request keys, worker queue/allocation.

**Acceptance:** complete-object highlighting; correct object hit identity; unchanged atom selection/camera; independent cancellation; correct native colors and mesh pixels; disposal; no field recalculation for fragment/pocket appearance changes.

**Focused validation:** shared frontend gate; `vitest` runtime/geometry/worker/adapter tests; a new `surface-objects.spec.ts` harness workflow on desktop and mobile Chromium.

**Documentation/migration:** append approved ownership/display decisions and harness evidence; no production database migration yet.

**Commit:** `feat(viewer): add identified surface rendering primitives`.

**Rollback:** remove the unused primitives; persisted behavior remains unchanged.

### M2 / C2 — Durable object-management vertical slice

**Outcome:** existing projects migrate, all three kinds render from canonical objects, and users can create, activate, rename, hide, and remove multiple surfaces.

**Affected areas:** schemas, commands, migration, archives, topology reconciliation, application projection loading, surface controls, minimal manager.

**Acceptance:** migration preserves appearance and dirty state; multiple same-entry surfaces coexist; creation is atomic across selected entries; scenes/save/reload/undo/redo work; sole-surface removal works; old writes fail clearly; originals and molecular state remain exact.

**Focused validation:**

```bash
.venv/bin/uv run pytest tests/integration/test_surface_objects.py tests/integration/test_migrations.py tests/integration/test_archive_roundtrip.py tests/security/test_archive_safety.py
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
```

Also run the shared frontend gate and new manager plus existing surface/pocket/scene browser workflows.

**Documentation/migration:** implement 0014; update schema/API/development guidance and compatibility decisions. Adapt historical tests to the new contract while retaining their scientific assertions.

**Commit:** `feat(surface): persist independently managed surface objects`.

**Rollback:** pre-upgrade backup; exercise atomic downgrade refusal.

### M3 / C3 — Complete appearance and interaction workflow

**Outcome:** compact manager supports all accepted appearance controls and explicit source editing without cross-object effects.

**Affected areas:** manager, styling/pocket controls, representation controls, transient activation, source-color inheritance, request ownership.

**Acceptance:** colors/opacity/solid/mesh persist independently; source edits retain object ID; empty-selection management works; locked entries retain existing display-edit policy; project switches and late responses cannot affect another context.

**Focused validation:** manager/component ownership tests, shared frontend gate, surface API tests, and desktop/mobile `surface-objects.spec.ts` plus viewer-selection, pocket, movement, and notification regressions.

**Documentation/migration:** update user guidance and scientific limitations; no further schema migration expected.

**Commit:** `feat(surface): add compact independent appearance controls`.

**Rollback:** retain C2 state compatibility; returning to pre-feature software still requires backup restoration.

### M4 / C4 — Scientific, accessibility, and performance qualification

**Outcome:** complete workflows are backed by automated native-rendering and compatibility evidence.

**Affected areas:** scientific references, integration/browser tests, fixtures, performance accounting, accessibility and verification documentation.

**Acceptance:**

- Three same-entry kinds plus multiple fragments/pockets remain independently editable.
- Fragment and pocket geometry matches existing references; migrated native entry geometry retains its prior path.
- Native clicks/highlights and solid/mesh pixels prove visible behavior.
- Scenes, topology changes, hidden seed changes, transforms, remounts, Undo/Redo, and archive remapping preserve correct identity.
- Keyboard-only operation, focus restoration, light/dark axe, long names, 320px layouts, and actual 100%/200% zoom pass.
- Appearance edits cause no normalized refetch or worker field recomputation.
- Existing readiness, main-thread, movement, and cancellation budgets pass.
- Multi-object queues allocate lazily, remain serial, respect worker-output accounting, and release resources.
- Over-budget objects retain definitions with truthful status; unrelated objects remain usable.

**Focused validation:** shared frontend gate; surface/migration/archive Python suites; new object browser suite alongside existing selection-surface, pocket, capacity, movement-performance, release-hardening, and real-zoom suites.

**Documentation/migration:** update `docs/VERIFICATION.md`, performance/accessibility/limitations guidance, and retained evidence. Qualify old-to-new upgrade using an actual tagged v0.13.2 producer. Confirm an actual v0.13.2 reader rejects new schema-2 archives cleanly.

**Commit:** `test(surface): qualify managed surface workflows`.

**Rollback:** verify backup restoration; do not claim preceding-reader round-trip compatibility.

### M4 / C5 — Release candidate and delivery

**Outcome:** reviewed, versioned candidate with complete release evidence, followed by verified merged delivery.

**Affected areas:** authoritative versions, release notes, complete regression gate, PR and publication records.

**Acceptance:** all gates pass on the clean candidate and exact merged commit; no consequential review finding or compatibility ambiguity remains.

**Validation:** run the complete release gate below, fresh migration and tagged compatibility qualification. Review the entire base-to-head diff.

**Documentation/migration:** finish requirement/evidence mapping, migration instructions, release notes, and progress log.

**Commit:** `chore(release): prepare v0.14.0`, followed only by meaningful review fixes or evidence/documentation commits.

**Rollback:** before merge, revert branch changes normally; after upgrade, restore the documented backup.

## Verification and evidence

Planning baseline checks completed without tracked changes:

- **125 Python tests passed:** surface, pocket, and migration integration suites.
- **194 frontend tests passed:** complete Vitest suite.
- Working tree clean; `git diff --check` passed.
- Existing Alembic configuration deprecation warnings remain.
- No new-feature implementation or browser qualification is claimed.

The Python planning command was:

```bash
.venv/bin/uv run pytest tests/integration/test_selection_surfaces.py tests/integration/test_pocket_surfaces.py tests/integration/test_migrations.py -q
```

The frontend command below ran the full suite, rather than narrowing the run to its trailing filters; the evidence is 43 files / 194 tests passed, not a claimed filtered-only run:

```bash
corepack pnpm --dir apps/web test -- selection-surface-runtime selection-surface-geometry selection-surface-worker pocket-surface-geometry pocket-inputs
```

Complete candidate and merged release gates:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<fresh-dedicated-directory> .venv/bin/uv run alembic upgrade head
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

Use disposable migration/browser/compatibility storage. Preserve source SHAs, environment, command exit codes, timing data, screenshots, checksums, and intentional skips. Timing qualification runs without competing builds or profilers. Diagnostic failures remain separate from passing evidence.

## Version, PR, and release plan

The prompt's absent-release-history premise is outdated. Remote inspection confirms established stable releases through [v0.13.2](https://github.com/ManuelSe/Neistra/releases/tag/v0.13.2), whose annotated tag targets `c21de2e3f76241acb1705d7ec80aae9baf499bdf`.

**Approved target: 0.13.2 → 0.14.0, tagged `v0.14.0`, subject to release collision checks.**

This adds substantial user-visible functionality and changes persisted/API project payloads. It is not a patch. Neistra remains pre-1.0, so a minor increment carries this explicitly documented compatibility change without claiming a stable 1.0 contract. A prerelease is unnecessary if all qualification passes; incomplete qualification blocks publication.

Update all five authoritative sources:

1. `pyproject.toml`.
2. Root `molweave-dev` version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI application version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update version assertions and provenance fixtures; do not upgrade dependencies incidentally.

**PR title:** `feat(surface): manage molecular surfaces as independent objects`.

**Merge:** normal merge commit preserving checkpoint history, consistent with recent repository practice. Planning remote inspection finds no workflows, checks, branch protection, or rulesets; recheck all of them before merge and honor anything subsequently configured. Record local review honestly; do not claim independent review without one.

The PR documents implemented, simplified, deferred, and rejected requirements. Use `Closes #57` only once approved scope is complete. Create the focused charge-coloring follow-up before closeout and link existing #58/#59 without expanding them.

Release notes contain:

- Added surface-management workflows.
- Changed selection and creation behavior.
- Upgrade, schema/API compatibility, and rollback.
- Scientific interpretation and deferred capabilities.
- Accessibility, performance, and verification evidence.
- Known limitations and linked follow-ups.

After merge, qualify the exact merged `master` commit before creating the annotated tag and GitHub release. Verify tag target, release state, notes, and uploaded evidence remotely. Publish a final issue reply explaining delivered scope, deviations, compatibility, and follow-up work.

Any post-publication repository documentation goes through a separate documentation branch/PR. Delete only this feature branch after delivery is verified, then confirm local/remote cleanup.

**Merge/release blockers:** failed validation; silent migration loss; changed scientific geometry without approval; stale/wrong-owner output; unbounded queued calculation inputs; broken accessibility; failed compatibility/refusal tests; unresolved consequential findings or required review conversations; unmet protections/checks; version/tag collision; or inability to verify the merged source and publication.

## Approval, persistence, and handoff

The approved planning handoff is:

1. Confirm clean state, fetch origin, switch to `master`, and fast-forward only from `origin/master`.
2. Reconfirm clean state and inspect changes since the planning baseline. Material conflicts require an amendment.
3. Create `feat/issue-57-independent-surface-objects`.
4. Persist this complete contract at `docs/plans/issue-57-independent-surface-objects.md`, recording approval and exact base commit.
5. Make this document the first branch change and commit exactly:

   `docs(plan): add approved plan for issue 57`

6. Push if remote access is available and verify the remote branch/commit.
7. Report the path, branch, commit, C1–C5 milestones, and planned 0.14.0 impact.
8. Stop before implementation, ready for `/goal`.

During implementation, append actual checkpoint commits, acceptance evidence, deviations, blockers, and next actions. Keep this feature plan authoritative, `docs/PROGRESS.md` concise, and cross-project decisions in `docs/DECISIONS.md`.

The initial plan is the sole first-commit change. Project progress and superseding architectural decisions are updated when feature implementation begins, without changing the global plan or claiming unimplemented behavior.

## Progress and completion log

| Date | Stage | Evidence / next action |
|---|---|---|
| 2026-10-14 | Planning inspection complete | Repository and remote delivery baseline inspected; four product choices confirmed; 125 Python and 194 frontend baseline tests pass. |
| 2026-10-14 | Complete contract approved | User instructed “Implement the plan.”; retain the approved persistence-only handoff before `/goal`. |
| 2026-10-14 | Persistence prepared | Clean `master` fetched and fast-forward-only update confirmed at `1c5467c7639d8152d136044d4ae208eb479c8c95`; feature branch created; this document is its first change. Commit/push identity is verified and reported at handoff. |
| Pending | M1 / C1 | Identified rendering primitives; no implementation performed. |
| Pending | M2 / C2 | Durable object-management vertical slice and migration. |
| Pending | M3 / C3 | Complete appearance and interaction workflow. |
| Pending | M4 / C4 | Scientific, accessibility, performance and compatibility qualification. |
| Pending | M4 / C5 | Candidate, review, merged qualification and verified delivery. |

Current limitation: this is an approved contract, not an implemented feature. No feature PR, follow-up issue, tag, merge, or release has been created by the planning handoff. No known blocker to starting C1 under a subsequent `/goal`.
