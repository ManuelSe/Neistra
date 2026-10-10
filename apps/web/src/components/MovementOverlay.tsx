import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Move3d } from "lucide-react";
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
  const ignoredPointers = useRef(new Set<number>());
  const surface = useRef<HTMLDivElement>(null);
  const current = useRef(movement);
  current.current = movement;
  const active = movement.state.phase === "active";
  const cameraNavigation = movement.cameraNavigation;
  const endAcceptedDrag = useCallback(() => {
    // Ownership/phase changes accept the last pose and terminate its gesture.
    // Clear before release so lost-capture cannot undo an accepted transition.
    const previous = drag.current;
    drag.current = null;
    if (previous) {
      ignoredPointers.current.add(previous.pointer);
      if (surface.current?.hasPointerCapture(previous.pointer)) surface.current.releasePointerCapture(previous.pointer);
    }
  }, []);
  useLayoutEffect(endAcceptedDrag, [endAcceptedDrag, cameraNavigation, active, movement.inputEpoch]);
  useEffect(() => {
    const up = (event: PointerEvent) => ignoredPointers.current.delete(event.pointerId);
    const blur = () => { endAcceptedDrag(); ignoredPointers.current.clear(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      endAcceptedDrag();
    };
  }, [endAcceptedDrag]);
  useEffect(() => {
    // Modal dialogs/drawers own their focus and Escape until they close.
    const modalOpen = () => document.querySelector('[role="dialog"]:not([aria-modal="false"]):not([aria-hidden="true"])') !== null;
    if (!modalOpen()) surface.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || current.current.state.phase !== "active" || modalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      current.current.cancel();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, []);

  const stopDrag = (aborted: boolean) => {
    const previous = drag.current;
    drag.current = null;
    if (aborted && previous) current.current.update(previous.pose);
  };

  return <div ref={surface} className={`movement-pointer-surface movement-${movement.mode}${cameraNavigation ? " movement-camera" : ""}`}
      data-movement-canvas="true"
      data-testid="movement-pointer-surface" tabIndex={0} role="group"
      aria-label="Move selection canvas" aria-describedby="movement-help"
      onContextMenu={event => event.preventDefault()}
      onWheel={event => { event.stopPropagation(); if (active && !cameraNavigation) zoom(Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * 0.002)); }}
      onKeyDown={event => {
        const delta: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
        if (!cameraNavigation && delta[event.key]) { event.preventDefault(); stepMovement(current.current, view, ...delta[event.key]); }
      }}
      onPointerDown={event => {
        if (ignoredPointers.current.size) { event.preventDefault(); event.stopPropagation(); return; }
        if (!active || cameraNavigation || drag.current || !movement.state.capture || ![0, 2].includes(event.button)) return;
        const camera = view();
        if (!camera) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus();
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
          mode: event.button === 2 || event.ctrlKey ? "translate" : event.pointerType === "touch" ? movement.mode : "rotate",
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
    />;
}

function stepMovement(movement: MovementWorkflow, view: () => MovementView | null, dx: number, dy: number) {
  const camera = view();
  if (movement.state.phase !== "active" || movement.cameraNavigation || !movement.state.capture || !camera) return;
  movement.update(movePose(movement.state.capture, movement.state.pose, movement.mode, dx, dy, camera, movement.sensitivity));
}

export function MovementControls({ movement, view, zoom, unavailableReason }: {
  movement: MovementWorkflow;
  view: () => MovementView | null;
  zoom: (factor: number) => void;
  unavailableReason: string | null;
}) {
  const active = movement.state.phase === "active";
  const step = (dx: number, dy: number) => stepMovement(movement, view, dx, dy);
  if (!movement.state.capture) return <section className="transform-launcher" aria-label="Transformation tools">
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className="transform-launch-button" aria-label="Transform selection"
          aria-disabled={unavailableReason !== null} onClick={() => { if (!unavailableReason) movement.start(); }}>
          <Move3d size={16} /> Move selection
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={7}>
        {unavailableReason ?? "Rotate and translate the selected atoms in the viewer"}
        <Tooltip.Arrow />
      </Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
    {movement.state.phase === "loading" ? <span role="status">Capturing selected coordinates…</span> : null}
  </section>;
  return <section className="movement-banner" aria-label="Move selection controls" aria-busy={!active}>
    <div className="movement-heading">
      <Move3d size={16} aria-hidden="true" />
      <strong>Move selection · {movement.state.capture.selection.atoms.length} atoms
        {movement.state.capture.hiddenCount ? ` · ${movement.state.capture.hiddenCount} hidden` : ""}</strong>
    </div>
    <div className="movement-actions">
      <button type="button" className="secondary-button" disabled={!active} aria-pressed={movement.viewToggle}
        onClick={movement.toggleView}>{movement.viewToggle ? "Resume transform" : "Adjust view"}</button>
      {movement.state.phase === "uncertain" ? <button type="button" className="primary-button" onClick={movement.reconcile}>Refresh project</button> : <>
        <button type="button" className="primary-button" disabled={!active} onClick={movement.apply}>Apply movement</button>
        <button type="button" className="secondary-button" disabled={!active} onClick={movement.cancel}>Cancel movement</button>
      </>}
      {!active ? <span role="status">{movement.state.phase === "uncertain" ? "Outcome unknown; changes paused." : "Storing or reconciling movement…"}</span> : null}
    </div>
    <p role="status">{movement.cameraNavigation ? "Adjusting camera · molecular preview retained" : "Transforming selection"}</p>
    <p id="movement-help">{movement.cameraNavigation ? "Orbit, pan or zoom the view. Release Space or choose Resume transform to continue positioning." : "Mouse: left drag rotates; right or Ctrl-drag translates. Hold Space on the canvas to adjust the view. Escape cancels."}</p>
    <p className="movement-warning">Unconstrained: movement may distort bonds or create clashes.</p>
    <details className="movement-more"><summary>More</summary>
      <div className="movement-secondary">
        <fieldset disabled={!active || movement.cameraNavigation}>
          <legend>Touch and keyboard movement</legend>
          <div className="segmented-control">
            {(["rotate", "translate", "depth"] as const).map(mode => <button key={mode} type="button" aria-pressed={movement.mode === mode}
              className={movement.mode === mode ? "active" : ""} onClick={() => movement.setMode(mode)}>{mode === "rotate" ? "Rotate" : mode === "translate" ? "Translate" : "Depth"}</button>)}
          </div>
          <p>Choose a mode for touch dragging, arrow keys or steps. Depth moves along the viewing direction.</p>
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
        <details><summary>Scientific limits</summary><p>{movement.state.capture.crossingBonds} known bonds cross this selection boundary. Missing bond records do not establish safety. This is manual positioning, without minimization, chemistry repair or docking validation.</p></details>
      </div>
    </details>
  </section>;
}
