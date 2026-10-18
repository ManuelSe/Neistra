# Issue #82 C2 checkpoint review

Status: implementer local self-review, not independent approval. C2 only; complete
issue/release qualification remains required. Runtime/test/tool source SHA256:
`fe024482b68ecf03e54cefc9fe7993ee7ea8a2418dedaf2de1f69b727e2ea440`. All12 checkpoint commands ran on unchanged
source; exact file/command/environment/timing/log hashes are in `c2-gate.json`.

Reviewed the complete tracked/untracked C2 diff, new typed assembly/template/model/
stereo modules, reduced-variable solver refactor, safe model archive expansion,
additive preparation identity facts, native fingerprints, fixtures and tests.
No database/schema/application dependency/version or original-file change.

Consequential findings repaired before the gate:

- Validate raw AMBER names before OpenMM's deliberate terminal-H alias conversion;
  test equivalent same-entry/separate-entry identity mappings.
- Do not accept the old synthetic editing fixture's mirrored SER as a qualified
  positive example. Retain its original bytes; separately document a complete,
  explicit L-state derivative with frozen separately prepared H/topology.
- Reject supplied charge/order/stereo conflicts and duplicate canonical bonds;
  template assignment does not authorize overwriting known chemistry.
- Preserve actual captured optimizer-start coordinates independently of native
  parameter-generation geometry in the retained model ZIP.
- Extend isolated protein/water handling to complete supported single components
  with NoCutoff; avoid routing a supported protein through organic GAFF defaults.

Reviewed guarantees: canonical closure/full chosen chains, no implicit visibility
membership or caps, exact entry-local/native mapping, no generated canonical bonds
or protonation, shared240second parameter deadline, approved finite-range model,
native dynamic neighbors, boundary bonded terms/exclusions/scaled1–4, CPU one-thread
provenance, finite gradient check and exact fixed mask. Spatial reporting avoids a
materialized dense pair set. AMBER TIP3P auxiliary H-H distance is explicitly an
engine internal term, absent from canonical covalent topology; no constraints.

Evidence: 886 Python including70 focused cases;255 frontend;8 supervisor;
4 native passes /4 intentional desktop/mobile layout skips; no failures/retries.
Ruff/mypy84, lint/types/build, isolated0014 upgrade and diff check pass. Native
scientific cases did not skip. Existing398 Alembic warnings/bundle advisory persist.

Known limits: small synthetic qualification is not the prepared1STP/large-assembly
performance gate or exhaustive chemical coverage. Strict organic resonance mapping
can refuse otherwise plausible molecules. Crosslinks/adducts and unsupported
terminal/template states refuse. Active Apply/history/archive behavior and UI are
still C3/C4, actual preceding-reader and final scientific/performance coverage C5.
The unchanged jobs WebSocket handler emitted a transport-close traceback during a
browser disconnect, without failed assertions or corrupted job/project state;
inspect its disconnect cleanup during C4's job/session integration and fix before
final delivery. This is retained verbatim in the raw browser log.

No unresolved consequential C2 finding remains. The noted WebSocket cleanup,
full-coverage science, performance, persistence and accessible UI remain explicit
later-checkpoint work; this review does not certify final release readiness.
