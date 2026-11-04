import type { MolecularViewer, PresentationCapture, PresentationPointer } from "../viewer/MolecularViewer";
import { presentationReady } from "./protocol";

/** Owns one child above disposable molecular viewer instances. */
export class PresentationController {
  private child: Window | null = null;
  private session = "";
  private generation = 0;
  private binding = 0;
  private viewer: MolecularViewer | null = null;
  private capture: PresentationCapture | null = null;
  private status: string | null = "Waiting for the molecular viewer";
  private preview = false;
  private timer: number | undefined;
  private lastReply = 0;
  private captureFailed = false;
  private available = true;
  private captureCleanup: (() => void) | undefined;
  private point: PresentationPointer | null = null;
  private pointerTimer: number | undefined;

  constructor(private readonly owner: Window) {}

  start() {
    this.owner.addEventListener("message", this.ready);
    this.owner.addEventListener("pagehide", this.disconnect);
    this.owner.document.addEventListener("visibilitychange", this.visibility);
  }

  private visibility = () => this.publish(true);

  unavailable(status: string) {
    if (this.viewer) return;
    this.status = status;
    this.publish();
  }

  private ready = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!this.child || event.source !== this.child || event.origin !== this.owner.location.origin
      || !data || typeof data !== "object" || !("type" in data) || !("session" in data)
      || data.type !== presentationReady || data.session !== this.session) return;
    this.lastReply = Date.now();
    this.publish();
  };

  /** Invalidate before a project switch can expose a retired scene. */
  retire() {
    this.binding++;
    this.clearCapture();
    this.viewer = null;
    this.generation++;
    this.status = "Waiting for the molecular viewer";
    this.preview = false;
    this.publish();
  }

  bind(viewer: MolecularViewer): () => void {
    this.clearCapture();
    this.viewer = viewer;
    const binding = ++this.binding;
    this.generation++;
    this.status = "Loading molecular scene";
    this.captureFailed = false;
    this.publish();
    return () => {
      if (this.viewer !== viewer || this.binding !== binding) return;
      this.retire();
    };
  }

  update(viewer: MolecularViewer, status: string | null, preview: boolean) {
    if (viewer !== this.viewer || (this.status === status && this.preview === preview)) return;
    this.status = status;
    this.preview = preview;
    this.publish(true);
  }

  open(): string | null {
    if (this.child && !this.child.closed) {
      this.child.focus();
      if (this.captureFailed) { this.captureFailed = false; this.publish(true); }
      return null;
    }
    this.clearCapture();
    this.captureFailed = false;
    this.session = this.owner.crypto.randomUUID();
    const url = new URL(this.owner.location.href);
    url.hash = `presentation=${this.session}`;
    this.child = this.owner.open(url.href, `neistra-presentation-${this.session}`, "popup,width=1000,height=700");
    if (!this.child) return "Allow pop-ups for Neistra to open the presentation viewer.";
    this.lastReply = Date.now();
    if (this.timer !== undefined) this.owner.clearInterval(this.timer);
    this.timer = this.owner.setInterval(() => this.publish(), 1000);
    return null;
  }

  private publish(refresh = false) {
    const child = this.child;
    if (!child || child.closed) {
      this.clearCapture();
      if (this.timer !== undefined) this.owner.clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    try {
      const receiver = child.neistraPresentation;
      if (!receiver) {
        if (Date.now() - this.lastReply > 10000) this.disconnect();
        return;
      }
      let attached = false;
      if (!this.capture && this.viewer && !this.captureFailed) {
        this.capture = this.viewer.capturePresentation?.() ?? null;
        this.captureFailed = !this.capture;
        if (this.capture) {
          const capture = this.capture;
          attached = true;
          this.available = true;
          const unsubscribe = capture.subscribeAvailability?.(available => {
            if (this.capture !== capture) return;
            this.available = available; this.publish(available);
          });
          const unsubscribePointer = capture.subscribePointer?.(point => {
            if (this.capture !== capture) return;
            this.point = point;
            if (!point) { this.clearPointer(); return; }
            if (this.pointerTimer !== undefined) return;
            this.pointerTimer = this.owner.setTimeout(() => {
              this.pointerTimer = undefined; this.sendPointer();
            }, 33);
          });
          const tracks = capture.stream.getVideoTracks();
          const health = () => { if (this.capture === capture) this.publish(true); };
          for (const track of tracks) for (const event of ["ended", "mute", "unmute"]) track.addEventListener(event, health);
          this.captureCleanup = () => {
            unsubscribe?.();
            unsubscribePointer?.();
            for (const track of tracks) for (const event of ["ended", "mute", "unmute"]) track.removeEventListener(event, health);
          };
        }
      }
      const tracks = this.capture?.stream.getVideoTracks();
      const status = this.owner.document.hidden ? "Presentation paused while the workspace is hidden"
        : Date.now() - this.lastReply > 10000 ? "Presentation connection paused"
        : !this.viewer ? this.status
        : !this.capture ? "Presentation capture is unavailable in this browser"
        : !this.available || !tracks?.length || tracks.some(track => track.readyState !== "live" || track.muted)
          ? "The molecular presentation source is unavailable" : this.status;
      receiver.receive({ session: this.session, generation: this.generation,
        status, preview: this.preview }, this.capture?.stream ?? null);
      if (attached || refresh) this.capture?.refresh();
    } catch {
      this.clearCapture();
      this.captureFailed = true;
      try {
        child.neistraPresentation?.receive({ session: this.session, generation: ++this.generation,
          status: "The molecular presentation could not start. Reopen from the workspace.", preview: false }, null);
      } catch { this.disconnect(); }
    }
  }

  private clearCapture() {
    this.clearPointer();
    this.captureCleanup?.();
    this.captureCleanup = undefined;
    this.capture?.stream.getTracks().forEach(track => track.stop());
    this.capture = null;
  }

  private sendPointer() {
    try { this.child?.neistraPresentation?.pointer?.(this.session, this.generation, this.point); }
    catch { /* Source/connection status owns recovery after child navigation. */ }
  }

  private clearPointer() {
    if (this.pointerTimer !== undefined) this.owner.clearTimeout(this.pointerTimer);
    this.pointerTimer = undefined;
    this.point = null;
    this.sendPointer();
  }

  private disconnect = () => {
    try {
      this.child?.neistraPresentation?.receive({ session: this.session, generation: ++this.generation,
        status: "Workspace disconnected. Reopen presentation from the workspace.", preview: false, ended: true }, null);
    } catch { /* A navigated child no longer belongs to this local session. */ }
    this.clearCapture();
    if (this.timer !== undefined) this.owner.clearInterval(this.timer);
    this.timer = undefined;
    this.child = null;
  };

  dispose() {
    this.owner.removeEventListener("message", this.ready);
    this.owner.removeEventListener("pagehide", this.disconnect);
    this.owner.document.removeEventListener("visibilitychange", this.visibility);
    this.disconnect();
    this.viewer = null;
  }
}
