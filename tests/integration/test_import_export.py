from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import httpx
import pytest
from molweave_api.database import Base
from molweave_api.import_export import ImportExportService, UploadPayload
from molweave_api.main import create_app
from molweave_api.models import Artifact
from molweave_api.settings import Settings
from sqlalchemy import func, select

from tests.support.api_client import ApiClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "formats"


def create_project(client: ApiClient, name: str = "Molecular workspace") -> dict[str, Any]:
    response = client.post("/api/v1/projects", json={"name": name})
    assert response.status_code == 201
    return cast(dict[str, Any], response.json())


def upload(
    client: ApiClient,
    project_id: str,
    expected_revision: int,
    filenames: list[str],
) -> httpx.Response:
    return client.post(
        f"/api/v1/projects/{project_id}/imports",
        data={
            "expected_revision": expected_revision,
            "generate_3d": "true",
            "infer_bonds": "true",
        },
        files=[
            (
                "files",
                (
                    filename,
                    (FIXTURES / Path(filename).name).read_bytes(),
                    "application/octet-stream",
                ),
            )
            for filename in filenames
        ],
    )


def test_multi_file_import_is_lazy_durable_and_preserves_original_bytes(
    client: ApiClient,
) -> None:
    project = create_project(client)
    response = upload(
        client,
        project["id"],
        0,
        ["protein_models_altloc.pdb", "../../ethanol.mol"],
    )

    assert response.status_code == 201
    imported = response.json()
    assert imported["project"]["revision"] == 1
    assert len(imported["imported_entry_ids"]) == 2
    entries = {entry["source_format"]: entry for entry in imported["project"]["entries"]}
    assert entries["pdb"]["conformer_count"] == 2
    assert entries["mol"]["atom_count"] == 3
    assert entries["mol"]["original_filename"] == "ethanol.mol"
    assert "normalized_data" not in entries["pdb"]
    assert imported["project"]["history"]["undo_description"] == (
        "Import 2 structures from 2 files"
    )

    protein = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entries['pdb']['id']}/structure"
    )
    ligand = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entries['mol']['id']}/structure"
    )
    assert protein.status_code == ligand.status_code == 200
    assert protein.json()["viewer"]["format"] == "mmcif"
    assert ligand.json()["viewer"]["format"] == "sdf"
    assert len(protein.json()["structure"]["conformers"]) == 2
    assert len(ligand.json()["structure"]["atoms"]) == 3

    original = client.get(
        f"/api/v1/projects/{project['id']}/entries/{entries['mol']['id']}/original"
    )
    assert original.status_code == 200
    assert original.content == (FIXTURES / "ethanol.mol").read_bytes()

    undone = client.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": 1},
    ).json()
    assert undone["entries"] == []
    redone = client.post(
        f"/api/v1/projects/{project['id']}/history/redo",
        json={"expected_revision": 2},
    ).json()
    assert len(redone["entries"]) == 2
    restored_ligand = next(entry for entry in redone["entries"] if entry["source_format"] == "mol")
    restored = client.get(
        f"/api/v1/projects/{project['id']}/entries/{restored_ligand['id']}/structure"
    )
    assert restored.status_code == 200
    assert restored.json()["structure"]["title"] == "Ethanol"


@pytest.mark.parametrize(
    "target_format",
    ["pdb", "mmcif", "sdf", "mol", "mol2", "xyz", "smiles"],
)
def test_api_exports_each_supported_format_and_keeps_original(
    client: ApiClient, target_format: str
) -> None:
    project = create_project(client)
    imported = upload(client, project["id"], 0, ["ethanol.mol"]).json()
    entry_id = imported["imported_entry_ids"][0]

    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/exports",
        json={"format": target_format, "acknowledge_losses": True},
    )
    assert response.status_code == 201
    exported = response.json()
    extension = {"mmcif": "cif", "smiles": "smi"}.get(target_format, target_format)
    assert exported["artifact"]["filename"].endswith(f".{extension}")
    artifact = client.get(exported["artifact"]["download_url"])
    assert artifact.status_code == 200
    assert artifact.content

    original = client.get(f"/api/v1/projects/{project['id']}/entries/{entry_id}/original")
    assert original.content == (FIXTURES / "ethanol.mol").read_bytes()


def test_export_requires_explicit_acknowledgement_for_blocking_losses(
    client: ApiClient,
) -> None:
    project = create_project(client)
    imported = upload(client, project["id"], 0, ["tripos_benzene.mol2"]).json()
    entry_id = imported["imported_entry_ids"][0]

    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry_id}/exports",
        json={"format": "xyz"},
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "export_loss_acknowledgement_required"
    assert {warning["code"] for warning in detail["warnings"]} >= {
        "connectivity_lost",
        "bond_orders_lost",
    }


