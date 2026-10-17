import type { HydrogenReport, ModelPlacementAction } from "../api/types";

export function isHydrogenAction(action: ModelPlacementAction): boolean {
  return action.operation === "hydrogens.complete" || action.operation === "hydrogens.add";
}

export function hydrogenSummary(report: HydrogenReport): string {
  return `${report.added_hydrogen_count} H proposed; ${report.completed_count} sites completed, ${report.unchanged_count} unchanged, ${report.skipped_count} skipped, ${report.unprocessed_count} unprocessed.`;
}

export function placementLabel(action: ModelPlacementAction): string {
  switch (action.operation) {
    case "atom.add": return `Add ${action.element} · direction ${action.direction + 1} of 6`;
    case "fragment.attach": return `Attach ${action.fragment} · direction ${action.direction + 1} of 6 · rotation ${action.rotation * 60}°`;
    case "hydrogens.add": return `Add ${action.count} H · ${action.geometry.replaceAll("_", " ")} · orientation ${action.orientation + 1} of 6`;
    case "hydrogens.complete": return `Complete hydrogens · ${action.scope}`;
  }
}

export function nextPlacement(action: ModelPlacementAction): ModelPlacementAction {
  if (action.operation === "hydrogens.complete") return action;
  if (action.operation === "hydrogens.add") return { ...action, orientation: (action.orientation + 1) % 6 };
  return { ...action, direction: (action.direction + 1) % 6 };
}
