import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { ValueCell } from "molstar/lib/mol-util";
import { Unit, type Structure } from "molstar/lib/mol-model/structure";
import { getPhysicalRadius } from "molstar/lib/mol-theme/size/physical";
import { ComplexMeshParams, ComplexMeshVisual } from "molstar/lib/mol-repr/structure/complex-visual";
import { ComplexRepresentation, StructureRepresentationProvider } from "molstar/lib/mol-repr/structure/representation";
import { ElementIterator, getSerialElementLoci, eachSerialElement } from "molstar/lib/mol-repr/structure/visual/util/element";
import type { SurfaceGeometry, SurfaceInput } from "./protocol";
import { SURFACE_PROFILE } from "./protocol";

const geometryByStructure = new WeakMap<Structure, SurfaceGeometry>();
const params = { ...ComplexMeshParams, alpha: PD.Numeric(SURFACE_PROFILE.opacity) };

export function surfaceInput(structure: Structure, sourceAtomIds: readonly number[]): SurfaceInput {
  const atomIds: number[] = [], x: number[] = [], y: number[] = [], z: number[] = [], radii: number[] = [];
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) throw new Error("Selection surfaces require explicit atoms.");
    for (let index = 0; index < unit.elements.length; index++) {
      const element = unit.elements[index];
      const sourceIndex = unit.model.atomicHierarchy.atomSourceIndex.value(element);
      const atomId = sourceAtomIds[sourceIndex];
      if (!Number.isSafeInteger(atomId) || atomId < 1 || atomId > 0xffffffff) throw new Error("Surface atom identity could not be resolved.");
      atomIds.push(atomId);
      x.push(unit.conformation.x(element)); y.push(unit.conformation.y(element)); z.push(unit.conformation.z(element));
      radii.push(getPhysicalRadius(unit, element));
    }
  }
  return { atomIds: Uint32Array.from(atomIds), x: Float64Array.from(x), y: Float64Array.from(y),
    z: Float64Array.from(z), radii: Float32Array.from(radii) };
}

export function detachSurfaceGeometry(structure: Structure) { geometryByStructure.delete(structure); }

export function attachSurfaceGeometry(structure: Structure, geometry: SurfaceGeometry) {
  if (structure.elementCount !== geometry.atomIds.length) throw new Error("Surface component membership changed.");
  geometryByStructure.set(structure, geometry);
}

export const SelectionSurfaceProvider = StructureRepresentationProvider({
  name: "neistra-selection-surface", label: "Selection fragment surface",
  description: "Molecular surface of selected atoms alone; cut boundaries can expose artificial faces.",
  factory: (ctx, getParams) => ComplexRepresentation("Selection fragment surface", ctx, getParams,
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
