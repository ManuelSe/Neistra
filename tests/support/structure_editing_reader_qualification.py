"""Actual-source editing retention; new authoring and older re-export stay distinct."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tomllib
import zipfile
from copy import deepcopy
from importlib.metadata import version as distribution_version
from pathlib import Path
from typing import Any, Literal, cast

PREVIOUS_COMMIT = "cc54cd324c5aebe86024c1b85165715691ddcbb3"
PREVIOUS_VERSION = "0.31.0"
SUFFIXES = (".neistra.zip", ".molweave.zip")
PROFILES = {
    "cyclopropyl": (3, 5),
    "cyclobutyl": (4, 7),
    "cyclopentyl": (5, 9),
    "cyclohexyl": (6, 11),
    "methoxy": (1, 3),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def verify_previous_receipt(record: dict[str, Any], version: str, tag: str, commit: str) -> None:
    """Bind extracted source evidence to the requested actual tagged implementation."""
    assert re.fullmatch(r"\d+\.\d+\.\d+", version), "Stable preceding version required"
    assert tag == f"v{version}", "Preceding tag/version mismatch"
    assert re.fullmatch(r"[0-9a-f]{40}", commit), "Full preceding commit required"
    assert record["commit"] == commit and record["tag"] == tag
    assert record["files"], "Preceding source identity inventory is empty"


def identity(
    root: Path,
    expected: str,
    receipt: Path | None,
    previous_tag: str = f"v{PREVIOUS_VERSION}",
    previous_commit: str = PREVIOUS_COMMIT,
) -> dict[str, Any]:
    assert sys.flags.optimize == 0 and Path.cwd().resolve() == root
    versions = {
        "environment": tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"],
        "locked_environment": next(
            p["version"]
            for p in tomllib.loads((root / "uv.lock").read_text())["package"]
            if p["name"] == "neistra-dev"
        ),
        "web": json.loads((root / "apps/web/package.json").read_text())["version"],
    }
    from neistra_api.archive_service import APPLICATION_VERSION
    from neistra_api.main import app as default_app

    versions["api"] = APPLICATION_VERSION
    versions["fastapi"] = default_app.version
    assert set(versions.values()) == {expected}, versions
    names = [
        "neistra_api.main",
        "neistra_api.archive_service",
        "neistra_api.models",
        "neistra_api.project_service",
        "neistra_api.model_edit_service",
        "neistra_api.selection_edit_service",
        "neistra_api.ligand_edit_service",
        "neistra_core.molecular",
        "neistra_core.editing.model",
        "neistra_core.editing.protein",
        "neistra_core.editing.ligand",
        "neistra_core.editing.fragments",
        "neistra_core.editing.reconciliation",
        "neistra_core.hydrogen_protection",
        "neistra_core.artifacts",
        "neistra_demo_plugin",
        "tests.support.api_client",
        "tests.integration.test_archive_roundtrip",
        "tests.support.editing_fixture",
        "tests.support.hydrogen_fixture",
    ]
    paths = {}
    for name in names:
        module = importlib.import_module(name)
        filename = module.__file__
        assert filename is not None
        path = Path(filename).resolve()
        assert path.is_relative_to(root), (name, path, root)
        paths[name] = {"path": str(path), "sha256": digest(path.read_bytes())}
    if receipt is not None:
        record = json.loads(receipt.read_text())
        verify_previous_receipt(record, expected, previous_tag, previous_commit)
        source = record["files"]
        for relative, expected_hash in source.items():
            assert digest((root / relative).read_bytes()) == expected_hash, relative
        receipt_evidence = {
            "commit": record["commit"],
            "tag": record["tag"],
            "files_verified": len(source),
            "receipt_sha256": digest(receipt.read_bytes()),
        }
    else:
        roots = [
            "apps/api/src",
            "apps/api/migrations",
            "packages",
            "tests/support",
            "tests/fixtures",
        ]
        files = [
            p
            for folder in roots
            for p in (root / folder).rglob("*")
            if p.is_file() and "__pycache__" not in p.parts and ".venv" not in p.parts
        ]
        files += [
            root / p for p in ["pyproject.toml", "uv.lock", "alembic.ini", "apps/web/package.json"]
        ]
        source = {str(p.relative_to(root)): digest(p.read_bytes()) for p in sorted(set(files))}
        receipt_evidence = None
    return {
        "root": str(root),
        "versions": versions,
        "module_paths": paths,
        "source_files": source,
        "previous_receipt": receipt_evidence,
        "python_executable": sys.executable,
        "python_prefix": sys.prefix,
        "installed_versions": {
            name: distribution_version(name)
            for name in ("numpy", "scipy", "rdkit", "gemmi", "pdbfixer", "SQLAlchemy", "fastapi")
        },
    }


def verify_source(identity_record: dict[str, Any]) -> None:
    root = Path(identity_record["root"])
    for relative, expected in identity_record["source_files"].items():
        assert digest((root / relative).read_bytes()) == expected, relative
    for name, source in identity_record["module_paths"].items():
        assert digest(Path(source["path"]).read_bytes()) == source["sha256"], name
    for name, module in tuple(sys.modules.items()):
        filename = getattr(module, "__file__", None)
        if name.startswith(("neistra_", "molweave_", "tests.")) and filename:
            assert Path(filename).resolve().is_relative_to(root), (name, filename)


def selected(
    client: Any,
    project: dict[str, Any],
    entry: str,
    ids: list[int],
    action: dict[str, Any],
    kind: str = "model",
    *,
    hydrogen_policy: Literal[
        "preserve", "complete_if_possible", "reconcile_if_possible", "automatic"
    ]
    | None = None,
) -> dict[str, Any]:
    current = next(e for e in project["entries"] if e["id"] == entry)
    payload = {
        "expected_revision": project["revision"],
        "expected_artifact_id": current["current_artifact_id"],
        "selection": {
            "schema_version": 1,
            "atoms": [{"structure_id": entry, "atom_id": i} for i in ids],
            "granularity": "atom",
            "source": "viewer",
        },
        "action": action,
    }
    if kind == "model":
        payload["hydrogen_policy"] = hydrogen_policy or (
            "automatic" if action["operation"] in {"fragment.attach", "bond.rotate"} else "preserve"
        )
    response = client.post(
        f"/api/v1/projects/{project['id']}/entries/{entry}/{kind}-edits", json=payload
    )
    assert response.status_code == 200, (response.status_code, response.text)
    return cast(dict[str, Any], response.json())


def history_rows(client: Any, project_id: str) -> list[dict[str, Any]]:
    from neistra_api.models import CommandRecord
    from sqlalchemy import select

    with client.app.state.engine.connect() as connection:
        rows = (
            connection.execute(
                select(CommandRecord.__table__)
                .where(CommandRecord.project_id == project_id)
                .order_by(CommandRecord.position)
            )
            .mappings()
            .all()
        )
    return [
        {k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in row.items()} for row in rows
    ]


def state(client: Any, project: dict[str, Any]) -> dict[str, Any]:
    from neistra_api.models import Artifact, StructureEntry

    project = client.get(f"/api/v1/projects/{project['id']}").json()
    canonical, current_sha, originals, counters, entries, ids = {}, {}, {}, {}, {}, {}
    fields = (
        "structure_type",
        "original_filename",
        "source_format",
        "atom_count",
        "atom_ids",
        "bond_count",
        "residue_count",
        "conformer_count",
        "warnings",
        "visible",
        "locked",
        "user_metadata",
        "viewer_settings",
    )
    with client.app.state.session_factory() as session:
        for entry in project["entries"]:
            name = entry["name"]
            response = client.get(f"/api/v1/artifacts/{entry['current_artifact_id']}")
            assert response.status_code == 200, response.text
            artifact = session.get(Artifact, entry["current_artifact_id"])
            assert artifact is not None
            assert (
                digest(response.content) == artifact.sha256
                and len(response.content) == artifact.size
            )
            canonical[name], current_sha[name] = response.json(), artifact.sha256
            original = client.get(
                f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
            )
            assert original.status_code == 200, original.text
            originals[name] = digest(original.content)
            row = session.get(StructureEntry, entry["id"])
            assert row is not None
            counters[name] = [row.next_atom_id, row.next_bond_id]
            entries[name] = {field: entry[field] for field in fields}
            ids[name] = {
                field: entry[field]
                for field in ("id", "current_artifact_id", "original_artifact_id")
            }
    return {
        "canonical": canonical,
        "current_sha256": current_sha,
        "original_sha256": originals,
        "counters": counters,
        "entries": entries,
        "ids": ids,
    }


def assert_state(
    actual: dict[str, Any],
    expected: dict[str, Any],
    *,
    retained: bool = False,
    counters: dict[str, Any] | None = None,
) -> None:
    for key in ("canonical", "current_sha256", "original_sha256", "entries"):
        assert actual[key] == expected[key], key
    assert actual["counters"] == (counters if counters is not None else expected["counters"]), (
        "allocator floors"
    )
    if retained:
        assert actual["ids"] == expected["ids"], "retained stable entry/artifact identities"


def export_bytes(client: Any, project: dict[str, Any], label: str, expected_version: str) -> bytes:
    response = client.post(
        f"/api/v1/projects/{project['id']}/archive", json={"operation_id": label}
    )
    assert response.status_code == 201, response.text
    artifact = response.json()["artifact"]
    response = client.get(artifact["download_url"])
    assert response.status_code == 200 and digest(response.content) == artifact["sha256"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["application_version"] == expected_version
    return bytes(response.content)


def import_bytes(client: Any, content: bytes, suffix: str, label: str) -> dict[str, Any]:
    response = client.post(
        "/api/v1/projects/import-archive",
        data={"operation_id": label},
        files={"file": (f"editing{suffix}", content, "application/zip")},
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    assert project["history"]["retained_commands"] == 0
    assert not project["history"]["can_undo"] and not project["history"]["can_redo"]
    assert history_rows(client, project["id"]) == []
    return cast(dict[str, Any], project)


def ligand_seed(label: str, *, smiles: str = "C.O") -> Any:
    import numpy as np
    from neistra_core.molecular import Conformer, MolecularWarning

    from tests.support.hydrogen_fixture import model

    before = model(smiles)
    oxygen_id = next(a.id for a in before.atoms if a.element == "O")
    oxygen = {oxygen_id} | {
        i
        for b in before.bonds
        if oxygen_id in {b.atom_1_id, b.atom_2_id}
        for i in (b.atom_1_id, b.atom_2_id)
    }
    points = np.asarray(before.active_coordinates)
    for n, atom in enumerate(before.atoms):
        if atom.id in oxygen:
            points[n] += [12, 0, 0]
    frames = [
        Conformer(
            id=i, name=f"Reader frame {i}", coordinates=[tuple(row) for row in points @ r.T + t]
        )
        for i, r, t in [
            (1, np.eye(3), np.zeros(3)),
            (7, np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]]), np.asarray([7, -4, 3])),
            (19, np.asarray([[0, 0, 1], [0, 1, 0], [-1, 0, 0]]), np.asarray([-4, 8, 2])),
        ]
    ]
    return before.model_copy(
        update={
            "title": label,
            "conformers": frames,
            "active_conformer_id": 7,
            "atoms": [
                a.model_copy(
                    update={
                        "coordinates": frames[1].coordinates[n],
                        **({"formal_charge": None} if a.id == oxygen_id else {}),
                    }
                )
                for n, a in enumerate(before.atoms)
            ],
            "metadata": {
                **before.metadata,
                "reader_opaque_provenance": {
                    "source": "synthetic fixture",
                    "future_values": [None, {"uninterpreted": "retained"}],
                },
            },
            "warnings": [
                *before.warnings,
                MolecularWarning(
                    code="reader_unknown_spectator_charge",
                    message="Synthetic spectator charge deliberately unknown.",
                    operation="fixture",
                    field=f"atoms.{oxygen_id}.formal_charge",
                ),
            ],
        }
    )


def torsion_seed() -> Any:
    import numpy as np
    from neistra_core.molecular import Atom, Bond, Conformer, NormalizedStructureV1, SourceFacts

    points = np.asarray([(0, 1, 0), (0, 0, 0), (1.5, 0, 0), (1.5, 1, 0), (9, 4, 2)])
    frames = [
        Conformer(id=i, name=f"Torsion frame {i}", coordinates=[tuple(p) for p in points @ r.T + t])
        for i, r, t in [
            (11, np.eye(3), np.zeros(3)),
            (25, np.asarray([[0, -1, 0], [1, 0, 0], [0, 0, 1]]), np.asarray([7, -3, 4])),
        ]
    ]
    return NormalizedStructureV1(
        title="Reader147 torsion",
        structure_type="ligand",
        source=SourceFacts(filename="analytic", format="generated"),
        atoms=[
            Atom(
                id=i,
                name=f"A{i}",
                element="O" if i == 99 else "C",
                formal_charge=0,
                source_index=n,
                coordinates=frames[1].coordinates[n],
            )
            for n, i in enumerate([10, 20, 30, 40, 99])
        ],
        bonds=[
            Bond(id=i, atom_1_id=a, atom_2_id=b, order=1.0)
            for i, a, b in [(50, 10, 20), (71, 20, 30), (99, 30, 40)]
        ],
        conformers=frames,
        active_conformer_id=25,
        metadata={"reader_opaque_provenance": {"do_not_interpret": [None, "torsion"]}},
    )


def hydrogen_neighbors(document: dict[str, Any], parents: set[int]) -> dict[int, list[int]]:
    atoms = {a["id"]: a for a in document["atoms"]}
    return {
        parent: sorted(
            neighbor
            for bond in document["bonds"]
            for center, neighbor in (
                (bond["atom_1_id"], bond["atom_2_id"]),
                (bond["atom_2_id"], bond["atom_1_id"]),
            )
            if center == parent and atoms[neighbor]["element"] == "H"
        )
        for parent in parents
    }


def assert_aromatic_fixed(seed: Any, document: dict[str, Any]) -> None:
    original = seed.model_dump(mode="json")
    heavy = {a["id"] for a in original["atoms"] if a["element"] != "H"}
    oxygen = {a["id"] for a in original["atoms"] if a["element"] == "O"}
    spectator = oxygen | {i for ids in hydrogen_neighbors(original, oxygen).values() for i in ids}
    fixed = heavy | spectator
    assert [a for a in document["atoms"] if a["id"] in fixed] == [
        a for a in original["atoms"] if a["id"] in fixed
    ]
    old_indices = {a["id"]: n for n, a in enumerate(original["atoms"])}
    new_indices = {a["id"]: n for n, a in enumerate(document["atoms"])}
    assert len(document["conformers"]) == 3 and document["active_conformer_id"] == 7
    for before, after in zip(original["conformers"], document["conformers"], strict=True):
        assert before["id"] == after["id"]
        for atom_id in fixed:
            assert (
                after["coordinates"][new_indices[atom_id]]
                == before["coordinates"][old_indices[atom_id]]
            )
    assert document["source"] == original["source"]
    assert (
        document["metadata"]["reader_opaque_provenance"]
        == original["metadata"]["reader_opaque_provenance"]
    )


def produce(client: Any, root: Path, exchange: Path, version: str) -> dict[str, Any]:
    from collections import Counter

    import numpy as np

    from tests.support.editing_fixture import build_fixture

    cases = []

    def finish(label: str, project: dict[str, Any], transitions: list[dict[str, Any]]) -> None:
        response = client.post(
            f"/api/v1/projects/{project['id']}/save",
            json={"expected_revision": project["revision"]},
        )
        assert response.status_code == 200, response.text
        project = response.json()
        after = state(client, project)
        archive = export_bytes(client, project, label, version)
        files = []
        for suffix in SUFFIXES:
            path = exchange / f"{label}{suffix}"
            path.write_bytes(archive)
            files.append({"path": str(path), "suffix": suffix, "sha256": digest(archive)})
        cases.append(
            {
                "label": label,
                "project_id": project["id"],
                "after": after,
                "transitions": transitions,
                "history_rows": history_rows(client, project["id"]),
                "archives": files,
                "authorship": "current implementation API operations",
            }
        )

    for fragment, (carbons, hydrogens) in PROFILES.items():
        for replace_h in (False, True):
            label = f"fragment-{fragment}-{'H' if replace_h else 'heavy'}"
            seed = ligand_seed(label)
            project = import_bytes(
                client,
                build_fixture(seed, application_version=version),
                SUFFIXES[0],
                f"seed-{label}",
            )
            entry = project["entries"][0]
            before = state(client, project)
            target = next(a.id for a in seed.atoms if a.element == "H") if replace_h else 1
            result = selected(
                client,
                project,
                entry["id"],
                [target],
                {"operation": "fragment.attach", "fragment": fragment},
            )
            project = result["project"]
            after = state(client, project)
            document = next(iter(after["canonical"].values()))
            created = set(result["report"]["created_atom_ids"])
            expected = Counter({"C": carbons, "H": hydrogens})
            if fragment == "methoxy":
                expected["O"] = 1
            assert (
                Counter(a["element"] for a in document["atoms"] if a["id"] in created) == expected
            )
            assert len(document["conformers"]) == 3 and document["active_conformer_id"] == 7
            assert next(a for a in document["atoms"] if a["id"] == 2)["formal_charge"] is None
            assert all(
                s["status"] == "unchanged" and s["geometry"] is None
                for s in result["hydrogen_reconciliation_report"]["sites"]
                if s["atom_id"] in created
            )
            finish(
                label,
                project,
                [{"operation": f"fragment.attach:{fragment}", "before": before, "after": after}],
            )

    response = client.post("/api/v1/projects", json={"name": "Reader147 cut mutation"})
    assert response.status_code == 201, response.text
    project = response.json()
    raw = (root / "tests/fixtures/formats/protein_editing.pdb").read_bytes()
    response = client.post(
        f"/api/v1/projects/{project['id']}/imports",
        data={"expected_revision": project["revision"]},
        files={"files": ("protein_editing.pdb", raw, "chemical/x-pdb")},
    )
    assert response.status_code == 201, response.text
    project = response.json()["project"]
    entry_id = project["entries"][0]["id"]
    transitions: list[dict[str, Any]] = []
    steps: list[tuple[str, list[int], dict[str, Any]]] = [
        ("model", [6, 7], {"operation": "bond.delete"}),
        ("selection", [6, 7, 8, 9], {"operation": "residue.mutate", "target_name": "ALA"}),
    ]
    for kind, ids, action in steps:
        before = state(client, project)
        project = selected(client, project, entry_id, ids, action, kind)["project"]
        transitions.append(
            {"operation": action["operation"], "before": before, "after": state(client, project)}
        )
    document = next(iter(transitions[-1]["after"]["canonical"].values()))
    assert document["metadata"]["neistra_modeling"]["excluded_bonds"] == [[6, 7]]
    assert not any({b["atom_1_id"], b["atom_2_id"]} == {6, 7} for b in document["bonds"])
    assert any(
        w["code"] == "protein_retained_connectivity_unresolved" for w in document["warnings"]
    )
    assert any(a["formal_charge"] is None for a in document["atoms"])
    assert next(iter(transitions[-1]["after"]["original_sha256"].values())) == digest(raw)
    finish("cut-mutation", project, transitions)

    seed = torsion_seed()
    project = import_bytes(
        client, build_fixture(seed, application_version=version), SUFFIXES[0], "seed-torsion"
    )
    entry = project["entries"][0]
    before = state(client, project)
    result = selected(
        client,
        project,
        entry["id"],
        [20, 30],
        {"operation": "bond.rotate", "moving_endpoint_id": 30, "angle_degrees": 60},
    )
    project = result["project"]
    after = state(client, project)
    document = next(iter(after["canonical"].values()))
    for old, new in zip(seed.conformers, document["conformers"], strict=True):
        for i in [0, 1, 2, 4]:
            assert list(old.coordinates[i]) == new["coordinates"][i]
        assert not np.array_equal(old.coordinates[3], new["coordinates"][3])
    # Analytic +60-degree rotation about each local fixed-to-moving axis.
    expected_rows = [(1.5, 0.5, np.sqrt(3) / 2), (6.5, -1.5, 4 + np.sqrt(3) / 2)]
    for frame, expected_row in zip(document["conformers"], expected_rows, strict=True):
        np.testing.assert_allclose(frame["coordinates"][3], expected_row, rtol=0, atol=1e-12)
    finish("torsion", project, [{"operation": "bond.rotate", "before": before, "after": after}])

    for label, smiles, edges, carbon_ids in [
        ("aromatic-partial", "CC.O", [(1, 2)], {1, 2}),
        (
            "aromatic-ring",
            "C1CCCCC1.O",
            [(3, 4), (1, 2), (5, 6), (2, 3), (4, 5), (6, 1)],
            set(range(1, 7)),
        ),
    ]:
        seed = ligand_seed(label, smiles=smiles)
        project = import_bytes(
            client, build_fixture(seed, application_version=version), SUFFIXES[0], f"seed-{label}"
        )
        entry = project["entries"][0]
        transitions = []
        planar_sites: set[int] = set()
        authored_edges: set[frozenset[int]] = set()
        for left, right in edges:
            before = state(client, project)
            result = selected(
                client,
                project,
                entry["id"],
                sorted((left, right)),
                {"operation": "bond.set", "order": 1.5},
                hydrogen_policy="automatic",
            )
            project = result["project"]
            after = state(client, project)
            document = next(iter(after["canonical"].values()))
            planar_sites.update((left, right))
            authored_edges.add(frozenset((left, right)))
            # Fixed molecular oracles: isolated C pair has two H each; a six-ring
            # carbon has one H once incident to an authored aromatic edge, else two.
            expected_counts = (
                {1: 2, 2: 2}
                if label == "aromatic-partial"
                else {i: 1 if i in planar_sites else 2 for i in range(1, 7)}
            )
            assert {
                i: len(ids) for i, ids in hydrogen_neighbors(document, carbon_ids).items()
            } == expected_counts
            assert_aromatic_fixed(seed, document)
            report = result["hydrogen_reconciliation_report"]
            assert report["policy"] == "automatic" and report["skipped_count"] == 0
            assert report["reason_counts"]["provisional_aromatic_carbon"] >= 2
            for warnings in (result["warnings"], document["warnings"]):
                assert any(
                    w["code"] == "model_hydrogen_provisional_aromatic_carbon"
                    and "Provisional" in w["message"]
                    and "3 minus" in w["message"]
                    for w in warnings
                )
                assert any(w["code"] == "model_aromaticity_unvalidated" for w in warnings)
            assert any(
                "method=provisional_authored_sp2_carbon" in i["message"]
                for i in document["inferences"]
            )
            for bond in document["bonds"]:
                pair = frozenset((bond["atom_1_id"], bond["atom_2_id"]))
                if pair <= carbon_ids:
                    assert bond["order"] == (1.5 if pair in authored_edges else 1.0)
                    assert bond["aromatic"] == (pair in authored_edges)
            assert after["original_sha256"] == before["original_sha256"]
            transitions.append(
                {
                    "operation": f"bond.set:aromatic:{left}-{right}",
                    "before": before,
                    "after": after,
                }
            )
        finish(label, project, transitions)

    label = "attached-h-appearance"
    seed = ligand_seed(label)
    project = import_bytes(
        client, build_fixture(seed, application_version=version), SUFFIXES[0], f"seed-{label}"
    )
    entry = project["entries"][0]
    initial = state(client, project)
    name = entry["name"]
    document = initial["canonical"][name]
    neighbors = hydrogen_neighbors(document, {1, 2})
    carbon_h, oxygen_h = neighbors[1], neighbors[2]
    assert len(carbon_h) == 4 and len(oxygen_h) == 2
    transitions = []
    appearances: list[tuple[str, list[int], bool | None, list[dict[str, Any]]]] = [
        (
            "seed-false",
            sorted(carbon_h + oxygen_h),
            False,
            [{"show": False, "atom_ids": sorted(carbon_h + oxygen_h)}],
        ),
        (
            "carbon-true",
            carbon_h,
            True,
            [{"show": False, "atom_ids": oxygen_h}, {"show": True, "atom_ids": carbon_h}],
        ),
        (
            "carbon-false",
            carbon_h,
            False,
            [{"show": False, "atom_ids": sorted(carbon_h + oxygen_h)}],
        ),
        ("carbon-reset", carbon_h, None, [{"show": False, "atom_ids": oxygen_h}]),
    ]
    for operation, atom_ids, show, expected_assignments in appearances:
        before = state(client, project)
        response = client.post(
            f"/api/v1/projects/{project['id']}/selection-appearance",
            json={
                "expected_revision": project["revision"],
                "selection": {
                    "schema_version": 1,
                    "atoms": [{"structure_id": entry["id"], "atom_id": i} for i in atom_ids],
                    "granularity": "atom",
                    "source": "viewer",
                },
                "property": "nonpolar_hydrogens",
                "action": "reset" if show is None else "set",
                **({"show": show} if show is not None else {}),
            },
        )
        assert response.status_code == 200, response.text
        project = response.json()
        after = state(client, project)
        expected_state = deepcopy(initial)
        expected_state["entries"][name]["viewer_settings"]["selection_nonpolar_hydrogens"] = (
            expected_assignments
        )
        assert_state(after, expected_state, retained=True)
        transitions.append(
            {"operation": f"appearance:{operation}", "before": before, "after": after}
        )
    finish(label, project, transitions)

    result = {
        "producer_version": version,
        "cases": cases,
        "new_operation_author": "current implementation only",
        "opaque_jobs": "separate existing rich/connectivity families",
    }
    write_json(exchange / "expectations.json", result)
    return {
        "cases": len(cases),
        "case_labels": [c["label"] for c in cases],
        "transitions": sum(len(c["transitions"]) for c in cases),
        "expectations_sha256": digest((exchange / "expectations.json").read_bytes()),
    }


def retained_history(client: Any, case: dict[str, Any]) -> None:
    path = f"/api/v1/projects/{case['project_id']}"
    project = client.get(path).json()
    assert_state(state(client, project), case["after"], retained=True)
    assert history_rows(client, project["id"]) == case["history_rows"]
    for direction, transitions in (
        ("undo", list(reversed(case["transitions"]))),
        ("redo", case["transitions"]),
    ):
        for transition in transitions:
            response = client.post(
                f"{path}/history/{direction}", json={"expected_revision": project["revision"]}
            )
            assert response.status_code == 200, response.text
            project = response.json()
            expected = transition["before" if direction == "undo" else "after"]
            assert_state(
                state(client, project), expected, retained=True, counters=case["after"]["counters"]
            )
    assert history_rows(client, project["id"]) == case["history_rows"]


def persistence(client: Any, data: Path) -> dict[str, Any]:
    from neistra_api.models import Artifact, CommandRecord, Project
    from sqlalchemy import func, select

    with client.app.state.engine.connect() as connection:
        counts = [
            connection.execute(select(func.count()).select_from(table)).scalar_one()
            for table in (Artifact, CommandRecord, Project)
        ]
    return {
        "counts": counts,
        "files": {
            str(p.relative_to(data)): digest(p.read_bytes())
            for p in (data / "artifacts").rglob("*")
            if p.is_file()
        },
    }


def corruption_controls(client: Any, data: Path, archive_bytes: bytes) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        members = {name: archive.read(name) for name in archive.namelist()}
    artifact = next(name for name in members if name != "manifest.json")
    controls = []
    for kind in ("payload", "manifest_hash", "schema"):
        broken = dict(members)
        if kind == "payload":
            broken[artifact] += b"corrupted"
        else:
            manifest = json.loads(broken["manifest.json"])
            if kind == "manifest_hash":
                manifest["files"][0]["sha256"] = "0" * 64
            else:
                manifest["schema_version"] = 999
            broken["manifest.json"] = json.dumps(manifest).encode()
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in broken.items():
                archive.writestr(name, content)
        for suffix in SUFFIXES:
            before = persistence(client, data)
            response = client.post(
                "/api/v1/projects/import-archive",
                data={"operation_id": f"bad-{kind}-{suffix}"},
                files={"file": (f"corrupt{suffix}", output.getvalue(), "application/zip")},
            )
            assert response.status_code == 422, (kind, suffix, response.status_code, response.text)
            assert persistence(client, data) == before
            controls.append(
                {
                    "kind": kind,
                    "suffix": suffix,
                    "status": response.status_code,
                    "no_publication": True,
                }
            )
    return controls


def allocator_probe(client: Any, project: dict[str, Any]) -> dict[str, Any]:
    baseline = state(client, project)
    entry = project["entries"][0]
    name = entry["name"]
    atom_id = next(a["id"] for a in baseline["canonical"][name]["atoms"] if a["element"] != "H")
    path = f"/api/v1/projects/{project['id']}"
    floor = baseline["counters"][name][0]
    result = selected(
        client, project, entry["id"], [atom_id], {"operation": "atom.add", "element": "P"}
    )
    assert result["report"]["created_atom_ids"] == [floor]
    project = result["project"]
    response = client.post(f"{path}/history/undo", json={"expected_revision": project["revision"]})
    assert response.status_code == 200, response.text
    project = response.json()
    assert state(client, project)["canonical"] == baseline["canonical"]
    assert state(client, project)["counters"][name][0] == floor + 1
    result = selected(
        client, project, entry["id"], [atom_id], {"operation": "atom.add", "element": "P"}
    )
    assert result["report"]["created_atom_ids"] == [floor + 1]
    assert not result["project"]["history"]["can_redo"]
    after = state(client, result["project"])
    return {
        "first_id": floor,
        "after_undo_branch_id": floor + 1,
        "reused": False,
        "scope": "existing generic atom.add on an imported seed; not new-fragment authoring",
        "retained_case": {
            "project_id": project["id"],
            "after": after,
            "transitions": [{"operation": "atom.add:P", "before": baseline, "after": after}],
            "history_rows": history_rows(client, project["id"]),
            "authorship": "preceding implementation existing generic atom.add only",
        },
    }


def stale_guards(client: Any, project: dict[str, Any], data: Path) -> list[dict[str, Any]]:
    baseline = state(client, project)
    entry = project["entries"][0]
    name = entry["name"]
    atom_id = next(a["id"] for a in baseline["canonical"][name]["atoms"] if a["element"] != "H")
    controls = []
    for kind in ("revision", "artifact"):
        payload = {
            "expected_revision": project["revision"] + (1 if kind == "revision" else 0),
            "expected_artifact_id": (
                "00000000-0000-4000-8000-000000000000"
                if kind == "artifact"
                else entry["current_artifact_id"]
            ),
            "selection": {
                "schema_version": 1,
                "atoms": [{"structure_id": entry["id"], "atom_id": atom_id}],
                "granularity": "atom",
                "source": "viewer",
            },
            "action": {"operation": "atom.add", "element": "P"},
            "hydrogen_policy": "preserve",
        }
        before = persistence(client, data)
        response = client.post(
            f"/api/v1/projects/{project['id']}/entries/{entry['id']}/model-edits", json=payload
        )
        assert response.status_code in ({409} if kind == "revision" else {409, 422}), (
            kind,
            response.status_code,
            response.text,
        )
        assert_state(state(client, project), baseline, retained=True)
        assert persistence(client, data) == before
        controls.append({"kind": kind, "status": response.status_code, "no_publication": True})
    return controls


def oracle_controls(cases: list[dict[str, Any]]) -> list[str]:
    expected = cases[0]["after"]
    name = next(iter(expected["canonical"]))
    detected = []
    for kind in ("unknown_charge", "inactive_coordinates", "protection", "warnings", "allocator"):
        altered = deepcopy(expected)
        document = altered["canonical"][name]
        if kind == "unknown_charge":
            next(a for a in document["atoms"] if a["formal_charge"] is None)["formal_charge"] = 0
        elif kind == "inactive_coordinates":
            document["conformers"][0]["coordinates"][0][0] += 0.125
        elif kind == "protection":
            next(
                a for a in document["annotations"] if a.get("kind") == "neistra_hydrogen_protection"
            )["atoms"][0]["isotope"] = 7
        elif kind == "warnings":
            document["warnings"] = []
        else:
            altered["counters"][name][0] += 1
        try:
            assert_state(altered, expected)
        except AssertionError:
            detected.append(kind)
        else:
            raise AssertionError(f"Deep expected-value oracle missed {kind}")
    cut = next(c for c in cases if c["label"] == "cut-mutation")["after"]
    altered = deepcopy(cut)
    next(iter(altered["canonical"].values()))["metadata"]["neistra_modeling"]["excluded_bonds"] = []
    try:
        assert_state(altered, cut)
    except AssertionError:
        detected.append("authored_exclusions")
    else:
        raise AssertionError("Deep expected-value oracle missed an authored exclusion")
    return detected


def consume(
    client: Any, exchange: Path, output: Path, version: str, *, retained: bool
) -> dict[str, Any]:
    expected = json.loads((exchange / "expectations.json").read_text())
    cases, written, retained_projects = expected["cases"], [], []
    for case in cases:
        if retained:
            retained_history(client, case)
        for archived in case["archives"]:
            content = Path(archived["path"]).read_bytes()
            assert digest(content) == archived["sha256"]
            project = import_bytes(
                client, content, archived["suffix"], f"read-{case['label']}-{archived['suffix']}"
            )
            assert_state(state(client, project), case["after"])
            retained_projects.append({"project_id": project["id"], "state": state(client, project)})
            reexported = export_bytes(
                client, project, f"reexport-{case['label']}-{archived['suffix']}", version
            )
            destination = (
                output / f"{case['label']}-from-{archived['suffix'].strip('.')}{archived['suffix']}"
            )
            destination.write_bytes(reexported)
            written.append(
                {
                    "case": case["label"],
                    "path": str(destination),
                    "suffix": archived["suffix"],
                    "sha256": digest(reexported),
                    "writer_version": version,
                    "state_origin": "current API-authored seed retained and re-exported",
                }
            )
    first = cases[0]
    probe = import_bytes(
        client, Path(first["archives"][0]["path"]).read_bytes(), SUFFIXES[0], "allocator-probe"
    )
    guards = stale_guards(client, probe, Path(client.app.state.editing_reader_data))
    allocation = allocator_probe(client, probe)
    controls = corruption_controls(
        client,
        Path(client.app.state.editing_reader_data),
        Path(first["archives"][0]["path"]).read_bytes(),
    )
    write_json(
        output / "reexports.json",
        {
            "writer_version": version,
            "files": written,
            "retained_projects": retained_projects,
            "allocator_case": allocation["retained_case"],
        },
    )
    return {
        "cases": len(cases),
        "case_labels": [c["label"] for c in cases],
        "archive_reads": len(written),
        "retained_history": retained,
        "archive_history_omission": True,
        "allocator_probe": {k: v for k, v in allocation.items() if k != "retained_case"},
        "stale_guards": guards,
        "corruption": controls,
        "deep_oracle_negative_controls": oracle_controls(cases),
        "authorship": "reader retained current-authored states; no new-fragment authoring claim",
    }


def read_reexports(
    client: Any,
    exchange: Path,
    previous_output: Path,
    version: str,
    previous_version: str = PREVIOUS_VERSION,
) -> dict[str, Any]:
    cases = {
        c["label"]: c for c in json.loads((exchange / "expectations.json").read_text())["cases"]
    }
    previous_evidence = json.loads((previous_output / "reexports.json").read_text())
    assert previous_evidence["writer_version"] == previous_version
    files = previous_evidence["files"]
    for retained in previous_evidence["retained_projects"]:
        project = client.get(f"/api/v1/projects/{retained['project_id']}").json()
        assert_state(state(client, project), retained["state"], retained=True)
        assert history_rows(client, project["id"]) == []
    retained_history(client, previous_evidence["allocator_case"])
    for item in files:
        data = Path(item["path"]).read_bytes()
        assert digest(data) == item["sha256"] and item["writer_version"] == previous_version
        for suffix in SUFFIXES:
            project = import_bytes(client, data, suffix, f"reverse-{item['case']}-{suffix}")
            assert_state(state(client, project), cases[item["case"]]["after"])
            again = export_bytes(
                client, project, f"reverse-reexport-{item['case']}-{suffix}", version
            )
            reopened = import_bytes(
                client, again, suffix, f"reverse-reopen-{item['case']}-{suffix}"
            )
            assert_state(state(client, reopened), cases[item["case"]]["after"])
    return {
        "previous_writer_archives": len(files),
        "current_reads": len(files) * 2,
        "current_reexport_reimports": len(files) * 2,
        "retained_previous_writer_projects": len(previous_evidence["retained_projects"]),
        "retained_old_authored_generic_history": True,
        "reverse_scope": (
            f"actual {previous_version} writer re-exported current-authored state seeds"
        ),
    }


def child(args: argparse.Namespace) -> None:
    from alembic import command
    from alembic.config import Config
    from neistra_api.main import create_app
    from neistra_api.settings import Settings

    from tests.support.api_client import ApiClient

    root, data = args.root.resolve(), args.data.resolve()
    record = identity(root, args.version, args.receipt, args.previous_tag, args.previous_commit)
    if args.mode == "produce":
        command.upgrade(Config(str(root / "alembic.ini")), "head")
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'neistra.db'}"))
    assert app.version == args.version
    app.state.editing_reader_data = str(data)
    client = ApiClient(app)
    try:
        from sqlalchemy import text

        with app.state.engine.connect() as connection:
            database_heads = list(
                connection.execute(text("SELECT version_num FROM alembic_version")).scalars()
            )
        assert database_heads == ["0015"], database_heads
        if args.mode == "produce":
            result = produce(client, root, args.exchange, args.version)
        elif args.mode == "consume":
            result = consume(client, args.exchange, args.output, args.version, retained=True)
        else:
            result = read_reexports(
                client, args.exchange, args.previous_output, args.version, args.previous_version
            )
        verify_source(record)
        result.update(
            mode=args.mode,
            identity=record,
            database_heads=database_heads,
            wrapper_sha256=digest(Path(__file__).read_bytes()),
        )
        write_json(args.evidence, result)
        print(
            json.dumps(
                {
                    "mode": args.mode,
                    "version": args.version,
                    "result": {k: v for k, v in result.items() if k != "identity"},
                }
            )
        )
    finally:
        app.state.engine.dispose()


def run(args: argparse.Namespace) -> None:
    root = args.current_root.resolve()
    previous = args.previous_root.resolve()
    work = args.workspace.resolve()
    assert not work.exists(), "Use a new disposable qualification workspace"
    assert not work.is_relative_to(root) and not work.is_relative_to(previous)
    assert re.fullmatch(r"\d+\.\d+\.\d+", args.current_version), "Stable current version required"
    verify_previous_receipt(
        json.loads(args.previous_receipt.read_text()),
        args.previous_version,
        args.previous_tag,
        args.previous_commit,
    )
    actual_commit = subprocess.check_output(
        ["git", "rev-parse", f"{args.previous_tag}^{{}}"], cwd=root, text=True
    ).strip()
    assert actual_commit == args.previous_commit, "Preceding commit differs from actual Git tag"
    if not args.diagnostic:
        assert tuple(map(int, args.current_version.split("."))) > tuple(
            map(int, args.previous_version.split("."))
        ), "Release producer must follow the preceding version"
    work.mkdir(parents=True)
    exchange, output = work / "current-exchange", work / "previous-reexports"
    exchange.mkdir()
    output.mkdir()
    phases = []

    def invoke(mode: str, source: Path, version: str, data: Path, extra: list[str]) -> None:
        data.mkdir(exist_ok=True)
        env = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(("NEISTRA_", "MOLWEAVE_"))
            and k not in {"PYTHONPATH", "PYTHONOPTIMIZE"}
        }
        env.update(
            PYTHONPATH=os.pathsep.join(
                str(source / p)
                for p in [
                    "apps/api/src",
                    "packages/neistra_core/src",
                    "packages/neistra_demo_plugin/src",
                    ".",
                ]
            ),
            PYTHONDONTWRITEBYTECODE="1",
            PYTHONPYCACHEPREFIX=str(work / "bytecode-cache"),
            NEISTRA_DATA_DIR=str(data),
            NEISTRA_DATABASE_URL=f"sqlite:///{data / 'neistra.db'}",
        )
        evidence = work / f"{mode}-{version}.json"
        command_vector = [
            str(args.python.absolute()),
            "-B",
            str(Path(__file__).resolve()),
            "child",
            mode,
            "--root",
            str(source),
            "--version",
            version,
            "--data",
            str(data),
            "--exchange",
            str(exchange),
            "--evidence",
            str(evidence),
            "--previous-version",
            args.previous_version,
            "--previous-tag",
            args.previous_tag,
            "--previous-commit",
            args.previous_commit,
            *extra,
        ]
        log = work / f"{mode}-{version}.log"
        with log.open("wb") as handle:
            process = subprocess.run(
                command_vector, cwd=source, env=env, stdout=handle, stderr=subprocess.STDOUT
            )
        phases.append(
            {
                "mode": mode,
                "version": version,
                "argv": command_vector,
                "cwd": str(source),
                "returncode": process.returncode,
                "log": str(log),
                "log_sha256": digest(log.read_bytes()),
            }
        )
        write_json(work / "phases.json", phases)
        print(f"{mode} {version}: exit {process.returncode}; {log}", flush=True)
        assert process.returncode == 0, log.read_text()[-10000:]

    produced = work / "current-produced"
    invoke("produce", root, args.current_version, produced, [])
    retained = work / "previous-retained"
    shutil.copytree(produced, retained)
    invoke(
        "consume",
        previous,
        args.previous_version,
        retained,
        ["--output", str(output), "--receipt", str(args.previous_receipt.resolve())],
    )
    reverse = work / "current-reverse"
    shutil.copytree(retained, reverse)
    invoke(
        "read-reexports",
        root,
        args.current_version,
        reverse,
        ["--previous-output", str(output)],
    )
    result = {
        "release_qualification": not args.diagnostic,
        "diagnostic": args.diagnostic,
        "current_version": args.current_version,
        "previous_version": args.previous_version,
        "previous_tag": args.previous_tag,
        "previous_commit": args.previous_commit,
        "phases": phases,
        "wrapper_sha256": digest(Path(__file__).read_bytes()),
        "scope": "new editing states; existing rich/connectivity and opaque-job families "
        "remain separate",
        "limitations": [
            "Older writer retained current-authored seeds; "
            "it did not author new fragment operations.",
            "Native archives omit portable Undo history; "
            "copied live stores exercise actual retained history.",
            *(
                ["Final source/version rerun is required after diagnostic qualification."]
                if args.diagnostic
                else []
            ),
        ],
    }
    write_json(work / "summary.json", result)
    print(json.dumps(result, indent=2))


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="task", required=True)
    runner = subs.add_parser("run")
    runner.add_argument("--current-root", type=Path, required=True)
    runner.add_argument("--previous-root", type=Path, required=True)
    runner.add_argument("--previous-receipt", type=Path, required=True)
    runner.add_argument("--python", type=Path, required=True)
    runner.add_argument("--workspace", type=Path, required=True)
    runner.add_argument("--current-version", default="0.32.0")
    runner.add_argument("--previous-version", default=PREVIOUS_VERSION)
    runner.add_argument("--previous-tag", default=f"v{PREVIOUS_VERSION}")
    runner.add_argument("--previous-commit", default=PREVIOUS_COMMIT)
    runner.add_argument("--diagnostic", action="store_true")
    worker = subs.add_parser("child")
    worker.add_argument("mode", choices=("produce", "consume", "read-reexports"))
    for name in ("root", "data", "exchange", "evidence"):
        worker.add_argument(f"--{name}", type=Path, required=True)
    worker.add_argument("--version", required=True)
    worker.add_argument("--previous-version", default=PREVIOUS_VERSION)
    worker.add_argument("--previous-tag", default=f"v{PREVIOUS_VERSION}")
    worker.add_argument("--previous-commit", default=PREVIOUS_COMMIT)
    worker.add_argument("--receipt", type=Path)
    worker.add_argument("--output", type=Path)
    worker.add_argument("--previous-output", type=Path)
    return parser


def main() -> None:
    args = parser().parse_args()
    (run if args.task == "run" else child)(args)


if __name__ == "__main__":
    main()
