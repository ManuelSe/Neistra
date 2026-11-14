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
import { SURFACE_PROFILE, validateSurfaceAtomCount, type SurfaceChannel } from "./protocol";
import { checkMeshAllocation, checkWorkingAllocation } from "./allocation";

const geometryByStructure = new WeakMap<Structure, SurfaceGeometry>();
const wireframeByStructure = new WeakMap<Structure, Lines>();
const validatedDisplayGeometry = new WeakMap<SurfaceGeometry, { structure: Structure; sourceAtomIds: readonly number[] }>();
const params = { ...ComplexMeshParams, alpha: PD.Numeric(SURFACE_PROFILE.opacity) };

export function surfaceInput(structure: Structure, sourceAtomIds: readonly number[], kind: SurfaceChannel = "fragment"): SurfaceInput {
  validateSurfaceAtomCount(kind, structure.elementCount);
  const n = structure.elementCount;
  // Native-order inputs, sort indices and canonical-order output coexist.
  checkWorkingAllocation(n * (32 * 2 + 4));
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
  const order = Uint32Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => atomIds[a] - atomIds[b]);
  const canonical: SurfaceInput = { kind, atomIds: new Uint32Array(n), x: new Float64Array(n),
    y: new Float64Array(n), z: new Float64Array(n), radii: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const serial = order[i], id = atomIds[serial];
    if (i > 0 && id === canonical.atomIds[i - 1]) throw new Error("Surface atom identity is duplicated.");
    canonical.atomIds[i] = id;
    canonical.x[i] = x[serial]; canonical.y[i] = y[serial]; canonical.z[i] = z[serial];
    canonical.radii[i] = radii[serial];
  }
  return canonical;
}

function canonicalIndex(ids: Uint32Array, id: number): number {
  let low = 0, high = ids.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1, value = ids[mid];
    if (value === id) return mid;
    if (value < id) low = mid + 1; else high = mid - 1;
  }
  throw new Error("Surface component membership changed.");
}

/** Map cached canonical ownership into the disposable component's native iterator. */
export async function surfaceDisplayGeometry(structure: Structure, sourceAtomIds: readonly number[],
  canonical: SurfaceGeometry, signal: AbortSignal, reserve: (bytes: number) => void,
): Promise<{ geometry: SurfaceGeometry; displayBytes: number }> {
  signal.throwIfAborted();
  const n = canonical.atomIds.length;
  if (structure.elementCount !== n || canonical.vertices.length % 3 !== 0
    || canonical.normals.length !== canonical.vertices.length || canonical.groups.length !== canonical.vertices.length / 3
    || canonical.indices.length % 3 !== 0
    || canonical.atomIds.some((id, i) => id === 0 || (i > 0 && id <= canonical.atomIds[i - 1]))) {
    throw new Error("Invalid canonical surface ownership.");
  }
  const displayBytes = checkMeshAllocation(canonical.groups.byteLength + n * 4);
  // A pocket's isolated index copy can coexist with its cached calculation.
  const workingBytes = checkWorkingAllocation(canonical.evidence.meshBytes + canonical.indices.byteLength + displayBytes + n * 5);
  reserve(displayBytes);
  const atomIds = new Uint32Array(n), canonicalToSerial = new Uint32Array(n), seen = new Uint8Array(n);
  let serial = 0;
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) throw new Error("Surface display requires explicit atoms.");
    for (let local = 0; local < unit.elements.length; local++) {
      const element = unit.elements[local];
      if (serial % 4096 === 0) {
        if (serial) await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal.throwIfAborted();
      }
      const id = sourceAtomIds[unit.model.atomicHierarchy.atomSourceIndex.value(element)];
      if (!Number.isSafeInteger(id) || id < 1 || id > 0xffffffff) throw new Error("Surface atom identity could not be resolved.");
      const index = canonicalIndex(canonical.atomIds, id);
      if (seen[index]) throw new Error("Surface display atom identity is duplicated.");
      seen[index] = 1; atomIds[serial] = id; canonicalToSerial[index] = serial++;
    }
  }
  if (serial !== n || seen.some(value => value !== 1)) throw new Error("Surface component membership changed.");
  const groups = new Float32Array(canonical.groups.length);
  for (let i = 0; i < groups.length; i++) {
    if (i % 16384 === 0) {
      if (i) await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const group = canonical.groups[i];
    if (!Number.isInteger(group) || group < 0 || group >= n) throw new Error("Invalid surface owner group.");
    groups[i] = canonicalToSerial[group];
  }
  signal.throwIfAborted();
  const geometry = { ...canonical, atomIds, groups,
    evidence: { ...canonical.evidence, workingBoundBytes: Math.max(canonical.evidence.workingBoundBytes, workingBytes) } };
  validatedDisplayGeometry.set(geometry, { structure, sourceAtomIds });
  return { geometry, displayBytes };
}

export function detachSurfaceGeometry(structure: Structure) { geometryByStructure.delete(structure); wireframeByStructure.delete(structure); }

export function attachSurfaceWireframe(structure: Structure, lines: Lines) {
  geometryByStructure.delete(structure);
  wireframeByStructure.set(structure, lines);
}

export function attachSurfaceGeometry(structure: Structure, geometry: SurfaceGeometry) {
  const binding = validatedDisplayGeometry.get(geometry);
  if (binding?.structure !== structure || structure.elementCount !== geometry.atomIds.length) {
    throw new Error("Surface display ownership must be validated for this component.");
  }
  let serial = 0;
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) throw new Error("Surface display requires explicit atoms.");
    for (let local = 0; local < unit.elements.length; local++) {
      const element = unit.elements[local];
      if (geometry.atomIds[serial++] !== binding.sourceAtomIds[unit.model.atomicHierarchy.atomSourceIndex.value(element)]) {
        throw new Error("Surface component membership changed.");
      }
    }
  }
  if (geometry.groups.some(group => !Number.isInteger(group) || group < 0 || group >= serial)) throw new Error("Invalid surface owner group.");
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
