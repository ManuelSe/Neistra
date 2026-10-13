# Issue #55 — Correct and qualify molecular interaction visualization

## 1. Status, outcome, and inspected baseline

**Status:** approved on 2026-10-13 through the user's “Implement the plan.”
The C0 persistence handoff completed at `938e2eef8b74932f0323178ceea1e34969a4d1bd`.
The user authorized implementation and full delivery through `/goal` on 2026-10-13.
Current checkpoint: C1 complete; C2 next.

- **Issue:** [#55 — Fix and scientifically validate molecular interaction detection and visualization](https://github.com/ManuelSe/Neistra/issues/55).
- **Issue metadata:** open; created and last updated 2026-10-13 at 05:59:32 UTC;
  no issue comments or labels at the planning inspection.
- **Related:** [#49](https://github.com/ManuelSe/Neistra/issues/49),
  [PR #53](https://github.com/ManuelSe/Neistra/pull/53), and
  [#52](https://github.com/ManuelSe/Neistra/issues/52).
- **Plan path:** `docs/plans/issue-55-interaction-corrections.md`.
- **Base:** `master`, verified at `116909085a52237d275dd2f42e30c1f847583a54`,
  matching remote master.
- **Planned branch:** `fix/issue-55-interaction-corrections`.
- **Planned release:** **0.13.1**, annotated tag **`v0.13.1`**.
- **PR title:** `fix(interactions): correct overlay updates and validate all six types`.
- **Merge strategy:** normal merge commit, preserving passing checkpoint commits.

**Approved outcome:** all six existing interaction types render their correct
current geometry and remain additive under independent type and Inter/Intra
switches. Supported chemistry receives scientific qualification; unsupported
chemistry remains visibly uncertain. Interactions becomes the final action in
the viewer quick-action toolbar.

### Findings

The planning prompt's release-history premise is outdated. GitHub has published
releases through [v0.13.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.13.0).
Its annotated tag targets `bf29b9a913be48dac95b8d9aa055a7310c21d5b2`; subsequent
master changes document that delivery.

Repository inspection covered the requested product, plan, progress, decisions,
verification, architecture, schemas, API, migrations, generic jobs, frontend
ownership, relevant tests, related issues, branches, releases, and delivery
conventions.

Important findings:

- Six detectors already exist in the molecular core. The API analyzes immutable
  normalized artifacts, independently of Mol*.
- Interaction choices already use additive, session-owned state. They are absent
  from projects, history, scenes, and archives.
- The Interactions button precedes the other viewer quick actions.
- **A native geometry-update defect is reproduced:** each update creates fresh
  `Lines` buffers, while the existing Mol* render object retains the old buffer
  cells. A one-line-to-two-line update changed the draw count from 6 to 12 while
  retaining a 6-index buffer and old endpoints.
- A read-only feasibility experiment using the previous `Lines` geometry
  correctly updated endpoint buffers and index capacity through growth and
  shrinkage.
- Existing browser inspection largely checks submitted records and draw counts.
  Those checks can pass while the attached native geometry is stale.
- Planning validation passed **71 interaction Python tests** and **all 179
  frontend tests**. No browser gate or release qualification has been performed
  for #55.

The rendering defect can explain misleading classification appearances and
disappearing markers. It does **not** establish that every reported symptom has
the same cause.

### Authority and resolved assumptions

Authority order: explicit user guidance and corrections; AGENTS.md and accepted
decisions; existing architecture, product boundaries, schemas, and conventions;
issue problems, outcomes, constraints, and non-goals; non-binding implementation
suggestions.

Preserve accepted decisions D-002, D-013, D-020–023, D-037, D-042, and D-085–088
in [DECISIONS.md](../DECISIONS.md). This feature plan does not replace that log.

The user's planning selections establish that:

- **#52 remains separate.** No CCD assignment or automatic ligand preparation
  enters #55.
- Repository fixtures and independently specified examples provide acceptance
  cases; no user-supplied reproduction is required.

No unresolved product decision remains for this approved scope.

## 2. Requirement disposition and implementation contract

### Requirement disposition matrix

| Significant requirement | Disposition | Treatment |
|---|---|---|
| Move Interactions to the rightmost toolbar position | Essential | Make it the final action in the existing viewer quick-action toolbar, after Style selection. Preserve separate movement controls. |
| Preserve working hydrogen bonds | Already satisfied by repository; preserve | Retain explicit-H endpoints and angular rules; add native update regressions. |
| Correct apparently mislabeled π–π markers | Essential | Verify aromatic participants, centroids, classification, attached buffers, and rendered appearance separately. |
| Hydrophobic contacts detect and render | Essential | Qualify supported nonpolar chemistry, distance rules, and native markers. |
| Cation–π interactions detect and render | Essential | Qualify positive groups, complete aromatic rings, directional geometry, and native markers. |
| Salt bridges detect and render | Essential | Qualify opposite charge groups, nearest-site distance, grouping, and native markers. |
| Steric clashes detect and render | Essential | Qualify element radii, exclusions, overlap boundaries, and coincident endpoints. |
| Multiple types remain displayed together | Essential | Preserve the union of enabled classifications through geometry growth, shrinkage, and reordering. |
| Inter/Intra switches remain independent and additive | Essential | Preserve existing molecule grouping and independently filter each scope. |
| Classification and endpoints reflect chemistry | Essential | Check full participant identities and independently expected endpoint coordinates, beyond counts and colors. |
| Report incomplete or unsupported chemistry | Essential; infrastructure already satisfied | Preserve structured coverage/warnings and verify their UI presentation, including raw PDB/mmCIF ligands. |
| Thorough independent scientific validation | Essential | Use independent analytical expectations, chemically realistic fixtures, and a small frozen structural reference; document profile differences. |
| Detection and rendering regression tests | Essential | Cover domain, API, filtering, native buffers, and actual WebGL output. |
| Explanations distinguishing unsupported input from a rendering failure | Supporting | Keep compact status and secondary Help accurate; update scientific guidance. |
| Broad external-tool benchmark or universal chemistry coverage | Deferred | Exceeds this correction and cannot establish universal correctness. No speculative follow-up issue. |
| Raw ligand chemistry assignment | Deferred | Existing #52 owns mapping, dictionary provenance, and qualification. Do not create a duplicate. |
| Automatic preparation, configurable profiles, persistent reports, or new analysis dependencies | Rejected for this plan | Unnecessary for repairing the existing feature; introduces separate scientific and compatibility contracts. No new follow-up unless requested. |

No issue requirement is silently dropped. “All six types work” means
scientifically qualified behavior for assessable inputs, with explicit
uncertainty elsewhere.

### Molecular and scientific behavior

Retain the fixed **`interaction-v1`** profile:

| Type | Required chemistry and geometry |
|---|---|
| Hydrogen bond | Typed donor/acceptor, supplied explicit H; D···A ≤3.5 Å, H···A ≤2.5 Å, D–H···A ≥130°, applicable acceptor-base angles ≥90°. Marker connects H to acceptor. |
| Hydrophobic | Established neutral nonpolar carbon neighborhood containing C/H; pair distance ≤4.0 Å and existing covalent exclusions. |
| π–π | Complete aromatic 5/6-member rings; plane RMS ≤0.1 Å, centroid distance ≤5.5 Å; existing parallel/offset or T-shaped angle/offset criteria. |
| Cation–π | Positive charge group and complete ring; distance ≤6.0 Å, lateral offset ≤2.0 Å, direction ≤30° from ring normal. |
| Salt bridge | Oppositely charged groups; closest charge-bearing-site distance ≤4.5 Å; no H-bond angular requirement. |
| Clash | Pinned element-specific van der Waals radii; overlap ≥0.4 Å; exclude neighbors through three covalent bonds and qualified H-bond contact pairs. |

Preserve complete observed protein templates, disclosed conventional side-chain
charges, supplied ligand chemistry, ambiguity handling, and stable molecule
identities. Missing values must not become neutral charges or single bonds
through conversion defaults.

Scientific qualification may correct a demonstrable defect in implementing these
rules. It may not retune thresholds, enlarge supported chemistry, or introduce a
new profile to force a reference match. A necessary change to the accepted
scientific policy requires a plan amendment.

Independent expectations must be written from chemical definitions and source
coordinates, never generated by the detector being tested. External tools
provide references rather than an exact-output oracle:
[PLIP documents different prioritization and reduction rules](https://github.com/pharmai/plip/blob/master/DOCUMENTATION.md).

### Renderer and frontend behavior

- Extend `interactionLines` to accept reusable previous `Lines` geometry.
- Pass the previous shape's geometry into `LinesBuilder.create`, preserving
  buffer-cell identity while updating coordinates, groups, mappings, and index
  capacity.
- Continue creating an updated shape so Mol* refreshes colors, group counts,
  draw counts, and bounds.
- Retain one batched, nonpickable representation with existing colors and
  patterns.
- Keep canonical record endpoints unchanged. For exactly coincident clash
  endpoints, render a small three-axis cross centered at the shared coordinate,
  with **0.15 Å half-length**, rather than silently omitting the marker.
- Retain independent classifications even when they overlap spatially. Do not
  introduce category precedence that hides another enabled classification.
- Preserve synchronous clearing, serialized updates, visibility filtering,
  preview pausing, cancellation restoration, and committed-artifact invalidation.
- Move Interactions after Style selection in DOM and visual order. Preserve
  launcher naming, tooltip, expanded state, panel bounds, keyboard access, and
  return focus.

Do not rewrite the interaction store, detector architecture, or job system
merely because those areas appear in the issue.

### Data, API, migration, accessibility, and performance implications

- **API:** retain `POST /api/v1/projects/{project_id}/interactions`,
  request/response shapes, six type identifiers, profile, frame, and error
  contracts. Corrected transient records are expected bug-fix behavior.
- **Persistence:** no database migration; Alembic head remains **0013**.
  Project, normalized, and archive schema majors remain **1**.
- **Scientific state:** originals, normalized artifacts, coordinates, inference
  records, project revisions, history, and job snapshots remain unchanged by
  analysis or toggles.
- **Jobs:** retain the existing bounded cancellable analysis child; no durable
  job/report integration.
- **Accessibility:** qualify keyboard and touch operation, focus restoration,
  both themes, non-color patterns, narrow layouts, and actual browser zoom.
- **Performance:** preserve existing bounds—100,000 atoms, one million candidate
  admissions, 20,000 records, 30 seconds, one active analysis per API process.
- **Browser budgets:** first analysis/display <5 seconds, cached toggle <500 ms,
  longest observed main-thread task <750 ms on the existing pinned fixture and
  host. Cached toggles issue no new analysis or structure requests.

## 3. Milestones and independently verifiable checkpoints

Each checkpoint includes passing tests and documentation before commit. Record
diagnostics separately from passing evidence. Do not commit a failing checkpoint
or create an empty checkpoint commit.

### C0 — Approved-plan persistence and stop

**Outcome:** approved contract exists on the dedicated branch, ready for `/goal`.

After approval and when execution is permitted:

1. Confirm the working tree is clean; fetch origin.
2. Switch to local `master` and update with `git merge --ff-only origin/master`.
3. Recheck remote base, issue changes, and version baseline. Stop for amendment
   if they materially invalidate the approved plan.
4. Create `fix/issue-55-interaction-corrections`.
5. Write the approved feature plan as the first branch change; add a concise
   approved/planned summary to `docs/PROGRESS.md`.
6. Validate Markdown, links, recorded metadata, and `git diff --check`.
7. Commit with exactly **`docs(plan): add approved plan for issue 55`**.
8. Push and verify the remote branch/commit if remote access is available.
9. Report plan path, branch, commit, milestones, and patch impact;
   **stop without implementation**.

**Migration/compatibility:** documentation only.
**Rollback:** ordinary documentation revert; no product state affected.

### M1 / C1 — Repair native overlay updates and toolbar placement

**Outcome:** the renderer attaches current buffers for every update, and
Interactions is the final quick action.

**Affected areas:** interaction geometry builder, native adapter qualification,
toolbar, frontend tests.

**Acceptance criteria:**

- Actual representation tests verify endpoint/group buffers and sufficient index
  capacity through grow, shrink, reorder, same-count coordinate replacement,
  emptying, and restoration.
- Colors and patterns stay associated with current records.
- Native browser evidence confirms an existing marker remains after adding
  another type, and coordinate updates move its actual geometry.
- Coincident clashes retain their original endpoints and receive the centered
  cross.
- Toolbar DOM order and keyboard focus follow the new position.
- Camera, selection, picking, and preview-clearing behavior remain qualified.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/interactions.test.ts src/test/viewer-toolbar.test.tsx

PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/interactions.spec.ts tests/e2e/interactions-lifecycle.spec.ts
```

Run frontend lint, typecheck, full frontend tests, and production build at
milestone completion.

**Documentation:** update interaction marker/toolbar guidance; append a D-088
implementation note explaining native buffer reuse and why submitted-record
evidence is insufficient.
**Migration:** none.
**Commit:** `fix(interactions): update native overlay buffers and toolbar placement`.
**Rollback:** revert renderer/UI code without data conversion; this restores the
known display defect, so it is not a preferred user rollback.

### M2 / C2 — Qualify all six scientific classifications

**Outcome:** supported chemistry and geometry have independently specified
positive, negative, and boundary evidence.

**Affected areas:** scientific fixtures, core/API tests, any demonstrated
detector corrections, fixture and limitations documentation.

**Required cases:**

- Explicit-H ammonia/carbonyl geometry: correct endpoints, angular rejection,
  missing H, and distance boundaries.
- Nonpolar carbon fragments versus polar/charged neighborhoods.
- Neutral aromatic rings: parallel, offset, T-shaped, angular rejection,
  nonplanarity, incomplete rings, and centroid identity.
- Quaternary ammonium–aromatic geometry: positive charge, neutral controls,
  distance/offset/direction boundaries.
- Ammonium/carboxylate and resonance-group examples: opposite charges,
  neutral/like-charge negatives, distance boundaries, group centers, and valid
  H-bond overlap.
- Steric overlap: element radii, exact boundary, bonded-neighbor exclusions,
  H-bond exceptions, coincident coordinates, and incomplete connectivity.
- Protein-template, conflicting protonation, alternate-site,
  covalent-modification, raw-ligand, metal, and undefined-geometry limitations.
- Input-order determinism and molecular/original-byte invariance.

**Frozen structural reference:** use the inspected **2REG chain-A choline
environment** from PLIP commit `2f4911d307490479ac023b22d6faa8f59b577ca8`,
preserving original bytes and recording source, checksum, attribution, and
derivation.

Create a test-only prepared choline fixture with its seven observed heavy-atom
coordinates, explicit single-bond graph, and N1 charge +1; retain complete
observed reference residues. This is manually specified fixture chemistry, not
an application assignment service.

Check cation–π partners at Trp43, Trp90, Trp205, and Tyr119 using independently
calculated geometry. Document that Asp45's closest observed charge-site distance
is approximately **4.716 Å**, outside Neistra's salt-bridge cutoff; it must not
be forced into a positive expectation. These reference partners are identified
in [PLIP's literature-validation cases](https://github.com/pharmai/plip/blob/2f4911d307490479ac023b22d6faa8f59b577ca8/plip/test/test_literature_validated.py).

Every fixture records expected chemistry, participants, endpoints, geometry,
preparation assumptions, and expected warnings. Tests run offline.

**Focused validation:**

```bash
.venv/bin/uv run pytest \
  tests/unit/test_interactions.py \
  tests/scientific/test_interactions.py \
  tests/integration/test_interactions.py

.venv/bin/uv run ruff check .
.venv/bin/uv run mypy apps/api packages/molweave_core
.venv/bin/uv run pytest tests/scientific
```

Run the full Python suite at milestone completion; rerun adjacent browser
interaction workflows and frontend build/validation if results or presentation
change.

**Documentation:** update `docs/FIXTURES.md`, `docs/INTERACTIONS.md`, scientific
limitations, and the feature-plan disposition/evidence matrix. Append material
scientific findings to `docs/DECISIONS.md`; preserve accepted decisions.
**Migration:** none.
**Commit:** `test(interactions): qualify six interaction classifications`;
demonstrated fixes receive a preceding passing `fix(interactions): …` commit.
**Compatibility:** retain profile and API shapes. Policy changes require
amendment.

### M3 / C3 — Qualify additive controls and the complete viewer workflow

**Outcome:** scientific records survive filtering and reach correct native
geometry throughout the user workflow.

**Affected areas:** test fixtures, session/filter tests, test-only native
inspection, browser regressions, evidence documentation.

**Acceptance criteria:**

- Exercise all **64 type subsets × four scope combinations** against a fixture
  with independently specified intra/inter records.
- Adding type B retains every eligible type-A record; disabling B removes only
  B. Repeat in reverse order and after all-off restoration.
- Native browser tests use separated molecular motifs with genuine records for
  all six types. Verify each type alone, pairwise combinations, and all six
  together.
- Compare API records, application-filtered records, and attached native
  geometry using canonical participants, endpoint segments, group/color
  assignment, and active buffer extents.
- Actual canvas evidence verifies each marker family and newly added markers;
  internal records or screenshots alone are insufficient.
- Retain visibility, isolation, hidden-H, incomplete-ring visibility,
  preview/Cancel, Apply/Undo/Redo, topology edit, scene, deletion, remount,
  reload, and project-switch qualification.
- Cached controls trigger no additional analysis or normalized-structure
  requests.
- Unsupported chemistry remains explained through status/Help.
- Both themes, keyboard/touch, 320-pixel layout, actual 100%/200% zoom, and
  scoped axe checks pass.
- Existing performance budgets pass without profiling or concurrent builds.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run \
  src/test/interactions.test.ts src/test/viewer-toolbar.test.tsx

PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/interactions.spec.ts \
  tests/e2e/interactions-lifecycle.spec.ts \
  tests/e2e/rebranding-zoom.spec.ts
```

Run affected stack lint/typechecks, full frontend tests, production build, and
adjacent movement, measurement, and surface workflows at milestone completion.

**Documentation:** evidence under `docs/assets/interaction-corrections/`; update
verification, accessibility/performance guidance, plan log, and concise project
progress. Test-only inspection must remain outside production imports.
**Migration:** none.
**Commit:** `test(interactions): verify additive native overlay workflows`.
**Compatibility:** retain transient ownership and existing persisted
visibility/history semantics.

### M4 / C4 — Prepare and qualify the patch release

**Outcome:** reviewed 0.13.1 candidate passes complete release and actual
preceding-reader qualification.

**Affected areas:** five version sources, compatibility assertions, release
notes, evidence, documentation.

**Acceptance criteria:**

- Recheck live master, latest release, tags, protections, rulesets, checks, and
  reviews.
- All five authoritative application versions agree on 0.13.1, with no unrelated
  dependency updates.
- Complete clean-candidate gate passes before opening the implementation PR.
- Actual tagged **v0.13.0** reads final 0.13.1-produced data and archives,
  preserving originals, exact coordinates, retained Undo/Redo, save/re-export,
  and completed jobs.
- New reader accepts preceding-release archives.
- Review the complete diff; resolve consequential findings and required
  conversations.
- Record reviewer identity and distinguish local review from independent review.

**Complete release gate:**

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=/tmp/neistra-issue55-release-gate .venv/bin/uv run alembic upgrade head
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

Use fresh dedicated qualification storage and record any isolated browser
port/data overrides. Never use a user's project directory.

Use the existing two-process `tests.support.transform_reader_qualification`
helper with final producer metadata and an actual detached v0.13.0 checkout.

**Documentation:** release notes, upgrade/rollback guidance, verification
evidence, final plan/progress status.
**Migration:** no new migration; verify fresh head 0013.
**Commit:** `chore(release): prepare 0.13.1 interaction corrections`.
**Rollback:** qualified v0.13.0 needs no schema downgrade or data stripping, but
restores its known interaction-rendering limitations.

## 4. Version, delivery, blockers, and completion log

### SemVer decision

**Patch: 0.13.0 → 0.13.1.**

This repairs already advertised behavior and strengthens its qualification. It
introduces no interaction category, public endpoint, request/response shape,
supported-chemistry expansion, or persisted feature.

A minor increment is unnecessary for this scope; no breaking contract warrants
a major increment. A prerelease is unnecessary once all gates pass. Incomplete
qualification blocks delivery rather than being represented as a complete
stable fix.

Update these authoritative sources in the implementation PR:

1. `pyproject.toml`.
2. The `molweave-dev` root-project version in `uv.lock`.
3. `apps/web/package.json`.
4. FastAPI version in `apps/api/src/molweave_api/main.py`.
5. `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Do not replace unrelated dependency occurrences of `0.13.0`. A changed release
baseline or tag collision requires revising the proposed version before release
preparation.

**Release-note sections:** Fixes; Scientific qualification and unchanged
criteria; UI behavior; Supported inputs and limitations; API/data compatibility
and rollback; Verification and review.

### PR, issue response, release, and cleanup

Current GitHub inspection found no workflows, rulesets, or protected master.
All three merge methods are enabled; recent delivery preserves checkpoints
through normal merges. There is no dedicated release automation: use documented
gates, annotated Git tags, and GitHub releases. Recheck these facts before
delivery.

- PR body documents implemented, simplified, deferred, and rejected requirements,
  the reproduced rendering cause, scientific scope, compatibility, and actual
  evidence.
- Use `Closes #55` only after the approved acceptance criteria pass.
- Keep #52 open and linked. Do not create duplicate or speculative follow-ups.
- After normal merge, repeat the complete gate and preceding-reader
  qualification on the **exact merged master commit**.
- Only then create annotated `v0.13.1` and publish the release.
- Verify remote tag target, release state/notes, and downloaded
  verification-asset checksums.
- Post a verified final issue reply explaining the defect, corrected behavior,
  qualified chemistry, scope decisions, evidence, and #52 limitation.
- Record actual publication details through a reviewed documentation closeout
  if needed.
- Delete feature branches only after verified merge and delivery; finish on
  clean, current master.

Planning approval authorizes **C0 only**. Implementation, PR delivery, merge,
and publication belong to the subsequent `/goal` authorization.

### Merge/release blockers

Block merge or release for:

- Any enabled type disappearing unexpectedly, stale native buffers, insufficient
  index capacity, incorrect participants/endpoints, or mislabeled geometry.
- Incorrect scientific assignment, silent chemistry defaults, missing
  uncertainty reporting, or undocumented policy changes.
- Stale preview/committed overlays, broken visibility, camera/picking regressions,
  or mutation of molecular/original state.
- Failed required tests, lint, types, build, browser, accessibility, performance,
  or reader compatibility checks.
- Unresolved consequential review findings, required conversations, approvals,
  or status checks.
- Version inconsistency, changed baseline without reconciliation, or tag collision.
- Missing scope/evidence documentation or unverified merged commit/publication.

### Progress and completion log

This plan maintains checkpoint status, commit, commands, results, evidence links,
decisions, limitations, blockers, and next action. Historical #49 evidence
remains historical.

| Item | Present state |
|---|---|
| Repository and GitHub inspection | Complete |
| Product scope selections | Resolved: #52 separate; repository/reference cases |
| Native stale-buffer reproduction | Confirmed through read-only experiment |
| Planning validation | 71 interaction Python tests; 179 frontend tests passed |
| Plan approval | Approved 2026-10-13 through “Implement the plan”; persistence-only handoff |
| C0 persistence | Approved plan and project summary are the first branch change; commit/push verification reported at handoff |
| C1 implementation and qualification | Complete; evidence below |
| C2–C4 implementation and qualification | Not started |
| PR, merge, tag, release, issue reply | Not started |

`docs/PROGRESS.md` provides the concise project-level summary; this feature plan
remains the detailed contract. Cross-project decisions stay in
`docs/DECISIONS.md`. The global `docs/PLAN.md` is preserved.

### Approval handoff — 2026-10-13

- Rechecked issue #55 and remote master; issue scope and released baseline are
  unchanged from the reviewed proposal.
- Working tree was clean. Fetched origin, switched to `master`, and ran
  `git merge --ff-only origin/master`; master was already up to date at
  `116909085a52237d275dd2f42e30c1f847583a54`.
- Created `fix/issue-55-interaction-corrections` after confirming no local or
  remote branch collision.
- Persisted this approved plan as the first branch file change, with concise
  project-level progress. No implementation, version, schema, dependency, or
  accepted-decision change is included in C0.
- Documentation checks and remote commit verification are reported in the
  handoff. Stop ready for `/goal`; C1 is the next implementation checkpoint.

### C1 — 2026-10-13

Reused native Lines ValueCells and explicitly bounded shape groups to current
records, fixing both stale attached geometry and stale-capacity groups on shrink.
Coincident clashes use the approved centered cross; Interactions is the final
quick action. Native representation tests cover grow/reorder/shrink/same-count
coordinate replacement/empty/restore, active buffers, colors and index capacity.
Browser checks now inspect attached buffers and float32 projected coordinates
through Apply/Undo/Redo. D-088 qualification note and marker guidance updated.

Passing milestone gate: frontend lint/typecheck, 181 full Vitest tests, production
build; both interaction specs pass 9 browser cases with 1 intentional desktop-only
workflow skip, zero failures/retries. Focused representation/store/toolbar gate
passes 11 tests. Commands are those in C1 above, plus the new
`src/test/interaction-native-geometry.test.ts` in the focused Vitest command.
Browser overrides: API8020/worker8021/web5183 and disposable
`/tmp/neistra-issue55-c1-browser`; no running user's development service reused.
[Exact logs and performance/lifecycle evidence](../assets/interaction-corrections/c1-verification.json).
Initial diagnostic failures are separated from passing evidence: testing-library
matcher/options corrected; real shrink-capacity issue fixed; native coordinate
assertion correctly compares the float32 projection of authoritative float64 data.

Reviewed complete C1 diff locally for scope, native lifetime, nonpickability,
endpoint invariance and scientific boundaries. No consequential finding remains.
No migration, API/scientific policy, persisted-state or version change. Existing
lazy-bundle and color-env advisories remain. Next action: C2 scientific fixtures.
