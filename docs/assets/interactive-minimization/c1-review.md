# Issue89 C1 local review

Implementer self-review, not independent approval. Reviewed the full checkpoint diff
against approved M1/C1: domain exception boundaries, native worker supervision,
atom-generation/element-edit producers, tests and compatibility documentation.

Consequential findings addressed before the final gate:

- CalculationError inherits ValueError; move domain refusal outside the metadata
  parser catch, retaining original parser exceptions and atom/entry/residue context.
- Selection and legacy ligand generation omitted identity evidence; record authored
  facts. Direct element edits retained stale ordinary element evidence; share a
  bounded replacement helper that never upgrades protected/unknown facts to ordinary.
- Avoid unrelated formatter changes in legacy ligand code.
- Resident accounting includes native grandchildren; real memory-budget termination
  verifies the entire owned group stops. Other plugins retain RLIMIT_AS semantics.

No new migrations/structural schemas/actions/dependencies/physical model. No implicit
chemistry repair or unsupported-isotope permission. Diagnostic logs retain actual
exceptions. Default4GiB RSS is sampled supervision, not hard OS/cgroup enforcement.
Unknown legacy identity still refuses; original uploads/prior artifacts are retained.
No further consequential finding remains in this checkpoint. Later approved
automatic-context/cache/live/acceptance/release scope remains unimplemented here.
