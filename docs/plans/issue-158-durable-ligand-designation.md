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


### Candidate3 natural failure and isolated pytest correction

All seven complete-feature CODE assessments pass the same ac4786d1. Its fresh
42-command attempt fails naturally at Python:2,844pass/132fail, all failures in
unchanged historical migration tests; actual enclosing71290exit1 and all1,003current/
931old source identities remain unchanged. No complete gate or pooled pass is claimed.

D-177 records the directly reproduced configuration conflict. The pytest step's
canonical database settings correctly override fixture-local legacy aliases, sending
Alembic to a different store. Remove only the shared database binding from pytest;
the runner's five-alias sanitization and all dedicated migration/reader bindings
remain. Production behavior, migration files, historical tests/assertions,42commands,
reader coverage, exclusions and deadlines are unchanged. The generator and its
environment-guard unit test are the only selected-source changes.

A real unchanged case reproduces failure with injected settings and success without
them; actual enclosing23682exit0. All133historical migration cases then pass, enclosing
23430exit0. All17recipe tests/Ruff/syntax checks pass, including the real hostile-env
child regression. Architecture independently approves the implemented boundary.
[Source-bound environment evidence](../assets/ligand-designation/c3-qualification-environment-checkpoint.json)
binds a2,707,610-byte ZIP/SHA
`d3b5fdb6efce697e0e24a798aee2757b0e9f99ec1cb14c4298337ec6bff8fb87`,
191manifest entries and complete designated synthetic stores. Internal pytest aliases
are recorded only after within-owner validation; actual payloads and original links
are preserved. Generic archive symlink refusal remains unchanged.

Current1,003source digest is
`5fcfdf29e02d2855ad726078b554a831d30d0096dd2c26970d244b87b6e2e415`.
Unchanged application/science/frontend/native evidence is explicitly reusable; a
fresh cleancandidate4 must still complete all42commands/summary/recursive packaging/
actualenclosing before final evidence and all-seven same-candidate readiness review.


### C3 native legacy-assessment baseline correction

Freshcandidate4 atcd6715d3 passes2,976Python/zero skips,1,304frontend/122suites,
14supervisor, frozeninstalls/migrationroundtrip/lint/types/build. Native stops after
53passes, two encountered historical exclusions and one failure;546cases do not run.
Actualenclosing73200exit1; all1,003current/931preceding sources remain unchanged.
This is failed qualification, not pooled evidence for any later complete gate.

The existing orphan-H native fixture imports a historical archive with untouched
unresolved ligand intent. Opening the project deliberately completes its first
controlled assessment: HTTP200, revision1→2, automatic complete20-atom membership,
source and assessed revision, with the original single history command retained.
The old test compared its final read-only revision against the pre-opening value.
Read-only owned-store/trace inspection and scoped architecture assessment confirm
this accepted lifecycle; no production regression or method change is established.

Only `tests/e2e/hydrogen-membership.spec.ts` changes. It proves the initial unassessed
state and exact one-time assessment separately, then captures the complete assessed
project before native picking/editor checks. Designation and modification timestamps
change legitimately; computed entry dirty changesfalse→true because designation now
differs from the untouched checkpoint. Assert that explicitly, compare every other
entry field, exact history, canonical structure/hierarchy/source and complete intent.
Retain the original component/orphan-H/native-picking/editability assertions and add
exact final complete-project and original-byte invariance against that baseline.

Isolated before1 reproduces both profile failures (actual75909exit1). A first added
transition assertion incorrectly required dirty to stayfalse and fails both profiles
(actual72016exit1); retain it as oracle-development evidence. Corrected after2 passes
both profiles, zero skips/flakes/retries, actual5043exit0 and all1,003sources unchanged.
Scoped architecture independently approves the corrected source and acknowledges the
earlier dirty assumption. Every application/science/API/frontend/migration/helper
source remains byte-identical. No deadlines, exclusions or product requirements move.

The [checkpoint](../assets/ligand-designation/c3-legacy-native-baseline-checkpoint.json)
retains full failed candidate4 logs/native frames, all exact test versions, focused
traces/receipts and every owned synthetic store. Independent manifest-bearing ZIP
parts remain below normal file limits. Incomplete browser artifacts are explicit
failed-run forensics; the generic finished-gate packager still rejects them. The
private original monolithic forensic copy is preserved too. Freshcandidate5 must
start clean and repeat all42commands, summary, packaging and actual enclosing readback.
Final all-seven assessment covers the final evidence candidate before any push.


