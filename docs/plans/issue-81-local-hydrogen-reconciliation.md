# Issue #81 — Local hydrogen reconciliation after bond edits

## Status, outcome and authority

Status: approved implementation contract; C0 plan persistence only. Runtime implementation has not started.
Approval: user's “Implement the plan.”, 2026-10-17, following the complete proposed plan.
Issue: https://github.com/ManuelSe/Neistra/issues/81
Issue state: open; last update inspected 2026-10-17T15:52:12Z; no issue comments at analysis.
Issue title: Reconcile hydrogens locally after bond addition, deletion, and order changes.
Plan: docs/plans/issue-81-local-hydrogen-reconciliation.md.
Base: origin/master, 9f20d9f4c87d4c714638bcf77dc664b7dabdb670.
Branch: fix/issue-81-local-hydrogen-reconciliation.

Approved outcome: supported heavy-atom bond edits reconcile endpoint H counts and
local H geometry in one reversible command. Deliberate incomplete chemistry remains
editable through Preserve H and manual tools.

Authority follows the user's specified order: explicit guidance; AGENTS.md and
accepted decisions; repository architecture and product boundaries; issue outcomes;
nonbinding technical suggestions. This feature plan is the implementation contract.
The global docs/PLAN.md remains unchanged.

Confirmed product decisions:

1. Supported bond edits reconcile immediately, with a visible policy and resulting report.
2. Reuse the existing bounded element/charge profile rather than limit delivery to carbon.
3. Add narrow isotope/radical protection facts within existing extensible records;
   defer full canonical isotope/radical editing and export.

Inspection findings:

- Read AGENTS.md, PRODUCT_SPEC, global PLAN, PROGRESS, relevant accepted DECISIONS,
  VERIFICATION, development/release/schema/model/editing documentation; inspected
  domain editing/geometry/H builders, adapters, model API/publication, relational
  models/migrations, archive service, jobs, frontend ownership/types/panel and tests.
  Reviewed related issues #74/#77/#71/#82 and current backlog, PR/release conventions,
  version sources and local/remote branches/tags/releases/CI settings.
- In-memory probes reproduce the butane closure, ethane single-to-double and ethene
  double-to-single failures. Bond deletion already adds H in supported cases.
- All 56 existing focused hydrogen unit/scientific tests pass. This establishes a
  baseline, not verification of the proposed feature.
- Normalized atoms lack isotope/radical fields; an imported deuterium atom loses its
  mass annotation. Destructive reconciliation requires a protection prerequisite.
- Existing immutable artifacts, molecular publication, reference reconciliation,
  allocation floors and generic history provide the persistence boundary.
- Contrary to the planning prompt's premise, remote tags and releases exist through
  stable v0.18.0: https://github.com/ManuelSe/Neistra/releases/tag/v0.18.0.
  Its annotated tag peels to 6cb9faf3959a7409620f42bc2fdef396d838568b. Current master
  additionally includes release-evidence documentation.
- No GitHub Actions workflows, rulesets or protected branches were reported during
  inspection. Delivery must recheck actual requirements; their current absence
  does not replace local release qualification. All three merge methods are enabled;
  recent PRs use merge commits. No dedicated release automation was found.

## Requirement dispositions and implementation contract

