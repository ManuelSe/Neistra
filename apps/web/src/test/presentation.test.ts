import { afterEach, describe, expect, it, vi } from "vitest";
import { PresentationController } from "../presentation/controller";
import { presentationReady } from "../presentation/protocol";
import type { MolecularViewer } from "../viewer/MolecularViewer";

afterEach(() => vi.restoreAllMocks());

describe("local presentation", () => {
  it("binds only the owned child/session, focuses it and stops retired capture", () => {
    const receive = vi.fn();
    const stop = vi.fn();
    const refresh = vi.fn();
    const focus = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const child = { closed: false, focus, close: vi.fn(), neistraPresentation: { receive } } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(child);
    const controller = new PresentationController(window);
    controller.start();
    const capture = vi.fn(() => ({ stream, refresh }));
    const viewer = { capturePresentation: capture } as unknown as MolecularViewer;
    const release = controller.bind(viewer);
    controller.update(viewer, null, false);
    expect(controller.open()).toBeNull();
    const session = new URL(String(open.mock.calls[0][0])).hash.split("=")[1];
    const ready = (origin: string, source: Window, token = session) => window.dispatchEvent(new MessageEvent("message", {
      origin, source, data: { type: presentationReady, session: token },
    }));
    ready("https://other.invalid", child);
    ready(window.location.origin, window);
    ready(window.location.origin, child, "other");
    expect(receive).not.toHaveBeenCalled();
    ready(window.location.origin, child);
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({ session, status: null }), stream);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    controller.open();
    expect(open).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    release();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Presentation capture is unavailable in this browser" }), null);
    controller.dispose();
  });

  it("reports blocked popups without starting a capture", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const controller = new PresentationController(window);
    expect(controller.open()).toContain("Allow pop-ups");
    controller.dispose();
  });
});
