"""Synthetic guard controls only; these fixtures are not release qualification."""

import copy
import gzip
import hashlib
import json
import os
import runpy
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "docs/assets/ligand-information"
NAMES = (
    "qualification",
    "release-recipe",
    "versions",
    "production-audit",
    "qualification-summary",
    "release-evidence",
)


def module(name: str) -> dict[str, Any]:
    return runpy.run_path(str(DIRECTORY / (name + ".py.txt")))


def sha(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def put(path: Path, value: Any) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(value, sort_keys=True).encode()
    path.write_bytes(body)
    return body


def file_identity(path: Path) -> dict[str, Any]:
    body = path.read_bytes()
    return {"bytes": len(body), "sha256": sha(body)}


@pytest.fixture
def data(tmp_path: Path) -> dict[str, Any]:
    """Two tiny synthetic inventories, using no actual publication claims."""
    q = module("qualification")
    browser = {
        "errors": [],
        "stats": {"expected": 1, "skipped": 1, "unexpected": 0, "flaky": 0},
        "suites": [
            {
                "title": "",
                "specs": [
                    {
                        "file": "synthetic.spec.ts",
                        "title": title,
                        "tests": [
                            {
                                "projectName": "synthetic",
                                "expectedStatus": status,
                                "results": [{"status": status, "retry": 0}],
                            }
                        ],
                    }
                    for title, status in (("observed", "passed"), ("authored exclusion", "skipped"))
                ],
            }
        ],
    }
    summary = {
        "commit": "a" * 40,
        "application_version": "0.38.0",
        "source_count": 7,
        "complete_steps": 43,
        "python_skips": 0,
        "new_exclusions": 0,
        "failures_flakes_retries": 0,
        "browser_inventory_count": 2,
        "browser_passed": 1,
        "browser_exclusions": 1,
        **dict.fromkeys(
            (
                "complete_browser_inventory_executed",
                "existing_exclusion_identities_unchanged",
                "clean_start",
                "sources_unchanged",
                "source_inventory_unchanged",
                "all_lossless_log_hashes_valid",
            ),
            True,
        ),
    }
    preceding = {"tag": "v0.38.0", "version": "0.38.0", "commit": "a" * 40}
    new = tmp_path / q["BASELINE_DIRECTORY"]
    put(new / q["BASELINE_ALIASES"][0], summary)
    (new / q["BASELINE_ALIASES"][1]).write_bytes(
        gzip.compress(json.dumps(browser).encode(), mtime=0)
    )
    excluded = sorted(
        x["identity"] for x in q["browser_report_records"](browser) if x["status"] == "skipped"
    )
    provenance: dict[str, Any] = {
        "schema": "published-predecessor-browser-baseline-v1",
        "predecessor": {**preceding, "source_count": 7},
        "browser_inventory_count": 2,
        "browser_passed": 1,
        "browser_exclusions": 1,
        "excluded_identities_sha256": sha(json.dumps(excluded).encode()),
        "public_asset": {
            "url": "https://github.com/ManuelSe/Neistra/releases/download/v0.38.0/synthetic.zip",
            "bytes": 12345,
            "sha256": "b" * 64,
        },
        "outer_manifest": {
            "sha256": "c" * 64,
            "member": {
                "path": "complete-gates/synthetic/gate.zip",
                "bytes": 123,
                "sha256": "d" * 64,
            },
        },
        "retained_members": dict(
            zip(
                q["BASELINE_ALIASES"],
                (
                    "gate/synthetic-summary.json",
                    "gate/synthetic-browser.json.gz",
                ),
                strict=True,
            )
        ),
        "nested_archive": {"all_crc_verified": True, "manifest_sha256": "e" * 64, "members": {}},
        "publication_verification": {
            "annotated_tag_object": "f" * 40,
            "reachable_on_remote_master": True,
            "published": True,
            "draft": False,
            "prerelease": False,
            "download": {
                "anonymous_request_without_authorization_header": True,
                "http_status": 200,
                "qualified_master": "a" * 40,
                "bytes": 12345,
                "sha256": "b" * 64,
                "public_url": "https://github.com/ManuelSe/Neistra/releases/download/v0.38.0/synthetic.zip",
                "all_zip_crcs_and_internal_manifest_hashes_valid": True,
            },
        },
    }
    for alias, member in provenance["retained_members"].items():
        provenance["nested_archive"]["members"][member] = file_identity(new / alias)
    pin = sha(put(new / "provenance.json", provenance))
    old = tmp_path / q["LEGACY_DIRECTORY"]
    put(old / "c5-master1-summary.json", {"synthetic": "older summary"})
    (old / "c5-master1-browser.json.gz").write_bytes(
        gzip.compress(b"synthetic old report", mtime=0)
    )
    legacy = {
        "predecessor": {"tag": "v0.37.0", "version": "0.37.0"},
        "nested_archive": {
            "members": {
                "gate/" + name: file_identity(old / name)
                for name in ("c5-master1-summary.json", "c5-master1-browser.json.gz")
            }
        },
    }
    legacy_pin = sha(put(old / "provenance.json", legacy))
    return {
        "root": tmp_path,
        "q": q,
        "browser": browser,
        "summary": summary,
        "preceding": preceding,
        "provenance": provenance,
        "pin": pin,
        "legacy_pin": legacy_pin,
    }


def repin(data: dict[str, Any]) -> None:
    path = data["root"] / data["q"]["BASELINE_DIRECTORY"] / "provenance.json"
    data["pin"] = sha(put(path, data["provenance"]))


def baseline(data: dict[str, Any]) -> dict[str, Any]:
    return dict(
        data["q"]["preceding_browser_baseline"](
            data["root"],
            data["preceding"],
            provenance_pin=data["pin"],
        )
    )


def inventory(data: dict[str, Any]) -> dict[str, Any]:
    return dict(
        data["q"]["qualification_data_inventory"](
            data["root"],
            provenance_pin=data["pin"],
            legacy_provenance_pin=data["legacy_pin"],
        )
    )


def test_new_authority_three_files_and_total_frozen_six_are_distinct(data: dict[str, Any]) -> None:
    proof = baseline(data)
    frozen = inventory(data)
    assert set(proof["data_files"]) == data["q"]["BASELINE_DATA"]
    assert len(proof["data_files"]) == 3 and len(frozen) == 6
    assert set(frozen) == data["q"]["DATA"]
    assert proof["browser_inventory_count"] == 2  # Synthetic, never a real release count.


@pytest.mark.parametrize("pin", [None, "", "a" * 40, "z" * 64])
def test_real_pin_is_required_before_any_data_access(pin: str | None) -> None:
    q = module("qualification")
    with pytest.raises(AssertionError, match="has not been pinned"):
        q["require_pin"](pin)


@pytest.mark.parametrize(
    "control",
    [
        "wrong_pin",
        "missing_summary",
        "changed_summary",
        "summary_symlink",
        "hardlinked_data",
        "old_data_changed",
        "old_provenance_changed",
        "wrong_old_pin",
        "member_alias",
        "member_hash",
        "member_path",
        "wrong_version",
        "wrong_commit",
        "wrong_tag",
        "unauthenticated_false",
        "http",
        "download_hash",
        "unpublished",
        "draft",
        "prerelease",
        "crc",
        "remote_ancestry",
        "tag_object",
        "unsafe_url",
    ],
)
def test_publication_and_frozen_data_refuse_corruption(data: dict[str, Any], control: str) -> None:
    q, root, p = data["q"], data["root"], data["provenance"]
    new = root / q["BASELINE_DIRECTORY"]
    summary = new / q["BASELINE_ALIASES"][0]
    if control == "wrong_pin":
        data["pin"] = "0" * 64
    elif control == "missing_summary":
        summary.unlink()
    elif control == "changed_summary":
        summary.write_bytes(summary.read_bytes() + b" ")
    elif control == "summary_symlink":
        body = summary.read_bytes()
        summary.unlink()
        (root / "alias.json").write_bytes(body)
        summary.symlink_to(root / "alias.json")
    elif control == "hardlinked_data":
        summary.unlink()
        os.link(root / q["LEGACY_DIRECTORY"] / "c5-master1-summary.json", summary)
    elif control == "old_data_changed":
        (root / q["LEGACY_DIRECTORY"] / "c5-master1-summary.json").write_bytes(b"changed")
    elif control == "old_provenance_changed":
        (root / q["LEGACY_DIRECTORY"] / "provenance.json").write_bytes(b"{}")
    elif control == "wrong_old_pin":
        data["legacy_pin"] = "0" * 64
    else:
        if control == "member_alias":
            p["retained_members"][q["BASELINE_ALIASES"][1]] = p["retained_members"][
                q["BASELINE_ALIASES"][0]
            ]
        elif control == "member_hash":
            next(iter(p["nested_archive"]["members"].values()))["sha256"] = "0" * 64
        elif control == "member_path":
            p["retained_members"][q["BASELINE_ALIASES"][0]] = "../escape"
        elif control == "wrong_version":
            p["predecessor"]["version"] = "0.37.0"
        elif control == "wrong_commit":
            p["predecessor"]["commit"] = "1" * 40
        elif control == "wrong_tag":
            p["predecessor"]["tag"] = "v0.37.0"
        elif control == "unauthenticated_false":
            p["publication_verification"]["download"][
                "anonymous_request_without_authorization_header"
            ] = False
        elif control == "http":
            p["publication_verification"]["download"]["http_status"] = 206
        elif control == "download_hash":
            p["publication_verification"]["download"]["sha256"] = "0" * 64
        elif control == "unpublished":
            p["publication_verification"]["published"] = False
        elif control == "draft":
            p["publication_verification"]["draft"] = True
        elif control == "prerelease":
            p["publication_verification"]["prerelease"] = True
        elif control == "crc":
            p["nested_archive"]["all_crc_verified"] = False
        elif control == "remote_ancestry":
            p["publication_verification"]["reachable_on_remote_master"] = False
        elif control == "tag_object":
            p["publication_verification"]["annotated_tag_object"] = ""
        elif control == "unsafe_url":
            p["public_asset"]["url"] = "https://example.invalid/asset.zip"
        repin(data)
    with pytest.raises((AssertionError, KeyError, FileNotFoundError)):
        inventory(data)
        baseline(data)


@pytest.mark.parametrize(
    "control",
    [
        "incomplete",
        "retry",
        "unexpected",
        "duplicate",
        "different_exclusion",
        "count",
        "source_count",
        "errors",
        "partial_steps",
        "python_skip",
        "dirty",
        "log_hashes",
    ],
)
def test_predecessor_case_guards_are_independent(data: dict[str, Any], control: str) -> None:
    browser, summary = data["browser"], data["summary"]
    tests = browser["suites"][0]["specs"]
    if control == "incomplete":
        tests[0]["tests"][0]["results"] = []
    elif control == "retry":
        tests[0]["tests"][0]["results"].append({"status": "passed"})
    elif control == "unexpected":
        tests[0]["tests"][0]["results"][0]["status"] = "failed"
    elif control == "duplicate":
        tests.append(copy.deepcopy(tests[0]))
    elif control == "different_exclusion":
        tests[1]["title"] = "same count different identity"
    elif control == "count":
        summary["browser_inventory_count"] = 3
    elif control == "source_count":
        summary["source_count"] = 8
    elif control == "errors":
        browser["errors"] = [{"message": "global failure"}]
    elif control == "partial_steps":
        summary["complete_steps"] = 42
    elif control == "python_skip":
        summary["python_skips"] = 1
    elif control == "dirty":
        summary["clean_start"] = False
    elif control == "log_hashes":
        summary["all_lossless_log_hashes_valid"] = False
    expected = {
        **data["provenance"]["predecessor"],
        **{
            k: data["provenance"][k]
            for k in (
                "browser_inventory_count",
                "browser_passed",
                "browser_exclusions",
                "excluded_identities_sha256",
            )
        },
    }
    with pytest.raises(AssertionError):
        data["q"]["validate_preceding_browser_report"](browser, summary, expected)


@pytest.fixture
def recipe() -> dict[str, Any]:
    preceding = {
        "tag": "v0.38.0",
        "version": "0.38.0",
        "commit": "a" * 40,
        "root": "/synthetic/previous",
        "receipt": "/synthetic/receipt.json",
        "schema_head": "0017",
    }
    return dict(
        module("release-recipe")["build_recipe"](ROOT, "synthetic-guard", "0.39.0", preceding)
    )


def test_canonical_recipe_keeps_all_43_responsibilities(recipe: dict[str, Any]) -> None:
    q = module("qualification")
    q["validate_recipe_contract"](recipe, ROOT)
    assert tuple(s["label"] for s in recipe["steps"]) == q["REQUIRED_STEPS"]
    assert recipe["environment"]["NEISTRA_PROFILE_REQUIRE_COLD"] == "1"
    assert recipe["environment"]["NEISTRA_PERFORMANCE"] == "0"


@pytest.mark.parametrize(
    "control",
    [
        "missing",
        "duplicate",
        "reordered",
        "actor",
        "protocol",
        "current_version",
        "previous_version",
        "schema",
        "command",
        "cold_missing",
        "cold_weakened",
        "frozen_install",
    ],
)
def test_canonical_recipe_rejects_weakened_authority(recipe: dict[str, Any], control: str) -> None:
    if control == "missing":
        recipe["steps"].pop()
    elif control == "duplicate":
        recipe["steps"][-1] = copy.deepcopy(recipe["steps"][-2])
    elif control == "reordered":
        recipe["steps"][0], recipe["steps"][1] = recipe["steps"][1], recipe["steps"][0]
    elif control == "actor":
        next(s for s in recipe["steps"] if s["label"] == "property-readers")["command"][2] = (
            "/synthetic/wrong.py"
        )
    elif control == "protocol":
        recipe["compatibility_protocol"] = "retention-v1"
    elif control == "current_version":
        recipe["application_version"] = "0.38.0"
    elif control == "previous_version":
        recipe["preceding_reader"]["version"] = "0.37.0"
    elif control == "schema":
        recipe["preceding_reader"]["schema_head"] = "0016"
    elif control == "command":
        next(s for s in recipe["steps"] if s["label"] == "python")["command"] = ["echo", "passed"]
    elif control == "cold_missing":
        recipe["environment"].pop("NEISTRA_PROFILE_REQUIRE_COLD")
    elif control == "cold_weakened":
        recipe["environment"]["NEISTRA_PROFILE_REQUIRE_COLD"] = "0"
    elif control == "frozen_install":
        recipe["steps"][0]["command"].remove("--frozen")
    with pytest.raises(AssertionError):
        module("qualification")["validate_recipe_contract"](recipe, ROOT)


def ordered_inventory() -> dict[str, Any]:
    return {
        "errors": [],
        "config": {
            "workers": 1,
            "fullyParallel": False,
            "projects": [{"name": "desktop"}, {"name": "mobile"}],
        },
        "suites": [
            {
                "specs": [
                    {
                        "file": name,
                        "tests": [
                            {"projectName": owner, "expectedStatus": "passed"}
                            for owner in ("desktop", "mobile")
                        ],
                    }
                    for name in (
                        "ligand-profiles-performance.spec.ts",
                        "ligand-properties-performance.spec.ts",
                        "ligand-sidebar-performance.spec.ts",
                    )
                ]
            }
        ],
    }


@pytest.mark.parametrize(
    "control", ["valid", "workers", "parallel", "project_parallel", "order", "missing", "skipped"]
)
def test_serial_cold_before_complement_order(control: str) -> None:
    report = ordered_inventory()
    if control == "workers":
        report["config"]["workers"] = 2
    elif control == "parallel":
        report["config"]["fullyParallel"] = True
    elif control == "project_parallel":
        report["config"]["projects"][0]["fullyParallel"] = True
    elif control == "order":
        report["suites"][0]["specs"].reverse()
    elif control == "missing":
        report["suites"][0]["specs"].pop(0)
    elif control == "skipped":
        report["suites"][0]["specs"][-1]["tests"][0]["expectedStatus"] = "skipped"
    if control == "valid":
        assert len(module("qualification")["validate_benchmark_order"](report)["projects"]) == 2
    else:
        with pytest.raises(AssertionError):
            module("qualification")["validate_benchmark_order"](report)


@pytest.mark.parametrize("control", ["valid", "existing", "symlink", "wrong_path"])
def test_fresh_store_refusal(tmp_path: Path, control: str) -> None:
    path = tmp_path / "e2e"
    if control == "existing":
        path.mkdir()
    elif control == "symlink":
        path.symlink_to(tmp_path / "missing")
    elif control == "wrong_path":
        path = tmp_path / "outside"
    if control == "valid":
        module("qualification")["validate_fresh_browser_store"](path, tmp_path)
    else:
        with pytest.raises(AssertionError):
            module("qualification")["validate_fresh_browser_store"](path, tmp_path)


def test_version_qualified_package_keeps_both_generations(data: dict[str, Any]) -> None:
    helper = module("release-evidence")
    items: dict[str, Any] = {}
    files = inventory(data)
    helper["add_qualification_data"](items, data["root"], files, data["q"]["DATA"])
    assert len(items) == 6
    assert "qualification-data/v0.37.0/provenance.json" in items
    assert "qualification-data/v0.38.0/provenance.json" in items
    archive = data["root"] / "synthetic-package.zip"
    result = helper["archive"](items, archive)
    assert result["outer_manifest_entries"] == 6
    with zipfile.ZipFile(archive) as z:
        assert set(z.namelist()) == set(items) | {"manifest.json"}
        records = json.loads(z.read("manifest.json"))
        for name, path in items.items():
            assert z.read(name) == path.read_bytes()
            assert records[name] == file_identity(path)


@pytest.mark.parametrize("control", ["missing", "collision", "changed", "outside"])
def test_version_qualified_package_refusals(data: dict[str, Any], control: str) -> None:
    helper, items, files = module("release-evidence"), {}, inventory(data)
    if control == "missing":
        files.pop(next(iter(files)))
    elif control == "collision":
        items["qualification-data/v0.37.0/provenance.json"] = b"collision"
    elif control == "changed":
        next(iter(files.values()))["sha256"] = "0" * 64
    elif control == "outside":
        old = next(iter(files))
        files["outside/" + Path(old).name] = files.pop(old)
    with pytest.raises(AssertionError):
        helper["add_qualification_data"](items, data["root"], files, data["q"]["DATA"])


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(
        [
            "git",
            "-c",
            "user.name=Synthetic QA",
            "-c",
            "user.email=qa@example.invalid",
            *args,
        ],
        cwd=root,
        text=True,
        stderr=subprocess.PIPE,
    ).strip()


@pytest.fixture
def source_repo(tmp_path: Path) -> dict[str, Any]:
    """Private synthetic Git only, never the shared repository's refs or index."""
    q = module("qualification")
    repo = tmp_path / "synthetic-repo"
    repo.mkdir()
    git(repo, "init", "-q")
    legacy = Path("docs/assets/ligand-profiles/qualification.py.txt")
    (repo / legacy).parent.mkdir(parents=True)
    shutil.copy2(ROOT / legacy, repo / legacy)
    for name in q["LEGACY_DATA"]:
        put(repo / name, {"synthetic": name})
    put(repo / "apps/fixture.json", {"synthetic": True})
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "Synthetic source fixture")
    git(repo, "tag", "-a", "v0.38.0", "-m", "Synthetic annotated fixture")
    commit = git(repo, "rev-parse", "HEAD")
    wanted = q["tagged_identities"]("v0.38.0", repo)
    extracted = tmp_path / "synthetic-extracted"
    extracted.mkdir()
    for name in wanted:
        dest = extracted / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / name, dest)
    receipt = tmp_path / "synthetic-extraction.json"
    put(receipt, {"tag": "v0.38.0", "commit": commit, "files": wanted})
    preceding = {"tag": "v0.38.0", "version": "0.38.0", "commit": commit, "root": str(extracted)}
    baseline_proof = {
        "predecessor": {**preceding, "source_count": len(wanted)},
        "publication_verification": {"annotated_tag_object": git(repo, "rev-parse", "v0.38.0")},
    }
    return {
        "q": q,
        "root": repo,
        "receipt": receipt,
        "preceding": preceding,
        "baseline": baseline_proof,
        "wanted": wanted,
        "extracted": extracted,
    }


