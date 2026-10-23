import type { ComponentCategory, MolecularComponent, MolecularResidue } from "../api/types";
import type { ComponentMembership } from "./componentMembership";
import { gestureIndex, residueLabel, type SelectionStructure } from "./gestures";

export interface CategoryDefinition { category: ComponentCategory; label: string; visibility?: "protein" | "ligands" | "solvent" | "ions" }
type RowBase = { key: string; parentKey: string | null; depth: number; label: string; definition: CategoryDefinition; members: number[]; expandable: boolean };
export type HierarchyRow = RowBase & (
  { kind: "category"; components: MolecularComponent[] }
  | { kind: "component"; component: MolecularComponent }
  | { kind: "residue"; component: MolecularComponent; residue: MolecularResidue }
);

/** Flat navigation rows use source residue order; mounted rows never define membership. */
export function hierarchyRows(source: SelectionStructure, membership: ComponentMembership,
  categories: readonly { definition: CategoryDefinition; components: MolecularComponent[] }[],
  expandedCategories: readonly ComponentCategory[], expandedProteins: readonly string[]): HierarchyRow[] {
  const index = gestureIndex(source);
  const children = new Map<string, MolecularResidue[]>();
  for (const [id, target] of index.proteinResidues) {
    const list = children.get(target.componentId) ?? [];
    list.push(index.residues.get(id)!); children.set(target.componentId, list);
  }
  const counts = new Map<string, number>();
  for (const c of source.hierarchy.components) counts.set(c.display_label, (counts.get(c.display_label) ?? 0) + 1);
  const instances = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const c of source.hierarchy.components) {
    const instance = (instances.get(c.display_label) ?? 0) + 1;
    instances.set(c.display_label, instance);
    labels.set(c.id, counts.get(c.display_label)! > 1 ? `${c.display_label} · instance ${instance}` : c.display_label);
  }
  const rows: HierarchyRow[] = [];
  for (const { definition, components } of categories) {
    const categoryKey = `category:${definition.category}`;
    rows.push({ key: categoryKey, parentKey: null, depth: 0, kind: "category", label: definition.label,
      definition, components, members: membership.categories.get(definition.category) ?? [], expandable: true });
    if (!expandedCategories.includes(definition.category)) continue;
    for (const component of components) {
      const componentKey = `component:${component.id}`;
      const residues = children.get(component.id) ?? [];
      rows.push({ key: componentKey, parentKey: categoryKey, depth: 1, kind: "component", label: labels.get(component.id)!,
        definition, component, members: membership.components.get(component.id) ?? [], expandable: residues.length > 0 });
      if (!expandedProteins.includes(component.id)) continue;
      for (const residue of residues) rows.push({ key: `residue:${component.id}:${residue.id}`, parentKey: componentKey,
        depth: 2, kind: "residue", definition, component, residue, label: residueLabel(residue),
        members: index.residueAtoms.get(residue.id) ?? [], expandable: false });
    }
  }
  return rows;
}
