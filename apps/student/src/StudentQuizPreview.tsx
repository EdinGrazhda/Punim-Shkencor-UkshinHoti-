import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { quizIdSchema, StudentQuizPreview as previewSchema, type StudentQuizPreview as Preview } from "@ckadinti/contracts";
import { Badge, Button, Card } from "./ui";
import "./styles.css";

function StudentQuizPreview() {
  const [quiz, setQuiz] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const id = quizIdSchema.safeParse(new URLSearchParams(window.location.search).get("quiz"));
    if (!id.success) { setError("This preview link is invalid. Ask the teacher for a new link."); return; }
    void fetch(`/api/ai-demo/quizzes/${id.data}/student-preview`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("The demo server could not load this preview. Restart the demo after rebuilding shared contracts, then approve a new quiz.");
        }
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "This preview is unavailable.");
        setQuiz(previewSchema.parse(body));
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the preview.");
      });
    return () => controller.abort();
  }, []);
  const question = quiz?.questions[index];
  return <main className="student-quiz-preview">
    <Badge>LOCAL STUDENT PREVIEW</Badge>
    <h1>{quiz?.title ?? "Student quiz preview"}</h1>
    <p>This is a temporary preview on this computer, not a live classroom game. Choices stay in this tab and are not graded or saved. Correct answers are hidden.</p>
    {error ? <Card><p role="alert">{error}</p></Card> : !quiz ? <p role="status">Loading approved quiz…</p> : finished ? <Card>
      <h2>Preview completed</h2><p role="status">You selected an answer for {Object.keys(answers).length} of {quiz.questions.length} questions. No score or answer key is shown in this preview.</p>
      <Button onClick={() => { setFinished(false); setIndex(0); }}>Review my choices</Button>
    </Card> : question && <Card>
      <p>Question {index + 1} of {quiz.questions.length}</p>
      <fieldset><legend>{question.prompt}</legend>
        {question.options.map((option, optionIndex) => <label className="student-preview-option" key={optionIndex}>
          <input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => setAnswers(current => ({ ...current, [question.id]: optionIndex }))} />
          <span>{option}</span>
        </label>)}
      </fieldset>
      <div className="student-preview-navigation">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex(current => current - 1)}>Previous</Button>
        <Button disabled={answers[question.id] === undefined} onClick={() => index + 1 === quiz.questions.length ? setFinished(true) : setIndex(current => current + 1)}>{index + 1 === quiz.questions.length ? "Finish preview" : "Next question"}</Button>
      </div>
    </Card>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StudentQuizPreview />);
