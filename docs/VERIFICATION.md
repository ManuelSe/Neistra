# V0.1 Requirement Evidence

Status: MolWeave v0.1 release matrix

This matrix maps every atomic requirement ID from `docs/PLAN.md` section 11 to
its implementation milestone and release evidence. ID intervals are inclusive;
there are no implied gaps inside a listed interval. The complete release gate
is documented in `README.md` and `DEVELOPMENT.md`.

| Requirement IDs | Milestone | Passing evidence |
|---|---|---|
| UI-01–UI-06 | M1–M9 | `project-workspace.test.tsx`, `project-lifecycle.spec.ts`, `responsive-workspace.spec.ts`, `release-journey.spec.ts` |
| UI-07–UI-08 | M1, M10 | `release-hardening.spec.ts` light/dark axe and responsive checks; manual 100%/200% visual check in `ACCESSIBILITY.md` |
| PM-01–PM-10 | M1, M2, M9 | project schema/service unit tests; `test_import_export.py`; `test_job_lifecycle.py` |
| PM-11–PM-19 | M1, M2, M8 | `project-lifecycle.spec.ts`, `import-display-export.spec.ts`, `export-archive.spec.ts` |
| PM-20–PM-23 | M3 | `synchronized-selection.spec.ts`, `project-browser.test.tsx` |
| PM-24 | M1 | dirty recovery integration/component and `project-lifecycle.spec.ts` reload workflow |
| PM-25 | M8 | `test_archive_roundtrip.py`, `export-archive.spec.ts` |
| PM-26 | M1, M10 | `PROJECT_SCHEMA.md`, migration tests, strict project/manifest schema validation |
| FF-01–FF-09 | M2 | `tests/unit/adapters`, `test_format_fidelity.py`, `test_import_export.py` |
| FF-10 | M2, M8 | `test_export_policy.py`, `import-display-export.spec.ts`, `export-archive.spec.ts` |
| FF-11–FF-18 | M8 | export/archive unit and integration suites plus `export-archive.spec.ts` |
| VW-01–VW-02 | M2 | viewer adapter/structure-loading component tests and `import-display-export.spec.ts` real WebGL checks |
| VW-03–VW-30 | M4 | representation unit tests, viewer-state integration tests, `viewer-controls.spec.ts`, `measurements.spec.ts` |
| VW-31 | M2–M10 | `viewer-adapter.test.ts`, project reload/archive suites, `release-journey.spec.ts`; `ARCHITECTURE.md` ownership boundary |
| SL-01–SL-22 | M3–M7 | selection unit tests, saved-selection integration tests, `synchronized-selection.spec.ts`, edit workflow specs |
| NV-01–NV-03 | M4, M5 | `viewer-controls.spec.ts` named camera controls and viewer gestures |
| NV-04–NV-10 | M5 | transform/superposition unit and integration tests; `coordinate-editing.spec.ts`; `release-journey.spec.ts` |
| MI-01–MI-12 | M3, M4 | measurement geometry tests, contact integration tests, `measurements.spec.ts`, `sequence.spec.ts` |
| LE-01–LE-13 | M5, M6 | ligand editor/validator unit and integration suites; `ligand-editing.spec.ts`; definition journey add/transform |
| PE-01–PE-07 | M7 | protein editor/service unit and integration suites; `protein-editing.spec.ts` |
| PE-08 | Deferred | Explicitly excluded from v0.1; no rotamer control; limitation stated in UI, `SCIENTIFIC_LIMITATIONS.md`, and `release-journey.spec.ts` |
| PE-09–PE-13 | M5–M7 | protein edit integration/scientific tests and `protein-editing.spec.ts` failure/success paths |
| PE-14 | M7, M10 | visible editor limitation, `SCIENTIFIC_LIMITATIONS.md`, no preparation/rotamer claim asserted in browser tests |
| EH-01–EH-07 | M1–M8 | history/service unit tests, command integration suites, `project-lifecycle.spec.ts`, coordinate/ligand/protein browser undo/redo |
| EH-08 | M1, M9 | destructive confirmation component/browser tests; job cancellation confirmation in demonstration and release journeys |
| BA-01–BA-11 | M1–M9 | typed source boundaries, API integration suite, worker/job suite, `ARCHITECTURE.md` |
| BA-12 | M1–M10 | core model type tests, plugin registry tests, absence of docking-specific core/API fields and controls |
| BA-13–BA-15 | M2, M6, M7 | adapter/editor/validator protocol implementations and unit suites |
| BA-16–BA-20 | M1, M9 | generic jobs protocol/registry/runner/artifact tests and demonstration plugin |
| JB-01–JB-14 | M9 | job model/migration tests, `test_job_lifecycle.py`, archive round trip |
| JB-15–JB-23 | M9 | job API/worker/recovery integration suites and `demonstration-job.spec.ts` |
| JB-24 | M9 | `packages/molweave_demo_plugin`, its unit tests, and successful browser completion/import |
| JB-25 | M9, M10 | exact extension walkthrough and docking checklist in `PLUGIN_GUIDE.md` |
| PS-01–PS-05 | M1, M9 | migration, repository, transaction, artifact-store, history, and job integration tests |
| PS-06–PS-07 | M1, M2, M8 | upload/archive limit, traversal, safe filename, checksum, and archive-bomb tests |
| PS-08 | M1 | repository/artifact-store protocols and dependency construction covered by unit/API tests |
| SC-01–SC-07 | M2–M8 | scientific fidelity, edit validation, export policy, original-byte, and archive tests |
| SC-08–SC-10 | M1, M8, M9 | allowlisted registry, spawned runner, path/resource/parameter/result validation and failure tests |
| PF-01–PF-04 | M2–M4 | lazy structure query and debounce component tests, spatial worker tests, typed normalized schema |
| PF-05 | M2, M8 | import/export child cancellation integration and browser failure workflows |
| PF-06 | M1–M10 | component/browser loading assertions across import, viewer, export, and jobs |
| PF-07 | M2, M4, M10 | atom-limit integration tests, reduced-detail component/browser check, `PERFORMANCE.md` |
| PF-08 | M2–M5 | request-count assertion in `release-hardening.spec.ts`; coordinate span and structure-query cache tests |
| TS-01–TS-02 | M2, M8 | adapter and round-trip/export/archive suites |
| TS-03–TS-05 | M1, M3, M5–M7 | selection, history/edit, malformed/scientific unit and integration suites |
| TS-06–TS-07 | M1–M9 | complete `tests/integration` suite, including lifecycle, cancellation, and worker recovery |
| TS-08 | M2–M10 | complete Playwright suite and consolidated `release-journey.spec.ts` |
| TS-09 | M2 | every supported extension represented in `FIXTURES.md` and adapter parametrization |
| TS-10 | M2, M10 | official `1STP` protein-ligand complex checksum/scientific test and browser performance gate |
| DC-01–DC-03 | M1, M10 | `README.md`, `DEVELOPMENT.md`, `ARCHITECTURE.md` |
| DC-04–DC-07 | M1, M2, M6, M7, M10 | `API.md`, `PROJECT_SCHEMA.md`, `NORMALIZED_SCHEMA.md`, `FORMAT_MATRIX.md`, `SCIENTIFIC_LIMITATIONS.md` |
| DC-08–DC-10 | M9, M10 | `PLUGIN_GUIDE.md`, runnable demonstration plugin, exact docking integration checklist |
| DD-01 | M10 | frozen setup/migration commands and live API/worker/Vite/browser smoke recorded in `PROGRESS.md` |
| DD-02–DD-04 | M1, M2, M4 | `release-journey.spec.ts` project, multi-file import, nonblank simultaneous distinct representations |
| DD-05–DD-06 | M3 | definition journey atom/hierarchy/project/sequence/Mol* pick assertions |
| DD-07–DD-10 | M1, M4–M7 | definition journey measurement, transform, ligand/protein edit, undo/redo assertions |
| DD-11–DD-12 | M1, M8 | definition journey checkpoint/reload/reopen and selected SDF download |
| DD-13–DD-14 | M9 | definition journey completed/imported job plus running cancellation; demonstration-job success/failure specs |
| DD-15 | M9, M10 | `PLUGIN_GUIDE.md` registration, controlled runner, pose/score, result import, test checklist |
| DD-16 | M1–M10 | definition journey absence check; product has no docking/PDBQT/rotamer placeholder controls |

