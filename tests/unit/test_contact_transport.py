from __future__ import annotations

import hashlib
import json
from multiprocessing import Pipe
from pathlib import Path

import pytest
from neistra_api.contact_execution_data import (
    ContactCompletion,
    ContactPolicy,
    ContactResponseDescriptor,
    ContactSnapshot,
)
from neistra_api.contact_execution_worker import run_contact_child, write_contact_response
from neistra_api.edit_execution_data import ImmutableEditInput, read_verified_file
from neistra_core.contacts import Contact, ContactCapacityError
from pydantic import ValidationError

from tests.unit.test_contacts import structure

ENTRY_ID = "33333333-3333-4333-8333-333333333333"
ATOM_IDS = {2, 17, 99}


def snapshot(root: Path, **policy_changes: object) -> ContactSnapshot:
    policy = ContactPolicy.model_validate(
        {
            "max_input_atoms": 3,
            "max_raw_visits": 9,
            "max_results": 3,
            "max_source_bytes": 4096,
            "max_response_bytes": 4096,
            **policy_changes,
        }
    )
    return ContactSnapshot(
        operation_id="11111111-1111-4111-8111-111111111111",
        project_id="22222222-2222-4222-8222-222222222222",
        entry_id=ENTRY_ID,
        declared_atom_count=3,
        source=ImmutableEditInput(
            artifact_id="44444444-4444-4444-8444-444444444444",
            relative_path="normalized.json",
            size=0,
            sha256=hashlib.sha256(b"").hexdigest(),
        ),
        data_root=str(root),
        cutoff=3.0,
        minimum_distance=0.0,
        policy=policy,
    )


def wire_rows() -> list[dict[str, object]]:
    return [
        {
            "atom_1": {"structure_id": ENTRY_ID, "atom_id": first},
            "atom_2": {"structure_id": ENTRY_ID, "atom_id": second},
            "distance": distance,
        }
        for first, second, distance in [(2, 17, 0.5), (17, 99, 1.25), (2, 99, 2.0)]
    ]


def wire_bytes() -> bytes:
    return json.dumps(wire_rows(), separators=(",", ":")).encode()


def complete_empty_receipt(source: ContactSnapshot) -> dict[str, object]:
    return {
        "kind": "result",
        "operation_id": source.operation_id,
        "project_id": source.project_id,
        "entry_id": source.entry_id,
        "artifact_id": source.source.artifact_id,
        "policy_key": source.policy.key,
        "count": 0,
        "response": {
            "filename": "response.json",
            "size": 2,
            "sha256": hashlib.sha256(b"[]").hexdigest(),
        },
    }


def test_actual_contact_wire_shape_bytes_digest_and_owner(tmp_path: Path) -> None:
    source = snapshot(tmp_path)
    rows = [Contact(2, 17, 0.5), Contact(17, 99, 1.25), Contact(2, 99, 2.0)]
    completion = write_contact_response(tmp_path, source, rows, ATOM_IDS)
    expected = wire_bytes()
    assert len(ENTRY_ID) == 36
    assert (tmp_path / "response.json").read_bytes() == expected
    assert json.loads(expected) == wire_rows()
    assert completion.count == 3
    assert completion.response.size == len(expected)
    assert completion.response.sha256 == hashlib.sha256(expected).hexdigest()
    completion.check_owner(source)
    assert read_verified_file(tmp_path, completion.response.file_descriptor()) == expected
    round_trip = ContactCompletion.model_validate_json(completion.model_dump_json())
    round_trip.check_owner(source)


def test_response_byte_budget_includes_commas_and_closing_bracket(tmp_path: Path) -> None:
    expected = wire_bytes()
    rows = [Contact(2, 17, 0.5), Contact(17, 99, 1.25), Contact(2, 99, 2.0)]
    exact = tmp_path / "exact"
    exact.mkdir()
    completion = write_contact_response(
        exact, snapshot(tmp_path, max_response_bytes=len(expected)), rows, ATOM_IDS
    )
    assert completion.response.size == len(expected)
    assert (exact / "response.json").read_bytes() == expected

    over = tmp_path / "one-byte-over"
    over.mkdir()
    with pytest.raises(ContactCapacityError, match="byte budget"):
        write_contact_response(
            over, snapshot(tmp_path, max_response_bytes=len(expected) - 1), rows, ATOM_IDS
        )
    # The framing byte is refused before its write, and no completion is returned.
    assert (over / "response.json").read_bytes() == expected[:-1]


