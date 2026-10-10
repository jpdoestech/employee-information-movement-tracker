import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", ""),
    key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let elevated = false;
  try {
    elevated =
      key?.startsWith("eyJ") &&
      JSON.parse(atob(key.split(".")[1])).role === "service_role";
  } catch {
    /* Non-JWT publishable keys are expected. */
  }
  if (elevated || key?.startsWith("sb_secret_"))
    throw new Error("Refusing to bundle a privileged Supabase key");
  return { plugins: [react()], base: env.BASE_PATH || "/" };
});