## Manual Evidence Boundary

Automated tests cover every functional requirement, including browser-visible
success and important failure states. Manual verification is retained only for
visual focus/readability at 200% zoom, subjective theme quality, host-specific
startup observation, and meaningful inspection of WebGL content. The browser
suite still asserts WebGL canvas pixels, accessible surrounding state, and
viewport bounds so these manual checks are supplementary rather than substitutes
for functional automation.

## V0.3.0 Issue #2 Feature Evidence

Status: released in MolWeave v0.3.0

This evidence supplements the v0.1 matrix and follows the approved contract in
`docs/plans/issue-2-structure-hierarchy.md`.

| Feature claim | Passing evidence |
|---|---|
| Source-aware conservative classification | `test_component_classification.py`, `test_components.py`, and `test_release_fixture.py` cover PDB/PDBx source facts, all ten categories, legacy fallback, standalone RDKit ligand identity, ambiguity, and the 1STP complex |
| Complete deterministic membership | Domain invariants prove every atom appears exactly once, stable IDs ignore coordinates/labels/list order, and explicit covalent bonds do not merge source components |
| Additive lazy API | `test_import_export.py` and `test_component_hierarchy.py` validate typed `StructureRead.hierarchy`, immutable originals, and unchanged API/schema/migration versions |
| Central hierarchy selection | `component-hierarchy.test.tsx` and `structure-hierarchy.spec.ts` prove exact category/instance atom sets, chain/residue metadata, pressed state, replace/add/subtract behavior, and synchronization with viewer/inspector/saved selection |
| Camera and project invariance | Exact project reads and named camera snapshots remain equal across hierarchy selection; explicit Focus selection produces a distinct camera |
| Visibility and ligand focus | Unit/component/browser evidence proves application membership drives Protein/Ligands/Solvent/Ions projection, Other/unclassified remains visible, and aggregate ligand focus no longer uses Mol* classification |
| Coordinate/topology/archive stability | Integration tests prove coordinate-exact identity, current membership after atom add/delete, saved-selection reopen, exhaustive archive hierarchy equality, and original-byte preservation |
| Accessibility and responsiveness | Native disclosure/button semantics, axe, keyboard Enter/Escape/focus restoration, desktop and Pixel 7 bounds, and no horizontal overflow pass in `structure-hierarchy.spec.ts` |
| Performance and WebGL | One artifact-keyed structure request serves viewer plus repeated hierarchy actions; category instances mount lazily; meaningful SwiftShader WebGL pixels remain visible through selection and visibility changes |

