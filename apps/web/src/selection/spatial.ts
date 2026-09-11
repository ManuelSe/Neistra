import type { AtomReference } from "../api/types";

export interface SpatialAtom {
  structureId: string;
  atomId: number;
  residueId: number | null;
  coordinates: [number, number, number];
}

export interface SpatialRequest {
  id: number;
  atoms: SpatialAtom[];
  seed: AtomReference[];
  distance: number;
  granularity: "atom" | "residue";
  preserveOrphans?: boolean;
}

export interface SpatialResponse {
  id: number;
  atoms: AtomReference[];
}

export function computeSpatialSelection(request: SpatialRequest): SpatialResponse {
  const seedKeys = new Set(
    request.seed.map((reference) => `${reference.structure_id}:${reference.atom_id}`),
  );
  const seedCoordinates = request.atoms
    .filter((atom) => seedKeys.has(`${atom.structureId}:${atom.atomId}`))
    .map((atom) => atom.coordinates);
  const thresholdSquared = request.distance * request.distance;
  const matchedResidues = new Set<string>();
  const matchedAtoms = new Set<string>();

  for (const atom of request.atoms) {
    const within = seedCoordinates.some((seed) => {
      const dx = atom.coordinates[0] - seed[0];
      const dy = atom.coordinates[1] - seed[1];
      const dz = atom.coordinates[2] - seed[2];
      return dx * dx + dy * dy + dz * dz <= thresholdSquared;
    });
    if (!within) continue;
    matchedAtoms.add(`${atom.structureId}:${atom.atomId}`);
    if (atom.residueId !== null) {
      matchedResidues.add(`${atom.structureId}:${atom.residueId}`);
    }
  }

  const atoms = request.atoms
    .filter((atom) =>
      request.granularity === "atom"
        ? matchedAtoms.has(`${atom.structureId}:${atom.atomId}`)
        : atom.residueId !== null
          ? matchedResidues.has(`${atom.structureId}:${atom.residueId}`)
          : request.preserveOrphans === true &&
            matchedAtoms.has(`${atom.structureId}:${atom.atomId}`),
    )
    .map((atom) => ({ structure_id: atom.structureId, atom_id: atom.atomId }));
  return { id: request.id, atoms };
}
