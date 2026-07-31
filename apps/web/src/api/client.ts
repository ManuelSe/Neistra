import type {
  ApiErrorBody,
  CameraState,
  Contact,
  CoordinateTransform,
  ExportResult,
  FormatCapability,
  ImportResult,
  LigandEdit,
  LigandEditResult,
  MolecularWarning,
  Project,
  ProjectListItem,
  MeasurementKind,
  Scene,
  Selection,
  StructureProjection,
  SuperpositionRequest,
  SuperpositionResult,
  ViewerSettings,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly warnings: MolecularWarning[];

  constructor(
    status: number,
    code: string,
    message: string,
    warnings: MolecularWarning[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.warnings = warnings;
  }
}

function apiError(status: number, body: ApiErrorBody): ApiError {
  const detail = body.detail;
  const message =
    typeof detail === "object" && detail?.message
      ? detail.message
      : typeof detail === "string"
        ? detail
        : `Request failed with status ${status}`;
  const code = typeof detail === "object" && detail?.code ? detail.code : "request_failed";
  const warnings = typeof detail === "object" ? (detail?.warnings ?? []) : [];
  return new ApiError(status, code, message, warnings);
}

async function request<ResponseType>(
  path: string,
  init?: RequestInit,
): Promise<ResponseType> {
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
    throw apiError(response.status, body);
  }
  return (await response.json()) as ResponseType;
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
  transform: (project: Project, transform: CoordinateTransform) =>
    request<Project>(
      `/api/v1/projects/${project.id}/entries/${transform.entry_id}/transform`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_revision: project.revision,
          ...transform,
        }),
      },
    ),
  superpose: (project: Project, payload: SuperpositionRequest) =>
    request<SuperpositionResult>(`/api/v1/projects/${project.id}/superpositions`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision: project.revision,
        ...payload,
      }),
    }),
  ligandEdit: (project: Project, entryId: string, payload: LigandEdit) =>
    request<LigandEditResult>(
      `/api/v1/projects/${project.id}/entries/${entryId}/ligand-edits`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_revision: project.revision,
          ...payload,
        }),
      },
    ),
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
  saveSelection: (project: Project, name: string, selection: Selection) =>
    request<Project>(`/api/v1/projects/${project.id}/selections`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision: project.revision,
        name,
        selection,
      }),
    }),
  deleteSelection: (project: Project, selectionId: string) =>
    request<Project>(
      `/api/v1/projects/${project.id}/selections/${selectionId}?expected_revision=${project.revision}`,
      { method: "DELETE" },
    ),
  updateViewerSettings: (
    project: Project,
    entryId: string,
    settings: ViewerSettings,
  ) =>
    request<Project>(
      `/api/v1/projects/${project.id}/entries/${entryId}/viewer-settings`,
      {
        method: "PUT",
        body: JSON.stringify({
          expected_revision: project.revision,
          settings,
        }),
      },
    ),
  createMeasurement: (
    project: Project,
    name: string,
    kind: MeasurementKind,
    atomReferences: Selection["atoms"],
  ) =>
    request<Project>(`/api/v1/projects/${project.id}/measurements`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision: project.revision,
        name,
        kind,
        atom_references: atomReferences,
      }),
    }),
  updateMeasurement: (
    project: Project,
    measurementId: string,
    name: string,
    visible: boolean,
  ) =>
    request<Project>(
      `/api/v1/projects/${project.id}/measurements/${measurementId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expected_revision: project.revision,
          name,
          visible,
        }),
      },
    ),
  deleteMeasurement: (project: Project, measurementId: string) =>
    request<Project>(
      `/api/v1/projects/${project.id}/measurements/${measurementId}?expected_revision=${project.revision}`,
      { method: "DELETE" },
    ),
  createScene: (
    project: Project,
    name: string,
    camera: CameraState,
    selection: Selection,
  ) =>
    request<Project>(`/api/v1/projects/${project.id}/scenes`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision: project.revision,
        name,
        camera,
        selection,
      }),
    }),
  applyScene: (project: Project, scene: Scene) =>
    request<Project>(`/api/v1/projects/${project.id}/scenes/${scene.id}/apply`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: project.revision }),
    }),
  deleteScene: (project: Project, scene: Scene) =>
    request<Project>(
      `/api/v1/projects/${project.id}/scenes/${scene.id}?expected_revision=${project.revision}`,
      { method: "DELETE" },
    ),
  contacts: (
    project: Project,
    entryId: string,
    cutoff: number,
    minimumDistance: number,
  ) =>
    request<Contact[]>(`/api/v1/projects/${project.id}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        entry_id: entryId,
        cutoff,
        minimum_distance: minimumDistance,
      }),
    }),
};

export interface ImportUpload {
  promise: Promise<ImportResult>;
  cancel: () => void;
}

export interface ImportCallbacks {
  onProgress: (loaded: number, total: number) => void;
  onProcessing: () => void;
}

export const molecularApi = {
  formats: () => request<FormatCapability[]>("/api/v1/formats"),
  structure: (projectId: string, entryId: string) =>
    request<StructureProjection>(
      `/api/v1/projects/${projectId}/entries/${entryId}/structure`,
    ),
  importStructures: (
    project: Project,
    files: File[],
    options: { generate3d: boolean; inferBonds: boolean },
    callbacks: ImportCallbacks,
  ): ImportUpload => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    const operationId = crypto.randomUUID();
    form.set("operation_id", operationId);
    form.set("expected_revision", String(project.revision));
    form.set("generate_3d", String(options.generate3d));
    form.set("infer_bonds", String(options.inferBonds));
    for (const file of files) form.append("files", file, file.name);

    const promise = new Promise<ImportResult>((resolve, reject) => {
      xhr.open("POST", `/api/v1/projects/${project.id}/imports`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) =>
        callbacks.onProgress(event.loaded, event.lengthComputable ? event.total : 0);
      xhr.upload.onload = callbacks.onProcessing;
      xhr.onerror = () =>
        reject(new ApiError(0, "network_error", "MolWeave could not reach the local API."));
      xhr.onabort = () =>
        reject(new ApiError(0, "import_cancelled", "Import cancelled before commit."));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as ImportResult);
          return;
        }
        reject(apiError(xhr.status, (xhr.response ?? {}) as ApiErrorBody));
      };
      xhr.send(form);
    });
    return {
      promise,
      cancel: () => {
        void fetch(`/api/v1/imports/${operationId}/cancel`, { method: "POST" })
          .catch(() => undefined)
          .finally(() => xhr.abort());
      },
    };
  },
  exportStructure: (
    projectId: string,
    entryId: string,
    format: FormatCapability["format"],
    acknowledgeLosses: boolean,
  ) =>
    request<ExportResult>(
      `/api/v1/projects/${projectId}/entries/${entryId}/exports`,
      {
        method: "POST",
        body: JSON.stringify({
          format,
          acknowledge_losses: acknowledgeLosses,
        }),
      },
    ),
};
