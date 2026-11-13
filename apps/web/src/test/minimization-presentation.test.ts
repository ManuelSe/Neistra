import { expect, it } from "vitest";
import type { QuickMinimizationParameters, QuickMinimizationReport, Selection } from "../api/types";
import { fieldOmissionLabels, quickSelectionError, quickTargets } from "../minimization/presentation";
import { molecularEntry, molecularProject } from "./molecular-fixtures";

const requested: Selection = { schema_version: 1, granularity: "atom", source: "viewer", atoms: [{ structure_id: "protein", atom_id: 1 }] };
const parameters: QuickMinimizationParameters = {
  schema_version: 1, model: "quick-local-v1", mode: "automatic", context_entry_ids: [], expand_hydrogens: true,
  allow_repair: true, max_iterations: 500, requested_selection: requested,
  selection: { ...requested, atoms: [...requested.atoms, { structure_id: "protein", atom_id: 2 }] },
  captured_inputs: [{ entry_id: "protein", artifact_id: "input", sha256: "a".repeat(64), conformer_id: 1, atom_ids: Array.from({ length: 1000 }, (_, i) => i + 1) }],
};
function report(): QuickMinimizationReport {
  return { schema_version: 1, model: "quick-local-v1", parameters, outcome: "improved", reason: "Local improvement",
    method: "MMFF94", coverage: "complete", units: { energy: "kcal/mol" }, initial_energy: 1, final_energy: 0.1,
    maximum_gradient: 0.2, gradient_tolerance: 0.01, iterations: 2, evaluations: 3, maximum_displacement: 0.1,
    rms_displacement: 0.1, residual_clashes: 0, movable_count: 2, fixed_count: 3, warnings: [],
    elapsed_seconds: 1, assumptions: [], helper_count: 4, cap_count: 2, modeled_atoms: { protein: [1, 2, 3, 4, 5] },
    bonded_geometry_verified: true, planar_geometry_verified: true, geometry_violations: [], energy_reference: "model",
    geometry_step_tolerance: 0.01, settled_geometry_steps: 0, timings: {}, termination_kind: "iteration_limit" };
}

it("distinguishes requested, resolved and actual model membership without counting captured inputs as fixed context", () => {
  expect(quickTargets(requested, undefined)).toMatchObject({ requested: 1, movable: null, fixed: null, helpers: null });
  expect(quickTargets(undefined, parameters)).toMatchObject({ requested: 1, movable: 2, expandedHydrogens: 1, fixed: null, modeledEntries: [] });
  const actual = quickTargets(undefined, parameters, report());
  expect(actual).toEqual({ requested: 1, movable: 2, expandedHydrogens: 1, fixed: 3, helpers: 4, caps: 2,
    modeledEntries: [{ entryId: "protein", count: 5 }], issue: null });
  expect(actual.helpers).toBe(4); // cap groups are never added as extra helper atoms
});

it("does not fabricate actual model counts for a blocked result or malformed target metadata", () => {
  const blocked = { ...report(), method: null, modeled_atoms: {}, movable_count: 0, fixed_count: 0 };
  expect(quickTargets(undefined, parameters, blocked)).toMatchObject({ requested: 1, movable: 2, fixed: null });
  expect(quickTargets(undefined, { ...parameters, requested_selection: { ...requested, atoms: [{ structure_id: "protein", atom_id: 99 }] } }).issue).toContain("inconsistent");
  expect(quickTargets(undefined, { ...parameters, expand_hydrogens: false }).issue).toContain("inconsistent");
  expect(quickTargets(undefined, { ...parameters, selection: { ...requested, atoms: [requested.atoms[0], requested.atoms[0]] } }).issue).toContain("unavailable");
  expect(quickTargets(undefined, parameters, { ...report(), helper_count: 1, cap_count: 2 }).fixed).toBeNull();
  expect(quickTargets(undefined, parameters, { ...report(), modeled_atoms: { protein: [1, 2] } }).issue).toContain("inconsistent");
});

it("validates recapture against current atom membership and locks while allowing hidden fixed context elsewhere", () => {
  const p = molecularProject([molecularEntry("protein", "Protein", "protein"), { ...molecularEntry("fixed", "Fixed", "ligand"), locked: true, visible: false }]);
  expect(quickSelectionError(p, requested)).toBeNull();
  expect(quickSelectionError(p, { ...requested, atoms: [] })).toContain("Select");
  expect(quickSelectionError(p, { ...requested, atoms: [{ structure_id: "missing", atom_id: 1 }] })).toContain("unavailable entry");
  expect(quickSelectionError(p, { ...requested, atoms: [{ structure_id: "protein", atom_id: 99 }] })).toContain("unavailable atom");
  p.entries[0].locked = true;
  expect(quickSelectionError(p, requested)).toContain("Unlock");
});

it("scopes omission wording so supported native electrostatics are not reported as absent", () => {
  expect(fieldOmissionLabels.unsupported_site_electrostatics).toContain("involving unsupported sites");
  expect(fieldOmissionLabels.uff_electrostatics).toContain("UFF");
  expect(fieldOmissionLabels.current_connectivity).toContain("current connectivity");
});