| Significant requirement | Classification | Decision and follow-up |
|---|---|---|
| Reconcile H after heavy-heavy bond addition, deletion and order changes | Essential | Implement through the direct model-edit path. |
| Automatic workflow with obvious Preserve H choice | Essential | Immediate UI reconciliation by default; API omission remains preserve. |
| Show captured policy and H changes | Essential | Explicit add/remove/move wording, resulting counts and expandable atom/site details. |
| Mandatory review before every destructive change | Rejected as proposed | User selected immediate application. Provide optional preview; no follow-up needed. |
| Endpoint-local changes; exact heavy/unrelated coordinates | Essential | Only edited heavy endpoints and their directly bonded eligible H can change. |
| Deterministic removal and stable surviving identities | Essential | Retain lowest eligible H IDs; remove highest eligible IDs first. |
| Linear/planar/tetrahedral transitions | Essential | Include single/double/triple changes, deletion and re-addition. Geometry remains unoptimized. |
| Independent conformer placement and whole-site atomicity | Essential | A site succeeds in all conformers or retains all its pre-reconciliation H state. |
| Partial independent endpoint results | Essential | Publish the bond plus successful sites; identify skipped sites precisely. |
| Assigned chemistry; no guessed charge, orders or protonation | Essential | Unknown or unsupported chemistry skips reconciliation without blocking the direct edit. |
| Protect labelled, charged, nonterminal and stereochemically significant H | Essential | Conservative eligibility and protection facts; ambiguous sites skip. |
| Narrow source isotope/radical protection | Essential | Preserve facts in extensible records and recover older facts conservatively from originals. |
| Full canonical isotope/radical authoring and faithful chemical export | Deferred | Larger model/adapter concern. Create one focused follow-up if no equivalent exists. |
| Preserve explicit H deletion | Essential | H endpoint edits do not trigger saturation or recreate deleted H. |
| Preserve standalone completion and Add N H contracts | Essential | Their additive-only behavior remains unchanged. |
| Immutable originals, revision guards, history and allocation floors | Already satisfied by repository | Reuse and add regressions for removals/movements and reference restoration. |
| Preview ownership, stale-response handling, save/archive retention | Supporting | Extend existing mechanisms; no second mutation path. |
| Optional native preview of proposed changes | Optional, included | Reuse the existing preview workflow; default immediate mode remains. |
| Structured reports, durable warnings and provenance | Supporting | Extend model responses without changing legacy response semantics. |
| Arbitrary aromatic/resonance repair and stereoisomer selection | Deferred | Report uncertainty; broader chemistry belongs with #52/#71. No duplicate umbrella issue. |
| Heavy-atom optimization and guaranteed clash elimination | Rejected as proposed | Would change the scientific operation. Selection/context minimization remains #82. |
| Preparation, protonation prediction, entry merging or new engine framework | Rejected as proposed | Outside the problem and accepted architecture; existing #12/#11/#71 cover relevant broader work. |
| Documentation, scientific qualification and release workflow | Essential | Required checkpoints and release gates below. |
| Further unresolved product decisions | None | Defaults, scope, protection approach and partial publication are fixed by this contract. |

### Domain behavior

Add a focused reconciliation proposal alongside the additive builder. Reuse count
rules, proper-rotation geometry, diagnostics, bounded context assessment and
publication helpers where their semantics match. Do not change additive completion
into a destructive operation.

Policy and scope:

- Add hydrogen_policy="reconcile_if_possible" for direct bond.set and bond.delete.
- Keep omitted policy as preserve; retain complete_if_possible as additive-only.
- The new policy targets exactly the two edited heavy endpoints. Neighboring atoms
  may supply geometry or chemistry context but are not additional mutation targets.
- Requests involving H endpoints preserve the literal requested bond edit and
  report that reconciliation was skipped. Explicit H deletion is never reversed.
- Deleting display-inferred connectivity without an authoritative canonical bond
  records its existing exclusion behavior, but does not infer a valence decrement
  or add H.
- A repeated bond assignment/deletion remains a refusal/no-op; it must not become
  a hidden completion action.

Counts and eligibility:

Use the existing supported profile: C0; N0/+1; O0/-1/+1; divalent S0; neutral
F/Cl/Br/I. Compute the intended explicit-H count from assigned endpoint state and
post-edit authoritative heavy-atom bonds. This reconciles the supported endpoint
count, rather than merely adjusting H by the bond-order difference. Preserve mode
remains available for intentional radicals, deficiencies and excess valence.

An automatically mutable H must be terminal, ordinarily unlabelled, explicitly
neutral, attached through one nonaromatic single bond, alternate-compatible and
free of protected stereo/provenance ambiguity. If protected H would be involved,
skip the whole site rather than choose arbitrarily among ordinary and protected H.

Unknown orders/charges, contradictory aromatic information, unresolved resonance,
unsupported valence states or insufficient source evidence produce stable diagnostic
reasons. Navigation/residue boundaries do not themselves prevent editing.

Geometry, identity and stereo:

- Remove excess eligible H in descending stable-ID order. Surviving atoms and bonds
  retain identities and noncoordinate properties.
- Allocate added H/bonds above existing floors; inherit the actual parent's residue
  and alternate identity.
