# Performance Qualification

Status: Neistra regression budgets, established for MolWeave v0.1.

Performance thresholds are regression gates on the pinned Playwright desktop
Chromium host. They are not hardware-independent throughput promises or
recommended maximum scientific system sizes.

## Selection gestures (issue #90)

Issue #91 reuses those immutable membership indexes for canonical Residue targets.
Moving within one residue/component reuses its materialized target; unchanged
hover targets avoid loci conversion and marker updates. Hover performs no API
reads/writes, molecular serialization, jobs or surface recomputation. Native loci
comparison also precedes canonical materialization for repeated Atom/Chain/Structure
hits. Different-atom native hits in the same Chain/Structure target must leave
resolution/marker counters unchanged. These are work bounds, not a speedup claim.
Native hover qualification records exact marker/canonical state and unchanged-event counts.
Existing 1STP, movement, surface and minimization thresholds remain unchanged;
final candidate/exact-master evidence is tracked in the issue #91 feature plan.

Artifact-keyed immutable normalized/hierarchy objects own weak membership indexes.
Atoms/residues/components are indexed once; intervals use normalized residue order
within exact source component/chain identities. Viewer gestures reuse loaded
projections and do not introduce per-gesture normalized requests or serialization.
Canonical selection algebra materializes exact member references, including hidden
atoms, without depending on renderer visibility. These are implementation bounds,
not arbitrary-size throughput promises.

The complete candidate and exact merged-master suites must retain the existing
1STP1001-atom30s import/5s minor-interaction/750ms longest-task/zero-repeat-request
budgets, alongside unchanged movement/surface/minimization limits. Native gesture
qualification uses trusted input, exact references and camera equality. Read-only
raster/readiness helpers live only in test modules, absent from production output.
[Clean candidate measurements](assets/selection-gestures/c4-candidate-browser-summary.json):
1STP import/viewer1154ms, interactions3861ms, longest observed task652ms, zero
repeat requests. Every existing movement/surface/minimization budget passes.
[Exact released master](assets/selection-gestures/c4-merged-browser-summary.json):
import699ms, interactions4473ms, longest task655ms, zero repeat requests. All existing
budgets pass again; these are pinned-host results, not universal throughput claims.

## Selection-driven editing (issue #69)

Small-molecule chemistry is admitted only for bounded components (256heavy/
1,024resulting atoms). Membership uses one residue index, and only the component
enters RDKit. Six cached cap templates/seeded embeddings and six fixed torsions
bound fragment placement. Environment overlap checks use a spatial index rather
than a whole-complex pairwise distance array. These controls are not throughput
guarantees or proof of an optimized structure.

The panel reuses the artifact-keyed query and memoizes eligibility by immutable
projection/selection, avoiding camera-driven molecular rescans. Responses update
only the affected entry through existing topology patches; transient
`selection_after` avoids another structure fetch just to resolve new selection.
Normal opening, section browsing and display choices do not serialize molecules
into mutation requests. UI positioning observes layout only and coalesces work
to animation frames. C4 qualifies native prepared-complex H/new-atom picks with
zero section/remount reads and one affected-entry reload. A25,000-atom synthetic
context passes only3-/9-atom projections into RDKit, retaining unrelated atoms.
This is algorithmic scope evidence, not physical or throughput qualification.

Existing pinned movement budgets pass: first preview102.8/36.2ms, exact coordinate
Cancel9.8/14.4ms, longest tasks87/0ms (protein-fragment/bound-ligand). Surface
Cancel9.5ms/regeneration1034.6ms; gestures make zero molecular requests. The
representative-project interaction budget also passes unchanged. See
[C4 evidence](assets/molecular-editing/c4-verification.json) and
[movement measurements](assets/molecular-editing/c4-movement-performance.json).
Final candidate/exact-master release gates must repeat the complete budgets.

## Compact component navigation (issue #59)

The artifact-keyed membership index visits the normalized atom collection once,
then materializes actual component/category membership. Scroll and appearance
changes reuse it; current selection coverage uses one entry-local ID set.
The 10,000-component unit case verifies one atom-collection visit and complete
category operands, independent of how many rows are mounted.

