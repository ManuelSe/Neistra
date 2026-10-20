# Locked renderer correction

`molstar@5.11.0.patch` fixes synchronous click picking after asynchronous hover
readback. `PickHelper.asyncIdentify()` can leave `dirty=false` while the native
buffers are unread. The original `identify()` then returns no target. It now
checks that clean buffers have resolved and synchronously reads them if pending
or failed. Dirty-scene rendering, resolved-buffer reuse and asynchronous hover
remain unchanged. Both distributed ESM and CommonJS paths are patched.

This is a pinned implementation correction, with no Mol* version upgrade, new
dependency, changed geometry, granularity or public Neistra API. Frozen pnpm
installation validates the patch hash. `native-pick-readback.test.ts` tests the
pending, failed, resolved and dirty-scene paths; native surface/click/hover and
performance gates qualify actual behavior. Reevaluate this patch on any Mol*
upgrade and remove it only when upstream behavior passes those tests without it.
See issue91's feature plan and D-125 for provenance and scope rationale.

Upstream incorporation/removal tracking:
[#107](https://github.com/ManuelSe/Neistra/issues/107). Current click correctness
is delivered in issue91; this follow-up does not defer that requirement.
