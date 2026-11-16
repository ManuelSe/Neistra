import type { AtomReference, MeasurementKind, Point3D } from "../api/types";
import type { ViewerMeasurement } from "./MolecularViewer";
import type { Canvas3D } from "molstar/lib/mol-canvas3d/canvas3d";
import { DataLoci, Loci } from "molstar/lib/mol-model/loci";
import { StructureElement } from "molstar/lib/mol-model/structure";
import { Sphere3D } from "molstar/lib/mol-math/geometry";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { DistanceParams, DistanceRepresentation, type DistanceData } from "molstar/lib/mol-repr/shape/loci/distance";
import { AngleParams, AngleRepresentation, type AngleData } from "molstar/lib/mol-repr/shape/loci/angle";
import { DihedralParams, DihedralRepresentation, type DihedralData } from "molstar/lib/mol-repr/shape/loci/dihedral";
import { LabelParams, LabelRepresentation, type LabelData } from "molstar/lib/mol-repr/shape/loci/label";
import type { Representation, RepresentationContext } from "molstar/lib/mol-repr/representation";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";

export interface SavedMeasurementRecord {
  readonly id: string;
  readonly kind: MeasurementKind;
  readonly atomReferences: readonly AtomReference[];
  readonly label: string;
  readonly loci: readonly StructureElement.Loci[];
  readonly anchor: Point3D;
}

export interface SavedMeasurementData {
  readonly records: readonly SavedMeasurementRecord[];
  readonly distance: DistanceData;
  readonly angle: AngleData;
  readonly dihedral: DihedralData;
  readonly labels: LabelData;
  /** Group indices are local to each public native representation. */
  readonly groups: Readonly<Record<"distance" | "angle" | "dihedral" | "labels", readonly string[]>>;
}

/** Presentation anchors only; scientific values remain application formatted. */
export function savedMeasurementAnchor(kind: MeasurementKind, points: readonly Point3D[]): Point3D {
  if (kind === "angle") return [...points[1]];
  const a = kind === "dihedral" ? points[1] : points[0];
  const b = kind === "dihedral" ? points[2] : points[1];
  return [a[0] / 2 + b[0] / 2, a[1] / 2 + b[1] / 2, a[2] / 2 + b[2] / 2];
}

export function savedMeasurementData(
  measurements: readonly ViewerMeasurement[],
  resolve: (reference: AtomReference) => StructureElement.Loci | null,
): SavedMeasurementData {
  const records: SavedMeasurementRecord[] = [];
  const distance: DistanceData = { pairs: [] }, angle: AngleData = { triples: [] }, dihedral: DihedralData = { quads: [] };
  const labels: LabelData = { infos: [] };
  const groups: Record<"distance" | "angle" | "dihedral" | "labels", string[]> = { distance: [], angle: [], dihedral: [], labels: [] };
  for (const measurement of measurements) {
    const count = measurement.kind === "distance" ? 2 : measurement.kind === "angle" ? 3 : 4;
    if (!measurement.visible || measurement.atom_references.length !== count) continue;
    const loci: StructureElement.Loci[] = [], points: Point3D[] = [];
    for (const reference of measurement.atom_references) {
      const native = resolve(reference);
      if (!native || StructureElement.Loci.size(native) !== 1) break;
      const sphere = Loci.getBoundingSphere(native);
      if (!sphere || !sphere.center.every(Number.isFinite)) break;
      loci.push(native); points.push([sphere.center[0], sphere.center[1], sphere.center[2]]);
    }
    if (loci.length !== count) continue;
    const anchor = savedMeasurementAnchor(measurement.kind, points);
    if (!anchor.every(Number.isFinite)) continue;
    const record: SavedMeasurementRecord = { id: measurement.id, kind: measurement.kind,
      atomReferences: measurement.atom_references.map(reference => ({ ...reference })),
      label: measurement.label, loci, anchor };
    records.push(record);
    if (measurement.kind === "distance") distance.pairs.push({ loci: [loci[0], loci[1]] });
    else if (measurement.kind === "angle") angle.triples.push({ loci: [loci[0], loci[1], loci[2]] });
    else dihedral.quads.push({ loci: [loci[0], loci[1], loci[2], loci[3]] });
    groups[measurement.kind].push(record.id); groups.labels.push(record.id);
    const point = Vec3.create(...anchor);
    labels.infos.push({ label: record.label, loci: DataLoci("neistra-saved-measurement", record, [record.id],
      sphere => Sphere3D.set(sphere, point, 0), () => record.label) });
  }
  return { records, distance, angle, dihedral, labels, groups };
}