Checkpoint 1 passed Ruff, strict mypy across 47 source files, 46 focused Python
tests, and `git diff --check`. Checkpoint 2 passed ESLint, TypeScript, all 56
Vitest tests across 18 files, the production build, and `git diff --check`; the
known lazy Mol* chunk was 966.21 KiB gzip and the initial application chunk
152.59 KiB gzip. Checkpoint 3 passed 35 focused integration tests and 8
applicable Playwright workflows with 8 intentional cross-layout skips in 1.1
minutes. The topology finding and repair separately passed 10 focused tests,
Ruff, strict mypy, and diff checks.

Checkpoint 4 passed Ruff, strict mypy across 47 source files, ESLint,
TypeScript, and `git diff --check`. Documentation now maps the executable
ownership, additive schema/API fields, scientific boundaries, accessibility,
performance, fixture provenance, compatibility, and exact evidence without
claiming deferred functionality.

Checkpoint 5 passed frozen Python/JavaScript installs, Alembic `0007 (head)`,
Ruff, strict mypy across 47 source files, all 192 Python tests, ESLint,
TypeScript, all 56 Vitest tests, all 7 supervisor tests, the production build,
and `git diff --check`. The full desktop/mobile Playwright matrix passed 37
applicable workflows with 27 intentional cross-layout skips in 8.2 minutes.
The build retained the expected lazy Mol* warning at 966.21 KiB gzip and the
initial application chunk at 152.59 KiB gzip. Full `origin/master...HEAD`
review found no consequential issue.

No Alembic, project-state, archive-schema, selection, scene, job, or API-major
migration exists. The qualified candidate advances all five authoritative
application versions to 0.3.0 and retains archive producer compatibility
through 0.2.1.

Remote delivery is verified: PR #22 rebase-merged to
`78d079a789368078ec24c4fca7d2d90d6cdab79c`; annotated tag `v0.3.0`
dereferences to that exact commit; the GitHub release is published, non-draft,
and non-prerelease; and issue #2 is closed with its verified final response.

## V0.2.1 Issues #5 And #6 Feature Evidence

