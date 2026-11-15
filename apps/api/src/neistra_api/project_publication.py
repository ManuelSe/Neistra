"""Project publication locking shared by ephemeral and durable calculations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from neistra_api.models import Project


def lock_project_publication(session: Session, project_id: str) -> None:
    """Acquire before authoritative reads; the caller owns commit or rollback."""
    connection = session.connection()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("BEGIN IMMEDIATE")
    else:
        session.execute(select(Project.id).where(Project.id == project_id).with_for_update())
