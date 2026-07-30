import type { ApiErrorBody, Project, ProjectListItem } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<Response>(path: string, init?: RequestInit): Promise<Response> {
  let response: globalThis.Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "MolWeave could not reach the local API.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const detail = body.detail;
    const message =
      typeof detail === "object" && detail?.message
        ? detail.message
        : typeof detail === "string"
          ? detail
          : `Request failed with status ${response.status}`;
    const code = typeof detail === "object" && detail?.code ? detail.code : "request_failed";
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as Response;
}

export const projectApi = {
  list: () => request<ProjectListItem[]>("/api/v1/projects"),
  get: (projectId: string) => request<Project>(`/api/v1/projects/${projectId}`),
  create: (name: string, description: string | null) =>
    request<Project>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  update: (project: Project, name: string, description: string | null) =>
    request<Project>(`/api/v1/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        expected_revision: project.revision,
        name,
        description,
      }),
    }),
  save: (project: Project) =>
    request<Project>(`/api/v1/projects/${project.id}/save`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  undo: (project: Project) =>
    request<Project>(`/api/v1/projects/${project.id}/history/undo`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  redo: (project: Project) =>
    request<Project>(`/api/v1/projects/${project.id}/history/redo`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  updateEntry: (
    project: Project,
    entryId: string,
    values: {
      name: string;
      description: string | null;
      user_metadata: Record<string, unknown>;
    },
  ) =>
    request<Project>(`/api/v1/projects/${project.id}/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ expected_revision: project.revision, ...values }),
    }),
  duplicateEntry: (project: Project, entryId: string) =>
    request<Project>(`/api/v1/projects/${project.id}/entries/${entryId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  setEntryVisibility: (project: Project, entryId: string, value: boolean) =>
    request<Project>(`/api/v1/projects/${project.id}/entries/${entryId}/visibility`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision, value }),
    }),
  setEntryLock: (project: Project, entryId: string, value: boolean) =>
    request<Project>(`/api/v1/projects/${project.id}/entries/${entryId}/lock`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision, value }),
    }),
  isolateEntry: (project: Project, entryId: string) =>
    request<Project>(`/api/v1/projects/${project.id}/entries/${entryId}/isolate`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  deleteEntry: (project: Project, entryId: string) =>
    request<Project>(
      `/api/v1/projects/${project.id}/entries/${entryId}?expected_revision=${project.revision}`,
      { method: "DELETE" },
    ),
  createGroup: (project: Project, name: string, entryIds: string[]) =>
    request<Project>(`/api/v1/projects/${project.id}/groups`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision: project.revision,
        name,
        entry_ids: entryIds,
      }),
    }),
};

