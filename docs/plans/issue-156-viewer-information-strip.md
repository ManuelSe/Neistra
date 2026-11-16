# Issue 156 — Viewer atom information and ordered quick geometry

## Status and identity

- Status: **Authorized within agreed scope; not individually reviewed**.
- Repository: `ManuelSe/Neistra`; [child #156](https://github.com/ManuelSe/Neistra/issues/156), required by [parent #11](https://github.com/ManuelSe/Neistra/issues/11).
- Parent contract: [finite program, shared contracts and release gates](issue-11-ligand-information.md); it owns exclusions, dependency graph, shared state/API/scientific identity and program ledger. Do not duplicate or weaken those contracts here.
- Authorization: owner's 2026-11-16 explicit plan-and-deliver invocation for parent11 and all eight required children; includes normal checkpoints/push/PR/review/protectedmerge/verifiedrelease/reply/ownedcleanup without another finished-plan approval. No claim of individually reviewed wording.
- Native prerequisites: None. Current child open with no comments. No delivered behavior assumed.
- Base observed during parent intake: `62623a169f4e27da259c40ba1e74b1935b7c7775`; revalidate fresh master before this child implementation.
- Branch: `feat/issue-156-viewer-information-strip` in the owned program checkout. First156 branches from parentC0; later units from verified preceding delivery master. Parent Goal remains active throughout.

## Problem, accepted outcome, and requirement disposition

Viewer atom information and ordered quick geometry. Deliver this coherent slice while preserving parent exclusions, originals, current scientific facts and all existing retained user workflows. This plan is the child's contract; its issue brief is product input under the parent's explicit owner decisions.

| Requirement | Classification | Accepted treatment | Follow-up |
| --- | --- | --- | --- |
| Canonical hover and atom details | Essential | Known atom name/element, entry, residue name/type, author number/insertion and chain; bounded keyboard/touch selected-atom chooser with known coordinates/charge. No invented fields or hover-only access. | Parent exclusions apply; no new delivery scope |
| Ordered quick geometry | Essential | Separate transient order synchronized with canonical membership; singleton picks establish order, batch/query/range selections require explicit numbered ordering. Two-point distance is order-independent. Show angle vertex and signed four-target torsion order. | Parent exclusions apply; no new delivery scope |
| Lifecycle and truthful values | Essential | Hover and geometry coexist; retire pointer exit, hidden/removed targets, entry/project/artifact/renderer and preview changes. Current complete observed finite coordinates only, explicit unavailable for missing/degenerate/preview states; never a fabricated zero. | Parent exclusions apply; no new delivery scope |
| Passive bounded viewer strip | Essential | Inside viewer layout with shared bottom stack, gestures/camera/selection/designation unchanged, zero per-move API/jobs and unchanged grouped-hover materialization. Quick readings never save measurements. | Parent exclusions apply; no new delivery scope |

## Milestones and independently verifiable checkpoints

### C0 — Authorized planning

This scoped plan is persisted with the parent and siblings before code. Verify neutral naming, links, finite dependency order, unchanged runtime/versions/globalPLAN and a clean scoped diff. ParentC0 commit/push exact readback provides the planning handoff; continue delivery. Technical refinements for later contracts must be recorded before their implementation and preserve accepted outcomes.

### C1 — Domain and typed contract

Affected areas:

- selection/inspection.ts and store/selection.ts: typed order/membership transitions and independent scientific fixtures.
- viewer/MolecularViewer.ts, MolstarViewer.ts, MolstarEngine.ts: one existing hover owner, canonical single-atom events and lifecycle guards.
- components/ViewerInformationStrip.tsx and StructureViewer.tsx: passive feedback and accessible details/order disclosures.

Build a coherent tested contract, not disconnected stubs. Read current source and accepted decisions at start. Consult theory before method choice, architecture before durable/cross-layer changes, implementation for science and reference/UX/UI before workflow/control changes. Record exact module/test names and focused commands with evidence as code lands. Run `.venv/bin/uv run ruff check .`, `.venv/bin/uv run mypy apps/api packages/neistra_core packages/neistra_demo_plugin`, affected unit/integration/scientific tests, web lint/types and affected Vitest suites; where no Python change, record reason rather than fabricate a scientific pass. Significant domain logic gets independent negative/boundary oracles. Update plan/concisePROGRESS and append material DECISIONS. Commit real passing state with Conventional Commit and child reference.

### C2 — Complete accessible vertical workflow

Integrate current application state/API/viewer/UI and significant native tests. Acceptance:

- Analytic distance3Å/coincident0Å, angle90/0/180°, torsion−90/+90°, undefined legs/planes, nonfinite/missing coordinates.
- Canonical vs pick order, subtract/toggle/batch/manual ordering and stale explicit ordering; unchanged canonical selection.
- Native repeated labels, insertion codes, mixed entries, all picking modes, held/retired sources, previews/cancel, camera equality, zero repeated reads, keyboard/touch/themes/real100%/200%/narrow.

Run all applicable lint/type/unit/build commands plus focused native files for the new workflow and relevant existing regression files. Tests must exercise real rendering/trusted inputs where applicable, both themes, keyboard/touch/narrow layouts and actual100%/200% zoom, cancellation/focus/recovery and held stale completions. Preserve existing test assertions/exclusion identities and production bounds. Record exact new files and invocation vectors in the evidence log; hypothetical future results are not passing evidence.

### C3 — Measured bounds and complete final candidate

Measure representative workload and work/resource/request/DOM bounds before any optimization, comparing equivalent sources/fixtures for claimed improvements. Use parent D148 timing policy and required qualification recipe, including frozen installs, entire scientific/frontend/native suites, migrations, actual preceding tagged readers both directions/suffixes, new-state retention/corruption, production/version/license/legacy checks. Prepare consistent final versions first. Every candidate gate starts clean, records source identities/raw lossless logs, stops on failure/drift and preserves diagnostics. Fix failures and revalidate without weakening acceptance.

### C4 — All-seven review, normal merge and verified release

Review complete diff/newfiles against actual master. Obtain every specialist's independent same-candidate PASS/justifiedNOT_APPLICABLE, address consequential findings, renew affected evidence and all-role reconfirmation after changes. Push only then, exact remote readback, normal PR/review/merge with required remote reviews/checks/protection/conversations satisfied. No `Closes` keyword for child/parent; explicitly close child only after its exact merged master receives a fresh complete gate and annotated release/assets/publication/reply readback. Keep parent open for entire program. Final163 qualifies complete integrated parent acceptance before parent reply/closure and Goalcompletion.

## Cross-cutting implications and decisions

Parent owns shared scientific/identity/freshness/preview/job/filter boundaries.156/157 use transient application state and current existing durable measurements;158 introduces typed designation with explicit durable migration/history/archive/old-reader no-loss-or-safe-refusal qualification;159 owns descriptor/settings/cache/artifact/scheduler persistence; later UI consumers do not become scientific authority. Every technical schema decision must include exact version/head/remapping/downgrade/oldwriter tests before dependent code. Original uploaded artifacts are immutable. Missing chemistry/geometry is unavailable with reason, never an inferred neutral value or zero. Preview unavailable is an accepted truthful initial policy; filters use committed structures, not checkpoint-save state.

No new dependency or broader acquisition/CCD/preparation/interaction diagram/metadata/superposition redesign is authorized. Parent164/165/153 exclusions remain open; saved data is preserved even where163 removes creation UI. Keep restricted reference identities and source links outside repository artifacts.

## Verification and release plan

Provisional additive stable **0.34.0** from preceding serial release, rechecked for actual compatibility/collisions at preparation. Update all five parent-listed authoritative version sources together; no C0 version changes. Exact migration/schema head depends on this child and previous delivered units, recorded before code and tested, never assumed from initial0015.

Use complete current release gate and actual preceding source-bound producer/readers rather than historical case counts. Include this child's new state and existing rich/connectivity/editing families. Portable timing is not strict-host certification. Seven specialist assessments supplement tests/self-review and do not replace GitHub-required human approvals. Publish qualificationZIP plus checksum/package sidecars per existing verified convention and anonymously verify all hashes/CRC. Immutable tag targets exact qualified merged master; terminal receipts use assets/issue reply or normal documentation PR without moving tag.

## PR, closeout and cleanup

Proposed PR title: `feat(viewer): viewer atom information and ordered quick geometry`. Base master, normal history-preserving merge. Include implemented/simplified/deferred/rejected requirements, migrations/reader compatibility, actual evidence, known scientific/performance limits, `Refs #156` and `Refs #11`. Never accidentally close parent at merge. Recheck current remote protections/checks/reviews before action. After verified release, one final child reply records PR/merge/version/release/compatibility/verification/scope/followups; verify reply and explicit child closure. Update parent ledger. Remove only delivered owned branch after its publication/reply/cleanup checks and when not used elsewhere; preserve other sessions.

## Progress, evidence and completion log

| Stage/candidate | Changes/decisions | Evidence | Limitations / next action |
| --- | --- | --- | --- |
| Intake; base62623a16 | Child body/native membership/prerequisites and parent authority reconciled | Authenticated2026-11-16 reads; parent scope snapshot | Planned only; no implementation test/review/PR/release. Begin in dependency order. |

### C1/C2 — coherent working slice and focused correction evidence

At parentC0head248807ec, owner confirmed takeover of existing156work. Implemented canonical atom hover, passive reserved viewer strip, stable keyboard/touch atom details and independently justified quick-geometry order. Current committed models remain authoritative; preview values are explicitly unavailable. No Python scientific/API/durable schema changes. Existing inspector and measurement persistence remain until their owned later steps.

[Domain checkpoint](../assets/viewer-information/c1-checkpoint.json), [native checkpoint](../assets/viewer-information/c2-checkpoint.json) and [work observations](../assets/viewer-information/c3-performance.json) retain actual commands, source identities, lossless logs and diagnostics. Initial full frontend1019/108passed; final focused99/6, web lint/types/build, Ruff, API/core mypy218 and74release-evidence integrity cases pass. Focused native6passes13/3exact preexisting hover exclusions, no failure/flake/retry, across both themes, keyboard/touch, native picks, actual100/200%desktop zoom and320px. Both project configurations launch an explicit independent desktop zoom context; no new exclusion is introduced.

Preliminary review corrected hidden-query lease retirement, the pinned trailing-observer teardown path, ambiguous alternate/entry/atom labels and whole-source hover derivation. Component regressions prove4→1→0retirement, held cancellation with independent consumers retained, no later retired-artifact reads and100,000loaded atoms/20warm distinct hover updates with zero full maps/network/viewer synchronizations. Native text timings remain observations, not presented-frame or strict-host qualification.

Earlier missing browser-path, mixed-payload, locator, viewport and interrupted development runs remain diagnostic in the checkpoint archive. Native6is focused working-tree evidence, not a clean frozen gate; late duplicate-name clarification has its own passing regression and complete candidate qualification will repeat final sources. Ordinary build chunk-size warnings remain disclosed; production/license audit follows in the fullgate. No application push, PR, merge, release, child closeout or final same-candidate seven-role approval is claimed. Next: final0.34version, clean committed complete gate, all-seven review and normal delivery.

### C3 preparation — compatible additive0.34.0

C1/C2checkpoint eb088e79 is committed locally and has not been pushed. All five authoritative versions move from0.33.0to0.34.0 together; no schema/dependency/migration change. New user-visible viewer inspection justifies a minor release. Remote master remains62623a16; remote annotated0.33.0tag4bb78f11→d8636064 and stable/latest publication were read back. Complete candidate recipe uses the actual extracted0.33.0source and source receipt870identities, isolated8240/8241/5403resources and disposable migration/reader stores. Final gates and final same-candidate assessments remain pending.

### C3 diagnostic and correction — current-version archive guard

Complete candidate1at4dba31d5stopped after its ninth step:43historical-archive cases retained the previous current-version assertion0.33.0;2,300other Python cases passed. The full717.93sPython log and all preceding step logs remain retained as diagnostics, not complete qualification. No runtime/scientific failure or source drift was observed. The guard now asserts0.34.0 and adds preceding0.33.0to the historical archive matrix. All44focused archive/original/history round trips pass in24.05s. A fresh clean35step candidate2will repeat the complete gate; partial candidate1results are not combined into a pass.

### C3 diagnostic and correction — native residue-pick oracle

Candidate2at957a4dba passed frozen installs, migration up/down/up, Ruff, all API/core typing, full Python/frontend/supervisor suites and build before its full native step stopped after144passes,4actual existing exclusions and one residue-range workflow failure;415tests were not run and are not exclusions. No complete gate pass is claimed. The retained trace shows an unaccepted native Shift-pick while the sequence selection stayed unchanged; raster miss versus lifecycle rejection cannot be established retrospectively. An unchanged focused reproduction passed both desktop themes, so no runtime range-calculation correction is asserted.

The native test now waits for each target's committed scene and confirms its exact canonical pick-raster identity within the existing four-CSS-pixel oracle before sending a trusted click. The exact16atom range, camera invariance, zero reads/writes and all remaining workflow assertions are unchanged. Raw projected/confirmed pixels and native events are attached. This stronger oracle passes all four desktop/mobile theme cases, with zero retries, failures, flakes or exclusions; lint and types pass.

Lossless failed-gate logs, raw browser report, failed-case trace/screenshots and a hash/size manifest for every native diagnostic are tracked. The complete22,556file native tree and verified926,627,852byte diagnostic ZIP remain in the owned ignored `.issue-11-evidence` directory; they are local diagnostics, not published evidence. A fresh35step candidate3 will qualify the final sources without pooling partial attempts. No application publication or child closeout occurred.

### C3 diagnostic and correction — visible deterministic gesture fixture

Candidate3at5abd9978again passed fullPython2,344/frontend1,023, lint/types/build and initialnativework, including BOTHpreviousresiduehierarchy cases. Native execution stopped after180passes/4actualexisting exclusions/379not-run cases at the separate forward/reverse range fixture. The final target's projected pixel was behind the floatingviewer toolbar; trusted clicks were intercepted until90stimeout. This is a fixture-framing defect, not evidence of an incorrect range calculation. The complete30,145file native tree and checked1,312,352,975byte ZIP remain locally retained under owned ignored `.issue-11-evidence`; the failed case, full inventory and lossless gate logs are tracked.

The syntheticXYgesture fixture now seeds a reproducible face-on camera through the public session-camera interface BEFOREcamera invariants. It no longer inherits installation orientation/FOV and overzooms a short chain into the toolbar. Explicit space-filling atom targets make this gesture-only fixture sampleable on the quarter-resolution native pick raster; independent ball-and-stick hierarchy/editing coverage remains unchanged. Every target is independently confirmed by exactcanonical native ID within the existing4CSSpixel oracle AND actualcanvas hit-testing, then receives a trusted input. Exactselection/ranges/anchors/camera/revision/zero-read-write assertions are unchanged.

[Focused observations](../assets/viewer-information/c4-gesture-oracles.json) retain the first14pass/8fail framing diagnostic and final16pass/zero failure/flake/retry/exclusion result acrossdesktop/mobile. No productioncodechanged. A fresh complete35step candidate4 is required; neither failed fullrun nor focused checks are pooled into a pass. All-seven final assessments must cover that finalcandidate and its completedgate.

### C3 diagnostic and correction — unobscured fixed native drag path

Candidate4 at `22e8c948` passed the full Python/frontend/tooling stages and466 native
cases before its mobile movement-focus case stopped at a hit-test assertion,
before mouse-down. It had 74 actual existing skips; 23 remaining cases were not run.
The trace shows Space already selected camera mode and retained canvas focus.
The fixed fractional sample (329.6, 573.6) CSS px was 0.4 px inside the open movement
panel's 330 px right edge. This establishes an input-oracle occlusion, not a product
focus defect. All 25,270 raw native files, including incomplete trace staging, and a
553,357,711-byte ZIP remain preserved locally; every filesystem member hash/size and
outer CRC verify. The failed case, full manifest, browser report and lossless gate
logs are tracked. The forensic archive is not a recursively qualified release
package and is not claimed published.

The drag helper prefers the existing point, then searches a fixed bounded grid for
an unobscured path. Start and all eight unchanged displacement steps must lie
inside the viewer with 4 px margin and hit the exact required native owner with 2 px
clearance. It rechecks immediately before trusted input. Panel state, viewport,
mouse button, displacement, event steps, deadlines and every focus/camera/coordinate/
history/network assertion remain unchanged. No production source changed.

[Focused evidence](../assets/viewer-information/c4-native-drag-path.json) covers the
entire affected file and all warning/workspace tail files in both projects:
49 passes/one existing desktop touch exclusion, zero failures/flakes/retries. All 54
paths pass; 53 use the original point and only the formerly failing mobile gesture
uses (379.04, 638.8). Independent explorer trace assessment and performance review
agree with the measured cause and find no consequential weakening. The fresh
candidate5recipe repeats all 35 commands; no partial full-run results are pooled.
Final same-candidate seven-role review and all publication stages remain pending.

### C3 interrupted diagnostic — withdrawn coordinate finding

Candidate5 at `f382d3aa` passed Python 2,344/zero skips, frontend 1,023 and all
preceding tooling. The primary agent intentionally interrupted its native step
after a premature specialist finding inferred the final displayed coordinates
from an intermediate SDF. The complete record has 126 native passes, three actual
existing skips, one interruption, zero unexpected failures/flakes/retries and 434
not-run cases. Browser exit 130 and complete=false remain explicit; no partial
result is qualification.

Independent source tracing withdrew the finding. NORMALIZED_SCHEMA defines atom
coordinates as the active-conformer projection, and the final native renderer
overrides parsed-file coordinates with that same projection. Supported import,
edit, transform and reader fixtures maintain it. The constructed counterexample
contradicted this documented semantic invariant despite parser acceptance; it did
not establish an actual native mismatch. No application correction was justified
or made. General invariant-validation hardening is outside this viewer slice.

All 107 native files and their verified 20,803,445-byte forensic ZIP remain in the
owned ignored evidence directory. The complete member/hash manifest, interrupted
case, browser report and lossless gate logs are tracked. Current 885 and preceding
870 source identities stayed unchanged. Scientific implementation independently
passed 29 focused cases and 1,152 deterministic frontend/backend geometry checks
(maximum absolute difference 1.75e-13, tolerance 1e-10); architecture and UX each
passed 99 focused cases and retracted the unsupported finding after direct source
inspection. These are scoped assessments, not final readiness or a complete gate.

Fresh candidate6 repeats all 35 commands from a clean committed state with the
same application sources. Final seven-role approval, normal merge, fresh exact
merged qualification and verified publication remain required.

### C3 correction — current atom draft initialization

Candidate6 at `37c3e040` passed its Python/frontend/tooling steps and 172 native cases
before the release journey failed; four actual existing skips and 387 not-run cases
remain distinct. The trace proves X was successfully filled with 4 while the atom
fields were enabled during Loading. The later current projection initialized the
selected atom, overwriting X before Y was filled. The submitted API coordinates and
stored atom were already `[0.4124306555560202, 1, 0]`. This is a product draft-loss
race, not a missed input or backend rewrite. The exact `[4, 1, 0]` assertion remains.

All 28,019 raw native files and the checked 1,225,233,062-byte forensic ZIP remain
locally preserved. The full member manifest, failed case, browser report and
lossless logs are tracked. The global maximum-failure stop notice is not a second
test defect. These are diagnostics, not complete qualification.

The atom form now commits its target owner and element/charge/XYZ together. Fields
remain disabled until the current projection and target are initialized. A new
object for the same immutable owner cannot overwrite manual input; changed targets
and A→pending-B→A visits reinitialize. Missing singleton targets remain unavailable.
Absolute Add with no/multiple selection, unknown charge, busy/locked guards and
other editing sections retain their existing contracts. No loader or schema change.

[Scoped evidence](../assets/viewer-information/c4-atom-draft.json) retains four
initial component failures/four controls and the final eight passes, including a
layout-phase observation before passive initialization. All 1,028 frontend cases,
types/lint/build and the unchanged desktop release journey plus desktop/mobile
editing workflows pass: three native passes/three existing exclusions, no
failure/flake/retry. Reference research, architecture consultation and independent
trace assessment informed an original readiness safeguard; no external GUI parity
is asserted. Fresh candidate7 repeats the complete 35-command gate. Final
same-candidate assessments and all publication stages remain pending.

### C3 correction — interaction pixel ownership and retired hover sources

Candidate7 at `307ad34a` passed its first 15 commands, including 2,344 Python/zero
skips and 1,028 frontend cases. Native execution stopped with 65 passes, two exact
existing skips, one failed pixel assertion and 496 not-run cases. The renderer had
zero installed interaction records; the full-canvas cyan count was 11 against a
maximum of 10. All 11,967 native files and the checked 500,850,050-byte forensic ZIP
remain locally retained. Its complete manifest, failed case, report and lossless
logs are tracked; no partial run is qualification.

Independent actual-camera diagnostics reproduce those same 11 pixels before any
interaction analysis. Pointer exit leaves them unchanged. Two consecutive equal
full-canvas masks establish shown/hidden hydrogen backgrounds of 9/11 pixels;
actual overlay pixels outside those backgrounds are 35 shown and zero hidden.
The [scoped correction](../assets/viewer-information/c4-pixel-background.json) freezes
both backgrounds before analysis, waits for actual canonical H visibility, asserts
camera/dimensions and restored-background equality, and retains the original color
predicate, >10/<=10 marker limits, native geometry/install checks and deadlines.
Both focused attempts pass the desktop/mobile lifecycle cases with zero failures,
flakes, retries or exclusions. Synthetic diagnostic stores remain locally retained;
live databases are excluded from the checked archive. No product correction was
inferred from the false-positive color count.

Independent performance review additionally proved the hover lookup retained one
previous scene after completed empty-source sync: 100,000 retired atoms remained
strongly referenced until another hover or disposal. The
[retirement correction](../assets/viewer-information/c4-hover-retirement.json)
clears only that disposable lookup when hover ownership retires. An actual awaited
empty-scene regression and independent 100,000-atom probe now retain zero retired
atoms. Twenty warm targets still perform zero full atom maps/requests/viewer syncs;
1,000 identical samples retain deduplication. These are work/reference counts,
not heap-byte or strict-host timing measurements.

All 1,029 frontend cases/108 suites, web lint/types/build and 74 focused cases pass.
Three native hover workflows pass with the same three mobile fine-pointer
exclusions. New candidate8 must repeat every complete-gate command from its clean
committed state. All seven final committed-candidate assessments, normal merge,
fresh exact-merged qualification and publication remain required.

### C3 complete frozen candidate8 — evidence checkpoint

Clean candidate `b46222d2eb55003a46485ad5e3f9b402699885fe` completed every one
of the 35 sequential recipe commands: 2,344 Python/zero skips, 1,029 frontend,
14 supervisor, 489 native passes and the exact 75 existing exclusions across
564 cases/77 files. Zero failures, flakes, retries or new exclusions. All 885
current and 870 actual annotated v0.33.0 source identities remain unchanged;
every lossless log hash verifies. Actual old/new producer/readers pass in separate
processes both directions and both archive suffixes. The editing phases retain
15 projects/24 transitions, corruption/stale/allocator controls and the current
unapplied proposal. This is a fresh complete invocation, not pooled partial runs.

[Summary](../assets/viewer-information/c4-candidate8-summary.json),
[reader audit](../assets/viewer-information/c4-candidate8-reader-audit.json) and
[packaging receipt](../assets/viewer-information/c4-candidate8-packaging.json)
identify the complete 82,962,711-byte packet, SHA-256
`3edc358affe456991d03477865ef57a4fda52b8b9b273d7245992a55ee88c9bb`.
Recursive verification covers 1,089 manifest entries, 226 ZIPs and 435 project
files, including every 666 browser-native files, seven scientific-native files
and 350 reader workspace files. The matching extracted native tree is retained
under owned ignored evidence; its tracked retention receipt verifies every file.

The [transport observation](../assets/viewer-information/c4-candidate8-transport.json)
records outer tool-session 143 after COMPLETE. Every actual recipe child exited
zero; the independent finalizer exited zero. The outer cause is unestablished,
and a natural zero termination of that originating session is not claimed.
Independent architecture assessment verified all 35 exact commands/environments,
logs, source maps, reader phases, finalizer receipt and recursively checked packet.
It confirms the approved contract is satisfied with no missing required check;
no acceptance is waived. The transport observation postdates the packet and must
also be included as supplemental release evidence.

All seven source assessments pass for b46222d2. This evidence-only checkpoint
requires explicit same-final-head reconfirmation by every role before push.
The tracked `c5-master1-recipe.json` prepares a fresh isolated exact-merged gate;
it has not executed. Normal PR/review/merge, fresh exact-master qualification,
verified annotated stable release/assets, issue reply/closure and safe cleanup
remain required. Parent #11 stays open through all required children.
