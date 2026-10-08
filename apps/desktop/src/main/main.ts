import { app, BrowserWindow, dialog, ipcMain } from "electron";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, createRepositories } from "@ckadinti/database";
import { generateQuizRequestSchema, lessonIdSchema, lessonImportResultSchema, lessonListItemSchema, manualQuestionCreateSchema, questionIdSchema, questionReviewDecisionSchema, quizIdSchema, quizReorderSchema, reviewQuestionSaveSchema } from "@ckadinti/contracts";
import { z } from "zod";
import { importLessonFile } from "./services/lesson-import.js";
import { loadApprovedSnapshot } from "./services/approved-quiz.js";
import { generateQuizFromLesson, regenerateQuestionFromLesson } from "./services/quiz-generation.js";
import { commandHostedSession, createHostedQuizSession, getHostedSessionResults, getHostedSessionState, listHostedSessions } from "./services/runtime-host.js";
import { createTeacherContentApi } from "./services/teacher-content-api.js";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
if (!app.isPackaged) dotenv.config({ path: path.resolve(currentDirectory, "../../../../.env") });

let repositories: ReturnType<typeof createRepositories> | undefined;
let databaseConnection: ReturnType<typeof createDatabase> | undefined;

function getRepositories(): ReturnType<typeof createRepositories> {
  if (repositories) return repositories;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL to connect to PostgreSQL.");
  databaseConnection = createDatabase(connectionString);
  repositories = createRepositories(databaseConnection.db);
  return repositories;
}

