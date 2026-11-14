import { describe, expect, it } from "vitest";
import type { MeshValues } from "molstar/lib/mol-gl/renderable/mesh";
import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import { Structure, Unit } from "molstar/lib/mol-model/structure";
import { BallAndStickParams } from "molstar/lib/mol-repr/structure/representation/ball-and-stick";
import { ElementSphereVisual } from "molstar/lib/mol-repr/structure/visual/element-sphere";
import { IntraUnitBondCylinderVisual } from "molstar/lib/mol-repr/structure/visual/bond-intra-unit-cylinder";
import { Theme } from "molstar/lib/mol-theme/theme";
import { SizeTheme } from "molstar/lib/mol-theme/size";
import { RuntimeContext } from "molstar/lib/mol-task";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import type { NormalizedStructure } from "../api/types";
import { authoredBondInput, canonicalStructureBonds, overlayAuthoredBonds } from "../viewer/authoredBonds";
import { molstarRepresentationProfile } from "../viewer/settings";
import { proteinStructure } from "./molecular-fixtures";

const atoms = [
  { id: 11, element: "C", x: 0 },
  { id: 37, element: "N", x: 2 },
  { id: 81, element: "O", x: 4 },
  { id: 105, element: "H", x: 6 },
  { id: 233, element: "C", x: 8 },
];

async function molecule(order: number | null = null, aromatic = false, secondEndpoint = 37) {
  const pdb = atoms.map((atom, i) =>
    `HETATM${String(i + 1).padStart(5)} ${`${atom.element}${i + 1}`.padStart(4)} LIG A   1    ${atom.x.toFixed(3).padStart(8)}   0.000   0.000  1.00 10.00          ${atom.element.padStart(2)}  `,
  ).join("\n") + "\nEND\n";
  const parsed = await parsePDB(pdb).run();
  if (parsed.isError) throw new Error(parsed.message);
  const model = (await trajectoryFromPDB(parsed.result).run()).representative;
  const base = proteinStructure();
  const source: NormalizedStructure = { ...base,
    atoms: atoms.map((atom, i) => ({ ...base.atoms[0], id: atom.id, element: atom.element,
      name: `${atom.element}${i + 1}`, coordinates: [atom.x, 0, 0], source_index: i })),
    bonds: order === null ? [] : [{ id: 9, atom_1_id: 11, atom_2_id: secondEndpoint, order,
      aromatic, stereo: null, inferred: false }],
  };
  return canonicalStructureBonds(Structure.ofModel(overlayAuthoredBonds(model, authoredBondInput(source))));
}

async function nativeMeshes(style: "stick" | "thick-stick" | "ball-and-stick", structure: Structure) {
  const profile = molstarRepresentationProfile(style, { opacity: 1, hydrogenMode: "all", exactTarget: true });
  const props = { ...PD.getDefaultValues(BallAndStickParams), ...profile.typeParams, tryUseImpostor: false };
  const theme = Theme.createEmpty();
  const sizes = SizeTheme.createRegistry();
  theme.size = sizes.create(profile.size ?? "physical", { structure }, profile.sizeParams);
  const group = structure.unitSymmetryGroups[0];
  expect(structure.unitSymmetryGroups).toHaveLength(1);
  const sphere = ElementSphereVisual(0, structure, props);
  const bond = IntraUnitBondCylinderVisual(0, structure, props);
  await sphere.createOrUpdate({ runtime: RuntimeContext.Synchronous }, theme, props, { structure, group });
  await bond.createOrUpdate({ runtime: RuntimeContext.Synchronous }, theme, props, { structure, group });
  const sphereObject = sphere.renderObject;
  const bondObject = bond.renderObject;
  if (sphereObject?.type !== "mesh" || (bondObject && bondObject.type !== "mesh")) throw new Error("Expected native CPU meshes.");
  return { spheres: sphereObject.values as MeshValues, bonds: bondObject?.values as MeshValues | undefined,
    dispose: () => { sphere.destroy(); bond.destroy(); } };
}

