# Issue #82 C1 local diff review

Status: local implementer self-review, not independent review. C1 only; later
checkpoints and final release qualification remain required.

Runtime/test/tool source digest: `952a45dcfafa2a391457af5b43eb57d7904ce7d986a17c1a5d7f9ce4b2a3d5e2`. The final
checkpoint gate records every source file hash, exact command, environment,
elapsed time and gzip-preserved raw log hash. Source was unchanged through all
12 commands. Earlier pre-review passing diagnostics are separately labelled.

Reviewed the complete added core/plugin/toolchain/test surface and existing worker
diff, plus documentation and the explicit 137-package lock. No UI, application
version, normalized/project/archive schema, migration or unrelated runtime change
is part of C1. Plugin registration remains operator opt-in at this checkpoint.

Consequential finding addressed: canonical double-bond E/Z intent was not checked
by the legacy normalized-to-RDKit helper. Explicit comparison against geometry now
rejects conflicts; positive and negative tetrahedral/E/Z tests pass. Unsupported
stereo encodings refuse. Atom convenience rows must agree with the active conformer.

Other reviewed scientific boundaries:

- Fixed coordinates are absent from the optimizer variable vector, not merely
  restrained or reset after optimization. Real subset/H-only native cases and
  immutable snapshot assertions pass.
- Native chemistry/identity mappings and bounded charge-rounding normalization
  are explicit. No unknown order/charge defaults reach parameterization. Raw and
  corrected charges are retained; unqualified resonance representations refuse.
- Native fingerprints include wrapped executables and data, not just launchers.
  Report/model artifacts are nonimportable scientific proposals; no canonical
  mutation or misleading convergence occurs on completion, failure or cancellation.
- Real descendant tests cover cooperative/forced cancellation, deadline and
  coordinator/child loss. Existing generic job lifecycle and event ordering pass.
- No speculative engine framework, docking logic, automatic preparation or
  original-file replacement was introduced. Protein context, Apply, archive
  application semantics and UI remain their planned later checkpoints.

Final validation: 862 Python tests including 46 focused cases, 255 frontend tests,
8 supervisor tests, Ruff/mypy/lint/types/build and isolated 0014 upgrade. Native
existing demonstration workflow: 2 passes / 2 intentional layout skips; no failures
or retries. Native minimization scientific cases were configured and did not skip.
The existing 398 Alembic deprecation warnings and lazy Mol* bundle advisory remain.
No consequential unresolved C1 finding; no claim of whole-issue completion,
independent scientific review or release qualification.
