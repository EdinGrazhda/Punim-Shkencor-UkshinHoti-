import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createAiDemoHandler } from "./src/demo/server.js";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("The AI demo is a local development server only.");
  return {
    root: fileURLToPath(new URL("../student", import.meta.url)),
    server: { host: "127.0.0.1", port: 4175, strictPort: true, open: false },
    plugins: [react(), {
      name: "ckadinti-ai-demo",
      configureServer(server) {
        if (server.config.server.host !== "127.0.0.1") throw new Error("The AI demo must bind to 127.0.0.1.");
        const handle = createAiDemoHandler(server.config.server.port ?? 4175);
        server.middlewares.use((request, reply, next) => { void handle(request, reply, next).catch(next); });
      },
    }],
  };
});