Status: released in MolWeave v0.2.1

This feature evidence supplements the v0.1 requirement matrix and follows the
approved combined contract in
`docs/plans/issue-5-viewer-click-selection.md`.

| Feature claim | Evidence |
|---|---|
| Primary activation cannot invoke implicit Mol* focus/reset | `viewer-interaction.test.ts` inspects both configured focus behaviors and exhausts Primary/Trigger with every supported modifier while retaining secondary camera bindings |
| Hit, modifier, and empty selection semantics | Direct interaction-policy tests plus `viewer-click-selection.spec.ts` prove replace/add/subtract, non-empty clearing, and already-empty or modified-empty no-ops |
| Camera-neutral hits and clearing | Exact named camera snapshots remain unchanged across Atom, Residue, Chain, Structure, modifier, and empty-space activations |
| Gesture and explicit-focus preservation | A real drag changes the camera without changing selection; Focus selection and Fit all visible each change the camera explicitly |
| Shared representation path | The desktop workflow configures cartoon, backbone, line, stick, ball-and-stick, space-filling, and surface before representative real-WebGL selection checks |
| Transient and durable ownership | Complete project responses remain exactly equal, project revision and artifacts do not change, and no normalized-structure refetch occurs |
| Compact primary-equivalent path | A Pixel 7 touch-trigger workflow proves Structure selection and empty clearing without durable mutation |

Checkpoint 1 passed all 54 Vitest tests across 17 files, ESLint, TypeScript,
the production build, and `git diff --check`. The build retains the known
non-blocking lazy Mol* warning at 966.15 KiB gzip; the initial application
chunk remains 151.14 KiB gzip.

Checkpoint 2 passed 2 applicable dedicated desktop/mobile workflows with 2
intentional cross-layout skips in 30.8 seconds. The existing viewer-controls
and synchronized-selection regression set passed 6 applicable workflows with
6 intentional cross-layout skips in 56.7 seconds. The first dedicated run
exposed an unsettled initial camera while all seven representations completed
their final automatic fit; baseline capture now requires two identical scene
snapshots and the passing evidence retains exact equality rather than a numeric
tolerance.

The qualification uses the repository's pinned Chromium/SwiftShader desktop
and Pixel 7 projects. It does not claim new cross-browser, WebXR, box-selection,
Molecule/Component picking, or context-input coverage.

The final candidate passed frozen Python and JavaScript installs, Alembic
`0007 (head)`, Ruff, strict mypy across 46 source files, all 182 Python tests,
ESLint, TypeScript, all 54 Vitest tests, all 7 supervisor tests, the production
build, and 35 applicable Playwright workflows with 25 intentional cross-layout
skips in 8.3 minutes. Archive round trips exhaustively pass with 0.1.0, 0.1.1,
and 0.2.0 producer provenance while 0.2.1 output retains archive schema version
1. The known non-blocking lazy Mol* chunk warning remains 966.15 KiB gzip; the
initial application chunk remains 151.14 KiB gzip. `git diff --check` passed.