export interface SavedMeasurementFactories {
  distance: typeof DistanceRepresentation;
  angle: typeof AngleRepresentation;
  dihedral: typeof DihedralRepresentation;
  labels: typeof LabelRepresentation;
}

const nativeFactories: SavedMeasurementFactories = {
  distance: DistanceRepresentation, angle: AngleRepresentation, dihedral: DihedralRepresentation, labels: LabelRepresentation,
};

interface OwnedRepresentation {
  representation: Representation.Any;
  build(): Promise<void>;
  building: boolean;
  destroyed: boolean;
}

/** One disposable, off-canvas prepared batch; never owns molecular state. */
export class SavedMeasurementBatch {
  readonly geometry: { distance?: DistanceRepresentation; angle?: AngleRepresentation; dihedral?: DihedralRepresentation } = {};
  readonly labels: LabelRepresentation;
  private readonly owned: OwnedRepresentation[] = [];
  private retired = false;
  private prepared = false;
  private attachedCanvas: Pick<Canvas3D, "add" | "remove"> | undefined;

  constructor(readonly data: SavedMeasurementData, context: RepresentationContext, factories = nativeFactories) {
    try {
      if (data.distance.pairs.length) {
        const representation = factories.distance(context, () => DistanceParams);
        this.geometry.distance = representation;
        this.own(representation, () => representation.createOrUpdate({
          visuals: PD.getDefaultValues(DistanceParams).visuals.filter(visual => visual !== "text"),
        }, data.distance).run());
      }
      if (data.angle.triples.length) {
        const representation = factories.angle(context, () => AngleParams);
        this.geometry.angle = representation;
        this.own(representation, () => representation.createOrUpdate({
          visuals: PD.getDefaultValues(AngleParams).visuals.filter(visual => visual !== "text"),
        }, data.angle).run());
      }
      if (data.dihedral.quads.length) {
        const representation = factories.dihedral(context, () => DihedralParams);
        this.geometry.dihedral = representation;
        this.own(representation, () => representation.createOrUpdate({
          visuals: PD.getDefaultValues(DihedralParams).visuals.filter(visual => visual !== "text"),
        }, data.dihedral).run());
      }
      this.labels = factories.labels(context, () => LabelParams);
      this.own(this.labels, () => this.labels.createOrUpdate({ customText: "", scaleByRadius: false }, data.labels).run());
    } catch (error: unknown) { this.retire(); throw error; }
  }

  private own(representation: Representation.Any, build: () => Promise<void>): void {
    this.owned.push({ representation, build, building: false, destroyed: false });
    representation.setState({ visible: false, pickable: false, markerActions: 0 });
  }

  private destroy(resource: OwnedRepresentation): void {
    if (resource.building || resource.destroyed) return;
    resource.destroyed = true; resource.representation.destroy();
  }

  async prepare(isCurrent: () => boolean): Promise<boolean> {
    try {
      for (const resource of this.owned) {
        if (this.retired || !isCurrent()) { this.retire(); return false; }
        resource.building = true;
        try { await resource.build(); }
        finally { resource.building = false; if (this.retired) this.destroy(resource); }
        if (this.retired || !isCurrent()) { this.retire(); return false; }
        resource.representation.setState({ visible: false, pickable: false, markerActions: 0 });
      }
      this.prepared = true;
      return true;
    } catch (error: unknown) { this.retire(); throw error; }
  }

  /** No awaits between native attachments: observers cannot see a partial batch. */
  attach(canvas: Pick<Canvas3D, "add" | "remove">): boolean {
    if (this.retired || !this.prepared) return false;
    this.attachedCanvas = canvas;
    try {
      for (const resource of this.owned) {
        if (this.retired) return false;
        resource.representation.setState({ visible: true, pickable: false, markerActions: 0 });
        canvas.add(resource.representation);
      }
      return !this.retired;
    } catch (error: unknown) { this.retire(); throw error; }
  }

  retire(): void {
    this.retired = true;
    for (const resource of this.owned) {
      if (resource.destroyed) continue;
      resource.representation.setState({ visible: false, pickable: false, markerActions: 0 });
      this.attachedCanvas?.remove(resource.representation);
      // A pending native task can allocate again after destroy; settle it first.
      this.destroy(resource);
    }
    this.attachedCanvas = undefined;
  }
}
