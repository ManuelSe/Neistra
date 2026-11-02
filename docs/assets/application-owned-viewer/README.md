# Issue #96 qualification evidence

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
Complete candidate/exact-master qualification and publication receipts are pending.

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
