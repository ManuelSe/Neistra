from __future__ import annotations

from pathlib import Path

import pytest
from neistra_api.database import Base, create_database_engine, create_session_factory
from neistra_api.ligand_property_cache import LigandPropertyCache, validate_report
from neistra_api.models import LigandPropertyContent
from neistra_core.adapters.rdkit_common import mol_to_normalized
from neistra_core.ligand_properties import calculate_properties
from neistra_core.ligand_properties.models import DescriptorReport, DescriptorValue
from rdkit import Chem
from sqlalchemy import func, select


def report() -> DescriptorReport:
    molecule = Chem.MolFromSmiles("CCO")
    structure = mol_to_normalized(molecule, filename="ethanol.smi", format_name="smiles")
    return calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=b"CCO\n"
    )


@pytest.fixture
def cache(tmp_path: Path):
    engine = create_database_engine(f"sqlite:///{tmp_path}/cache.db")
    Base.metadata.create_all(engine)
    with create_session_factory(engine)() as session:
        yield LigandPropertyCache(session, tmp_path)
    engine.dispose()


@pytest.mark.parametrize(
    "corruption", ["unknown", "wrong_version", "float_count", "boolean", "nonfinite", "order"]
)
def test_malformed_reports_cannot_enter_content_cache(
    cache: LigandPropertyCache, corruption: str
) -> None:
    candidate = report()
    if corruption == "unknown":
        candidate = candidate.model_copy(
            update={
                "coverage": ("invented",),
                "values": (DescriptorValue(descriptor_id="invented", status="ready", value=1),),
            }
        )
    elif corruption == "wrong_version":
        candidate = candidate.model_copy(update={"library_version": "unqualified-version"})
    elif corruption in {"float_count", "boolean", "nonfinite"}:
        value = (
            1.3
            if corruption == "float_count"
            else True
            if corruption == "boolean"
            else float("inf")
        )
        changed = DescriptorValue.model_construct(
            descriptor_id="heavy_atom_count", status="ready", value=value
        )
        candidate = candidate.model_copy(
            update={"coverage": ("heavy_atom_count",), "values": (changed,)}
        )
    else:
        candidate = candidate.model_copy(
            update={
                "coverage": tuple(reversed(candidate.coverage)),
                "values": tuple(reversed(candidate.values)),
            }
        )
    with pytest.raises(ValueError):
        cache.publish(candidate)
    assert cache.session.scalar(select(func.count()).select_from(LigandPropertyContent)) == 0


def test_partial_reports_merge_only_matching_qualified_content(cache: LigandPropertyCache) -> None:
    full = report()
    first = full.model_copy(update={"coverage": ("molecular_weight",), "values": full.values[:1]})
    second = full.model_copy(update={"coverage": ("heavy_atom_count",), "values": full.values[1:2]})
    cache.publish(first)
    cache.publish(second)
    merged = cache.read(full.input_hash)
    assert merged is not None
    assert merged.coverage == ("molecular_weight", "heavy_atom_count")
    assert merged.get_value("heavy_atom_count").value == 3
    assert validate_report(merged) == merged


def test_corrupt_path_and_symlink_never_modify_external_file(
    cache: LigandPropertyCache, tmp_path: Path
) -> None:
    candidate = report()
    record = cache.publish(candidate)
    external = tmp_path / "external-user-file"
    external.write_bytes(b"preserve user bytes")
    record.relative_path = "../../external-user-file"
    cache.session.flush()
    assert cache.read(candidate.input_hash) is None
    assert external.read_bytes() == b"preserve user bytes"
    record = cache.publish(candidate)
    owned_path = cache.store.root / record.relative_path
    owned_path.unlink()
    owned_path.symlink_to(external)
    assert cache.read(candidate.input_hash) is None
    assert external.read_bytes() == b"preserve user bytes"
    assert owned_path.is_symlink()
    with pytest.raises(ValueError):
        cache.publish(candidate)
    assert external.read_bytes() == b"preserve user bytes"


def test_owned_orphan_cleanup_preserves_global_artifacts_and_live_content(
    cache: LigandPropertyCache, tmp_path: Path
) -> None:
    from neistra_core.artifacts import LocalArtifactStore

    current = report()
    live = cache.publish(current)
    cache.session.commit()
    owned = cache.store.put_bytes(b"interrupted descriptor publication")
    global_store = LocalArtifactStore(tmp_path)
    original = global_store.put_bytes(b"interrupted descriptor publication")
    assert owned.sha256 == original.sha256
    assert cache.cleanup_orphans() == 1
    assert (cache.store.root / live.relative_path).exists()
    assert not (cache.store.root / owned.relative_path).exists()
    assert global_store.read_bytes(original.relative_path) == b"interrupted descriptor publication"


def test_content_capacity_evicts_only_derived_rows_and_bytes(
    cache: LigandPropertyCache, monkeypatch: pytest.MonkeyPatch
) -> None:
    import neistra_api.ligand_property_cache as module

    monkeypatch.setattr(module, "MAX_CONTENT_RECORDS", 2)
    hashes = []
    for smiles in ("C", "CC", "CCO"):
        molecule = Chem.MolFromSmiles(smiles)
        structure = mol_to_normalized(molecule, filename="source.smi", format_name="smiles")
        outcome = calculate_properties(
            structure, [atom.id for atom in structure.atoms], original_bytes=f"{smiles}\n".encode()
        )
        cache.publish(outcome)
        hashes.append(outcome.input_hash)
    assert cache.session.scalar(select(func.count()).select_from(LigandPropertyContent)) == 2
    assert cache.read(hashes[0]) is None
    assert cache.read(hashes[-1]) is not None
    cache.session.commit()
    cache.cleanup_retired()
    assert len(list(cache.store.artifact_root.glob("*/*"))) == 2


