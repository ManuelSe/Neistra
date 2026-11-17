import type { DescriptorDefinition, DescriptorReport, DescriptorValue, PropertySource } from "../ligandProperties/types";
import type { CriterionOutcome, ProfileAxisValue, ProfileConstraint, ProfileDefinition, ProfileEvaluation,
  ProfileEvaluationIdentity, ProfileInputAuthority, ProfileInputSnapshot, ProfileOperator, ProfileRegistry, ProfileStatus } from "./types";
import { profileConstraints } from "./validate";

const digest = /^[0-9a-f]{64}$/;
type InputFailure = { status: Exclude<ProfileStatus, "pass" | "fail">; reason: string };
type QualifiedInput = { snapshot: ProfileInputSnapshot; report: DescriptorReport; values: ReadonlyMap<string, DescriptorValue> };

function current(snapshot: ProfileInputSnapshot): boolean {
  try { return typeof snapshot.isCurrent === "function" && snapshot.isCurrent() === true; }
  catch { return false; }
}
function validSource(source: PropertySource): boolean {
  return !!source && [source.entry_id, source.source_artifact_id, source.instance_id]
    .every(id => typeof id === "string" && id.length > 0 && id.length <= 160)
    && Array.isArray(source.atom_ids) && source.atom_ids.length > 0 && source.atom_ids.length <= 16_384
    && source.atom_ids.every((id, index) => Number.isSafeInteger(id) && id >= 1
      && (index === 0 || id > source.atom_ids[index - 1]));
}
function sameSource(left: PropertySource, right: PropertySource): boolean {
  return validSource(left) && validSource(right) && left.entry_id === right.entry_id
    && left.source_artifact_id === right.source_artifact_id && left.instance_id === right.instance_id
    && left.atom_ids.length === right.atom_ids.length && left.atom_ids.every((id, index) => id === right.atom_ids[index]);
}
function matchingMethod(registry: ProfileRegistry, snapshot: ProfileInputSnapshot): boolean {
  const observed = snapshot.descriptorRegistry, expected = registry.descriptor_method;
  if (!observed || observed.implementation_version !== expected.implementation_version
    || observed.library_version !== expected.library_version || observed.policy_version !== expected.policy_version
    || !Array.isArray(observed.definitions) || observed.definitions.length !== registry.descriptors.length) return false;
  return registry.descriptors.every((definition, index) => {
    const current = observed.definitions[index];
    return current?.id === definition.id && current.order === definition.order && current.method === definition.method
      && current.value_type === definition.value_type && current.depends_on === definition.depends_on
      && current.implementation_version === expected.implementation_version && current.library_version === expected.library_version
      && current.policy_version === expected.policy_version;
  });
}
function validValue(value: unknown, definition: DescriptorDefinition): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (definition.value_type === "integer") return Number.isSafeInteger(value)
    && (definition.id === "formal_charge" || value >= 0);
  return definition.id !== "fraction_sp3" || (value >= 0 && value <= 1);
}