The component pane uses fixed32px fine-pointer/44px coarse-pointer rows with eight
overscan rows on either side and at most two retained focus/Details rows. Native
tests bound rendered DOM by viewport rows plus16overscan plus2retained rows and
reach off-screen endpoints by keyboard. Every member remains selectable; virtual
window membership never defines scientific selection. Opening a previously
unloaded hidden entry is an explicit on-demand read; reuse and scrolling add no
normalized requests. Full entry-list virtualization remains deferred.

Qualification uses 200 grouped entries with long names and actual normalized
10,000-component synthetic O-only waters, narrow widths, responsive remounts and
real browser zoom. These are navigation/caching/DOM regression cases, not realistic
solvent preparation, throughput promises, or larger molecular-size guarantees.
Existing movement, surface and molecular resource budgets retain their owners.
Exact evidence and limitations are recorded in the
[feature plan](plans/issue-59-compact-project-navigation.md).

## Viewer toolbar/navigation (issue #46)

The native movement benchmark now cycles camera/transform ownership six times
for each protein-fragment and bound-ligand case, preserving accepted coordinates
and camera between transitions. Actual orbit/pan/zoom and updated-plane movement
are separately qualified through the native toolbar UI. Established budgets are
unchanged; navigation makes no molecular requests.

C4 pinned Chromium/SwiftShader values: first preview **144.5 / 26.7 ms**, exact
coordinate Cancel **14.2 / 14.7 ms**, longest task **125 / 0 observed ms**. Each
40-frame burst renders first/latest only (two frames, one active update), with
exact restoration. Surface coordinate restoration **18.9 ms** and full geometry
regeneration **1074 ms** are reported separately. No profiler or competing build
ran during timing. [Raw evidence](assets/viewer-transform-toolbar/c4-performance.json).
Candidate and exact-merged gates must repeat these unchanged budgets; these are
host regression gates, not hardware-independent throughput guarantees.

## Interactive movement (issue #4)

`interactive-transform-performance.spec.ts` applies native preview patches on an
already presented ordinary RCSB 1STP scene: a three-atom protein fragment and the
16-atom bound biotin. First-preview response includes pose math, coordinate update
and transient cue completion. Exact Cancel timing observes restored native model
coordinates at update completion, independently of the later animation frame or
surface regeneration. The production queue receives a burst of 40 frames and must
render only the first and latest, with one active operation. The profile requires
zero normalized projection, transform-command or job requests during these previews.

| Measure | Budget | C4 fragment / biotin |
|---|---:|---:|
| Native preview response | `< 500 ms` | 91 / 30.5 ms |
| Exact native coordinate Cancel | `< 500 ms` | 16.2 / 19.2 ms |
| Longest movement main-thread task | `< 750 ms` | 75 / 0 observed ms |

[Raw C4 evidence](assets/interactive-selection-transform/c4-performance.json)
reports all values, frame counts and request assertions. Inherited surface
coordinates restore in 16 ms; full regeneration completes separately at 1,047.1 ms.
That regeneration time is not substituted for coordinate Cancel or hidden from
the report. Test-only coordinate observation and optional `MOVEMENT_CPU_PROFILE=1`
CDP diagnostics are absent from production imports; the passing timing run had no
profiler or competing build/qualification. D-079 records the mesh-cue correction
for an identified first-use shader stall; accepted budgets are unchanged.

The actual UI hidden multi-entry workflow separately asserts no normalized refetch
or job submission through multiple pointer gestures/steps before one explicit
Apply. These are pinned desktop Chromium/SwiftShader host regression gates, not
arbitrary-system-size, hardware-independent throughput or physical-phone promises.
Surface/pocket capacity qualification remains independent. Candidate and exact
merged release runs must recheck these gates.

## Representative Project

The profile uses official RCSB PDB `1STP`, a 1,001-atom streptavidin-biotin
complex with protein, ligand, and water components. Its immutable checksum and
scientific expectations are documented in `FIXTURES.md` and asserted before the
browser profile.

