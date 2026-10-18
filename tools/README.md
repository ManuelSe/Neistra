# Qualified AmberTools environment

Issue #82's `amber-local-v1` calculation uses an isolated **Linux x86-64**
AmberTools 24.8 CPU environment. The application continues to use its existing uv
environment, including OpenMM 8.4.0. No calculation installs software or downloads
parameters. Other platforms are not qualified for this profile.

Install an operator-selected micromamba distribution. C1 uses the official
[2.9.0-0 Linux binary](https://github.com/mamba-org/micromamba-releases/releases/tag/2.9.0-0),
verified against its release SHA256:
`366cd9cd8be14df1ab8ed50352a82111082a36686b2d389fdb79a92c3fafb3e3`.
The installer itself is outside the application environment.

From the repository root, choose an absolute installation prefix outside the
repository and create it from the explicit package lock:

```bash
micromamba --no-rc create -y -p /absolute/path/to/ambertools-24.8 --file tools/ambertools-linux-64.lock
export MOLWEAVE_AMBERTOOLS_PREFIX=/absolute/path/to/ambertools-24.8
```

The lock contains 137 exact package URLs and SHA256 hashes, including
`ambertools-24.8-cuda_None_nompi_py312h4265c8b_104`. Both API and worker must receive
the same prefix. Existing app startup still works without the optional toolchain;
the new calculation reports its missing prerequisite explicitly. Do not add other
packages to this environment: dependency and model-file fingerprints are checked
against the qualified manifest. A model update needs new qualification and a
versioned profile decision, not a runtime fallback.

Run the native scientific and worker qualification with the prefix exported:

```bash
.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization.py
.venv/bin/uv run pytest tests/integration/test_minimization_jobs.py tests/integration/test_worker_recovery.py
```

Without a prefix, native scientific fixture tests explicitly skip; pure prerequisite
and missing-toolchain tests still run. Release qualification requires the exact
locked environment and **no skipped native minimization cases**. The full release
gate must run with the prefix exported. This package lock is separate from
`uv.lock`; it does not change application dependency pins or data schemas.

The initial C1 plugin is configured explicitly through the existing operator
allowlist/targets as `molweave.minimization` and
`molweave_core.minimization.plugin:plugin`. It produces reports and nonimportable
coordinate proposals only. Later checkpoints supply the dedicated capture/Apply
API and UI; a completed calculation does not edit project coordinates.

AM1-BCC finite-precision charges receive a reported uniform offset to the already
specified molecular net charge. Raw and corrected MOL2 files are retained. Reject
nonfinite residuals or a discrepancy larger than `min(0.05, 0.00051 * atom_count)`
elementary charge; this cannot repair a missing electron, choose protonation or
overwrite canonical formal charges. Uniform rounding normalization follows the
established [OpenFF charge-normalization convention](https://docs.openforcefield.org/projects/toolkit/en/stable/_modules/openff/toolkit/topology/molecule.html).
Generated connectivity, elements, identities and supplied bond-order representation
must pass mapping validation. Some native resonance encodings, including the tested
carboxylate representation, are conservatively refused; they are not silently
accepted as fully mapped chemistry. No missing-force-field-term extrapolation is
performed through parmchk2. Initial organic calculations are bounded to 256 heavy
and 1024 total atoms; C2 owns qualified protein/multi-entry context.

C2 additionally verifies `parm10.dat`, the three ff14SB amino-acid libraries,
`solvents.lib` and `frcmod.tip3p`: 31 actual executable/data hashes in total.
Environment calculations match complete existing standard protein chains against
exact named-atom, element and connectivity templates. Protonation follows the
existing explicit-H pattern; unsupported or ambiguous states refuse. No pH-based
choice, missing atom/bond creation, caps, disulfide/crosslink or covalent-adduct
support is part of this operation. A single-residue chain without a compatible
both-termini template refuses. Known conflicting formal charges, orders and stereo
also refuse. Existing separate protein preparation now records ordinary generated
identity facts for atoms it creates; old evidence-free generated atoms need an
explicit preparation/recovery path rather than an isotope/radical assumption.

Native LEaP creates only temporary validated model topology. Each particle maps to
an entry-local atom in its captured active conformer; generated native geometry is
ignored. `captured-coordinates.json` in the model ZIP records the actual start rows
in exact JSON precision and angstrom units; `model.inpcrd` is retained as native
parameter-generation output, not the optimizer start state. Organic subdirectories
retain raw/corrected charges and diagnostics. Immutable job artifacts remain the
canonical source of full captured molecular data.

The environment model uses OpenMM CPU with one deterministic-force thread,
nonperiodic12 angstrom cutoff,10 angstrom LJ switch and reaction-field dielectric
78.3, with dispersion correction disabled. Native neighbor handling updates after
movement. Native bonded terms, exclusions and scaled1–4 interactions survive
movable/fixed boundaries; no fixed coordinate is an optimization variable. These
finite-range local energetics are not solvated or binding energies. Explicit complete
neutral O/H1/H2 waters may use unconstrained AMBER TIP3P internal distance terms;
its auxiliary H-H distance is an engine term, never a canonical covalent bond.
No constraints/particles are introduced. This model does not promise flexible
water accuracy outside the declared local operation.

```bash
.venv/bin/uv run pytest tests/unit/minimization tests/scientific/test_minimization_context.py
.venv/bin/uv run pytest tests/integration/test_minimization_jobs.py
```
