import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { seedCoordinateProjections } from "../coordinates/cache";
import type { StructureProjection } from "../api/types";
import { molecularProject, proteinProjection } from "./molecular-fixtures";

for (const direction of ["Apply/Redo", "Undo after reload"]) it(`refreshes canonical provenance and active conformers for ${direction}`, async () => {
  const before = proteinProjection();
  before.structure.annotations = [];
  before.structure.conformers = [
    { id: 1, name: "Inactive", coordinates: before.structure.atoms.map(a => [...a.coordinates]) },
    { id: 7, name: "Active", coordinates: before.structure.atoms.map(a => [...a.coordinates]) },
  ];
  before.structure.active_conformer_id = 7;
  const after: StructureProjection = structuredClone(before);
  after.structure.atoms[0].coordinates = [10, 1, 0];
  after.structure.conformers[1].coordinates[0] = [10, 1, 0];
  after.structure.annotations = [{ kind: "neistra_quick_minimization", job_id: "job" }];
  const undo = direction === "Undo after reload";
  const source = undo ? after : before, canonical = undo ? before : after;
  const oldId = undo ? "after" : "before", newId = undo ? "before" : "after";
  const project = molecularProject(); project.entries[0].current_artifact_id = oldId;
  const next = structuredClone(project); next.revision++;
  next.entries[0].current_artifact_id = newId;
  next.structure_patches = [{ entry_id: "protein", artifact_id: newId, atom_ids: [1], coordinates: [canonical.structure.atoms[0].coordinates] }];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const original = structuredClone(source);
  client.setQueryData(["structure", project.id, "protein", oldId], source);
  seedCoordinateProjections(client, project, next);
  const key = ["structure", project.id, "protein", newId];
  const immediate = client.getQueryData<StructureProjection>(key)!;
  expect(immediate.structure.atoms[0].coordinates).toEqual(canonical.structure.atoms[0].coordinates);
  expect(immediate.structure.conformers[1].coordinates).toEqual(canonical.structure.conformers[1].coordinates);
  expect(immediate.structure.conformers[0]).toEqual(source.structure.conformers[0]);
  const observer = new QueryObserver(client, { queryKey: key, queryFn: () => Promise.resolve(canonical), staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await waitFor(() => expect(client.getQueryData(key)).toEqual(canonical));
  expect(client.getQueryData(["structure", project.id, "protein", oldId])).toEqual(original);
  unsubscribe(); client.clear();
});
