# Issue #49 — Scientifically meaningful interaction controls

## Status, authority, and delivery baseline

Status: **approved; implementation not started**. Approved by the user on
2026-10-11 through “Implement the plan”, with the explicit persist-only handoff
retained. Stop after the documentation commit and verified branch push, ready
for `/goal`.

Issue: [#49](https://github.com/ManuelSe/Neistra/issues/49).
Plan: `docs/plans/issue-49-molecular-interactions.md`.
Base: `master`, verified at `2a33edf90ae384d60cdef378a3ec8d26a7bc9649`.
Branch: `feat/issue-49-molecular-interactions`.
Planned release: **0.13.0**, annotated tag **`v0.13.0`**.
PR title: `feat(interactions): add compact molecular interaction controls`.
Merge strategy: normal merge commit, preserving checkpoint history.

The planning prompt's assertion that Neistra lacks release history is outdated.
GitHub has an established release sequence; the current latest is
[v0.12.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.12.1), with verified
tagged commit `39d5c7b4c142ffb6d327f3ed0eebbc4ce8eb4cda`. Current master includes
the subsequent documentation closeout. Before this plan was persisted, the
working tree was clean, origin was fetched, and `master` was updated using
`git merge --ff-only origin/master`; it was already up to date.

Authority order: explicit user guidance and corrections; AGENTS.md and accepted
decisions; architecture/product boundaries/schemas/conventions; the issue's
underlying problems and constraints; non-binding technical suggestions.

Inspected AGENTS.md, PRODUCT_SPEC, global PLAN, PROGRESS, DECISIONS, VERIFICATION,
architecture, normalized/project schemas, API, migration history, generic jobs,
scientific limitations, frontend state/rendering/visibility, test conventions,
release gate and reader qualification, related issues, branches/tags/releases,
PR conventions, remote rules/workflows, version sources and delivery tooling.
Relevant accepted decisions include D-002, D-013, D-015–017, D-021–023,
D-031–032, D-037, D-042, D-045, D-055, D-070, D-074–084. Newly approved
[D-085–088](../DECISIONS.md#d-085--transient-bounded-molecular-interaction-analysis)
record this plan's cross-project architectural choices; they are approved
contracts, not claims of implementation.

Resolved user decisions:

- Implement all six interaction types.
- Require explicit donor hydrogens; do not generate hydrogens automatically.
- Permit analysis-only standard protein templates, with warnings.
- Keep display choices session-only.
- Pause overlays during coordinate previews.
- Hide hydrogen-bond markers when their polar hydrogen atoms are deliberately hidden.
- Keep CCD-based ligand typing as a separate feature.

Reference-workflow research found dictionary-based bond-order/charge assignment
as a preparation operation, not an uncertainty resolved by the display toggle.
Neistra has no corresponding dictionary or mapping service. The user explicitly
chose a separate feature after that finding. No runtime vendor dependency is
introduced and prohibited reference-product names must not appear in GitHub
issue text, including the follow-up and closeout reply.

## Core problem and approved outcome

Deliver an icon-led **Interactions** control in the viewer menu bar beside
selection, styling, and transformation. It opens a compact nonmodal panel with
six independently selectable types and independent **Intra** / **Inter** switches.

Provide conservative, documented geometric classifications for supported
chemistry. Missing or uncertain chemistry produces explanations rather than
invented assignments. Molecular artifacts remain authoritative; Mol* is a
disposable renderer. Preserve the existing close-contact tool unchanged.

## Requirement disposition matrix

| Significant requirement | Disposition | Approved treatment |
|---|---|---|
| Hydrogen bonds, hydrophobic contacts, π–π, cation–π, salt bridges, clashes | Essential | All six implemented for assessable sites. |
| Placement beside existing viewer controls | Essential | Existing viewer action area; no general toolbar redesign. |
| Compact popover with brief text | Supporting | Bounded nonmodal panel conventions, short labels and secondary Help. |
| Independent type and intra/inter toggles | Essential | Independent display filtering, with no forced category coupling. |
| Within-entry and cross-entry interactions | Essential | Multiple molecules in one entry and separate entries in the displayed Cartesian frame. |
| Molecule identity independent of entry/chain/residue boundaries | Essential | Analysis-specific grouping; selectable components are not whole molecules. |
| Chemical typing and directional geometry | Essential | Tested, versioned rules; no proximity-only chemical assignments. |
| H···acceptor marker endpoints | Essential | Explicit H and acceptor coordinates, donor retained as supporting identity. |
| Missing-H generation | Deferred | Existing explicit hydrogen-addition tools remain the preparation path. No new follow-up. |
| Protein-template assumptions | Supporting | Limited standard-residue registry, provenance and uncertainty warnings. |
| Unknown PDB/mmCIF ligand chemistry | Deferred | Skip dependent classifications with typed-file guidance. Create one CCD follow-up. |
| Overlapping classifications | Supporting | Preserve valid classifications independently; only chemically justified clash exceptions. |
| Current-coordinate refresh | Essential | Refresh committed changes; pause during previews. |
| Continuous preview analysis | Deferred | Extra scheduling and qualification unnecessary here. No follow-up unless requested. |
| Visibility and hidden polar hydrogens | Essential | Logical visibility, isolation, H settings and applicable atom masks. |
| Theme readability and accessible operation | Essential | Distinct patterns, names, keyboard/touch operation, bounded layouts. |
| Scientific fixtures and browser workflows | Essential | Required before release. |
| Responsive ordinary complexes | Essential | Bounded analysis, cancellation and measured browser qualification. |
| Upload preservation and authoritative state | Already satisfied; preserve | Analysis cannot modify artifacts, project state or existing warnings/inferences. |
| Persistent toggles, scenes and undo commands | Rejected for this release | Explicit session-only choice avoids persistence changes. No follow-up. |
| Editable thresholds or multiple profiles | Optional; deferred | One documented profile. No speculative follow-up. |
| Mandatory PLIP/ProLIF dependency | Rejected as proposed | Scientific references plus existing pinned libraries; avoid a larger analysis stack. |

No unresolved product decision remains. Unsupported sites remain visible in the
workspace and receive coverage warnings rather than a universal-support claim.

## Accepted scope and non-goals

Scope: six geometric classifications for assessable chemistry; compact transient
viewer controls; stable molecule grouping; single-entry/cross-entry analysis;
warnings and preparation guidance; correct visibility and committed-coordinate
lifecycle; scientific, API, UI, accessibility, performance and compatibility tests.

Non-goals: automatic preparation, pKa prediction, tautomer enumeration, hydrogen
optimization, docking/scoring, energy estimates, trajectory analysis, symmetry
mates, periodic boundaries, reports/export, interaction editing, selection-centered
analysis or universal chemistry coverage. CCD assignment is a separate follow-up.

## Implementation contract and implications

### Scientific domain and molecular grouping

Implement a pure molecular-core analysis service consuming immutable normalized
structures and stable `(structure_id, atom_id)` references.

- Existing pinned RDKit handles validated small-molecule chemistry and aromatic
  rings; SciPy spatial indexes support bounded neighbor searches.
- Guard conversion before using helpers that substitute unknown charges or bond
  orders. Unknown values must remain unknown.
- An analysis-only registry for the 20 canonical amino acids uses pinned OpenMM
  standard bond definitions plus explicit interaction typing rules. Map only
  observed, unambiguous atoms; create no atoms or coordinates.
- Document conventional ASP/GLU negative and LYS/ARG positive side-chain
  assumptions when explicit evidence is absent. Contradictory chemistry or
  protonation evidence prevents fallback. Do not assume histidine or terminal charge.
- Support explicitly connected water hydrogens and chemically defined small
  molecules. Unsupported sites receive capability warnings.
- Exclude unresolved alternate-location residues from affected classifications;
  do not select an occupancy state.
- Do not infer nonstandard ligand bond orders from distance, residue name or atom names.

Derive molecular grouping separately from the selectable hierarchy:

- Complete small-molecule graphs use connected components.
- Macromolecular source polymer/nonpolymer instances provide grouping evidence
  despite incomplete bond records.
- Unambiguous covalent links join instances, including covalently attached
  ligands. Ambiguous links warn and suppress affected scope-dependent results.
- Separate entries remain separate instances because the current model has no
  cross-entry covalent connectivity.
- Grouping uses stable identities and connectivity evidence, not spatial
  proximity. Coordinate movement cannot split a polymer into new molecule identities.

Within unsupported groups, omit clashes when missing connectivity prevents
defensible bonded-neighbor exclusions. Cross-molecule element-based clash
screening may remain available when molecule separation is established.

### Fixed scientific profile

Use one immutable profile, **`interaction-v1`**. These classification thresholds
are not universal physical boundaries.

| Type | Initial profile |
|---|---|
| Hydrogen bond | Valid donor/acceptor; D···A ≤3.5 Å, H···A ≤2.5 Å, D–H···A ≥130°. Applicable acceptors require H–A–bonded-heavy-neighbor angles ≥90°. Undefined required geometry is unassessable. |
| Hydrophobic | Nonpolar carbon sites with chemically established C/H-only neighborhoods; separation ≤4.0 Å; exclude local covalent neighbors. |
| π–π | Complete aromatic 5/6-member rings; centroid separation ≤5.5 Å; acute plane angle ≤30° for parallel or ≥60° for T-shaped. Parallel offsets ≤2.0 Å in both planes; T-shaped minimum projected offset ≤2.0 Å. |
| Cation–π | Established positive-charge group and complete aromatic ring; centroid separation ≤6.0 Å, lateral offset ≤2.0 Å, centroid vector within 30° of ring normal. |
| Salt bridge | Oppositely charged groups; closest charge-bearing-site separation ≤4.5 Å; no hydrogen-bond angular requirement. |
| Clash | Pinned RDKit element-specific van der Waals radii; overlap ≥0.4 Å. Exclude graph neighbors separated by up to three covalent bonds and qualified hydrogen-bond contact pairs. |

Require aromatic-ring plane RMS deviation ≤0.1 Å; reject degenerate planes.
Unsupported metal coordination warns instead of producing generic clash claims.
Use complete charge groups for recognized resonance-delocalized sites, avoiding
duplicate atom-level salt-bridge markers. Marker endpoints are H/acceptor,
contacting hydrophobic atoms, ring centroids, charge-group centers or clashing
atoms, as appropriate.

Geometry choices draw on
[ProLIF hydrogen-bond/ionic documentation](https://prolif.readthedocs.io/en/latest/source/modules/interaction-fingerprint.html),
[PLIP ring geometry/distance rules](https://github.com/pharmai/plip/blob/master/plip/basic/config.py),
and [published steric-overlap methodology](https://journals.iucr.org/d/issues/2010/01/00/dz5180/index.html).
Additional conservative restrictions are Neistra profile choices, not claims of
equivalence to those tools. Record implemented rule/dependency versions and fixture
provenance; source links do not substitute for validating the chosen profile.

Classification cannot depend on enabled display switches. A valid salt bridge
can retain a valid hydrogen bond. Clash exclusions remain stable when H-bond
display is off.

### Read-only API and execution

Add **`POST /api/v1/projects/{project_id}/interactions`**.

- Request: current entry/artifact references, fixed profile and explicit
  `workspace` coordinate-frame declaration.
- Response: input artifact identities, profile, deterministic interaction
  records, canonical participants, endpoints, geometry and per-type coverage/warnings.
- Reject foreign entries, stale artifacts, malformed inputs and nonfinite
  coordinates. Missing usable coordinates means unassessable input.
- Read normalized artifacts directly without generating viewer exports.
- Run computation in a cancellable child following existing import/export
  patterns. No generic job, result artifact, database record or standalone-worker dependency.
- Admission: 100,000 input atoms, one million candidate comparisons, 20,000
  records and a 30-second deadline. Enforce incrementally; no unrestricted all-pairs array.
- One active analysis per API process; explicit busy response for competing
  requests. Terminate on disconnect/deadline and release resources.
- Limit failures are explicit; no silently truncated result published as complete.

These limits are safeguards; browser timing is independently qualified.

### Frontend ownership, UI, rendering and accessibility

- Application-owned, nonpersisted choices live for the current project session,
  survive renderer remounts and reset on project switch/page reload.
- Defaults: all types off, **Inter** on, **Intra** off. Opening the panel alone
  does no analysis.
- Analyze all visible entries when at least one type and one scope are enabled.
  Cache the latest result by project, sorted artifact identities and profile.
- Type/scope changes filter cached results. Camera, selection, theme, groups and
  ordinary styling must not trigger chemistry analysis.
- Debounce committed input changes by 250 ms; cancel obsolete requests and reject
  late responses using captured input identity/generation.
- Clear overlays before previews reach the renderer. Show compact paused state;
  restore matching cached results after Cancel or analyze new committed artifacts after Apply.
- Filter by current component visibility, isolation and applicable atom masks.
  H-bonds require their explicit H to pass hydrogen visibility settings;
  deliberately hidden polar H means no marker.
- Require complete visible ring membership for centroid interactions.
- Distinguish zero detected, partially assessed and unavailable. Concise errors
  remain visible; Help contains detailed warnings and preparation guidance.

Extend `MolecularViewer` with a typed interaction-overlay setter. Render batched,
nonpickable geometry through the Mol* adapter, independently of measurements.
Patterns supplement colors; omit permanent labels. Preserve camera, selection,
picking and movement focus. The panel follows bounded nonmodal conventions,
accessible names/tooltips, keyboard and touch operation, and focus-scoped Escape.

### Data, migrations, compatibility and rollback

No migrations: Alembic head stays `0013`. Project, normalized, archive and existing
API contracts retain their majors. New endpoint/transient types are additive.
Existing close-contact behavior remains unchanged. Analysis performs no project
commands or molecular mutations and does not persist analysis assumptions in
normalized artifacts. Durable preparation remains an explicit existing edit.

Qualify the actual tagged v0.12.1 reader against final candidate data. Reverting
to that qualified reader requires no schema downgrade/data stripping; transient
interaction display state is lost by design. Earlier reader restrictions remain.

## Milestones and independently verifiable checkpoints

Every checkpoint updates this log and concise project progress. Commit only
passing, coherent states. Common focused gates: Ruff, mypy, frontend lint/typecheck,
applicable domain/component tests, production build and targeted Playwright.
Run relevant combined gates per milestone; complete release gate before opening
and before merging the PR. Required failures must be fixed, not waived.

### M1 — Useful interaction inspection

#### C1 — Clash vertical slice

Outcome: working launcher, intra/inter switches, bounded endpoint, molecule
grouping, warnings and clash overlays.
Affected: molecular core, API transport/execution, viewer boundary, toolbar/panel,
fixtures and tests.
Acceptance: justified exclusions; same/cross-entry scope; no project mutation;
cancellation/limits; stale clearing; camera/selection preservation.

Focused validation:

```bash
.venv/bin/uv run pytest tests/unit/test_interactions.py tests/unit/test_contacts.py tests/integration/test_interactions.py
corepack pnpm --dir apps/web exec vitest run src/test/interactions.test.ts src/test/viewer-adapter.test.ts src/test/structure-loading.test.tsx
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test tests/e2e/interactions.spec.ts
```

Documentation: analysis contract, scientific limits, initial fixtures. No migration.
Commit: `feat(interactions): add bounded clash inspection`.
Compatibility/rollback: additive endpoint/transient rendering; no data conversion.
Omit unimplemented type controls rather than presenting placeholders.

#### C2 — Hydrogen bonds and hydrophobic contacts

Outcome: both types operate through the same complete pipeline.
Affected: chemical typing/geometry, endpoint records, filters/overlays and tests.
Acceptance: correct H···acceptor endpoints, angular rejection, donor/acceptor
chemistry, missing-H guidance, deliberately hidden polar-H suppression and
supported nonpolar typing.
Validation: C1 commands plus `tests/scientific/test_interactions.py`; focused
hydrogen-visibility and measurements browser regressions; common gates.
Documentation: typing/protonation assumptions, thresholds, fixture provenance/coverage.
Commit: `feat(interactions): add hydrogen bonds and hydrophobic contacts`.
No persisted changes; existing preparation tools unchanged. No data rollback.

### M2 — All six types

#### C3 — Aromatic and ionic interactions

Outcome: π–π, cation–π and salt bridges complete the six-type panel.
Affected: ring/charge typing and geometry, marker projection and tests.
Acceptance: parallel/offset/T-shaped cases; directional cation–π rejection;
neutral-versus-charged groups; protonation uncertainty; independent overlapping
classifications.
Validation: expanded unit/scientific/API/component suites, complete interaction
browser workflow and common gates including build.
Documentation: final profile, supported chemistry, deviations from the issue.
Commit: `feat(interactions): add aromatic and ionic contacts`.
Compatibility: same additive response contract; no dictionary downloads or
dependency upgrades. No migration/data rollback.

### M3 — Qualification and delivery

#### C4 — Workflow, accessibility, performance and compatibility

Outcome: qualified behavior through edits, transforms, previews, undo/redo,
deletion, scenes, project switches, remounts, visibility, failures and retries.
Affected: lifecycle coordination, scientific/API/browser fixtures and evidence.
Acceptance: no stale overlays/preview analysis; no molecular payload retransmission
on toggles; no extra structure GETs for cosmetic changes; natural Space/navigation
focus preserved.
Validation: interaction workflows plus existing transformation, hydrogen, surface,
measurements and release-hardening browser tests; common gates.

Browser evidence: Chromium and Pixel 7 emulation; light/dark; keyboard/scoped axe;
320 px bounds; actual 100%/200% zoom. Verify real overlay geometry and pixels,
not merely a nonblank molecule canvas.

Performance: pinned 1STP plus aligned chemically typed ligand fixture; first
analysis-to-overlay <5 seconds, cached toggle <500 ms, longest main-thread task
<750 ms. Record request counts, atom/result counts and host limitations. Existing
budgets remain binding.

Compatibility: actual tagged v0.12.1 reader against final candidate data, archive
producer metadata, retained history, originals, coordinates and jobs. Reuse the
existing two-process helper.
Documentation: evidence matrix, accessibility/performance/scientific guidance,
rollback instructions. No migration.
Commit: `test(interactions): qualify scientific and viewer workflows`; consequential
fixes receive separate Conventional Commits. Rollback needs no data stripping;
transient display state is intentionally lost.

#### C5 — Release preparation and verified publication

Outcome: reviewed PR, passing candidate, verified merged release, issue closeout
and branch cleanup.
Affected: versions, compatibility assertions, release/user documentation, evidence
and remote delivery.
Validation: every documented release command below, plus `git diff --check`.
Repeat complete gate and reader qualification on exact merged master before tagging.
Documentation: final implemented/simplified/deferred/rejected scope, evidence,
release notes and remaining limitations. No migration.
Commit: `chore(release): prepare v0.13.0`; later documentation commits only for
actual new evidence. Recheck base/version collision before release preparation.

## Acceptance and verification evidence

Scientific suites require independently specified positive, negative and boundary
cases for all six types; incomplete/ambiguous chemistry; alternate locations;
covalent attachments; disconnected molecules; hidden H; invalid/degenerate
coordinates; resource failures. Add synthetic known-geometry fixtures and
checksum/provenance-controlled representative molecules. Explicitly test raw
PDB ligand limitations. Do not substitute implementation-mirroring assertions
or undocumented screenshots for scientific expectations.

Complete release gate from DEVELOPMENT, run on clean candidate and exact merged
master, with fresh isolated compatibility/browser stores as documented:

```bash
.venv/bin/uv sync --frozen
corepack pnpm install --frozen-lockfile
MOLWEAVE_DATA_DIR=.molweave .venv/bin/uv run alembic upgrade head
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

Maintain machine-readable evidence and relevant screenshots under
`docs/assets/molecular-interactions/`; identify tested commit, commands, counts,
limits, fixtures and observed timings. Record diagnostics separately from passing
qualification. Keep VERIFICATION, FIXTURES, SCIENTIFIC_LIMITATIONS, API,
ARCHITECTURE, ACCESSIBILITY, PERFORMANCE and DEVELOPMENT current where affected.
State explicitly that persisted schemas remain unchanged. Historical release
counts are not current-feature test results.

## Version, release and delivery plan

Minor **0.12.1 → 0.13.0**: substantial new user-visible scientific inspection and
additive API. Not a patch. No persisted/existing-API incompatibility warrants a
major increment; no prerelease needed when qualification passes.

Update five authoritative sources in the implementation PR:

- `pyproject.toml`;
- root project version in `uv.lock`;
- `apps/web/package.json`;
- FastAPI version in `apps/api/src/molweave_api/main.py`;
- `APPLICATION_VERSION` in `apps/api/src/molweave_api/archive_service.py`.

Update producer-version assertions and notes without unrelated dependency changes.
Recheck current remote versions/tags before preparation; changed baseline or a
collision requires revising this release plan.

Release notes: Highlights; Scientific criteria and supported inputs; UI behavior;
Limitations and deferred work; API/data compatibility and rollback; Verification.

PR title: `feat(interactions): add compact molecular interaction controls`.
Normal merge preserves checkpoints. PR body states implemented, simplified,
deferred/rejected requirements and evidence. Review the entire diff and resolve
consequential findings and required conversations; distinguish local review from
independent review.

Current GitHub audit: no workflows/rulesets or protected master; normal, squash
and rebase merges are available. Recheck before merge; do not invent CI evidence
or bypass newly introduced rules/reviews/checks. Local release gates are binding.

Create one linked follow-up during delivery:
**Feature: CCD-based ligand chemistry assignment for interaction analysis**.
Brief: pinned offline dictionary, unambiguous atom mapping, charges/protonation
limits, provenance, unsupported matches and tests. Cite
[wwPDB CCD](https://www.wwpdb.org/data/ccd); exclude prohibited reference-product
names from GitHub text. Related #12 owns broader analysis/preparation work;
#20 and #21 remain separate component correction/extraction product contracts.
Do not implement those features here or create speculative duplicate follow-ups.

Close #49 when approved scope is delivered through the PR. Post a final verified
reply linking release, evidence, limitations and CCD follow-up. Tag and publish
only verified merged master after its complete gates. Verify remote annotated-tag
target, release state, notes and evidence-asset bytes. Delete the branch locally
and remotely after verified delivery; finish clean on updated master.

Merge/release blockers: failed gates, incorrect classifications/endpoints, silent
uncertainty, stale overlays, molecular mutation, incompatibility, inaccessible
controls, performance regression, incomplete scope documentation, unresolved
consequential review, unmet branch rules, version collision or unverified publication.

## Approval handoff and progress/completion log

Approved handoff is **persistence only**, followed by a stop ready for `/goal`:

1. Confirm clean working tree; fetch origin and fast-forward-only update master.
   Stop on local changes/divergence without overwriting them.
2. Create `feat/issue-49-molecular-interactions`.
3. First branch change: this approved document, accompanied only by concise
   project progress and approved architectural records.
4. Commit `docs(plan): add approved plan for issue 49`.
5. Push and verify the branch when remote access is available.
6. Report exact path, branch, commit, approved M1–M3/C1–C5 and minor release.
7. Stop before feature implementation.

2026-10-11:

- Inspection and remote baseline/protection/workflow/release checks complete.
- User decisions and full implementation proposal approved.
- Clean master fetched and fast-forward-only checked at the stated base.
- Dedicated feature branch created; plan/progress/decisions prepared as first change.
- No feature implementation, scientific qualification or release gate performed.
- Plan commit and remote push are verified in the handoff response, rather than
  embedding this document's own commit identifier in its content.
- M1/C1, M1/C2, M2/C3, M3/C4 and M3/C5 remain pending.
- No PR, CCD follow-up, feature tag or release created; existing release remains 0.12.1.
- Known limitations: approved chemistry coverage, explicit-H requirement,
  uncertain raw-PDB ligands, fixed profile and pinned/emulated qualification scope.
- Blockers: none at plan handoff. Next action: `/goal` to authorize implementation.