describe("native stick geometry", () => {
  it.each([
    ["stick", 0.22, "C–C", 233], ["stick", 0.22, "C–N", 37], ["stick", 0.22, "C–O", 81],
    ["thick-stick", 0.36, "C–C", 233], ["thick-stick", 0.36, "C–N", 37], ["thick-stick", 0.36, "C–O", 81],
  ] as const)(
    "%s has radius %s caps and %s cylinders", async (style, expectedRadius, _pair, secondEndpoint) => {
      const structure = await molecule(1, false, secondEndpoint);
      const unit = structure.units[0];
      if (!Unit.isAtomic(unit)) throw new Error("Expected atomic fixture.");
      const mesh = await nativeMeshes(style, structure);
      try {
        const positions = mesh.spheres.aPosition.ref.value, groups = mesh.spheres.aGroup.ref.value;
        const seen = new Set<string>();
        for (let i = 0; i < mesh.spheres.uVertexCount.ref.value; i++) {
          const element = unit.elements[groups[i]];
          const radius = Math.hypot(positions[i * 3] - unit.conformation.x(element),
            positions[i * 3 + 1] - unit.conformation.y(element), positions[i * 3 + 2] - unit.conformation.z(element));
          expect(Math.abs(radius - expectedRadius)).toBeLessThanOrEqual(1e-6);
          seen.add(unit.model.atomicHierarchy.atoms.type_symbol.value(element));
        }
        expect([...seen].sort()).toEqual(["C", "H", "N", "O"]);
        if (!mesh.bonds) throw new Error("Expected the supplied single bond.");
        expect(mesh.bonds.drawCount.ref.value).toBeGreaterThan(0);
        const vertices = mesh.bonds.aPosition.ref.value;
        let maxBondRadius = 0;
        for (let i = 0; i < mesh.bonds.uVertexCount.ref.value; i++) {
          maxBondRadius = Math.max(maxBondRadius, Math.hypot(vertices[i * 3 + 1], vertices[i * 3 + 2]));
        }
        expect(Math.abs(maxBondRadius - expectedRadius)).toBeLessThanOrEqual(1e-6);
      } finally { mesh.dispose(); }
    },
  );

  it("retains isolated atoms without inventing canonical bonds", async () => {
    const mesh = await nativeMeshes("stick", await molecule());
    try {
      expect(mesh.spheres.drawCount.ref.value).toBeGreaterThan(0);
      expect(mesh.bonds?.drawCount.ref.value ?? 0).toBe(0);
    } finally { mesh.dispose(); }
  });

  it.each(["stick", "thick-stick"] as const)("%s retains native multiple/aromatic notation", async style => {
    // These deliberately sparse graphs qualify display notation, not valence or a prepared molecule.
    const counts: number[] = [];
    for (const [order, aromatic] of [[1, false], [2, false], [3, false], [1.5, true]] as const) {
      const mesh = await nativeMeshes(style, await molecule(order, aromatic));
      try { counts.push(mesh.bonds?.drawCount.ref.value ?? 0); }
      finally { mesh.dispose(); }
    }
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[0]);
  });

  it("keeps ball-and-stick atom sizes dependent on element", async () => {
    const mesh = await nativeMeshes("ball-and-stick", await molecule());
    try {
      const positions = mesh.spheres.aPosition.ref.value, groups = mesh.spheres.aGroup.ref.value;
      const radii = new Map<number, number>();
      for (let i = 0; i < mesh.spheres.uVertexCount.ref.value; i++) {
        radii.set(groups[i], Math.hypot(positions[i * 3] - atoms[groups[i]].x, positions[i * 3 + 1], positions[i * 3 + 2]));
      }
      expect(radii.get(0)).toBeCloseTo(1.7 * 0.15, 5);
      expect(radii.get(3)).toBeCloseTo(1.1 * 0.15, 5);
    } finally { mesh.dispose(); }
  });
});
