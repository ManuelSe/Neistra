import type { BondAction, HydrogenReport, SelectionEditAction } from "../api/types";
import type { PlacementAction } from "./placement";

export function hydrogenSummary(report: HydrogenReport): string {
  return `${report.added_hydrogen_count} H proposed; ${report.completed_count} sites completed, ${report.unchanged_count} unchanged, ${report.skipped_count} skipped, ${report.unprocessed_count} unprocessed.`;
}

export function placementLabel(action: PlacementAction): string {
  switch (action.operation) {
    case "bond.set": return `Assign bond ${action.order ?? "unknown"}`;
    case "bond.delete": return "Break bond";
    case "atom.add": return `Add ${action.element} · direction ${action.direction + 1} of 6`;
    case "fragment.attach": return `Attach ${action.fragment} · direction ${action.direction + 1} of 6 · rotation ${action.rotation * 60}°`;
  }
}

export function nextPlacement(action: PlacementAction): PlacementAction {
  if (isBondAction(action)) return action;
  return { ...action, direction: (action.direction + 1) % 6 };
}

export function isBondAction(action: SelectionEditAction): action is BondAction {
  return action.operation === "bond.set" || action.operation === "bond.delete";
}
