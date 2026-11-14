import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { PluginStateObject } from "molstar/lib/mol-plugin-state/objects";
import type { Structure } from "molstar/lib/mol-model/structure";
import type { StructureRepresentation } from "molstar/lib/mol-repr/structure/representation";
import type { Representation } from "molstar/lib/mol-repr/representation";
import type * as SurfaceVisualsModule from "../viewer/surface/visual";
import type { AtomReference, CameraState, SurfaceAppearance, SurfaceIdentity } from "../api/types";
import type { ViewerStructure } from "../viewer/MolecularViewer";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { SurfaceGeometry } from "../viewer/surface/protocol";
import { surfaceKey } from "../viewer/surface/protocol";
import { SurfaceCalculator } from "../viewer/surface/client";
import type { SurfaceRuntime } from "../viewer/surface/runtime";
import type { SurfaceVisualRegistry } from "../viewer/surface/objects";
import { captureSurfaceSync, surfaceDefinitionKey, surfaceIdentityKey, type SurfaceSyncSnapshot } from "../viewer/surfaceReconciliation";
import { componentHierarchy, proteinStructure, surfaceObject, viewerSettings } from "./molecular-fixtures";

const native = vi.hoisted(() => ({ wireframe: vi.fn(), map: vi.fn(), attach: vi.fn(), attachLines: vi.fn() }));
vi.mock("../viewer/modelPreviewGeometry", () => ({ createModelPreviewRepresentation: () => ({}), modelPreviewColor: () => 0 }));
vi.mock("../viewer/interactionGeometry", () => ({ createInteractionRepresentation: () => ({}) }));
vi.mock("../viewer/surface/visual", async importOriginal => ({
  ...await importOriginal<typeof SurfaceVisualsModule>(),
  surfaceDisplayGeometry: native.map, attachSurfaceGeometry: native.attach, attachSurfaceWireframe: native.attachLines,
}));
vi.mock("../viewer/surface/wireframe", () => ({ surfaceWireframe: native.wireframe }));
vi.mock("molstar/lib/mol-plugin-state/helpers/structure-representation-params", () => ({
  createStructureRepresentationParams: (_plugin: unknown, _structure: unknown, props: { typeParams: { alpha: number }; colorParams?: { value: number } }) => ({
    type: { name: "test-surface", params: props.typeParams }, colorTheme: { params: props.colorParams },
  }),
}));

interface BindingProbe {
  entryId: string; surfaceId: string; channel: "entry"; controller: AbortController; definition: string;
  componentRef: string; structure: Structure; atomIds: number[]; ids: number[]; visible: Set<number>; isolated: null;
  received: boolean; geometry?: SurfaceGeometry; mapped?: SurfaceGeometry; mappingBytes: number;
  representationRef?: string; installedGeometry?: SurfaceGeometry; mode?: "solid" | "mesh";
  appearance?: SurfaceAppearance; renderedAtoms?: AtomReference[]; overpaintRef?: string;
  unregister?: () => void;
}
interface EngineProbe {
  plugin: PluginUIContext; structures: ViewerStructure[]; surfaceSyncSnapshot: SurfaceSyncSnapshot;
  surfaceDefinitions: Map<string, string>; surfaceBindings: Map<string, BindingProbe>;
  surfaceMeshEntries: Set<string>;
  surfaceRefs: Map<string, string>; surfaceRenderedAtoms: Map<string, AtomReference[]>; renderedAtomReferences: Map<string, AtomReference[]>;
  surfaces: SurfaceRuntime; generation: number; boundGeneration: number;
  syncQueue: Promise<void>; surfaceVisuals: SurfaceVisualRegistry;
  surfaceHitIgnored(representation: Representation.Any): boolean;
  updateSurfacePickingThreshold(): void;
  scheduleSurfaceUpdate(identity: SurfaceIdentity): Promise<void>;
  loadStructure(source: ViewerStructure): Promise<void>; prepareSurface(entryId: string, surfaceId: string): Promise<void>;
  addStructureLabels(source: ViewerStructure): Promise<void>; applyMeasurements(): Promise<void>; applyInteractions(): Promise<void>; applyModelPreview(): Promise<void>;
  addRepresentations(source: ViewerStructure, ref: string, structure: Structure): Promise<void>;
  applySelection(): void; commitScene(camera: CameraState | null): void;
}
function source(id = "entry"): ViewerStructure {
  const normalized = proteinStructure();
  return { entryId: id, label: id, normalized, hierarchy: componentHierarchy(normalized),
    projection: { format: "mmcif", data: "molecule" }, atomIds: normalized.atoms.map(atom => atom.id),
    settings: { ...viewerSettings(), surface_objects: [surfaceObject("one", { kind: "entry" }), surfaceObject("two", { kind: "entry" })] } };
}
function mesh(): SurfaceGeometry {
  return { atomIds: Uint32Array.of(1, 2, 3), vertices: new Float32Array(9), normals: new Float32Array(9),
    indices: Uint32Array.of(0, 1, 2), groups: Float32Array.of(0, 1, 2),
    evidence: { cells: 1, activeCells: 1, meshBytes: 100, meshBoundBytes: 100, workingBoundBytes: 200, durationMs: 1 } };
}
function changed(sources: ViewerStructure[], identity: SurfaceIdentity, appearance: Partial<SurfaceAppearance> = {}, visible?: boolean): ViewerStructure[] {
  return sources.map(item => item.entryId !== identity.entryId ? item : { ...item, settings: { ...item.settings,
    surface_objects: item.settings.surface_objects.map(surface => surface.id !== identity.surfaceId ? surface : {
      ...surface, appearance: { ...surface.appearance, ...appearance }, ...(visible === undefined ? {} : { visible }),
    }),
  } });
}

