import { describe, expect, it } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import oracle from "../../../../tests/fixtures/profiles/boundaries.json";
import molecularCases from "../../../../tests/fixtures/profiles/molecular-cases.json";
import { evaluateProfile, profileAxisValues, profileDescriptorDependencies } from "../ligandProfiles/evaluate";
import { parseProfileRegistry, profileConstraints } from "../ligandProfiles/validate";
import type { ProfileInputSnapshot, ProfileRegistry } from "../ligandProfiles/types";
import type { DescriptorDefinition, DescriptorReport, PropertyCurrent } from "../ligandProperties/types";

const registry = parseProfileRegistry(metadata);
const baseValues: Record<string, number> = oracle.base_values;
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer V)[] ? Mutable<V>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type Draft = Mutable<ProfileRegistry>;
function draft(): Draft { return structuredClone(registry) as unknown as Draft; }
function snapshot(values: Record<string, number> = baseValues): ProfileInputSnapshot {
  const source = { entry_id: "entry-A", source_artifact_id: "normalized-A", instance_id: "instance-A", atom_ids: [1, 2, 3] };
  const method = registry.descriptor_method;
  const report: DescriptorReport = { schema_version: 1, input_hash: "b".repeat(64), ...method,
    created_at: "2026-11-17T12:00:00Z", model_status: "qualified", model_reason: null,
    contains_formally_charged_atoms: false, provenance: ["qualified current test binding"],
    coverage: registry.descriptors.map(item => item.id),
    values: registry.descriptors.map(item => ({ descriptor_id: item.id, status: "ready", value: values[item.id], reason: null })) };
  return { projectId: "project-A", source, originalArtifactId: "original-A", ownerEpoch: 4,
    profileRegistryVersion: registry.registry_version, status: "current", isCurrent: () => true,
    descriptorRegistry: { ...method, definitions: structuredClone(registry.descriptors) as DescriptorDefinition[] },
    binding: { source: structuredClone(source), binding_key: "a".repeat(64), status: "ready", reason: null, progress: 100, report } };
}
function binding(input: ProfileInputSnapshot): PropertyCurrent { return input.binding!; }
function report(input: ProfileInputSnapshot): DescriptorReport { return binding(input).report!; }
function value(input: ProfileInputSnapshot, id: string) { return report(input).values.find(item => item.descriptor_id === id)!; }
function evaluate(input: ProfileInputSnapshot, profile = "ro5", selectedRegistry = registry) {
  return evaluateProfile(selectedRegistry, profile, { capture: () => input });
}
function remove(input: ProfileInputSnapshot, id: string): void {
  const existing = report(input);
  existing.values = existing.values.filter(item => item.descriptor_id !== id);
  existing.coverage = existing.coverage.filter(key => key !== id);
}

describe("independent source-limit specimens", () => {
  for (const specimen of molecularCases.cases) for (const [profile, expected] of Object.entries(specimen.expected_profiles)) {
    it(`qualified ${specimen.id}: ${profile}`, () => {
      const input = snapshot(specimen.values);
      input.source.atom_ids = Array.from({ length: specimen.values.heavy_atom_count }, (_, index) => index + 1);
      binding(input).source = structuredClone(input.source);
      report(input).input_hash = specimen.input_hash;
      report(input).contains_formally_charged_atoms = specimen.contains_formally_charged_atoms;
      const result = evaluate(input, profile);
      expect(result.status).toBe(expected); expect(result.identity?.inputHash).toBe(specimen.input_hash);
    });
  }
  for (const sample of oracle.samples) it(sample.id, () => {
    const result = evaluate(snapshot(sample.values), sample.profile_id);
    expect(result.status).toBe(sample.status);
    expect(result.complete).toBe(true); expect(result.domain).toBe("applicable");
    expect(result.criteria.map(row => ({ descriptor_id: row.constraint.descriptor_id, operator: row.constraint.operator,
      limit: row.constraint.limit, status: row.status }))).toEqual(sample.criteria);
    expect(result.criteria.every(row => row.value === sample.values[row.constraint.descriptor_id as keyof typeof sample.values])).toBe(true);
    expect(result.identity?.inputHash).toBe("b".repeat(64));
  });
  for (const control of oracle.operator_controls) it(`generic ${control.operator} at ${control.value}`, () => {
    const document = draft();
    document.profiles = document.profiles.filter(profile => profile.id === "ro5");
    const constraint = document.constraints.find(item => item.id === "mw-le-500")!;
    constraint.operator = control.operator as "lt" | "le" | "gt" | "ge"; constraint.limit = control.limit;
    const filter = document.profiles[0].default_filter_ranges.find(item => item.descriptor_id === "molecular_weight")!;
    const isLower = control.operator === "gt" || control.operator === "ge";
    const bound = { value: control.limit, inclusive: control.operator === "le" || control.operator === "ge" };
    filter.minimum = isLower ? bound : null; filter.maximum = isLower ? null : bound;
    document.profiles[0].definition_version = "test-operator-v1";
    const selected = parseProfileRegistry(document), input = snapshot({ ...baseValues, molecular_weight: control.value });
    expect(evaluate(input, "ro5", selected).status).toBe(control.expected);
  });
  it("keeps a failing value that display rounding would render at the boundary", () => {
    const sample = oracle.samples.find(item => item.id === "ro5:molecular_weight:le:500:above")!;
    expect(sample.values.molecular_weight.toFixed(0)).toBe("500");
    expect(evaluate(snapshot(sample.values)).status).toBe("fail");
  });
});

