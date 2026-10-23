# C1 implementer review

Reviewed the complete C1 runtime/test diff against the approved contract before
checkpoint commit. This is local implementer review, not independent approval.

- One central atomic transition handles native viewer and explicit panel residue
  actions; no HTTP or durable molecular/selection schema is changed.
- Panel requests capture project visit, entry and artifact; App resolves only the
  current cached projection, and the store rejects stale context.
- The immutable index stores entry-independent membership. A reused structure in
  another entry receives that entry's references; the regression covers it.
- Sequence preserves nonprotein and whole-chain behavior, label fallback and
  source metadata. No relocation, automatic camera focus or visibility action.
- Pure tests exercise mode-independent panel selection, fixed forward/reverse
  ranges, chain/component boundaries, mixed toggles, invalidation and stale work.
- Native tests independently assert real input, exact atom references, camera and
  project/request invariance; they do not synthesize a production selection.
- The first native attempt found a test-only PUT/GET timezone serialization
  mismatch. Compare two GET snapshots rather than stripping timestamps or
  weakening project equality. Initial evidence remains diagnostic.

Manual inspection of the initial desktop native screenshot confirms compact
Sequence tiles, insertion-code display and synchronized residue membership.
Final passing milestone evidence is recorded separately in the feature plan.