`tests/e2e/release-hardening.spec.ts` requires:

| Measure | Budget |
|---|---:|
| Upload, normalization, API commit, projection fetch, and nonblank viewer readiness | `< 30 s` |
| Entry selection, zoom in/out, reset, and representation change after load | `< 5 s` total |
| Longest observed main-thread task during those minor interactions | `< 750 ms` |
| Repeated normalized-structure GETs during those minor interactions | `0` |

Each run attaches `performance-profile.json` with observed timings, longest
task, fixture, atom count, and request count. A canvas pixel assertion guards
against treating an empty WebGL surface as ready.

Run the profile with:

```bash
PLAYWRIGHT_BROWSERS_PATH=.playwright corepack pnpm exec playwright test \
  tests/e2e/release-hardening.spec.ts --project=chromium
```

## Architectural Controls

- Only visible entries request normalized projections; structure query data is
  cached by project, entry, and artifact ID.
- Opening a hidden or visible entry hierarchy reuses that same artifact-keyed
  query. Repeated category/component actions do not refetch or serialize the
  normalized document; the dedicated browser workflow requires one total
  structure request before reload.
- Opening selection styling explicitly loads only selected entries whose
  artifact-keyed normalized data is missing. Repeated style applications reuse
  that query; the qualified workflow requires one structure request before
  reload and one after reload, with no per-style refetch.
- Component derivation performs linear identity/membership passes followed by
  deterministic bounded sorting. Category unions are built from individual
  memberships rather than duplicated full category atom arrays.
- Entry and category disclosures start collapsed. Water/solvent instance lists
  are absent from the DOM until explicitly expanded.
- Camera, selection, metadata, and representation interactions send compact
  state/command payloads, not complete normalized molecular JSON.
- One multi-entry style application sends one canonical selection command and
  increments the project revision once. The renderer performs one deterministic
  linear membership projection per affected loaded entry and rebuilds its
  disposable exact Mol* bundle components while restoring camera and selection.
- Hydrogen-mode changes update only viewer settings and rebuild each affected
  disposable Mol* entry projection while restoring camera and canonical
  selection. Repeated changes reuse the artifact-keyed normalized-structure
  query; the qualified protein/ligand workflow observes one structure request
  before reload rather than a request per toggle.
- Spatial selection runs in a browser worker.
- Mol* is a lazy production chunk and loads only when structures are present.
- Coordinate commands return affected atom spans; topology commands replace
  disposable viewer projections from authoritative artifacts.
- At 250,000 atoms, surfaces degrade to lines and dense atom/residue labels are
  suppressed with a visible reduced-detail notice. Imports above 1,000,000
  atoms are rejected by default.
- Import and export execute in cancellable child processes; jobs execute in a
  separate worker and spawned plugin child.

## Interpretation

The `1STP` gate detects startup, serialization, query invalidation, WebGL, and
main-thread regressions in an ordinary protein-ligand project. It does not
bound surface generation on very large structures, GPU memory, spatial-query
complexity, chemistry cleanup, force-field convergence, plugin runtime, or
network-mounted storage. Those operations expose loading/progress,
cancellation where applicable, limits, or documented degradation instead.
Selection-styling qualification proves query reuse and nonblank output for the
1,001-atom representative project and the compact hierarchy fixture. It does
not establish an incremental-rendering advantage or a new large-system
latency/GPU-memory budget; the existing 250,000-atom reduced-detail behavior
continues to apply while retaining exact selection assignments.
Polar-only hydrogen qualification detects request-cache and rebuild regressions
on compact explicit-connectivity fixtures. It establishes neither incremental
rendering nor a new latency, GPU-memory, or large-system budget. Neistra does
not silently fall back to atom-name or coordinate heuristics when projected
connectivity is absent; the existing reduced-detail threshold and WebGL limits
still apply.

## Historical v0.7.0 bounded selection surfaces (issue #30)

