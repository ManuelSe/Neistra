from __future__ import annotations

import pytest
from molweave_core.editing import reconciliation
from molweave_core.editing.model import ModelBondDelete, ModelBondSet
from molweave_core.hydrogen_protection import (
    protection_annotation,
    protection_facts,
)
from molweave_core.molecular import Conformer, Residue

from tests.support.hydrogen_fixture import model
from tests.unit.editing.test_hydrogen_reconciliation import apply, hcounts


@pytest.mark.parametrize(
    "smiles,counts",
    [("CN", (2, 1)), ("CO", (2, 0)), ("C[NH3+]", (2, 2)), ("C[OH2+]", (2, 1)), ("CS", (2, 0))],
)
def test_assigned_heteroatom_profile(smiles: str, counts: tuple[int, int]) -> None:
    before = model(smiles)
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.status == "complete"
    assert (hcounts(result.edit.structure)[1], hcounts(result.edit.structure)[2]) == counts
    assert [a.formal_charge for a in result.edit.structure.atoms[:2]] == [
        a.formal_charge for a in before.atoms[:2]
    ]


@pytest.mark.parametrize(
    "smiles,count", [("C[O-]", 1), ("CCl", 1), ("CF", 1), ("CBr", 1), ("CI", 1)]
)
def test_assigned_anion_and_halogen_deletion_profile(smiles: str, count: int) -> None:
    result = apply(model(smiles), ModelBondDelete(operation="bond.delete"))
    assert result.hydrogen_reconciliation_report.status == "complete"
    assert hcounts(result.edit.structure)[2] == count


def test_linear_to_planar_with_collinear_substituents_does_not_invent_ez() -> None:
    before = model("CC#CC")
    # Exact collinearity is intentional, independently of embedding roundoff.
    points = list(before.active_coordinates)
    for n in range(4):
        points[n] = (float(n), 0.0, 0.0)
    before = before.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": points[n]}) for n, a in enumerate(before.atoms)
            ],
            "conformers": [Conformer(id=1, name="Linear", coordinates=points)],
        }
    )
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0), [2, 3])
    assert result.hydrogen_reconciliation_report.reason_counts["undetermined_configuration"] == 2
    assert result.edit.structure.conformers == before.conformers
    assert result.edit.created_atom_ids == ()
    assert (
        next(b for b in result.edit.structure.bonds if {b.atom_1_id, b.atom_2_id} == {2, 3}).order
        == 2
    )


def test_new_stereo_requires_identity_evidence_for_complete_dependency_context() -> None:
    before = model("CCCl.CN")
    facts = [f for i, f in protection_facts(before).items() if i != 5]
    before = before.model_copy(update={"annotations": [protection_annotation(facts, "import")]})
    result = apply(before, ModelBondSet(operation="bond.set", order=1.0), [2, 4])
    assert "protected_stereo_context" in result.hydrogen_reconciliation_report.reason_counts


@pytest.mark.parametrize(
    "mode", ["charged_h", "unknown_h", "bridge_h", "stereo_h", "radical", "missing_facts"]
)
def test_protected_drafts_retain_site_h_and_coordinates(mode: str) -> None:
    before = model("[CH2]C" if mode == "radical" else "CC")
    h = next(a.id for a in before.atoms if a.element == "H")
    if mode in {"charged_h", "unknown_h", "stereo_h"}:
        change = (
            {"stereo": "TETRAHEDRAL_CW"}
            if mode == "stereo_h"
            else {"formal_charge": 1 if mode == "charged_h" else None}
        )
        before = before.model_copy(
            update={
                "atoms": [a.model_copy(update=change) if a.id == h else a for a in before.atoms]
            }
        )
    if mode == "bridge_h":
        from molweave_core.molecular import Bond

        before = before.model_copy(
            update={"bonds": [*before.bonds, Bond(id=99, atom_1_id=h, atom_2_id=2, order=1.0)]}
        )
    if mode == "missing_facts":
        before = before.model_copy(update={"annotations": []})
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.skipped_count >= 1
    assert h not in result.edit.deleted_atom_ids
    for prior, current in zip(before.conformers, result.edit.structure.conformers, strict=True):
        idx = next(n for n, a in enumerate(result.edit.structure.atoms) if a.id == h)
        assert (
            current.coordinates[idx]
            == prior.coordinates[next(n for n, a in enumerate(before.atoms) if a.id == h)]
        )


