import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  generateQuizRequestSchema,
  MAX_LESSON_FILE_BYTES,
  lessonImportResultSchema,
  lessonIdSchema,
  questionIdSchema,
  questionReviewDecisionSchema,
  quizIdSchema,
  reviewQuestionSaveSchema,
} from "@ckadinti/contracts";
import type { ContentRepositories } from "./content-repositories.js";
import { z } from "zod";
import { loadApprovedSnapshot } from "./approved-quiz.js";
import { importLessonBytes } from "./lesson-import.js";
import { generateQuizFromLesson, regenerateQuestionFromLesson } from "./quiz-generation.js";

type Repositories = ContentRepositories;

const API_PREFIX = "/api/teacher-content/v1";
const JSON_BODY_LIMIT = 64 * 1024;
const LESSON_BODY_LIMIT = MAX_LESSON_FILE_BYTES;
const generateBodySchema = generateQuizRequestSchema.pick({ questionCount: true });

export interface TeacherContentApiOptions {
  getRepositories: () => Repositories;
  authorizeTeacher: (token: string) => Promise<boolean>;
  port?: number;
  host?: string;
  allowedOrigins?: string[];
}

function sendJson(reply: ServerResponse, status: number, payload: unknown) {
  reply.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  reply.end(JSON.stringify(payload));
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error("request_too_large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage, schema: z.ZodTypeAny) {
  const body = await readBody(request, JSON_BODY_LIMIT);
  let value: unknown;
  try { value = JSON.parse(body.toString("utf8")) as unknown; }
  catch { throw new Error("invalid_json"); }
  return schema.parse(value);
}

function errorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  const message = error instanceof Error ? error.message : "request_failed";
  if (message === "request_too_large") return 413;
  if (message === "unsupported_media_type") return 415;
  if (message === "unauthorized") return 401;
  if (message === "teacher_auth_unavailable") return 503;
  if (/DATABASE_URL|ECONNREFUSED|password authentication failed|database .*does not exist/i.test(message)) return 503;
  if (/GEMINI_API_KEY|OPENAI_API_KEY|AI_PROVIDER must|KILO_MODEL must/i.test(message)) return 503;
  if (message === "not_found" || message.includes("could not be found")) return 404;
  if (message.includes("Every question must") || message.includes("before hosting")) return 409;
  if (message.startsWith("AI provider request failed")) return 502;
  return 400;
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "request_invalid";
  return error instanceof Error ? error.message : "request_failed";
}

