import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { ValueCell } from "molstar/lib/mol-util";
import { Unit, type Structure } from "molstar/lib/mol-model/structure";
import { getPhysicalRadius } from "molstar/lib/mol-theme/size/physical";
import { ComplexLinesParams, ComplexLinesVisual, ComplexMeshParams, ComplexMeshVisual } from "molstar/lib/mol-repr/structure/complex-visual";
import type { Lines } from "molstar/lib/mol-geo/geometry/lines/lines";
import { ComplexRepresentation, StructureRepresentationProvider } from "molstar/lib/mol-repr/structure/representation";
import { ElementIterator, getSerialElementLoci, eachSerialElement } from "molstar/lib/mol-repr/structure/visual/util/element";
import type { SurfaceGeometry, SurfaceInput } from "./protocol";
import { SURFACE_LIMITS, SURFACE_PROFILE } from "./protocol";

const geometryByStructure = new WeakMap<Structure, SurfaceGeometry>();
const wireframeByStructure = new WeakMap<Structure, Lines>();
const params = { ...ComplexMeshParams, alpha: PD.Numeric(SURFACE_PROFILE.opacity) };

export function surfaceInput(structure: Structure, sourceAtomIds: readonly number[]): SurfaceInput {
  if (!structure.elementCount || structure.elementCount > SURFACE_LIMITS.atoms) {
    throw new Error("Surface requires 1–100,000 atoms.");
  }
  const n = structure.elementCount;
  const atomIds = new Uint32Array(n), x = new Float64Array(n), y = new Float64Array(n),
    z = new Float64Array(n), radii = new Float32Array(n);
  let offset = 0;
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) throw new Error("Selection surfaces require explicit atoms.");
    for (let index = 0; index < unit.elements.length; index++) {
      const element = unit.elements[index];
      const sourceIndex = unit.model.atomicHierarchy.atomSourceIndex.value(element);
      const atomId = sourceAtomIds[sourceIndex];
      if (!Number.isSafeInteger(atomId) || atomId < 1 || atomId > 0xffffffff) throw new Error("Surface atom identity could not be resolved.");
      atomIds[offset] = atomId;
      x[offset] = unit.conformation.x(element); y[offset] = unit.conformation.y(element); z[offset] = unit.conformation.z(element);
      radii[offset++] = getPhysicalRadius(unit, element);
    }
  }
  return { atomIds, x, y, z, radii };
}

export function detachSurfaceGeometry(structure: Structure) { geometryByStructure.delete(structure); wireframeByStructure.delete(structure); }

export function attachSurfaceWireframe(structure: Structure, lines: Lines) {
  geometryByStructure.delete(structure);
  wireframeByStructure.set(structure, lines);
}

export function attachSurfaceGeometry(structure: Structure, geometry: SurfaceGeometry) {
  if (structure.elementCount !== geometry.atomIds.length) throw new Error("Surface component membership changed.");
  wireframeByStructure.delete(structure);
  geometryByStructure.set(structure, geometry);
}

export const SelectionSurfaceProvider = StructureRepresentationProvider({
  name: "neistra-selection-surface", label: "Selection surface",
  description: "Precomputed molecular surface with canonical atom ownership.",
  factory: (ctx, getParams) => ComplexRepresentation("Selection surface", ctx, getParams,
    (materialId) => ComplexMeshVisual({
      defaultProps: PD.getDefaultValues(params),
      createGeometry: (_ctx, structure) => {
        const data = geometryByStructure.get(structure);
        if (!data) throw new Error("Surface geometry is not ready.");
        const mesh = Mesh.create(data.vertices, data.indices, data.normals, data.groups,
          data.vertices.length / 3, data.indices.length / 3);
        ValueCell.updateIfChanged(mesh.varyingGroup, false);
        return mesh;
      },
      createLocationIterator: ElementIterator.fromStructure,
      getLoci: getSerialElementLoci,
      eachLocation: eachSerialElement,
      setUpdateState: () => {},
    }, materialId)),
  getParams: () => params,
  defaultValues: PD.getDefaultValues(params),
  defaultColorTheme: { name: "element-symbol" },
  defaultSizeTheme: { name: "physical" },
  isApplicable: (structure) => geometryByStructure.has(structure),
});

const lineParams = { ...ComplexLinesParams, alpha: PD.Numeric(SURFACE_PROFILE.opacity), sizeFactor: PD.Numeric(1) };
export const SelectionSurfaceWireframeProvider = StructureRepresentationProvider({
  name: "neistra-selection-surface-wireframe", label: "Surface mesh",
  description: "Triangle edges of the unchanged precomputed molecular surface.",
  factory: (ctx, getParams) => ComplexRepresentation("Surface mesh", ctx, getParams,
    materialId => ComplexLinesVisual({
      defaultProps: PD.getDefaultValues(lineParams),
      createGeometry: (_ctx, structure) => {
        const lines = wireframeByStructure.get(structure);
        if (!lines) throw new Error("Surface mesh is not ready.");
        return lines;
      },
      createLocationIterator: ElementIterator.fromStructure,
      getLoci: getSerialElementLoci,
      eachLocation: eachSerialElement,
      setUpdateState: () => {},
    }, materialId)),
  getParams: () => lineParams,
  defaultValues: PD.getDefaultValues(lineParams),
  defaultColorTheme: { name: "element-symbol" },
  defaultSizeTheme: { name: "physical" },
  isApplicable: structure => wireframeByStructure.has(structure),
});
