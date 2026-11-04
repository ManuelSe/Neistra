import type { PresentationPointer } from "../viewer/MolecularViewer";

/** Project into the contained source image, including both letterbox offsets. */
export function presentationPoint(point: PresentationPointer, width: number, height: number,
  sourceWidth: number, sourceHeight: number): PresentationPointer | null {
  if (![point.x, point.y, width, height, sourceWidth, sourceHeight].every(Number.isFinite)
    || Math.min(width, height, sourceWidth, sourceHeight) <= 0 || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { x: (width - sourceWidth * scale) / 2 + point.x * sourceWidth * scale,
    y: (height - sourceHeight * scale) / 2 + point.y * sourceHeight * scale };
}
