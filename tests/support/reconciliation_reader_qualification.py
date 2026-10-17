"""Actual preceding-runtime retention for destructive endpoint H commands.

Current test harness, actual selected API/core modules; disposable data only.
"""

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
from tests.support.hydrogen_reader_qualification import produce_hydrogens, read_hydrogens
from tests.support.modeling_reader_qualification import allocation_counters, canonical


def produce(client: ApiClient, data_dir: Path) -> dict[str, Any]:
    from molweave_core.molecular import Conformer

    from tests.integration.test_model_edits import edit
    from tests.support.editing_fixture import build_fixture
    from tests.support.hydrogen_fixture import model

    baseline = produce_hydrogens(client, data_dir)
    states = []
    for n, (smiles, ids, action) in enumerate(
        [
            ("CCCC", [1, 4], {"operation": "bond.set", "order": 1.0}),
            ("C=C", [1, 2], {"operation": "bond.set", "order": 1.0}),
            ("[2H]CC", [2, 3], {"operation": "bond.set", "order": 2.0}),
        ]
    ):
        structure = model(smiles)
        translated = [(x + 7.0, y - 3.0, z + 2.0) for x, y, z in structure.active_coordinates]
        structure = structure.model_copy(
            update={
                "conformers": [
                    *structure.conformers,
                    Conformer(id=9, name="Translated", coordinates=translated),
                ],
                "active_conformer_id": 9,
                "atoms": [
                    a.model_copy(update={"coordinates": translated[i]})
                    for i, a in enumerate(structure.atoms)
                ],
            }
        )
        project = import_archive(client, build_fixture(structure))["project"]
        entry = project["entries"][0]
        path = f"/api/v1/projects/{project['id']}"
        original = client.get(f"{path}/entries/{entry['id']}/original").content
        before = canonical(client, project)
        response = edit(
            client, project, entry["id"], ids, action, hydrogen_policy="reconcile_if_possible"
        )
        assert response.status_code == 200, response.text
        report = response.json()["hydrogen_reconciliation_report"]
        project = response.json()["project"]
        project = client.post(
            f"{path}/save", json={"expected_revision": project["revision"]}
        ).json()
        after = canonical(client, project)
        artifact = export_archive(client, project["id"], f"reconciled-{n}")
        archive = client.get(artifact["artifact"]["download_url"]).content
        (data_dir / f"reconciled-{n}.molweave.zip").write_bytes(archive)
        states.append(
            {
                "project": project,
                "entry_id": entry["id"],
                "before": before,
                "after": after,
                "report": report,
                "counters": allocation_counters(client, project),
                "original_sha256": hashlib.sha256(original).hexdigest(),
                "archive_sha256": hashlib.sha256(archive).hexdigest(),
            }
        )
    (data_dir / "reconciliation-expectations.json").write_text(json.dumps(states))
    return {
        "baseline": baseline,
        "producer": APPLICATION_VERSION,
        "reconciliation_cases": len(states),
    }


def read(client: ApiClient, data_dir: Path, version: str) -> dict[str, Any]:
    baseline = read_hydrogens(client, data_dir, version)
    baseline["limitations"] = [
        "Actual v0.18.0 supports additive completion but lacks issue #81 destructive "
        "reconciliation; use the current authoring runtime."
    ]
    states = json.loads((data_dir / "reconciliation-expectations.json").read_text())
    for n, state in enumerate(states):
        path = f"/api/v1/projects/{state['project']['id']}"
        project = client.get(path).json()
        assert canonical(client, project) == state["after"]
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
        assert allocation_counters(client, project) == state["counters"]
        assert (
            hashlib.sha256(
                client.get(f"{path}/entries/{state['entry_id']}/original").content
            ).hexdigest()
            == state["original_sha256"]
        )
        saved = client.post(f"{path}/save", json={"expected_revision": project["revision"]})
        assert saved.status_code == 200
        archive = (data_dir / f"reconciled-{n}.molweave.zip").read_bytes()
        assert hashlib.sha256(archive).hexdigest() == state["archive_sha256"]
        restored = import_archive(client, archive)["project"]
        assert canonical(client, restored) == state["after"]
        assert allocation_counters(client, restored) == state["counters"]
        reexport = export_archive(client, project["id"], f"old-reader-{n}")
        reopened = import_archive(client, client.get(reexport["artifact"]["download_url"]).content)[
            "project"
        ]
        assert canonical(client, reopened) == state["after"]
    return {
        "baseline": baseline,
        "reader": APPLICATION_VERSION,
        "reconciliation_cases": len(states),
        "canonical_protection_stereo_inferences_exact": True,
        "all_conformers_exact": True,
        "original_bytes_exact": True,
        "generic_undo_redo_exact": True,
        "allocation_floors_exact": True,
        "save_archive_reexport_exact": True,
        "limitations": [
            "Old runtimes retain data but lack new reconciliation/protection behavior; "
            "use matching current client/API for authoring.",
            "Existing schema downgrade guards remain binding.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--reader-root", type=Path)
    parser.add_argument("--expected-reader", default="0.18.0")
    args = parser.parse_args()
    if args.mode == "read":
        assert args.reader_root is not None and APPLICATION_VERSION == args.expected_reader
        for module in [molweave_api.main, molweave_core]:
            assert Path(module.__file__).resolve().is_relative_to(args.reader_root.resolve())
    data_dir = args.data_dir.resolve()
    client = ApiClient(
        create_app(
            Settings(data_dir=data_dir, database_url=f"sqlite:///{data_dir / 'molweave.db'}")
        )
    )
    try:
        result = (
            produce(client, data_dir)
            if args.mode == "produce"
            else read(client, data_dir, args.expected_reader)
        )
        result.update(
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.__file__,
            application_version=APPLICATION_VERSION,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        client.app.state.engine.dispose()


if __name__ == "__main__":
    main()
