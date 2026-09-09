import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCommands,
  buildConfiguration,
  checkPrerequisites,
  parsePort,
  resolvePython,
  runToCompletion,
  stopProcesses,
  waitForUrl,
} from "./dev.mjs";

test("builds the default migration and three-service startup", () => {
  const configuration = buildConfiguration({
    root: "/workspace",
    environment: {},
    platform: "linux",
  });
  const commands = buildCommands(configuration);

  assert.equal(configuration.apiPort, 8000);
  assert.equal(configuration.webPort, 5173);
  assert.equal(configuration.python, "/workspace/.venv/bin/python");
  assert.deepEqual(commands.migration.args, ["-m", "alembic", "upgrade", "head"]);
  assert.deepEqual(
    commands.services.map((service) => service.label),
    ["api", "worker", "web"],
  );
  assert.equal(commands.services[0].args.at(-1), "8000");
  assert.equal(commands.services[2].args.at(-2), "5173");
  assert.equal(commands.services[2].args.at(-1), "--strictPort");
  assert.equal(commands.services[2].args.includes("--"), false);
});

test("preserves environment overrides and constructs platform-specific paths", () => {
  const configuration = buildConfiguration({
    root: "C:\\molweave",
    environment: {
      MOLWEAVE_API_PORT: "18000",
      MOLWEAVE_DATA_DIR: "custom-data",
      MOLWEAVE_WEB_PORT: "15173",
      PYTHONPATH: "C:\\plugins",
      VITE_API_TARGET: "http://api.example.test",
    },
    platform: "win32",
  });

  assert.equal(resolvePython("C:\\molweave", "win32"), "C:\\molweave\\.venv\\Scripts\\python.exe");
  assert.equal(configuration.packageRunner, "corepack.cmd");
  assert.equal(configuration.apiPort, 18000);
  assert.equal(configuration.webPort, 15173);
  assert.equal(configuration.sharedEnvironment.MOLWEAVE_DATA_DIR, "custom-data");
  assert.match(configuration.sharedEnvironment.PYTHONPATH, /molweave_demo_plugin\\src;C:\\plugins$/);
  assert.equal(configuration.webEnvironment.VITE_API_TARGET, "http://api.example.test");
});

test("rejects invalid port overrides", () => {
  for (const value of ["0", "65536", "12.5", "port", ""]) {
    assert.throws(() => parsePort(value, "TEST_PORT", 8000), /between 1 and 65535/);
  }
});

test("brands startup diagnostics while retaining the existing configuration contract", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./dev.mjs", import.meta.url))], {
    env: { ...process.env, MOLWEAVE_API_PORT: "invalid" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^\[neistra\] MOLWEAVE_API_PORT must be an integer between 1 and 65535\./);
  assert.doesNotMatch(result.stderr, /\[molweave\]/);
});

test("reports a missing project-local Python environment", () => {
  const configuration = buildConfiguration({
    root: "/missing-molweave",
    environment: {},
    platform: "linux",
  });
  assert.throws(
    () => checkPrerequisites(configuration),
    /Python environment not found[\s\S]*python3\.12 -m venv \.venv/,
  );
});

test("propagates a migration command failure", async () => {
  const configuration = {
    root: process.cwd(),
    platform: "win32",
  };
  await assert.rejects(
    runToCompletion(
      {
        label: "migrate",
        command: process.execPath,
        args: ["-e", "process.exit(7)"],
        environment: process.env,
      },
      configuration,
    ),
    /migrate failed with exit code 7/,
  );
});

test("waits for an HTTP service to become ready", async () => {
  let attempts = 0;
  await waitForUrl("http://127.0.0.1:8000/health", 1_000, async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("not ready");
    }
    return { ok: true };
  });
  assert.equal(attempts, 2);
});

test("terminates a supervised process group", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  await once(child, "spawn");

  await stopProcesses([child], process.platform, 1_000);

  assert.notEqual(child.exitCode ?? child.signalCode, null);
});
