"""Deterministic observer-publication interleavings and visible failure behavior."""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path
from typing import Any

import pytest

from tests.support import ligand_property_performance_qualification as observation


def test_readers_see_old_then_new_complete_json_during_partial_temporary_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "observer.json"
    old = {"complete": False, "jobs": {"old": {"status": "running"}}}
    new = {"complete": True, "jobs": {"new": {"status": "succeeded"}}, "label": "\u03b1"}
    original_bytes = (json.dumps(old, indent=2, allow_nan=False) + "\n").encode()
    output.write_bytes(original_bytes)
    unrelated = tmp_path / ".observer.json.unrelated.tmp"
    unrelated.write_bytes(b"another publisher's temporary")
    original_factory = tempfile.NamedTemporaryFile
    original_replace = Path.replace
    streams: list[Any] = []
    partial_reads: list[dict[str, Any]] = []

    def interleaved_temporary(*args: Any, **kwargs: Any) -> Any:
        stream = original_factory(*args, **kwargs)
        streams.append(stream)
        original_write = stream.write

        def interleaved_write(data: str) -> int:
            halfway = len(data) // 2
            original_write(data[:halfway])
            stream.flush()
            temporary = Path(stream.name)
            assert temporary.parent == output.parent
            assert temporary not in (output, unrelated)
            with pytest.raises(json.JSONDecodeError):
                json.loads(temporary.read_text())
            partial_reads.append(json.loads(output.read_bytes()))
            assert output.read_bytes() == original_bytes
            original_write(data[halfway:])
            return len(data)

        monkeypatch.setattr(stream, "write", interleaved_write)
        return stream

    def replace_after_close(source: Path, destination: str | Path) -> Path:
        assert all(stream.closed for stream in streams)
        assert json.loads(source.read_bytes()) == new
        assert output.read_bytes() == original_bytes
        return original_replace(source, destination)

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", interleaved_temporary)
    monkeypatch.setattr(Path, "replace", replace_after_close)
    observation.publish_observation(output, new)

    assert partial_reads == [old]
    assert json.loads(output.read_bytes()) == new
    assert output.read_bytes() == (json.dumps(new, indent=2, allow_nan=False) + "\n").encode()
    assert unrelated.read_bytes() == b"another publisher's temporary"
    assert set(tmp_path.iterdir()) == {output, unrelated}


@pytest.mark.parametrize("complete", [False, True])
def test_first_publication_is_complete_and_preserves_json_bytes(
    tmp_path: Path, complete: bool
) -> None:
    output = tmp_path / "observer.json"
    state = {"complete": complete, "jobs": {}, "samples": 1, "source": "\u03b2"}

    observation.publish_observation(output, state)

    assert json.loads(output.read_bytes()) == state
    assert output.read_bytes() == (json.dumps(state, indent=2, allow_nan=False) + "\n").encode()
    assert list(tmp_path.iterdir()) == [output]


@pytest.mark.parametrize(
    "value,error_type",
    [({"invalid": float("nan")}, ValueError), ({"invalid": object()}, TypeError)],
)
def test_serialization_errors_propagate_without_creating_a_temporary_or_changing_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, value: Any, error_type: type[Exception]
) -> None:
    output = tmp_path / "observer.json"
    output.write_bytes(b'{"previous": true}\n')
    unrelated = tmp_path / ".observer.json.unrelated.tmp"
    unrelated.write_bytes(b"preserve")

    def forbid_temporary(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Serialize fully before creating a temporary")

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", forbid_temporary)
    with pytest.raises(error_type):
        observation.publish_observation(output, value)

    assert output.read_bytes() == b'{"previous": true}\n'
    assert unrelated.read_bytes() == b"preserve"
    assert set(tmp_path.iterdir()) == {output, unrelated}


@pytest.mark.parametrize("stage", ["create", "write", "replace"])
def test_io_errors_propagate_preserving_previous_output_and_unrelated_temporary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    output = tmp_path / "observer.json"
    output.write_bytes(b'{"previous": true}\n')
    unrelated = tmp_path / ".observer.json.unrelated.tmp"
    unrelated.write_bytes(b"preserve")
    failure = OSError(f"deliberate {stage} failure")
    original_factory = tempfile.NamedTemporaryFile
    temporary_paths: list[Path] = []

    def failing_temporary(*args: Any, **kwargs: Any) -> Any:
        if stage == "create":
            raise failure
        stream = original_factory(*args, **kwargs)
        temporary_paths.append(Path(stream.name))
        if stage == "write":
            original_write = stream.write

            def partial_write(data: str) -> int:
                original_write(data[: len(data) // 2])
                stream.flush()
                raise failure

            monkeypatch.setattr(stream, "write", partial_write)
        return stream

    def failing_replace(source: Path, destination: str | Path) -> Path:
        assert source in temporary_paths and destination == output
        assert json.loads(source.read_bytes()) == {"complete": True, "jobs": {}}
        raise failure

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", failing_temporary)
    if stage == "replace":
        monkeypatch.setattr(Path, "replace", failing_replace)
    with pytest.raises(OSError) as caught:
        observation.publish_observation(output, {"complete": True, "jobs": {}})

    assert caught.value is failure
    assert all(not path.exists() for path in temporary_paths)
    assert output.read_bytes() == b'{"previous": true}\n'
    assert unrelated.read_bytes() == b"preserve"
    assert set(tmp_path.iterdir()) == {output, unrelated}


def test_observe_preserves_change_and_one_second_write_cadence_and_final_snapshot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "existing-store"
    database.write_bytes(b"not opened: job_rows is replaced")
    output = tmp_path / "observer.json"
    stop = tmp_path / "stop"
    inventory = {"qualified-source": "unchanged"}
    clock = [10.0]
    sleeps: list[float] = []
    published: list[dict[str, Any]] = []
    samples = 0
    original_publish = observation.publish_observation

    def rows(path: Path, project_id: str | None) -> dict[str, Any]:
        nonlocal samples
        assert path == database and project_id == "captured-project"
        clock[0] = [10.0, 10.1, 10.2, 11.3][samples]
        samples += 1
        if samples == 4:
            stop.touch()
        return {
            "jobs": [
                {
                    "id": "observed",
                    "captures": None,
                    "execution_id": None,
                    "status": "queued" if samples < 3 else "succeeded",
                }
            ],
            "retained": {},
        }

    def publish(path: Path, value: Any) -> None:
        original_publish(path, value)
        published.append(json.loads(path.read_bytes()))

    monkeypatch.setattr(observation, "source_inventory", lambda: dict(inventory))
    monkeypatch.setattr(observation, "job_rows", rows)
    monkeypatch.setattr(observation, "owned_process", lambda row: None)
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(time, "sleep", sleeps.append)
    monkeypatch.setattr(observation, "publish_observation", publish)

    observation.observe(database, output, stop, "captured-project")

    assert [row["samples"] for row in published] == [1, 3, 4, 4]
    assert [row["complete"] for row in published] == [False, False, False, True]
    assert sleeps == [0.1, 0.1, 0.1]
    assert published[-1]["sources_before"] == published[-1]["sources_after"] == inventory
    assert published[-1]["sources_unchanged"] is True
    assert json.loads(output.read_bytes()) == published[-1]
    assert set(tmp_path.iterdir()) == {database, output, stop}
