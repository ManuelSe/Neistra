import { test as base, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MolecularViewer } from "../../../apps/web/src/viewer/MolecularViewer";
import type { WorkspacePresentationSnapshot } from "../../../apps/web/src/workspacePresentation/types";

declare global {
  interface Window {
    workspaceCameraEngine: MolecularViewer;
    workspaceCameraFits: number;
    workspaceCameraController: { getSnapshot(): WorkspacePresentationSnapshot };
  }
}

interface IsolatedPresentationApi {
  baseUrl: string;
  request: APIRequestContext;
  restart(): Promise<void>;
}

/** Genuine HTTP responses from an owned disposable API, with test-only observers. */
export function observeCameraEngine(source: string, holdSurface = false): string {
  return `${source}
const cameraQualificationMount = MolstarEngine.prototype.mount;
MolstarEngine.prototype.mount = async function(target) {
  await cameraQualificationMount.call(this, target);
  window.workspaceCameraEngine = this;
};
const cameraQualificationFit = MolstarEngine.prototype.fitVisible;
MolstarEngine.prototype.fitVisible = function() {
  window.workspaceCameraFits = (window.workspaceCameraFits ?? 0) + 1;
  return cameraQualificationFit.call(this);
};
${holdSurface ? `const cameraQualificationSurface = MolstarEngine.prototype.updateSurfaceDisplay;
MolstarEngine.prototype.updateSurfaceDisplay = async function(binding) {
  if (!window.cameraSurfaceReleased) {
    window.cameraSurfaceWaiting = true;
    await new Promise(resolve => { window.releaseCameraSurface = () => { window.cameraSurfaceReleased = true; resolve(); }; });
  }
  return cameraQualificationSurface.call(this, binding);
};` : ""}`;
}

export async function connectPresentationContext(context: BrowserContext, baseUrl: string) {
  await context.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${baseUrl}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await context.route("**/src/viewer/MolstarEngine.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: observeCameraEngine(await response.text()) });
  });
  await context.route("**/src/workspacePresentation/controller.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}
const cameraQualificationStart = WorkspacePresentationController.prototype.start;
WorkspacePresentationController.prototype.start = function() {
  window.workspaceCameraController = this;
  return cameraQualificationStart.call(this);
};` });
  });
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveReady); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No owned API port available.");
  await new Promise<void>((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
  return address.port;
}

async function stop(process: ChildProcess | undefined) {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  await new Promise<void>(resolveStopped => {
    const timer = setTimeout(() => process.kill("SIGKILL"), 10_000);
    process.once("exit", () => { clearTimeout(timer); resolveStopped(); });
    process.kill("SIGTERM");
  });
}

export const test = base.extend<{ presentationApi: IsolatedPresentationApi }>({
  presentationApi: async ({ playwright, context }, use, info) => {
    const directory = await mkdtemp(join(tmpdir(), "neistra-camera-api-"));
    const environment = { ...process.env };
    for (const key of ["DATABASE_URL", "NEISTRA_DATABASE_URL", "MOLWEAVE_DATABASE_URL", "NEISTRA_DATA_DIR", "MOLWEAVE_DATA_DIR", "NEISTRA_AUTO_CREATE_SCHEMA", "MOLWEAVE_AUTO_CREATE_SCHEMA"]) delete environment[key];
    environment.NEISTRA_DATA_DIR = directory;
    environment.PYTHONPATH = "apps/api/src:packages/neistra_core/src:packages/neistra_demo_plugin/src";
    const port = await unusedPort(), baseUrl = `http://127.0.0.1:${port}`;
    const request = await playwright.request.newContext({ baseURL: baseUrl });
    const log: string[] = [];
    let child: ChildProcess | undefined;
    const start = async () => {
      let startupError: Error | undefined;
      child = spawn(resolve(".venv/bin/python"), ["-m", "uvicorn", "neistra_api.main:app", "--host", "127.0.0.1", "--port", String(port)], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
      child.once("error", error => { startupError = error; });
      child.stdout?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
      await expect.poll(async () => {
        if (startupError) throw startupError;
        if (child?.exitCode !== null) throw new Error(`Owned API stopped: ${log.join("")}`);
        return request.get("/api/v1/health", { timeout: 1000 }).then(response => response.status(), () => 0);
      }, { timeout: 20_000 }).toBe(200);
    };
    try {
      await new Promise<void>((resolveMigrated, reject) => {
        const migration = spawn(resolve(".venv/bin/python"), ["-m", "alembic", "upgrade", "head"], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
        migration.stdout.on("data", (chunk: Buffer) => log.push(chunk.toString()));
        migration.stderr.on("data", (chunk: Buffer) => log.push(chunk.toString()));
        migration.once("error", reject);
        migration.once("exit", code => code === 0 ? resolveMigrated() : reject(new Error(`Owned migration failed (${code}): ${log.join("")}`)));
      });
      await start();
      await connectPresentationContext(context, baseUrl);
      await use({ baseUrl, request, restart: async () => { await stop(child); log.push("\nOwned API process restart\n"); await start(); } });
    } finally {
      await stop(child);
      await writeFile(info.outputPath("presentation-api.log"), log.join(""));
      await request.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
});

export { expect };
