import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { quizIdSchema, StudentQuizPreview as previewSchema, type StudentPreviewAnswerResult, type StudentQuizPreview as Preview } from "@ckadinti/contracts";
import { Badge, Button, Card } from "./ui";
import { studentQuizPreviewApi } from "./api";
import "./styles.css";

function StudentQuizPreview() {
  const [quiz, setQuiz] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, StudentPreviewAnswerResult>>({});
  const [checking, setChecking] = useState(false);
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
  async function selectAnswer(optionIndex: number) {
    if (!quiz || !question || results[question.id] || checking) return;
    setAnswers(current => ({ ...current, [question.id]: optionIndex }));
    setChecking(true);
    setError("");
    try {
      const result = await studentQuizPreviewApi.submitAnswer(quizIdSchema.parse(new URLSearchParams(window.location.search).get("quiz")), {
        attemptToken: quiz.attemptToken, questionId: question.id, optionIndex,
      });
      setResults(current => ({ ...current, [question.id]: result }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected answer could not be checked.");
    } finally { setChecking(false); }
  }

  const score = Object.values(results).filter(result => result.correct).length;
  return <main className="student-quiz-preview">
    <Badge>LOCAL STUDENT PREVIEW</Badge>
    <h1>{quiz?.title ?? "Student quiz preview"}</h1>
    <p>This is a temporary practice quiz on this computer. Check each answer to see feedback, then view your score at the end. Answers and score are not saved.</p>
    {error ? <Card><p role="alert">{error}</p></Card> : !quiz ? <p role="status">Loading approved quiz…</p> : finished ? <Card>
      <h2>Quiz complete</h2><p className="student-preview-score" role="status">Your score: {score} / {quiz.questions.length}</p><p>Correct answers and your score are only shown in this practice preview. Nothing is saved.</p>
      <Button onClick={() => { setFinished(false); setIndex(0); }}>Review answers</Button>
    </Card> : question && <Card>
      <p>Question {index + 1} of {quiz.questions.length}</p>
      <fieldset><legend>{question.prompt}</legend>
        {question.options.map((option, optionIndex) => {
          const result = results[question.id];
          const chosen = answers[question.id] === optionIndex;
          const revealed = result && (chosen ? result.correct ? "correct-answer" : "incorrect-answer" : option === result.correctAnswer ? "correct-answer" : "");
          return <label className={`student-preview-option ${revealed ?? ""}`} key={optionIndex}>
          <input type="radio" name={question.id} disabled={Boolean(results[question.id]) || checking} checked={answers[question.id] === optionIndex} onChange={() => void selectAnswer(optionIndex)} />
          <span>{option}</span>
        </label>;
        })}
      </fieldset>
      {checking && <p role="status">Checking your answer…</p>}{results[question.id] && <p className={`student-preview-result ${results[question.id]!.correct ? "correct" : "incorrect"}`} role="status">
        {results[question.id]!.correct ? "Correct!" : `Not quite. The correct answer is: ${results[question.id]!.correctAnswer}`}
      </p>}
      <div className="student-preview-navigation">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex(current => current - 1)}>Previous</Button>
        {results[question.id] && <Button onClick={() => index + 1 === quiz.questions.length ? setFinished(true) : setIndex(current => current + 1)}>{index + 1 === quiz.questions.length ? "View score" : "Next question"}</Button>}
      </div>
    </Card>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StudentQuizPreview />);
