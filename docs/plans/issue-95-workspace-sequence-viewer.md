# Issue #95 — Workspace protein sequence viewer

## 1. Status, outcome, and authority

**Status:** implementation authorized by the user’s `/goal` on 2026-10-28.
M1/C1 and M2/C2 are implemented and qualified; final candidate and
verified delivery (M3–M4) remain pending.

**Approval:** the user's “Implement the plan.” on 2026-10-28 approves the complete
proposal, including its mandatory C0 stop ready for `/goal`. This authorizes
planning persistence, not implementation or the subsequent delivery lifecycle.

| Item | Approved value |
|---|---|
| Issue | [#95 — Add a collapsible horizontal protein sequence viewer below the 3D viewer](https://github.com/ManuelSe/Neistra/issues/95) |
| Issue metadata at C0 | Open; enhancement; no milestone or comments; last updated 2026-10-19T13:45:56Z |
| Plan document | `docs/plans/issue-95-workspace-sequence-viewer.md` |
| Base branch | `master` |
| Inspected and fast-forward-checked local/remote base | `d459e073732b1d9ccbba5f404a0d6206c4a12f4e` |
| Feature branch | `feat/issue-95-workspace-sequence-viewer` |
| PR title | `feat(sequence): dock protein sequences below the molecular viewer` |
| Merge strategy | Normal merge commit preserving passing checkpoints |
| Planned release | Stable **0.26.0** |
| Proposed annotated tag | **v0.26.0** |

**Approved outcome:** scientists can browse and select observed protein residues
in a compact sequence area below the 3D canvas, while continuing to use the
Inspector and lower panel.

The user's confirmed corrections govern the design:

- Show protein chains only.
- Show all displayed protein chains as vertically stacked, nonwrapping sequence
  rows.
- Retain each chain's complete observed sequence while any of that chain is
  displayed.
- Use application display settings rather than camera clipping, occlusion, or
  renderer internals.
- Retain source-chain context for visible protein surfaces.
- Initially accommodate up to three rows, with vertical scrolling for additional
  chains.
- Keep sequence collapse and hide independent from the existing lower panel.

Authority follows explicit user guidance; [repository instructions](../../AGENTS.md)
and accepted [decisions](../DECISIONS.md); existing architecture and product
boundaries; issue outcomes; then nonbinding technical suggestions. Preserve the
global [plan](../PLAN.md) and [product specification](../PRODUCT_SPEC.md).

Relevant decisions are D-013, D-018/019, D-037, D-042, D-045, D-097,
D-120–125, and D-144/145. D-146 records workspace-derived sequence rows and their
presentation-state ownership. Explicitly supersede D-145's temporary retention
of the Inspector Sequence tab and nonprotein sequence access; preserve its
selection and identity rules.

### Inspected baseline and assumptions

The clean local `master` matched remote `master` at the base above.
`git pull --ff-only origin master` reported already up to date, and the working
tree was confirmed clean before creating the feature branch. Remote refs and
local files confirmed that the planned branch, plan document, D-146, and tag were
unused before C0.

Stable releases already exist through
[v0.25.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.25.0), contrary to the
brief's absent-release-history premise. Its remotely verified annotated tag
targets runtime `2adeaac973a6047ee537fd8c639f3b3e18d216b0`; the base includes the
subsequent publication documentation audit.

Inspection covered architecture, normalized/project/archive schemas, structure
API, component memberships, migrations through 0014, generic jobs, frontend state
ownership, tests, related issues #2/#59/#90/#94, Git branches/tags/releases, PR
conventions, and verification/release tooling. At planning inspection, GitHub
exposed no workflows, master protection, rulesets, or open PRs. No dedicated
release command or PR template was found. Recheck these facts before delivery;
they do not authorize bypassing later requirements. Use the established
command-based qualification and publication conventions.

Reference workflow research was completed during planning. External product
references remain outside repository artifacts.

Planning verification passed **37 tests** across selection gestures, component
membership, and structure loading. This is baseline evidence, not feature
qualification. No unresolved product decision remains.

## 2. Requirement disposition

| Significant requirement | Classification | Decision |
|---|---|---|
| Sequence below the 3D canvas, above Properties/History/Jobs | Essential | Dock within the center viewer region; retain the existing lower-panel split. |
| One nonwrapping, horizontally scrollable sequence | Essential | One horizontal row per displayed protein chain, stacked vertically. |
| Single active protein/chain and switching selector | Rejected as proposed | User requires all displayed proteins together. Row labels replace the selector; no follow-up needed. |
| Reflect proteins displayed in the workspace | Essential | Derive rows from current application display state. |
| Full chain versus only displayed residues | Essential | User chose complete observed chain context while any part is displayed. |
| Protein-only scope | Essential | User explicitly excludes nonprotein polymers from this replacement. Other molecular access remains in Components and existing tools; no follow-up required. |
| Correct residue names, numbering, insertion codes, and order | Essential | Preserve normalized source identities and list order. |
| Compact tiles, spacing, hover, and selection states | Supporting | Use existing theme tokens and control conventions. |
| Full residue and chain information in tooltips | Supporting | Also expose information through accessible names and keyboard-focus tooltips. |
| Independent collapse, expansion, hide, and restoration | Essential | Separate sequence presentation state from lower-panel state. |
| Light/dark themes and small screens | Essential | Cover desktop, narrow layouts, coarse pointers, and browser zoom. |
| Complete residue selection in every picking mode | Already satisfied | Reuse the guarded shared residue action delivered by #94. |
| Replace, Ctrl/Cmd toggle, and Shift range | Already satisfied | Preserve central modifier policy, fixed anchors, and source-order ranges. |
| Cross-chain additive fallback and shared anchor | Already satisfied | Preserve entry/component/chain boundaries and existing invalidation. |
| Bidirectional full/partial/unselected coverage | Essential | Reuse canonical coverage and add distinct visible partial styling. |
| Selection preserves camera, visibility, and picking mode | Already satisfied | Preserve ownership boundaries and prove them in integration tests. |
| Automatically reveal newly selected residues | Optional | Omit selection-driven scrolling. Keyboard focus reveals its target; manual scrolling remains stable. No follow-up unless requested. |
| Extract reusable sequence functionality; remove redundant tab | Essential | Extract the existing implementation, then relocate it without retaining a duplicate UI. |
| Reuse normalized data and structure-query cache | Supporting | Consume current artifact-keyed projections; introduce no independent fetch pipeline. |
| Precomputed residue membership | Already satisfied | Reuse immutable gesture/component indexes. |
| Long sequences and many chains remain responsive | Essential | Bound mounted residues and chain rows using the existing virtualizer dependency. |
| Preserve nonstandard residue identities | Essential | Display recorded names instead of reducing all unknown residues to `X`. |
| Invent missing sequence positions or residues | Rejected as proposed | Neither numbering gaps nor absent coordinates justify fabricated residues. No follow-up needed. |
| Navigation, scrolling, collapse, selection, and synchronization tests | Essential | Require pure, component, and native browser coverage. |

No unresolved product decision remains. No essential outcome is deferred.

Non-goals include alignment, missing-residue reconstruction, secondary-structure
annotation, sequence editing/export, reclassification, new chemistry, residue
visibility controls, synchronized alignment scrolling, and a dedicated
sequence-height resize handle. These are outside this delivery and do not require
speculative follow-up issues.

## 3. Implementation contract and implications

### Data, display, and state ownership

- Derive one row per assigned protein component and normalized chain identity.
  Keep separate source instances distinct even when entry names, chain labels,
  or residue numbers collide.
- Order entries by the existing project entry order and chain rows by normalized
  source order. Preserve normalized residue order within each row.
- Determine row eligibility from entry visibility, protein component settings,
  applicable representation visibility and masks, and current isolation. Visible
  protein surfaces retain their declared source-chain context; cropped mesh
  pixels do not define sequence membership.
- Once eligible, display every observed residue in that protein row, including
  residues whose atoms are individually hidden. Selection still targets all
  existing normalized residue-member atoms.
- Reuse current structure queries inside the viewer integration. Do not load
  hidden structures solely for sequence browsing or introduce molecular payloads
  into Zustand.
- Guard residue activation with the existing project/visit/entry/artifact checks.
  Previous-artifact placeholders may preserve layout while loading but must be
  visibly busy and noninteractive.
- Show available rows while another entry loads. Retain existing structured
  warnings and load-error/retry access; do not present failed or unclassified
  data as an empty valid sequence.

The dedicated sequence component receives typed application projections/display
inputs, canonical selection, and the existing `ResidueSelectionRequest` callback.
Forward that callback through the workspace/viewer boundary to App's existing
handler.

Keep isolation with its current viewer owner. Sequence rendering may consume it
without creating another isolation store.

### Presentation and interaction

- Add a flex column around the existing canvas region, placing the sequence
  component below the canvas. Preserve the renderer instance during sequence
  show/hide/collapse operations.
- Keep the desktop lower-panel IDs, saved two-panel layout shape, collapse
  behavior, and mobile drawer behavior.
- Use a single safe browser preference,
  `sequenceDisplay: "expanded" | "collapsed" | "hidden"`, defaulting to expanded.
  Invalid or absent saved values use that default.
- Expanded height accommodates at most three chain rows and is capped at
  one-third of the available viewer region. Additional rows scroll vertically.
  Collapsed mode retains a compact header; hidden mode leaves a named
  viewer-toolbar restore control.
- With no eligible chains, show a compact “No displayed protein chains” state
  rather than reserving an empty three-row area.
- Give each row a persistent entry/chain label and independent horizontal
  scrolling. Disambiguate duplicate labels without changing molecular IDs.
- Use one-letter codes for the existing standard amino-acid mapping and recorded
  names for other residues. Show author numbering, falling back to label
  numbering, with insertion codes. Label internal-ID fallback explicitly.
- Tooltips identify the residue name, number, entry, and chain; standard names
  may include their full amino-acid name. Do not infer parent identities for
  modified residues.
- Reuse shared modifier precedence: Alt subtracts, Ctrl/Cmd toggles, Shift adds
  an eligible range, otherwise replace. Never create a sequence-local anchor.
- Preserve manual scroll during selection changes. Retain scroll and focus
  context across responsive remounts in transient project-scoped sequence
  navigation state; reset on project change/reload and reconcile deleted
  identities.
- Hide/collapse never clears selection or anchors. Return focus only when the
  affected sequence control owned focus.

Use native region/list/button semantics and roving residue focus. Left/Right and
Home/End navigate residues; Up/Down navigate chain rows, clamping to an available
residue. Enter/Space activates the focused residue with shared modifiers.
Navigation alone does not select.

Expose full, mixed, and unselected coverage through `aria-pressed` and a non-color
partial-state cue. Follow existing 32 px fine-pointer and 44 px coarse-pointer
control conventions. Keep tooltip information available without hover.

### Scientific, compatibility, and performance boundaries

No HTTP API, job/plugin contract, database migration, scientific model, molecular
artifact, or dependency upgrade is planned. Alembic remains `0014`;
project/viewer/archive schemas remain `2`; normalized/selection/component schemas
remain `1`.

Original uploads, coordinates, chemistry, history, saved selections, scenes, and
archive contents retain their contracts. Presentation preferences stay outside
project snapshots and archives.

Reuse the pinned TanStack virtualizer for horizontal residue windows and
vertically bounded chain windows. Use stable molecular keys, eight-item overscan
on either horizontal side, four rows on either vertical side, and at most one
retained focused item/row. Off-screen DOM membership must never limit selection
operands.

## 4. Milestones, checkpoints, and verification

Every checkpoint records actual commands, results, limitations, and source
identities in this feature plan; updates [project progress](../PROGRESS.md)
concisely; and appends material decisions to [the decision log](../DECISIONS.md).
Preserve failed attempts as diagnostics. Follow [verification](../VERIFICATION.md),
[development](../DEVELOPMENT.md), [accessibility](../ACCESSIBILITY.md), and
[performance](../PERFORMANCE.md) conventions.

### C0 — Persist approved planning and stop

**Outcome:** an approved planning branch ready for `/goal`.

After explicit approval and when write operations are enabled:

1. Confirm a clean working tree; update local `master` from `origin/master` using
   a fast-forward-only operation. Stop on divergence or unexpected changes.
2. Recheck issue state, base changes, branch/tag availability, and release
   baseline. Revise the proposal if material facts changed.
3. Create `feat/issue-95-workspace-sequence-viewer`.
4. Write the approved feature plan as the first branch change. Record approval
   metadata and append D-146 plus the concise project progress handoff.
5. Validate links, whitespace, staged documentation-only scope, and absence of
   prohibited external product references.
6. Commit exactly `docs(plan): add approved plan for issue 95`.
7. Push with upstream tracking if remote access is available; verify the remote
   SHA.
8. Report plan path, branch, commit, milestones, and release impact.

**Acceptance:** planning documents only; application versions and implementation
remain unchanged.

**Rollback:** documentation-only revert.

**Mandatory stop:** do not implement, open a PR, publish issue messages, or create
a release. Leave the repository ready for `/goal`.

### M1 / C1 — Extract the working sequence presentation

**Outcome:** the existing Sequence tab uses the dedicated component and indexed
protein-row model.

**Affected areas:** sequence presentation/model helpers, Inspector integration,
focused tests.

**Acceptance:** protein-only rows retain source boundaries, correct labels/order,
nonstandard identities, exact selection operands, partial coverage, shared
anchors, and stale-context rejection. The extracted component is exercised
through the existing working UI.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run sequence selection-gestures component-membership structure-loading
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/synchronized-selection.spec.ts tests/e2e/protein-residue-hierarchy.spec.ts
```

Also run frontend lint, typecheck, complete frontend tests, build, and
`git diff --check`.

**Documentation/migration:** update the feature log and relevant sequence/gesture
guidance; no migration.

**Commit:** `refactor(sequence): extract indexed protein sequence presentation`.

**Rollback:** revert the extraction; persisted molecular data is unaffected.

### M2 / C2 — Deliver the docked stacked viewer

**Outcome:** the complete sequence browsing/selection workflow operates below the
canvas; the Inspector Sequence tab is removed.

**Affected areas:** workspace/viewer integration, display derivation,
presentation preferences, transient navigation, virtualization, styling, and
browser tests.

**Acceptance:**

- Multiple displayed entries/chains appear together; hide/show, protein
  settings, representations, isolation, surfaces, scene changes, and Undo/Redo
  update eligible rows.
- Partial display retains complete observed chain context.
- Collapse/hide/restore remain independent of Properties/History/Jobs.
- Scrolling, keyboard focus, and responsive remounts preserve valid browsing
  context.
- All picking modes, modifiers, cross-panel anchors, and partial coverage work.
- Presentation changes do not remount the renderer, mutate the project, move
  the camera, alter visibility, or change picking mode.
- Loading/error/retry and topology/deletion focus recovery are safe.
- Existing tests using the removed tab navigate to the replacement while
  retaining their scientific assertions.

**Focused validation:**

```bash
corepack pnpm --dir apps/web exec vitest run sequence project-workspace selection-gestures structure-loading
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/sequence-viewer.spec.ts tests/e2e/synchronized-selection.spec.ts tests/e2e/selection-gestures.spec.ts tests/e2e/protein-residue-hierarchy.spec.ts tests/e2e/release-journey.spec.ts
```

Add `tests/e2e/sequence-viewer.spec.ts`. Run the frontend checks required at C1.

**Accessibility/performance acceptance:** both themes, desktop/mobile, 320 px
width, actual 100%/200% zoom, scoped axe, keyboard-only operation, and touch
scrolling pass. Qualify an already-loaded visible 10,000-residue/30,000-atom
navigation fixture plus a many-chain case, with the existing unvirtualized
property table unmounted. Operations complete within 5 seconds, longest observed
main-thread tasks remain below 750 ms, DOM respects the specified windows, and
browsing causes zero repeated normalized GETs. Retain existing native viewer
budgets separately.

**Documentation/migration:** update architecture, accessibility, performance,
navigation/gesture guidance, progress, and verification evidence. Additive
browser preference only; no database migration.

**Commit:** `feat(sequence): dock displayed protein chains below the viewer`.

**Rollback:** revert frontend additions; older clients ignore the extra browser
preference.

### M3 / C3 — Qualify the final-version candidate

**Outcome:** a reviewed, reproducible candidate ready for a PR.

**Affected areas:** regression coverage, five version sources, compatibility
evidence, release notes, and documentation.

Run the complete release gate from a clean, fixed candidate:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
.venv/bin/uv run alembic upgrade head
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

Supply disposable migration/browser stores and unused ports, the documented
[locked AmberTools prefix](../../tools/README.md), and bounded native threads.
Set `MOLWEAVE_DATA_DIR` to the dedicated disposable migration store before
Alembic; never target managed user data.

Complete the existing 20-step release recipe, including both actual tagged
**v0.25.0 ↔ final 0.26.0** producer/reader directions using
`tests.support.selection_reader_qualification`, version/dependency audits, and
source/log integrity checks. Use separate producer/reader processes with
explicit module roots, `--implementation-root`, `--expected-version`,
`--data-dir`, and `--evidence` arguments.

**Acceptance:** originals, molecular state, all conformers, saved
selections/scenes, surfaces, jobs, history, and archive remapping pass both reader
directions. Sequence browsing state is absent from durable output. Native tests
independently prove new interaction authoring.

Retain exact commands/environment, logs, hashes, screenshots, timings,
exclusions, and full-diff review under
`docs/assets/workspace-sequence-viewer/`. Distinguish implementer self-review
from independent approval.

**Documentation/migration:** finish verification, limitations, release notes,
compatibility guidance, and plan/progress evidence; confirm unchanged schemas
and migration head.

**Commits:** substantive `test(sequence): ...` and
`chore(release): prepare v0.26.0`; no empty checkpoint commits.

**Rollback:** qualify matching v0.25.0 client/API against retained data; no schema
downgrade.

### M4 / C4 — Merge, publish, and close out

**Outcome:** remotely verified delivery and cleanup.

Open the PR after C3 passes. Document implemented, simplified, omitted, deferred,
and rejected requirements, including the user-approved stacked rows and
protein-only scope. Satisfy current checks, reviews, and conversations without
bypass.

After normal merge, repeat the complete gate and both actual-reader directions
on the **exact merged master SHA**. Only then create the annotated tag and stable
GitHub release.

**Acceptance/validation:** verify remote merge SHA, annotated tag target, stable
release state, notes, downloadable evidence hashes/archive integrity, issue
reply, and cleanup. Record publication through the established
documentation-audit PR convention; keep the runtime tag fixed.

**Commit:** `docs(release): record verified v0.26.0 publication`.

**Rollback:** failed merged qualification blocks publication. Correct through a
reviewed PR and repeat qualification; never move a published tag.

## 5. Version, delivery, and completion records

**SemVer: stable minor, 0.25.0 → 0.26.0.** The work adds an independently
accessible sequence workspace that remains usable alongside Inspector tools and
the lower panel. A patch understates that navigation capability. A major
increment is unnecessary because public APIs and durable data remain compatible;
the explicitly approved protein-only UI narrowing does not remove molecular
access or a promised nonprotein sequence contract. A prerelease is unnecessary
after established stable qualification passes.

Update all five authoritative sources together in the implementation PR:

- `apps/web/package.json`
- `pyproject.toml`
- Root project package version in `uv.lock`
- FastAPI version in `apps/api/src/molweave_api/main.py`
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`

Keep dependency resolutions unchanged. Reassess the version if the baseline
advances or `v0.26.0` becomes occupied. All five remain 0.25.0 at C0.

Release notes will contain: **Features; Interaction and accessibility changes;
Scope decisions; Data/migrations/API compatibility; Verification and performance;
Scientific limitations and rollback.**

Use `Closes #95` in the implementation PR. After verified release, publish the
final issue reply with delivered behavior, approved deviations, evidence,
release links, and remaining limitations. No new follow-up issue is currently
necessary. Create a narrowly scoped linked follow-up only if implementation
exposes a consequential requirement that cannot be delivered under this
contract; do not silently defer an essential outcome.

Merge/release blockers include failing required checks, unresolved consequential
findings or conversations, missing approvals required by current policy,
unexpected schema/API/chemistry changes, incompatible readers, mismatched
versions, unqualified native scientific skips, unexplained test exclusions,
performance/accessibility failures, stale selection acceptance, or unverified
release targets/assets.

Delete the feature branch and disposable reader worktrees only after verified
merge, publication audit, and close-out. Verify cleanup remotely and preserve
unrelated branches/worktrees.

### Progress and completion log

| Date/checkpoint | Status and evidence |
|---|---|
| 2026-10-28 — Approval | User approved the complete proposal with “Implement the plan.”; C0 only, stop ready for `/goal`. |
| Planning baseline | `corepack pnpm --dir apps/web exec vitest run selection-gestures component-membership structure-loading` passed 3 files / 37 tests. Baseline evidence only; no feature-completion claim. |
| C0 — Base and branch | Clean `master`; `git pull --ff-only origin master` already up to date at `d459e073732b1d9ccbba5f404a0d6206c4a12f4e`; clean tree reconfirmed; approved feature branch created. Issue and stable release baseline unchanged. |
| C0 — Persistence and validation | This approved plan is the first branch change; D-146 and concise project progress accompany it. Documentation checks pass: 13 relative links, exact three-file scope, preserved accepted decisions/prior progress, no prohibited references or conflict markers, all five versions still 0.25.0, and unchanged global plan/product specification/verification. Staged whitespace and scope checks precede `docs(plan): add approved plan for issue 95`; its commit/push receipt is reported in the C0 handoff. |
| C0 — Remote receipt | Planning commit `e51c0d37ff6de8b66b0b1c7f2ce932eaf2cb9fc8` pushed and remotely verified; clean tree. |
| 2026-10-28 — Implementation authorization | User’s `/goal` authorizes implementation, checkpoint qualification and verified delivery under this contract. |
| M1/C1 — Complete | [Final gate](../assets/workspace-sequence-viewer/c1-final-gate.json): 48 focused / 357 complete frontend / 7 native browser tests pass, one existing mobile exclusion of the desktop three-panel workflow. Lint/typecheck/build/diff pass. [Summary](../assets/workspace-sequence-viewer/c1-final-summary.json), [browser report](../assets/workspace-sequence-viewer/c1-final-browser-results.json.gz), [implementer review](../assets/workspace-sequence-viewer/c1-review.md). All source identities fixed. [Initial lint attempt](../assets/workspace-sequence-viewer/c1-initial-gate.json) retained as diagnostic; obsolete imports corrected without assertion changes. |
| M2/C2 — Complete | [Final fixed-source gate](../assets/workspace-sequence-viewer/c2-final2-gate.json), [summary](../assets/workspace-sequence-viewer/c2-final2-summary.json), [browser](../assets/workspace-sequence-viewer/c2-final2-browser-results.json.gz), [actual zoom](../assets/workspace-sequence-viewer/c2-final2-zoom-results.json.gz), [review](../assets/workspace-sequence-viewer/c2-review.md): 58 focused / 366 full frontend / 36 browser / 1 actual-zoom tests pass, three existing mobile exclusions; no failures/flakes/retries. All 580 source identities and logs fixed. Displayed 10,000 residues/30,000 atoms: 2033/1893ms total, 384/315ms longest tasks, mounted 20/15 within 29/24 bounds, zero repeated reads, property table unmounted. Both themes/320px/keyboard/collapse/hide/scroll/remount/selection/visibility/Undo and actual 100%/200% zoom pass. Initial lint/test-type failures and interrupted native attempt remain diagnostic; original assertions/budgets/fixtures unchanged. |
| M3/C3 — Review correction | [Review gate](../assets/workspace-sequence-viewer/c3-review-gate.json) passes59 focused/367 frontend/six native cases plus lint/types/build/diff, no exclusions/retries. Removed obsolete Inspector callback/spinner selector, generated a unique content ID and fixed ownership loss after null-target blur. [Fail-first proof](../assets/workspace-sequence-viewer/c3-focus-fail-first.json) reproduces inappropriate focus reclamation on the old guard; restored source matches the passing gate exactly. Full final-version qualification remains pending. |
| M3/C3 — Release preparation | Five versions0.26.0, archive provenance assertions/current prior-version case updated; Ruff/mypy102 files/37 archive tests/version audit/diff pass. [Preparation record](../assets/workspace-sequence-viewer/c3-release-preparation.json). Detached actual v0.25.0 reader at `2adeaac973a6047ee537fd8c639f3b3e18d216b0`; candidate/exact-master20-step recipes prepared. Latest fetched `origin/master` remains the approved base and v0.26.0 is unused. Full gates pending. |
| M3/C3 — Boundary review | Last-chain removal returns only owned focus to the surviving header and retires stale intent. Project-scoped viewport reads cannot inherit another cached project’s offsets before App reconciles session state. Fail-first proofs: [last chain](../assets/workspace-sequence-viewer/c3-last-chain-fail-first.json), [project viewport](../assets/workspace-sequence-viewer/c3-project-viewport-fail-first.json). [Final boundary gate](../assets/workspace-sequence-viewer/c3-boundaries-gate.json) passes62 focused/370 frontend/six native cases, lint/types/build/diff; no exclusions/retries, fixed source/log hashes. Candidate1 stopped for this review correction after294 passing Python cases; its incomplete gate is diagnostic, not qualification or a waived test. |
| M3/C3 — Surface audit correction | Candidate2 passes1250 Python/370 frontend/static/build but fails a stale all-surface test that still opens the removed Inspector Sequence tab; the following zoom case and remaining suite were deliberately interrupted. [Diagnostic](../assets/workspace-sequence-viewer/c3-candidate2-diagnostic.json), original failure trace/logs retained. The replacement audit asserts tab removal and checks the docked region in both themes/layouts. [Focused gate](../assets/workspace-sequence-viewer/c3-surface-gate.json) passes62 focused/370 frontend/two browser cases plus lint/types/build/diff, zero exclusions/retries, fixed source/logs. All other surface assertions, fixtures, limits and exclusion set remain intact. New clean candidate3 required. |
| M3/C3 — Native readiness correction | [Candidate3 diagnostic](../assets/workspace-sequence-viewer/c3-candidate3-diagnostic.json):1250 Python/370 frontend and342 browser pass,61 unchanged exclusions, one zero framebuffer sample immediately after mutation; all404 variants finish, no source drift. Screenshot and read-only reopen support transient readiness; no specific GPU cause claimed. Poll the identical16-point sum >0 within the original5000ms expect timeout. [Focused correction gate](../assets/workspace-sequence-viewer/c3-canvas-gate.json) passes62 focused/370 frontend/three explicit complete native protein-workflow repetitions, static/build/diff; no exclusions/retries. No production, fixture, pixel assertion, scientific/performance budget or host-setting change. Candidate4 and actual readers remain mandatory. |
| M3/C3 final gate–M4/C4 | Pending. Record each checkpoint’s commits, commands/evidence, deviations, candidate/merged gates, publication receipts, and cleanup here as they occur. |

**Known limitations:** sequence navigation is observed protein context, not
alignment, reconstruction or nonprotein sequence browsing. The large profile is
synthetic navigation with the property table unmounted. No version/schema/
migration/dependency change at C2; final complete release and actual-reader gates
remain pending. C2 review identifies bounded cleanup for the final candidate.

**Blockers:** none.

**Next action:** M3/C3 — commit the passing native-readiness correction and its
retained diagnostic/focused evidence. Run clean fixed candidate4 and actual
v0.25.0 readers before opening the PR; exact merged-master qualification and
verified publication remain M4.