/** The caller supplies a captured session view and independent owner, not a raw report. */
function qualifyInput(registry: ProfileRegistry, authority: ProfileInputAuthority): QualifiedInput | InputFailure {
  let snapshot: ProfileInputSnapshot;
  try { snapshot = authority.capture(); }
  catch { return { status: "error", reason: "profile_input_authority_failed" }; }
  if (!snapshot || typeof snapshot !== "object") return { status: "error", reason: "profile_input_authority_failed" };
  if (snapshot.status === "preview") return { status: "preview", reason: snapshot.reason ?? "profile_preview_unavailable" };
  if (snapshot.status === "stale" || !current(snapshot)) return { status: "stale", reason: "profile_input_owner_retired" };
  if (snapshot.status === "error" || snapshot.status === "unavailable" || snapshot.status === "cancelled") {
    return { status: snapshot.status, reason: snapshot.reason ?? `profile_input_${snapshot.status}` };
  }
  if (snapshot.status !== "current" && snapshot.status !== "pending") return { status: "error", reason: "profile_input_state_invalid" };
  if (typeof snapshot.projectId !== "string" || !snapshot.projectId || !validSource(snapshot.source)
    || !Number.isSafeInteger(snapshot.ownerEpoch) || snapshot.ownerEpoch < 0
    || (snapshot.originalArtifactId !== null && (typeof snapshot.originalArtifactId !== "string" || !snapshot.originalArtifactId))) {
    return { status: "error", reason: "profile_input_identity_invalid" };
  }
  if (snapshot.profileRegistryVersion !== registry.registry_version) return { status: "stale", reason: "profile_registry_version_mismatch" };
  if (!matchingMethod(registry, snapshot)) return { status: "unavailable", reason: "profile_descriptor_method_mismatch" };
  const binding = snapshot.binding;
  if (!binding) return { status: snapshot.status === "pending" ? "pending" : "unavailable", reason: "profile_current_binding_missing" };
  if (!sameSource(snapshot.source, binding.source) || typeof binding.binding_key !== "string" || !digest.test(binding.binding_key)) {
    return { status: "stale", reason: "profile_source_binding_mismatch" };
  }
  if (binding.status === "failed" || binding.status === "cancelled" || binding.status === "unavailable") {
    return { status: binding.status === "failed" ? "error" : binding.status, reason: binding.reason ?? `profile_input_${binding.status}` };
  }
  if (binding.status !== "ready" && binding.status !== "pending") return { status: "error", reason: "profile_binding_state_invalid" };
  const report = binding.report;
  if (!report) return { status: binding.status === "pending" ? "pending" : "unavailable", reason: "profile_current_report_missing" };
  const expected = registry.descriptor_method;
  if (report.schema_version !== 1 || typeof report.input_hash !== "string" || !digest.test(report.input_hash)
    || report.implementation_version !== expected.implementation_version || report.policy_version !== expected.policy_version
    || report.library_version !== expected.library_version || typeof report.created_at !== "string" || !Number.isFinite(Date.parse(report.created_at))
    || !Array.isArray(report.provenance) || !report.provenance.every(item => typeof item === "string")
    || (report.model_status !== "qualified" && report.model_status !== "unavailable")
    || (report.model_status === "qualified" ? report.model_reason !== null : typeof report.model_reason !== "string" || !report.model_reason.trim())
    || (report.contains_formally_charged_atoms !== null && typeof report.contains_formally_charged_atoms !== "boolean")
    || !Array.isArray(report.coverage) || !Array.isArray(report.values) || report.coverage.length !== report.values.length
    || report.coverage.length > registry.descriptors.length || new Set(report.coverage).size !== report.coverage.length) {
    return { status: "unavailable", reason: "profile_report_qualification_failed" };
  }
  const values = new Map<string, DescriptorValue>();
  let previousOrder = -1;
  for (const [index, value] of report.values.entries()) {
    const definition = registry.descriptors.find(item => item.id === value?.descriptor_id);
    if (!definition || value.descriptor_id !== report.coverage[index] || definition.order <= previousOrder
      || !["ready", "unavailable", "error"].includes(value.status)
      || (value.status === "ready" ? value.reason !== null || !validValue(value.value, definition)
        : value.value !== null || typeof value.reason !== "string" || !value.reason.trim())) {
      return { status: "unavailable", reason: "profile_descriptor_value_invalid" };
    }
    // Graph calculators require successful model preparation; independently known
    // element counts and qualified atomic charge can survive an unavailable model.
    if (report.model_status === "unavailable" && definition.depends_on === "qualified_graph" && value.status === "ready") {
      return { status: "unavailable", reason: "profile_model_dependency_contradiction" };
    }
    previousOrder = definition.order; values.set(value.descriptor_id, value);
  }
  const charge = values.get("formal_charge");
  if (report.contains_formally_charged_atoms === false && charge?.status === "ready" && charge.value !== 0) {
    return { status: "unavailable", reason: "profile_charge_fact_contradiction" };
  }
  if (!current(snapshot)) return { status: "stale", reason: "profile_input_owner_retired" };
  return { snapshot, report, values };
}

function compare(value: number, operator: ProfileOperator, limit: number): boolean {
  switch (operator) {
    case "lt": return value < limit;
    case "le": return value <= limit;
    case "gt": return value > limit;
    case "ge": return value >= limit;
  }
}
function definition(registry: ProfileRegistry, profileId: string): ProfileDefinition {
  profileConstraints(registry, profileId);
  return registry.profiles.find(profile => profile.id === profileId)!;
}
function withheld(registry: ProfileRegistry, profile: ProfileDefinition, constraints: readonly ProfileConstraint[], failure: InputFailure): ProfileEvaluation {
  return Object.freeze({ profile_id: profile.id, definition_version: profile.definition_version, registry_version: registry.registry_version,
    status: failure.status, reason: failure.reason, complete: false, domain: "unassessed" as const, identity: null,
    criteria: Object.freeze(constraints.map(constraint => Object.freeze({ constraint, value: null, status: failure.status, reason: failure.reason }))) });
}
function identity(registry: ProfileRegistry, profile: ProfileDefinition, qualified: QualifiedInput): ProfileEvaluationIdentity {
  const { snapshot, report } = qualified;
  const source = { ...snapshot.source, atom_ids: [...snapshot.source.atom_ids] };
  Object.freeze(source.atom_ids); Object.freeze(source);
  return Object.freeze({ projectId: snapshot.projectId, source, originalArtifactId: snapshot.originalArtifactId,
    ownerEpoch: snapshot.ownerEpoch, bindingKey: snapshot.binding!.binding_key, inputHash: report.input_hash,
    registryVersion: registry.registry_version, profileId: profile.id, profileVersion: profile.definition_version,
    method: registry.descriptor_method });
}