The subsequent static audit examines all six native archive-import files before
another full run. A second historical fixture captures a styled pre-opening revision
for an explicit preparation API call. Actual before1 traces show assessment2→3 then
that stale call2→409; both profiles fail (actual18952exit1). Capture the post-assessment
revision only after proving exact+1, unchanged history/source/other entry fields and
`selection_required` with no chosen instance. Keep all six-H/native-picking/camera/
one-affected-reload assertions. Corrected after1 passes both (actual83091exit0).
A fresh combined run passes all four cases, zero fail/flake/retry/skip, all1,003sources
fixed, actual47963exit0. Scoped architecture independently approves both corrections.

The [second checkpoint](../assets/ligand-designation/c3-prepared-legacy-baseline-checkpoint.json)
binds a4,355,973-byte ZIP/SHA262d0003… with48manifest entries, threeZIPs and all owned
stores/trace/HTTP proof. Final source digest is14af75c7…200b43. Only the two existing
native files differ fromcd6715d3; all1,001other selected sources stay unchanged.
Other archive cases use current-producer roundtrips, current UI command ownership or
wording/invalid/cancelled input rather than the stale explicit revision pattern.
This audit does not replace the still-required fresh complete602-case native run.


### Native locator correction and supplemental forensic retention

Freshcandidate5 at5d34a29b completes all pre-browser phases but fails the global
Receptor text locator after157native passes/three encountered historical exclusions;
441cases do not run. Actual97110exit1,1,003current/931preceding source identities
unchanged. New Entry options make the old unscoped name ambiguous. An independent
98-file/125-text-locator audit confirms the scoped browser-row corrections and
selection Clear ownership; no production change is justified.

Before-runs reproduce both strict locator failures. Scoped selectors preserve all
rename/duplicate/group/lock/hide/isolate/delete/Undo/Redo/save/reload assertions. A
later old fractional canvas click misses actual atom centers. Use the established
read-only native projection harness and a trusted unobstructed canvas click; assert
exact canonical viewer structure_id/atom_id as well as1atom summary, then retain all
palette/color/camera/held-command/project-durability assertions. A first added event
assertion uses the wrong field name and fails despite a correct atom2pick; retain it.
Corrected fresh after3 passes11cases, zero failure/flake/retry, three unchanged
historical exclusions, actual73803exit0. All1,005selected sources remain frozen and
strictnativeTS passes. Scoped architecture independently verifies and approves.
[Checkpoint](../assets/ligand-designation/c3-native-locator-checkpoint.json) binds
18,310,542-byte ZIP/SHAe054230a…009f,49manifest entries, both actual owned stores and
all failed/corrected source versions. No new exclusion, retry or deadline is added.

Reuse D-174's supplemental forensic release-asset contract. Move five existing C4
parts unchanged into forensics/; preserve C5 failed native/store evidence in13private
parts. All18parts are below80MiB,1,405,381,190bytes total. Exact disjoint inventories
cover8,966C4 and23,781C5payloads, with recursive CRC/SHA and historical recipe/gate/
source/log identity verification. The specialized tracked verifier and64offline
corruption controls pass Ruff/mypy and independent scoped architecture review.
[Expected index](../assets/ligand-designation/c3-forensics-index.json) and the small
[source/control ZIP](../assets/ligand-designation/c3-forensics-verification.json)
enter the primary packet; raw parts are supplemental, not nested again. All owned
stores remain and raw C5native relocation is verified filewise. Actual server IDs,
full anonymous bodies/hashes/recursive CRCs/exact unions are mandatory after release
and before child closeout. Local checks make no public-availability claim.

The only four selected-source changes from5d34 are two existing native oracles plus
the new verifier and its tests; application/science/API/frontend/migrations stay
unchanged. Fresh cleancandidate6 must still complete all42commands, summary, packaging
and actual enclosing readback. Final all-seven assessment covers the complete final
candidate before push; exact merged-master qualification remains separately required.


### Candidate6 transport interruption and unchanged-source recovery

All seven complete-feature CODE reconfirmations pass exactb41fa747 againstb038e4e6;
no consequential source finding remains. Freshcandidate6 passes3,040Python/zero skips,
1,304frontend/122suites,14supervisor, all pre-browser install/migration/static/build
phases, then fails native with65passes, one failure, two encountered historical
exclusions and534unexecuted cases. Actual62395exit1;1,005current/931preceding source
identities remain unchanged. Independent summary/complete packaging did not run.

