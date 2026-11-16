"""Pure designation transitions; project commands own persistence and history."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from neistra_core.ligands.models import LigandDesignationV1, LigandInventoryV1
from neistra_core.molecular import NormalizedStructureV1


def select_candidate(
    inventory: LigandInventoryV1,
    candidate_key: str,
    source_artifact_id: str,
    *,
    origin: Literal["automatic_single_candidate", "manual"] = "manual",
) -> LigandDesignationV1:
    candidate = next((c for c in inventory.candidates if c.candidate_key == candidate_key), None)
    if candidate is None or not candidate.selectable or not candidate.potential_ligand:
        raise ValueError("The current exact candidate is unavailable for designation")
    if origin == "automatic_single_candidate" and candidate != inventory.automatic_candidate:
        raise ValueError("Automatic designation requires exactly one qualified eligible instance")
    return LigandDesignationV1(
        status="resolved",
        source_artifact_id=source_artifact_id,
        instance_id=str(uuid4()),
        atom_ids=list(candidate.atom_ids),
        origin=origin,
        selected_at=datetime.now(UTC),
    )


def clear_designation() -> LigandDesignationV1:
    return LigandDesignationV1(status="cleared")


def initial_designation(
    inventory: LigandInventoryV1,
    source_artifact_id: str,
) -> LigandDesignationV1:
    candidate = inventory.automatic_candidate
    if candidate is not None:
        return select_candidate(
            inventory,
            candidate.candidate_key,
            source_artifact_id,
            origin="automatic_single_candidate",
        )
    potential = [
        c for c in inventory.candidates if c.potential_ligand and c.boundary_status != "ineligible"
    ]
    status: Literal["not_applicable", "selection_required", "unresolved"] = (
        "not_applicable"
        if not potential
        else "selection_required"
        if any(c.selectable for c in potential)
        else "unresolved"
    )
    return LigandDesignationV1(
        status=status,
        source_artifact_id=source_artifact_id,
        reason_code="molecular_boundary_not_qualified" if status == "unresolved" else None,
    )


def reconcile_designation(
    designation: LigandDesignationV1,
    before: NormalizedStructureV1,
    after: NormalizedStructureV1,
    inventory: LigandInventoryV1,
    source_artifact_id: str,
) -> LigandDesignationV1:
    if designation.status in {"cleared", "stale"}:
        return designation.model_copy(update={"source_artifact_id": source_artifact_id})
    if designation.status != "resolved":
        return initial_designation(inventory, source_artifact_id)
    previous = set(designation.atom_ids)
    before_ids = {atom.id for atom in before.atoms}
    after_ids = {atom.id for atom in after.atoms}

    def stale(reason: str) -> LigandDesignationV1:
        # Preserve intent while recording the current assessed source, including
        # when that source no longer supports the former complete membership.
        return designation.model_copy(
            update={
                "status": "stale",
                "reason_code": reason,
                "source_artifact_id": source_artifact_id,
            }
        )

    if not previous <= before_ids:
        return stale("previous_designation_membership_missing")
    remaining = previous & after_ids
    if not remaining:
        return stale("designated_instance_removed")
    overlapping = [
        candidate for candidate in inventory.candidates if set(candidate.atom_ids) & remaining
    ]
    if len(overlapping) != 1:
        return stale("designated_instance_split_or_ambiguous")
    candidate = overlapping[0]
    current = set(candidate.atom_ids)
    if not candidate.selectable or not candidate.potential_ligand:
        return stale("designated_instance_boundary_unresolved")
    if not remaining <= current:
        return stale("designated_instance_split_or_ambiguous")
    if (current & before_ids) - previous:
        return stale("designated_instance_merged")
    return designation.model_copy(
        update={
            "source_artifact_id": source_artifact_id,
            "atom_ids": list(candidate.atom_ids),
            "reason_code": None,
        }
    )
