import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import oracle from "../../../../tests/fixtures/profiles/boundaries.json";
import { profileComparison } from "../ligandProfiles/comparison";
import { ProfileComparison } from "../ligandProfiles/ProfileComparison";
import { parseProfileRegistry } from "../ligandProfiles/validate";
import type { DescriptorDefinition, DescriptorReport } from "../ligandProperties/types";
import type { ProfileInputSnapshot, ProfileRegistry } from "../ligandProfiles/types";

const registry = parseProfileRegistry(metadata);
function input(overrides: Record<string, number> = {}): ProfileInputSnapshot {
  const source = { entry_id: "A", source_artifact_id: "current-A", instance_id: "instance-A", atom_ids: [1, 2, 3] };
  const values: Record<string, number> = { ...oracle.base_values, ...overrides };
  const report: DescriptorReport = { schema_version: 1, input_hash: "b".repeat(64), ...registry.descriptor_method,
    created_at: "2026-11-17T00:00:00Z", model_status: "qualified", model_reason: null, contains_formally_charged_atoms: false,
    provenance: [], coverage: registry.descriptors.map(definition => definition.id),
    values: registry.descriptors.map(definition => ({ descriptor_id: definition.id, value: values[definition.id], status: "ready", reason: null })) };
  return { projectId: "P", source, originalArtifactId: "original-A", ownerEpoch: 1, status: "current",
    profileRegistryVersion: registry.registry_version, isCurrent: () => true,
    descriptorRegistry: { ...registry.descriptor_method, definitions: [...registry.descriptors] as DescriptorDefinition[] },
    binding: { source: structuredClone(source), binding_key: "a".repeat(64), status: "ready", reason: null, progress: 100, report } };
}
const compare = (snapshot: ProfileInputSnapshot, id = "ro5", catalog = registry) => profileComparison(catalog, id, { capture: () => snapshot });
afterEach(cleanup);

describe("one qualified comparison projection", () => {
  for (const profile of registry.profiles.filter(profile => profile.availability === "available")) {
    it(`projects exactly the required axes for ${profile.id}`, () => {
      const result = compare(input(), profile.id);
      expect(result.reason).toBeNull();
      expect(result.rows.map(row => row.axis.descriptor_id)).toEqual(registry.axes
        .filter(axis => profile.required_descriptor_ids.includes(axis.descriptor_id)).map(axis => axis.descriptor_id));
      expect(result.rows).toHaveLength(new Set(profile.required_descriptor_ids).size);
      expect(result.rows.every(row => Object.isFrozen(row) && Object.isFrozen(row.criteria))).toBe(true);
      expect(result.evaluation?.identity?.inputHash).toBe("b".repeat(64));
    });
  }
  it("captures one authority and rejects retirement during projection", () => {
    const snapshot = input(), capture = vi.fn(() => snapshot);
    expect(profileComparison(registry, "ro5", { capture }).rows).toHaveLength(4); expect(capture).toHaveBeenCalledTimes(1);
    let current = true;
    const retiring = { ...snapshot, isCurrent: () => { const observed = current; current = false; return observed; } };
    const result = compare(retiring);
    expect(result.rows).toHaveLength(0); expect(result.reason).toBe("profile_input_owner_retired");
  });
  it("retains both Teague MW bounds in one row", () => {
    const row = compare(input(), "teague-lead-range").rows.find(row => row.axis.descriptor_id === "molecular_weight")!;
    expect(row.criteria.map(value => [value.constraint.operator, value.constraint.limit])).toEqual([["ge", 100], ["le", 350]]);
  });
  it("uses catalog axis order even when a valid profile lists axes in another order", () => {
    const catalog = parseProfileRegistry({ ...registry, profiles: registry.profiles.map(profile => profile.id === "ro5"
      ? { ...profile, axis_ids: [...profile.axis_ids].reverse() } : profile) });
    expect(compare(input(), "ro5", catalog).rows.map(row => row.axis.id)).toEqual(registry.axes
      .filter(axis => registry.profiles.find(profile => profile.id === "ro5")!.required_descriptor_ids.includes(axis.descriptor_id))
      .map(axis => axis.id));
  });
  it("keeps true zero, negative logP and both clipping directions with raw values", () => {
    const result = compare(input({ hbd: 0, calculated_logp: -20, molecular_weight: 2000 }));
    expect(result.rows.find(row => row.axis.descriptor_id === "hbd")?.value).toBe(0);
    expect(result.rows.find(row => row.axis.descriptor_id === "calculated_logp")).toMatchObject({ value: -20, normalized: 0, clipped: "low" });
    expect(result.rows.find(row => row.axis.descriptor_id === "molecular_weight")).toMatchObject({ value: 2000, normalized: 1, clipped: "high" });
    expect(result.evaluation?.status).toBe("fail");
  });
  for (const mode of ["missing", "duplicate"] as const) it(`reports ${mode} axis definitions explicitly`, () => {
    const original = registry.profiles.find(profile => profile.id === "ro5")!;
    const ids = original.axis_ids.filter(id => registry.axes.find(axis => axis.id === id)?.descriptor_id !== "molecular_weight");
    const axis = registry.axes.find(axis => axis.descriptor_id === "molecular_weight")!;
    const catalog: ProfileRegistry = { ...registry,
      axes: mode === "duplicate" ? [...registry.axes, { ...axis, id: "duplicate-mw" }] : registry.axes,
      profiles: registry.profiles.map(profile => profile.id === "ro5" ? { ...profile,
        axis_ids: mode === "duplicate" ? [...original.axis_ids, "duplicate-mw"] : ids } : profile) };
    expect(compare(input(), "ro5", catalog)).toMatchObject({ rows: [], reason: "profile_axis_definition_missing_or_ambiguous" });
  });
  it("withholds numbers for preview and exact source disagreement", () => {
    const snapshot = input();
    expect(compare({ ...snapshot, status: "preview" }).rows.every(row => row.value === null)).toBe(true);
    snapshot.binding!.source.instance_id = "other-instance";
    expect(compare(snapshot).rows.every(row => row.value === null && row.normalized === null)).toBe(true);
  });
  it("retains explicit preview semantics while the molecular owner is paused", () => {
    const result = compare({ ...input(), status: "preview", isCurrent: () => false });
    expect(result.reason).toBeNull(); expect(result.evaluation?.status).toBe("preview");
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every(row => row.value === null && row.normalized === null)).toBe(true);
  });
  it("withholds Teague numbers when its source domain is unsupported", () => {
    const snapshot = input(); snapshot.binding!.report!.contains_formally_charged_atoms = true;
    const result = compare(snapshot, "teague-lead-range");
    expect(result.evaluation?.domain).toBe("unavailable");
    expect(result.rows.every(row => row.value === null && row.normalized === null)).toBe(true);
  });
});