@pytest.mark.parametrize(
    "control",
    [
        "valid",
        "lightweight",
        "missing_tag",
        "wrong_tag",
        "wrong_tag_object",
        "wrong_commit",
        "receipt_omission",
        "source_count",
        "extraction_changed",
        "extraction_missing",
        "legacy_changed",
        "new_catalogue_extra",
    ],
)
def test_predecessor_tag_catalogue_and_extraction(
    source_repo: dict[str, Any], control: str
) -> None:
    f = source_repo
    root = f["root"]
    if control == "lightweight":
        git(root, "tag", "-d", "v0.38.0")
        git(root, "tag", "v0.38.0")
    elif control == "missing_tag":
        git(root, "tag", "-d", "v0.38.0")
    elif control == "wrong_tag":
        f["preceding"]["tag"] = "v0.37.0"
    elif control == "wrong_tag_object":
        f["baseline"]["publication_verification"]["annotated_tag_object"] = "0" * 40
    elif control == "wrong_commit":
        f["preceding"]["commit"] = "0" * 40
    elif control == "receipt_omission":
        record = json.loads(f["receipt"].read_bytes())
        record["files"].pop(next(iter(record["files"])))
        put(f["receipt"], record)
    elif control == "source_count":
        f["baseline"]["predecessor"]["source_count"] += 1
    elif control == "extraction_changed":
        (f["extracted"] / "apps/fixture.json").write_bytes(b"changed")
    elif control == "extraction_missing":
        (f["extracted"] / "apps/fixture.json").unlink()
    elif control == "legacy_changed":
        path = root / "docs/assets/ligand-profiles/qualification.py.txt"
        path.write_bytes(path.read_bytes() + b"\n")
    elif control == "new_catalogue_extra":
        put(root / "docs/assets/ligand-information/qualification.py.txt", {"synthetic extra": True})
        git(root, "add", ".")
        git(root, "commit", "-qm", "Synthetic catalogue mismatch")
        git(root, "tag", "-fa", "v0.38.0", "-m", "Synthetic catalogue mismatch")
        commit = git(root, "rev-parse", "HEAD")
        f["preceding"]["commit"] = commit
        f["baseline"]["predecessor"]["commit"] = commit
        f["baseline"]["publication_verification"]["annotated_tag_object"] = git(
            root, "rev-parse", "v0.38.0"
        )
    if control == "valid":
        assert (
            f["q"]["verify_predecessor_catalogue"](
                root, f["preceding"], f["receipt"], f["baseline"]
            )
            == f["wanted"]
        )
    else:
        with pytest.raises((AssertionError, subprocess.CalledProcessError, FileNotFoundError)):
            f["q"]["verify_predecessor_catalogue"](
                root, f["preceding"], f["receipt"], f["baseline"]
            )


