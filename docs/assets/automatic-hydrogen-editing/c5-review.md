# Issue #92 full-diff implementer review

Reviewed the complete implementation range from
`54533f10df4d8fff763483356a58c4573a445453` through release preparation
`746c4cf`, including core/API/UI/tests, documentation and evidence metadata.
This is local self-review, not independent review. Complete candidate qualification
is still running; this document does not authorize merge or release by itself.

- **Scope and authority:** implementation follows D-140–142 and the approved
  requirement matrix. No profile framework, persistent H lock, global inferred
  orphan cleanup, new preparation workflow or renderer-owned state was added.
  The global PLAN remains unchanged; historical decisions were preserved.
- **Chemistry:** routine edits preserve assigned charges and unsupported drafts.
  +H uses the finite state/transition table, all canonical bonds and hidden H,
  source protection, independent valence/angle/distance checks and explicit-H
  sulfur stereo admission. RDKit graph acceptance alone cannot admit unsupported
  higher-charge O/S or choose a new sulfur stereocentre. New operations do not
  claim pKa, physiological state, optimized geometry or favorable energy.
- **Deletion and locality:** terminal canonical connectivity authorizes cascade;
  display inference and bridging ownership do not. Explicit H intent suppresses
  immediate refill. Local targets include new/current identities and immediate
  neighbors; no recursive whole-entry saturation. Legacy request defaults and
  additive/reconciliation semantics remain independently covered.
- **Atomicity and budgets:** failed +H staging cannot publish a charge alone or
  consume IDs/history. Every site stages aligned conformer rows before mutation.
  Monotonic floors cover placed and generated atoms/bonds. Site, H, coordinate,
  analysis and diagnostic caps retain full skipped/unprocessed totals. Moved-ID
  and appearance ancestry grouping avoid per-site full-structure scans.
- **Appearance/publication:** private ancestry resolves through new fragment
  parents and actual H parents; element tokens stay dynamic. Existing reversible
  viewer updates coalesce inheritance with deletion pruning under the same
  revision/artifact guard. Unrelated visibility, isolation, preferences, surfaces,
  selections and historical scene membership retain their owners. Old callers
  keep optional publisher defaults and generic durable action vocabulary.
- **UI and ownership:** ordinary compact and inspector direct edits use automatic;
  +H remains immediate with server admission. Removed preference/count/geometry/
  completion launchers cannot reopen. Optional bond previews and Advanced unknown
  assignment remain. Canonical captured operands, generation/selection ownership,
  responsive focus restoration and cancellation guards remain; Mol* is disposable.
  Focus tooltips, touch/keyboard usability,320px and actual200%zoom are tested.
- **Resolved review finding:** legacy normalized drafts can carry numeric orders
  outside1/2/3, including nonaromatic1.5. Compact stepping now disables those cases
  rather than sending fractional arithmetic; explicit assignment remains. Three
  edge-case tests and the passing C5 preflight cover this refinement.
- **Fixtures and regressions:** legacy protected/unknown fixtures were not made
  eligible to satisfy tests. The prepared-complex native-picking test explicitly
  prepares its fixture through the retained additive API. Current +H workflows
  independently use ordinary known synthetic MOL fixtures. Exact original bytes,
  heavy/unrelated coordinates, all conformers, history, appearance and stale
  no-change behavior are asserted rather than inferred from counts alone.
- **Compatibility/release:** actual tagged0.23.0 and current modules are loaded
  from asserted roots in separate processes. Six new cases forward and the rich
  three-entry old-producer case reverse retain canonical/history/appearance/scenes/
  surfaces/jobs/originals/counters/archives in preflight. Repeat with final0.24.0.
  All five authoritative sources advance together, dependencies remain locked,
  schemas/head remain2/1/0014, and stable minor impact follows actual capability.

No unresolved consequential source-review finding remains. Final candidate gate,
remote review/protection/check audit and exact merged-master gate remain required.
Follow-up#114 owns broader H qualification; #83/#52/#71 keep their existing scope.


## Scientific follow-up correction

Further review independently mirrored ordinary C/N conformers. Both +H requests
were admitted with an unset new stereo tag and a disagreement warning, contrary
to the approved refusal contract. Candidate1 was intentionally stopped; it is not
release evidence. Two fail-first mirror tests and passing translation controls are
archived separately. A typed opt-in consistency flag now makes bounded +H refuse
unresolved geometry, unavailable assessment or conformer disagreement before any
publication. Existing generic helper defaults stay unchanged, and explicit-H
sulfur admission remains. API tests retain an actual Redo branch and assert exact
stored snapshots/artifact/command counts, originals and counters after refusal.
Immediate45 targeted cases pass; source-bound correction and full candidate
requalification remain pending. This replaces the earlier provisional source-review
conclusion; no independent external review is claimed.


The source-bound correction gate now passes all15 commands:114 focused Python,
321 frontend,14 native, static/type/build and actual final0.24.0↔tagged0.23.0
reader checks. Source/log hashes verify. Review of the final correction confirms
typed opt-in flags, unchanged legacy defaults, no extra perception pass, and no
partial persistence. No unresolved consequential source finding remains; complete
fresh candidate2 and exact merged-master gates remain required.
