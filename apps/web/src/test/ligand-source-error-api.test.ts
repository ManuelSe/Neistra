import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ligandApi } from "../ligands/api";
import { propertyProject } from "./ligand-properties-fixtures";

afterEach(() => { vi.unstubAllGlobals(); });

describe("typed molecular-source error provenance", () => {
  it.each(["current", "original", "svg", "CURRENT", null, undefined, {}, 1])("validates producer provenance %j at the actual API decoder", async source => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: {
      code: "artifact_not_found", message: "Controlled artifact boundary", source_verification: source,
    } }), { status: 404, headers: { "Retry-After": "2" } })));
    const entry = propertyProject().entries[0];
    const error: unknown = await ligandApi.depiction("project-1", entry, "candidate", new AbortController().signal).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "artifact_not_found", status: 404, message: "Controlled artifact boundary", retryAfterMs: 2000,
      sourceVerification: source === "current" || source === "original" ? source : null });
  });

  it("preserves old error constructor calls and leaves untagged errors unqualified", () => {
    expect(new ApiError(409, "artifact_integrity_error", "Existing caller").sourceVerification).toBeNull();
  });
});
