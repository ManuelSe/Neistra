# Neistra Progress

## Current milestone

Parent #11 remains active for required #156–#163 through verified releases and
parent closeout. #156/#157 are delivered. #158 merged through PR175; its exact
247ab651 qualification and independent primary-packet verification pass. Its
annotated v0.36.0 tag and stable/latest release449776471 are verified with56server-
hash-matching assets; full anonymous verification and closeout remain pending.
Delivery remains serial.
#159 has a passing worker-recovery correction and local integration of the
published qualified predecessor runtime; final delivery qualification is pending. #160/#161 are local
preparation; #162 has a technical plan checkpoint; #163 remains planned.

## Completed work

#159 implements fourteen versioned descriptors, configurable categories and bounded
execution/cache/consumer ownership. D-194 retains frozen benchmark inputs; D-196
captures startup ownership; D-198 preserves physical-source provenance.
The two early architecture findings are corrected: private cache I/O cannot stop
ordinary startup recovery, and exact never-started refusals terminalize/reap with
writer-locked association and process-metadata checks.

## Verification performed

The original worker reproduces all three intended negative assertions with zero
setup errors. The corrected worker passes33 new cases and171 affected regressions,
with zero skips/errors. Global Ruff, owned formatting, mypy274 and diff checks pass.
An extra whole-repository format probe failed on105 byte-identical baseline files;
that attempt remains retained and distinct from the passing scoped continuation.
Architecture independently closes both P2 findings. The
[checkpoint](assets/ligand-properties/c2-prelaunch-recovery-checkpoint.json) and
[lossless packet](assets/ligand-properties/c2-prelaunch-recovery-evidence.zip)
preserve all799 owned regular files,106 inert aliases and all attempts/stores.
Primary readback verifies the exact807-member manifest union and all1,123 then-current
source bodies. Original startup tests, D-194 fixtures and earlier packets stay exact.

Local integration of published runtime247ab651 preserves App/property/backend bytes,
adds the qualified JobsPanel correction and retains predecessor native assertions.
All1,125 integrated sources remain exact through1,565 frontend tests/133suites,
64 forensic-verifier tests, lint/types/build, Ruff and diff checks. This local
checkpoint does not complete #158 public readback or #159 final gates.

## Known limitations

This is a local correction checkpoint, not full-feature readiness or final all-seven
approval. Old1,122-source ALL8prep7 remains historical/HOLD and stale after the fix.
The old desktop probe cold median2,057.95ms/p952,242.60ms exceeds the unchanged
2,000ms target; seven other cases/four1,000-entry cohorts remain unexecuted.
Portable correctness and prepared runners do not establish strict-host performance.

## Blockers

No external blocker. Actual released-prerequisite integration, refreshed workload
source guards, performance qualification and all final delivery gates remain required.
Preserve original stores and failed/superseded evidence. No #159 push or release.

## Next action

Finish #158 public readback/closeout and terminal documentation integration. The
shared correction also passes33+171 tests and mypy280 in160/161. Refresh guards,
update final versions and qualify required workloads/full gates/all-seven reviews.
Keep the one Goal active through #163 and verified parent closeout.
