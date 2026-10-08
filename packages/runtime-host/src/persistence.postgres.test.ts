import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuntimeHost } from "./server.js";
import { hashPassword, issueTeacherSession, makeTeacherStore } from "./teacher-auth.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runPostgresPersistence = process.env.RUN_POSTGRES_PERSISTENCE === "1";
const previousDatabaseUrl = process.env.DATABASE_URL;
const code = randomBytes(3).toString("hex").toUpperCase();
const email = `runtime-${randomUUID()}@example.test`;
const snapshot = {
  id: "postgres-persistence-check",
  title: "PostgreSQL persistence check",
  questions: [{ id: "q1", prompt: "2 + 2?", options: ["3", "4"], correctOption: 1, timeLimitMs: 30000 }],
};

describe.skipIf(!testDatabaseUrl || !runPostgresPersistence)("PostgreSQL runtime session persistence", () => {
  let teacherId = "";
  let teacherToken = "";
  let firstHost: ReturnType<typeof createRuntimeHost> | undefined;
  let secondHost: ReturnType<typeof createRuntimeHost> | undefined;
  let firstHostClosed = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl!;
    const migrationClient = postgres(testDatabaseUrl!, { max: 1 });
    try {
      await migrate(drizzle(migrationClient), {
        migrationsFolder: fileURLToPath(new URL("../../database/migrations", import.meta.url)),
      });
    } finally {
      await migrationClient.end();
    }

    const teacherStore = makeTeacherStore();
    await teacherStore.init();
    const teacher = await teacherStore.create("Persistence Tester", email, await hashPassword("persistence-password-123"), "teacher", false);
    teacherId = teacher.id;
    teacherToken = (await issueTeacherSession(teacherStore, teacher)).token;
    await teacherStore.close();

    firstHost = createRuntimeHost();
    await firstHost.init();
  });

  afterAll(async () => {
    try {
      if (secondHost) await secondHost.app.close();
      else if (firstHost && !firstHostClosed) await firstHost.app.close();
      if (testDatabaseUrl && teacherId) {
        const pool = new pg.Pool({ connectionString: testDatabaseUrl });
        try {
          await pool.query("DELETE FROM runtime_sessions WHERE code = $1", [code]);
          await pool.query("DELETE FROM teachers WHERE id = $1", [teacherId]);
        } finally {
          await pool.end();
        }
      }
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("migrates, restores a live session, and serves its saved teacher report", async () => {
    const created = await firstHost!.app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: { code, snapshot },
    });
    expect(created.statusCode).toBe(201);

    const joined = await firstHost!.app.inject({ method: "POST", url: `/api/v1/sessions/${code}/players`, payload: { displayName: "Student" } });
    expect(joined.statusCode).toBe(201);
    const { player, playerToken } = joined.json();
    const hostToken = created.json().hostToken as string;
    await firstHost!.app.inject({ method: "POST", url: `/api/v1/sessions/${code}/commands`, headers: { authorization: `Bearer ${hostToken}` }, payload: { command: { type: "start" } } });
    const answer = await firstHost!.app.inject({
      method: "POST",
      url: `/api/v1/sessions/${code}/answers`,
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { playerId: player.id, questionIndex: 0, optionIndex: 1, idempotencyKey: randomUUID() },
    });
    expect(answer.json().accepted).toBe(true);

    await firstHost!.app.close();
    firstHostClosed = true;
    secondHost = createRuntimeHost();
    await secondHost.init();

    const restored = await secondHost.app.inject({ method: "GET", url: `/api/v1/sessions/${code}/me`, headers: { authorization: `Bearer ${playerToken}`, "x-player-id": player.id } });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ answered: true, selectedOption: 1 });
    expect(restored.json().correctOption).toBeUndefined();

    const resumed = await secondHost.app.inject({ method: "GET", url: "/api/v1/teachers/me/session", headers: { authorization: `Bearer ${teacherToken}` } });
    const renewedHostToken = resumed.json().session.token as string;
    await secondHost.app.inject({ method: "POST", url: `/api/v1/sessions/${code}/commands`, headers: { authorization: `Bearer ${renewedHostToken}` }, payload: { command: { type: "reveal" } } });
    await secondHost.app.inject({ method: "POST", url: `/api/v1/sessions/${code}/commands`, headers: { authorization: `Bearer ${renewedHostToken}` }, payload: { command: { type: "next" } } });

    const report = await secondHost.app.inject({ method: "GET", url: `/api/v1/teachers/me/sessions/${code}/results`, headers: { authorization: `Bearer ${teacherToken}` } });
    expect(report.statusCode).toBe(200);
    expect(report.json().leaderboard[0].answers[0]).toMatchObject({ correct: true, selectedAnswer: "4" });
  });
});
