"""Verify indexed supplemental forensics; this does not qualify an application gate."""

import argparse
import gzip
import hashlib
import json
import re
import runpy
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def owned_file(root: Path, name: str, helper: dict[str, Any]) -> Path:
    safe = helper["safe_name"](name)
    assert isinstance(safe, str)
    path = root / safe
    assert path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root)
    return path


def verify_provenance(root: Path, run: dict[str, Any], helper: dict[str, Any]) -> dict[str, Any]:
    """Bind historical failure metadata to retained actual gate, recipe and lossless logs."""
    recipe_path = owned_file(root, run["recipe"]["path"], helper)
    recipe_bytes = recipe_path.read_bytes()
    assert sha(recipe_bytes) == run["recipe"]["sha256"]
    recipe = json.loads(recipe_bytes)
    assert recipe["label"] == run["label"] and recipe["application_version"] == "0.36.0"
    assert recipe_path.name == run["label"] + "-recipe.json"
    gate_path = recipe_path.with_name(run["label"] + "-gate.json")
    gate = json.loads(owned_file(root, gate_path.relative_to(root).as_posix(), helper).read_bytes())
    assert gate["label"] == run["label"] and gate["commit"] == run["failed_candidate"]
    assert gate["recipe_sha256"] == run["recipe"]["sha256"] and gate["complete"] is False
    assert gate["source_unchanged"] is True and run["source_unchanged"] is True
    assert gate["source_before"] == gate["source_after"]
    sources = gate["source_before"]
    for name, digest in sources.items():
        helper["safe_name"](name)
        assert re.fullmatch(r"[a-f0-9]{64}", digest)
    assert type(run["source_count"]) is int and 0 < len(sources) == run["source_count"]
    assert sha(json.dumps(sources, sort_keys=True).encode()) == run["source_digest"]
    runner = "docs/assets/ligand-designation/qualification.py.txt"
    assert gate["runner_sha256"] == sources[runner]
    assert gate["preceding_source_unchanged"] is True
    assert run["preceding_source_unchanged"] is True
    assert (
        gate["preceding_source_expected"]
        == gate["preceding_source_before"]
        == gate["preceding_source_after"]
    )
    assert (
        type(run["preceding_source_count"]) is int
        and 0 < len(gate["preceding_source_before"]) == run["preceding_source_count"]
    )
    for name, digest in gate["preceding_source_before"].items():
        helper["safe_name"](name)
        assert re.fullmatch(r"[a-f0-9]{64}", digest)
    assert gate["preceding_reader"] == recipe["preceding_reader"]
    assert gate["preceding_reader"]["tag"] == "v0.35.0"
    assert gate["preceding_reader"]["version"] == "0.35.0"
    assert re.fullmatch(r"[a-f0-9]{40}", gate["preceding_reader"]["commit"])
    steps = gate["steps"]
    assert steps and steps[-1]["label"] == run["failed_step"]
    assert type(steps[-1]["exit_code"]) is int and steps[-1]["exit_code"] != 0
    assert all(type(step["exit_code"]) is int and step["exit_code"] == 0 for step in steps[:-1])
    assert [s["label"] for s in steps] == [s["label"] for s in recipe["steps"][: len(steps)]]
    logs = run["lossless_logs"]
    assert len(logs) == len(steps) and len({row["path"] for row in logs}) == len(logs)
    for row, step in zip(logs, steps, strict=True):
        assert row["label"] == step["label"] and row["path"] == step["log"]
        digest = sha(gzip.decompress(owned_file(root, row["path"], helper).read_bytes()))
        assert digest == row["uncompressed_sha256"] == step["log_sha256"]
    return {
        "recipe_sha256": sha(recipe_bytes),
        "gate_sha256": sha(gate_path.read_bytes()),
        "source_count": len(sources),
        "source_digest": run["source_digest"],
        "lossless_logs_verified": len(logs),
    }


