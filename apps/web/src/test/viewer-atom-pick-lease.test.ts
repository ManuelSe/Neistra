import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { EmptyLoci, type Loci } from "molstar/lib/mol-model/loci";
import type { Model, Unit, StructureElement } from "molstar/lib/mol-model/structure";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import type { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { PluginBehaviors } from "molstar/lib/mol-plugin/behavior";
import type { PluginSpec } from "molstar/lib/mol-plugin/spec";
import type { InteractivityManager } from "molstar/lib/mol-plugin-state/manager/interactivity";
import { Binding } from "molstar/lib/mol-util/binding";
import { ButtonsType, ModifiersKeys } from "molstar/lib/mol-util/input/input-observer";
import { MolstarEngine } from "../viewer/MolstarEngine";
import { createMolstarViewer } from "../viewer/MolstarViewer";
import type { AtomPickLeaseRequest, ViewerAtomPick, ViewerStructure } from "../viewer/MolecularViewer";
import type { AtomReference } from "../api/types";
import { captureSurfaceSync, type SurfaceSyncSnapshot } from "../viewer/surfaceReconciliation";
import { type DoubleClickSequence, doubleClickExpansion } from "../selection/gestures";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";

vi.mock("../viewer/modelPreviewGeometry", () => ({ createModelPreviewRepresentation: () => ({
  destroy: vi.fn(), createOrUpdate: () => ({ run: async () => {} }),
}), modelPreviewColor: () => 0 }));
vi.mock("../viewer/interactionGeometry", () => ({ createInteractionRepresentation: () => ({ destroy: vi.fn() }) }));

interface Probe {
  plugin: PluginUIContext | undefined;
  structures: ViewerStructure[];
  models: Map<Model, { entryId: string; atomIds: number[] }>;
  renderedAtomReferences: Map<string, AtomReference[]>;
  pendingSelection: AtomReference[];
  generation: number;
  boundGeneration: number;
  interactionSourceGeneration: number;
  interactionSourceOperation: number;
  interactionSourceCompleted: number;
  interactionSourceError: string | undefined;
  rebuilding: boolean;
  pickingGranularity: string;
  effectivePickingGranularity: string;
  modelPreview: unknown;
  movementInteraction: string;
  coordinatePreviews: Map<string, unknown>;
  interactionPreviewEntries: Set<string>;
  surfaceSyncSnapshot: SurfaceSyncSnapshot;
  doubleClicks: DoubleClickSequence;
  handleClick(event: InteractivityManager.ClickEvent): void;
  handleDoubleClick(event: MouseEvent): void;
  atomPickBehaviors(behaviors: PluginSpec.Behavior[]): PluginSpec.Behavior[];
  retireMeasurementAcquisition(reason: string): void;
  lociFor: (atoms: AtomReference[]) => StructureElement.Loci | null;
}

interface LabelResult {
  selection: { ref: string };
  representation: { obj: { data: { repr: { setState: ReturnType<typeof vi.fn> } } } };
}

const engines: MolstarEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function request() {
  return { owner: {}, isCurrent: vi.fn(() => true), onPick: vi.fn<(event: ViewerAtomPick) => void>(), onRetire: vi.fn<(reason: string) => void>() };
}

function setup() {
  const normalized = proteinStructure();
  const source: ViewerStructure = { entryId: "entry", artifactId: "artifact-1", label: "Entry",
    normalized, atomIds: normalized.atoms.map(atom => atom.id), hierarchy: componentHierarchy(normalized),
    projection: { format: "mmcif", data: "" }, settings: viewerSettings() };
  const model = { atomicHierarchy: { atomSourceIndex: { value: (index: number) => index } } } as unknown as Model;
  const unit = { kind: 0, model, elements: source.atomIds.map((_, index) => index) } as unknown as Unit.Atomic;
  const engine = new MolstarEngine(); engines.push(engine);
  const probe = engine as unknown as Probe;
  const cells = new Map<string, object>();
  const deleted: string[] = [];
  const addLabel = vi.fn<(loci: StructureElement.Loci, options: { visualParams: { customText: string } }) => Promise<LabelResult>>();
  let serial = 0;
  const label = (): LabelResult => {
    const ref = `draft-label-${++serial}`;
    cells.set(ref, {});
    return { selection: { ref }, representation: { obj: { data: { repr: { setState: vi.fn() } } } } };
  };
  addLabel.mockImplementation(() => Promise.resolve(label()));
  const plugin = { isBusy: false, canvas3d: { remove: vi.fn(), add: vi.fn(), requestDraw: vi.fn(), setProps: vi.fn(), setAttribs: vi.fn(),
    attribs: { trackball: { bindings: {} } }, props: { trackball: {} } },
    managers: { interactivity: { lociHighlights: { clearHighlights: vi.fn() } }, structure: { measurement: { addLabel } } },
    state: { data: { cells, build: () => { const update = { delete: (ref: string) => { deleted.push(ref); cells.delete(ref); return update; }, commit: async () => {} }; return update; } } },
  };
  probe.plugin = plugin as unknown as PluginUIContext;
  probe.structures = [source]; probe.models.set(model, { entryId: source.entryId, atomIds: source.atomIds });
  probe.generation = probe.boundGeneration = probe.interactionSourceGeneration = 3;
  probe.interactionSourceOperation = probe.interactionSourceCompleted = 7;
  probe.pendingSelection = [{ structure_id: "entry", atom_id: 2 }];
  probe.renderedAtomReferences.set("entry", source.atomIds.map(atom_id => ({ structure_id: "entry", atom_id })));
  const loci = (indices = [0]): StructureElement.Loci => ({ kind: "element-loci", structure: {}, elements: [{ unit, indices: OrderedSet.ofSortedArray(indices) }] }) as unknown as StructureElement.Loci;
  const click = (current: Loci = loci(), button: ButtonsType.Flag = ButtonsType.Flag.Primary) => probe.handleClick({ current: { loci: current },
    button, buttons: ButtonsType.Flag.None, modifiers: ModifiersKeys.create() });
  const selection = vi.fn(); engine.subscribeSelection(selection);
  return { engine, probe, plugin, source, loci, click, selection, model, addLabel, label, deleted };
}

describe("current native atom-pick lease", () => {
  it("accepts an exact current singleton and consumes empty/group/bond events without altering selection", () => {
    const h = setup(), owner = request();
    h.engine.setPickingGranularity("chain");
    const before = h.probe.pendingSelection;
    h.engine.acquireAtomPickLease(owner);
    h.click();
    expect(owner.onPick).toHaveBeenCalledExactlyOnceWith({ reference: { structure_id: "entry", atom_id: 1 },
      source: h.source, sceneGeneration: 3, sourceOperation: 7 });
    for (const loci of [EmptyLoci, h.loci([0, 1]), { kind: "bond-loci", bonds: [] } as unknown as Loci]) h.click(loci);
    expect(owner.onPick).toHaveBeenCalledTimes(1);
    expect(h.selection).not.toHaveBeenCalled();
    expect(h.probe.pendingSelection).toBe(before);
    expect(h.probe.pickingGranularity).toBe("chain");
    expect(h.probe.effectivePickingGranularity).toBe("atom");
  });

  it.each(["busy", "rebuilding", "unbound", "source-generation", "source-pending", "source-error", "model-preview", "coordinate-preview", "interaction-preview", "movement", "hidden", "missing-artifact"])("consumes %s input without ordinary fallthrough", state => {
    const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
    if (state === "busy") h.plugin.isBusy = true;
    if (state === "rebuilding") h.probe.rebuilding = true;
    if (state === "unbound") h.probe.boundGeneration--;
    if (state === "source-generation") h.probe.interactionSourceGeneration--;
    if (state === "source-pending") h.probe.interactionSourceCompleted--;
    if (state === "source-error") h.probe.interactionSourceError = "source failed";
    if (state === "model-preview") h.probe.modelPreview = {};
    if (state === "coordinate-preview") h.probe.coordinatePreviews.set("entry", {});
    if (state === "interaction-preview") h.probe.interactionPreviewEntries.add("entry");
    if (state === "movement") h.probe.movementInteraction = "camera";
    if (state === "hidden") h.probe.renderedAtomReferences.clear();
    if (state === "missing-artifact") h.probe.structures = [{ ...h.source, artifactId: undefined }];
    h.click(); h.click(EmptyLoci);
    expect(owner.onPick).not.toHaveBeenCalled(); expect(h.selection).not.toHaveBeenCalled();
    expect(h.probe.pendingSelection).toEqual([{ structure_id: "entry", atom_id: 2 }]);
    h.probe.movementInteraction = "inactive";
  });

  it("rejects retired model mappings and foreign source membership", () => {
    const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
    h.probe.models.delete(h.model); h.click();
    h.probe.models.set(h.model, { entryId: "other-entry", atomIds: h.source.atomIds }); h.click();
    h.probe.models.set(h.model, { entryId: "entry", atomIds: [999] }); h.click();
    expect(owner.onPick).not.toHaveBeenCalled(); expect(h.selection).not.toHaveBeenCalled();
  });

  it("checks the acquired source operation even when the scene generation stays equal", () => {
    const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
    h.probe.interactionSourceOperation++; h.probe.interactionSourceCompleted++;
    h.click();
    expect(owner.onPick).not.toHaveBeenCalled(); expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("stale");
    expect(h.selection).not.toHaveBeenCalled();
  });

  it("keeps old release closures inert and retires each owner once", () => {
    const h = setup(), first = request(), second = request();
    const oldRelease = h.engine.acquireAtomPickLease(first);
    const release = h.engine.acquireAtomPickLease(second);
    oldRelease(); oldRelease(); h.click();
    expect(first.onRetire).toHaveBeenCalledExactlyOnceWith("replaced");
    expect(second.onPick).toHaveBeenCalledTimes(1);
    release(); release(); h.click(EmptyLoci);
    expect(second.onRetire).not.toHaveBeenCalled();
    expect(h.selection).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ atoms: [], mode: "replace" }));
  });

  it("an obsolete acquisition attempt cannot replace a valid native owner", () => {
    const h = setup(), current = request(), obsolete = request();
    h.engine.acquireAtomPickLease(current); obsolete.isCurrent.mockReturnValue(false);
    const releaseObsolete = h.engine.acquireAtomPickLease(obsolete);
    releaseObsolete(); h.click();
    expect(current.onPick).toHaveBeenCalledTimes(1); expect(current.onRetire).not.toHaveBeenCalled();
    expect(obsolete.onRetire).not.toHaveBeenCalled(); expect(obsolete.onPick).not.toHaveBeenCalled();
  });

  it("consumes stale application ownership before ordinary empty clearing", () => {
    const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
    owner.isCurrent.mockReturnValue(false); h.click(EmptyLoci);
    expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("stale");
    expect(h.selection).not.toHaveBeenCalled(); expect(h.probe.pendingSelection).not.toEqual([]);
  });

  it("guards pinned native selection bindings at event time while keeping the behavior/provider", () => {
    const h = setup(), defaults = DefaultPluginUISpec().behaviors;
    const behaviors = h.probe.atomPickBehaviors(defaults);
    const selection = behaviors.find(b => b.transformer === PluginBehaviors.Representation.SelectLoci)!;
    const bindings = (selection.defaultParams as { bindings: { clickToggle: Binding; clickDeselectAllOnEmpty: Binding } }).bindings;
    expect(Binding.match(bindings.clickToggle, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(true);
    const release = h.engine.acquireAtomPickLease(request());
    expect(Binding.match(bindings.clickToggle, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(false);
    expect(Binding.match(bindings.clickDeselectAllOnEmpty, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(false);
    for (const behavior of defaults) if (behavior.transformer !== PluginBehaviors.Representation.SelectLoci) expect(behaviors).toContain(behavior);
    release();
    expect(Binding.match(bindings.clickToggle, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(true);
  });

  it("keeps a rejected primary dispatch consumed for later native subscribers", async () => {
    const h = setup(), owner = request();
    const behavior = h.probe.atomPickBehaviors(DefaultPluginUISpec().behaviors)
      .find(b => b.transformer === PluginBehaviors.Representation.SelectLoci)!;
    const bindings = (behavior.defaultParams as { bindings: { clickDeselectAllOnEmpty: Binding } }).bindings;
    h.engine.acquireAtomPickLease(owner); owner.isCurrent.mockReturnValue(false);
    h.click(EmptyLoci);
    expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("stale");
    expect(Binding.match(bindings.clickDeselectAllOnEmpty, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(false);
    await Promise.resolve();
    expect(Binding.match(bindings.clickDeselectAllOnEmpty, ButtonsType.Flag.Primary, ModifiersKeys.create())).toBe(true);
    expect(h.selection).not.toHaveBeenCalled();
  });

  it("clears double-click history and suppresses expansion while retaining camera mode", () => {
    const h = setup();
    const expansion = doubleClickExpansion([{ structure_id: "entry", atom_id: 1 }], [h.source]);
    h.probe.doubleClicks.record(expansion); h.probe.doubleClicks.record(expansion);
    const release = h.engine.acquireAtomPickLease(request());
    expect(h.probe.doubleClicks.take()).toBeNull();
    h.click(); h.click();
    const canvas = document.createElement("canvas");
    canvas.addEventListener("dblclick", event => h.probe.handleDoubleClick(event));
    canvas.dispatchEvent(new MouseEvent("dblclick", { button: 0 }));
    expect(h.selection).not.toHaveBeenCalled();
    expect(h.plugin.canvas3d.setAttribs).not.toHaveBeenCalled();
    expect(h.plugin.canvas3d.setProps).not.toHaveBeenCalled();
    release(); expect(h.probe.doubleClicks.take()).toBeNull();
    expect(expansion).not.toBeNull();
    h.probe.doubleClicks.record(expansion); h.probe.doubleClicks.record(expansion);
    canvas.dispatchEvent(new MouseEvent("dblclick", { button: 0 }));
    expect(h.selection).toHaveBeenCalledTimes(1);
    expect(h.selection).toHaveBeenLastCalledWith(expect.objectContaining({ pick: { atoms: expansion!.pick, kind: "double", shift: false } }));
  });

  it("keeps secondary navigation independent and accepts primary trigger acquisition", () => {
    const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
    h.click(h.loci(), ButtonsType.Flag.Secondary);
    expect(owner.onPick).not.toHaveBeenCalled(); expect(h.selection).not.toHaveBeenCalled();
    h.click(h.loci(), ButtonsType.Flag.Trigger);
    expect(owner.onPick).toHaveBeenCalledTimes(1);
    expect(h.plugin.canvas3d.setAttribs).not.toHaveBeenCalled();
  });

  it("preserves a lease through semantic no-op sync/model/movement initialization", async () => {
    const h = setup(), owner = request();
    h.probe.surfaceSyncSnapshot = captureSurfaceSync([h.source], null);
    h.engine.acquireAtomPickLease(owner);
    await h.engine.syncStructures([{ ...h.source }]);
    await h.engine.setModelPreview(null);
    h.engine.setMovementMode("inactive"); h.engine.setPickingGranularity("atom");
    h.click(); expect(owner.onPick).toHaveBeenCalledTimes(1); expect(owner.onRetire).not.toHaveBeenCalled();
  });

  it("artifact-only replaceStructure still compares against the prior installed source", async () => {
    const h = setup(), owner = request();
    h.probe.surfaceSyncSnapshot = captureSurfaceSync([h.source], null);
    h.engine.acquireAtomPickLease(owner);
    const replacement = { ...h.source, artifactId: "new-artifact-same-coordinates" };
    await h.engine.replaceStructure(replacement);
    expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("source");
    expect(h.probe.structures).toEqual([replacement]);
    expect(h.source.artifactId).toBe("artifact-1");
  });

  it("retires synchronously before actual source/preview/movement/disposal operations", async () => {
    for (const operation of ["source", "coordinate", "preview", "movement", "dispose"]) {
      const h = setup(), owner = request(); h.engine.acquireAtomPickLease(owner);
      let pending: Promise<void> | undefined;
      if (operation === "source") {
        h.probe.surfaceSyncSnapshot = captureSurfaceSync([h.source], null);
        pending = h.engine.syncStructures([{ ...h.source, artifactId: "replacement" }]);
      }
      if (operation === "coordinate") pending = h.engine.applyCoordinatePatch({ entry_id: "entry", artifact_id: "next", atom_ids: [], coordinates: [] }, "commit");
      if (operation === "preview") pending = h.engine.clearCoordinatePreview("entry");
      if (operation === "movement") h.engine.setMovementMode("camera");
      if (operation === "dispose") h.engine.dispose();
      expect(owner.onRetire).toHaveBeenCalledTimes(1);
      h.probe.plugin = undefined;
      await pending;
    }
  });
});

describe("owned numbered target labels", () => {
  it.each([0, 1.5, 5])("refuses invalid numbered slot %s before label allocation", async index => {
    const h = setup();
    await expect(h.engine.setMeasurementTargets([{ reference: { structure_id: "entry", atom_id: 1 }, index, source: h.source }])).rejects.toThrow("numbered slots");
    expect(h.addLabel).not.toHaveBeenCalled();
  });
  it("installs only current drawable targets with independent numbered labels", async () => {
    const h = setup(); h.probe.lociFor = vi.fn(() => h.loci());
    const targets = [{ reference: { structure_id: "entry", atom_id: 1 }, index: 3, source: h.source }];
    await h.engine.setMeasurementTargets(targets);
    expect(h.addLabel).toHaveBeenCalledExactlyOnceWith(h.loci(), { visualParams: { customText: "3" } });
    const invocation = h.addLabel.mock.results[0];
    if (invocation.type !== "return") throw new Error("The label call must return its completion");
    const result = await invocation.value;
    expect(result.representation.obj.data.repr.setState).toHaveBeenCalledWith({ pickable: false });
    await h.engine.setMeasurementTargets(targets); expect(h.addLabel).toHaveBeenCalledTimes(1);
    await h.engine.setMeasurementTargets([{ ...targets[0], source: { ...h.source } }]);
    expect(h.addLabel).toHaveBeenCalledTimes(1);
    const empty = h.engine.setMeasurementTargets([]);
    expect(result.representation.obj.data.repr.setState).toHaveBeenCalledWith({ visible: false, pickable: false });
    await empty; expect(h.deleted).toContain(result.selection.ref);
  });

  it("omits unqualified source/hidden targets without revealing or loading them", async () => {
    const h = setup(); h.probe.lociFor = vi.fn(() => h.loci());
    for (const source of [{ ...h.source, artifactId: "old" }, { ...h.source, normalized: structuredClone(h.source.normalized) }, { ...h.source, settings: structuredClone(h.source.settings) }]) {
      await h.engine.setMeasurementTargets([{ reference: { structure_id: "entry", atom_id: 1 }, index: 1, source }]);
    }
    h.probe.renderedAtomReferences.clear();
    await h.engine.setMeasurementTargets([{ reference: { structure_id: "entry", atom_id: 1 }, index: 1, source: h.source }]);
    expect(h.addLabel).not.toHaveBeenCalled(); expect(h.probe.lociFor).not.toHaveBeenCalled();
  });

  it("a held obsolete add cannot adopt or leave its native representation after retirement", async () => {
    const h = setup(); h.probe.lociFor = vi.fn(() => h.loci());
    const pending = deferred<LabelResult>(); h.addLabel.mockReturnValueOnce(pending.promise);
    const job = h.engine.setMeasurementTargets([{ reference: { structure_id: "entry", atom_id: 1 }, index: 1, source: h.source }]);
    await vi.waitFor(() => expect(h.addLabel).toHaveBeenCalledTimes(1));
    h.probe.retireMeasurementAcquisition("source");
    const result = h.label(); pending.resolve(result);
    await job;
    expect(result.representation.obj.data.repr.setState).toHaveBeenCalledWith({ visible: false, pickable: false });
    expect(h.deleted).toContain(result.selection.ref);
  });
});

describe("lazy atom-pick ownership", () => {
  it("a late obsolete request cannot release or retire the current lazy binding", async () => {
    vi.spyOn(MolstarEngine.prototype, "mount").mockResolvedValue();
    const nativeRelease = vi.fn();
    const acquire = vi.spyOn(MolstarEngine.prototype, "acquireAtomPickLease").mockReturnValue(nativeRelease);
    const viewer = createMolstarViewer(), current = request(), obsolete = request();
    await viewer.mount(document.createElement("div"));
    viewer.acquireAtomPickLease!(current); obsolete.isCurrent.mockReturnValue(false);
    const releaseObsolete = viewer.acquireAtomPickLease!(obsolete); releaseObsolete();
    expect(acquire).toHaveBeenCalledTimes(1); expect(nativeRelease).not.toHaveBeenCalled();
    expect(current.onRetire).not.toHaveBeenCalled(); expect(obsolete.onRetire).not.toHaveBeenCalled();
    viewer.dispose();
  });
  it("binds a pending current request only after mount, with inert old callbacks/releases", async () => {
    const mounted = deferred<void>(), requests: AtomPickLeaseRequest[] = [];
    const releases = [vi.fn(), vi.fn()];
    const mount = vi.spyOn(MolstarEngine.prototype, "mount").mockImplementation(() => mounted.promise);
    vi.spyOn(MolstarEngine.prototype, "acquireAtomPickLease").mockImplementation(request => { requests.push(request); return releases[requests.length - 1]; });
    const viewer = createMolstarViewer(), first = request(), second = request();
    const releaseOld = viewer.acquireAtomPickLease!(first);
    const mounting = viewer.mount(document.createElement("div"));
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    expect(requests).toHaveLength(0);
    mounted.resolve(); await mounting;
    expect(requests).toHaveLength(1);
    const release = viewer.acquireAtomPickLease!(second);
    releaseOld(); requests[0].onRetire("late-old-retirement");
    expect(releases[1]).not.toHaveBeenCalled();
    expect(second.onRetire).not.toHaveBeenCalled();
    expect(requests[1].isCurrent()).toBe(true);
    release(); release(); expect(releases[1]).toHaveBeenCalledTimes(1);
    viewer.dispose();
  });

  it("does not bind a request retired while its lazy mount awaited", async () => {
    const mounted = deferred<void>();
    const mount = vi.spyOn(MolstarEngine.prototype, "mount").mockImplementation(() => mounted.promise);
    const bind = vi.spyOn(MolstarEngine.prototype, "acquireAtomPickLease");
    const viewer = createMolstarViewer(), owner = request(); viewer.acquireAtomPickLease!(owner);
    const job = viewer.mount(document.createElement("div"));
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    owner.isCurrent.mockReturnValue(false); mounted.resolve(); await job;
    expect(bind).not.toHaveBeenCalled(); expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("stale");
    viewer.dispose();
  });

  it("disposal retires a pending owner once and makes a later mount completion inert", async () => {
    const mounted = deferred<void>();
    const mount = vi.spyOn(MolstarEngine.prototype, "mount").mockImplementation(() => mounted.promise);
    const bind = vi.spyOn(MolstarEngine.prototype, "acquireAtomPickLease");
    const viewer = createMolstarViewer(), owner = request(); const release = viewer.acquireAtomPickLease!(owner);
    const job = viewer.mount(document.createElement("div"));
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    viewer.dispose(); release(); mounted.resolve(); await job;
    expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("disposed"); expect(bind).not.toHaveBeenCalled();
  });

  it("reports an unsupported inner adapter instead of claiming acquisition works", async () => {
    const original = Object.getOwnPropertyDescriptor(MolstarEngine.prototype, "acquireAtomPickLease")!;
    vi.spyOn(MolstarEngine.prototype, "mount").mockResolvedValue();
    Object.defineProperty(MolstarEngine.prototype, "acquireAtomPickLease", { ...original, value: undefined });
    const viewer = createMolstarViewer(), owner = request();
    try {
      await viewer.mount(document.createElement("div"));
      const release = viewer.acquireAtomPickLease!(owner);
      expect(owner.onRetire).toHaveBeenCalledExactlyOnceWith("unsupported");
      expect(owner.onPick).not.toHaveBeenCalled(); release();
    } finally {
      viewer.dispose(); Object.defineProperty(MolstarEngine.prototype, "acquireAtomPickLease", original);
    }
  });

  it("a released pending owner cannot install its old numbered targets after mount", async () => {
    const h = setup();
    vi.spyOn(MolstarEngine.prototype, "mount").mockResolvedValue();
    const labels = vi.spyOn(MolstarEngine.prototype, "setMeasurementTargets").mockResolvedValue();
    const viewer = createMolstarViewer(), owner = request();
    const release = viewer.acquireAtomPickLease!(owner);
    await viewer.setMeasurementTargets!([{ reference: { structure_id: "entry", atom_id: 1 }, index: 1, source: h.source }]);
    release(); await viewer.mount(document.createElement("div"));
    expect(labels).not.toHaveBeenCalled();
    viewer.dispose();
  });
});
