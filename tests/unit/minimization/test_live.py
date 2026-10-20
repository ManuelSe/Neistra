from __future__ import annotations

import json

import numpy as np
import pytest
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.live import (
    SNAPSHOT_LIMIT,
    SNAPSHOT_NAME,
    SnapshotPublisher,
    read_snapshot,
)
from molweave_core.minimization.plugin import calculation_archive

from tests.support.minimization import LocalContext, capture, molecule


def test_latest_only_five_hz_snapshots_preserve_exact_selection_and_are_not_artifacts(tmp_path):
    parameters, _ = capture(molecule(), [3])
    context = LocalContext(tmp_path)
    now = [0.0]
    writer = SnapshotPublisher(parameters, context, clock=lambda: now[0])
    writer.publish(1, (("entry", 3),), np.asarray([[1.0, 2.0, 3.0]]))
    writer.publish(2, (("entry", 3),), np.asarray([[2.0, 2.0, 3.0]]))
    assert read_snapshot(tmp_path, parameters).sequence == 1
    now[0] = 0.2
    writer.publish(3, (("entry", 3),), np.asarray([[3.0, 2.0, 3.0]]))
    frame = read_snapshot(tmp_path, parameters)
    assert frame.sequence == 2 and frame.iteration == 3
    assert frame.entries[0].atom_ids == [3]
    assert frame.entries[0].coordinates == [(3.0, 2.0, 3.0)]
    assert sorted(p.name for p in tmp_path.iterdir()) == [SNAPSHOT_NAME]
    assert context.values == []  # Coordinate frames are not progress/events.
    import io
    import zipfile

    assert not zipfile.ZipFile(io.BytesIO(calculation_archive(tmp_path))).namelist()


@pytest.mark.parametrize("damage", ["capture", "owner", "mapping", "partial", "oversized"])
def test_invalid_or_interrupted_snapshots_never_return_geometry(tmp_path, damage):
    parameters, _ = capture(molecule(), [3])
    writer = SnapshotPublisher(parameters, LocalContext(tmp_path))
    writer.publish(1, (("entry", 3),), np.asarray([[1.0, 2.0, 3.0]]))
    path = tmp_path / SNAPSHOT_NAME
    data = json.loads(path.read_bytes())
    if damage == "capture":
        data["capture_sha256"] = "0" * 64
    elif damage == "owner":
        data["coordinator"]["start_ticks"] += 1
    elif damage == "mapping":
        data["entries"][0]["atom_ids"] = [1]
    path.write_text(json.dumps(data))
    if damage == "partial":
        path.write_text('{"sequence":')
    elif damage == "oversized":
        with path.open("wb") as stream:
            stream.truncate(SNAPSHOT_LIMIT + 1)
    with pytest.raises(ValueError):
        read_snapshot(tmp_path, parameters)


def test_invalid_publisher_rows_do_not_replace_a_valid_frame(tmp_path):
    parameters, _ = capture(molecule(), [3])
    writer = SnapshotPublisher(parameters, LocalContext(tmp_path), clock=lambda: 1.0)
    with pytest.raises(CalculationError, match="exact selection"):
        writer.publish(1, (("entry", 1),), np.asarray([[1.0, 2.0, 3.0]]))
    with pytest.raises(CalculationError, match="finite"):
        writer.publish(1, (("entry", 3),), np.asarray([[float("nan"), 2.0, 3.0]]))
    assert not (tmp_path / SNAPSHOT_NAME).exists()
