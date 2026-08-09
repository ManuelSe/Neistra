import * as Tooltip from "@radix-ui/react-tooltip";
import { Focus, Frame, Palette, Pill } from "lucide-react";
import type { ReactNode } from "react";
import type { SelectionGranularity } from "../api/types";

const PICKING_MODES: {
  value: SelectionGranularity;
  label: string;
  tooltip: string;
}[] = [
  { value: "atom", label: "Atom", tooltip: "Pick individual atoms in the 3D viewer" },
  { value: "residue", label: "Residue", tooltip: "Pick complete residues in the 3D viewer" },
  { value: "chain", label: "Chain", tooltip: "Pick complete chains in the 3D viewer" },
  {
    value: "structure",
    label: "Structure",
    tooltip: "Pick complete structures in the 3D viewer",
  },
];

interface ViewerToolbarProps {
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
  label: string;
  tooltip: string;
  unavailableReason: string | null;
  onClick: () => void;
  children: ReactNode;
  hasPopup?: "dialog";
  expanded?: boolean;
}

function ViewerActionButton({
  label,
  tooltip,
  unavailableReason,
  onClick,
  children,
  hasPopup,
  expanded,
}: ViewerActionButtonProps) {
  const unavailable = unavailableReason !== null;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="viewer-action-button"
          aria-label={label}
          aria-disabled={unavailable}
          aria-haspopup={hasPopup}
          aria-expanded={hasPopup ? expanded : undefined}
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
  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Viewer quick actions">
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
                onClick={() => onPickingGranularity(mode.value)}
              >
                {mode.label}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip viewer-toolbar-tooltip" sideOffset={7}>
                {mode.tooltip}
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
      </div>
    </div>
  );
}
