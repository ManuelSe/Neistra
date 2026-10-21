# Pocket-history investigation and correction

Read-only local investigation, 2026-10-21. Raw project/history/artifact captures are
private and excluded from version control. Original uploads and user state were not
edited. The aggregate covers13 completed pocket calculations and12 applied edits.
All audited fixed canonical coordinates and canonical chemistry remained unchanged.

## Reproduced behavior

The pocket calculations used approximate geometry repair, while the isolated example
used MMFF94. Canonical metal–ligand–cofactor–protein connectivity puts the ligand in a
connected group with unresolved coordination/protein membership; current interpretation
falls back for that group. Thus it lacks the isolated ligand's native electrostatics.
This coverage limitation remains explicit; the correction does not qualify metal physics.

One applied full-ligand run reduced a carbon–carbon distance from1.50853Å to0.0007118Å.
The total penalty fell from about296.28million to295.27million, so prior acceptance
published the collapsed geometry. Subsequent operations inherited distorted geometry.

## Causal findings

- Repair's dihedral cross-product convention selected the opposite cis/trans target.
  An independent planar four-carbon probe produces324000 penalty at the wrong target.
- Native angular constraints square errors in degrees. Constants intended per radian
  squared consequently overwhelmed distance restraints. A saved-model replay reduced
  torsion penalty while increasing the bond penalty from20.9 to395.4.
- Fixed-only native terms added roughly294.6million constant penalty to this model.
  L-BFGS-B relative-energy stopping depends on objective magnitude, so that offset
  could also stop useful work prematurely.
- Prior severe-overlap checks excluded bonded pairs, and there was no independent
  bonded-length acceptance guard. A decreasing objective alone could pass collapse.

Native unit conventions are verified against pinned RDKit2026.03.4
[angle](https://raw.githubusercontent.com/rdkit/rdkit/Release_2026_03_4/Code/ForceField/AngleConstraint.cpp)
and [torsion](https://raw.githubusercontent.com/rdkit/rdkit/Release_2026_03_4/Code/ForceField/TorsionConstraint.cpp)
implementations. The numerical reference addresses the documented
[L-BFGS-B relative stopping formula](https://docs.scipy.org/doc/scipy-1.16.0/reference/optimize.minimize-lbfgsb.html).

An independent geometry audit after bond correction also exposes inconsistent
small-ring substituent targets chosen separately from the damaged fold. The declared
unsaturated ring can remain about0.52Å out of plane despite plausible bond lengths.
Topology-consistent ring/internal/external relationships resolve that contradiction.

## Corrected checkpoint

D-136–139 record the implementation. Correct torsion orientation, convert angular
strengths by(pi/180)^2, omit fixed-only work and use a stable captured-model numerical
reference. Independently reject collapsed/stretched supported covalent bonds and
any bond shorter than0.6Å, including unsupported links. This broad guard is not a
metal-coordination or physical-quality certificate. Older quick proposals without
bonded and planar proof require recalculation; retained history and Undo/Redo remain available.

Exact component projection preserves native moving forces and energy changes,
verified against the complete MMFF field with both whole/partial masks and normalized/
PDB inputs. Explicit energy-reference reporting avoids implying identical absolute
energies after omitting constants. Correct context lookahead and retained rebuild
metadata keep the protected neighborhood and model artifacts consistent.

Fixed environments may stop after three accepted canonical-coordinate steps below
0.01Å following at least25 accepted steps under one model, after geometry checks.
This is a warned improvement unless independent force convergence is established.
Isolated-molecule stopping behavior, resource limits and performance budgets remain.

Independent selected fully-sp2 small-ring checks reject plane deviation above0.2Å;
saturated puckered rings are preserved. This guards against accepting distorted ring
geometry just because energy falls. Small-ring targets use existing connectivity
and assigned multiple/aromatic bonds, without inventing missing chemistry.

Focused checks pass56 Python and313 frontend tests, static/build, plus26 repeated
native browser cases/10 documented mobile timing/zoom exclusions with zero failures,
flakes or retries. All13 private captures replay to usable geometry with exact fixed
rows in0.31–0.58s: one force-converged and12 warned improvements. The current saved
geometry also passes in0.62s as a limited improvement. Its declared unsaturated ring now has about0.0007Å maximum plane deviation.
The26-case native repeat predates this final ring correction; a fresh repeat and
complete gates remain required. These are private diagnostics,
not substituted scientific qualification or a guarantee for arbitrary pockets.

The complete frozen candidate and exact merged-master gates remain authoritative.
See the separate gate records for final results; earlier failed/interrupted attempts
remain diagnostic evidence. No release is established by this investigation alone.
