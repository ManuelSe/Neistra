import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type MobilePanel = "projects" | "inspector" | "history" | null;

interface WorkspaceState {
  theme: Theme;
  activeProjectId: string | null;
  horizontalLayout: number[];
  verticalLayout: number[];
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  lowerCollapsed: boolean;
  mobilePanel: MobilePanel;
  setTheme: (theme: Theme) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setHorizontalLayout: (layout: number[]) => void;
  setVerticalLayout: (layout: number[]) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  setLowerCollapsed: (collapsed: boolean) => void;
  setMobilePanel: (panel: MobilePanel) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      theme: "light",
      activeProjectId: null,
      horizontalLayout: [22, 56, 22],
      verticalLayout: [74, 26],
      leftCollapsed: false,
      rightCollapsed: false,
      lowerCollapsed: false,
      mobilePanel: null,
      setTheme: (theme) => set({ theme }),
      setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
      setHorizontalLayout: (horizontalLayout) => set({ horizontalLayout }),
      setVerticalLayout: (verticalLayout) => set({ verticalLayout }),
      setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
      setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
      setLowerCollapsed: (lowerCollapsed) => set({ lowerCollapsed }),
      setMobilePanel: (mobilePanel) => set({ mobilePanel }),
    }),
    {
      name: "molweave-workspace-v1",
      partialize: (state) => ({
        theme: state.theme,
        activeProjectId: state.activeProjectId,
        horizontalLayout: state.horizontalLayout,
        verticalLayout: state.verticalLayout,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        lowerCollapsed: state.lowerCollapsed,
      }),
    },
  ),
);

