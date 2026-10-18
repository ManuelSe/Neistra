from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from molweave_core.adapters.rdkit_common import mol_to_normalized
from molweave_core.jobs import InputArtifact, JobCancelled, ResultArtifact
from molweave_core.minimization.contracts import CapturedInput, MinimizationParameters
from molweave_core.molecular import NormalizedStructureV1
from molweave_core.selection import AtomReference, SelectionV1
from rdkit import Chem
from rdkit.Chem import AllChem

all_chem: Any = AllChem


def molecule(smiles: str = "CCO", explicit_h: bool = True) -> NormalizedStructureV1:
    mol = Chem.MolFromSmiles(smiles)
    assert mol is not None
    if explicit_h:
        mol = Chem.AddHs(mol)
    assert all_chem.EmbedMolecule(mol, randomSeed=82) == 0
    return mol_to_normalized(mol, filename="minimization.mol", format_name="mol")


def capture(
    structure: NormalizedStructureV1,
    selected: list[int] | None = None,
    max_iterations: int = 500,
) -> tuple[MinimizationParameters, tuple[InputArtifact, ...]]:
    data = structure.to_bytes()
    ids = [a.id for a in structure.atoms]
    digest = hashlib.sha256(data).hexdigest()
    parameters = MinimizationParameters(
        selection=SelectionV1(
            atoms=[
                AtomReference(structure_id="entry", atom_id=i)
                for i in sorted(selected if selected is not None else ids)
            ]
        ),
        captured_inputs=[
            CapturedInput(
                entry_id="entry",
                artifact_id="artifact",
                sha256=digest,
                conformer_id=structure.active_conformer_id,
                atom_ids=ids,
            )
        ],
        max_iterations=max_iterations,
    )
    return parameters, (
        InputArtifact(
            entry_id="entry",
            entry_name="molecule",
            structure_type=structure.structure_type,
            role="calculation",
            artifact_id="artifact",
            sha256=digest,
            media_type="application/vnd.molweave.normalized-structure+json",
            filename="molecule.normalized.json",
            data=data,
        ),
    )


