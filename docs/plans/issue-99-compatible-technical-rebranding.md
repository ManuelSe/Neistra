# Issue #99 — Compatible technical rebranding

## 1. Status, approval and metadata

**Status:** M1–M4 verified; complete clean final0.27.0 candidate ready for PR.
The user activated `/goal` on 2026-11-04; delivery remains incomplete.

On 2026-11-04 the user explicitly selected **Include Python package moves with
compatibility aliases** during proposal review. After the complete proposal, the
user approved it with: **Implement this plan and wait for goal.** In the context
of the requested C0 workflow, this authorizes branch creation, approved-plan
persistence, supporting decision/progress records, commit and push only.

| Item | Approved value |
| --- | --- |
| Issue | [#99 — Complete the MolWeave → Neistra rebranding across the codebase](https://github.com/ManuelSe/Neistra/issues/99) |
| Issue metadata at planning | Open; enhancement; no comments or milestone; last updated 2026-10-19T14:23:47Z |
| Plan | `docs/plans/issue-99-compatible-technical-rebranding.md` |
| Base | `master` |
| Fast-forward-checked local/remote base | `75754343c0c6f7031afc282e2b7c1e28ac52333a` |
| Feature branch | `feat/issue-99-compatible-technical-rebranding` |
| PR title | `feat(branding): complete compatible technical rebranding` |
| Merge strategy | Normal merge commit preserving verified checkpoints |
| Planned release | Stable minor **0.27.0** |
| Proposed annotated tag | **v0.27.0** |

No implementation PR, issue reply, follow-up, tag or release for this work exists
as part of C0. Recheck remote facts before delivery and never claim remote actions
without readback evidence.

## 2. Core problem, approved outcome, authority and inspected baseline

The application uses Neistra presentation but still exposes old technical naming
in API metadata, Python code, configuration and archives. Complete current user
and developer naming while keeping existing imports, configuration, projects,
databases, archives and plugin integrations usable.

Authority, in descending order:

1. Explicit user guidance and subsequent corrections.
2. [AGENTS.md](../../AGENTS.md) and accepted [decisions](../DECISIONS.md).
3. Existing architecture, product boundaries, schemas and repository conventions.
4. The issue's underlying problems, outcomes, constraints and explicit non-goals.
5. Nonbinding technical suggestions in the issue.

The Python-move correction supersedes the package-retention portions of
D-048/D-050. Approval of this full proposal authorizes their narrowly defined
configuration, metadata and archive-naming changes too. Appended D-150 records the
new boundary; prior decisions remain historical records. D-002 molecular authority,
D-042 schema-based archive compatibility, D-148 portable qualification and current
viewer ownership remain binding. Preserve the global [plan](../PLAN.md) and
[product specification](../PRODUCT_SPEC.md).

Planning inspected repository instructions; product/global/progress/decision/
verification documentation; architecture, project/API/archive contracts; actual
settings, API, archive, job/registry/worker and frontend code; migration and reader
tests; launch/configuration tooling; version sources; existing rebranding audit;
related issue search and recent PR/release delivery conventions. External reference
workflow research remained outside repository artifacts; it does not define a
technical rename specification.

Contrary to the original brief's absent-history premise, stable releases already
exist through [v0.26.2](https://github.com/ManuelSe/Neistra/releases/tag/v0.26.2).
The remote annotated tag object `29770609722c6783ac9e0e37bfaf9fd803dfab1a`
targets qualified runtime `e1cae49a9655a4a48a72c25f36bbd45db0273423`.
Current master includes its later publication-documentation merge. All five
application versions are 0.26.2. Project/viewer/archive schemas are 2,
normalized/selection/component schemas are 1, and Alembic head is 0014.

No open PRs were returned. No local/remote `.github` directory or Actions runs
were found. Rulesets were empty and branch metadata reported master unprotected,
but the detailed branch-protection endpoint returned 403. Recheck current required
settings through an authorized interface before merge; inaccessible details do
not authorize bypass. Recent delivery uses normal merges and recorded local gates.
No dedicated maintained release command or PR template was found; prior release
recipes/evidence are references, not proof that a new release has been executed.

The proposal was read-only. Tests were inspected rather than executed; no feature
qualification is claimed. At approved C0, `git pull --ff-only origin master`
reported already up to date, local/remote master matched the base above, and the
working tree was clean before feature-branch creation.

## 3. Requirement disposition matrix

| Significant requirement | Classification | Approved treatment and follow-up |
| --- | --- | --- |
| Frontend Neistra identity and JavaScript package names | Already satisfied | Preserve and verify. |
| API title, Python project metadata and current owned messages | Essential | Use Neistra; root Python development project becomes `neistra-dev`. |
| Python modules and package directories | Essential, explicitly requested | Canonical `neistra_api`, `neistra_core`, `neistra_demo_plugin`; compatibility aliases remain. |
| Existing Python imports and startup commands | Essential | Preserve legacy module paths, worker invocation and documented source-root workflows. |
| Canonical `NEISTRA_*` settings | Essential | Cover API, worker, launcher, migrations, toolchain, caches and test tooling. |
| Existing `MOLWEAVE_*` settings | Essential | Retain fallback aliases with consistent tested precedence. |
| Existing stores and databases | Essential | Reuse in place; never silently relocate, merge or replace. |
| Fresh-installation paths | Supporting | `.neistra/neistra.db` only for genuinely fresh installations. |
| `.neistra.zip` naming | Supporting | Accept both suffixes; current UI requests new suffix; preserve legacy-compatible export. |
| Existing `.molweave.zip` archives | Essential | Continue importing through unchanged content validation. |
| Imports, scripts, current docs, dependencies and lockfiles | Essential | Update affected references coherently; change root metadata without upgrading dependencies. |
| Repository-wide search and retained-name inventory | Essential | Audit tracked content and paths; classify every remaining match. |
| Avoid unnecessary schema/API/migration changes | Essential | Existing schemas/history retained; only additive export-naming request field. |
| Rename serialized MIME, job, plugin and scientific-model IDs | Rejected as proposed | Integration/provenance contracts; preserve/document. No follow-up for naming purity. |
| Rename browser preference key | Rejected as proposed | Retain `molweave-workspace-v1`; avoid preference loss without user benefit. No follow-up. |
| Rewrite user uploads/names, fixtures, historical plans/releases/evidence | Rejected as proposed | Preserve user data and historical truth. No follow-up. |
| Automatically physically migrate existing stores | Rejected as proposed | Unnecessary data-handling risk; document explicit relocation. No migration project now. |
| Later compatibility-alias removal | Deferred | No removal/deprecation schedule here. Follow-up only after a separately approved policy. |
| Public distribution packaging and third-party plugin installation | Deferred | Current execution uses source roots; distribution is separate work. No speculative follow-up now. |
| Deprecation notices on every legacy invocation | Optional, omitted | Document aliases without flooding startup/scientific logs. No follow-up. |
| Storage and archive defaults | Product decision resolved by approval | Exact rules in section 4. |

Interpret all-internal-identifiers acceptance as canonical maintained implementation
using Neistra with documented compatibility exceptions, not elimination of every
old-name string. No essential approved outcome is deferred.

## 4. Accepted scope and compatibility contract

### Python implementation and aliases

Canonical implementation paths:

- `apps/api/src/neistra_api/`
- `packages/neistra_core/src/neistra_core/`
- `packages/neistra_demo_plugin/src/neistra_demo_plugin/`

Keep thin compatibility packages and legacy source-root bridges. Historical
commands using `packages/molweave_core/src`, `molweave_api.main:app` and
`python -m molweave_api.worker` continue working. Preserve the equivalent demo
source-root workflow too. Use explicit forwarding modules and one maintained
implementation, without duplicated chemistry or eager loading of the module tree.

Both import orders must resolve to identical domain classes, exceptions,
SQLAlchemy metadata, registry objects and plugin instances. Test fresh subprocesses
and spawned workers as well as in-process imports. Retain lightweight worker
bootstrap, private module access used by current integrations/tests, resource
lookup, and configured legacy plugin targets. Do not use symlink-only compatibility
that breaks supported source checkouts.

### Configuration precedence

For every supported setting, use an explicitly present canonical `NEISTRA_*`
value, otherwise its legacy `MOLWEAVE_*` alias, otherwise the documented default.
Invalid canonical values fail rather than falling back. Conflicting values produce
a concise diagnostic naming settings without exposing values. Preserve existing
validation and production limits.

Cover actual environment reads across settings, launcher ports, E2E tooling,
AmberTools, minimization caches/resource limits and worker subprocess inheritance.
Retain test/evidence settings where applicable and preserve already canonical
`NEISTRA_PERFORMANCE` policy. Helpers must remain lightweight and not introduce
API-coordinator imports into spawned scientific children. Both spellings preserve
plugin allowlists and security controls.

### Safe store selection

- Explicit data-directory/database configuration wins.
- Reuse an existing default legacy store in place, or an existing new-name store.
- If both default stores exist, stop and require explicit selection.
- Only a fresh installation creates `.neistra/neistra.db`.
- Recognize existing `molweave.db` in an explicitly selected directory; if competing
  database filenames exist there, require explicit database selection.
- An unreadable/invalid existing store must not cause silent creation of an empty
  replacement. Never automatically copy, rename, merge or relocate stores.

API, worker, migrations and launcher must select the same store. No database
migration is introduced. Rollback to older binaries retains direct access to
legacy stores; new-name stores need explicit legacy directory/database settings.

### Archives, API and preserved identifiers

Accept `.neistra.zip` and `.molweave.zip` case-insensitively through existing safe
archive validation. Add an optional filename-style field to the existing archive
export request. Omission retains the old API's `.molweave.zip` filename; current UI
explicitly requests `.neistra.zip`. A secondary export option supplies legacy
naming for older releases. Do not add a prominent compatibility workflow.

The suffix changes download naming only. Preserve manifest structure, member paths,
hashes, originals and MIME contracts. Verify old releases import new archive
content through their actual HTTP endpoint when using the legacy filename;
filename renaming alone does not convert content. Retain strict schema/provenance,
size/path/hash/compression validation and cancellation.

Keep serialized job/plugin IDs, `molweave.jobs` discovery, stored plugin targets,
MIME values, scientific-model IDs and historical provenance. Canonical default
implementation targets may change because old targets remain valid aliases.
Keep browser preference key `molweave-workspace-v1`. Rename purely private
implementation markers where appropriate without changing ownership/behavior.

### Non-goals

No chemistry, force-field, renderer, dependency upgrade, new scientific feature,
schema migration, storage-merging utility, public distribution packaging, blanket
history rewrite, preference reset or alias removal. Related scientific acquisition/
post-processing work remains separate. Preserve original uploaded bytes and names.

## 5. Milestones and independently verifiable checkpoints

Each implementation checkpoint updates the feature log, concise PROGRESS, relevant
docs and material decisions. Leave the branch coherent and runnable. Run applicable
documented lint/type/tests/build and focused E2E validation before committing;
fix failures before advancing. New test filenames below are planned coverage,
not claims of existing features. Never make empty milestone commits.

### C0 — Persist approval, then stop

- **Outcome:** approved planning branch ready for `/goal`.
- **Areas:** this plan first, then PROGRESS and appended D-150.
- **Actions:** fast-forward master from origin/master, confirm cleanliness, create
  feature branch, write approved contract/supporting records, commit and push.
- **Acceptance:** no runtime/test/version/dependency/migration change; global PLAN
  intact. Verify pushed branch SHA when remote access is available.
- **Validation:** approval/scope/links/changed-file review, `git diff --check`,
  clean committed tree, branch/base and remote readback.
- **Commit:** exactly `docs(plan): add approved plan for issue 99`.
- **Migration/rollback:** documentation only; revert has no application effect.
- **Stop:** report path, branch, commit, milestones/release impact; do not implement
  or open a PR. Wait for `/goal`.

### M1/C1 — Canonical Python implementation and working legacy aliases

- **Outcome:** application/jobs run through either namespace.
- **Areas:** API/core/demo packages, compatibility roots, imports, Python paths,
  launcher, Alembic bootstrap, metadata, lock root identity and affected tests.
- **Acceptance:** both import orders/identity, legacy and canonical startup,
  legacy configured targets, worker spawn, scientific resources and migrations
  work. Preserve historical migration files/revision IDs.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/unit/test_namespace_compatibility.py tests/unit/jobs tests/integration/test_job_lifecycle.py tests/integration/test_migrations.py
  corepack pnpm test:dev
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/release-journey.spec.ts
  ```

- **Documentation:** current architecture/startup/plugin examples and alias support.
- **Migration/rollback:** no state conversion; code revert, with services stopped
  before changing deployed application versions.
- **Commit:** `refactor(packages): introduce Neistra namespaces with legacy aliases`.

### M2/C2 — Canonical configuration and safe store continuity

- **Outcome:** either configuration vocabulary runs the complete stack against
  the intended store.
- **Areas:** lightweight configuration helpers, settings, native toolchain/cache
  controls, supervisor, Playwright configuration, ignore rules and tests.
- **Acceptance:** test unset/legacy/canonical/matching/conflicting/invalid/empty
  settings, explicit database URLs, fresh/legacy/competing stores, paths with
  spaces and subprocess inheritance; preserve existing production limits.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/unit/test_configuration_compatibility.py tests/integration/test_store_compatibility.py tests/integration/test_minimization_jobs.py
  corepack pnpm test:dev
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/release-journey.spec.ts
  ```

  Run the journey with canonical and legacy settings in isolated disposable stores.
- **Documentation:** configuration reference, precedence, upgrade/rollback guidance.
- **Migration/rollback:** none; older binaries require explicit settings for fresh
  new-name stores. Existing stores remain in place.
- **Commit:** `feat(config): support Neistra settings and existing stores`.

### M3/C3 — Presentation completion and compatible archive naming

- **Outcome:** current API/UI use Neistra and both archive suffixes work.
- **Areas:** API metadata, archive endpoint/service/request, import/export dialogs,
  help text, owned messages and tests.
- **Acceptance:** old API requests keep filename behavior, UI exports new suffix,
  secondary legacy export works, both suffixes import, malformed archives retain
  all rejection rules, and user names/provenance are untouched.
- **Focused validation:**

  ```bash
  .venv/bin/uv run pytest tests/integration/test_archive_roundtrip.py tests/integration/test_archive_naming.py
  corepack pnpm --dir apps/web test -- export-dialog
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/export-archive.spec.ts tests/e2e/rebranding.spec.ts tests/e2e/rebranding-surfaces.spec.ts tests/e2e/release-journey.spec.ts
  ```

- **Documentation:** API, archive format, branding, accessibility and release guidance.
- **Migration/rollback:** additive request field only; no schema migration/content
  conversion. Legacy naming remains available.
- **Commit:** `feat(archives): support Neistra filenames with legacy compatibility`.

### M4/C4 — Audit, version and qualify the final candidate

- **Outcome:** reviewed release candidate with complete compatibility evidence.
- **Areas:** residual-name inventory/current docs, five version sources, reader
  harnesses, release notes and evidence.
- **Acceptance:** all tracked matches have justified dispositions, canonical
  workflows documented, final versions agree, complete gate and actual readers
  pass, complete diff has no unresolved consequential findings.
- **Focused validation:** archive/configuration/namespace suites above, actual tagged
  v0.26.2 ↔ final 0.27.0 reader processes, and section 6 complete gate.
- **Documentation:** evidence matrix, limitations, compatibility and completion log.
- **Migration/rollback:** none; schemas retained, legacy entry points retained;
  document new-store settings for older binaries.
- **Commit:** `chore(release): prepare v0.27.0`.

### M5/C5 — Verify merged delivery and publish

- **Outcome:** verified merged runtime, release and issue close-out.
- **Areas:** PR/merge/release/issue lifecycle and evidence/documentation.
- **Acceptance:** satisfy current checks/reviews/protections/conversations, merge
  normally, repeat full qualification on exact merged master, then create
  annotated tag and stable release. Read back exact remote identities.
- **Validation:** section 6 gate/readers plus PR/merged SHA/tag target/release notes/
  assets, downloaded evidence checksums, issue reply and cleanup receipts.
- **Documentation:** publication receipts and final progress/completion records.
- **Commit when needed:** `docs(release): record verified v0.27.0 publication`.
- **Compatibility/rollback:** never retarget published tags; corrections need a
  subsequent release. Later docs receipts preserve qualified runtime identities.

## 6. Acceptance and verification evidence

Run on final candidate and exact merged master using isolated disposable stores
and locked scientific tooling:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
NEISTRA_DATA_DIR=/tmp/neistra-issue99-gate .venv/bin/uv run alembic upgrade head
.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/neistra_core packages/neistra_demo_plugin
.venv/bin/uv run pytest
corepack pnpm --dir apps/web lint
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test
corepack pnpm test:dev
corepack pnpm --dir apps/web build
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test
git diff --check
```

Select a unique unused disposable gate directory per run rather than reusing the
example blindly. Playwright owns separate dedicated disposable resources; record
any documented isolation overrides. Frozen installs must not upgrade dependencies.

Additional mandatory qualification:

- Legacy-configuration startup, migration and job smoke execution.
- Actual tagged v0.26.2 and final-candidate readers in separate processes with
  verified implementation roots/versions, using existing reader harnesses extended
  where necessary for namespace/store/archive compatibility.
- Existing-store reopen and archive compatibility in both directions, including
  actual old HTTP suffix handling and explicit legacy-named current export.
- Exact originals, molecular state, history, selections/scenes/surfaces/jobs and
  archive remapping; normal edits retain Undo/Redo and persisted history.
- Version/schema/dependency/residual-name and production-output audits; scientific
  resource lookup and frozen root-package metadata consistency.
- Both themes, desktop/mobile, keyboard operation, narrow layouts, current actual
  browser zoom and accessibility coverage.

Record exact commands, source/log hashes, environment, outcomes/exclusions and
failed/interrupted diagnostics. Retain local self-review provenance honestly.
Requalify affected results after changes; historical passing results do not prove
new behavior. D-148 portable correctness is mandatory. Strict reference-host
timing with `NEISTRA_PERFORMANCE=1` is separate; retain scientific/resource/work/
request/memory bounds and do not claim strict timing from portable results.

## 7. Data, migration, API, UI, science, accessibility and performance

- **Data/migration:** project/viewer/archive 2, normalized/selection/component 1,
  Alembic 0014. No new migration or rewrite. Existing store contents, originals,
  timestamps, identities, provenance and history remain intact.
- **API:** existing routes/payloads retained except additive optional archive
  filename-style request field. Omitted field preserves old API behavior; metadata
  uses Neistra. Existing MIME/job/plugin/model IDs remain integration contracts.
- **State/UI:** retain backend molecular authority, Query server-state ownership,
  transient application selection and disposable viewer. No state migrates into
  preferences or renderer. Only naming/archive compatibility controls change.
- **Science:** no algorithm, force field, chemistry default, coordinate, identity,
  inference or warning changes. Import/resource changes still require scientific
  regressions. Do not hide source diagnostics by arbitrary text substitution.
- **Accessibility:** concise accessible labels/tooltips and keyboard/touch support
  for archive choices; preserve focus/layout/theme/zoom behavior.
- **Performance:** aliases stay lazy; no duplicate registries or scientific
  resources, new molecular serialization/refetches or renderer instances. No
  unmeasured performance improvement claim.
- **Rollback:** stop services and deploy compatible prior binaries. No schema
  downgrade/data stripping; explicitly configure paths/DB URLs for new-name stores
  and use legacy archive filename when importing in older versions.

## 8. Decisions and deviations

[D-150](../DECISIONS.md#d-150--compatible-neistra-technical-namespaces-and-configuration)
is the project-level architecture record. This plan does not replace it.
No silent rewrites of D-048/D-050 or historical evidence. Approved deviations from
the issue's literal naming sweep are the disposition matrix's compatibility and
historical exceptions, source-root bridges, retained preference key and no physical
store migration. Python moves are included by explicit user correction.

Material changes to this contract, compatibility loss or irreversible choices
require a product decision. Routine implementation details may be resolved within
the contract and recorded. No implementation deviation exists at C0.

## 9. Version and release plan

Use stable **minor 0.27.0**, not patch/major/prerelease. New public Python
namespaces, canonical configuration names and archive filename support are
additive capabilities. Aliases retain existing integration entry points; persisted
schemas and scientific behavior remain compatible. Stable history already exists;
no first-release or prerelease reset is justified by the enhancement label.

Update all five authoritative sources together during release preparation:

1. `apps/web/package.json`
2. `pyproject.toml`
3. `uv.lock`
4. `apps/api/src/neistra_api/main.py` (moved implementation)
5. `apps/api/src/neistra_api/archive_service.py` (moved implementation)

Update version assertions and producer coverage without dependency upgrades.
Recheck release/version/tag availability before preparation and record any required
adjustment. Proposed annotated tag **v0.27.0** is created only from exact verified
merged master after complete qualification.

Release-note sections: **Changed**, **Added compatibility**, **Upgrade and rollback**,
**Retained identifiers**, **Verification**, **Known limitations**. Include inherited
unreleased changes if any; identify portable versus strict timing evidence.

## 10. PR, merge, issue response, blockers and cleanup

PR title: `feat(branding): complete compatible technical rebranding`. Describe
implemented/simplified/deferred/rejected requirements and evidence for a reviewer
without conversation context. Normal merge preserves passing checkpoints.

Use `Closes #99` only when approved outcomes pass; otherwise `Refs #99` and keep
the issue open. No speculative follow-up is needed for this scope. Alias removal
needs its own future approved deprecation policy; distribution packaging stays
separate. Final reply explains aliases, retained IDs/history, upgrade/rollback,
scope decisions and actual verified release/limitations.

Block merge/release for unresolved import identity or spawn failures, broken legacy
commands/plugins, ambiguous store selection, silent empty-store creation, archive
incompatibility, unintended schema/scientific/dependency changes, validation
failures, unresolved consequential findings, unsatisfied required review/checks/
protections/conversations or unverified release targets. Inaccessible protection
details do not authorize a bypass. Complete merged-master gate blocks publication.

Verify remote PR/merge/tag/release/asset/issue identities and downloaded evidence
hashes. Preserve published tags while recording later documentation receipts.
Delete feature branch only after verified delivery and a clean local tree; verify
local/remote cleanup. Never claim an absent independent review or remote artifact.

## 11. Progress and completion log

| Checkpoint | Status and evidence |
| --- | --- |
| Proposal | Read-only inspection completed; user explicitly selected Python moves with aliases. No runtime tests executed. |
| Approval | 2026-11-04: “Implement this plan and wait for goal.” Full preceding proposal approved; C0 only until `/goal`. |
| C0 base/branch | Fast-forward-only pull: already up to date. Clean master/local origin at recorded base; approved feature branch created. |
| C0 persistence | This plan is the first branch file change, followed by D-150 and concise PROGRESS. Seven relative document links, approved branch, planning-only changed-file scope and whitespace/diff checks pass. No prohibited reference-product names in new text. Commit/remote receipt is recorded in the handoff. |
| M1/C1 | Verified: canonical packages and explicit aliases/source-root bridges, lazy legacy worker CLI, same-singleton registry deduplication. 151 focused Python tests then 8 revised namespace/CLI tests pass; 374 frontend and 12 supervisor tests pass; native journey 1 pass/1 existing mobile exclusion. Ruff, mypy193, lint/types/build/frozen install/diff pass. [Logs/review](../assets/technical-rebranding/) retain exact outputs and 90-file move/hash review. No migration-history/dependency/scientific change. |
| M2/C2 | Verified: canonical/legacy precedence throughout Python/JS/toolchain/tests; safe shared store resolver;69 focused Python/38 precedence recheck,374 frontend,14 supervisor, native journey1pass/1existing exclusion for each spelling. Ruff/mypy195/lint/types/build/diff pass. [Exact logs/environments/hashes](../assets/technical-rebranding/c2-evidence.json). Initial test-only ApiClient context-manager failure retained separately. No schema/migration/science change. |
| M3/C3 | Verified: Neistra metadata/private markers, byte-identical archive filename choices, dual import suffixes, secondary accessible legacy export.66 archive/security,146 editing/format/metadata and21 final alias/job tests pass;374 frontend;23 native/5existing exclusions, both themes/layouts and keyboard/axe/44px. Ruff/mypy195/lint/types/build/diff pass. [Exact evidence/screenshots](../assets/technical-rebranding/c3-evidence.json). Review corrected package-export singleton shadowing with regressions. No schema/migration/scientific-algorithm change. |
| M4/C4 preparation | All five versions0.27.0; preceding0.26.2 producer coverage added. Actual tagged0.26.2↔final0.27 reader preflight passes with real roots/HTTP suffix behavior; clean complete gates still required. [Full-diff self-review](../assets/technical-rebranding/c4-full-diff-review.md),90-file runtime comparison and702 local links pass. Remote master unchanged7575434, no0.27 tag/release collision; master unprotected via authenticated detailed endpoint, normal merge enabled.24-step candidate recipe prepared. |
| M4/C4 candidate1 correction | Clean b3e4046 gate stops at Python:1330pass/1 missing-log failure, zero skips. Fail-first migration regression demonstrates logger disabling; bootstrap now preserves application diagnostics.184 focused checks/Ruff/mypy195 and explicit legacy-target spawned job workflow pass. [Correction evidence](../assets/technical-rebranding/c4-logging-correction.json). Candidate1 logs retained; fresh candidate2 required. |
| M4/C4 candidate2 correction | Pre-browser1332Python/374frontend/14supervisor/static/build/fresh migration round trip pass. Native run deliberately stopped at stale private-tag observation:60pass/1fail/1interrupted/3existing exclusions/349not-run. Corrected two harnesses/two assertions without relaxing exact checks;24 focused native cases and374frontend/static/build pass. [Marker correction](../assets/technical-rebranding/c4-marker-correction.json). Candidate3 must complete the full gate. |
| M4/C4 complete | Clean12f1aeb passes all24 steps:1332Python (zero skips),374frontend,14supervisor,352browser/62 exactly unchanged exclusions; zero failures/flakes/automatic retries.697 unchanged source identities and all lossless log hashes verify. Actual tagged0.26.2↔final0.27.0 readers, legacy CLI, fresh migration round trip and version/schema/dependency/name/production audits pass. [Summary](../assets/technical-rebranding/c4-candidate3-summary.json). Full-diff local self-review has no unresolved consequential finding; origin/master still7575434 and0.27 tag/release unused. |
| M5 | PR/review/normal merge, exact-master24-step gate and publication pending. |

Maintain this detailed source of truth as checkpoints pass. PROGRESS remains the
concise project summary. Record exact C0 commit/remote evidence in the handoff;
the planning commit cannot contain its own SHA.
