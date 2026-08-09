import type {
  ColorScheme,
  RepresentationSettings,
  RepresentationStyle,
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
