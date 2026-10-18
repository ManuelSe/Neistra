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