[PR #17](https://github.com/ManuelSe/MolWeave/pull/17) was verified clean and
rebase-merged after the complete gate and local full-diff review. The requested
`@codex review` integration did not acknowledge or return a review, so no
independent review is claimed. Annotated tag and
[GitHub release `v0.2.1`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.1)
were remotely verified at released `master` commit `c08fbc3`; issues #5 and #6
are closed and their verified close-out replies record delivered and deferred
scope.

## V0.2.0 Issue #3 Feature Evidence

Status: released in MolWeave v0.2.0

This feature evidence supplements the v0.1 requirement matrix and follows the
approved contract in `docs/plans/issue-3-viewer-toolbar-focus.md`.

| Feature claim | Evidence |
|---|---|
| One synchronized picking value | `viewer-toolbar.test.tsx` and `structure-loading.test.tsx`; desktop and Pixel 7 transitions in `viewer-controls.spec.ts` verify toolbar-to-inspector and inspector-to-toolbar updates without changing the current selection |
| Generic camera boundary | `viewer-adapter.test.ts` verifies buffered `focusAtoms` and `fitVisible` forwarding; `structure-loading.test.tsx` verifies action routing without selection callbacks |
| Scientifically bounded ligand target | `focus-targets.test.ts` covers normalized ligand classification, deterministic aggregation/deduplication, component and hydrogen visibility, isolation, and water/ion/polymer/unknown exclusion |
| Real selection, ligand, and all-visible framing | Desktop SwiftShader WebGL captures three named camera snapshots for standalone ethanol plus the classified biotin residue in `1STP`; selection, aggregate-ligand, and all-visible cameras are distinct, and all-visible has the larger radius |
| Camera-only invariance | Exact project responses are unchanged before and after each quick camera action; selection status is unchanged by picking-mode transitions; no additional normalized-structure request occurs |
| Context-aware availability | Protein-only browser input exposes a focusable `aria-disabled` ligand action with an accurate reason; standalone and complex classified ligands enable aggregate focus |
| Responsive and accessible behavior | Pixel 7 uses a labelled select, preserves all named focus buttons and focus help, remains within viewport bounds, and has no horizontal overflow; `release-hardening.spec.ts` passes axe in both themes and both layouts |

Checkpoint 3 commands passed with 5 applicable viewer-control workflows and 5
intentional cross-layout skips in 42.7 seconds, plus 5 applicable
release-hardening workflows and 1 intentional performance-layout skip in 30.2
seconds.

The final candidate passed frozen dependency installs, Alembic `0007 (head)`,
Ruff, strict mypy across 46 source files, all 181 Python tests, ESLint,
TypeScript, all 51 Vitest tests, all 7 supervisor tests, the production build,
and 33 applicable Playwright workflows with 23 intentional cross-layout skips
in 7.9 minutes. The archive round trip exhaustively passes with both 0.1.0 and
0.1.1 producer provenance, while 0.2.0 output retains archive schema version 1.
The known non-blocking lazy Mol* chunk warning remains 965.86 KiB gzip; the
initial application chunk is 151.14 KiB gzip. `git diff --check` passed.

[PR #15](https://github.com/ManuelSe/MolWeave/pull/15) was verified clean and
rebase-merged after the complete gate and local full-diff review. The requested
`@codex review` integration did not acknowledge or return a review, so no
independent review is claimed. Annotated tag and
[GitHub release `v0.2.0`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.2.0)
were remotely verified at released `master` commit `ab14e19`; issue #3 is closed
and its verified close-out reply records delivered and deferred scope.

## V0.1.1 Issue #8 Patch Evidence

Status: released in MolWeave v0.1.1

This patch does not rewrite the v0.1 requirement matrix. It adds regression
evidence for the accepted viewer-theme lifecycle and archive compatibility
contract in `docs/plans/issue-8-viewer-theme-persistence.md`.

| Release claim | Evidence |
|---|---|
| Initial and restored dark Canvas3D | `viewer-theme.spec.ts` real-WebGL luminance after persisted dark preference, first import, responsive remount, and second-page restoration |
| Structure-load and topology-replacement retention | `viewer-theme.spec.ts` second import and ligand atom-add projection replacement |
| Live light update without viewer or molecular mutation | Existing-canvas marker, WebGL luminance, project revision/artifact/viewer-setting API snapshot, canonical selection, loaded count, and normalized-request assertions |
| Component and adapter lifecycle | All 45 Vitest tests, including `structure-loading.test.tsx` and `viewer-adapter.test.ts` |
| Cross-patch archive compatibility | `test_archive_roundtrip.py` imports an explicit 0.1.0 manifest with exhaustive data/original-byte assertions; archive safety cases retain schema and malformed-provenance rejection |
| Complete regression gate | Frozen Python/JavaScript installs, Alembic `0007 (head)`, Ruff, strict mypy, 180 Pytest tests, ESLint, TypeScript, 45 Vitest tests, 7 supervisor tests, production build, and 30 applicable Playwright workflows passed; 20 cross-layout Playwright cases skipped intentionally |

The full Playwright matrix completed in 7.6 minutes. The build retained the
existing non-blocking lazy Mol* chunk warning (965.86 KiB gzip); the initial
application chunk remained 150.15 KiB gzip. `git diff --check` passed.

[PR #13](https://github.com/ManuelSe/MolWeave/pull/13) was rebase-merged after
the final clean release gate and local full-diff review. Annotated tag and
[GitHub release `v0.1.1`](https://github.com/ManuelSe/MolWeave/releases/tag/v0.1.1)
were remotely verified at released commit `fb92de6`. No independent review is
claimed because the requested Codex integration did not acknowledge or return
a review and the repository had no configured checks or required reviews.
