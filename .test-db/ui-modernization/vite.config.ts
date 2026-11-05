import { defineConfig } from "vite";
import applicationConfig from "../../vite.config";
export default defineConfig(env => {
  const application = typeof applicationConfig === "function" ? applicationConfig(env) : applicationConfig;
  return {
    ...application,
    server: { ...application.server, watch: { ignored: ["**/.test-db/runs/**", "**/.test-db/reports/**", "**/.test-db/results/**", "**/.test-db/cache/**"] } },
  };
});
