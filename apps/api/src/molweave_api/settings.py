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
        )
