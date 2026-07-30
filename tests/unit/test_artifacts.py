from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.artifacts import LocalArtifactStore, UnsafeArtifactPathError


def test_artifact_store_is_content_addressed_and_immutable(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path)
    first = store.put_bytes(b"molweave")
    second = store.put_bytes(b"molweave")

    assert first == second
    assert store.read_bytes(first.relative_path) == b"molweave"
    assert first.relative_path.endswith(first.sha256)


@pytest.mark.parametrize("path", ["../secret", "/etc/passwd", "artifacts/../../secret"])
def test_artifact_store_rejects_paths_outside_root(tmp_path: Path, path: str) -> None:
    store = LocalArtifactStore(tmp_path)

    with pytest.raises(UnsafeArtifactPathError):
        store.read_bytes(path)
