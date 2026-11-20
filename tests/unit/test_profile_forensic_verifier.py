"""Offline integrity controls for supplemental failed-run forensic verification."""

from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import io
import json
import runpy
import shutil
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

REPOSITORY = Path(__file__).resolve().parents[2]
VERIFIER = runpy.run_path(str(REPOSITORY / "tools/verify_profile_forensics.py"))
HELPER = "docs/assets/ligand-profiles/release-evidence.py.txt"
INDEX = "docs/assets/ligand-profiles/forensics/c3-forensics-index.json"
QUALIFICATION = "docs/assets/ligand-profiles/qualification.py.txt"
PROTOCOL = "private-derived-same-schema-v2"
QUALIFIER = runpy.run_path(str(REPOSITORY / QUALIFICATION))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True).encode()


def fingerprint(data: bytes) -> dict[str, Any]:
    return {"bytes": len(data), "sha256": sha(data)}


def archive(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as output:
        for name, data in files.items():
            output.writestr(name, data)
        output.writestr("manifest.json", encoded({k: fingerprint(v) for k, v in files.items()}))
    return buffer.getvalue()


@dataclass
class Fixture:
    root: Path
    index: dict[str, Any]
    plan: dict[str, Any]
    release: dict[str, Any]
    network: list[str]

    def write(self) -> None:
        (self.root / INDEX).write_bytes(encoded(self.index))
        self.plan["index_sha256"] = sha(encoded(self.index))
        (self.root / ".issue-11-evidence/plan.json").write_bytes(encoded(self.plan))
        (self.root / ".issue-11-evidence/release.json").write_bytes(encoded(self.release))

    def args(self, mode: str = "local") -> argparse.Namespace:
        return argparse.Namespace(
            root=self.root,
            index=INDEX,
            mode=mode,
            plan=self.root / ".issue-11-evidence/plan.json",
            remote_assets=self.root / ".issue-11-evidence/release.json",
            downloads=self.root / ".issue-11-evidence/downloads",
            output=self.root / ".issue-11-evidence/receipt.json",
        )

    def verify(self, mode: str = "local") -> dict[str, Any]:
        self.write()
        args = self.args(mode)
        VERIFIER["verify"](args)
        return json.loads(args.output.read_bytes())  # type: ignore[no-any-return]


@pytest.fixture
def evidence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Fixture:
    destination = tmp_path / HELPER
    destination.parent.mkdir(parents=True)
    shutil.copyfile(REPOSITORY / HELPER, destination)
    (tmp_path / INDEX).parent.mkdir()
    shutil.copyfile(REPOSITORY / QUALIFICATION, tmp_path / QUALIFICATION)
    qualification_data = {}
    for name in sorted(QUALIFIER["DATA"]):
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(("retained data: " + name).encode())
        qualification_data[name] = fingerprint(path.read_bytes())
    sources = {QUALIFICATION: sha((tmp_path / QUALIFICATION).read_bytes())}
    sources.update({name: row["sha256"] for name, row in qualification_data.items()})
    # Field controls isolate historic Git I/O; integration uses genuine commit blobs.
    monkeypatch.setitem(
        VERIFIER["verify_provenance"].__globals__,
        "historical_identities",
        lambda root, revision, qualification: sources.copy(),
    )
    private = tmp_path / ".issue-11-evidence"
    private.mkdir()
    helper = runpy.run_path(str(destination))
    index: dict[str, Any] = {
        "format_version": 1,
        "repository": "ManuelSe/Neistra",
        "issue": 160,
        "parent": 11,
        "release_version": "0.38.0",
        "part_max_bytes_exclusive": 80 * 1024 * 1024,
        "runs": [],
    }
    plan: dict[str, Any] = {"index": INDEX, "assets": []}
    release: dict[str, Any] = {
        "tag_name": "v0.38.0",
        "draft": False,
        "prerelease": False,
        "assets": [],
    }
    for number in (5, 6):
        label = f"c4-candidate{number}"
        prefix = f"docs/assets/ligand-profiles/{label}"
        log = f"{prefix}-browser.log.gz"
        log_body = f"{label}: native gate failed without qualification\n".encode()
        (tmp_path / log).write_bytes(gzip.compress(log_body, mtime=0))
        recipe = {
            "label": label,
            "application_version": "0.38.0",
            "compatibility_protocol": PROTOCOL,
            "steps": [
                {
                    "label": "browser",
                    "command": ["native", "test"],
                    "environment": {"QUALIFICATION": "1"},
                    "cwd": str(tmp_path),
                }
            ],
            "preceding_reader": {
                "tag": "v0.37.0",
                "version": "0.37.0",
                "commit": "4" * 40,
                "schema_head": "0017",
            },
        }
        recipe_bytes = encoded(recipe)
        (tmp_path / (prefix + "-recipe.json")).write_bytes(recipe_bytes)
        previous = {"old.py": "2" * 64}
        gate = {
            "label": label,
            "commit": "3" * 40,
            "complete": False,
            "recipe_sha256": sha(recipe_bytes),
            "compatibility_protocol": PROTOCOL,
            "qualification_data_before": qualification_data,
            "qualification_data_after": qualification_data,
            "qualification_data_unchanged": True,
            "runner_sha256": sources[QUALIFICATION],
            "source_before": sources,
            "source_after": sources,
            "source_unchanged": True,
            "preceding_source_before": previous,
            "preceding_source_after": previous,
            "preceding_source_expected": previous,
            "preceding_source_unchanged": True,
            "preceding_reader": recipe["preceding_reader"],
            "steps": [
                {**recipe["steps"][0], "exit_code": 1, "log": log, "log_sha256": sha(log_body)}
            ],
        }
        (tmp_path / (prefix + "-gate.json")).write_bytes(encoded(gate))
        # Same relative names in independent runs are legitimate; roots must remain distinct.
        payload = {
            "focused/result.txt": label.encode(),
            "nested.zip.gz": gzip.compress(
                b"--request-boundary\r\nContent-Type: application/zip\r\n\r\n"
                + archive({"leaf.txt": b"nested"})
                + b"\r\n--request-boundary--\r\n",
                mtime=0,
            ),
        }
        canonical = {name: fingerprint(body) for name, body in payload.items()}
        body = encoded({"format_version": 1, "run": label, "files": canonical})
        compressed = gzip.compress(body, mtime=0)
        inventory_path = f"docs/assets/ligand-profiles/c3-forensics-inventory-{label}.json.gz"
        (tmp_path / inventory_path).write_bytes(compressed)
        parts = []
        for ordinal, (name, data) in enumerate(payload.items(), 1):
            asset = f"{label}-part{ordinal:02d}.zip"
            path = private / asset
            path.write_bytes(archive({name: data}))
            identity = fingerprint(path.read_bytes())
            parts.append(
                {
                    "ordinal": ordinal,
                    "asset_name": asset,
                    **identity,
                    "manifest_entries": 1,
                    "recursive_verification": helper["verify_layers"](path, asset),
                    "repository_path": None,
                }
            )
            plan["assets"].append(
                {"run": label, "asset_name": asset, "local_path": str(path), **identity}
            )
            release["assets"].append(
                {
                    "id": len(release["assets"]) + 1,
                    "name": asset,
                    "size": identity["bytes"],
                    "digest": "sha256:" + identity["sha256"],
                    "state": "uploaded",
                    "browser_download_url": "https://github.com/ManuelSe/Neistra/releases/download/v0.38.0/"
                    + asset,
                }
            )
        index["runs"].append(
            {
                "label": label,
                "extraction_root": "forensics/" + label,
                "qualification_complete": False,
                "failed_candidate": "3" * 40,
                "failed_step": "browser",
                "source_count": len(sources),
                "source_digest": sha(encoded(sources)),
                "source_unchanged": True,
                "preceding_source_count": 1,
                "preceding_source_unchanged": True,
                "recipe": {"path": prefix + "-recipe.json", "sha256": sha(recipe_bytes)},
                "lossless_logs": [
                    {"label": "browser", "path": log, "uncompressed_sha256": sha(log_body)}
                ],
                "parts": parts,
                "files": len(canonical),
                "raw_bytes": sum(row["bytes"] for row in canonical.values()),
                "inventory": {
                    "path": inventory_path,
                    **fingerprint(compressed),
                    "uncompressed_sha256": sha(body),
                },
            }
        )
    index["asset_count"] = len(plan["assets"])
    index["total_asset_bytes"] = sum(row["bytes"] for row in plan["assets"])
    network: list[str] = []

    def blocked(*args: Any, **kwargs: Any) -> Any:
        network.append("unexpected")
        raise RuntimeError("Actual network is forbidden in verifier controls")

    monkeypatch.setattr(urllib.request, "urlopen", blocked)
    fixture = Fixture(tmp_path, index, plan, release, network)
    fixture.write()
    return fixture


def test_local_recursive_union_and_isolated_runs(evidence: Fixture) -> None:
    receipt = evidence.verify()
    assert receipt["complete"] and receipt["all_indexed_assets_verified"]
    assert receipt["asset_count"] == 4 and receipt["failed_runs_remain_unqualified"]
    assert (
        sum(
            a["supplemental_wrapped_recursive_verification"]["zip_archives"]
            for a in receipt["assets"]
        )
        == 2
    )
    assert (
        sum(
            a["recursive_verification_including_wrapped"]["zip_archives"] for a in receipt["assets"]
        )
        == 6
    )
    assert len({row["extraction_root"] for row in receipt["runs"]}) == 2
    assert all(row["provenance"]["lossless_logs_verified"] == 1 for row in receipt["runs"])
    assert receipt["verifier_sha256"] == sha(
        (REPOSITORY / "tools/verify_profile_forensics.py").read_bytes()
    )
    assert receipt["qualified_helper_sha256"] == sha((evidence.root / HELPER).read_bytes())
    assert not evidence.network


def test_exact_indexed_repository_part_is_supported(evidence: Fixture) -> None:
    part = evidence.index["runs"][0]["parts"][0]
    asset = evidence.plan["assets"][0]
    part["repository_path"] = "docs/assets/ligand-profiles/forensics/retained.zip"
    destination = evidence.root / part["repository_path"]
    destination.parent.mkdir(exist_ok=True)
    shutil.copyfile(asset["local_path"], destination)
    asset["local_path"] = str(destination)
    assert evidence.verify()["complete"]
    assert not evidence.network


@pytest.mark.parametrize(
    "control",
    [
        "duplicate_asset",
        "bad_ordinal",
        "boolean_ordinal",
        "oversize_part",
        "false_qualification",
        "duplicate_run",
        "cross_run_extraction",
        "unsafe_run",
        "wrong_issue",
        "wrong_version",
        "wrong_repository",
        "missing_part",
    ],
)
def test_index_refusals(evidence: Fixture, control: str) -> None:
    run = evidence.index["runs"][0]
    part = run["parts"][0]
    if control == "duplicate_asset":
        evidence.index["runs"][1]["parts"][0]["asset_name"] = part["asset_name"]
    elif control == "bad_ordinal":
        part["ordinal"] = 2
    elif control == "boolean_ordinal":
        part["ordinal"] = True
    elif control == "oversize_part":
        part["bytes"] = 80 * 1024 * 1024
    elif control == "false_qualification":
        run["qualification_complete"] = True
    elif control == "duplicate_run":
        evidence.index["runs"][1]["label"] = run["label"]
    elif control == "cross_run_extraction":
        evidence.index["runs"][1]["extraction_root"] = run["extraction_root"]
    elif control == "unsafe_run":
        run["label"] = "../c4-candidate5"
    elif control == "wrong_issue":
        evidence.index["issue"] = 157
    elif control == "wrong_version":
        evidence.index["release_version"] = "0.37.0"
    elif control == "wrong_repository":
        evidence.index["repository"] = "other/Neistra"
    elif control == "missing_part":
        run["parts"].pop()
    with pytest.raises(AssertionError):
        evidence.verify()
    assert not evidence.network


@pytest.mark.parametrize(
    "control",
    [
        "missing_recipe",
        "missing_gate",
        "missing_provenance",
        "missing_log",
        "wrong_recipe",
        "wrong_log",
        "wrong_source",
        "wrong_source_count",
        "source_drift",
        "old_source_drift",
        "wrong_commit",
        "wrong_runner",
        "gate_complete",
        "successful_failed_step",
    ],
)
def test_provenance_refusals(evidence: Fixture, control: str) -> None:
    run = evidence.index["runs"][0]
    gate_path = evidence.root / "docs/assets/ligand-profiles/c4-candidate5-gate.json"
    gate = json.loads(gate_path.read_bytes())
    if control == "missing_recipe":
        (evidence.root / run["recipe"]["path"]).unlink()
    elif control == "missing_gate":
        gate_path.unlink()
    elif control == "missing_provenance":
        del run["source_digest"]
    elif control == "missing_log":
        (evidence.root / run["lossless_logs"][0]["path"]).unlink()
    elif control == "wrong_recipe":
        run["recipe"]["sha256"] = "0" * 64
    elif control == "wrong_log":
        run["lossless_logs"][0]["uncompressed_sha256"] = "0" * 64
    elif control == "wrong_source":
        run["source_digest"] = "0" * 64
    elif control == "wrong_source_count":
        run["source_count"] += 1
    elif control == "source_drift":
        gate["source_after"] = {"drift.py": "0" * 64}
    elif control == "old_source_drift":
        gate["preceding_source_after"] = {}
    elif control == "wrong_commit":
        gate["commit"] = "9" * 40
    elif control == "wrong_runner":
        gate["runner_sha256"] = "0" * 64
    elif control == "gate_complete":
        gate["complete"] = True
    elif control == "successful_failed_step":
        gate["steps"][-1]["exit_code"] = 0
    if control != "missing_gate":
        gate_path.write_bytes(encoded(gate))
    with pytest.raises((AssertionError, KeyError)):
        evidence.verify()
    assert not evidence.network


@pytest.mark.parametrize(
    "control",
    [
        "wrong_body",
        "wrong_size",
        "plan_outside_root",
        "asset_outside_root",
        "public_local_path",
        "symlink_asset",
        "duplicate_plan",
        "wrong_plan_run",
        "unsafe_inventory",
        "unsafe_index",
        "inventory_union",
        "part_overlap",
        "recursive_corruption",
        "missing_asset",
        "wrong_repository_path",
        "unsafe_manifest",
        "crc_corruption",
    ],
)
def test_local_integrity_refusals(evidence: Fixture, control: str) -> None:
    run = evidence.index["runs"][0]
    part = run["parts"][0]
    asset = evidence.plan["assets"][0]
    path = Path(asset["local_path"])
    args = evidence.args()
    if control == "wrong_body":
        path.write_bytes(b"x" * path.stat().st_size)
    elif control == "wrong_size":
        path.write_bytes(path.read_bytes() + b"x")
    elif control == "plan_outside_root":
        args.plan = evidence.root / "unowned-plan.json"
        shutil.copyfile(evidence.root / ".issue-11-evidence/plan.json", args.plan)
    elif control == "asset_outside_root":
        asset["local_path"] = str(evidence.root.parent / "external.zip")
        shutil.copyfile(path, asset["local_path"])
    elif control == "public_local_path":
        destination = evidence.root / "unexpected.zip"
        shutil.copyfile(path, destination)
        asset["local_path"] = str(destination)
    elif control == "symlink_asset":
        link = path.with_name("link.zip")
        link.symlink_to(path)
        asset["local_path"] = str(link)
    elif control == "duplicate_plan":
        evidence.plan["assets"][1] = copy.deepcopy(asset)
    elif control == "wrong_plan_run":
        asset["run"] = "c4-candidate6"
    elif control == "unsafe_inventory":
        run["inventory"]["path"] = "../inventory.json.gz"
    elif control == "unsafe_index":
        args.index = "../outside.json"
    elif control == "inventory_union":
        inventory = run["inventory"]
        inv_path = evidence.root / inventory["path"]
        value = json.loads(gzip.decompress(inv_path.read_bytes()))
        value["files"].pop("focused/result.txt")
        body = encoded(value)
        compressed = gzip.compress(body, mtime=0)
        inv_path.write_bytes(compressed)
        inventory.update(**fingerprint(compressed), uncompressed_sha256=sha(body))
    elif control == "part_overlap":
        duplicate = copy.deepcopy(part)
        duplicate.update(ordinal=2, asset_name=run["parts"][1]["asset_name"])
        run["parts"][1] = duplicate
        second = evidence.plan["assets"][1]
        second.update(local_path=str(path), bytes=part["bytes"], sha256=part["sha256"])
        evidence.index["total_asset_bytes"] = sum(
            p["bytes"] for r in evidence.index["runs"] for p in r["parts"]
        )
    elif control == "recursive_corruption":
        # Outer identity/manifest agree, while the nested manifest's leaf hash is wrong.
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, "w") as z:
            z.writestr("leaf.txt", b"bad")
            z.writestr("manifest.json", encoded({"leaf.txt": fingerprint(b"good")}))
        path.write_bytes(archive({"nested.zip": inner.getvalue()}))
        identity = fingerprint(path.read_bytes())
        evidence.index["total_asset_bytes"] += identity["bytes"] - part["bytes"]
        part.update(identity)
        asset.update(identity)
    elif control == "missing_asset":
        path.unlink()
    elif control == "wrong_repository_path":
        part["repository_path"] = "docs/assets/ligand-profiles/different.zip"
    elif control in {"unsafe_manifest", "crc_corruption"}:
        data = archive({"../unsafe.txt" if control == "unsafe_manifest" else "safe.txt": b"value"})
        if control == "crc_corruption":
            damaged = bytearray(data)
            damaged[data.index(b"value")] ^= 1
            data = bytes(damaged)
        path.write_bytes(data)
        identity = fingerprint(data)
        evidence.index["total_asset_bytes"] += identity["bytes"] - part["bytes"]
        part.update(identity)
        asset.update(identity)
    evidence.write()
    with pytest.raises((AssertionError, zipfile.BadZipFile)):
        VERIFIER["verify"](args)
    assert not evidence.network


