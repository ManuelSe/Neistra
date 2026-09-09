import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { WORKSPACE_STORAGE_KEY, type Theme } from "../theme";

export type { Theme } from "../theme";
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

// Browser preferences are optional. A blocked/quota-limited storage area must
// not prevent project work or throw from an otherwise successful UI action.
const safeStorage: StateStorage = {
  getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
  setItem: (name, value) => { try { localStorage.setItem(name, value); } catch { /* Session-only preferences. */ } },
  removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* Storage may be unavailable. */ } },
};

function validLayout(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((size) => typeof size === "number" && Number.isFinite(size) && size >= 0 && size <= 100) &&
    Math.abs(value.reduce((sum: number, size: number) => sum + size, 0) - 100) < 1;
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
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === "object"
          ? persisted as Partial<WorkspaceState> : {};
        return {
          ...current,
          theme: saved.theme === "dark" ? "dark" : "light",
          activeProjectId: typeof saved.activeProjectId === "string" ? saved.activeProjectId : null,
          horizontalLayout: validLayout(saved.horizontalLayout, 3) ? saved.horizontalLayout : current.horizontalLayout,
          verticalLayout: validLayout(saved.verticalLayout, 2) ? saved.verticalLayout : current.verticalLayout,
          leftCollapsed: typeof saved.leftCollapsed === "boolean" ? saved.leftCollapsed : current.leftCollapsed,
          rightCollapsed: typeof saved.rightCollapsed === "boolean" ? saved.rightCollapsed : current.rightCollapsed,
          lowerCollapsed: typeof saved.lowerCollapsed === "boolean" ? saved.lowerCollapsed : current.lowerCollapsed,
        };
      },
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