def test_result_budget_exact_and_one_over_never_returns_completion(tmp_path: Path) -> None:
    rows = [Contact(2, 17, 0.5), Contact(17, 99, 1.25), Contact(2, 99, 2.0)]
    exact = tmp_path / "exact"
    exact.mkdir()
    assert write_contact_response(exact, snapshot(tmp_path), rows, ATOM_IDS).count == 3
    over = tmp_path / "over"
    over.mkdir()
    with pytest.raises(ContactCapacityError, match="result budget"):
        write_contact_response(over, snapshot(tmp_path, max_results=2), rows, ATOM_IDS)
    assert not (over / "response.json").read_bytes().endswith(b"]")


def test_empty_response_uses_exact_two_byte_budget(tmp_path: Path) -> None:
    completion = write_contact_response(
        tmp_path, snapshot(tmp_path, max_results=0, max_response_bytes=2), [], ATOM_IDS
    )
    assert completion.count == 0
    assert completion.response.size == 2
    assert (tmp_path / "response.json").read_bytes() == b"[]"


@pytest.mark.parametrize(
    "rows",
    [
        [Contact(2, 17, float("nan"))],
        [Contact(2, 17, float("inf"))],
        [Contact(2, 17, -1.0)],
        [Contact(2, 17, 4.0)],
        [Contact(2, 100, 1.0)],
        [Contact(17, 2, 1.0)],
        [Contact(2, 2, 1.0)],
        [Contact(True, 17, 1.0)],
        [Contact(2, 17, 1.0), Contact(2, 17, 1.0)],
        [Contact(2, 17, 1.0), Contact(2, 17, 2.0)],
        [Contact(2, 17, 2.0), Contact(17, 99, 1.0)],
        [Contact(2, 99, 1.0), Contact(2, 17, 1.0)],
    ],
    ids=[
        "nan",
        "infinity",
        "negative",
        "beyond-cutoff",
        "unknown-id",
        "reversed",
        "same-atom",
        "bool-id",
        "duplicate-row",
        "duplicate-pair-different-distance",
        "unsorted-distance",
        "unsorted-tie",
    ],
)
def test_invalid_producer_rows_wholly_refuse(tmp_path: Path, rows: list[Contact]) -> None:
    with pytest.raises(ValueError):
        write_contact_response(tmp_path, snapshot(tmp_path), rows, ATOM_IDS)
    data = (tmp_path / "response.json").read_bytes()
    assert not data.endswith(b"]")