@pytest.mark.parametrize(
    "control",
    [
        "wrong_server_digest",
        "wrong_server_size",
        "wrong_host",
        "wrong_tag",
        "wrong_path",
        "wrong_scheme",
        "query",
        "fragment",
        "wrong_state",
        "duplicate_asset",
        "missing_asset",
        "draft",
        "prerelease",
        "release_tag",
    ],
)
def test_anonymous_metadata_refused_before_network(evidence: Fixture, control: str) -> None:
    asset = evidence.release["assets"][0]
    url = asset["browser_download_url"]
    if control == "wrong_server_digest":
        asset["digest"] = "sha256:" + "0" * 64
    elif control == "wrong_server_size":
        asset["size"] += 1
    elif control == "wrong_host":
        asset["browser_download_url"] = url.replace("github.com", "example.invalid")
    elif control == "wrong_tag":
        asset["browser_download_url"] = url.replace("v0.38.0", "v0.37.0")
    elif control == "wrong_path":
        asset["browser_download_url"] = url.replace("ManuelSe/Neistra", "other/Neistra")
    elif control == "wrong_scheme":
        asset["browser_download_url"] = url.replace("https:", "http:")
    elif control == "query":
        asset["browser_download_url"] += "?token=x"
    elif control == "fragment":
        asset["browser_download_url"] += "#fragment"
    elif control == "wrong_state":
        asset["state"] = "new"
    elif control == "duplicate_asset":
        evidence.release["assets"].append(copy.deepcopy(asset))
    elif control == "missing_asset":
        evidence.release["assets"].pop()
    elif control == "draft":
        evidence.release["draft"] = True
    elif control == "prerelease":
        evidence.release["prerelease"] = True
    elif control == "release_tag":
        evidence.release["tag_name"] = "v0.37.0"
    with pytest.raises(AssertionError):
        evidence.verify("anonymous")
    assert not evidence.network


