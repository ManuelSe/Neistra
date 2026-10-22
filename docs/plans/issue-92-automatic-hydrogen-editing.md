# Issue #92 — Automatic hydrogen handling and compact molecular editing

## 1. Status, outcome and authority

**Status:** approved implementation in progress. M1–M5 are implemented and candidate-qualified; PR/review/merge and C6 verified
release delivery remain pending. C0 was committed and remotely verified
at `15705d9c57af285f5b15b33d7a9bf421d072bae6`.

**Approval:** the user's “Implement the plan.” on 2026-10-22 approves the complete
proposal and its explicit C0 stop ready for `/goal`. This authorizes planning
persistence only. Implementation and release work require a subsequent `/goal`.

The user's subsequent `/goal` on 2026-10-22 authorizes implementation and the full
verified PR/review/merge/release/issue-response lifecycle in this contract.

| Item | Planned value |
|---|---|
| Issue | [#92 — Simplify molecular editing](https://github.com/ManuelSe/Neistra/issues/92), open at planning |
| Issue title | Simplify molecular editing with automatic hydrogen handling, consistent styling, and icon-based controls |
| Issue updated | 2026-10-19T13:23:01Z; no comments at inspection |
| Plan path | `docs/plans/issue-92-automatic-hydrogen-editing.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked base | `54533f10df4d8fff763483356a58c4573a445453` |
| Feature branch | `feat/issue-92-automatic-hydrogen-editing` |
| PR title | `feat(editing): automate hydrogens and simplify molecular controls` |
| Merge strategy | Normal merge commit, preserving passing checkpoint commits |
| Proposed release | Stable **0.24.0**, annotated tag **v0.24.0** |

**Approved outcome:** scientists can perform ordinary atom, fragment and bond
edits with conservative local H maintenance, add one H through a bounded
chemistry-aware action, and retain the attachment atom's appearance through one
reversible molecular command.

Confirmed product choices:

- Automatic H handling has **no user-facing policy selector**, including under
  Advanced.
- One-click `+H` covers bounded **C/N/O/S** chemistry.
- H created by `+H` can be reconciled by a later edit at that site; it is not
  permanently protected.
- New atoms inherit the attachment atom's explicit appearance overrides, falling
  back to entry defaults.
- The user removed `debug/`; the working tree was clean before C0.

Authority follows the requested order: explicit user guidance and corrections;
[AGENTS.md](../../AGENTS.md) and accepted [decisions](../DECISIONS.md); existing
architecture, product boundaries, schemas and conventions; issue problems,
outcomes and constraints; nonbinding issue implementation suggestions.
Existing molecular ownership, identity, warning, history and archive decisions
remain binding. This approval explicitly amends the UI defaults and deletion
behavior documented in D-101/D-105/D-107, and addition-time appearance behavior
in D-046/D-054. Historical decisions remain intact. D-140–142 record the new
accepted architectural decisions; checkpoint notes below record implementation. The global
[plan](../PLAN.md) remains unchanged.

### Inspection findings and evidence

Inspection covered AGENTS.md, PRODUCT_SPEC, PLAN, PROGRESS, DECISIONS,
VERIFICATION, direct and legacy editing services, H completion/reconciliation and
protection evidence, placement, publication/history, viewer settings, frontend
ownership, schemas, migrations, jobs, tests, related issues, Git refs, releases,
PR conventions and delivery tooling. Relevant related issues include closed
#69/#74/#77/#81 and open #52/#71/#83/#86.

- Molecular authority already resides in normalized artifacts; Mol* is
  disposable.
- Existing completion is additive. Existing destructive H reconciliation
  supports direct bond edits, with conservative protection and conformer checks.
- Direct atom deletion currently removes exactly the selection, leaving attached
  unselected H.
- New atom IDs do not currently inherit selection-specific appearance
  memberships.
- Project/viewer/archive schemas are **2**, normalized/selection schemas **1**,
  and Alembic head **0014**.
- Contrary to the brief's premise, releases already extend through stable
  [v0.23.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.23.0), whose
  annotated tag resolves to `6536e2a3140d0b8b112562ffec580d37830bc217`.
- All five application version sources contain `0.23.0` at C0.
- Remote inspection found no open PRs, GitHub Actions workflows, repository
  rulesets or protection on `master`. Merge commits are enabled. These settings
  must be checked again before delivery.
- No automated release script or PR template was found.
- The proposed plan path, feature branch and release tag were unused before C0.
- Focused baseline validation passed **59 Python tests and 35 frontend tests**.
  This verifies existing behavior, not implementation of #92.

The exact read-only baseline commands were:

```bash
.venv/bin/python -m pytest tests/unit/editing/test_direct_modeling.py tests/unit/editing/test_hydrogen_completion.py tests/unit/editing/test_hydrogen_reconciliation.py tests/scientific/test_hydrogen_reconciliation.py tests/integration/test_model_edits.py tests/integration/test_hydrogen_reconciliation.py -q
corepack pnpm --dir apps/web exec vitest run molecular-edit-panel manual-modeling representations
```

The Python run passed 59 tests in 5.29s. Vitest passed 35 tests across three
files. These historical baseline results do not replace implementation gates.

## 2. Requirement disposition and implementation contract

### Requirement disposition

| Significant requirement or suggestion | Classification | Treatment and follow-up |
|---|---|---|
| Delete directly attached terminal H with a selected heavy atom, including hidden H | Essential | Add this behavior to automatic editing; preserve exact legacy API deletion semantics. |
| Never leave any orphan H under all circumstances | Rejected as proposed | Guarantee the supported terminal-H cascade using authoritative bonds. Do not infer missing connectivity, clean historical orphans globally, or guess ownership of bridging H. Warn on ambiguity; no separate global-cleanup issue now. |
| Reconcile H after bond creation, breaking and order changes | Essential | Reuse existing endpoint reconciliation. |
| Reconcile attachment sites and complete new atoms/fragments | Essential | Extend the same bounded machinery to placement results and their affected sites. |
| Reconcile after element or explicit charge assignment | Essential | Attempt local maintenance using the assigned state; unsupported chemistry retains the requested direct edit with warnings. |
| Remove completion and bond-H policy controls | Essential; confirmed | Automatic UI behavior only. |
| Preserve incomplete direct editing | Essential | H maintenance cannot impose blanket sanitization or block unsupported direct drafts. Raw API policies remain available. |
| Explicit H deletion must not recreate H immediately | Essential | Suppress maintenance at the explicitly affected H parent for that operation. Do not infer deprotonation or change its charge silently. |
| Add exactly one H per +H click | Essential | One selected heavy atom, one new explicit H, automatic placement, one command. |
| Appropriate parent charge changes and repeated-click limits | Essential | Finite C/N/O/S transition rules, qualified independently of RDKit acceptance. |
| Reject unsupported +H without partial changes | Essential | Charge and geometry succeed together across every conformer or nothing publishes. |
| Permanently protect H added by +H | Rejected as proposed; confirmed | Later site edits may reconcile ordinary H. No persistent user-H constraint or follow-up is needed. |
| Remove standalone completion/count/geometry/orientation controls | Essential | Remove them from the main editing workflow and obsolete completion launchers. Retain legacy HTTP operations. |
| Keep H visibility controls | Already satisfied | Preserve existing display settings and verify their independence from chemistry. |
| Inherit representation and color overrides | Essential; confirmed | Use attachment ancestry and existing durable viewer settings. |
| Preserve element-dependent colors | Essential | Retain element-color tokens and entry color schemes; never copy a rendered RGB value as an element assignment. |
| Invent a molecule-wide style rule from mixed atom overrides | Rejected as proposed | Existing overrides are explicit atom memberships. Follow the confirmed attachment-atom rule; no new style-intent schema or follow-up now. |
| Bond-order +/- and current-order indication | Already partially satisfied | Retain existing stepping behavior and replace the primary dropdown. |
| Aromatic toggle and icon create/break actions | Supporting | Add accessible compact controls without claiming aromatic repair. |
| Unknown bond-order assignment | Supporting | Keep it in Advanced. |
| Compact panel, scientific details on demand and accessible controls | Essential | Remove repeated prose; retain actionable warnings, names, focus and touch usability. |
| Optional bond preview | Optional; retained | Keep the existing preview/Apply workflow. +H itself applies immediately. |
| Undo/Redo, previews, conformers, save/reload and originals | Already supported infrastructure; essential verification | Extend existing transactions and ownership rather than introducing another state model. |
| Reuse or replace hydrogens.add | Supporting intent; replacement rejected | Reuse its placement machinery through a new action. Changing the old operation would break its documented draft-building contract. |
| Arbitrary aromatic, resonance, hypervalent or other-element +H chemistry | Deferred | Created and remotely verified [#114](https://github.com/ManuelSe/Neistra/issues/114), “Qualify broader automatic hydrogen and +H chemistry,” for separate qualification. |
| Canonical isotope/radical authoring and export | Deferred | Existing [#83](https://github.com/ManuelSe/Neistra/issues/83); retain its current protection boundary. |
| Infer missing ligand chemistry or provide comprehensive preparation | Deferred | Existing [#52](https://github.com/ManuelSe/Neistra/issues/52) and preparation work remain separate. |
| Expanded fragments, ring fusion and general building expansion | Deferred | Existing [#71](https://github.com/ManuelSe/Neistra/issues/71). |

No unresolved product decision remains.

### Automatic maintenance and deletion

Add an explicit `hydrogen_policy: "automatic"` to direct model-edit requests. The
UI supplies it for ordinary atom, fragment and bond operations. Existing omitted
`preserve`, additive `complete_if_possible`, and bond-only
`reconcile_if_possible` behavior stays compatible.

Automatic maintenance will:

- Apply the requested direct edit first, then maintain only changed/new heavy
  sites and immediately affected canonical neighbors. It will not recursively
  saturate the structure.
- Reuse completion, reconciliation, coordination, stereo and source-protection
  helpers. Support newly created parent/H identities rather than assuming every
  target existed before placement.
- Preserve assigned charges during routine maintenance. Only an explicit charge
  edit or qualified +H transition changes formal charge.
- Remove/reposition ordinary terminal H only where existing protection and
  chemistry evidence permit it. Ambiguous/protected sites retain the direct edit
  and receive precise diagnostics.
- Stage every site across all conformers before accepting its H changes.
  Independent sites may succeed with an explicit partial report.
- Retain heavy coordinates produced by the requested edit and all unrelated
  coordinates exactly.

Automatic heavy-atom deletion also deletes H whose sole authoritative bonded
neighbor is a selected heavy atom. This is part of the explicit deletion request,
including represented labelled H. Nonterminal/bridging H and display-only inferred
connectivity do not authorize speculative cascading.

Explicit H deletion and H-endpoint bond breaking remain literal at the affected
parent. Existing unsupported chemistry remains editable with warnings.

### One-click +H

Add `hydrogens.add_one` to the existing discriminated model action union. It has
no count, geometry or orientation inputs. Use the existing model-edit route,
revision/artifact/lock guards and publication path.

Initial supported valence ceilings and charge transitions are:

| Parent state | H may fill toward valence | Charge transition once that valence is reached |
|---|---:|---|
| C0 | 4 | None |
| N0 | 3 | N+1, final valence 4 |
| N+1 | 4 | None |
| O-1 | 1 | O0, final valence 2 |
| O0 | 2 | O+1, final valence 3 |
| O+1 | 3 | None |
| S-1 | 1 | S0, final valence 2 |
| S0 | 2 | S+1, final valence 3 |
| S+1 | 3 | None |

Charge-changing steps require an ordinary, nonaromatic, nonconjugated single-bond
environment. Sulfur support is limited to these ordinary single-bond states; it
excludes hypervalent S, sulfoxides/sulfones and metal coordination. Unlisted states
refuse.

Valence-deficit filling adds one H toward the supported state; it does not claim
that the resulting explicit draft is fully completed or prepared. Existing
assigned multiple-bond geometry may support deficit filling, but not a new
charge-changing transition outside the table.

Other requirements:

- Count all canonical bonds and H, including hidden atoms.
- Refuse unknown incident chemistry, protected/ambiguous identity, unusable
  conformers and undetermined new stereochemistry.
- Preserve existing atoms and coordinates; generate one new H coordinate in each
  conformer.
- Publish H, any parent-charge change, provenance, descriptor invalidation and
  warnings atomically.
- Leave artifacts, history, Redo, dirty state and allocators unchanged on refusal.
- Keep the heavy parent selected, enabling deliberate repeated clicks.
- Disable obvious unavailable contexts. Server refusals provide a concise
  explanation; do not duplicate scientific eligibility logic in JavaScript or
  add a separate eligibility endpoint.

This boundary is intentionally narrower than RDKit's allowed-valence model. The
pinned 2026.03.4 probe accepted higher-charge O/S examples that this action must
reject: `[OH4+2]` and `[SH4+2]` sanitized, while `[CH5]` and `[NH5+2]` did not.
Ordinary ammonium, hydronium and the probed sulfonium states sanitized. This was a
read-only feasibility probe, not scientific qualification of the proposed action.
RDKit documents its general valence and charged-atom rules in the
[RDKit Book](https://www.rdkit.org/docs/RDKit_Book.html#valence-calculation-and-allowed-valences).

No pH choice, pKa prediction, tautomer selection, global embedding or minimization
is introduced. New automatic maintenance must support the qualified resulting
sulfur states without changing legacy policy profiles or reinterpreting old
requests.

### Appearance, UI and ownership

Carry a typed internal new-atom-to-appearance-source mapping through direct edit
results:

- Attached atoms/fragments inherit the heavy attachment atom's overrides;
  terminal-H replacement resolves to its heavy parent.
- Generated H inherit their actual parent's appearance. Resolve ancestry through
  newly created fragment atoms.
- Unattached first/disconnected atoms use entry defaults.
- Extend applicable representation memberships and copy explicit color tokens.
  Preserve `"element"` as a token; explicit custom hex colors remain custom
  colors.
- Keep visibility, isolation, H preferences, independent surfaces and named
  selections under their existing ownership. Do not expand their explicit
  memberships.
- Extend polymer representation membership only through existing valid residue
  semantics. Named scenes remain snapshots; additions do not rewrite old scene
  memberships.

Coalesce appearance inheritance and deleted-reference pruning into the **same
existing molecular command**, using existing reversible viewer-setting actions.
They must not overwrite one another or restore deleted IDs accidentally.

The compact panel retains named tool groups and element symbols, adds +H beside
atom actions, and uses icon create/break, bounded +/-, a visible order indicator
and an aromatic toggle. Turning aromatic off assigns single order; stepping is
unavailable while aromatic or unknown. Advanced retains unknown-order assignment
and explicit element/charge controls.

Remove the H tools disclosure, policy preferences and obsolete “Build H…”
completion path. Keep explicit H removal and separate protein preparation
workflows. Preserve placement inspection, optional bond preview, scientific
disclosures, keyboard access and 44px touch targets. Tooltips must work on
keyboard focus as well as pointer hover.

### Interfaces and compatibility

- **HTTP:** additive automatic policy and `hydrogens.add_one`; reuse existing
  routes and result envelopes. Extend reconciliation reporting for automatic
  operations without changing existing meanings.
- **Internal types:** typed affected-site and appearance-source data; no renderer
  objects in domain or application stores.
- **Persistence:** existing normalized artifacts, annotations/inferences and
  generic history actions. No new persistent H constraints.
- **Schemas/migrations:** retain current schema versions and Alembic 0014; no
  data rewrite.
- **Jobs/plugins:** no new job, calculation framework or plugin contract.
- **Performance:** reuse request-local indexes and existing bounded chemistry
  budgets; no per-site full-structure serialization or whole-protein
  sanitization.
- **Rollback:** old runtimes may retain compatible data/history while lacking the
  new authoring behavior. Matching client/API versions remain required.

## 3. Milestones and checkpoints

Every checkpoint updates this plan's log with its commit, acceptance results,
exact commands, evidence, deviations, limitations, blockers and next action.
[PROGRESS](../PROGRESS.md) receives only a concise project summary.

### C0 — Persist the approved contract and stop

**Outcome:** a remotely verifiable planning branch with implementation pending.

After explicit approval and when write execution is enabled:

1. Confirm a clean tree, fetch origin and fast-forward local master from
   origin/master using `--ff-only`.
2. Reconfirm cleanliness, base identity and path/branch/tag availability. Material
   upstream changes require reassessment.
3. Create `feat/issue-92-automatic-hydrogen-editing`.
4. Create this feature plan as the first branch change, recording actual approval
   and base SHA.
5. Add the concise planning summary to docs/PROGRESS.md.
6. Append the automatic-H, bounded +H, and appearance-inheritance decisions to
   docs/DECISIONS.md, using the next available decision numbers and marking
   implementation pending.
7. Validate links, approved scope, unchanged global plan and `git diff --check`.
8. Commit exactly **`docs(plan): add approved plan for issue 92`**.
9. Push if available and verify the remote branch SHA.
10. Report the exact plan path, branch, commit, milestones and minor-release
    impact. **Stop ready for `/goal`.**

No version bump, implementation, PR, issue comment, follow-up issue, tag or
release occurs in C0. Rollback is a documentation revert.

### M1 / C1 — Automatic local maintenance

**Outcome:** the direct API supports automatic atom/fragment/bond maintenance and
terminal-H cascading.

**Affected areas:** domain edits, reconciliation/protection recovery, preview and
API publication.

**Acceptance:** supported edits produce bounded local H changes;
unknown/protected chemistry preserves the requested draft with diagnostics;
explicit H deletion is not reversed; all conformers and deleted references remain
consistent; legacy policy behavior remains unchanged.

**Focused validation:**

```bash
.venv/bin/uv run --frozen pytest tests/unit/editing tests/scientific tests/integration \
  -k "automatic_hydrogen or hydrogen_reconciliation or model_edits"
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/bond-hydrogen-reconciliation.spec.ts
```

**Documentation/migration:** update API, molecular-model/editing guidance,
limitations and decision implementation notes. No migration.

**Expected commit:** `feat(editing): add automatic local hydrogen maintenance`.

**Rollback:** revert the new policy and its callers together; existing persisted
action vocabulary remains readable.

### M2 / C2 — Bounded one-click H addition

**Outcome:** a working +H button performs one qualified, reversible addition.

**Affected areas:** operation-specific chemistry, model action/API types,
publication, atom controls and workflow tests.

**Acceptance:** ammonia/ammonium, water/hydronium and bounded sulfur examples
pass; saturated C and unsupported higher charges refuse; one failed conformer
prevents the whole action; no invalid request consumes history or identities;
repeated clicks retain the selected parent and stop at the supported limit.

**Focused validation:**

```bash
.venv/bin/uv run --frozen pytest tests/unit/editing tests/scientific tests/integration \
  -k "single_hydrogen or automatic_hydrogen"
corepack pnpm --dir apps/web exec vitest run molecular-edit-panel
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/automatic-hydrogen-editing.spec.ts
```

**Documentation/migration:** publish the finite chemistry table, refusals,
provenance and distinction from preparation. No migration.

**Expected commit:** `feat(editing): add bounded one-click hydrogen addition`.

**Rollback:** remove the new action/button together. Existing generic molecular
history remains interpretable.

### M3 / C3 — Atomic appearance inheritance

**Outcome:** committed additions immediately match their attachment context and
restore exactly through history.

**Affected areas:** internal edit results, viewer-setting algebra, molecular
publication and rendered appearance tests.

**Acceptance:** atom, fragment, replacement and generated-H ancestry resolve
correctly; representation and element/custom colors persist through Undo/Redo,
save/reload and archives; pruning and inheritance coexist; unrelated settings and
historical scene memberships remain unchanged.

**Focused validation:**

```bash
.venv/bin/uv run --frozen pytest tests/unit tests/integration \
  -k "appearance_inheritance or model_edits or hydrogen_reconciliation or archive_roundtrip"
corepack pnpm --dir apps/web exec vitest run representations molecular-edit-panel
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/automatic-hydrogen-editing.spec.ts \
  tests/e2e/direct-molecular-modeling.spec.ts
```

**Documentation/migration:** document attachment inheritance and append the
D-046/D-054 amendment. Existing viewer fields and action types suffice.

**Expected commit:** `fix(editing): inherit attachment appearance in molecular commands`.

**Rollback:** revert inheritance behavior without stripping stored memberships;
older readers must retain them.

### M4 / C4 — Compact controls and complete user workflow

**Outcome:** automatic handling and +H become the coherent primary editing
workflow.

**Affected areas:** panel/store state, obsolete completion launchers, bond
controls, preview ownership, accessibility and browser tests.

**Acceptance:** removed controls cannot reopen through another launcher; every
direct UI edit sends automatic policy; aromatic/unknown/limit states are explicit;
warnings remain discoverable; keyboard focus, touch targets, both themes, 320px
layouts and actual 200% zoom pass; stale responses cannot restore obsolete UI or
affect another project.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run molecular-edit-panel manual-modeling representations
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/automatic-hydrogen-editing.spec.ts \
  tests/e2e/molecular-editing.spec.ts \
  tests/e2e/direct-modeling-accessibility.spec.ts \
  tests/e2e/rebranding-zoom.spec.ts
```

**Documentation/migration:** update editing, accessibility and verification
guidance. Remove obsolete transient preferences only; no persisted preference
migration.

**Expected commit:** `refactor(editing): simplify molecular editing controls`.

**Rollback:** revert UI routing and store changes together; retain matching
backend/client versions.

### M5 / C5 — Compatibility, qualification and release preparation

**Outcome:** a reviewed, final-version candidate ready for PR and merge.

**Affected areas:** scientific/workflow regressions, actual-reader qualification,
evidence, documentation and version sources.

**Acceptance:** complete release gate passes; actual v0.23.0 and final 0.24.0
readers retain supported data in both directions; unchanged performance budgets
pass; all consequential review findings are resolved.

**Focused validation:**

```bash
.venv/bin/uv run --frozen pytest tests/integration/test_archive_roundtrip.py tests/scientific
corepack pnpm --dir apps/web test
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/automatic-hydrogen-editing.spec.ts \
  tests/e2e/export-archive.spec.ts \
  tests/e2e/release-hardening.spec.ts
```

Extend the existing actual-reader qualification approach with issue #92 fixtures:
automatic deletions/reconciliation, +H charge transitions, inherited appearance,
independent conformers and rich existing project state. Verify real module paths
and versions in separate processes; changing producer-version strings is
insufficient.

**Documentation/migration:** complete verification, scientific limits,
compatibility, performance/accessibility evidence, release notes and progress.
Confirm unchanged migration head and schema versions.

**Expected commits:** substantive `test(editing): ...` / `docs(editing): ...`, then
`chore(release): prepare v0.24.0`.

**Rollback:** retain complete managed-data backups and the previous qualified
runtime. No schema downgrade or data stripping.

### M5 / C6 — Verified delivery

**Outcome:** merged implementation, verified stable release, accurate issue
response and completed audit.

Repeat the full gate on the exact merged commit, publish only after it passes,
and verify remote PR/tag/release/issue state. Record final post-merge evidence
through the repository's documentation-audit PR convention; never retarget the
runtime tag.

**Focused validation:** complete gate below, candidate/merged source-identity
comparison, actual-reader qualification, remote tag dereference, release
flags/notes/assets and downloaded asset hash verification.

**Documentation/migration:** finalize plan/progress/verification logs; no
migration.

**Expected commit:** `docs(release): record verified v0.24.0 publication`, only
when substantive audit documentation exists.

**Rollback:** hold publication if merged verification fails. Correct through a
reviewed PR; never move a published tag.

After each implementation milestone, run relevant Python lint/type checks,
frontend lint/type checks/tests, the production build and its listed browser
tests. Fix failures before proceeding.

## 4. Acceptance and verification evidence

### Required scenarios

Tests must assert exact molecular records, charge changes, stable identities,
conformer rows and relevant settings—not counts alone.

- Hidden terminal H, multiple selected heavy atoms, explicit H deletion,
  last-atom deletion and ambiguous/nonterminal H.
- Atom/fragment attachment, H replacement, bond creation/deletion/order changes,
  element changes and explicit charge assignment.
- Supported independent sites alongside unknown, protected, aromatic,
  conjugated or budget-limited sites.
- C valence limits; NH3 to NH4+; H2O to H3O+; thiolate to thiol and ordinary
  sulfide to sulfonium; repeated-click caps and rejected higher-charge O/S states.
- All conformers, nonfirst active conformers, incompatible alternate sites,
  stereo ambiguity and late conformer failure.
- Exact no-change behavior on invalid/stale/locked requests, including Redo and
  allocation floors.
- Appearance inheritance under atomic/polymer overrides, element tokens, custom
  colors and mixed local styling.
- One atomic Undo/Redo restoring molecules, warnings and appearance;
  save/reload/archive/original-byte retention.
- Preview Cancel/Apply, project switching, selection changes, responsive
  remounts and movement/minimization ownership.
- Native viewer workflows, both-theme accessibility, keyboard tooltips/focus,
  mobile layouts and actual browser zoom.
- Existing scientific, job, export, surface, interaction and minimization
  regressions.

### Complete release gate

Run before opening and merging the implementation PR, and again on the exact
merged commit:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=/tmp/neistra-issue92-fresh .venv/bin/uv run alembic upgrade head
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

Use fresh disposable data directories for each gate. Supply the locked AmberTools
environment required by existing native scientific tests and bounded native
thread settings (`OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`). Native scientific
skips are not acceptable release evidence. Record any isolated Playwright
port/data-directory overrides; never run migrations or qualification on live user
projects.

Also verify:

- Five-version consistency.
- Actual previous/current reader compatibility in both directions.
- Unchanged representative import, interaction, longest-task, request-count,
  movement, surface and minimization budgets.
- Shared automatic-maintenance work accounting within existing
  site/H/context/coordinate/diagnostic caps.
- Production builds exclude test harnesses.

Store source identities, exact commands, environment, results, lossless logs,
screenshots, timings, compatibility evidence and review findings under
`docs/assets/automatic-hydrogen-editing/`. Keep failed diagnostics separate from
final passing evidence.

The completion log starts with inspection/product decisions and C0
approval/base/commit. C1–C6 remain pending until their evidence exists.

## 5. Version, PR and release plan

### SemVer decision

Use stable **0.24.0**, incrementing the established **0.23.0** baseline.

- **Minor:** adds a public model action, an automatic editing policy, bounded
  charge-changing H addition and new user-visible editing behavior.
- **Patch is insufficient:** this extends scientific and API capability beyond
  correction of existing behavior.
- **Major is unnecessary:** existing request defaults, legacy operation meanings,
  durable action types and persisted/archive schemas remain compatible.
- **Prerelease is unnecessary:** the repository already publishes stable 0.x
  releases. Incomplete scientific qualification must block release rather than
  be hidden behind a prerelease label.

Update all five authoritative version locations in the implementation PR:

1. `pyproject.toml`
2. Root molweave-dev package version in `uv.lock`
3. `apps/web/package.json`
4. FastAPI version in `apps/api/src/molweave_api/main.py`
5. APPLICATION_VERSION in `apps/api/src/molweave_api/archive_service.py`

Update current-version assertions and archive provenance coverage. Do not
upgrade dependencies as part of this work. A version/tag collision or discovered
compatibility break requires a recorded plan amendment.

### PR, issues and cleanup

- Open the implementation PR only after the complete candidate gate and
  full-diff review pass.
- Include implemented, simplified, deferred and rejected issue requirements,
  scientific boundaries, compatibility, validation and evidence links.
- Create the bounded broader-H follow-up described in the matrix; reuse existing
  issues for isotope/radical identity, chemistry assignment and expanded building.
- Use `Closes #92` only when the approved scope is delivered and deferred work is
  explicitly linked. Do not mark unsupported original checkboxes as implemented.
- Recheck branch protection, required reviews, status checks and unresolved
  conversations before normal merge. Never bypass them or imply independent
  review occurred when only self-review exists.
- After merged qualification, create annotated v0.24.0 from that exact verified
  merged master commit.
- Publish a stable GitHub release and verify its tag target, release flags,
  notes and downloadable evidence.
- Post a final issue reply covering delivered behavior, scope decisions,
  limitations, follow-ups, verification and exact PR/release links.
- Record final audit documentation through a documentation-only PR. Keep the
  released runtime tag fixed.
- Delete only the verified merged feature/audit branches and task-owned temporary
  worktrees after delivery. Preserve unrelated branches and user data; verify
  cleanup remotely.

### Release-note sections

1. Automatic editing and compact controls.
2. Supported +H chemistry and examples.
3. Scientific limits and unsupported states.
4. Appearance, history and persistence.
5. API compatibility, migrations and rollback.
6. Verification and performance.
7. Deferred work and follow-up issues.

### Merge and release blockers

Block merge or release for:

- Partial +H charge/coordinate publication, unsupported charge escalation or
  failure to stop repeated additions.
- Recreated explicitly deleted H, unintended protected-H reconciliation or
  unsupported direct edits being blocked by maintenance.
- Lost originals, reused identities, conformer corruption, stale publication,
  incorrect history or overwritten appearance/pruning.
- Failed actual-reader/archive compatibility or an unplanned migration/API break.
- Inaccessible required controls or concealed scientific warnings.
- Failed required checks, unexplained test exclusions/flakes, native scientific
  skips, changed performance budgets or unresolved consequential review findings.
- Inconsistent versions, tag collisions, unverified merged source identity or
  missing release evidence.

Approval and C0 persistence do not authorize implementation. The handoff ends with
the approved contract committed and the repository ready for `/goal`.

## 6. Progress and completion log

### 2026-10-22 — Inspection, product choices and approval

- Completed the read-only inspection summarized above at master
  `54533f10df4d8fff763483356a58c4573a445453`.
- Confirmed automatic-only UI policy, bounded C/N/O with bounded S added by the
  user, later reconciliation of ordinary +H additions, and attachment-atom
  appearance inheritance.
- User removed the previously untracked debug directory; subsequent status was
  clean. No private molecular files were moved or committed by this task.
- Existing behavior passed 59 focused Python tests and 35 frontend tests.
- User approved the complete proposal with “Implement the plan.” C0-only stop
  remains part of the approved contract.

### 2026-10-22 — C0 planning persistence

- Clean master fetched and fast-forward-checked against origin/master; both
  remained `54533f10df4d8fff763483356a58c4573a445453`.
- Feature branch created from that base after local/remote availability checks.
- This plan was created as the first branch change. D-140–142 and the concise
  project progress entry accompany it, with implementation pending.
- Documentation/link/scope checks passed: local Markdown targets, whitespace,
  code fences, required sections and confirmed choices, append-only historical
  decisions, unchanged global plan and documentation-only changes. All five
  application versions remain 0.23.0.
- Commit/remote evidence is supplied by the separately verified final C0 handoff;
  this planning commit does not embed its own SHA. Its required subject is
  `docs(plan): add approved plan for issue 92`.
- Known limitations: all proposed feature behavior remains unimplemented; baseline
  tests qualify only the existing code. Full implementation/release gates remain
  pending.
- Blockers: none identified for planning persistence.
- Next action after C0 verification: stop ready for `/goal`; do not begin M1.

| Milestone/checkpoint | Status |
|---|---|
| C0 — Approved planning persistence | Complete; remote commit 15705d9 |
| M1/C1 — Automatic local maintenance | Complete; checkpoint 1701fb9 |
| M2/C2 — Bounded one-click H addition | Complete; checkpoint af775c7 |
| M3/C3 — Atomic appearance inheritance | Implemented and qualified; checkpoint commit follows this log |
| M4/C4 — Compact controls and complete workflow | Next |
| M5/C5 — Qualification and release preparation | Pending |
| M5/C6 — Verified delivery | Pending |

### 2026-10-22 — M1/C1 automatic API maintenance

- Added the explicit automatic policy, one-hop canonical targets, operation-local
  explicit-H suppression and terminal-H deletion cascade. Existing omitted and
  explicit legacy policies retain their contracts.
- Generalized reconciliation for new identities and protection evidence in the
  edited draft, with bounded S-1/S0/S+1 single-bond states only in the new policy.
  Site/diagnostic caps retain full totals; failed conformer work is charged before
  materialization. Moved-H reporting now uses one ID set rather than a repeated
  retained-atom/site scan.
- New domain/scientific/API tests verify counts, independent ideal coordination,
  new/empty entries, conformers, explicit H intent, protected labelled material,
  unsupported drafts, request guards, pure placement preview, one-command exact
  Undo/Redo, original bytes and native archive retention.
- [Final gate](../assets/automatic-hydrogen-editing/c1-final-gate.json) passes all
  nine recorded commands: **58 focused Python, 313 frontend, six native browser
  cases**, Ruff, mypy (101 source files), ESLint, TypeScript, production build and
  diff whitespace. Source identities remain unchanged through the run; compressed
  logs preserve exact commands, isolated ports/data paths and exit codes.
- [Checkpoint review](../assets/automatic-hydrogen-editing/c1-review.md) is local
  self-review, not independent review. Earlier passing attempt1 predates the
  review's accounting improvements; final evidence supersedes it. Initial local
  formatting/mypy diagnostics were repaired before final qualification.
- API/model/limitations documentation updated. No schema, migration, dependency,
  original-file or application-version change; all five versions remain 0.23.0.
- Known limitations: the UI still exposes its historical controls until M4; +H,
  appearance inheritance and complete release/previous-reader gates are pending.
  C1 does not claim final issue completion or broader supported chemistry.
- Blockers: none. Next action: commit this coherent passing C1 state, then M2.

### 2026-10-22 — M2/C2 bounded one-click +H

- Added hydrogens.add_one on the existing guarded model route and one immediate
  atom-panel action. It adds one explicit H and qualified parent charge together,
  retains the selected heavy parent, and uses the approved finite C/N/O/S table.
  Legacy count/geometry actions retain their contract; the old UI remains until M4.
- Reused the additive placement/conformer/stereo machinery with automatic geometry
  guards enabled for this operation. Source/protection unknowns, unsupported local
  states, conjugated/unknown-neighbor charge transitions and undetermined new
  sulfonium stereo refuse atomically. Stereo assessment cannot assign labels from
  protected or unknown dependency identity; explicit source facts remain intact.
- The explicit-H sulfur probe reproduced the implicit-H stereo omission. The
  operation checks the actual candidate before publication and refuses asymmetric
  new sulfur centres without retained defining geometry; symmetric sulfide works.
- Tests verify deficit filling, finite repeat limits, NH3/NH4+, water/hydronium,
  thiolate/thiol/sulfonium, unknown/radical/isotope/hypervalent/amide/aromatic
  refusals, exact retained rows/all conformers, pure rejection/Redo, exact one-command
  history, original/archive retention and later automatic removal after an explicit
  charge edit. Synthetic seed92 fixtures and checksums are documented in FIXTURES.
- [C2 passing gate](../assets/automatic-hydrogen-editing/c2-attempt3-gate.json)
  passes all ten commands: **64 focused Python,26 panel/314 total frontend,
  8 native browser cases**, Ruff, mypy102, ESLint/types/build/diff. Browser cases
  cover all three fixture species in both layouts and ammonia with all H hidden,
  exact camera/selection retention, refusals, Undo/Redo, save/reload and originals.
  Source/log identities verify. Earlier type/format diagnostics are retained in
  attempt1/2 and do not qualify the final source.
- [Local checkpoint review](../assets/automatic-hydrogen-editing/c2-review.md)
  records scientific/compatibility/accounting findings; no independent review is
  claimed. No new schema, migration, dependency or version; all five remain0.23.0.
- Known limitations: placement is unoptimized; no pKa/physiological-state prediction.
  Broader H chemistry is deferred per contract. Appearance inheritance, compact UI
  and full candidate/actual-reader/merged release gates remain pending.
- Blockers: none. Next action: commit passing C2, then M3 appearance inheritance.

### 2026-10-22 — M3/C3 atomic appearance inheritance

- Direct edit results now carry private creation ancestry. Heavy atom/fragment
  attachment and terminal-H replacement resolve to the heavy anchor; H resolve
  through their actual parent/new-fragment ancestry. Unattached atoms use defaults.
- The API copies applicable existing representation/color memberships, preserving
  element tokens. Existing complete valid polymer memberships extend; unsupported
  partial assignments warn and retain scope. No renderer data or ancestry field is
  persisted, and visibility/H preferences/surfaces/named selections do not expand.
- Existing publication/history coalesces proposed live appearance and deleted-ID
  pruning into one reversible entry update. Named scenes remain snapshots. Generic
  callers keep their defaults and action vocabulary; old readers need no new kind.
- [C3 gate](../assets/automatic-hydrogen-editing/c3-attempt1-gate.json) passes all
  ten commands: **71 focused Python,35 projection/panel/314 total frontend,
  20 native browser cases**, Ruff, mypy102, ESLint/types/build/diff, unchanged
  source identities. An [additional shared-path gate](../assets/automatic-hydrogen-editing/c3-reference-gate.json)
  passes17 viewer-state/command regressions. Compressed log hashes verify.
- New unit/API tests cover ancestry, defaults, hex/element tokens, supported and
  incomplete polymer targets, simultaneous deletion/pruning/inheritance, exact
  combined Undo/Redo, scene boundaries, save/archive retention and invalid internal
  ancestry. Native observations read actual renderer component and overpaint atom
  membership after rebuilding, including the new H, in both layouts. No state is
  injected by the observation harness; the production bundle remains unchanged.
- [Local review](../assets/automatic-hydrogen-editing/c3-review.md) finds no
  unresolved consequential C3 issue; it is self-review, not independent review.
  API/architecture/project/editing documentation updated; no migration, schema,
  dependency or version change. All five versions remain0.23.0.
- Known limitations: mixed explicit memberships remain explicit, not reconstructed
  molecule-wide rules; historical scenes do not gain new members. M4 controls and
  full actual-reader/candidate/exact-master gates remain pending.
- Blockers: none. Next action: commit passing C3, then M4 compact automatic UI.

### C4 in-progress qualification and follow-up — 2026-10-22

C3 is committed at `db63fb5`. C4 removes obsolete UI/store preferences and the
Build H launcher while preserving HTTP operations, explicit H removal and protein
preparation. Automatic routing includes the advanced direct-edit inspector.
Bounded bond controls and keyboard tooltips have focused coverage. Passing static,
production build and frontend results currently include43 focused/318 total tests;
complete native requalification remains pending, so C4 is not yet committed.

The initial C4 native gate and focused diagnostic are retained separately. Their
failures identified obsolete count/allocator/label assumptions and two legacy
fixture admission boundaries. The XYZ fixture has protected unknown H; the
historical complex lacks recoverable local identity for +H. These guards remain
unchanged. Its native-picking regression uses explicit retained additive HTTP
fixture setup and does not claim +H admission for that archive. All native checks
must pass before completion.

Created and remotely read back [follow-up#114](https://github.com/ManuelSe/Neistra/issues/114).
The connector's create action returned403; the authenticated CLI created it without
changing repository/integration permissions. #83/#52/#71 continue their existing
scope. No additional chemistry or global cleanup scope has been added.

### M4/C4 complete — 2026-10-22

[C4 final gate](../assets/automatic-hydrogen-editing/c4-attempt2-gate.json) passes
all9 commands:43 focused/318 total frontend tests,57 native cases and5 existing
layout exclusions, Ruff/mypy102/ESLint/TypeScript, production build and diff check.
Native cases cover both themes,320px layouts, actual100–200% browser zoom,
focus/tooltips/touch targets, previews, hidden-H deletion, exact history/originals,
legacy HTTP compatibility, inspector routing, native picks and delayed-response
ownership. Zero failures/flakes/retries. Every source and decompressed-log hash
verifies. [Screenshots](../assets/automatic-hydrogen-editing/c4-screenshots.json)
and [implementer review](../assets/automatic-hydrogen-editing/c4-review.md) are retained.
The two earlier diagnostic attempts are separate from passing evidence.

The automatic-only compact workflow is complete. Advanced retains unknown/order
assignment and atom/charge details, without a policy selector. Dedicated +H is
immediate; legacy HTTP helpers, general explicit atom building, H display/removal
and protein preparation retain their contracts. No schema, migration, dependency
or version change. #114 is remotely verified. No blocker or unresolved consequential
checkpoint finding; C4 commit follows this evidence update. Next: C5 actual-reader,
final-version full candidate qualification and full-diff review, then verified PR
and release delivery.

### M5/C5 compatibility preflight — 2026-10-22

C4 is pushed/remotely verified at aeaa6909eaaf834eac67c0e526a9c22c424aa6be;
origin/master remains54533f10df4d8fff763483356a58c4573a445453 after fetch.
[Preflight](../assets/automatic-hydrogen-editing/c5-preflight1-gate.json) passes
all15 commands:107 focused Python,321 frontend,14 native browser cases,
static/type/build checks, fresh0014 migrations and actual-module readers.
Six new current→actual-tagged0.23.0 cases exercise ammonium, hydronium, sulfonium,
terminal-H cascade, closure and inherited fragment appearance with independent
active9 conformers. Canonical records, live settings, scene snapshots, original
hashes, allocation floors, Undo/Redo, save/archive/import/re-export retain exactly.
The reverse actual-old producer→current reader retains its three-entry rich project,
five prior editing commands, saved selections, measurements, three independent
surface kinds, scenes and jobs. Both actual module paths and tagged6536e2a are
checked; this is not producer-version-string substitution. Preflight still uses
current development version0.23.0. Repeat with final0.24.0 in both complete gates.

Review found that normalized legacy drafts may contain numeric orders outside
single/double/triple (even nonaromatic1.5). Restrict compact stepping to1/2/3;
explicit Advanced assignment remains. Three focused edge cases pass, preventing
invalid arithmetic requests without restricting direct drafting. No new chemistry,
schema, migration, dependency or product decision. Full-diff integration review
covers core policy/charge/protection, atomic publication/appearance/pruning, UI
ownership and legacy callers; final source/version release review remains pending.
All source/decompressed-log hashes verify. Next: commit this coherent compatibility
checkpoint, prepare all five0.24.0 version sources/release notes, and run complete
frozen candidate qualification before PR creation.

### C5 final-version release preparation — 2026-10-22

Compatibility checkpoint df60afe is committed. Origin/master and latest stable
v0.23.0 remain unchanged after fetch/remote verification; v0.24.0 is unused.
Prepare all five authoritative sources as0.24.0, add0.23.0 archive-provenance
coverage and update release notes. Locked dependency resolution remains identical
to inspected base after the root package version is normalized. No migration or
schema change. The stable minor decision remains correct for new public API,
scientific operation and UI behavior with existing request/data compatibility.

The release-preparation commit is `chore(release): prepare v0.24.0` after focused
archive/version checks pass. A complete fresh-data candidate gate, native scientific
qualification without skips, actual0.23.0↔final0.24.0 readers, unchanged performance
budgets and final full-diff review must pass before creating the PR. No tag,
release, merge or completion is claimed by this preparation.

Release-preparation focused evidence: `.venv/bin/python /tmp/neistra-92-versions.py`
confirms all five0.24.0 sources, unchanged locked dependency resolution and no native
observation harness in production assets. `MOLWEAVE_DATA_DIR=/tmp/neistra-issue92-release-prep
.venv/bin/uv run --frozen pytest tests/integration/test_archive_roundtrip.py -q`
passes34 cases in18.30s. `.venv/bin/uv run ruff check .` and `git diff --check` pass.
The complete candidate gate will archive the version auditor/qualifier and repeat
all checks on final source; these focused checks do not authorize publication.

### C5 scientific review correction — 2026-10-22

Candidate1 is intentionally interrupted and remains diagnostic, not a qualified
release. Its exact source746c4cf passed1241 Python (zero skips),321 frontend,
8 supervisor, installs/migration/static/build checks, but full browser/reader/
release qualification did not finish. No merge or release occurred.

A further independent geometric counterexample exposed an approved-scope gap:
mirror-related conformers of `NC(F)Cl` (missing explicit C-H) or tertiary amine
`CN(CC)CCC` could accept +H while reporting conflicting new stereo and choosing no
universal tag. The two mirrored cases fail first in the retained
[c5-stereo-red](../assets/automatic-hydrogen-editing/c5-stereo-red-gate.json) evidence;
the two translation controls already pass. The contract requires atomic refusal
for undetermined new stereo, so warning-only behavior is insufficient for +H.

Add a typed, opt-in consistency requirement to the shared stereo assessment and
activate it only for the bounded one-H action. Existing ordinary/additive helpers
and automatic direct drafts retain their default warning behavior. Incomplete
stereo assessment, unresolved geometry or conformer disagreement now refuses +H
before publication. This reuses existing bounded analysis; it does not add another
perception algorithm, global sanitization or source rewrite. The explicit-H sulfur
admission check remains. API regressions retain a real Redo branch and compare
persisted GET snapshots, every conformer/charge, artifact/command counts, originals
and allocator floors after refusal. Translation controls retain exact old rows and
one consistent tetrahedral tag. All45 immediate targeted cases pass; a complete
source-bound correction checkpoint and fresh final candidate gate are pending.

### C5 stereo correction qualified — 2026-10-22

[Correction gate](../assets/automatic-hydrogen-editing/c5-stereo-green-gate.json)
passes all15 commands:114 focused Python,321 frontend,14 native, all static/type/
build checks, fresh0014 databases and actual final0.24.0↔tagged0.23.0 readers.
Six new cases forward and the rich prior project reverse remain exact. Source and
decompressed-log hashes verify, including separately retained red and interrupted
candidate1 diagnostics. Mirror C/N requests refuse with no charge/data/artifact/
history/Redo/allocator/original change; translated controls retain consistent stereo.
Local review confirms the opt-in flags leave legacy/direct warning defaults intact
and reuse existing bounded assessment. No schema, dependency, version increment or
new product scope is needed. Fix checkpoint follows; next is fresh complete
candidate2 qualification, final review and PR. No unresolved consequential source
finding remains; publication is still blocked on the complete delivery gates.

### C5 broad journey assertion update — 2026-10-22

Candidate2 (source6b2a467) passes1247 Python without skips,321 frontend,
8 supervisor, installs/migration/static/build and the executed native performance,
zoom, rendering, chemistry and workspace checks. The broad release journey exposed
an obsolete pre-automatic assertion: adding a disconnected C0 now creates C+4H,
so3 atoms become8, not4. The same assumption existed in the viewer-theme lifecycle.
Candidate2 was intentionally stopped and is diagnostic, not release qualification.

Update those two workflows to current behavior without changing production code.
The release journey now also asserts exact retained records/coordinates, the
explicit carbon position, all four H identities and four single C-H edges. Theme
selection counts include the new H. Grep of all generic Add/Apply-order/bond UI
callers found these remaining stale-count sites; other direct workflows were
already qualified in C4. The [focused journey gate](../assets/automatic-hydrogen-editing/c5-journey-gate.json)
passes all6 commands:321 frontend,2 complete native journeys/2 existing desktop-only
exclusions, lint/type/build/diff. All source/log hashes verify. Comparing its source
snapshot to candidate2 proves exactly these two test files differ; production is
unchanged. Commit this coherent test/evidence update, then restart the complete
fresh candidate3 gate. No merge, tag or release exists yet.

### M5/C5 final candidate complete — 2026-10-22

[Candidate3](../assets/automatic-hydrogen-editing/c5-candidate-3-gate.json), source
8510c40cfefe44a560698d4de7892a379d07ab94, passes all20 complete release commands:
**1247 Python,321 frontend,8 supervisor,306 browser/60 unchanged documented
layout/timing exclusions**, zero failures/flakes/retries/Python or native scientific
skips. Frozen installs, fresh0014, static/type/build, full desktop/mobile accessibility/
actual zoom/scientific/job/export/surface/movement regressions, actual tagged0.23.0
and final0.24.0 readers, all-five versions/dependencies and whitespace pass.
Six new cases forward and the rich old three-entry project reverse remain exact.
All567 source/test/patch/lock identities and uncompressed-log hashes verify;
source digest2cc7bd9f95acc647b8a9ae428b1f40aa66ab5f8e791e675dfeb268e5645fb2e9.
[Summary](../assets/automatic-hydrogen-editing/c5-candidate-3-summary.json) includes
exact timings and [full-diff local self-review](../assets/automatic-hydrogen-editing/c5-review.md)
records resolved findings. Earlier attempts are diagnostic only.

Performance budgets are unchanged. Candidate reference cold small/pocket/18k
native Apply0.980/2.170/3.672s, first actual frame722ms and Cancel49.8ms; these are
recorded machine results, not universal promises. The gate records AC charging,
existing power-saver profile and bounded native settings; no profile change was
made. Source work/site/H/context/coordinate/diagnostic bounds pass their tests.

Fetched origin/master remains54533f10df4d8fff763483356a58c4573a445453; latest stable
is stillv0.23.0 and v0.24.0 is unused. No upstream work was discarded and no version
collision exists. Stable minor0.24.0 remains correct; no new migration/dependency.
Candidate evidence/progress commit follows. Next: push and open the planned PR,
request Codex review, audit protections/checks/conversations, normal merge when
satisfied, then complete fresh exact-master qualification before tag/release.
No release/merge is claimed yet and no consequential local finding remains.


Final reviewability note: GitHub rejected the319-file PR diff. Bundle the two
interrupted candidate attempts in a [checksummed archive](../assets/automatic-hydrogen-editing/c5-interrupted-candidates.md),
preserving every diagnostic byte and original member path. Final candidate3
evidence remains separate and individually accessible. Production/test source
identities remain identical; no rerun is implied or required by this documentation
packaging change. This resolves the diff-file limit without dropping evidence.
