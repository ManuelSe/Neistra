# Issue #46 C1 verification — 2026-10-10

Source of truth: [approved plan](../../plans/issue-46-viewer-transform-toolbar.md).
These are checkpoint results, not candidate or merged-release qualification.

| Check | Result |
|---|---|
| C1 focused Vitest plus interactive-transform domain suite | 40 passed / 5 files |
| Full frontend Vitest | 165 passed / 37 files |
| Frontend lint / type check / production build | Passed; build 11.14 s |
| Existing interactive-selection-transform + viewer-controls browsers | 27 passed / 5 intentional layout skips |
| New viewer-transform-toolbar desktop + Pixel 7 browsers | 2 passed, 26.4 s |
| Diff review / whitespace | Passed; no schema/API/version change |

Browsers use pinned Chromium/SwiftShader, API 8210, worker 8211 and web 5373.
Data are fresh disposable `/tmp/neistra-issue46-c1-final-e2e` and
`/tmp/neistra-issue46-c1-toolbar-e2e`. Commands and corrections are recorded in
the plan. Diagnostic runs exposed hidden More controls, modal ownership, expanded
control hit targets and timestamp serialization; each is explained and corrected.
Actual canvas/native-coordinate and exact persisted-state assertions remain.
Existing scientific warnings and lazy Mol* build-size advisory remain.

Temporary camera navigation, actual zoom, performance, previous-reader and
complete release gates are pending; this record makes no claim about them.