The failing interaction test reaches its native observer check after module-loading
failure. Trace evidence records98ERR_NETWORK_CHANGED requests/console errors; the
instrumented MolstarEngine response is HTTP200 with the expected wrapper, while
dependent modules fail. The UI explicitly shows its dynamic-import error and disables
unavailable native actions; canonical visible/loaded counts are separate structure
data. A fresh unchanged-source8-case interaction probe passes both profiles with zero
failures/skips/flakes/retries, actual80161exit0 and all1,005source identities fixed.
Independent performance diagnosis supports a module-transport interruption, establishes
no underlying host/network cause and finds no evidence warranting application changes.
This does not prove that every intermittent application defect is impossible.

Preserve the failed full run, all raw native/owned store payloads, lossless logs,
source/recipe/gate identities and exact probe/enclosing receipts as an append-only
extension of D-174's supplemental index. Existing two run records,18parts, inventories
and first source/control ZIP remain byte-identical; version2 verification binds the
new finalized index and candidate6 payloads. Do not rebundle raw forensic parts into
the primary packet or count this local verification as public download availability.

Fresh cleancandidate7 must repeat every42commands, independent summary, recursive
packaging and actual enclosing exit. Application/harness sources, retries, deadlines,
exclusions and acceptance remain unchanged; no failed partial gate contributes pooled
passes. Final evidence-head all-seven readiness and separately fresh exact-merged
qualification remain mandatory before release/closeout.


### Candidate7 legacy minimization baseline correction

Freshcandidate7 at5b4dd06b passes3,040Python/zero skips,1,304frontend/122suites,
14supervisor and all pre-browser phases, then fails after207native passes/one failure/
four encountered historical exclusions/390unexecuted cases. Actual92826exit1;
1,005current/931actual preceding sources remain unchanged. No summary or complete
packaging ran. Preserve this failed run independently; no partial passes pool.

Independent trace analysis locates a successful first legacy-archive assessment
before minimization submission: revision1 becomes2 and the job captures2. Original
and structure bytes are identical; no calculation mutation defect is established.
The shared minimization fixture now observes actual resolver responses, verifies
each contiguous mutating batch and exactly one assessment per entry, checks canonical
membership/provenance/dirty transition plus exact immutable bytes/unrelated fields/
history, and returns that assessed baseline. It handles actual one- and two-entry
batching rather than assuming every fixture receives one universal increment.
Existing calculation, preview, nonselected-coordinate, Apply+1 and Undo/Redo assertions
remain unchanged; no retry, timeout or exclusion changes.

Before1 reproduces two failures; after1 passes both profiles. The closed all-consumer
run passes17cases, one unchanged historical mobile zoom exclusion, zero failures/
flakes/retries and actual native childexit0 with all1,005sources fixed. Its original
execution-session completion result was unavailable after resume; a fresh readback
independently verifies retained receipt/log/report hashes and current source identity,
without claiming a new native execution. Strict changed-helper TypeScript passes
actual48114exit0 using actual Vite mapping, installed Node types and the existing
browser-test globals. Earlier misconfigured ad-hoc compiler failures stay retained.
Scoped independent architecture returns PASS for exact helper57d75c0d…f081.

D-174 supplemental retention extends append-only to four failed runs/43parts,
3,344,071,044asset bytes and77,386files/7,143,818,984raw bytes. All43parts pass the
tracked local verifier, actual41979exit0. Prior three run records/24parts/inventories/
verification1/2 remain unchanged. Verification3 ZIP is6,050,719bytes,
SHA995b611119328d250e02a31264a71e0ab537bd8b3f6616e76f36d9b216dd3577.
Candidate7 raw native relocation is filewise verified; all owned stores remain.
The separate correction packet retains the complete closed consumer run/store and
exact helper/config/source proofs. No public availability is claimed before release.

Fresh clean candidate8 repeats all42commands, independent summary, recursive packaging
and actual enclosing exit. Final all-seven readiness covers the complete final
candidate after evidence; fresh exact merged-master qualification remains separately
mandatory before immutable annotation, publication and child closeout.

The [shared-fixture correction checkpoint](../assets/ligand-designation/c3-minimization-baseline-checkpoint.json)
binds4,817,942-byte ZIP/SHA5184e34ad04d9f0598c5b2546cf806ed75c4c24e47876d93488c0b62fbcc6dc7,
301manifest entries/15recursively checked ZIPs, the complete249file consumer store,
27consumer output files and exact previous/current helper/config proofs. Current
1,005source digest isa320f57aa335f4d08587c7c3ea330d94ca7e6e51ce17c3b169cb77623efe1637;
only the helper differs from the prior1,005-source candidate. Other source and
actual931-source reader identities remain fixed. This passing focused checkpoint
is not a complete release gate or final readiness approval.


### Candidate8 inherited job-progress publication correction

