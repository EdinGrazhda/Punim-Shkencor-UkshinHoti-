import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createTeacherContentApi } from "../main/services/teacher-content-api.js";
import { createMemoryContentRepositories } from "./memory-repositories.js";
import { quizIdSchema, StudentQuizPreview } from "@ckadinti/contracts";

export function createAiDemoHandler(port: number) {
  const token = randomBytes(32).toString("hex");
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const hosts = origins.map(origin => new URL(origin).host);
  const repositories = createMemoryContentRepositories();
  const contentApi = createTeacherContentApi({
    getRepositories: () => repositories,
    authorizeTeacher: async candidate => candidate === token,
    allowedOrigins: origins,
  });

  function json(reply: ServerResponse, status: number, body: unknown) {
    reply.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    reply.end(JSON.stringify(body));
  }

  return async (request: IncomingMessage, reply: ServerResponse, next: () => void) => {
    if (!hosts.includes(request.headers.host ?? "") ||
      (request.headers.origin && !origins.includes(request.headers.origin)) ||
      request.headers["sec-fetch-site"] === "cross-site") {
      json(reply, 403, { error: "The AI demo is only available from its local page." });
      return;
    }
    const pathname = new URL(request.url ?? "/", origins[0]).pathname;
    const previewMatch = pathname.match(/^\/api\/ai-demo\/quizzes\/([^/]+)\/student-preview$/u);
    if (previewMatch && request.method === "GET") {
      const id = quizIdSchema.safeParse(previewMatch[1]);
      const quiz = id.success ? await repositories.quizzes.getForReview(id.data) : null;
      if (!quiz || quiz.status !== "approved" || !quiz.questions.length || quiz.questions.some(question => question.reviewStatus !== "approved")) {
        json(reply, 404, { error: "This preview is unavailable. Ask the teacher to approve the quiz again. Demo quizzes disappear after a server restart." });
        return;
      }
      // Explicit whitelist plus a shared public contract: never serialize the
      // teacher review object or an approved snapshot containing the answer key.
      json(reply, 200, StudentQuizPreview.parse({
        title: quiz.title,
        questions: quiz.questions.map(question => ({
          id: question.id, prompt: question.prompt,
          options: question.options.map(option => option.text),
        })),
      }));
      return;
    }
    if (pathname === "/" && request.method === "GET") {
      reply.writeHead(302, { Location: "/ai-demo.html" });
      reply.end();
      return;
    }
    if (pathname.startsWith("/api/teacher-content/")) {
      await contentApi.handle(request, reply);
      return;
    }
    if (pathname === "/api/ai-demo/session" && request.method === "GET") {
      const provider = process.env.AI_PROVIDER?.trim() || (process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai");
      json(reply, 200, { token, provider, temporary: true });
      return;
    }
    if (pathname === "/api/ai-demo/sample" && request.method === "GET") {
      try {
        const pdf = await readFile(new URL("../../../../output/pdf/CkaDinTi_HTML_Lesson.pdf", import.meta.url));
        reply.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="CkaDinTi_HTML_Lesson.pdf"' });
        reply.end(pdf);
      } catch { json(reply, 500, { error: "The sample PDF could not be loaded." }); }
      return;
    }
    if (pathname.startsWith("/api/")) {
      json(reply, 404, { error: "This demo supports lesson import, generation and review only." });
      return;
    }
    next();
  };
}
