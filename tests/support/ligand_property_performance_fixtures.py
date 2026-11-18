"""Frozen idealized/unoptimized editable benchmark originals, never production embedding.

Generate once with pinned library/settings; reparse and qualify every serialized
artifact independently. Runtime only reads frozen bytes. Scientific imports are lazy.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/ligand-properties-performance/editable"
SETTINGS = {
    "method": "idealized-unoptimized-linear-zigzag-v1",
    "internal_angle": "acos(-1/3)",
    "lengths": "existing covalent_length",
    "hydrogens": "Chem.AddHs(addCoords=True)",
    "format": "SDF V3000",
    "coordinate_precision": 12,
    "includeStereo": False,
    "optimization": None,
    "randomness": None,
    "title": "capacity",
}


@dataclass(frozen=True)
class FixtureSpec:
    id: str
    smiles: str


def specifications() -> tuple[FixtureSpec, ...]:
    rows = []
    for profile in ("chromium", "mobile-chromium"):
        for size in range(10, 87, 4):
            smiles = (
                "C" * size
                if profile == "chromium"
                else "C" * (size // 2) + "O" + "C" * (size - size // 2 - 1)
            )
            rows.append(FixtureSpec(f"paired-{profile}-{size}", smiles))
        for kind in ("repeated", "distinct"):
            smiles = (
                "C" * 41
                + ("O" if kind == "distinct" else "N")
                + ("O" if profile == "mobile-chromium" else "C")
            )
            rows.append(FixtureSpec(f"bulk-active-{profile}-{kind}", smiles))
    return tuple(rows)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def chemistry_facts(molecule: Any) -> dict[str, Any]:
    return {
        "atoms": [
            [
                a.GetSymbol(),
                a.GetFormalCharge(),
                a.GetIsotope(),
                a.GetNumRadicalElectrons(),
                int(a.GetChiralTag()),
                a.GetTotalNumHs(includeNeighbors=True),
            ]
            for a in molecule.GetAtoms()
        ],
        "bonds": [
            [
                b.GetBeginAtomIdx(),
                b.GetEndAtomIdx(),
                b.GetBondTypeAsDouble(),
                b.GetIsAromatic(),
                int(b.GetStereo()),
            ]
            for b in molecule.GetBonds()
        ],
    }


def generate_sdf(spec: FixtureSpec) -> bytes:
    from neistra_core.editing.geometry import covalent_length
    from rdkit import Chem

    molecule = Chem.MolFromSmiles(spec.smiles)
    assert molecule is not None and 10 <= molecule.GetNumAtoms() <= 100
    count = molecule.GetNumAtoms()
    assert molecule.GetNumBonds() == count - 1
    assert all(
        a.GetSymbol() in {"C", "N", "O"}
        and a.GetFormalCharge() == 0
        and a.GetIsotope() == a.GetNumRadicalElectrons() == int(a.GetChiralTag()) == 0
        for a in molecule.GetAtoms()
    )
    assert all(
        {b.GetBeginAtomIdx(), b.GetEndAtomIdx()} == {i, i + 1} and b.GetBondTypeAsDouble() == 1
        for i, b in enumerate(molecule.GetBonds())
    )
    conformer = Chem.Conformer(count)
    conformer.Set3D(True)
    angle = (math.pi - math.acos(-1 / 3)) / 2
    x, y = 0.0, 0.0
    conformer.SetAtomPosition(0, (x, y, 0.0))
    for index in range(1, count):
        length = covalent_length(
            molecule.GetAtomWithIdx(index - 1).GetSymbol(),
            molecule.GetAtomWithIdx(index).GetSymbol(),
        )
        x += length * math.cos(angle)
        y += (1 if index % 2 else -1) * length * math.sin(angle)
        conformer.SetAtomPosition(index, (x, y, 0.0))
    molecule.AddConformer(conformer)
    molecule = Chem.AddHs(molecule, addCoords=True)
    molecule.SetProp("_Name", "capacity")
    params: Any = Chem.MolWriterParams()
    params.forceV3000, params.includeStereo, params.precision = True, False, 12
    block = Chem.MolToMolBlock(molecule, params)
    return (block + "$$$$\n").encode()


def source_identities() -> dict[str, Any]:
    import rdkit
    from rdkit import rdBase
    from rdkit.Chem import rdmolops

    paths = [
        "tests/support/ligand_property_performance_fixtures.py",
        "packages/neistra_core/src/neistra_core/editing/geometry.py",
        "packages/neistra_core/src/neistra_core/adapters/ligand.py",
        "packages/neistra_core/src/neistra_core/adapters/rdkit_common.py",
        "packages/neistra_core/src/neistra_core/editing/model.py",
        "tests/support/ligand_property_performance_qualification.py",
        "apps/api/src/neistra_api/project_service.py",
        "apps/api/src/neistra_api/model_edit_service.py",
        "packages/neistra_core/src/neistra_core/ligand_properties/calculate.py",
        "packages/neistra_core/src/neistra_core/ligand_properties/input.py",
    ]
    return {
        "repository_sources": {name: sha((ROOT / name).read_bytes()) for name in paths},
        "rdkit_version": rdBase.rdkitVersion,
        "rdkit_python_sha256": sha(Path(rdkit.__file__).read_bytes()),
        "rdmolops_binary_sha256": sha(Path(rdmolops.__file__).read_bytes()),
    }


def generate(output: Path, selected: set[str] | None = None) -> dict[str, Any]:
    assert not output.exists(), "Use a fresh output; preserve earlier generation"
    output.mkdir(parents=True)
    from rdkit import Chem

    rows = []
    for spec in specifications():
        if selected is not None and spec.id not in selected:
            continue
        payload = generate_sdf(spec)
        assert payload == generate_sdf(spec), "Generator must reproduce identical bytes"
        (output / (spec.id + ".sdf")).write_bytes(payload)
        intended = Chem.AddHs(Chem.MolFromSmiles(spec.smiles))
        rows.append(
            {
                "id": spec.id,
                "intended_smiles": spec.smiles,
                "filename": spec.id + ".sdf",
                "sha256": sha(payload),
                "bytes": len(payload),
                "heavy_atoms": len(spec.smiles),
                "canonical_heavy_graph": Chem.MolToSmiles(Chem.MolFromSmiles(spec.smiles)),
                "chemistry_facts": chemistry_facts(intended),
                "contains_oxygen_oxygen_bond": "OO" in spec.smiles,
            }
        )
    if selected is not None:
        assert len(rows) == len(selected)
    assert len({row["canonical_heavy_graph"] for row in rows}) == len(rows)
    manifest = {
        "schema_version": 1,
        "scope": (
            "Frozen idealized/unoptimized setup originals; no low-energy/preparation prediction"
        ),
        "settings": SETTINGS,
        "source_identities": source_identities(),
        "fixtures": rows,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def load_fixture(identity: str, directory: Path = FIXTURES) -> tuple[dict[str, Any], bytes]:
    assert identity in {spec.id for spec in specifications()}
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["schema_version"] == 1 and manifest["settings"] == SETTINGS
    rows = [row for row in manifest["fixtures"] if row["id"] == identity]
    assert len(rows) == 1
    row = rows[0]
    assert row["filename"] == identity + ".sdf"
    assert row["intended_smiles"] == next(s.smiles for s in specifications() if s.id == identity)
    path = directory / row["filename"]
    assert not path.is_symlink() and path.resolve().parent == directory.resolve()
    assert 0 < row["bytes"] <= 4 * 1024 * 1024
    with path.open("rb") as handle:
        payload = handle.read(4 * 1024 * 1024 + 1)
    assert len(payload) == row["bytes"] and sha(payload) == row["sha256"]
    return row, payload


def verify_original(payload: bytes, intended_smiles: str, filename: str) -> Any:
    from neistra_core.adapters.ligand import SdfAdapter
    from rdkit import Chem

    molecule = next(iter(Chem.ForwardSDMolSupplier(io.BytesIO(payload), removeHs=False)))
    assert molecule is not None
    intended = Chem.AddHs(Chem.MolFromSmiles(intended_smiles))
    assert chemistry_facts(molecule) == chemistry_facts(intended)
    parsed = SdfAdapter().parse(payload, filename)
    assert len(parsed.structures) == 1
    structure = parsed.structures[0]
    assert [a.element for a in structure.atoms] == [a.GetSymbol() for a in molecule.GetAtoms()]
    assert [a.formal_charge for a in structure.atoms] == [
        a.GetFormalCharge() for a in molecule.GetAtoms()
    ]
    assert all(a.stereo is None for a in structure.atoms)
    return structure


def history_control(payload: bytes, filename: str, output: Path) -> dict[str, Any]:
    from neistra_api.database import Base, create_database_engine, create_session_factory
    from neistra_api.import_export import ArtifactService, ImportExportService, UploadPayload
    from neistra_api.model_edit_service import ModelEditService
    from neistra_api.models import CommandRecord
    from neistra_api.project_service import ProjectService
    from neistra_api.schemas import ModelEditCreate
    from neistra_api.settings import Settings
    from neistra_core.artifacts import LocalArtifactStore
    from neistra_core.ligand_properties import calculate_properties
    from sqlalchemy import select

    output.mkdir()
    settings = Settings(data_dir=output, database_url=f"sqlite:///{output / 'history.db'}")
    engine = create_database_engine(settings.database_url)
    Base.metadata.create_all(engine)
    try:
        with create_session_factory(engine)() as session:
            artifacts = ArtifactService(session, LocalArtifactStore(output))
            projects = ProjectService(
                session,
                load_structure=artifacts.load_normalized,
                load_original_bytes=artifacts.read_verified_bytes,
            )
            project = projects.create_project("Offline fixture history", None)
            imports = ImportExportService(session, settings)
            project = imports.commit_import(
                project.id,
                project.revision,
                imports.prepare([UploadPayload(filename, payload)], generate_3d=False),
            ).project
            entry = project.entries[0]
            before_id, original_id = entry.current_artifact_id, entry.original_artifact_id
            assert before_id is not None and original_id is not None
            before = artifacts.read_verified_bytes(before_id)
            before_structure = artifacts.load_normalized(before_id)
            before_report = calculate_properties(
                before_structure, [atom.id for atom in before_structure.atoms], original_bytes=None
            )
            assert artifacts.read_verified_bytes(original_id) == payload
            response = ModelEditService(session, settings).model_edit(
                project.id,
                entry.id,
                ModelEditCreate.model_validate(
                    {
                        "expected_revision": project.revision,
                        "expected_artifact_id": before_id,
                        "selection": {"atoms": [{"structure_id": entry.id, "atom_id": 1}]},
                        "action": {"operation": "atom.element", "element": "N"},
                        "hydrogen_policy": "automatic",
                    }
                ),
            )
            edited = response.project.entries[0]
            assert (
                edited.current_artifact_id is not None and edited.current_artifact_id != before_id
            )
            edited_structure = artifacts.load_normalized(edited.current_artifact_id)
            edited_report = calculate_properties(
                edited_structure, [atom.id for atom in edited_structure.atoms], original_bytes=None
            )
            for report in (before_report, edited_report):
                assert report.model_status == "qualified" and len(report.values) == 14
                assert all(value.status == "ready" for value in report.values)
            assert response.hydrogen_reconciliation_report is not None
            assert response.hydrogen_reconciliation_report.status == "complete"
            assert response.hydrogen_reconciliation_report.skipped_count == 0
            assert response.hydrogen_reconciliation_report.unprocessed_count == 0
            command = session.scalar(
                select(CommandRecord)
                .where(CommandRecord.project_id == project.id, CommandRecord.is_applied.is_(True))
                .order_by(CommandRecord.position.desc())
            )
            assert command is not None
            inverse = command.inverse_actions
            assert any(
                action["kind"] == "entry.molecule" and action["artifact_id"] == before_id
                for action in inverse
            )
            restored = projects.undo(project.id, response.project.revision)
            restored_entry = restored.entries[0]
            assert restored_entry.current_artifact_id == before_id
            assert artifacts.read_verified_bytes(restored_entry.current_artifact_id) == before
            assert artifacts.read_verified_bytes(original_id) == payload
            return {
                "method": (
                    "actual ModelEditService publication and ProjectService.undo inverse replay"
                ),
                "before_artifact_id": before_id,
                "edited_artifact_id": edited.current_artifact_id,
                "restored_artifact_id": restored_entry.current_artifact_id,
                "canonical_bytes_ids_graph_coordinates_restored": True,
                "actual_before_report": before_report.model_dump(mode="json"),
                "actual_edited_report": edited_report.model_dump(mode="json"),
                "original_sha256": sha(payload),
                "original_preserved": True,
                "inverse_actions": inverse,
                "revision_after_undo": restored.revision,
            }
    finally:
        engine.dispose()


def qualify(directory: Path, output: Path, selected: set[str] | None = None) -> dict[str, Any]:
    from tests.support.ligand_property_performance_qualification import fixture_trial

    assert not output.exists()
    output.mkdir(parents=True)
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["source_identities"] == source_identities()
    results = []
    for row in manifest["fixtures"]:
        if selected is not None and row["id"] not in selected:
            continue
        print("START", row["id"], flush=True)
        record, payload = load_fixture(row["id"], directory)
        before = verify_original(payload, record["intended_smiles"], record["filename"])
        trial = fixture_trial(
            before, payload, record["filename"], intended_smiles=record["intended_smiles"]
        )
        history = history_control(payload, record["filename"], output / row["id"])
        results.append(
            {"id": row["id"], "sha256": sha(payload), "trial": trial, "history": history}
        )
        (output / "results.json").write_text(
            json.dumps(
                {
                    "scope": "Offline all-original reparse/editor/kernel/history controls only",
                    "complete": False,
                    "cases": results,
                },
                indent=2,
            )
            + "\n"
        )
        print("PASS", row["id"], flush=True)
    assert len(results) == (len(selected) if selected is not None else 44)
    result = {
        "scope": (
            "Offline serialized originals, strict kernel and authentic history; "
            "no API/worker/cache measurement"
        ),
        "complete": True,
        "count": len(results),
        "cases": results,
    }
    (output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("generate", "qualify"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixtures", type=Path, default=FIXTURES)
    parser.add_argument("--ids", nargs="+")
    args = parser.parse_args()
    selected = set(args.ids) if args.ids else None
    if args.command == "generate":
        generate(args.output, selected)
    else:
        qualify(args.fixtures, args.output, selected)


if __name__ == "__main__":
    main()
