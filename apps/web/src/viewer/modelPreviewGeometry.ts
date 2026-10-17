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
export function modelPreviewColor(background: string): Color {
  return Color.luminance(Color.fromHexStyle(background)) > 0.5 ? Color(0x006875) : Color(0x3de3ff);
}

export function createModelPreviewRepresentation(color: () => Color) {
  return ShapeRepresentation<ModelPreview, Mesh, typeof Mesh.Params>((_ctx, preview, _props, previous) => {
    const builder = MeshBuilder.createState(2048, 1024, previous?.geometry);
    builder.currentGroup = 0;
    for (const atom of preview.atoms) addSphere(builder, Vec3.create(...atom.coordinates), atom.element === "H" ? 0.22 : 0.35, 1);
    for (const move of preview.moved_atoms ?? []) {
      addSphere(builder, Vec3.create(...move.after), 0.22, 1);
      if (Math.hypot(...move.before.map((v, i) => v - move.after[i])) > 1e-8) addSimpleCylinder(builder, Vec3.create(...move.before), Vec3.create(...move.after), { radiusTop: 0.04, radiusBottom: 0.04, radialSegments: 6 });
    }
    for (const removed of preview.removed_atoms ?? []) {
      for (const sign of [-1, 1]) {
        const [x, y, z] = removed.coordinates;
        addSimpleCylinder(builder, Vec3.create(x - 0.25, y - sign * 0.25, z), Vec3.create(x + 0.25, y + sign * 0.25, z), { radiusTop: 0.06, radiusBottom: 0.06, radialSegments: 6 });
      }
    }
    for (const bond of preview.bonds) {
      if (Math.hypot(...bond.start.map((v, i) => v - bond.end[i])) > 1e-8) addSimpleCylinder(builder, Vec3.create(...bond.start), Vec3.create(...bond.end), { radiusTop: 0.1, radiusBottom: 0.1, radialSegments: 8, topCap: true, bottomCap: true });
    }
    return Shape.create("Proposed molecular placement", preview, MeshBuilder.getMesh(builder), color, () => 1, () => "");
  }, Mesh.Utils);
}
