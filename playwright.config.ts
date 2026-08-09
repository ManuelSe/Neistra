import { defineConfig, devices } from "@playwright/test";

function e2ePort(name: string, fallback: string): string {
  const raw = process.env[name] ?? fallback;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer port between 1 and 65535`);
  }
  return String(port);
}

function e2eDataDir(): string {
  const raw = process.env.MOLWEAVE_E2E_DATA_DIR ?? ".molweave-e2e";
  if (
    !/^[A-Za-z0-9._/-]+$/.test(raw) ||
    raw === "/" ||
    raw.split("/").includes("..")
  ) {
    throw new Error(
      "MOLWEAVE_E2E_DATA_DIR must be a dedicated path without spaces, shell metacharacters, or parent traversal",
    );
  }
  return raw;
}

const apiPort = e2ePort("MOLWEAVE_E2E_API_PORT", "8010");
const workerPort = e2ePort("MOLWEAVE_E2E_WORKER_PORT", "8011");
const webPort = e2ePort("MOLWEAVE_E2E_WEB_PORT", "5173");
const dataDir = e2eDataDir();
const apiUrl = `http://127.0.0.1:${apiPort}`;
const workerUrl = `http://127.0.0.1:${workerPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: [
    {
      command: `PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src MOLWEAVE_DATA_DIR=${dataDir} .venv/bin/alembic upgrade head && PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src MOLWEAVE_DATA_DIR=${dataDir} MOLWEAVE_ENABLE_TEST_ROUTES=1 .venv/bin/uvicorn molweave_api.main:app --host 127.0.0.1 --port ${apiPort}`,
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `while ! curl -sf ${apiUrl}/api/v1/health >/dev/null; do sleep 0.1; done; PYTHONPATH=apps/api/src:packages/molweave_core/src:packages/molweave_demo_plugin/src MOLWEAVE_DATA_DIR=${dataDir} MOLWEAVE_JOB_WORKER_HEALTH_PORT=${workerPort} .venv/bin/python -m molweave_api.worker`,
      url: `${workerUrl}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `VITE_API_TARGET=${apiUrl} corepack pnpm --dir apps/web dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
