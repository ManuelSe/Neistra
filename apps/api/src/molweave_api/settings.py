from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


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

    @classmethod
    def from_env(cls) -> Settings:
        data_dir = Path(os.getenv("MOLWEAVE_DATA_DIR", ".molweave")).resolve()
        database_url = os.getenv(
            "MOLWEAVE_DATABASE_URL",
            f"sqlite:///{data_dir / 'molweave.db'}",
        )
        return cls(
            data_dir=data_dir,
            database_url=database_url,
            auto_create_schema=os.getenv("MOLWEAVE_AUTO_CREATE_SCHEMA") == "1",
            enable_test_routes=os.getenv("MOLWEAVE_ENABLE_TEST_ROUTES") == "1",
            max_structure_file_bytes=int(
                os.getenv("MOLWEAVE_MAX_STRUCTURE_FILE_BYTES", str(100 * 1024 * 1024))
            ),
            max_upload_request_bytes=int(
                os.getenv("MOLWEAVE_MAX_UPLOAD_REQUEST_BYTES", str(500 * 1024 * 1024))
            ),
            max_archive_upload_bytes=int(
                os.getenv("MOLWEAVE_MAX_ARCHIVE_UPLOAD_BYTES", str(500 * 1024 * 1024))
            ),
            max_archive_uncompressed_bytes=int(
                os.getenv(
                    "MOLWEAVE_MAX_ARCHIVE_UNCOMPRESSED_BYTES",
                    str(1024 * 1024 * 1024),
                )
            ),
            max_archive_members=int(os.getenv("MOLWEAVE_MAX_ARCHIVE_MEMBERS", "10000")),
            max_archive_compression_ratio=float(
                os.getenv("MOLWEAVE_MAX_ARCHIVE_COMPRESSION_RATIO", "100")
            ),
            atom_warning_limit=int(os.getenv("MOLWEAVE_ATOM_WARNING_LIMIT", "250000")),
            atom_hard_limit=int(os.getenv("MOLWEAVE_ATOM_HARD_LIMIT", "1000000")),
        )
