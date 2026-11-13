import { Column } from "molstar/lib/mol-data/db";
import { Structure, Unit, type Model } from "molstar/lib/mol-model/structure";
import { BondType } from "molstar/lib/mol-model/structure/model/types";
import { IndexPairBonds } from "molstar/lib/mol-model-formats/structure/property/bonds/index-pair";
import { PluginStateObject, PluginStateTransform } from "molstar/lib/mol-plugin-state/objects";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { StateTransformer } from "molstar/lib/mol-state";
import { SymmetryOperator } from "molstar/lib/mol-math/geometry/symmetry-operator";
import type { NormalizedStructure } from "../api/types";

interface AuthoredBondsInput {
  atomIds: number[];
  bonds: NormalizedStructure["bonds"];
  exclusions: [number, number][];
}

export function authoredBondInput(source: NormalizedStructure): AuthoredBondsInput {
  let exclusions: [number, number][] = [];
  const metadata = source.metadata?.neistra_modeling;
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
      Object.keys(metadata).some(key => !["schema_version", "excluded_bonds"].includes(key)) ||
      ("schema_version" in metadata && metadata.schema_version !== 1) ||
      ("excluded_bonds" in metadata && !Array.isArray(metadata.excluded_bonds))) {
      throw new Error("Unsupported authored modeling metadata. Correct its schema and bond exclusions before displaying this structure.");
    }
    const ids = new Set(source.atoms.map(a => a.id));
    const rawPairs: unknown[] = "excluded_bonds" in metadata ? metadata.excluded_bonds as unknown[] : [];
    exclusions = rawPairs.map((pair: unknown) => {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0 && ids.has(id)) || pair[0] === pair[1]) throw new Error("Invalid authored bond exclusion. Each pair must reference two distinct current atoms.");
      return [pair[0] as number, pair[1] as number];
    });
  }
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const excluded = new Set(exclusions.map(([a, b]) => key(a, b)));
  for (const bond of source.bonds) {
    if (excluded.has(key(bond.atom_1_id, bond.atom_2_id))) {
      throw new Error(`Bond ${bond.atom_1_id}–${bond.atom_2_id} is both present and excluded. Repair the conflicting connectivity before displaying this structure.`);
    }
  }
  return { atomIds: source.atoms.map(a => a.id), bonds: source.bonds, exclusions };
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
  const edges = new Map<string, { a: number; b: number; order: number; flag: BondType.Flag }>();
  if (model.atomicHierarchy.atoms._rowCount !== input.atomIds.length) {
    throw new Error("The viewer projection changed atom membership; reimport this structure before displaying its connectivity.");
  }
  const indices = new Map(input.atomIds.map((id, i) => [id, i]));
  for (const bond of input.bonds) {
    const a = indices.get(bond.atom_1_id), b = indices.get(bond.atom_2_id);
    if (a === undefined || b === undefined) throw new Error("Authored bond references a missing atom.");
    const flag = bond.aromatic ? BondType.fromNames(["covalent", "aromatic"]) : BondType.fromName("covalent");
    edges.set(key(bond.atom_1_id, bond.atom_2_id), { a, b, order: bond.aromatic || bond.order === null ? 1 : bond.order, flag });
  }
  const values = [...edges.values()];
  const pairs = IndexPairBonds.fromData({ count: input.atomIds.length, pairs: {
    indexA: Column.ofIntArray(values.map(e => e.a)), indexB: Column.ofIntArray(values.map(e => e.b)),
    order: Column.ofIntArray(values.map(e => e.order)), flag: Column.ofIntArray(values.map(e => e.flag)),
    operatorA: Column.ofIntArray(values.map(() => 0)), operatorB: Column.ofIntArray(values.map(() => 0)),
  } }, { maxDistance: Infinity, cacheable: true });
  return withPairs(model, pairs);
}

/** Native operator-aware pairs retain exact edges in roots and representation subsets. */
export function canonicalStructureBonds(structure: Structure): Structure {
  const units = structure.units.map(unit => {
    if (!Unit.isAtomic(unit)) return unit;
    if (!IndexPairBonds.Provider.get(unit.model)) throw new Error("Canonical viewer connectivity is unavailable.");
    // Normalized projections represent current coordinates, without symmetry copies.
    // A real operator key selects native exhaustive pairs instead of spatial inference.
    if (!unit.conformation.operator.isIdentity) {
      throw new Error("Display the current molecular model without symmetry copies to preserve canonical connectivity.");
    }
    const operator = SymmetryOperator.create(unit.conformation.operator.name, unit.conformation.operator.matrix,
      { ...unit.conformation.operator, key: 0 });
    return Unit.create(unit.id, unit.invariantId, unit.chainGroupId, unit.traits, unit.kind, unit.model, operator, unit.elements);
  });
  return Structure.create(units, { parent: structure.parent, label: structure.label,
    coordinateSystem: structure.coordinateSystem, masterModel: structure.masterModel,
    representativeModel: structure.representativeModel });
}

export const CanonicalStructureBonds = PluginStateTransform.BuiltIn({
  name: "neistra-canonical-structure-bonds", display: { name: "Canonical molecular connectivity" },
  from: PluginStateObject.Molecule.Structure, to: PluginStateObject.Molecule.Structure,
  isDecorator: true,
})({
  apply({ a }) {
    return new PluginStateObject.Molecule.Structure(canonicalStructureBonds(a.data), { label: a.label, description: a.description });
  },
  update({ a, b }) {
    b.data = canonicalStructureBonds(a.data);
    return StateTransformer.UpdateResult.Updated;
  },
});

export const AuthoredModelBonds = PluginStateTransform.BuiltIn({
  name: "neistra-authored-model-bonds", display: { name: "Authored molecular bonds" },
  from: PluginStateObject.Molecule.Model, to: PluginStateObject.Molecule.Model,
  params: { input: PD.Value<AuthoredBondsInput | undefined>(undefined, { isHidden: true }) },
  isDecorator: true,
})({
  apply({ a, params }) {
    if (!params.input) throw new Error("Canonical viewer connectivity is unavailable.");
    return new PluginStateObject.Molecule.Model(overlayAuthoredBonds(a.data, params.input), { label: a.label, description: a.description });
  },
  update({ a, b, oldParams, newParams }) {
    if (oldParams.input !== newParams.input) return StateTransformer.UpdateResult.Recreate;
    const pairs = IndexPairBonds.Provider.get(b.data);
    if (!pairs) throw new Error("Canonical viewer connectivity is unavailable.");
    b.data = withPairs(a.data, pairs);
    return StateTransformer.UpdateResult.Updated;
  },
});
