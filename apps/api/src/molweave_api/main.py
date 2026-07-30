from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from molweave_api.database import Base, create_database_engine, create_session_factory
from molweave_api.project_service import (
    EntryNotFoundError,
    HistoryUnavailableError,
    InvalidProjectOperationError,
    ProjectNotFoundError,
    ProjectService,
    RevisionConflictError,
)
from molweave_api.schemas import (
    EntryRevisionRequest,
    EntryToggle,
    EntryUpdate,
    GroupCreate,
    ProjectCreate,
    ProjectListItem,
    ProjectRead,
    ProjectUpdate,
    RevisionRequest,
    TestEntryCreate,
)
from molweave_api.settings import Settings


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


async def _session(factory: sessionmaker[Session]) -> AsyncIterator[Session]:
    with factory() as session:
        yield session


def _service(session: Session) -> ProjectService:
    return ProjectService(session)


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


app = create_app()