@pytest.mark.parametrize(
    "control", ["valid", "wrong_body", "short_body", "long_body", "http_error"]
)
def test_anonymous_full_body_with_fake_opener(
    evidence: Fixture, monkeypatch: pytest.MonkeyPatch, control: str
) -> None:
    requests: list[str] = []
    bodies = {
        row["asset_name"]: Path(row["local_path"]).read_bytes() for row in evidence.plan["assets"]
    }

    class Response(io.BytesIO):
        status = 503 if control == "http_error" else 200

        def read(self, size: int | None = -1) -> bytes:
            # Force multiple reads and the final EOF; no metadata-only success is possible.
            return super().read(17 if size is None or size < 0 else min(size, 17))

    def fake(request: urllib.request.Request, *, timeout: int) -> Response:
        assert timeout == 60 and not request.has_header("Authorization")
        requests.append(request.full_url)
        data = bodies[request.full_url.rsplit("/", 1)[1]]
        if control == "wrong_body":
            data = b"x" * len(data)
        elif control == "short_body":
            data = data[:-1]
        elif control == "long_body":
            data += b"x"
        return Response(data)

    monkeypatch.setattr(urllib.request, "urlopen", fake)
    if control == "valid":
        receipt = evidence.verify("anonymous")
        assert len(requests) == receipt["asset_count"] == 4
        assert all(
            a["anonymous_request"] and not a["request_auth_header_present"]
            for a in receipt["assets"]
        )
        for asset in evidence.plan["assets"]:
            assert (evidence.args().downloads / asset["asset_name"]).read_bytes() == bodies[
                asset["asset_name"]
            ]
    else:
        with pytest.raises(AssertionError):
            evidence.verify("anonymous")
        assert len(requests) == 1 and not evidence.args().output.exists()
    assert not evidence.network


