from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.export_policy import (
    ExportFilters,
    ExportInput,
    ExportPolicyError,
    deterministic_zip,
    filter_structure,
    prepare_export,
    safe_export_stem,
)
from molweave_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def load_structure(filename: str) -> NormalizedStructureV1:
    registry = create_default_registry()
    return (
        registry.for_filename(filename)
        .parse((FIXTURES / filename).read_bytes(), filename)
        .structures[0]
    )


def with_hydrogen(structure: NormalizedStructureV1) -> NormalizedStructureV1:
    atom_id = max(atom.id for atom in structure.atoms) + 1
    bond_id = max((bond.id for bond in structure.bonds), default=0) + 1
    coordinates = [*structure.active_coordinates, (0.0, 0.0, 1.0)]
    atom = Atom(
        id=atom_id,
        name="H",
        element="H",
        coordinates=coordinates[-1],
        residue_id=structure.atoms[0].residue_id,
        source_index=len(structure.atoms),
    )
    return structure.model_copy(
        update={
            "atoms": [*structure.atoms, atom],
            "bonds": [
                *structure.bonds,
                Bond(id=bond_id, atom_1_id=structure.atoms[0].id, atom_2_id=atom_id),
            ],
            "conformers": [
                Conformer(id=1, name="Model 1", coordinates=coordinates),
            ],
        }
    )


def test_filter_removes_hydrogens_waters_and_ions_without_mutating_source() -> None:
    source = with_hydrogen(load_structure("protein_editing.pdb"))

    filtered, warnings = filter_structure(
        source,
        ExportFilters(
            include_hydrogens=False,
            include_waters=False,
            include_ions=False,
        ),
    )

    assert len(source.atoms) == 23
    assert len(filtered.atoms) == 20
    assert all(atom.element != "H" for atom in filtered.atoms)
    assert {residue.component_type for residue in filtered.residues} == {"polymer"}
    assert {warning.code for warning in warnings} == {
        "hydrogens_excluded",
        "waters_excluded",
        "ions_excluded",
    }
    assert all(
        len(conformer.coordinates) == len(filtered.atoms)
        for conformer in filtered.conformers
    )


def test_filter_rejects_an_empty_structure() -> None:
    source = load_structure("water.xyz")
    atom = source.atoms[0].model_copy(update={"element": "H"})
    hydrogen = source.model_copy(update={"atoms": [atom]})

    with pytest.raises(ExportPolicyError, match="every atom") as raised:
        filter_structure(hydrogen, ExportFilters(include_hydrogens=False))

    assert raised.value.code == "empty_export"


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("../unsafe protein", "unsafe_protein"),
        ("CON.pdb", "_CON"),
        ("alpha/beta", "beta"),
        ("  ", "structure"),
        ("cafe\u0301", "cafe"),
    ],
)
def test_safe_export_stem_is_portable(name: str, expected: str) -> None:
    assert safe_export_stem(name) == expected


def test_separate_export_is_deterministic_and_collision_safe() -> None:
    structure = load_structure("ethanol.mol")
    inputs = [
        ExportInput("b", "same?name", structure),
        ExportInput("a", "same name", structure),
    ]

    first = prepare_export(
        inputs,
        format_name="mol",
        mode="separate",
        filters=ExportFilters(),
        bundle_name="Experiment",
    )
    second = prepare_export(
        list(reversed(inputs)),
        format_name="mol",
        mode="separate",
        filters=ExportFilters(),
        bundle_name="Experiment",
    )

    assert first.data == second.data
    assert first.filename == "Experiment-mol.zip"
    with zipfile.ZipFile(io.BytesIO(first.data)) as archive:
        assert archive.namelist() == ["same_name-2.mol", "same_name.mol"]
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist())
    assert {report.output_filename for report in first.reports} == {
        "same_name.mol",
        "same_name-2.mol",
    }


@pytest.mark.parametrize(("format_name", "extension"), [("sdf", ".sdf"), ("smiles", ".smi")])
def test_supported_multi_record_export_round_trips(
    format_name: str, extension: str
) -> None:
    structure = load_structure("ethanol.mol")
    prepared = prepare_export(
        [
            ExportInput("a", "first", structure),
            ExportInput("b", "second", structure),
        ],
        format_name=format_name,
        mode="multi_record",
        filters=ExportFilters(),
        bundle_name="Batch",
    )

    assert prepared.filename == f"Batch{extension}"
    parsed = create_default_registry().for_format(format_name).parse(
        prepared.data, prepared.filename
    )
    assert len(parsed.structures) == 2
    assert [report.record_index for report in prepared.reports] == [0, 1]


def test_multi_record_mode_rejects_a_single_record_format() -> None:
    with pytest.raises(ExportPolicyError, match="does not support") as raised:
        prepare_export(
            [ExportInput("a", "entry", load_structure("ethanol.mol"))],
            format_name="pdb",
            mode="multi_record",
            filters=ExportFilters(),
            bundle_name="Batch",
        )

    assert raised.value.code == "multi_record_unsupported"


def test_deterministic_zip_rejects_duplicate_or_unsafe_names() -> None:
    with pytest.raises(ExportPolicyError, match="unique"):
        deterministic_zip([("same.mol", b"a"), ("same.mol", b"b")])
    with pytest.raises(ExportPolicyError, match="unsafe"):
        deterministic_zip([("../escape.mol", b"a")])
