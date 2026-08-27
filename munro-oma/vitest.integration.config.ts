import { defineConfig } from "vitest/config"
import path from "node:path"

// Integration config: runs the DB-backed tests that the default `npm run test`
// deliberately excludes. Invoked via `npm run test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
})
