import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertTriangle, Check, CircleAlert, Eye, EyeOff, Focus, Frame, LoaderCircle, Palette, Pause, Pill, Network, Rows3, MonitorUp, Ruler } from "lucide-react";
import type { ReactNode } from "react";
import type { SelectionGranularity } from "../api/types";
import type { InteractionStatusView } from "../interactions/panelModel";

const PICKING_MODES: {
  value: SelectionGranularity;
  label: string;
  tooltip: string;
}[] = [
  { value: "atom", label: "Atom", tooltip: "Click replaces; Ctrl/Cmd toggles; Alt subtracts. Double-click expands a protein residue or molecular component; Shift extends an anchored protein range" },
  { value: "residue", label: "Residue", tooltip: "Click selects a complete residue; Ctrl/Cmd toggles; Shift adds an inclusive anchored protein range; Alt subtracts" },
  { value: "chain", label: "Chain", tooltip: "Pick complete chains in the 3D viewer" },
  {
    value: "structure",
    label: "Structure",
    tooltip: "Pick complete structures in the 3D viewer",
  },
];

interface ViewerToolbarProps {
  onMeasurements?: () => void;
  measurementsOpen?: boolean;
  onPresentation?: () => void;
  onShowSequences?: () => void;
  interactionsOpen?: boolean;
  interactionsConfigured?: boolean;
  interactionsVisible?: boolean;
  interactionsDescription?: string;
  interactionsStatus?: InteractionStatusView;
  onInteractionVisibilityChange?: (show: boolean) => void;
  onInteractions?: () => void;
  pickingUnavailableReason?: string | null;
  pickingGranularity: SelectionGranularity;
  onPickingGranularity: (granularity: SelectionGranularity) => void;
  fitAllUnavailableReason: string | null;
  focusSelectionUnavailableReason: string | null;
  focusLigandsUnavailableReason: string | null;
  selectionStyleUnavailableReason: string | null;
  selectionStyleOpen: boolean;
  onFitAll: () => void;
  onFocusSelection: () => void;
  onFocusLigands: () => void;
  onSelectionStyle: () => void;
}

interface ViewerActionButtonProps {
  className?: string;
  label: string;
  tooltip: string;
  unavailableReason: string | null;
  onClick: () => void;
  children: ReactNode;
  hasPopup?: "dialog";
  expanded?: boolean;
  pressed?: boolean;
  description?: string;
}

