from __future__ import annotations

import copy
import hashlib
import io
from pathlib import Path

import pytest
from neistra_api.import_export import ArtifactIntegrityError, ArtifactService
from neistra_api.ligand_property_identity import raw_source_fingerprint
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.artifacts import LocalArtifactStore
from rdkit import Chem


def raw() -> dict:
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CCO"), filename="source.smi", format_name="smiles"
    )
    return structure.model_dump(mode="json")


def test_only_validated_coordinate_values_are_excluded_from_raw_proof() -> None:
    original = raw()
    initial = raw_source_fingerprint(original, [1, 2, 3], None)
    changed = copy.deepcopy(original)
    for atom in changed["atoms"]:
        atom["coordinates"] = [coordinate + 17.5 for coordinate in atom["coordinates"]]
    for conformer in changed["conformers"]:
        conformer["coordinates"] = [
            [coordinate + 17.5 for coordinate in point] for point in conformer["coordinates"]
        ]
    assert raw_source_fingerprint(changed, [1, 2, 3], None) == initial
    assert original == raw()


@pytest.mark.parametrize(
    "change",
    [
        "title",
        "atom_id",
        "charge",
        "stereo",
        "bond",
        "source",
        "metadata",
        "inference",
        "active",
        "membership",
        "original",
    ],
)
def test_noncoordinate_changes_cannot_reuse_a_raw_source_proof(change: str) -> None:
    original = raw()
    changed = copy.deepcopy(original)
    membership = [1, 2, 3]
    identity = None
    if change == "title":
        changed["title"] += " changed"
    elif change == "atom_id":
        changed["atoms"][0]["id"] = 40
    elif change == "charge":
        changed["atoms"][0]["formal_charge"] = 1
    elif change == "stereo":
        changed["atoms"][0]["stereo"] = "R"
    elif change == "bond":
        changed["bonds"][0]["inferred"] = True
    elif change == "source":
        changed["source"]["record_index"] += 1
    elif change == "metadata":
        changed["metadata"]["future_semantics"] = {"unknown": True}
    elif change == "inference":
        changed["atoms"][0]["inferred_fields"].append("formal_charge")
    elif change == "active":
        changed["active_conformer_id"] += 1
    elif change == "membership":
        membership = [1, 2]
    else:
        identity = {"sha256": hashlib.sha256(b"different original").hexdigest(), "size": 18}
    assert raw_source_fingerprint(changed, membership, identity) != raw_source_fingerprint(
        original, [1, 2, 3], None
    )


@pytest.mark.parametrize(
    "value", [[float("nan"), 0, 0], [float("inf"), 0, 0], [True, 0, 0], [0, 0], None]
)
def test_invalid_coordinates_never_match_an_existing_proof(value: object) -> None:
    changed = raw()
    changed["atoms"][0]["coordinates"] = value
    with pytest.raises(ValueError):
        raw_source_fingerprint(changed, [1, 2, 3], None)


def test_library_or_policy_change_invalidates_raw_proof(monkeypatch: pytest.MonkeyPatch) -> None:
    import neistra_api.ligand_property_identity as module

    initial = raw_source_fingerprint(raw(), [1, 2, 3], None)
    monkeypatch.setattr(module, "LIBRARY_VERSION", "changed-library")
    assert raw_source_fingerprint(raw(), [1, 2, 3], None) != initial
    monkeypatch.setattr(module, "LIBRARY_VERSION", Chem.rdBase.rdkitVersion)
    monkeypatch.setattr(module, "POLICY_VERSION", "changed-policy")
    assert raw_source_fingerprint(raw(), [1, 2, 3], None) != initial


def test_bounded_artifact_read_limits_actual_read_even_when_file_grows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = LocalArtifactStore(tmp_path)
    record = store.put_bytes(b"12345678")
    target = store.root / record.relative_path
    actual_open = Path.open
    reads = []

    class GrowingFile(io.BytesIO):
        def read(self, size: int = -1) -> bytes:
            reads.append(size)
            return super().read(size)

    def replaced(path: Path, *args, **kwargs):
        return GrowingFile(b"x" * 1024) if path == target else actual_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", replaced)
    with pytest.raises(ValueError, match="bounded"):
        store.read_bytes_bounded(record.relative_path, 8)
    assert reads == [9]
    for invalid in (0, -1, True, 1.5):
        with pytest.raises(ValueError):
            store.read_bytes_bounded(record.relative_path, invalid)
    with pytest.raises(ValueError):
        store.read_bytes_bounded("../outside", 8)


def test_verified_bounded_api_artifact_reader_rejects_growth(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    with client.app.state.session_factory() as session:
        store = LocalArtifactStore(client.app.state.settings.data_dir)
        service = ArtifactService(session, store)
        record = service.publish(b"12345678", "original", "application/octet-stream")
        session.commit()
        original_read = store.read_bytes_bounded
        limits = []

        def grown(path: str, maximum: int) -> bytes:
            limits.append(maximum)
            target = store.root / path
            target.write_bytes(b"1234567890123456")
            return original_read(path, maximum)

        monkeypatch.setattr(store, "read_bytes_bounded", grown)
        with pytest.raises(ArtifactIntegrityError):
            service.read_bounded_verified_bytes(record.id, 8)
        assert limits == [8]
