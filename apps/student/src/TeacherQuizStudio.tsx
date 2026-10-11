import { useEffect, useState, type ChangeEvent } from "react";
import { MAX_LESSON_FILE_BYTES, MAX_LESSON_TEXT_CHARS, MAX_QUIZ_QUESTIONS, questionCountSchema, type GameSnapshot } from "@ckadinti/contracts";
import { ArrowRight, Check, ClipboardPaste, FileUp, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { readTeacherIdentity, teacherContentApi, type TeacherLesson, type TeacherReviewQuestion, type TeacherReviewQuiz, type TeacherQuizSummary } from "./api";
import { Badge, Button, Card } from "./ui";
import "./teacher-review-bulk.css";

type Props = {
  authToken?: string;
  hostingEnabled?: boolean;
  onCreateSession: (snapshot: GameSnapshot) => Promise<void>;
  busy: boolean;
  questionSeconds: number;
  setQuestionSeconds: (seconds: number) => void;
};

function storedTeacherToken() {
  const identity = readTeacherIdentity("teacher");
  if (!identity?.token || identity.teacher.mustChangePassword) throw new Error("Sign in as a teacher and finish any required password change first.");
  return identity.token;
}

export function TeacherQuizStudio({ authToken, hostingEnabled = true, onCreateSession, busy, questionSeconds, setQuestionSeconds }: Props) {
  const teacherToken = () => authToken ?? storedTeacherToken();
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [quizzes, setQuizzes] = useState<TeacherQuizSummary[]>([]);
  const [selectedQuizIds, setSelectedQuizIds] = useState<Set<string>>(() => new Set());
  const [lessonId, setLessonId] = useState("");
  const [questionCount, setQuestionCount] = useState("8");
  const validQuestionCount = questionCountSchema.safeParse(Number(questionCount)).success;
  const [review, setReview] = useState<TeacherReviewQuiz | null>(null);
  const [dirtyQuestions, setDirtyQuestions] = useState<Set<string>>(() => new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceMode, setSourceMode] = useState<"file" | "text">("file");
  const [textTitle, setTextTitle] = useState("");
  const [lessonText, setLessonText] = useState("");
  const hasUnsavedText = sourceMode === "text" && lessonText.trim().length > 0;

  async function refresh(keepReview = true) {
    const token = teacherToken();
    const [nextLessons, nextQuizzes] = await Promise.all([teacherContentApi.listLessons(token), teacherContentApi.listQuizzes(token)]);
    setLessons(nextLessons);
    setQuizzes(nextQuizzes);
    setSelectedQuizIds(current => new Set([...current].filter(id => nextQuizzes.some(quiz => quiz.id === id))));
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
      if (file.size > MAX_LESSON_FILE_BYTES) throw new Error("Lesson files must be 50 MB or smaller.");
      const result = await teacherContentApi.importLesson(teacherToken(), file);
      await refresh(false);
      setLessonId(result.lesson.id);
      setNotice(result.duplicate ? "This lesson was already in your library." : `Imported ${result.lesson.title}.`);
    });
  }

  async function importPastedText() {
    if (!lessonText.trim()) return;
    await perform(async () => {
      if (lessonText.length > MAX_LESSON_TEXT_CHARS) throw new Error("Paste a smaller section of your lesson (up to 2,000,000 characters).");
      const title = textTitle.trim().replace(/[\\/:\u0000]/gu, " ") || "Pasted lesson";
      const file = new File([lessonText], `${title}.txt`, { type: "text/plain" });
      const result = await teacherContentApi.importLesson(teacherToken(), file);
      await refresh(false);
      setLessonId(result.lesson.id);
      setLessonText("");
      setTextTitle("");
      setNotice(result.duplicate ? "This text is already in your library and is selected below." : `Added ${result.lesson.title}. Choose a question count and generate your draft.`);
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
      const result = await teacherContentApi.decideQuestion(teacherToken(), questionId, status);
      if (result.reviewStatus !== status) throw new Error("The question decision was not confirmed. Please refresh and try again.");
      await refresh();
      const number = (review?.questions.findIndex(question => question.id === questionId) ?? -1) + 1;
      setNotice(`Question ${number || ""} ${status}. ${status === "approved" ? "Your approval has been saved." : "It will not be available to students."}`);
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
      const result = await teacherContentApi.approveQuiz(teacherToken(), review.id);
      if (result.status !== "approved") throw new Error("Quiz approval was not confirmed. Please refresh and try again.");
      await refresh();
      setNotice(hostingEnabled ? "Quiz saved and approved. Create a live session to share it with students." : "Quiz saved and approved for this demo session. Open the student preview below. It stays available until the server restarts.");
    });
  }

  async function approveAllQuestions() {
    if (!review || dirtyQuestions.size || !review.questions.length || review.questions.some(question => question.evidence.length === 0)) return;
    await perform(async () => {
      const result = await teacherContentApi.approveAllQuestions(teacherToken(), review.id);
      if (result.status !== "approved") throw new Error("Bulk quiz approval was not confirmed. Please refresh and try again.");
      const updatedReview = await teacherContentApi.getQuiz(teacherToken(), review.id);
      await refresh(false);
      setReview(updatedReview);
      setNotice(`Approved and saved all ${updatedReview.questions.length} questions. The quiz is ready for students.`);
    });
  }

  async function hostQuiz(quizId: string) {
    await perform(async () => {
      const snapshot = await teacherContentApi.approvedSnapshot(teacherToken(), quizId);
      await onCreateSession({ ...snapshot, questions: snapshot.questions.map(question => ({ ...question, timeLimitMs: questionSeconds * 1000 })) });
    });
  }

  async function generateQuiz() {
    if (!lessonId || !validQuestionCount || hasUnsavedText) return;
    await perform(async () => {
      const result = await teacherContentApi.generateQuiz(teacherToken(), lessonId, Number(questionCount));
      setReview(await teacherContentApi.getQuiz(teacherToken(), result.quizId));
      setDirtyQuestions(new Set());
      await refresh(false);
      setNotice(`Draft generated. Check every question and its source evidence before approval.${result.sampledSource ? " This long lesson was sampled across sections; the quiz does not cover every page." : ""}`);
    });
  }

  function toggleQuizSelection(quizId: string) {
    setSelectedQuizIds(current => {
      const next = new Set(current);
      if (next.has(quizId)) next.delete(quizId);
      else next.add(quizId);
      return next;
    });
  }

  async function deleteSelectedQuizzes() {
    const ids = [...selectedQuizIds];
    if (!ids.length || !window.confirm(`Permanently delete ${ids.length} selected ${ids.length === 1 ? "quiz" : "quizzes"} and their questions? This cannot be undone.`)) return;
    await perform(async () => {
      await Promise.all(ids.map(id => teacherContentApi.deleteQuiz(teacherToken(), id)));
      if (review && selectedQuizIds.has(review.id)) { setReview(null); setDirtyQuestions(new Set()); }
      setSelectedQuizIds(new Set());
      await refresh(false);
      setNotice(`Deleted ${ids.length} ${ids.length === 1 ? "quiz" : "quizzes"}.`);
    });
  }

  return <div className="simple-page teacher-studio">
    <div className="page-heading"><div><span className="section-kicker">LESSON TO CLASSROOM QUIZ</span><h1>Build a quiz from your lesson</h1><p>Upload a PDF or paste your lesson text, generate a draft, then review and approve it before hosting.</p></div></div>
    <div className="teacher-studio-feedback">
      {error && <div className="teacher-studio-message error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>Dismiss</button></div>}
      {notice && <div className="teacher-studio-message success" role="status" aria-live="polite">{notice}<button aria-label="Dismiss confirmation" onClick={() => setNotice("")}>Dismiss</button></div>}
    </div>

    <div className="teacher-studio-grid">
      <Card className="teacher-studio-card"><Badge>STEP 1</Badge><h2>Add a lesson</h2>
        <div className="teacher-source-switch" role="group" aria-label="Lesson source">
          <button type="button" aria-pressed={sourceMode === "file"} onClick={() => setSourceMode("file")} disabled={working}><FileUp size={16} /> Upload file</button>
          <button type="button" aria-pressed={sourceMode === "text"} onClick={() => setSourceMode("text")} disabled={working}><ClipboardPaste size={16} /> Paste text</button>
        </div>
        {sourceMode === "file" ? <div className="teacher-source-upload">
          <FileUp size={28} aria-hidden="true" /><strong>Use a PDF or lesson document</strong>
          <p>PDF, TXT, Markdown, or DOCX · up to 50 MB</p>
          <label className="teacher-upload-button"><FileUp size={16} /> Choose file<input aria-label="Upload lesson file" type="file" accept=".txt,.md,.pdf,.docx" onChange={event => void importLesson(event)} disabled={working} /></label>
          <small>Scanned PDFs use local OCR. English is included; other languages need local packs. Up to 500 pages; check the extracted evidence before approving questions.</small>
        </div> : <form className="teacher-source-text" onSubmit={event => { event.preventDefault(); void importPastedText(); }}>
          <label className="teacher-studio-field">Lesson title (optional)<input value={textTitle} onChange={event => setTextTitle(event.target.value)} maxLength={180} placeholder="e.g. Introduction to HTML" disabled={working} /></label>
          <label className="teacher-studio-field">Lesson text<textarea value={lessonText} onChange={event => setLessonText(event.target.value)} maxLength={MAX_LESSON_TEXT_CHARS} rows={7} placeholder="Paste your notes, a lesson, or an article here…" disabled={working} required /></label>
          <div className="teacher-source-text-actions"><small>{lessonText.length.toLocaleString()} characters</small><Button type="submit" disabled={working || !lessonText.trim()}><Save size={15} /> Add text to library</Button></div>
        </form>}
        {working && <p role="status">Processing… Scanned PDFs and large quizzes can take several minutes. Keep this page open.</p>}
        {lessons.length ? <label className="teacher-studio-field">Choose lesson<select value={lessonId} onChange={event => setLessonId(event.target.value)} disabled={working}>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.sourceType.toUpperCase()}</option>)}</select></label> : <div className="teacher-studio-empty">Your uploaded files and pasted lessons will appear here.</div>}
      </Card>
      <Card className="teacher-studio-card"><Badge>STEP 2</Badge><h2>Generate a draft</h2><p>AI drafts source-grounded questions. It cannot approve or publish them.</p><label className="teacher-studio-field">Question count<input type="number" min={1} max={MAX_QUIZ_QUESTIONS} step={1} value={questionCount} onChange={event => setQuestionCount(event.target.value)} aria-describedby="question-count-help" /></label><p id="question-count-help">Choose any whole number from 1 to {MAX_QUIZ_QUESTIONS}. Large quizzes run in batches. Very long lessons may be sampled across sections; enough source material is needed for distinct questions.</p>{!validQuestionCount && <p role="alert">Enter a whole number from 1 to {MAX_QUIZ_QUESTIONS}.</p>}{hasUnsavedText && <p>Add your text to the library first to use it for this draft.</p>}<Button onClick={() => void generateQuiz()} disabled={working || !lessonId || !validQuestionCount || hasUnsavedText}><Sparkles size={16} /> {working ? "Working…" : "Generate quiz draft"}</Button></Card>
    </div>

    <Card className="teacher-studio-card teacher-studio-library"><div className="section-title"><div><Badge>STEP 3</Badge><h2>Drafts and approved quizzes</h2></div><div className="teacher-quiz-library-actions">{!hostingEnabled && quizzes.length > 0 && <><label className="teacher-quiz-select-all"><input type="checkbox" aria-label="Select all quizzes" checked={selectedQuizIds.size === quizzes.length} onChange={() => setSelectedQuizIds(current => current.size === quizzes.length ? new Set() : new Set(quizzes.map(quiz => quiz.id)))} /> Select all</label><Button variant="outline" onClick={() => void deleteSelectedQuizzes()} disabled={working || selectedQuizIds.size === 0}><Trash2 size={15} /> Delete selected ({selectedQuizIds.size})</Button></>}<Button variant="outline" onClick={() => void perform(() => refresh())} disabled={working}><RefreshCw size={15} /> Refresh</Button></div></div>
      {quizzes.length ? <div className="teacher-quiz-list">{quizzes.map(quiz => <div className={`teacher-quiz-row ${!hostingEnabled ? "demo-quiz-row" : ""}`} key={quiz.id}>{!hostingEnabled && <input className="teacher-quiz-checkbox" type="checkbox" aria-label={`Select ${quiz.title}`} checked={selectedQuizIds.has(quiz.id)} onChange={() => toggleQuizSelection(quiz.id)} />}<div className="teacher-quiz-title"><strong>{quiz.title}</strong><small>{quiz.status.replace("-", " ")} · {quiz.difficulty} · {new Date(quiz.updatedAt).toLocaleDateString()}</small></div><Badge className={quiz.status === "approved" ? "phase-badge" : ""}>{quiz.status.replace("-", " ")}</Badge><Button variant="outline" onClick={() => void loadReview(quiz.id)} disabled={working}>Review</Button>{!hostingEnabled && quiz.status === "approved" && <a className="ui-button ui-button-outline" href={`/student-preview.html?quiz=${quiz.id}`} target="_blank" rel="noopener noreferrer">Student preview</a>}{hostingEnabled && quiz.status === "approved" && <Button onClick={() => void hostQuiz(quiz.id)} disabled={working || busy}>Host <ArrowRight size={15} /></Button>}</div>)}</div> : <div className="teacher-studio-empty">No quiz drafts yet.</div>}
    </Card>

    {review && <Card className="teacher-studio-card teacher-review-panel"><div className="section-title"><div><Badge>TEACHER REVIEW</Badge><h2>{review.title}</h2></div><Badge className={review.status === "approved" ? "phase-badge" : ""}>{review.status.replace("-", " ")}</Badge></div><p>Check accuracy, answer choices, explanation, and cited lesson text. Editing a question clears its approval.</p>
      <div className="teacher-review-questions">{review.questions.map((question, index) => <article className="teacher-review-question" key={question.id}><div className="section-title"><div><Badge>QUESTION {index + 1} · {question.reviewStatus.replace("-", " ")}</Badge>{question.aiConfidence && <small>AI confidence: {question.aiConfidence}</small>}</div>{question.aiGenerated && <Button variant="outline" onClick={() => void regenerate(question.id)} disabled={working}><RefreshCw size={14} /> Regenerate</Button>}</div>
        <label className="teacher-studio-field">Prompt<textarea value={question.prompt} onChange={event => changeQuestion(question.id, { prompt: event.target.value })} /></label>
        <label className="teacher-studio-field">Explanation<textarea value={question.explanation} onChange={event => changeQuestion(question.id, { explanation: event.target.value })} /></label>
        <div className="teacher-review-meta"><label className="teacher-studio-field">Topic<input value={question.topic} onChange={event => changeQuestion(question.id, { topic: event.target.value })} /></label><label className="teacher-studio-field">Difficulty<select value={question.difficulty} onChange={event => changeQuestion(question.id, { difficulty: event.target.value as TeacherReviewQuestion["difficulty"] })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>
        <fieldset className="teacher-answer-options"><legend>Answer options · select the correct answer</legend>{question.options.map((option, optionIndex) => <div className="teacher-answer-option" key={option.id}><input aria-label={`Mark answer ${optionIndex + 1} correct`} type="radio" name={`correct-${question.id}`} checked={option.isCorrect} onChange={() => changeOption(question, optionIndex, { isCorrect: true })} /><input aria-label={`Answer ${optionIndex + 1}`} value={option.text} onChange={event => changeOption(question, optionIndex, { text: event.target.value })} /></div>)}</fieldset>
        <div className="teacher-evidence"><strong>Source evidence</strong>{question.evidence.length ? question.evidence.map(item => <blockquote key={item.id}>{item.quote || "Source quote unavailable"}<small>{item.blockOrdinal === null ? "Lesson block unavailable" : `Lesson block ${item.blockOrdinal + 1}`}</small></blockquote>) : <p>No evidence citation was returned. Do not approve without verifying against the lesson.</p>}</div>
        {question.reviewStatus === "approved" && !dirtyQuestions.has(question.id) && <p className="teacher-question-confirmation"><Check size={16} /> Approval saved for question {index + 1}.</p>}<div className="teacher-review-actions"><Button variant="outline" onClick={() => void saveQuestion(question)} disabled={working || !dirtyQuestions.has(question.id)}><Save size={15} /> Save edits</Button><Button variant="outline" onClick={() => void decide(question.id, "rejected")} disabled={working || dirtyQuestions.has(question.id) || question.reviewStatus === "rejected"}>Reject</Button><Button onClick={() => void decide(question.id, "approved")} disabled={working || dirtyQuestions.has(question.id) || question.evidence.length === 0 || question.reviewStatus === "approved"}><Check size={15} /> {question.reviewStatus === "approved" ? "Approved" : "Approve question"}</Button></div>
      </article>)}</div>
      {review.status === "approved" && dirtyQuestions.size === 0 && <div className="teacher-quiz-saved"><strong><Check size={17} /> Quiz saved and approved</strong><p>{hostingEnabled ? "Create a live session below to invite students." : "Saved in this demo session until the server restarts. Open a student practice quiz on this computer."}</p>{!hostingEnabled && <a className="ui-button ui-button-primary" href={`/student-preview.html?quiz=${review.id}`} target="_blank" rel="noopener noreferrer">Open student preview <ArrowRight size={16} /></a>}</div>}<div className="teacher-review-footer">{review.status !== "approved" && review.questions.some(question => question.reviewStatus !== "approved") && <div className="teacher-bulk-approval"><p>Bulk approval saves and approves every question above. Verify the lesson evidence before continuing.</p><Button onClick={() => void approveAllQuestions()} disabled={working || dirtyQuestions.size > 0 || !review.questions.length || review.questions.some(question => question.evidence.length === 0)}><Check size={15} /> Approve all &amp; save quiz</Button>{review.questions.some(question => question.evidence.length === 0) && <small>Bulk approval is unavailable while a question has no source evidence.</small>}</div>}{(review.status === "approved" || review.questions.every(question => question.reviewStatus === "approved")) && <Button variant="outline" onClick={() => void approveQuiz()} disabled={working || dirtyQuestions.size > 0 || !review.questions.length || review.questions.some(question => question.reviewStatus !== "approved") || review.status === "approved"}>{review.status === "approved" ? "Quiz saved and approved" : "Save and approve quiz"}</Button>}{hostingEnabled && review.status === "approved" && <><label className="question-timer-setting">Seconds per question<input type="number" min={1} max={600} value={questionSeconds} onChange={event => setQuestionSeconds(Math.max(1, Math.min(600, Number(event.target.value) || 10)))} /></label><Button onClick={() => void hostQuiz(review.id)} disabled={working || busy}>Create live session <ArrowRight size={16} /></Button></>}</div>
    </Card>}
  </div>;
}
