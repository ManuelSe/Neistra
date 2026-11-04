import { presentationReady, type PresentationState } from "./protocol";
import { presentationPoint } from "./pointer";
import type { PresentationPointer } from "../viewer/MolecularViewer";
import "./presentation.css";

/** This entry never imports the workspace, API client or molecular renderer. */
export function mountPresentation(session: string) {
  document.title = "Neistra presentation";
  const root = document.getElementById("root")!;
  root.className = "presentation";
  root.setAttribute("role", "main");
  root.setAttribute("aria-label", "Read-only molecular presentation");
  const heading = document.createElement("h1");
  heading.className = "presentation-heading";
  heading.textContent = "Neistra molecular presentation";
  const video = document.createElement("video");
  video.hidden = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.setAttribute("aria-label", "Live molecular view");
  const status = document.createElement("div");
  status.className = "presentation-status";
  status.setAttribute("role", "status");
  status.textContent = "Connecting to the workspace…";
  const preview = document.createElement("div");
  preview.className = "presentation-preview";
  preview.textContent = "Preview";
  preview.hidden = true;
  preview.setAttribute("aria-live", "polite");
  const pointer = document.createElement("div");
  pointer.className = "presentation-pointer";
  pointer.setAttribute("aria-hidden", "true");
  pointer.hidden = true;
  const notice = document.createElement("div");
  notice.className = "presentation-notice";
  notice.setAttribute("role", "alert");
  notice.hidden = true;
  let noticeTimer: number | undefined;
  const fullscreen = document.createElement("button");
  fullscreen.type = "button";
  fullscreen.className = "presentation-fullscreen";
  fullscreen.textContent = "⛶";
  fullscreen.setAttribute("aria-label", "Enter fullscreen");
  fullscreen.title = "Fullscreen (F)";
  fullscreen.setAttribute("aria-keyshortcuts", "F");
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      notice.textContent = "Fullscreen is unavailable. You can maximize this window.";
      notice.hidden = false;
      window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 10000);
    }
  };
  fullscreen.onclick = () => { void full(); };
  root.append(heading, video, status, preview, pointer, notice, fullscreen);
  let generation = -1;
  let state: PresentationState | null = null;
  let frame: number | null = null;
  let lastSeen = Date.now();
  let ended = false;
  let playbackFailed = false;
  let sourceEpoch = 0;
  let waitingSince: number | null = null;
  let point: PresentationPointer | null = null;
  let pointerTimer: number | undefined;
  const positionPointer = () => {
    const mapped = point && !video.hidden && !state?.status ? presentationPoint(point,
      root.clientWidth, root.clientHeight, video.videoWidth, video.videoHeight) : null;
    pointer.hidden = !mapped;
    if (mapped) { pointer.style.left = `${mapped.x}px`; pointer.style.top = `${mapped.y}px`; }
  };
  const clearPointer = () => { point = null; pointer.hidden = true; window.clearTimeout(pointerTimer); };
  let controlsTimer: number | undefined;
  const showControls = () => {
    root.classList.add("presentation-controls-visible");
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(() => root.classList.remove("presentation-controls-visible"), 2000);
  };
  showControls();
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
    preview.hidden = !next.preview || Boolean(next.status) || playbackFailed;
    if (changed) { cancelFrame(); clearPointer(); video.hidden = true; video.srcObject = stream; }
    if (next.status || playbackFailed) { clearPointer(); video.hidden = true; cancelFrame(); waitingSince = null; }
    else if (stream && video.hidden && frame === null) {
      const current = sourceEpoch;
      waitingSince = Date.now();
      frame = video.requestVideoFrameCallback(() => {
        if (sourceEpoch !== current) return;
        frame = null;
        if (!state?.status && !playbackFailed) {
          waitingSince = null; video.hidden = false; status.textContent = ""; positionPointer();
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
  video.onerror = () => {
    playbackFailed = true; video.hidden = true; preview.hidden = true; cancelFrame(); clearPointer();
    status.textContent = "Playback is unavailable. Reopen presentation from the workspace.";
  };
  window.neistraPresentation = { receive, pointer: (token, sourceGeneration, next) => {
    if (token !== session || sourceGeneration !== generation || ended) return;
    point = next;
    window.clearTimeout(pointerTimer);
    positionPointer();
    pointerTimer = window.setTimeout(clearPointer, 2000);
  } };
  const fullscreenChanged = () => fullscreen.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
  document.addEventListener("fullscreenchange", fullscreenChanged);
  root.addEventListener("pointermove", showControls, { passive: true });
  window.addEventListener("resize", positionPointer);
  const contextMenu = (event: Event) => event.preventDefault();
  root.addEventListener("contextmenu", contextMenu);
  const keydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "f" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
      clearPointer();
      cancelFrame();
      status.textContent = "Workspace disconnected. Reopen presentation from the workspace.";
    }
  };
  announce();
  const heartbeat = window.setInterval(announce, 1000);
  return () => {
    window.clearInterval(heartbeat);
    window.clearTimeout(controlsTimer);
    window.clearTimeout(noticeTimer);
    clearPointer();
    video.onerror = null;
    cancelFrame();
    video.srcObject = null;
    delete window.neistraPresentation;
    window.removeEventListener("keydown", keydown);
    root.removeEventListener("contextmenu", contextMenu);
    root.removeEventListener("pointermove", showControls);
    document.removeEventListener("fullscreenchange", fullscreenChanged);
    window.removeEventListener("resize", positionPointer);
    root.replaceChildren();
  };
}
