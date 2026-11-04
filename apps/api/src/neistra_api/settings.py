from __future__ import annotations

import math
import stat
from dataclasses import dataclass
from pathlib import Path

from neistra_core.configuration import environment_string, environment_value


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    database_url: str
    cors_origins: tuple[str, ...] = ("http://127.0.0.1:5173", "http://localhost:5173")
    auto_create_schema: bool = False
    enable_test_routes: bool = False
    max_structure_file_bytes: int = 100 * 1024 * 1024
    max_upload_request_bytes: int = 500 * 1024 * 1024
    max_archive_upload_bytes: int = 500 * 1024 * 1024
    max_archive_uncompressed_bytes: int = 1024 * 1024 * 1024
    max_archive_members: int = 10_000
    max_archive_compression_ratio: float = 100.0
    atom_warning_limit: int = 250_000
    atom_hard_limit: int = 1_000_000
    job_plugin_allowlist: tuple[str, ...] = ("molweave.demo", "molweave.minimization")
    job_plugin_targets: tuple[str, ...] = (
        "neistra_demo_plugin.plugin:plugin",
        "neistra_core.minimization.plugin:plugin",
    )
    job_worker_poll_seconds: float = 0.1
    job_worker_health_port: int | None = None

    @classmethod
    def from_env(cls) -> Settings:
        data_dir, database_url = resolve_store()
        return cls(
            data_dir=data_dir,
            database_url=database_url,
            auto_create_schema=boolean_setting("AUTO_CREATE_SCHEMA"),
            enable_test_routes=boolean_setting("ENABLE_TEST_ROUTES"),
            max_structure_file_bytes=positive_int("MAX_STRUCTURE_FILE_BYTES", 100 * 1024**2),
            max_upload_request_bytes=positive_int("MAX_UPLOAD_REQUEST_BYTES", 500 * 1024**2),
            max_archive_upload_bytes=positive_int("MAX_ARCHIVE_UPLOAD_BYTES", 500 * 1024**2),
            max_archive_uncompressed_bytes=positive_int("MAX_ARCHIVE_UNCOMPRESSED_BYTES", 1024**3),
            max_archive_members=positive_int("MAX_ARCHIVE_MEMBERS", 10000),
            max_archive_compression_ratio=positive_float("MAX_ARCHIVE_COMPRESSION_RATIO", 100),
            atom_warning_limit=positive_int("ATOM_WARNING_LIMIT", 250000),
            atom_hard_limit=positive_int("ATOM_HARD_LIMIT", 1000000),
            job_plugin_allowlist=csv_setting(
                "JOB_PLUGIN_ALLOWLIST", "molweave.demo,molweave.minimization"
            ),
            job_plugin_targets=csv_setting(
                "JOB_PLUGIN_TARGETS",
                "neistra_demo_plugin.plugin:plugin,neistra_core.minimization.plugin:plugin",
            ),
            job_worker_poll_seconds=positive_float("JOB_WORKER_POLL_SECONDS", 0.1),
            job_worker_health_port=health_port(),
        )


def boolean_setting(name: str) -> bool:
    value = environment_string(name, "0")
    if value not in {"0", "1"}:
        raise ValueError(f"NEISTRA_{name} must be 0 or 1")
    return value == "1"


def positive_int(name: str, default: int) -> int:
    try:
        value = int(environment_string(name, str(default)))
        if value > 0:
            return value
    except ValueError:
        pass
    raise ValueError(f"NEISTRA_{name} must be a positive integer")


def positive_float(name: str, default: float) -> float:
    try:
        value = float(environment_string(name, str(default)))
        if math.isfinite(value) and value > 0:
            return value
    except ValueError:
        pass
    raise ValueError(f"NEISTRA_{name} must be finite and positive")


def csv_setting(name: str, default: str) -> tuple[str, ...]:
    return tuple(
        item.strip() for item in environment_string(name, default).split(",") if item.strip()
    )


def health_port() -> int | None:
    if environment_value("JOB_WORKER_HEALTH_PORT") is None:
        return None
    value = positive_int("JOB_WORKER_HEALTH_PORT", 8011)
    if value > 65535:
        raise ValueError("NEISTRA_JOB_WORKER_HEALTH_PORT must be between 1 and 65535")
    return value


def path_exists(path: Path) -> bool:
    # Unlike Path.exists(), propagate permission/I/O errors rather than selecting
    # a fresh store after an inaccessible existing installation.
    try:
        path.stat()
    except FileNotFoundError:
        if path.is_symlink():
            raise ValueError(f"Store path is a broken symlink: {path}") from None
        return False
    return True


def resolve_store() -> tuple[Path, str]:
    configured = environment_value("DATA_DIR")
    database_url = environment_value("DATABASE_URL")
    if configured is not None:
        if not configured.strip():
            raise ValueError("NEISTRA_DATA_DIR must not be empty")
        path_exists(Path(configured))
        root = Path(configured).resolve()
    else:
        old, new = Path(".molweave"), Path(".neistra")
        if path_exists(old) and path_exists(new):
            raise ValueError("Both default stores exist; set NEISTRA_DATA_DIR explicitly")
        root = (old if path_exists(old) else new).resolve()
    if path_exists(root) and not root.is_dir():
        raise ValueError("NEISTRA_DATA_DIR must be a directory")
    if database_url is not None:
        if not database_url.strip():
            raise ValueError("NEISTRA_DATABASE_URL must not be empty")
        # Explicit URLs may intentionally refer to a different database location.
        # The database layer validates connectivity; never replace its failures.
        return root, database_url
    legacy, canonical = root / "molweave.db", root / "neistra.db"
    existing = [p for p in (legacy, canonical) if path_exists(p)]
    if len(existing) > 1:
        raise ValueError("Both database names exist; set NEISTRA_DATABASE_URL explicitly")
    if existing:
        database = existing[0]
        if not stat.S_ISREG(database.stat().st_mode):
            raise ValueError("Existing database must be a regular SQLite file")
        with database.open("rb") as stream:
            if stream.read(16) != b"SQLite format 3\x00":
                raise ValueError(
                    "Existing store has an invalid SQLite header; no replacement created"
                )
    else:
        if path_exists(root) and any(root.iterdir()):
            raise ValueError("Nonempty store has no database; set NEISTRA_DATABASE_URL explicitly")
        database = legacy if root.name == ".molweave" else canonical
    return root, f"sqlite:///{database}"