def test_failed_site_consumes_work_and_conformers_stay_atomic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = model("CC")
    points = list(before.active_coordinates)
    points[1] = points[0]
    before = before.model_copy(
        update={"conformers": [*before.conformers, Conformer(id=8, name="Bad", coordinates=points)]}
    )
    monkeypatch.setattr(reconciliation, "MAX_COORDINATES", 9)
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    report = result.hydrogen_reconciliation_report
    assert report.skipped_count == 1 and report.unprocessed_count == 1
    assert result.edit.structure.conformers == before.conformers


def test_real_coordinate_budget_refuses_whole_sites_before_generation() -> None:
    before = model("CC")
    conformers = [
        Conformer(id=i + 1, name=f"Frame{i}", coordinates=before.active_coordinates)
        for i in range(5462)
    ]
    before = before.model_copy(update={"conformers": conformers})
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.unprocessed_count == 2
    assert result.edit.structure.conformers == before.conformers


def test_duplicate_conformer_context_has_precise_nonfatal_diagnostic() -> None:
    before = model("CC")
    before = before.model_copy(update={"conformers": [*before.conformers, *before.conformers]})
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0))
    assert result.hydrogen_reconciliation_report.reason_counts == {"invalid_conformer_context": 2}
    assert result.edit.structure.conformers == before.conformers


def test_sparse_ids_nonfirst_active_alternates_and_covalent_residue_boundaries() -> None:
    before = model("C=C")
    mapping = {a.id: a.id * 11 + 2 for a in before.atoms}
    translated = [(x + 5, y - 2, z + 3) for x, y, z in before.active_coordinates]
    atoms = [
        a.model_copy(
            update={
                "id": mapping[a.id],
                "coordinates": translated[n],
                "alternate_location": "A",
                "residue_id": 2 if a.id == 2 else 1,
            }
        )
        for n, a in enumerate(before.atoms)
    ]
    facts = [
        f.model_copy(update={"atom_id": mapping[f.atom_id]})
        for f in protection_facts(before).values()
    ]
    before = before.model_copy(
        update={
            "atoms": atoms,
            "structure_type": "complex",
            "residues": [
                *before.residues,
                Residue(id=2, chain_id=1, name="ALA", component_type="polymer"),
            ],
            "bonds": [
                b.model_copy(
                    update={
                        "id": b.id * 13,
                        "atom_1_id": mapping[b.atom_1_id],
                        "atom_2_id": mapping[b.atom_2_id],
                    }
                )
                for b in before.bonds
            ],
            "conformers": [
                *before.conformers,
                Conformer(id=9, name="Translated", coordinates=translated),
            ],
            "active_conformer_id": 9,
            "annotations": [protection_annotation(facts, "import")],
        }
    )
    result = apply(before, ModelBondSet(operation="bond.set", order=1.0), [mapping[1], mapping[2]])
    assert result.hydrogen_reconciliation_report.status == "complete"
    after = result.edit.structure
    for k, c in enumerate(after.conformers):
        for old in atoms[:2]:
            idx = next(n for n, a in enumerate(after.atoms) if a.id == old.id)
            assert c.coordinates[idx] == before.conformers[k].coordinates[idx]
    for atom in after.atoms:
        if atom.id in result.edit.created_atom_ids:
            parent = next(b.atom_1_id for b in after.bonds if b.atom_2_id == atom.id)
            assert atom.alternate_location == "A"
            assert atom.residue_id == next(a.residue_id for a in after.atoms if a.id == parent)
    assert after.atoms[-1].coordinates == after.conformers[1].coordinates[-1]
    assert before.source == after.source


def test_diagnostic_cap_retains_full_reason_counts() -> None:
    before = model("CC")
    before = before.model_copy(
        update={
            "conformers": [
                Conformer(id=i + 1, name=str(i), coordinates=before.active_coordinates)
                for i in range(101)
            ]
        }
    )
    result = apply(before, ModelBondDelete(operation="bond.delete"))
    report = result.hydrogen_reconciliation_report
    assert len(report.diagnostics) == 200 and report.diagnostics_truncated
    assert report.reason_counts["placement_clash"] == 202


def test_isotope_radical_import_limits_are_visible() -> None:
    before = model("[2H]C")
    assert any(w.code == "isotope_radical_protection_only" for w in before.warnings)
    assert not any(w.code == "isotope_radical_protection_only" for w in model("CC").warnings)