function setup(sources = [source(), source("unrelated")]) {
  const engine = new MolstarEngine(), state = engine as unknown as EngineProbe;
  const cells = new Map<string, { obj: unknown }>(), representations = new Map<string, Representation.Any>(),
    updates: { ref: string; params: { type: { params: { alpha: number } } } }[] = [], deleted: string[] = [];
  let gate: Promise<void> | undefined;
  let sequence = 0;
  const representation = () => new PluginStateObject.Molecule.Structure.Representation3D({
    repr: { setState: vi.fn(), mark: vi.fn() } as unknown as StructureRepresentation, sourceData: {} as Structure,
  });
  const build = () => {
    let ref = "";
    const builder = {
      to(value: string) { ref = value; return builder; },
      delete(value: string) { deleted.push(value); cells.delete(value); return builder; },
      update(_transform: unknown, update: () => { type: { params: { alpha: number } } }) { updates.push({ ref, params: update() }); return builder; },
      apply() { return { ref: `overpaint-${++sequence}` }; },
      commit() { const held = gate; gate = undefined; return held ?? Promise.resolve(); },
    };
    return builder;
  };
  const add = vi.fn(() => {
    const ref = `replacement-${++sequence}`, obj = representation(); cells.set(ref, { obj });
    return Promise.resolve({ ref, obj });
  });
  const clear = vi.fn(() => Promise.resolve());
  const canvasProps = vi.fn();
  state.plugin = { clear, state: { data: { cells, build } }, builders: { structure: { representation: { addRepresentation: add } } },
    representation: { structure: { themes: { colorThemeRegistry: { get: (name: string) => ({ name }) } } } },
    canvas3d: { setProps: canvasProps, requestDraw: vi.fn() },
  } as unknown as PluginUIContext;
  const runtime = { updateLabel: vi.fn(), remove: vi.fn(), retain: vi.fn(), statuses: vi.fn(() => []),
    canDisplay: vi.fn(() => true), markDisplayed: vi.fn(), markPreparing: vi.fn(), reserveDisplayBytes: vi.fn(), fail: vi.fn() };
  state.surfaces = runtime as unknown as SurfaceRuntime;
  state.structures = sources; state.surfaceSyncSnapshot = captureSurfaceSync(sources, null);
  state.surfaceDefinitions = new Map();
  for (const item of sources) for (const surface of item.settings.surface_objects) {
    const key = surfaceKey(item.entryId, "entry", surface.id), geometry = mesh(), ref = `repr-${item.entryId}-${surface.id}`;
    const binding: BindingProbe = { entryId: item.entryId, surfaceId: surface.id, channel: "entry", controller: new AbortController(),
      definition: surfaceDefinitionKey(item, surface), componentRef: `component-${key}`, structure: {} as Structure,
      atomIds: item.atomIds, ids: item.atomIds, visible: new Set(item.atomIds), isolated: null, received: true,
      geometry, mapped: geometry, mappingBytes: 24, representationRef: ref, installedGeometry: geometry,
      mode: "solid", appearance: { ...surface.appearance }, renderedAtoms: [{ structure_id: item.entryId, atom_id: 1 }] };
    state.surfaceDefinitions.set(surfaceIdentityKey(binding), binding.definition);
    state.surfaceBindings.set(key, binding); state.surfaceRefs.set(key, binding.componentRef);
    state.surfaceMeshEntries.add(key);
    state.surfaceRenderedAtoms.set(key, binding.renderedAtoms!);
    const obj = representation(); cells.set(ref, { obj }); representations.set(ref, obj.data.repr);
    binding.unregister = state.surfaceVisuals.register(obj.data.repr, { entryId: item.entryId, surfaceId: surface.id });
    cells.set(binding.componentRef, { obj: {} });
  }
  const load = vi.spyOn(state, "loadStructure").mockResolvedValue();
  const prepare = vi.spyOn(state, "prepareSurface").mockResolvedValue();
  vi.spyOn(state, "addStructureLabels").mockResolvedValue();
  vi.spyOn(state, "applyMeasurements").mockResolvedValue();
  vi.spyOn(state, "applyInteractions").mockResolvedValue();
  vi.spyOn(state, "applyModelPreview").mockResolvedValue();
  const selection = vi.spyOn(state, "applySelection").mockImplementation(() => {});
  const commit = vi.spyOn(state, "commitScene").mockImplementation(() => {});
  const camera: CameraState = { mode: "perspective", position: [1, 2, 30], target: [1, 2, 3], up: [0, 1, 0], radius: 10 };
  vi.spyOn(engine, "getCamera").mockReturnValue(camera);
  const fields = vi.spyOn(SurfaceCalculator.prototype, "compute").mockRejectedValue(new Error("Unexpected field calculation"));
  return { engine, state, runtime, cells, updates, deleted, add, clear, prepare, fields, selection, commit, camera, load, representations, canvasProps,
    holdNextCommit() { let resolve!: () => void; gate = new Promise<void>(finish => { resolve = finish; }); return resolve; } };
}
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  native.map.mockImplementation((_structure: unknown, _ids: unknown, geometry: SurfaceGeometry) => Promise.resolve({ geometry, displayBytes: 24 }));
  native.wireframe.mockImplementation((_geometry: unknown, _signal: unknown, reserve: (bytes: number) => void) => { reserve(100); return Promise.resolve({}); });
});

