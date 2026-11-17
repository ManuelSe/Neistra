"""Operation-local bounded source verification; no native molecular preparation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from neistra_api.artifact_errors import ArtifactIntegrityError, ArtifactNotFoundError
from neistra_api.import_export import NORMALIZED_MEDIA_TYPE
from neistra_api.ligand_property_identity import raw_source_fingerprint

if TYPE_CHECKING:
    from neistra_api.ligand_property_schemas import LigandPropertySource
    from neistra_api.ligand_property_service import LigandPropertyService
    from neistra_api.models import StructureEntry

SOURCE_VERIFICATION_BYTES = 64 * 1024 * 1024


class PropertySourceFailure(ValueError):
    def __init__(
        self, status: Literal["failed", "unavailable"], reason: str, *, capacity: bool = False
    ) -> None:
        self.status, self.reason, self.capacity = status, reason, capacity
        super().__init__(reason)


@dataclass(frozen=True)
class VerifiedPropertySource:
    fingerprint: str
    normalized: dict[str, Any]
    original: dict[str, Any] | None


class PropertySourceVerification:
    """A fresh memo per read, worker selection or publication, never a persistent trust cache."""

    def __init__(
        self,
        service: LigandPropertyService,
        *,
        budget: PropertySourceVerification | None = None,
    ) -> None:
        self.service = service
        self._budget = budget if budget is not None else self
        self._bytes: dict[tuple[Any, ...], bytes] = {}
        self._json: dict[tuple[Any, ...], dict[str, Any]] = {}
        self._fingerprints: dict[tuple[Any, ...], str] = {}
        self._proof_failures: dict[tuple[Any, ...], str] = {}
        self._failures: dict[tuple[Any, ...], tuple[Literal["failed", "unavailable"], str]] = {}
        self.reserved_bytes = 0
        self.verified_bytes = 0
        self.read_calls = 0
        self.read_byte_cap = 0
        self.proof_computations = 0

    @staticmethod
    def key(snapshot: dict[str, Any]) -> tuple[Any, ...]:
        return snapshot["id"], snapshot["sha256"], snapshot["size"]

    def _read(self, snapshot: dict[str, Any], label: str) -> bytes:
        key = self.key(snapshot)
        if key in self._failures:
            status, reason = self._failures[key]
            raise PropertySourceFailure(status, reason)
        if key in self._bytes:
            return self._bytes[key]
        size = snapshot["size"]
        if type(size) is not int or not 0 <= size <= SOURCE_VERIFICATION_BYTES:
            raise PropertySourceFailure(
                "unavailable", f"{label} exceeds the supported property source byte budget."
            )
        if self._budget.reserved_bytes + size > SOURCE_VERIFICATION_BYTES:
            raise PropertySourceFailure(
                "unavailable",
                "Aggregate property source verification byte budget reached; "
                "read fewer entries.",
                capacity=True,
            )
        self._budget.reserved_bytes += size
        self.read_calls += 1
        self.read_byte_cap += max(1, size) + 1
        try:
            data = self.service._capture_bytes(snapshot)
        except (ArtifactIntegrityError, ArtifactNotFoundError, OSError, ValueError):
            reason = (
                f"{label} failed integrity verification or is missing. "
                "Restore the source and retry."
            )
            self._failures[key] = ("failed", reason)
            raise PropertySourceFailure("failed", reason) from None
        self._bytes[key] = data
        self.verified_bytes += len(data)
        return data

    def fingerprint(
        self, entry: StructureEntry, source: LigandPropertySource
    ) -> VerifiedPropertySource:
        try:
            normalized = self.service._snapshot(source.source_artifact_id)
        except ValueError:
            raise PropertySourceFailure(
                "failed", "Current normalized source is missing. Restore the source and retry."
            ) from None
        original = None
        if entry.original_artifact_id:
            try:
                original = self.service._snapshot(entry.original_artifact_id)
            except ValueError:
                raise PropertySourceFailure(
                    "failed", "Original source is missing. Restore the source and retry."
                ) from None
        if normalized["media_type"] != NORMALIZED_MEDIA_TYPE:
            raise PropertySourceFailure(
                "unavailable",
                "The current source is not a supported normalized molecular representation.",
            )
        normalized_key = self.key(normalized)
        original_key = self.key(original) if original else None
        proof_key = (normalized_key, original_key, source.atom_ids)
        data = self._read(normalized, "Current normalized source")
        if original is not None:
            self._read(original, "Original source")
        if proof_key in self._proof_failures:
            raise PropertySourceFailure("unavailable", self._proof_failures[proof_key])
        if proof_key not in self._fingerprints:
            self.proof_computations += 1
            try:
                if normalized_key not in self._json:
                    raw = json.loads(data)
                    if not isinstance(raw, dict):
                        raise ValueError("Normalized source is not an object")
                    self._json[normalized_key] = raw
                self._fingerprints[proof_key] = raw_source_fingerprint(
                    self._json[normalized_key], source.atom_ids, original
                )
            except (ValueError, TypeError, RecursionError):
                reason = (
                    "Current normalized source metadata or coordinates are unsupported "
                    "for property verification."
                )
                self._proof_failures[proof_key] = reason
                raise PropertySourceFailure("unavailable", reason) from None
        return VerifiedPropertySource(self._fingerprints[proof_key], normalized, original)
