# C2 implementer review

Reviewed the complete runtime/test diff against the approved contract. This is
local implementer review, not independent approval.

- Existing source chain components own residue children; labels disambiguate
  duplicate instances without changing identity, classifying chemistry or merging
  chains. Normalized source order, not component membership array order, defines
  rows and ranges.
- Expansion/scroll remain in the transient navigation store. Residue actions use
  C1's captured project/visit/artifact request and central canonical selection.
- Native list/buttons retain bounded virtualization, explicit parent keys,
  separate disclosure/selection, keyboard traversal and existing warning/Details
  scope. No per-residue visibility, focus command or sequence relocation.
- Pure tests cover gapped IDs, insertion codes, unknown numbering, instance
  collisions, nonprotein/ambiguous exclusion and large cached memberships.
- Native workflows cover cross-panel input, hidden H, partial/full toggles,
  chain fallback, focus/collapse, remount, narrow widths and unchanged project/
  camera/request state; actual browser zoom has dedicated qualification.
- Large native ranges exposed downstream quadratic summary, reference-validation
  and closed Edit-launcher eligibility scans. Bounded identity-index/set changes
  preserve exact membership and are required for the existing performance gate.
  A diagnostic CPU profile confirms the final remaining hotspot; nonprofiled
  large tests pass both layouts after its correction.
- The navigation benchmark explicitly leaves the existing unvirtualized atom
  table unmounted and uses a hidden loaded entry. It is not general full-table
  throughput or protein-chemistry qualification. Original 1STP/native/scientific
  release budgets remain mandatory.
- No API, molecular artifacts, schemas/migrations, dependencies, backend chemistry
  or version changes occur in C2. Final candidate and actual-reader gates are C3.

Manual inspection of the retained desktop dark screenshot confirms compact
chain/residue indentation, accessible controls and readable selected states. The
passing final gate and additional screenshots are recorded in the feature plan;
failed attempts remain diagnostic and no threshold is relaxed.
