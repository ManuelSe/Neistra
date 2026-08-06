import * as Tooltip from "@radix-ui/react-tooltip";
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
}

export function ViewerToolbar({
  pickingGranularity,
  onPickingGranularity,
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
              <Tooltip.Content className="tooltip" sideOffset={7}>
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
    </div>
  );
}
