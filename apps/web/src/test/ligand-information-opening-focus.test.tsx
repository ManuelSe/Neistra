import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import metadata from "../../../../tests/fixtures/profiles/registry.json";
import App from "../App";
import { molecularApi, projectApi, workspacePresentationApi } from "../api/client";
import type { Project } from "../api/types";
import { ligandApi } from "../ligands/api";
import type { LigandCandidatesRead } from "../ligands/types";
import { ligandProfileApi } from "../ligandProfiles/api";
import { parseProfileRegistry } from "../ligandProfiles/validate";
import { ligandPropertyApi } from "../ligandProperties/api";
import { useMinimizationStore } from "../minimization/store";
import { useEditingStore } from "../store/editing";
import { useNavigationStore } from "../store/navigation";
import { useSelectionStore } from "../store/selection";
import { useWorkspaceStore } from "../store/workspace";
import { structureQueryKey } from "../structures/query";
import { propertyPreferences } from "./ligand-properties-fixtures";
import { molecularEntry, molecularProject, proteinProjection } from "./molecular-fixtures";

// Keep both the application owner and the complete Inspector implementation real.
vi.mock("../components/WorkspaceCanvas", () => ({ WorkspaceCanvas: () => null }));
vi.mock("../components/LowerPanel", () => ({ LowerPanel: () => null }));

const registry = parseProfileRegistry(metadata);
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useWorkspaceStore.setState({ theme: "light", activeProjectId: null, mobilePanel: null,
    leftCollapsed: false, rightCollapsed: false, lowerCollapsed: true });
  useSelectionStore.getState().setProject(null);
  useEditingStore.getState().setProject(null);
  useMinimizationStore.getState().setProject(null);
  useNavigationStore.getState().setProject(null);
  vi.spyOn(workspacePresentationApi, "read").mockResolvedValue({ schema_version: 1,
    revision: 0, camera: null, updated_at: null });
  vi.spyOn(ligandProfileApi, "registry").mockResolvedValue(registry);
  vi.spyOn(ligandPropertyApi, "registry").mockResolvedValue({ ...registry.descriptor_method,
    definitions: [...registry.descriptors] });
  vi.spyOn(ligandPropertyApi, "preferences").mockResolvedValue({ ...propertyPreferences,
    enabled_categories: [] });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  vi.restoreAllMocks();
});

function mediaMode() {
  let compact = true;
  type Listener = EventListenerOrEventListenerObject
    | ((this: MediaQueryList, event: MediaQueryListEvent) => unknown);
  const listeners = new Map<Listener, MediaQueryList>();
  vi.spyOn(window, "matchMedia").mockImplementation(query => {
    const media: MediaQueryList = {
      get matches() { return query === "(max-width: 840px)" && compact; },
      media: query, onchange: null,
      addEventListener: (type: string, listener: Listener | null) => {
        if (type === "change" && listener && query === "(max-width: 840px)") listeners.set(listener, media);
      },
      removeEventListener: (_type: string, listener: Listener | null) => { if (listener) listeners.delete(listener); },
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    };
    return media;
  });
  return (next: boolean) => act(() => {
    compact = next;
    for (const [listener, media] of listeners) {
      const event = Object.assign(new Event("change"), { matches: media.matches, media: media.media });
      if (typeof listener === "function") listener.call(media, event);
      else listener.handleEvent(event);
    }
  });
}

function heldFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    pending.set(++next, callback);
    return next;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { pending.delete(id); });
  return {
    snapshot: () => [...pending.entries()],
    // Retained callbacks can be invoked even after cancellation to model an
    // animation callback already dispatched before its owning visit retired.
    invoke: (frames: [number, FrameRequestCallback][]) => act(() => {
      for (const [id, callback] of frames) {
        pending.delete(id);
        callback(performance.now());
      }
    }),
  };
}