This extends the historical baseline above for the fixed `molecular-v1` fragment
profile. One browser worker runs per viewer, with preallocation admission at
20,000 effective atoms and four million padded grid cells. Extraction checks a
conservative mesh allocation bound before marching cubes (64 MiB per surface);
retained selection meshes are limited to 128 MiB per viewer. Calculation has a
30-second deadline. Failed or oversize targets retain membership and show labelled
lines. The inherited 250,000-atom parent-entry degradation still applies.

C4 production 1STP measurement, without competing builds/tests:

| Measure | Desktop Chromium | Pixel 7 emulation |
|---|---:|---:|
| Production surface ready (budget <10 s) | 727.2 ms | 490.1 ms |
| Longest observed surface main-thread task (budget <750 ms) | 385 ms | 129 ms |
| Worker cancellation qualification (budget <500 ms) | 21.7 ms | 20.7 ms |
| Summed browser-descendant RSS baseline → peak | 800,176 → 982,204 KiB | 768,936 → 876,160 KiB |

Both produce 91,194 vertices / 71,012 triangles, 567 atom-owner groups, a 3,405,576-byte
mesh and a 133,020,368-byte conservative working-allocation estimate. RSS samples
include browser processes and potentially duplicated shared pages; they are not
worker heap or GPU measurements. These bounds do not promise a browser/GPU memory
ceiling or latency across arbitrary hardware. The recorded measurements and
allocation evidence are [desktop](assets/selection-surfaces/c4-chromium.json) and
[mobile emulation](assets/selection-surfaces/c4-mobile-chromium.json).

Production tests verify geometry reuse across color changes, cancellation/retry,
coordinate-preview invalidation, per-entry failure isolation and disposal of every
worker. The actual palette Add/reset/selection-clear workflow issues zero additional
normalized-structure GETs before reload. C4 and final release commands/results are
recorded in the [feature plan](plans/issue-30-selection-surfaces.md).


## Qualified capacity — issue #38 C1

The current molecular-v1 resource policy is 100,000 effective atoms, 64 million
padded grid cells, 512 MiB mesh allocation, 1 GiB retained mesh output per viewer,
2 GiB accounted active calculation buffers and 120 seconds, with one worker.
The 250,000-atom parent reduced-detail policy is unchanged. Mesh-byte evidence now
includes the returned stable atom-ID mapping as well as vertices/normals/groups/
indices. Staged bounds include native lookup, extraction/grouping chunk rounding,
compaction and transfer copies (D-067); no resolution or science changes.

Host: Linux 6.17.0-119029-tuxedo, Ryzen 7 8845HS (8 cores/16 threads), 60 GiB RAM;
Playwright 1.55.0 / Chromium 140.0.7339.16, SwiftShader WebGL, desktop and Pixel 7
emulation. No competing test/build jobs were run. These are host qualifications,
not physical-phone guarantees. RSS sums browser descendants with possible shared-
page double counting and includes test inspection; it is separate from allocation
bounds and is not a JavaScript heap or GPU limit.

Complete imported entries, all components/H enabled; fixed native profile and
source coordinates unchanged. Synthetic-100k is the single artificial component
specified in FIXTURES, not a protein or chemical preparation. All cases assert
checksums, exact atom membership and coordinate mapping, rendered pixels, readiness
<120 s, longest surface task <750 ms, bounded output and disposal of every worker.

| Fixture / browser | Atoms | Ready ms | Longest task ms | Retained output bytes | Accounted working bytes | RSS baseline → peak KiB |
|---|---:|---:|---:|---:|---:|---:|
| 6vxx / chromium | 23,694 | 4332.6 | 187 | 85,392,860 | 606,979,788 | 650,752 → 1,352,056 |
| 6vxx / mobile-chromium | 23,694 | 3956.3 | 181 | 85,392,860 | 606,979,788 | 661,588 → 1,359,996 |
| 1aon / chromium | 58,870 | 9538.5 | 437 | 219,986,372 | 1,326,940,068 | 670,724 → 2,422,480 |
| 1aon / mobile-chromium | 58,870 | 8845.9 | 428 | 219,986,372 | 1,326,940,068 | 667,472 → 2,405,116 |
| synthetic-100k / chromium | 100,000 | 8459.2 | 168 | 49,639,320 | 381,667,584 | 716,008 → 3,361,424 |
| synthetic-100k / mobile-chromium | 100,000 | 8115.4 | 194 | 49,639,320 | 381,667,584 | 712,324 → 3,354,008 |

