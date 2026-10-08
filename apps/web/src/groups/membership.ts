import type { EntryGroup, Project, Selection } from "../api/types";

export interface GroupScope {
  projectId: string;
  revision: number;
  originEntryId: string;
  entryIds: string[];
  selection: Selection;
  hiddenCount: number;
}

export function captureGroupScope(
  project: Project,
  selection: Selection,
  originEntryId: string,
  displayedIds: Set<string>,
  selectedIds = new Set(selection.atoms.map((atom) => atom.structure_id)),
): GroupScope {
  const entryIds = project.entries
    .filter((entry) =>
      selectedIds.has(originEntryId) ? selectedIds.has(entry.id) : entry.id === originEntryId,
    )
    .map((entry) => entry.id)
    .sort();
  return {
    projectId: project.id,
    revision: project.revision,
    originEntryId,
    entryIds,
    selection: { ...selection, atoms: selection.atoms.map((atom) => ({ ...atom })) },
    hiddenCount: entryIds.filter((id) => !displayedIds.has(id)).length,
  };
}

export function groupLabels(groups: EntryGroup[]): Map<string, string> {
  const names = new Set(groups.map((group) => group.name));
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.name, (counts.get(group.name) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  const labels = new Map<string, string>();
  const used = new Set(names);
  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    let label = group.name;
    if (counts.get(group.name)! > 1) {
      let ordinal = ordinals.get(group.name) ?? 0;
      do { label = `${group.name} · Group ${++ordinal}`; } while (used.has(label));
      ordinals.set(group.name, ordinal);
    }
    used.add(label);
    labels.set(group.id, label);
  }
  return labels;
}

export function groupScopeSummary(scope: Pick<GroupScope, "entryIds" | "hiddenCount">): string {
  return `${scope.entryIds.length} complete structure${scope.entryIds.length === 1 ? "" : "s"}` +
    (scope.hiddenCount ? ` (${scope.hiddenCount} hidden by the current filter)` : "") +
    ". Atom selection and molecular data stay unchanged.";
}

export function groupReturnFocus(scope: GroupScope, groupId?: string | null): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>("[data-entry-id]");
  for (const row of rows) {
    if (row.dataset.entryId !== scope.originEntryId) continue;
    const trigger = row.querySelector<HTMLElement>(".entry-menu-trigger");
    if (trigger?.getClientRects().length) return trigger;
  }
  for (const group of document.querySelectorAll<HTMLElement>("[data-group-id]")) {
    if (group.dataset.groupId !== (groupId ?? "ungrouped")) continue;
    const heading = group.querySelector<HTMLElement>(".group-select");
    if (heading?.getClientRects().length) return heading;
  }
  return Array.from(document.querySelectorAll<HTMLElement>(".browser-search input"))
    .find((input) => input.getClientRects().length > 0) ?? null;
}
