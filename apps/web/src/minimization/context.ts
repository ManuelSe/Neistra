import type { MinimizationRequest, Project, Selection, NormalizedStructure } from "../api/types";

export interface CalculationSource { artifactId: string; structure: NormalizedStructure }

export interface ContextComponent {
  key: string;
  entryId: string;
  name: string;
  atomIds: number[];
  heavyCount: number;
  mandatory: boolean;
  nearby: boolean;
  hidden: boolean;
  kind: "protein" | "water" | "organic";
}

/** Full covalent components/whole polymer chains, independent of viewer bonds. */
export function calculationComponents(
  project: Project, sources: ReadonlyMap<string, CalculationSource>, selection: Selection,
): ContextComponent[] {
  const selected = new Set(selection.atoms.map(a => `${a.structure_id}/${a.atom_id}`));
  const grid = new Map<string, [number, number, number][]>();
  const cell = (p: readonly number[]) => p.map(v => Math.floor(v / 12));
  for (const ref of selection.atoms) {
    const atom = sources.get(ref.structure_id)?.structure.atoms.find(a => a.id === ref.atom_id);
    if (!atom) continue;
    const key = cell(atom.coordinates).join(",");
    const points = grid.get(key) ?? []; points.push(atom.coordinates); grid.set(key, points);
  }
  const near = (point: [number, number, number]) => {
    const [x, y, z] = cell(point);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      for (const other of grid.get(`${x + i},${y + j},${z + k}`) ?? []) {
        if (point.reduce((sum, v, axis) => sum + (v - other[axis]) ** 2, 0) <= 144) return true;
      }
    }
    return false;
  };
  const result: ContextComponent[] = [];
  for (const entry of project.entries) {
    const structure = sources.get(entry.id)?.structure;
    if (!structure) continue;
    const parent = new Map(structure.atoms.map(a => [a.id, a.id]));
    const find = (id: number): number => {
      let root = id;
      while (parent.get(root) !== root && parent.has(root)) root = parent.get(root)!;
      while (parent.get(id) !== id && parent.has(id)) { const next = parent.get(id)!; parent.set(id, root); id = next; }
      return root;
    };
    const union = (first: number, second: number) => {
      if (parent.has(first) && parent.has(second)) parent.set(find(second), find(first));
    };
    for (const bond of structure.bonds) union(bond.atom_1_id, bond.atom_2_id);
    const residues = new Map(structure.residues.map(r => [r.id, r]));
    const firstInChain = new Map<number, number>();
    for (const atom of structure.atoms) {
      const residue = atom.residue_id === null ? undefined : residues.get(atom.residue_id);
      if (residue?.component_type !== "polymer") continue;
      const first = firstInChain.get(residue.chain_id);
      if (first !== undefined) union(first, atom.id); else firstInChain.set(residue.chain_id, atom.id);
    }
    const groups = new Map<number, typeof structure.atoms>();
    for (const atom of structure.atoms) { const root = find(atom.id); const atoms = groups.get(root) ?? []; atoms.push(atom); groups.set(root, atoms); }
    for (const atoms of groups.values()) {
      const polymer = atoms.map(a => a.residue_id === null ? undefined : residues.get(a.residue_id)).find(r => r?.component_type === "polymer");
      const residue = atoms[0].residue_id === null ? undefined : residues.get(atoms[0].residue_id);
      const chain = structure.chains.find(c => c.id === polymer?.chain_id);
      const mandatory = atoms.some(a => selected.has(`${entry.id}/${a.id}`));
      result.push({ key: `${entry.id}/${atoms[0].id}`, entryId: entry.id,
        name: `${entry.name} · ${polymer ? `chain ${chain?.name || polymer.chain_id}` : residue?.name || `molecule ${atoms[0].id}`}`,
        atomIds: atoms.map(a => a.id), heavyCount: atoms.filter(a => a.element !== "H").length,
        mandatory, nearby: mandatory || atoms.some(a => near(a.coordinates)), hidden: !entry.visible,
        kind: polymer ? "protein" : residue?.component_type === "water" ? "water" : "organic" });
    }
  }
  return result;
}

export function minimizationRequest(
  project: Project, selection: Selection, sources: ReadonlyMap<string, CalculationSource>,
  components: ContextComponent[], included: ReadonlySet<string>, mode: "isolated" | "environment", iterations: number,
): MinimizationRequest {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 2000) throw new Error("Choose between 1 and 2000 iterations.");
  const chosen = components.filter(c => c.mandatory || (mode === "environment" && included.has(c.key)));
  const byEntry = new Map<string, number[]>();
  for (const component of chosen) {
    const ids = byEntry.get(component.entryId) ?? []; ids.push(...component.atomIds); byEntry.set(component.entryId, ids);
  }
  if (!selection.atoms.length || selection.atoms.length > 2000) throw new Error("Select between 1 and 2000 movable atoms.");
  if (mode === "isolated" && chosen.length !== 1) throw new Error("Choose environment mode for selections spanning molecules or entries.");
  if (chosen.reduce((sum, c) => sum + c.atomIds.length, 0) > 20000) throw new Error("Complete calculation exceeds 20,000 atoms including H.");
  if (chosen.filter(c => c.kind === "organic").length > 4) throw new Error("Include at most four organic components.");
  if (chosen.some(c => c.kind === "organic" && (c.heavyCount > 256 || c.atomIds.length > 1024))) throw new Error("An organic component exceeds 256 heavy / 1024 total atoms.");
  for (const entryId of byEntry.keys()) {
    const entry = project.entries.find(e => e.id === entryId);
    if (!entry || entry.current_artifact_id !== sources.get(entryId)?.artifactId) throw new Error("A calculation source changed. Refresh setup before running.");
    if (entry.locked && selection.atoms.some(a => a.structure_id === entryId)) throw new Error(`Unlock ${entry.name} before selecting movable atoms.`);
  }
  if (selection.atoms.some(ref => !components.some(c => c.entryId === ref.structure_id && c.mandatory && c.atomIds.includes(ref.atom_id)))) throw new Error("A selected atom is unavailable. Refresh setup.");
  return { expected_revision: project.revision, mode, selection,
    context: mode === "environment" ? [...byEntry].sort(([a], [b]) => a.localeCompare(b)).map(([entry_id, ids]) => ({ entry_id, atom_ids: [...ids].sort((a, b) => a - b) })) : [],
    conformers: Object.fromEntries([...byEntry.keys()].map(id => [id, (sources.get(id)!.structure.active_conformer_id ?? 1)])), max_iterations: iterations };
}
