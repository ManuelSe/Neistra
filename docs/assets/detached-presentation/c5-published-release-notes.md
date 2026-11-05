## Highlights

Neistra 0.28.0 adds a local detached molecular presentation. Use **Detach viewer** to open one read-only window, then move/maximize it or use **F** for fullscreen. Repeat activation focuses the window. Camera, selection, appearance, surfaces, labels, measurements, interactions and editing/minimization previews follow the main canvas. A subtle leader pointer maps through the displayed image.

Implemented in [PR #133](https://github.com/ManuelSe/Neistra/pull/133), under the [approved issue #97 contract](https://github.com/ManuelSe/Neistra/blob/master/docs/plans/issue-97-detached-presentation-viewer.md). Qualified runtime: `f02ca386e97a200bbc39299c1f464cd4783a7b39`.

## Fixes and lifecycle

Project/source retirement, child reload, owner loss, hidden sources, playback/initialization/context failures and capture cleanup have explicit handling. Retired frames and callbacks cannot replace current output. Uncommitted output has a temporary Preview indicator; fullscreen-denial feedback preserves playback. Binding ownership remains releasable after capture errors.

## Persisted data and migrations

No new migration: Alembic head remains **0014**. Project/viewer/archive schemas remain **2**, and normalized/selection/component schemas remain **1**. Presentation state is transient. Original uploads, coordinates, history, scenes, selections, surfaces and jobs retain existing contracts.

## Compatibility and release impact

This is an additive stable **minor** increment from 0.27.0. All five authoritative application versions agree at 0.28.0; public APIs, dependencies and scientific algorithms remain compatible. Actual tagged 0.27.0 and final 0.28.0 readers pass both directions, including both archive filename styles. Back up the complete managed store before deployment; rollback uses a matching preceding client/server and existing configuration.

## Verification and review

Both the clean candidate and exact merged master pass all **24 release steps**: **1,333 Python tests (zero skips), 392 frontend, 14 supervisor, 364 browser passes / 74 registered exclusions**, zero final failures/flakes/automatic retries. The 62 existing exclusions match the preceding release exactly; 12 new mobile exclusions reflect the approved desktop-only presentation scope. All **713 source identities** match between candidate and merged runtime, and every lossless log hash verifies. Frozen installs, static checks/build, fresh migration upgrade/downgrade/re-upgrade, schema/version/dependency/production/license audits, legacy CLI and actual tagged 0.27.0 reader processes in both directions pass.

The evidence includes native frame/raster observations, all preview families, canonical-state/original-file invariants, lifecycle isolation, headed ordinary-window/fullscreen operation, unequal viewports, actual 100%/200% browser zoom, accessibility and large-scene resource cleanup. Portable correctness follows D-148; strict reference-host timing and hardware-GPU certification are separate.

Review provenance: local implementer full-diff self-review; Codex integration review requested with no external result returned, so independent approval is not claimed. The qualification evidence archive has a SHA-256 manifest, CRC checks and lossless logs. GitHub source archives are available for the verified annotated tag.

## Known limitations

Qualified on pinned desktop Chromium. Detail follows the source canvas size, and the main workspace must remain visible and rendering. Capture requests at most 30 frames/s without a constant-throughput guarantee. A visual presentation does not replace the main scientific workspace or provide a complete nonvisual scientific interface.

## Scope decisions and follow-up

Native frame mirroring replaces speculative independent rendering, molecular snapshots and BroadcastChannel scene replication. The pointer uses image coordinates. Necessary error/connection/Preview feedback supersedes an absolute overlay ban. Ordinary window movement suffices; a separate physical second-monitor check is not required under the approved amendment.

Independent high-resolution output and broader browser-family certification await demonstrated need. Remote sharing/recording require separate product scope; automatic monitor placement is omitted. No essential approved outcome is deferred and no speculative follow-up issues were created. Image export remains [#128](https://github.com/ManuelSe/Neistra/issues/128).
