"""Separate concurrent requests retain one quick coordinate publication."""

import threading
from concurrent.futures import ThreadPoolExecutor

from tests.integration.test_minimization_apply import seeded_project
from tests.integration.test_quick_minimization import apply_quick, calculate
from tests.support.api_client import ApiClient
from tests.support.minimization import molecule


def test_concurrent_quick_apply_requests_publish_exactly_one_command(client: ApiClient):
    project = seeded_project(client, molecule())
    job, proposal = calculate(client, project, [3])
    assert proposal["applicable"]
    ready = threading.Barrier(2)

    def attempt(_: int):
        ready.wait(timeout=5)
        return apply_quick(client, project, job, proposal)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(attempt, range(2)))
    assert sorted(response.status_code for response in responses) == [200, 409]
    current = client.get(f"/api/v1/projects/{project['id']}").json()
    assert current["revision"] == project["revision"] + 1
    assert current["history"]["retained_commands"] == project["history"]["retained_commands"] + 1
    completed = client.get(f"/api/v1/jobs/{job['id']}").json()
    assert (
        completed["provenance"]["quick_minimization_application"]["revision"] == current["revision"]
    )
