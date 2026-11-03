# Issue #96 qualification evidence

Current delivery: [stable v0.26.2](https://github.com/ManuelSe/Neistra/releases/tag/v0.26.2), [PR #129](https://github.com/ManuelSe/Neistra/pull/129),
qualified runtime `e1cae49a9655a4a48a72c25f36bbd45db0273423`. Final integration/cleanup status lives in the
[verified issue close-out](https://github.com/ManuelSe/Neistra/issues/96#issuecomment-6596946523).

- c3-candidate4 and c4-merged1 summaries/manifests: both clean 20-command gates pass
  1,262 Python (zero skips), 374 frontend, 12 supervisor/policy, 352 browser / 62 exactly
  unchanged exclusions; zero final failures/flakes/retries. All 595 source/log
  identities verify; actual tagged/current readers pass both ways.
- c4-publication.json: annotated tag object/target, stable/latest release and asset
  identities; anonymous download SHA-256/CRC/all 1,303 manifest files/notice identity.
  The 125 MB qualification ZIP SHA-256 is `6ae3fc4558626a4272c1afed402f6fd7170ce3fcb48964928420fab40d99cf76` (1,304 entries including manifest).
- c4-issue-closeout.json is the initial verified reply snapshot. The live URL above
  is updated with subsequent documentation-integration and branch-cleanup receipts.
- c4-merge-ready/merge-result records preserve review/policy/head/normal-merge
  provenance. Review is local self-review; Codex request has no external result.
  Portable correctness is qualified; strict reference timing is not claimed.

The historical checkpoint records below retain failed/interrupted diagnostics and
superseded pending-state notes. Final source, reader and publication evidence above
supersedes their qualification status; no failure or exclusion is hidden.


The approved feature contract and D-149 govern. Orientation axes remain by
explicit user correction. D-148 portable correctness is mandatory; strict reference
latency qualification is not claimed. No production resource/chemistry policy changes.

- C1 final-static/final-unit/final-browser: 373 frontend, static/build/license
  identity and 30 native passes / 10 existing exclusions; no final failures/flakes/
  retries. c1-review.md records local self-review and diagnostic corrections.
- C2 final-static/final-unit/final-browser, webgl-failure and cold-native: 373
  frontend, 55 native / 7 exclusions, WebGL 1 / 1, two cold-cache native cases.
  Source hashes remain unchanged; no final failures/flakes/retries. c2-review.md
  records exact annotation/state/camera/original invariants and limitations.
- Other C1/C2 attempts remain diagnostic or superseded. Initial invalid fixture,
  keyboard/pointer targeting, navigation/cache and timestamp-format comparisons
  are preserved in their full logs/reports rather than called passing qualification.
- Per-command JSON records retain exact argv/environment, source identities,
  return codes and lossless gzip log hashes. Their status_after_command field
  describes the tree after execution. Browser JSON reports are losslessly gzipped.
- Screenshots retain actual rendered scenes. Native annotation placement/overlap
  remains unchanged; no label collision-avoidance claim is made.
- c3-focused-archive: 39 passing archive tests at final version0.26.2.

The release-recipe and release-qualification scripts preserve the established
20-step gate, adding current paths/version/audits and the D-148 portable profile.
They require a clean initial tree, isolated stores, locked native tools, actual
v0.26.0/current producer-reader processes, identical source hashes and lossless
logs. Each phase has a fresh label and /tmp data; failed attempts are retained.
Complete candidate qualification is recorded below; exact-master and publication remain pending.

- C3 candidate1 is diagnostic:1262 Python/373 frontend/12 supervisor/static/build
  pass, browser351pass/1failure/62existing exclusions. Full report and failed mobile
  trace/context/screenshot are retained. The annotation observer read a replacement
  engine before asynchronous mount completion. Gate stops before actual readers;
  it is not release qualification. A test-only readiness correction is requalified.

- C3 remount correction:4/4 focused native cases and373 frontend/static/build/
  version/schema/license/exclusion checks pass; source/log hashes verify. The new
  test waits for each replacement engine and its annotations without changing
  production code, assertions, timeouts, fixtures or exclusions. Fresh complete
  candidate qualification remains required.

- C3 candidate2 is intentionally interrupted at browser case63 after retained-trace
  review reveals nested React root cleanup ordering. c3-root-warning.json links
  the exact console event to its trace hash. c3-root-fail-first proves the wrong
  cleanup order; c3-root-fixed-unit passes5 cases. The runtime fix queues cleanup
  after the parent commit and preserves root-before-context disposal. Focused and
  fresh complete gate evidence remain required; interrupted results are diagnostic.

- C3 root final-static passes374 frontend/lint/types/build/version/schema/license/
  production-exclusion checks. Root-browser passes5/1existing exclusion with zero
  React root warnings, both-layout remount/project annotations and real WebGL
  failure feedback. All source/log identities verify. Initial lint attempt remains
  diagnostic. Full-diff review of the repair has no unresolved consequential finding;
  a fresh clean complete candidate gate is still required.

- C3 candidate3:351pass/1existing gesture failure/62existing exclusions; all other
  native UI/annotation/cleanup cases pass both layouts. Full report/failure trace/
  screenshot/context are diagnostic. Actual projection-jitter fail-first2 proves
  2 updates/2 native events with equal camera snapshots; old complete-membership
  assertion fails. Initial fail-first attempt is a cold-scan navigation diagnostic.
- c3-reader-preflight-results.json retains actual tagged/current producer/readers
  both ways; original/state/history/jobs/surface/selection/archive checks pass.
  Exact recipe/script/command/source/log evidence is retained; full gates repeat it.

- c3-jitter-summary.json:374 frontend/static/build/audits,28 native/8existing
  exclusions after clearing generated Vite cache, zero final failures/flakes/retries.
  Four theme/layout positive jitter records prove actual projection updates and
  native events preserve physical snapshots and complete trusted-input expansion.
  Hover/controls/WebGL/annotations/lifecycle/root-warning checks pass. Source/log
  identities verify. Complete final candidate/master gates remain required.

- C3 clean candidate `117c354`: all20 commands, **1,262 Python (zero skips), 374 frontend, 12 supervisor/policy and 352 browser passes / 62 exactly unchanged exclusions**;
  zero failures/flakes/retries, all595 source and lossless log identities.
  c3-candidate4-summary.json embeds all four actual reader process records;
  c3-candidate4-browser.json.gz is the complete raw report. Observations preserve
  portable measurements/JSON attachments; strict timing qualification is not claimed.
  c3-full-diff-review.md is local self-review. release-summary.py.txt checks clean
  complete gates, source/log identities, exact baseline exclusions and no retries.

Presubmit receipt verifies the refreshed base is already incorporated andv0.26.2
is unused; PR policy is rechecked at merge. Final candidate desktop/mobile renders
were visually inspected (axes retained; existing annotation overlap unchanged).

c3-remote-review.json records PR#129/readback, Codex request with no returned
external result at that timestamp, and honest local-only review provenance.
Runtime/test/version/lock bytes still match the clean qualified candidate; policy
and conversations are checked again at normal merge. No independent approval is
claimed and publication still requires the exact-master gate.
