"""Ephemeral analysis admission and cancellable execution; no viewer export."""

from __future__ import annotations

import asyncio
import multiprocessing
import time
from collections.abc import Callable
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from molweave_core.artifacts import LocalArtifactStore
from molweave_core.interactions import (
    AnalysisInput,
    InteractionInputIdentity,
    InteractionLimitError,
    InteractionResult,
    analyze_interactions,
)
from molweave_core.molecular import NormalizedStructureV1
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from molweave_api.models import Artifact, Project, StructureEntry
from molweave_api.settings import Settings


class InteractionQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputs: list[InteractionInputIdentity] = Field(min_length=1, max_length=1000)
    profile: Literal["interaction-v1"]
    frame: Literal["workspace-cartesian"]

    @model_validator(mode="after")
    def unique_entries(self) -> InteractionQuery:
        if len({item.entry_id for item in self.inputs}) != len(self.inputs):
            raise ValueError("Interaction entries must be unique")
        return self


def _analyze_child(
    connection: Connection, data_dir: Path, sources: list[tuple[InteractionInputIdentity, str]]
) -> None:
    try:
        store = LocalArtifactStore(data_dir)
        inputs = [
            AnalysisInput(identity, NormalizedStructureV1.from_bytes(store.read_bytes(path)))
            for identity, path in sources
        ]
        connection.send(("result", analyze_interactions(inputs)))
    except InteractionLimitError as error:
        connection.send(("limit", str(error)))
    except (ValueError, OSError) as error:
        connection.send(("invalid", str(error)))
    except Exception:
        connection.send(("failed", "Interaction analysis failed; no complete result is available."))
    finally:
        connection.close()


def interaction_router(settings: Settings, session_dependency: Callable[..., object]) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    active = False

    @router.post("/projects/{project_id}/interactions", response_model=InteractionResult)
    async def interactions(
        project_id: str,
        payload: InteractionQuery,
        request: Request,
        session: Session = Depends(session_dependency),
    ) -> InteractionResult:
        nonlocal active
        if active:
            raise HTTPException(
                429,
                detail={
                    "code": "interactions_busy",
                    "message": "Another interaction analysis is running. Try again shortly.",
                },
            )
        if session.get(Project, project_id) is None:
            raise HTTPException(404, detail="Project not found")
        sources: list[tuple[InteractionInputIdentity, str]] = []
        atoms = 0
        for identity in payload.inputs:
            entry = session.get(StructureEntry, identity.entry_id)
            if entry is None or entry.project_id != project_id:
                raise HTTPException(404, detail="Interaction entry not found in project")
            if entry.current_artifact_id != identity.artifact_id:
                raise HTTPException(
                    409,
                    detail={
                        "code": "stale_interaction_input",
                        "message": "Structure changed; refresh interaction inputs.",
                    },
                )
            artifact = session.get(Artifact, identity.artifact_id)
            if artifact is None:
                raise HTTPException(404, detail="Normalized artifact unavailable")
            atoms += entry.atom_count
            sources.append((identity, artifact.relative_path))
        if atoms > 100_000:
            raise HTTPException(
                413,
                detail={
                    "code": "interaction_limit",
                    "message": "Interaction atom limit exceeded (100,000).",
                },
            )
        context = multiprocessing.get_context("spawn")
        receiver, sender = context.Pipe(duplex=False)
        process = context.Process(
            target=_analyze_child, args=(sender, settings.data_dir, sources), daemon=True
        )
        active = True  # No await between admission check and acquisition.
        started = False
        try:
            process.start()
            started = True
            sender.close()
            deadline = time.monotonic() + 30
            while True:
                if await request.is_disconnected():
                    raise HTTPException(499, detail="Interaction request cancelled")
                if time.monotonic() >= deadline:
                    raise HTTPException(
                        504,
                        detail={
                            "code": "interaction_timeout",
                            "message": "Interaction analysis exceeded its 30-second deadline.",
                        },
                    )
                if receiver.poll():
                    try:
                        kind, value = receiver.recv()
                    except EOFError as error:
                        raise HTTPException(
                            500, detail="Interaction analysis exited without a result"
                        ) from error
                    if kind == "result":
                        return InteractionResult.model_validate(value)
                    raise HTTPException(
                        413 if kind == "limit" else 422 if kind == "invalid" else 500,
                        detail={"code": f"interaction_{kind}", "message": value},
                    )
                if not process.is_alive():
                    raise HTTPException(500, detail="Interaction analysis exited without a result")
                await asyncio.sleep(0.025)
        finally:
            async def cleanup() -> None:
                nonlocal active
                try:
                    if started:
                        if process.is_alive():
                            process.terminate()
                        await asyncio.to_thread(process.join, 2)
                        if process.is_alive():
                            process.kill()
                            await asyncio.to_thread(process.join)
                        process.close()
                finally:
                    receiver.close()
                    sender.close()
                    active = False

            # A second task cancellation must not interrupt reaping/admission cleanup.
            await asyncio.shield(cleanup())

    return router
