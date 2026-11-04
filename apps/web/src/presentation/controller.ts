import type { MolecularViewer, PresentationCapture } from "../viewer/MolecularViewer";
import { presentationReady } from "./protocol";

/** Owns one child above disposable molecular viewer instances. */
export class PresentationController {
  private child: Window | null = null;
  private session = "";
  private generation = 0;
  private viewer: MolecularViewer | null = null;
  private capture: PresentationCapture | null = null;
  private status: string | null = "Waiting for the molecular viewer";
  private preview = false;

  constructor(private readonly owner: Window) {}

  start() { this.owner.addEventListener("message", this.ready); }

  private ready = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!this.child || event.source !== this.child || event.origin !== this.owner.location.origin
      || !data || typeof data !== "object" || !("type" in data) || !("session" in data)
      || data.type !== presentationReady || data.session !== this.session) return;
    this.publish();
  };

  bind(viewer: MolecularViewer): () => void {
    this.clearCapture();
    this.viewer = viewer;
    this.generation++;
    this.status = "Loading molecular scene";
    this.publish();
    return () => {
      if (this.viewer !== viewer) return;
      this.clearCapture();
      this.viewer = null;
      this.generation++;
      this.status = "Waiting for the molecular viewer";
      this.publish();
    };
  }

  update(viewer: MolecularViewer, status: string | null, preview: boolean) {
    if (viewer !== this.viewer || (this.status === status && this.preview === preview)) return;
    this.status = status;
    this.preview = preview;
    this.publish();
  }

  open(): string | null {
    if (this.child && !this.child.closed) {
      this.child.focus();
      return null;
    }
    this.clearCapture();
    this.session = this.owner.crypto.randomUUID();
    const url = new URL(this.owner.location.href);
    url.hash = `presentation=${this.session}`;
    this.child = this.owner.open(url.href, `neistra-presentation-${this.session}`, "popup,width=1000,height=700");
    if (!this.child) return "Allow pop-ups for Neistra to open the presentation viewer.";
    return null;
  }

  private publish() {
    const child = this.child;
    if (!child || child.closed) { this.clearCapture(); return; }
    try {
      const receiver = child.neistraPresentation;
      if (!receiver) return;
      if (!this.capture && this.viewer) this.capture = this.viewer.capturePresentation?.() ?? null;
      receiver.receive({ session: this.session, generation: this.generation,
        status: this.capture ? this.status : "Presentation capture is unavailable in this browser",
        preview: this.preview }, this.capture?.stream ?? null);
      this.capture?.refresh();
    } catch {
      this.clearCapture();
      child.neistraPresentation?.receive({ session: this.session, generation: ++this.generation,
        status: "The molecular presentation could not start", preview: false }, null);
    }
  }

  private clearCapture() {
    this.capture?.stream.getTracks().forEach(track => track.stop());
    this.capture = null;
  }

  dispose() {
    this.owner.removeEventListener("message", this.ready);
    this.clearCapture();
    this.child?.close();
    this.child = null;
    this.viewer = null;
  }
}
