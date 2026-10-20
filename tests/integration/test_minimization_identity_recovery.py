from __future__ import annotations

import hashlib

import pytest
from molweave_api.import_export import NORMALIZED_MEDIA_TYPE, ArtifactService
from molweave_api.models import StructureEntry
from molweave_core.artifacts import LocalArtifactStore
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.molecular import NormalizedStructureV1
from rdkit import Chem

from tests.integration.test_coordinate_commands import _structure
from tests.integration.test_minimization_apply import apply, calculate, seeded_project
from tests.integration.test_minimization_jobs import minclient as minclient
from tests.support.minimization import molecule


def legacy(client, project, *, unknown=False, mismatch=False):
    entry = project["entries"][0]
    before = NormalizedStructureV1.model_validate(_structure(client, project["id"], entry["id"]))
    annotations = []
    if unknown:
        fact = protection_facts(before)[1].model_copy(update={"isotope": None})
        annotations = [
            {
                "kind": "neistra_hydrogen_protection",
                "schema_version": 1,
                "origin": "import",
                "atoms": [fact.model_dump()],
            }
        ]
    atoms = before.atoms
    if mismatch:
        atoms = [
            a.model_copy(update={"source_index": a.source_index + 1000}) if a.id == 1 else a
            for a in atoms
        ]
    value = before.model_copy(update={"annotations": annotations, "atoms": atoms})
    with client.app.state.session_factory() as session:
        artifact = ArtifactService(
            session, LocalArtifactStore(client.app.state.settings.data_dir)
        ).publish(value.to_bytes(), "legacy.json", NORMALIZED_MEDIA_TYPE)
        row = session.get(StructureEntry, entry["id"])
        row.current_artifact_id = artifact.id
        session.commit()
    return client.get(f"/api/v1/projects/{project['id']}").json(), value.model_dump(mode="json")


def test_verified_original_identity_is_calculation_local_and_retained_in_job(minclient):
    project, before = legacy(minclient, seeded_project(minclient, molecule()))
    entry = project["entries"][0]
    path = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    original = minclient.get(path).content
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    assert proposal["applicable"], proposal
    parameters = proposal["report"]["parameters"]
    assert parameters["schema_version"] == 2 and parameters["acceptance_policy"] == "strict"
    proof = parameters["captured_inputs"][0]["identity_recovery"]
    assert proof["original_sha256"] == hashlib.sha256(original).hexdigest()
    assert [a["atom_id"] for a in proof["atoms"]] == entry["atom_ids"]
    assert all(a["isotope"] == 0 and a["radical_electrons"] == 0 for a in proof["atoms"])
    assert any("Verified legacy identity" in w for w in proposal["report"]["warnings"])
    assert _structure(minclient, project["id"], entry["id"]) == before
    response = apply(minclient, project, job_id, proposal)
    assert response.status_code == 200, response.text
    after = _structure(minclient, project["id"], entry["id"])
    assert not any(a.get("kind") == "neistra_hydrogen_protection" for a in after["annotations"])
    assert minclient.get(path).content == original
    undone = minclient.post(
        f"/api/v1/projects/{project['id']}/history/undo",
        json={"expected_revision": response.json()["revision"]},
    )
    assert undone.status_code == 200 and _structure(minclient, project["id"], entry["id"]) == before


@pytest.mark.parametrize("damage", ["unknown", "mapping", "corrupt-original"])
def test_unverifiable_identity_never_becomes_ordinary(minclient, damage):
    project, before = legacy(
        minclient,
        seeded_project(minclient, molecule()),
        unknown=damage == "unknown",
        mismatch=damage == "mapping",
    )
    entry = project["entries"][0]
    if damage == "corrupt-original":
        with minclient.app.state.session_factory() as session:
            row = session.get(StructureEntry, entry["id"])
            service = ArtifactService(
                session, LocalArtifactStore(minclient.app.state.settings.data_dir)
            )
            record = service.get(row.original_artifact_id)
            (minclient.app.state.settings.data_dir / record.relative_path).write_bytes(
                b"corrupted original"
            )
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    assert not proposal["applicable"] and proposal["report"]["outcome"] == "blocked", proposal
    capture = proposal["report"]["parameters"]["captured_inputs"][0]
    assert not any(a["atom_id"] == 1 for a in capture.get("identity_recovery", {}).get("atoms", []))
    assert apply(minclient, project, job_id, proposal).status_code == 409
    assert _structure(minclient, project["id"], entry["id"]) == before


def test_protected_original_is_recovered_as_protected_and_refused(minclient):
    project = minclient.post("/api/v1/projects", json={"name": "Legacy isotope"}).json()
    mol = Chem.AddHs(Chem.MolFromSmiles("[2H]CC"))
    from rdkit.Chem import AllChem

    assert AllChem.EmbedMolecule(mol, randomSeed=89) == 0
    source = Chem.MolToMolBlock(mol).encode()
    response = minclient.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={
            "expected_revision": project["revision"],
            "infer_bonds": "false",
            "generate_3d": "false",
        },
        files={"files": ("isotope.mol", source, "chemical/x-mdl-molfile")},
    )
    assert response.status_code == 201, response.text
    project, before = legacy(minclient, response.json()["project"])
    entry = project["entries"][0]
    proposal, _ = calculate(minclient, project, {entry["id"]: [3]})
    assert proposal["report"]["outcome"] == "blocked" and not proposal["applicable"]
    proof = proposal["report"]["parameters"]["captured_inputs"][0]["identity_recovery"]
    assert any(f["isotope"] == 2 for f in proof["atoms"])
    assert _structure(minclient, project["id"], entry["id"]) == before


def test_changed_original_dependency_blocks_final_apply(minclient):
    project, before = legacy(minclient, seeded_project(minclient, molecule()))
    entry = project["entries"][0]
    proposal, job_id = calculate(minclient, project, {entry["id"]: [3]})
    assert proposal["applicable"]
    with minclient.app.state.session_factory() as session:
        row = session.get(StructureEntry, entry["id"])
        service = ArtifactService(
            session, LocalArtifactStore(minclient.app.state.settings.data_dir)
        )
        record = service.get(row.original_artifact_id)
        (minclient.app.state.settings.data_dir / record.relative_path).write_bytes(
            b"corrupt after capture"
        )
    checked = minclient.get(
        f"/api/v1/projects/{project['id']}/minimizations/{job_id}/proposal"
    ).json()
    assert not checked["applicable"] and "original identity" in checked["unavailable_reason"]
    assert apply(minclient, project, job_id, proposal).status_code == 409
    assert _structure(minclient, project["id"], entry["id"]) == before
