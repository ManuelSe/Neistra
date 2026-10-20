# C5 implementer self-review

Reviewed complete backend, client ownership, native renderer, tests and documentation
changes against the approved M4 contract. This is local self-review, not independent
approval. No unresolved consequential checkpoint finding remains.

- Accepted SciPy iterates produce actual selected-row native transforms; canonical
  structures, molecular query data, original uploads and inactive conformers remain
  independent. No ghost minimization molecule or manufactured animation remains.
- Render-local job/report/frame subscriptions avoid high-rate App rerenders. Exact
  immutable sources and generation/job/capture guards reject stale work. Late submit
  responses request cancellation. Cancel clears presentation before network settlement;
  panel close/tool/project switch request cancellation, reload/Jobs never resume live.
- Duplicate/older packets do not rebuild geometry. One active renderer batch retains
  only its latest pending packet, with epoch checks between awaited entries. GPU
  readiness yields before consuming the latest automatic packet; cancellation,
  commits and disposal take precedence and release bounded fences. Manual final
  controls/restoration retain their immediate path. This uses public pinned Mol*
  fence APIs, not a dependency patch or a change to persisted representations.
- Warned acceptance requires new schema2 producer evidence: ordinary iteration-limit
  termination, finite energy/full forces, significant objective improvement, exact
  mapping/fixed rows/stereo and no newly introduced severe nonbonded overlap. A
  digest-bound explicit acknowledgement is mandatory. Abnormal/evaluation-limit,
  failed/cancelled/resource/timeout and historical nonconverged results never qualify.
  Converged acceptance retains its independent maximum-component gradient threshold.
- Legacy request default remains strict. Version1 and already persisted C2 schema2
  serialization remain exact. Existing single atomic publication and Undo/Redo remain.
  Application provenance records outcome/policy/acknowledgement. No structural schema,
  migration, dependency, application-version or physical-model change.

Performance investigation retained earlier failed attempts as diagnostics, not final
qualification. Initial901-heavy counts were estimates; actual whole-heavy fixture
selection is1166 of2272 atoms. Full-coordinate automation readback distorted timing;
bounded status and exact in-browser fixed-row checks correct it without weakening
geometry assertions. Mol* automatic quality overrode intended cue detail, corrected
with custom quality. Remaining dynamic-buffer stalls required GPU readiness and
proper latest-packet backpressure. No timing thresholds were raised. #100 records
the investigation and is addressed on this branch, pending merge/publication.

Final c5-gate.json is passing:260 Python,273 frontend,8 supervisor,25 native browser /
7 intentional mobile exclusions; lint/types/build/fresh0014/diff pass. Python code
hashes are unchanged from the passing260-case attempt2, explicitly recorded as reused
while frontend-only findings were fixed; final web/native checks were repeated on
unchanged final source. Lossless logs, source identities, actual initial/repeat live
measurements and prepared1STP/18k timing data are retained. API/worker use the locked
AmberTools prefix and bounded native threads. Existing Vite disconnect reset/EPIPE
and bundle advisories do not fail workflow assertions.

Initial/repeat UI timings include worker startup/capture/delivery and automation;
publication-to-native-update/next-animation-frame uses browser-local observation.
The first partial-protein case starts in a fresh managed browser cache; whole-protein
case may reuse its receptor component. These are separate from C3's three paired
compatible-input native-call/preparation measurements, not a universal twofold
end-to-end speed claim or unsafe changed-ligand-geometry reuse.

Remaining required C6 work: strict verified-original legacy identity recovery audit,
scientific fixed-only/OpenFF feasibility evidence, actual v0.20 reader with current
producer, all release/version gates and full-diff review, PR/merge/tag/release/issue
close-out and clean master. No external blocker or unapproved force-field change.