function ViewerActionButton({
  className,
  label,
  tooltip,
  unavailableReason,
  onClick,
  children,
  hasPopup,
  expanded,
  pressed,
  description,
}: ViewerActionButtonProps) {
  const unavailable = unavailableReason !== null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`viewer-action-button${className ? ` ${className}` : ""}`}
          aria-label={label}
          aria-disabled={unavailable}
          aria-haspopup={hasPopup}
          aria-expanded={hasPopup ? expanded : undefined}
          aria-pressed={pressed}
          aria-description={description}
          onClick={() => {
            if (!unavailable) onClick();
          }}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={7}>
          {unavailableReason ?? tooltip}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ViewerToolbar({
  onMeasurements,
  measurementsOpen = false,
  onPresentation,
  onShowSequences,
  interactionsOpen = false,
  interactionsConfigured = false,
  interactionsVisible = true,
  interactionsDescription = "Inspect molecular interactions",
  interactionsStatus,
  onInteractionVisibilityChange,
  onInteractions,
  pickingUnavailableReason = null,
  pickingGranularity,
  onPickingGranularity,
  fitAllUnavailableReason,
  focusSelectionUnavailableReason,
  focusLigandsUnavailableReason,
  selectionStyleUnavailableReason,
  selectionStyleOpen,
  onFitAll,
  onFocusSelection,
  onFocusLigands,
  onSelectionStyle,
}: ViewerToolbarProps) {
  const interactionState = interactionsStatus?.phase === "error" ? "error"
    : interactionsStatus?.phase === "paused" ? "paused"
    : interactionsStatus?.partial ? "partial"
    : interactionsStatus?.phase === "loading" || interactionsStatus?.phase === "rendering" ? "pending" : "enabled";
  const InteractionStatusIcon = interactionState === "error" ? CircleAlert : interactionState === "paused" ? Pause
    : interactionState === "partial" ? AlertTriangle : interactionState === "pending" ? LoaderCircle : Check;
  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Viewer quick actions">
      {onPresentation ? <ViewerActionButton label="Detach viewer" tooltip="Open a read-only presentation window"
        unavailableReason={null} onClick={onPresentation}><MonitorUp size={17} /></ViewerActionButton> : null}
      <span className="viewer-toolbar-label" aria-hidden="true">
        Pick
      </span>
      <div className="viewer-picking-buttons" role="group" aria-label="Viewer picking mode">
        {PICKING_MODES.map((mode) => (
          <Tooltip.Root key={mode.value}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className={pickingGranularity === mode.value ? "active" : ""}
                aria-label={`Pick ${mode.label.toLowerCase()}s`}
                aria-pressed={pickingGranularity === mode.value}
                aria-disabled={pickingUnavailableReason !== null}
                onClick={() => { if (!pickingUnavailableReason) onPickingGranularity(mode.value); }}
              >
                {mode.label}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={7}>
                {pickingUnavailableReason ?? mode.tooltip}
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </div>
      <label className="viewer-picking-select">
        <span className="sr-only">Viewer picking mode</span>
        <select
          aria-label="Viewer picking mode"
          disabled={pickingUnavailableReason !== null}
          title={pickingUnavailableReason ?? undefined}
          value={pickingGranularity}
          onChange={(event) =>
            onPickingGranularity(event.target.value as SelectionGranularity)
          }
        >
          {PICKING_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <div className="viewer-focus-actions" role="group" aria-label="Viewer focus actions">
        {onMeasurements ? <ViewerActionButton className="viewer-measurements-action" label="Measurements" tooltip="Measure distance, angle or torsion"
          unavailableReason={null} onClick={onMeasurements} hasPopup="dialog" expanded={measurementsOpen}><Ruler size={16} /></ViewerActionButton> : null}
        <ViewerActionButton
          label="Fit all visible"
          tooltip="Frame all visible molecular objects"
          unavailableReason={fitAllUnavailableReason}
          onClick={onFitAll}
        >
          <Frame size={15} />
        </ViewerActionButton>
        <ViewerActionButton
          label="Focus selection"
          tooltip="Frame the current selection"
          unavailableReason={focusSelectionUnavailableReason}
          onClick={onFocusSelection}
        >
          <Focus size={15} />
        </ViewerActionButton>
        <ViewerActionButton
          label="Focus visible ligands"
          tooltip="Frame all visible classified ligands"
          unavailableReason={focusLigandsUnavailableReason}
          onClick={onFocusLigands}
        >
          <Pill size={15} />
        </ViewerActionButton>
        <ViewerActionButton
          label="Style selection"
          tooltip="Choose a representation for the current selection"
          unavailableReason={selectionStyleUnavailableReason}
          onClick={onSelectionStyle}
          hasPopup="dialog"
          expanded={selectionStyleOpen}
        >
          <Palette size={15} />
        </ViewerActionButton>
        {onShowSequences ? <ViewerActionButton label="Show sequences" tooltip="Show protein sequences" unavailableReason={null} onClick={onShowSequences}><Rows3 size={15} /></ViewerActionButton> : null}
        {onInteractions ? <span className="viewer-interaction-actions">
          {interactionsConfigured && onInteractionVisibilityChange ? <ViewerActionButton label="Toggle interaction visibility"
            tooltip={interactionsVisible ? "Hide interactions; retain choices" : "Show interactions with retained choices"}
            description={interactionsDescription} pressed={interactionsVisible} unavailableReason={null}
            onClick={() => onInteractionVisibilityChange(!interactionsVisible)}>
            {interactionsVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </ViewerActionButton> : null}
          <ViewerActionButton label="Interactions" tooltip={interactionsDescription} description={interactionsDescription}
            unavailableReason={null} onClick={onInteractions} hasPopup="dialog" expanded={interactionsOpen}>
            <span className="interaction-launcher-icon"><Network size={15} />
              {interactionsConfigured && interactionsVisible ? <InteractionStatusIcon size={10} className="interaction-launcher-state" data-interaction-status={interactionState} aria-hidden="true" /> : null}
            </span>
          </ViewerActionButton>
        </span> : null}
      </div>
    </div>
  );
}
