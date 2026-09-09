/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import css from "../styles.css?raw";
import { THEME_TOKENS, themeStyles, WORKSPACE_STORAGE_KEY } from "../theme";
import { useWorkspaceStore } from "../store/workspace";

function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map((value) => {
    const n = parseInt(value, 16) / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
  });
  return r * .2126 + g * .7152 + b * .0722;
}
function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + .05) / (dark + .05);
}

describe("Neistra presentation contract", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("defines every UI token and keeps text, action, status and focus contrast in both themes", () => {
    const definitions = new Set([...`${css}\n${themeStyles()}`.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const consumed = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
    expect(consumed.filter((token) => !definitions.has(token))).toEqual([]);
    for (const tokens of Object.values(THEME_TOKENS)) {
      for (const surface of ["bg", "surface", "surface-muted", "surface-hover", "accent-soft"] as const) {
        for (const foreground of ["text", "text-soft", "text-faint", "brand"] as const) {
          expect(contrast(tokens[foreground], tokens[surface]), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const background of ["action", "action-hover"] as const) {
        expect(contrast(tokens["on-action"], tokens[background])).toBeGreaterThanOrEqual(4.5);
      }
      for (const status of ["success", "info", "warning", "danger"] as const) {
        expect(contrast(tokens[status], tokens[`${status}-soft`])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens[status], tokens["surface-muted"])).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens["on-danger"], tokens.danger)).toBeGreaterThanOrEqual(4.5);
      for (const surface of ["bg", "surface", "surface-muted"] as const) {
        expect(contrast(tokens.focus, tokens[surface])).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens["border-strong"], tokens[surface])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("restores legacy preferences without accepting malformed values or stored actions", async () => {
    const saved = {
      theme: "dark", activeProjectId: "existing-project", horizontalLayout: [30, 45, 25],
      verticalLayout: [70, 30], leftCollapsed: true, rightCollapsed: false, lowerCollapsed: true,
    };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: saved, version: 0 }));
    await useWorkspaceStore.persist.rehydrate();
    expect(useWorkspaceStore.getState()).toMatchObject(saved);
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: { theme: "sepia", horizontalLayout: null, setTheme: "invalid", activeProjectId: {} }, version: 0 }));
    await useWorkspaceStore.persist.rehydrate();
    expect(useWorkspaceStore.getState().theme).toBe("light");
    expect(useWorkspaceStore.getState().activeProjectId).toBeNull();
    expect(useWorkspaceStore.getState().horizontalLayout).toEqual([30, 45, 25]);
    expect(typeof useWorkspaceStore.getState().setTheme).toBe("function");
  });

  it("allows session preferences when browser storage reads or writes are blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await useWorkspaceStore.persist.rehydrate();
    expect(() => useWorkspaceStore.getState().setTheme("dark")).not.toThrow();
    expect(useWorkspaceStore.getState().theme).toBe("dark");
  });
});
