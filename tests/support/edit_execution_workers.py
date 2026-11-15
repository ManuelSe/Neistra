"""Small process-level fault fixtures for the ordinary editing boundary."""

from __future__ import annotations

import json
import os
import signal
import struct
import time
from multiprocessing.connection import Connection
from pathlib import Path


def waiting_child(connection: Connection, directory: str, manifest: bytes) -> None:
    if os.name == "posix":
        os.setsid()
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    Path(directory, "child.pid").write_text(str(os.getpid()))
    connection.send_bytes(
        json.dumps(
            {
                "kind": "started",
                "pid": os.getpid(),
                "process_group": os.getpgrp() if os.name == "posix" else None,
            }
        ).encode()
    )
    while True:
        time.sleep(1)


def partial_child(connection: Connection, directory: str, manifest: bytes) -> None:
    if os.name == "posix":
        os.setsid()
    Path(directory, "child.pid").write_text(str(os.getpid()))
    # A partial frame must not block deadline/disconnect observation on the loop.
    os.write(connection.fileno(), struct.pack("!i", 100))
    while True:
        time.sleep(1)


def exiting_child(connection: Connection, directory: str, manifest: bytes) -> None:
    os._exit(3)


def acknowledged_exit_child(connection: Connection, directory: str, manifest: bytes) -> None:
    if os.name == "posix":
        os.setsid()
    connection.send_bytes(
        json.dumps(
            {
                "kind": "started",
                "pid": os.getpid(),
                "process_group": os.getpgrp() if os.name == "posix" else None,
            }
        ).encode()
    )
    os._exit(3)


def invalid_descriptor_child(connection: Connection, directory: str, manifest: bytes) -> None:
    connection.send_bytes(
        json.dumps(
            {
                "kind": "result",
                "output": {
                    "envelope": {
                        "filename": "../outside",
                        "size": 2,
                        "sha256": "0" * 64,
                    }
                },
            }
        ).encode()
    )
    connection.close()


def unicode_error_child(connection: Connection, directory: str, manifest: bytes) -> None:
    from neistra_api.edit_execution_worker import _control_bytes

    connection.send_bytes(_control_bytes({"kind": "invalid", "message": '\u03a9"\\' * 3000}))
    connection.close()
