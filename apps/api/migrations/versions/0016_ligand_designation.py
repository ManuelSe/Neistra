"""Add exact ligand designation and an explicit older-reader storage boundary.

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op
from neistra_core.ligands.models import LigandDesignationV1

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT = LigandDesignationV1().model_dump(mode="json")


def _designation(value: Any, *, downgrade: bool) -> dict[str, Any]:
    parsed = LigandDesignationV1.model_validate(value).model_dump(mode="json")
    if downgrade and parsed != DEFAULT:
        raise RuntimeError("Cannot downgrade: retained ligand designation would be lost")
    return parsed


def _entry(value: Any, *, downgrade: bool) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Entry snapshot must be an object")
    result = deepcopy(value)
    parsed = _designation(result.get("ligand_designation", DEFAULT), downgrade=downgrade)
    if downgrade:
        result.pop("ligand_designation", None)
    else:
        result["ligand_designation"] = parsed
    return result


def _state(value: Any, *, downgrade: bool) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Checkpoint state must be an object")
    result = deepcopy(value)
    if "entries" in result:
        if not isinstance(result["entries"], list):
            raise ValueError("Checkpoint entries must be a list")
        result["entries"] = [_entry(entry, downgrade=downgrade) for entry in result["entries"]]
    result["schema_version"] = 2 if downgrade else 3
    return result


def _actions(value: Any, *, downgrade: bool) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(action, dict) for action in value):
        raise ValueError("History actions must be objects")
    result = deepcopy(value)
    for action in result:
        if action.get("kind") == "entry.create":
            state = action["entry"]
            if downgrade:
                action.pop("ligand_default_pending", None)
            elif "ligand_designation" not in state:
                action["ligand_default_pending"] = True
            action["entry"] = _entry(state, downgrade=downgrade)
        if action.get("kind") == "entry.ligand":
            _designation(action["designation"], downgrade=downgrade)
            if downgrade:
                raise RuntimeError("Cannot downgrade: retained ligand designation command")
        if action.get("kind") in {"entry.coordinates", "entry.molecule"}:
            if "ligand_designation" in action:
                parsed = _designation(action["ligand_designation"], downgrade=downgrade)
                if downgrade:
                    action.pop("ligand_designation")
                else:
                    action["ligand_designation"] = parsed
        values = action.get("values")
        if isinstance(values, dict) and "ligand_designation" in values:
            parsed = _designation(values["ligand_designation"], downgrade=downgrade)
            if downgrade:
                values.pop("ligand_designation")
            else:
                values["ligand_designation"] = parsed
    return result


def _prepare(*, downgrade: bool) -> tuple[list[Any], list[Any], list[Any]]:
    connection = op.get_bind()
    if downgrade and "projects" in sa.inspect(connection).get_table_names():
        raise RuntimeError("Cannot downgrade: an incompatible legacy projects table exists")
    projects = sa.table(
        "project_documents_v3" if downgrade else "projects",
        sa.column("id", sa.String()),
        sa.column("checkpoint_state", sa.JSON()),
    )
    commands = sa.table(
        "command_records",
        sa.column("id", sa.String()),
        sa.column("forward_actions", sa.JSON()),
        sa.column("inverse_actions", sa.JSON()),
    )
    # Validate every retained path before changing any row or issuing DDL.
    states = [
        (row.id, _state(row.checkpoint_state, downgrade=downgrade))
        for row in connection.execute(sa.select(projects))
    ]
    history = [
        (
            row.id,
            _actions(row.forward_actions, downgrade=downgrade),
            _actions(row.inverse_actions, downgrade=downgrade),
        )
        for row in connection.execute(sa.select(commands))
    ]
    live = []
    if downgrade:
        entries = sa.table(
            "structure_entries", sa.column("id", sa.String()),
            sa.column("ligand_designation", sa.JSON()),
        )
        live = [
            (row.id, _designation(row.ligand_designation, downgrade=True))
            for row in connection.execute(sa.select(entries))
        ]
    return states, history, live


def _write(states: list[Any], history: list[Any]) -> None:
    connection = op.get_bind()
    projects = sa.table(
        "project_documents_v3", sa.column("id", sa.String()),
        sa.column("checkpoint_state", sa.JSON()),
    )
    commands = sa.table(
        "command_records", sa.column("id", sa.String()),
        sa.column("forward_actions", sa.JSON()), sa.column("inverse_actions", sa.JSON()),
    )
    for identity, state in states:
        connection.execute(projects.update().where(projects.c.id == identity).values(
            checkpoint_state=state,
        ))
    for identity, forward, inverse in history:
        connection.execute(commands.update().where(commands.c.id == identity).values(
            forward_actions=forward, inverse_actions=inverse,
        ))


def upgrade() -> None:
    states, history, _ = _prepare(downgrade=False)
    op.rename_table("projects", "project_documents_v3")
    op.add_column("structure_entries", sa.Column(
        "ligand_designation", sa.JSON(), nullable=False,
        server_default=sa.text("'{}'"),
    ))
    entries = sa.table("structure_entries", sa.column("ligand_designation", sa.JSON()))
    op.get_bind().execute(entries.update().values(ligand_designation=DEFAULT))
    op.create_table(
        "ligand_depiction_cache",
        sa.Column("cache_key", sa.String(64), primary_key=True),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("artifact_id", sa.String(36), nullable=False),
        sa.Column("implementation", sa.String(80), nullable=False),
        sa.Column("library_version", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["artifact_id"], ["artifacts.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "ligand_depiction_bindings",
        sa.Column("request_key", sa.String(64), primary_key=True),
        sa.Column("cache_key", sa.String(64), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["cache_key"], ["ligand_depiction_cache.cache_key"], ondelete="CASCADE",
        ),
    )
    _write(states, history)


def downgrade() -> None:
    states, history, _ = _prepare(downgrade=True)
    _write(states, history)
    op.drop_table("ligand_depiction_bindings")
    op.drop_table("ligand_depiction_cache")
    op.drop_column("structure_entries", "ligand_designation")
    op.rename_table("project_documents_v3", "projects")