Raw measurements, grid dimensions and checksums: [capacity evidence](assets/selection-capacity/).
The unchanged 1STP <10-second readiness and <500 ms cancellation gates also pass
on both configurations; their raw files are in the same directory. Additional
production regressions cover camera, coordinate preview/commit/cancel, reuse,
per-entry failure, H filtering, exact fragments and palette persistence.

The initial mobile picking test checked before the native render-loop event;
it now waits for delivery after each real canvas click, preserving the canonical
atom assertion. The corrected focused rerun passes all eight cases; full command
and prior unchanged-workflow evidence are recorded in the feature plan. Initial
synthetic projection with 100,000 separate components timed out; this qualification
does not claim capacity for that unrelated component-count stress case.


## Full-protein pocket qualification — issue #36 C1

Same Linux/Chromium/SwiftShader and Pixel 7 emulation host as #38. Each pocket uses
the first protein atom as a captured seed, radius 5 Å, all classified protein
context and supplied protein H, even with atomic detail/H display hidden. It
computes the complete native surface before retaining centroid-near triangles.
No competing builds/tests ran during qualification.

| Fixture / browser | Protein context atoms | Ready ms | Longest task ms | Full → compact output bytes | Accounted working bytes | RSS baseline → peak KiB |
|---|---:|---:|---:|---:|---:|---:|
| 1aon / chromium | 58,674 | 13164.2 | 398 | 220,336,136 → 296,364 | 1,577,129,988 | 649,956 → 2,406,632 |
| 1aon / mobile-chromium | 58,674 | 13064.4 | 289 | 220,336,136 → 296,364 | 1,577,129,988 | 654,280 → 2,411,864 |
| 1stp / chromium | 901 | 936.4 | 396 | 3,452,740 → 65,268 | 27,904,624 | 563,276 → 917,296 |
| 1stp / mobile-chromium | 901 | 623.0 | 207 | 3,452,740 → 65,268 | 27,904,624 | 556,988 → 841,100 |
| supplied-h / chromium | 4 | 424.6 | 300 | 30,252 → 24,776 | 2,522,564 | 651,080 → 898,856 |
| supplied-h / mobile-chromium | 4 | 235.0 | 130 | 30,252 → 24,776 | 2,522,564 | 669,912 → 828,264 |

All required readiness (<10 s for 1STP, <120 s larger cases), main-thread (<750 ms),
working/retained bounds and one-worker limits pass. Native Pocket cancellation on
small fixtures takes 2.5–3.9 ms, below 500 ms, without cancelling the Fragment
channel; retry restores the pocket. Tests compare every triangle against a separate
full-context reference, preserve native normals/ownership, and exercise color
reuse, hiding, isolation, empty results, coexistence and real pixel-targeted picks.
Only compact geometry and the receptor identity mapping are retained; isolation
index allocation is reserved within the combined 1 GiB retained budget.

RSS includes the independent reference calculation and subsequent display
lifecycle, and can count shared pages repeatedly. It is distinct from accounted
calculation buffers, not a browser/GPU heap bound or physical-phone guarantee.
Raw evidence and actual native captures: [pocket assets](assets/pocket-surfaces/).
The complete fragment/capacity regression command passes 21 browser cases with
one intentional layout skip; exact commands and review are in the feature plan.

### Pocket saved-workflow qualification (C3)

The C3 native rerun again qualifies the complete 58,674-atom 1AON protein context,
including supplied protein H where present, before cropping. Desktop/mobile
readiness is 13.631/13.026 s; the full 220,336,136-byte mesh becomes a
296,364-byte patch. 1STP readiness is 922.8/593.0 ms (901 protein atoms);
its full 3,452,740-byte mesh becomes 65,268 bytes. The supplied-H fixture preserves
all four protein atoms and produces a 24,776-byte patch.