describe("current input authority", () => {
  for (const profile of registry.profiles.filter(item => item.availability === "available")) {
    it(`rejects agreeing source and binding with zero atom ID: ${profile.id}`, () => {
      const input = snapshot(); input.source.atom_ids = [0];
      binding(input).source = structuredClone(input.source);
      const result = evaluate(input, profile.id);
      expect(result.status).toBe("error"); expect(result.reason).toBe("profile_input_identity_invalid");
      expect(result.complete).toBe(false); expect(result.identity).toBeNull();
      expect(result.criteria.every(row => row.value === null)).toBe(true);
      expect(profileAxisValues(registry, profile.id, { capture: () => input })
        .every(axis => axis.value === null && axis.normalized === null)).toBe(true);
    });
  }
  it("accepts positive canonical atom IDs beginning at one for every available profile and its axes", () => {
    const input = snapshot(); expect(input.source.atom_ids).toEqual([1, 2, 3]);
    for (const profile of registry.profiles.filter(item => item.availability === "available")) {
      const result = evaluate(input, profile.id);
      expect(result.status).toBe("pass"); expect(result.complete).toBe(true);
      expect(result.identity?.source.atom_ids).toEqual([1, 2, 3]);
      expect(profileAxisValues(registry, profile.id, { capture: () => input })
        .find(axis => axis.axis.descriptor_id === "molecular_weight")?.value).toBe(250);
    }
  });
  it("emits exact source, original, owner and definition identities", () => {
    const input = snapshot(), result = evaluate(input);
    expect(result.identity).toEqual({ projectId: "project-A", source: input.source, originalArtifactId: "original-A",
      ownerEpoch: 4, bindingKey: "a".repeat(64), inputHash: "b".repeat(64), registryVersion: registry.registry_version,
      profileId: "ro5", profileVersion: "ro5-v1", method: registry.descriptor_method });
    expect(Object.isFrozen(result.identity?.source.atom_ids)).toBe(true);
  });
  for (const status of ["stale", "preview", "error", "unavailable", "cancelled"] as const) it(`withholds old numbers for ${status}`, () => {
    const input = { ...snapshot(), status };
    const result = evaluate(input);
    expect(result.status).toBe(status); expect(result.identity).toBeNull();
    expect(result.criteria.every(row => row.value === null)).toBe(true);
    expect(profileAxisValues(registry, "ro5", { capture: () => input }).every(axis => axis.value === null && axis.normalized === null)).toBe(true);
  });
  it("keeps preview explicit even when the molecular owner is paused", () => {
    expect(evaluate({ ...snapshot(), status: "preview", isCurrent: () => false }).status).toBe("preview");
  });
  for (const field of ["source_artifact_id", "entry_id", "instance_id"] as const) it(`rejects another ${field}`, () => {
    const input = snapshot(); binding(input).source[field] = "old";
    expect(evaluate(input).status).toBe("stale"); expect(evaluate(input).identity).toBeNull();
  });
  it("rejects another canonical membership and malformed binding key", () => {
    const input = snapshot(); binding(input).source.atom_ids = [1, 2, 4];
    expect(evaluate(input).reason).toBe("profile_source_binding_mismatch");
    binding(input).source = structuredClone(input.source); binding(input).binding_key = "unqualified";
    expect(evaluate(input).reason).toBe("profile_source_binding_mismatch");
  });
  it("does not accept a retired owner, including a final synchronous ABA check", () => {
    expect(evaluate({ ...snapshot(), isCurrent: () => false }).status).toBe("stale");
    let reads = 0;
    const result = evaluate({ ...snapshot(), isCurrent: () => ++reads < 3 });
    expect(reads).toBe(3); expect(result.status).toBe("stale");
    expect(result.criteria.every(row => row.value === null)).toBe(true); expect(result.identity).toBeNull();
  });
  it("rejects malformed owner epoch and raw reports without authority", () => {
    expect(evaluate({ ...snapshot(), ownerEpoch: -1 }).reason).toBe("profile_input_identity_invalid");
    expect(evaluateProfile(registry, "ro5", report(snapshot()) as unknown as { capture: () => ProfileInputSnapshot }).status).toBe("error");
  });
  for (const field of ["implementation_version", "policy_version", "library_version"] as const) it(`rejects current-method mismatch: ${field}`, () => {
    const input = snapshot(); input.descriptorRegistry[field] = "different";
    expect(evaluate(input).reason).toBe("profile_descriptor_method_mismatch");
    const other = snapshot(); report(other)[field] = "different";
    expect(evaluate(other).reason).toBe("profile_report_qualification_failed");
  });
  it("checks the scientific catalog mapping rather than only the header versions", () => {
    const input = snapshot(); input.descriptorRegistry.definitions[0].method = "other method";
    expect(evaluate(input).reason).toBe("profile_descriptor_method_mismatch");
  });
  it("retire old profile definitions and emits a new identity for a new registry version", () => {
    const document = draft(); document.registry_version = "ligand-profiles-v2";
    document.profiles[0].definition_version = "ro5-v2";
    const next = parseProfileRegistry(document), oldInput = snapshot();
    expect(evaluate(oldInput, "ro5", next).status).toBe("stale");
    const result = evaluate({ ...oldInput, profileRegistryVersion: next.registry_version }, "ro5", next);
    expect(result.status).toBe("pass"); expect(result.identity?.profileVersion).toBe("ro5-v2");
    expect(result.identity?.registryVersion).toBe("ligand-profiles-v2");
  });
});

