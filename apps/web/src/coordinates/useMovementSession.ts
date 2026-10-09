import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MovementSession, type MovementSessionPorts, type MovementSessionState } from "./MovementSession";
import type { MovementMode, MovementPose } from "./interactiveTransform";

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
  useEffect(() => () => session.cancel(undefined, true), [session]);
  const workflow: MovementWorkflow = {
    state, mode, sensitivity, setMode,
    setSensitivity: value => setSensitivity(Math.min(4, Math.max(0.25, value))),
    start: () => { void session.begin(); },
    apply: () => { void session.apply(); },
    cancel: () => session.cancel(),
    reconcile: () => { void session.reconcile(); },
    update: pose => session.update(pose),
  };
  return { session, workflow };
}