export function createTeacherContentApi(options: TeacherContentApiOptions) {
  const allowedOrigins = new Set(options.allowedOrigins ?? ["http://localhost:4173", "http://127.0.0.1:4173"]);
  let server: Server | undefined;

  async function handle(request: IncomingMessage, reply: ServerResponse) {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      sendJson(reply, 403, { error: "origin_not_allowed" });
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(reply, 200, { ok: true, service: "ckadinti-teacher-content" });
      return;
    }

    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token || token.length > 512) {
      sendJson(reply, 401, { error: "unauthorized" });
      return;
    }
    let authorized: boolean;
    try { authorized = await options.authorizeTeacher(token); }
    catch {
      sendJson(reply, 503, { error: "teacher_auth_unavailable" });
      return;
    }
    if (!authorized) {
      sendJson(reply, 401, { error: "unauthorized" });
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (!url.pathname.startsWith(`${API_PREFIX}/`)) throw new Error("not_found");
      const parts = url.pathname.slice(API_PREFIX.length + 1).split("/").map((part) => decodeURIComponent(part));
      if (parts.some((part) => part === ".." || part.length > 128)) throw new Error("not_found");
      const repositories = options.getRepositories();

      if (request.method === "GET" && parts.length === 1 && parts[0] === "lessons") {
        sendJson(reply, 200, await repositories.lessons.list());
        return;
      }
      if (request.method === "POST" && parts.length === 1 && parts[0] === "lessons") {
        if (!request.headers["content-type"]?.startsWith("application/octet-stream")) throw new Error("unsupported_media_type");
        const filenameHeader = request.headers["x-lesson-filename"];
        if (typeof filenameHeader !== "string") throw new Error("Choose a lesson file.");
        let filename: string;
        try { filename = decodeURIComponent(filenameHeader); }
        catch { throw new Error("The lesson filename is invalid."); }
        const imported = await importLessonBytes(filename, await readBody(request, LESSON_BODY_LIMIT), repositories);
        sendJson(reply, 201, lessonImportResultSchema.parse({ duplicate: imported.duplicate, lesson: imported.lesson }));
        return;
      }
      if (request.method === "GET" && parts.length === 2 && parts[0] === "lessons") {
        const id = lessonIdSchema.parse(parts[1]);
        const lesson = await repositories.lessons.get(id);
        if (!lesson) throw new Error("not_found");
        sendJson(reply, 200, lesson);
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "lessons" && parts[2] === "generate") {
        const lessonId = lessonIdSchema.parse(parts[1]);
        const body = await readJson(request, generateBodySchema);
        sendJson(reply, 201, await generateQuizFromLesson(lessonId, body.questionCount, repositories));
        return;
      }
      if (request.method === "GET" && parts.length === 1 && parts[0] === "quizzes") {
        sendJson(reply, 200, await repositories.quizzes.list());
        return;
      }
      if (request.method === "DELETE" && parts.length === 2 && parts[0] === "quizzes") {
        const quizId = quizIdSchema.parse(parts[1]);
        if (!await repositories.quizzes.delete(quizId)) throw new Error("not_found");
        sendJson(reply, 200, { quizId, deleted: true });
        return;
      }
      if (request.method === "GET" && parts.length === 2 && parts[0] === "quizzes") {
        const quizId = quizIdSchema.parse(parts[1]);
        const quiz = await repositories.quizzes.getForReview(quizId);
        if (!quiz) throw new Error("not_found");
        const lesson = quiz.lessonId ? await repositories.lessons.get(quiz.lessonId) : null;
        sendJson(reply, 200, {
          ...quiz,
          questions: quiz.questions.map((question) => ({
            ...question,
            evidence: question.evidence.map((item) => ({
              ...item,
              blockOrdinal: lesson?.blocks.find((block) => block.id === item.lessonBlockId)?.ordinal ?? null,
              quote: lesson?.normalizedText.slice(item.quoteStart, item.quoteEnd) ?? "",
            })),
          })),
        });
        return;
      }
      if (request.method === "PATCH" && parts.length === 2 && parts[0] === "questions") {
        const questionId = questionIdSchema.parse(parts[1]);
        const body = await readJson(request, reviewQuestionSaveSchema);
        if (body.questionId !== questionId) throw new Error("question_id_mismatch");
        const { questionId: _id, options, ...patch } = body;
        const question = await repositories.questions.update(questionId, patch);
        if (!question) throw new Error("not_found");
        await repositories.questions.replaceOptions(questionId, options);
        sendJson(reply, 200, { questionId, reviewStatus: "needs-review" });
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "questions" && parts[2] === "decision") {
        const questionId = questionIdSchema.parse(parts[1]);
        const body = await readJson(request, questionReviewDecisionSchema);
        if (body.questionId !== questionId) throw new Error("question_id_mismatch");
        const question = await repositories.questions.setReviewStatus(questionId, body.reviewStatus);
        if (!question) throw new Error("not_found");
        sendJson(reply, 200, { questionId, reviewStatus: question.reviewStatus });
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "questions" && parts[2] === "regenerate") {
        const questionId = questionIdSchema.parse(parts[1]);
        sendJson(reply, 200, await regenerateQuestionFromLesson(questionId, repositories));
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "quizzes" && parts[2] === "approve") {
        const quizId = quizIdSchema.parse(parts[1]);
        const quiz = await repositories.quizzes.approve(quizId);
        if (!quiz) throw new Error("not_found");
        sendJson(reply, 200, { quizId, status: quiz.status });
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "quizzes" && parts[2] === "approve-all") {
        const quizId = quizIdSchema.parse(parts[1]);
        const quiz = await repositories.quizzes.approveAll(quizId);
        if (!quiz) throw new Error("not_found");
        sendJson(reply, 200, { quizId, status: quiz.status });
        return;
      }
      if (request.method === "POST" && parts.length === 3 && parts[0] === "quizzes" && parts[2] === "snapshot") {
        sendJson(reply, 200, await loadApprovedSnapshot(quizIdSchema.parse(parts[1]), repositories));
        return;
      }
      sendJson(reply, 404, { error: "not_found" });
    } catch (error) {
      request.resume();
      const status = errorStatus(error);
      const message = status === 503 && error instanceof Error && /DATABASE_URL|ECONNREFUSED|password authentication failed|database .*does not exist/i.test(error.message)
        ? "Teacher content database is unavailable. Check DATABASE_URL and apply the migrations."
          : status === 503 && error instanceof Error && /GEMINI_API_KEY|OPENAI_API_KEY|AI_PROVIDER must|KILO_MODEL must/i.test(error.message)
          ? error.message
          : errorMessage(error);
      sendJson(reply, status, { error: message });
    }
  }

  return {
    handle,
    listen(port = options.port ?? 4320) {
      server = createServer((request, reply) => { void handle(request, reply); });
      return new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server!.once("error", onError);
        server!.listen(port, options.host ?? "127.0.0.1", () => {
          server!.off("error", onError);
          resolve();
        });
      });
    },
    close() {
      if (!server?.listening) return Promise.resolve();
      return new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    },
    address() { return server?.address(); },
  };
}
