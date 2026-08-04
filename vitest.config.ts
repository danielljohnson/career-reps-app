import path from "node:path";
import { defineConfig } from "vitest/config";

// The validation gate in lib/routines.ts is pure and framework-free, so it runs
// under Vitest in a plain Node environment. The alias mirrors the "@/*" path in
// tsconfig so tests import modules exactly as the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only throws when imported outside a React Server environment,
      // so stub it out for modules under test (e.g. lib/dashboard.ts).
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