describe("partial, missing and source-domain outcomes", () => {
  it("preserves current known values while required work is pending", () => {
    const input = snapshot(); remove(input, "hbd"); binding(input).status = "pending";
    const result = evaluate(input);
    expect(result.status).toBe("pending"); expect(result.complete).toBe(false);
    expect(result.criteria.find(row => row.constraint.descriptor_id === "hbd")?.status).toBe("pending");
    expect(result.criteria.find(row => row.constraint.descriptor_id === "molecular_weight")?.value).toBe(250);
    value(input, "molecular_weight").value = 600;
    const violation = evaluate(input); expect(violation.status).toBe("fail"); expect(violation.complete).toBe(false);
  });
  it("passes a complete profile subset while unrelated descriptors continue calculating", () => {
    const input = snapshot(); remove(input, "molar_refractivity"); binding(input).status = "pending";
    expect(evaluate(input).status).toBe("pass"); expect(evaluate(input).complete).toBe(true);
  });
  it("distinguishes absent, failed and unavailable outcomes from a genuine zero", () => {
    const input = snapshot(); remove(input, "hbd");
    expect(evaluate(input).status).toBe("unavailable");
    expect(evaluate(input).criteria.find(row => row.constraint.descriptor_id === "hbd")?.status).toBe("missing");
    const failed = snapshot(); Object.assign(value(failed, "hbd"), { status: "error", value: null, reason: "calculation_failed" });
    expect(evaluate(failed).status).toBe("error");
    Object.assign(value(failed, "hbd"), { status: "unavailable", reason: "unsupported_chemistry" });
    expect(evaluate(failed).status).toBe("unavailable");
    const zero = snapshot({ ...baseValues, hbd: 0 });
    expect(evaluate(zero).status).toBe("pass");
    expect(evaluate(zero).criteria.find(row => row.constraint.descriptor_id === "hbd")?.value).toBe(0);
  });
  it("keeps missing bindings and reports explicit without manufacturing empty passes", () => {
    expect(evaluate({ ...snapshot(), binding: undefined, status: "pending" }).status).toBe("pending");
    const input = snapshot(); binding(input).report = null;
    expect(evaluate(input).status).toBe("unavailable");
    binding(input).status = "pending"; expect(evaluate(input).status).toBe("pending");
    for (const id of ["cns-mpo", "scaffold-som"]) {
      const result = evaluate(input, id); expect(result.status).toBe("unavailable");
      expect(result.reason).toBeTruthy(); expect(result.complete).toBe(false); expect(result.criteria).toEqual([]);
    }
  });
  for (const charged of [true, null] as const) it(`refuses Teague domain when charge presence is ${charged}`, () => {
    const input = snapshot(); report(input).contains_formally_charged_atoms = charged;
    value(input, "formal_charge").value = 0; // Net neutrality cannot establish absence of charged atoms.
    const result = evaluate(input, "teague-lead-range");
    expect(result.status).toBe("unavailable"); expect(result.domain).toBe("unavailable"); expect(result.complete).toBe(false);
    value(input, "molecular_weight").value = 400;
    const violation = evaluate(input, "teague-lead-range");
    expect(violation.status).toBe("unavailable"); expect(violation.criteria.some(row => row.status === "fail")).toBe(true);
    expect(evaluate(input, "ro5").status).toBe("pass");
  });
  it("accepts the explicit false fact for Teague without altering its descriptors", () => {
    const input = snapshot(), before = structuredClone(report(input));
    expect(evaluate(input, "teague-lead-range").status).toBe("pass");
    expect(report(input)).toEqual(before);
  });
  it("rejects a false charge-presence fact contradicted by an included ready nonzero charge", () => {
    const input = snapshot({ ...baseValues, formal_charge: 1 });
    expect(evaluate(input, "teague-lead-range").reason).toBe("profile_charge_fact_contradiction");
    expect(evaluate(input).criteria.every(row => row.value === null)).toBe(true);
    report(input).contains_formally_charged_atoms = true;
    expect(evaluate(input).status).toBe("pass");
  });
  it("does not demand missing formal charge or infer a charge-presence fact from neutral net charge", () => {
    const absent = snapshot(); remove(absent, "formal_charge");
    expect(evaluate(absent, "teague-lead-range").status).toBe("pass");
    const unknown = snapshot(); report(unknown).contains_formally_charged_atoms = null;
    expect(evaluate(unknown, "teague-lead-range").reason).toBe("source_profile_charge_qualification_missing");
  });
});