- Refit local H only when count or coordination changes require it. Preserve
  existing geometry when no adjustment is needed.
- Fit ideal coordination to fixed heavy-neighbor directions using proper rotations.
  Assign surviving H to equivalent positions by minimum displacement, with stable-ID
  and candidate-order tie breaks.
- Resolve harmless rotational freedom deterministically and warn. Do not choose a
  genuinely new stereochemical configuration automatically.
- Assess potentially stereogenic results using bounded, sufficiently specified
  context and retained geometric evidence. Skip a site if H deletion or
  repositioning would arbitrarily select/invert configuration.
- Preserve source stereo facts. Reconcile or clear affected current annotations
  with warnings under D-106; disconnected annotations remain unchanged.
- Generate positions independently in every conformer. Failure in any conformer
  discards that site's complete H proposal; another independently supported
  endpoint may still succeed.
- Keep every heavy and unrelated coordinate exact, including inactive conformers.
  Validate finite coordinates, bond-length representability, coordination error and
  local contacts. Warn about distorted heavy geometry and close contacts without
  claiming optimization.

### Isotope/radical protection prerequisite

Introduce a small versioned protection record within existing extensible normalized
annotations. Record source identity, isotope/radical evidence and assessment
coverage; distinguish “examined and ordinary” from “unknown.”

- New imports retain available adapter evidence before it is discarded.
- Generated H carries explicit ordinary-H provenance.
- Older imports may recover evidence from preserved original bytes using
  record/source identity and verified stable correspondence.
- Never map through proximity, mutable names or source index alone.
- Unavailable, ambiguous or over-budget recovery means affected sites skip
  reconciliation.
- Recovery is read-only during inspection/preview. Persist recovered protection
  provenance only with a successful molecular command; do not rewrite original
  uploads or immutable source facts.
- These records support protection, not a claim of complete isotope/radical
  modeling. Chemical export must surface their unsupported representation through
  the existing loss-warning mechanism.

Use one documented record shape and validation helper. Preserve unrelated extension
data.

### Publication, API and UI

Keep existing model-edit and preview routes.

- Extend requests with the new policy; unsupported action/policy combinations
  receive validation errors.
- Add an optional hydrogen_reconciliation_report to model-edit and preview
  responses. Keep existing additive hydrogen_report unchanged.
- Report captured policy, complete/partial/unchanged/unresolved status, target
  outcomes, added/removed/moved H counts and IDs, conformer-specific diagnostics,
  full reason counts and truncation.
- Extend preview data for retained-H old/new positions and removals. New ghosts
  retain noncanonical identities.
- Apply recomputes from captured canonical inputs; client-proposed coordinates are
  never accepted as authority.
- Publish the bond and accepted H changes once through the existing molecular
  artifact transaction. Deleted H use existing reference reconciliation for
  selections, measurements, scenes, styles and surfaces.
- Persist policy/changes/assumptions in existing warnings and inference records.
  Reports and previews remain transient.
- Structural refusal, preview and no-op paths publish nothing and preserve
  revision, dirty state, counters, history and Redo.

In the Bonds panel, show “Reconcile local H — may add, remove or move H” and
“Preserve H”, defaulting to reconciliation for each project visit. Keep this
preference separate from optional additive completion for atom/fragment operations.

Ordinary bond controls apply immediately. Include an optional Preview changes mode
using the same actions and Apply path. Report changes after immediate application;
provide expandable details and existing manual H/coordinate controls for skipped
sites.

Capture policy, action, project visit, selection, revision and artifact before
requests. Late responses cannot replace another project's feedback, selection or
preview. Keep molecular authority in the backend and use existing viewer
invalidation.

### Bounds and compatibility

At most two sites are reconciled. Reuse existing ceilings of 4,096 H operations,
16,384 coordinate rows, 1,024 atoms per chemistry context, 16,384 analyzed atom visits
and 200 detailed diagnostics. Count moved as well as generated H work, failed
attempts and repeated conformer assessments. Source recovery stays within existing
import limits and runs at most once per source per request.

Use request-scoped adjacency/coordinate indexes and a combined contact index per
conformer. No whole-protein sanitization, unbounded pair matrix, persistent
calculation cache or new job type. Generic jobs continue to consume immutable
artifacts.

