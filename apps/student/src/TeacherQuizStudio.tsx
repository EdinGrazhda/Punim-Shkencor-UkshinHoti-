import { useEffect, useState, type ChangeEvent } from "react";
import type { GameSnapshot } from "@ckadinti/contracts";
import { ArrowRight, Check, FileUp, RefreshCw, Save, Sparkles } from "lucide-react";
import { readTeacherIdentity, teacherContentApi, type TeacherLesson, type TeacherReviewQuestion, type TeacherReviewQuiz, type TeacherQuizSummary } from "./api";
import { Badge, Button, Card } from "./ui";

type Props = {
  onCreateSession: (snapshot: GameSnapshot) => Promise<void>;
  busy: boolean;
  questionSeconds: number;
  setQuestionSeconds: (seconds: number) => void;
};

function teacherToken() {
  const identity = readTeacherIdentity("teacher");
  if (!identity?.token || identity.teacher.mustChangePassword) throw new Error("Sign in as a teacher and finish any required password change first.");
  return identity.token;
}

export function TeacherQuizStudio({ onCreateSession, busy, questionSeconds, setQuestionSeconds }: Props) {
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [quizzes, setQuizzes] = useState<TeacherQuizSummary[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [questionCount, setQuestionCount] = useState(8);
  const [review, setReview] = useState<TeacherReviewQuiz | null>(null);
  const [dirtyQuestions, setDirtyQuestions] = useState<Set<string>>(() => new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(keepReview = true) {
    const token = teacherToken();
    const [nextLessons, nextQuizzes] = await Promise.all([teacherContentApi.listLessons(token), teacherContentApi.listQuizzes(token)]);
    setLessons(nextLessons);
    setQuizzes(nextQuizzes);
    if (!lessonId && nextLessons[0]) setLessonId(nextLessons[0].id);
    if (keepReview && review) setReview(await teacherContentApi.getQuiz(token, review.id));
  }

  useEffect(() => {
    void refresh(false).catch((cause: unknown) => setError((cause as Error).message));
  }, []);

  async function perform(action: () => Promise<void>) {
    setWorking(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (cause) { setError((cause as Error).message || "The teacher content action failed."); }
    finally { setWorking(false); }
  }

  async function importLesson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    await perform(async () => {
      const result = await teacherContentApi.importLesson(teacherToken(), file);
      await refresh(false);
      setLessonId(result.lesson.id);
      setNotice(result.duplicate ? "This lesson was already in your library." : `Imported ${result.lesson.title}.`);
    });
  }

  function changeQuestion(questionId: string, patch: Partial<TeacherReviewQuestion>) {
    setReview(current => current ? ({
      ...current,
      questions: current.questions.map(question => question.id === questionId ? { ...question, ...patch } : question),
    }) : current);
    setDirtyQuestions(current => new Set(current).add(questionId));
  }

  function changeOption(question: TeacherReviewQuestion, index: number, patch: { text?: string; isCorrect?: boolean }) {
    const options = question.options.map((option, optionIndex) => ({
      ...option,
      ...(optionIndex === index ? patch : {}),
      ...(patch.isCorrect && optionIndex !== index ? { isCorrect: false } : {}),
    }));
    changeQuestion(question.id, { options });
  }

  async function loadReview(id: string) {
    await perform(async () => {
      setReview(await teacherContentApi.getQuiz(teacherToken(), id));
      setDirtyQuestions(new Set());
    });
  }

  async function saveQuestion(question: TeacherReviewQuestion) {
    await perform(async () => {
      await teacherContentApi.saveQuestion(teacherToken(), question);
      setDirtyQuestions(current => { const next = new Set(current); next.delete(question.id); return next; });
      setReview(await teacherContentApi.getQuiz(teacherToken(), question.quizId));
      await refresh(false);
      setNotice("Question saved and returned to teacher review.");
    });
  }

  async function decide(questionId: string, status: "approved" | "rejected") {
    if (dirtyQuestions.has(questionId)) return;
    await perform(async () => {
      await teacherContentApi.decideQuestion(teacherToken(), questionId, status);
      await refresh();
      setNotice(status === "approved" ? "Question approved." : "Question rejected.");
    });
  }

  async function regenerate(questionId: string) {
    await perform(async () => {
      await teacherContentApi.regenerateQuestion(teacherToken(), questionId);
      await refresh();
      setNotice("Replacement generated; review it before approving.");
    });
  }

  async function approveQuiz() {
    if (!review || dirtyQuestions.size || !review.questions.length || review.questions.some(question => question.reviewStatus !== "approved")) return;
    await perform(async () => {
      await teacherContentApi.approveQuiz(teacherToken(), review.id);
      await refresh();
      setNotice("Quiz approved and ready to host.");
    });
  }

  async function hostQuiz(quizId: string) {
    await perform(async () => {
      const snapshot = await teacherContentApi.approvedSnapshot(teacherToken(), quizId);
      await onCreateSession({ ...snapshot, questions: snapshot.questions.map(question => ({ ...question, timeLimitMs: questionSeconds * 1000 })) });
    });
  }

  async function generateQuiz() {
    if (!lessonId) return;
    await perform(async () => {
      const result = await teacherContentApi.generateQuiz(teacherToken(), lessonId, questionCount);
      setReview(await teacherContentApi.getQuiz(teacherToken(), result.quizId));
      setDirtyQuestions(new Set());
      await refresh(false);
      setNotice("Draft generated. Check every question and its source evidence before approval.");
    });
  }

  return <div className="simple-page teacher-studio">
    <div className="page-heading"><div><span className="section-kicker">LESSON TO CLASSROOM QUIZ</span><h1>Build a quiz from your lesson</h1><p>Import source material, generate a draft, review its evidence, then approve it before hosting.</p></div></div>
    {error && <div className="teacher-studio-message error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <div className="teacher-studio-message success" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}

    <div className="teacher-studio-grid">
      <Card className="teacher-studio-card"><div className="section-title"><div><Badge>STEP 1</Badge><h2>Lesson library</h2></div><label className="teacher-upload-button"><FileUp size={16} /> Import lesson<input type="file" accept=".txt,.md,.pdf,.docx" onChange={event => void importLesson(event)} disabled={working} /></label></div>
        <p>Supported: TXT, Markdown, text-based PDF and DOCX.</p>
        {lessons.length ? <label className="teacher-studio-field">Choose lesson<select value={lessonId} onChange={event => setLessonId(event.target.value)}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.sourceType.toUpperCase()}</option>)}</select></label> : <div className="teacher-studio-empty">No lessons yet. Import a source file to begin.</div>}
      </Card>
      <Card className="teacher-studio-card"><Badge>STEP 2</Badge><h2>Generate a draft</h2><p>AI drafts source-grounded questions. It cannot approve or publish them.</p><label className="teacher-studio-field">Question count<select value={questionCount} onChange={event => setQuestionCount(Number(event.target.value))}>{[3, 5, 8, 10, 12, 15, 20].map(value => <option key={value} value={value}>{value} questions</option>)}</select></label><Button onClick={() => void generateQuiz()} disabled={working || !lessonId}><Sparkles size={16} /> {working ? "Working…" : "Generate quiz draft"}</Button></Card>
    </div>

    <Card className="teacher-studio-card teacher-studio-library"><div className="section-title"><div><Badge>STEP 3</Badge><h2>Drafts and approved quizzes</h2></div><Button variant="outline" onClick={() => void perform(() => refresh())} disabled={working}><RefreshCw size={15} /> Refresh</Button></div>
      {quizzes.length ? <div className="teacher-quiz-list">{quizzes.map(quiz => <div className="teacher-quiz-row" key={quiz.id}><div><strong>{quiz.title}</strong><small>{quiz.status.replace("-", " ")} · {quiz.difficulty} · {new Date(quiz.updatedAt).toLocaleDateString()}</small></div><Badge className={quiz.status === "approved" ? "phase-badge" : ""}>{quiz.status.replace("-", " ")}</Badge><Button variant="outline" onClick={() => void loadReview(quiz.id)} disabled={working}>Review</Button>{quiz.status === "approved" && <Button onClick={() => void hostQuiz(quiz.id)} disabled={working || busy}>Host <ArrowRight size={15} /></Button>}</div>)}</div> : <div className="teacher-studio-empty">No quiz drafts yet.</div>}
    </Card>

    {review && <Card className="teacher-studio-card teacher-review-panel"><div className="section-title"><div><Badge>TEACHER REVIEW</Badge><h2>{review.title}</h2></div><Badge className={review.status === "approved" ? "phase-badge" : ""}>{review.status.replace("-", " ")}</Badge></div><p>Check accuracy, answer choices, explanation, and cited lesson text. Editing a question clears its approval.</p>
      <div className="teacher-review-questions">{review.questions.map((question, index) => <article className="teacher-review-question" key={question.id}><div className="section-title"><div><Badge>QUESTION {index + 1} · {question.reviewStatus.replace("-", " ")}</Badge>{question.aiConfidence && <small>AI confidence: {question.aiConfidence}</small>}</div>{question.aiGenerated && <Button variant="outline" onClick={() => void regenerate(question.id)} disabled={working}><RefreshCw size={14} /> Regenerate</Button>}</div>
        <label className="teacher-studio-field">Prompt<textarea value={question.prompt} onChange={event => changeQuestion(question.id, { prompt: event.target.value })} /></label>
        <label className="teacher-studio-field">Explanation<textarea value={question.explanation} onChange={event => changeQuestion(question.id, { explanation: event.target.value })} /></label>
        <div className="teacher-review-meta"><label className="teacher-studio-field">Topic<input value={question.topic} onChange={event => changeQuestion(question.id, { topic: event.target.value })} /></label><label className="teacher-studio-field">Difficulty<select value={question.difficulty} onChange={event => changeQuestion(question.id, { difficulty: event.target.value as TeacherReviewQuestion["difficulty"] })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>
        <fieldset className="teacher-answer-options"><legend>Answer options · select the correct answer</legend>{question.options.map((option, optionIndex) => <div className="teacher-answer-option" key={option.id}><input aria-label={`Mark answer ${optionIndex + 1} correct`} type="radio" name={`correct-${question.id}`} checked={option.isCorrect} onChange={() => changeOption(question, optionIndex, { isCorrect: true })} /><input aria-label={`Answer ${optionIndex + 1}`} value={option.text} onChange={event => changeOption(question, optionIndex, { text: event.target.value })} /></div>)}</fieldset>
        <div className="teacher-evidence"><strong>Source evidence</strong>{question.evidence.length ? question.evidence.map(item => <blockquote key={item.id}>{item.quote || "Source quote unavailable"}<small>{item.blockOrdinal === null ? "Lesson block unavailable" : `Lesson block ${item.blockOrdinal + 1}`}</small></blockquote>) : <p>No evidence citation was returned. Do not approve without verifying against the lesson.</p>}</div>
        <div className="teacher-review-actions"><Button variant="outline" onClick={() => void saveQuestion(question)} disabled={working || !dirtyQuestions.has(question.id)}><Save size={15} /> Save edits</Button><Button variant="outline" onClick={() => void decide(question.id, "rejected")} disabled={working || dirtyQuestions.has(question.id)}>Reject</Button><Button onClick={() => void decide(question.id, "approved")} disabled={working || dirtyQuestions.has(question.id) || question.evidence.length === 0}><Check size={15} /> Approve question</Button></div>
      </article>)}</div>
      <div className="teacher-review-footer"><Button variant="outline" onClick={() => void approveQuiz()} disabled={working || dirtyQuestions.size > 0 || !review.questions.length || review.questions.some(question => question.reviewStatus !== "approved") || review.status === "approved"}>Approve quiz</Button>{review.status === "approved" && <><label className="question-timer-setting">Seconds per question<input type="number" min={1} max={600} value={questionSeconds} onChange={event => setQuestionSeconds(Math.max(1, Math.min(600, Number(event.target.value) || 10)))} /></label><Button onClick={() => void hostQuiz(review.id)} disabled={working || busy}>Create live session <ArrowRight size={16} /></Button></>}</div>
    </Card>}
  </div>;
}