describe("scientific values and independent display ranges", () => {
  for (const specimen of molecularCases.partial_cases) {
    it(`preserves independently known values with actual unavailable ${specimen.id} model`, () => {
      const input = snapshot(); input.source.atom_ids = [1];
      binding(input).source = structuredClone(input.source);
      binding(input).report = { ...report(input), input_hash: specimen.input_hash,
        model_status: "unavailable", model_reason: specimen.model_reason,
        contains_formally_charged_atoms: specimen.contains_formally_charged_atoms,
        coverage: [...specimen.coverage], values: structuredClone(specimen.values) as DescriptorReport["values"] };
      for (const profile of registry.profiles.filter(item => item.availability === "available")) {
        const result = evaluate(input, profile.id);
        expect(result.status).toBe("unavailable"); expect(result.complete).toBe(false);
        expect(result.identity?.inputHash).toBe(specimen.input_hash);
        expect(result.criteria.every(row => row.value === null)).toBe(true);
      }
      const axes = profileAxisValues(registry, "ro5", { capture: () => input });
      for (const [id, expected] of Object.entries(specimen.expected_known_values)) {
        const axis = axes.find(item => item.axis.descriptor_id === id)!;
        expect(axis.value).toBe(expected); expect(axis.normalized).not.toBeNull(); expect(axis.reason).toBeNull();
      }
      for (const descriptor of registry.descriptors.filter(item => item.depends_on === "qualified_graph")) {
        expect(axes.find(item => item.axis.descriptor_id === descriptor.id)).toMatchObject({ value: null, normalized: null });
      }
    });
  }
  for (const descriptor of registry.descriptors.filter(item => item.depends_on === "qualified_graph")) {
    it(`rejects unavailable-model contradiction even when only ${descriptor.id} is ready`, () => {
      const input = snapshot(); report(input).model_status = "unavailable"; report(input).model_reason = "unsupported_model";
      for (const definition of registry.descriptors.filter(item => item.depends_on === "qualified_graph")) {
        Object.assign(value(input, definition.id), { status: "unavailable", value: null, reason: "unsupported_model" });
      }
      Object.assign(value(input, descriptor.id), { status: "ready", value: baseValues[descriptor.id], reason: null });
      expect(evaluate(input).reason).toBe("profile_model_dependency_contradiction");
      expect(profileAxisValues(registry, "ro5", { capture: () => input })
        .find(axis => axis.axis.descriptor_id === "molecular_weight"))
        .toMatchObject({ value: null, normalized: null });
    });
  }
  for (const profile of registry.profiles.filter(item => item.availability === "available")) {
    it(`rejects ready graph data from unavailable model: ${profile.id}`, () => {
      const input = snapshot();
      report(input).model_status = "unavailable"; report(input).model_reason = "model_not_qualified";
      const result = evaluate(input, profile.id);
      expect(result.status).toBe("unavailable"); expect(result.complete).toBe(false);
      expect(result.reason).toBe("profile_model_dependency_contradiction");
      expect(result.criteria.every(row => row.value === null)).toBe(true); expect(result.identity).toBeNull();
      expect(profileAxisValues(registry, profile.id, { capture: () => input })
        .find(axis => axis.axis.descriptor_id === "molecular_weight"))
        .toMatchObject({ value: null, normalized: null });
    });
  }
  for (const invalid of [true, false, "1", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it(`withholds malformed molecular weight ${String(invalid)}`, () => {
      const input = snapshot(); value(input, "molecular_weight").value = invalid as unknown as number;
      expect(evaluate(input).reason).toBe("profile_descriptor_value_invalid");
      expect(evaluate(input).criteria.every(row => row.value === null)).toBe(true);
    });
  }
  for (const [id, invalid] of [["hbd", -1], ["hba", 0.5], ["heavy_atom_count", Number.MAX_SAFE_INTEGER + 1],
    ["fraction_sp3", -Number.EPSILON], ["fraction_sp3", 1 + Number.EPSILON]] as const) it(`rejects ${id}=${invalid}`, () => {
    const input = snapshot(); value(input, id).value = invalid;
    expect(evaluate(input).reason).toBe("profile_descriptor_value_invalid");
  });
  it("permits signed formal charge and finite estimates outside radar domains", () => {
    const input = snapshot({ ...baseValues, formal_charge: -2, calculated_logp: -3, molar_refractivity: -20 });
    report(input).contains_formally_charged_atoms = true;
    expect(evaluate(input).status).toBe("pass"); expect(evaluate(input, "doak-outer-envelope").status).toBe("fail");
    const axes = profileAxisValues(registry, "ro5", { capture: () => input });
    expect(axes.find(item => item.axis.descriptor_id === "calculated_logp")).toMatchObject({ value: -3, normalized: 0, clipped: "low" });
    expect(axes.find(item => item.axis.descriptor_id === "molar_refractivity")).toMatchObject({ value: -20, normalized: 0, clipped: "low" });
    value(input, "molecular_weight").value = 1500;
    expect(evaluate(input).status).toBe("fail");
    expect(profileAxisValues(registry, "ro5", { capture: () => input }).find(item => item.axis.descriptor_id === "molecular_weight"))
      .toMatchObject({ value: 1500, normalized: 1, clipped: "high" });
  });
  it("never fills missing axes with zero and keeps related axes adjacent", () => {
    const input = snapshot(); remove(input, "tpsa");
    const axes = profileAxisValues(registry, "ro5", { capture: () => input });
    expect(axes.slice(0, 3).map(item => item.axis.descriptor_id)).toEqual(["hbd", "hba", "tpsa"]);
    expect(axes[2]).toMatchObject({ value: null, normalized: null, clipped: null });
    expect(axes).not.toHaveProperty("area");
  });
  it("withholds malformed coverage, report identity and non-current failures", () => {
    const input = snapshot(); report(input).coverage.reverse(); expect(evaluate(input).status).toBe("unavailable");
    const duplicate = snapshot(); report(duplicate).coverage[1] = report(duplicate).coverage[0];
    expect(evaluate(duplicate).status).toBe("unavailable");
    const badHash = snapshot(); report(badHash).input_hash = "old";
    expect(evaluate(badHash).status).toBe("unavailable");
    const failed = snapshot(); binding(failed).status = "failed";
    expect(evaluate(failed).status).toBe("error"); expect(evaluate(failed).criteria.every(row => row.value === null)).toBe(true);
  });
});

describe("single shared registry and dependencies", () => {
  it("reuses identical central constraint objects for the composite", () => {
    const combined = profileConstraints(registry, "ro5-veber");
    for (const part of ["ro5", "veber"]) for (const constraint of profileConstraints(registry, part)) {
      expect(combined.find(item => item.id === constraint.id)).toBe(constraint);
    }
  });
  it("unions required descriptors in stable catalog order without mutating saved choices", () => {
    const enabled = ["formal_charge"], selected = ["ro5", "veber"];
    expect(profileDescriptorDependencies(registry, selected, enabled)).toEqual([
      "molecular_weight", "formal_charge", "hbd", "hba", "tpsa", "calculated_logp", "rotatable_bond_count",
    ]);
    expect(enabled).toEqual(["formal_charge"]); expect(selected).toEqual(["ro5", "veber"]);
    expect(profileDescriptorDependencies(registry, ["cns-mpo", "scaffold-som"], enabled)).toEqual(enabled);
    expect(() => profileDescriptorDependencies(registry, ["unknown"])).toThrow();
    expect(() => profileDescriptorDependencies(registry, [], ["unknown"])).toThrow();
  });
  it("copies and deeply freezes parsed data; unparsed objects cannot reach evaluation", () => {
    const source = draft(), parsed = parseProfileRegistry(source);
    source.constraints[0].limit = -999;
    expect(parsed.constraints[0].limit).toBe(500); expect(Object.isFrozen(parsed.constraints[0])).toBe(true);
    expect(() => evaluateProfile(metadata as unknown as ProfileRegistry, "ro5", { capture: () => snapshot() })).toThrow(/parseProfileRegistry/);
  });
  for (const mutation of ["operator-array", "unknown-expression", "foreign-reference", "duplicate-id", "cycle", "default-range", "numeric-policy",
    "unknown-fields", "unavailable-empty-pass", "unsafe-limit", "wrong-method", "nonfinite-domain"] as const) it(`refuses malformed registry ${mutation}`, () => {
    const data = draft();
    switch (mutation) {
      case "operator-array": data.constraints[0].operator = ["le"] as unknown as "le"; break;
      case "unknown-expression": data.constraints[0].operator = "execute" as "le"; break;
      case "foreign-reference": data.profiles[0].source_ids = ["foreign"]; break;
      case "duplicate-id": data.sources.push(structuredClone(data.sources[0])); break;
      case "cycle": data.profiles[0].constraint_ids = []; data.profiles[0].component_ids = ["ro5-veber"]; break;
      case "default-range": data.profiles[0].default_filter_ranges[0].maximum = { value: 501, inclusive: true }; break;
      case "numeric-policy": data.axes[0].numeric_rule = "safe_integer"; break;
      case "unknown-fields": Object.assign(data, { expression: "arbitrary" }); break;
      case "unavailable-empty-pass": data.profiles.at(-1)!.availability = "available"; data.profiles.at(-1)!.unavailable_reason = null; break;
      case "unsafe-limit": data.constraints[2].limit = Number.MAX_SAFE_INTEGER + 1; break;
      case "wrong-method": data.descriptors[0].policy_version = "other"; break;
      case "nonfinite-domain": data.axes[0].domain[1] = Number.POSITIVE_INFINITY; break;
    }
    expect(() => parseProfileRegistry(data)).toThrow();
  });
});
