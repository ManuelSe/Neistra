import { Mesh } from "molstar/lib/mol-geo/geometry/mesh/mesh";
import { MeshBuilder } from "molstar/lib/mol-geo/geometry/mesh/mesh-builder";
import { addSphere } from "molstar/lib/mol-geo/geometry/mesh/builder/sphere";
import { addSimpleCylinder } from "molstar/lib/mol-geo/geometry/mesh/builder/cylinder";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { Shape } from "molstar/lib/mol-model/shape";
import { ShapeRepresentation } from "molstar/lib/mol-repr/shape/representation";
import { Color } from "molstar/lib/mol-util/color";
import type { ModelPreview } from "../api/types";

/** A nonpickable proposal shape; it never creates native molecular identities. */
export function createModelPreviewRepresentation() {
  return ShapeRepresentation<ModelPreview, Mesh, typeof Mesh.Params>((_ctx, preview, _props, previous) => {
    const builder = MeshBuilder.createState(2048, 1024, previous?.geometry);
    builder.currentGroup = 0;
    for (const atom of preview.atoms) addSphere(builder, Vec3.create(...atom.coordinates), atom.element === "H" ? 0.22 : 0.35, 1);
    for (const bond of preview.bonds) {
      if (Math.hypot(...bond.start.map((v, i) => v - bond.end[i])) > 1e-8) addSimpleCylinder(builder, Vec3.create(...bond.start), Vec3.create(...bond.end), { radiusTop: 0.1, radiusBottom: 0.1, radialSegments: 8, topCap: true, bottomCap: true });
    }
    return Shape.create("Proposed molecular placement", preview, MeshBuilder.getMesh(builder), () => Color(0x29b7d0), () => 1, () => "");
  }, Mesh.Utils);
}
