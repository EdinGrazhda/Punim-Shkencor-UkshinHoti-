import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TeacherQuizStudio } from "./TeacherQuizStudio";
import "./styles.css";

function AiDemo() {
  const [session, setSession] = useState<{ token: string; provider: string } | null>(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    void fetch("/api/ai-demo/session").then(async response => {
      if (!response.ok) throw new Error("Start the demo with pnpm dev:ai-demo and open port 4175.");
      setSession(await response.json());
    }).catch(cause => setError(String(cause.message)));
  }, []);

  return <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px" }}>
    <div className="teacher-studio-message" role="status">
      <div><strong>AI quiz demo · no database or sign-in required</strong>
        <p>Lessons and quizzes stay in memory until this demo server stops. Live classroom sessions are unavailable here.</p>
        {session?.provider === "kilo" && <p>Using Kilo’s free AI endpoint. Lesson text is sent to the provider and may be logged or used to improve its services. Use non-confidential sample lessons.</p>}
        <a href="/api/ai-demo/sample" download="CkaDinTi_HTML_Lesson.pdf">Download the sample HTML lesson PDF</a>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {session && <TeacherQuizStudio authToken={session.token} hostingEnabled={false} onCreateSession={async () => {}} busy={false} questionSeconds={seconds} setQuestionSeconds={setSeconds} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<AiDemo />);
