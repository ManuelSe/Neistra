import type { Selection } from "../api/types";
import { canonicalSelection, type StructureMap } from "./selection";
import { spatialSelectionInWorker } from "./spatialClient";

export type ExpandSelection = (
  distance: number,
  granularity: "atom" | "residue",
  signal: AbortSignal,
) => Promise<number>;

/** A shared cache fetch may finish after cancellation; it must never apply a result. */
export async function expandByDistance({
  selection, distance, granularity, signal, load, isCurrent, apply,
}: {
  selection: Selection;
  distance: number;
  granularity: "atom" | "residue";
  signal: AbortSignal;
  load: () => Promise<StructureMap>;
  isCurrent: () => boolean;
  apply: (selection: Selection) => void;
}): Promise<number> {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("Enter a positive finite distance in Å.");
  }
  if (!selection.atoms.length) throw new Error("Select atoms before expanding.");
  const check = () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new DOMException("Selection or structures changed.", "AbortError");
  };
  check();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException("Distance expansion cancelled.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  let structures: StructureMap;
  try {
    structures = await Promise.race([load(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  check();
  const atoms = [...structures].flatMap(([structureId, structure]) =>
    structure.atoms.map((atom) => ({
      structureId, atomId: atom.id, residueId: atom.residue_id, coordinates: atom.coordinates,
    })),
  );
  const references = await spatialSelectionInWorker(
    atoms, selection.atoms, distance, granularity, { signal, preserveOrphans: true },
  );
  check();
  const expanded = canonicalSelection(
    [...selection.atoms, ...references], granularity, "inspector",
  );
  apply(expanded);
  return expanded.atoms.length;
}
