import assert from "node:assert/strict";

// Opt-in live test: start pnpm dev:ai-demo first. Uses only the bundled sample lesson.
const base = "http://127.0.0.1:4175";
const questionCount = Number(process.argv[2] ?? 8);
assert.ok(Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 200, "Choose a whole count from 1 to 200.");
async function request(path, init) {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(4 * 120_000 * Math.ceil(questionCount / 8) + 30_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error ?? "Demo request failed"}`);
  return data;
}
const session = await request("/api/ai-demo/session");
assert.equal(session.provider, "kilo", "This live smoke test requires the free Kilo provider.");
const pdf = await fetch(`${base}/api/ai-demo/sample`);
assert.equal(pdf.status, 200, "The sample PDF must be available.");
const headers = { Authorization: `Bearer ${session.token}` };
const { lesson } = await request("/api/teacher-content/v1/lessons", {
  method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "X-Lesson-Filename": "CkaDinTi_HTML_Lesson.pdf" },
  body: await pdf.arrayBuffer(),
});
const source = await request(`/api/teacher-content/v1/lessons/${lesson.id}`, { headers });
const draft = await request(`/api/teacher-content/v1/lessons/${lesson.id}/generate`, {
  method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ questionCount }),
});
const quiz = await request(`/api/teacher-content/v1/quizzes/${draft.quizId}`, { headers });
assert.equal(quiz.questions.length, questionCount);
assert.equal(quiz.status, "needs-review");
for (const question of quiz.questions) {
  assert.equal(question.reviewStatus, "needs-review");
  assert.equal(question.options.filter(option => option.isCorrect).length, 1);
  assert.ok(question.evidence.length > 0);
  for (const evidence of question.evidence) {
    assert.ok(evidence.quote.length > 0);
    assert.equal(source.normalizedText.slice(evidence.quoteStart, evidence.quoteEnd), evidence.quote);
  }
}
console.log(JSON.stringify({
  result: "PASS: live PDF import and free AI quiz generation, without PostgreSQL",
  title: quiz.title, questionCount: quiz.questions.length, status: quiz.status,
  sampleQuestions: quiz.questions.slice(0, 2).map(question => ({
    prompt: question.prompt, correctAnswer: question.options.find(option => option.isCorrect).text,
  })),
}, null, 2));
