import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createAiDemoHandler } from "./src/demo/server.js";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const lanHost = process.env.AI_DEMO_LAN_HOST?.trim();
const lanAccessCode = process.env.AI_DEMO_LAN_ACCESS_CODE?.trim();

function isPrivateIpv4(address: string) {
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

if (Boolean(lanHost) !== Boolean(lanAccessCode)) {
  throw new Error("LAN mode requires both AI_DEMO_LAN_HOST and AI_DEMO_LAN_ACCESS_CODE.");
}
if (lanHost && !isPrivateIpv4(lanHost)) {
  throw new Error("AI_DEMO_LAN_HOST must be this computer's private IPv4 address.");
}
if (lanAccessCode && !/^[A-Za-z0-9_-]{32,128}$/u.test(lanAccessCode)) {
  throw new Error("AI_DEMO_LAN_ACCESS_CODE must be a random URL-safe value at least 32 characters long.");
}

const bindHost = lanHost ?? "127.0.0.1";

export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("The AI demo is a local development server only.");
  return {
    root: fileURLToPath(new URL("../student", import.meta.url)),
    server: { host: bindHost, port: 4175, strictPort: true, open: false },
    plugins: [react(), {
      name: "ckadinti-ai-demo",
      configureServer(server) {
        if (server.config.server.host !== bindHost) throw new Error("The AI demo bind address changed unexpectedly.");
        const port = server.config.server.port ?? 4175;
        const handle = createAiDemoHandler(port, {
          lanAccessCode,
          allowedOrigins: lanHost ? [`http://${lanHost}:${port}`] : [],
        });
        server.middlewares.use((request, reply, next) => { void handle(request, reply, next).catch(next); });
      },
    }],
  };
});
