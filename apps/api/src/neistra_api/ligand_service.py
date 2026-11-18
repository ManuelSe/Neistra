"""Entry-owned ligand commands and source-bound, regenerable 2D artifacts."""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from threading import BoundedSemaphore, Lock
from typing import Literal

from neistra_core.artifacts import LocalArtifactStore
from neistra_core.ligands.candidates import resolve_candidates
from neistra_core.ligands.chemistry import (
    CHEMISTRY_POLICY,
    DEPICTION_POLICY,
    PreparedLigandChemistry,
    depict_qualified,
    depiction_cache_key,
    prepare_chemistry,
)
from neistra_core.ligands.models import (
    RESOLVER_VERSION,
    LigandCandidateV1,
    LigandDesignationV1,
    LigandInventoryV1,
)
from neistra_core.ligands.occurrences import (
    OCCURRENCE_POLICY,
    OccurrenceCount,
    OccurrenceIndex,
    OccurrenceLimits,
    build_occurrence_index,
)
from neistra_core.ligands.reconcile import clear_designation, initial_designation, select_candidate
from neistra_core.ligands.source_evidence import MmcifSourceInventory, assess_mmcif_source
from neistra_core.molecular import NormalizedStructureV1
from rdkit import rdBase
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from neistra_api.artifact_errors import ArtifactIntegrityError, ArtifactNotFoundError
from neistra_api.import_export import ArtifactService, StructureArtifactConflictError
from neistra_api.ligand_occurrence_cache import OccurrenceCacheKey, OccurrenceSummaryCache
from neistra_api.ligand_schemas import (
    LigandCandidatesRead,
    LigandDepictionRead,
    LigandDesignationCreate,
    LigandResolveCreate,
)
from neistra_api.models import (
    Artifact,
    LigandDepictionBinding,
    LigandDepictionCache,
    StructureEntry,
)
from neistra_api.project_publication import lock_project_publication
from neistra_api.project_service import InvalidProjectOperationError, ProjectService, project_read
from neistra_api.schemas import ProjectRead
from neistra_api.settings import Settings

_DEPICTION_WORK = BoundedSemaphore(2)
_CACHE_PUBLICATION = Lock()
MAX_CONTENT_CACHE = 1024
MAX_SOURCE_BINDINGS = 4096
MAX_DEPICTION_BYTES = 512 * 1024
MAX_RETAINED_DEPICTION_BYTES = 128 * 1024 * 1024
OCCURRENCE_LIMITS = OccurrenceLimits(max_candidates=1024, max_total_atoms=8192)
OCCURRENCE_BUDGET_SECONDS = 2.0
_OCCURRENCE_CACHE = OccurrenceSummaryCache(_DEPICTION_WORK)


@dataclass(frozen=True, slots=True)
class LigandSourceIdentity:
    project_id: str
    entry_id: str
    current_artifact_id: str | None
    original_artifact_id: str | None

    @classmethod
    def capture(cls, entry: StructureEntry) -> LigandSourceIdentity:
        return cls(
            entry.project_id,
            entry.id,
            entry.current_artifact_id,
            entry.original_artifact_id,
        )

    def detail(self) -> dict[str, str | None]:
        return {
            "project_id": self.project_id,
            "entry_id": self.entry_id,
            "current_artifact_id": self.current_artifact_id,
            "original_artifact_id": self.original_artifact_id,
        }


class LigandSourceVerificationError(RuntimeError):
    def __init__(
        self,
        source: Literal["current", "original"],
        code: Literal[
            "artifact_integrity_error", "artifact_not_found", "structure_artifact_conflict"
        ],
        message: str,
        identity: LigandSourceIdentity | None = None,
    ) -> None:
        super().__init__(message)
        self.source = source
        self.code = code
        self.identity = identity


@dataclass(frozen=True, slots=True)
class _LigandInputs:
    structure: NormalizedStructureV1 | None
    original: bytes | None
    inventory: LigandInventoryV1
    source_inventory: MmcifSourceInventory | None
    chemistry: PreparedLigandChemistry | None


