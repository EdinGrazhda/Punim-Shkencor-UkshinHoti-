import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createDatabase, createRepositories } from "@ckadinti/database";
import { createTeacherContentApi } from "./main/services/teacher-content-api.js";
import { createTeacherAuthorizer } from "./main/services/teacher-authorizer.js";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the teacher content service.");

const database = createDatabase(process.env.DATABASE_URL);
const repositories = createRepositories(database.db);
const allowedOrigins = ["http://localhost:4173", "http://127.0.0.1:4173"];
if (process.env.STUDENT_ORIGIN) allowedOrigins.push(new URL(process.env.STUDENT_ORIGIN).origin);
const api = createTeacherContentApi({
  getRepositories: () => repositories,
  authorizeTeacher: createTeacherAuthorizer(process.env.RUNTIME_ORIGIN),
  allowedOrigins,
  host: process.env.CONTENT_HOST ?? "127.0.0.1",
  port: Number(process.env.CONTENT_PORT ?? 4320),
});

// Runtime startup applies migrations before Compose starts this service.
await repositories.lessons.list();
await api.listen();
console.log("CkaDinTi teacher content service is ready.");

async function shutdown() {
  await api.close();
  await database.close();
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
