# Issue #91 M2 checkpoint review

Status: complete local implementer review of the corrected checkpoint.
[Final gate](c2-final-corrected-gate.json) passes29 focused/305 frontend tests,
lint/types/build/diff and58 native browser cases /4 intentional exclusions,
zero failures/flakes/retries, unchanged runtime/test/patch/lock hashes.
This is self-review, not independent review or final release qualification.

- Shared exact target mapping, one native hover owner, provider disposal and
  pointer/mode/scene/navigation/coordinate/movement cleanup are coherent. Hover
  publishes no selection events, stores or requests. Molecular state stays outside
  Mol*. Managed surfaces are excluded from ordinary highlight/removal; selection
  bits survive root-independent hover clearing.
- Fixed consequential projection-jitter invalidation and old-root retained-marker
  findings; exact native lifecycle/marker tests pass.
- Controlled original80ms surface comparison found an empty click regression
  after native hover removal:13/13 exact-tag renderer passes versus2/3 candidate.
  A readiness-only test accommodation was rejected. D-125's pinned Mol*5.11.0
  patch finishes pending/failed native GPU reads for synchronous clicks, retaining
  resolved reuse and dirty render/read. ESM unit tests, CommonJS negative control
  and10/10 original native surface repeats pass. No dependency upgrade, target
  guess, click replay, extra delay or public API is introduced. Both compiled
  module paths are patched; frozen install validates the hash.
- Surface harness now compares actual camera snapshots and retains pick diagnostics;
  appearance tests wait for initial post-reload workers before counting subsequent
  work. Exact geometry/selection/camera/no-extra-worker assertions remain.
- Native tests cover both themes, exact visible atom/residue/component/chain/
  structure sets, hidden canonical membership, partial selection restoration,
  modifier entity semantics, anchor/original/project/camera invariance, queued
  old-generation refusal and narrow remount with single-provider cleanup. Atom
  screenshots distinguish pink hover/green selection; final overview is after exit.
- Production build excludes test harnesses. No chemistry inference, backend/API,
  durable schema, migration, molecular/original-file change or product scope
  expansion. Existing lazy Mol* bundle advisory remains. D-125 package correction
  is an explicit feature-plan amendment; upstream patch maintenance is follow-up.
- Earlier failed/preliminary gates remain diagnostics, superseded by the corrected
  final gate. Hover timings include automation/polling; no native latency or
  throughput claim. Final-version actual-reader, complete candidate/exact-master
  science/performance/accessibility gates and publication remain required.
- No remaining consequential checkpoint finding.
