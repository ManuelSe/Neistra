"""Trusted typed producer for one ephemeral, complete contact response."""

from __future__ import annotations

import hashlib
import math
import os
from collections.abc import Iterable
from multiprocessing.connection import Connection
from pathlib import Path

from neistra_core.contacts import (
    Contact,
    ContactCapacityError,
    ContactGeometryError,
    ContactQueryError,
    close_contacts,
)
from neistra_core.molecular import NormalizedStructureV1

from neistra_api.contact_execution_data import (
    ContactCompletion,
    ContactRejection,
    ContactResponseDescriptor,
    ContactSnapshot,
)
from neistra_api.edit_execution_data import read_immutable_input
from neistra_api.schemas import ContactRead

CONTROL_BYTES = 4096


def write_contact_response(
    directory: Path,
    snapshot: ContactSnapshot,
    contacts: Iterable[Contact],
    atom_ids: set[int],
) -> ContactCompletion:
    """Validate and encode every row, admitting bytes before each owned-file write."""
    path = directory / "response.json"
    digest = hashlib.sha256()
    size = 0
    count = 0
    previous: tuple[float, int, int] | None = None
    pairs_seen: set[tuple[int, int]] = set()
    with path.open("xb") as stream:

        def write(data: bytes) -> None:
            nonlocal size
            if size + len(data) > snapshot.policy.max_response_bytes:
                raise ContactCapacityError("Contact response exceeds its byte budget")
            stream.write(data)
            digest.update(data)
            size += len(data)

        write(b"[")
        for contact in contacts:
            if count >= snapshot.policy.max_results:
                raise ContactCapacityError("Contact response exceeds its result budget")
            first, second = contact.atom_1_id, contact.atom_2_id
            if (
                type(first) is not int
                or type(second) is not int
                or first >= second
                or first not in atom_ids
                or second not in atom_ids
                or not math.isfinite(contact.distance)
                or not snapshot.minimum_distance <= contact.distance <= snapshot.cutoff
            ):
                raise ValueError("Contact producer returned an invalid row")
            key = (contact.distance, first, second)
            if (first, second) in pairs_seen or (previous is not None and key <= previous):
                raise ValueError("Contact producer returned duplicate or unsorted rows")
            row = ContactRead(
                atom_1={"structure_id": snapshot.entry_id, "atom_id": first},
                atom_2={"structure_id": snapshot.entry_id, "atom_id": second},
                distance=contact.distance,
            )
            encoded = row.model_dump_json().encode()
            write((b"," if count else b"") + encoded)
            count += 1
            previous = key
            pairs_seen.add((first, second))
        write(b"]")
        stream.flush()
        os.fsync(stream.fileno())
    return ContactCompletion(
        operation_id=snapshot.operation_id,
        project_id=snapshot.project_id,
        entry_id=snapshot.entry_id,
        artifact_id=snapshot.source.artifact_id,
        policy_key=snapshot.policy.key,
        count=count,
        response=ContactResponseDescriptor(size=size, sha256=digest.hexdigest()),
    )


def _send(connection: Connection, message: ContactCompletion | ContactRejection) -> None:
    data = message.model_dump_json().encode()
    if len(data) > CONTROL_BYTES:
        raise ValueError("Contact control message exceeds its transport budget")
    connection.send_bytes(data)


def run_contact_child(connection: Connection, directory: str, snapshot_json: bytes) -> None:
    """No database session, job, published artifact or project write enters this child."""
    try:
        snapshot = ContactSnapshot.model_validate_json(snapshot_json)
        try:
            data = read_immutable_input(Path(snapshot.data_root), snapshot.source)
            structure = NormalizedStructureV1.model_validate_json(data)
            del data
            if len(structure.atoms) != snapshot.declared_atom_count:
                raise ValueError("Current structure count does not match its captured source")
        except (OSError, ValueError):
            _send(
                connection,
                ContactRejection(
                    kind="input", message="The current structure could not be verified."
                ),
            )
            return
        contacts = close_contacts(
            structure,
            snapshot.cutoff,
            minimum_distance=snapshot.minimum_distance,
            limits=snapshot.policy.core_limits,
        )
        completion = write_contact_response(
            Path(directory), snapshot, contacts, {atom.id for atom in structure.atoms}
        )
        _send(connection, completion)
    except ContactCapacityError as error:
        _send(connection, ContactRejection(kind="capacity", message=str(error)[:240]))
    except ContactGeometryError as error:
        _send(connection, ContactRejection(kind="geometry", message=str(error)[:240]))
    except ContactQueryError as error:
        _send(connection, ContactRejection(kind="query", message=str(error)[:240]))
    except Exception:
        _send(
            connection,
            ContactRejection(
                kind="failed", message="Contact analysis failed; no complete result is available."
            ),
        )
    finally:
        connection.close()
