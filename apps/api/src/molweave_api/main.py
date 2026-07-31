from __future__ import annotations

import asyncio
import multiprocessing
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from multiprocessing.connection import Connection
from typing import Literal, cast
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
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from molweave_core.adapters import AdapterError
from molweave_core.contacts import close_contacts
from molweave_core.export_policy import (
    ExportFilters,
    ExportInput,
    ExportPolicyError,
    PreparedExport,
    prepare_export,
)
from molweave_core.jobs import PluginRegistry
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker
from uuid6 import uuid7

from molweave_api.archive_service import (
    ArchiveBuildInput,
    ArchiveLimits,
    ArchiveValidationError,
    PreparedArchive,
    ProjectArchiveService,
    build_project_archive,
    read_project_archive,
)
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
    safe_display_filename,
)
from molweave_api.job_service import (
    InvalidJobOperationError,
    JobConflictError,
    JobNotFoundError,
    JobResultNotFoundError,
    JobService,
)
from molweave_api.ligand_edit_service import LigandEditService
from molweave_api.models import Artifact, Job, JobEvent
from molweave_api.project_service import (
    EntryNotFoundError,
    HistoryUnavailableError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.protein_edit_service import ProteinEditService
from molweave_api.schemas import (
    ArchiveExportCreate,
    ArchiveExportRead,
    ArchiveImportRead,
    ArtifactRead,
    BatchExportCreate,
    BatchExportRead,
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
    JobCreate,
    JobDefinitionRead,
    JobEventRead,
    JobInputRead,
    JobInputRoleRead,
    JobRead,
    JobResultArtifactRead,
    JobResultImportCreate,
    JobResultImportRead,
    JobResultRoleRead,
    LigandEditCreate,
    LigandEditRead,
    MeasurementCreate,
    MeasurementUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    ProteinEditCreate,
    ProteinEditRead,
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


def _prepare_export_child(
    connection: Connection,
    inputs: list[ExportInput],
    format_name: str,
    mode: str,
    filters: ExportFilters,
    bundle_name: str,
) -> None:
    try:
        connection.send(
            (
                "result",
                prepare_export(
                    inputs,
                    format_name=format_name,
                    mode=cast(Literal["separate", "multi_record"], mode),
                    filters=filters,
                    bundle_name=bundle_name,
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
    except ExportPolicyError as error:
        connection.send(("policy_error", {"code": error.code, "message": error.message}))
    except BaseException as error:
        connection.send(("worker_error", f"{type(error).__name__}: {error}"))
    finally:
        connection.close()


async def _prepare_export_cancellable(
    inputs: list[ExportInput],
    *,
    format_name: str,
    mode: str,
    filters: ExportFilters,
    bundle_name: str,
    is_cancelled: Callable[[], bool],
) -> PreparedExport:
    receiver, sender = multiprocessing.Pipe(duplex=False)
    process = multiprocessing.Process(
        target=_prepare_export_child,
        args=(sender, inputs, format_name, mode, filters, bundle_name),
        daemon=True,
    )
    process.start()
    sender.close()
    try:
        while process.is_alive() and not receiver.poll():
            if is_cancelled():
                process.terminate()
                process.join(timeout=2)
                raise _error(499, "export_cancelled", "Export was cancelled before publication.")
            await asyncio.sleep(0.025)
        if not receiver.poll():
            raise _error(
                422,
                "export_worker_failed",
                "The export worker stopped without returning a result.",
            )
        kind, payload = receiver.recv()
        process.join(timeout=2)
        if kind == "adapter_error":
            raise _adapter_http_error(AdapterError(**payload))
        if kind == "policy_error":
            error = ExportPolicyError(**payload)
            raise _error(422, error.code, error.message)
        if kind == "worker_error":
            raise _error(422, "export_worker_failed", f"Export failed: {payload}")
        return cast(PreparedExport, payload)
    finally:
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)
        receiver.close()


def _build_archive_child(
    connection: Connection,
    build: ArchiveBuildInput,
) -> None:
    try:
        connection.send(("result", build_project_archive(build)))
    except ArchiveValidationError as error:
        connection.send(
            (
                "archive_error",
                {
                    "code": error.code,
                    "message": error.message,
                    "status_code": error.status_code,
                },
            )
        )
    except BaseException as error:
        connection.send(("worker_error", f"{type(error).__name__}: {error}"))
    finally:
        connection.close()


def _read_archive_child(
    connection: Connection,
    data: bytes,
    limits: ArchiveLimits,
) -> None:
    try:
        connection.send(("result", read_project_archive(data, limits)))
    except ArchiveValidationError as error:
        connection.send(
            (
                "archive_error",
                {
                    "code": error.code,
                    "message": error.message,
                    "status_code": error.status_code,
                },
            )
        )
    except BaseException as error:
        connection.send(("worker_error", f"{type(error).__name__}: {error}"))
    finally:
        connection.close()


async def _archive_child_cancellable(
    target: Callable[..., None],
    args: tuple[object, ...],
    *,
    is_cancelled: Callable[[], bool],
    cancelled_code: str,
    cancelled_message: str,
) -> object:
    receiver, sender = multiprocessing.Pipe(duplex=False)
    process = multiprocessing.Process(
        target=target,
        args=(sender, *args),
        daemon=True,
    )
    process.start()
    sender.close()
    try:
        while process.is_alive() and not receiver.poll():
            if is_cancelled():
                process.terminate()
                process.join(timeout=2)
                raise _error(499, cancelled_code, cancelled_message)
            await asyncio.sleep(0.025)
        if not receiver.poll():
            raise _error(
                422,
                "archive_worker_failed",
                "The archive worker stopped without returning a result.",
            )
        kind, payload = receiver.recv()
        process.join(timeout=2)
        if kind == "archive_error":
            raise _archive_http_error(ArchiveValidationError(**payload))
        if kind == "worker_error":
            raise _error(422, "archive_worker_failed", f"Archive operation failed: {payload}")
        return payload
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


def _archive_http_error(error: ArchiveValidationError) -> HTTPException:
    return _error(error.status_code, error.code, error.message)


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
    job_registry = PluginRegistry.load(
        allowlist=app_settings.job_plugin_allowlist,
        configured_targets=app_settings.job_plugin_targets,
        discover_installed=True,
    )

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
    app.state.job_registry = job_registry
    app.state.cancelled_imports = {}
    app.state.cancelled_exports = {}
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

    @router.get("/jobs/definitions", response_model=list[JobDefinitionRead])
    async def job_definitions() -> list[JobDefinitionRead]:
        return [
            JobDefinitionRead(
                plugin_name=registered.plugin_name,
                job_type=registered.definition.job_type,
                implementation_version=registered.definition.implementation_version,
                label=registered.definition.label,
                description=registered.definition.description,
                parameter_schema=registered.definition.parameter_schema,
                input_roles=[
                    JobInputRoleRead(
                        role=role.role,
                        label=role.label,
                        minimum=role.minimum,
                        maximum=role.maximum,
                        structure_types=list(role.structure_types),
                    )
                    for role in registered.definition.input_roles
                ],
                result_roles=[
                    JobResultRoleRead(
                        role=role.role,
                        label=role.label,
                        media_types=list(role.media_types),
                        importable_structure=role.importable_structure,
                    )
                    for role in registered.definition.result_roles
                ],
            )
            for registered in job_registry.definitions()
        ]

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

    @router.post(
        "/projects/{project_id}/jobs",
        response_model=JobRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def submit_job(
        project_id: str,
        payload: JobCreate,
        session: Session = Depends(session_dependency),
    ) -> JobRead:
        job = _call(
            lambda: JobService(session, app_settings, job_registry).submit(
                project_id,
                payload.job_type,
                payload.parameters,
                [item.model_dump(mode="json") for item in payload.inputs],
            )
        )
        return _job_read(session, app_settings, job)

    @router.get("/projects/{project_id}/jobs", response_model=list[JobRead])
    async def list_jobs(
        project_id: str,
        session: Session = Depends(session_dependency),
    ) -> list[JobRead]:
        jobs = _call(
            lambda: JobService(session, app_settings, job_registry).list_project(project_id)
        )
        return [_job_read(session, app_settings, job) for job in jobs]

    @router.get("/jobs/{job_id}", response_model=JobRead)
    async def get_job(
        job_id: str,
        session: Session = Depends(session_dependency),
    ) -> JobRead:
        job = _call(lambda: JobService(session, app_settings, job_registry).get(job_id))
        return _job_read(session, app_settings, job)

    @router.post("/jobs/{job_id}/cancel", response_model=JobRead)
    async def cancel_job(
        job_id: str,
        session: Session = Depends(session_dependency),
    ) -> JobRead:
        job = _call(lambda: JobService(session, app_settings, job_registry).cancel(job_id))
        return _job_read(session, app_settings, job)

    @router.get("/jobs/{job_id}/events", response_model=list[JobEventRead])
    async def job_events(
        job_id: str,
        after_sequence: int = 0,
        session: Session = Depends(session_dependency),
    ) -> list[JobEventRead]:
        events = _call(
            lambda: JobService(session, app_settings, job_registry).events(
                job_id, max(0, after_sequence)
            )
        )
        return [JobEventRead.model_validate(event) for event in events]

    @router.post(
        "/jobs/{job_id}/results/{result_id}/import",
        response_model=JobResultImportRead,
    )
    async def import_job_result(
        job_id: str,
        result_id: str,
        payload: JobResultImportCreate,
        session: Session = Depends(session_dependency),
    ) -> JobResultImportRead:
        project, entry_id = _call(
            lambda: JobService(session, app_settings, job_registry).import_result(
                job_id,
                result_id,
                payload.expected_revision,
                payload.name,
            )
        )
        return JobResultImportRead(project=project, imported_entry_id=entry_id)

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
            lambda: _service(session).apply_scene(project_id, scene_id, payload.expected_revision)
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
            lambda: _service(session).delete_scene(project_id, scene_id, expected_revision)
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
            lambda: CoordinateService(session, app_settings).transform(project_id, payload)
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
            lambda: LigandEditService(session, app_settings).edit(project_id, entry_id, payload)
        )

    @router.post(
        "/projects/{project_id}/entries/{entry_id}/protein-edits",
        response_model=ProteinEditRead,
    )
    async def edit_protein(
        project_id: str,
        entry_id: str,
        payload: ProteinEditCreate,
        session: Session = Depends(session_dependency),
    ) -> ProteinEditRead:
        return _call(
            lambda: ProteinEditService(session, app_settings).edit(project_id, entry_id, payload)
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
            lambda: CoordinateService(session, app_settings).superpose(project_id, payload)
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

    @router.post(
        "/projects/{project_id}/exports",
        response_model=BatchExportRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def export_project_entries(
        project_id: str,
        payload: BatchExportCreate,
        request: Request,
        session: Session = Depends(session_dependency),
    ) -> BatchExportRead:
        service = ImportExportService(session, app_settings)
        try:
            sources = _call(
                lambda: service.batch_sources(
                    project_id,
                    scope=payload.scope,
                    entry_ids=payload.entry_ids,
                )
            )
            prepared = await _prepare_export_cancellable(
                list(sources.inputs),
                format_name=payload.format,
                mode=payload.mode,
                filters=ExportFilters(
                    include_hydrogens=payload.include_hydrogens,
                    include_waters=payload.include_waters,
                    include_ions=payload.include_ions,
                ),
                bundle_name=sources.project_name,
                is_cancelled=lambda: payload.operation_id in app.state.cancelled_exports,
            )
            if (
                payload.operation_id in app.state.cancelled_exports
                or await request.is_disconnected()
            ):
                raise _error(
                    499,
                    "export_cancelled",
                    "Export was cancelled before publication.",
                )
            return _call(
                lambda: service.publish_batch_export(
                    prepared,
                    scope=payload.scope,
                    source_revision=sources.source_revision,
                    acknowledge_losses=payload.acknowledge_losses,
                )
            )
        finally:
            app.state.cancelled_exports.pop(payload.operation_id, None)

    @router.post("/exports/{operation_id}/cancel")
    async def cancel_export(operation_id: str) -> dict[str, str]:
        if not operation_id or len(operation_id) > 64:
            raise _error(422, "invalid_export_operation", "Invalid export operation ID.")
        now = time.monotonic()
        app.state.cancelled_exports = {
            key: created_at
            for key, created_at in app.state.cancelled_exports.items()
            if now - created_at < 3600
        }
        app.state.cancelled_exports[operation_id] = now
        return {"status": "cancelled"}

    @router.post(
        "/projects/{project_id}/archive",
        response_model=ArchiveExportRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def export_project_archive(
        project_id: str,
        payload: ArchiveExportCreate,
        request: Request,
        session: Session = Depends(session_dependency),
    ) -> ArchiveExportRead:
        service = ProjectArchiveService(session, app_settings)
        try:
            source = _call(lambda: service.export_source(project_id))
            prepared = cast(
                bytes,
                await _archive_child_cancellable(
                    _build_archive_child,
                    (source,),
                    is_cancelled=lambda: payload.operation_id in app.state.cancelled_exports,
                    cancelled_code="export_cancelled",
                    cancelled_message=("Project archive export was cancelled before publication."),
                ),
            )
            if (
                payload.operation_id in app.state.cancelled_exports
                or await request.is_disconnected()
            ):
                raise _error(
                    499,
                    "export_cancelled",
                    "Project archive export was cancelled before publication.",
                )
            return _call(
                lambda: service.publish_export(
                    source.manifest.name,
                    source.manifest.source_revision,
                    prepared,
                )
            )
        finally:
            app.state.cancelled_exports.pop(payload.operation_id, None)

    @router.post(
        "/projects/import-archive",
        response_model=ArchiveImportRead,
        status_code=status.HTTP_201_CREATED,
    )
    async def import_project_archive(
        request: Request,
        file: UploadFile = File(...),
        operation_id: str | None = Form(None, max_length=64),
        session: Session = Depends(session_dependency),
    ) -> ArchiveImportRead:
        import_id = operation_id or str(uuid7())
        filename = safe_display_filename(file.filename or "project.molweave.zip")
        if not filename.casefold().endswith(".molweave.zip"):
            raise _error(
                422,
                "unsupported_project_archive_extension",
                "Project archives must use the .molweave.zip extension.",
            )
        chunks: list[bytes] = []
        archive_size = 0
        while chunk := await file.read(1024 * 1024):
            if await request.is_disconnected():
                raise _error(499, "import_cancelled", "Archive import was cancelled.")
            archive_size += len(chunk)
            if archive_size > app_settings.max_archive_upload_bytes:
                raise _error(
                    413,
                    "archive_upload_too_large",
                    (
                        "Archive exceeds the compressed limit of "
                        f"{app_settings.max_archive_upload_bytes} bytes."
                    ),
                )
            chunks.append(chunk)
        try:
            prepared = cast(
                PreparedArchive,
                await _archive_child_cancellable(
                    _read_archive_child,
                    (
                        b"".join(chunks),
                        ArchiveLimits.from_settings(app_settings),
                    ),
                    is_cancelled=lambda: import_id in app.state.cancelled_imports,
                    cancelled_code="import_cancelled",
                    cancelled_message="Archive import was cancelled before commit.",
                ),
            )
            if import_id in app.state.cancelled_imports or await request.is_disconnected():
                raise _error(
                    499,
                    "import_cancelled",
                    "Archive import was cancelled before commit.",
                )
            return _call(
                lambda: ProjectArchiveService(session, app_settings).import_archive(prepared)
            )
        finally:
            app.state.cancelled_imports.pop(import_id, None)

    @router.get("/artifacts/{artifact_id}")
    async def get_artifact(
        artifact_id: str,
        filename: str | None = None,
        session: Session = Depends(session_dependency),
    ) -> Response:
        service = ImportExportService(session, app_settings)
        artifact, data = _call(lambda: service.artifact(artifact_id))
        return _download_response(
            service.artifacts.response(artifact, filename=filename),
            data,
        )

    app.include_router(router)

    @app.websocket("/ws/jobs")
    async def jobs_websocket(
        websocket: WebSocket,
        project_id: str,
        after_event_id: int = 0,
    ) -> None:
        await websocket.accept()
        cursor = max(0, after_event_id)
        try:
            while True:
                with factory() as session:
                    events = list(
                        session.scalars(
                            select(JobEvent)
                            .join(Job, Job.id == JobEvent.job_id)
                            .where(
                                Job.project_id == project_id,
                                JobEvent.id > cursor,
                            )
                            .order_by(JobEvent.id)
                            .limit(100)
                        ).all()
                    )
                    for event in events:
                        await websocket.send_json(
                            JobEventRead.model_validate(event).model_dump(mode="json")
                        )
                        cursor = event.id
                await asyncio.sleep(0.1)
        except WebSocketDisconnect:
            return

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
    except ExportPolicyError as error:
        raise _error(422, error.code, error.message) from error
    except ArchiveValidationError as error:
        raise _archive_http_error(error) from error
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
                "reports": [report.model_dump(mode="json") for report in error.reports],
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
    except JobNotFoundError as error:
        raise _error(404, "job_not_found", f"Job {error} was not found") from error
    except JobResultNotFoundError as error:
        raise _error(404, "job_result_not_found", f"Job result {error} was not found") from error
    except JobConflictError as error:
        raise _error(409, "job_conflict", str(error)) from error
    except InvalidJobOperationError as error:
        raise _error(422, "invalid_job_operation", str(error)) from error


def _job_read(session: Session, settings: Settings, job: Job) -> JobRead:
    artifact_service = ImportExportService(session, settings).artifacts
    results: list[JobResultArtifactRead] = []
    for result in sorted(job.results, key=lambda item: item.created_at):
        artifact = session.get(Artifact, result.artifact_id)
        if artifact is None:
            raise ArtifactNotFoundError(result.artifact_id)
        results.append(
            JobResultArtifactRead(
                id=result.id,
                role=result.role,
                artifact=artifact_service.response(artifact, filename=result.filename),
                filename=result.filename,
                media_type=result.media_type,
                metadata=result.metadata_json,
                importable_structure=result.importable_structure,
                imported_entry_ids=result.imported_entry_ids,
                created_at=result.created_at,
            )
        )
    return JobRead(
        id=job.id,
        project_id=job.project_id,
        plugin_name=job.plugin_name,
        job_type=job.job_type,
        implementation_version=job.implementation_version,
        status=job.status,
        parameters=job.parameters,
        progress=job.progress,
        status_message=job.status_message,
        result_values=job.result_values,
        warnings=job.warnings,
        error=job.error,
        provenance=job.provenance,
        cancellation_requested=job.cancellation_requested,
        inputs=[
            JobInputRead.model_validate(item)
            for item in sorted(job.inputs, key=lambda value: value.ordinal)
        ],
        results=results,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        modified_at=job.modified_at,
    )


app = create_app()
