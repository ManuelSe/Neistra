"""Execute quick producer and actual tagged v0.22.1 API/core retention separately."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import molweave_api.main
import molweave_core
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.support.api_client import ApiClient
from tests.support.modeling_reader_qualification import allocation_counters, canonical


def original_hashes(client: ApiClient, project: dict[str, Any]) -> dict[str, str]:
    hashes = {}
    for entry in project["entries"]:
        response = client.get(f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original")
        assert response.status_code == 200, response.text
        hashes[entry["name"]] = hashlib.sha256(response.content).hexdigest()
    return hashes


def result_hashes(client: ApiClient, job: dict[str, Any]) -> dict[str, str]:
    hashes = {}
    for result in job["results"]:
        artifact = result["artifact"]
        response = client.get(artifact["download_url"])
        assert response.status_code == 200, response.text
        digest = hashlib.sha256(response.content).hexdigest()
        assert digest == artifact["sha256"] and len(response.content) == artifact["size"]
        hashes[result["role"]] = digest
    return hashes


def produce(client: ApiClient, data: Path) -> dict[str, Any]:
    from molweave_core.molecular import Conformer

    from tests.integration.test_job_lifecycle import _worker
    from tests.integration.test_minimization_apply import seeded_project
    from tests.integration.test_quick_minimization import apply_quick
    from tests.support.minimization import molecule, peptide, translated

    ligand = molecule()
    coordinates = [(x + 1, y + 2, z + 3) for x, y, z in ligand.active_coordinates]
    active = ligand.model_copy(
        update={
            "active_conformer_id": 7,
            "conformers": [
                *ligand.conformers,
                Conformer(id=7, name="Active7", coordinates=coordinates),
            ],
            "atoms": [
                a.model_copy(update={"coordinates": coordinates[i]})
                for i, a in enumerate(ligand.atoms)
            ],
        }
    )
    radical = molecule("[CH3]")
    coordinates = list(radical.active_coordinates)
    coordinates[-1] = (coordinates[-1][0] + 0.8, *coordinates[-1][1:])
    radical = radical.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": coordinates[i]})
                for i, a in enumerate(radical.atoms)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": coordinates}) for c in radical.conformers
            ],
        }
    )
    states = []
    for label, specimens in [
        ("active7", (active,)),
        ("multi-entry", (peptide(), translated(ligand, (2, 4, 3.5)))),
        ("approximate-repair", (radical,)),
        ("legacy-identity", (ligand.model_copy(update={"annotations": []}),)),
    ]:
        project = seeded_project(client, *specimens)
        before = canonical(client, project)
        selected = [
            {"structure_id": e["id"], "atom_id": a}
            for e in project["entries"]
            for a in (
                e["atom_ids"]
                if label == "approximate-repair"
                else [7 if e["structure_type"] == "protein" else 3]
            )
        ]
        selected.sort(key=lambda ref: (str(ref["structure_id"]), int(ref["atom_id"])))
        submitted = client.post(
            f"/api/v1/projects/{project['id']}/quick-minimizations",
            json={
                "expected_revision": project["revision"],
                "selection": {"atoms": selected},
            },
        )
        assert submitted.status_code == 201, submitted.text
        job = submitted.json()
        assert _worker(client).run_once()
        response = client.get(
            f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}/proposal"
        )
        assert response.status_code == 200, response.text
        proposal = response.json()
        assert proposal["applicable"], proposal
        if label == "approximate-repair":
            assert proposal["report"]["method"] == "geometry_repair"
        response = apply_quick(client, project, job, proposal)
        assert response.status_code == 200, response.text
        project = response.json()
        project = client.post(
            f"/api/v1/projects/{project['id']}/save",
            json={"expected_revision": project["revision"]},
        ).json()
        job = client.get(f"/api/v1/jobs/{job['id']}").json()
        exported = export_archive(client, project["id"], f"quick-qualification-{label}")
        archive = client.get(exported["artifact"]["download_url"]).content
        (data / f"{label}.molweave.zip").write_bytes(archive)
        states.append(
            {
                "label": label,
                "project": project,
                "before": before,
                "after": canonical(client, project),
                "originals": original_hashes(client, project),
                "counters": allocation_counters(client, project),
                "job": job,
                "result_hashes": result_hashes(client, job),
                "archive_sha256": hashlib.sha256(archive).hexdigest(),
            }
        )
    (data / "quick-expectations.json").write_text(json.dumps(states))
    return {
        "producer": APPLICATION_VERSION,
        "cases": len(states),
        "quick_active_conformers_multi_entry_repair_and_legacy": True,
    }


def read(client: ApiClient, data: Path) -> dict[str, Any]:
    states = json.loads((data / "quick-expectations.json").read_text())
    for state in states:
        path = f"/api/v1/projects/{state['project']['id']}"
        project = client.get(path).json()
        assert canonical(client, project) == state["after"]
        assert original_hashes(client, project) == state["originals"]
        assert allocation_counters(client, project) == state["counters"]
        job = client.get(f"/api/v1/jobs/{state['job']['id']}").json()
        assert job["parameters"] == state["job"]["parameters"]
        assert job["provenance"] == state["job"]["provenance"]
        assert job["inputs"] == state["job"]["inputs"]
        assert result_hashes(client, job) == state["result_hashes"]
        undone = client.post(
            f"{path}/history/undo", json={"expected_revision": project["revision"]}
        )
        assert undone.status_code == 200, undone.text
        assert canonical(client, undone.json()) == state["before"]
        redone = client.post(
            f"{path}/history/redo", json={"expected_revision": undone.json()["revision"]}
        )
        assert redone.status_code == 200, redone.text
        project = redone.json()
        assert canonical(client, project) == state["after"]
        saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
        assert saved.status_code == 200
        archive = (data / f"{state['label']}.molweave.zip").read_bytes()
        assert hashlib.sha256(archive).hexdigest() == state["archive_sha256"]
        for source in [
            archive,
            client.get(
                export_archive(client, project["id"], f"old-reader-{state['label']}")["artifact"][
                    "download_url"
                ]
            ).content,
        ]:
            restored = import_archive(client, source)["project"]
            assert canonical(client, restored) == state["after"]
            assert original_hashes(client, restored) == state["originals"]
            assert allocation_counters(client, restored) == state["counters"]
            jobs = client.get(f"/api/v1/projects/{restored['id']}/jobs").json()
            assert len(jobs) == 1
            assert jobs[0]["parameters"] == state["job"]["parameters"]
            assert (
                jobs[0]["provenance"]["quick_minimization_application"]
                == state["job"]["provenance"]["quick_minimization_application"]
            )
            assert result_hashes(client, jobs[0]) == state["result_hashes"]
    return {
        "reader": APPLICATION_VERSION,
        "cases": len(states),
        "canonical_all_conformers_exact": True,
        "generic_multi_entry_undo_redo_exact": True,
        "jobs_inputs_reports_models_and_provenance_exact": True,
        "originals_and_allocation_floors_exact": True,
        "save_archive_import_reexport_exact": True,
        "limitations": [
            "v0.22.1 retains generic data/history/jobs; "
            "new minimization authoring requires current client/API",
            "Archives retain historical results, not portable Undo or fresh Apply eligibility",
            "Existing schema downgrade guards remain binding",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--reader-root", type=Path)
    parser.add_argument("--expected-reader", default="0.22.1")
    args = parser.parse_args()
    if args.mode == "read":
        assert args.reader_root and APPLICATION_VERSION == args.expected_reader
        for module in [molweave_api.main, molweave_core]:
            assert Path(module.__file__).resolve().is_relative_to(args.reader_root.resolve())
    data = args.data_dir.resolve()
    data.mkdir(parents=True, exist_ok=True)
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    client = ApiClient(app)
    try:
        result = produce(client, data) if args.mode == "produce" else read(client, data)
        result.update(
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
