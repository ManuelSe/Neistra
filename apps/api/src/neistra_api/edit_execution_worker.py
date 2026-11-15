"""Spawn entry point: no session, database address, or publication capability."""

from __future__ import annotations

import json
import os
from multiprocessing.connection import Connection
from pathlib import Path


def _control_bytes(message: dict[str, object]) -> bytes:
    data = json.dumps(message, ensure_ascii=False).encode()
    while len(data) > 4096:
        text = str(message.get("message", "Molecular computation failed."))
        message = {
            "kind": message.get("kind", "failed"),
            "message": text[: max(1, len(text) // 2)] + " (details truncated)",
        }
        data = json.dumps(message, ensure_ascii=False).encode()
    return data


def run_edit_child(connection: Connection, operation_directory: str, manifest_json: bytes) -> None:
    # Keep imports above deliberately minimal: set native thread limits before
    # scientific libraries initialize in this independently spawned interpreter.
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    for name in ("DATABASE_URL", "NEISTRA_DATABASE_URL", "MOLWEAVE_DATABASE_URL"):
        os.environ.pop(name, None)
    if os.name == "posix":
        os.setsid()
    connection.send_bytes(
        _control_bytes(
            {
                "kind": "started",
                "pid": os.getpid(),
                "process_group": os.getpgrp() if os.name == "posix" else None,
            }
        )
    )
    message: dict[str, object]
    try:
        from neistra_core.molecular import NormalizedStructureV1
        from pydantic import BaseModel

        from neistra_api.edit_computation import (
            InvalidEditComputation,
            build_model_preview,
            compute_model_result,
            compute_selection_result,
            needs_original_protection,
            prepare_model_publication,
            prepare_publication,
            selection_description,
            validate_preview_action,
        )
        from neistra_api.edit_execution_data import (
            EditOutput,
            EditSnapshot,
            FileDescriptor,
            read_immutable_input,
            read_verified_file,
            stage_file,
        )
        from neistra_api.schemas import ModelEditCreate, SelectionEditCreate
        from neistra_api.source_identity import recover_original_bytes

        directory = Path(operation_directory)
        manifest = FileDescriptor.model_validate_json(manifest_json)
        if manifest.filename != "request.json":
            raise ValueError("Invalid editing input descriptor")
        snapshot = EditSnapshot.model_validate_json(read_verified_file(directory, manifest))
        root = Path(snapshot.data_root)
        before = NormalizedStructureV1.from_bytes(read_immutable_input(root, snapshot.normalized))
        normalized_descriptor = None
        response: BaseModel
        if snapshot.kind in {"preview", "model"}:
            payload = ModelEditCreate.model_validate(snapshot.payload)
            if snapshot.kind == "preview":
                validate_preview_action(payload)
            try:
                if needs_original_protection(before, payload) and snapshot.original is not None:
                    original = snapshot.original
                    if original.size <= snapshot.max_structure_file_bytes:
                        recovered = recover_original_bytes(
                            before,
                            read_immutable_input(root, original),
                            original.artifact_id,
                            original.sha256,
                            original.size,
                            max_file_bytes=snapshot.max_structure_file_bytes,
                            atom_limit=snapshot.target.atom_limit,
                        )
                        if recovered is not None:
                            before = recovered.structure
            except (ValueError, RuntimeError, OverflowError, OSError, LookupError):
                # Missing/corrupt original evidence cannot certify ordinary atoms.
                # Preserve the existing conservative best-effort recovery behavior.
                pass
            result = compute_model_result(snapshot.target, before, payload)
            if snapshot.kind == "preview":
                response = build_model_preview(snapshot.target.entry_id, before, payload, result)
            else:
                publication, after = prepare_model_publication(
                    snapshot.target, before, payload, result
                )
                response = publication
                if publication.applied:
                    normalized_descriptor = stage_file(
                        directory, "normalized.json", after.to_bytes()
                    )
        else:
            selection_payload = SelectionEditCreate.model_validate(snapshot.payload)
            selected_result, after_selection = compute_selection_result(
                snapshot.target,
                before,
                selection_payload,
            )
            if len(selected_result.edit.structure.atoms) > snapshot.target.atom_limit:
                raise InvalidEditComputation(
                    f"The result exceeds the entry limit of {snapshot.target.atom_limit} atoms."
                )
            response = prepare_publication(
                snapshot.target,
                before,
                selection_payload.selection,
                selection_payload.action.operation,
                selection_description(snapshot.target.name, selection_payload),
                selected_result,
                after_selection,
            )
            normalized_descriptor = stage_file(
                directory,
                "normalized.json",
                selected_result.edit.structure.to_bytes(),
            )
        envelope = stage_file(directory, "response.json", response.model_dump_json().encode())
        output = EditOutput(envelope=envelope, normalized=normalized_descriptor)
        message = {"kind": "result", "output": output.model_dump(mode="json")}
    except ValueError as error:
        message = {"kind": "invalid", "message": str(error)[:2000]}
    except Exception:
        message = {
            "kind": "failed",
            "message": "Molecular computation failed; no edit was published.",
        }
    try:
        connection.send_bytes(_control_bytes(message))
    finally:
        connection.close()
