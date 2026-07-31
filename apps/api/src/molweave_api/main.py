from __future__ import annotations

import asyncio
import multiprocessing
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from multiprocessing.connection import Connection
from typing import cast
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from molweave_core.adapters import AdapterError
from molweave_core.contacts import close_contacts
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker
from uuid6 import uuid7

from molweave_api.coordinate_service import CoordinateService
from molweave_api.database import Base, create_database_engine, create_session_factory
from molweave_api.import_export import (
    ArtifactNotFoundError,
    ImportExportService,
    ImportLimitError,
    LossAcknowledgementRequiredError,
    PreparedFile,
    StructureUnavailableError,
    UploadPayload,
    prepare_uploads,
)
from molweave_api.ligand_edit_service import LigandEditService
from molweave_api.project_service import (
    EntryNotFoundError,
    HistoryUnavailableError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import (
    ArtifactRead,
    ContactQuery,
    ContactRead,
    CoordinateTransformCreate,
    EntryRevisionRequest,
    EntryToggle,
    EntryUpdate,
    ExportCreate,
    ExportRead,
    FormatRead,
    GroupCreate,
    ImportRead,
    LigandEditCreate,
    LigandEditRead,
    MeasurementCreate,
    MeasurementUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    RevisionRequest,
    SavedSelectionCreate,
    SceneCreate,
    StructureRead,
    SuperpositionCreate,
    SuperpositionRead,
    TestEntryCreate,
    ViewerSettingsUpdate,
)
from molweave_api.settings import Settings


def _prepare_import_child(
    connection: Connection,
    settings: Settings,
    uploads: list[UploadPayload],
    generate_3d: bool,
    infer_bonds: bool,
) -> None:
    try:
        connection.send(
            (
                "result",
                prepare_uploads(
                    settings,
                    uploads,
                    generate_3d=generate_3d,
                    infer_bonds=infer_bonds,
                ),
            )
        )
    except AdapterError as error:
        connection.send(
            (
                "adapter_error",
                {
                    "code": error.code,
                    "message": error.message,
                    "filename": error.filename,
                    "operation": error.operation,
                    "record_index": error.record_index,
                },
            )
        )
    except ImportLimitError as error:
        connection.send(
            (
                "limit_error",
                {
                    "code": error.code,
                    "message": error.message,
                    "filename": error.filename,
                },
            )
        )
    except BaseException as error:
        connection.send(("worker_error", f"{type(error).__name__}: {error}"))
    finally:
        connection.close()


async def _prepare_cancellable(
    settings: Settings,
    uploads: list[UploadPayload],
    generate_3d: bool,
    infer_bonds: bool,
    is_cancelled: Callable[[], bool],
) -> list[PreparedFile]:
    receiver, sender = multiprocessing.Pipe(duplex=False)
    process = multiprocessing.Process(
        target=_prepare_import_child,
        args=(sender, settings, uploads, generate_3d, infer_bonds),
        daemon=True,
    )
    process.start()
    sender.close()
    try:
        while process.is_alive() and not receiver.poll():
            if is_cancelled():
                process.terminate()
                process.join(timeout=2)
                raise _error(499, "import_cancelled", "Import was cancelled before commit.")
            await asyncio.sleep(0.025)
        if not receiver.poll():
            raise _error(
                422,
                "import_worker_failed",
                "The molecular parser stopped without returning a result.",
            )
        kind, payload = receiver.recv()
        process.join(timeout=2)
        if kind == "adapter_error":
            raise AdapterError(**payload)
        if kind == "limit_error":
            raise ImportLimitError(**payload)
        if kind == "worker_error":
            raise _error(
                422,
                "import_worker_failed",
                f"The molecular parser failed: {payload}",
            )
        return cast(list[PreparedFile], payload)
    finally:
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)
        receiver.close()


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _adapter_http_error(error: AdapterError) -> HTTPException:
    detail: dict[str, object] = {
        "code": error.code,
        "message": error.message,
        "filename": error.filename,
        "operation": error.operation,
    }
    if error.record_index is not None:
        detail["record_index"] = error.record_index
    return HTTPException(status_code=422, detail=detail)


