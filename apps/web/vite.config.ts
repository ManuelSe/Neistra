import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { themeInitializationScript, themeStyles } from "./src/theme";

const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), {
    name: "neistra-theme",
    transformIndexHtml: {
      order: "pre",
      handler: () => [
        { tag: "style", attrs: { id: "workspace-theme" }, children: themeStyles(), injectTo: "head" },
        { tag: "script", children: themeInitializationScript(), injectTo: "head" },
      ],
    },
  }],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/ws": {
        target: apiTarget,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
