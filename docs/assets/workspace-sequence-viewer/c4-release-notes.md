Delivered for issue #95 through [PR #124](https://github.com/ManuelSe/Neistra/pull/124), following the [approved plan](https://github.com/ManuelSe/Neistra/blob/582617139527cf22dd7ec9514632b121a628959a/docs/plans/issue-95-workspace-sequence-viewer.md).

Exact released runtime: **`582617139527cf22dd7ec9514632b121a628959a`**, the verified normal merge on `master`. Checkpoint history is preserved.

### Highlights

- Protein sequences now sit below the 3D canvas, alongside continued access to Inspector tools and Properties / History / Jobs. Every displayed protein chain has its own nonwrapping, horizontally scrolling row; additional chains scroll vertically.
- Rows preserve the complete observed chain while any part is displayed, using application visibility, representations, isolation and surface source context. Source numbering, insertion codes, chain instances and identifiable nonstandard residue names remain intact.
- Independently collapse, hide and restore sequences through compact controls. The redundant Inspector Sequence tab is removed. Keyboard arrows, Home/End and Enter/Space work with bounded horizontal/vertical windows.
- Residues reuse complete canonical membership, shared fixed anchors and Alt/Ctrl/Cmd/Shift modifiers. Full and partial coverage synchronizes with Components and the viewer without changing camera, visibility or picking mode. Manual scrolling remains stable.

### Focus and accessibility

Owned focus/scroll survive responsive remounts, recover safely when the last chain disappears and remain isolated between projects. Removed residues do not reclaim unrelated focus. Native list/button semantics, accessible residue context, focus tooltips and a non-color partial-state cue support keyboard use. Both themes, 320 px layouts, coarse targets, scoped axe and actual 100%/200% browser zoom pass in the pinned Chromium/Pixel 7 matrix.

### Persisted data, migrations and compatibility

Stable minor **0.25.0 → 0.26.0** adds an independently accessible workspace capability while preserving public and durable contracts. All five authoritative version sources agree at 0.26.0. No dependency upgrade, database migration, molecular rewrite, API/job/plugin or scientific-model change: Alembic **0014**, project/viewer/archive schemas **2**, normalized/selection/component schemas **1** remain.

Actual tagged v0.25.0 and final v0.26.0 producer/reader processes pass in both directions on candidate and exact master. Originals, coordinates, all conformers, saved selections/scenes/surfaces/jobs, exact Undo/Redo and archive remapping remain compatible. Portable archives retain current state, not Undo history. Only optional presentation preferences enter browser storage; sequence focus/scroll and range starts stay transient. Rollback uses a matching v0.25.0 client/API and retained complete managed data without a schema downgrade; older clients ignore the extra presentation preference.

### Verification and performance

Both clean candidate **`80720fee873b321b950db84a52df8bd3c3926f82`** and exact merged master pass all **20 release commands**: **1,250 Python, 370 frontend, 8 supervisor and 343 browser tests**, with **61 exactly unchanged preceding-release exclusions**, zero failures/flakes/retries/Python or required native scientific skips. Frozen installs, fresh migration, static/type checks, production build, actual readers and version/dependency/production-harness audits pass. All **583** source/test/tool/script/lock identities and lossless log hashes match both phases; source digest **`56b62d3de68322e9afb8dafe856fb31d2cd8dc88bb98464a6cc4658d2b72702b`**.

The displayed 10,000-residue/30,000-atom sequence profile takes **2071/2095 ms** desktop/mobile, longest tasks **332/386 ms**, mounted **20/15** tiles within **29/24** bounds, with **zero repeated normalized reads** and the unrelated property table unmounted. The many-chain case stays bounded. Existing native/scientific budgets also pass: cold small/pocket/18k native paint **0.949/2.114/3.879 s**, first actual frame **664.5 ms**, Cancel **58.1 ms**. Original 5 s navigation, 750 ms long-task, 2/5/5 s cold paint, 1 s first-frame and 500 ms Cancel limits remain unchanged. These are pinned-host regression measurements, not universal throughput or chemistry claims.

Earlier failed/interrupted runs remain explicitly diagnostic. The protein canvas test waits for asynchronous redraw using its identical 16-point pixel condition and original five-second expectation timeout; no fixture, scientific assertion, numerical limit or host setting is relaxed. Codex review was requested without a returned review; complete-diff review is implementer self-review, not independent approval. No required review, check, protection or unresolved conversation was bypassed.

The attached [verification ZIP](https://github.com/ManuelSe/Neistra/releases/download/v0.26.0/neistra-v0.26.0-verification.zip) includes the exact runtime source, candidate/master command and log records, screenshots, synthetic actual-reader data, qualification helpers and an internal SHA256 manifest. The uploaded asset and downloaded archive are checked before issue close-out.

### Scope decisions, limitations and follow-up

Explicit user guidance replaces the proposed active-chain selector with all displayed chains and limits this replacement to proteins. Other molecular access remains in Components and existing tools. Optional selection-follow scrolling is omitted to preserve browsing; keyboard navigation reveals its focus. Alignment, missing-residue reconstruction, nonprotein sequence browsing, sequence editing/export, secondary-structure annotation and a height resize handle remain outside this delivery. No essential approved outcome is deferred and no new follow-up issue is needed.

Observed coordinates do not establish complete biological sequence or chemical validity. Missing residues are never invented, nonstandard names are retained, and existing parsing/classification/connectivity/preparation limitations remain. Qualification covers the stated Chromium/SwiftShader and Pixel 7 emulation scopes, not physical devices or a broader browser certification.
