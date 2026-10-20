"""Strict, best-effort original-file evidence shared by edits and calculations."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from molweave_core.adapters.base import ImportOptions
from molweave_core.adapters.defaults import create_default_registry
from molweave_core.hydrogen_protection import AtomProtection, protection_facts, recover_protection
from molweave_core.molecular import NormalizedStructureV1

from molweave_api.import_export import ArtifactService
from molweave_api.models import StructureEntry
from molweave_api.settings import Settings


@dataclass(frozen=True)
class VerifiedOriginalIdentity:
    structure: NormalizedStructureV1
    original_artifact_id: str
    sha256: str
    atoms: tuple[AtomProtection, ...]


def recover_original_identity(
    entry: StructureEntry,
    before: NormalizedStructureV1,
    artifacts: ArtifactService,
    settings: Settings,
    *,
    atom_ids: set[int] | None = None,
) -> VerifiedOriginalIdentity | None:
    try:
        existing = protection_facts(before)
        needed = {a.id for a in before.atoms} if atom_ids is None else atom_ids
        missing = needed - existing.keys()
        if not missing or not entry.original_artifact_id:
            return None
        record = artifacts.get(entry.original_artifact_id)
        if record.size > settings.max_structure_file_bytes:
            return None
        _, data = artifacts.read(record.id)
        if len(data) != record.size or hashlib.sha256(data).hexdigest() != record.sha256:
            return None
        parsed = (
            create_default_registry()
            .for_format(before.source.format)
            .parse(
                data, before.source.filename, ImportOptions(generate_3d=False, infer_bonds=False)
            )
        )
        for original in parsed.structures:
            if original.source.record_index != before.source.record_index:
                continue
            if len(original.atoms) > settings.atom_hard_limit:
                return None
            restored = recover_protection(before, original, atom_ids=atom_ids)
            facts = protection_facts(restored)
            recovered = tuple(facts[i] for i in sorted(missing) if i in facts)
            if recovered:
                return VerifiedOriginalIdentity(restored, record.id, record.sha256, recovered)
            return None
    except (ValueError, RuntimeError, OverflowError, OSError, LookupError):
        # An absent/invalid original never proves ordinary identity. Existing
        # unknown, protected, conflicting and malformed facts remain authoritative.
        return None
    return None
