import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { captureProjectCommand, dispatchProjectCommand } from "../coordinates/projectCommand";
import { molecularProject } from "./molecular-fixtures";

it("checks the retained command's project after the active project changes", async () => {
  const dispatch = vi.fn(() => Promise.resolve(molecularProject()));
  const command = captureProjectCommand("P", dispatch);
  const activeProject = "Q";
  const guard = vi.fn((id: string) => { if (id !== activeProject) throw new Error("P is guarded"); });
  const client = new QueryClient();
  const mutation = client.getMutationCache().build(client, {
    mutationFn: () => dispatchProjectCommand(command, guard),
  });
  await expect(mutation.execute(undefined)).rejects.toThrow("P is guarded");
  expect(guard).toHaveBeenCalledWith("P");
  expect(dispatch).not.toHaveBeenCalled();
  client.clear();
});

it("rechecks source ownership after awaited mutation preflight", async () => {
  let guarded = false;
  const dispatch = vi.fn(() => Promise.resolve(molecularProject()));
  const command = captureProjectCommand("P", dispatch);
  const guard = vi.fn(() => { if (guarded) throw new Error("publication started"); });
  const client = new QueryClient();
  const mutation = client.getMutationCache().build(client, {
    onMutate: () => {
      guard();
      return Promise.resolve().then(() => { guarded = true; });
    },
    mutationFn: () => dispatchProjectCommand(command, guard),
  });
  await expect(mutation.execute(undefined)).rejects.toThrow("publication started");
  expect(guard).toHaveBeenCalledTimes(2);
  expect(dispatch).not.toHaveBeenCalled();
  client.clear();
});
