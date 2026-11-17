from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import event

from tests.support.api_client import ApiClient


def test_profile_metadata_preserves_the_scientific_wire_contract(client: ApiClient) -> None:
    response = client.get("/api/v1/ligand-profiles/registry")
    assert response.status_code == 200, response.text
    expected = json.loads(
        (Path(__file__).parents[1] / "fixtures/profiles/registry.json").read_text()
    )
    assert response.json() == expected
    schema = client.get("/api/v1/openapi.json").json()
    operation = schema["paths"]["/api/v1/ligand-profiles/registry"]["get"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProfileRegistry"
    }


def test_profile_metadata_reads_do_not_access_project_or_execution_storage(
    client: ApiClient,
) -> None:
    project = client.post("/api/v1/projects", json={"name": "Untouched profile metadata"}).json()
    endpoint = f"/api/v1/projects/{project['id']}"
    before = client.get(endpoint).json()
    statements: list[str] = []

    def record_sql(
        _connection: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    engine = client.app.state.engine
    event.listen(engine, "before_cursor_execute", record_sql)
    try:
        for _ in range(3):
            response = client.get("/api/v1/ligand-profiles/registry")
            assert response.status_code == 200, response.text
    finally:
        event.remove(engine, "before_cursor_execute", record_sql)
    assert statements == []
    assert client.get(endpoint).json() == before
