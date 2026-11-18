from __future__ import annotations

from typing import Any

import pytest
from neistra_core.ligands.source_evidence import _consistent_scheme


class OptionalColumn(list[str]):
    availability_checks = 0

    def __bool__(self) -> bool:
        self.availability_checks += 1
        return len(self) != 0


class SchemeColumns(dict[str, list[str]]):
    discarded_default_slots = 0

    def get(self, key: Any, default: Any = None) -> Any:
        if isinstance(default, list):
            self.discarded_default_slots += len(default)
        return super().get(key, default)


@pytest.mark.parametrize("count", [40, 160])
@pytest.mark.parametrize("sparse", [False, True])
def test_shared_water_asymmetry_does_not_allocate_row_sized_defaults_per_row(
    count: int, sparse: bool,
) -> None:
    sequence = [str(index + 1) for index in range(count)]
    insertion = OptionalColumn()
    scheme = SchemeColumns({
        "asym_id": ["W"] * count, "entity_id": ["1"] * count,
        "mon_id": ["HOH"] * count, "ndb_seq_num": sequence.copy(),
        "pdb_seq_num": sequence.copy(), "pdb_mon_id": ["HOH"] * count,
        "pdb_strand_id": ["A"] * count, "pdb_ins_code": [""] * count,
    })
    if sparse:
        for name in ("pdb_mon_id", "pdb_strand_id", "pdb_ins_code"):
            del scheme[name]
    evidence = {
        "entities": [["1", "water"]], "asymmetries": [["W", "1"]],
        "atom_site": {
            "id": sequence.copy(), "pdbx_PDB_model_num": ["1"] * count,
            "label_entity_id": ["1"] * count, "label_asym_id": ["W"] * count,
            "label_comp_id": ["HOH"] * count, "auth_seq_id": sequence.copy(),
            "auth_comp_id": ["HOH"] * count, "auth_asym_id": ["A"] * count,
            "pdbx_PDB_ins_code": insertion,
        },
        "nonpoly_scheme": scheme,
        "nonpoly_scheme_nulls": {
            name: (["."] * count if name == "pdb_ins_code" else [""] * count)
            for name in scheme
        },
    }
    assert _consistent_scheme(evidence)
    # Count work rather than host timing: resolve missing coordinate columns
    # once, and never construct N-element defaults for each of the N rows.
    assert insertion.availability_checks == 1
    assert scheme.discarded_default_slots == 0
    scheme["pdb_seq_num"][-1] = "unobserved"
    assert not _consistent_scheme(evidence)
