import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { host: "0.0.0.0", port: 4173, proxy: { "/api/teacher-content": "http://127.0.0.1:4320", "/api": "http://localhost:4310", "/socket.io": { target: "http://localhost:4310", ws: true } } },
});
