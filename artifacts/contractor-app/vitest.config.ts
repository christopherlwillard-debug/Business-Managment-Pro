import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest does not start the dev server, but some tests and tooling load the
// Vite config. Keep those loads deterministic without weakening dev validation:
// vite.config.ts still requires explicit values outside test mode.
if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
  process.env.PORT ??= "0";
  process.env.BASE_PATH ??= "/";
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});