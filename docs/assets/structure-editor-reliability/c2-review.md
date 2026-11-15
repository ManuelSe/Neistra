# C2 primary complete-diff review

Reviewed the complete six-file scientific implementation, including all four new
test modules, against C1 `10e7eef2`; integrated bytes exactly match the independently
qualified isolated source. This is primary implementer self-review, not the final
seven-role assessment or human approval.

Retained bonds, IDs, orders/aromaticity, coordinates and authored exclusions survive
template mutation. Missing source-required retained edges remain missing and have
specific residue/chain/atom diagnostics. Existing N/CA/C/O element contradictions
refuse before expensive template work. Raw unknown charge/order and historical
missing-O addition retain their previous behavior; mutation remains single-frame.

Theory independently identifies the four retained-CD source→PRO cases. The narrow
N–CD exception adds new target chemistry with inferred provenance while respecting
exclusions and original identities/coordinates. Explicit open-ring, measured
unoptimized-closure and inverse retained-topology-conflict warnings avoid a false
standard/prepared-state claim. Tests cover ordinary/excluded/existing connections,
all four sources, history, originals, reload and archives.

Affected bond diagnostics inspect every retained conformer with stable IDs and
unchanged strict thresholds. The 100-detail cap discloses complete counts and
truncation without skipping late frames. Review reproduces two numerical error
boundaries: finite endpoints can yield an infinite derived length, and inactive
nonfinite placement/H context can escape through a library error. Finite-only
prevalidation and precise typed refusal correct both; finite warned drafts remain.

The overlap validator preserves active-frame all-pair strict <0.4 Å semantics and
warning multiplicity. Storage is bounded by an exact tree plus one-row/32-row query
batches with early exit and both-index/self handling. Review also reproduces scalar
versus explicit-axis floating-point reduction drift in both threshold directions.
An explicit-axis float64 norm and actual predecessor dense-expression oracle fix
that drift; four concrete negative controls fail before correction.

Parent verifies all 40 profiling output hashes, 66 current source identities,
baseline identities against both qualified 0.31.0 snapshots, 19 workloads/57 actual
validator calls, 24 old-expression oracles, numerical rejection and active-frame
checks. Timings remain observational; native/fixture RSS is not an incremental or
universal-capacity claim. The independent performance specialist's PASS is limited
to this validator correction; C3 execution/serviceability remains separate.

Integrated validation passes 223 Python cases, complete default mypy/204 sources,
Ruff, and all 42 focused native cases: 40 pass/two exact existing exclusions,
zero failures/flakes/retries/new exclusions. All 713 scoped source identities and
lossless hashes remain unchanged; the only code delta from C1 is the six inspected
files. Frontend test/build/lint/type evidence is reused on byte-identical frontend
sources. Original uploads, portable schemas, dependencies, migrations and versions
remain unchanged. No unresolved consequential C2 finding remains from this review.

C3–C7, integrated final-version readers, complete candidate/exact-master release
gates and all seven final same-candidate specialist assessments remain pending.
