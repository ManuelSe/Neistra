"""Exercise the ASGI lifetime itself: client teardown must not mask leaked polling."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from tests.integration.test_job_lifecycle import _project_with_structure, _submit
from tests.support.api_client import ApiClient


def test_idle_jobs_websocket_stops_on_disconnect(client: ApiClient) -> None:
    async def check() -> None:
        messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        await messages.put({"type": "websocket.connect"})
        accepted = asyncio.Event()

        async def send(message: dict[str, Any]) -> None:
            if message["type"] == "websocket.accept":
                accepted.set()

        task = asyncio.create_task(
            client.app(
                {
                    "type": "websocket",
                    "path": "/ws/jobs",
                    "query_string": b"project_id=absent",
                    "headers": [],
                    "scheme": "ws",
                    "server": ("test", 80),
                    "client": ("test", 1),
                    "root_path": "",
                    "subprotocols": [],
                },
                messages.get,
                send,
            )
        )
        await asyncio.wait_for(accepted.wait(), 1)
        await messages.put({"type": "websocket.disconnect", "code": 1000})
        await asyncio.wait_for(task, 1)

    asyncio.run(check())


@pytest.mark.parametrize(
    "error",
    [OSError("closed"), RuntimeError("handler is closed"), RuntimeError("unrelated defect")],
)
def test_jobs_websocket_send_race_has_bounded_cleanup(client: ApiClient, error: Exception) -> None:
    project, entry = _project_with_structure(client)
    assert _submit(client, project["id"], entry["id"], {}).status_code == 201

    async def check() -> None:
        messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        await messages.put({"type": "websocket.connect"})

        async def send(message: dict[str, Any]) -> None:
            if message["type"] == "websocket.send":
                raise error

        operation = client.app(
            {
                "type": "websocket",
                "path": "/ws/jobs",
                "query_string": f"project_id={project['id']}".encode(),
                "headers": [],
                "scheme": "ws",
                "server": ("test", 80),
                "client": ("test", 1),
                "root_path": "",
                "subprotocols": [],
            },
            messages.get,
            send,
        )
        if str(error) == "unrelated defect":
            with pytest.raises(RuntimeError, match="unrelated defect"):
                await asyncio.wait_for(operation, 1)
        else:
            await asyncio.wait_for(operation, 1)

    asyncio.run(check())
