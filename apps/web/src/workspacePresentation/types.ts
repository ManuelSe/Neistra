/** Installation presentation only; never a portable project or named scene. */
export interface SessionCamera {
  mode: "perspective" | "orthographic";
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  radius: number;
  /** Vertical field of view, in radians. */
  fov: number;
}

export interface WorkspacePresentationV1 {
  schema_version: 1;
  revision: number;
  camera: SessionCamera | null;
  updated_at: string | null;
}

export interface WorkspacePresentationApi {
  read(this: void): Promise<WorkspacePresentationV1>;
  write(this: void, camera: SessionCamera, expectedRevision: number, options?: { keepalive?: boolean }): Promise<WorkspacePresentationV1>;
}

export interface CameraPresentationTarget {
  getSessionCamera?(): SessionCamera | null;
  setSessionCamera(camera: SessionCamera): void;
  /** Accepted navigation only, with no initial/default or restoration emission. */
  subscribeSessionCamera(listener: (camera: SessionCamera) => void): () => void;
  /** A buffered restoration may fail only after the native viewer is created. */
  subscribeSessionCameraFailure?(listener: (failedCamera: SessionCamera) => void): () => void;
}

export interface WorkspacePresentationSnapshot {
  hydrated: boolean;
  camera: SessionCamera | null;
  revision: number | null;
  status: "loading" | "saved" | "saving" | "unsaved" | "conflict";
  problem: "save" | "conflict" | "recovery" | "display" | null;
  message: string | null;
  navigationGeneration: number;
}

export interface InitialFitTicket {
  complete(drawable: boolean, fit: () => SessionCamera | null): boolean;
  cancel(): void;
}

export interface WorkspacePresentationClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface WorkspacePresentationDependencies {
  api: WorkspacePresentationApi;
  storage: Pick<Storage, "getItem" | "setItem">;
  clock?: WorkspacePresentationClock;
}
