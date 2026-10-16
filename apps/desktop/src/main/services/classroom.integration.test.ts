import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createDatabase, createRepositories } from "@ckadinti/database";
import { createRuntimeHost } from "../../../../../packages/runtime-host/src/server.js";
import { hashPassword } from "../../../../../packages/runtime-host/src/teacher-auth.js";
import { commandHostedSession, createHostedQuizSession, getHostedSessionResults, getHostedSessionState, listHostedSessions } from "./runtime-host.js";
import { loadApprovedSnapshot } from "./approved-quiz.js";
import { importLessonFile } from "./lesson-import.js";
import { generateQuizFromLesson } from "./quiz-generation.js";

const password = "fixture-password-only";
const email = "teacher@fixture.test";
const snapshot = { id: "fixture", title: "HTML Fundamentals", questions: [{ id: "q1", prompt: "What does HTML do?", options: ["Structures page content", "Stores images"], correctOption: 0, timeLimitMs: 30_000, explanation: "HTML marks page content." }] };
let host: ReturnType<typeof createRuntimeHost>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ""); // Test account stores are isolated in memory.
  vi.stubEnv("OPENAI_API_KEY", "fixture-key-not-real");
  host = createRuntimeHost();
  await host.teacherStore.create("Fixture teacher", email, await hashPassword(password), "teacher", false);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === "https://api.openai.com/v1/responses") {
      const questions = [
        { prompt: "What does the DOCTYPE html declaration tell the browser?", correct: "Use the modern HTML standard.", incorrect: "Load the image file.", quote: "The `<!DOCTYPE html>` declaration tells the browser to use the modern HTML standard when it reads a document.", blockOrdinal: 2 },
        { prompt: "Which attribute identifies the image file for an img element?", correct: "src", incorrect: "href", quote: "An `<img>` element displays an image, and its `src` attribute identifies the image file.", blockOrdinal: 5 },
        { prompt: "What does the alt attribute provide?", correct: "A text alternative for an image.", incorrect: "The destination of a link.", quote: "The `alt` attribute provides a text alternative that can describe an image to people who cannot see it.", blockOrdinal: 6 },
      ].map(item => ({
        kind: "multiple-choice", prompt: item.prompt, explanation: item.quote, topic: "HTML", difficulty: "easy", confidence: "high",
        options: [{ text: item.correct, isCorrect: true }, { text: item.incorrect, isCorrect: false }],
        evidence: [{ blockOrdinal: item.blockOrdinal, quote: item.quote }],
      }));
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "HTML Fundamentals", language: "en", difficulty: "easy", questions }) }] }] });
    }
    if (url.origin !== "http://127.0.0.1:4310") throw new Error("Unexpected integration-test destination");
    const response = await host.app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST", url: url.pathname,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, { status: response.statusCode });
  });
});

afterAll(async () => { await host?.app.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("desktop controls against the actual runtime API", () => {
  it("hosts, controls, and reports a guest classroom without exposing the host token", async () => {
    const session = await createHostedQuizSession(snapshot, email, password);
    expect(JSON.stringify(listHostedSessions())).not.toContain(host.sessions.get(session.code)!.hostToken);
    await expect(getHostedSessionResults(session.code)).rejects.toThrow("results_not_ready");
    const join = await host.app.inject({ method: "POST", url: `/api/v1/sessions/${session.code}/players`, payload: { displayName: "Fixture student" } });
    const player = join.json();
    expect(join.statusCode).toBe(201);
    await commandHostedSession(session.code, { type: "lock-lobby", locked: true });
    expect((await getHostedSessionState(session.code)).lobbyLocked).toBe(true);
    await commandHostedSession(session.code, { type: "set-timer", timeLimitMs: 60_000 });
    const started = await commandHostedSession(session.code, { type: "start" });
    expect(started.question?.timeLimitMs).toBe(60_000);
    expect(started.reveal).toBeUndefined();
    expect(JSON.stringify(started)).not.toContain("correctOption");
    expect((await commandHostedSession(session.code, { type: "pause" })).phase).toBe("paused");
    expect((await commandHostedSession(session.code, { type: "resume" })).phase).toBe("question");
    const answer = await host.app.inject({ method: "POST", url: `/api/v1/sessions/${session.code}/answers`, headers: { authorization: `Bearer ${player.playerToken}` }, payload: { playerId: player.player.id, questionIndex: 0, optionIndex: 0, idempotencyKey: randomUUID() } });
    expect(answer.json().accepted).toBe(true);
    expect((await commandHostedSession(session.code, { type: "reveal" })).reveal?.correctOption).toBe(0);
    const afterBonusWindow = Date.now() + 8_100;
    const clock = vi.spyOn(Date, "now").mockReturnValue(afterBonusWindow);
    expect((await commandHostedSession(session.code, { type: "next" })).phase).toBe("ended");
    clock.mockRestore();
    const results = await getHostedSessionResults(session.code);
    expect(results.leaderboard[0]?.answers[0]).toMatchObject({ answered: true, correct: true, correctAnswer: "Structures page content" });
    expect(results.leaderboard[0]?.score).toBe(host.sessions.get(session.code)!.leaderboard()[0]!.score);
  });

  it("rejects unowned sessions and malformed host commands", async () => {
    await expect(commandHostedSession("ZZZZZZ", { type: "end" })).rejects.toThrow(/desktop workspace/);
    const session = await createHostedQuizSession(snapshot, email, password);
    await expect(commandHostedSession(session.code, { type: "set-timer", timeLimitMs: -1 })).rejects.toThrow();
    expect((await getHostedSessionState(session.code)).phase).toBe("lobby");
  });
});

it.skipIf(!process.env.TEST_DATABASE_URL)("imports, generates, reviews and hosts a PostgreSQL-backed quiz", async () => {
  // Apply the database migrations first; CI and the documented local command do this.
  const connection = createDatabase(process.env.TEST_DATABASE_URL!);
  const repositories = createRepositories(connection.db);
  let insertedLessonId: string | undefined;
  try {
    const imported = await importLessonFile(fileURLToPath(new URL("./fixtures/html-basics.md", import.meta.url)), repositories);
    if (!imported.duplicate) insertedLessonId = imported.lesson.id;
    const generated = await generateQuizFromLesson(imported.lesson.id, 3, repositories);
    await expect(loadApprovedSnapshot(generated.quizId, repositories)).rejects.toThrow(/Approve every question/);
    await repositories.questions.approvePending(generated.quizId);
    await expect(loadApprovedSnapshot(generated.quizId, repositories)).rejects.toThrow(/Approve every question/);
    await repositories.quizzes.approve(generated.quizId);
    const approved = await loadApprovedSnapshot(generated.quizId, repositories);
    expect(approved.questions).toHaveLength(3);
    const session = await createHostedQuizSession(approved, email, password);
    expect((await getHostedSessionState(session.code)).questionCount).toBe(3);
    const first = (await repositories.quizzes.getForReview(generated.quizId))!.questions[0]!;
    await repositories.questions.update(first.id, { prompt: "An edited question?" });
    await expect(loadApprovedSnapshot(generated.quizId, repositories)).rejects.toThrow(/Approve every question/);
    expect(host.sessions.get(session.code)!.snapshot.questions[0]!.prompt).toBe("What does the DOCTYPE html declaration tell the browser?");
    await commandHostedSession(session.code, { type: "end" });
    expect((await getHostedSessionResults(session.code)).questions).toBe(3);
  } finally {
    if (insertedLessonId) await repositories.lessons.delete(insertedLessonId);
    await connection.close();
  }
}, 20_000);
