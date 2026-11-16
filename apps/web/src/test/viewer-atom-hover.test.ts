import { expect, it, vi } from "vitest";
import { OrderedSet } from "molstar/lib/mol-data/int";
import { EmptyLoci, type Loci } from "molstar/lib/mol-model/loci";
import { type Model, type Unit } from "molstar/lib/mol-model/structure";
import { MolstarEngine } from "../viewer/MolstarEngine";
import type { ViewerAtomHover, ViewerStructure } from "../viewer/MolecularViewer";
import { componentHierarchy, proteinStructure, viewerSettings } from "./molecular-fixtures";

vi.mock("../viewer/modelPreviewGeometry", () => ({ createModelPreviewRepresentation: () => ({ destroy: vi.fn() }), modelPreviewColor: () => 0 }));
vi.mock("../viewer/interactionGeometry", () => ({ createInteractionRepresentation: () => ({ destroy: vi.fn() }) }));

interface Probe {
  structures: ViewerStructure[];
  models: Map<Model, { entryId: string; atomIds: number[] }>;
  generation: number;
  coordinatePreviews: Map<string, unknown>;
  interactionSourceError: string | undefined;
  updateAtomHover(loci: Loci): void;
  clearHover(): void;
}

function setup() {
  const structure = proteinStructure();
  const source: ViewerStructure = { entryId: "entry", artifactId: "artifact-1", label: "Entry",
    normalized: structure, atomIds: structure.atoms.map(atom => atom.id), hierarchy: componentHierarchy(structure),
    projection: { format: "mmcif", data: "" }, settings: viewerSettings() };
  const model = { atomicHierarchy: { atomSourceIndex: { value: (index: number) => index } } } as unknown as Model;
  const unit = { kind: 0, model, elements: source.atomIds.map((_, index) => index) } as unknown as Unit.Atomic;
  const engine = new MolstarEngine(), probe = engine as unknown as Probe;
  probe.structures = [source]; probe.models.set(model, { entryId: source.entryId, atomIds: source.atomIds });
  const loci = (indices: number[]) => ({ kind: "element-loci", structure: {}, elements: [{ unit, indices: OrderedSet.ofSortedArray(indices) }] }) as unknown as Loci;
  const listener = vi.fn<(value: ViewerAtomHover | null) => void>();
  const release = engine.subscribeAtomHover(listener);
  return { engine, probe, source, listener, release, loci };
}

it("deduplicates 1000 same-atom samples while different atoms in one source remain distinct", () => {
  const h = setup();
  for (let i = 0; i < 1000; i++) h.probe.updateAtomHover(h.loci([0]));
  expect(h.listener).toHaveBeenCalledTimes(2); // initial empty, then actual atom
  expect(h.listener).toHaveBeenLastCalledWith(expect.objectContaining({ reference: { structure_id: "entry", atom_id: h.source.atomIds[0] } }));
  h.probe.updateAtomHover(h.loci([1]));
  expect(h.listener).toHaveBeenCalledTimes(3);
  expect(h.listener).toHaveBeenLastCalledWith(expect.objectContaining({ reference: { structure_id: "entry", atom_id: h.source.atomIds[1] } }));
  h.release(); h.probe.updateAtomHover(h.loci([0]));
  expect(h.listener).toHaveBeenCalledTimes(3);
  h.engine.dispose();
});

it("retirements and preview/source failures cannot leave an atom current or invent one from grouped loci", () => {
  const h = setup();
  for (const invalid of [h.loci([0, 1]), EmptyLoci]) {
    h.probe.updateAtomHover(h.loci([0])); h.probe.updateAtomHover(invalid);
    expect(h.listener).toHaveBeenLastCalledWith(null);
  }
  h.probe.updateAtomHover(h.loci([0]));
  h.probe.coordinatePreviews.set("entry", {}); h.probe.updateAtomHover(h.loci([0]));
  expect(h.listener).toHaveBeenLastCalledWith(null);
  h.probe.coordinatePreviews.clear(); h.probe.updateAtomHover(h.loci([0]));
  h.probe.interactionSourceError = "retired native source"; h.probe.updateAtomHover(h.loci([0]));
  expect(h.listener).toHaveBeenLastCalledWith(null);
  h.probe.interactionSourceError = undefined; h.probe.updateAtomHover(h.loci([0]));
  h.engine.dispose(); expect(h.listener).toHaveBeenLastCalledWith(null);
  const late = vi.fn(); h.engine.subscribeAtomHover(late); expect(late).toHaveBeenCalledExactlyOnceWith(null);
});

it("binds fresh feedback to exact immutable source and native generation after source replacement", () => {
  const h = setup(); h.probe.updateAtomHover(h.loci([0]));
  const old = h.listener.mock.lastCall![0]!;
  h.probe.clearHover(); h.probe.generation += 1;
  const source = { ...h.source, artifactId: "artifact-2", normalized: structuredClone(h.source.normalized) };
  h.probe.structures = [source]; h.probe.updateAtomHover(h.loci([0]));
  const current = h.listener.mock.lastCall![0]!;
  expect(current.source).toBe(source); expect(current.source.normalized).not.toBe(old.source.normalized);
  expect(current.sceneGeneration).toBe(old.sceneGeneration + 1);
  expect(old.source.artifactId).toBe("artifact-1");
  h.engine.dispose();
});
