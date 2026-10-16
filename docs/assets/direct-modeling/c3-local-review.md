# Issue #74 C3 local self-review

Implementing agent's review; not independent. Reviewed normalized placement,
shared edit publication/creation/history, pure preview, UI targeting and owner
lifetimes, native ghost identity isolation, helper fallback and revised advanced
workflow expectations. Final source/commands are bound in c3-verification.json.

- Only the qualified fixed template is embedded; parent operations are record
  edits and per-conformer rigid placement. Cached templates remain unchanged.
  New IDs are contiguous after each allocator, including optional new H. Old
  atom/bond/coordinate records remain exact except the requested direct changes
  and explicitly warned affected stereo. No new migration or version yet.
- Optional completion initially consumed an entire helper-normalized structure.
  Consume only new H/bonds, inheriting actual parent membership and retaining all
  direct records, coordinates and annotations. Refuse that optional candidate if
  it would remove retained atoms, add non-H/unrelated edges or exceed resources.
  Real helper-success and resource fallback regressions pass.
- Preview performs no artifact publication, command write or reservation; Apply
  recomputes under captured revision/artifact. New ghosts have string identities
  and a nonpickable shape outside the native molecular map. Cancel/late preview,
  project visit, selection, policy and input guards prevent stale proposals.
- Empty-entry targeting needed explicit ownership beyond an empty selection.
  Capture its target in the App response guard, disable retargeting during writes
  and share pending state with the manual inspector. Atom-placement inputs now
  live with the project-owned preview across responsive remounts, avoiding a
  reset form displaying a different element from its captured proposal.
- Advanced atom/bond controls use direct publication and explicit target choice.
  Existing native tests expecting valence refusal now verify saved triple-O draft,
  durable unusual-valence warning and exact Undo artifact restoration. They then
  exercise the existing geometry/H/cleanup helpers and refusal behavior. Legacy
  HTTP chemistry tests remain unchanged. The theme test explicitly chooses its
  target; this does not weaken theme or molecular assertions. History labels are
  human-readable rather than exposing the new API operation identifiers.
- Native XYZ testing exposed existing invented neutral charges and assumed
  canonical SMILES. Preserve null charges/warnings on new imports, retain original
  bytes and leave historical artifacts exact. No broader malformed-file parsing.
- Earlier unit/typing/lint and native observer/import findings are diagnostic;
  successful pre-review gates are labelled separately from final source. Complete
  focused gate repeats after repairs, including advanced editor and theme cases.
- Desktop/mobile screenshots inspected. C4 must improve/qualify mobile preview
  visibility: the full tool panel can cover the proposed model at the default
  camera. A compact inspection presentation and expanded-form/contrast/zoom
  checks belong to C4 before merge/release. Full scientific/persistence/reader/
  reference/performance qualification and publication remain C4/C5; no release
  or unobstructed-mobile-preview certification is claimed here.
