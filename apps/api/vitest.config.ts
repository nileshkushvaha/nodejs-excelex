import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. Anything needing a database lives in test/integration
    // and runs under test:integration, so a developer without Postgres up can
    // still run the fast suite.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
