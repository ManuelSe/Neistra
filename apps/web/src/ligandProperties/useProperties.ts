import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Entry, Project } from "../api/types";
import type { LigandInventoryOwner } from "../ligands/inventoryQualification";
import { ligandPropertyApi } from "./api";
import { MAX_PROPERTY_SOURCE_ATOMS, PROPERTY_PREFERENCES_KEY, PROPERTY_REGISTRY_KEY, makePropertyTarget, propertyDefinitions } from "./context";
import type { PropertyInputOwner } from "./ownership";
import { propertyTargetKey, type LigandPropertySession, type PropertyTarget } from "./session";
import type { DescriptorDefinition, DescriptorRegistry, PropertyPreferences } from "./types";
import { PROFILE_REGISTRY_KEY } from "../ligandProfiles/api";
import type { ProfileSelection } from "../ligandProfiles/context";

export interface PropertyPresentation {
  entry: Entry | undefined; target: PropertyTarget | null; owner: PropertyInputOwner;
  registry: DescriptorRegistry | undefined; preferences: PropertyPreferences | undefined;
  enabledDefinitions: DescriptorDefinition[]; configurationError: boolean;
  pausedReason: string | null; tooLarge: boolean; retryOptions: () => void;
}

/** One App-lifetime bridge, independent of the responsive presentation. */
export function usePropertySourceVerification(inventory: LigandInventoryOwner, session: LigandPropertySession, owner: PropertyInputOwner) {
  useLayoutEffect(() => {
    const unsubscribe = inventory.subscribeVerificationFailures(failure => {
      session.invalidateSource(failure.source, failure.token, failure.reason, () => owner.retireSource(failure.source));
    });
    const stopPublishing = session.publishSourceFailuresTo(inventory.recordSourceFailure);
    return () => { stopPublishing(); unsubscribe(); };
  }, [inventory, session, owner]);
}

/** One App consumer continues across presenter hiding and responsive remounts. */
export function useLigandProperties({ project, entryId, pausedReason, session, owner, profileSelection }: {
  project: Project | undefined; entryId: string | null; pausedReason: string | null;
  session: LigandPropertySession; owner: PropertyInputOwner;
  profileSelection?: ProfileSelection;
}): PropertyPresentation {
  const client = useQueryClient();
  const registry = useQuery({ queryKey: PROPERTY_REGISTRY_KEY, queryFn: ({ signal }) => ligandPropertyApi.registry(signal),
    enabled: !!project, staleTime: Infinity, retry: false });
  const preferences = useQuery({ queryKey: PROPERTY_PREFERENCES_KEY, queryFn: ({ signal }) => ligandPropertyApi.preferences(signal),
    enabled: !!project, staleTime: Infinity, retry: false });
  const epoch = useSyncExternalStore(owner.subscribe, owner.connectionSnapshot);
  const entry = project?.entries.find(item => item.id === entryId);
  const proposed = makePropertyTarget(project?.id ?? null, entry, registry.data, preferences.data,
    profileSelection?.dependencies(registry.data));
  const key = proposed ? propertyTargetKey(proposed) : "";
  const stable = useRef<{ key: string; target: PropertyTarget | null }>({ key, target: proposed });
  if (stable.current.key !== key) stable.current = { key, target: proposed };
  const target = stable.current.target;
  const configurationError = registry.isError || preferences.isError;
  const paused = owner.isPaused();
  const hasSource = entry?.ligand_designation.status === "resolved" && !!entry.current_artifact_id;
  useLayoutEffect(() => client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey as readonly unknown[];
    if (event.type === "updated" && (key[0] === PROPERTY_REGISTRY_KEY[0]
      || key[0] === PROPERTY_PREFERENCES_KEY[0] || key[0] === PROFILE_REGISTRY_KEY[0])) owner.observe();
  }), [client, owner]);
  useLayoutEffect(() => {
    if (target && !paused && !configurationError) return session.connect(target);
    if (!hasSource && !paused) session.inputUnavailable();
  }, [session, target, epoch, paused, configurationError, hasSource]);
  return { entry, target, owner, registry: registry.data, preferences: preferences.data,
    enabledDefinitions: propertyDefinitions(registry.data, preferences.data), configurationError,
    pausedReason: paused ? pausedReason ?? "Properties unavailable while the molecular change is reconciled." : null,
    tooLarge: !!entry && entry.ligand_designation.atom_ids.length > MAX_PROPERTY_SOURCE_ATOMS,
    retryOptions: () => { if (registry.isError) void registry.refetch(); if (preferences.isError) void preferences.refetch(); } };
}
