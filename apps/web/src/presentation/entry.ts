import { presentationReady, type PresentationState } from "./protocol";
import "./presentation.css";

/** This entry never imports the workspace, API client or molecular renderer. */
export function mountPresentation(session: string) {
  document.title = "Neistra presentation";
  const root = document.getElementById("root")!;
  root.className = "presentation";
  root.setAttribute("aria-label", "Read-only molecular presentation");
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.setAttribute("aria-label", "Live molecular view");
  const status = document.createElement("div");
  status.className = "presentation-status";
  status.setAttribute("role", "status");
  status.textContent = "Connecting to the workspace…";
  const preview = document.createElement("div");
  preview.className = "presentation-preview";
  preview.textContent = "Preview";
  preview.hidden = true;
  const fullscreen = document.createElement("button");
  fullscreen.type = "button";
  fullscreen.className = "presentation-fullscreen";
  fullscreen.textContent = "⛶";
  fullscreen.setAttribute("aria-label", "Enter fullscreen");
  fullscreen.title = "Fullscreen (F)";
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch { status.textContent = "Fullscreen is unavailable. You can maximize this window."; }
  };
  fullscreen.onclick = () => { void full(); };
  root.append(video, status, preview, fullscreen);
  let generation = -1;
  let state: PresentationState | null = null;
  let frame: number | null = null;
  let lastSeen = Date.now();
  let ended = false;
  let playbackFailed = false;
  let sourceEpoch = 0;
  let waitingSince: number | null = null;
  const cancelFrame = () => { if (frame !== null) video.cancelVideoFrameCallback(frame); frame = null; };
  const receive = (next: PresentationState, stream: MediaStream | null) => {
    if (next.session !== session || next.generation < generation) return;
    const changed = generation !== next.generation || video.srcObject !== stream;
    generation = next.generation;
    state = next;
    lastSeen = Date.now();
    ended = Boolean(next.ended);
    if (changed) { playbackFailed = false; sourceEpoch++; waitingSince = null; }
    status.textContent = next.status ?? (playbackFailed ? "Playback is unavailable. Reopen presentation from the workspace."
      : waitingSince !== null && Date.now() - waitingSince > 10000 ? "Waiting for a molecular frame. Reopen if the workspace remains unavailable." : "");
    preview.hidden = !next.preview || Boolean(next.status);
    if (changed) { cancelFrame(); video.hidden = true; video.srcObject = stream; }
    if (next.status || playbackFailed) { video.hidden = true; cancelFrame(); waitingSince = null; }
    else if (stream && video.hidden && frame === null) {
      const current = sourceEpoch;
      waitingSince = Date.now();
      frame = video.requestVideoFrameCallback(() => {
        if (sourceEpoch !== current) return;
        frame = null;
        if (!state?.status && !playbackFailed) {
          waitingSince = null; video.hidden = false; status.textContent = "";
        }
      });
    }
    const current = sourceEpoch;
    if (stream && changed) void video.play().catch(() => {
      if (sourceEpoch === current) {
        video.hidden = true;
        playbackFailed = true;
        status.textContent = "Playback is unavailable. Reopen presentation from the workspace.";
      }
    });
  };
  window.neistraPresentation = { receive };
  const contextMenu = (event: Event) => event.preventDefault();
  root.addEventListener("contextmenu", contextMenu);
  const keydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); void full();
    }
  };
  window.addEventListener("keydown", keydown);
  const opener = window.opener as Window | null;
  const announce = () => {
    if (ended) return;
    opener?.postMessage({ type: presentationReady, session }, window.location.origin);
    if (!opener || opener.closed || Date.now() - lastSeen > 10000) {
      video.hidden = true;
      preview.hidden = true;
      cancelFrame();
      status.textContent = "Workspace disconnected. Reopen presentation from the workspace.";
    }
  };
  announce();
  const heartbeat = window.setInterval(announce, 1000);
  return () => {
    window.clearInterval(heartbeat);
    cancelFrame();
    video.srcObject = null;
    delete window.neistraPresentation;
    window.removeEventListener("keydown", keydown);
    root.removeEventListener("contextmenu", contextMenu);
    root.replaceChildren();
  };
}
