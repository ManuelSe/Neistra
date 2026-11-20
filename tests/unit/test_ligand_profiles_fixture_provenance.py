"""Independent refusal controls for current qualification of frozen originals."""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from tests.support import ligand_profiles_fixture_qualification as current
from tests.support import ligand_property_performance_fixtures as frozen


def test_current_receipt_separates_generation_and_qualification_without_repinning() -> None:
    original = (frozen.FIXTURES / "manifest.json").read_bytes()
    provenance = current.qualification_provenance(frozen.FIXTURES)
    generation = provenance["generation_source_identities"]["repository_sources"]
    qualified = provenance["current_qualification_source_identities"]["repository_sources"]
    assert generation[current.OBSERVER] == (
        "dac492eb8a681f31acca9067bdd7b5711fe0d982002a9b2b52ebbd35c69fcb4a"
    )
    assert qualified[current.OBSERVER] == (
        "f5d416101faa4a9bd91307f765d8ccb54db770e9223eeee7e7aa3eaf4b80f4fb"
    )
    assert {name for name in generation if generation[name] != qualified[name]} == {
        current.OBSERVER
    }
    assert provenance["fixture_count"] == len(provenance["fixtures"]) == 44
    assert provenance["qualification_driver"]["sha256"] == frozen.sha(current.HERE.read_bytes())
    assert not provenance["native_performance_qualification"]
    assert (frozen.FIXTURES / "manifest.json").read_bytes() == original


@pytest.mark.parametrize("change", ["scientific-source", "observer", "library", "extra-source"])
def test_unapproved_current_sources_refuse_before_qualification(change: str) -> None:
    sources: dict[str, Any] = copy.deepcopy(frozen.source_identities())
    if change == "scientific-source":
        path = "packages/neistra_core/src/neistra_core/ligand_properties/calculate.py"
        sources["repository_sources"][path] = "0" * 64
    elif change == "observer":
        sources["repository_sources"][current.OBSERVER] = "0" * 64
    elif change == "library":
        sources["rdmolops_binary_sha256"] = "0" * 64
    else:
        sources["repository_sources"]["unapproved-extra.py"] = "0" * 64
    with pytest.raises(AssertionError, match="Unapproved scientific, observer or library"):
        current.qualification_provenance(frozen.FIXTURES, current_sources=sources)


def test_altered_original_refuses_before_any_output_or_scientific_work(tmp_path: Path) -> None:
    copied = tmp_path / "fixtures"
    shutil.copytree(frozen.FIXTURES, copied)
    path = copied / "paired-chromium-10.sdf"
    path.write_bytes(path.read_bytes() + b"changed original")
    output = tmp_path / "qualification"
    with pytest.raises(AssertionError, match="Frozen fixture bytes changed"):
        current.qualify(copied, output, {"paired-chromium-10"})
    assert not output.exists()


def test_altered_generation_manifest_refuses_even_if_its_fixture_hash_is_updated(
    tmp_path: Path,
) -> None:
    copied = tmp_path / "fixtures"
    shutil.copytree(frozen.FIXTURES, copied)
    path = copied / "paired-chromium-10.sdf"
    path.write_bytes(path.read_bytes() + b"changed original")
    manifest_path = copied / "manifest.json"
    manifest = json.loads(manifest_path.read_bytes())
    row = next(row for row in manifest["fixtures"] if row["id"] == "paired-chromium-10")
    row.update(bytes=path.stat().st_size, sha256=frozen.sha(path.read_bytes()))
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(AssertionError, match="Frozen generation manifest changed"):
        current.qualification_provenance(copied)


def test_legacy_qualifier_keeps_its_original_source_refusal(tmp_path: Path) -> None:
    with pytest.raises(AssertionError):
        frozen.qualify(frozen.FIXTURES, tmp_path / "legacy-qualification", {"paired-chromium-10"})
