"""Picklable fault controls for contact execution ownership tests."""

from __future__ import annotations

import hashlib
import json
import os
import time
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Any

from neistra_api.contact_execution_data import ContactSnapshot
from neistra_api.contact_execution_worker import run_contact_child


def waiting_contact_child(connection: Connection, directory: str, payload: bytes) -> None:
    snapshot = ContactSnapshot.model_validate_json(payload)
    root = Path(snapshot.data_root)
    (root / "contact-worker-ready").write_text(str(os.getpid()))
    while not (root / "contact-worker-release").exists():
        time.sleep(0.01)
    run_contact_child(connection, directory, payload)


def reporting_contact_child(connection: Connection, directory: str, payload: bytes) -> None:
    """Publish the real owned PID, then run the ordinary typed producer."""
    snapshot = ContactSnapshot.model_validate_json(payload)
    (Path(snapshot.data_root) / "contact-worker-ready").write_text(str(os.getpid()))
    run_contact_child(connection, directory, payload)


def _receipt(connection: Connection, directory: str, payload: bytes, defect: str) -> None:
    snapshot = ContactSnapshot.model_validate_json(payload)
    body = b"[]"
    (Path(directory) / "response.json").write_bytes(body)
    message: dict[str, Any] = {
        "kind": "result",
        "operation_id": snapshot.operation_id,
        "project_id": snapshot.project_id,
        "entry_id": snapshot.entry_id,
        "artifact_id": snapshot.source.artifact_id,
        "policy_key": snapshot.policy.key,
        "count": 0,
        "response": {
            "filename": "response.json",
            "size": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        },
    }
    if defect == "owner":
        message["operation_id"] = "retired-operation"
    elif defect == "boolean":
        message["count"] = True
    elif defect == "count":
        message["count"] = snapshot.policy.max_results + 1
    elif defect == "filename":
        message["response"]["filename"] = "normalized.json"
    elif defect == "hash":
        message["response"]["sha256"] = "0" * 64
    elif defect == "bytes":
        message["response"]["size"] = snapshot.policy.max_response_bytes + 1
    elif defect == "partial":
        (Path(directory) / "response.json").write_bytes(b"[")
    connection.send_bytes(json.dumps(message).encode())
    connection.close()


def wrong_owner_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "owner")


def boolean_count_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "boolean")


def excessive_count_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "count")


def wrong_filename_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "filename")


def wrong_hash_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "hash")


def excessive_bytes_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "bytes")


def partial_contact_child(connection: Connection, directory: str, payload: bytes) -> None:
    _receipt(connection, directory, payload, "partial")


def oversized_contact_control(connection: Connection, directory: str, payload: bytes) -> None:
    connection.send_bytes(b"x" * 8192)
    connection.close()


def exiting_contact_child(connection: Connection, directory: str, payload: bytes) -> None:
    os._exit(7)
