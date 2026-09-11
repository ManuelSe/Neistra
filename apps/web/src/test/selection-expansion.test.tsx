import type { Selection } from "../api/types";
import type { ExpandSelection } from "../selection/expansion";
import type { SpatialRequest, SpatialResponse } from "../selection/spatial";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionExpansion } from "../components/SelectionExpansion";
import { expandByDistance } from "../selection/expansion";
import { canonicalSelection } from "../selection/selection";
import { computeSpatialSelection } from "../selection/spatial";
import { spatialSelectionInWorker } from "../selection/spatialClient";
import { proteinStructure } from "./molecular-fixtures";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage?: (event: MessageEvent<SpatialResponse>) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn<(request: SpatialRequest) => void>();
  constructor() { WorkerStub.instances.push(this); }
}
const seed = canonicalSelection([{ structure_id: "p", atom_id: 1 }]);

describe("distance expansion", () => {
  it("keeps exact-boundary orphan matches and complete residues across entries", () => {
    const result = computeSpatialSelection({ id: 1, seed: seed.atoms, distance: 4,
      granularity: "residue", preserveOrphans: true, atoms: [
        { structureId: "p", atomId: 1, residueId: null, coordinates: [0, 0, 0] },
        { structureId: "other", atomId: 1, residueId: 5, coordinates: [4, 0, 0] },
        { structureId: "other", atomId: 2, residueId: 5, coordinates: [8, 0, 0] },
        { structureId: "other", atomId: 3, residueId: null, coordinates: [0, 4, 0] },
        { structureId: "other", atomId: 4, residueId: null, coordinates: [0, 4.01, 0] },
      ] });
    expect(result.atoms).toEqual([...seed.atoms,
      ...[1, 2, 3].map((atom_id) => ({ structure_id: "other", atom_id }))]);
  });

  it("terminates a cancelled worker and ignores its late result", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    const controller = new AbortController();
    const promise = spatialSelectionInWorker([], seed.atoms, 4, "atom", { signal: controller.signal });
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(WorkerStub.instances.at(-1)!.terminate).toHaveBeenCalledOnce();
  });

  it("rejects invalid cutoffs and stale loads without touching selection", async () => {
    const apply = vi.fn<(selection: Selection) => void>();
    const load = vi.fn().mockResolvedValue(new Map([["p", proteinStructure()]]));
    for (const distance of [0, -1, Infinity, NaN]) {
      await expect(expandByDistance({ selection: seed, distance, granularity: "atom",
        signal: new AbortController().signal, load, isCurrent: () => true, apply,
      })).rejects.toThrow("positive finite");
    }
    expect(load).not.toHaveBeenCalled();
    let current = true;
    await expect(expandByDistance({ selection: seed, distance: 4, granularity: "atom",
      signal: new AbortController().signal,
      load: () => { current = false; return Promise.resolve(new Map()); },
      isCurrent: () => current, apply,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("checks context after worker completion and canonicalizes seed-preserving results", async () => {
    vi.stubGlobal("Worker", WorkerStub);
    for (const stale of [false, true]) {
      WorkerStub.instances = [];
      let current = true;
      const apply = vi.fn<(selection: Selection) => void>();
      const operation = expandByDistance({ selection: seed, distance: 4, granularity: "residue",
        signal: new AbortController().signal, load: () => Promise.resolve(new Map([["p", proteinStructure()]])),
        isCurrent: () => current, apply });
      await waitFor(() => expect(WorkerStub.instances.at(-1)?.postMessage.mock.calls[0]?.[0]?.preserveOrphans).toBe(true));
      const worker = WorkerStub.instances.at(-1)!;
      const request = worker.postMessage.mock.calls[0][0];
      expect(request.preserveOrphans).toBe(true);
      current = !stale;
      worker.onmessage!(new MessageEvent("message", { data: { id: request.id, atoms: [
        { structure_id: "p", atom_id: 2 }, { structure_id: "p", atom_id: 2 },
      ] } }));
      if (stale) {
        await expect(operation).rejects.toMatchObject({ name: "AbortError" });
        expect(apply).not.toHaveBeenCalled();
      } else {
        await expect(operation).resolves.toBe(2);
        expect(apply.mock.calls[0][0].atoms).toEqual([
          ...seed.atoms, { structure_id: "p", atom_id: 2 },
        ]);
      }
    }
  });

  it("offers defaults, custom residue expansion, cancel, and visible failures", async () => {
    const user = userEvent.setup();
    let finish: (value: number) => void = () => {};
    const expand = vi.fn<ExpandSelection>(() => new Promise<number>((resolve) => { finish = resolve; }));
    const { rerender, unmount } = render(
      <SelectionExpansion expand={expand} contextKey="one" disabled={false} />,
    );
    expect(screen.getByLabelText("Distance (Å)")).toHaveValue(4);
    expect(screen.getByLabelText("Expand to")).toHaveValue("atom");
    await user.clear(screen.getByLabelText("Distance (Å)"));
    await user.type(screen.getByLabelText("Distance (Å)"), "5.5");
    await user.selectOptions(screen.getByLabelText("Expand to"), "residue");
    await user.click(screen.getByRole("button", { name: "Expand selection" }));
    expect(expand.mock.calls[0]).toEqual([5.5, "residue", expect.any(AbortSignal)]);
    await user.click(screen.getByRole("button", { name: "Cancel expansion" }));
    await act(async () => { finish(123); await Promise.resolve(); });
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
    await user.click(screen.getByRole("button", { name: "Expand selection" }));
    const signal = (expand.mock.calls.at(-1)! as unknown as [number, string, AbortSignal])[2];
    rerender(<SelectionExpansion expand={expand} contextKey="new-artifact" disabled={false} />);
    expect(signal.aborted).toBe(true);
    unmount();
    render(<SelectionExpansion expand={() => Promise.reject(new Error("Load failed"))}
      contextKey="error" disabled={false} />);
    await user.click(screen.getByRole("button", { name: "Expand selection" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Load failed"));
  });
});