Freshcandidate8 at0beff590 passes3,040Python/zero skips,1,304frontend/122suites,
14supervisor and every pre-browser phase; native stops after17passes/one failure/
584unexecuted cases, actual39005exit1. All1,005current/931preceding source identities
remain unchanged. No independent summary or complete packaging ran.

D-189 records an inherited JobsPanel refresh-starvation defect independently
reproduced with the actual component and installed QueryClient. Preserve the full
failed native/store/log/source record in the next append-only forensic extension.
Correct only progress refresh coalescing and meaningful regressions, retaining all
native job-duration/deadline/cancellation assertions. This is required recovery of
the existing workflow, not new job scope. Focused component/native checks, all affected
frontend gates, independent reassessment and a separately fresh complete gate remain
mandatory; neither the failed full gate nor a focused pass is final readiness.


The bounded progress correction also preserves acknowledged cancellation: an exact
held-response regression fails when an old running list overwrites terminal cancelled
state. Cancel success now retires that older list refresh for the returned job's own
project before publishing its acknowledged state in the same cache. Final focused
frontend verification passes8jobs tests/1,307web tests122suites/lint/types/build,
actual75792exit0 with all1,005selected sources fixed. Earlier test-only compiler/lint
fixture errors remain retained. The final unchanged native file passes both intended
profile cases with two unchanged historical cross-profile exclusions, actual8862exit0;
all durations, deadlines and canonical workflow assertions remain. A prior focused
run legitimately returns409 when its cancellation reaches the server after completion;
its raw trace/store remains separate and contributes no pooled passes.

D-174 retention now covers five failed runs/44parts,3,353,195,176asset bytes and
77,506files/7,155,100,911raw bytes. All44pass full tracked local verification,
actual63025exit0. IndexSHAd22bb6089dba8063d2283b75b8ad9c474a506df5901cef9e6c75e4a7c65ae06e;
verification4 ZIP436,310bytes/SHA c4521db1e5543fe25bbcacb58b3bb72b9e33b5d5518b76d43b98db2b184ad10d.
Earlier43assets/four run records/inventories/verification1–3 remain unchanged. Exact
historical source bodies and their installed-library license accompany the closed
independent proof. All owned stores remain; no public-availability claim yet.

Fresh clean candidate9 must repeat all42commands, independent summary, recursive
packaging and actual enclosing exit. New recovery implementation/evidence needs
updated scoped assessment and final same-candidate all-seven review before push.
Separately fresh exact merged-master qualification and public verification remain
mandatory before immutable annotation, release and child closeout.


Independent reassessment finds and reproduces an additional ACK-order edge: an older
legitimate running+cancellation_requested acknowledgement arrives after a newer
terminal GET and restores running. Three permanent negative controls reproduce
cancelled/completed/failed regressions. The correction retains terminal same-job
state observed before the targeted query barrier or afterward, while normal live
acknowledgements still publish. Final checks pass11job cases/1,310frontend122suites,
lint/types/build, actual97335exit0, plus the unchanged native lifecycle2passes/two
historical profile exclusions, actual75251exit0. All1,005selected sources stay fixed.
Independent architecture's three retained ACK/project controls pass50523exit0 and
its [scoped correction proof](../assets/ligand-designation/c3-jobs-progress-checkpoint.json)
records PASS. This remains separate from final all-seven readiness.

The final correction ZIP is8,057,278bytes,
SHAb13e284fa4d95bfcaf07a9de38a42827747b094c7f94a62a9f5a83c61a0fc1a7,
with120manifest payloads/two recursiveZIPs, every exact prior77payload retained,
all four native stores and original/verified reconstructed source versions. The
unpublished eight-test first draft remains private as prior-candidate evidence;
its ACK-order CHANGES_REQUIRED finding is not erased. Final1,005source digest is
25fd41ef26d6af357c2a463a24ccd2b5087db4d6f9f6b5b1e6152860d35ea20f;
actual preceding931source identities remain fixed. No raw C8forensic part is nested
into this correction packet. Freshcandidate9 still repeats all42commands, summary,
recursive packaging and actual enclosing readback before final readiness.


### Candidate9 mobile initial-focus oracle and complete forensic retention

Freshcandidate9 atf024e5e208988227181630f6c60331e81c3b2b0e passes all15pre-browser
phases:3,040Python/zero skips,1,310frontend/122suites,14supervisor, frozen installs,
migrations, static checks/build and602-case inventory. Native stops after438passes,
one failure,56encountered historical exclusions and107unexecuted cases, actual
86433exit1. The raw report counts163skipped including unexecuted cases; do not
mislabel all163 as historical exclusions. All1,005current/931actual preceding source
hashes remain fixed. Summary and complete packaging do not run; no gate pooling.

