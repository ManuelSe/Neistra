"""Historical reports remain evidence, not permission for a new coordinate edit."""

from neistra_api.models import Job

from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_quick_minimization import calculate
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule


def test_earlier_quick_proposal_remains_inspectable_but_cannot_apply(client: ApiClient):
    project = seeded_project(client, molecule())
    job, proposal = calculate(client, project, [3])
    results = client.get(f"/api/v1/jobs/{job['id']}").json()["results"]
    original_artifacts = {
        item["artifact"]["download_url"]: client.get(item["artifact"]["download_url"]).content
        for item in results
    }
    with client.app.state.session_factory() as session:
        stored = session.get(Job, job["id"])
        assert stored is not None
        stored.implementation_version = "1.0.2"
        stored.result_values = {
            key: value for key, value in stored.result_values.items() if key != "graph_policy"
        }
        session.commit()
    url = f"/api/v1/projects/{project['id']}/quick-minimizations/{job['id']}"
    inspected = client.get(f"{url}/proposal")
    assert inspected.status_code == 200, inspected.text
    assert inspected.json()["report"] == proposal["report"]
    assert not inspected.json()["applicable"]
    assert "rerun" in inspected.json()["unavailable_reason"]
    before_apply = client.get(f"/api/v1/projects/{project['id']}").json()
    response = client.post(
        f"{url}/apply",
        json={
            "expected_revision": project["revision"],
            "proposal_sha256": proposal["proposal_sha256"],
        },
    )
    assert response.status_code == 409
    assert client.get(f"/api/v1/projects/{project['id']}").json() == before_apply
    for path, data in original_artifacts.items():
        assert client.get(path).content == data
