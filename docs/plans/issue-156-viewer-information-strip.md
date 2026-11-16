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
