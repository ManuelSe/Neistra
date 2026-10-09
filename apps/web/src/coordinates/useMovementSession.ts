import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MovementSession, type MovementSessionPorts, type MovementSessionState } from "./MovementSession";
import type { MovementMode, MovementPose } from "./interactiveTransform";
import type { CameraState } from "../api/types";

export interface MovementWorkflow {
  state: MovementSessionState;
  mode: MovementMode;
  sensitivity: number;
  setMode: (mode: MovementMode) => void;
  setSensitivity: (value: number) => void;
  start: () => void;
  apply: () => void;
  cancel: () => void;
  reconcile: () => void;
  update: (pose: MovementPose) => void;
  camera: () => CameraState | null;
  rememberCamera: (camera: CameraState | null) => void;
}

export function useMovementSession(ports: MovementSessionPorts) {
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const [session] = useState(() => new MovementSession({
    context: () => portsRef.current.context(),
    load: (project, ids) => portsRef.current.load(project, ids),
    rendered: () => portsRef.current.rendered(),
    commit: (project, transform) => portsRef.current.commit(project, transform),
    refresh: id => portsRef.current.refresh(id),
    accept: project => portsRef.current.accept(project),
    notice: (id, text, error) => portsRef.current.notice(id, text, error),
  }));
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [mode, setMode] = useState<MovementMode>("rotate");
  const [sensitivity, setSensitivity] = useState(1);
  const returnFocus = useRef<{ element: HTMLElement | null; projectId: string | undefined } | null>(null);
  const previousPhase = useRef(state.phase);
  const movementCamera = useRef<CameraState | null>(null);
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = state.phase;
    if (state.phase !== "idle" || previous === "idle") return;
    movementCamera.current = null;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (!target || portsRef.current.context().project?.id !== target.projectId) return;
    const active = document.activeElement;
    // Context-changing actions keep their focus. Only recover focus lost with
    // the movement surface/banner; never focus a different project's launcher.
    if (active !== document.body && !active?.closest(".movement-banner, .movement-pointer-surface")) return;
    if (target.element?.isConnected) target.element.focus();
    else document.querySelector<HTMLElement>('.structure-viewer .viewer-toolbar button[aria-label="Fit all visible"]:not([aria-disabled="true"])')?.focus();
  }, [state.phase]);
  useEffect(() => () => session.cancel(undefined, true), [session]);
  const workflow: MovementWorkflow = {
    state, mode, sensitivity, setMode,
    setSensitivity: value => setSensitivity(Math.min(4, Math.max(0.25, value))),
    start: () => {
      if (session.snapshot().phase !== "idle") return;
      movementCamera.current = null;
      returnFocus.current = {
        element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        projectId: portsRef.current.context().project?.id,
      };
      void session.begin();
    },
    apply: () => { void session.apply(); },
    cancel: () => session.cancel(),
    reconcile: () => { void session.reconcile(); },
    update: pose => session.update(pose),
    camera: () => movementCamera.current,
    rememberCamera: camera => {
      if (session.snapshot().capture && camera) movementCamera.current = structuredClone(camera);
    },
  };
  return { session, workflow };
}