def test_sdf_records_commit_as_separate_entries(client: ApiClient) -> None:
    project = create_project(client)
    response = upload(client, project["id"], 0, ["molecules.sdf"])

    assert response.status_code == 201
    imported = response.json()
    assert len(imported["imported_entry_ids"]) == 2
    assert {entry["name"] for entry in imported["project"]["entries"]} == {
        "Ethanol",
        "Carbonyl",
    }


@pytest.mark.parametrize(
    ("filename", "expected_code"),
    [
        ("malformed.pdb", "no_atoms"),
        ("unknown.foo", "unsupported_format"),
    ],
)
def test_import_failure_is_structured_and_does_not_mutate_project(
    client: ApiClient,
    filename: str,
    expected_code: str,
) -> None:
    project = create_project(client)
    if filename == "unknown.foo":
        files = [("files", (filename, b"not a molecule", "text/plain"))]
        response = client.post(
            f"/api/v1/projects/{project['id']}/imports",
            data={"expected_revision": 0},
            files=files,
        )
    else:
        response = upload(client, project["id"], 0, [filename])

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == expected_code
    assert detail["filename"] == filename
    assert detail["operation"] == "import"
    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["revision"] == 0
    assert unchanged["entries"] == []


def test_stale_import_is_rejected_before_artifact_publication(client: ApiClient) -> None:
    project = create_project(client)
    client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"expected_revision": 0, "name": "Changed", "description": None},
    )

    response = upload(client, project["id"], 0, ["ethanol.mol"])

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "revision_conflict"
    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["entries"] == []


def test_size_and_atom_limits_are_actionable(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'limits.db'}",
        auto_create_schema=True,
        max_structure_file_bytes=10,
        max_upload_request_bytes=20,
        atom_warning_limit=2,
        atom_hard_limit=20,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = create_project(client)

    too_large = upload(client, project["id"], 0, ["ethanol.mol"])
    assert too_large.status_code == 413
    assert too_large.json()["detail"]["code"] == "structure_file_too_large"
    app.state.engine.dispose()

    atom_settings = Settings(
        data_dir=tmp_path / "atoms",
        database_url=f"sqlite:///{tmp_path / 'atoms.db'}",
        auto_create_schema=True,
        atom_warning_limit=2,
        atom_hard_limit=20,
    )
    atom_app = create_app(atom_settings)
    Base.metadata.create_all(atom_app.state.engine)
    atom_client = ApiClient(atom_app)
    atom_project = create_project(atom_client)
    warning_import = upload(atom_client, atom_project["id"], 0, ["ethanol.mol"])
    assert warning_import.status_code == 201
    assert "atom_warning_limit_exceeded" in {
        warning["code"] for warning in warning_import.json()["warnings"]
    }
    atom_app.state.engine.dispose()

    hard_settings = Settings(
        data_dir=tmp_path / "hard",
        database_url=f"sqlite:///{tmp_path / 'hard.db'}",
        auto_create_schema=True,
        atom_warning_limit=2,
        atom_hard_limit=2,
    )
    hard_app = create_app(hard_settings)
    Base.metadata.create_all(hard_app.state.engine)
    hard_client = ApiClient(hard_app)
    hard_project = create_project(hard_client)
    hard_failure = upload(hard_client, hard_project["id"], 0, ["ethanol.mol"])
    assert hard_failure.status_code == 413
    assert hard_failure.json()["detail"]["code"] == "atom_hard_limit_exceeded"
    hard_app.state.engine.dispose()


def test_prepared_import_can_be_cancelled_without_committing_artifacts(
    tmp_path: Path,
) -> None:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'cancel.db'}",
        auto_create_schema=True,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    client = ApiClient(app)
    project = create_project(client)

    with app.state.session_factory() as session:
        prepared = ImportExportService(session, settings).prepare(
            [
                UploadPayload(
                    filename="ethanol.mol",
                    data=(FIXTURES / "ethanol.mol").read_bytes(),
                )
            ]
        )
        assert prepared[0].structures
        assert session.scalar(select(func.count()).select_from(Artifact)) == 0

    unchanged = client.get(f"/api/v1/projects/{project['id']}").json()
    assert unchanged["revision"] == 0
    assert unchanged["entries"] == []
    assert list((tmp_path / "artifacts" / "sha256").rglob("*")) == []
    app.state.engine.dispose()