def test_source_proof_index_cannot_substitute_another_sealed_report(
    cache: LigandPropertyCache,
) -> None:
    from neistra_api.models import LigandPropertyProof

    first = report()
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CC"), filename="other.smi", format_name="smiles"
    )
    second = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=b"CC\n"
    )
    proof_a, proof_b = "a" * 64, "b" * 64
    cache.publish(first, semantic_fingerprints=(proof_a,))
    cache.publish(second, semantic_fingerprints=(proof_b,))
    index = cache.session.get(LigandPropertyProof, proof_a)
    index.input_hash = second.input_hash
    cache.session.flush()
    assert cache.read_proof(proof_a) is None
    assert cache.read_proof(proof_b).input_hash == second.input_hash
    assert cache.read(first.input_hash) is not None
    cache.publish(first, semantic_fingerprints=(proof_a,))
    assert cache.read_proof(proof_a).input_hash == first.input_hash


def test_coverage_merge_retains_joint_sealed_proofs_and_bounds_index(
    cache: LigandPropertyCache, monkeypatch: pytest.MonkeyPatch
) -> None:
    import neistra_api.ligand_property_cache as module
    from neistra_api.models import LigandPropertyProof

    full = report()
    first = full.model_copy(update={"coverage": ("molecular_weight",), "values": full.values[:1]})
    second = full.model_copy(update={"coverage": ("heavy_atom_count",), "values": full.values[1:2]})
    monkeypatch.setattr(module, "MAX_PROOFS_PER_CONTENT", 2)
    cache.publish(first, semantic_fingerprints=("a" * 64,))
    cache.publish(second, semantic_fingerprints=("b" * 64,))
    assert cache.read_proof("a" * 64).coverage == ("molecular_weight", "heavy_atom_count")
    assert cache.read_proof("b" * 64).coverage == ("molecular_weight", "heavy_atom_count")
    before = cache.session.get(LigandPropertyContent, full.input_hash).sha256
    with pytest.raises(ValueError, match="source proof capacity"):
        cache.publish(second, semantic_fingerprints=("c" * 64,))
    assert cache.session.get(LigandPropertyContent, full.input_hash).sha256 == before
    assert cache.read_proof("a" * 64) is not None
    assert cache.read_proof("b" * 64) is not None
    assert cache.read_proof("c" * 64) is None
    assert cache.session.scalar(select(func.count()).select_from(LigandPropertyProof)) == 2


def test_failed_publication_rollback_preserves_old_valid_blob_and_discards_victims(
    cache: LigandPropertyCache,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_cache as module

    first = report()
    old = cache.publish(first)
    cache.session.commit()
    path = cache.store.root / old.relative_path
    valid_bytes = path.read_bytes()
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CC"), filename="other.smi", format_name="smiles"
    )
    second = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=b"CC\n"
    )
    monkeypatch.setattr(module, "MAX_CONTENT_RECORDS", 1)
    cache.publish(second)
    assert cache._retired and path.read_bytes() == valid_bytes
    cache.session.rollback()
    assert not cache._retired
    assert cache.read(first.input_hash) is not None
    assert path.read_bytes() == valid_bytes


def test_retired_blob_readopted_by_another_committed_publisher_is_preserved(
    cache: LigandPropertyCache,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import neistra_api.ligand_property_cache as module
    from sqlalchemy.orm import Session

    first = report()
    old = cache.publish(first)
    cache.session.commit()
    path = cache.store.root / old.relative_path
    valid_bytes = path.read_bytes()
    structure = mol_to_normalized(
        Chem.MolFromSmiles("CC"), filename="other.smi", format_name="smiles"
    )
    second = calculate_properties(
        structure, [atom.id for atom in structure.atoms], original_bytes=b"CC\n"
    )
    monkeypatch.setattr(module, "MAX_CONTENT_RECORDS", 1)
    cache.publish(second)
    cache.session.commit()
    with Session(cache.session.bind, expire_on_commit=False) as another:
        publisher = LigandPropertyCache(another, cache.store.root.parents[1])
        publisher.publish(first)
        another.commit()
        assert path.read_bytes() == valid_bytes
        assert cache.cleanup_retired() == 0
        assert path.read_bytes() == valid_bytes
        publisher.cleanup_retired()
        assert publisher.read(first.input_hash) is not None


def test_stale_failed_read_does_not_delete_a_just_repaired_envelope(
    cache: LigandPropertyCache,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = report()
    record = cache.publish(current)
    cache.session.commit()
    path = cache.store.root / record.relative_path
    valid = path.read_bytes()
    path.write_bytes(b"invalid")
    original = cache._envelope
    calls = []

    def repaired_after_bad_read(record):
        calls.append(True)
        if len(calls) == 1:
            try:
                return original(record)
            except ValueError:
                path.write_bytes(valid)  # Another owner repaired before our serialized recheck.
                raise
        return original(record)

    monkeypatch.setattr(cache, "_envelope", repaired_after_bad_read)
    assert cache.read(current.input_hash) == current
    assert len(calls) == 2 and path.read_bytes() == valid


def test_1000_joint_source_proofs_fit_existing_encoded_envelope_budget(
    cache: LigandPropertyCache,
) -> None:
    import hashlib

    current = report()
    fingerprints = tuple(
        hashlib.sha256(f"source-{index}".encode()).hexdigest() for index in range(1000)
    )
    row = cache.publish(current, semantic_fingerprints=fingerprints)
    assert row.size < 128 * 1024
    assert cache.read_associated(current.input_hash, fingerprints[0]) == current
    assert cache.read_associated(current.input_hash, fingerprints[-1]) == current
    # This is primitive encoded-capacity evidence, not a 1,000-entry workflow/latency claim.