async function authorizeBrowserTeacher(token: string): Promise<boolean> {
  const response = await fetch("http://127.0.0.1:4310/api/v1/teachers/me", {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(3_000),
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error("teacher_auth_unavailable");
  const result = z.object({ teacher: z.object({ role: z.string(), mustChangePassword: z.boolean() }) }).safeParse(await response.json());
  return result.success && result.data.teacher.role === "teacher" && !result.data.teacher.mustChangePassword;
}

const teacherContentApi = createTeacherContentApi({ getRepositories, authorizeTeacher: authorizeBrowserTeacher });

function registerIpc(): void {
  const hostResult = async (operation: () => unknown | Promise<unknown>) => {
    try { return { ok: true, data: await operation() }; }
    catch (error) { return { ok: false, error: { code: "HOST_REQUEST_FAILED", message: error instanceof Error ? error.message : "Could not reach the classroom host." } }; }
  };
  ipcMain.handle("teacher:list-host-sessions", () => hostResult(listHostedSessions));
  ipcMain.handle("teacher:host-state", (_event, code: unknown) => hostResult(() => getHostedSessionState(code)));
  ipcMain.handle("teacher:host-command", (_event, code: unknown, command: unknown) => hostResult(() => commandHostedSession(code, command)));
  ipcMain.handle("teacher:host-results", (_event, code: unknown) => hostResult(() => getHostedSessionResults(code)));
  ipcMain.handle("teacher:import-lesson", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Lesson files", extensions: ["txt", "md", "pdf", "docx"] },
      ],
    });

    if (result.canceled || !result.filePaths[0]) return { ok: true, data: null };
    try {
      const imported = await importLessonFile(result.filePaths[0], getRepositories());
      const data = lessonImportResultSchema.parse({ duplicate: imported.duplicate, lesson: imported.lesson });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "LESSON_IMPORT_FAILED", message: error instanceof Error ? error.message : "Lesson import failed." } };
    }
  });

  ipcMain.handle("teacher:list-lessons", async () => {
    try {
      const data = (await getRepositories().lessons.list()).map((lesson) => lessonListItemSchema.parse(lesson));
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "LESSON_LIST_FAILED", message: error instanceof Error ? error.message : "Could not load lessons." } };
    }
  });

  ipcMain.handle("teacher:get-lesson", async (_event, value: unknown) => {
    const parsed = lessonIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_LESSON_ID", message: "The lesson id is invalid." } };
    try {
      const data = await getRepositories().lessons.get(parsed.data);
      if (!data) return { ok: false, error: { code: "LESSON_NOT_FOUND", message: "The lesson could not be found." } };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "LESSON_READ_FAILED", message: error instanceof Error ? error.message : "Could not load lesson." } };
    }
  });

  ipcMain.handle("teacher:list-quizzes", async () => {
    try {
      return { ok: true, data: await getRepositories().quizzes.list() };
    } catch (error) {
      return { ok: false, error: { code: "QUIZ_LIST_FAILED", message: error instanceof Error ? error.message : "Could not load quizzes." } };
    }
  });

  ipcMain.handle("teacher:get-settings-status", async () => {
    const aiProvider = process.env.AI_PROVIDER?.trim() || (process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai");
    const model = process.env.AI_MODEL?.trim() || (aiProvider === "gemini"
      ? process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash"
      : aiProvider === "kilo" ? process.env.KILO_MODEL?.trim() || "nvidia/nemotron-3-super-120b-a12b:free"
      : process.env.OPENAI_MODEL?.trim() || "gpt-6-astra");
    let databaseConnected = false;
    try {
      await getRepositories().lessons.list();
      databaseConnected = true;
    } catch {
      // Report configuration state only; never return connection strings or driver errors to the renderer.
    }
    return {
      ok: true,
      data: {
        databaseConnected,
        aiProvider,
        aiConfigured: aiProvider === "kilo" ? model.endsWith(":free") : aiProvider === "gemini" ? Boolean(process.env.GEMINI_API_KEY?.trim()) : Boolean(process.env.OPENAI_API_KEY?.trim()),
        model,
        sourceFormats: ["TXT", "Markdown", "text or scanned PDF", "DOCX"],
      },
    };
  });

  ipcMain.handle("teacher:get-quiz-review", async (_event, value: unknown) => {
    const parsed = quizIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUIZ_ID", message: "The quiz id is invalid." } };
    try {
      const repositories = getRepositories();
      const quiz = await repositories.quizzes.getForReview(parsed.data);
      if (!quiz) return { ok: false, error: { code: "QUIZ_NOT_FOUND", message: "The quiz could not be found." } };
      const lesson = quiz.lessonId ? await repositories.lessons.get(quiz.lessonId) : null;
      const data = {
        ...quiz,
        questions: quiz.questions.map((question) => ({
          ...question,
          evidence: question.evidence.map((item) => ({
            ...item,
            blockOrdinal: lesson?.blocks.find((block) => block.id === item.lessonBlockId)?.ordinal ?? null,
            quote: lesson?.normalizedText.slice(item.quoteStart, item.quoteEnd) ?? "",
          })),
        })),
      };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "QUIZ_REVIEW_LOAD_FAILED", message: error instanceof Error ? error.message : "Could not load quiz review." } };
    }
  });

  ipcMain.handle("teacher:save-review-question", async (_event, value: unknown) => {
    const parsed = reviewQuestionSaveSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUESTION", message: parsed.error.issues[0]?.message ?? "Question details are invalid." } };
    try {
      const repositories = getRepositories();
      const { questionId, options, ...patch } = parsed.data;
      const question = await repositories.questions.update(questionId, patch);
      if (!question) return { ok: false, error: { code: "QUESTION_NOT_FOUND", message: "The question could not be found." } };
      await repositories.questions.replaceOptions(questionId, options);
      return { ok: true, data: { questionId, reviewStatus: "needs-review" as const } };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_SAVE_FAILED", message: error instanceof Error ? error.message : "Could not save the question." } };
    }
  });

  ipcMain.handle("teacher:set-question-review", async (_event, value: unknown) => {
    const parsed = questionReviewDecisionSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_REVIEW_DECISION", message: "Choose approve or reject for a valid question." } };
    try {
      const question = await getRepositories().questions.setReviewStatus(parsed.data.questionId, parsed.data.reviewStatus);
      if (!question) return { ok: false, error: { code: "QUESTION_NOT_FOUND", message: "The question could not be found." } };
      return { ok: true, data: { questionId: question.id, reviewStatus: question.reviewStatus } };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_REVIEW_FAILED", message: error instanceof Error ? error.message : "Could not update question review." } };
    }
  });

  ipcMain.handle("teacher:create-manual-question", async (_event, value: unknown) => {
    const parsed = manualQuestionCreateSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_MANUAL_QUESTION", message: parsed.error.issues[0]?.message ?? "Question details are invalid." } };
    try {
      const question = await getRepositories().questions.createManual(parsed.data);
      return question ? { ok: true, data: { questionId: question.id } } : { ok: false, error: { code: "QUIZ_NOT_FOUND", message: "The target quiz could not be found." } };
    } catch (error) {
      return { ok: false, error: { code: "MANUAL_QUESTION_CREATE_FAILED", message: error instanceof Error ? error.message : "Could not add the question." } };
    }
  });

  ipcMain.handle("teacher:duplicate-question", async (_event, value: unknown) => {
    const parsed = questionIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUESTION_ID", message: "The question id is invalid." } };
    try {
      const question = await getRepositories().questions.duplicate(parsed.data);
      return question ? { ok: true, data: { questionId: question.id } } : { ok: false, error: { code: "QUESTION_NOT_FOUND", message: "The source question could not be found." } };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_DUPLICATE_FAILED", message: error instanceof Error ? error.message : "Could not duplicate the question." } };
    }
  });

  ipcMain.handle("teacher:approve-pending-questions", async (_event, value: unknown) => {
    const parsed = quizIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUIZ_ID", message: "The quiz id is invalid." } };
    try {
      const count = await getRepositories().questions.approvePending(parsed.data);
      return { ok: true, data: { count } };
    } catch (error) {
      return { ok: false, error: { code: "BULK_APPROVAL_FAILED", message: error instanceof Error ? error.message : "Could not approve pending questions." } };
    }
  });

  ipcMain.handle("teacher:delete-review-question", async (_event, value: unknown) => {
    const parsed = questionIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUESTION_ID", message: "The question id is invalid." } };
    try {
      const deleted = await getRepositories().questions.delete(parsed.data);
      return deleted ? { ok: true, data: { questionId: parsed.data } } : { ok: false, error: { code: "QUESTION_NOT_FOUND", message: "The question could not be found." } };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_DELETE_FAILED", message: error instanceof Error ? error.message : "Could not delete the question." } };
    }
  });

  ipcMain.handle("teacher:reorder-review-questions", async (_event, value: unknown) => {
    const parsed = quizReorderSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUESTION_ORDER", message: "The question order is invalid." } };
    try {
      await getRepositories().questions.reorder(parsed.data.quizId, parsed.data.orderedQuestionIds);
      return { ok: true, data: null };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_REORDER_FAILED", message: error instanceof Error ? error.message : "Could not reorder questions." } };
    }
  });

  ipcMain.handle("teacher:approve-quiz", async (_event, value: unknown) => {
    const parsed = quizIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUIZ_ID", message: "The quiz id is invalid." } };
    try {
      const quiz = await getRepositories().quizzes.approve(parsed.data);
      return quiz ? { ok: true, data: { quizId: quiz.id, status: quiz.status } } : { ok: false, error: { code: "QUIZ_NOT_FOUND", message: "The quiz could not be found." } };
    } catch (error) {
      return { ok: false, error: { code: "QUIZ_APPROVAL_FAILED", message: error instanceof Error ? error.message : "Approve every question before approving the quiz." } };
    }
  });

  ipcMain.handle("teacher:export-approved-snapshot", async (_event, value: unknown) => {
    const parsed = quizIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUIZ_ID", message: "The quiz id is invalid." } };
    try {
      const data = await loadApprovedSnapshot(parsed.data, getRepositories());
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "SNAPSHOT_EXPORT_FAILED", message: error instanceof Error ? error.message : "Could not export this quiz." } };
    }
  });

  ipcMain.handle("teacher:create-host-session", async (_event, value: unknown) => {
    const request = z.object({
      quizId: quizIdSchema,
      email: z.string().trim().email().max(254),
      password: z.string().min(1).max(128),
    }).safeParse(value);
    if (!request.success) return { ok: false, error: { code: "INVALID_HOST_REQUEST", message: "Enter a valid teacher email and password." } };
    try {
      const snapshot = await loadApprovedSnapshot(request.data.quizId, getRepositories());
      const data = await createHostedQuizSession(snapshot, request.data.email, request.data.password);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: { code: "HOST_SESSION_CREATE_FAILED", message: error instanceof Error ? error.message : "Could not start this classroom session." } };
    }
  });

  ipcMain.handle("teacher:generate-quiz", async (_event, value: unknown) => {
    const parsed = generateQuizRequestSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_GENERATION_REQUEST", message: "Choose a lesson and request between 3 and 20 questions." } };
    try {
      return { ok: true, data: await generateQuizFromLesson(parsed.data.lessonId, parsed.data.questionCount, getRepositories()) };
    } catch (error) {
      return { ok: false, error: { code: "QUIZ_GENERATION_FAILED", message: error instanceof Error ? error.message : "Quiz generation failed." } };
    }
  });

  ipcMain.handle("teacher:regenerate-question", async (_event, value: unknown) => {
    const parsed = questionIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_QUESTION_ID", message: "The question id is invalid." } };
    try {
      return { ok: true, data: await regenerateQuestionFromLesson(parsed.data, getRepositories()) };
    } catch (error) {
      return { ok: false, error: { code: "QUESTION_REGENERATION_FAILED", message: error instanceof Error ? error.message : "Question regeneration failed." } };
    }
  });
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(currentDirectory, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  try { await teacherContentApi.listen(); }
  catch (error) { console.error("The local teacher-content API could not start.", error); }
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void teacherContentApi.close();
  void databaseConnection?.close();
});
