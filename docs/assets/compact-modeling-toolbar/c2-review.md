# C2 implementer review

Reviewed the complete diff from passing C1 (00ce320), including launcher composition,
IconButton callers, scoped cascade/media rules, test/helper changes and guidance.
This is implementer self-review, not independent approval.

- The idle group contains only Transform/Edit/Minimize; panel portals do not add
  launchers. Existing workflow absence and active movement visibility rules remain.
- One border/surface/padding owner and common32px/44px/16px geometry replace the
  old individual sizes/chrome. Active movement retains its own existing frame,
  primary controls, More/Help, capture, Space and Cancel/Apply behavior.
- IconButton's optional tooltip text/class props keep existing callers compatible.
  The existing viewer-toolbar mobile exception repairs focus tooltips for Edit and
  Minimize without changing generic tooltip policy or installing another system.
- The remaining Minimize launcher can reveal loading/running/applying ownership.
  A native real-Apply-response hold verifies closed-panel/stable-launcher focus,
  explicit reveal and a single submission/publication in both browser projects.
- Native geometry/keyboard/scoped axe tests cover one frame, three exact accessible
  names/order, identical centered icons,32px desktop/44px coarse or narrow targets,
  setup without writes, focus restoration, and both themes at normal/320px widths.
- Light desktop and dark320px screenshots were visually inspected. Preflight3
  passes all6 new cases without skips/retries; earlier preflights are diagnostic.
  The earlier canvas focus assertion targeted an unfocusable native element; the
  corrected case uses the existing real launcher, not a production focus injection.
- No scientific algorithm, HTTP/job/plugin contract, durable field, migration,
  dependency or version changes. C3 still owns full release/performance/actual-reader
  qualification; no release claim is inferred from checkpoint tests.
- Final C2 gate result is recorded in c2-summary.json after completion. No unresolved
  consequential source finding remains in this checkpoint review.

Final C2 gate passes all7 commands on unchanged source:61 focused/328 total
frontend, lint/types/build/diff,77 native browser cases/3 existing layout exclusions,
zero failures/flakes/retries. Existing scientific and touch/Space/focus/200%zoom
assertions remain intact. No new native skip, timing relaxation, dependency or
migration. C3 release/reader/performance qualification remains required.