Largest observed steady surface task: 400 ms; tested native cancellation:
2.3–3.4 ms. Both channels retain one worker and respect combined allocation bounds.
Peak summed descendant RSS is 2,451,060 KiB including independent reference
calculation and display lifecycle; shared pages may be counted repeatedly. This is
not a measured worker heap ceiling or a physical-phone guarantee. Full evidence:
[qualification JSON](assets/pocket-surfaces/c3-native-qualification.json).

Application tests additionally check hidden-seed input loading without visibility
changes, style-only projection reuse, exact camera/selection during dependent
coordinate preview/cancel/commit, and prevention of duplicate invalidation for an
already-applied commit. A final UI-only receptor-default correction is independently
rechecked by component/workflow/real-zoom tests; it does not change this native
geometry or resource evidence.

## Molecular interactions (issue #49)

Pinned 1STP plus an explicitly typed 9-atom ethanol aligned to the BTN centroid
contains 1,010 atoms. This synthetic alignment makes no binding claim. Host gates
require first analysis-to-overlay <5 s, cached toggle <500 ms and longest main-thread
task <750 ms. Final C4 desktop: 2337 ms / 178.5 ms / 0 ms observed; Pixel 7 emulation: 2416 ms / 152.5 ms / 0 ms observed. Each uses one 279-byte identity request, zero structure GETs and 79 shown clash records. [Raw evidence/host/checksums](assets/molecular-interactions/).
No profiler or competing build ran during these timing windows. Budgets are host
regression gates, not physical-phone or arbitrary-size throughput promises.

Analysis limits are 100,000 atoms, 1 million spatial candidate admissions, 20,000 records
and 30 s wall time, with one active child/API process. Limit failure returns no complete
result. Cached switches filter records; camera/selection/theme/styles send no new
chemistry request. Hidden/deleted subsets reuse matching immutable input supersets.
Existing viewer/surface budgets remain binding and repeat in the release gate.

Final C5 candidate and exact merged complete browser gates repeat these budgets.
On exact releasedbf29b9a, desktop/mobile first2395/2019ms, cached166/157ms,
longest recorded task0/0ms; each one279-byte request, zero structureGETs,79records.
[Final desktop](assets/molecular-interactions/c5-merged-desktop-performance.json) /
[mobile](assets/molecular-interactions/c5-merged-mobile-performance.json) evidence
is separate from C4/candidate observations. Existing native movement/navigation/
surface/capacity budgets pass in both complete release runs.

## Issue #55 interaction correction

Native overlay geometry reuses attached buffer cells and explicitly bounds active
groups, retaining batched nonpickable rendering. All six cached type/scope
choices avoid new molecular requests. C3 repeats the pinned1010-atom fixture
budgets (first analysis/display<5s, cached toggle<500ms, longest task<750ms; one
279-byte analysis request and zero additional structure GETs). Measured desktop/
Pixel7 values are in [evidence](assets/interaction-corrections/c3-verification.json).
Scientific fixtures and projection/pixel inspection remain test-only.


## Independent surface objects (issue #57)

C4 repeats the existing scientific, capacity and movement budgets with multiple
independent objects. The actual worker queue admits one calculation at a time and
materializes inputs only at admission. Appearance rebuilds retain valid scientific
snapshots; cancelling a queued object never extracts its inputs. A gated native
four-object regression observes one extraction while blocked, three after one
queued cancellation, maximum one worker, and all remaining objects ready.

Pinned Chromium/SwiftShader ready times (desktop / Pixel 7 emulation): 6VXX
23,694 atoms 4.225 / 4.074 s; 1AON 58,870 atoms 9.834 / 9.264 s; synthetic
100,000 atoms 8.557 / 8.214 s. Longest tasks respectively225/231,548/534 and
158/189 ms. Worker mesh/working bytes respectively85,392,860/606,979,788;
219,986,372/1,326,940,068;49,639,320/381,667,584. All readiness and main-thread
budgets pass. Summed Linux descendant RSS reaches3,437,848 KiB; shared pages can
be counted more than once. Neither this observation nor the2GiB calculation and
1GiB retained-mesh bounds promises a browser or GPU memory cap.

