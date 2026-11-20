import type { QueryClient } from "@tanstack/react-query";
import type { DescriptorRegistry } from "../ligandProperties/types";
import { PROFILE_REGISTRY_KEY } from "./api";
import { profileDescriptorDependencies } from "./evaluate";
import type { ProfileRegistry } from "./types";

export interface ProfileDemandPlan {
  readonly profileId: string; readonly definitionVersion: string; readonly registryVersion: string;
  readonly method: ProfileRegistry["descriptor_method"]; readonly descriptorIds: readonly string[];
}

/** One transient App selection and at most one last validated scheduling plan.
 * Retained demand is never registry or evaluation authority.
 */
export class ProfileSelection {
  private selected = "";
  private selectionEpoch = 0;
  private plan: ProfileDemandPlan | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly client: QueryClient) {}
  id = () => this.selected;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  select(id: string, observe: () => void = () => {}) {
    if (id !== this.selected) {
      this.selected = id; this.plan = null; this.selectionEpoch++;
      observe();
      for (const listener of this.listeners) listener();
    }
  }
  registry = (): ProfileRegistry | undefined => {
    const state = this.client.getQueryState<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    return state?.status === "success" ? state.data : undefined;
  };
  captureRegistry(registry: ProfileRegistry, profileId: string): () => boolean {
    const initial = this.client.getQueryState<ProfileRegistry>(PROFILE_REGISTRY_KEY), epoch = this.selectionEpoch;
    return () => {
      const state = this.client.getQueryState<ProfileRegistry>(PROFILE_REGISTRY_KEY);
      return this.selectionEpoch === epoch && this.selected === profileId && state?.status === "success"
        && state.data === registry && state.dataUpdateCount === initial?.dataUpdateCount
        && state.errorUpdateCount === initial?.errorUpdateCount;
    };
  }
  dependencies(registry: DescriptorRegistry | undefined): readonly string[] {
    const metadata = this.registry();
    if (metadata) {
      const profile = metadata.profiles.find(profile => profile.id === this.selected);
      this.plan = profile?.availability === "available" ? Object.freeze({
        profileId: profile.id, definitionVersion: profile.definition_version, registryVersion: metadata.registry_version,
        method: metadata.descriptor_method, descriptorIds: Object.freeze(profileDescriptorDependencies(metadata, [profile.id])),
      }) : null;
    }
    const ids = this.plan?.profileId === this.selected ? this.plan.descriptorIds : [];
    return [...(registry?.definitions ?? [])].sort((a, b) => a.order - b.order)
      .filter(definition => ids.includes(definition.id)).map(definition => definition.id);
  }
  demandPlan = (): ProfileDemandPlan | null => this.plan;
}
