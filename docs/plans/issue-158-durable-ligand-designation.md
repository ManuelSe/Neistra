# Issue 158 — Exact durable ligand designation and cached candidate depictions

## Status and identity

- Status: **Authorized within agreed scope; not individually reviewed**.
- Repository: `ManuelSe/Neistra`; [child #158](https://github.com/ManuelSe/Neistra/issues/158), required by [parent #11](https://github.com/ManuelSe/Neistra/issues/11).
- Parent contract: [finite program, shared contracts and release gates](issue-11-ligand-information.md); it owns exclusions, dependency graph, shared state/API/scientific identity and program ledger. Do not duplicate or weaken those contracts here.
- Authorization: owner's 2026-11-16 explicit plan-and-deliver invocation for parent11 and all eight required children; includes normal checkpoints/push/PR/review/protectedmerge/verifiedrelease/reply/ownedcleanup without another finished-plan approval. No claim of individually reviewed wording.
- Native prerequisites: None. Current child open with no comments. No delivered behavior assumed.
- Base observed during parent intake: `62623a169f4e27da259c40ba1e74b1935b7c7775`; revalidate fresh master before this child implementation.
- Branch: `feat/issue-158-durable-ligand-designation` in the owned program checkout. First156 branches from parentC0; later units from verified preceding delivery master. Parent Goal remains active throughout.

## Problem, accepted outcome, and requirement disposition

Exact durable ligand designation and cached candidate depictions. Deliver this coherent slice while preserving parent exclusions, originals, current scientific facts and all existing retained user workflows. This plan is the child's contract; its issue brief is product input under the parent's explicit owner decisions.

| Requirement | Classification | Accepted treatment | Follow-up |
| --- | --- | --- | --- |
| Exact designation | Essential | Application-owned typed exact molecule-instance reference independent of atom selection, entry focus, visibility and interaction target. Stable canonical identity and complete membership; automatic single eligible candidate, deliberate multi-candidate choice, persistent automatic/manual origin and explicit Clear suppressing reassignment. | Parent exclusions apply; no new delivery scope |
| Candidate policy | Essential | Enumerate assigned nonpolymeric connected instances/cofactors; disclose water/monoion ineligibility, uncertain/unsupported polymer/covalent/alternate boundaries. No size/name/proximity or hidden-blacklist assignment. Disconnected fragments remain explicit independent components; never silently desalt/cap. Nonpolymeric peptides/glycans only with complete established membership. | Parent exclusions apply; no new delivery scope |
| Cards and depiction | Essential | Keyboard/touch cards with exact occurrence/location even when chemically grouped; known formula/MW/heavy atoms/charge/source/component/provenance/count. Metadata placeholder on depiction failure; lazy bounded paging and content+implementation keyed backend2D cache; inferred/unsupported facts flagged. | Parent exclusions apply; no new delivery scope |
| Durability and reconciliation | Essential | Revisioned reversible command, audit, current-input typed contract for dependents; retain identity only if unambiguous after edit, stale otherwise. First-class typed durable entry ownership with explicit database/project/archive/history migration; actual preceding-reader retention or safe refusal, never unknown-field stripping. Duplicate/archive remapping and legacy metadata edits must preserve state. | Parent exclusions apply; no new delivery scope |
| External handoff | Essential | One command for #127 future primary-ligand handoff. Ranking/hidden categories/LIG preselection are presentation and never multi-candidate designation. #52 chemistry assignment remains external; qualified existing chemistry or explicit unavailability. | Parent exclusions apply; no new delivery scope |

## Milestones and independently verifiable checkpoints

### C0 — Authorized planning

This scoped plan is persisted with the parent and siblings before code. Verify neutral naming, links, finite dependency order, unchanged runtime/versions/globalPLAN and a clean scoped diff. ParentC0 commit/push exact readback provides the planning handoff; continue delivery. Technical refinements for later contracts must be recorded before their implementation and preserve accepted outcomes.

### C1 — Domain and typed contract

Affected areas:

- new typed ligand instance resolver/domain schemas, entry persistence/commands/history and archive migration/remapping.
- API exact revision/candidate/depiction boundary and bounded artifact cache; candidate selection UI alongside retained inspector.

Build a coherent tested contract, not disconnected stubs. Read current source and accepted decisions at start. Consult theory before method choice, architecture before durable/cross-layer changes, implementation for science and reference/UX/UI before workflow/control changes. Record exact module/test names and focused commands with evidence as code lands. Run `.venv/bin/uv run ruff check .`, `.venv/bin/uv run mypy apps/api packages/neistra_core packages/neistra_demo_plugin`, affected unit/integration/scientific tests, web lint/types and affected Vitest suites; where no Python change, record reason rather than fabricate a scientific pass. Significant domain logic gets independent negative/boundary oracles. Update plan/concisePROGRESS and append material DECISIONS. Commit real passing state with Conventional Commit and child reference.

### C2 — Complete accessible vertical workflow

Integrate current application state/API/viewer/UI and significant native tests. Acceptance:

- Standalone/one-complex/multiple/repeated instances, salts/counterions/cofactors/covalent/alternates/unknown chemistry/water/ions.
- Selection/Change/Clear, identity-preserving/loss edits, metadata rename, duplicate, Undo/Redo/reload, archive migrations/corruption and actual old-reader no-loss/refusal.
- Depiction failures/latecompletion, bounded cards/cache, keyboard/touch/zoom; original bytes unchanged.

Run all applicable lint/type/unit/build commands plus focused native files for the new workflow and relevant existing regression files. Tests must exercise real rendering/trusted inputs where applicable, both themes, keyboard/touch/narrow layouts and actual100%/200% zoom, cancellation/focus/recovery and held stale completions. Preserve existing test assertions/exclusion identities and production bounds. Record exact new files and invocation vectors in the evidence log; hypothetical future results are not passing evidence.

### C3 — Measured bounds and complete final candidate

Measure representative workload and work/resource/request/DOM bounds before any optimization, comparing equivalent sources/fixtures for claimed improvements. Use parent D148 timing policy and required qualification recipe, including frozen installs, entire scientific/frontend/native suites, migrations, actual preceding tagged readers both directions/suffixes, new-state retention/corruption, production/version/license/legacy checks. Prepare consistent final versions first. Every candidate gate starts clean, records source identities/raw lossless logs, stops on failure/drift and preserves diagnostics. Fix failures and revalidate without weakening acceptance.

### C4 — All-seven review, normal merge and verified release

Review complete diff/newfiles against actual master. Obtain every specialist's independent same-candidate PASS/justifiedNOT_APPLICABLE, address consequential findings, renew affected evidence and all-role reconfirmation after changes. Push only then, exact remote readback, normal PR/review/merge with required remote reviews/checks/protection/conversations satisfied. No `Closes` keyword for child/parent; explicitly close child only after its exact merged master receives a fresh complete gate and annotated release/assets/publication/reply readback. Keep parent open for entire program. Final163 qualifies complete integrated parent acceptance before parent reply/closure and Goalcompletion.

## Cross-cutting implications and decisions

Parent owns shared scientific/identity/freshness/preview/job/filter boundaries.156/157 use transient application state and current existing durable measurements;158 introduces typed designation with explicit durable migration/history/archive/old-reader no-loss-or-safe-refusal qualification;159 owns descriptor/settings/cache/artifact/scheduler persistence; later UI consumers do not become scientific authority. Every technical schema decision must include exact version/head/remapping/downgrade/oldwriter tests before dependent code. Original uploaded artifacts are immutable. Missing chemistry/geometry is unavailable with reason, never an inferred neutral value or zero. Preview unavailable is an accepted truthful initial policy; filters use committed structures, not checkpoint-save state.

No new dependency or broader acquisition/CCD/preparation/interaction diagram/metadata/superposition redesign is authorized. Parent164/165/153 exclusions remain open; saved data is preserved even where163 removes creation UI. Keep restricted reference identities and source links outside repository artifacts.

## Verification and release plan

Provisional pre-1.0 minor **0.36.0** from the preceding serial release, rechecked for actual compatibility/collisions at preparation. The serialization contract is breaking: project/checkpoint/archive schema 3 and migration 0016 deliberately refuse older readers rather than discard designation state. Keep the breaking-change commit/release notice explicit; this is not an additive compatibility claim. Update all five parent-listed authoritative version sources together; no C0 version changes. Exact migration/schema head depends on this child and previous delivered units, recorded before code and tested, never assumed from initial0015.

Use complete current release gate and actual preceding source-bound producer/readers rather than historical case counts. Include this child's new state and existing rich/connectivity/editing families. Portable timing is not strict-host certification. Seven specialist assessments supplement tests/self-review and do not replace GitHub-required human approvals. Publish qualificationZIP plus checksum/package sidecars per existing verified convention and anonymously verify all hashes/CRC. Immutable tag targets exact qualified merged master; terminal receipts use assets/issue reply or normal documentation PR without moving tag.

## PR, closeout and cleanup

Proposed PR title: `feat(ligand): exact durable ligand designation and cached candidate depictions`. Base master, normal history-preserving merge. Include implemented/simplified/deferred/rejected requirements, migrations/reader compatibility, actual evidence, known scientific/performance limits, `Refs #158` and `Refs #11`. Never accidentally close parent at merge. Recheck current remote protections/checks/reviews before action. After verified release, one final child reply records PR/merge/version/release/compatibility/verification/scope/followups; verify reply and explicit child closure. Update parent ledger. Remove only delivered owned branch after its publication/reply/cleanup checks and when not used elsewhere; preserve other sessions.

## Progress, evidence and completion log

| Stage/candidate | Changes/decisions | Evidence | Limitations / next action |
| --- | --- | --- | --- |
| Intake; base62623a16 | Child body/native membership/prerequisites and parent authority reconciled | Authenticated2026-11-16 reads; parent scope snapshot | Planned only; no implementation test/review/PR/release. Begin in dependency order. |

### C1 pre-code contract refinement — exact state and compatibility

Independent preparation begins fromC0248807ecin its own owned worktree while156qualification runs. Publication remains serial and this branch must integrate the verified precedingmaster before final qualification. The core/API/UI changes below are authorized within the existing scope; no wording is claimed individually reviewed. Early architecture, theory, scientific-implementation and UX assessments informed these decisions.

- Add core `ligands/` typed models/resolver and strict depiction preparation; backend `ligand_service.py` owns durable commands/candidate/depiction transport. First-class entry JSON `ligand_designation` is separate from arbitrary user metadata and renderer/navigation/interaction state.
- `LigandDesignationV1` is frozen/extra-forbid with explicit status unresolved/selection_required/not_applicable/cleared/resolved/stale. Assigned states retain stable intent UUID, complete sorted unique entry-local canonical atom IDs, automatic/manual origin, selected timestamp and current assessed immutable source artifact. Unassigned states cannot carry an accidental active reference. Stale preserves prior intent with a structured recovery reason; clear suppresses automatic reassignment. Candidate keys and chemical content digests are separate identities.
- Migration0016adds a validated unresolved legacy default without scientific assignment. Upgrade checkpoint entry snapshots and retained entry-create actions; project/checkpoint/archive schemas move explicitly2→3. Preserve immutableV2validators and validateV2before conversion. NewV3archives enumerate/remap entry designation source-artifact identities and preserve exact instances/history. Duplication creates independent designation-instance intent and remaps ownership/artifacts; it never leaves another entry's reference.
- Current checkpoint versions are serialization markers, not older-writer guards: a disposable actual-source probe shows oldsave drops unknown checkpoint fields. Rename root `projects` table to `project_documents_v3` in0016and update ORM/FKs, providing an actual older direct-reader refusal before reconstruction/export/mutation. The supported supervisor's unknown-head refusal and archiveV3refusal are additional barriers. Qualify the actual tagged preceding source against disposable migrated stores before accepting this fence.
- Downgrade prevalidates live/current/checkpoint/forward/inverse history designation states. Any nondefault intent—including Clear/automatic/manual/stale—refuses downgrade without mutation. Default-only conversion strips new fields, restores schema2and reverses the root-table rename last. Preserve all prior migration files; later migrations must honor this fence.
- Import/create performs controlled automatic resolution inside the existing auditable entry command. Legacy defaults stay unresolved until the explicit controlled resolver path runs automatically on project opening; GET reads themselves do not silently mutate state. Reconciliation occurs alongside every molecular/coordinate publication and reversible history action. Coordinate/label changes preserve intent; unambiguous additions may expand complete membership; split/merge/lost boundaries become stale. Do not choose a surviving largest fragment.

### C1 pre-code scientific qualification and UI boundaries

- Small-molecule formats use source-declared qualified covalent connectivity; split disconnected fragments even when their syntheticLIGresidue is shared. Water/monoion exclusions are explicit; assigned multiatom solvents/cofactors remain potential candidates. XYZ/guessed connectivity cannot establish automatic molecule boundaries.
- Macromolecular missing bonds never create one-atom candidate explosions. Whole assigned nonpolymer residues may be exact observed source-instance candidates with disclosed manual-only uncertainty. Genuine automatic mmCIFeligibility requires exact original `_atom_site`→`_struct_asym`→`_entity.type=non-polymer` correspondence for all observed canonical members, consistent nonpolymer scheme where present, no alternate/cross-boundary ambiguity and a complete candidate inventory. Gemmi-generated entity fields or category presence alone are insufficient. Capture/verify this provenance before heuristic entity completion, or inspect preserved originals. Unknown struct_conn edges are not assumed covalent. No broaderCCDassignment is absorbed.
- Exactly one qualified eligible instance AND no unresolved potentially eligible boundary permits persisted automatic origin. Multiple/selectable-manual-only/unsupported candidates require deliberate choice. Exact membership is independent of reliable chemistry; depiction failure cannot disable an otherwise exact selectable candidate.
- Do not reuse neutral/single fallback reconstruction or approximate minimization interpretation. Preserve explicit-H/noImplicit, isotope/radical and stereo-reference semantics. A strict complete current representation or bounded exact unchanged-original recovery may supply a disposable depiction molecule; otherwise return precise unavailable reasons. Coordinate-only edits may match original chemistry; changed chemistry cannot use staleSMILES. Formula/MW/charge are unavailable when required semantics are unknown; observed heavy atoms do not imply a complete formula.
- Cache2Doutput by actual qualified chemical input, policy/implementation/library/settings, while responses remain bound to current entry/instance/artifact. All coordinate generation/preparation affects a disposable molecule copy; no automatic protonation/desalting/capping or silent chiral-H changes. Original uploads remain immutable.
- Reuse explicit `useNavigationStore.inspectedEntryId` context beside the retained inspector. A compact Ligand of interest summary exposes Choose/Change and secondaryClear. Candidate modal uses bounded12-card pages, exact-instance radio choices and explicitUse; focus/paging/Cancel do not designate anything. Known location/composition/provenance/warnings and ineligible reasons remain accessible. Changed-preview depiction/composition is labelled unavailable; save respects current publication/preview ownership.
- Independent oracles include authored-vs-inferredmmCIFmapping, unresolved inventory suppression, missingPDBbonds, disconnected salts, repeated/covalent/alternate/polymer boundaries, explicitClear, metadata/coordinate/Hedits, split/merge, exactUndo/Redo/reload/duplicate/archive remapping, pyrrole/isotope/radical/E-Z/tetrahedral fidelity and held asynchronous completions.

Preceding-source and migration-head details will be reconciled against actual0.35release before final gates; no0.36publication is assumed from these plans.

### C1 refinement — controlled legacy enrichment and retained cache bounds

Controlled legacy recognition completes exact unresolved migrated defaults through a revision-locked POST. It is system baseline enrichment, not an undoable user action: persist assessed source, resolver version, assessment timestamp/revision, touch the project, and preserve every existing command/position/redo branch and checkpoint. Import recognition remains inside its reversible entry-create snapshot; manual choice and Clear remain ordinary reversible user commands. Before replay removes a legacy entry, capture exact live intent into its matching retained creation snapshot; restoration of an absent default-only entry resolves and persists that snapshot once. Molecular replay adapts both directions once. Subsequent replay restores exact recorded identities, not fresh UUIDs. This avoids expanding the existing200command history limit or silently discarding redo.

Depiction admission is serialized by the local database write boundary. Retain at most1,024content records,512KiBper SVG and128MiBaggregate retained depicted bytes;4,096source bindings may rotate. At capacity, serve existing content and explicitly decline new content before publishing any artifact bytes/rows. Do not evict content rows while leaving unbounded orphan drawings, and do not delete globally shared artifacts. These are local-store admission bounds, not a bound on unrelated project/upload storage. Candidate-only hydrogen expansion is limited to1,024admitted atoms; original parsing/indexing still follows existing source-upload bounds.

Reference research supports contextual cached2Dcells, accessible metadata and explicit oversized/unavailable states. Exact durable per-entry designation, explicitUse/Cancel and conservative multicandidate policy remain accepted application adaptations; current detailed proprietary GUI switching was not publicly verifiable.

### C1/C2 initial vertical checkpoint — focused evidence, not release qualification

Implemented complete candidate inventory/durable commands/reconciliation and a usable inspected-entry summary/candidate modal. Automaticdefault completion preserves all200retained history records/positions/checkpoint; manual choice/Clear and import remain reversible. Marker-qualified legacy creation and molecular snapshots are materialized once, retaining exact UUID/provenance through repeated replay. ArchiveV3strictly validates historicalV2beforeupgrade, exact current membership and declared sourcefiles, and remaps independent entry/instance ownership.0016guards every emitted top-level and nested retained intent before downgrade.

[Checkpoint record](../assets/ligand-designation/c12-checkpoint.json) binds working source hashes, raw lossless checks, all three native attempts and independent resource probes.217focused API/domain/scientific cases plus133historical migrations pass; final14designation cases repeat after assessment-revision stamping. Frontend1,011/108, Ruff, mypy227, lint/types/build pass. Native3passes4desktop/mobiletheme flows covering repeated identical molecules, noautomaticfirstchoice, keyboarddraft/cancel, real2Dartifacts, Use/Clear/Undo/Redo/reload and unchangedselection/camera/current/originalbytes. Actualzoom/nativepreview/heldcompletion qualification remains next.

Native1used an incorrect image CSS locator; native2exposed a real developmentStrictMode cancellation bug. Its independent component reproduction had zero drawing requests. Corrected ownership uses consumed TanStacksignals and fixed12observerkeys that retire onpreview/source/page changes;22componentcases nowcoverStrictModereplay/painting,previewrecovery/heldretirement and independentconsumer preservation. Native3is separate passing evidence, not a pooled/frozen fullgate.

Independent ASGI work measurements:12card metadata shares one preparation/originalparse;12warm drawings perform zero inventory/qualification/layout and verify36current/original/output payloads. Busy slots stillserve cache hits; coordinate rebind reuses content with zero layout; binding rotation and simultaneous admission at capacity preserve data and bounds. Timing remains diagnostic.1,024content/512KiBoutput/128MiBconservative aggregate limits retain all admitted drawing artifacts; no unbounded row-eviction or broadGC. Imported assessment revision remains historical provenance, never a comparison to the new project's currentrevision.

No final feature, all-seven same-candidate approval, push, PR, release or closeout is claimed. Current development versions remain unchanged pending actual preceding156/157integration; complete gates and tagged-reader checks must use the real predecessor then.

### C2 pre-code qualification refinement — explicit schema boundary

Existing rich/current-connectivity/editing qualification assumed mutual schema2read/write. Preserve every positive scientific/state fixture and deep negative oracle, but qualify the accepted schema3fence explicitly. In isolated actual-source processes: current produces rich/current-connectivity/editing/designation states; the actual predecessor refuses copied current live stores (unknown0016and missingoldroot table) and both current archive suffixes without row/artifact mutation, while independently producing its original positive states; current migrates those predecessor stores0015→0016, checks all preceding fields plus exact new defaults, reexports/imports both suffixes, and reopens its original states unchanged. Refusal and retention counts/phase labels/heads are separate evidence, never replacement zeros under old labels.

New editing/designation qualification retains three actual-source phases (`produce-current`, `refuse-current-produce-previous`, `read-previous-reopen-current`) and all existing15editing cases/24transitions, corruption/stale/allocator controls and six deep-oracle negative controls; add exact designation/remapping assertions. Version-specific recipe/summary/packaging must validate this explicit protocol. Diagnostic work may use the verified0.33source; final qualification binds the actual released predecessor after156/157integration.

### C2 verified independent checkpoint — lineage, recovery and actual-source diagnostics

[Checkpoint evidence](../assets/ligand-designation/c2-checkpoint.json) records a fresh
**2,639-pass Python run, zero skips**, with all **928** selected source identities
unchanged. All **1,030 frontend tests/108 suites**, web lint/types/build, global Ruff,
API/core/plugin types and seven reader-helper type checks pass. Five development
versions remain 0.33.0; dependencies and historical migrations are unchanged, with
project/archive3, viewer2 and head0016. Production bootstrap/license audit passes.
These development checks are separate from final release-version qualification.

Final native attempt6 passes eight desktop/mobile/theme workflows with zero
failures/flakes/retries/skips. It includes real instance choice and bond-split stale
recovery, actual100%/200% browser zoom,320px containment/Axe, original bytes, exact
focus/cancellation and unchanged persisted state after review. Both native attempts
5/6 and all earlier accessibility attempts remain available.

Scientific correction preserves immutable original lineage across label/chemical
edits and anchored additions/deletions, with known split/merge guards. Present
scheme contradictions, null semantics, multiple waters, raw macrolide/unknown
classes, implicit-H ions and legacy original recovery have independent regressions.
Original bytes/presence are part of inventory identity. Unqualified molecular charge
is withheld. Scoped theory, implementation and architecture assessments resolve
those findings; final all-seven integrated-candidate assessment remains pending.

Recovery warnings identify unavailable originals and stale sources. Failed current
input checks retire cached cards/images and Use eligibility; a matching successful
recheck can restore a draft. Context-visit feedback cannot return after choice,
Undo/Clear or A→B→A. Scoped UI/UX assessments and41component cases cover the final
correction. Shared exception aliases retain one implementation across both package
namespaces.

A measured per-row optional-column allocation was quadratic: at1,000scheme rows,
4,000,000discarded list slots become zero, and1,000missing-coordinate fallback
allocations become one. Four work-count regressions and independent before/after
probes preserve mapping semantics and linear-pattern/cluster bounds. The qualified
25-ethanol ASGI workload again uses one preparation/original parse for12metadata
cards;12warm drawings do zero inventory/chemistry/layout work and verify36payloads.
These are workload-specific portable observations, not strict-host timing claims.

Fresh actual v0.33 source diagnostics pass all15explicit reader commands after the
corrections: rich/connectivity safe refusals, independent old-authoring, current
migration/reopen, and editing/designation three-phase checks. All owned stores,
artifacts, original specimens, commands and raw observations are retained. The
initial broad/full failures, missing native-tool environment attempt and version
command missing its module path are retained diagnostics; none is pooled into a
passing gate. Historical schema fixtures, missing aliases and the stale schema2
assertion were corrected before the fresh complete2,639case run.

This is a passing local checkpoint, not finished feature delivery or readiness to
push. Final integration still waits for verified156/157master and the real released
predecessor, consistent final versions, both complete35-command gates and all-seven
same-candidate review before protected publication/closeout.

### C2 corrective source checkpoint — concrete chemistry and current identity

[Corrective evidence](../assets/ligand-designation/c2-corrections-checkpoint.json)
binds the source map, checked archive, regressions and scoped assessments below.

Independent complete-source assessments of `48955b36` found reachable unsupported
query/dummy qualification through exact-original recovery, isotope-water identity,
historical water-label overrides and A→B→A legacy error feedback. The correction
adds a shared post-recovery/reconstruction guard before derived outputs; exact
candidate selection remains available. Water recognition retains isotopes and uses
qualified physical composition, while compatible established PDB/mmCIF source-water
fallback remains separate from qualified chemistry. Current nonwater and raw
nonpolymer ownership cannot be overridden by water-like labels. No global component
classification redesign is added.

Resolver and chemistry policies plus both client query keys advance to v2, retiring
old fast bindings. Drawing v1, schema/migration, explicit intent and original bytes
remain unchanged. A constructed prior-stamp cache negative control retains old rows
while proving current qualification runs; it is not actual historical-producer
compatibility evidence. Legacy error callbacks capture their visit and preserve
global serialization, priority, bounded batches and final scheduling.

The frozen correction has 930 selected source identities. Initial regressions fail
13 science cases with six controls passing and two new legacy cases with all 1,030
prior frontend cases passing. Corrected checks pass 25 new science/API cases, 219
broader Python cases, 49 focused frontend cases and all 1,033 frontend cases, plus
global Ruff, API/core typing, web lint/types/build. Theory independently checks 41
cases, implementation 47, and architecture 52 frontend/25 backend cases plus the
original held-request probe; all return scoped PASS. Failed checks and actual probes
remain preserved separately.

This freezes a coherent corrective state for full Python/native requalification.
The earlier 2,639-Python/eight-native checkpoint remains historical 928-source
evidence; it is not claimed to qualify the new sources. Final predecessor integration,
versions, both complete release gates and all-seven final same-candidate review
remain required before push/publication.

### C2 recovery/count correction — current working qualification

Image downloads and SVG decoding can fail after successful depiction metadata.
Keep metadata and exact-instance selection available; replace broken images with a
stable placeholder and Retry 2D. Per-card source visits and image-attempt tokens
retire late events. Retry remounts the same immutable artifact through a fresh URL,
adds exactly one image request and performs no new metadata/chemistry request.
A pre-mounted polite/atomic status names the exact instance and announces failure,
requested retry and actual successful load. Initial automatic successes stay silent;
a failed or retired attempt cannot announce recovery. Focus returns to the radio,
or the dialog heading when that radio is disabled. No persisted choice changes.

The accepted pre-code scientific count rule is independent of molecular chemistry:
count canonical sites with known atomic number >1 only when every site has a known
element. Unknown/dummy sites make the complete count null; D/T are hydrogen-counting
aliases without rewriting isotope/source facts. Known carbon queries and unknown
charge/bond order can retain known site counts while chemistry remains unavailable.
The UI distinguishes null (atom sites) from a known zero heavy count, and withholds
counts during previews. Resolver/client keys advance to v3; chemistry v2 and drawing
v1 stay unchanged. Constructed prior-v1/v2 bindings are negative controls, not actual
historical producers or a database migration.

Current checks pass 35 science/API cases, 229 broader Python cases, 50 recovery
component cases, all 1,041 frontend cases/108 suites, global Ruff/API-core typing,
web lint/types/build. Theory independently passes 18 count/import/JSON cases;
implementation independently inspects current method/transport and retained tests.
UX independently passes 50 cases and verifies actual recovery evidence. These are
scoped assessments, not final integrated all-seven approval.

The initial native recovery attempt fails twice because identical occurrences share
one artifact URL: a browser-coalesced failed download affects both images. Distinct
molecules establish independent image requests without changing product behavior.
Corrected desktop/mobile workflows pass all eight theme/failure-mode observations,
including decoded images, one extra image request, zero metadata requests, retained
choice/focus, original bytes, containment and Axe. Full native3 requalification of
both feature files passes all ten cases with zero failures/flakes/skips/retries;
earlier eight-case evidence stays historical.

Full Python3 at c62feb37 has 2,664 passes/zero skips and unchanged 930-source maps.
Its child receipt records exit0; the outer tool wrapper reported143 with unexplained
cause, retained separately. It is not a complete release-command gate. Full Python4
at the earlier recovery/count bytes has 2,671 passes and three failures: unchanged
worker-error controls return edit_timeout at their 0.3-second deadline instead of
injected exit/descriptor/unicode errors. The same 34-case file passes unchanged in
isolation. Preserve both runs and source maps; do not pool a full pass, increase a
deadline or claim this failure resolved. Fresh full Python5 on current bytes passes all 2,674 cases/zero skips with exit0
and all 930 source identities unchanged. Its complete log hash is
`526df83849fceb700dad63f26c2ed1164931c4d41c351c6056aa6d969cc5501c`.
The earlier full4 failure remains diagnostic; its causal mechanism is not claimed
resolved merely from subsequent passes.

[Passing checkpoint](../assets/ligand-designation/c2-image-recovery-checkpoint.json)
binds current source, all checks, [native attempts](../assets/ligand-designation/c2-image-recovery-native.json)
and [separate diagnostics](../assets/ligand-designation/c2-image-recovery-diagnostics.json).
This coherent local correction is prepared for its checkpoint commit.
It must later integrate verified #156/#157 master, actual predecessor readers and
final versions before complete candidate/exact-merged gates and final all-seven
review. No implementation push, PR, release or closeout is claimed.


### C3 integration — actual released predecessor and guarded ownership

2026-11-17: #156 and #157 are fully delivered. Merge actual terminal master
`b038e4e6` into prepared local `68b1a868`, preserving both accepted decision and
limitation histories. Preceding runtime is actual tagged v0.35.0 `7542d1a1`, with
931 qualified sources. #157 terminal PR174, owned cleanup, anonymously verified
C7 delivery receipt and canonical reply complete its endpoint; parent Goal stays active.

All five working versions advance to 0.36.0. D-175 records consulted synchronous
ligand ownership, captured preflight/dispatch and separate feedback authority, while
retaining released measurement guards. Isolated frontend and reader-helper owners
have disjoint edit scopes; primary owns API, version and documentation integration.
No new scientific method or dependency is introduced. Retain all42 predecessor
check responsibilities and add new-state schema3/0016 qualification against actual
0.35; the earlier35-command recipes and local C2 results are historical only.

This in-progress merge is uncommitted and unqualified. Resolve semantic ownership,
run meaningful focused regressions, inspect integrated changes, then commit a passing
checkpoint before fresh full release gates and all-seven final review. No application
push, PR, 0.36 tag/release or #158 closeout is claimed.


C3 focused integration status: frontend handoff passes120cases/seven suites
(including22actual-App), full lint/types and frozen eight-file hashes; independent
UX also passes22actual-App with unchanged hashes. Reader integration passes105
focused and112packaging tests plus seven actual0.35ordered-reader commands; scoped
architecture independently verifies91cases, all931predecessor identities, reports
and packaging. Carry forward released child-session isolation/receipts unchanged;
architecture reconfirms that exact three-line runner delta. These are focused
assessments, not final feature approval or a pooled release gate.

The first four-case combined native run fails, with all994source identities stable.
One preparation evaluation loses its navigation context (cause unestablished);
one desktop assertion used incompatible visible-text/DOM whitespace (corrected to
an exact three-target array with explicit atom order); both mobile cases expose
real Inspector Escape also closing Measurements and clearing its draft. D-175
records the consulted bounded recovery fix. All receipts/traces remain retained;
no deadline, retry, exclusion or previous assertion is relaxed. Freeze corrected
sources and run fresh native qualification before the passing merge checkpoint.


### C3 passing actual integration checkpoint

[Source-bound record](../assets/ligand-designation/c3-checkpoint.json) and checked
16,037,854-byte packet/SHA `fbfcd30e65b0e0e089da19c312aa78576777bf4a93129a8e49ff6f6834e7b760`
retain13recursive ZIPs/159manifest entries/32project files, all failed/native/corrective
logs and complete owned synthetic stores. Current994source digest is
`3c9f4353725e437cefbd2764ce0a6fcab75df0d5059bcca60f7c5d0f2e7f611e`.

After the admitted lifecycle and Escape corrections,158focused frontend cases/nine
suites, full lint/types and independent scoped UX assessment pass. The fresh18native
cases pass both profiles/themes, actual zoom/320px/image recovery, exact repeated
ligand choice and retained ordered measurement acquisition. All994sources remain
unchanged; build/native child and actual enclosing session77449each exit0. The initial
failures remain separate evidence; no navigation cause is inferred from this pass.

Architecture reconfirms the42responsibilities/actual931-source predecessor and exact
runner isolation carry-forward; theory preserves the accepted methods. Five0.36
versions, dependencies, fifteen historical migrations, new head0016/projectarchive3/
viewer2 and original bytes qualify their focused checks. This coherent release
preparation integrates actual terminal masterb038e4e6. Next commit this checkpoint,
then run clean fresh `c4-candidate1` qualification/independent summary/recursive
packaging. All-seven final same-candidate assessment, normal protected delivery and
fresh exact-master gate remain mandatory; no push/release/closeout is claimed yet.


### C4 required occurrence-count correction

Full-diff review confirms an essential gap: Instance N and page totals are not
occurrence counts. Candidate1is intentionally stopped at Python before any source
edit; actual enclosing56591exit143 is explicitly attributed to the owned SIGTERM.
Eight earlier checks pass, partial logs/source proof remain intact, and994current/
931actualpreceding sources stay unchanged. This is not a complete gate.

D-176 refines the accepted count requirement without adding grouping UI or changing
eligibility/intent. Use entry-wide qualified representations or verified source
entity counts with explicit basis; unknown potential matches make chemical totals
unavailable. Existing input hashes retain their identity role. Preserve total
attached-H semantics, explicit H graph nodes, isotopes/charge/radicals/stereo; unsupported
semantics are unavailable. Source eligibility stays within its existing boundaries.

The science handoff passes182cases with independent theory rerun/probes. New cache/
API plus retained query/drawing checks pass38cases; independent architecture passes
16cache/API cases. Frontend manual recovery passes178cases/nine suites and full
lint/types, with independent scoped UX assessment. A separate21-fresh-process baseline
supports shared preparation; final prototype/API/cache measurements are underway.
These scoped results do not establish a final feature or replace either full gate.

Next qualify final bounded policy and actual counts/Retry across native themes,
320px/zoom and exact choices; retain all failed evidence. Commit the passing correction
and use a fresh `c4-candidate2` full42-command recipe, independent summary, recursive
packaging and actual enclosing readback. All-seven final same-candidate assessment
precedes push; exact merged qualification/release/closeout remains mandatory.


### C4 occurrence correction: passing integrated checkpoint

The measured D-176 policy is adopted without changing the proposed bounds. Frozen
production files pass 24 fresh core samples, 18 ASGI samples, six verified-source
samples and cache/admission probes; retained native molecules are zero. Encoded
cache limits are not Python-heap/RSS ceilings. The initial nonreproduced process
high-water observation remains disclosed with its separate repeat, without a
causal claim. API documentation and scientific limitations describe these bounds.

Integrated verification passes global Ruff, API/core/plugin typing (249 files),
263 focused Python tests, all 1,295 frontend tests / 122 suites, 14 supervisor
tests, frontend lint/types and build. Fresh native qualification passes 22 cases
with zero failures, flakes, retries or skips on both profiles/themes, actual zoom,
320px layouts and Axe. Count Retry performs one metadata read, preserves exact
choice/focus and restores actual server totals; Cancel preserves original bytes,
canonical selection and the complete project. Existing ordered measurement
acquisition and stopped draft retention pass alongside these cases. All 1,002
source identities remain unchanged, digest
`7a151a3b6173508cceade1d1fb4d66913429831959bda9c2d16d0cfa43aec72c`.
Native child and actual enclosing session28053 both exit0.

The [correction record](../assets/ligand-designation/c3-occurrence-correction-checkpoint.json)
binds its recursively checked packet, all focused and performance logs, owned
synthetic stores and the deliberately stopped candidate1 evidence. These remain
focused checks; no final feature, push readiness or release approval is claimed.
Next commit the coherent correction and fresh `c4-candidate2` recipe, then run all
42 commands, independent summary, recursive packaging and actual enclosing readback.
All-seven final same-candidate assessment and exact merged qualification remain.


### Complete-review correction cycle after candidate2

All seven specialists assessed the complete intended feature at12da8638 against
actual terminal masterb038e4e6. Theory, scientific implementation, performance and
reference code assessments pass within their evidence scope. Architecture, UI and UX
require the two D-175 corrections: actual 133px outer scrolling clips header/Close,
and a schema-valid retired changed ACK remounts a replacement chooser. Candidate2
was deliberately stopped at Python after eight passes, with all1,002current/931old
sources unchanged; actual enclosing26838exit143 and all raw partial evidence remain.

The stronger header oracle fails on both actual profiles before production edits.
The bounded CSS correction passes both cases/enclosing74302exit0 without relaxing
existing containment, Axe, focus, cancellation or immutable-state assertions. Root
owns CSS/native/docs; the existing frontend implementer owns only controls and the
two focused test files for the ACK fix. Preserve legitimate cache acceptance, shared
source-verification failures, page/draft/focus and separately retired async owners.

Add actual held server Use/Clear ACK native cases in both themes/profiles. Complete
passing focused/integrated/native checks and all affected specialist reassessments
before a clean freshcandidate3. Final all-seven same-candidate approval still waits
for complete qualification/evidence; no implementation push or release is claimed.


### Passing complete-review corrective checkpoint

[Correction record](../assets/ligand-designation/c3-complete-review-corrections-checkpoint.json)
binds a34,118,052-byte archive/SHA
`77fb0855818b5e0b4d32f07022df04bbb7626228f9884e8914aab56a6d3fb8a8`,
11recursiveZIPs/261manifest entries and complete designated owned stores. The source
map has1,003identities/digest
`2cd722d392c081a412824a9efe2e620ed9403c85db41942f099f21361d666cc5`.

Stable chooser ownership, shared-query qualified placeholders and the source-owned
failure fence pass187cases/nine suites, full web types/lint and enclosing31288exit0.
Actual schema-valid changed Use/Clear ACKs preserve cache acceptance, DOM/radio/page/
draft and deliberate focus. Held metadata cannot authorize Use; failed inputs cannot
return through the SDK's last-defined-data history. Original App/MeasurementTool
hashes remain unchanged. Independent architecture/UI/UX scoped reassessments pass.

All1,304frontend cases/122suites and build pass. Native4 retains22passes/four new
background-role oracle failures, diagnosed from actual aria-hidden root plus Change
button snapshots. Native5 retains22passes/four precise UTC-suffix comparison failures
after the focus assertions pass. No application code changes to address these test
oracles. The narrow canonicalization retains all timestamp digits and every other
field. Four targeted real server Use/Clear cases then pass, followed by one fresh
26-case run with zero failures/flakes/retries/skips and all1,003sources unchanged;
actual enclosing59094exit0. It includes both themes/profiles/actualzoom/320px/Axe,
header/Close/zero-outer-scroll invariants, image/count recovery and ordered measurements.
Frontend/build proof is explicitly reused after a single-native-test-only delta.

This is a passing focused correction, not complete42qualification or readiness to
push. Preserve both intentionally stopped full attempts and every failed probe.
Next persist the corrective checkpoint and freshcandidate3recipe, inspect the complete
intervening diff and obtain all-seven code reconfirmations. Then run all42commands
fresh, independent summary/recursive packaging/actualenclosing, final evidence commit
and all-seven final same-candidate assessments before normal protected delivery.
