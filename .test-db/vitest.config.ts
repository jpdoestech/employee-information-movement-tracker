import { defineConfig } from "vitest/config";
export default defineConfig({
  cacheDir: ".test-db/cache/vitest",
  test: {
    include: [".test-db/unit/**/*.test.ts"],
    reporters: ["default", "json"],
    outputFile: ".test-db/reports/unit.json",
    coverage: { reportsDirectory: ".test-db/reports/coverage" },
  },
});