The mobile release-hardening test expects Selection to be the first focused control.
Independent UI/UX read the actual trace/accessibility snapshot and PNG: Entry is
active, Choose an entry retained, Selection still selected. The App opening/closing/
first-enabled-control policy is byte-identical across current, historicalC9, baseb038
and actualv0.35. New durable-ligand context deliberately precedes the task tabs.
No production focus change is justified. Update only the native expectation to the
exact enabled/focused/empty Entry selector and add real Tab→Selection. Retain explicit
Selection focus, ArrowRight→Inspect focus/aria-selected, Escape closure/launcher focus,
tooltip dismissal, all geometry and deadlines. Read-only audit finds no second native
initial-Selection-focus assumption; explicit focus/click/containment cases remain valid.

The [focused correction checkpoint](../assets/ligand-designation/c3-mobile-focus-checkpoint.json)
and [source/store evidence](../assets/ligand-designation/c3-mobile-focus-correction.zip)
retain actual91833exit0:5passes, one unchanged historical mobile-performance
exclusion, zero failures/flakes/retries. The full existing release-hardening file
runs across both profiles; no retry/deadline/workload changes. All1,005current and
931preceding sources remain fixed. Only release-hardening.spec.ts differs from
failedC9; six lines are inserted and no old assertion is removed. The entire
mobile-excluded desktop performance test body stays byte-identical. ZIP595,290bytes
has SHA2565250718373f4c7de8ea5dc217c09c9c024232c08114d62579502d311ce6a6124;
32payloads pass recursiveCRC/SHA and root source-map readback. Current1,005source
digest isf014f32d0671a3a229dae723a79d6935fec1231cb38d06bf03113dd6b50a630d.

C9's six new raw partitions retain21,607canonical files/975,663,537raw bytes,
including all1,005historicalGit blobs, old931source proof, complete native/store/
log/recipe/wrapper and closed diagnosis. The index now binds50assets totaling
3,826,531,869bytes, SHA256c5777a87ba18f088ac56f22f75b68862a2f7ed916a0870237c5b2fcf1a6ac063.
Prior44parts/five run records/inventories/verification1–4 remain byte-identical.
The tracked full50verifier passes actual58424exit0; raw readback73537exit0.
Authorized relocation preserves19,841native files/687,122,124bytes filewise at a
unique private retained path, actual50393exit0; all/tmp and other originals remain.
Verification5ZIP10,654,282bytes hasSHA25662c16705fff6971c21bc70aee631a2de471164ebc2d0ee34998808b2387cc54b;
its packaging89882 and finalreadback86315 both exit0. Neutral naming scans74nested
ZIPs/5,247text payloads without flags. These are local retention proofs, not public
availability. D-174 requires full anonymous verification of all50supplemental
assets before child closeout; never rebundle those raw parts into the mainZIP.

Freshcandidate10recipe is committed before execution. Its42commands exactly match
C9 after replacing only label/workspace/evidence paths; no policy/bounds/version/
exclusion changes. RecipeSHA2569f16294a9d9f01b4a21e186e184c3a5022213971cd2d11546fe8362356b620dc.
Require a fresh clean all42run, independent summary, recursive packaging and actual
enclosing0. Then prepare actual-master recipe before final metadata/all-seven
same-candidate readiness, normal protected delivery, fresh actualM42qualification
and immutable annotation/publication. Parent Goal remains active for all eight.


### D-195 correction — C10 explicitly interrupted, source-failure race

Independent actual component probe49521exited1 and demonstrates older held page-zero
success reviving12cached cards/formula after a newer page12integrity failure, without
a fresh check. The same hook is byte-identical in159/160;161newowner also reproduces.
Root explicitly interrupted C10 via its unique positively owned Playwright CLI.
Actual enclosing70976exit130, never a functional-test failure/timeout or passing
gate. All15pre-browser phases PASS (3040Python/1310web/14supervisor plus static/build/
migrations/inventory), browser293PASS/0unexpected/0flake; its309skipped count includes
unexecuted mobile cases and must not be described as historical exclusions. All1005
current and931preceding sources remain fixed. Summary/recursive packaging did not
execute. Complete raw outputs/store remain retained; owned ports8250/8251/5413are
unused and no owned process remains. Evidence under.issue-11-evidence/issue158-c10-
source-race-interruption includes actual interruption/cleanup and independent probe.

D-195 records the recovery contract before correction. Freeze and independently
review the smallest installed-query-proved fix, preserve all failed/interrupted
forensics, propagate exact policy to later children, then run a fresh complete
candidate gate. No implementation push, verified release or all-seven readiness
is established by C10 partial progress.


### D-195 locally qualified correction and fresh candidate11 preparation

