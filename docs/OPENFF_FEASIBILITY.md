# OpenFF feasibility assessment for issue #89

Assessment date: 2026-10-20. This is a documentation assessment, not an installed
OpenFF benchmark or a production model qualification. Production remains
`amber-local-v1`: ff14SB, GAFF1.81/AmberTools AM1-BCC and qualified TIP3P.
Experimental qualification is tracked in [#101](https://github.com/ManuelSe/Neistra/issues/101).

OpenFF Toolkit, a pinned Sage force field, a pinned NAGL model and Interchange
could provide a different ligand preparation path. The official Toolkit
[installation guide](https://docs.openforcefield.org/projects/toolkit/en/stable/installation.html)
recommends conda-forge installation; the full distribution supplies RDKit and
AmberTools, while its base distribution requires explicit backend choices.
A separate reproducible environment must resolve providers, model files, licenses,
CPU/memory costs and packaging before any dependency is added to Neistra.

Interchange [documents charge precedence and combination limitations](https://docs.openforcefield.org/projects/interchange/en/stable/using/edges.html):
charges on an input Molecule are not automatically authoritative; preset charges
require explicit handling. Combining isomorphic molecules can overwrite their
charges. Combination also handles small differences in electrostatic 1–4 scaling
and refuses larger differences. These behaviors require explicit tests of charge
ownership, atom mapping, exclusions and 1–4 terms. Virtual-site combinations add
further limitations. Neistra's existing selected/fixed boundary terms cannot be
assumed to survive a conversion merely because a system loads.

The [Ash 1.0 model card](https://github.com/openforcefield/openff-nagl-models/blob/main/docs/models/openff-gnn-am1bcc-1.0.0/index.md)
describes training toward OpenEye ELF10 AM1-BCC charges, with an explicit chemical
domain. This does not establish identity with the current AmberTools charge
calculation or prove accuracy on arbitrary ligands. Unsupported elements, bonding,
radicals, isotopes or protonation must not silently broaden current coverage.

A future experiment must pin all packages, force-field/model assets and hashes;
retain canonical explicit H, protonation, stereochemistry and stable atom mapping;
qualify supported coverage and refusals; specify protein/water composition and
nonbonded semantics (including cutoff, switch, dielectric and dispersion choices);
and assign a distinct physical model identity. Within each candidate Hamiltonian,
compare energies, analytic forces, finite differences and boundary terms before
performance or user-workflow claims. Comparing raw energies across different
Hamiltonians does not establish chemical accuracy. Any scientific quality claim
needs an appropriate independent reference dataset and stated uncertainty.

No OpenFF dependency, replacement charge policy, new scientific coverage or speed
claim is included in issue #89. Conservative geometry-dependent AM1-BCC reuse
remains binding. #101 is the focused follow-up; production adoption needs its own
approved contract and qualification.
