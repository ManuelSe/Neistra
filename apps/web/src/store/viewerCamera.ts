import { create } from "zustand";
import type { CameraState } from "../api/types";

/** Active-project presentation only; never molecular state or localStorage. */
interface ViewerCameraState {
  projectId: string | null;
  camera: CameraState | null;
  setProject: (projectId: string | null) => void;
  remember: (projectId: string, camera: CameraState | null) => void;
}

export const useViewerCameraStore = create<ViewerCameraState>(set => ({
  projectId: null, camera: null,
  setProject: projectId => set(state => state.projectId === projectId ? state : { projectId, camera: null }),
  remember: (projectId, camera) => set(state => state.projectId === projectId && camera
    ? { camera: structuredClone(camera) } : state),
}));
