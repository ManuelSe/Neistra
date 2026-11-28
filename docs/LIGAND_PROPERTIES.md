# Live ligand properties

Live properties were introduced in [v0.37.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.37.0).
Sourced profiles are added in [v0.38.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.38.0)
at `c6f3e283ef3f6bed4a00c6dfe3fef36bf5bc3f82`. Portable correctness and measured
work/resource bounds pass; latency target misses remain documented in
the [scientific limitations](SCIENTIFIC_LIMITATIONS.md#live-ligand-properties).
The ligand information sidebar and profile radar are added in
[v0.39.0](https://github.com/ManuelSe/Neistra/releases/tag/v0.39.0).

## Inspect and configure

Open **Ligand information** in the right sidebar. Choose an **Entry** in
**Ligand of interest**, then choose an exact ligand when required. The header
shows its instance, automatic/manual origin and qualified formula/formal charge.
Use **Change** to choose another instance or **Clear** to leave the entry
unassigned. Cached 2D depiction has its own unavailable and recovery states;
choosing a ligand does not require a successful drawing.

The entry selector includes all project entries. An inspected entry can remain
shown with **Outside current filters** when browser filters hide it. Molecular
selection and visibility do not silently replace the deliberately inspected entry.
An empty context asks you to choose an entry.

**Properties** appears below that choice.
Values update automatically for the designated ligand; no Calculate or Refresh
step is needed. Atom selection, camera changes and visibility do not choose a
different ligand.

The status distinguishes **Properties current**, **Updating properties…**, partial
unavailability, cancellation and failure. A value shown as **Unavailable** has no
qualified numerical value; it does not mean zero. Open **Methods and limits** for
its reason, method, units, implementation/policy/library versions and available
provenance. Known counts can remain available when chemical model descriptors
cannot be calculated.

Open the sliders icon labelled **Property options** to choose Composition,
Polarity, Lipophilicity, or Flexibility and rings. **Save options** applies the
choice to every project on this installation. **Restore defaults** changes the
draft to all four categories; save it to persist that choice. Selecting no
categories displays **No property categories selected**. Other API consumers can
request additional descriptor dependencies without changing these preferences.

Options use revision conflict protection. If another visit changed them, close
and reopen to review the current choices; use **Reload current options** when
shown. Cancel discards an unsubmitted draft. After submission, Close leaves the
save in progress and its acknowledgement cannot close a later options visit.

Collapse and resize controls remain available, including narrow-layout panel
access. Compatible result updates preserve connected reading position and focus.
Use **Inspector tools** to reach the existing inspection and editing views.

## Sourced profiles

Choose **Profile** in the property pane to assess the current ligand against Ro5,
core Ro3, Veber, Ro5 + Veber, Doak outer-envelope, Gleeson 4/400 or Teague
lead-library adaptations. **No profile** clears the assessment. Selection is
transient and does not add project data or change saved property categories.
Required descriptors can be calculated without adding their categories to the
display.

Open **Criteria and sources** for actual values, strict or inclusive limits,
individual outcomes, definition/catalog versions, citations and adaptations.
**Within profile criteria** requires every required current input to pass.
Updating, unavailable, cancelled and failed inputs remain distinct; unavailable
values are never zero. Changed chemistry previews explicitly show profile
unavailability, and relevant committed edits automatically reassess current input.

CNS MPO and the scaffold/SOM method remain selectable with explicit unavailable
reasons. Their missing inputs or reproducible definitions are not replaced by
guessed values. If the catalog cannot load, **Retry profiles** retries its metadata;
property updates remain independent. These descriptive rules do not predict
experimental success, exposure, permeability or affinity.

The sidebar's profile radar uses numbered axes with an ordered property legend.
Open **Values and criteria** for exact values, units, display domains, operators,
limits and individual outcomes. Values outside a display domain are visibly
clipped while their actual values remain in the table. Missing values leave gaps.
The plot's size and area are display geometry, not a scientific score; larger is
not necessarily better. The table provides the equivalent information without
requiring interpretation of the plot.

## Edits, previews and recovery

A relevant molecular edit, ligand change, source replacement or project change
immediately withholds incompatible values and requests the current input. Late
responses from an earlier input cannot replace it. The active property consumer
continues when the inspector is hidden or remounted.

Changed molecular proposals show **Preview — properties unavailable** instead of
presenting committed values as proposal values. Cancel returns to the committed
input; Apply starts or reuses calculation only after validating its new identity.
Undo and Redo follow their exact restored inputs. Coordinate-only changes can
reuse graph descriptors after current source verification; they do not imply that
a different chemical graph is equivalent.

**Cancel update** stops this consumer's demand for its current input. Reopening
the inspector does not undo that cancellation; use **Retry**, choose another input,
or change the requested categories. Other consumers may still need shared work. Failures expose Retry when
recovery is supported. A stale ligand choice requires review of the choice.
Missing or corrupt molecular sources require restoration or reimport; retrying
cannot supply chemistry that was never established.

A cache hit alone is not source authority: current-result reads verify molecular
bytes and the source-to-report binding. After a physical source failure, candidate/
depiction recovery does not by itself restore numerical authority; a fresh matching
property read must qualify it separately. Automatic property work does
not add molecular commands, dirty the project, or populate ordinary user job
links/results. Original uploads are preserved.

## Descriptor definitions

Definitions are versioned and returned by the
[registry API](API.md#live-ligand-properties). Their plotting domains are display
ranges, not scientific acceptance thresholds, clipping rules or profile verdicts.

| Category | Descriptor ID | Meaning and unit |
| --- | --- | --- |
| Composition | `molecular_weight` | Average atomic-weight molecular mass, g/mol; RDKit `MolWt`. |
| Composition | `heavy_atom_count` | Observed designated atoms with atomic number greater than 1. |
| Composition | `heteroatom_count` | Observed designated atoms other than hydrogen or carbon. |
| Composition | `carbon_count` | Observed designated atoms with atomic number 6. |
| Composition | `formal_charge` | Sum of qualified atomic formal charges, in elementary-charge units (`e`). |
| Polarity | `hbd` | RDKit `CalcNumHBD` donor count. |
| Polarity | `hba` | RDKit `CalcNumHBA` acceptor count. |
| Polarity | `tpsa` | RDKit topological polar surface area, Å², with `includeSandP=False`. |
| Lipophilicity | `calculated_logp` | Wildman–Crippen calculated logP, `CalcCrippenDescriptors(includeHs=True, force=True)[0]`. |
| Lipophilicity | `molar_refractivity` | Wildman–Crippen molar refractivity, cm³/mol, the same calculation's second component. |
| Flexibility and rings | `rotatable_bond_count` | RDKit `CalcNumRotatableBonds` with `Strict`. |
| Flexibility and rings | `ring_count` | RDKit `CalcNumRings`, a perceived ring count rather than graph cycle rank. |
| Flexibility and rings | `aromatic_ring_count` | RDKit aromatic rings in its perceived ring set. |
| Flexibility and rings | `fraction_sp3` | RDKit fraction of carbon atoms that are sp³; unavailable for a carbon-free input. |

HBD/HBA use `CalcNumHBD`/`CalcNumHBA`, not the separate `CalcLipinskiHBD`/
`CalcLipinskiHBA` definitions. TPSA excludes the sulfur/phosphorus fragment terms.
Calculated logP is a model estimate, not measured logP, logD, pKa, solubility or a
binding score. None of these values proves preparation quality or biological activity.

## Scientific input and operational limits

The kernel uses exactly the designated canonical membership and qualified current
representation, including charge, bond, stereo, protection and inference facts.
It normalizes only admitted ordinary terminal hydrogens in a disposable calculation
copy, with a checked expanded-H round trip. It does not change canonical atoms or
original files, choose a protonation state/tautomer, desalt, or select a largest fragment.

Unqualified charges/orders, incomplete boundaries, unsupported isotope/radical/query/
dummy or stereo representations, and unsupported hydrogen/element models retain
explicit reasons. Observed counts and independently qualified charge can succeed
without qualifying all model descriptors. A zero net formal charge does not prove
that every atom is uncharged. `contains_formally_charged_atoms` is a qualified
auxiliary fact, possibly unknown, rather than a fifteenth descriptor or pKa classifier.

| Boundary | Current limit |
| --- | --- |
| Calculation kernel | 1,024 designated atoms before H normalization; 4,096 considered bonds. |
| Aggregate source request | 200 distinct entries; 16,384 canonical atom IDs per source; 65,536 in total. |
| Source verification | 64 MiB per artifact and shared operation budget, counting current and required original inputs. |
| Worker batch | At most eight considered sources and 64 MiB captured source bytes; complete capture envelope at most 96 MiB. |
| Derived cache | 2,048 content records / 16 MiB encoded content; each report envelope at most 128 KiB. |
| Worker resource policy | 30-second wall/CPU limits, 1 GiB resident-memory policy and 0.5-second cancellation grace. |

These are admission/operational bounds, not universal latency or whole-process
peak-memory guarantees. Capacity, unsupported input and worker failure remain
explicit; a prepared runner or passing focused correctness check does not establish
current performance qualification.

See the [scientific limitations](SCIENTIFIC_LIMITATIONS.md#live-ligand-properties),
[registry](../packages/neistra_core/src/neistra_core/ligand_properties/registry.py)
and [calculation kernel](../packages/neistra_core/src/neistra_core/ligand_properties/calculate.py)
for exact conventions. The sidebar and radar use the existing descriptor and
profile definitions. Entry-property filtering remains #162 and final general
Inspector retirement remains #163. Interaction diagrams remain unavailable under
the separate #153 scope; choosing ligand information does not generate one.

## Persistence and version changes

Category preferences are installation-local. Reports, proofs, current bindings,
leases and private executions are derived state introduced by Alembic `0017`.
Project/checkpoint/archive schema 3 and viewer schema 2 remain unchanged. Archives
carry canonical inputs and designation; derived bindings are requalified after
import/remapping. They do not carry installation preferences or restore private
executions as runnable user jobs.

Back up the complete managed data directory before upgrading, and use matching
client/server versions. Downgrade to `0016` refuses nondefault property preferences
or any unreaped private execution. Restore and save default categories, stop/reap
owned property work, and use the supported migration path. A permitted downgrade
removes regenerable property tables and positively associated private jobs; ordinary
user jobs are outside that cleanup authority. Both complete candidate and actual
merged-commit v0.37.0 qualifications pass against actual tagged 0.36.0 source. Positive
shared-schema API/archive writing is qualified separately from old migration
entrypoints, which safely refuse unknown migration 0017. Independently old-authored
data migrates forward and reopens under current code for both archive suffixes.
Canonical inputs, ordinary jobs and unapplied proposals retain their qualified
compatibility. See the [release evidence](https://github.com/ManuelSe/Neistra/releases/tag/v0.37.0).

Version 0.38.0 adds no migration or dependency and preserves these storage versions.
Its complete candidate and actual merged qualifications use actual v0.37.0
producer/readers, both producer origins and both archive suffixes. The explicit
same-schema protocol tests private derived-state retention and safe refusal
without weakening the preceding protocol or discarding canonical inputs.

Version 0.39.0 also adds no migration, dependency or scientific method. Its actual
v0.38.0 producer/readers pass both directions and archive suffixes. Database
history remains compatible. Archives retain their canonical snapshot semantics,
including the documented omission of command history; they do not become history
backups. Original uploaded molecular files remain preserved.
