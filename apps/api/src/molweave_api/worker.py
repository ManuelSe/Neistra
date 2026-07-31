from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import BaseServer
from uuid import uuid4

from molweave_core.jobs import PluginRegistry

from molweave_api.database import create_database_engine, create_session_factory
from molweave_api.job_worker import JobWorker
from molweave_api.settings import Settings


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}\n')

    def log_message(self, format: str, *args: object) -> None:
        return


def _start_health_server(port: int) -> BaseServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), _HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> None:
    settings = Settings.from_env()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_database_engine(settings.database_url)
    registry = PluginRegistry.load(
        allowlist=settings.job_plugin_allowlist,
        configured_targets=settings.job_plugin_targets,
        discover_installed=True,
    )
    health_server = (
        _start_health_server(settings.job_worker_health_port)
        if settings.job_worker_health_port is not None
        else None
    )
    try:
        JobWorker(
            settings,
            create_session_factory(engine),
            registry,
            f"local-{uuid4()}",
        ).run_forever()
    finally:
        if health_server is not None:
            health_server.shutdown()
        engine.dispose()


if __name__ == "__main__":
    main()
