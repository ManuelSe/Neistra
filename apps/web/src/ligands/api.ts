import { apiRequest } from "../api/client";
import type { LigandApi } from "./types";

const base = (projectId: string, entryId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}/entries/${encodeURIComponent(entryId)}`;
const source = (artifactId: string | null) => artifactId === null ? "" : `expected_artifact_id=${encodeURIComponent(artifactId)}`;
export const ligandApi: LigandApi = {
  candidates: (projectId, entry, offset, signal) => apiRequest(`${base(projectId, entry.id)}/ligand-candidates?${source(entry.current_artifact_id)}&offset=${offset}&limit=12`, { signal }),
  depiction: (projectId, entry, candidateKey, signal) => apiRequest(`${base(projectId, entry.id)}/ligand-candidates/${encodeURIComponent(candidateKey)}/depiction?${source(entry.current_artifact_id)}`, { signal }),
  designate: (projectId, entryId, command) => apiRequest(`${base(projectId, entryId)}/ligand-designation`, { method: "PUT", body: JSON.stringify(command) }),
  resolve: (projectId, revision, entryIds) => apiRequest(`/api/v1/projects/${encodeURIComponent(projectId)}/ligand-designations/resolve`, {
    method: "POST", body: JSON.stringify({ expected_revision: revision, entry_ids: entryIds }),
  }),
};