function inventory(project: Project): LigandCandidatesRead {
  const entry = project.entries[0];
  return { project_id: project.id, entry_id: entry.id, artifact_id: entry.current_artifact_id,
    designation: entry.ligand_designation, input_hash: "source-inventory",
    resolver_version: "ligand-instance-v3", total: 1, offset: 0, limit: 12,
    designated_candidate: null, warnings: [], selectable_candidate_keys: ["source-instance"],
    candidates: [{ candidate_key: "source-instance", atom_ids: [1, 2], residue_ids: [1],
      component_ids: ["source-instance"], label: "Exact source instance", locations: [],
      boundary_status: "source_instance", potential_ligand: true, reason_codes: [],
      provenance: [], heavy_atom_count: 2, formal_charge: null, formula: null,
      molecular_weight: null, chemistry_status: "unavailable", chemistry_reason: "source_chemistry_unavailable",
      chemical_input_hash: null, occurrence_count: null, occurrence_basis: null,
      occurrence_reason: "occurrence_count_not_qualified" }] };
}

async function setup(withProject = true) {
  const setCompact = mediaMode();
  // jsdom has no layout; expose DOM-visible tab stops without inventing reading geometry.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function(this: HTMLElement) {
    const hidden = this.closest("[hidden], [inert]") || getComputedStyle(this).display === "none"
      || getComputedStyle(this).visibility === "hidden";
    return (hidden ? [] : [new DOMRect()]) as unknown as DOMRectList;
  });
  const entry = molecularEntry("entry", "Source entry", "protein");
  if (!entry.current_artifact_id) throw new Error("Focus fixture requires a current source artifact.");
  const artifactId = entry.current_artifact_id;
  entry.ligand_designation = { ...entry.ligand_designation, status: "selection_required" };
  const project = molecularProject([entry]);
  project.has_uncheckpointed_changes = false;
  vi.spyOn(projectApi, "list").mockResolvedValue(withProject ? [{ ...project, entry_count: 1 }] : []);
  vi.spyOn(projectApi, "get").mockResolvedValue(project);
  vi.spyOn(ligandApi, "candidates").mockResolvedValue(inventory(project));
  const projection = { ...proteinProjection(), entry_id: entry.id, artifact_id: artifactId };
  vi.spyOn(molecularApi, "structure").mockResolvedValue(projection);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false } } });
  clients.push(client);
  if (withProject) {
    client.setQueryData(["project", project.id], project);
    client.setQueryData(structureQueryKey(project.id, entry.id, entry.current_artifact_id), projection);
    useWorkspaceStore.getState().setActiveProjectId(project.id);
  }
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  await screen.findByRole("button", { name: "Inspector" });
  if (withProject) {
    await waitFor(() => expect(useSelectionStore.getState().projectId).toBe(project.id));
    act(() => useNavigationStore.getState().inspect(project.id, entry.id));
  }
  const frames = heldFrames(), user = userEvent.setup();
  const open = async () => {
    const trigger = screen.getByRole("button", { name: "Inspector" });
    await user.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Inspector panel" });
    await within(drawer).findByRole("region", { name: "Project inspector" });
    const opening = frames.snapshot();
    expect(opening.length).toBeGreaterThan(0);
    return { trigger, drawer, opening };
  };
  return { user, frames, open, setCompact };
}