class LocalContext:
    def __init__(self, directory: Path) -> None:
        self.work_directory = directory
        self.cancelled = False
        self.messages: list[str] = []
        self.values: list[float] = []

    def is_cancelled(self) -> bool:
        return self.cancelled

    def checkpoint(self) -> None:
        if self.is_cancelled():
            raise JobCancelled("Test cancellation")

    def progress(self, value: float, message: str) -> None:
        self.checkpoint()
        self.values.append(value)
        self.messages.append(message)

    def stdout(self, message: str) -> None:
        self.messages.append(message)

    def stderr(self, message: str) -> None:
        self.messages.append(message)

    def sleep(self, seconds: float) -> None:
        self.checkpoint()

    def publish_artifact(
        self,
        *,
        role: str,
        filename: str,
        media_type: str,
        data: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> ResultArtifact:
        self.checkpoint()
        return ResultArtifact(
            role=role, filename=filename, media_type=media_type, data=data, metadata=metadata or {}
        )


def environment_capture(
    sources: dict[str, NormalizedStructureV1],
    selected: dict[str, list[int]],
    included: dict[str, list[int]] | None = None,
    max_iterations: int = 500,
) -> tuple[MinimizationParameters, tuple[InputArtifact, ...]]:
    inputs = []
    captures = []
    for entry, structure in sorted(sources.items()):
        data = structure.to_bytes()
        digest = hashlib.sha256(data).hexdigest()
        captures.append(
            CapturedInput(
                entry_id=entry,
                artifact_id=f"artifact-{entry}",
                sha256=digest,
                conformer_id=structure.active_conformer_id,
                atom_ids=sorted(
                    included[entry] if included is not None else [a.id for a in structure.atoms]
                ),
            )
        )
        inputs.append(
            InputArtifact(
                entry_id=entry,
                entry_name=entry,
                structure_type=structure.structure_type,
                role="calculation",
                artifact_id=f"artifact-{entry}",
                sha256=digest,
                media_type="application/vnd.molweave.normalized-structure+json",
                filename=f"{entry}.normalized.json",
                data=data,
            )
        )
    return MinimizationParameters(
        mode="environment",
        captured_inputs=captures,
        max_iterations=max_iterations,
        selection=SelectionV1(
            atoms=[
                AtomReference(structure_id=entry, atom_id=i)
                for entry, ids in sorted(selected.items())
                for i in sorted(ids)
            ]
        ),
    ), tuple(inputs)


def peptide() -> NormalizedStructureV1:
    return NormalizedStructureV1.from_bytes(
        (Path(__file__).parents[1] / "fixtures/minimization/peptide.normalized.json").read_bytes()
    )


def translated(
    value: NormalizedStructureV1, offset: tuple[float, float, float]
) -> NormalizedStructureV1:
    coordinates = [tuple(p[j] + offset[j] for j in range(3)) for p in value.active_coordinates]
    return value.model_copy(
        update={
            "atoms": [
                a.model_copy(update={"coordinates": p})
                for a, p in zip(value.atoms, coordinates, strict=True)
            ],
            "conformers": [
                c.model_copy(update={"coordinates": coordinates}) for c in value.conformers
            ],
        }
    )


def combined(*structures: NormalizedStructureV1) -> NormalizedStructureV1:
    """Synthetic fixture assembly; production never merges canonical entries."""
    from molweave_core.hydrogen_protection import protection_annotation, protection_facts
    from molweave_core.molecular import Conformer

    atoms, bonds, residues, chains, facts = [], [], [], [], []
    for structure in structures:
        atom_offset, residue_offset, chain_offset = len(atoms), len(residues), len(chains)
        atom_ids = {a.id: atom_offset + i + 1 for i, a in enumerate(structure.atoms)}
        residue_ids = {r.id: residue_offset + i + 1 for i, r in enumerate(structure.residues)}
        chain_ids = {c.id: chain_offset + i + 1 for i, c in enumerate(structure.chains)}
        for atom in structure.atoms:
            updated = atom.model_copy(
                update={
                    "id": atom_ids[atom.id],
                    "source_index": atom_ids[atom.id] - 1,
                    "residue_id": residue_ids.get(atom.residue_id),
                }
            )
            atoms.append(updated)
            fact = protection_facts(structure)[atom.id]
            facts.append(
                fact.model_copy(
                    update={"atom_id": updated.id, "source_index": updated.source_index}
                )
            )
        bond_offset = len(bonds)
        bonds.extend(
            b.model_copy(
                update={
                    "id": bond_offset + i + 1,
                    "atom_1_id": atom_ids[b.atom_1_id],
                    "atom_2_id": atom_ids[b.atom_2_id],
                }
            )
            for i, b in enumerate(structure.bonds)
        )
        residues.extend(
            r.model_copy(update={"id": residue_ids[r.id], "chain_id": chain_ids[r.chain_id]})
            for r in structure.residues
        )
        chains.extend(c.model_copy(update={"id": chain_ids[c.id]}) for c in structure.chains)
    return structures[0].model_copy(
        update={
            "structure_type": "complex",
            "atoms": atoms,
            "bonds": bonds,
            "residues": residues,
            "chains": chains,
            "conformers": [
                Conformer(
                    id=1, name="synthetic assembly", coordinates=[a.coordinates for a in atoms]
                )
            ],
            "active_conformer_id": 1,
            "annotations": [protection_annotation(facts, "import")],
        }
    )


def water() -> NormalizedStructureV1:
    from molweave_core.molecular import Chain, Residue

    value = molecule("O")
    return value.model_copy(
        update={
            "structure_type": "solvent",
            "atoms": [
                a.model_copy(update={"name": name, "residue_id": 1})
                for a, name in zip(value.atoms, ("O", "H1", "H2"), strict=True)
            ],
            "chains": [Chain(id=1, name="W", entity_type="water")],
            "residues": [Residue(id=1, chain_id=1, name="HOH", component_type="water")],
        }
    )