No database migration or top-level schema increment is planned: migration head0014;
project/viewer/archive2; normalized/selection1. Any evidence requiring an
incompatible schema change must return for plan revision.

## Milestones, checkpoints and verification

Each implementation checkpoint updates the detailed plan log and concise project
progress, records material decisions, reviews its diff and commits a passing
coherent state.

### C0 — Approved plan persistence; no implementation

Outcome: current clean master, dedicated branch, approved contract persisted first.

After approval:

1. Fetch origin, check the working tree, and fast-forward local master from
   origin/master only.
2. Confirm a clean tree and recheck base changes against this contract.
3. Create fix/issue-81-local-hydrogen-reconciliation.
4. Write the approved feature plan as the first branch change; add a concise
   planning-status entry to docs/PROGRESS.md.
5. Commit: docs(plan): add approved plan for issue 81.
6. Push and verify the remote branch/commit.
7. Report path, branch, commit, milestones and release impact, then stop ready
   for /goal.

Acceptance: exact approved contract committed and remotely verified; no runtime,
dependency, schema or version change. Validation: git diff --check, clean-tree
checks and local/remote commit readback.

### M1 — Safe reconciliation through the API

#### C1 — Protection facts and source recovery

- Outcome/areas: import adapters and a focused protection reader retain usable
  identity evidence.
- Acceptance: ordinary versus protected/unknown evidence is distinguished;
  labelled/radical fixtures survive native save/archive; preview/recovery does not
  write.
- Focused validation: adapter unit tests; format-fidelity and new protection tests;
  archive round-trip and migration tests.
- Documentation: normalized extension interpretation, source-mapping rules and
  export limits. Append the next available accepted decision, expected D-107, for
  the new reconciliation policy/protection boundary.
- Commit: fix(chemistry): retain hydrogen protection facts.
- Compatibility/rollback: additive extension records; no migration. Reverting
  consumers must preserve opaque facts.

#### C2 — Endpoint reconciliation and atomic API publication

- Outcome/areas: domain proposal, model-edit service, typed API/report/preview
  extensions and integration tests.
- Acceptance: terminal butane closure removes exactly two H; supported order
  changes/deletion/re-addition work; exact coordinate invariants, per-site conformer
  atomicity, deterministic identities and one-command Undo/Redo pass.
- Focused validation:

  ```bash
  .venv/bin/python -m pytest tests/unit/editing/test_hydrogen_reconciliation.py tests/scientific/test_hydrogen_reconciliation.py tests/integration/test_hydrogen_reconciliation.py
  .venv/bin/python -m pytest tests/unit/editing/test_hydrogen_completion.py tests/scientific/test_hydrogen_completion.py tests/scientific/test_hydrogen_qualification.py tests/integration/test_hydrogen_completion.py tests/integration/test_model_edits.py
  ```

- Documentation: API policy/report contract, partial outcomes and molecular intent.
- Commit: feat(modeling): reconcile endpoint hydrogens after bond edits.
- Compatibility/rollback: existing callers retain defaults. Existing generic
  history restores artifacts; old runtimes cannot provide the new policy.

### M2 — Immediate, inspectable user workflow

#### C3 — UI policy, feedback and optional preview

- Outcome/areas: editing store, compact Bonds panel, client types and native preview
  rendering.
- Acceptance: immediate default, explicit Preserve H, accurate removal/movement
  reports, optional preview/Cancel/Apply, captured ownership and unchanged
  standalone H tools.
- Focused validation:

  ```bash
  corepack pnpm --dir apps/web test -- molecular-edit-panel manual-modeling hydrogen viewer-adapter
  PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/bond-hydrogen-reconciliation.spec.ts tests/e2e/hydrogen-completion.spec.ts tests/e2e/direct-molecular-modeling.spec.ts
  ```

- Documentation: editing controls, warnings and manual recovery. No persistent
  preference or migration.
- Commit: feat(editor): expose local hydrogen reconciliation policy.
- Compatibility/rollback: current client/API required for reconciliation; UI
  removal does not invalidate stored results.

### M3 — Scientific and persistence qualification

#### C4 — Adversarial, native and preceding-reader qualification

- Outcome/areas: independent fixtures, scientific/integration/native tests and
  reader harness.
