import { useEffect, useRef } from "react";
import { movePose, type MovementMode, type MovementPose, type MovementView } from "../coordinates/interactiveTransform";
import type { MovementWorkflow } from "../coordinates/useMovementSession";

interface Drag {
  pointer: number;
  x: number;
  y: number;
  mode: MovementMode;
  pose: MovementPose;
  view: MovementView;
  sensitivity: number;
}

export function MovementOverlay({ movement, view, zoom }: {
  movement: MovementWorkflow;
  view: () => MovementView | null;
  zoom: (factor: number) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const current = useRef(movement);
  current.current = movement;
  const active = movement.state.phase === "active";
  useEffect(() => {
    surface.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || current.current.state.phase !== "active") return;
      event.preventDefault();
      event.stopPropagation();
      current.current.cancel();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, []);

  const step = (dx: number, dy: number) => {
    const target = current.current;
    const camera = view();
    if (target.state.phase !== "active" || !target.state.capture || !camera) return;
    target.update(movePose(target.state.capture, target.state.pose, target.mode, dx, dy, camera, target.sensitivity));
  };
  const stopDrag = (aborted: boolean) => {
    const previous = drag.current;
    drag.current = null;
    if (aborted && previous) current.current.update(previous.pose);
  };

  return <>
    <div ref={surface} className={`movement-pointer-surface movement-${movement.mode}`}
      data-testid="movement-pointer-surface" tabIndex={0} role="group"
      aria-label="Move selection canvas" aria-describedby="movement-help"
      onContextMenu={event => event.preventDefault()}
      onWheel={event => { event.stopPropagation(); if (active) zoom(Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * 0.002)); }}
      onKeyDown={event => {
        const delta: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
        if (delta[event.key]) { event.preventDefault(); step(...delta[event.key]); }
      }}
      onPointerDown={event => {
        if (!active || drag.current || !movement.state.capture || ![0, 2].includes(event.button)) return;
        const camera = view();
        if (!camera) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus();
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
          mode: event.button === 2 || event.ctrlKey ? "translate" : movement.mode,
          pose: movement.state.pose, view: camera, sensitivity: movement.sensitivity };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const previous = drag.current;
        if (!previous || previous.pointer !== event.pointerId || !current.current.state.capture) return;
        current.current.update(movePose(current.current.state.capture, previous.pose, previous.mode,
          event.clientX - previous.x, event.clientY - previous.y, previous.view, previous.sensitivity));
      }}
      onPointerUp={event => {
        if (drag.current?.pointer !== event.pointerId) return;
        stopDrag(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => stopDrag(true)} onLostPointerCapture={() => stopDrag(true)}
    />
    <section className="movement-banner" aria-label="Move selection controls" aria-busy={!active}>
      <strong>Move selection · {movement.state.capture?.selection.atoms.length ?? 0} atoms
        {movement.state.capture?.hiddenCount ? ` · ${movement.state.capture.hiddenCount} hidden` : ""}</strong>
      <p id="movement-help">Drag to rotate; secondary or Ctrl-drag translates. Choose Depth and drag vertically. Release keeps the preview; Apply stores it once. Escape cancels.</p>
      <p className="movement-warning">Unconstrained: movement may distort bonds or create clashes.</p>
      <details><summary>Scientific limits</summary><p>{movement.state.capture?.crossingBonds ?? 0} known bonds cross this selection boundary. Missing bond records do not establish safety. This is manual positioning, without minimization, chemistry repair or docking validation.</p></details>
      <fieldset disabled={!active}>
        <legend>Movement</legend>
        <div className="segmented-control">
          {(["rotate", "translate", "depth"] as const).map(mode => <button key={mode} type="button" aria-pressed={movement.mode === mode}
            className={movement.mode === mode ? "active" : ""} onClick={() => movement.setMode(mode)}>{mode === "rotate" ? "Rotate" : mode === "translate" ? "Translate" : "Depth"}</button>)}
        </div>
        <label className="movement-sensitivity">Sensitivity
          <input type="range" min="0.25" max="4" step="0.25" value={movement.sensitivity}
            onChange={event => movement.setSensitivity(Number(event.target.value))} />
        </label>
        <div className="movement-step-controls" aria-label="Movement steps">
          <button type="button" disabled={movement.mode === "depth"} onClick={() => step(-10, 0)}>Step left</button>
          <button type="button" disabled={movement.mode === "depth"} onClick={() => step(10, 0)}>Step right</button>
          <button type="button" onClick={() => step(0, -10)}>{movement.mode === "depth" ? "Step away" : "Step up"}</button>
          <button type="button" onClick={() => step(0, 10)}>{movement.mode === "depth" ? "Step toward" : "Step down"}</button>
          <button type="button" onClick={() => zoom(0.85)}>Zoom in</button>
          <button type="button" onClick={() => zoom(1.15)}>Zoom out</button>
        </div>
      </fieldset>
      <div className="movement-actions">
        {movement.state.phase === "uncertain" ? <button type="button" className="primary-button" onClick={movement.reconcile}>Refresh project</button> : <>
          <button type="button" className="primary-button" disabled={!active} onClick={movement.apply}>Apply movement</button>
          <button type="button" className="secondary-button" disabled={!active} onClick={movement.cancel}>Cancel movement</button>
        </>}
        {!active ? <span role="status">{movement.state.phase === "uncertain" ? "Outcome unknown; changes paused." : "Storing or reconciling movement…"}</span> : null}
      </div>
    </section>
  </>;
}
