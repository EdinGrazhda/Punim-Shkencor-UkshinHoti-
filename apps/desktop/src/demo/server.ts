import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createTeacherContentApi } from "../main/services/teacher-content-api.js";
import { createMemoryContentRepositories } from "./memory-repositories.js";
import { quizIdSchema, StudentPreviewAnswerResult, StudentPreviewAnswerSubmission, StudentQuizPreview } from "@ckadinti/contracts";

export function createAiDemoHandler(port: number, options: { lanAccessCode?: string; allowedOrigins?: string[] } = {}) {
  const token = randomBytes(32).toString("hex");
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(options.allowedOrigins ?? [])];
  const hosts = origins.map(origin => new URL(origin).host);
  const repositories = createMemoryContentRepositories();
  const previewAttempts = new Map<string, { quizId: string; expiresAt: number; answers: Map<string, { optionIndex: number; result: ReturnType<typeof StudentPreviewAnswerResult.parse> | null }> }>();
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
    const previewMatch = pathname.match(/^\/api\/ai-demo\/quizzes\/([^/]+)\/student-preview(?:\/(answer))?$/u);
    if (previewMatch && request.method === "GET" && !previewMatch[2]) {
      const id = quizIdSchema.safeParse(previewMatch[1]);
      const quiz = id.success ? await repositories.quizzes.getForReview(id.data) : null;
      if (!quiz || quiz.status !== "approved" || !quiz.questions.length || quiz.questions.some(question => question.reviewStatus !== "approved")) {
        json(reply, 404, { error: "This preview is unavailable. Ask the teacher to approve the quiz again. Demo quizzes disappear after a server restart." });
        return;
      }
      const now = Date.now();
      for (const [attemptToken, attempt] of previewAttempts) if (attempt.expiresAt <= now) previewAttempts.delete(attemptToken);
      while (previewAttempts.size >= 500) previewAttempts.delete(previewAttempts.keys().next().value!);
      const attemptToken = randomUUID();
      previewAttempts.set(attemptToken, { quizId: quiz.id, expiresAt: now + 30 * 60_000, answers: new Map() });
      // Explicit whitelist plus a shared public contract: never serialize the
      // teacher review object or an approved snapshot containing the answer key.
      json(reply, 200, StudentQuizPreview.parse({
        title: quiz.title,
        attemptToken,
        questions: quiz.questions.map(question => ({
          id: question.id, prompt: question.prompt,
          options: question.options.map(option => option.text),
        })),
      }));
      return;
    }
    if (previewMatch && request.method === "POST" && previewMatch[2] === "answer") {
      const id = quizIdSchema.safeParse(previewMatch[1]);
      let body: unknown;
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        let oversized = false;
        for await (const chunk of request) {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += part.length;
          if (size > 8_192) oversized = true;
          else if (!oversized) chunks.push(part);
        }
        if (oversized) { json(reply, 413, { error: "Answer request is too large." }); return; }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        json(reply, 400, { error: "Invalid answer request." });
        return;
      }
      const parsed = StudentPreviewAnswerSubmission.safeParse(body);
      if (!id.success || !parsed.success) { json(reply, 400, { error: "Invalid answer request." }); return; }
      const attempt = previewAttempts.get(parsed.data.attemptToken);
      if (!attempt || attempt.quizId !== id.data || attempt.expiresAt <= Date.now()) {
        json(reply, 404, { error: "This preview attempt expired. Reopen the quiz to try again." });
        return;
      }
      const previous = attempt.answers.get(parsed.data.questionId);
      if (previous) {
        if (previous.optionIndex !== parsed.data.optionIndex) { json(reply, 409, { error: "This question was already answered. Reopen the quiz to start a new practice attempt." }); return; }
        if (previous.result) { json(reply, 200, previous.result); return; }
        json(reply, 409, { error: "This answer is already being checked." });
        return;
      }
      attempt.answers.set(parsed.data.questionId, { optionIndex: parsed.data.optionIndex, result: null });
      const quiz = await repositories.quizzes.getForReview(id.data);
      const question = quiz?.status === "approved" ? quiz.questions.find(item => item.id === parsed.data.questionId && item.reviewStatus === "approved") : undefined;
      if (!question || parsed.data.optionIndex >= question.options.length) {
        attempt.answers.delete(parsed.data.questionId);
        json(reply, 404, { error: "This question is not available in the approved quiz." });
        return;
      }
      const correctOption = question.options.find(option => option.isCorrect);
      if (!correctOption) {
        attempt.answers.delete(parsed.data.questionId);
        json(reply, 409, { error: "This question has no approved answer." });
        return;
      }
      const result = StudentPreviewAnswerResult.parse({
        correct: question.options[parsed.data.optionIndex]?.isCorrect === true,
        correctAnswer: correctOption.text,
      });
      attempt.answers.set(question.id, { optionIndex: parsed.data.optionIndex, result });
      attempt.expiresAt = Date.now() + 30 * 60_000;
      json(reply, 200, result);
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
      if (options.lanAccessCode && request.headers["x-ai-demo-access-code"] !== options.lanAccessCode) {
        json(reply, 403, { error: "This LAN demo requires its private share link." });
        return;
      }
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
