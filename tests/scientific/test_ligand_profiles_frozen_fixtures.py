"""All 44 real original adapter/editor/kernel/H/history controls under current code."""

from __future__ import annotations

import math
import os
from pathlib import Path

import pytest

from tests.support import ligand_profiles_fixture_qualification as current
from tests.support import ligand_property_performance_fixtures as frozen

# Independent workload contract: every original, including the O-O bulk specimen.
CASES = tuple(
    name
    for browser in ("chromium", "mobile-chromium")
    for name in (
        *(f"paired-{browser}-{size}" for size in range(10, 87, 4)),
        *(f"bulk-active-{browser}-{kind}" for kind in ("repeated", "distinct")),
    )
)
assert len(CASES) == 44 and "bulk-active-mobile-chromium-distinct" in CASES


@pytest.mark.parametrize("fixture_id", CASES)
def test_original_has_current_qualified_edit_and_authentic_history(
    fixture_id: str,
    tmp_path: Path,
) -> None:
    evidence = os.environ.get("NEISTRA_FIXTURE_QUALIFICATION_EVIDENCE")
    output = Path(evidence) / fixture_id if evidence else tmp_path / "qualification"
    result = current.qualify(frozen.FIXTURES, output, {fixture_id})
    assert result["complete"] and result["count"] == 1
    case = result["cases"][0]
    assert case["id"] == fixture_id
    history = case["history"]
    assert history["original_preserved"]
    assert history["canonical_bytes_ids_graph_coordinates_restored"]
    assert history["before_artifact_id"] == history["restored_artifact_id"]
    assert history["edited_artifact_id"] != history["before_artifact_id"]
    for report in (history["actual_before_report"], history["actual_edited_report"]):
        assert report["model_status"] == "qualified" and len(report["values"]) == 14
        assert all(
            value["status"] == "ready" and math.isfinite(value["value"])
            for value in report["values"]
        )
    if fixture_id == "bulk-active-mobile-chromium-distinct":
        record, _ = frozen.load_fixture(fixture_id)
        assert record["contains_oxygen_oxygen_bond"] is True
