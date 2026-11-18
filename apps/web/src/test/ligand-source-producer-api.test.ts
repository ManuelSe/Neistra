import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { ArtifactSourceIdentity } from "../api/types";
import { ligandApi } from "../ligands/api";
import { ligandOperationSourceFailure, type VerifiedArtifactSource } from "../ligands/inventoryQualification";

afterEach(() => { vi.unstubAllGlobals(); });
const source: VerifiedArtifactSource = { projectId: "project", entryId: "entry", currentArtifactId: "current", originalArtifactId: "original" };
const identity: ArtifactSourceIdentity = { project_id: "project", entry_id: "entry", current_artifact_id: "current", original_artifact_id: "original" };
async function decoded(extra: Record<string, unknown>, code = "artifact_integrity_error", status = 409): Promise<ApiError> {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code, message: "Controlled molecular source failure", ...extra } }), { status })));
  const error: unknown = await ligandApi.designate("project", "entry", { expected_revision: 1, expected_artifact_id: "current", candidate_key: "candidate" }).catch((value: unknown) => value);
  if (!(error instanceof ApiError)) throw new Error("Expected typed API failure");
  return error;
}

describe("source producer API provenance and captured operations", () => {
  it.each([undefined, "current", "original"])("accepts compatible captured Use provenance %s", async role => {
    const error = await decoded(role ? { source_verification: role } : {});
    expect(error.sourceIdentity.kind).toBe("absent"); expect(error.sourceVerificationInvalid).toBe(false);
    expect(ligandOperationSourceFailure(error, [source], "use")).toEqual({ source, reason: "artifact_unavailable" });
    expect(ligandOperationSourceFailure(error, [source], "clear")).toBeNull();
    expect(ligandOperationSourceFailure(error, [source], "resolve")).toBeNull();
  });

  it.each(["svg", "CURRENT", null, {}, [], 1])("does not turn supplied invalid role %j into legacy Use authority", async role => {
    const error = await decoded({ source_verification: role });
    expect(error.sourceVerificationInvalid).toBe(true); expect(error.sourceIdentity.kind).toBe("absent");
    expect(ligandOperationSourceFailure(error, [source], "use")).toBeNull();
  });

  it.each([null, [], {}, { ...identity, project_id: 1 }, { ...identity, entry_id: null },
    { project_id: "project", entry_id: "entry", current_artifact_id: "current" }, { ...identity, original_artifact_id: false }])(
    "retains invalid supplied identity %j and rejects fallback", async value => {
      const error = await decoded({ source_identity: value, source_verification: "current" });
      expect(error.sourceIdentity.kind).toBe("invalid");
      for (const operation of ["use", "clear", "resolve"] as const) expect(ligandOperationSourceFailure(error, [source], operation)).toBeNull();
    },
  );

  it.each(["project_id", "entry_id", "current_artifact_id", "original_artifact_id"] as const)("rejects mismatching supplied %s before single-target fallback", async field => {
    const error = await decoded({ source_identity: { ...identity, [field]: "different" }, source_verification: "original" });
    expect(error.sourceIdentity.kind).toBe("valid");
    expect(ligandOperationSourceFailure(error, [source], "use")).toBeNull();
    expect(ligandOperationSourceFailure(error, [source], "resolve")).toBeNull();
  });

  it.each([1, 2])("attributes a batch failure only to its captured exact member, with batch size %d", async size => {
    const other = { ...source, entryId: "other", currentArtifactId: "other-current" };
    const sources = size === 1 ? [source] : [other, source];
    const error = await decoded({ source_identity: identity, source_verification: "original" }, "artifact_not_found", 404);
    expect(ligandOperationSourceFailure(error, sources, "resolve")).toEqual({ source, reason: "artifact_unavailable" });
    expect(ligandOperationSourceFailure(await decoded({ source_verification: "current" }), sources, "resolve")).toBeNull();
    expect(ligandOperationSourceFailure(await decoded({ source_identity: identity }), sources, "resolve")).toBeNull();
  });

  it("distinguishes typed expected-current and physical conflicts from semantic hash rejection", async () => {
    const semantic = await decoded({}, "structure_artifact_conflict");
    expect(ligandOperationSourceFailure(semantic, [source], "use")).toBeNull();
    const expected = await decoded({ source_verification: "current" }, "structure_artifact_conflict");
    expect(ligandOperationSourceFailure(expected, [source], "use")).toEqual({ source, reason: "source_conflict" });
    expect(ligandOperationSourceFailure(expected, [source], "clear")).toEqual({ source, reason: "source_conflict" });
    expect(ligandOperationSourceFailure(expected, [source], "resolve")).toBeNull();
    const physical = await decoded({ source_verification: "current", source_identity: identity }, "structure_artifact_conflict");
    expect(ligandOperationSourceFailure(physical, [source], "use")).toEqual({ source, reason: "source_conflict" });
    expect(ligandOperationSourceFailure(physical, [source], "resolve")).toEqual({ source, reason: "source_conflict" });
  });

  it.each([[503, "artifact_integrity_error"], [409, "artifact_not_found"], [409, "revision_conflict"], [0, "network_error"], [422, "invalid_project_operation"]] as const)(
    "keeps nonphysical/wrong-status %d/%s inert", (status, code) => {
      const error = new ApiError(status, code, "Controlled local error");
      expect(ligandOperationSourceFailure(error, [source], "use")).toBeNull();
    },
  );

  it("does not accept a source role with no corresponding immutable artifact", async () => {
    const missingOriginal = { ...source, originalArtifactId: null };
    expect(ligandOperationSourceFailure(await decoded({ source_verification: "original" }), [missingOriginal], "use")).toBeNull();
  });
});