def _limit_http_error(error: ImportLimitError) -> HTTPException:
    detail: dict[str, object] = {"code": error.code, "message": error.message}
    if error.filename is not None:
        detail["filename"] = error.filename
    return HTTPException(status_code=413, detail=detail)


async def _session(factory: sessionmaker[Session]) -> AsyncIterator[Session]:
    with factory() as session:
        yield session


def _service(session: Session) -> ProjectService:
    return ProjectService(session)


def _download_response(artifact: ArtifactRead, data: bytes) -> Response:
    filename = quote(artifact.filename, safe="")
    return Response(
        content=data,
        media_type=artifact.media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or Settings.from_env()
    app_settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_database_engine(app_settings.database_url)
    factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if app_settings.auto_create_schema:
            Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="MolWeave API",
        version="0.1.0",
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/docs",
    )
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.session_factory = factory
    app.state.cancelled_imports = {}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def session_dependency() -> AsyncIterator[Session]:
        async for session in _session(factory):
            yield session

    router = APIRouter(prefix="/api/v1")

    @router.get("/health")
    async def health(session: Session = Depends(session_dependency)) -> dict[str, str]:
        session.execute(text("SELECT 1"))
        return {"status": "ok"}

    @router.get("/formats", response_model=list[FormatRead])
    async def formats(session: Session = Depends(session_dependency)) -> list[FormatRead]:
        return ImportExportService(session, app_settings).formats()

    @router.get("/projects", response_model=list[ProjectListItem])
    async def list_projects(
        session: Session = Depends(session_dependency),
    ) -> list[ProjectListItem]:
        return _service(session).list_projects()

    @router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
    async def create_project(
        payload: ProjectCreate, session: Session = Depends(session_dependency)
    ) -> ProjectRead:
        return _service(session).create_project(payload.name, payload.description)

    @router.get("/projects/{project_id}", response_model=ProjectRead)
    async def get_project(
        project_id: str, session: Session = Depends(session_dependency)
    ) -> ProjectRead:
        return _call(lambda: _service(session).get_project(project_id))

    @router.patch("/projects/{project_id}", response_model=ProjectRead)
    async def update_project(
        project_id: str,
        payload: ProjectUpdate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).update_project(
                project_id,
                payload.expected_revision,
                payload.name,
                payload.description,
            )
        )

    @router.post("/projects/{project_id}/save", response_model=ProjectRead)
    async def save_project(
        project_id: str,
        payload: RevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(lambda: _service(session).save(project_id, payload.expected_revision))

    @router.post("/projects/{project_id}/history/undo", response_model=ProjectRead)
    async def undo(
        project_id: str,
        payload: RevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(lambda: _service(session).undo(project_id, payload.expected_revision))

    @router.post("/projects/{project_id}/history/redo", response_model=ProjectRead)
    async def redo(
        project_id: str,
        payload: RevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(lambda: _service(session).redo(project_id, payload.expected_revision))

    @router.patch("/projects/{project_id}/entries/{entry_id}", response_model=ProjectRead)
    async def update_entry(
        project_id: str,
        entry_id: str,
        payload: EntryUpdate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).update_entry(
                project_id,
                entry_id,
                payload.expected_revision,
                {
                    "name": payload.name.strip(),
                    "description": payload.description,
                    "user_metadata": payload.user_metadata,
                },
            )
        )

    @router.post("/projects/{project_id}/entries/{entry_id}/duplicate", response_model=ProjectRead)
    async def duplicate_entry(
        project_id: str,
        entry_id: str,
        payload: EntryRevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).duplicate_entry(
                project_id, entry_id, payload.expected_revision
            )
        )

    @router.post("/projects/{project_id}/entries/{entry_id}/visibility", response_model=ProjectRead)
    async def set_visibility(
        project_id: str,
        entry_id: str,
        payload: EntryToggle,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).set_entry_value(
                project_id, entry_id, payload.expected_revision, "visible", payload.value
            )
        )

    @router.post("/projects/{project_id}/entries/{entry_id}/lock", response_model=ProjectRead)
    async def set_lock(
        project_id: str,
        entry_id: str,
        payload: EntryToggle,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).set_entry_value(
                project_id, entry_id, payload.expected_revision, "locked", payload.value
            )
        )

    @router.post("/projects/{project_id}/entries/{entry_id}/isolate", response_model=ProjectRead)
    async def isolate_entry(
        project_id: str,
        entry_id: str,
        payload: EntryRevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).isolate_entry(project_id, entry_id, payload.expected_revision)
        )

    @router.put(
        "/projects/{project_id}/entries/{entry_id}/viewer-settings",
        response_model=ProjectRead,
    )
    async def update_viewer_settings(
        project_id: str,
        entry_id: str,
        payload: ViewerSettingsUpdate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).update_viewer_settings(
                project_id,
                entry_id,
                payload.expected_revision,
                payload.settings,
            )
        )

    @router.delete("/projects/{project_id}/entries/{entry_id}", response_model=ProjectRead)
    async def delete_entry(
        project_id: str,
        entry_id: str,
        expected_revision: int,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).delete_entry(project_id, entry_id, expected_revision)
        )

    @router.post("/projects/{project_id}/groups", response_model=ProjectRead)
    async def create_group(
        project_id: str,
        payload: GroupCreate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).create_group(
                project_id,
                payload.expected_revision,
                payload.name,
                payload.entry_ids,
            )
        )

    @router.post(
        "/projects/{project_id}/selections",
        response_model=ProjectRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_saved_selection(
        project_id: str,
        payload: SavedSelectionCreate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).create_saved_selection(
                project_id,
                payload.expected_revision,
                payload.name,
                payload.selection,
            )
        )

    @router.delete(
        "/projects/{project_id}/selections/{selection_id}",
        response_model=ProjectRead,
    )
    async def delete_saved_selection(
        project_id: str,
        selection_id: str,
        expected_revision: int,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).delete_saved_selection(
                project_id,
                selection_id,
                expected_revision,
            )
        )

    @router.post(
        "/projects/{project_id}/measurements",
        response_model=ProjectRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_measurement(
        project_id: str,
        payload: MeasurementCreate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).create_measurement(
                project_id,
                payload.expected_revision,
                payload.name,
                payload.kind,
                [item.model_dump(mode="json") for item in payload.atom_references],
            )
        )

    @router.patch(
        "/projects/{project_id}/measurements/{measurement_id}",
        response_model=ProjectRead,
    )
    async def update_measurement(
        project_id: str,
        measurement_id: str,
        payload: MeasurementUpdate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).update_measurement(
                project_id,
                measurement_id,
                payload.expected_revision,
                payload.name,
                payload.visible,
            )
        )

    @router.delete(
        "/projects/{project_id}/measurements/{measurement_id}",
        response_model=ProjectRead,
    )
    async def delete_measurement(
        project_id: str,
        measurement_id: str,
        expected_revision: int,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).delete_measurement(
                project_id, measurement_id, expected_revision
            )
        )

    @router.post(
        "/projects/{project_id}/scenes",
        response_model=ProjectRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_scene(
        project_id: str,
        payload: SceneCreate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).create_scene(
                project_id,
                payload.expected_revision,
                payload.name,
                payload.camera.model_dump(mode="json"),
                payload.selection,
            )
        )

    @router.post(
        "/projects/{project_id}/scenes/{scene_id}/apply",
        response_model=ProjectRead,
    )
    async def apply_scene(
        project_id: str,
        scene_id: str,
        payload: RevisionRequest,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).apply_scene(
                project_id, scene_id, payload.expected_revision
            )
        )

    @router.delete(
        "/projects/{project_id}/scenes/{scene_id}",
        response_model=ProjectRead,
    )
    async def delete_scene(
        project_id: str,
        scene_id: str,
        expected_revision: int,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        return _call(
            lambda: _service(session).delete_scene(
                project_id, scene_id, expected_revision
            )
        )

    @router.post(
        "/projects/{project_id}/contacts",
        response_model=list[ContactRead],
    )
    async def contacts(
        project_id: str,
        payload: ContactQuery,
        session: Session = Depends(session_dependency),
    ) -> list[ContactRead]:
        structure = _call(
            lambda: ImportExportService(session, app_settings).structure(
                project_id, payload.entry_id
            )
        ).structure
        return [
            ContactRead(
                atom_1={
                    "structure_id": payload.entry_id,
                    "atom_id": contact.atom_1_id,
                },
                atom_2={
                    "structure_id": payload.entry_id,
                    "atom_id": contact.atom_2_id,
                },
                distance=contact.distance,
            )
            for contact in close_contacts(
                structure, payload.cutoff, minimum_distance=payload.minimum_distance
            )
        ]

    @router.post(
        "/projects/{project_id}/entries/{entry_id}/transform",
        response_model=ProjectRead,
    )
    async def transform_coordinates(
        project_id: str,
        entry_id: str,
        payload: CoordinateTransformCreate,
        session: Session = Depends(session_dependency),
    ) -> ProjectRead:
        if payload.entry_id != entry_id:
            raise _error(
                422,
                "invalid_project_operation",
                "Transform entry ID must match the route entry",
            )
        return _call(
            lambda: CoordinateService(session, app_settings).transform(
                project_id, payload
            )
        )

    @router.post(
        "/projects/{project_id}/entries/{entry_id}/ligand-edits",
        response_model=LigandEditRead,
    )
    async def edit_ligand(
        project_id: str,
        entry_id: str,
        payload: LigandEditCreate,
        session: Session = Depends(session_dependency),
    ) -> LigandEditRead:
        return _call(
            lambda: LigandEditService(session, app_settings).edit(
                project_id, entry_id, payload
            )
        )

    @router.post(
        "/projects/{project_id}/superpositions",
        response_model=SuperpositionRead,
    )
    async def superpose_coordinates(
        project_id: str,
        payload: SuperpositionCreate,
        session: Session = Depends(session_dependency),
    ) -> SuperpositionRead:
        return _call(
            lambda: CoordinateService(session, app_settings).superpose(
                project_id, payload
            )
        )

    @router.post(
        "/projects/{project_id}/imports",
        response_model=ImportRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def import_structures(
        project_id: str,
        request: Request,
        files: list[UploadFile] = File(...),
        expected_revision: int = Form(..., ge=0),
        generate_3d: bool = Form(True),
        infer_bonds: bool = Form(True),
        operation_id: str | None = Form(None, max_length=64),
        session: Session = Depends(session_dependency),
    ) -> ImportRead:
        import_id = operation_id or str(uuid7())
        uploads: list[UploadPayload] = []
        aggregate_size = 0
        for upload in files:
            chunks: list[bytes] = []
            file_size = 0
            while chunk := await upload.read(1024 * 1024):
                if await request.is_disconnected():
                    raise _error(499, "import_cancelled", "Import was cancelled before commit.")
                file_size += len(chunk)
                aggregate_size += len(chunk)
                if file_size > app_settings.max_structure_file_bytes:
                    raise _error(
                        413,
                        "structure_file_too_large",
                        (
                            f"{upload.filename or 'structure'} exceeds the per-file limit "
                            f"of {app_settings.max_structure_file_bytes} bytes."
                        ),
                    )
                if aggregate_size > app_settings.max_upload_request_bytes:
                    raise _error(
                        413,
                        "aggregate_upload_too_large",
                        (
                            "The upload exceeds the aggregate limit of "
                            f"{app_settings.max_upload_request_bytes} bytes."
                        ),
                    )
                chunks.append(chunk)
            uploads.append(
                UploadPayload(
                    filename=upload.filename or "structure",
                    data=b"".join(chunks),
                    media_type=upload.content_type,
                )
            )
        service = ImportExportService(session, app_settings)
        try:
            try:
                prepared = await _prepare_cancellable(
                    app_settings,
                    uploads,
                    generate_3d,
                    infer_bonds,
                    lambda: import_id in app.state.cancelled_imports,
                )
            except AdapterError as error:
                raise _adapter_http_error(error) from error
            except ImportLimitError as error:
                raise _limit_http_error(error) from error
            if import_id in app.state.cancelled_imports or await request.is_disconnected():
                raise _error(499, "import_cancelled", "Import was cancelled before commit.")
            return _call(lambda: service.commit_import(project_id, expected_revision, prepared))
        finally:
            app.state.cancelled_imports.pop(import_id, None)

    @router.post("/imports/{operation_id}/cancel")
    async def cancel_import(operation_id: str) -> dict[str, str]:
        if not operation_id or len(operation_id) > 64:
            raise _error(422, "invalid_import_operation", "Invalid import operation ID.")
        now = time.monotonic()
        app.state.cancelled_imports = {
            key: created_at
            for key, created_at in app.state.cancelled_imports.items()
            if now - created_at < 3600
        }
        app.state.cancelled_imports[operation_id] = now
        return {"status": "cancelled"}

    @router.get(
        "/projects/{project_id}/entries/{entry_id}/structure",
        response_model=StructureRead,
    )
    async def get_structure(
        project_id: str,
        entry_id: str,
        session: Session = Depends(session_dependency),
    ) -> StructureRead:
        return _call(
            lambda: ImportExportService(session, app_settings).structure(project_id, entry_id)
        )

    @router.get("/projects/{project_id}/entries/{entry_id}/original")
    async def get_original(
        project_id: str,
        entry_id: str,
        session: Session = Depends(session_dependency),
    ) -> Response:
        service = ImportExportService(session, app_settings)
        artifact, data = _call(lambda: service.original(project_id, entry_id))
        return _download_response(service.artifacts.response(artifact), data)

    @router.post(
        "/projects/{project_id}/entries/{entry_id}/exports",
        response_model=ExportRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def export_structure(
        project_id: str,
        entry_id: str,
        payload: ExportCreate,
        session: Session = Depends(session_dependency),
    ) -> ExportRead:
        return _call(
            lambda: ImportExportService(session, app_settings).export(
                project_id,
                entry_id,
                payload.format,
                acknowledge_losses=payload.acknowledge_losses,
            )
        )

    @router.get("/artifacts/{artifact_id}")
    async def get_artifact(
        artifact_id: str,
        session: Session = Depends(session_dependency),
    ) -> Response:
        service = ImportExportService(session, app_settings)
        artifact, data = _call(lambda: service.artifact(artifact_id))
        return _download_response(service.artifacts.response(artifact), data)

    app.include_router(router)

    if app_settings.enable_test_routes:
        testing = APIRouter(prefix="/api/v1/testing")

        @testing.post("/projects/{project_id}/entries", status_code=status.HTTP_201_CREATED)
        async def seed_entry(
            project_id: str,
            payload: TestEntryCreate,
            session: Session = Depends(session_dependency),
        ) -> dict[str, str]:
            entry = _call(
                lambda: _service(session).seed_entry(
                    project_id, payload.name, payload.structure_type
                )
            )
            return {"id": entry.id}

        app.include_router(testing)

    return app


def _call[ResultT](operation: Callable[[], ResultT]) -> ResultT:
    try:
        return operation()
    except ProjectNotFoundError as error:
        raise _error(404, "project_not_found", f"Project {error} was not found") from error
    except EntryNotFoundError as error:
        raise _error(404, "entry_not_found", f"Entry {error} was not found") from error
    except RevisionConflictError as error:
        raise _error(
            409,
            "revision_conflict",
            f"Project changed; current revision is {error.current_revision}",
        ) from error
    except HistoryUnavailableError as error:
        raise _error(409, "history_unavailable", str(error)) from error
    except InvalidProjectOperationError as error:
        raise _error(422, "invalid_project_operation", str(error)) from error
    except AdapterError as error:
        raise _adapter_http_error(error) from error
    except ImportLimitError as error:
        raise _limit_http_error(error) from error
    except LossAcknowledgementRequiredError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "export_loss_acknowledgement_required",
                "message": str(error),
                "warnings": [warning.model_dump(mode="json") for warning in error.warnings],
            },
        ) from error
    except ArtifactNotFoundError as error:
        raise _error(404, "artifact_not_found", f"Artifact {error} was not found") from error
    except StructureUnavailableError as error:
        raise _error(
            409,
            "structure_unavailable",
            f"Entry {error} does not have molecular data",
        ) from error


app = create_app()
