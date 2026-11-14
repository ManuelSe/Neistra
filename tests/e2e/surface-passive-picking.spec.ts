import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import type { AtomReference, ImportResult, Project, SelectionGranularity, SelectionMode, StructureProjection } from "../../apps/web/src/api/types";
import type { ViewerSelectionEvent, ViewerStructure } from "../../apps/web/src/viewer/MolecularViewer";
import type * as EngineModule from "../../apps/web/src/viewer/MolstarEngine";
import type * as SelectionStoreModule from "../../apps/web/src/store/selection";
import type { PluginUIContext } from "../../apps/web/node_modules/molstar/lib/mol-plugin-ui/context";
import type { Loci } from "../../apps/web/node_modules/molstar/lib/mol-model/loci";
import type { Vec2, Vec3, Vec4 } from "../../apps/web/node_modules/molstar/lib/mol-math/linear-algebra";
import type { Representation } from "../../apps/web/node_modules/molstar/lib/mol-repr/representation";
import type { SurfaceVisualRegistry } from "../../apps/web/src/viewer/surface/objects";

type Engine = InstanceType<typeof EngineModule.MolstarEngine>;
interface Inspection {
  plugin: PluginUIContext;
  structures: ViewerStructure[];
  surfaceVisuals: SurfaceVisualRegistry;
  referencesFromLoci(loci: Loci): AtomReference[];
}
declare global {
  interface Window {
    passivePickingEngine: Engine;
    passivePickingEvents: ViewerSelectionEvent[];
    passivePickingRefusals: number;
  }
}

const sorted = (atoms: readonly AtomReference[]) => [...atoms].sort((a, b) => a.structure_id.localeCompare(b.structure_id) || a.atom_id - b.atom_id);

async function setup(page: Page, request: APIRequestContext, info: TestInfo, fallback: boolean) {
  if (fallback) await page.addInitScript(() => {
    const original = Reflect.get(Worker.prototype, "postMessage") as (this: Worker, message: unknown, options?: Transferable[] | StructuredSerializeOptions) => void;
    window.passivePickingRefusals = 0;
    Worker.prototype.postMessage = function(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      if (message && typeof message === "object" && "x" in message && message.x instanceof Float64Array
        && window.passivePickingRefusals === 0) {
        window.passivePickingRefusals++;
        throw new Error("Controlled surface worker refusal for native fallback qualification");
      }
      return original.call(this, message, options);
    };
  });
  const created = await request.post("/api/v1/projects", { data: { name: `Passive picks ${info.project.name} ${fallback} ${Date.now()}` } });
  expect(created.status()).toBe(201);
  let project = await created.json() as Project;
  const imported = await request.post(`/api/v1/projects/${project.id}/imports`, { multipart: {
    expected_revision: String(project.revision), files: { name: "protein_editing.pdb", mimeType: "chemical/x-pdb",
      buffer: readFileSync("tests/fixtures/formats/protein_editing.pdb") },
  } });
  expect(imported.status()).toBe(201); project = (await imported.json() as ImportResult).project;
  const entry = project.entries[0];
  const styled = await request.put(`/api/v1/projects/${project.id}/entries/${entry.id}/viewer-settings`, { data: {
    expected_revision: project.revision, settings: { ...entry.viewer_settings,
      components: { ...entry.viewer_settings.components, protein: true, ligands: true, solvent: true, ions: true },
      representations: [{ id: "passive-pick-atoms", style: "ball-and-stick", color_by: "element", custom_color: "#3b82f6", opacity: 1 }],
    },
  } });
  expect(styled.ok()).toBe(true); project = await styled.json() as Project;
  const surfaceResponse = await request.post(`/api/v1/projects/${project.id}/surfaces`, { data: {
    expected_revision: project.revision, surfaces: [{ entry_id: entry.id, name: "Pick-through context", source: { kind: "entry" } }],
  } });
  expect(surfaceResponse.ok()).toBe(true); project = await surfaceResponse.json() as Project;
  const surface = project.entries[0].viewer_settings.surface_objects[0];
  const projection = await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection;
  const persisted = await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project;
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/src/viewer/MolstarEngine.ts";
    const { MolstarEngine } = await import(/* @vite-ignore */ path) as typeof EngineModule;
    const original = MolstarEngine.prototype.syncStructures;
    MolstarEngine.prototype.syncStructures = function(...args: Parameters<typeof original>) {
      window.passivePickingEngine = this;
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("dialog", { name: "Projects", exact: true }).getByRole("button", { name: new RegExp(`^${project.name}`) }).click();
  await expect(page.locator(".viewer-status")).toContainText("1 visible / 1 loaded");
  await page.getByRole("button", { name: "Fit all visible", exact: true }).click();
  await page.evaluate(() => {
    window.passivePickingEvents = [];
    window.passivePickingEngine.subscribeSelection(event => window.passivePickingEvents.push(event));
  });
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  const manager = page.getByRole("dialog", { name: "Surfaces", exact: true });
  await expect(manager.locator(".surface-object-status")).toContainText(fallback ? /fallback|failed|refus/i : /ready/i);
  await manager.getByRole("button", { name: /Pick-through context Whole entry/ }).click();
  await manager.getByRole("button", { name: "Close surfaces", exact: true }).click();
  if (fallback) expect(await page.evaluate(() => window.passivePickingRefusals)).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const engine = window.passivePickingEngine as unknown as Inspection;
    return [...engine.plugin.state.data.cells.values()].filter(cell => {
      const representation = (cell.obj?.data as { repr?: Representation.Any } | undefined)?.repr;
      return representation && engine.surfaceVisuals.isManaged(representation);
    }).length;
  })).toBe(1);
  return { project, entry, surface, projection, persisted, manager };
}

