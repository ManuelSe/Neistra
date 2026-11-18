import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { completeLegacyLigands } from "../ligands/resolve";
import { molecularProject } from "./molecular-fixtures";

const conflict = () => new ApiError(409, "revision_conflict", "Revision changed");
function ports() {
  const project = molecularProject();
  return { current: vi.fn(() => true), resolve: vi.fn(() => Promise.resolve(project)),
    read: vi.fn(() => Promise.resolve({ ...project, revision: 20 })), accept: vi.fn() };
}

describe("legacy default revision reconciliation", () => {
  it("reads and retries the same default IDs once after a competing revision", async () => {
    const input = ports();
    input.resolve.mockRejectedValueOnce(conflict());
    await completeLegacyLigands(molecularProject(), ["entry-a"], input);
    expect(input.read).toHaveBeenCalledOnce();
    expect(input.accept).toHaveBeenCalledWith(expect.objectContaining({ revision: 20 }));
    expect(input.resolve).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: 20 }), ["entry-a"]);
  });
  it("does not retry source failures or repeated revision conflicts", async () => {
    const input = ports(), error = new ApiError(409, "artifact_integrity_error", "Invalid source");
    input.resolve.mockRejectedValue(error);
    await expect(completeLegacyLigands(molecularProject(), ["entry-a"], input)).rejects.toBe(error);
    expect(input.read).not.toHaveBeenCalled();
    input.resolve.mockReset().mockRejectedValue(conflict());
    await expect(completeLegacyLigands(molecularProject(), ["entry-a"], input)).rejects.toThrow("Revision changed");
    expect(input.resolve).toHaveBeenCalledTimes(2);
  });
  it("never dispatches a retry when a project switch or preview retires the context", async () => {
    const input = ports();
    input.resolve.mockRejectedValueOnce(conflict());
    input.read.mockImplementationOnce(() => {
      input.current.mockReturnValue(false);
      return Promise.resolve({ ...molecularProject(), revision: 20 });
    });
    await expect(completeLegacyLigands(molecularProject(), ["entry-a"], input)).rejects.toThrow("context changed");
    expect(input.resolve).toHaveBeenCalledOnce();
    expect(input.accept).not.toHaveBeenCalled();
  });
  it("rechecks after publishing a conflict reread before admitting the sole retry", async () => {
    const input = ports();
    input.resolve.mockRejectedValueOnce(conflict());
    input.accept.mockImplementationOnce(() => { input.current.mockReturnValue(false); });
    await expect(completeLegacyLigands(molecularProject(), ["entry-a"], input)).rejects.toThrow("context changed");
    expect(input.accept).toHaveBeenCalledOnce();
    expect(input.resolve).toHaveBeenCalledOnce();
  });

});