describe("accessible plot and exact equivalent table", () => {
  it("keeps two-axis comparisons open with a focusable disclosure for exact multi-bound criteria", async () => {
    const result = compare(input(), "teague-lead-range"), view = render(<ProfileComparison comparison={result} />);
    expect(view.container.querySelector("polygon")).toBeNull();
    expect(view.container.querySelectorAll(".comparison-segment")).toHaveLength(1);
    expect(view.container.querySelectorAll(".comparison-point")).toHaveLength(2);
    expect(screen.getByRole("img")).toHaveAccessibleName("Current ligand profile comparison");
    await userEvent.tab();
    expect(screen.getByText("Values and criteria")).toHaveFocus();
    await userEvent.click(screen.getByText("Values and criteria"));
    const table = screen.getByRole("table", { name: "Exact profile comparison values" });
    const mw = within(table).getByRole("row", { name: /Molecular weight/ });
    expect(within(mw).getByText("250 g/mol")).toBeVisible();
    expect(within(mw).getByText("≥ 100 g/mol · Met")).toBeVisible();
    expect(within(mw).getByText("≤ 350 g/mol · Met")).toBeVisible();
  });
  it("closes complete passing and failing polygons using only the projected rows", () => {
    const view = render(<ProfileComparison comparison={compare(input())} />);
    expect(view.container.querySelectorAll("polygon")).toHaveLength(1);
    expect(view.container.querySelectorAll(".comparison-point")).toHaveLength(4);
    view.rerender(<ProfileComparison comparison={compare(input({ molecular_weight: 501 }))} />);
    expect(view.container.querySelectorAll("polygon")).toHaveLength(1);
  });
  it("leaves partial gaps without closing or bridging them", async () => {
    const snapshot = input(), report = snapshot.binding!.report!;
    report.values = report.values.map(value => value.descriptor_id === "hbd"
      ? { ...value, value: null, status: "unavailable", reason: "independent_missing_hbd" } : value);
    const result = compare(snapshot), view = render(<ProfileComparison comparison={result} />);
    expect(view.container.querySelector("polygon")).toBeNull();
    expect(view.container.querySelectorAll(".comparison-point")).toHaveLength(3);
    expect(view.container.querySelectorAll(".comparison-segment")).toHaveLength(2);
    await userEvent.click(screen.getByText("Values and criteria"));
    expect(screen.getByText("independent missing hbd")).toBeVisible();
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(4);
  });
});