async function preference(page: Page, identity: { entryId: string; surfaceId: string }, mode: "hidden" | "solid" | "mesh" | "fallback") {
  await page.evaluate(async ({ identity, mode }) => {
    const engine = window.passivePickingEngine;
    const source = (engine as unknown as Inspection).structures.find(item => item.entryId === identity.entryId)!;
    const surface = source.settings.surface_objects.find(item => item.id === identity.surfaceId)!;
    await engine.previewSurfaceAppearance(identity, mode === "fallback" ? null : {
      ...surface.appearance, mode: mode === "mesh" ? "mesh" : "solid", opacity: mode === "hidden" ? 0 : mode === "solid" ? 1 : 0.3,
    });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, { identity, mode });
}

async function selection(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStoreModule;
    return useSelectionStore.getState().selection.atoms;
  });
}

async function seed(page: Page, atoms: AtomReference[]) {
  await page.evaluate(async atoms => {
    const path = "/src/store/selection.ts";
    const { useSelectionStore } = await import(/* @vite-ignore */ path) as typeof SelectionStoreModule;
    useSelectionStore.getState().replace({ schema_version: 1, granularity: "atom", source: "inspector", atoms });
  }, atoms);
  await expect.poll(() => selection(page)).toEqual(sorted(atoms));
}

async function mode(page: Page, granularity: SelectionGranularity) {
  const select = page.getByRole("combobox", { name: "Viewer picking mode", exact: true });
  if (await select.isVisible()) await select.selectOption(granularity);
  else await page.getByRole("button", { name: `Pick ${granularity}s`, exact: true }).click();
}

async function point(page: Page, target: AtomReference) {
  return page.evaluate(target => {
    const engine = window.passivePickingEngine as unknown as Inspection;
    const canvas = engine.plugin.canvas3d!, element = canvas.webgl.gl.canvas as HTMLCanvasElement;
    const rect = element.getBoundingClientRect();
    const atom = engine.structures.find(item => item.entryId === target.structure_id)!.normalized.atoms.find(item => item.id === target.atom_id)!;
    const projected = canvas.camera.project([0, 0, 0, 0] as unknown as Vec4, atom.coordinates as unknown as Vec3);
    const centerX = Math.round(rect.left + projected[0] / element.width * rect.width);
    const centerY = Math.round(rect.top + (1 - projected[1] / element.height) * rect.height);
    // DPR rounding can put the projected center on an adjoining bond. Inspect a
    // bounded 5px neighborhood before input, retaining the independent atom-ID
    // oracle rather than accepting a broader target or retrying clicks.
    const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2],
      [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -2], [2, -2], [-2, 2], [2, 2]];
    for (const [dx, dy] of offsets) {
      const x = centerX + dx, y = centerY + dy;
      const hit = canvas.identify(new Float32Array([x - rect.left, y - rect.top]) as unknown as Vec2);
      const loci = canvas.getLoci(hit?.id), atoms = engine.referencesFromLoci(loci.loci);
      if (document.elementFromPoint(x, y) === element && atoms.length === 1
        && atoms[0].structure_id === target.structure_id && atoms[0].atom_id === target.atom_id) {
        return { x, y, localX: x - rect.left, localY: y - rect.top, atoms, managed: engine.surfaceVisuals.isManaged(loci.repr), canvasTarget: true };
      }
    }
    throw new Error("No unambiguous native atom pixel in the bounded projected neighborhood");
  }, target);
}

