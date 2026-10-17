import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./results/playwright",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: fileURLToPath(
          new URL("./reports/playwright", import.meta.url),
        ),
      },
    ],
  ],
});
