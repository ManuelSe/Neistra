import { Vec2 } from "molstar/lib/mol-math/linear-algebra";
import type { Loci } from "molstar/lib/mol-model/loci";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import type { AtomReference } from "../api/types";
import type { MolstarEngine } from "../viewer/MolstarEngine";

/** Read the real native pick raster near a projected atom after viewport resize.
 * A floating projected center need not be a pickable raster sample. This only
 * chooses a confirmed pixel within four CSS pixels; the test still sends a
 * trusted native click and independently checks exact application selection.
 */
export function atomPickPixel(engine: MolstarEngine, projected: { x: number; y: number }, expected: AtomReference) {
  const native = engine as unknown as { plugin: PluginUIContext; referencesFromLoci: (loci: Loci) => AtomReference[] };
  const canvas = native.plugin.canvas3d!;
  for (let radius = 0; radius <= 4; radius++) {
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = Math.round(projected.x) + dx, y = Math.round(projected.y) + dy;
      const hit = canvas.identify(Vec2.create(x, y));
      const atoms = native.referencesFromLoci(canvas.getLoci(hit?.id).loci);
      if (atoms.length === 1 && atoms[0].structure_id === expected.structure_id && atoms[0].atom_id === expected.atom_id) return { x, y };
    }
  }
  throw new Error(`No native pixel for ${expected.structure_id}:${expected.atom_id} within four CSS pixels of its projection`);
}
