import { Column } from "molstar/lib/mol-data/db";
import { Structure, Unit, type Model } from "molstar/lib/mol-model/structure";
import { BondType } from "molstar/lib/mol-model/structure/model/types";
import { IndexPairBonds } from "molstar/lib/mol-model-formats/structure/property/bonds/index-pair";
import { PluginStateObject, PluginStateTransform } from "molstar/lib/mol-plugin-state/objects";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { StateTransformer } from "molstar/lib/mol-state";
import type { NormalizedStructure } from "../api/types";

interface AuthoredBondsInput {
  atomIds: number[];
  bonds: NormalizedStructure["bonds"];
  exclusions: [number, number][];
  inferDisplay: boolean;
}

export function authoredBondInput(source: NormalizedStructure, format: "sdf" | "mmcif" | "pdb" | "mol"): AuthoredBondsInput | null {
  let exclusions: [number, number][] = [];
  const metadata = source.metadata?.neistra_modeling;
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== "object" || !("schema_version" in metadata) || metadata.schema_version !== 1 || !("excluded_bonds" in metadata) || !Array.isArray(metadata.excluded_bonds)) {
      throw new Error("Unsupported authored modeling metadata.");
    }
    const ids = new Set(source.atoms.map(a => a.id));
    exclusions = metadata.excluded_bonds.map((pair: unknown) => {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && ids.has(id)) || pair[0] === pair[1]) throw new Error("Invalid authored bond exclusion.");
      return [pair[0] as number, pair[1] as number];
    });
  }
  if ((format === "mmcif" || format === "pdb") && metadata === undefined && !source.bonds.some(b => b.order !== null || b.aromatic)) return null;
  return { atomIds: source.atoms.map(a => a.id), bonds: source.bonds, exclusions, inferDisplay: format === "mmcif" || format === "pdb" };
}

function withPairs(model: Model, pairs: IndexPairBonds): Model {
  // A new disposable model owns its dynamic bond cache. Keep all other native
  // properties, including polymer/secondary structure, independent of our graph.
  const dynamic = { ...model._dynamicPropertyData };
  delete dynamic.ElementSetIntraBondCache;
  const result = { ...model, _dynamicPropertyData: dynamic };
  IndexPairBonds.Provider.set(result, pairs);
  return result;
}

export function overlayAuthoredBonds(model: Model, input: AuthoredBondsInput): Model {
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const excluded = new Set(input.exclusions.map(([a, b]) => key(a, b)));
  const edges = new Map<string, { a: number; b: number; order: number; flag: BondType.Flag }>();
  const sourceIndex = (unit: Unit.Atomic, index: number) => model.atomicHierarchy.atomSourceIndex.value(unit.elements[index]);
  const add = (a: number, b: number, order: number, flag: BondType.Flag) => {
    if (a === b || a < 0 || b < 0 || a >= input.atomIds.length || b >= input.atomIds.length) return;
    const id = key(input.atomIds[a], input.atomIds[b]);
    if (!excluded.has(id)) edges.set(id, { a, b, order, flag });
  };
  if (input.inferDisplay) {
    const baseline = Structure.ofModel(model);
    for (const unit of baseline.units) {
      if (!Unit.isAtomic(unit)) continue;
      const bonds = unit.bonds;
      for (let i = 0; i < bonds.a.length; i++) {
        if (bonds.a[i] >= bonds.b[i]) continue;
        add(sourceIndex(unit, bonds.a[i]), sourceIndex(unit, bonds.b[i]), bonds.edgeProps.order[i], bonds.edgeProps.flags[i]);
      }
    }
    for (const edge of baseline.interUnitBonds.edges) {
      const a = baseline.unitMap.get(edge.unitA), b = baseline.unitMap.get(edge.unitB);
      if (Unit.isAtomic(a) && Unit.isAtomic(b)) add(sourceIndex(a, edge.indexA), sourceIndex(b, edge.indexB), edge.props.order, edge.props.flag);
    }
  }
  const indices = new Map(input.atomIds.map((id, i) => [id, i]));
  for (const bond of input.bonds) {
    const a = indices.get(bond.atom_1_id), b = indices.get(bond.atom_2_id);
    if (a === undefined || b === undefined) throw new Error("Authored bond references a missing atom.");
    const previous = edges.get(key(bond.atom_1_id, bond.atom_2_id));
    const flag = bond.aromatic ? BondType.fromNames(["covalent", "aromatic"]) : bond.order === null && previous ? previous.flag : BondType.fromName("covalent");
    add(a, b, bond.aromatic || bond.order === null ? 1 : bond.order, flag);
  }
  const values = [...edges.values()];
  const pairs = IndexPairBonds.fromData({ count: input.atomIds.length, pairs: {
    indexA: Column.ofIntArray(values.map(e => e.a)), indexB: Column.ofIntArray(values.map(e => e.b)),
    order: Column.ofIntArray(values.map(e => e.order)), flag: Column.ofIntArray(values.map(e => e.flag)),
  } }, { maxDistance: Infinity, cacheable: true });
  return withPairs(model, pairs);
}

export const AuthoredModelBonds = PluginStateTransform.BuiltIn({
  name: "neistra-authored-model-bonds", display: { name: "Authored molecular bonds" },
  from: PluginStateObject.Molecule.Model, to: PluginStateObject.Molecule.Model,
  params: { input: PD.Value<AuthoredBondsInput | undefined>(undefined, { isHidden: true }) },
  isDecorator: true,
})({
  apply({ a, params }) {
    return new PluginStateObject.Molecule.Model(params.input ? overlayAuthoredBonds(a.data, params.input) : a.data, { label: a.label, description: a.description });
  },
  update({ a, b, oldParams, newParams }) {
    if (oldParams.input !== newParams.input) return StateTransformer.UpdateResult.Recreate;
    const pairs = IndexPairBonds.Provider.get(b.data);
    b.data = pairs ? withPairs(a.data, pairs) : a.data;
    return StateTransformer.UpdateResult.Updated;
  },
});