def rewrite_provenance(
    evidence: Fixture, gate: dict[str, Any], recipe: dict[str, Any] | None = None
) -> None:
    run = evidence.index["runs"][0]
    if recipe is not None:
        recipe_bytes = encoded(recipe)
        (evidence.root / run["recipe"]["path"]).write_bytes(recipe_bytes)
        run["recipe"]["sha256"] = gate["recipe_sha256"] = sha(recipe_bytes)
    gate_path = evidence.root / "docs/assets/ligand-profiles/c4-candidate5-gate.json"
    gate_path.write_bytes(encoded(gate))


@pytest.mark.parametrize(
    "control",
    [
        "missing_recipe_protocol",
        "wrong_recipe_protocol",
        "missing_gate_protocol",
        "wrong_gate_protocol",
        "wrong_schema",
        "wrong_predecessor_version",
        "wrong_predecessor_tag",
        "missing_data_path",
        "extra_data_path",
        "false_unchanged",
        "before_after_mismatch",
        "changed_data_body",
        "changed_data_size",
        "boolean_data_size",
        "inconsistent_source_hash",
        "historical_source_mismatch",
        "changed_command",
        "changed_environment",
        "changed_cwd",
        "earlier_failure",
        "boolean_failed_exit",
        "empty_steps",
        "wrong_prefix",
    ],
)
def test_current_protocol_data_and_step_refusals(
    evidence: Fixture, monkeypatch: pytest.MonkeyPatch, control: str
) -> None:
    run = evidence.index["runs"][0]
    recipe = json.loads((evidence.root / run["recipe"]["path"]).read_bytes())
    gate = json.loads(
        (evidence.root / "docs/assets/ligand-profiles/c4-candidate5-gate.json").read_bytes()
    )
    name = sorted(QUALIFIER["DATA"])[0]
    if control == "missing_recipe_protocol":
        del recipe["compatibility_protocol"]
    elif control == "wrong_recipe_protocol":
        recipe["compatibility_protocol"] = "legacy-v1"
    elif control == "missing_gate_protocol":
        del gate["compatibility_protocol"]
    elif control == "wrong_gate_protocol":
        gate["compatibility_protocol"] = "legacy-v1"
    elif control in {"wrong_schema", "wrong_predecessor_version", "wrong_predecessor_tag"}:
        field, value = {
            "wrong_schema": ("schema_head", "0016"),
            "wrong_predecessor_version": ("version", "0.36.0"),
            "wrong_predecessor_tag": ("tag", "v0.36.0"),
        }[control]
        recipe["preceding_reader"][field] = gate["preceding_reader"][field] = value
    elif control == "missing_data_path":
        del gate["qualification_data_before"][name]
        del gate["qualification_data_after"][name]
    elif control == "extra_data_path":
        for field in ("qualification_data_before", "qualification_data_after"):
            gate[field]["docs/assets/ligand-profiles/unexpected.json"] = fingerprint(b"extra")
    elif control == "false_unchanged":
        gate["qualification_data_unchanged"] = False
    elif control == "before_after_mismatch":
        gate["qualification_data_after"][name]["bytes"] += 1
    elif control == "changed_data_body":
        path = evidence.root / name
        path.write_bytes(b"x" * path.stat().st_size)
    elif control == "changed_data_size":
        path = evidence.root / name
        path.write_bytes(path.read_bytes() + b"x")
    elif control == "boolean_data_size":
        for field in ("qualification_data_before", "qualification_data_after"):
            gate[field][name]["bytes"] = True
    elif control == "inconsistent_source_hash":
        for field in ("source_before", "source_after"):
            gate[field][name] = "0" * 64
        run["source_digest"] = sha(encoded(gate["source_before"]))
        # Allow the independent historic source check; this control isolates DATA binding.
        monkeypatch.setitem(
            VERIFIER["verify_provenance"].__globals__,
            "historical_identities",
            lambda root, revision, qualification: gate["source_before"],
        )
    elif control == "historical_source_mismatch":
        monkeypatch.setitem(
            VERIFIER["verify_provenance"].__globals__,
            "historical_identities",
            lambda root, revision, qualification: {},
        )
    elif control == "changed_command":
        gate["steps"][0]["command"] = ["unrecorded", "command"]
    elif control == "changed_environment":
        gate["steps"][0]["environment"] = {"QUALIFICATION": "different"}
    elif control == "changed_cwd":
        gate["steps"][0]["cwd"] = "/different/root"
    elif control == "earlier_failure":
        earlier = copy.deepcopy(gate["steps"][0])
        earlier["label"] = "earlier"
        gate["steps"].insert(0, earlier)
        recipe["steps"].insert(0, {"label": "earlier"})
    elif control == "boolean_failed_exit":
        gate["steps"][0]["exit_code"] = True
    elif control == "empty_steps":
        gate["steps"] = []
    elif control == "wrong_prefix":
        recipe["steps"].insert(0, {"label": "missing-first-command"})
    rewrite_provenance(evidence, gate, recipe)
    with pytest.raises((AssertionError, KeyError)):
        evidence.verify()
    assert not evidence.args().output.exists() and not evidence.network


