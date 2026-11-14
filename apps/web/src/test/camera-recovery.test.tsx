import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CameraRecovery } from "../components/CameraRecovery";
import { WorkspacePresentationController } from "../workspacePresentation/controller";
import type { SessionCamera, WorkspacePresentationApi, WorkspacePresentationV1 } from "../workspacePresentation/types";

const camera = (x = 0): SessionCamera => ({ mode: "perspective", position: [3 + x, -4, 20],
  target: [x, 1, 2], up: [0.2, 1, 0.1], radius: 12, fov: 0.91 });
const presentation = (pose: SessionCamera | null, revision = pose ? 5 : 0): WorkspacePresentationV1 => ({
  schema_version: 1, revision, camera: pose, updated_at: pose ? "2026-11-14T02:00:00Z" : null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
function setup() {
  let server = presentation(camera()), storageUnavailable = false;
  const values = new Map<string, string>();
  const api: WorkspacePresentationApi = {
    read: vi.fn(() => Promise.resolve(structuredClone(server))),
    write: vi.fn((pose: SessionCamera, expected: number) => {
      if (expected !== server.revision) return Promise.reject(Object.assign(new Error("Conflict"), { code: "presentation_revision_conflict" }));
      server = presentation(structuredClone(pose), expected + 1); return Promise.resolve(structuredClone(server));
    }),
  };
  const controller = new WorkspacePresentationController({ api, storage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (storageUnavailable) throw new Error("Storage unavailable"); values.set(key, value); },
  } });
  return { controller, api, setServer(value: WorkspacePresentationV1) { server = value; }, failStorage(value: boolean) { storageUnavailable = value; } };
}
async function hydrate(controller: WorkspacePresentationController) { await act(async () => { await controller.hydrate(); }); }

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.style.removeProperty("--camera-recovery-height"); });

