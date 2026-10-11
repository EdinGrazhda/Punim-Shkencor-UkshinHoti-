// Run inside the local Compose teacher-content container through stdin:
// Get-Content scripts/smoke-browser-content.mjs -Raw | docker compose exec -T teacher-content node --input-type=module
// Add `-e SMOKE_GENERATE=1` before teacher-content to test the configured AI provider too.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

if (new URL(process.env.DATABASE_URL).hostname !== 'postgres') throw new Error('Run only in the local Compose demo.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const id = randomUUID();
const email = `import-smoke-${id}@example.test`;
const password = randomBytes(32).toString('hex');
const salt = randomBytes(16).toString('hex');
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const createdLessons = [];
const createdQuizzes = [];
const base = 'http://student';
let token;
async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init, signal: AbortSignal.timeout(240_000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
function pdf(text) {
  let doc = '%PDF-1.4\n%' + 'x'.repeat(1_100_000) + '\n';
  const stream = `BT /F1 12 Tf 30 760 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(doc);
    doc += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(doc);
  doc += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(doc);
}
try {
  await pool.query('INSERT INTO teachers(id,name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,$5,false)', [id, 'Disposable import verification', email, passwordHash, 'teacher']);
  const session = await request('/api/v1/teachers/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  token = session.token;
  assert.ok(token, 'Teacher login must return a token');
  const source = 'HTML defines the structure of a web page. CSS controls its appearance. JavaScript adds interactive behavior. An anchor element creates a link. A list item belongs inside a list. The title element names the browser tab.';
  for (const [filename, body, expected] of [
    [`smoke-${id}.txt`, `${source}\nVerification ${id}`, 'txt'],
    [`smoke-${id}.pdf`, pdf(`HTML defines page structure. Verification ${id}`), 'pdf'],
  ]) {
    const result = await request('/api/teacher-content/v1/lessons', {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Lesson-Filename': encodeURIComponent(filename) }, body,
    });
    if (!result.duplicate) createdLessons.push(result.lesson.id);
    assert.equal(result.lesson.sourceType, expected);
    const lesson = await request(`/api/teacher-content/v1/lessons/${result.lesson.id}`);
    assert.match(lesson.normalizedText, /HTML defines/);
    console.log(`${expected.toUpperCase()} upload through web proxy: passed`);
  }
  if (process.env.SMOKE_GENERATE === '1') {
    const draft = await request(`/api/teacher-content/v1/lessons/${createdLessons[0]}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionCount: 3 }),
    });
    createdQuizzes.push(draft.quizId);
    const quiz = await request(`/api/teacher-content/v1/quizzes/${draft.quizId}`);
    assert.equal(quiz.questions.length, 3);
    assert.equal(quiz.status, 'needs-review');
    console.log('Live AI generation through web proxy: 3 questions, awaiting teacher review');
  }
} finally {
  // Delete only records created by this verification run, never existing lessons.
  for (const quizId of createdQuizzes) await pool.query('DELETE FROM quizzes WHERE id=$1', [quizId]);
  for (const lessonId of createdLessons) await pool.query('DELETE FROM lessons WHERE id=$1', [lessonId]);
  await pool.query('DELETE FROM teachers WHERE id=$1 AND email=$2', [id, email]);
  await pool.end();
  console.log('Disposable verification records cleaned up');
}