/** Exact conjunctions; presentation rounding and plotting never participate. */
export function evaluateProfile(registry: ProfileRegistry, profileId: string, authority: ProfileInputAuthority): ProfileEvaluation {
  const profile = definition(registry, profileId), constraints = profileConstraints(registry, profileId);
  if (profile.availability === "unavailable") return withheld(registry, profile, constraints,
    { status: "unavailable", reason: profile.unavailable_reason! });
  const qualified = qualifyInput(registry, authority);
  if (!("report" in qualified)) return withheld(registry, profile, constraints, qualified);
  const domainReason = profile.source_domain === "no_formally_charged_atoms" && qualified.report.contains_formally_charged_atoms !== false
    ? qualified.report.contains_formally_charged_atoms === true ? "source_profile_charged_representation_unsupported" : "source_profile_charge_qualification_missing" : null;
  const criteria: CriterionOutcome[] = constraints.map(constraint => {
    const value = qualified.values.get(constraint.descriptor_id);
    if (!value) return { constraint, value: null,
      status: qualified.snapshot.binding!.status === "pending" ? "pending" : "missing", reason: "profile_required_descriptor_missing" };
    if (value.status !== "ready") return { constraint, value: null, status: value.status, reason: value.reason };
    return { constraint, value: value.value, status: compare(value.value!, constraint.operator, constraint.limit) ? "pass" : "fail", reason: null };
  });
  const complete = domainReason === null && criteria.every(row => row.status === "pass" || row.status === "fail");
  let status: ProfileStatus, reason: string | null = null;
  if (domainReason) { status = "unavailable"; reason = domainReason; }
  else if (criteria.some(row => row.status === "fail")) status = "fail";
  else if (criteria.some(row => row.status === "error")) { status = "error"; reason = "profile_required_descriptor_error"; }
  else if (criteria.some(row => row.status === "unavailable" || row.status === "missing")) { status = "unavailable"; reason = "profile_required_descriptor_unavailable"; }
  else if (criteria.some(row => row.status === "pending")) { status = "pending"; reason = "profile_required_descriptor_pending"; }
  else status = "pass";
  if (!current(qualified.snapshot)) return withheld(registry, profile, constraints, { status: "stale", reason: "profile_input_owner_retired" });
  return Object.freeze({ profile_id: profile.id, definition_version: profile.definition_version, registry_version: registry.registry_version,
    status, reason, complete, domain: domainReason ? "unavailable" as const : "applicable" as const,
    criteria: Object.freeze(criteria.map(row => Object.freeze(row))), identity: identity(registry, profile, qualified) });
}

/** Union profile dependencies with existing demands, without editing saved preferences. */
export function profileDescriptorDependencies(registry: ProfileRegistry, profileIds: readonly string[], existingIds: readonly string[] = []): string[] {
  const required = new Set(existingIds);
  for (const id of profileIds) for (const key of definition(registry, id).required_descriptor_ids) required.add(key);
  const known = new Set(registry.descriptors.map(item => item.id));
  if ([...required].some(key => !known.has(key))) throw new Error("Unknown descriptor dependency");
  return registry.descriptors.filter(item => required.has(item.id)).map(item => item.id);
}

/** Individual display axes retain actual values; missing data never becomes a plotted zero. */
export function profileAxisValues(registry: ProfileRegistry, profileId: string, authority: ProfileInputAuthority): readonly ProfileAxisValue[] {
  const profile = definition(registry, profileId), qualified = qualifyInput(registry, authority);
  const axes = profile.axis_ids.map(id => registry.axes.find(axis => axis.id === id)!);
  const missing = (reason: string): readonly ProfileAxisValue[] => Object.freeze(axes.map(axis => Object.freeze({ axis,
    value: null, normalized: null, clipped: null, reason })));
  if (!("report" in qualified)) return missing(qualified.reason);
  const result = axes.map(axis => {
    const outcome = qualified.values.get(axis.descriptor_id);
    if (!outcome || outcome.status !== "ready") return { axis, value: null, normalized: null, clipped: null,
      reason: outcome?.reason ?? "profile_required_descriptor_missing" };
    const value = outcome.value!, [minimum, maximum] = axis.domain;
    if (value < minimum) return { axis, value, normalized: 0, clipped: "low" as const, reason: null };
    if (value > maximum) return { axis, value, normalized: 1, clipped: "high" as const, reason: null };
    return { axis, value, normalized: (value - minimum) / (maximum - minimum), clipped: null, reason: null };
  });
  if (!current(qualified.snapshot)) return missing("profile_input_owner_retired");
  return Object.freeze(result.map(row => Object.freeze(row)));
}