- Acceptance: all scenarios below pass; current producer data is retained by the
  actual tagged v0.18.0 reader.
- Focused validation: reconciliation and existing hydrogen suites;
  tests/integration/test_direct_modeling_qualification.py,
  archive/migration/security suites; native reconciliation, hydrogen membership,
  molecular editing, accessibility and actual zoom suites.
- Documentation: fixture provenance, scientific limits, verification mapping and
  measured performance.
- Commit: test(modeling): qualify bond hydrogen reconciliation.
- Compatibility/rollback: qualify actual separate-process v0.18.0 load, generic
  Undo/Redo, allocation floors, originals, save/archive/re-export and extension
  retention. Do not promise equivalent old authoring behavior.

### M4 — Release qualification and delivery

#### C5 — Final candidate

- Outcome/areas: five version sources, release notes, compatibility guidance and
  complete evidence.
- Acceptance: latest master integrated safely; version/tag collision checked;
  clean final-version candidate passes complete gate and full-diff review.
- Validation: full release gate below plus actual v0.18.0 reader qualification.
- Documentation: release scope, verification and remaining limits; no schema
  migration.
- Commit: chore(release): prepare v0.19.0.
- Rollback: preserve full managed-data backup and existing downgrade guards; never
  strip extension records to force compatibility.

#### C6 — Reviewed merge, release and closeout

- Outcome: verified merged master, annotated tag, stable release and evidence-backed
  issue response.
- Acceptance: required reviews/checks/conversations satisfied; exact merged commit
  passes complete gate; remote tag/release/notes/assets verified.
- Validation: complete merged-master gate, preceding-reader check and remote
  publication readback.
- Documentation/commit: substantive evidence updates use
  docs(verification): record hydrogen reconciliation release evidence; use a normal
  documentation PR when needed.
- Rollback: never move a published tag. A failed merged qualification blocks
  release; resolve through a reviewed correction or revert.

### Acceptance evidence

Tests must assert outcomes independently of the implementation:

- Butane terminal CH3 closure to two CH2 endpoints; exactly two ordinary H removed.
- Single/double/triple increases/decreases, bond deletion/re-addition and
  unchanged-count cases.
- C/N/O/S/halogen profile examples, assigned charges and supported conjugated
  geometry.
- Unknown/contradictory orders, aromatic/resonance ambiguity, unsupported states and
  remote-invalid draft isolation.
- Protected isotope/radical facts, charged/unknown-charge H, bridging/H-H
  connectivity, source-mapping ambiguity and recovery limits.
- New tetrahedral/E/Z ambiguity, retained stereochemistry, mirrored/degenerate
  geometry and conformer disagreement.
- Sparse IDs, nonfirst active conformer, compatible/conflicting alternates and
  covalent residue boundaries.
- Exact heavy/unrelated coordinates, finite new/moved H and visible clash/geometry
  warnings.
- Exact artifacts and deleted-H references through Undo/Redo; monotonic allocation
  through recreation and branching.
- No mutation from preview, refusal or no-op; standalone completion/Add N remain
  additive.
- Save/reload/archive retention; exports report unsupported protection facts.
- Late responses, lock/revision/artifact changes, project revisit, selection
  changes, movement conflicts and preview ownership.
- Both themes, keyboard/touch, scoped accessibility, narrow layouts and real
  100%/200% browser zoom.
- Bounded work on a representative protein-ligand entry; no whole-parent chemistry
  conversion or repeated source parsing. Existing performance budgets remain binding.

At each implementation milestone run Ruff, mypy, all Python tests, web
lint/typecheck/tests/build, git diff --check and relevant native workflows.

Before opening/merging the implementation PR and before release, run the documented
complete gate. Substitute a dedicated disposable data path for the placeholder:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=<dedicated-disposable-data-dir> .venv/bin/uv run alembic upgrade head
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

Add executable producer/read/re-export qualification against actual v0.18.0 modules
in a separate checkout/process. Run against the final candidate and exact merged
master. Record commands, source/module paths, versions, environments, timings,
pass/skip/retry counts and log hashes. Failed or interrupted runs remain diagnostic
evidence.

## Decisions, release and completion record

### Documentation and architectural decisions

