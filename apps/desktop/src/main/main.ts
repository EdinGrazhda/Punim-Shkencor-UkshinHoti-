import { app, BrowserWindow, dialog, ipcMain } from "electron";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, createRepositories } from "@ckadinti/database";
import { generateQuizRequestSchema, lessonIdSchema, lessonImportResultSchema, lessonListItemSchema } from "@ckadinti/contracts";
import { importLessonFile } from "./services/lesson-import.js";
import { generateQuizFromLesson } from "./services/quiz-generation.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
if (!app.isPackaged) dotenv.config({ path: path.resolve(currentDirectory, "../../../.env") });

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

function registerIpc(): void {
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

  ipcMain.handle("teacher:generate-quiz", async (_event, value: unknown) => {
    const parsed = generateQuizRequestSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: { code: "INVALID_GENERATION_REQUEST", message: "Choose a lesson and request between 3 and 20 questions." } };
    try {
      return { ok: true, data: await generateQuizFromLesson(parsed.data.lessonId, parsed.data.questionCount, getRepositories()) };
    } catch (error) {
      return { ok: false, error: { code: "QUIZ_GENERATION_FAILED", message: error instanceof Error ? error.message : "Quiz generation failed." } };
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
      preload: path.join(currentDirectory, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(currentDirectory, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void databaseConnection?.close();
});
