import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.MOLWEAVE_E2E_API_PORT ?? "8010";
const workerPort = process.env.MOLWEAVE_E2E_WORKER_PORT ?? "8011";
const webPort = process.env.MOLWEAVE_E2E_WEB_PORT ?? "5173";
const dataDir = process.env.MOLWEAVE_E2E_DATA_DIR ?? ".molweave-e2e";
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
