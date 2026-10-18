# Issue #82 C5 qualification review

Implementer local full-diff self-review, not independent approval. Exact final
unchanged-source commands/identity and passing evidence are recorded in c5-gate.json
when the repeated milestone gate completes. C6 final-version/full-release review
remains required.

Reviewed the approved contract and entire feature diff, with C5 focus on broader
scientific coverage, prepared fixture provenance, resource/neighbor bounds and
actual tagged reader execution. No force-field substitution, automatic repair,
conformer batch, adduct or cross-entry topology was introduced.

Consequential findings repaired before the final gate:

- Protein total charge alone could allow an incorrect terminal state to compensate
  an incorrect side-chain state. Validate separate groups, fully assigned local
  valence and aromatic flags/Kekule placement while leaving canonical unknowns exact.
- Parameter finiteness covered nonbonded particles only. Inspect masses, all four
  qualified force kinds, bonded records and exceptions; refuse unknown force kinds.
  Final objective/gradient checks remain independent. Dedicated failure injection
  does not claim positive force-field accuracy.
- Singular starts now refuse before expensive native generation, including across
  entries, with bounded spatial search. Chemistry prerequisite errors retain their
  diagnostic precedence; the optimizer keeps its independent singular check.
- Monoatomic halides could enter the GAFF organic path despite needing a qualified
  ion model. Require carbon-containing organic components and respect canonical ion
  classification. Charged organics remain eligible; canonical complete neutral water
  retains its separate TIP3P path. No new ionic force field or draft restriction.
- PDBFixer generated mirrored terminal sites in the full159-residue benchmark.
  Offline preparation explicitly repairs only generated side chains before adding H;
  all901 observed heavy rows remain within1e-6Å and the minimizer's stereo validator
  remains strict. Freeze/disclose assumptions and corrected residues. Neutral CCD
  biotin is an explicit benchmark state; anionic biotin is not claimed qualified.
- An early native UI timing proxy included Playwright click/JSON transfer for18k
  canonical references. Retain automation timing separately and measure native work
  from the trusted event through queue/geometry and a frame. Preserve500/750ms
  bounds and unchanged existing movement performance assertions.
- The actual preceding-reader harness checks real tagged API/core paths/version,
  successful downloads, sizes/SHA256 and bytes, exact canonical state/all conformers,
  multi-entry history, job input/model/report/provenance, originals, counters, save
  and archive re-export. Old authoring need not implement the new operation.

Validation design and limits:

-70 library-derived graph states are coverage fixtures, not independent physical
 accuracy.26 native internal-state cases verify model construction and central
 energy-difference forces. Independent observed1STP geometry and earlier controlled
 context/boundary/exclusion/1–4/dynamic-neighbor cases supplement them.
- Prepared1STP preserves the full chain, explicitly modeled missing termini and all
 observed heavy rows. Eight translated full chains plus ligand measure18,208 atoms;
 this is operational capacity, not an oligomeric pose. No dense pair allocation.
- Worker timing includes cold child/parameter setup and optimization/publication.
 RSS sums the API/test/coordinator parent and live descendants at20ms, with ordinary
 OS cache. Observe actual SQM before timing cancellation; job/result/canonical checks
 follow. These host measurements are not general hardware/platform guarantees.
- Native browser uploads prepared PDB/MOL through real adapters, explicitly chooses
 all full context, uses real jobs/nonpickable preview/Discard, verifies one bounded
 capture request and unchanged canonical artifacts. Automation timing stays visible.
- Raw1STP, existing movement budgets, global product/plan and historical decisions
 stay unchanged. No migration/schema/dependency/application-version change.

Diagnostics are separate: initial fixture/harness assumptions and the interrupted
first C5 gate are not final passing evidence. That gate passed1030 Python before
review found the ion boundary; the final gate must include its new negative cases.
C5 development-producer metadata remains0.19.0. Final0.20.0 producer/actual0.19 reader,
complete native release matrix and exact merged-master qualification remain C6.

Final C5 source SHA256 `761eed855dfb026a909a491ab65d37e25db5696820a55936d6614b98df7e8994`. All15 recorded commands pass
on unchanged source:1036 Python (605 focused),265 frontend,8 supervisor,28 native
browser /12 intentional layout skips; no failures/retries/native scientific skips.
Ruff/mypy87/lint/types/build, fresh0014 and diff pass. Actual tagged0.19 module paths,
200-status artifact downloads, sizes/digests, canonical all-conformer state, generic
multi-entry history/jobs and archive import/re-export pass. No unresolved
consequential C5 finding. C6 final0.20 producer/release matrix remains required.

Staged diff review identified native fixed-width PDB padding and original CCD
trailing blanks. Follow the existing per-scientific-fixture .gitattributes convention
for these two exact paths, retaining tested/original bytes and all semantic checks.
The staged diff check passes; its lossless log/metadata SHA is retained separately.
No runtime/test/fixture content changed after the passing gate.
