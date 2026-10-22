"""One explicit H with bounded local valence/charge rules, never pKa prediction."""

from typing import Any

from rdkit import Chem

from molweave_core.editing.hydrogen import (
    HydrogenBuilder,
    HydrogenReport,
    apply_hydrogen_proposal,
)
from molweave_core.hydrogen_protection import protection_facts
from molweave_core.molecular import InferenceRecord, MolecularWarning, NormalizedStructureV1

# Separate operation admission from the legacy additive/draft-building profile.
VALENCES = {
    ("C", 0): 4,
    ("N", 0): 3,
    ("N", 1): 4,
    ("O", -1): 1,
    ("O", 0): 2,
    ("O", 1): 3,
    ("S", -1): 1,
    ("S", 0): 2,
    ("S", 1): 3,
}
TRANSITIONS = {("N", 0): 1, ("O", -1): 0, ("O", 0): 1, ("S", -1): 0, ("S", 0): 1}
NEIGHBORS = frozenset({"H", "C", "N", "O", "S", "F", "Cl", "Br", "I"})


def add_one_hydrogen(
    before: NormalizedStructureV1,
    parent_id: int,
    *,
    next_atom_id: int,
    next_bond_id: int,
    atom_limit: int,
) -> tuple[NormalizedStructureV1, HydrogenReport, tuple[MolecularWarning, ...]]:
    builder = HydrogenBuilder(before)
    parent = builder.atoms[parent_id]
    if parent.formal_charge is None:
        raise ValueError("+H requires an assigned parent formal charge; no change.")
    state = (parent.element, parent.formal_charge)
    ceiling = VALENCES.get(state)
    if ceiling is None:
        raise ValueError("+H supports only assigned bounded C/N/O/S states; parent unchanged.")
    facts = protection_facts(before)
    incident = builder.adjacency[parent_id]
    for atom_id in {parent_id, *[i for i, _ in incident]}:
        atom = builder.atoms[atom_id]
        fact = facts.get(atom_id)
        if not fact or not fact.matches(atom) or not fact.ordinary:
            raise ValueError(
                "+H requires ordinary known local isotope/radical identity; no change."
            )
        if atom.element not in NEIGHBORS or atom.formal_charge is None:
            raise ValueError(
                "+H cannot interpret unknown or unsupported local chemistry; no change."
            )
    for neighbor, bond in incident:
        atom = builder.atoms[neighbor]
        if bond.aromatic or bond.order not in {1.0, 2.0, 3.0}:
            raise ValueError("+H requires known nonaromatic incident bond orders; no change.")
        if atom.element == "H" and (
            len(builder.adjacency[neighbor]) != 1 or atom.formal_charge != 0 or bond.order != 1.0
        ):
            raise ValueError("+H cannot reinterpret charged or nonterminal H; no change.")
    valence = sum(float(b.order) for _, b in incident if b.order is not None)
    charge = parent.formal_charge
    if valence > ceiling:
        raise ValueError("+H would exceed this supported valence; parent unchanged.")
    if valence == ceiling:
        new_charge = TRANSITIONS.get(state)
        if new_charge is None:
            raise ValueError("No further supported +H addition is possible at this valence/charge.")
        if any(b.order != 1.0 for _, b in incident) or any(
            b.aromatic or b.order != 1.0
            for neighbor, _ in incident
            for _, b in builder.adjacency[neighbor]
        ):
            raise ValueError(
                "+H charge transitions exclude aromatic/conjugated environments; no change."
            )
        charge = new_charge
    if parent.element == "S" and any(b.order != 1.0 for _, b in incident):
        raise ValueError("+H sulfur supports ordinary single-bond states only; no change.")
    draft = before.model_copy(
        update={
            "atoms": [
                a.model_copy(
                    update={
                        "formal_charge": charge,
                        "inferred_fields": sorted(set(a.inferred_fields) | {"formal_charge"}),
                    }
                )
                if a.id == parent_id and charge != parent.formal_charge
                else a
                for a in before.atoms
            ]
        }
    )
    builder = HydrogenBuilder(draft)
    _, geometry = builder.automatic_configuration(parent_id, bounded_sulfur=True)
    proposal = builder.propose(
        [parent_id],
        count=1,
        geometry=geometry,
        atom_limit=atom_limit,
        automatic_geometry=True,
    )
    if proposal.report.added_hydrogen_count != 1:
        reason = (
            proposal.report.diagnostics[0].message
            if proposal.report.diagnostics
            else "Placement unavailable."
        )
        raise ValueError(f"+H made no change: {reason}")
    after, warnings = apply_hydrogen_proposal(
        draft,
        proposal,
        next_atom_id=next_atom_id,
        next_bond_id=next_bond_id,
        operation="hydrogens.add_one",
        require_ordinary_stereo=True,
        require_consistent_stereo=True,
    )
    if parent.element == "S" and charge == 1 and len(incident) == 2:
        # Keep H explicit: the toolkit can miss sulfonium stereo with an implicit H.
        context, mapping = HydrogenBuilder(after).chemical_context(parent_id)
        find_centres: Any = Chem.FindMolChiralCenters
        if mapping[parent_id] in {idx for idx, _ in find_centres(context, includeUnassigned=True)}:
            raise ValueError("+H would choose an undetermined sulfur stereocentre; no change.")
    inference = InferenceRecord(
        code="model_single_hydrogen",
        atom_ids=[parent_id, next_atom_id],
        bond_ids=[next_bond_id],
        message=f"single-H v1; parent charge {parent.formal_charge} to {charge}; "
        f"geometry={geometry}; one explicit H; bounded local rules, no pKa or preparation claim.",
    )
    if charge != parent.formal_charge:
        charge_warning = MolecularWarning(
            code="model_hydrogen_charge_change",
            operation="model.hydrogens.add_one",
            field=f"atoms.{parent_id}.formal_charge",
            message=f"This +H operation changed atom {parent_id} formal charge "
            f"from {parent.formal_charge} to {charge}; bounded local rules, no pKa prediction.",
        )
        warnings = (*warnings, charge_warning)
        after = after.model_copy(update={"warnings": [*after.warnings, charge_warning]})
    return (
        after.model_copy(update={"inferences": [*after.inferences, inference]}),
        proposal.report,
        warnings,
    )
