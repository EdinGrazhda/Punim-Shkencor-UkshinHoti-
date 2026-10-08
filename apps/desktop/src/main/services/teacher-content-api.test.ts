import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import type { createRepositories } from "@ckadinti/database";
import { createTeacherContentApi } from "./teacher-content-api.js";
import type { ContentRepositories } from "./content-repositories.js";
import { createMemoryContentRepositories } from "../../demo/memory-repositories.js";

const instances: Array<ReturnType<typeof createTeacherContentApi>> = [];

async function startApi(overrides: { authorizeTeacher?: (token: string) => Promise<boolean>; getRepositories?: () => ContentRepositories } = {}) {
  const repositories = {
    lessons: { list: vi.fn(async () => [{ id: "lesson-1", title: "HTML Basics" }]) },
  } as unknown as ReturnType<typeof createRepositories>;
  const api = createTeacherContentApi({
    port: 0,
    getRepositories: overrides.getRepositories ?? (() => repositories),
    authorizeTeacher: overrides.authorizeTeacher ?? (async token => token === "valid-teacher-token"),
  });
  instances.push(api);
  await api.listen();
  const address = api.address() as AddressInfo;
  return { api, repositories, baseUrl: `http://127.0.0.1:${address.port}/api/teacher-content/v1` };
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.close()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local teacher content API", () => {
  it("authenticates requests and serves the lesson list without allowing arbitrary origins", async () => {
    const authorizeTeacher = vi.fn(async (token: string) => token === "valid-teacher-token");
    const { baseUrl, repositories } = await startApi({ authorizeTeacher });

    const denied = await fetch(`${baseUrl}/lessons`, { headers: { Origin: "https://untrusted.example", Authorization: "Bearer valid-teacher-token" } });
    expect(denied.status).toBe(403);
    expect(authorizeTeacher).not.toHaveBeenCalled();

    const unauthorized = await fetch(`${baseUrl}/lessons`);
    expect(unauthorized.status).toBe(401);
    const health = await fetch(new URL("/health", baseUrl));
    expect(await health.json()).toEqual({ ok: true, service: "ckadinti-teacher-content" });
    expect((await fetch(`${baseUrl}/lessons`, { method: "POST", body: "lesson" })).status).toBe(401);

    const response = await fetch(`${baseUrl}/lessons`, { headers: { Authorization: "Bearer valid-teacher-token" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([{ id: "lesson-1", title: "HTML Basics" }]);
    expect(repositories.lessons.list).toHaveBeenCalledOnce();
  });

  it("validates generation request JSON before calling the AI service", async () => {
    const getRepositories = vi.fn(() => ({ lessons: { list: vi.fn() } } as unknown as ReturnType<typeof createRepositories>));
    const { baseUrl } = await startApi({ getRepositories });

    const response = await fetch(`${baseUrl}/lessons/589eac50-8f4c-4fa3-a151-f04af1f526b2/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ questionCount: 201 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(getRepositories).toHaveBeenCalledOnce();
  });

  it("binds only to loopback and returns generic database configuration errors", async () => {
    const getRepositories = vi.fn(() => { throw new Error("Set DATABASE_URL to connect to PostgreSQL."); });
    const { api, baseUrl } = await startApi({ getRepositories });
    expect((api.address() as AddressInfo).address).toBe("127.0.0.1");

    const response = await fetch(`${baseUrl}/lessons`, { headers: { Authorization: "Bearer valid-teacher-token" } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Teacher content database is unavailable. Check DATABASE_URL and apply the migrations." });
  });

  it("reports a missing OpenAI key as a setup prerequisite", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    const { baseUrl } = await startApi({
      getRepositories: () => ({ lessons: { get: vi.fn() } } as unknown as ReturnType<typeof createRepositories>),
    });

    const response = await fetch(`${baseUrl}/lessons/589eac50-8f4c-4fa3-a151-f04af1f526b2/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-teacher-token", "Content-Type": "application/json" },
      body: JSON.stringify({ questionCount: 3 }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Set OPENAI_API_KEY in the private root .env file to generate quizzes.",
    });
  });

  it.each(["pdf", "txt"])("imports %s source and generates a draft with evidence and mandatory review", async sourceType => {
    vi.stubEnv("AI_PROVIDER", "kilo");
    const repositories = createMemoryContentRepositories();
    const { baseUrl } = await startApi({ getRepositories: () => repositories });
    const quote = "water freezes at 0 degrees Celsius.";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.kilo.ai/")) return Promise.resolve(new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
          title: "Freezing water", language: "en", difficulty: "easy",
          questions: [{
            kind: "multiple-choice", prompt: "At what temperature does water freeze?",
            explanation: quote, topic: "Water", difficulty: "easy", confidence: "high",
            options: [{ text: "0 degrees Celsius", isCorrect: true }, { text: "100 degrees Celsius", isCorrect: false }],
            evidence: [{ blockOrdinal: 0, quote }],
          }],
        }) } }],
      })));
      return realFetch(url, init);
    }));
    const body = sourceType === "pdf"
      ? new Uint8Array(await readFile(new URL("./fixtures/lesson.pdf", import.meta.url)))
      : `In this lesson, ${quote}`;
    const headers = { Authorization: "Bearer valid-teacher-token", "Content-Type": "application/json" };
    const imported = await fetch(`${baseUrl}/lessons`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "X-Lesson-Filename": `lesson.${sourceType}` }, body,
    });
    expect(imported.status).toBe(201);
    const { lesson } = await imported.json();
    expect(lesson.sourceType).toBe(sourceType);
    const generated = await fetch(`${baseUrl}/lessons/${lesson.id}/generate`, {
      method: "POST", headers, body: JSON.stringify({ questionCount: 1 }),
    });
    expect(generated.status).toBe(201);
    const { quizId } = await generated.json();
    const quizUrl = `${baseUrl}/quizzes/${quizId}`;
    const review = await fetch(quizUrl, { headers }).then(response => response.json());
    expect(review.status).toBe("needs-review");
    expect(review.questions).toHaveLength(1);
    expect(review.questions[0].evidence[0].quote).toBe(quote);
    expect((await fetch(`${quizUrl}/approve`, { method: "POST", headers })).status).toBe(409);
  });
});
