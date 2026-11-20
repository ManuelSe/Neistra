"""Requalify unchanged benchmark originals with explicit current source provenance.

Generation records remain immutable. The only admitted source evolution is the
reviewed atomic observer publisher; all scientific and library identities must
still match the original manifest. This is not native performance evidence.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from tests.support import ligand_property_performance_fixtures as frozen

GENERATION_MANIFEST_SHA256 = "7826731f86f04fe9b22a56fa35a5755885da041979cfc9938c315b1777a01421"
OBSERVER = "tests/support/ligand_property_performance_qualification.py"
GENERATION_OBSERVER_SHA256 = "dac492eb8a681f31acca9067bdd7b5711fe0d982002a9b2b52ebbd35c69fcb4a"
QUALIFICATION_OBSERVER_SHA256 = "f5d416101faa4a9bd91307f765d8ccb54db770e9223eeee7e7aa3eaf4b80f4fb"
HERE = Path(__file__).resolve()


def qualification_provenance(
    directory: Path,
    *,
    current_sources: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate every original before any adapter, editor or history operation."""
    manifest_path = directory / "manifest.json"
    assert not manifest_path.is_symlink()
    body = manifest_path.read_bytes()
    assert frozen.sha(body) == GENERATION_MANIFEST_SHA256, "Frozen generation manifest changed"
    manifest = json.loads(body)
    assert manifest["settings"] == frozen.SETTINGS
    generation = manifest["source_identities"]
    assert generation["repository_sources"][OBSERVER] == GENERATION_OBSERVER_SHA256
    expected_current = copy.deepcopy(generation)
    expected_current["repository_sources"][OBSERVER] = QUALIFICATION_OBSERVER_SHA256
    current = frozen.source_identities() if current_sources is None else current_sources
    assert current == expected_current, "Unapproved scientific, observer or library source drift"
    records = manifest["fixtures"]
    assert len(records) == 44 and len({row["id"] for row in records}) == 44
    assert {row["id"] for row in records} == {row.id for row in frozen.specifications()}
    artifacts = {}
    for row in records:
        path = directory / row["filename"]
        assert path.parent == directory and path.is_file() and not path.is_symlink()
        payload = path.read_bytes()
        assert len(payload) == row["bytes"] and frozen.sha(payload) == row["sha256"], (
            "Frozen fixture bytes changed",
            row["id"],
        )
        artifacts[row["id"]] = {"bytes": len(payload), "sha256": frozen.sha(payload)}
    return {
        "schema": "profile-fixture-qualification-source-v1",
        "scope": "Current source-bound offline requalification, separate from original generation",
        "generation_manifest_sha256": GENERATION_MANIFEST_SHA256,
        "generation_source_identities": generation,
        "current_qualification_source_identities": current,
        "reviewed_observer_evolution": {
            "path": OBSERVER,
            "generation_sha256": GENERATION_OBSERVER_SHA256,
            "current_sha256": QUALIFICATION_OBSERVER_SHA256,
            "scope": "Atomic observer publication; scientific fixture functions remain unchanged",
            "decision": "D-194 #160 generation/current qualification clarification",
        },
        "qualification_driver": {"path": str(HERE), "sha256": frozen.sha(HERE.read_bytes())},
        "fixtures": artifacts,
        "fixture_count": 44,
        "original_generation_manifest_and_artifacts_unchanged": True,
        "native_performance_qualification": False,
    }


def qualify(directory: Path, output: Path, selected: set[str] | None = None) -> dict[str, Any]:
    assert not output.exists(), "Preserve prior qualification attempts"
    provenance = qualification_provenance(directory)
    assert selected is None or (selected and selected <= set(provenance["fixtures"]))
    from tests.support.ligand_property_performance_qualification import fixture_trial

    output.mkdir(parents=True)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    cases = []
    for row in manifest["fixtures"]:
        if selected is not None and row["id"] not in selected:
            continue
        print("START", row["id"], flush=True)
        record, payload = frozen.load_fixture(row["id"], directory)
        before = frozen.verify_original(payload, record["intended_smiles"], record["filename"])
        trial = fixture_trial(
            before, payload, record["filename"], intended_smiles=record["intended_smiles"]
        )
        history = frozen.history_control(payload, record["filename"], output / row["id"])
        cases.append(
            {"id": row["id"], "sha256": frozen.sha(payload), "trial": trial, "history": history}
        )
        (output / "results.json").write_text(
            json.dumps(
                {
                    "scope": "Current offline adapter/editor/kernel/H/history controls only",
                    "complete": False,
                    "provenance": provenance,
                    "cases": cases,
                },
                indent=2,
                allow_nan=False,
            )
            + "\n"
        )
        print("PASS", row["id"], flush=True)
    assert len(cases) == (len(selected) if selected is not None else 44)
    assert qualification_provenance(directory) == provenance, "Qualification inputs drifted"
    result = {
        "scope": "Current offline original reparse/editor/kernel/H/history; no native timing claim",
        "complete": True,
        "count": len(cases),
        "provenance": provenance,
        "cases": cases,
    }
    (output / "results.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fixtures", type=Path, default=frozen.FIXTURES)
    parser.add_argument("--ids", nargs="+")
    args = parser.parse_args()
    qualify(args.fixtures, args.output, set(args.ids) if args.ids else None)


if __name__ == "__main__":
    main()
