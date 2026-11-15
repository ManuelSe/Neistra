# C4a primary torsion and API review

Reviewed the complete seven-file torsion/API change over C3 `34e1f3f9`, including
the independent analytical fixtures and spawned-API cases. This is primary
implementer self-review, not final whole-feature approval. The full thirteen-path
scientific candidate also includes the separately staged five-fragment work.

The shared ligand method qualifies the existing graph-cut side and each conformer's
own finite, nondegenerate axis. Both axis endpoints, fixed material and disconnected
spectators remain exact. Fixed-to-selected-side orientation preserves the legacy
angle sign. The compact action uses canonical endpoint identities, retains existing
ligand/topology/sanitization admission and bypasses H, stereo and original-protection
rewrites. Preview counts describe the entire qualified graph operand, including
hidden H, independently of how many rows actually move. Qualified zero/full/exact
unchanged outcomes do not publish artifacts, history or allocation changes.

Initial 100-case qualification passes but independent scientific review reproduces
three consequential gaps: the early return skips configured atom-limit admission
and inactive-frame diagnostics, and unreduced large-degree conversion loses
periodicity. The initial evidence is retained as preliminary, not final approval.

The corrections refuse oversized rotation before qualification while leaving
deletion/downsize semantics intact; reduce degrees before radians with unchanged
requested-angle metadata/sign; and reuse finite/bounded diagnostics on both axes
and all rotating atoms. No-op diagnostics remain response-only. Genuine changes
retain deduplicated warnings. Independent integer-ratio periodicity expectations
cover the actual float values, both graph sides, three frames, inverse rotations
and spawned API transport. Geometry cases include inactive outliers, 111-frame
detail truncation and a distal moving bond beyond either axis endpoint.

All 27 new negative controls fail before correction: 17 core and ten spawned API.
The corrected primary subset passes 147 tests plus one additional distal-bond
case; the latter is the only intervening test-only addition. The full corrected
scientific/API candidate passes 585 cases, Ruff/default mypy218 and retains all
737 scoped source identities. These counts overlap and are not additive.

Scientific theory and a fresh scientific-implementation reviewer independently
reassess the complete corrected thirteen-path candidate, all three findings,
intervening four-path correction and evidence, returning scoped PASS. The fresh
implementation reviewer separately executes 465 overlapping cases. No consequential
scientific finding remains in this scope; full candidate hashes and logs are kept.

The native compact rotation control is C5 work. This checkpoint supplies a working
scientific/API slice, not a claim that an unintegrated control works. Five-fragment
primary integration, actual UI/native workflows, preceding-reader compatibility,
complete candidate/exact-master gates and all seven final same-candidate reviews
remain required. No application push or release readiness is asserted.