def validate_index(index: dict[str, Any]) -> set[str]:
    assert type(index["format_version"]) is int and index["format_version"] == 1
    assert index["repository"] == "ManuelSe/Neistra"
    assert index["issue"] == 158 and index["parent"] == 11 and index["release_version"] == "0.36.0"
    assert index["part_max_bytes_exclusive"] == 80 * 1024 * 1024
    names: set[str] = set()
    runs: set[str] = set()
    total = 0
    for run in index["runs"]:
        assert run["label"] not in runs
        runs.add(run["label"])
        assert (
            re.fullmatch(r"c4-candidate[0-9]+", run["label"])
            and run["extraction_root"] == "forensics/" + run["label"]
        )
        assert run["qualification_complete"] is False and re.fullmatch(
            r"[a-f0-9]{40}", run["failed_candidate"]
        )
        assert run["parts"]
        for ordinal, part in enumerate(run["parts"], 1):
            name = part["asset_name"]
            assert re.fullmatch(r"[a-z0-9][a-z0-9._-]*\.zip", name) and name not in names
            assert (
                type(part["ordinal"]) is int
                and part["ordinal"] == ordinal
                and type(part["bytes"]) is int
                and 0 < part["bytes"] < index["part_max_bytes_exclusive"]
            )
            assert re.fullmatch(r"[a-f0-9]{64}", part["sha256"])
            names.add(name)
            total += part["bytes"]
    assert 0 < len(names) == index["asset_count"] < 1000 and total == index["total_asset_bytes"]
    return names