The frozen correction changes exactly Controls, one typed inventory-qualification
module and five appended unit cases. All original75test bytes remain an exact
prefix. Author actual67403exit0 passes scoped lint/types/80cases; independent
architecture actual2037fresh acceptance,88204five regressions and six installed-
query controls pass. The unchanged defect-seeking diagnostic now times out waiting
for forbidden radios; retain it separately rather than calling it a product failure.

Combined web lint/types/1,315cases122files/build have complete childwait0 receipts
and1,006source equality. Original4521/48522tool handles were unavailable after
continuation; no original outer exit is fabricated. Primary fresh54bb7eexit0
independently reads the closed sources/artifacts. This is focused checkpoint proof,
not the required new42command candidate or exact-master qualification.

Forensics now contain52assets/3,914,486,005bytes across seven historical runs.
C10 is293PASS/9historical/1interrupted/299notrun, rootSIGINT130,0unexpected/flake.
Verification6 ZIP is11,874,678bytes SHAe4b5cb53fad6aa25ace2b4c67998cd49633e6ce34608411b79e10e6574549e57;
indexSHA259199793772e9a10f3ed148a976d64cf5eacbea61f660fe262b0787c95f9ff3.
Every earlier50part identity is unchanged, originals retained and local exact unions
verified. Stale50asset publication preparation cannot qualify the52asset endpoint.

Candidate11 and exact-master1 recipes preserve all42commands/arguments/bounds,
changing only owned labels/output paths from candidate10. Both require clean start.
Run candidate11 only after this passing checkpoint is committed; exact-master1 is
reserved for the actual later protected merge commit. Final all-seven assessments,
normal reviews/checks/protection, actualM42gate, immutable tag/release/full public
asset readback and issue closeout remain mandatory. No implementation push yet.


### C11 interrupted and D-197 pre-code retention correction

Candidate `c56e4c37b6d726a2c3a67d2a069e520065b043ed` begins clean and passes
15pre-browser phases:3,040Python/1,315web/14supervisor plus static/build/migrations
and602browser inventory. Root explicitly interrupts the positively owned browser
CLI for an independently confirmed owner-retention defect, actual4339exit130.
Browser231PASS/5historical exclusions/1interrupted/365unrun; zero unexpected or
flaky cases. No summary/package. All1,006current/931preceding source identities
remain fixed; owned services stop and8250/8251/5413are free. The complete raw run,
store, source snapshots and diagnosis remain required forensic evidence.

Independent installed-query controls, repeated by root actualceece7exit0, show
0queries/1,000retained source records after1,000fail/remove cycles and after
1,000fail/genuine-recovery/remove cycles. Unrecovered records retain1,000errors.
These are cardinality/string-byte observations, not heap/RSS measurements.
D-197 records the architecture-reviewed bounded conservative requalification
method before code. The original75tests and allfiveD-195controls remain intact;
add independent retention/eviction/token/unknown-source controls. Renew affected
assessments before a fresh complete candidate; no previous partial gate is pooled.


### D-197 passing source checkpoint and candidate12 preparation

[Bounded-owner evidence](../assets/ligand-designation/c3-owner-budget-checkpoint.json)
binds99focused/1,334web123suites/lint/types/build, actual16116exit0,350web/config
identities fixed and the original80tests as an exact88,835Bprefix. The525,877Bpacket
SHA`952286ec7399e5f2d9bb71101f47a45984d29d35a4513820a04338bb17d78cec`
passes primary independent63payload hashes/fourrecursiveZIP CRCs, observed tool
chunk1bff8eexit0. Complete selected source count1,007/digest
`9c2afea7bdab1ababceee5a1b04611c8df77004aa27c15a0bbf571f43ff2c274`
has exactly3existing+1newsource differences from the interrupted C11 map.

All seven specialists return complete-feature CODE PASS on this same source
candidate. Independent owner/presenter controls cover retained-memory budgets,
opaque token recreation, old/manual publications, failure during Retry, genuine
fresh recovery, source isolation, error classification and no automatic retry loop.
No original Error objects are retained in records. Original1,000-source controls
now retain128records/7,296keybytes in both recovery modes, not a heap/RSS claim.
Current/original/conflict recovery copy, scientific warnings and originals remain.

C11 is retained in53forensic parts/eightruns, with v7 local/full-union/CRC proof and
primary small-packet readback. Its231PASS/5historical/1interrupted/365unrun and
15passing pre-browser phases are never a full-gate claim. All earlier52parts and
seven run records remain exact. Future release requires all53public body proofs.

