# Issue #82 final full-diff local review

Implementer self-review, not independent approval. Reviewed the approved contract
and origin/master b1fad2c77517cbdc24a87877507539d5abe584fa through final-version
candidate b0b061d53e6c2a6c680b9ca1891e00bcc23f3b51. Review includes core/API/native
lifecycle, typed frontend/session/preview, tests/fixture provenance, documentation,
all five versions and checkpoint history. Earlier consequential findings and fixes
are recorded in c1-review.md through c5-review.md. No unresolved consequential
finding remains at this review; final gate evidence is recorded separately.

Reviewed invariants:

- One pinned ff14SB/GAFF1.81/AM1-BCC/optional-TIP3P model uses captured coordinates.
  Existing complete topology/explicit H/identity/states are prerequisites. No H,
  protonation, connectivity or preparation repair occurs in minimization. Separate
  preparation records generated identity only; native tools cannot silently alter
  accepted atom/bond mappings. Temporary Amber labels do not execute user text.
- Complete molecules/chains, dynamic native neighbors, boundary bonded terms and
  exclusions/scaled1-4 remain in the objective. Reduced optimization exposes only
  selected rows; independent finite/convergence/stereo checks govern Apply.
  Context effects/force differences/state coverage are tested without trajectory
  equality or broad physical-accuracy claims. Unsupported chemistry refuses.
- Charge-group/local-valence/aromatic and all qualified force-parameter checks
  retain canonical facts. Documented bounded net-charge rounding is retained in
  diagnostics. Native carboxylate mapping is conservatively unqualified. Neutral
  CCD biotin is an explicit benchmark assumption, not physiological qualification.
- Whole-process-group cancellation/deadlines/parent-loss cleanup, fixed native
  thread pools, work/result limits and no runtime installation bound native work.
  Actual SQM cancellation and independent final model checks have retained evidence.
- Server-owned canonical closure, input artifacts/hashes and active conformers
  cannot be bypassed through generic jobs. Apply acquires the SQLite writer lock
  before dependency reads and validates selected plus fixed sources, digest,
  convergence, mapping, locks and retries before any molecular publication.
- One topology-preserving batch of existing entry.molecule actions gives exact
  multi-entry Undo/Redo. Originals, IDs, metadata, unselected/H and inactive frames
  stay exact. Durable job application markers prevent retry even after Undo.
  Failures/nonconvergence/no-op do not publish molecular changes.
- App-owned transient sessions/generations and immutable artifact queries prevent
  retargeting or delayed preview resurrection. Viewer geometry stays disposable
  and nonpickable; numerical/minimization preview handoff is tested in the actual
  App. Project mutations invalidate preview/applicability. Archives retain immutable
  proposals historically; display/session state and fresh imported Apply do not
  travel. Clarified this distinction in user/release guidance during final review.
- The adjacent lightning icon opens setup. Subsequent user guidance adds Ctrl+M
  immediate isolated500 calculation with typing/modal/repeat/loading ownership
  guards. It retains explicit Apply under the approved contract. Native browser
  tests cover shortcut, context, report, cancellation, exact Undo/Redo and controls
  at320px, both themes and actual100-200% zoom. No implicit visibility context.
- Prepared1STP keeps all901 observed heavy rows and discloses generated-only stereo
  correction before H addition. Full159-residue chains and eight translated copies
  qualify operational capacity, not a biological oligomer. Native trusted-event
  timing retains500/750ms bounds; automation transfer is separately reported.
  Existing movement assertions remain unchanged. Raw1STP and historical decisions
  are retained; model-derived state fixtures are not independent physical truth.
- Final0.20 producer/actual tagged0.19 separate-process reader checks real module
  paths/version, exact canonical/all-conformer/original data, generic history,
  jobs/models/reports, archive save/import/re-export and artifactHTTP200/size/hash.
  Older authoring need not implement minimization. No migration/schema/dependency
  change; existing downgrade guards and complete managed-data backup still apply.
- Five versions consistently advance to stable0.20.0. A minor reflects new public
  functionality with retained compatibility; existing v0.19 tag history establishes
  the baseline. No label-based/no-history assumption determines the increment.
  The initial candidate found a stale explicit archive version test assertion;
  fixed it and added0.18/0.19 retention labels before repeating the whole gate.
- Deferred covalent adduct/cross-entry topology work is focused follow-up#86.
  Complete chains replace cropped shells, active conformers replace batch pairing,
  nonconverged Apply remains excluded, and automatic repair/universal-framework
  suggestions remain rejected. No deferred requirement is silently reintroduced.
  Global PRODUCT_SPEC/PLAN and accepted decision history remain unchanged.
- Meaningful Conventional Commit checkpoints remain on the planned feature branch.
  Normal merge preserves history. Current remote requirements are audited before
  merge; no force push/admin override/protection bypass is used. A review request
  is not independent approval unless an actual review returns. Exact merged-master
  qualification is mandatory before an annotated runtime tag and stable release.

Full C6 native matrix consequential finding: the added minimization sibling shrank
the existing movement control group at320px, covering its last button. The existing
mobile center-hit test caught this; wrap the shared action row, preserve44px targets
and retain direct Edit/Minimize adjacency when the idle controls fit. No assertion
or budget is weakened. The failing gate remains diagnostic; focused native touch
and minimization checks and a fresh complete gate must qualify the correction.

Final candidate qualification: all 18 commands pass on clean-start candidate
b0b061d53e6c2a6c680b9ca1891e00bcc23f3b51, runtime/test/tool source SHA256
`7ae47c013ec8e8d9668dd0a69693db17ec7a1e476c164d18905a48e60f597e34` unchanged. **1,038 Python, 265 frontend,
8 supervisor, 264 browser passes / 50 intentional layout skips**, zero failures
or retries and no native scientific skips. Frozen installs, fresh0014, Ruff,
mypy87, lint/types/build/diff, five versions, verified native tooling and final0.20
producer/actual tagged0.19 reader pass. Exact commands/environment/timings, source
and lossless raw/compressed log hashes are in c6-candidate-gate.json.

Only documentation/evidence is added after this gate; generated evidence is expected
in the candidate working tree. The exact merged-master gate must start and finish
clean with evidence outside the repository. No PR/merge/tag/release or independent
review is claimed by this candidate record. Existing Alembic/lazy-bundle advisories
remain. Remote requirements and actionable review findings remain merge gates.

## Merge/publication audit

PR87 normal merge fe4e31e0ec8f4ece32132882a0a526c0576ea560 preserves checkpoints.
All18 exact-master gates pass clean start/end, with source equal to candidate and
1,038 Python/265 frontend/8 supervisor/264 browser passes/50 intentional skips.
An interrupted first native orphan-H pick miss was not reproduced in10 unchanged
focused runs or the complete final gate. Cause is unproven; retain original trace/
screenshot and distinguish diagnostics from final passing evidence. No product/test
change, weakened assertion or hidden retry was used. Full native performance,
actual preceding reader and all five versions pass. No independent review returned;
no required protection/check/review/conversation bypass. Publication/issue reply
are remotely verified. Final evidence integration is docs only with source equality
and focused integrity/link/diff checks; runtime tag remains fixed. Actual delayed
cleanup is audited in the linked issue reply after docs integration.
