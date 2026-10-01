import { StrictMode, useState } from "react";
import type { JSX } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function TeacherApp(): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  async function chooseLesson(): Promise<void> {
    const file = await window.teacherBridge.selectLessonFile();
    setSelectedFile(file);
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
            <button className="primary" onClick={chooseLesson} type="button">Import lesson</button>
            {selectedFile && <p className="file-note">Selected: {selectedFile}</p>}
          </div>
          <div className="mission-art" aria-hidden="true"><span>UPLINK</span><span>FIREWALL</span><span>DATA NODE</span></div>
        </section>
        <section className="stats" aria-label="Workspace summary">
          <article><span>Lessons</span><strong>0</strong><small>Ready to import</small></article>
          <article><span>Draft quizzes</span><strong>0</strong><small>Awaiting review</small></article>
          <article><span>Game sessions</span><strong>0</strong><small>Hosted locally</small></article>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><TeacherApp /></StrictMode>);
