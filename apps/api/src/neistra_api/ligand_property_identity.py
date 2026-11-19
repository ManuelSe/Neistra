"""Conservative raw-source proof locators; no molecular interpretation occurs here."""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

from neistra_core.ligand_properties.registry import (
    IMPLEMENTATION_VERSION,
    LIBRARY_VERSION,
    POLICY_VERSION,
)

MAX_CAPTURE_ENVELOPE_BYTES = 96 * 1024 * 1024

RAW_PROOF_VERSION = "ligand-property-raw-source-proof-v1"


def _coordinate(value: Any) -> None:
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError("A coordinate must contain exactly three finite numbers")
    try:
        if any(type(number) not in {int, float} or not math.isfinite(number) for number in value):
            raise ValueError("Coordinates must contain finite numbers")
    except OverflowError as error:
        raise ValueError("Coordinate magnitude is unsupported") from error


def raw_source_fingerprint(
    structure: dict[str, Any],
    atom_ids: list[int] | tuple[int, ...],
    original_identity: dict[str, Any] | None,
) -> str:
    """Locate only a previously child-qualified proof for exact noncoordinate data.

    Every field, including unknown metadata, IDs, active conformer and inference
    facts, is retained except validated atom/conformer coordinate values. This
    digest is not a scientific input digest and cannot independently qualify data.
    """
    if not isinstance(structure, dict) or structure.get("schema_version") != 1:
        raise ValueError("Unsupported normalized source for property proof")
    atoms, conformers = structure.get("atoms"), structure.get("conformers")
    if not isinstance(atoms, list) or not isinstance(conformers, list):
        raise ValueError("Property proof requires complete normalized arrays")
    if not atom_ids or any(type(value) is not int or value < 1 for value in atom_ids):
        raise ValueError("Property proof requires exact positive membership")
    if list(atom_ids) != sorted(set(atom_ids)):
        raise ValueError("Property proof membership must be canonical")
    stripped_atoms = []
    for atom in atoms:
        if not isinstance(atom, dict):
            raise ValueError("Malformed normalized atom")
        _coordinate(atom.get("coordinates"))
        stripped_atoms.append({key: value for key, value in atom.items() if key != "coordinates"})
    stripped_conformers = []
    for conformer in conformers:
        if not isinstance(conformer, dict):
            raise ValueError("Malformed normalized conformer")
        coordinates = conformer.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) != len(atoms):
            raise ValueError("Conformer coordinates do not cover the normalized atoms")
        for coordinate in coordinates:
            _coordinate(coordinate)
        stripped_conformers.append(
            {key: value for key, value in conformer.items() if key != "coordinates"}
        )
    original = None
    if original_identity is not None:
        digest, size = original_identity.get("sha256"), original_identity.get("size")
        if (
            not isinstance(digest, str)
            or not re.fullmatch(r"[0-9a-f]{64}", digest)
            or type(size) is not int
            or size < 0
        ):
            raise ValueError("Original proof identity is malformed")
        original = {"sha256": digest, "size": size}
    retained = {**structure, "atoms": stripped_atoms, "conformers": stripped_conformers}
    payload = [
        RAW_PROOF_VERSION,
        retained,
        list(atom_ids),
        original,
        IMPLEMENTATION_VERSION,
        POLICY_VERSION,
        LIBRARY_VERSION,
    ]
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