it("keeps ordinary saved and saving camera states silent", async () => {
  const h = setup(), write = deferred<WorkspacePresentationV1>();
  await hydrate(h.controller);
  render(<CameraRecovery cameraPresentation={h.controller} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  vi.mocked(h.api.write).mockImplementationOnce(() => write.promise);
  let completion!: Promise<void>;
  act(() => { h.controller.acceptNavigation(camera(1)); completion = h.controller.flush(); });
  await waitFor(() => expect(h.api.write).toHaveBeenCalledOnce());
  expect(h.controller.getSnapshot().status).toBe("saving");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await act(async () => { write.resolve(presentation(camera(1), 6)); await completion; });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("keeps Retry focused during a deferred retry and restores Projects in an empty workspace", async () => {
  const h = setup(), read = deferred<WorkspacePresentationV1>(), user = userEvent.setup();
  vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline"));
  render(<><button type="button" aria-label="Projects">Projects</button><CameraRecovery cameraPresentation={h.controller} /></>);
  const projects = screen.getByRole("button", { name: "Projects" }); act(() => projects.focus());
  await hydrate(h.controller);
  expect(screen.getByRole("status")).toHaveTextContent("View not saved"); expect(projects).toHaveFocus();
  vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
  const retry = screen.getByRole("button", { name: "Retry saving view" });
  await user.click(retry);
  await waitFor(() => expect(h.api.read).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Retry saving view" })).toBe(retry);
  expect(retry).toHaveFocus(); expect(retry).not.toBeDisabled(); expect(retry).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Saving view…");
  await act(async () => { read.resolve(presentation(null)); await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  await waitFor(() => expect(projects).toHaveFocus());
  expect(h.api.write).not.toHaveBeenCalled();
});

it("leaves navigation usable without re-announcing an unchanged error and restores the viewer after recovery", async () => {
  const h = setup(), write = deferred<WorkspacePresentationV1>(), user = userEvent.setup();
  await hydrate(h.controller);
  render(<><button type="button">Other workspace action</button><div tabIndex={0} data-movement-canvas="true">Molecular canvas</div>
    <CameraRecovery cameraPresentation={h.controller} /></>);
  const outside = screen.getByRole("button", { name: "Other workspace action" }); act(() => outside.focus());
  vi.mocked(h.api.write).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => { h.controller.acceptNavigation(camera(1)); await h.controller.flush(); });
  const status = screen.getByRole("status"), text = status.textContent;
  expect(outside).toHaveFocus();
  act(() => { h.controller.acceptNavigation(camera(2)); });
  expect(screen.getByRole("status")).toBe(status); expect(status.textContent).toBe(text); expect(outside).toHaveFocus();
  vi.mocked(h.api.write).mockImplementationOnce(() => write.promise);
  const retry = screen.getByRole("button", { name: "Retry saving view" }); await user.click(retry);
  await waitFor(() => expect(h.api.write).toHaveBeenCalledTimes(2));
  expect(retry).toHaveFocus();
  await act(async () => { write.resolve(presentation(camera(2), 6)); await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByText("Molecular canvas")).toHaveFocus());
});

it("requires explicit Save current view for a conflict and preserves that action through saving", async () => {
  const h = setup(), write = deferred<WorkspacePresentationV1>(), user = userEvent.setup();
  await hydrate(h.controller);
  h.setServer(presentation(camera(9), 6));
  await act(async () => { h.controller.acceptNavigation(camera(2)); await h.controller.flush(); });
  render(<><button type="button" aria-label="Projects">Projects</button><CameraRecovery cameraPresentation={h.controller} /></>);
  expect(screen.getByRole("status")).toHaveTextContent("Saved view changed elsewhere");
  expect(h.controller.getSnapshot().camera).toEqual(camera(2));
  expect(h.api.write).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Retry saving view" })).not.toBeInTheDocument();
  vi.mocked(h.api.write).mockImplementationOnce(() => write.promise);
  const save = screen.getByRole("button", { name: "Save current view" }); await user.click(save);
  await waitFor(() => expect(h.api.write).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Save current view" })).toBe(save); expect(save).toHaveFocus();
  expect(save).toHaveAttribute("aria-disabled", "true");
  expect(h.api.write).toHaveBeenLastCalledWith(camera(2), 6, { keepalive: false });
  await act(async () => { write.resolve(presentation(camera(2), 7)); await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(h.controller.getSnapshot().camera).toEqual(camera(2));
});

it("labels mirror failure honestly while the server pose is saved and retries recovery", async () => {
  const h = setup(), user = userEvent.setup(); h.failStorage(true);
  await hydrate(h.controller);
  expect(h.controller.getSnapshot()).toMatchObject({ status: "saved", problem: "recovery" });
  render(<CameraRecovery cameraPresentation={h.controller} />);
  expect(screen.getByRole("status")).toHaveTextContent("View recovery unavailable");
  expect(screen.getByRole("status")).not.toHaveTextContent("View not saved");
  h.failStorage(false); await user.click(screen.getByRole("button", { name: "Retry saving view" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(h.api.write).not.toHaveBeenCalled();
});

it("preserves display guidance rather than claiming an acknowledged pose is unsaved", async () => {
  const h = setup(); await hydrate(h.controller);
  act(() => { h.controller.bind({ setSessionCamera: () => { throw new Error("Cannot display"); }, getSessionCamera: () => camera(1), subscribeSessionCamera: () => () => {} }); });
  render(<CameraRecovery cameraPresentation={h.controller} />);
  expect(screen.getByRole("status")).toHaveTextContent("View unavailable. Adjust the view or use Fit.");
  expect(screen.getByRole("status")).not.toHaveTextContent("View not saved");
});

it("does not return focus behind an open modal when recovery finishes", async () => {
  const h = setup(), read = deferred<WorkspacePresentationV1>(), user = userEvent.setup();
  vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline"));
  const view = render(<><button type="button" aria-label="Projects">Projects</button><CameraRecovery cameraPresentation={h.controller} /></>);
  await hydrate(h.controller);
  vi.mocked(h.api.read).mockImplementationOnce(() => read.promise);
  await user.click(screen.getByRole("button", { name: "Retry saving view" }));
  view.rerender(<><button type="button" aria-label="Projects">Projects</button><CameraRecovery cameraPresentation={h.controller} />
    <div role="dialog" aria-label="Another task" aria-modal="true"><button type="button">Modal action</button></div></>);
  await act(async () => { read.resolve(presentation(null)); await Promise.resolve(); });
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Projects" })).not.toHaveFocus();
});

it("measures the recovery row for neighboring tools and restores the previous offset on hiding", async () => {
  const h = setup(), user = userEvent.setup(); vi.mocked(h.api.read).mockRejectedValueOnce(new Error("Offline"));
  let height = 53, resized: (() => void) | undefined;
  const disconnected = vi.fn();
  const originalObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resized = () => callback([], this as unknown as ResizeObserver); }
    observe() {}
    unobserve() {}
    disconnect() { disconnected(); }
  };
  try {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return new DOMRect(0, 0, 320, this.classList.contains("camera-recovery") ? height : 0);
    });
    document.documentElement.style.setProperty("--camera-recovery-height", "9px");
    render(<CameraRecovery cameraPresentation={h.controller} />); await hydrate(h.controller);
    expect(document.documentElement.style.getPropertyValue("--camera-recovery-height")).toBe("53px");
    height = 80; act(() => resized?.());
    expect(document.documentElement.style.getPropertyValue("--camera-recovery-height")).toBe("80px");
    await user.click(screen.getByRole("button", { name: "Retry saving view" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(document.documentElement.style.getPropertyValue("--camera-recovery-height")).toBe("9px");
    expect(disconnected).toHaveBeenCalledOnce();
  } finally { cleanup(); globalThis.ResizeObserver = originalObserver; }
});
