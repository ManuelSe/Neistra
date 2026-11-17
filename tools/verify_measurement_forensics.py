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


def validate_index(index: dict[str, Any]) -> set[str]:
    assert type(index["format_version"]) is int and index["format_version"] == 1
    assert index["repository"] == "ManuelSe/Neistra"
    assert index["issue"] == 157 and index["parent"] == 11 and index["release_version"] == "0.35.0"
    assert index["part_max_bytes_exclusive"] == 80 * 1024 * 1024
    names: set[str] = set()
    runs: set[str] = set()
    total = 0
    for run in index["runs"]:
        assert run["label"] not in runs
        runs.add(run["label"])
        assert (
            re.fullmatch(r"c3-candidate[0-9]+", run["label"])
            and run["extraction_root"] == "forensics/" + run["label"]
        )
        assert run["qualification_complete"] is False and re.fullmatch(
            r"[a-f0-9]{40}", run["failed_candidate"]
        )
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
    index_path = (root / args.index).resolve()
    assert index_path.is_relative_to(root)
    index_bytes = index_path.read_bytes()
    index = json.loads(index_bytes)
    names = validate_index(index)
    helper_path = root / "docs/assets/viewer-measurements/release-evidence.py.txt"
    helper = runpy.run_path(str(helper_path))
    plan: dict[str, dict[str, Any]] = {}
    remote: dict[str, dict[str, Any]] = {}
    downloads: Path | None = None
    if args.mode == "local":
        private = json.loads(args.plan.read_text())
        assert private["index_sha256"] == sha(index_bytes)
        assert len(private["assets"]) == len(names)
        plan = {r["asset_name"]: r for r in private["assets"]}
        assert set(plan) == names
    else:
        release = json.loads(args.remote_assets.read_text())
        assert (
            release["tag_name"] == "v0.35.0" and not release["draft"] and not release["prerelease"]
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
        inventory_path = (root / helper["safe_name"](run["inventory"]["path"])).resolve()
        assert inventory_path.is_relative_to(root)
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
                    and parsed.path == "/ManuelSe/Neistra/releases/download/v0.35.0/" + name
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
    parser.add_argument(
        "--index", default="docs/assets/viewer-measurements/c3-forensics-index.json"
    )
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
