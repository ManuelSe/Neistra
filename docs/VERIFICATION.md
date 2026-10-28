# V0.1 Requirement Evidence

## Workspace protein sequences (issue #95) — stable v0.26.0

The [approved contract](plans/issue-95-workspace-sequence-viewer.md), D-146 and
[sequence guidance](SEQUENCE_VIEWER.md) govern. M1/C1 extraction and M2/C2 docked
stacked browsing and both complete final qualifications pass. Normal
[PR #124](https://github.com/ManuelSe/Neistra/pull/124) delivers stable
[v0.26.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.26.0) from exact runtime
`582617139527cf22dd7ec9514632b121a628959a`.

[C1](assets/workspace-sequence-viewer/c1-final-gate.json) passes 48 focused/357
frontend/seven native cases, one existing mobile layout exclusion. [C2](assets/workspace-sequence-viewer/c2-final2-gate.json)
passes 58 focused/366 frontend/36 browser/one actual-zoom case, three existing mobile
layout/zoom exclusions, zero failures/flakes/retries. Lint/types/build/diff, all 580
C2 source identities and lossless logs verify. [Summary](assets/workspace-sequence-viewer/c2-final2-summary.json)
retains exact counts, exclusions and synthetic performance context.

Shared resolver tests cover complete panel residues/ranges in all four picking
modes. Native tests prove stacked displayed chains, source-order residue selection,
fixed shared anchors, partial coverage, visibility/
isolation/Undo, independent collapse/hide/persistence, keyboard, scroll clamping,
owned responsive focus, renderer/camera/project/request invariants, both themes,
320px and actual100%/200%browser zoom. All new feature cases run on desktop/mobile.
The displayed 10,000-residue/30,000-atom profile with property table unmounted takes
2033/1893ms, longest384/315ms, mounted 20/15 within 29/24 bounds, zero repeated reads.
The 24-chain stack also keeps DOM bounded. Existing native/scientific budgets and
actual tagged 0.25.0↔final 0.26.0 readers are qualified by C3/C4 below.

Initial lint/test-type and interrupted native attempts are retained as diagnostic.
Tiny existing gesture targets require explicit UI camera zoom in the shorter
canvas; original fixtures, exact assertions, budgets and production picking are
unchanged. [Review](assets/workspace-sequence-viewer/c2-review.md) is implementer
self-review, not independent approval. No schema/migration/API/job/dependency or
scientific-model change; all five versions remain 0.25.0 at C2.

The clean [candidate 80720fe](assets/workspace-sequence-viewer/c3-candidate4-gate.json)
passes all 20 release commands:1250 Python/370 frontend/8 supervisor/343 browser,
61 exactly unchanged exclusions, no failures/flakes/retries/Python or required
native scientific skips. [Summary](assets/workspace-sequence-viewer/c3-candidate4-summary.json)
verifies all 583 source identities, lossless log hashes and actual tagged 0.25.0↔final
0.26.0 producer/readers in both directions. Five versions agree, dependency/API/
schema/migration/tool pins remain, production output excludes observation harnesses.
The final displayed profile takes 2050/2162ms, longest 281/383ms, bounded 20/15 tiles,
zero refetches and unmounted property table. Every existing native budget passes.
[Complete-diff review](assets/workspace-sequence-viewer/c3-full-diff-review.md) is
implementer self-review, not independent. Earlier full-run failures are retained as
diagnostic; stale Inspector navigation and a one-shot redraw observation are fixed
without changing fixtures, pixel conditions, numerical limits or exclusions.
The [exact merged-master gate](assets/workspace-sequence-viewer/c4-merged1-gate.json)
and [summary](assets/workspace-sequence-viewer/c4-merged1-summary.json) repeat all 20
commands/counts/exclusions, both actual-reader directions and 583 identical source
bytes/log hashes. Merged displayed profile 2071/2095ms, longest 332/386ms, mounted 20/15
within 29/24, repeated reads 0/0 with property table unmounted. Every existing native
budget passes;253 merged AC samples retain the host context. [Publication](assets/workspace-sequence-viewer/c4-publication.json)
verifies annotated tag/exact commit, stable latest release/notes, anonymous public
ZIP SHA256/CRC/all 6,306 internal hashes and [issue close-out](https://github.com/ManuelSe/Neistra/issues/95#issuecomment-6473416179).
Final documentation integration/ref cleanup receipts live at that reply; runtime
source/tag stay fixed. No required review/check/protection or unresolved conversation
is bypassed; Codex request is unreturned and local review remains self-review.

## Protein residue browsing (issue #94) — stable v0.25.0

The [approved contract](plans/issue-94-protein-residue-hierarchy.md) and D-144/145
govern. Implementation [PR #121](https://github.com/ManuelSe/Neistra/pull/121) and
[helper correction #122](https://github.com/ManuelSe/Neistra/pull/122) normally merge;
stable [v0.25.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.25.0) targets exact
qualified runtime `2adeaac973a6047ee537fd8c639f3b3e18d216b0`.

Both [candidate3](assets/protein-residue-hierarchy/c3-candidate3-gate.json) and
[exact merged2](assets/protein-residue-hierarchy/c4-merged2-gate.json) pass all
20 commands: **1,249 Python, 349 frontend, 8 supervisor, 331 native browser tests**,
61 documented layout/timing exclusions, zero failures/flakes/retries/Python or
required native scientific skips. The exclusion set is the previous 60 plus the
new desktop-only residue-zoom case's mobile entry. Both layouts' residue workflows
run. Frozen dependencies, fresh 0014, Ruff/mypy/ESLint/TypeScript, production build,
actual tagged 0.24.1 ↔ final 0.25.0 readers and metadata/harness checks pass. All
571 source identities and every lossless log hash match both phases, digest
`1a8d90cfcac3270dd8592868158cfbfbcd0c60285e5191b0b7bd9971d3a06198`.

[C1](assets/protein-residue-hierarchy/c1-final-gate.json) and
[C2](assets/protein-residue-hierarchy/c2-final2-gate.json) independently qualify
shared gestures, source-order boundaries, insertion codes, hidden-H membership,
partial coverage, stale contexts, keyboard parents, remount/scroll and exact
project/camera/request invariance. Complete candidate/merged native cases cover
both themes, 320 px and actual 100%/200% zoom. Raw reports and screenshots retain
trusted input and read-only native observation. Exact originals, all conformers,
saved selections/scenes/surfaces, jobs, Undo/Redo and archive remapping survive;
portable archives retain current state rather than Undo history. Transient anchors
and expansion do not enter durable state. All five versions are 0.25.0; schemas,
0014, scientific models, dependencies and public contracts remain unchanged.

Merged 10,000-residue / 30,000-atom navigation ranges take 604.4/586.3 ms,
longest tasks 199/185 ms, 13/22 rows within 24/33 bounds and zero repeated reads.
The entry is loaded/hidden and property table unmounted; no general full-table or
chemistry claim is made. Standard 1STP interactions take 3,763 ms / 642 ms longest
task / zero refetches. Native cold small/pocket/18k paint is 0.874/2.076/3.597 s,
first actual frame 709.3 ms and Cancel 53.6 ms. All original budgets remain.
All 249 candidate / 251 merged power samples report AC online after the user's
connection. No agent host setting, assertion, fixture or limit is changed.

Earlier locator/timing/interrupted attempts remain diagnostic. Publication-helper
paths are corrected in #122. The results postprocessor uses byte-exact qualified
C3 source to restore the actual preceding-release exclusion-baseline filename;
[provenance](assets/protein-residue-hierarchy/c4-report-tool.json) retains both
hashes/source, and this docs-only audit persists that exact correction. No gate
result, runtime/test byte or exclusion assertion changes. Local
[full-diff review](assets/protein-residue-hierarchy/c3-review.md) is implementer
self-review. Codex requests return no review; no required approval/check or
unresolved thread is bypassed, as the
[prepublication audit](assets/protein-residue-hierarchy/c4-prepublication-audit.json)
records.

[Publication audit](assets/protein-residue-hierarchy/c4-publication.json) verifies
the exact annotated tag, stable latest release/notes, public ZIP SHA256/CRC/all
5,961 internal hashes and [issue close-out](https://github.com/ManuelSe/Neistra/issues/94#issuecomment-6371430529).
The publication documentation PR and delayed actual branch/worktree cleanup are
recorded at that reply after verification; the runtime tag remains fixed. #95
retains separate Sequence layout scope; no essential outcome is deferred or new
follow-up needed.

## Compact molecular toolbar (issue #93) — stable v0.24.1

Issue [#93](https://github.com/ManuelSe/Neistra/issues/93) is implemented under its
[approved contract](plans/issue-93-compact-modeling-toolbar.md), normally merged in
[PR#117](https://github.com/ManuelSe/Neistra/pull/117), [focus correction PR#118](https://github.com/ManuelSe/Neistra/pull/118) and
[qualification PR#119](https://github.com/ManuelSe/Neistra/pull/119), published stable
[v0.24.1](https://github.com/ManuelSe/Neistra/releases/tag/v0.24.1) from exact verified runtime`d9bc489a0378b94d20fddae05588e2769b258caf`.
D-143 records compact Transform/Edit/Minimize launchers and panel-independent
quick execution. Minimize opens setup; Ctrl+M runs quietly; active-run reveal,
Advanced AMBER and Jobs inspection remain. All five versions0.24.1; no dependency,
API/job/schema/migration/scientific-model change (head0014, project/viewer/archive2,
normalized/selection1). Originals and fixed/inactive rows/history retain ownership.

Both [candidate4](assets/compact-modeling-toolbar/c4-candidate4-gate.json) and
[exact merged5](assets/compact-modeling-toolbar/c4-merged5-gate.json) pass all20
commands: **1248 Python,331 frontend,8 supervisor,322 browser/60 unchanged
layout/timing exclusions**, zero failures/flakes/retries/Python or native scientific
skips. All568 source/test/tool/patch/lock identities/log hashes, frozen installs,
fresh migration/static/types/build, actual tagged0.24.0↔final0.24.1 readers and
unchanged native budgets verify. Merged cold small/pocket/18k native paint
0.945/2.059/3.425s; first frame580.6ms,
Cancel59.5ms. Command acceptance is distinct from old panel feedback.
[Implementer self-review](assets/compact-modeling-toolbar/c3-review.md) addressed
read-failure retirement and focus handoff. [Premerge audit](assets/compact-modeling-toolbar/c4-premerge-audit.json)
records requested/unreturned Codex review, no required approval/check or unresolved
thread and no override; independent review is not claimed.

[Publication audit](assets/compact-modeling-toolbar/c4-publication.json) verifies
the exact annotated tag, stable latest release/full notes, public downloaded ZIP
SHA256/CRC/all4986 internal hashes and
[issue close-out](https://github.com/ManuelSe/Neistra/issues/93#issuecomment-6349961393). Existing scientific limits remain; no approved core
requirement is deferred or new follow-up created. Existing#83/#107/#114 remain
separate. This documentation audit records verified delivery; its final merge and
actual delayed feature-branch/reader-worktree cleanup are appended to the linked
reply after verification. The runtime tag stays fixed. No product blocker remains.
Next product work requires a separate approved plan.

## Automatic hydrogen editing (issue #92) — stable v0.24.0

The [approved contract](plans/issue-92-automatic-hydrogen-editing.md) governs.
[C1 final](assets/automatic-hydrogen-editing/c1-final-gate.json) passes58 Python,
313 frontend and6 native browser cases with static/type/build checks. C1 adds
explicit automatic API maintenance while preserving legacy callers.
[C2 passing](assets/automatic-hydrogen-editing/c2-attempt3-gate.json) passes64
focused Python,26 panel/314 total frontend and8 native workflows, no failures/
retries/skips. Logs retain exact argv, isolated environment and source hashes.
Earlier incomplete attempts are diagnostic only. Tests independently cover finite
C/N/O/S counts/charge transitions, geometry, unknown/protected/conjugated refusals,
explicit-H sulfonium stereo, conformers/budgets, later site reconciliation,
no-change refusals, exact history/archive/original bytes and native hidden-H/
camera/selection/reload behavior. Reviews are implementer self-review.
[C3](assets/automatic-hydrogen-editing/c3-attempt1-gate.json) passes71 focused Python,
35 projection/panel/314 total frontend and20 native workflows; additional shared
viewer-state/command checks pass17. Native read-only observations verify exact
representation and overpaint memberships after addition, including new H, alongside
combined molecule/settings history and persisted scene/archive boundaries. [C4](assets/automatic-hydrogen-editing/c4-attempt2-gate.json) passes43 focused/318
frontend and57 native cases/5 documented layout exclusions, with all static/type/
build checks. Both themes,320px/actual200%zoom, native picks, automatic inspector
routing, hidden H, exact history/originals and delayed-response ownership pass.
[Review](assets/automatic-hydrogen-editing/c4-review.md) and
[screenshots](assets/automatic-hydrogen-editing/c4-screenshots.json) are retained.
[C5 preflight](assets/automatic-hydrogen-editing/c5-preflight1-gate.json) additionally
passes107 focused Python/321 frontend/14 native and actual-tagged0.23.0/current
module checks. Six new edit cases and the reverse rich project retain exact
conformers/history/appearance/scenes/surfaces/jobs/originals/counters/archives.
The development version is still0.23.0 here. At preflight, complete final-version candidate and
exact-master qualification remained pending; preflight is not release qualification.
A later mirror-conformer counterexample required +H-only strict stereo consistency.
[Fail-first](assets/automatic-hydrogen-editing/c5-stereo-red-gate.json) and
[passing correction](assets/automatic-hydrogen-editing/c5-stereo-green-gate.json)
retain the proof:114 focused Python/321 frontend/14 native and final-version readers.
The earlier complete-candidate1 attempt was intentionally interrupted and is
strictly diagnostic; its1241 Python passes do not qualify the corrected source.

Final [candidate3](assets/automatic-hydrogen-editing/c5-candidate-3-gate.json)
passes the complete20-command release gate on8510c40:1247 Python,321 frontend,
8 supervisor,306 browser/60 unchanged layout/timing exclusions, zero failures/
flakes/retries/Python or native scientific skips. Actual final0.24.0/tagged0.23.0
readers pass both directions, all567 source identities/log hashes verify, and
performance budgets remain unchanged. [Summary](assets/automatic-hydrogen-editing/c5-candidate-3-summary.json)
and [local full-diff review](assets/automatic-hydrogen-editing/c5-review.md) retain
proof. These candidate results preceded the exact-master and publication proof below.

Exact released master `afea0f19efc4cdfb7d1ee497df4a670a1e73a14c` repeats every20-command gate with the same
1247 Python/321 frontend/8 supervisor/306 browser and60 unchanged documented
exclusions, zero failures/flakes/retries/Python or native scientific skips.
[Merged evidence](assets/automatic-hydrogen-editing/c5-merged-1-gate.json) and
[summary](assets/automatic-hydrogen-editing/c5-merged-1-summary.json) verify all567
source/patch/lock identities equal candidate3 and all lossless logs. Both actual
0.23.0↔0.24.0 reader directions retain data/history/originals/archives; unchanged
native performance, chemistry, accessibility and actual zoom gates pass.
[Review audit](assets/automatic-hydrogen-editing/c6-premerge-audit.json) records local
self-review and requested/unreturned Codex review, with no protection/check/review
override. [Publication](assets/automatic-hydrogen-editing/c6-publication.json)
verifies exact annotated tag, stable latest release/full notes and public downloaded
ZIP SHA256/CRC/all4329 internal hashes. The [issue reply](https://github.com/ManuelSe/Neistra/issues/92#issuecomment-6338552997)
records final docs/ref cleanup after actual verification. All five versions0.24.0;
no dependency upgrade/new migration/schema change; runtime tag remains fixed.

## Quick local minimization (issue #110) — stable v0.23.0

Both [corrected candidate10](assets/quick-minimization/c5-candidate-10-gate.json)
0d3657056d99695440ad750fa8bddc71d6adcf3d and
[exact merged2](assets/quick-minimization/c5-merged-2-gate.json)
6536e2a3140d0b8b112562ffec580d37830bc217 pass all20 commands:
**1166 Python,313 frontend,8 supervisor,298 browser/60 documented exclusions**,
zero failures/flakes/retries/Python/native scientific skips. All553 source/test/lock
identities match, SHA2563d3c45deb2639004c758c768be3504606cc8ff37f9c940ab07772e956db200a8,
and compressed logs verify. Frozen installs, fresh0014, static/build/versions/diff,
actual zoom/themes/axe and both actual tagged0.22.1/current reader directions pass;
four retention/archive cases each. No dependency/schema upgrade.

Native cold small/pocket/18k candidate0.889/2.466/3.470s, merged1.159/2.184/3.628s;
first frame686/629ms,Cancel52/49ms. Original budgets unchanged. AC online in all
231/232 power observations; existing profile unchanged. Supplied-file desktop/mobile
Apply/Undo/Redo/reload, independent native force/energy-change equivalence, angular
units/cis-trans physics, damaged rings, bonded/planar acceptance, partial masks,
context extension/serialization and retained AMBER pass. Earlier diagnostics do not
qualify the final source. Read-only private replays pass geometry with exact fixed
rows but mostly remain warned improvements; raw project data is not distributed.
Unsupported coordination remains approximate, not a binding-pose qualification.

[Publication](assets/quick-minimization/c6-publication.json) verifies PR#111/#112,
exact annotated tag6536e2a, stable latest release/full notes and public downloaded
ZIP SHA256/CRC/all4530 internal hashes. The [issue close-out](https://github.com/ManuelSe/Neistra/issues/110#issuecomment-6325592737)
records scope/follow-ups and receives final docs/ref cleanup after verification.
[Full-diff review](assets/quick-minimization/c5-review.md) is local self-review;
no independent approval or required-check/protection bypass is claimed. All five
versions0.23.0. Runtime tag remains fixed; final evidence/docs integration changes
no runtime/test/lock source identity.

## Selection gestures (issue #90)

**Released stable v0.22.0 in PR#105.** The following checkpoint history separates
diagnostics from final qualification; exact-release/publication evidence follows.

M1/C1 [focused/static/build/browser gate](assets/selection-gestures/c1-initial-gate.json)
passes17 Python,60 frontend, Ruff/mypy91/ESLint/types/build/diff and5 native browser
workflows /5 existing intentional layout exclusions. Shared Ctrl/Cmd toggles full
operands and completes partial membership; native four-granularity off/on and
cross-panel synchronization pass without camera/refetch regression.
[Final frontend gate](assets/selection-gestures/c1-final-gate.json) passes all278
frontend/lint/types/diff after one obsolete Ctrl-add expectation was updated.
No migration/schema/dependency/version change. Local checkpoint review only;
double-click/ranges and final candidate/merged compatibility/release gates remain
pending. The approved feature plan retains exact scope and source/log evidence.

M2/C2 [final gate](assets/selection-gestures/c2-final-gate.json) passes17 frontend,
7 Python, lint/types/build/diff and6 native browser cases /2 existing layout skips.
Exact complex residue/ligand expansion retains hidden H and unchanged camera/
revision in both themes/layouts. [Standalone SDF](assets/selection-gestures/c2-standalone-gate.json)
passes2 native cases. Earlier pre-review gate is separate; final runtime restores
nonmolecular-loci no-op behavior. No schema/migration/dependency/version change;
ranges and final release qualification remain pending.

M3/C3 [final gate](assets/selection-gestures/c3-final-gate.json) passes66 focused/
290 total frontend, Ruff/mypy91/lint/types/build/diff and52 native cases /2 existing
layout exclusions, no failures/retries. Exact inclusive forward/reverse ranges,
fixed starts, hidden H/unrelated atoms, component/chain/entry boundaries and
project/artifact/mode/remount/reload ownership pass with movement regressions.
[Review](assets/selection-gestures/c3-review.md) distinguishes initial raster/
visibility qualification diagnostics from passing final evidence. No runtime
change during those diagnostics; native confirmed-pixel trusted clicks retain
exact assertions. No schema/migration/dependency/version change. Final C4 release/
performance/actual-reader gates remain pending.

M4/C4 [native final](assets/selection-gestures/c4-native-final-gate.json) passes14
cases/no skips or retries plus lint/types/diff. Partial-toggle/modified-double-click
and named native range persistence pass. [Initial focused](assets/selection-gestures/c4-focused-gate.json)
passes33 Python/290 frontend/static/build, browser22 pass/5 intentional skips/1
mobile raster miss; final fixes only test scene readiness/native pixel observation.
[Actual-tag fixture](assets/selection-gestures/c4-fixture-reader-gate.json) passes
both directions at preversion0.21, not final0.22 compatibility. Final complete
candidate/merged gates remain mandatory.

M4/C4 [clean candidate7dc4340](assets/selection-gestures/c4-candidate-gate.json)
passes all15 commands:1,107 Python/290 frontend/8 supervisor/282 browser,52 existing
layout/timing exclusions, zero failures/flakes/retries/native scientific skips.
Frozen/fresh0014/static/build/version/diff pass; unchanged runtime/test/tool hashes.
[Actual tagged0.21 reader](assets/selection-gestures/c4-candidate-reader-gate.json)
retains final0.22 data/archives and reverse qualification passes. [Browser summary](assets/selection-gestures/c4-candidate-browser-summary.json)
retains23 attachments:1STP import1154ms, interaction3861ms, longest task652ms, zero
repeat reads; unchanged movement/minimization/surface, both-theme axe and actual
200%zoom pass. [Full-diff self-review](assets/selection-gestures/c4-review.md) has no
unresolved consequential finding. Exact merged-master qualification remains required.

[Exact released master](assets/selection-gestures/c4-merged-gate.json)
`28d3a9bb59c6e786e0586ae589f0e0ebfee7678a` repeats all15 passing commands/counts, zero failures/flakes/retries/native
scientific skips;472 source identities exactly match candidate. Actual tagged0.21
retention passes both final0.22 directions. [Merged browser summary](assets/selection-gestures/c4-merged-browser-summary.json)
retains23 attachments:1STP import699ms, interactions4473ms, longest655ms, zero repeat
reads. All budgets/14 new native gestures/axe/actual200%zoom pass.
[Publication](assets/selection-gestures/c4-publication.json) verifies annotated exact
tag, stable latest release/notes, public ZIP SHA256/CRC/260 hashes and issue reply.
Final docs integration/branch cleanup is recorded in that reply/release audit asset.
No new migration/schema/API/dependency; all five versions0.22.0. No independent
review returned or required approval/check was bypassed; local self-review retained.

## Interactive minimization (issue #89)

M1/C1 [final gate](assets/interactive-minimization/c1-gate.json) passes306 focused
Python (native worker/resource tree, generated identity, editing and archive),265
frontend,8 supervisor and2 native browser cases. Ruff/mypy87/lint/type/build,
fresh0014 upgrade and diff checks pass. Source identities and lossless compressed
logs are retained. Real over-budget resident memory terminates the child/native
grandchild group; allocation and budget failures remain distinguishable. Missing
identity is not mislabeled malformed; protected/unknown facts are not silently
made ordinary. [Full checkpoint review](assets/interactive-minimization/c1-review.md)
is implementer self-review. No migration/schema/dependency/version/model change.
This is C1 evidence only: automatic context/cache/live/acceptance and actual0.20
reader/final release qualification remain later checkpoints.

M2/C2 [gate](assets/interactive-minimization/c2-gate.json) passes206 focused Python,
265 frontend,8 supervisor and19 native browser/3 intentional layout exclusions.
Static/type/build, fresh0014 in isolated browser stacks and existing prepared1STP/
18k performance assertions pass. Automatic discovery keeps full canonical components/
chains, includes hidden cross-entry context, does not recurse and captures unsupported
neighbors for whole-job refusal. Native Apply blocks newly nearby omitted context.
Exact partial/full/multi-entry Undo/Redo, manual controls, keyboard/320px/zoom pass.
Operation schema2 retains resolved model and policy; v1 serialization stays exact.
[Review](assets/interactive-minimization/c2-review.md) is local self-review; initial
fixture-order diagnostic is retained separately. No structural schema/migration/
dependency/application version/model change. Actual old-reader/cache/live/acceptance/
release qualification remain later checkpoints. Vite proxy disconnect resets and
existing bundle warnings remain disclosed, without failing workflow assertions.

M3/C3 [gate](assets/interactive-minimization/c3-gate.json) passes232 broad Python,
9 final cache checks after the last bound fix,1 native paired benchmark,265 frontend,
8 supervisor and16 native browser/2 intentional mobile performance exclusions.
Ruff/mypy89/lint/types/build/fresh0014/diff and existing prepared1STP/18k/cancel/RSS
bounds pass. Native energy/forces match cold and warm, including moved protein
coordinates; changed charge geometry/protonation and model settings invalidate
correctly. Real cache corruption rebuilds the same model, valid components remain
reusable, waiting cancellation releases safely and quota/eviction leave prior job
copies intact. [Three cold/warm pairs](assets/interactive-minimization/c3-cache-pairs.json)
give5.468665s/0.385609s median preparation,14.1819x, zero warm native calls; startup
about6.38s/1.30s. This does not establish live-visible latency or changed-ligand-geometry
reuse. [Review](assets/interactive-minimization/c3-review.md) is local self-review.
No structural migration/schema/dependency/application version/physical-model change.

M4/C4 publishes bounded transient accepted-iterate snapshots (D-116). [Gate](assets/interactive-minimization/c4-gate.json):192 Python,265 web,8 supervisor,2 native browser pass; static/mypy90/build/fresh0014 pass. No frames in durable events/model artifacts; process loss/cancel/restart/project-change guards pass. [Review](assets/interactive-minimization/c4-review.md) is local self-review. Viewer/acceptance remain C5; no migration/schema/dependency/application-version/model change.

M4/C5 [passing gate](assets/interactive-minimization/c5-gate.json):260 Python with
unchanged source hashes,273 frontend,8 supervisor,25 native browser /7 intentional
mobile exclusions; static/mypy90/types/build/fresh0014/diff pass. Real selected-row
Mol* transforms, fixed H, immediate Cancel, strict/warned acceptance and atomic Undo/
Redo pass. [Review](assets/interactive-minimization/c5-review.md) explains corrected
readback/cue quality, duplicate-frame suppression and abortable GPU readiness.
[18k](assets/interactive-minimization/c5-performance-18k.json) records81ms preview,
246ms restore,233ms longest task;500/500/750ms bounds unchanged.
[Partial](assets/interactive-minimization/c5-live-partial.json) and
[whole-heavy](assets/interactive-minimization/c5-live-whole.json) native runs prove
accepted steps while running, exact unselected rows and restoration. Initial/repeat
UI latency is separate from C3 preparation-cache qualification. No structural schema,
migration/dependency/application-version/model change; actual old-reader and final
release qualification remain C6. Earlier attempts are diagnostics, not final evidence.

## Selection minimization (issue #82, C1–C6)

The [approved feature plan](plans/issue-82-selection-minimization.md) is the
contract. [C1 final checkpoint](assets/minimization/c1-gate.json) passes862 Python,
including46 focused prerequisite/scientific/worker cases,255 frontend,8 supervisor
and2 native existing-job passes /2 intentional layout skips, without failures or
retries. Native minimization cases use the locked AmberTools environment and do not
skip. Static/type/build, isolated0014 and diff checks pass on unchanged source;
lossless compressed logs, source/log hashes and [toolchain provenance](assets/minimization/c1-toolchain.json)
are retained. Earlier pre-review passing diagnostics remain explicitly separate.

Real GAFF1.81/AM1-BCC tests cover full/subset/H-only optimization, exact fixed rows,
native force versus numerical energy derivatives, honest iteration-limit outcomes,
aromatic/charged/stereo/halogen examples, sparse IDs/nonfirst active conformers,
immutable snapshots and model-data tamper refusal. Missing/unknown chemistry,
unqualified resonance representation, charge-rounding limits and conflicting
tetrahedral/E/Z intent have explicit outcomes. Real worker tests retain immutable
input/report/proposal/model artifacts and terminate descendants on cooperative or
forced cancellation, deadline, child loss and coordinator loss.

[Complete local C1 review](assets/minimization/c1-review.md) is implementer
self-review, not independent approval. It repaired the E/Z-intent comparison gap
before final repeated gates. C1 adds no migration, top-level schema or application
version change. It does not establish protein-context, Apply/UI, old-reader or
final release qualification; those remain C2–C6. Existing warning advisories remain.

[C2 final checkpoint](assets/minimization/c2-gate.json) adds886 Python (70
focused),255 frontend,8 supervisor and4 native passes /4 intentional layout skips,
zero failures/retries and no native scientific skips. Ruff/mypy84/lint/types/build,
isolated0014 and diff pass on unchanged source. Source/log hashes and lossless
compressed raw logs are retained alongside [fixture hashes](assets/minimization/c2-fixtures.json),
[toolchain provenance](assets/minimization/c2-toolchain.json) and
[local self-review](assets/minimization/c2-review.md).

Real ff14SB/GAFF context tests prove same/separate-entry equivalent mapping,
actual energy/gradient/optimized-outcome changes, movable peptide boundary bonds/
angles/torsions, exclusions and charge/LJ1–4 scaling, force finite differences,
dynamic native neighbors, explicit unconstrained AMBER TIP3P water and isolated
protein NoCutoff behavior. The real worker includes hidden/locked fixed protein
context without changing entries or revision. Missing/ambiguous states,
conflicting known chemistry/stereo, partial chains and adducts refuse.

This is small synthetic C2 qualification, not prepared1STP/large-assembly,
exhaustive-state, Apply/UI or preceding-reader evidence. No structural schema,
migration, application dependency/version change. The unchanged jobs-WebSocket
handler's transport-close traceback is retained in browser logs and assigned to
C4 disconnect cleanup before final delivery. Later checkpoints remain required.

[C3 final checkpoint](assets/minimization/c3-gate.json) passes908 Python (268
focused),255 frontend,8 supervisor and7 native passes /7 intentional layout skips,
zero failures/retries and no native scientific skips. Ruff/mypy87/lint/types/build,
disposable0014 upgrade, existing migration/archive/legacy cleanup and diff pass on
unchanged source. [Complete C3 review](assets/minimization/c3-review.md) is local
self-review; exact commands, environments, source hashes and lossless gzip logs
are retained.

Real-worker Apply tests cover one exact multi-entry ligand/residue command,
Undo/Redo, sparse IDs/nonfirst active/inactive conformers, original bytes/metadata,
all dependency/lock/refusal cases, non-convergence, malformed/corrupt proposals,
no-op and retry-after-Undo behavior. Two concurrent requests produce one command.
Archive round-trip retains reports/model/input/provenance and marks imported
proposals historical. This is not the actual tagged preceding-reader/performance
qualification; C4–C6 remain required. No new migration/structural schema/version/
dependency; minimization registration remains opt-in until the native C4 workflow.

[C4 final checkpoint](assets/minimization/c4-gate.json) passes912 Python (272
focused),265 frontend,8 supervisor,24 native browser /8 intentional layout skips,
zero failures/retries and no native scientific skips. All12 commands pass on
unchanged source, including static/type/build, disposable0014 and diff. Real-worker
native cases cover full/subset isolation, same/separate entries, full GLY plus
ligand, fixed pocket, Ctrl+M submission/explicit Apply, pure nonpickable preview,
non-convergence/Discard, exact Undo/Redo and bounded cancellation/Jobs inspection.
Keyboard/touch,320px,both themes, actual100/125/150/200% zoom and scoped axe pass.
The actual App regression covers pending numerical/minimization handoff; direct
ASGI tests verify idle/transport-race WebSocket cleanup. [Complete C4 self-review](assets/minimization/c4-review.md),
lossless logs, source/fixture/toolchain hashes and images are retained. Interrupted
diagnostics remain separate. Default registration now exposes the dedicated UI;
native installation is optional for startup, required for calculation. No
migration/schema/version/dependency change; C5/C6 qualification remains required.

[C5 final checkpoint](assets/minimization/c5-gate.json) passes all15 commands:
1036 Python (605 focused),265 frontend,8 supervisor,28 native browser /12
intentional layout skips, no failures/retries/native scientific skips. Static/type/
build, fresh0014 and diff pass on unchanged source. Broader coverage includes70
native protein graph states,26 real parameter/finite-difference cases, separate
charge groups/valence/aromatic flags, all native force parameters, singular starts,
ion classification and honest charge failure. [Prepared fixture provenance](../tests/fixtures/minimization/README.md)
preserves the full159-residue1STP chain and901 observed heavy rows; modeled terminal
stereo repair and neutral CCD biotin assumptions are explicit. Raw1STP is unchanged.

[Worker maxima](assets/minimization/c5-performance-summary.json) satisfy120s setup,
60s optimization/publication,2GiB aggregate RSS and5s real-SQM cancellation for
ligand/pocket/18,208-atom cases. Native uploaded PDB/MOL cases retain500ms preview/
Discard and750ms longest-task bounds; existing movement assertions remain unchanged.
Actual tagged0.19 reader paths/version, successful hashed artifact downloads, all
canonical/conformer/original data, generic multi-entry Undo/Redo, jobs/reports/models
and archive re-export pass. C5 producer metadata is development0.19; final0.20
producer/complete-release/exact-merged-master gates remain C6. [Complete C5 review](assets/minimization/c5-review.md)
is local self-review, with separate interrupted diagnostic evidence. No migration,
schema, dependency or application-version change.

[C6 final-version candidate](assets/minimization/c6-candidate-gate.json) at
b0b061d53e6c2a6c680b9ca1891e00bcc23f3b51 passes all18 commands with unchanged
runtime/test/tool source:1,038 Python,265 frontend,8 supervisor,264 browser /50
intentional layout skips, no failures/retries/native scientific skips. Frozen
installs/fresh0014/static/build/diff, five0.20.0 sources, locked native provenance
and final0.20 producer/actual tagged0.19 reader pass. Full desktop/mobile native
workflows, actual desktop zoom, existing movement assertions and prepared-pocket/
18,208-atom bounds pass. [Full-diff review](assets/minimization/c6-review.md) is
implementer self-review. Candidate starts clean; generated evidence/docs are added
afterward without runtime changes. Exact merged-master clean qualification remains
mandatory before tag/release; remote review/protection gates remain binding.

Issue82 [exact released master](assets/minimization/c6-merged-gate.json)
fe4e31e0ec8f4ece32132882a0a526c0576ea560 repeats all18 commands with equal source
identity and clean start/end:1,038 Python,265 frontend,8 supervisor,264 browser /50
intentional layout skips, zero failures/retries/native scientific skips in the
final full run. Frozen/fresh0014/static/build/diff, five0.20 versions, native
verification and actual0.19 reader/final0.20 producer pass. Native performance and
existing movement assertions pass unchanged. An interrupted native-pick miss and
ten unchanged focused repetitions remain separately identified in
[c6-diagnostic-native-pick](assets/minimization/c6-diagnostic-native-pick/c6-merged-gate.json);
no proven source defect or weakened assertion. [Premerge audit](assets/minimization/c6-premerge-audit.json)
confirms no required remote gate bypass; no independent review returned.
[Publication](assets/minimization/c6-publication.json) verifies exact annotated tag,
stable release/notes and downloaded SHA256/CRC/312 manifest files. The
[verified issue reply](https://github.com/ManuelSe/Neistra/issues/82#issuecomment-6255691896)
receives the final documentation/actual delayed-cleanup audit after completion. No migration,
structural-schema or application dependency upgrade; released tag remains fixed.

Issue #74 follows the [approved direct-modeling plan](plans/issue-74-direct-molecular-modeling.md).
[C1](assets/direct-modeling/c1-verification.json) passes66Python/236frontend/
20native browser cases with no failures/flakes/retries and static/build/diff.
Orphan-H paracetamol navigation/editor eligibility, unchanged source/revision,
per-parent generated membership and ambiguous negatives are covered. Initial
observer readiness failure remains diagnostic; local self-review/screenshots are
not independent qualification. Broader direct chemistry/building/release remains.

[C2](assets/direct-modeling/c2-verification.json) qualifies direct normalized
atom/bond editing and display-only/native draft topology:83Python/238frontend/
24desktop-mobile browser passes, no failures/flakes/retries/skips, plus Ruff/
mypy67/lint/types/build/diff. Native broken-aromatic picking, inferred-protein bond
removal/reload/exact Undo and existing edit/owner/focus/camera workflows pass.
Real optional-H resource-limit regression fails before and passes after repair.
Diagnostic and pre-review evidence are separate from final qualification; local
[self-review](assets/direct-modeling/c2-local-review.md) is not independent.
Creation/previews/direct fragments and advanced inspector routing remain C3,
compatibility/scientific/performance qualification C4 and release C5.

[C3](assets/direct-modeling/c3-verification.json) passes108Python/246frontend/
31native cases with3intentional layout skips and no failures/flakes/retries,
plus Ruff/mypy68/lint/types/build/diff. New creation/placement/Cancel/rebuilding,
unknown-chemistry fragments, optional-H fallback, manual permissive edit/warning/
exact Undo, legacy helper workflows and theme lifecycle pass. Real helper-success
checks retain direct records, all six templates stay deterministic, and pure
preview/allocator/generated-empty archive cases pass. [Self-review](assets/direct-modeling/c3-local-review.md)
and screenshots identify mobile panel occlusion for required C4 inspection/a11y
qualification. No independent review, unobstructed mobile preview, full preceding-
reader/performance qualification or release claim is made by this checkpoint.

[C4](assets/direct-modeling/c4-verification.json) passes687Python/248frontend/
99broad native cases/13intentional layout skips, zero failures/flakes/
retries; Ruff/mypy68/lint/types/build/diff and actual clean tagged0.16.0 reader.
Scientific export/stereo/unknowns, sparse model IDs, literal-H interpretation,
all formats/conformers/alternate sites, rich references/archives, pure preview and
allocator guards pass. Both themes/320px/expanded forms/44px/keyboard/real100/200%
zoom and native late-response ownership pass. Original/authored1STP movement and
existing selected surface/navigation budgets remain. Old-reader exact retention
is distinct from expected renderer/helper refusal. Diagnostics/interruption and
[local self-review](assets/direct-modeling/c4-local-review.md) remain separate;
final-version candidate/merged complete release qualification remains C5.

[C5 allocator repair](assets/direct-modeling/c5-allocator-verification.json) passes
693Python/248frontend/39native with7intentional skips and no failures/flakes/retries,
plus static/build/diff and extended actual0.16.0 reader. Five API red/green cases and
native Undo/Redo creation/branch/picking protect monotonic identities; preview and
refusal do not write counters. Actual reader retains produced recreation/archive
floors. Earlier partial candidates remain diagnostic; complete final candidate and
exact-master release gates are still required. D-104 records the compatible design.

[Final clean0.17.0 candidate](assets/direct-modeling/c5-candidate-gate.json)
at`b3238c018649410a3bcc1efd2f45e11def61f0d8` passes all16release commands:693Python,
248frontend,8supervisor,233native with47intentional skips, no failures/flakes/
retries. Both trees clean; frozen installs/fresh0014/static/build/diff and actual
v0.16.0 reader against final0.17.0 data pass, including recreated allocator floors.
Fifteen native profiles retain unchanged budgets. [Full-diff local self-review](assets/direct-modeling/c5-local-review.md)
is not independent; [initial policy audit](assets/direct-modeling/c5-candidate-policy.json)
shows no configured rulesets/protection/workflows. The actual PR audit and
exact-master qualification/publication are recorded below. Failed/interrupted
runs are clearly separate and do not qualify the final source.

[Exact released master](assets/direct-modeling/c5-merged-gate.json) at
`a6d62c85fbdefdf579fce68cf535285129364743` repeats all 16 commands with
693 Python / 248 frontend / 8 supervisor / 233 browser passes, 47 intentional
skips, zero failures/flakes/retries, clean start/end and source/hash evidence.
Actual clean tagged v0.16.0 retains final 0.17.0 canonical/history/archive data
and recreated allocation floors; old renderer/helper refusals remain expected.
Fifteen native performance profiles retain unchanged budgets.
[Premerge audit](assets/direct-modeling/c5-premerge-audit.json) records normal
PR #75 merge eligibility without protection/review/check bypass. No independent
Codex review returned at publication audit; full local review remains self-review.
[Publication](assets/direct-modeling/c5-publication.json) verifies annotated exact
tag, stable release/notes, downloaded asset SHA256/CRC and 339 internal hashes,
plus the closed issue's verified reply. Five versions 0.17.0, no new migration or
schema/dependency change. Final documentation merge and branch/clean-master audit
are maintained in that reply. Earlier checkpoint entries describe their historical
state; they do not override this completed qualification.

Issue #69 follows the [approved editing plan](plans/issue-69-compact-molecular-editor.md).
C1/C2 implement bounded atomic atom/H, canonical endpoint bonds and six illustrated
fragment substitutions. C3 adds exact complete-residue template mutation and
transient result selection, plus focus/tool handoff, notice-aware portal placement
and accessible controls. [C1](assets/molecular-editing/c1-verification.json),
[C2](assets/molecular-editing/c2-verification.json) and
[C3](assets/molecular-editing/c3-verification.json) retain exact commands, source/
log/screenshot checksums and diagnostic separation. C3 passes72Python,
all234frontend,31browser/3intentional layout skips and static/build/diff gates;
all 20 amino acids pass API backbone/unrelated-state/Undo. Native atom/bond/residue
workflows, both themes,320px, keyboard/notice hit testing and scoped axe pass.
Manual screenshot inspection is distinct; no independent review or broader device
certification is claimed. [C4](assets/molecular-editing/c4-verification.json)
passes612Python/235frontend/62broad browser with10intentional skips, no failures/
retries; static/build/diff and actual tagged v0.15.0 reader pass. New stereo,
crosslink refusal, reference/allocator/archive workflows, native prepared-complex
H/new-atom picking, exact camera through remount/edit, async project/selection/
read-failure ownership, real100/200%Chrome zoom and existing performance budgets
are qualified. Diagnostics and local self-review remain separate. [Final clean0.16.0 candidate](assets/molecular-editing/c5-candidate-gate.json) at `12a4375`
passes613 Python/236 frontend/8 supervisor/216 browser with46 intentional skips and no
failures/flakes/retries; all 16frozen-install/fresh 0014/static/build/diff/actual-reader
commands pass. [Local full-diff self-review](assets/molecular-editing/c5-local-review.md)
records repaired cross-visit pending and vendor-popup findings; earlier failed gate
is diagnostic only. [Exact released master](assets/molecular-editing/c5-merged-gate.json)
at `1ef42b1cc94c472a51a56e0420ea9b2df7cb3678` repeats all 16commands, counts and
actual v0.15.0 reader, with216 browser/46 intentional skips, zero failures/flakes/
retries in 40.0 minutes. Clean trees/source hashes and 14 native performance profiles
are retained. Annotated exact tag/stable latest release/notes, downloaded ZIP
SHA256/CRC and 189 internal checksums are [verified](assets/molecular-editing/c5-publication.json).
[Issue reply](https://github.com/ManuelSe/Neistra/issues/69#issuecomment-6220230454)
is verified and records final documentation/branch/clean-master audit. Review was
local; Codex was requested but no integration review returned at merge/publication.
No required check/review/protection was bypassed.

Issue #59 follows the [approved navigation plan](plans/issue-59-compact-project-navigation.md).
[C1](assets/project-navigation/c1-verification.json) qualifies independent compact
entry/component ownership; [C2](assets/project-navigation/c2-verification.json)
qualifies exact membership and bounded direct virtualization.
[C3](assets/project-navigation/c3-verification.json):all227frontend,176integration
and22domain Python (2overlap), static/build; final51broad/25adjacent browser passes
with3/7intentional skips and no failures/retries.200entries/10kcomponents,
240pxdesktop/320pxmobile, actual100/200% zoom, source warnings, keyboard/axe,
focus lifecycle and unchanged camera/project/cache are qualified. Earlier failed/
interrupted diagnostics are separate. Actual tagged0.14.0 reader preliminarily
accepts exact surfaces/scenes/originals/coordinates/history/jobs/archive remapping;
[Complete clean candidate](assets/project-navigation/c4-candidate-gate.json) at9a176a1
passes557Python/227frontend/8supervisor/197browser with45intentional skips and no
failures/retries, frozen installs/fresh0014/static/build/diff. Final0.15.0 producer
passes the actual tagged0.14.0 reader including exact surfaces/scenes/originals/
coordinates/history/jobs/archive remapping. [Exact released master](assets/project-navigation/c4-merged-gate.json) at
`dccc5e6d2f3dc3d392144165ffd1f4237db4a2e5` repeats every gate/count and actual reader
with no failures/retries. [Publication](assets/project-navigation/c4-publication.json)
verifies annotated exact tag/stable release/notes/downloaded archive and132internal
checksums. [Issue reply](https://github.com/ManuelSe/Neistra/issues/59#issuecomment-6179659377)
verified; issue closed. Final docs/master/cleanup audit is maintained in the reply. [Full-diff local self-review](assets/project-navigation/c4-local-review.md)
claims no independent review; consequential findings are repaired. Manual screenshot review is distinct from automated accessibility;
no interactive screen-reader, physical-device or cross-browser certification.
No API/schema/migration change.

Issue #57 follows the [approved surface-object plan](plans/issue-57-independent-surface-objects.md).
[C1](assets/surface-objects/c1-verification.json) qualifies disposable identity,
whole-object activation/highlighting and bounded mesh lines. [C2](assets/surface-objects/c2-verification.json)
qualifies canonical schema2 objects, migration0014 retained paths/atomic refusals,
revisioned commands, archives, topology and minimal grouped management. Final focused
Python178 and frontend209 pass, alongside lint/types/build/Ruff/mypy; fragment/pocket
browser19 and separate full application journey1 pass. Diagnostic failures and their
focused fixes remain explicit. [C3](assets/surface-objects/c3-verification.json) qualifies independent appearance,
explicit source scopes/replacement, locked-entry display editing, cache reuse and
real production mouse/touch activation with unchanged atom selection/camera/project.
All214frontend/5API and final6browser checks pass; adjacent43 browser checks pass
and the obsolete selection fixture passes its focused final rerun.
[C4](assets/surface-objects/c4-verification.json) qualifies actual tagged v0.13.2
upgrade, old-reader schema2 refusal and full backup restoration; focused Python183,
multiple same-entry fragments/pockets, native entry wireframe GPU pixels/complete
marker buffers, source editing, lazy serial queue lifecycle and stale-pixel ownership.
Existing capacity/scientific/movement budgets, scoped light/dark axe, keyboard,
320px/long names/coarse targets and actual100%/200%Chrome zoom pass. Resolved
diagnostics remain separate from passing evidence. [C5 clean candidate](assets/surface-objects/c5-candidate-gate.json) at`b6281bc` passes 556Python/214frontend/8supervisor/190browser with44 intentional skips and zero failures/flakes/retries, plus every frozen-install/fresh0014/static/build command. Actual tagged0.13.2 compatibility against final0.14.0 passes. [Exact merged gate](assets/surface-objects/c5-merged-gate.json) at`88e84b27a0fb6c4520333df236d788065fd7a788` repeats all commands/counts with zero failures/flakes/retries and actual tagged compatibility. [Publication](assets/surface-objects/c5-publication.json) verifies annotated exact tag, stablev0.14.0 release, downloaded evidence checksums, issue closeout and feature cleanup. Earlier issue evidence
below is historical and predates the schema2 boundary.

Issue #56 follows the [approved notification plan](plans/issue-56-viewer-notification-timeout.md).
[C1 evidence](assets/viewer-notifications/c1-verification.json) qualifies exact
10-second boundaries, replacement/repeated text, stale callbacks, cleanup, warning
producer policy and keyboard focus. [C2 evidence](assets/viewer-notifications/c2-verification.json)
records 39 focused browser passes/three intentional layout skips, all 10 native
notification workflows, actual real-time expiration/state invariance, light/dark
axe and unchanged adjacent movement/recovery/performance. Both checkpoints pass
all 193 frontend tests/lint/types/build. The [complete clean-candidate gate](assets/viewer-notifications/c3-candidate-gate.json)
at `494d533` passes492Python/194frontend/8supervisor/182browser with44intentional
skips and zero failures/flakes/retries; frozen installs/fresh0013/lint/types/build.
[Actual tagged v0.13.1 reader](assets/viewer-notifications/c3-candidate-reader.json)
accepts final0.13.2 data/history/archives/jobs. [Local full-diff review](assets/viewer-notifications/c3-local-review.json)
is not independent and has no unresolved consequential finding. [Exact released-master gate](assets/viewer-notifications/c3-merged-gate.json) at
c21de2e repeats every command/count with zero failures/flakes/retries; [actual
preceding reader](assets/viewer-notifications/c3-merged-reader.json) accepts final
merged data. Annotated v0.13.2/exact target, stable release/notes and downloaded
evidence bytes/SHA256 plus72 internal checksums are verified; [publication](assets/viewer-notifications/c3-publication.json).
Final documentation merge/branch-cleanup audit is maintained in the verified issue
reply linked from the approved plan. Historical evidence below stays distinct.

Issue #55 correction evidence follows the [approved plan](plans/issue-55-interaction-corrections.md).
C1 native buffer/group/capacity/coordinate and toolbar checks, C2 independent
six-type and frozen2REG science/API invariance, and C3 actual marker pixels,256
choice combinations, complete native workflows and real zoom are qualified.
[C3 logs and screenshots](assets/interaction-corrections/c3-verification.json):
182frontend and44browser/6intentional skips pass, zero failures/retries; C2 full
Python487 passes historically. C4 clean candidate at `0b409a1` passes490Python,
182frontend,8supervisor,172browser/44intentional skips, zero failures/retries;
frozen installs/fresh0013/lint/types/build/diff. [Exact candidate gate](assets/interaction-corrections/c4-candidate-gate.json)
and [actual tagged0.13.0 reader](assets/interaction-corrections/c4-candidate-reader.json)
qualify final0.13.1 data/history/archives/jobs. [Local full-diff review](assets/interaction-corrections/c4-local-review.json)
is not independent; no consequential finding remains. [Exact merged gate](assets/interaction-corrections/c4-merged-gate.json) at
dfca45af3baac1e7395c6b39e73f93fc9651276f repeats every command/count, zero failures/
retries; [actual tagged0.13.0 reader](assets/interaction-corrections/c4-merged-reader.json)
passes final merged data. Annotatedv0.13.1/exact target, release/notes/downloaded
archive bytes and123internal checksums verified; [publication](assets/interaction-corrections/c4-publication.json).
Final documentation merge/cleanup audit is maintained in the verified issue reply.
Prior #49 evidence below stays historical.

Issue #49 qualification is maintained in the [approved interaction plan](plans/issue-49-molecular-interactions.md)
and [raw evidence](assets/molecular-interactions/). All six types use independently
specified positive, negative and exact-threshold scientific cases. Native browser
checks verify H-to-acceptor pixels/geometry, complete ring centroids, nonpickable
batching, cached scopes/visibility, preview Cancel, Apply/Undo/Redo, scenes,
deletions and project/remount/reload lifetimes. Busy, cancellation, deadline,
resource limits and stale artifacts return no misleading complete result.
Light/dark scoped axe, keyboard, 320px and real100%/200% zoom are qualified.
[Clean candidate gate](assets/molecular-interactions/c5-candidate-gate.json) at
2cbdee512ce1eefa09c126dd6c243adbba2b56c4 passes472Python/179frontend/8supervisor/
168browser with44intentional skips, zero failures/flakes/retries. Frozen installs,
fresh0013/lint/types/build/diff pass; actual tagged0.12.1 reader accepts final0.13.0
data/history/archives/jobs. [Exact merged gate](assets/molecular-interactions/c5-merged-gate.json)
atbf29b9a913be48dac95b8d9aa055a7310c21d5b2 repeats every command/count and actual
preceding-reader qualification, zero failures/flakes/retries. Annotatedv0.13.0,
release notes and downloaded archive/internal checksums are verified; [publication
record](assets/molecular-interactions/c5-publication.json). Final documentation/
cleanup audit is maintained in the linked issue reply.
Evidence remains distinct from C4/historical counts. No schema migration; review
[local, not independent](assets/molecular-interactions/c5-local-review.json).

Previous correction evidence is maintained in the
[approved compact-transform plan](plans/issue-46-compact-transform-controls.md).
Clean candidate `f437c31767cd44be435d829ca4fb9ad033049214` passes every complete release command: 400 Python,
173 frontend, eight supervisor and 159 browser passes / 43 intentional skips,
zero failures/flakes/retries; fresh migration 0013/frozen installs/lint/types/build.
Native performance, exact coordinates/history and actual tagged 0.12.0 reader of
final 0.12.1 pass. Review is local, not independent. Exact merged
`39d5c7b4c142ffb6d327f3ed0eebbc4ce8eb4cda` repeats all gates; annotated
v0.12.1/release/asset bytes and the issue correction reply are verified.
Final documentation/cleanup audit is linked from the contract.

Previous toolbar/navigation evidence is maintained in
[the approved issue #46 plan](plans/issue-46-viewer-transform-toolbar.md).
C1–C5 qualify shared transactions, native ownership, interruption, true touch,
accessibility/real zoom, scientific/compatibility and performance. Clean candidate
`545d3553557a8b442b45e9b37a14259751360aba` passes all release commands: 398 Python, 169 frontend, eight supervisor,
155 browser passes/43 intentional skips, zero failures/flakes/retries. Exact
merged `427c050b32c5ae361c7c9da042616a5266600dcd` repeats these complete gates; final 0.12.0 producer/actual 0.11.0
reader pass. Annotated tag/release and issue closeout verified; no schema/migration
changes. Final cleanup audit is in the issue reply linked from the plan.

Previous interactive movement evidence is maintained in
[the approved issue #4 plan](plans/issue-4-interactive-selection-transform.md).
It links native coordinate/performance and actual zoom screenshots, domain/API
atomicity/history/restart/export/archive tests and actual previous-release reader
qualification. Checkpoint evidence and pending candidate/release gates remain
distinct from the historical matrix below.

Previous structure-group membership evidence is maintained in
[the approved issue #9 plan](plans/issue-9-structure-group-membership.md). Its
checkpoint and release results are separate from the historical matrix below.

Pocket-surface evidence is maintained in
[the issue #36 feature plan](plans/issue-36-pocket-surfaces.md).

Previous visibility/capacity evidence is maintained in
[the issue #38 feature plan](plans/issue-38-selection-visibility-capacity.md).

Previous selection-surface evidence is maintained in
[the issue #30 feature plan](plans/issue-30-selection-surfaces.md).

Previous compact-styling evidence is maintained in
[the issue #34 feature plan](plans/issue-34-compact-selection-styling.md).

Issue #29 evidence is maintained in
[the selection-appearance feature plan](plans/issue-29-selection-appearance.md);
its checkpoint and final-release results are separate from this historical matrix.

Current presentation: Neistra. See [rebranding verification](REBRANDING_VERIFICATION.md)
for newly executed checks. The release evidence below remains historical.

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

## V0.5.0 Issue #1 Feature Evidence

Status: released in MolWeave v0.5.0

This evidence supplements the v0.1 matrix and follows the approved contract in
`docs/plans/issue-1-polar-hydrogen-visibility.md`.

| Feature claim | Passing evidence |
|---|---|
| Additive durable setting and compatibility | Schema/service/history/scene tests prove `nonpolar_hydrogens=true` defaults, exact update and undo/redo, named-scene application, checkpoint persistence, archive round-trip, and legacy missing-field behavior without changing API, project, archive, or normalized schema majors |
| Safe migration | `test_migrations.py` proves migration `0009` upgrades live entries, checkpoints, and scenes; permits lossless downgrade/re-upgrade while all values are `true`; and refuses to discard a stored `false` value |
| Three-mode precedence | `hydrogen-visibility.test.ts`, workspace tests, and viewer profile tests prove all, polar-only, and none; the master switch overrides but preserves the dependent preference |
| Pinned scientific rule | Checksum-locked protein PDB and ligand MOL fixtures plus `test_release_fixture.py` prove explicit C-H and O-H connectivity without bond inference; Mol* qualification proves polar-only hides the C-bound H and retains the O-bound H |
| Complete disposable projection | Representation and adapter tests prove every inherited and exact-selection atomic style plus surfaces receives the same mode, no atom is invented, and camera/selection restoration and artifact-keyed query reuse remain intact |
| Molecular and original-data invariance | API snapshots and the real-browser workflow prove atom IDs/count, bonds, coordinates, conformers, artifacts, warnings/inferences, and original uploaded bytes are unchanged apart from viewer settings and expected history |
| Durable user workflow | `polar-hydrogen-visibility.spec.ts` proves restoration, undo/redo, reload/checkpoint, named scenes, archive round-trip, and hydrogen-free input across protein and ligand entries |
| Transient-state and focus behavior | Browser and component evidence proves camera, current selection, picking mode, and isolation remain unchanged; focus uses deterministic heavy atoms outside all-hydrogen mode |
| Accessible responsive controls | Desktop and Pixel 7 workflows prove native named controls, keyboard use, dependent-state explanation, viewport bounds, no horizontal overflow, and zero scoped axe findings |
| Performance boundary | The browser workflow observes one normalized-structure request before reload across repeated toggles; no incremental-rendering, large-system, cross-browser, or hardware-GPU performance claim is made |

Checkpoint 1 passed Ruff, strict mypy across 50 source files, 27 focused
Python tests, frontend type-check, and `git diff --check`. Checkpoint 2 passed
ESLint, TypeScript, all 65 Vitest tests across 20 files, the production build,
and diff checks. The build retained the expected lazy Mol* advisory at 966.42
KiB gzip and an initial application bundle of 154.84 KiB gzip.

Checkpoint 3 passed 17 focused Python integration/scientific tests, all 65
Vitest tests, Ruff, ESLint, TypeScript, and diff checks. A fresh isolated data
root migrated through Alembic `0009`; pinned Chromium/SwiftShader then passed
all 6 applicable scientific, durability, representation, state-invariance,
archive, hydrogen-free, accessibility, bounds, and query-reuse workflows with
4 intentional cross-layout skips in 50.6 seconds. The optional port/data-root
overrides avoided an already-running pre-checkpoint development stack and did
not change repository or CI defaults.

Checkpoint 4 passed Ruff, strict mypy across 50 source files, ESLint,
TypeScript, and `git diff --check`. Architecture, schema/API, migration,
scientific, accessibility, performance, development, progress, decision, and
feature-plan documentation were reviewed together. Accepted D-047 remains the
governing cross-project decision; no additional decision was required.

Release preparation advanced all five authoritative application versions from
0.4.0 to 0.5.0 and extended archive-producer compatibility through v0.4.0. The
focused archive gate passed all 9 tests. Immediately before preparation,
`origin/master` remained the feature base at
`e3187b22e5da76ff22850b5c5fee1c32adad63e5`; no `v0.5.0` tag, release, or
prior feature PR existed; issue #1 remained open; and the repository exposed no
workflow, branch protection, ruleset, required check, or required review.

The final complete gate passed frozen Python and JavaScript installs; upgraded
the normal local store from Alembic `0008` to `0009 (head)`; passed Ruff, strict
mypy across 50 source files, all 209 Python tests, ESLint, TypeScript, all 65
Vitest tests, all 7 supervisor tests, the production build, and
`git diff --check`; and passed all 46 applicable desktop/mobile Playwright
workflows with 34 intentional cross-layout skips in 9.1 minutes. A fresh
isolated browser store migrated from `0001` through `0009`; isolated ports
avoided an intentionally running pre-checkpoint development supervisor. The
build retained the expected lazy Mol* advisory at 966.42 KiB gzip and initial
application bundle at 154.84 KiB gzip. The only Python warnings were 15 known
Alembic configuration deprecations.

The complete `origin/master...HEAD` diff and commit sequence were reviewed
locally. Review found unsafe interpolation of optional Playwright resource
overrides and accidental capitalization of four existing component labels.
Commits `59bd216` and `d88291d` respectively validate ports/data paths before
constructing service commands and restore the established labels. ESLint,
TypeScript, all 65 Vitest tests, valid/invalid Playwright configuration checks,
and the affected fresh-browser matrix passed afterward: 6 applicable workflows
passed with 4 intentional skips in 50.9 seconds. No unresolved consequential
scope, scientific, molecular-state, migration, archive, renderer,
representation, selection/camera, accessibility, performance, dead-code,
debug-path, test-infrastructure, or compatibility finding remains. This review
was local and is not represented as independent.

Remote delivery is verified: PR #26 rebase-merged to
`bb60e921506ccdcfb19535b6b6cc5328c2b1718a`; annotated tag `v0.5.0`
dereferences to that exact commit; the GitHub release is published, non-draft,
and non-prerelease; issue #1 is closed with its verified final response; and
the original feature branch was deleted locally and remotely afterward. The
requested `@codex review` integration did not acknowledge or return a review;
PR #26 records the local review without claiming independence. This
documentation-only closeout does not move the released tag.

The automated WebGL evidence verifies the approved explicit-connectivity
protein and ligand behavior. It does not claim missing-hydrogen generation,
bond inference, protonation or tautomer correctness, hydrogen-bond analysis,
all file-format edge cases, cross-browser equivalence, hardware-GPU behavior,
WebXR support, or subjective molecular aesthetics.

## V0.4.0 Issue #7 Feature Evidence

Status: released in MolWeave v0.4.0

This evidence supplements the v0.1 matrix and follows the approved contract in
`docs/plans/issue-7-selection-representation-styling.md`.

| Feature claim | Passing evidence |
|---|---|
| Typed replacement/reset algebra | `test_commands.py` and schema tests prove canonical positive IDs, one record per style, disjoint membership within atomic/polymer channels, same-channel replacement, cross-channel coexistence, and two-channel reset |
| Atomic multi-entry command and service validation | `test_viewer_state.py`, API safety tests, and malformed-input tests prove one revision, exact forward/inverse state, stale/invalid rejection, all-or-nothing multi-entry updates, entry-settings bypass protection, and complete supported-residue polymer validation |
| Durable migration and compatibility | `test_migrations.py` proves live/checkpoint/scene upgrade, empty downgrade/re-upgrade, and refusal to discard non-empty assignments; `test_archive_roundtrip.py` proves v0.3.0 missing-field defaulting plus current project/scene/archive round trip |
| Topology reconciliation | `test_ligand_edits.py` and `test_protein_edits.py` prove deleted IDs are pruned from live and scene assignments in the molecular command and restored exactly by undo; coordinate edits and additions retain membership |
| Exact disposable viewer projection | `representations.test.ts` proves per-channel inherited subtraction, independent surfaces, component/hydrogen/isolation intersections, fixed Thin/Thick profiles, and no parent-bond expansion; adapter/loading tests prove camera/selection restoration, hidden-entry laziness, query reuse, and reduced-detail retention |
| Accessible UI and authoritative mutation | `selection-style-dialog.test.tsx`, toolbar/workspace tests, and `selection-styling.spec.ts` prove focusable unavailable reasons, semantic groups/counts/status, backend-matched polymer preflight, one API action, keyboard/Escape behavior, and unchanged transient selection/picking |
| Protein/ligand styled complex | The desktop `1STP` browser workflow proves inherited Cartoon protein, distinct ligand Thin/Thick sticks, nearest complete-residue Thin sticks, exact coexistence, nonblank WebGL, and no molecular/artifact/original-byte change |
| Boundary, scene, history, and reload behavior | The hierarchy browser workflow proves ion/water/ligand exact styles and the covalent boundary; the `1STP` workflow proves one revision per apply, reset, undo/redo, named camera/selection/style scenes, saved-selection reuse, reload, and one normalized request per load |
| Accessibility and responsive bounds | Desktop and Pixel 7 workflows prove keyboard operation, launcher focus restoration, no horizontal overflow/clipped controls, and zero scoped axe findings |

Checkpoint 1 passed Ruff, strict mypy across 49 source files, 48 focused
Python tests, the isolated migration test, frontend type-check, and
`git diff --check`. Checkpoint 2 passed ESLint, TypeScript, all 59 Vitest tests,
the production build, and diff checks. Checkpoint 3 passed ESLint, TypeScript,
all 61 Vitest tests, the production build, and diff checks. The existing Vite
lazy Mol* chunk advisory remained non-blocking.

Checkpoint 4 passed 21 focused integration tests and the affected real-browser
matrix: 11 applicable Chromium/Pixel 7 workflows passed, with 11 intentional
cross-layout skips, in 1.7 minutes. Frontend lint, type-check, and diff checks
also passed. Qualification used existing documented fixtures and added no new
scientific fixture. Automated canvas checks prove nonblank pixels and relative
Thin/Thick visual difference, not subjective molecular aesthetics or
cross-browser/hardware-GPU behavior.

Checkpoint 5 passed Ruff, strict mypy across 49 source files, ESLint,
TypeScript, and `git diff --check`. The architecture, schema, API,
accessibility, performance, scientific-limitations, progress, decision, and
feature-plan documents were reviewed together; accepted D-046 remains the
governing architectural decision and no new decision was required.

The candidate keeps API, project, archive, and normalized schema major version
1. Alembic `0008` adds the viewer-settings field across live/checkpoint/scene
JSON and refuses a lossy downgrade while assignments exist. Legacy v0.3.0
archives default the absent field to empty. Selection styling preserves current
and original artifacts and does not change molecular data. Release preparation
advanced all five authoritative application versions from 0.3.0 to 0.4.0.

The final complete gate passed frozen Python and JavaScript installs; upgraded
the normal local data store from Alembic `0007` to `0008 (head)`; passed Ruff,
strict mypy across 49 source files, all 201 Python tests, ESLint, TypeScript,
all 61 Vitest tests, all 7 supervisor tests, the production build, and
`git diff --check`; and passed all 40 applicable desktop/mobile Playwright
workflows with 30 intentional cross-layout skips in 9.3 minutes. The build
retained the expected lazy Mol* advisory at 966.43 KiB gzip and an initial
application bundle of 154.58 KiB gzip.

Immediately before qualification, `origin/master` remained
`0526eb0b95db664a8d8fb837e75f9434090265f2`; `v0.4.0` did not exist as a tag or
release; issue #7 remained open; and the repository exposed no open pull
request, branch protection, ruleset, required check, or required review. The
complete `origin/master...HEAD` diff and commit sequence were reviewed locally.
No unresolved scope, molecular-state, command atomicity, schema, migration,
archive, exact-boundary, camera/selection, accessibility, performance,
dead-code, debug-path, or compatibility finding remains. This was a local
review and is not represented as independent.

Remote delivery is verified: PR #24 rebase-merged to
`7f468e90dc0038c9e0fecd8b165867274be757a5`; annotated tag `v0.4.0`
dereferences to that exact commit; the GitHub release is published, non-draft,
and non-prerelease; issue #7 is closed with its verified final response; and
the original feature branch was deleted locally and remotely afterward.

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

## Geometry-aware hydrogen building (issue #77)

[Approved contract](plans/issue-77-geometry-aware-hydrogens.md) and
[molecular intent](MOLECULAR_MODEL.md) govern verification. Focused core/API files:
`tests/unit/editing/test_hydrogen_completion.py`,
`tests/scientific/test_hydrogen_completion.py`,
`tests/scientific/test_hydrogen_qualification.py` and
`tests/integration/test_hydrogen_completion.py`. These cover the mixed-H false-centre
regression, real tetrahedral/E/Z geometry, conflicting tags, mirrored/degenerate/
translated conformers, unknowns/partial/no-op outcomes, explicit counts/geometry,
sparse IDs/alternates, immutable originals, allocation floors, budgets and preview
purity. Legacy helper negative tests remain unchanged.

Frontend panel/store tests and native `hydrogen-completion.spec.ts` cover the shared
preview/control protocol; existing direct/molecular/ligand/protein suites retain
camera, selection, asynchronous ownership/refetch, native picks and accessibility
assertions. Actual browser zoom remains `rebranding-zoom.spec.ts`. The separate
actual tagged0.17 reader harness is documented in DEVELOPMENT; producer-version
strings alone are not old-reader qualification. Historical/preliminary checkpoint
runs do not replace clean final-version candidate and exact merged-master gates.


## Local bond-H reconciliation (issue #81)

The [approved plan](plans/issue-81-local-hydrogen-reconciliation.md) is the contract.
M1/M2 source-bound evidence is under assets/hydrogen-reconciliation. New unit,
scientific and API suites are test_hydrogen_reconciliation.py and
test_reconciliation_qualification.py; protection facts have focused unit/API tests.
They assert counts and independent coordination geometry, exact heavy/unrelated
rows, deterministic removal, protected/unknown/partial/conformer outcomes, source
recovery, budgets, reference restoration and archive/Undo behavior. The fixed
v0.15 prepared archive is retained without reinterpretation.

Native bond-hydrogen-reconciliation.spec.ts covers immediate and preserve policy,
nonpickable movement/removal markers, Cancel/Apply/reload/exact Undo, both themes,
320px, focus/reachability and scoped axe. Existing actual100/200% browser zoom and
editing/interaction/surface/archive suites supplement these workflows. The separate
reconciliation_reader_qualification harness loads actual tagged v0.18 API/core
modules and checks data/history/archives, rather than equating version strings with
reader qualification. Final producer-version and exact merged-master gates remain
mandatory before publication; checkpoint evidence does not substitute for them.


Issue #81 [final clean 0.19.0 candidate](assets/hydrogen-reconciliation/c5-candidate-gate.json)
`a0ca93d` passes all 16 release commands:818 Python,255 frontend,8 supervisor,
245 browser /47 intentional layout skips, zero failures/flakes/retries. Frozen
installs, fresh0014/static/build/diff, unchanged native performance assertions and
actual tagged0.18 reader with final0.19 producer pass. Source/log hashes and clean
start/end are retained. [Local review](assets/hydrogen-reconciliation/c5-local-review.md)
is self-review. Exact merged-master qualification remains required before release.


Issue #81 [exact released master](assets/hydrogen-reconciliation/c6-merged-gate.json)
`3fc106b215a8c39e943ad399710f43f116961aef` repeats all16 commands with818 Python,
255 frontend,8 supervisor,245 browser /47 intentional skips, no failures/flakes/
retries. Fresh/frozen/static/build/diff, unchanged native budgets and actual tagged
0.18 reader/final0.19 producer pass. Candidate/merged runtime digests are equal;
clean states and lossless logs are retained. [Premerge audit](assets/hydrogen-reconciliation/c6-premerge-audit.json)
confirms no protection/review/check bypass; integration review did not return and
local review is self-review. [Publication](assets/hydrogen-reconciliation/c6-publication.json)
verifies exact annotated tag, stable release/notes and downloaded evidence SHA256,
CRC/internal hashes. [Issue reply](https://github.com/ManuelSe/Neistra/issues/81#issuecomment-6239262239)
records final documentation integration and branch-cleanup audit. No migration or
schema/dependency change; five versions0.19.0. Published runtime tag remains fixed.

C6 preliminary qualification:45 strict original-recovery/preflight/protection/edit
cases pass; actual tagged0.20 API/core retains four current-producer automatic
cases (active7/inactive conformers, multi-entry, warned acceptance, legacy recovery),
including exact canonical data/history/originals/parameters/models and archive
import/reexport. [Pre-version reader evidence](assets/interactive-minimization/c6-preversion-reader.json)
explicitly predates the application version bump and must be repeated for final0.21.
Fixed-only CPU profiling on prepared1STP/18k compares subsystem/full medians about
5.220/5.276ms and39.043/39.042ms respectively; no terms omitted or production speedup
claimed. [1STP](assets/interactive-minimization/c6-fixed-cost-1.json),
[18k](assets/interactive-minimization/c6-fixed-cost-8.json). Twelve warmed samples,
OpenMM CPU/one thread; finite differences preserve the constant-offset derivative.
Follow-up#102 requires actual equivalent reduced evaluation and benchmark gains.
[OpenFF feasibility](OPENFF_FEASIBILITY.md) retains AMBER; experiment#101 is separate.
Large C5 raw timing records are retained losslessly as adjacent gzip files, with
uncompressed SHA256 and summaries in the original JSON paths for reviewability.

Issue89 final [clean candidate13e8b45](assets/interactive-minimization/c6-candidate-gate.json)
passes all16 commands:1102 Python/273 frontend/8 supervisor/268 browser with52
intentional layout/timing exclusions, zero failures/retries/native scientific skips.
Frozen/fresh0014/static/build/diff and final0.21 producer/actual0.20 reader pass.
[Summary](assets/interactive-minimization/c6-candidate-summary.json) verifies exact
source/log identities; four preceding-reader cases retain all conformers, canonical
history, original bytes, opaque jobs/models/parameters/provenance and archives.
Fresh native cache pairs give13.72x compatible preparation improvement, no changed-
ligand charge-geometry reuse claim; actual native live30/1166-heavy and1STP/18k
preview/restoration bounds pass. Exact merged-master gate remains required before
release. Earlier incomplete diagnostics are distinct from this passing run.

Issue89 [exact released master1024f465](assets/interactive-minimization/c6-merged-gate.json)
repeats all16 commands and candidate counts:1102 Python/273 frontend/8 supervisor/
268 browser,52 intentional exclusions, zero failures/retries/native scientific skips.
[Source/log audit](assets/interactive-minimization/c6-merged-summary.json) proves
identical runtime/test/tool bytes and verified lossless logs. Four final0.21 producer/
actual tagged0.20 reader cases pass. [Publication](assets/interactive-minimization/c6-publication.json)
verifies annotated exact tag, stable public release/notes and public downloaded
qualification ZIP SHA256/CRC/255 internal hashes. The verified issue close-out links
the final docs/ref-state audit; runtime tag is fixed despite later docs-only audit.

Issue91 M2 [complete checkpoint gate](assets/selection-mode-hover/c2-complete-gate.json)
passes301 frontend (25 focused), lint/types/build/diff and58 native browser cases
/4 intentional layout/pointer exclusions, zero failures/retries, unchanged source
hashes. Exact native marker sets and selection overlap, current-mode entity
semantics, lifecycle/remount, camera/project/original invariance and surface/tool
regressions pass. [Review](assets/selection-mode-hover/c2-review.md) is implementer
self-review. Pink-hover/green-selection atom screenshots were visually inspected
in both themes. Diagnostic failures remain separate; final-version actual-reader,
complete candidate/exact-master and performance gates are still required.

Corrected issue91 M2 [final gate](assets/selection-mode-hover/c2-final-corrected-gate.json)
supersedes earlier pre-patch qualification:305 frontend/29 focused,58 native
browser /4 intentional exclusions, lint/types/build/diff, zero failures/flakes/
retries, unchanged source/patch/lock hashes and verified lossless logs. The
[local review](assets/selection-mode-hover/c2-review.md) records D-125's readback
correction, deterministic negative control and10/10 original-timing native surface
passes. Production build excludes test harnesses. Complete final-version candidate/
exact-master, actual-reader and performance/scientific release gates remain pending.

Issue91 M3 [focused final0.22.1 gate](assets/selection-mode-hover/c3-focused-gate.json)
passes35 Python saved-selection/archive,305 frontend,12 browser /8 intentional
layout/pointer exclusions and static/build/diff checks. No failures/flakes/retries;
source/patch/lock hashes unchanged. Both-theme axe and1STP1001-atom import863ms/
interaction4091ms/longest628ms/zero repeated reads meet unchanged budgets. Complete
clean candidate/actual-reader/exact-master qualification remains pending.

Issue91 final-review [camera checkpoint](assets/selection-mode-hover/c3-camera-gate.json)
passes305 frontend/29 focused and83 native browser cases /11 documented exclusions,
static/build/diff, zero failures/flakes/retries and unchanged source hashes.
Native hover observes zero duplicate application camera callbacks; the prior
negative control reproduces8 with identical pose. [Blur addition](assets/selection-mode-hover/c3-blur-gate.json)
passes3 native cases /3 fine-pointer exclusions, lint/types/diff and separately
checks blur clearing, fresh trusted hover and exit. 1STP879ms import/4034ms
interactions/637ms longest/zero repeated reads meets unchanged budgets. Earlier
interrupted `c3-candidate` is not final qualification; fresh committed
`c3-final-candidate` and exact-master gates remain required.

Issue91 final [clean candidate667e7a8](assets/selection-mode-hover/c3-final-candidate-gate.json)
passes all16 release commands:1108 Python/305 frontend/8 supervisor/285 browser
with55 documented layout/timing exclusions, zero failures/flakes/retries/native
scientific skips. [Audit](assets/selection-mode-hover/c3-final-candidate-summary.json)
verifies480 unchanged source/patch/lock hashes and16 lossless log hashes. Actual
tagged0.22↔final0.22.1 readers pass both directions. 1STP915ms import/4039ms
interactions/669ms longest/zero repeated reads meets unchanged budgets; native18k
minimization/100k surface, actual100–200%zoom, both-theme accessibility and complete
journey pass. Exact native hover sets, zero extra camera callbacks and lifecycle
pass; final screenshots were inspected in both themes. [Review](assets/selection-mode-hover/c3-review.md)
is local self-review with no unresolved consequential finding. Earlier interrupted/
negative controls are separate; exact merged-master repetition remains required.

Issue91 [exact released master9fd6185](assets/selection-mode-hover/c3-merged-gate.json)
repeats all16 release commands:1108 Python/305 frontend/8 supervisor/285 browser
with55 documented exclusions, zero failures/flakes/retries/native scientific
skips. [Audit](assets/selection-mode-hover/c3-merged-summary.json) proves480 source/
patch/lock identities equal candidate and verifies all lossless logs. Actual
tagged0.22↔final0.22.1 readers pass both directions. Merged1STP import
751ms/interactions4100ms/longest673ms/zero repeated reads and unchanged native18k
minimization/100k surface/actual100–200%zoom/accessibility/complete journey gates
pass. [Publication](assets/selection-mode-hover/c3-publication.json) verifies exact
annotated tag, stable release/full notes, downloaded ZIP SHA256/CRC/internal hashes
and [close-out reply](https://github.com/ManuelSe/Neistra/issues/91#issuecomment-6302369833); final docs/cleanup audit follows there. No migration
or public API/schema/chemistry/dependency upgrade; pinned readback patch explicit.
