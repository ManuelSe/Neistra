from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient
from tests.support.performance import performance_enabled


def pytest_configure() -> None:
    performance_enabled()  # Reject invalid profiles before running tests.


@pytest.fixture
def client(tmp_path: Path) -> Iterator[ApiClient]:
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        auto_create_schema=True,
        enable_test_routes=True,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    yield ApiClient(app)
    Base.metadata.drop_all(app.state.engine)
    app.state.engine.dispose()