describe("real Inspector opening focus", () => {
  it.each(["heading", "entry"] as const)("keeps compact resume focus visible when short loading content becomes scrollable later (%s)", async destination => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
    const positions = new WeakMap<HTMLElement, number>();
    let maximum = 1000;
    Object.defineProperty(HTMLElement.prototype, "scrollTop", { configurable: true,
      get(this: HTMLElement) { return positions.get(this) ?? 0; },
      set(this: HTMLElement, top: number) {
        positions.set(this, this.classList.contains("inspector-scroll") ? Math.min(maximum, Math.max(0, top)) : top);
      } });
    try {
      const f = await setup(), first = await f.open();
      f.frames.invoke(first.opening);
      first.drawer.querySelector<HTMLElement>(".inspector-scroll")!.scrollTop = 300;
      await f.user.keyboard("{Escape}");
      maximum = 0;
      const reopened = await f.open();
      const owner = reopened.drawer.querySelector<HTMLElement>(".inspector-scroll")!;
      expect(owner.scrollTop).toBe(0);
      f.frames.invoke(reopened.opening);
      const heading = within(reopened.drawer).getByRole("heading", { name: "Ligand information" });
      expect(heading).toHaveFocus();
      const entry = within(reopened.drawer).getByRole("combobox", { name: "Entry" });
      if (destination === "entry") {
        await f.user.tab();
        expect(within(reopened.drawer).getByRole("button", { name: "Inspector tools" })).toHaveFocus();
        await f.user.tab(); expect(entry).toHaveFocus();
      }
      // Controlled layout/DOM publication, not a chemistry or native rendering claim.
      maximum = 1000;
      const content = document.createElement("p"); content.textContent = "Current content arrived";
      act(() => { owner.append(content); });
      if (destination === "entry") {
        await act(async () => { await Promise.resolve(); });
        expect(owner.scrollTop).toBe(0); expect(entry).toHaveFocus();
      } else {
        await waitFor(() => expect(owner.scrollTop).toBe(300));
        expect(heading).toHaveFocus();
      }
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, "scrollTop", previous);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollTop");
    }
  });

  it.each([false, true])("resumes a deep compact reading position without offscreen Entry autofocus (later task: %s)", async laterTask => {
    const f = await setup(), first = await f.open();
    f.frames.invoke(first.opening);
    const owner = first.drawer.querySelector<HTMLElement>(".inspector-scroll")!;
    owner.scrollTop = 300;
    await f.user.keyboard("{Escape}");
    expect(first.drawer).not.toBeInTheDocument();
    const reopened = await f.open();
    const replacement = reopened.drawer.querySelector<HTMLElement>(".inspector-scroll")!;
    expect(replacement.scrollTop).toBe(300);
    if (laterTask) {
      await f.user.click(within(reopened.drawer).getByRole("button", { name: "Choose" }));
      const chooser = await screen.findByRole("dialog", { name: "Choose ligand of interest" });
      const radio = await within(chooser).findByRole("radio");
      radio.focus(); f.frames.invoke(reopened.opening);
      expect(radio).toHaveFocus();
    } else {
      f.frames.invoke(reopened.opening);
      const heading = within(reopened.drawer).getByRole("heading", { name: "Ligand information" });
      expect(heading).toHaveFocus();
      expect(heading).toHaveAttribute("tabindex", "-1");
      expect(replacement.scrollTop).toBe(300);
    }
  });

  it("starts untouched Ligand view at Entry rather than the header or hidden Tools", async () => {
    const f = await setup(), { trigger, drawer, opening } = await f.open();
    expect(trigger).toHaveFocus();
    expect(within(drawer).queryByRole("tab", { name: "selection" })).toBeNull();
    const entry = within(drawer).getByRole("combobox", { name: "Entry" });
    expect(entry).toBeEnabled();
    f.frames.invoke(opening);
    expect(entry).toHaveFocus();
    expect(within(drawer).getByRole("button", { name: "Inspector tools" })).not.toHaveFocus();
  });

  it("remembers Tools and opens at its selected visible tab after closing and reopening", async () => {
    const f = await setup(), first = await f.open();
    f.frames.invoke(first.opening);
    await f.user.click(within(first.drawer).getByRole("button", { name: "Inspector tools" }));
    await f.user.click(within(first.drawer).getByRole("tab", { name: "inspect" }));
    await f.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Inspector panel" })).toBeNull();
    f.frames.invoke(f.frames.snapshot());
    const next = await f.open();
    const selected = within(next.drawer).getByRole("tab", { name: "inspect" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(within(next.drawer).queryByRole("combobox", { name: "Entry" })).toBeNull();
    f.frames.invoke(next.opening);
    expect(selected).toHaveFocus();
  });

  it("yields a delayed opening to Choose and preserves its keyboard activation", async () => {
    const f = await setup(), { drawer, opening } = await f.open();
    const choose = await within(drawer).findByRole("button", { name: "Choose" });
    choose.focus();
    f.frames.invoke(opening);
    expect(choose).toHaveFocus();
    await f.user.keyboard("{Enter}");
    const chooser = await screen.findByRole("dialog", { name: "Choose ligand of interest" });
    expect(await within(chooser).findByRole("radio")).toBeVisible();
  });

  it("leaves nested chooser focus intact when the earlier opening frame arrives", async () => {
    const f = await setup(), { drawer, opening } = await f.open();
    await f.user.click(await within(drawer).findByRole("button", { name: "Choose" }));
    const chooser = await screen.findByRole("dialog", { name: "Choose ligand of interest" });
    const radio = await within(chooser).findByRole("radio");
    radio.focus();
    f.frames.invoke(opening);
    expect(radio).toHaveFocus();
    expect(chooser).toBeVisible();
  });

  it("preserves keyboard focus on a deliberate view toggle while opening is pending", async () => {
    const f = await setup(), { drawer, opening } = await f.open();
    const toggle = within(drawer).getByRole("button", { name: "Inspector tools" });
    toggle.focus();
    await f.user.keyboard("{Enter}");
    expect(toggle).toHaveAccessibleName("Ligand information");
    f.frames.invoke(opening);
    f.frames.invoke(f.frames.snapshot());
    expect(toggle).toHaveFocus();
    expect(within(drawer).getByRole("tab", { name: "selection" })).toBeVisible();
  });

  it("resolves the current visible target when a programmatic view change precedes the opening frame", async () => {
    const f = await setup(), { trigger, drawer, opening } = await f.open();
    fireEvent.click(within(drawer).getByRole("button", { name: "Inspector tools" }));
    expect(trigger).toHaveFocus();
    const selected = within(drawer).getByRole("tab", { name: "selection" });
    f.frames.invoke(opening);
    expect(selected).toHaveFocus();
    expect(selected).toBeVisible();
  });

  it("rejects a retired callback even when replacement panel visits reuse the same drawer node", async () => {
    const f = await setup(), first = await f.open();
    fireEvent.click(screen.getByRole("button", { name: "Project browser" }));
    expect(screen.getByRole("dialog", { name: "Project browser panel" })).toBe(first.drawer);
    fireEvent.click(first.trigger);
    const replacement = screen.getByRole("dialog", { name: "Inspector panel" });
    expect(replacement).toBe(first.drawer);
    expect(first.trigger).toHaveFocus();
    const current = f.frames.snapshot();
    f.frames.invoke(first.opening);
    expect(first.trigger).toHaveFocus();
    f.frames.invoke(current);
    expect(within(replacement).getByRole("combobox", { name: "Entry" })).toHaveFocus();
  });

  it.each(["ligand", "tools"] as const)("retires responsive callbacks and preserves %s view across desktop and compact remounts", async view => {
    const f = await setup(), first = await f.open();
    if (view === "tools") {
      await f.user.click(within(first.drawer).getByRole("button", { name: "Inspector tools" }));
      await f.user.click(within(first.drawer).getByRole("tab", { name: "inspect" }));
    }
    f.setCompact(false);
    expect(first.drawer).not.toBeInTheDocument();
    const desktop = screen.getByRole("region", { name: "Project inspector" });
    const desktopTarget = view === "tools" ? within(desktop).getByRole("tab", { name: "inspect" })
      : within(desktop).getByRole("combobox", { name: "Entry" });
    desktopTarget.focus();
    f.frames.invoke(first.opening);
    expect(desktopTarget).toHaveFocus();
    f.setCompact(true);
    const replacement = screen.getByRole("dialog", { name: "Inspector panel" });
    const target = view === "tools" ? within(replacement).getByRole("tab", { name: "inspect" })
      : within(replacement).getByRole("combobox", { name: "Entry" });
    const current = f.frames.snapshot();
    f.frames.invoke(first.opening);
    expect(target).not.toHaveFocus();
    f.frames.invoke(current);
    expect(target).toHaveFocus();
    expect(target).toBeVisible();
  });

  it("uses a visible enabled fallback when no preferred Entry exists, excluding hidden Tools", async () => {
    const f = await setup(false), { drawer, opening } = await f.open();
    expect(within(drawer).queryByRole("combobox", { name: "Entry" })).toBeNull();
    expect(within(drawer).queryByRole("tab", { name: "selection" })).toBeNull();
    const fallback = within(drawer).getByRole("button", { name: "Inspector tools" });
    expect(fallback).toBeVisible();
    expect(fallback).toBeEnabled();
    f.frames.invoke(opening);
    expect(fallback).toHaveFocus();
  });
});
