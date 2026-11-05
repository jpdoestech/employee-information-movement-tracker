import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: ".",
  testMatch: "ui00.spec.ts",
  outputDir: "../results/ui-modernization",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5178", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --config .test-db/ui-modernization/vite.config.ts --port 5178",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:5178",
    reuseExistingServer: true,
    env: { VITE_SUPABASE_URL: "https://synthetic.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", VITE_DEMO_MODE: "false" },
  },
  reporter: [["list"], ["json", { outputFile: "../reports/ui-modernization/tests.json" }]],
});
