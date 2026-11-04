import assert from "node:assert/strict";
import test from "node:test";
import { environmentValue } from "./configuration.mjs";
import { buildConfiguration } from "./dev.mjs";

test("canonical settings override legacy and default without accepting an invalid fallback", () => {
  assert.equal(environmentValue("DATA_DIR", "default", {}), "default");
  assert.equal(environmentValue("DATA_DIR", "default", { MOLWEAVE_DATA_DIR: "legacy" }), "legacy");
  assert.equal(environmentValue("DATA_DIR", "default", { NEISTRA_DATA_DIR: "new" }), "new");
  assert.equal(environmentValue("DATA_DIR", "default", { NEISTRA_DATA_DIR: "" }), "");
  assert.throws(() => buildConfiguration({ root: "/workspace", environment: {
    NEISTRA_API_PORT: "invalid", MOLWEAVE_API_PORT: "8000",
  }}), /NEISTRA_API_PORT/);
});

test("supervisor delegates store resolution unchanged to all Python processes", () => {
  for (const environment of [{}, { NEISTRA_DATA_DIR: "root with spaces" },
    { MOLWEAVE_DATA_DIR: "legacy" }, { NEISTRA_DATABASE_URL: "sqlite:///explicit.db" }]) {
    const configuration = buildConfiguration({ root: "/workspace", environment });
    for (const name of ["NEISTRA_DATA_DIR", "MOLWEAVE_DATA_DIR", "NEISTRA_DATABASE_URL"]) {
      assert.equal(configuration.sharedEnvironment[name], environment[name]);
    }
  }
  const configuration = buildConfiguration({ root: "/workspace", environment: {
    NEISTRA_API_PORT: "18000", NEISTRA_WEB_PORT: "15173",
  }});
  assert.equal(configuration.apiPort, 18000);
  assert.equal(configuration.webPort, 15173);
});
