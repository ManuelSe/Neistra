"""Implementation-neutral integrity oracles for actual older-reader refusal.

Load by absolute path from the current qualification tooling. This module uses
only the standard library; it never substitutes current API/core implementations
inside the actual predecessor process.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _encoded(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def snapshot(data: Path) -> dict[str, Any]:
    data = data.resolve()
    databases = [path for name in ("molweave.db", "neistra.db") if (path := data / name).is_file()]
    assert len(databases) == 1, "Use one unambiguous disposable reader store"
    database = databases[0]
    tables: dict[str, Any] = {}
    with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as connection:
        connection.execute("PRAGMA query_only=ON")
        definitions = connection.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        for name, definition in definitions:
            quoted = '"' + name.replace('"', '""') + '"'
            columns = [list(row) for row in connection.execute(
                f"PRAGMA table_info({quoted})"
            ).fetchall()]
            rows = connection.execute(f"SELECT * FROM {quoted}").fetchall()
            encoded_rows = sorted(_encoded([
                {"blob_hex": value.hex()} if isinstance(value, bytes) else value for value in row
            ]) for row in rows)
            tables[name] = {"sql": definition, "columns": columns, "rows": len(rows),
                            "rows_sha256": _sha(b"\n".join(encoded_rows))}
    excluded = {database, *(Path(f"{database}{suffix}") for suffix in ("-wal", "-shm", "-journal"))}
    files = {}
    for path in sorted(data.rglob("*")):
        assert not path.is_symlink(), "Reader stores must not contain symbolic links"
        if path.is_file() and path not in excluded:
            payload = path.read_bytes()
            files[path.relative_to(data).as_posix()] = {
                "bytes": len(payload), "sha256": _sha(payload),
            }
    return {"database": database.name, "tables": tables, "files": files,
            "logical_sha256": _sha(_encoded(tables)), "files_sha256": _sha(_encoded(files))}


def refuse_archives(
    client: Any, data: Path, archives: list[dict[str, str]],
) -> dict[str, Any]:
    assert archives, "Qualify actual current-produced archives"
    pairs: dict[str, set[str]] = {}
    seen: set[tuple[str, str]] = set()
    for archive in archives:
        suffix = archive["suffix"]
        assert suffix in {"neistra", "molweave"}
        identity = (archive["path"], suffix)
        assert identity not in seen, "Duplicate archive probe cannot increase coverage"
        seen.add(identity)
        payload = Path(archive["path"]).read_bytes()
        assert _sha(payload) == archive["sha256"], "Current-produced archive identity changed"
        pairs.setdefault(archive["sha256"], set()).add(suffix)
    assert all(styles == {"neistra", "molweave"} for styles in pairs.values()), (
        "Every current archive must be tried under both suffixes"
    )
    before = snapshot(data)
    refusals = []
    for index, archive in enumerate(archives):
        payload = Path(archive["path"]).read_bytes()
        assert _sha(payload) == archive["sha256"]
        response = client.post(
            "/api/v1/projects/import-archive",
            data={"operation_id": f"schema-boundary-refusal-{index}"},
            files={"file": (f"current.{archive['suffix']}.zip", payload, "application/zip")},
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"]["code"] == "unsupported_archive_schema", response.text
        after = snapshot(data)
        assert after == before, (
            "Older reader changed retained rows or files while refusing an archive"
        )
        refusals.append({**archive, "http": response.status_code,
                         "code": "unsupported_archive_schema", "unchanged": True,
                         "logical_sha256": after["logical_sha256"],
                         "files_sha256": after["files_sha256"]})
    return {"archive_refusals": refusals, "before": before, "after": snapshot(data),
            "archive_pairs": len(pairs), "both_suffixes": True}
