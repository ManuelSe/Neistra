"""Actual 0017 upgrade/downgrade guards preserve preferences and user jobs."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
DATABASE_ALIASES = {
    "NEISTRA_DATA_DIR",
    "NEISTRA_DATABASE_URL",
    "MOLWEAVE_DATA_DIR",
    "MOLWEAVE_DATABASE_URL",
    "DATABASE_URL",
}


def migrate(root: Path, command: str, target: str) -> subprocess.CompletedProcess[str]:
    environment = {key: value for key, value in os.environ.items() if key not in DATABASE_ALIASES}
    environment.update(
        NEISTRA_DATA_DIR=str(root), NEISTRA_DATABASE_URL=f"sqlite:///{root}/store.db"
    )
    return subprocess.run(
        [sys.executable, "-m", "alembic", command, target],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def test_0017_round_trip_and_older_insert_server_default(tmp_path: Path) -> None:
    upgraded = migrate(tmp_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0017",)
        columns = {row[1]: row for row in connection.execute("PRAGMA table_info(jobs)")}
        assert columns["purpose"][4] == "'user'"
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE name='project_documents_v3'"
        ).fetchone()
    downgraded = migrate(tmp_path, "downgrade", "0016")
    assert downgraded.returncode == 0, downgraded.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0016",)
        assert "purpose" not in {row[1] for row in connection.execute("PRAGMA table_info(jobs)")}
        assert not connection.execute(
            "SELECT name FROM sqlite_master WHERE name LIKE 'ligand_property_%'"
        ).fetchall()
    repeated = migrate(tmp_path, "upgrade", "head")
    assert repeated.returncode == 0, repeated.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        columns = {
            row[1]: row
            for row in connection.execute("PRAGMA table_info(ligand_property_bindings)")
        }
        assert columns["incarnation"][3] == 1  # Required; no constant/default incarnation.
        assert columns["incarnation"][4] is None


def test_nondefault_preferences_refuse_downgrade_without_mutation(tmp_path: Path) -> None:
    assert migrate(tmp_path, "upgrade", "head").returncode == 0
    with sqlite3.connect(tmp_path / "store.db") as connection:
        connection.execute(
            "INSERT INTO ligand_property_preferences VALUES (1, 1, '[\"polarity\"]', '2026-11-17')"
        )
    refused = migrate(tmp_path, "downgrade", "0016")
    assert refused.returncode != 0
    assert "Restore default ligand property preferences" in refused.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == ("0017",)
        assert connection.execute(
            "SELECT enabled_categories FROM ligand_property_preferences"
        ).fetchone() == ('["polarity"]',)
        connection.execute(
            "UPDATE ligand_property_preferences SET enabled_categories = ?",
            ('["composition", "polarity", "lipophilicity", "flexibility"]',),
        )
    assert migrate(tmp_path, "downgrade", "0016").returncode == 0


def test_unreaped_private_capture_refuses_downgrade_and_user_jobs_survive(tmp_path: Path) -> None:
    from neistra_api.database import create_database_engine, create_session_factory
    from neistra_api.models import Job, LigandPropertyExecution, Project

    assert migrate(tmp_path, "upgrade", "head").returncode == 0
    engine = create_database_engine(f"sqlite:///{tmp_path}/store.db")
    project_id, private_id, user_id, execution_id = (str(uuid4()) for _ in range(4))
    with create_session_factory(engine)() as session:
        session.add(Project(id=project_id, name="Downgrade guard"))
        session.flush()
        common = {
            "project_id": project_id,
            "plugin_name": "neistra.ligand_properties",
            "job_type": "ligand.properties",
            "implementation_version": "ligand-properties-v1",
            "parameters": {"execution_id": execution_id},
            "provenance": {},
            "status": "completed",
        }
        session.add(Job(id=private_id, purpose="ligand_properties", **common))
        session.add(Job(id=user_id, purpose="user", **common))
        session.flush()
        session.add(
            LigandPropertyExecution(
                id=execution_id, project_id=project_id, job_id=private_id, captures=[], reaped=False
            )
        )
        session.commit()
    refused = migrate(tmp_path, "downgrade", "0016")
    assert refused.returncode != 0
    assert "Stop and reap derived ligand property work" in refused.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        assert connection.execute("SELECT count(*) FROM jobs").fetchone() == (2,)
        connection.execute("UPDATE ligand_property_executions SET reaped = 1")
    accepted = migrate(tmp_path, "downgrade", "0016")
    assert accepted.returncode == 0, accepted.stderr
    with sqlite3.connect(tmp_path / "store.db") as connection:
        assert connection.execute("SELECT id FROM jobs").fetchall() == [(user_id,)]
    engine.dispose()