class LigandService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.artifacts = ArtifactService(session, LocalArtifactStore(settings.data_dir))
        self.projects = ProjectService(
            session, load_structure=self.artifacts.load_normalized,
            load_original_bytes=self.artifacts.read_verified_bytes,
        )

    def _entry(self, project_id: str, entry_id: str, expected: str | None) -> StructureEntry:
        entry = self.projects._entry(self.projects._project(project_id), entry_id)
        if entry.current_artifact_id != expected:
            raise LigandSourceVerificationError(
                "current",
                "structure_artifact_conflict",
                "Ligand input changed; use the current structure",
            )
        return entry

    def _source_read[ResultT](
        self,
        identity: LigandSourceIdentity,
        source: Literal["current", "original"],
        operation: Callable[[], ResultT],
    ) -> ResultT:
        # Only immutable molecular input reads carry source-failure authority.
        # Derived SVG reads deliberately keep their ordinary artifact errors.
        try:
            return operation()
        except ArtifactIntegrityError as error:
            raise LigandSourceVerificationError(
                source,
                "artifact_integrity_error",
                str(error),
                identity,
            ) from error
        except ArtifactNotFoundError as error:
            raise LigandSourceVerificationError(
                source,
                "artifact_not_found",
                f"Artifact {error} was not found",
                identity,
            ) from error
        except StructureArtifactConflictError as error:
            raise LigandSourceVerificationError(
                source,
                "structure_artifact_conflict",
                str(error),
                identity,
            ) from error

    def _inputs(
        self, entry: StructureEntry,
    ) -> tuple[NormalizedStructureV1 | None, bytes | None, LigandInventoryV1]:
        inputs = self._load_inputs(entry)
        return inputs.structure, inputs.original, inputs.inventory

    def _load_inputs(self, entry: StructureEntry, *, with_chemistry: bool = False) -> _LigandInputs:
        identity = LigandSourceIdentity.capture(entry)
        current_id, original_id = identity.current_artifact_id, identity.original_artifact_id
        if current_id is None:
            return _LigandInputs(
                None,
                None,
                LigandInventoryV1(
                    input_hash=hashlib.sha256(b"no-current-ligand-input").hexdigest(),
                    candidates=[],
                    warnings=["no_current_structure"],
                ),
                None,
                None,
            )
        structure = self._source_read(
            identity,
            "current",
            lambda: self.artifacts.load_normalized(current_id),
        )
        original = (
            self._source_read(
                identity,
                "original",
                lambda: self.artifacts.read_verified_bytes(original_id),
            )
            if original_id
            else None
        )
        source = assess_mmcif_source(structure, original)
        chemistry = (
            prepare_chemistry(structure, original_bytes=original) if with_chemistry else None
        )
        inventory = resolve_candidates(
            structure,
            original_bytes=original,
            source_inventory=source,
            prepared_chemistry=chemistry,
        )
        return _LigandInputs(structure, original, inventory, source, chemistry)

    def _occurrences(self, inputs: _LigandInputs) -> OccurrenceIndex | None:
        structure, context = inputs.structure, inputs.chemistry
        if structure is None or context is None or not any(
            candidate.potential_ligand and candidate.boundary_status != "ineligible"
            for candidate in inputs.inventory.candidates
        ):
            return None
        key = OccurrenceCacheKey(
            str(self.artifacts.store.root), inputs.inventory.input_hash,
            structure.source.format.lower(), structure.source.record_index,
            inputs.inventory.resolver_version, CHEMISTRY_POLICY, OCCURRENCE_POLICY,
            rdBase.rdkitVersion, OCCURRENCE_LIMITS.max_candidates,
            OCCURRENCE_LIMITS.max_total_atoms, OCCURRENCE_LIMITS.max_candidate_atoms,
        )
        return _OCCURRENCE_CACHE.get_or_build(
            key, frozenset(candidate.candidate_key for candidate in inputs.inventory.candidates),
            lambda: build_occurrence_index(
                structure, inputs.inventory, context, limits=OCCURRENCE_LIMITS,
                source_inventory=inputs.source_inventory,
                deadline=time.monotonic() + OCCURRENCE_BUDGET_SECONDS,
            ),
        )

    def candidates(
        self, project_id: str, entry_id: str, expected_artifact_id: str | None,
        *, offset: int = 0, limit: int = 12,
    ) -> LigandCandidatesRead:
        if offset < 0 or not 1 <= limit <= 48:
            raise InvalidProjectOperationError("Use a bounded ligand candidate page")
        entry = self._entry(project_id, entry_id, expected_artifact_id)
        inputs = self._load_inputs(entry, with_chemistry=True)
        inventory, context = inputs.inventory, inputs.chemistry
        occurrences = self._occurrences(inputs)

        def metadata(candidate: LigandCandidateV1) -> LigandCandidateV1:
            count = (
                OccurrenceCount(None, None, "occurrence_not_applicable")
                if not candidate.potential_ligand or candidate.boundary_status == "ineligible"
                else occurrences.for_candidate(candidate.candidate_key) if occurrences is not None
                else OccurrenceCount(None, None, "occurrence_work_busy")
            )
            candidate = candidate.model_copy(update={
                "occurrence_count": count.count,
                "occurrence_basis": count.basis,
                "occurrence_reason": count.reason,
            })
            if context is None or not candidate.selectable or not candidate.potential_ligand:
                return candidate.model_copy(update={"formal_charge": None})
            chemistry = context.qualify(candidate.atom_ids)
            return candidate.model_copy(update={
                "chemistry_status": chemistry.status,
                "chemistry_reason": chemistry.reason,
                "chemical_input_hash": chemistry.input_hash,
                "formula": chemistry.formula,
                "molecular_weight": chemistry.molecular_weight,
                "formal_charge": chemistry.formal_charge if chemistry.status == "qualified"
                else None,
            })

        # Presentation ranking never changes eligibility or automatic assignment.
        ordered = sorted(inventory.candidates, key=lambda candidate: (
            0 if candidate.selectable and candidate.potential_ligand else
            1 if candidate.potential_ligand and candidate.boundary_status != "ineligible" else 2,
            candidate.atom_ids[0], candidate.candidate_key,
        ))
        page = [metadata(candidate) for candidate in ordered[offset:offset + limit]]
        designation = LigandDesignationV1.model_validate(entry.ligand_designation)
        designated = next((candidate for candidate in page
                           if candidate.atom_ids == designation.atom_ids), None)
        if designated is None and designation.status == "resolved":
            selected = next((candidate for candidate in inventory.candidates
                             if candidate.atom_ids == designation.atom_ids), None)
            designated = metadata(selected) if selected else None
        return LigandCandidatesRead(
            project_id=project_id, entry_id=entry_id, artifact_id=entry.current_artifact_id,
            designation=designation, input_hash=inventory.input_hash,
            resolver_version=inventory.resolver_version, total=len(inventory.candidates),
            offset=offset, limit=limit, candidates=page, designated_candidate=designated,
            selectable_candidate_keys=[candidate.candidate_key for candidate in page
                                       if candidate.selectable and candidate.potential_ligand],
            warnings=inventory.warnings,
        )

    def designate(
        self, project_id: str, entry_id: str, payload: LigandDesignationCreate,
    ) -> ProjectRead:
        lock_project_publication(self.session, project_id)
        project = self.projects._project(project_id)
        self.projects._check_revision(project, payload.expected_revision)
        entry = self._entry(project_id, entry_id, payload.expected_artifact_id)
        before = LigandDesignationV1.model_validate(entry.ligand_designation)
        if payload.clear:
            after = clear_designation().model_copy(update={
                "source_artifact_id": entry.current_artifact_id,
            })
            if before.status == "cleared":
                return project_read(self.session, project)
        else:
            _, _, inventory = self._inputs(entry)
            if payload.expected_input_hash and payload.expected_input_hash != inventory.input_hash:
                raise StructureArtifactConflictError("The ligand candidate inventory changed")
            if not entry.current_artifact_id or not payload.candidate_key:
                raise InvalidProjectOperationError("Choose a current exact ligand candidate")
            try:
                after = select_candidate(
                    inventory, payload.candidate_key, entry.current_artifact_id,
                )
            except ValueError as error:
                raise InvalidProjectOperationError(str(error)) from error
            if before.status == "resolved" and before.atom_ids == after.atom_ids:
                if before.origin == "manual":
                    return project_read(self.session, project)
                after = after.model_copy(update={"instance_id": before.instance_id})
        return self.projects._record(
            project, "ligand.designation", "Clear ligand of interest" if payload.clear
            else f"Choose ligand of interest in {entry.name}",
            [{"kind": "entry.ligand", "entry_id": entry.id,
              "designation": after.model_dump(mode="json")}],
            [{"kind": "entry.ligand", "entry_id": entry.id,
              "designation": before.model_dump(mode="json")}],
            [entry.id],
        )

    def resolve(self, project_id: str, payload: LigandResolveCreate) -> ProjectRead:
        lock_project_publication(self.session, project_id)
        project = self.projects._project(project_id)
        self.projects._check_revision(project, payload.expected_revision)
        changed = False
        default = LigandDesignationV1()
        for entry_id in payload.entry_ids:
            entry = self.projects._entry(project, entry_id)
            before = LigandDesignationV1.model_validate(entry.ligand_designation)
            if before != default:
                continue
            _, _, inventory = self._inputs(entry)
            after = initial_designation(inventory, entry.current_artifact_id) \
                if entry.current_artifact_id else LigandDesignationV1(
                    status="not_applicable", reason_code="no_current_structure",
                )
            entry.ligand_designation = self.projects._assessed_designation(
                after, project.revision + 1,
            ).model_dump(mode="json")
            changed = True
        if changed:
            self.projects._touch(project)
            self.session.commit()
        return project_read(self.session, project)

    @staticmethod
    def _request_key(entry: StructureEntry, candidate_key: str) -> str:
        return hashlib.sha256(json.dumps([
            entry.current_artifact_id, entry.original_artifact_id, candidate_key,
            RESOLVER_VERSION, CHEMISTRY_POLICY, DEPICTION_POLICY, rdBase.rdkitVersion, 240, 180,
        ], separators=(",", ":")).encode()).hexdigest()

    def _cached(
        self,
        entry: StructureEntry,
        candidate_key: str,
        request_key: str,
    ) -> LigandDepictionRead | None:
        binding = self.session.get(LigandDepictionBinding, request_key)
        cache = self.session.get(LigandDepictionCache, binding.cache_key) if binding else None
        if binding is None or cache is None:
            return None
        # Trust immutable identities only after verifying their stored bytes;
        # a cache hit needs no chemical reconstruction or drawing.
        identity = LigandSourceIdentity.capture(entry)
        current_id, original_id = identity.current_artifact_id, identity.original_artifact_id
        if current_id:
            self._source_read(
                identity,
                "current",
                lambda: self.artifacts.read_verified_bytes(current_id),
            )
        if original_id:
            self._source_read(
                identity,
                "original",
                lambda: self.artifacts.read_verified_bytes(original_id),
            )
        self.artifacts.read_verified_bytes(cache.artifact_id)
        return LigandDepictionRead(
            entry_id=entry.id,
            artifact_id=entry.current_artifact_id,
            candidate_key=candidate_key,
            status="ready",
            input_hash=cache.input_hash,
            cache_key=cache.cache_key,
            artifact=self.artifacts.response(self.artifacts.get(cache.artifact_id)),
            implementation=cache.implementation,
            library_version=cache.library_version,
            **binding.summary,
        )

    def depiction(
        self, project_id: str, entry_id: str, candidate_key: str,
        expected_artifact_id: str | None,
    ) -> LigandDepictionRead:
        entry = self._entry(project_id, entry_id, expected_artifact_id)
        key = self._request_key(entry, candidate_key)
        cached = self._cached(entry, candidate_key, key)
        if cached:
            return cached
        common = {
            "entry_id": entry_id, "artifact_id": entry.current_artifact_id,
            "candidate_key": candidate_key, "implementation": DEPICTION_POLICY,
            "library_version": rdBase.rdkitVersion,
        }
        if not _DEPICTION_WORK.acquire(blocking=False):
            return LigandDepictionRead(**common, status="busy", reason="depiction_work_busy")
        try:
            inputs = self._load_inputs(entry, with_chemistry=True)
            structure, inventory = inputs.structure, inputs.inventory
            candidate = next((candidate for candidate in inventory.candidates
                              if candidate.candidate_key == candidate_key), None)
            if structure is None or candidate is None or not candidate.selectable \
                    or not candidate.potential_ligand:
                return LigandDepictionRead(
                    **common, status="unavailable", reason="candidate_boundary_not_selectable",
                )
            assert inputs.chemistry is not None
            chemistry = inputs.chemistry.qualify(candidate.atom_ids)
            if chemistry.status != "qualified" or not chemistry.input_hash:
                return LigandDepictionRead(**common, status="unavailable", reason=chemistry.reason)
            content_key = depiction_cache_key(chemistry.input_hash)
            cache = self.session.get(LigandDepictionCache, content_key)
            drawing = depict_qualified(chemistry) if cache is None else None
            if drawing and (drawing.status != "ready" or not drawing.svg):
                return LigandDepictionRead(**common, status="unavailable", reason=drawing.reason)
            with _CACHE_PUBLICATION:
                # The local SQLite write lock serializes admission across API
                # processes as well as threads. Refresh the authoritative source.
                lock_project_publication(self.session, project_id)
                self.session.expire_all()
                entry = self._entry(project_id, entry_id, expected_artifact_id)
                cache = self.session.scalar(select(LigandDepictionCache).where(
                    LigandDepictionCache.cache_key == content_key,
                ).execution_options(populate_existing=True))
                if cache is None:
                    if drawing is None:
                        drawing = depict_qualified(chemistry)
                    if drawing.status != "ready" or not drawing.svg:
                        return LigandDepictionRead(
                            **common, status="unavailable", reason=drawing.reason,
                        )
                    payload = drawing.svg.encode("utf-8")
                    count, retained_bytes = self.session.execute(select(
                        func.count(LigandDepictionCache.cache_key),
                        func.coalesce(func.sum(Artifact.size), 0),
                    ).join(Artifact, Artifact.id == LigandDepictionCache.artifact_id)).one()
                    if len(payload) > MAX_DEPICTION_BYTES:
                        return LigandDepictionRead(
                            **common, status="unavailable", reason="depiction_output_too_large",
                        )
                    if count >= MAX_CONTENT_CACHE or \
                            retained_bytes + len(payload) > MAX_RETAINED_DEPICTION_BYTES:
                        return LigandDepictionRead(
                            **common, status="unavailable", reason="depiction_cache_capacity",
                        )
                    artifact = self.artifacts.publish(
                        payload, f"ligand-{content_key}.svg", "image/svg+xml",
                    )
                    cache = LigandDepictionCache(
                        cache_key=content_key, input_hash=chemistry.input_hash,
                        artifact_id=artifact.id, implementation=DEPICTION_POLICY,
                        library_version=rdBase.rdkitVersion,
                    )
                    self.session.add(cache)
                    self.session.flush()
                binding = self.session.get(LigandDepictionBinding, key)
                if binding is None:
                    self.session.add(LigandDepictionBinding(
                        request_key=key, cache_key=cache.cache_key, summary={
                            "formula": chemistry.formula,
                            "molecular_weight": chemistry.molecular_weight,
                            "formal_charge": chemistry.formal_charge,
                            "provenance": chemistry.provenance,
                        },
                    ))
                self.session.flush()
                older = select(LigandDepictionBinding.request_key).order_by(
                    LigandDepictionBinding.created_at.desc(), LigandDepictionBinding.request_key,
                ).offset(MAX_SOURCE_BINDINGS)
                self.session.execute(delete(LigandDepictionBinding).where(
                    LigandDepictionBinding.request_key.in_(older),
                ))
                self.session.commit()
            result = self._cached(entry, candidate_key, key)
            assert result is not None
            return result
        finally:
            _DEPICTION_WORK.release()