Fragment/bound-ligand first movement preview86.2/23 ms, coordinate preview77/12.7 ms,
cancel14.1/16.3 ms; surface cancellation7.8 ms and separate regeneration1026.5 ms.
Appearance edits perform no field recomputation or normalized refetch. Native entry
mesh uses Mol* line geometry and actual canvas pixels without another worker field.
See [C4 evidence](assets/surface-objects/c4-verification.json) for exact commands,
raw data, resolved diagnostics and environment limits. Candidate and merged release
gates remain separate evidence; these measurements do not qualify physical devices,
other browsers or hardware GPUs.

## Direct molecular modeling (issue #74)

Direct atom/bond changes operate on normalized records. Placement embeds only a
fixed small template; parent clash ranking uses a spatial tree, without a whole-
protein RDKit conversion or an N-by-N matrix. A synthetic25,000-atom domain case
asserts retained records/coordinates and forbids parent helper conversion; it is
a scope regression, not a throughput benchmark. The configured1,000,000-atom entry
limit is a resource bound, not a responsive-size guarantee.

The existing pinned1STP movement profile now runs both the original1,001 atoms and
a1,002-atom authored draft with the native bond decorator active. Both retain the
existing <500ms first-preview/cancel, <750ms longest-task, one-active-update and
40-submitted/two-rendered-frame budgets. Surface regeneration remains measured
separately. C4 evidence records actual observations; complete candidate/merged gates
repeat the existing surface/capacity/navigation/interaction budgets unchanged.

[C4 native profiles](assets/direct-modeling/c4-performance-profiles.json) and
[source-bound commands](assets/direct-modeling/c4-verification.json) retain exact
observations and host limits. Final broad gate99passes/13intentional skips;
no timing budget was changed. Final-version complete gates remain C5.

## Hydrogen building bounds (issue #77)

Synchronous H building admits at most4096 target sites,4096 new H and16384 generated
H coordinate rows across conformers. Complete chemical perception contexts are
limited to1024 atoms and16384 analyzed atoms across count/stereo stages. Temporary
analysis H share the coordinate budget; stereo can remain unresolved with a warning
while supported literal additions are retained. Details cap at200, with full reason
counts and explicit truncation. Whole-site skipping is deterministic by canonical ID.

Request-scoped canonical adjacency, coordinate-array caching and one retained
batch contact index per conformer avoid repeated whole-entry conversions/scans. No
quadratic distance matrix, whole-protein conversion or persistent model cache is
introduced. `test_hydrogen_qualification.py` qualifies real4097-site truncation,
900-site/five-conformer coordinate admission, context limits, combined stage budgets,
index/array reuse, numerical precision and exact retained coordinates. Existing
viewer/surface/interaction/movement capacity budgets remain unchanged and must
pass the complete release gate. These are supported bounds, not universal latency
or hardware-performance claims.

Generation admission charges failed sites too, including a reserved complete set
of conformer rows. Repeated stereo assessments count atom visits per conformer.
Oversized component closure and incident pi-bond summaries avoid repeated graph
walks around shared/high-degree context. Adversarial tests prove these work bounds;
budget refusal does not allocate IDs or discard an already successful direct edit.


## Local bond-H reconciliation bounds (issue #81)

The destructive policy admits at most two endpoint sites. It shares the4096 H
operation/16384 coordinate-row ceilings, counting removals/movements, failed work
and all conformers. Chemistry contexts cap at1024 atoms and16384 analyzed visits;
reports cap at200 detailed diagnostics with full reason counts. Request-scoped
adjacency/coordinate and combined contact indices avoid whole-protein chemistry
conversion, repeated original parsing or quadratic pair matrices.

