# C1 local review

Implementer self-review; no independent approval is claimed.

Reviewed the complete runtime/test/documentation diff against planning commit
461c2be, including new untracked viewport/mounting/tests/notices files.

- The minimal view omits native controls/labels/toasts/tasks/logo at composition
  time. No production DOM suppression/observer or blanket CSS hiding is added.
- The same PluginUIContext, spec behaviors, pick-readback patch, canonical
  selection and measurement/representation managers remain. Explicit user guidance
  retains the default canvas orientation axes; interim disable evidence is diagnostic.
- The mounting helper follows the existing initialization/UI/canvas-readiness
  sequence, observes initialization rejection, cleans up failures and retains the
  React root for unmount before context disposal. Idempotent engine disposal also
  handles late mounting without attaching retired subscriptions.
- Scene loading follows awaited synchronization with per-effect/current-viewer
  guards. Obsolete errors/completions cannot overwrite the active operation or
  execute stale camera/focus restoration. Current failures retain the app alert.
- Obsolete attribution/clearance helpers and their callers/CSS are removed.
  Canvas geometry, theme background, scientific colors and app overlays remain.
- Native-control tests are replaced with applicable app focus/hit-target/theme/
  zoom coverage and zero native-node assertions. The absence monitor is test-only.
- The complete Mol* MIT notice is shipped byte-identically; the narrow Git
  attribute preserves upstream CRLF bytes without whitespace-gate failures.
- No molecular/backend/API/schema/migration/dependency/version change. No native
  screenshot replacement or other deferred product feature was introduced.

Initial lint and test-isolation failures were corrected. The first native run
was diagnostic (source changed during execution) and exposed two missing keyboard
modality steps and a mobile hover target covered by the wrapping app toolbar.
Those test targets/keyboard steps were corrected without changing production
behavior, scientific assertions, readiness deadlines or test exclusions.

No unresolved consequential source-review finding. Passing final C1 gate evidence
is recorded separately in c1-final-static, c1-final-unit and c1-final-browser;
review does not substitute for those outcomes or later C2/candidate/master gates.
