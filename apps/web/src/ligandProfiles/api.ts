import { apiRequest } from "../api/client";
import { parseProfileRegistry } from "./validate";

export const PROFILE_REGISTRY_KEY = ["ligand-profile-registry"] as const;
export const ligandProfileApi = {
  registry: async (signal?: AbortSignal) => parseProfileRegistry(
    await apiRequest<unknown>("/api/v1/ligand-profiles/registry", { signal })),
};