def verify(args: argparse.Namespace) -> None:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    assert not args.output.exists()
    root = args.root.resolve()
    helper_path = root / "docs/assets/ligand-designation/release-evidence.py.txt"
    assert helper_path.is_file() and not helper_path.is_symlink()
    assert helper_path.resolve().is_relative_to(root)
    helper = runpy.run_path(str(helper_path))
    index_path = owned_file(root, args.index, helper)
    index_bytes = index_path.read_bytes()
    index = json.loads(index_bytes)
    names = validate_index(index)
    plan: dict[str, dict[str, Any]] = {}
    remote: dict[str, dict[str, Any]] = {}
    downloads: Path | None = None
    if args.mode == "local":
        assert args.plan.is_file() and not args.plan.is_symlink()
        private_root = root / ".issue-11-evidence"
        assert not private_root.is_symlink() and private_root.resolve().is_relative_to(root)
        assert args.plan.resolve().is_relative_to(private_root.resolve())
        private = json.loads(args.plan.read_text())
        assert private["index_sha256"] == sha(index_bytes)
        assert private["index"] == args.index
        assert len(private["assets"]) == len(names)
        plan = {r["asset_name"]: r for r in private["assets"]}
        assert set(plan) == names
    else:
        release = json.loads(args.remote_assets.read_text())
        assert (
            release["tag_name"] == "v0.36.0" and not release["draft"] and not release["prerelease"]
        )
        remote = {a["name"]: a for a in release["assets"]}
        assert len(remote) == len(release["assets"]) and names <= set(remote)
        downloads = args.downloads.resolve()
        assert not downloads.exists()
        downloads.mkdir(parents=True)
    receipt: dict[str, Any] = {
        "scope": (
            "Indexed failed-run forensic asset verification only; no full-gate qualification claim"
        ),
        "mode": args.mode,
        "index_sha256": sha(index_bytes),
        "verifier_sha256": sha(Path(__file__).read_bytes()),
        "qualified_helper_sha256": sha(helper_path.read_bytes()),
        "assets": [],
        "runs": [],
    }
    for run in index["runs"]:
        provenance = verify_provenance(root, run, helper)
        inventory_path = owned_file(root, run["inventory"]["path"], helper)
        compressed = inventory_path.read_bytes()
        assert (
            len(compressed) == run["inventory"]["bytes"]
            and sha(compressed) == run["inventory"]["sha256"]
        )
        body = gzip.decompress(compressed)
        assert sha(body) == run["inventory"]["uncompressed_sha256"]
        inventory = json.loads(body)
        assert inventory["format_version"] == 1 and inventory["run"] == run["label"]
        canonical = inventory["files"]
        for name, identity in canonical.items():
            helper["safe_name"](name)
            assert type(identity["bytes"]) is int and identity["bytes"] >= 0
            assert re.fullmatch(r"[a-f0-9]{64}", identity["sha256"])
        union: dict[str, Any] = {}
        for part in run["parts"]:
            name = part["asset_name"]
            started = time.monotonic()
            entry = {"run": run["label"], "asset_name": name}
            if args.mode == "local":
                p = plan[name]
                assert (
                    p["run"] == run["label"]
                    and p["bytes"] == part["bytes"]
                    and p["sha256"] == part["sha256"]
                )
                path = Path(p["local_path"])
                assert (
                    path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root)
                )
                repository_path = part.get("repository_path")
                if repository_path is None:
                    assert path.resolve().is_relative_to((root / ".issue-11-evidence").resolve())
                else:
                    assert path.resolve() == owned_file(root, repository_path, helper).resolve()
            else:
                asset = remote[name]
                assert (
                    asset["size"] == part["bytes"]
                    and asset["digest"] == "sha256:" + part["sha256"]
                    and asset["state"] == "uploaded"
                )
                url = asset["browser_download_url"]
                parsed = urllib.parse.urlsplit(url)
                assert (
                    parsed.scheme == "https"
                    and parsed.netloc == "github.com"
                    and parsed.path == "/ManuelSe/Neistra/releases/download/v0.36.0/" + name
                    and not parsed.query
                    and not parsed.fragment
                )
                request = urllib.request.Request(
                    url, headers={"User-Agent": "Neistra-release-verification"}
                )
                assert not request.has_header("Authorization")
                assert downloads is not None
                path = downloads / name
                temporary = path.with_name(name + ".part")
                digest = hashlib.sha256()
                size = 0
                with (
                    urllib.request.urlopen(request, timeout=60) as response,
                    temporary.open("xb") as output,
                ):
                    assert response.status == 200
                    while block := response.read(1024 * 1024):
                        size += len(block)
                        assert size <= part["bytes"]
                        digest.update(block)
                        output.write(block)
                assert size == part["bytes"] and digest.hexdigest() == part["sha256"]
                temporary.rename(path)
                entry.update(
                    asset_id=asset["id"],
                    public_url=url,
                    http_status=200,
                    anonymous_request=True,
                    request_auth_header_present=False,
                    server_digest=asset["digest"],
                )
            assert helper["fingerprint"](path) == {k: part[k] for k in ["bytes", "sha256"]}
            counts = helper["verify_layers"](path, name)
            assert counts == part["recursive_verification"]
            with zipfile.ZipFile(path) as archive:
                rows = json.loads(archive.read("manifest.json"))
                rows = rows.get("files", rows)
                assert len(rows) == part["manifest_entries"] and not union.keys() & rows.keys()
                union.update(rows)
            entry.update(
                bytes=part["bytes"],
                sha256=part["sha256"],
                recursive_verification=counts,
                seconds=time.monotonic() - started,
            )
            receipt["assets"].append(entry)
            print("VERIFIED", args.mode, name, flush=True)
        assert (
            union == canonical
            and len(union) == run["files"]
            and sum(v["bytes"] for v in union.values()) == run["raw_bytes"]
        )
        receipt["runs"].append(
            {
                "label": run["label"],
                "exact_manifest_union": True,
                "files": len(union),
                "raw_bytes": run["raw_bytes"],
                "inventory_uncompressed_sha256": run["inventory"]["uncompressed_sha256"],
                "provenance": provenance,
                "extraction_root": run["extraction_root"],
            }
        )
    receipt.update(
        complete=True,
        all_indexed_assets_verified=len(receipt["assets"]) == index["asset_count"],
        asset_count=len(receipt["assets"]),
        failed_runs_remain_unqualified=True,
    )
    assert not args.output.exists()
    temporary = args.output.with_name(args.output.name + ".part")
    with temporary.open("x") as output:
        output.write(json.dumps(receipt, indent=2) + "\n")
    temporary.rename(args.output)
    print("ALL_COMPLETE", args.mode, len(receipt["assets"]), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--index", default="docs/assets/ligand-designation/c3-forensics-index.json")
    parser.add_argument("--mode", choices=["local", "anonymous"], required=True)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--remote-assets", type=Path)
    parser.add_argument("--downloads", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.mode == "local" and args.plan is None:
        parser.error("--plan is required for local verification")
    if args.mode == "anonymous" and (args.remote_assets is None or args.downloads is None):
        parser.error("--remote-assets and --downloads are required for anonymous verification")
    verify(args)
