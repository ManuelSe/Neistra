import type { SessionCamera } from "./types";
import { copySessionCamera, parseSessionCamera } from "./validation";

export const WORKSPACE_PRESENTATION_MIRROR_KEY = "neistra.workspace-presentation.v1";
const MAX_MIRROR_LENGTH = 4096;

export interface PresentationMirrorV1 {
  schema_version: 1;
  base_revision: number | null;
  camera: SessionCamera;
  dirty: boolean;
}

export function parsePresentationMirror(text: string | null): PresentationMirrorV1 | null {
  if (text === null || text.length > MAX_MIRROR_LENGTH) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>, camera = parseSessionCamera(source.camera);
  if (source.schema_version !== 1 || typeof source.dirty !== "boolean" || !camera
    || (source.base_revision !== null && (!Number.isSafeInteger(source.base_revision) || (source.base_revision as number) < 0))) return null;
  if (!source.dirty && (source.base_revision === null || source.base_revision === 0)) return null;
  return { schema_version: 1, base_revision: source.base_revision as number | null, camera, dirty: source.dirty };
}

export function serializePresentationMirror(mirror: PresentationMirrorV1): string {
  return JSON.stringify({ schema_version: 1, base_revision: mirror.base_revision, camera: copySessionCamera(mirror.camera), dirty: mirror.dirty });
}
