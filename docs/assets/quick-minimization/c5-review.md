# Issue #110 candidate review

Local self-review, 2026-10-21. No independent review or release gate is claimed by
this document. The complete candidate gate is the next checkpoint.

Reviewed the implementation against the approved issue plan, including the current
API/core/UI changes and preserved prepared-model contracts.

Consequential findings addressed before freezing:

- Keep the quick job/report/capture independent from historical AMBER serialization.
  Generic submission cannot bypass server-owned selection, conformer and source capture.
- Preserve assigned chemistry and isotope/radical evidence. Protein templates fill
  unknown facts; assigned current connectivity and aromatic evidence are retained.
  Observed H wins over default states. Missing heavy atoms and metal coordination
  are not invented. Unsupported material receives explicit repair/omission reporting.
- Include bonded boundaries, complete encountered residues and interfragment forces.
  Initialize combined native ring information after context rebuilding. Retain all
  local native nonbonded pairs; rebuild bounded repair candidates with original targets.
- Compare both objectives under the final model. Abnormal, nonfinite, stereo-invalid,
  stale, overlap-producing and cancelled output cannot publish. Bound projected
  convergence is checked against the independent full movable gradient.
- A final-discovery proof remains valid only while exact participating immutable
  identities match. Changed modeled context refuses; changed formerly distant context
  is checked spatially at final coordinates. Participation/locks/conformers/digests
  are revalidated. There is no persistent chemistry cache in the quick path.
- Scope automatic Apply to the owning App session, disarm before cancellation or
  publication, and never rearm from Jobs, reload or archives. Responsive viewer
  remounts preserve the draft and initiating launcher focus.
- Avoid opening/progress/frame subscriptions in App. Coordinate publication uses the
  existing atomic coordinate batch, with existing generic warning-summary actions,
  rather than rebuilding molecular topology. Keep overlays paused during publication.
- Retain full temporary chemistry, mappings, original/candidate/helper coordinates,
  assumptions and package versions in immutable model/report artifacts.
- Preserve originals, fixed rows, inactive conformers, allocators and exact Undo/Redo.
  Actual tagged 0.22.1 preflight retains all four new quick datasets and archive/job
  artifacts. No DB, molecular or history-action schema migration is required.

Focused evidence before freeze: 38 Python cases, 310 frontend tests and targeted
native desktop/mobile, accessibility/zoom, timing and previous-reader qualification.
Earlier diagnostic failures prompted the above fixes; they are not release evidence.
Complete frozen candidate and exact merged-master gates remain mandatory, including
all historical native scientific and browser checks. No required scope is deferred
or silently replaced by a successful-looking placeholder.