Fresh candidate12 retains every42recipe step; only label/output/store paths differ
from C11, SHA`968a4acd41b6937fb5203e2be8064dc69c1aff6c3f9c323c2a0f67833ff5346c`.
Prelaunch static inspection corrects the private wrapper's receipt binding to its
label, current wrapperSHA`bbf383cdb789f345a643b9349be9d64769171b381f7f6be1656c1e2515376b65`;
original draft/preparation are preserved, with no executed C12 failure or run claimed.
Commit the coherent local checkpoint, then execute cleanC12/all42/summary/package
and observe actual enclosing0. Final metadata/all-seven same-final-candidate
reconfirmation, protected merge, actual-master42qualification and verified release
remain mandatory. No implementation push or feature completion is established here.


### Source-producer correction before publication

Actual application proof confirms a D-166/D-195 violation after Use reports a
physical-source failure: cached composition/drawing and Use remain available.
The approved scope requires correction in earliest158before release. The isolated
owned fix/issue-158-source-producer-qualification branch starts at3d8d9e88 and
preserves the active original C12 tree unchanged. D-198 records the shared typed
four-producer boundary before code. Keep original negative controls and the entire
C12 run; no partial or superseded pass authorizes publication. Integrate a verified
correction into the original feature branch, obtain all-seven final assessments
and run a fresh complete candidate gate. No new delivery issue/release is created.


### Verified D-198 source-producer checkpoint (pre-full-gate)

The isolated correction fixes the original actual-App failures. All seven complete
feature CODE assessments PASS on1,013frozen sources (six existing runtime changes,
six new tests), compact digest203238cad1841395df87599d94c45aab79331513ce3f810272618c19efe92617.
Author69backend/180focused/1,388web/static/build evidence explicitly distinguishes
five unchanged Python/static scopes reused after a new-test typing correction from
the fresh frontend checks; no identical old/new global-map claim is made.
Independent54backend+5App/architecture56/performance180/UI30/UX59controls and theory/
reference assessments support the checkpoint. Four actual new native cases pass,
root14249exit0/26.1seconds, allsourcefixed/zeroownedcleanup/rawDBcopiesbeforeSQL.
The new collection totals606 and preserves all602oldcase identities/exclusions.

Original C12 is now CLOSED:all42commands, summary, recursive packaging and actual
root31447exit0, with independent full packet/log/source readback22136exit0. Counts
3,040Python/1,334web/14supervisor/527native+75existing exclusions are automated scope
evidence for the superseded source, not approval of its independently proven defect.
Retain both complete qualified parts and explicit supersession evidence as mandatory
supplemental release inputs; do not classify this as another interrupted/failed run
or modify the existing53-part/eight-run forensic index. The focused correction is
recorded in c3-source-producer-checkpoint.json/correction ZIP before integration.

Next:integrate this passing checkpoint into the owned original feature branch,
prepare a clean fresh C13 recipe preserving every42step and all606native cases,
obtain final same-commit seven-role reconfirmation and qualify the actual merged
master before protected publication. No push/PR/release readiness is declared.


### C13 full corrected-candidate qualification — 2026-11-18

Clean candidate `4965727c894020052eaa25d0c9ade6a0f308dd16` completes every42recipe
step, independent summary, recursive packaging and primary directly observed actual
session60716exit0 (tool chunk e5b39b). [Summary](../assets/ligand-designation/c4-candidate13-summary.json),
[gate](../assets/ligand-designation/c4-candidate13-gate.json),
[reader audit](../assets/ligand-designation/c4-candidate13-reader-audit.json) and
[packaging](../assets/ligand-designation/c4-candidate13-packaging.json) record the
complete run. Earlier pending statements above are historical checkpoints.

Passes:3,077Python/zero skips,1,388web/126suites,14supervisor and531native;606case
inventory includes exactly75unchanged historical exclusions, with zero failures,
flakes, retries or new exclusions. All1,013current and931actualv0.35source identities
remain fixed. Release-tool digest `df28dc009112f7a7608a5dca22f42e4febdd53dc2b294b434b612529036b4f07`
and compact digest `203238cad1841395df87599d94c45aab79331513ce3f810272618c19efe92617`
bind the same current source map. Actual old readers safely refuse current stores;
old-authored stores migrate forward/current reopen for both archive suffixes. Current
canonical unapplied proposals remain intact. The7,106.931second sum is portable
correctness evidence, not strict reference-host qualification.

Qualified01 is83,328,878bytes/SHA`b7a1951c8ad5e23fe64e370b0a377bc775dc6ea9b62558df04ca1c992f622cf4`;
qualified02 is8,194,845bytes/SHA`03cba9c4051d1f7817d287d53b219bd823641faa20f960674d2ef840434ea2f4`.
They retain674native files and664reader workspace files with no cache exclusions;
recursive packaging records481/174ZIPs,1,309/397manifest entries and924/527project
archive files. Preserve originals and validate complete raw-native coverage before
relocating untracked raw evidence into private storage.

