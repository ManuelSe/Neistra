import { componentAtomIds } from "../selection/components";
import type { ViewerStructure } from "./MolecularViewer";

/** Immutable fields consumed by component and atom visibility, without renderer wrappers. */
export type ViewerVisibilitySource = Pick<ViewerStructure, "entryId" | "normalized" | "hierarchy" | "settings">;

export function visibleComponentAtomIds(structure: ViewerVisibilitySource): number[] {
  const { components: settings } = structure.settings;
  return [
    ...new Set(
      structure.hierarchy.components
        .filter((component) => {
          if (component.category === "protein") return settings.protein;
          if (component.category === "ligand") return settings.ligands;
          if (component.category === "water" || component.category === "solvent") {
            return settings.solvent;
          }
          if (component.category === "ion") return settings.ions;
          return true;
        })
        .flatMap((component) => componentAtomIds(structure.normalized, component)),
    ),
  ].sort((left, right) => left - right);
}
