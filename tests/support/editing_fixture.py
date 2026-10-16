"""Reproducible synthetic prepared-complex archive; never a preparation workflow."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from molweave_api.archive_service import (
    ArchiveBuildInput,
    ManifestEntry,
    ManifestFile,
    ProjectManifestV2,
    build_project_archive,
)
from molweave_api.schemas import ViewerSettingsV2
from molweave_api.viewer_state import default_viewer_settings
from molweave_core.adapters.ligand import MolAdapter
from molweave_core.adapters.macromolecular import PdbAdapter
from molweave_core.molecular import Conformer, InferenceRecord, NormalizedStructureV1

FIXTURE = Path(__file__).parents[1] / "fixtures" / "editing" / "prepared-complex.molweave.zip"


def prepared_complex() -> NormalizedStructureV1:
    root = Path(__file__).parents[1] / "fixtures" / "formats"
    protein = (
        PdbAdapter()
        .parse((root / "protein_editing.pdb").read_bytes(), "protein_editing.pdb")
        .structures[0]
    )
    ligand_path = FIXTURE.parent / "ethanol-3d.mol"
    ligand = MolAdapter().parse(ligand_path.read_bytes(), ligand_path.name).structures[0]
    atom_offset = max(a.id for a in protein.atoms)
    bond_offset = max((b.id for b in protein.bonds), default=0)
    chain_offset = max(c.id for c in protein.chains)
    residue_offset = max(r.id for r in protein.residues)
    atoms = [
        *protein.atoms,
        *[
            a.model_copy(
                update={
                    "id": a.id + atom_offset,
                    "residue_id": a.residue_id + residue_offset,
                    "coordinates": (a.coordinates[0] + 20, a.coordinates[1], a.coordinates[2]),
                    "source_index": a.source_index + len(protein.atoms),
                }
            )
            for a in ligand.atoms
        ],
    ]
    return protein.model_copy(
        update={
            "title": "Synthetic prepared ethanol and peptide",
            "structure_type": "complex",
            "atoms": atoms,
            "chains": [
                *protein.chains,
                *[
                    c.model_copy(update={"id": c.id + chain_offset, "name": "L"})
                    for c in ligand.chains
                ],
            ],
            "residues": [
                *protein.residues,
                *[
                    r.model_copy(
                        update={"id": r.id + residue_offset, "chain_id": r.chain_id + chain_offset}
                    )
                    for r in ligand.residues
                ],
            ],
            "bonds": [
                *protein.bonds,
                *[
                    b.model_copy(
                        update={
                            "id": b.id + bond_offset,
                            "atom_1_id": b.atom_1_id + atom_offset,
                            "atom_2_id": b.atom_2_id + atom_offset,
                        }
                    )
                    for b in ligand.bonds
                ],
            ],
            "conformers": [
                Conformer(
                    id=1, name="Synthetic composite", coordinates=[a.coordinates for a in atoms]
                )
            ],
            "active_conformer_id": 1,
            "inferences": [
                InferenceRecord(
                    code="synthetic_fixture",
                    message="Repository peptide plus ethanol translated +20 angstrom on X. "
                    "Not an experimental complex or chemistry assignment.",
                )
            ],
        }
    )


def build_fixture(
    structure: NormalizedStructureV1 | None = None, *, application_version: str = "0.15.0"
) -> bytes:
    structure = prepared_complex() if structure is None else structure
    data = structure.to_bytes()
    digest = hashlib.sha256(data).hexdigest()
    path = f"artifacts/{digest}"
    timestamp = datetime(2026, 10, 16, tzinfo=UTC)
    return build_project_archive(
        ArchiveBuildInput(
            manifest=ProjectManifestV2(
                application_version=application_version,
                source_project_id=str(UUID(int=690)),
                source_revision=0,
                source_checkpoint_revision=0,
                name="Prepared editing fixture",
                created_at=timestamp,
                modified_at=timestamp,
                groups=[],
                saved_selections=[],
                measurements=[],
                scenes=[],
                entries=[
                    ManifestEntry(
                        id=str(UUID(int=691)),
                        group_id=None,
                        name=structure.title,
                        structure_type=structure.structure_type,
                        normalized_data={"schema_version": 1, "storage": "artifact"},
                        atom_count=len(structure.atoms),
                        atom_ids=[a.id for a in structure.atoms],
                        bond_count=len(structure.bonds),
                        residue_count=len(structure.residues),
                        conformer_count=len(structure.conformers),
                        warnings=list(structure.warnings),
                        next_atom_id=max((a.id for a in structure.atoms), default=0) + 1,
                        next_bond_id=max((b.id for b in structure.bonds), default=0) + 1,
                        viewer_settings=ViewerSettingsV2.model_validate(
                            default_viewer_settings(structure.structure_type)
                        ),
                        visible=True,
                        locked=False,
                        user_metadata={"fixture": "synthetic; not experimental"},
                        job_links=[],
                        generated_results=[],
                        original_file=path,
                        current_file=path,
                        original_filename="prepared-complex.normalized.json",
                        created_at=timestamp,
                        modified_at=timestamp,
                    )
                ],
                files=[
                    ManifestFile(
                        path=path,
                        sha256=digest,
                        size=len(data),
                        media_type="application/vnd.molweave.normalized-structure+json",
                        filename="prepared-complex.normalized.json",
                    )
                ],
            ),
            contents={path: data},
        )
    )


if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_bytes(build_fixture())
    print(f"{FIXTURE}: {hashlib.sha256(FIXTURE.read_bytes()).hexdigest()}")
