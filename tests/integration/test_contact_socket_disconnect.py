"""Exercise ASGI disconnect ownership through an actual loopback TCP connection."""

from __future__ import annotations

import asyncio
import socket

import httpx
import pytest
import uvicorn
from neistra_api import contact_service as execution

from tests.integration.test_contact_execution import (
    assert_reaped,
    canonical_files,
    coordinator,
    query_for,
    wait_ready,
)
from tests.integration.test_viewer_state import import_ligand
from tests.support.api_client import ApiClient
from tests.support.contact_execution_workers import waiting_contact_child


def test_tcp_disconnect_reaps_owned_contact_child_and_restores_admission(
    client: ApiClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = import_ligand(client)
    service = coordinator(client)
    before_files = canonical_files(service)
    path = f"/api/v1/projects/{project['id']}"
    before_project = client.get(path).json()
    original_worker = execution.run_contact_child
    monkeypatch.setattr(execution, "run_contact_child", waiting_contact_child)

    async def run() -> None:
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        host, port = listener.getsockname()
        server = uvicorn.Server(
            uvicorn.Config(
                client.app,
                lifespan="off",
                log_level="warning",
                timeout_graceful_shutdown=5,
            )
        )
        serving = asyncio.create_task(server.serve(sockets=[listener]))
        writer: asyncio.StreamWriter | None = None
        try:
            async with asyncio.timeout(5):
                while not server.started:
                    assert not serving.done(), "Owned TCP server stopped during startup"
                    await asyncio.sleep(0.01)
            _, writer = await asyncio.open_connection(host, port)
            body = query_for(project).model_dump_json().encode()
            headers = (
                f"POST {path}/contacts HTTP/1.1\r\nHost: {host}:{port}\r\n"
                f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n"
            ).encode()
            writer.write(headers + body)
            await writer.drain()
            pid = await wait_ready(service)
            async with httpx.AsyncClient(base_url=f"http://{host}:{port}", timeout=5) as api:
                assert (await api.get("/api/v1/health")).status_code == 200
                busy = await api.post(f"{path}/contacts", json=query_for(project).model_dump())
                assert busy.status_code == 429 and busy.json()["detail"]["code"] == "contacts_busy"
                # This closes the physical request stream while the child is held.
                # No direct cancellation callback/event is injected into the service.
                writer.close()
                await writer.wait_closed()
                writer = None
                async with asyncio.timeout(6):
                    while service._active is not None:
                        await asyncio.sleep(0.01)
                assert_reaped(pid)
                assert not list(service.settings.data_dir.glob("contact-read-*"))
                monkeypatch.setattr(execution, "run_contact_child", original_worker)
                recovered = await api.post(f"{path}/contacts", json=query_for(project).model_dump())
                assert recovered.status_code == 200, recovered.text
                rows = recovered.json()
                assert len(rows) == 1 and rows[0]["distance"] == pytest.approx(2.4)
        finally:
            if writer is not None:
                writer.close()
                await writer.wait_closed()
            (service.settings.data_dir / "contact-worker-release").touch()
            await service.close()
            server.should_exit = True
            try:
                await asyncio.wait_for(serving, 5)
            finally:
                listener.close()

    asyncio.run(run())
    assert canonical_files(service) == before_files
    assert client.get(path).json() == before_project
    assert not list(service.settings.data_dir.glob("contact-read-*"))