describe("surface-only viewer updates", () => {
  const identity = { entryId: "entry", surfaceId: "one" };
  it("renames without reloading molecules, fields or visual transforms", async () => {
    const h = setup(), next = changed(h.state.structures, identity);
    next[0].settings.surface_objects[0].name = "Renamed";
    await h.engine.syncStructures(next);
    expect(h.runtime.updateLabel).toHaveBeenCalledWith("entry", "entry", "one", "entry · Renamed");
    expect(h.load).not.toHaveBeenCalled(); expect(h.fields).not.toHaveBeenCalled(); expect(h.clear).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]); expect(h.add).not.toHaveBeenCalled(); expect(h.deleted).toEqual([]);
  });

  it("changes only the affected appearance transform while preserving molecular and owner state", async () => {
    const h = setup(), unrelated = h.state.surfaceBindings.get(surfaceKey("unrelated", "entry", "one"));
    const original = h.state.surfaceBindings.get(surfaceKey("entry", "entry", "one"))!;
    await h.engine.syncStructures(changed(h.state.structures, identity, { opacity: 0.25, color_by: "custom", custom_color: "#00ff00" }));
    expect(h.updates).toHaveLength(1); expect(h.updates[0]).toMatchObject({ ref: original.representationRef, params: { type: { params: { alpha: 0.25 } } } });
    expect(h.state.surfaceBindings.get(surfaceKey("unrelated", "entry", "one"))).toBe(unrelated);
    expect(h.load).not.toHaveBeenCalled(); expect(h.fields).not.toHaveBeenCalled(); expect(h.clear).not.toHaveBeenCalled();
    expect(h.add).not.toHaveBeenCalled(); expect(h.deleted).toEqual([]); expect(native.map).not.toHaveBeenCalled();
    expect(h.selection).not.toHaveBeenCalled(); expect(h.commit).toHaveBeenLastCalledWith(h.camera);
  });

  it("replaces only the selected mode visual from retained mapped geometry", async () => {
    const h = setup(), binding = h.state.surfaceBindings.get(surfaceKey("entry", "entry", "one"))!, geometry = binding.geometry;
    await h.engine.syncStructures(changed(h.state.structures, identity, { mode: "mesh" }));
    expect(h.deleted).toEqual(["repr-entry-one"]); expect(h.add).toHaveBeenCalledOnce();
    expect(native.wireframe).toHaveBeenCalledOnce(); expect(native.map).not.toHaveBeenCalled();
    expect(binding.geometry).toBe(geometry); expect(binding.mode).toBe("mesh");
    expect(h.runtime.markPreparing).toHaveBeenCalledWith("entry", "entry", "one", geometry);
    expect(h.runtime.reserveDisplayBytes).toHaveBeenCalledWith("entry", "entry", 124, "one");
    expect(h.fields).not.toHaveBeenCalled(); expect(h.load).not.toHaveBeenCalled();
    expect(h.runtime.markDisplayed).toHaveBeenCalledWith("entry", "entry", "one", geometry, undefined);
  });

  it("coalesces rapid held input and restores canonical appearance on cancellation", async () => {
    const h = setup(), release = h.holdNextCommit(), canonical = h.state.structures[0].settings.surface_objects[0].appearance;
    const first = h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0.1 });
    await vi.waitFor(() => expect(h.updates).toHaveLength(1));
    let last = first;
    for (let i = 1; i <= 1000; i++) last = h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: i / 1000 });
    expect(h.updates).toHaveLength(1);
    release(); await first; await last;
    expect(h.updates.map(update => update.params.type.params.alpha)).toEqual([0.1, 1]);
    expect(h.state.structures[0].settings.surface_objects[0].appearance).toEqual(canonical);
    await h.engine.previewSurfaceAppearance(identity, null);
    expect(h.updates.at(-1)?.params.type.params.alpha).toBe(canonical.opacity);
    expect(h.fields).not.toHaveBeenCalled(); expect(h.clear).not.toHaveBeenCalled();
  });

  it("installs the latest appearance after held worker completion instead of captured creation settings", async () => {
    const h = setup(), binding = h.state.surfaceBindings.get(surfaceKey("entry", "entry", "one"))!, canonical = binding.appearance!, geometry = binding.geometry!;
    binding.received = false; binding.geometry = undefined; binding.mapped = undefined;
    binding.representationRef = undefined; binding.installedGeometry = undefined; binding.appearance = undefined;
    await h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0.2 });
    await h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0.7 });
    expect(h.add).not.toHaveBeenCalled();
    binding.received = true; binding.geometry = geometry;
    await h.state.scheduleSurfaceUpdate(identity);
    expect(h.add).toHaveBeenCalledExactlyOnceWith(binding.componentRef, expect.objectContaining({ typeParams: { alpha: 0.7 } }), expect.anything());
    expect(h.state.surfaceBindings.get(surfaceKey("entry", "entry", "one"))?.appearance?.opacity).toBe(0.7);
  });

  it("does not publish a held appearance after its object is removed", async () => {
    const h = setup(), release = h.holdNextCommit(), canonical = h.state.structures[0].settings.surface_objects[0].appearance;
    const preview = h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0.2 });
    await vi.waitFor(() => expect(h.updates).toHaveLength(1));
    const removed = h.state.structures.map(item => item.entryId !== identity.entryId ? item : { ...item, settings: { ...item.settings,
      surface_objects: item.settings.surface_objects.filter(surface => surface.id !== identity.surfaceId) } });
    const removal = h.engine.syncStructures(removed);
    release(); await preview; await removal;
    expect(h.runtime.markDisplayed).not.toHaveBeenCalled();
    expect(h.state.surfaceBindings.has(surfaceKey("entry", "entry", "one"))).toBe(false);
    expect(h.deleted).toContain("component-" + surfaceKey("entry", "entry", "one"));
  });

  it("clears previews on canonical conflicts and changes only source-dependent objects", async () => {
    const h = setup(), canonical = h.state.structures[0].settings.surface_objects[0].appearance;
    await h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0.2 });
    await h.engine.syncStructures(changed(h.state.structures, identity, { opacity: 0.8 }));
    expect(h.updates.at(-1)?.params.type.params.alpha).toBe(0.8);
    const changedSource = changed(h.state.structures, identity);
    changedSource[0].settings.surface_objects[0].source = { kind: "fragment", profile: "molecular-v1", atom_ids: [1] };
    await h.engine.syncStructures(changedSource);
    expect(h.prepare).toHaveBeenCalledExactlyOnceWith("entry", "one");
    expect(h.clear).not.toHaveBeenCalled(); expect(h.load).not.toHaveBeenCalled();
    expect(h.state.surfaceBindings.has(surfaceKey("entry", "entry", "two"))).toBe(true);
  });

  it("keeps opacity-zero and hidden surface owners out of movement refs while preserving atomic detail", async () => {
    const h = setup([source()]), atomic = [{ structure_id: "entry", atom_id: 2 }];
    h.state.renderedAtomReferences.set("entry", atomic);
    // Keep the second object's contribution out of this single-object scenario.
    h.state.surfaceRenderedAtoms.delete(surfaceKey("entry", "entry", "two"));
    const canonical = h.state.structures[0].settings.surface_objects[0].appearance;
    await h.engine.previewSurfaceAppearance(identity, { ...canonical, opacity: 0 });
    expect(h.engine.getRenderedAtomReferences()).toEqual(atomic);
    expect(h.runtime.markDisplayed).toHaveBeenLastCalledWith("entry", "entry", "one", expect.anything(), "Opacity is zero");
    await h.engine.previewSurfaceAppearance(identity, null);
    expect(h.engine.getRenderedAtomReferences()).toEqual([{ structure_id: "entry", atom_id: 2 }, { structure_id: "entry", atom_id: 1 }]);
    await h.engine.syncStructures(changed(h.state.structures, identity, {}, false));
    expect(h.engine.getRenderedAtomReferences()).toEqual(atomic);
  });

  it("does not count requested entry surfaces as drawn atomic detail before their worker installs", async () => {
    const h = setup([source()]), input = h.state.structures[0];
    input.settings.representations = [];
    await h.state.addRepresentations(input, "source", { units: [] } as unknown as Structure);
    expect(h.state.renderedAtomReferences.get("entry")).toEqual([]);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("rejects retired pixels while narrow removal is held without blocking unrelated atomic or surface hits", async () => {
    const h = setup(), removed = h.representations.get("repr-entry-one")!, retained = h.representations.get("repr-entry-two")!;
    let release!: () => void;
    h.state.syncQueue = new Promise<void>(finish => { release = finish; });
    const update = h.engine.syncStructures(changed(h.state.structures, identity, {}, false));
    expect(h.state.surfaceVisuals.isRetired(removed)).toBe(true);
    expect(h.state.surfaceHitIgnored(removed)).toBe(true);
    expect(h.state.surfaceHitIgnored(retained)).toBe(false);
    expect(h.state.surfaceHitIgnored({} as Representation.Any)).toBe(false);
    release(); await update;
    expect(h.state.surfaceHitIgnored(removed)).toBe(true);
  });

  it("rejects registered old pixels immediately when a zero-opacity preview waits behind rendering", async () => {
    const h = setup(), repr = h.representations.get("repr-entry-one")!, retained = h.representations.get("repr-entry-two")!;
    let release!: () => void;
    h.state.syncQueue = new Promise<void>(finish => { release = finish; });
    const appearance = h.state.structures[0].settings.surface_objects[0].appearance;
    const preview = h.engine.previewSurfaceAppearance(identity, { ...appearance, opacity: 0 });
    expect(h.state.surfaceVisuals.identityFor(repr)).toEqual(identity);
    expect(h.state.surfaceHitIgnored(repr)).toBe(true);
    expect(h.state.surfaceHitIgnored(retained)).toBe(false);
    release(); await preview;
    expect(h.state.surfaceHitIgnored(repr)).toBe(true);
    await h.engine.previewSurfaceAppearance(identity, null);
    expect(h.state.surfaceHitIgnored(repr)).toBe(false);
  });

  it("lowers picking alpha only for current installed meshes rather than registered opaque fallback lines", async () => {
    const h = setup([source()]), key = surfaceKey(identity.entryId, "entry", identity.surfaceId);
    const binding = h.state.surfaceBindings.get(key)!, repr = h.representations.get("repr-entry-one")!;
    h.state.surfaceMeshEntries.clear();
    // Object registration survives line fallback so the manager remains pickable.
    expect(h.state.surfaceHitIgnored(h.representations.get("repr-entry-two")!)).toBe(false);
    h.state.updateSurfacePickingThreshold();
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.5 } });
    h.state.surfaceMeshEntries.add(key);
    binding.unregister?.(); binding.unregister = undefined;
    h.state.updateSurfacePickingThreshold();
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.5 } });
    binding.unregister = h.state.surfaceVisuals.register(repr, identity);
    h.state.updateSurfacePickingThreshold();
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.45 } });
    await h.engine.previewSurfaceAppearance(identity, { ...binding.appearance!, opacity: 0 });
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.5 } });
    await h.engine.previewSurfaceAppearance(identity, null);
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.45 } });
    binding.controller.abort();
    h.state.updateSurfacePickingThreshold();
    expect(h.canvasProps).toHaveBeenLastCalledWith({ renderer: { pickingAlphaThreshold: 0.5 } });
    expect(h.fields).not.toHaveBeenCalled();
  });
});
