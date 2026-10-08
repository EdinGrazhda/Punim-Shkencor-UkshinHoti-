import { createServer, get, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiDemoHandler } from "./server.js";

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
});

async function start() {
  let handle: ReturnType<typeof createAiDemoHandler>;
  const server = createServer((request, reply) => {
    void handle(request, reply, () => { reply.writeHead(404); reply.end(); });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  handle = createAiDemoHandler(port);
  const base = `http://127.0.0.1:${port}`;
  const session = await fetch(`${base}/api/ai-demo/session`).then(response => response.json()) as { token: string };
  const headers = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
  return { base, headers };
}

describe("database-free AI demo", () => {
  it("protects bootstrap and content requests from other sites and unknown tokens", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/ai-demo/session`, { headers: { Origin: "https://untrusted.example" } })).status).toBe(403);
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(`${base}/api/ai-demo/session`, { headers: { Host: "untrusted.example" } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    expect(badHostStatus).toBe(403);
    expect((await fetch(`${base}/api/teacher-content/v1/lessons`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await fetch(`${base}/api/v1/teachers/login`, { method: "POST" })).status).toBe(404);
  });

  it("imports a lesson, generates a review draft, and invalidates approval after edits without PostgreSQL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://unavailable.invalid/unused");
    vi.stubEnv("AI_PROVIDER", "kilo");
    const { base, headers } = await start();
    const text = "HTML describes page structure. CSS controls appearance. JavaScript adds interactive behavior.";
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.kilo.ai/")) return Promise.resolve(new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
          title: "HTML basics", language: "en", difficulty: "easy",
          questions: Array.from({ length: 3 }, (_, index) => ({
            kind: "multiple-choice", prompt: `Which technology describes page structure? (${index + 1})`,
            explanation: "HTML describes page structure.", topic: "HTML", difficulty: "easy", confidence: "high",
            options: [{ text: "HTML", isCorrect: true }, { text: "CSS", isCorrect: false }],
            evidence: [{ blockOrdinal: 0, quote: "HTML describes page structure." }],
          })),
        }) } }],
      })));
      return realFetch(url, init);
    }));
    const imported = await fetch(`${base}/api/teacher-content/v1/lessons`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "X-Lesson-Filename": "html.txt" }, body: text,
    });
    expect(imported.status).toBe(201);
    const { lesson } = await imported.json();
    const generated = await fetch(`${base}/api/teacher-content/v1/lessons/${lesson.id}/generate`, {
      method: "POST", headers, body: JSON.stringify({ questionCount: 3 }),
    });
    expect(generated.status).toBe(201);
    const draft = await generated.json();
    const quizUrl = `${base}/api/teacher-content/v1/quizzes/${draft.quizId}`;
    const previewUrl = `${base}/api/ai-demo/quizzes/${draft.quizId}/student-preview`;
    const quiz = await fetch(quizUrl, { headers }).then(response => response.json());
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions[0].evidence[0].quote).toBe("HTML describes page structure.");
    expect(quiz.status).toBe("needs-review");
    expect((await fetch(previewUrl)).status).toBe(404);
    expect((await fetch(`${quizUrl}/approve`, { method: "POST", headers })).status).toBe(409);
    for (const question of quiz.questions) {
      const decision = await fetch(`${base}/api/teacher-content/v1/questions/${question.id}/decision`, {
        method: "POST", headers, body: JSON.stringify({ questionId: question.id, reviewStatus: "approved" }),
      });
      expect(decision.status).toBe(200);
    }
    expect((await fetch(`${quizUrl}/approve`, { method: "POST", headers })).status).toBe(200);
    const previewResponse = await fetch(previewUrl);
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get("cache-control")).toBe("no-store");
    const preview = await previewResponse.json();
    expect(Object.keys(preview).sort()).toEqual(["questions", "title"]);
    expect(preview.questions).toHaveLength(3);
    for (const question of preview.questions) {
      expect(Object.keys(question).sort()).toEqual(["id", "options", "prompt"]);
      expect(question.options).toEqual(["HTML", "CSS"]);
    }
    expect((await fetch(previewUrl, { headers: { Origin: "https://untrusted.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/teacher-content/v1/quizzes/${draft.quizId}`)).status).toBe(401);
    const reloaded = await fetch(quizUrl, { headers }).then(response => response.json());
    expect(reloaded.status).toBe("approved");
    const question = quiz.questions[0];
    const saved = await fetch(`${base}/api/teacher-content/v1/questions/${question.id}`, {
      method: "PATCH", headers, body: JSON.stringify({
        questionId: question.id, prompt: "Which language defines page structure?", explanation: question.explanation,
        topic: question.topic, difficulty: question.difficulty, options: question.options.map(({ text, isCorrect }: { text: string; isCorrect: boolean }) => ({ text, isCorrect })),
      }),
    });
    expect(saved.status).toBe(200);
    const edited = await fetch(quizUrl, { headers }).then(response => response.json());
    expect(edited.status).toBe("needs-review");
    expect((await fetch(previewUrl)).status).toBe(404);
    expect(edited.questions[0].reviewStatus).toBe("needs-review");
    const fresh = await start();
    expect(await fetch(`${fresh.base}/api/teacher-content/v1/lessons`, { headers: fresh.headers }).then(response => response.json())).toEqual([]);
  });
});
