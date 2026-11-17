import type { DescriptorDefinition, DescriptorRegistry, PropertyCurrent, PropertySource } from "../ligandProperties/types";

export type ProfileOperator = "lt" | "le" | "gt" | "ge";
export type ProfileNumericRule = "finite" | "nonnegative_integer" | "safe_integer" | "fraction_0_1";
export interface DescriptorMethod {
  readonly implementation_version: string; readonly policy_version: string; readonly library_version: string;
}
export interface ProfileSource {
  readonly id: string; readonly title: string; readonly doi: string; readonly url: string; readonly scope: string;
}
export interface ProfileConstraint {
  readonly id: string; readonly descriptor_id: string; readonly operator: ProfileOperator; readonly limit: number;
}
export interface ProfileFilterBound { readonly value: number; readonly inclusive: boolean }
export interface ProfileFilterRange {
  readonly descriptor_id: string; readonly minimum: ProfileFilterBound | null; readonly maximum: ProfileFilterBound | null;
}
export interface ProfileAxis {
  readonly id: string; readonly descriptor_id: string; readonly numeric_rule: ProfileNumericRule;
  readonly domain: readonly [number, number]; readonly normalization: "linear";
  readonly clipping: "mark_and_clip"; readonly missing: "leave_missing";
}
export interface ProfileDefinition {
  readonly id: string; readonly name: string; readonly description: string; readonly definition_version: string;
  readonly availability: "available" | "unavailable"; readonly unavailable_reason: string | null;
  readonly missing_inputs: readonly string[]; readonly source_ids: readonly string[]; readonly adaptations: readonly string[];
  readonly constraint_ids: readonly string[]; readonly component_ids: readonly string[];
  readonly required_descriptor_ids: readonly string[];
  readonly source_domain: "qualified_representation" | "no_formally_charged_atoms";
  readonly axis_ids: readonly string[]; readonly default_filter_ranges: readonly ProfileFilterRange[];
}
export interface ProfileRegistry {
  readonly schema_version: 1; readonly registry_version: string; readonly descriptor_method: DescriptorMethod;
  readonly descriptors: readonly DescriptorDefinition[]; readonly sources: readonly ProfileSource[];
  readonly constraints: readonly ProfileConstraint[]; readonly axes: readonly ProfileAxis[];
  readonly profiles: readonly ProfileDefinition[]; readonly limitations: readonly string[];
}

/** The integration adapter captures this from the property session and its independent App owner.
 * A report alone cannot establish current source authority. Pending may include a qualified
 * partial binding; stale/preview/error snapshots never expose its old numbers as current.
 */
export interface ProfileInputSnapshot {
  readonly projectId: string; readonly source: PropertySource; readonly originalArtifactId: string | null;
  readonly ownerEpoch: number; readonly profileRegistryVersion: string;
  readonly status: "current" | "pending" | "stale" | "preview" | "unavailable" | "error" | "cancelled";
  readonly reason?: string; readonly binding?: PropertyCurrent;
  readonly descriptorRegistry: DescriptorRegistry;
  readonly isCurrent: () => boolean;
}
export interface ProfileInputAuthority { capture: () => ProfileInputSnapshot }
export interface ProfileEvaluationIdentity {
  readonly projectId: string; readonly source: PropertySource; readonly originalArtifactId: string | null;
  readonly ownerEpoch: number; readonly bindingKey: string; readonly inputHash: string;
  readonly registryVersion: string; readonly profileId: string; readonly profileVersion: string;
  readonly method: DescriptorMethod;
}
export type ProfileStatus = "pass" | "fail" | "pending" | "unavailable" | "error" | "stale" | "preview" | "cancelled";
export type CriterionStatus = ProfileStatus | "missing";
export interface CriterionOutcome {
  readonly constraint: ProfileConstraint; readonly value: number | null;
  readonly status: CriterionStatus; readonly reason: string | null;
}
export interface ProfileEvaluation {
  readonly profile_id: string; readonly definition_version: string; readonly registry_version: string;
  readonly status: ProfileStatus; readonly reason: string | null; readonly complete: boolean;
  readonly domain: "applicable" | "unavailable" | "unassessed";
  readonly criteria: readonly CriterionOutcome[]; readonly identity: ProfileEvaluationIdentity | null;
}
export interface ProfileAxisValue {
  readonly axis: ProfileAxis; readonly value: number | null; readonly normalized: number | null;
  readonly clipped: "low" | "high" | null; readonly reason: string | null;
}
