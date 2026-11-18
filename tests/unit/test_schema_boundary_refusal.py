from __future__ import annotations

import hashlib
import runpy
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

MODULE = Path(__file__).resolve().parents[1] / "support/schema_boundary_refusal.py"
TOOLS = runpy.run_path(str(MODULE))


def specimen(tmp_path: Path) -> tuple[Path, list[dict[str, str]]]:
    data = tmp_path / "store"
    data.mkdir()
    with sqlite3.connect(data / "neistra.db") as connection:
        connection.execute("CREATE TABLE project_documents_v3 (id TEXT PRIMARY KEY, state TEXT)")
        connection.execute("INSERT INTO project_documents_v3 VALUES ('p', 'retain every byte')")
        connection.execute("CREATE TABLE alembic_version (version_num TEXT)")
        connection.execute("INSERT INTO alembic_version VALUES ('0016')")
    artifact = data / "artifacts/source"
    artifact.parent.mkdir()
    artifact.write_bytes(b"immutable source")
    archive = tmp_path / "source.neistra.zip"
    archive.write_bytes(b"synthetic payload; verifier unit, not actual reader evidence")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    return data, [{"path": str(archive), "suffix": suffix, "sha256": digest}
                  for suffix in ("neistra", "molweave")]


class Client:
    def __init__(self, action: Any = None, code: str = "unsupported_archive_schema") -> None:
        self.action, self.code = action, code
        self.calls = 0

    def post(self, *_args: Any, **_kwargs: Any) -> Any:
        self.calls += 1
        if self.action:
            self.action()
        return SimpleNamespace(status_code=422, text=self.code,
                               json=lambda: {"detail": {"code": self.code}})


def test_refusal_oracle_requires_exact_both_suffix_outcomes_and_preserves_all_rows_and_files(
    tmp_path: Path,
) -> None:
    data, archives = specimen(tmp_path)
    client = Client()
    before = TOOLS["snapshot"](data)
    result = TOOLS["refuse_archives"](client, data, archives)
    assert client.calls == 2
    assert len(result["archive_refusals"]) == 2 and result["archive_pairs"] == 1
    assert result["before"] == result["after"] == before


@pytest.mark.parametrize("mutation", ["row", "artifact", "new_file"])
def test_refusal_oracle_detects_mutation_even_when_api_reports_correct_refusal(
    tmp_path: Path, mutation: str,
) -> None:
    data, archives = specimen(tmp_path)

    def change() -> None:
        if mutation == "row":
            with sqlite3.connect(data / "neistra.db") as connection:
                connection.execute("UPDATE project_documents_v3 SET state='lost'")
        elif mutation == "artifact":
            (data / "artifacts/source").write_bytes(b"changed source")
        else:
            (data / "unexpected-export").write_bytes(b"unwanted publication")

    with pytest.raises(AssertionError, match="changed retained"):
        TOOLS["refuse_archives"](Client(change), data, archives)


def test_refusal_oracle_does_not_accept_wrong_reason_changed_input_or_missing_suffix(
    tmp_path: Path,
) -> None:
    data, archives = specimen(tmp_path)
    with pytest.raises(AssertionError):
        TOOLS["refuse_archives"](Client(code="invalid_archive"), data, archives)
    with pytest.raises(AssertionError, match="both suffixes"):
        TOOLS["refuse_archives"](Client(), data, archives[:1])
    Path(archives[0]["path"]).write_bytes(b"different archive")
    with pytest.raises(AssertionError, match="identity changed"):
        TOOLS["refuse_archives"](Client(), data, archives)