The fixed1STP-plus-butane qualification has1015 atoms; its latest C4 profile is
0.075089s and3542670 Python-traced peak bytes, with only12 atoms in chemistry
conversion. Native allocator memory is excluded. The pinned-host regression budget
is5s/64MiB, not a responsive-size or physical-device guarantee. Exact protein and
unrelated rows remain invariant. See [source-bound C4 evidence](assets/hydrogen-reconciliation/c4-gate.json).

The [clean final0.19 candidate gate](assets/hydrogen-reconciliation/c5-candidate-gate.json)
repeats the complete native surface/capacity/movement/navigation/interaction suite
without changing existing budgets. All native assertions pass; raw profile records
are retained in [candidate profiles](assets/hydrogen-reconciliation/c5-candidate-native-profiles.json).
Exact merged-master qualification repeats before release.

The [exact released0.19 master](assets/hydrogen-reconciliation/c6-merged-gate.json)
repeats the full native suite with unchanged budgets and zero failures/flakes/retries.
[Native data files](assets/hydrogen-reconciliation/c6-merged-native-profiles.json)
retain18 capacity/production/movement/interaction records, separate from a claim
of18 timing profiles. These are pinned-host regression measurements, not physical
validation or a new portable capacity guarantee.


## Selection minimization (issue #82, C5)

[Source-bound gate](assets/minimization/c5-gate.json) and
[worker measurements](assets/minimization/c5-performance-summary.json) retain exact
commands/environment and samples. Maxima across focused and full Python runs:

| Case | Atoms | Setup, s | Optimization + publication, s | Aggregate RSS, MiB |
|---|---:|---:|---:|---:|
| ligand | 9 | 1.278 | 0.177 | 549.4 |
| prepared-1stp | 2,304 | 5.818 | 1.263 | 573.0 |
| large-assembly | 18,208 | 7.411 | 10.059 | 776.0 |

Real-SQM cancellation settles in at most0.198s.
The120s setup/60s optimization/2GiB/5s bounds pass. Setup uses fresh calculation
processes/parameters with ordinary OS cache. The20ms RSS sum includes the API/test/
coordinator and live descendants, excluding browser/OS memory. These are pinned-host
measurements, not cross-hardware guarantees or cold installation timing.

Native prepared PDB/MOL uploads, explicit complete context, real jobs, preview and
Discard pass for2,304 and18,208 atoms. Trusted-event-to-queue/geometry/frame preview/
Discard remain below500ms and longest tasks below750ms. Automation/JSON-transfer
latency stays separate and visible in the native-performance JSON; no threshold
was relaxed. Existing original/authored movement performance assertions remain
unchanged and passing, with retained movement JSON. One bounded capture request,
32 selected ligand rows, exact context membership and unchanged canonical
revision/artifacts are asserted. No dense browser/Python all-pairs allocation.

The full159-residue fixture preserves901 observed heavy rows and explicitly models
missing termini/H, including disclosed generated stereochemistry repair. Neutral
CCD biotin is an explicit benchmark microstate. Eight translated full chains form
an operational capacity case, not a biological oligomer or validated binding pose.
See [fixture provenance](../tests/fixtures/minimization/README.md) and D-112.


## Quiet quick execution (issue #93)

Ctrl+M deliberately opens no minimization panel or extra progress display. The
quick performance witness therefore observes trusted-key command acceptance
through the existing transient store, and separately requires committed canonical
coordinate changes, owning-session completion and the native sync/paint queue.
It never mutates production state or replaces solver/renderer behavior.

`commandAcceptedMs` (≤100ms) is input-to-command acceptance, not the earlier
panel-render feedback metric; the two values are not a speedup comparison. Keep
cold canonical publication/paint≤2s for the small molecule and≤5s for the32-atom
pocket including18k scenes, first genuine frame≤1s on sufficiently long runs,
explicit Cancel restoration≤500ms, and existing750ms longest-task limits. No
algorithm, physics, context, iteration/time/resource limit or threshold is relaxed.
Complete candidate and exact-master evidence remains required by the issue #93
plan; checkpoint/preflight results do not qualify a release.
