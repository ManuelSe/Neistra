import type {
  AtomReference,
  NormalizedStructure,
  Selection,
  SelectionGranularity,
  SelectionMode,
  SelectionSource,
} from "../api/types";

export type StructureMap = ReadonlyMap<string, NormalizedStructure>;
export type PredicateField =
  | "atom_name"
  | "atom_index"
  | "atom_reference"
  | "element"
  | "residue_name"
  | "residue_number"
  | "chain"
  | "structure";

const key = (reference: AtomReference) =>
  `${reference.structure_id}\u0000${String(reference.atom_id).padStart(12, "0")}`;

export function canonicalSelection(
  atoms: Iterable<AtomReference>,
  granularity: SelectionGranularity = "atom",
  source: SelectionSource = "inspector",
): Selection {
  const unique = new Map<string, AtomReference>();
  for (const reference of atoms) unique.set(key(reference), reference);
  return {
    schema_version: 1,
    atoms: [...unique.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, reference]) => reference),
    granularity,
    source,
  };
}

export const emptySelection = (): Selection =>
  canonicalSelection([], "atom", "inspector");

export function combineSelection(
  current: Selection,
  operand: Selection,
  mode: SelectionMode,
): Selection {
  if (mode === "replace") return canonicalSelection(operand.atoms, operand.granularity, operand.source);
  const result = new Map(current.atoms.map((reference) => [key(reference), reference]));
  for (const reference of operand.atoms) {
    if (mode === "add") result.set(key(reference), reference);
    else result.delete(key(reference));
  }
  return canonicalSelection(result.values(), operand.granularity, operand.source);
}

export function selectionMode(event: Pick<MouseEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): SelectionMode {
  if (event.altKey) return "subtract";
  if (event.ctrlKey || event.metaKey || event.shiftKey) return "add";
  return "replace";
}

export function structureSelection(
  structureId: string,
  structure: NormalizedStructure,
  source: SelectionSource,
): Selection {
  return canonicalSelection(
    structure.atoms.map((atom) => ({ structure_id: structureId, atom_id: atom.id })),
    "structure",
    source,
  );
}

export function residueSelection(
  structureId: string,
  structure: NormalizedStructure,
  residueId: number,
  source: SelectionSource,
): Selection {
  return canonicalSelection(
    structure.atoms
      .filter((atom) => atom.residue_id === residueId)
      .map((atom) => ({ structure_id: structureId, atom_id: atom.id })),
    "residue",
    source,
  );
}

export function chainSelection(
  structureId: string,
  structure: NormalizedStructure,
  chainId: number,
  source: SelectionSource,
): Selection {
  const residueIds = new Set(
    structure.residues.filter((residue) => residue.chain_id === chainId).map((residue) => residue.id),
  );
  return canonicalSelection(
    structure.atoms
      .filter((atom) => atom.residue_id !== null && residueIds.has(atom.residue_id))
      .map((atom) => ({ structure_id: structureId, atom_id: atom.id })),
    "chain",
    source,
  );
}

export function invertSelection(
  current: Selection,
  structures: StructureMap,
): Selection {
  const universe = canonicalSelection(
    [...structures].flatMap(([structureId, structure]) =>
      structure.atoms.map((atom) => ({ structure_id: structureId, atom_id: atom.id })),
    ),
    "atom",
    "inspector",
  );
  return combineSelection(universe, current, "subtract");
}

export function expandSelection(
  current: Selection,
  structures: StructureMap,
  granularity: SelectionGranularity,
): Selection {
  const expanded: AtomReference[] = [];
  for (const [structureId, structure] of structures) {
    const selectedIds = new Set(
      current.atoms
        .filter((reference) => reference.structure_id === structureId)
        .map((reference) => reference.atom_id),
    );
    if (selectedIds.size === 0) continue;
    const atomsById = new Map(structure.atoms.map((atom) => [atom.id, atom]));
    const residueIds = new Set(
      [...selectedIds]
        .map((atomId) => atomsById.get(atomId)?.residue_id)
        .filter((residueId): residueId is number => residueId !== null && residueId !== undefined),
    );
    const residuesById = new Map(structure.residues.map((residue) => [residue.id, residue]));
    const chainIds = new Set(
      [...residueIds]
        .map((residueId) => residuesById.get(residueId)?.chain_id)
        .filter((chainId): chainId is number => chainId !== undefined),
    );
    for (const atom of structure.atoms) {
      const include =
        granularity === "atom"
          ? selectedIds.has(atom.id)
          : granularity === "residue"
            ? atom.residue_id !== null && residueIds.has(atom.residue_id)
            : granularity === "chain"
              ? atom.residue_id !== null &&
                chainIds.has(residuesById.get(atom.residue_id)?.chain_id ?? -1)
              : true;
      if (include) expanded.push({ structure_id: structureId, atom_id: atom.id });
    }
  }
  return canonicalSelection(expanded, granularity, "inspector");
}

export function predicateSelection(
  structures: StructureMap,
  field: PredicateField,
  rawValue: string,
): Selection {
  const expected = rawValue.trim().toLocaleLowerCase();
  const matches: AtomReference[] = [];
  for (const [structureId, structure] of structures) {
    const residues = new Map(structure.residues.map((residue) => [residue.id, residue]));
    const chains = new Map(structure.chains.map((chain) => [chain.id, chain]));
    for (const atom of structure.atoms) {
      const residue = atom.residue_id === null ? undefined : residues.get(atom.residue_id);
      const chain = residue ? chains.get(residue.chain_id) : undefined;
      const value =
        field === "atom_name"
          ? atom.name
          : field === "atom_index"
            ? String(atom.id)
            : field === "atom_reference"
              ? `${structureId}:${atom.id}`
              : field === "element"
            ? atom.element
            : field === "residue_name"
              ? residue?.name
              : field === "residue_number"
                ? String(residue?.author_number ?? residue?.label_number ?? "")
                : field === "chain"
                  ? chain?.name
                  : structureId;
      if (value?.toLocaleLowerCase() === expected) {
        matches.push({ structure_id: structureId, atom_id: atom.id });
      }
    }
  }
  return canonicalSelection(matches, "atom", "inspector");
}

export function selectedEntryIds(current: Selection): Set<string> {
  return new Set(current.atoms.map((reference) => reference.structure_id));
}

export function selectionSummary(current: Selection, structures: StructureMap) {
  const residues = new Set<string>();
  const chains = new Set<string>();
  for (const reference of current.atoms) {
    const structure = structures.get(reference.structure_id);
    const atom = structure?.atoms.find((item) => item.id === reference.atom_id);
    const residue = structure?.residues.find((item) => item.id === atom?.residue_id);
    if (residue) {
      residues.add(`${reference.structure_id}:${residue.id}`);
      chains.add(`${reference.structure_id}:${residue.chain_id}`);
    }
  }
  return {
    atoms: current.atoms.length,
    residues: residues.size,
    chains: chains.size,
    structures: selectedEntryIds(current).size,
  };
}
