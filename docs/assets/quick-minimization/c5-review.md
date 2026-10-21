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

Candidate attempt1 stopped at a stale archive test version assertion (1118 passed,
28 failed). Focused correction passes33 archive cases. An additional cache review
finding now patches active conformer rows and invalidates seeded full projections
so provenance/warnings refresh for Apply/Undo/Redo, including after reload. Two
regression cases verify it without mutating the prior cached artifact. Full candidate
qualification must restart from a clean committed state.

Candidate attempt2 was explicitly interrupted during Python qualification (227
passed, no complete result) after review found a settings-switch race. Opening settings
now disarms automatic publication/preview synchronously before cancellation. A settings
draft stays unarmed until Run; a regression holds cancellation pending and delivers a
late completion. Restart the entire gate from the corrected checkpoint.

### Candidate attempt3 — full diagnostic result

All1147 Python/313 frontend/8 supervisor and static/build/fresh dependency/migration
checks pass. Native browser finishes297 passed/1 failed/60 documented exclusions,
zero retries. All quick/AMBER scientific/workflow/performance cases pass, including
all supplied files on desktop/mobile and actual zoom. The sole failure is an existing
surface-manager test awaiting a forced native rebuild promise through DevTools:
execution context destroyed. Its mobile counterpart and a fresh unchanged desktop
comparison pass. Preserve full logs/source identities and failing trace; this failed
gate is diagnostic. Reader/version/final-diff steps did not run after browser failure.

The test now starts rebuild completion without transferring its native promise across
a long-lived DevTools context, then polls explicit serializable success/failure state.
Native rejection remains a failure; a real navigation loses the state and fails the
poll. The bounded wait is stricter than the old unbounded evaluation; every visual,
picking, history, camera and worker-count assertion remains unchanged. Repeated
focused desktop/mobile checks precede a complete frozen candidate restart. Product
runtime and acceptance budgets are unchanged.

The corrected wait passes all four independent focused runs (two desktop/two mobile),
with no failures, retries or skips. The unchanged desktop comparison also passes.
Commit this test-only correction and evidence, then restart all20 gate commands.
