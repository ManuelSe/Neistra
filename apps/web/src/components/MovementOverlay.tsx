import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Check, LoaderCircle, MoreHorizontal, Move3d, RefreshCw, TriangleAlert, X } from "lucide-react";
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
      if (event.key !== "Escape" || current.current.state.phase !== "active" || modalOpen() || document.activeElement?.closest("[data-movement-panel]")) return;
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

interface ControlsProps {
  movement: MovementWorkflow;
  view: () => MovementView | null;
  zoom: (factor: number) => void;
  unavailableReason: string | null;
}

export function MovementControls(props: ControlsProps) {
  return <Tooltip.Provider delayDuration={350}><TransformControls {...props} /></Tooltip.Provider>;
}

function MovementAction({ label, tooltip = label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; tooltip?: string; children: ReactNode;
}) {
  return <Tooltip.Root><Tooltip.Trigger asChild>
    <button type="button" className={`icon-button movement-action ${className}`} aria-label={label} {...props}>{children}</button>
  </Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={7}>
    {tooltip}<Tooltip.Arrow />
  </Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function TransformControls({ movement, view, zoom, unavailableReason }: ControlsProps) {
  const [panel, setPanel] = useState<"more" | "help" | null>(null);
  const bar = useRef<HTMLElement>(null);
  const active = movement.state.phase === "active";
  const capture = movement.state.capture;
  const step = (dx: number, dy: number) => stepMovement(movement, view, dx, dy);
  useEffect(() => { if (!capture) setPanel(null); }, [capture]);
  if (!capture) return <section ref={bar} className="transform-launcher" aria-label="Transformation tools" data-movement-controls>
    <MovementAction label="Transform selection" tooltip={unavailableReason ?? "Rotate and translate the selected atoms in the viewer"}
      aria-disabled={unavailableReason !== null} onClick={() => { if (!unavailableReason) movement.start(); }}>
      {movement.state.phase === "loading" ? <LoaderCircle size={16} className="movement-spinner" aria-hidden="true" /> : <Move3d size={16} aria-hidden="true" />}
    </MovementAction>
    {movement.state.phase === "loading" ? <span className="sr-only" role="status">Capturing selected coordinates…</span> : null}
  </section>;
  return <>
    <section ref={bar} className="movement-banner" aria-label="Move selection controls" aria-busy={!active} data-movement-controls>
      <div className="movement-actions">
        <span className="movement-count" aria-hidden="true">{capture.selection.atoms.length} atoms{capture.hiddenCount ? ` · ${capture.hiddenCount} hidden` : ""}</span>
        <MovementAction label={movement.viewToggle ? "Resume transform" : "Adjust view"}
          className={movement.cameraNavigation ? "movement-action-active" : ""} disabled={!active}
          aria-pressed={movement.viewToggle} onClick={movement.toggleView}><Camera size={16} aria-hidden="true" /></MovementAction>
        {movement.state.phase === "uncertain" ? <MovementAction label="Refresh project" onClick={movement.reconcile}><RefreshCw size={16} aria-hidden="true" /></MovementAction> : <>
          <MovementAction label="Apply movement" className="movement-apply" disabled={!active} onClick={movement.apply}><Check size={16} aria-hidden="true" /></MovementAction>
          <MovementAction label="Cancel movement" disabled={!active} onClick={movement.cancel}><X size={16} aria-hidden="true" /></MovementAction>
        </>}
        <MovementAction label="More movement tools" aria-expanded={panel === "more"} aria-haspopup="dialog"
          onClick={() => setPanel(value => value === "more" ? null : "more")}><MoreHorizontal size={16} aria-hidden="true" /></MovementAction>
        <MovementAction label="Movement help and scientific limits" tooltip="Unconstrained movement: bonds and clashes — open help"
          aria-expanded={panel === "help"} aria-haspopup="dialog" className="movement-help-action"
          onClick={() => setPanel(value => value === "help" ? null : "help")}><TriangleAlert size={16} aria-hidden="true" /></MovementAction>
      </div>
      <p className="sr-only" role="status">{movement.cameraNavigation ? "Adjusting camera · molecular preview retained" : "Transforming selection"}
        {!active && movement.state.phase !== "uncertain" ? " · Storing or reconciling movement…" : ""}</p>
      <p id="movement-help" className="sr-only">Mouse: left drag rotates; right or Ctrl-drag translates. Hold Space on the canvas to adjust the view. Escape cancels. Unconstrained movement may distort bonds or create clashes. Open movement help for scientific limits.</p>
      {movement.state.phase === "uncertain" ? <p className="movement-warning" role="status">Outcome unknown; changes paused. Refresh project to reconcile before continuing.</p> : null}
    </section>
    <MovementPanel key={panel ?? "closed"} panel={panel} bar={bar} onClose={() => setPanel(null)}>
      {panel === "help" ? <>
        <p>{capture.selection.atoms.length} captured atoms · {capture.hiddenCount} hidden.</p>
        <p>Mouse: left drag rotates; right or Ctrl-drag translates in the current screen plane.</p>
        <p>Hold Space while the canvas has focus to orbit, pan or zoom the camera. Release to resume positioning. On touch, choose Adjust view, then Resume transform.</p>
        <p>More contains touch modes, arrow-key steps, depth and sensitivity. Apply commits one undoable operation; Cancel or Escape discards the preview. Escape in a focused panel closes that panel first.</p>
        <p className="movement-warning">Unconstrained: movement may distort bonds or create clashes.</p>
        <p>{capture.crossingBonds} known bonds cross this selection boundary. Missing bond records do not establish safety. This is manual positioning, without minimization, chemistry repair or docking validation.</p>
      </> : <fieldset disabled={!active || movement.cameraNavigation}>
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
      </fieldset>}
    </MovementPanel>
  </>;
}

/** A workspace panel: the canvas and primary actions remain interactive. */
function MovementPanel({ panel, bar, onClose, children }: {
  panel: "more" | "help" | null; bar: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const position = useCallback(() => {
    const element = content.current;
    const anchor = bar.current?.getBoundingClientRect();
    if (!element || !anchor) return;
    // Prefer below the strip, keeping primary actions unobstructed. Only the
    // secondary body scrolls; its close action remains visible at short heights.
    element.style.setProperty("--movement-panel-left", `${Math.max(8, Math.min(anchor.left, innerWidth - element.offsetWidth - 8))}px`);
    element.style.setProperty("--movement-panel-top", `${anchor.bottom + 6}px`);
  }, [bar]);
  useEffect(() => {
    if (!panel) return;
    window.addEventListener("resize", position);
    const observer = new ResizeObserver(position);
    if (bar.current) observer.observe(bar.current);
    return () => { window.removeEventListener("resize", position); observer.disconnect(); };
  }, [panel, position, bar]);
  return <Dialog.Root open={panel !== null} modal={false} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Content ref={content} data-movement-panel className="dialog-content movement-panel" aria-modal="false" aria-describedby={undefined}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (!content.current?.contains(document.activeElement)) event.preventDefault(); }}
      onOpenAutoFocus={event => {
        event.preventDefault();
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        position();
        (content.current?.querySelector<HTMLElement>("button:not(:disabled)") ?? content.current)?.focus();
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (returnFocus.current?.isConnected && (document.activeElement === document.body || content.current?.contains(document.activeElement))) returnFocus.current.focus();
      }}>
      <div className="dialog-heading"><Dialog.Title>{panel === "help" ? "Movement help and scientific limits" : "More movement tools"}</Dialog.Title>
        <Dialog.Close asChild><button type="button" className="icon-button movement-action" aria-label="Close movement panel"><X size={16} aria-hidden="true" /></button></Dialog.Close>
      </div>
      <div className="movement-panel-body">{children}</div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
