import type {
  ColorScheme,
  RepresentationSettings,
  RepresentationStyle,
  SelectionRepresentationStyle,
  ViewerSettings,
} from "../api/types";

export const representationStyles: RepresentationStyle[] = [
  "cartoon",
  "backbone",
  "line",
  "stick",
  "thick-stick",
  "ball-and-stick",
  "space-filling",
  "surface",
];

export const colorSchemes: ColorScheme[] = [
  "element",
  "chain",
  "residue",
  "secondary-structure",
  "structure",
  "custom",
];

export const atomicRepresentationStyles: SelectionRepresentationStyle[] = [
  "line",
  "stick",
  "thick-stick",
  "ball-and-stick",
  "space-filling",
];

export const polymerRepresentationStyles: SelectionRepresentationStyle[] = [
  "backbone",
  "cartoon",
];

export type HydrogenDisplayMode = "all" | "polar-only" | "none";

export function hydrogenDisplayMode(
  components: ViewerSettings["components"],
): HydrogenDisplayMode {
  if (!components.hydrogens) return "none";
  return components.nonpolar_hydrogens ? "all" : "polar-only";
}

export interface MolstarRepresentationProfile {
  type:
    | "cartoon"
    | "backbone"
    | "line"
    | "ball-and-stick"
    | "spacefill"
    | "molecular-surface";
  typeParams: {
    alpha: number;
    ignoreHydrogens: boolean;
    ignoreHydrogensVariant?: "all" | "non-polar";
    includeParent?: false;
    sizeFactor?: number;
    sizeAspectRatio?: number;
  };
}

export function molstarRepresentationProfile(
  style: RepresentationStyle,
  options: {
    opacity: number;
    hydrogenMode: HydrogenDisplayMode;
    exactTarget: boolean;
  },
): MolstarRepresentationProfile {
  const type = {
    cartoon: "cartoon",
    backbone: "backbone",
    line: "line",
    stick: "ball-and-stick",
    "thick-stick": "ball-and-stick",
    "ball-and-stick": "ball-and-stick",
    "space-filling": "spacefill",
    surface: "molecular-surface",
  }[style] as MolstarRepresentationProfile["type"];
  const hydrogenParams =
    options.hydrogenMode === "all"
      ? { ignoreHydrogens: false }
      : {
          ignoreHydrogens: true,
          ignoreHydrogensVariant:
            options.hydrogenMode === "polar-only"
              ? ("non-polar" as const)
              : ("all" as const),
        };
  return {
    type,
    typeParams: {
      alpha: options.opacity,
      ...hydrogenParams,
      ...(style !== "surface" &&
      options.exactTarget &&
      atomicRepresentationStyles.includes(style)
        ? { includeParent: false as const }
        : {}),
      ...(style === "stick"
        ? { sizeFactor: 0.22, sizeAspectRatio: 0.35 }
        : style === "thick-stick"
          ? { sizeFactor: 0.36, sizeAspectRatio: 0.78 }
          : {}),
    },
  };
}

export function addRepresentation(
  settings: ViewerSettings,
  style: RepresentationStyle,
  id: string = crypto.randomUUID(),
): ViewerSettings {
  const representation: RepresentationSettings = {
    id,
    style,
    color_by: "element",
    custom_color: "#3b82f6",
    opacity: style === "surface" ? 0.45 : 1,
  };
  return {
    ...settings,
    representations: [...settings.representations, representation],
  };
}

export function removeRepresentation(
  settings: ViewerSettings,
  id: string,
): ViewerSettings {
  if (settings.representations.length === 1) return settings;
  return {
    ...settings,
    representations: settings.representations.filter((item) => item.id !== id),
  };
}
