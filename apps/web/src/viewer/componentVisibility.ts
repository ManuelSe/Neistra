import { componentAtomIds } from "../selection/components";
import type { ViewerStructure } from "./MolecularViewer";

export function visibleComponentAtomIds(structure: ViewerStructure): number[] {
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
