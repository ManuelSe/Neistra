"""Source-bound rich schema-0014 data for historical camera migration tests."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/migrations/v2-rich-project-0014.zip"


def restore_rich_v2_store(directory: Path) -> None:
    with zipfile.ZipFile(FIXTURE) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["source_tag"] == "v0.33.0"
        assert manifest["source_commit"] == "d8636064263f6221c402665da52a4a1738570845"
        assert manifest["migration_head"] == "0014" and manifest["retained_redo"]
        assert manifest["checkpoint_revision"] > 0
        assert set(archive.namelist()) == set(manifest["files"]) | {"manifest.json"}
        verified: list[tuple[Path, bytes]] = []
        for name, identity in manifest["files"].items():
            target = directory / name
            assert target.resolve().is_relative_to(directory.resolve())
            assert not target.exists(), "Never replace an existing test store"
            payload = archive.read(name)
            assert len(payload) == identity["size"]
            assert hashlib.sha256(payload).hexdigest() == identity["sha256"]
            verified.append((target, payload))
        for target, payload in verified:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