def test_bounded_reconciliation_in_real_protein_context(monkeypatch: pytest.MonkeyPatch) -> None:
    import json
    import time
    import tracemalloc
    from pathlib import Path

    from molweave_core.adapters.defaults import create_default_registry
    from molweave_core.editing import hydrogen
    from molweave_core.molecular import Chain

    path = Path("tests/fixtures/complex/1stp.pdb")
    protein = (
        create_default_registry()
        .for_filename(path.name)
        .parse(path.read_bytes(), path.name)
        .structures[0]
    )
    ligand = model("CCCC")
    offset = max(a.id for a in protein.atoms)
    source_offset = max(a.source_index for a in protein.atoms) + 1
    rid = max(r.id for r in protein.residues) + 1
    cid = max(c.id for c in protein.chains) + 1
    boff = max(b.id for b in protein.bonds)
    atoms = [
        a.model_copy(
            update={
                "id": a.id + offset,
                "source_index": a.source_index + source_offset,
                "residue_id": rid,
                "coordinates": (a.coordinates[0] + 30, *a.coordinates[1:]),
            }
        )
        for a in ligand.atoms
    ]
    facts = [
        f.model_copy(
            update={"atom_id": f.atom_id + offset, "source_index": f.source_index + source_offset}
        )
        for f in protection_facts(ligand).values()
    ]
    structure = protein.model_copy(
        update={
            "atoms": [*protein.atoms, *atoms],
            "chains": [*protein.chains, Chain(id=cid, name="L")],
            "residues": [
                *protein.residues,
                Residue(id=rid, chain_id=cid, name="LIG", component_type="ligand"),
            ],
            "bonds": [
                *protein.bonds,
                *[
                    b.model_copy(
                        update={
                            "id": b.id + boff,
                            "atom_1_id": b.atom_1_id + offset,
                            "atom_2_id": b.atom_2_id + offset,
                        }
                    )
                    for b in ligand.bonds
                ],
            ],
            "conformers": [
                Conformer(
                    id=1,
                    name="Complex",
                    coordinates=[*protein.active_coordinates, *[a.coordinates for a in atoms]],
                )
            ],
            "annotations": [*protein.annotations, protection_annotation(facts, "import")],
        }
    )
    real = hydrogen.normalized_to_mol
    conversions = []

    def bounded(value):  # type: ignore[no-untyped-def]
        conversions.append(len(value.atoms))
        assert len(value.atoms) <= hydrogen.MAX_CONTEXT
        return real(value)

    monkeypatch.setattr(hydrogen, "normalized_to_mol", bounded)
    tracemalloc.start()
    start = time.perf_counter()
    from molweave_core.editing.model import DirectMolecularEditor

    result = DirectMolecularEditor().edit(
        structure,
        [offset + 1, offset + 4],
        ModelBondSet(operation="bond.set", order=1.0),
        next_atom_id=5000,
        next_bond_id=5000,
        hydrogen_policy="reconcile_if_possible",
    )
    elapsed = time.perf_counter() - start
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert result.hydrogen_reconciliation_report.removed_hydrogen_count == 2
    assert result.edit.structure.atoms[: len(protein.atoms)] == protein.atoms
    assert (
        result.edit.structure.conformers[0].coordinates[: len(protein.atoms)]
        == protein.active_coordinates
    )
    assert elapsed < 5.0 and peak < 64 * 1024 * 1024
    print(
        json.dumps(
            {
                "profile": "issue81-1stp-butane",
                "atoms": len(structure.atoms),
                "seconds": elapsed,
                "peak_python_bytes": peak,
                "chemistry_context_sizes": conversions,
                "limits": "5s/64MiB Python-traced allocations; native allocator memory excluded",
            }
        )
    )


@pytest.mark.parametrize("label", ["[1H]", "[2H]", "[3H]"])
def test_every_explicit_h_isotope_label_protects_destructive_reconciliation(label: str) -> None:
    before = model(label + "CC")
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0), [2, 3])
    assert "protected_identity" in result.hydrogen_reconciliation_report.reason_counts
    assert result.edit.structure.atoms[0] == before.atoms[0]


def test_current_stereo_does_not_ignore_remote_isotope_priority() -> None:
    before = model("FCC([13CH2]CCl)C(CC)N")
    assert protection_facts(before)[4].isotope == 13
    result = apply(before, ModelBondSet(operation="bond.set", order=2.0), [3, 7])
    assert result.hydrogen_reconciliation_report.completed_count == 2
    assert "stereo_protection_unresolved" in result.hydrogen_reconciliation_report.reason_counts
    bond = next(b for b in result.edit.structure.bonds if {b.atom_1_id, b.atom_2_id} == {3, 7})
    assert bond.stereo is None
    assert result.edit.structure.source == before.source
