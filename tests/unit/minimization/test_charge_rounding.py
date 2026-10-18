from __future__ import annotations

from pathlib import Path

import pytest
from molweave_core.minimization.contracts import CalculationError
from molweave_core.minimization.parameterization import normalize_charge_rounding


def test_small_native_rounding_residual_is_explicit_and_raw_evidence_retained(
    tmp_path: Path,
) -> None:
    path = tmp_path / "charged.mol2"
    text = (
        "@<TRIPOS>ATOM\n1 C000 0 0 0 c3 1 LIG -0.1001\n"
        "2 H001 1 0 0 hc 1 LIG 0.1000\n@<TRIPOS>BOND\n1 1 2 1\n"
    )
    path.write_text(text)
    record = normalize_charge_rounding(path, 0)
    assert record["raw_total_e"] == pytest.approx(-0.0001)
    assert record["uniform_offset_e"] == pytest.approx(0.00005)
    assert (tmp_path / "charged.raw.mol2").read_text() == text
    charges = [float(line.split()[8]) for line in path.read_text().splitlines()[1:3]]
    assert sum(charges) == pytest.approx(0, abs=1e-12)
    assert charges == pytest.approx([-0.10005, 0.10005])


@pytest.mark.parametrize("charge", ["0.5", "nan", "inf"])
def test_rounding_normalization_cannot_repair_wrong_charge_or_nonfinite_data(
    tmp_path: Path, charge: str
) -> None:
    path = tmp_path / "charged.mol2"
    text = f"@<TRIPOS>ATOM\n1 C000 0 0 0 c3 1 LIG {charge}\n@<TRIPOS>BOND\n"
    path.write_text(text)
    with pytest.raises(CalculationError):
        normalize_charge_rounding(path, 0)
    assert path.read_text() == text
    assert not (tmp_path / "charged.raw.mol2").exists()
