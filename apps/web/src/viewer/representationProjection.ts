import type { ColorScheme, RepresentationStyle } from "../api/types";
import type { ViewerStructure } from "./MolecularViewer";
import { visibleComponentAtomIds } from "./componentVisibility";
import {
  atomicRepresentationStyles,
  polymerRepresentationStyles,
} from "./settings";

export type RepresentationChannel = "atomic" | "polymer" | "independent";

export interface RepresentationLayer {
  id: string;
  style: RepresentationStyle;
  atomIds: number[];
  colorBy: ColorScheme;
  customColor: string;
  opacity: number;
  exactTarget: boolean;
}

export function representationChannel(
  style: RepresentationStyle,
): RepresentationChannel {
  if (atomicRepresentationStyles.includes(style)) return "atomic";
  if (polymerRepresentationStyles.includes(style)) return "polymer";
  return "independent";
}

export function representationLayers(
  structure: ViewerStructure,
  isolatedAtomIds: ReadonlySet<number> | null = null,
): RepresentationLayer[] {
  const hydrogenIds = new Set(
    structure.normalized.atoms
      .filter((atom) => atom.element.trim().toUpperCase() === "H")
      .map((atom) => atom.id),
  );
  const visibleIds = new Set(
    visibleComponentAtomIds(structure).filter(
      (atomId) =>
        (structure.settings.components.hydrogens || !hydrogenIds.has(atomId)) &&
        (isolatedAtomIds === null || isolatedAtomIds.has(atomId)),
    ),
  );
  const targeted = structure.settings.selection_representations.map(
    (assignment) => ({
      ...assignment,
      atomIds: assignment.atom_ids.filter((atomId) => visibleIds.has(atomId)),
    }),
  );
  const overridden = {
    atomic: new Set(
      targeted
        .filter((item) => representationChannel(item.style) === "atomic")
        .flatMap((item) => item.atomIds),
    ),
    polymer: new Set(
      targeted
        .filter((item) => representationChannel(item.style) === "polymer")
        .flatMap((item) => item.atomIds),
    ),
  };
  const inherited = structure.settings.representations.flatMap<RepresentationLayer>(
    (representation) => {
      const channel = representationChannel(representation.style);
      const atomIds = [...visibleIds].filter(
        (atomId) => channel === "independent" || !overridden[channel].has(atomId),
      );
      return atomIds.length
        ? [
            {
              id: `inherited-${representation.id}`,
              style: representation.style,
              atomIds,
              colorBy: representation.color_by,
              customColor: representation.custom_color,
              opacity: representation.opacity,
              exactTarget: false,
            },
          ]
        : [];
    },
  );
  const selectionSpecific = targeted.flatMap<RepresentationLayer>((assignment) =>
    assignment.atomIds.length
      ? [
          {
            id: `selection-${assignment.style}`,
            style: assignment.style,
            atomIds: assignment.atomIds,
            colorBy: "element",
            customColor: "#3b82f6",
            opacity: 1,
            exactTarget: true,
          },
        ]
      : [],
  );
  return [...inherited, ...selectionSpecific];
}
