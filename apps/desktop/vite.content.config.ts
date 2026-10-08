import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/content-server.ts",
    target: "node22",
    outDir: "dist-content",
    rollupOptions: { output: { entryFileNames: "server.mjs" } },
  },
  ssr: { noExternal: ["@ckadinti/contracts", "@ckadinti/database"] },
});