@pytest.mark.parametrize("budget", ["bytes", "results"])
def test_child_sends_rejection_and_never_partial_completion(tmp_path: Path, budget: str) -> None:
    store = tmp_path / "store"
    operation = tmp_path / "operation"
    store.mkdir()
    operation.mkdir()
    data = structure().to_bytes()
    (store / "normalized.json").write_bytes(data)
    source = snapshot(
        store, **({"max_response_bytes": 2} if budget == "bytes" else {"max_results": 0})
    )
    source = source.model_copy(
        update={
            "source": source.source.model_copy(
                update={
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
        }
    )
    receiver, sender = Pipe(duplex=False)
    try:
        run_contact_child(sender, str(operation), source.model_dump_json().encode())
        message = json.loads(receiver.recv_bytes(4096))
        assert message["kind"] == "capacity"
        assert "response" not in message and "count" not in message
        with pytest.raises(EOFError):
            receiver.recv_bytes(4096)
    finally:
        receiver.close()
        sender.close()


@pytest.mark.parametrize("count", [True, False, -1, 1.0])
def test_completion_count_is_a_strict_non_boolean_integer(tmp_path: Path, count: object) -> None:
    payload = complete_empty_receipt(snapshot(tmp_path))
    payload["count"] = count
    with pytest.raises(ValidationError):
        ContactCompletion.model_validate_json(json.dumps(payload))


@pytest.mark.parametrize("field", ["operation_id", "project_id", "entry_id", "artifact_id"])
def test_completion_rejects_wrong_owner_and_non_string_owner(tmp_path: Path, field: str) -> None:
    source = snapshot(tmp_path)
    payload = complete_empty_receipt(source)
    payload[field] = "different-owner"
    with pytest.raises(ValueError, match="captured input"):
        ContactCompletion.model_validate_json(json.dumps(payload)).check_owner(source)
    payload[field] = True
    with pytest.raises(ValidationError):
        ContactCompletion.model_validate_json(json.dumps(payload))


@pytest.mark.parametrize("filename", ["request.json", "../response.json", "/response.json", True])
def test_contact_response_has_only_its_literal_owned_filename(filename: object) -> None:
    with pytest.raises(ValidationError):
        ContactResponseDescriptor.model_validate(
            {
                "filename": filename,
                "size": 2,
                "sha256": hashlib.sha256(b"[]").hexdigest(),
            }
        )


@pytest.mark.parametrize("size", [True, False, 1, -1, 2.0])
def test_contact_response_size_is_strict_and_includes_framing(size: object) -> None:
    with pytest.raises(ValidationError):
        ContactResponseDescriptor.model_validate(
            {
                "size": size,
                "sha256": hashlib.sha256(b"[]").hexdigest(),
            }
        )


@pytest.mark.parametrize(
    "field",
    [
        "max_input_atoms",
        "max_raw_visits",
        "max_results",
        "max_source_bytes",
        "max_response_bytes",
        "timeout_seconds",
        "max_worker_rss_bytes",
        "cleanup_grace_seconds",
    ],
)
def test_policy_caps_do_not_coerce_booleans(field: str) -> None:
    with pytest.raises(ValidationError):
        ContactPolicy.model_validate_json(json.dumps({field: True}))


@pytest.mark.parametrize("field", ["max_input_atoms", "max_raw_visits", "max_results"])
def test_integer_policy_caps_reject_float_coercion(field: str) -> None:
    with pytest.raises(ValidationError):
        ContactPolicy.model_validate_json(json.dumps({field: 3.0}))


def test_policy_rejects_an_unqualified_implementation_version() -> None:
    with pytest.raises(ValidationError):
        ContactPolicy.model_validate_json(json.dumps({"implementation": "contacts-stream-v1"}))


@pytest.mark.parametrize("target", ["policy", "snapshot", "completion", "response"])
def test_wire_models_refuse_unrecognized_fields(tmp_path: Path, target: str) -> None:
    source = snapshot(tmp_path)
    models = {
        "policy": (ContactPolicy, source.policy.model_dump(mode="json")),
        "snapshot": (ContactSnapshot, source.model_dump(mode="json")),
        "completion": (ContactCompletion, complete_empty_receipt(source)),
        "response": (
            ContactResponseDescriptor,
            {
                "size": 2,
                "sha256": hashlib.sha256(b"[]").hexdigest(),
            },
        ),
    }
    model, payload = models[target]
    payload["unrecognized_transport_field"] = "not part of the captured protocol"
    with pytest.raises(ValidationError):
        model.model_validate_json(json.dumps(payload))


def test_policy_key_and_completion_caps_are_bound_to_the_captured_request(tmp_path: Path) -> None:
    source = snapshot(tmp_path)
    payload = complete_empty_receipt(source)
    ContactCompletion.model_validate_json(json.dumps(payload)).check_owner(source)
    for field, value in [
        ("policy_key", "0" * 64),
        ("count", source.policy.max_results + 1),
    ]:
        changed = {**payload, field: value}
        with pytest.raises(ValueError):
            ContactCompletion.model_validate_json(json.dumps(changed)).check_owner(source)
    changed = {
        **payload,
        "response": {
            "filename": "response.json",
            "size": source.policy.max_response_bytes + 1,
            "sha256": hashlib.sha256(b"[]").hexdigest(),
        },
    }
    with pytest.raises(ValueError, match="response-byte budget"):
        ContactCompletion.model_validate_json(json.dumps(changed)).check_owner(source)
    different_policy = source.policy.model_copy(update={"max_response_bytes": 4095})
    assert different_policy.key != source.policy.key
    with pytest.raises(ValueError, match="captured input"):
        ContactCompletion.model_validate_json(json.dumps(payload)).check_owner(
            source.model_copy(update={"policy": different_policy})
        )


def test_snapshot_admits_exact_source_and_count_but_refuses_one_over(tmp_path: Path) -> None:
    payload = snapshot(tmp_path).model_dump(mode="json")
    payload["source"]["size"] = 4096
    ContactSnapshot.model_validate_json(json.dumps(payload))
    payload["source"]["size"] = 4097
    with pytest.raises(ValidationError, match="source-byte budget"):
        ContactSnapshot.model_validate_json(json.dumps(payload))
    payload = snapshot(tmp_path).model_dump(mode="json")
    payload["declared_atom_count"] = 4
    with pytest.raises(ValidationError, match="atom budget"):
        ContactSnapshot.model_validate_json(json.dumps(payload))
    payload["declared_atom_count"] = True
    with pytest.raises(ValidationError):
        ContactSnapshot.model_validate_json(json.dumps(payload))
