import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
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
      command:
        "PYTHONPATH=apps/api/src:packages/molweave_core/src MOLWEAVE_DATA_DIR=.molweave-e2e MOLWEAVE_AUTO_CREATE_SCHEMA=1 MOLWEAVE_ENABLE_TEST_ROUTES=1 .venv/bin/uvicorn molweave_api.main:app --host 127.0.0.1 --port 8010",
      url: "http://127.0.0.1:8010/api/v1/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command:
        "VITE_API_TARGET=http://127.0.0.1:8010 corepack pnpm --dir apps/web dev",
      url: "http://127.0.0.1:5173",
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