for (const fallback of [false, true]) test(`preserves exact molecular picking through ${fallback ? "fallback lines" : "opaque solid and translucent mesh"} across granularity and modifiers`, async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const { project, entry, surface, projection, persisted, manager } = await setup(page, request, info, fallback);
  const identity = { entryId: entry.id, surfaceId: surface.id };
  await preference(page, identity, "hidden");
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const target = { structure_id: entry.id, atom_id: 2 };
  const expectedAtom = projection.structure.atoms.find(atom => atom.id === target.atom_id)!;
  const residue = projection.structure.residues.find(item => item.id === expectedAtom.residue_id)!;
  const chainResidues = new Set(projection.structure.residues.filter(item => item.chain_id === residue.chain_id).map(item => item.id));
  const refs = (ids: number[]) => ids.map(atom_id => ({ structure_id: entry.id, atom_id }));
  const expected: Record<SelectionGranularity, AtomReference[]> = {
    atom: [target], residue: refs(projection.structure.atoms.filter(atom => atom.residue_id === residue.id).map(atom => atom.id)),
    chain: refs(projection.structure.atoms.filter(atom => atom.residue_id !== null && chainResidues.has(atom.residue_id)).map(atom => atom.id)),
    structure: refs(projection.structure.atoms.map(atom => atom.id)),
  };
  const all = expected.structure;
  const outside = refs([20]);
  const pixel = await point(page, target);
  expect(pixel.canvasTarget).toBe(true);
  expect(pixel.managed).toBe(false);
  expect(pixel.atoms).toEqual([target]);
  const camera = await page.evaluate(() => window.passivePickingEngine.getCamera());
  const evidence: unknown[] = [];
  const states = fallback ? ["hidden", "fallback"] as const : ["hidden", "solid", "mesh"] as const;
  for (const state of states) {
    await preference(page, identity, state);
    const current = await point(page, target);
    expect(current).toEqual(pixel);
    for (const granularity of ["atom", "residue", "chain", "structure"] as const) {
      await mode(page, granularity);
      const operand = expected[granularity];
      const cases: { modifiers: ("Shift" | "Alt" | "Control")[]; initial: AtomReference[]; mode: SelectionMode; expected: AtomReference[] }[] = [
        { modifiers: [], initial: outside, mode: "replace", expected: operand },
        { modifiers: ["Shift"], initial: outside, mode: "add", expected: sorted([...new Map([...outside, ...operand].map(atom => [atom.atom_id, atom])).values()]) },
        { modifiers: ["Alt"], initial: all, mode: "subtract", expected: all.filter(atom => !operand.some(item => item.atom_id === atom.atom_id)) },
        { modifiers: ["Control"], initial: all, mode: "toggle", expected: all.filter(atom => !operand.some(item => item.atom_id === atom.atom_id)) },
        { modifiers: ["Control"], initial: [], mode: "toggle", expected: operand },
      ];
      for (const item of cases) {
        await seed(page, item.initial);
        const before = await page.evaluate(() => window.passivePickingEvents.length);
        // One real input action after independently verifying the same atom pixel.
        await page.locator(".molstar-host canvas").first().click({ position: { x: pixel.localX, y: pixel.localY }, modifiers: item.modifiers });
        await expect.poll(() => page.evaluate(() => window.passivePickingEvents.length)).toBe(before + 1);
        const event = await page.evaluate(() => window.passivePickingEvents.at(-1)!);
        expect(event.mode).toBe(item.mode);
        expect(event.granularity).toBe(granularity);
        expect(sorted(event.atoms)).toEqual(sorted(operand));
        await expect.poll(async () => sorted(await selection(page))).toEqual(sorted(item.expected));
        await expect(manager).toBeHidden();
        expect(await page.evaluate(() => window.passivePickingEngine.getCamera())).toEqual(camera);
        evidence.push({ state, granularity, mode: item.mode, initial: item.initial, event, selected: item.expected });
      }
    }
  }
  const surfaceState = await page.evaluate(() => {
    const engine = window.passivePickingEngine as unknown as Inspection;
    return [...engine.plugin.state.data.cells.values()].flatMap(cell => {
      const candidate = (cell.obj?.data as { repr?: Representation.Any } | undefined)?.repr;
      if (!candidate || !engine.surfaceVisuals.isManaged(candidate)) return [];
      const obj = cell.obj?.data as { repr: { state: { pickable: boolean; markerActions: number }; renderObjects: { type: string; values: { tMarker?: { ref: { value: { array: Uint8Array } } } } }[] } };
      return [{ pickable: obj.repr.state.pickable, markerActions: obj.repr.state.markerActions,
        types: obj.repr.renderObjects.map(item => item.type), marked: obj.repr.renderObjects.some(item => item.values.tMarker?.ref.value.array.some(value => value !== 0)) }];
    });
  });
  expect(surfaceState).toHaveLength(1);
  expect(surfaceState[0]).toMatchObject({ pickable: false, markerActions: 0, marked: false });
  if (fallback) {
    expect(surfaceState[0].types.length).toBeGreaterThan(0);
    // The native line provider retains point primitives for isolated atoms.
    expect(surfaceState[0].types).toContain("lines");
    expect(surfaceState[0].types.every(type => type === "lines" || type === "points")).toBe(true);
  }
  await page.getByRole("button", { name: "Style selection", exact: true }).click();
  await page.getByRole("button", { name: /^Manage surfaces/ }).click();
  await expect(manager.getByRole("button", { name: /Pick-through context Whole entry/ })).toHaveAttribute("aria-pressed", "true");
  expect(await (await request.get(`/api/v1/projects/${project.id}`)).json() as Project).toEqual(persisted);
  expect((await (await request.get(`/api/v1/projects/${project.id}/entries/${entry.id}/structure`)).json() as StructureProjection).structure).toEqual(projection.structure);
  await info.attach("native-passive-picking-matrix.json", { body: JSON.stringify({ target, pixel, camera, surfaceState, evidence }, null, 2), contentType: "application/json" });
});
