import type { DescriptorDefinition } from "../ligandProperties/types";
import { evaluateProfile, profileAxisValues } from "./evaluate";
import type { CriterionOutcome, ProfileAxisValue, ProfileEvaluation, ProfileInputAuthority, ProfileRegistry } from "./types";

export interface ProfileComparisonRow extends ProfileAxisValue {
  readonly definition: DescriptorDefinition;
  readonly criteria: readonly CriterionOutcome[];
}
export interface ProfileComparison {
  readonly evaluation: ProfileEvaluation | null;
  readonly rows: readonly ProfileComparisonRow[];
  readonly reason: string | null;
}

/** A presentation projection of the existing selectors, with one captured owner.
 * The plot and table consume the same rows; neither creates scientific demand.
 */
export function profileComparison(registry: ProfileRegistry, profileId: string, authority: ProfileInputAuthority): ProfileComparison {
  const missing = (reason: string): ProfileComparison => Object.freeze({ evaluation: null, rows: Object.freeze([]), reason });
  const profile = registry.profiles.find(item => item.id === profileId);
  if (!profile) return missing("profile_definition_missing");
  const required = new Set(profile.required_descriptor_ids);
  const axes = profile.axis_ids.map(id => registry.axes.find(axis => axis.id === id));
  if (axes.some(axis => !axis) || [...required].some(id => axes.filter(axis => axis?.descriptor_id === id).length !== 1)
    || [...required].some(id => registry.descriptors.filter(definition => definition.id === id).length !== 1)) {
    return missing("profile_axis_definition_missing_or_ambiguous");
  }
  try {
    const snapshot = authority.capture();
    const captured: ProfileInputAuthority = { capture: () => snapshot };
    const evaluation = evaluateProfile(registry, profileId, captured);
    const values = profileAxisValues(registry, profileId, captured);
    const ordered = registry.axes.filter(axis => profile.axis_ids.includes(axis.id) && required.has(axis.descriptor_id))
      .map(axis => values.find(value => value.axis.id === axis.id)!);
    const rows = ordered.map(value => Object.freeze({
      ...value,
      ...(evaluation.domain === "unavailable" ? { value: null, normalized: null, clipped: null,
        reason: evaluation.reason ?? "profile_domain_unavailable" } : {}),
      definition: registry.descriptors.find(definition => definition.id === value.axis.descriptor_id)!,
      criteria: Object.freeze(evaluation.criteria.filter(criterion => criterion.constraint.descriptor_id === value.axis.descriptor_id)),
    }));
    // Preview intentionally pauses its molecular owner. Both selectors already
    // withhold its numbers; retain that actionable state rather than replacing it.
    if (!snapshot.isCurrent() && snapshot.status !== "preview") return missing("profile_input_owner_retired");
    return Object.freeze({ evaluation, rows: Object.freeze(rows), reason: null });
  } catch {
    return missing("profile_comparison_unavailable");
  }
}