def test_generator_refuses_missing_pin_without_creating_recipe(tmp_path: Path) -> None:
    # The actual generator reads a synthetic, deliberately pinless authority mapping.
    # No module globals or actual release data are changed, including after real pins exist.
    assets = tmp_path / "docs/assets/ligand-information"
    assets.mkdir(parents=True)
    authority = DIRECTORY / "qualification.py.txt"
    (assets / "qualification.py.txt").write_text(
        "import runpy\n"
        f"original = runpy.run_path({str(authority)!r})\n"
        'require_pin = original["require_pin"]\n'
        "BASELINE_PROVENANCE_SHA256 = None\n"
    )
    label = "synthetic-missing-pin-control"
    output = assets / (label + "-recipe.json")
    result = subprocess.run(
        [
            str(ROOT / ".venv/bin/python"),
            "-B",
            str(DIRECTORY / "release-recipe.py.txt"),
            label,
            "--compatibility-protocol",
            "private-derived-same-schema-v2",
            "--current-version",
            "0.39.0",
            "--previous-tag",
            "v0.38.0",
            "--previous-root",
            "/synthetic/missing-root",
            "--previous-receipt",
            "/synthetic/missing-receipt",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0 and "has not been pinned" in result.stderr
    assert not output.exists()


@pytest.mark.parametrize(
    "control", ["valid", "old_three", "new_three", "earlier_helpers", "new_helpers"]
)
def test_current_catalogue_cannot_drop_qualification_generations(control: str) -> None:
    q = module("qualification")
    names = q["DATA"] | q["TOOLS"]
    if control == "old_three":
        names -= q["LEGACY_DATA"]
    elif control == "new_three":
        names -= q["BASELINE_DATA"]
    elif control == "earlier_helpers":
        names = {name for name in names if not name.startswith("docs/assets/ligand-profiles/")}
    elif control == "new_helpers":
        names -= q["TOOLS"] & {name for name in names if name.startswith(q["TOOL_DIRECTORY"])}
    actual = dict.fromkeys(names, "a" * 64)
    if control == "valid":
        assert all(q["selected"](name) for name in names)
        q["validate_current_catalogue"](actual)
    else:
        with pytest.raises(AssertionError, match="omitted"):
            q["validate_current_catalogue"](actual)


@pytest.mark.parametrize("control", ["valid", "project", "lock", "web", "api", "archive"])
def test_all_five_current_versions_must_be_prepared(tmp_path: Path, control: str) -> None:
    wrong = "0.38.0"
    current = "0.39.0"
    files = {
        "project": ("pyproject.toml", '[project]\nversion = "{version}"\n'),
        "lock": ("uv.lock", '[[package]]\nname = "neistra-dev"\nversion = "{version}"\n'),
        "web": ("apps/web/package.json", '{{"version": "{version}"}}'),
        "api": ("apps/api/src/neistra_api/main.py", 'version="{version}"'),
        "archive": (
            "apps/api/src/neistra_api/archive_service.py",
            'APPLICATION_VERSION = "{version}"',
        ),
    }
    for name, (relative, content) in files.items():
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.format(version=wrong if control == name else current))
    q = module("qualification")
    if control == "valid":
        q["verify_current_versions"](tmp_path)
    else:
        with pytest.raises(AssertionError, match="five authoritative"):
            q["verify_current_versions"](tmp_path)


@pytest.mark.parametrize(
    "control",
    [
        "valid",
        "missing_current",
        "missing_inventory",
        "duplicate_current",
        "duplicate_inventory",
        "incomplete",
        "retry",
        "unexpected",
        "expected_status",
        "different_exclusion",
        "passed_count",
        "skipped_count",
        "current_errors",
        "inventory_errors",
    ],
)
def test_summary_recomputes_complete_current_inventory(data: dict[str, Any], control: str) -> None:
    browser = data["browser"]
    listing = copy.deepcopy(browser)
    baseline_ids = set(baseline(data)["excluded_identities"])
    cases = browser["suites"][0]["specs"]
    inventory_cases = listing["suites"][0]["specs"]
    if control == "missing_current":
        cases.pop()
    elif control == "missing_inventory":
        inventory_cases.pop()
    elif control == "duplicate_current":
        cases.append(copy.deepcopy(cases[0]))
    elif control == "duplicate_inventory":
        inventory_cases.append(copy.deepcopy(inventory_cases[0]))
    elif control == "incomplete":
        cases[0]["tests"][0]["results"] = []
    elif control == "retry":
        cases[0]["tests"][0]["results"].append({"status": "passed"})
    elif control == "unexpected":
        cases[0]["tests"][0]["results"][0]["status"] = "failed"
    elif control == "expected_status":
        cases[0]["tests"][0]["expectedStatus"] = "failed"
    elif control == "different_exclusion":
        cases[1]["title"] = inventory_cases[1]["title"] = "changed exclusion with same count"
    elif control == "passed_count":
        browser["stats"]["expected"] = 2
    elif control == "skipped_count":
        browser["stats"]["skipped"] = 0
    elif control == "current_errors":
        browser["errors"] = [{"message": "synthetic current error"}]
    elif control == "inventory_errors":
        listing["errors"] = [{"message": "synthetic inventory error"}]
    check = module("qualification-summary")["validate_browser_reports"]
    if control == "valid":
        records, listed, skips = check(browser, listing, baseline_ids)
        assert len(records) == len(listed) == 2 and skips == baseline_ids
    else:
        with pytest.raises(AssertionError):
            check(browser, listing, baseline_ids)
