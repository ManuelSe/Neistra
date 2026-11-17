import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { PropertyInputOwner } from "../ligandProperties/ownership";
import { PROFILE_REGISTRY_KEY, ligandProfileApi } from "./api";
import type { ProfileSelection } from "./context";
import type { ProfileRegistry } from "./types";

export interface ProfilePresentation {
  selectedId: string; selection: ProfileSelection; registry: ProfileRegistry | undefined;
  loading: boolean; error: boolean; select: (id: string) => void; retry: () => void;
}
export function useLigandProfiles(enabled: boolean, selection: ProfileSelection, owner: PropertyInputOwner): ProfilePresentation {
  const selectedId = useSyncExternalStore(selection.subscribe, selection.id);
  const query = useQuery({ queryKey: PROFILE_REGISTRY_KEY, queryFn: ({ signal }) => ligandProfileApi.registry(signal),
    enabled, staleTime: Infinity, retry: false, structuralSharing: false });
  return { selectedId, selection, registry: query.isSuccess ? query.data : undefined,
    loading: query.isPending, error: query.isError,
    select: id => { selection.select(id, owner.observe); },
    retry: () => { void query.refetch(); },
  };
}