All seven complete-feature CODE assessments already pass on this implementation;
final same-commit metadata reconfirmation remains mandatory before push. Successful
superseded C12 remains a complete required supplement, not a ninth failed run.
Existing53forensic assets/eightfailed-or-interrupted records remain exact. Protected
merge, fresh actual-master42/summary/package/enclosing0, annotatedv0.36release,
complete anonymous main/sidecar/53forensic verification, explicit closeout and safe
owned cleanup remain required. Parent #11 and its single Goal stay active.


### C4–C6 — same-candidate approval, normal merge and verified publication

All seven final specialist agent assessments PASS c82004ce against b038e4e6.
Architecture independently passes 98focused cases; scientific implementation266;
theory checks analytical formula/mass/charge and representation oracles. UI/UX and
reference assessments inspect their actual evidence. No consequential finding
remains. These are agent assessments, not human approval. The @codex request exists;
no completed remote assessment was available. Fresh remote protection/review/check/
conversation reconciliation finds no unmet mandatory requirement; no bypass occurs.

[PR 175](https://github.com/ManuelSe/Neistra/pull/175) merges normally to
`247ab651b35c2d58e8939985ae50633de70311a3`, complete tree identical to reviewed head.
That exact runtime independently completes every 42 fresh command, summary, recursive
packaging and primary-observed enclosing15284exit0/chunkcbfd9b.
[Summary](../assets/ligand-designation/c5-master1-summary.json),
[reader audit](../assets/ligand-designation/c5-master1-reader-audit.json),
[wrapper](../assets/ligand-designation/c5-master1-wrapper.json) and
[enclosing proof](../assets/ligand-designation/c5-master1-actual-enclosing.json)
record 3077 Python/zero skips,1388 frontend/126 suites,14 supervisor,531 native/75exact old
exclusions/606inventory, no failure/flake/retry/new exclusion. All 1013 current and
931actual0.35 sources remain fixed. Actual old-code safe refusal, old-authored forward
migration/current reopen/both suffixes and canonical unapplied proposals qualify.

The master qualified packets retain674 native and664 reader files with no cache
omissions. All raw native originals are verified before lossless private relocation.
Main 531749736 bytes/SHA
`84f3954425d1cabbf75346f1ded4c7b5a6b011e63011145addd04ae2e9410c16`
contains all 42 candidate/master logs, source/reader proofs, seven individual final
assessments, merge receipts and every mandatory80 source-correction/C12 supplemental
member, including 75C12 regular files. Independent local readback verifies exact 212
outer members,3442ZIPs/9760 manifest entries/7431project files. C12is successful
superseded qualification, not a ninth failed run. No raw53 forensic part is rebundled.

Stable/latest [v0.36.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.36.0),
release 449776471, targets only this runtime through annotated tag05ec6685. All 56
initial assets match server identities and complete anonymous bodies/hashes/recursive
CRC/exact unions: primary, two sidecars,53 forensic ZIPs/eightfailed-or-interrupted
runs. Both reader children and root enclosing6748exit0/chunk47a5b3 complete. Those
failed runs remain unqualified. The draft release was resolved by verified ID after
the tag endpoint returned404; the original publisher stays exact, and the narrow
ID adapter independently passes 44offline architecture controls before upload. No
release duplication, tag retarget, clobber or settings override occurs.

[Publication evidence](../assets/ligand-designation/c6-publication.json) is the exact
79491-byte release receipt/SHA
`8217564e20a8840d6efb9b200dade61776850aed0ba2862e423e674e5afc8a1c`,
asset 762983464. Its own full-anonymous/server readback and final notes are
[recorded separately](../assets/ligand-designation/c6-publication-verification.json).
The [canonical reply](https://github.com/ManuelSe/Neistra/issues/158#issuecomment-6976173710)
is remotely verified and158explicitly closed completed. Parent 11remains open with
its158checkbox reconciled. All five versions remain0.36.0; migration 0016/project/
archive3/viewer 2 and conservative chemistry/performance limits are explicit.

This terminal documentation integration records the current schema 3 contract while
retaining historical schema 2 documentation. It changes no1013 qualified source body.
Normal all-seven documentation assessment/remote review/merge, owned branch cleanup
and the final delivery-receipt readback remain. Reconcile their actual results into
the same canonical reply without moving the runtime tag or another release. The
one parent Goal continues through 159–163 and verified integrated parent closeout.