Update molecular-model, normalized-schema, API, editing, scientific-limit,
format-warning, development, verification and release documentation.

Append accepted decisions for:

- Operation-specific destructive reconciliation and immediate UI versus preserved
  API defaults.
- Protection evidence, uncertain-site behavior and backward-compatible persistence.
- Geometry/stereo and partial-site publication semantics.

Do not rewrite D-101/D-105/D-106 or reinterpret historical #77 approval. Keep
docs/PROGRESS.md concise and current, including its stale Blockers/Next action
sections; detailed evidence stays in this plan.

### Version and release

Proposed release: stable minor 0.19.0; annotated tag v0.19.0.

This adds public reconciliation/preview/report capability and a user-visible default
that can remove or move existing H. It exceeds a patch correction to additive
completion. Existing API defaults and persisted schemas remain compatible, so a
major increment is unwarranted. A prerelease is unnecessary once the bounded
workflow passes qualification.

Update all five authoritative sources:

1. pyproject.toml.
2. Root molweave-dev version in uv.lock.
3. apps/web/package.json.
4. FastAPI version in apps/api/src/molweave_api/main.py.
5. APPLICATION_VERSION in apps/api/src/molweave_api/archive_service.py.

Update version assertions and documentation too. Keep dependencies pinned. Recheck
release collisions before C5; if another minor has shipped, use its next minor and
record the adjustment.

Release-note sections: user-visible changes; scientific behavior and limits;
API/data/migration compatibility; verification/performance; deferred/rejected scope
and follow-ups; rollback guidance.

### PR, issue and cleanup

- PR title: feat(modeling): reconcile local hydrogens after bond edits.
- Base: master.
- Merge: normal merge commit preserving checkpoint history; no force push or
  protection bypass.
- PR description identifies implemented, simplified, deferred and rejected
  requirements, confirmed product choices, compatibility, release impact and exact
  validation.
- Use Closes #81 once accepted scope and follow-up tracking are complete. Final
  issue reply follows verified release and explains conservative skips and deferred
  canonical isotope/radical support.
- Create/link only the focused missing isotope/radical follow-up; reuse #82 for
  minimization and #52/#71/#12/#11 for their existing scope.
- After merge, verify remote master, fast-forward local master and test the exact
  merged commit. Tag only that verified commit, then publish and read back the
  release.
- Delete this feature branch only after release, issue response, evidence integration
  and remote verification. Leave unrelated branches untouched.

Merge/release blockers: failed gates; consequential unresolved review findings;
required review/check/protection failures; unsafe isotope/source mapping; invented
chemistry/stereo; lost heavy/unrelated coordinates, source data, identities or
references; broken site/conformer atomicity; stale-response mutation; no-op
publication; missing preceding-reader evidence; unapproved schema changes;
inconsistent versions/tag collision; or unavailable remote publication permissions.

### Progress and completion log

- 2026-10-17 approval/C0 preparation: user approved the full proposed contract with
  “Implement the plan.” The confirmed immediate workflow, bounded profile and
  narrow protection-fact choices are retained. Issue #81 remains open and its
  metadata is unchanged. Initial working tree was clean on master. Fetch and
  fast-forward-only integration confirmed origin/master and local master at
  9f20d9f4c87d4c714638bcf77dc664b7dabdb670. The dedicated branch was created from
  that base, and this plan is its first file change. No implementation, version,
  dependency, migration or release change is included in C0.
- Baseline evidence from planning: in-memory domain probes reproduced the reported
  count/geometry cases and isotope-field loss; focused unit/scientific command
  passed 56 tests in 1.32 seconds. Baseline git diff --check passed and tree stayed
  clean. These results do not qualify any unimplemented reconciliation behavior.
- C0 validation: review this plan/progress-only diff and run git diff --check;
  commit with the required docs(plan) message, push, then verify exact local/remote
  branch SHA and clean state. The C0 commit SHA is discoverable from this document's
  first commit and will be reported after remote readback; it is not self-embedded.
- C1-C6: pending. No runtime implementation or follow-up issue creation has started.
  Record outcomes, exact source/commands/evidence, deviations, limitations, blockers
  and next action as each checkpoint completes.

Approval authorizes C0 only for this planning delivery: persist and push the plan,
report the verified repository state, then stop ready for /goal.
