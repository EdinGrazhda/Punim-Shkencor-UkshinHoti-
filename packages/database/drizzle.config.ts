import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in the root .env file before running database migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
