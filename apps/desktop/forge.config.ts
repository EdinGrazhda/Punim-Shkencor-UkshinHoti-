import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { copyPdfRuntimeDependencies } from "./build-support/runtime-dependencies";

const config: ForgeConfig = {
  packagerConfig: {
    // Worker threads, native canvas and OCR language/WASM assets need real paths.
    asar: { unpackDir: "node_modules" },
  },
  rebuildConfig: {},
  makers: [],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => { await copyPdfRuntimeDependencies(buildPath); },
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main/main.ts", config: "vite.main.config.ts" },
        { entry: "src/preload/preload.ts", config: "vite.preload.config.ts" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
  ],
};

export default config;