def test_corrected_working_sources_do_not_replace_historic_bodies(evidence: Fixture) -> None:
    # The retained runner may be corrected after the failed candidate; the historical
    # map remains the authority for its old body. DATA stays an immutable byte check.
    path = evidence.root / QUALIFICATION
    path.write_text(path.read_text() + "\n# Later non-semantic working correction.\n")
    receipt = evidence.verify()
    assert all(r["provenance"]["historical_source_bodies_verified"] for r in receipt["runs"])
    assert all(r["provenance"]["qualification_data_files_verified"] == 3 for r in receipt["runs"])


def test_historic_git_body_hashing_uses_explicit_repository(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    revision = "a" * 40
    body = b"committed historical body\n"
    calls = []

    def git(command: list[str], **kwargs: Any) -> bytes | str:
        calls.append((command, kwargs))
        assert kwargs["cwd"] == tmp_path
        if command[1] == "ls-tree":
            return "tests/original.py\ndocs/unselected.txt\n"
        assert command == ["git", "cat-file", "--batch"]
        assert kwargs["input"] == f"{revision}:tests/original.py\n".encode()
        return b"b" * 40 + b" blob " + str(len(body)).encode() + b"\n" + body + b"\n"

    # Obtain the original unpatched function; field fixtures mock only their own globals.
    isolated = runpy.run_path(str(REPOSITORY / "tools/verify_profile_forensics.py"))
    monkeypatch.setattr(isolated["subprocess"], "check_output", git)
    result = isolated["historical_identities"](
        tmp_path, revision, {"selected": lambda path: path.startswith("tests/")}
    )
    assert result == {"tests/original.py": sha(body)} and len(calls) == 2


@pytest.mark.parametrize("control", ["valid", "crc", "manifest", "unsafe", "symlink"])
def test_wrapped_zip_is_audited_behind_multipart_preamble(tmp_path: Path, control: str) -> None:
    helper = runpy.run_path(str(REPOSITORY / HELPER))
    leaf = b"retained project payload"
    inner = io.BytesIO()
    name = "../escape" if control == "unsafe" else "artifacts/original"
    with zipfile.ZipFile(inner, "w", compression=zipfile.ZIP_STORED) as output:
        info = zipfile.ZipInfo(name)
        if control == "symlink":
            info.create_system = 3
            info.external_attr = 0o120777 << 16
        output.writestr(info, leaf)
        output.writestr(
            "manifest.json",
            encoded(
                {
                    "schema_version": 3,
                    "files": [
                        {
                            "path": name,
                            "bytes": len(leaf),
                            "sha256": "0" * 64 if control == "manifest" else sha(leaf),
                        }
                    ],
                }
            ),
        )
    wrapped = b"--boundary\r\nContent-Type: application/zip\r\n\r\n" + inner.getvalue()
    wrapped += b"\r\n--boundary--\r\n"
    if control == "crc":
        broken = bytearray(wrapped)
        broken[wrapped.index(leaf)] ^= 1
        wrapped = bytes(broken)
    outer = tmp_path / "outer.zip"
    outer.write_bytes(archive({"requests/body.dat": gzip.compress(wrapped, mtime=0)}))
    legacy = helper["verify_layers"](outer, "outer.zip")
    assert legacy == {"zip_archives": 1, "evidence_manifest_entries": 1, "project_archive_files": 0}
    if control == "valid":
        counts = VERIFIER["verify_wrapped_layers"](outer, "outer.zip", helper)
        assert counts == {
            "zip_archives": 1,
            "evidence_manifest_entries": 0,
            "project_archive_files": 1,
        }
    else:
        with pytest.raises((AssertionError, zipfile.BadZipFile)):
            VERIFIER["verify_wrapped_layers"](outer, "outer.zip", helper)
