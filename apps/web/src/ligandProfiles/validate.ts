import type { DescriptorDefinition } from "../ligandProperties/types";
import type { ProfileConstraint, ProfileFilterBound, ProfileFilterRange, ProfileNumericRule, ProfileRegistry } from "./types";

const compiled = new WeakMap<ProfileRegistry, ReadonlyMap<string, readonly ProfileConstraint[]>>();
const identifier = /^[a-z][a-z0-9_-]{0,79}$/;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid profile registry: ${message}`);
}
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value), label);
  const item = value as Record<string, unknown>;
  check(Object.keys(item).length === keys.length && keys.every(key => Object.hasOwn(item, key)), `${label} fields`);
  return item;
}
function text(value: unknown, max: number, label: string): asserts value is string {
  check(typeof value === "string" && value.trim().length > 0 && value.length <= max, label);
}
function id(value: unknown): asserts value is string { check(typeof value === "string" && identifier.test(value), "identifier"); }
function finite(value: unknown): asserts value is number { check(typeof value === "number" && Number.isFinite(value), "finite number"); }
function array(value: unknown, maximum: number, minimum = 0): unknown[] {
  check(Array.isArray(value) && value.length >= minimum && value.length <= maximum, "bounded array");
  return value;
}
function references(value: unknown, max: number, minimum = 0): string[] {
  const items = array(value, max, minimum);
  items.forEach(id);
  check(new Set(items).size === items.length, "unique references");
  return items as string[];
}
function texts(value: unknown, max: number, minimum = 0): void {
  array(value, max, minimum).forEach(item => text(item, 2000, "text"));
}
function unique(items: readonly { id: string }[]): void { check(new Set(items.map(item => item.id)).size === items.length, "unique ids"); }
function method(value: unknown): void {
  const item = record(value, ["implementation_version", "policy_version", "library_version"], "descriptor method");
  Object.values(item).forEach(value => text(value, 160, "method version"));
}
function expectedRule(descriptor: DescriptorDefinition): ProfileNumericRule {
  if (descriptor.id === "fraction_sp3") return "fraction_0_1";
  if (descriptor.value_type === "integer") return descriptor.id === "formal_charge" ? "safe_integer" : "nonnegative_integer";
  return "finite";
}
function bound(value: unknown): void {
  if (value === null) return;
  const item = record(value, ["value", "inclusive"], "filter bound");
  finite(item.value); check(typeof item.inclusive === "boolean", "inclusive flag");
}
function freeze(value: unknown): void {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

function ranges(constraints: readonly ProfileConstraint[], descriptorOrder: readonly string[]): ProfileFilterRange[] {
  const values = new Map<string, { minimum: ProfileFilterBound | null; maximum: ProfileFilterBound | null }>();
  for (const constraint of constraints) {
    const interval = values.get(constraint.descriptor_id) ?? { minimum: null, maximum: null };
    const side = constraint.operator === "lt" || constraint.operator === "le" ? "maximum" : "minimum";
    const next = { value: constraint.limit, inclusive: constraint.operator === "le" || constraint.operator === "ge" };
    const previous = interval[side];
    if (!previous || (side === "maximum" ? next.value < previous.value : next.value > previous.value)) interval[side] = next;
    else if (next.value === previous.value) interval[side] = { value: next.value, inclusive: next.inclusive && previous.inclusive };
    values.set(constraint.descriptor_id, interval);
  }
  return descriptorOrder.filter(key => values.has(key)).map(descriptor_id => {
    const interval = values.get(descriptor_id)!;
    if (interval.minimum && interval.maximum) check(interval.minimum.value < interval.maximum.value
      || (interval.minimum.value === interval.maximum.value && interval.minimum.inclusive && interval.maximum.inclusive), "contradictory bounds");
    return { descriptor_id, ...interval };
  });
}
function sameBound(left: ProfileFilterBound | null, right: ProfileFilterBound | null): boolean {
  return left === null || right === null ? left === right : left.value === right.value && left.inclusive === right.inclusive;
}

/** Parse and copy once at the metadata boundary. The compiled immutable registry is reusable. */
export function parseProfileRegistry(value: unknown): ProfileRegistry {
  const candidate: unknown = structuredClone(value);
  const root = record(candidate, ["schema_version", "registry_version", "descriptor_method", "descriptors", "sources",
    "constraints", "axes", "profiles", "limitations"], "registry");
  check(root.schema_version === 1, "schema version"); text(root.registry_version, 160, "registry version"); method(root.descriptor_method);
  for (const value of array(root.descriptors, 64, 1)) {
    const item = record(value, ["id", "name", "description", "category", "order", "unit", "value_type", "method",
      "implementation_version", "library_version", "policy_version", "plot_domain", "depends_on"], "descriptor");
    id(item.id); text(item.name, 500, "descriptor name"); text(item.description, 2000, "descriptor description");
    check(typeof item.category === "string" && ["composition", "polarity", "lipophilicity", "flexibility"].includes(item.category), "descriptor category");
    check(typeof item.order === "number" && Number.isSafeInteger(item.order) && item.order >= 0, "descriptor order");
    check(item.unit === null || typeof item.unit === "string", "descriptor unit");
    check(item.value_type === "integer" || item.value_type === "float", "descriptor value type");
    for (const key of ["method", "implementation_version", "library_version", "policy_version"]) text(item[key], 500, key);
    check(typeof item.depends_on === "string" && ["qualified_graph", "observed_elements", "qualified_atomic_charge"].includes(item.depends_on), "descriptor dependence");
    const domain = array(item.plot_domain, 2, 2); domain.forEach(finite);
    check(Number(domain[0]) < Number(domain[1]) && Number.isFinite(Number(domain[1]) - Number(domain[0])), "descriptor domain");
  }
  for (const value of array(root.sources, 64, 1)) {
    const item = record(value, ["id", "title", "doi", "url", "scope"], "source");
    id(item.id); text(item.title, 500, "source title"); text(item.doi, 250, "source DOI"); text(item.scope, 2000, "source scope");
    text(item.url, 1000, "source URL"); check(new URL(item.url).protocol === "https:", "source URL protocol");
  }
  for (const value of array(root.constraints, 256, 1)) {
    const item = record(value, ["id", "descriptor_id", "operator", "limit"], "constraint");
    id(item.id); id(item.descriptor_id); check(typeof item.operator === "string" && ["lt", "le", "gt", "ge"].includes(item.operator), "constraint operator"); finite(item.limit);
  }
  for (const value of array(root.axes, 64, 1)) {
    const item = record(value, ["id", "descriptor_id", "numeric_rule", "domain", "normalization", "clipping", "missing"], "axis");
    id(item.id); id(item.descriptor_id);
    check(typeof item.numeric_rule === "string" && ["finite", "nonnegative_integer", "safe_integer", "fraction_0_1"].includes(item.numeric_rule), "axis numeric rule");
    const domain = array(item.domain, 2, 2); domain.forEach(finite);
    check(Number(domain[0]) < Number(domain[1]) && Number.isFinite(Number(domain[1]) - Number(domain[0])), "axis domain");
    check(item.normalization === "linear" && item.clipping === "mark_and_clip" && item.missing === "leave_missing", "axis display policy");
  }
  for (const value of array(root.profiles, 64, 1)) {
    const item = record(value, ["id", "name", "description", "definition_version", "availability", "unavailable_reason", "missing_inputs",
      "source_ids", "adaptations", "constraint_ids", "component_ids", "required_descriptor_ids", "source_domain", "axis_ids", "default_filter_ranges"], "profile");
    id(item.id); text(item.name, 160, "profile name"); text(item.description, 2000, "profile description"); text(item.definition_version, 160, "profile version");
    check(item.availability === "available" || item.availability === "unavailable", "profile availability");
    if (item.unavailable_reason !== null) text(item.unavailable_reason, 2000, "unavailable reason");
    texts(item.missing_inputs, 16); check(new Set(item.missing_inputs as string[]).size === (item.missing_inputs as string[]).length, "unique missing inputs");
    references(item.source_ids, 8, 1); texts(item.adaptations, 16, 1);
    const constraints = references(item.constraint_ids, 32), components = references(item.component_ids, 8);
    const required = references(item.required_descriptor_ids, 64); references(item.axis_ids, 64, 1);
    check(item.source_domain === "qualified_representation" || item.source_domain === "no_formally_charged_atoms", "source domain");
    const defaults = array(item.default_filter_ranges, 64);
    for (const value of defaults) {
      const range = record(value, ["descriptor_id", "minimum", "maximum"], "filter range");
      id(range.descriptor_id); bound(range.minimum); bound(range.maximum);
      check(range.minimum !== null || range.maximum !== null, "nonempty filter range");
    }
    if (item.availability === "available") check((constraints.length > 0) !== (components.length > 0)
      && item.unavailable_reason === null && (item.missing_inputs as unknown[]).length === 0, "available profile definition");
    else check(typeof item.unavailable_reason === "string" && constraints.length === 0 && components.length === 0
      && required.length === 0 && defaults.length === 0, "unavailable profile cannot execute");
  }
  texts(root.limitations, 16, 1);
  const registry = candidate as ProfileRegistry;
  [registry.descriptors, registry.sources, registry.constraints, registry.axes, registry.profiles].forEach(unique);
  const descriptors = new Map(registry.descriptors.map(item => [item.id, item]));
  const sources = new Set(registry.sources.map(item => item.id));
  const constraints = new Map(registry.constraints.map(item => [item.id, item]));
  const axes = new Map(registry.axes.map(item => [item.id, item]));
  const profiles = new Map(registry.profiles.map(item => [item.id, item]));
  for (const [index, descriptor] of registry.descriptors.entries()) {
    check(descriptor.order === index, "stable descriptor order");
    check(descriptor.implementation_version === registry.descriptor_method.implementation_version
      && descriptor.policy_version === registry.descriptor_method.policy_version
      && descriptor.library_version === registry.descriptor_method.library_version, "descriptor method identity");
  }
  for (const constraint of registry.constraints) {
    const descriptor = descriptors.get(constraint.descriptor_id); check(descriptor, "constraint descriptor reference");
    if (descriptor.value_type === "integer") check(Number.isSafeInteger(constraint.limit), "integer constraint limit");
  }
  check(registry.axes.length === registry.descriptors.length && new Set(registry.axes.map(axis => axis.descriptor_id)).size === registry.axes.length, "complete unique axes");
  for (const axis of registry.axes) {
    const descriptor = descriptors.get(axis.descriptor_id); check(descriptor, "axis descriptor reference");
    check(axis.domain[0] === descriptor.plot_domain[0] && axis.domain[1] === descriptor.plot_domain[1], "shared display domains");
    check(axis.numeric_rule === expectedRule(descriptor), "catalog numeric policy");
  }
  const active = new Set<string>(), flattened = new Map<string, readonly ProfileConstraint[]>();
  const visit = (profileId: string): readonly ProfileConstraint[] => {
    check(!active.has(profileId), "composite cycle");
    const known = flattened.get(profileId); if (known) return known;
    const profile = profiles.get(profileId); check(profile, "component profile reference");
    active.add(profileId);
    const chosen = new Map<string, ProfileConstraint>();
    for (const key of profile.constraint_ids) { const constraint = constraints.get(key); check(constraint, "profile constraint reference"); chosen.set(key, constraint); }
    for (const key of profile.component_ids) {
      const component = profiles.get(key); check(component?.availability === "available" && component.source_domain === profile.source_domain, "component source domain/availability");
      for (const constraint of visit(key)) chosen.set(constraint.id, constraint);
    }
    active.delete(profileId);
    const result = Object.freeze([...chosen.values()]); flattened.set(profileId, result); return result;
  };
  for (const profile of registry.profiles) {
    check(profile.source_ids.every(key => sources.has(key)), "citation reference");
    check(profile.axis_ids.every(key => axes.has(key)), "profile axis reference");
    const selected = visit(profile.id), required = new Set(selected.map(item => item.descriptor_id));
    const expectedRequired = registry.descriptors.filter(item => required.has(item.id)).map(item => item.id);
    check(JSON.stringify(profile.required_descriptor_ids) === JSON.stringify(expectedRequired), "required descriptor coverage");
    const expectedRanges = ranges(selected, registry.descriptors.map(item => item.id));
    check(profile.default_filter_ranges.length === expectedRanges.length && profile.default_filter_ranges.every((range, index) => {
      const expected = expectedRanges[index]; return range.descriptor_id === expected.descriptor_id
        && sameBound(range.minimum, expected.minimum) && sameBound(range.maximum, expected.maximum);
    }), "derived default filter ranges");
  }
  freeze(registry); compiled.set(registry, flattened); return registry;
}

/** Compiled references are shared by profile evaluation and later filter consumers. */
export function profileConstraints(registry: ProfileRegistry, profileId: string): readonly ProfileConstraint[] {
  const profiles = compiled.get(registry);
  check(profiles, "registry must first pass parseProfileRegistry");
  const result = profiles.get(profileId); check(result, "profile id"); return result;
}
