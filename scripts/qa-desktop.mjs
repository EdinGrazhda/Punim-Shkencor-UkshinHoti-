// Run after packaging with QA_DATABASE_URL pointing to a migrated, disposable database:
// node --import tsx scripts/qa-desktop.mjs
// PLAYWRIGHT_MODULE can point to a local playwright/index.mjs installation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.QA_DATABASE_URL) throw new Error("Set QA_DATABASE_URL to a migrated disposable PostgreSQL database.");
process.env.DATABASE_URL = process.env.QA_DATABASE_URL;
const { _electron: electron } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const { createDatabase, createRepositories } = await import("../packages/database/src/index.ts");
const { createRuntimeHost } = await import("../packages/runtime-host/src/server.ts");
const { hashPassword } = await import("../packages/runtime-host/src/teacher-auth.ts");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const database = createDatabase(process.env.QA_DATABASE_URL);
const repositories = createRepositories(database.db);
const host = createRuntimeHost();
const password = randomUUID();
const email = `${randomUUID()}@fixture.test`;
let app;
let lessonId;
let teacherId;
const output = fileURLToPath(new URL("../output/qa/", import.meta.url));
try {
  await host.teacherStore.init(); await host.studentStore.init();
  teacherId = (await host.teacherStore.create("QA teacher", email, await hashPassword(password), "teacher", false)).id;
  const lesson = await repositories.lessons.create({ title: "Desktop QA", language: "en", sourceType: "txt", normalizedText: "Water freezes at zero degrees.", contentSha256: randomUUID(), blocks: [{ heading: null, charStart: 0, charEnd: 30 }] });
  lessonId = lesson.lesson.id;
  const quiz = await repositories.quizzes.create({ lessonId, title: "Desktop QA quiz", language: "en", difficulty: "easy" });
  const question = await repositories.questions.createManual({ quizId: quiz.id, kind: "multiple-choice", prompt: "Water freezes at?", explanation: "Water freezes at zero degrees Celsius.", topic: "Water", difficulty: "easy", options: [{ text: "0°C", isCorrect: true }, { text: "100°C", isCorrect: false }] });
  await repositories.questions.setReviewStatus(question.id, "approved"); await repositories.quizzes.approve(quiz.id);
  await host.app.listen({ host: "127.0.0.1", port: 4310 });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.OPENAI_API_KEY;
  app = await electron.launch({ executablePath: require("electron"), args: [fileURLToPath(new URL("../apps/desktop", import.meta.url))], env });
  const page = await app.firstWindow();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Quizzes", exact: true }).click();
  await page.locator("article").filter({ hasText: "Desktop QA quiz" }).getByRole("button", { name: "Review quiz" }).click();
  await page.getByRole("button", { name: "Start LAN session" }).click();
  await page.getByLabel("Teacher email", { exact: true }).fill(email);
  await page.getByLabel("Teacher password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Authenticate and start" }).click();
  await page.getByRole("heading", { name: "Games", exact: true }).waitFor();
  const summary = await page.evaluate(async () => (await window.teacherBridge.listHostSessions()).data[0]);
  assert.equal(summary.title, "Desktop QA quiz"); assert.equal(summary.hostToken, undefined);
  const joined = await fetch(`http://127.0.0.1:4310/api/v1/sessions/${summary.code}/players`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "QA student" }) }).then(response => response.json());
  await page.getByText("QA student · Connected", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/desktop-games.png`, fullPage: true });
  const answer = await fetch(`http://127.0.0.1:4310/api/v1/sessions/${summary.code}/answers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${joined.playerToken}` }, body: JSON.stringify({ playerId: joined.player.id, questionIndex: 0, optionIndex: 0, idempotencyKey: randomUUID() }) }).then(response => response.json());
  assert.equal(answer.accepted, true);
  await page.getByRole("button", { name: "Reveal answer", exact: true }).click();
  await page.getByRole("button", { name: "Next question / finish", exact: true }).click();
  await page.getByRole("heading", { name: "Classroom results", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("heading", { name: "Classroom results", exact: true }).waitFor();
  await page.locator("summary").filter({ hasText: "QA student" }).click();
  await page.getByRole("cell", { name: "0°C", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/desktop-reports.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Electron desktop QA passed: real preload, PostgreSQL, teacher login, guest join, controls, and reports.");
} finally {
  await app?.close();
  if (lessonId) await repositories.lessons.delete(lessonId);
  if (teacherId) await host.teacherStore.deleteTeacher(teacherId);
  await host.app.close(); await database.close();
}
