import { StrictMode, useEffect, useState } from "react";
import type { JSX } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function TeacherApp(): JSX.Element {
  const [lessonCount, setLessonCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void window.teacherBridge.listLessons().then((result) => {
      if (result.ok && result.data) setLessonCount(result.data.length);
      else if (result.error) setError(result.error.message);
    }).catch(() => setError("Could not connect to the local PostgreSQL database."));
  }, []);

  async function chooseLesson(): Promise<void> {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const result = await window.teacherBridge.importLesson();
      if (!result.ok) {
        setError(result.error?.message ?? "Lesson import failed.");
      } else if (result.data) {
        const lessons = await window.teacherBridge.listLessons();
        if (lessons.ok && lessons.data) setLessonCount(lessons.data.length);
        setNotice(result.data.duplicate ? "This lesson was already in your library." : `Imported “${result.data.lesson.title}”.`);
      }
    } catch {
      setError("Could not connect to PostgreSQL. Check DATABASE_URL and try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">CkaDinTi</div>
        <p className="eyebrow">Teacher workspace</p>
        <nav aria-label="Teacher navigation">
          {['Dashboard', 'Lessons', 'Quizzes', 'Games', 'Reports', 'Settings'].map((item, index) => (
            <button className={index === 0 ? 'nav-item active' : 'nav-item'} key={item} type="button">
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local classroom control</p>
            <h1>Good morning, teacher</h1>
          </div>
          <span className="status"><span className="status-dot" /> Ready offline</span>
        </header>
        <section className="hero-card">
          <div>
            <p className="eyebrow accent">Start a lesson</p>
            <h2>Turn your lesson into a reviewed classroom quiz.</h2>
            <p>Import a lesson, generate draft questions, review every item, then host a LAN game.</p>
            <button className="primary" disabled={importing} onClick={chooseLesson} type="button">{importing ? "Importing..." : "Import lesson"}</button>
            {notice && <p className="file-note" role="status">{notice}</p>}
            {error && <p className="error-note" role="alert">{error}</p>}
          </div>
          <div className="mission-art" aria-hidden="true"><span>UPLINK</span><span>FIREWALL</span><span>DATA NODE</span></div>
        </section>
        <section className="stats" aria-label="Workspace summary">
          <article><span>Lessons</span><strong>{lessonCount}</strong><small>In your library</small></article>
          <article><span>Draft quizzes</span><strong>0</strong><small>Awaiting review</small></article>
          <article><span>Game sessions</span><strong>0</strong><small>Hosted locally</small></article>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><TeacherApp /></StrictMode>);
