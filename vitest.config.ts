import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./packages/runtime-host/", import.meta.url)),
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
