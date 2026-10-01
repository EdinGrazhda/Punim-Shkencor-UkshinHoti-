import { StrictMode, useEffect, useState } from "react";
import type { JSX } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Page = "Dashboard" | "Lessons" | "Quizzes" | "Games" | "Reports" | "Settings";
type LessonSummary = { id: string; title: string; subject: string | null; language: string; sourceType: string; originalFilename: string | null; createdAt: string; updatedAt: string };
type LessonDetail = LessonSummary & { normalizedText: string; blocks: Array<{ id: string; ordinal: number; heading: string | null; charStart: number; charEnd: number }> };
type QuizSummary = { id: string; lessonId: string | null; title: string; language: string; difficulty: string; status: string; updatedAt: string };

function TeacherApp(): JSX.Element {
  const [page, setPage] = useState<Page>("Dashboard");
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonDetail | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [generating, setGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState(8);

  async function refreshLessons(): Promise<void> {
    const result = await window.teacherBridge.listLessons();
    if (result.ok && result.data) setLessons(result.data as LessonSummary[]);
    else if (result.error) setError(result.error.message);
  }

  async function refreshQuizzes(): Promise<void> {
    const result = await window.teacherBridge.listQuizzes();
    if (result.ok && result.data) setQuizzes(result.data as QuizSummary[]);
    else if (result.error) setError(result.error.message);
  }

  useEffect(() => {
    void refreshLessons().catch(() => setError("Could not connect to the local PostgreSQL database."));
    void refreshQuizzes().catch(() => setError("Could not load saved quizzes."));
  }, []);

  async function generateQuiz(): Promise<void> {
    if (!selectedLesson) return;
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const result = await window.teacherBridge.generateQuiz(selectedLesson.id, questionCount);
      if (!result.ok || !result.data) setError(result.error?.message ?? "Quiz generation failed.");
      else {
        setNotice(`Created “${result.data.title}” with ${result.data.questionCount} questions. All questions need teacher review.`);
        await refreshQuizzes();
      }
    } catch {
      setError("Quiz generation failed. Check your OpenAI configuration and try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function chooseLesson(): Promise<void> {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await window.teacherBridge.importLesson();
      if (!result.ok) {
        setError(result.error?.message ?? "Lesson import failed.");
      } else if (result.data) {
        await refreshLessons();
        setPage("Lessons");
        setNotice(result.data.duplicate ? "This lesson was already in your library." : `Imported “${result.data.lesson.title}”.`);
        await openLesson(result.data.lesson.id);
      }
    } catch {
      setError("Could not connect to PostgreSQL. Check DATABASE_URL and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function openLesson(id: string): Promise<void> {
    setError("");
    const result = await window.teacherBridge.getLesson(id);
    if (result.ok && result.data) setSelectedLesson(result.data as LessonDetail);
    else if (result.error) setError(result.error.message);
  }

  function renderDashboard(): JSX.Element {
    return <>
      <section className="hero-card">
        <div>
          <p className="eyebrow accent">Prepare a Cyber Raid</p>
          <h2>Turn your lesson into a reviewed classroom mission.</h2>
          <p>Import a lesson, generate draft questions, review every item, then host a Cyber Raid over your LAN.</p>
          <button className="primary" disabled={importing} onClick={chooseLesson} type="button">{importing ? "Importing..." : "Import lesson"}</button>
          {notice && <p className="file-note" role="status">{notice}</p>}
          {error && <p className="error-note" role="alert">{error}</p>}
        </div>
        <div className="mission-art" aria-hidden="true"><span>UPLINK</span><span>FIREWALL</span><span>DATA NODE</span></div>
      </section>
      <section className="stats" aria-label="Workspace summary">
        <article><span>Lessons</span><strong>{lessons.length}</strong><small>In your library</small></article>
        <article><span>Draft quizzes</span><strong>{quizzes.filter((quiz) => quiz.status !== "approved").length}</strong><small>Awaiting review</small></article>
        <article><span>Game sessions</span><strong>0</strong><small>Hosted locally</small></article>
      </section>
    </>;
  }

  function renderLessons(): JSX.Element {
    return <section className="library-layout">
      <div className="library-panel">
        <div className="section-heading"><div><p className="eyebrow accent">Lesson library</p><h2>Source material</h2></div><button className="secondary" disabled={importing} onClick={chooseLesson} type="button">Import lesson</button></div>
        {notice && <p className="file-note" role="status">{notice}</p>}
        {lessons.length === 0 ? <div className="empty-state"><strong>No lessons yet</strong><span>Import TXT, Markdown, text PDF, or DOCX content to begin.</span></div> : <div className="lesson-list">{lessons.map((lesson) => <button className={selectedLesson?.id === lesson.id ? "lesson-card selected" : "lesson-card"} key={lesson.id} onClick={() => void openLesson(lesson.id)} type="button"><span className="lesson-type">{lesson.sourceType}</span><strong>{lesson.title}</strong><small>{lesson.originalFilename ?? "Imported lesson"}</small></button>)}</div>}
      </div>
      <div className="detail-panel">{selectedLesson ? <><p className="eyebrow accent">Source evidence</p><h2>{selectedLesson.title}</h2><p className="detail-meta">{selectedLesson.blocks.length} source blocks · {selectedLesson.language.toUpperCase()} · {selectedLesson.sourceType}</p><div className="generation-controls"><label htmlFor="question-count">Questions to generate</label><select id="question-count" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[3, 5, 8, 10, 15, 20].map((count) => <option key={count} value={count}>{count} questions</option>)}</select><button className="primary" disabled={generating} onClick={() => void generateQuiz()} type="button">{generating ? "Generating…" : "Generate draft quiz"}</button></div>{notice && <p className="file-note" role="status">{notice}</p>}{error && <p className="error-note" role="alert">{error}</p>}<div className="blocks">{selectedLesson.blocks.map((block) => <article className="source-block" key={block.id}><span>Block {block.ordinal + 1}</span>{block.heading && <strong>{block.heading}</strong>}<p>{selectedLesson.normalizedText.slice(block.charStart, block.charEnd)}</p></article>)}</div></> : <div className="empty-state detail-empty"><strong>Select a lesson</strong><span>Review source blocks here before generating a Cyber Raid quiz.</span></div>}</div>
    </section>;
  }

  return <main className="shell">
    <aside className="sidebar"><div className="brand">CkaDinTi</div><p className="eyebrow">Teacher workspace</p><nav aria-label="Teacher navigation">{(["Dashboard", "Lessons", "Quizzes", "Games", "Reports", "Settings"] as Page[]).map((item) => <button className={page === item ? "nav-item active" : "nav-item"} key={item} onClick={() => setPage(item)} type="button">{item}</button>)}</nav></aside>
    <section className="content"><header className="topbar"><div><p className="eyebrow">Local classroom control</p><h1>{page === "Dashboard" ? "Good morning, teacher" : page}</h1></div><span className="status"><span className="status-dot" /> Ready for Cyber Raid</span></header>{page === "Dashboard" ? renderDashboard() : page === "Lessons" ? renderLessons() : page === "Quizzes" ? <section className="quiz-list">{quizzes.length ? quizzes.map((quiz) => <article className="source-block" key={quiz.id}><p className="eyebrow accent">{quiz.status === "approved" ? "Approved" : "Teacher review required"}</p><h2>{quiz.title}</h2><p>{quiz.difficulty} · {quiz.language.toUpperCase()}</p></article>) : <div className="empty-state page-placeholder"><strong>No quizzes yet</strong><span>Select a lesson and generate a draft quiz to begin teacher review.</span></div>}</section> : <div className="empty-state page-placeholder"><strong>{page} is next</strong><span>Arron’s lesson library is ready for the reviewed quiz workflow.</span></div>}</section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><TeacherApp /></StrictMode>);
