import { StrictMode, useEffect, useState, type FormEvent } from "react";
import type { JSX } from "react";
import { createRoot } from "react-dom/client";
import { HostWorkspace } from "./HostWorkspace";
import "./styles.css";

type Page = "Dashboard" | "Lessons" | "Quizzes" | "Games" | "Reports" | "Settings";
type LessonSummary = { id: string; title: string; subject: string | null; language: string; sourceType: string; originalFilename: string | null; createdAt: string; updatedAt: string };
type LessonDetail = LessonSummary & { normalizedText: string; blocks: Array<{ id: string; ordinal: number; heading: string | null; charStart: number; charEnd: number }> };
type QuizSummary = { id: string; lessonId: string | null; title: string; language: string; difficulty: string; status: string; updatedAt: string };
type QuestionEdit = { prompt: string; explanation: string; topic: string; difficulty: string; options: Array<{ text: string; isCorrect: boolean }> };
type TeacherGameSnapshot = { id: string; title: string; questions: Array<{ id: string; prompt: string; options: string[]; correctOption: number; timeLimitMs: number; explanation?: string }> };
type HostedQuizSession = { code: string; joinUrl: string; title: string; questionCount: number };
type TeacherSettingsStatus = { databaseConnected: boolean; openAiConfigured: boolean; model: string; sourceFormats: string[] };

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
  const [reviewQuiz, setReviewQuiz] = useState<TeacherQuizReview | null>(null);
  const [questionEdits, setQuestionEdits] = useState<Record<string, QuestionEdit>>({});
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(new Set());
  const [reviewBusy, setReviewBusy] = useState(false);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);
  const [focusBlockOrdinal, setFocusBlockOrdinal] = useState<number | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [hostSnapshot, setHostSnapshot] = useState<TeacherGameSnapshot | null>(null);
  const [hostFormOpen, setHostFormOpen] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [hostedSession, setHostedSession] = useState<HostedQuizSession | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<TeacherSettingsStatus | null>(null);
  useEffect(() => {
    if (page !== "Quizzes") { setHostFormOpen(false); setTeacherPassword(""); }
  }, [page]);
  const [manualQuestion, setManualQuestion] = useState<QuestionEdit & { kind: string }>({
    kind: "multiple-choice", prompt: "", explanation: "", topic: "General", difficulty: "medium",
    options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }, { text: "", isCorrect: false }, { text: "", isCorrect: false }],
  });

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

  useEffect(() => {
    if (page !== "Lessons" || focusBlockOrdinal === null) return;
    document.getElementById(`lesson-block-${focusBlockOrdinal}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [page, selectedLesson, focusBlockOrdinal]);

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

  async function openQuizReview(id: string): Promise<void> {
    setError("");
    setReviewBusy(true);
    try {
      const result = await window.teacherBridge.getQuizReview(id);
      if (!result.ok || !result.data) {
        setError(result.error?.message ?? "Could not load quiz review.");
        return;
      }
      setReviewQuiz(result.data);
      setHostSnapshot(null);
      setDirtyQuestionIds(new Set());
      setQuestionEdits(Object.fromEntries(result.data.questions.map((question) => [question.id, {
        prompt: question.prompt,
        explanation: question.explanation,
        topic: question.topic,
        difficulty: question.difficulty,
        options: question.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
      }])));
    } catch {
      setError("Could not connect to PostgreSQL to load this quiz.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function saveQuestion(questionId: string): Promise<void> {
    const edit = questionEdits[questionId];
    if (!edit) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.saveReviewQuestion({ questionId, ...edit });
      if (!result.ok) setError(result.error?.message ?? "Could not save question edits.");
      else {
        setReviewQuiz((current) => current ? { ...current, status: "needs-review", questions: current.questions.map((question) => question.id === questionId ? { ...question, prompt: edit.prompt, explanation: edit.explanation, topic: edit.topic, difficulty: edit.difficulty, reviewStatus: "needs-review" } : question) } : current);
        setDirtyQuestionIds((current) => { const next = new Set(current); next.delete(questionId); return next; });
        await refreshQuizzes();
      }
    } catch {
      setError("Could not save question edits.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function decideQuestion(questionId: string, status: "approved" | "rejected"): Promise<void> {
    if (!reviewQuiz) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.setQuestionReview(questionId, status);
      if (!result.ok) setError(result.error?.message ?? "Could not update question review.");
      else await openQuizReview(reviewQuiz.id);
    } catch {
      setError("Could not update question review.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function deleteQuestion(questionId: string): Promise<void> {
    if (!reviewQuiz) return;
    if (!window.confirm("Delete this question and its saved answer options? This cannot be undone.")) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.deleteReviewQuestion(questionId);
      if (!result.ok) setError(result.error?.message ?? "Could not delete question.");
      else await openQuizReview(reviewQuiz.id);
    } catch {
      setError("Could not delete question.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function moveQuestion(questionId: string, direction: -1 | 1): Promise<void> {
    if (!reviewQuiz) return;
    const ids = reviewQuiz.questions.map((question) => question.id);
    const index = ids.indexOf(questionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.reorderReviewQuestions(reviewQuiz.id, ids);
      if (!result.ok) setError(result.error?.message ?? "Could not reorder questions.");
      else await openQuizReview(reviewQuiz.id);
    } catch {
      setError("Could not reorder questions.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function approveQuiz(): Promise<void> {
    if (!reviewQuiz) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.approveQuiz(reviewQuiz.id);
      if (!result.ok) setError(result.error?.message ?? "Every question must be approved before approving the quiz.");
      else {
        setNotice("Quiz approved. It is ready to be used by the classroom host.");
        await refreshQuizzes();
        await openQuizReview(reviewQuiz.id);
      }
    } catch {
      setError("Could not approve this quiz.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function duplicateQuestion(questionId: string): Promise<void> {
    if (!reviewQuiz) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.duplicateQuestion(questionId);
      if (!result.ok) setError(result.error?.message ?? "Could not duplicate the question.");
      else await openQuizReview(reviewQuiz.id);
    } catch {
      setError("Could not duplicate the question.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function regenerateQuestion(questionId: string): Promise<void> {
    if (!reviewQuiz || !window.confirm("Replace this question with a newly generated version? The replacement will need review again.")) return;
    setReviewBusy(true);
    setRegeneratingQuestionId(questionId);
    setError("");
    try {
      const result = await window.teacherBridge.regenerateQuestion(questionId);
      if (!result.ok) setError(result.error?.message ?? "Could not regenerate the question.");
      else {
        setNotice("Question regenerated from lesson evidence and returned to pending review.");
        await openQuizReview(reviewQuiz.id);
        await refreshQuizzes();
      }
    } catch {
      setError("Could not regenerate the question. Check the OpenAI configuration and try again.");
    } finally {
      setRegeneratingQuestionId(null);
      setReviewBusy(false);
    }
  }

  async function createManualQuestion(): Promise<void> {
    if (!reviewQuiz) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.createManualQuestion({ quizId: reviewQuiz.id, ...manualQuestion });
      if (!result.ok) setError(result.error?.message ?? "Could not add the question.");
      else {
        setManualQuestion({ kind: "multiple-choice", prompt: "", explanation: "", topic: "General", difficulty: "medium", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }, { text: "", isCorrect: false }, { text: "", isCorrect: false }] });
        setShowManualForm(false);
        await openQuizReview(reviewQuiz.id);
      }
    } catch {
      setError("Could not add the question.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function approvePendingQuestions(): Promise<void> {
    if (!reviewQuiz) return;
    const count = reviewQuiz.questions.filter((question) => question.reviewStatus === "needs-review").length;
    if (!count || dirtyQuestionIds.size || !window.confirm(`Approve all ${count} pending questions? Rejected questions will remain rejected.`)) return;
    setReviewBusy(true);
    setError("");
    try {
      const result = await window.teacherBridge.approvePendingQuestions(reviewQuiz.id);
      if (!result.ok) setError(result.error?.message ?? "Could not approve pending questions.");
      else {
        setNotice(`${result.data?.count ?? 0} pending questions approved. Approve the quiz when all questions are approved.`);
        await openQuizReview(reviewQuiz.id);
      }
    } catch {
      setError("Could not approve pending questions.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function exportApprovedSnapshot(): Promise<void> {
    if (!reviewQuiz) return;
    const result = await window.teacherBridge.exportApprovedSnapshot(reviewQuiz.id);
    if (!result.ok || !result.data) setError(result.error?.message ?? "Could not export the approved quiz.");
    else setHostSnapshot(result.data);
  }

  async function copyHostSnapshot(): Promise<void> {
    if (!hostSnapshot) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(hostSnapshot, null, 2));
      setNotice("Approved host snapshot copied.");
    } catch {
      setError("Clipboard access is unavailable. Select and copy the snapshot below.");
    }
  }

  async function createHostSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reviewQuiz) return;
    setHostBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await window.teacherBridge.createHostSession(reviewQuiz.id, teacherEmail, teacherPassword);
      if (!result.ok || !result.data) {
        setError(result.error?.message ?? "Could not start the approved quiz on the local host.");
        return;
      }
      setHostedSession(result.data);
      setPage("Games");
      setHostFormOpen(false);
      setTeacherPassword("");
      setNotice("Approved quiz sent to the local classroom host. Share the student join link below.");
    } catch {
      setError("Could not start the approved quiz on the local host.");
    } finally {
      setTeacherPassword("");
      setHostBusy(false);
    }
  }

  async function copyStudentJoinLink(): Promise<void> {
    if (!hostedSession) return;
    try {
      await navigator.clipboard.writeText(hostedSession.joinUrl);
      setNotice("Student join link copied.");
    } catch {
      setError("Clipboard access is unavailable. Select and copy the student join link below.");
    }
  }

  async function loadSettingsStatus(): Promise<void> {
    const result = await window.teacherBridge.getSettingsStatus();
    if (result.ok && result.data) setSettingsStatus(result.data);
    else if (result.error) setError(result.error.message);
  }

  function updateQuestionEdit(questionId: string, patch: Partial<QuestionEdit>): void {
    setDirtyQuestionIds((current) => new Set(current).add(questionId));
    setQuestionEdits((current) => ({ ...current, [questionId]: { ...current[questionId]!, ...patch } }));
  }

  function updateManualQuestion(patch: Partial<QuestionEdit & { kind: string }>): void {
    setManualQuestion((current) => ({ ...current, ...patch }));
  }

  async function viewEvidence(blockOrdinal: number | null): Promise<void> {
    if (!reviewQuiz?.lessonId || blockOrdinal === null) return;
    setFocusBlockOrdinal(blockOrdinal);
    setPage("Lessons");
    await openLesson(reviewQuiz.lessonId);
  }

  function renderQuizReview(): JSX.Element {
    if (!reviewQuiz) return <section className="quiz-list">{quizzes.length ? quizzes.map((quiz) => <article className="source-block quiz-card" key={quiz.id}><p className="eyebrow accent">{quiz.status === "approved" ? "Approved" : "Teacher review required"}</p><h2>{quiz.title}</h2><p>{quiz.difficulty} · {quiz.language.toUpperCase()}</p><button className="secondary" disabled={reviewBusy} onClick={() => void openQuizReview(quiz.id)} type="button">Review quiz</button></article>) : <div className="empty-state page-placeholder"><strong>No quizzes yet</strong><span>Select a lesson and generate a draft quiz to begin teacher review.</span></div>}</section>;
    const allApproved = reviewQuiz.questions.length > 0 && reviewQuiz.questions.every((question) => question.reviewStatus === "approved");
    const pendingCount = reviewQuiz.questions.filter((question) => question.reviewStatus === "needs-review").length;
    return <section className="review-page">
      <div className="review-toolbar"><button className="secondary" disabled={reviewBusy || hostBusy} onClick={() => setReviewQuiz(null)} type="button">← All quizzes</button><div><p className="eyebrow accent">{reviewQuiz.status === "approved" ? "Approved quiz" : "Teacher review required"}</p><h2>{reviewQuiz.title}</h2><p>{reviewQuiz.questions.length} questions · {reviewQuiz.difficulty} · {reviewQuiz.language.toUpperCase()}</p></div><div className="review-toolbar-actions">{reviewQuiz.status === "approved" && <><button className="secondary" disabled={reviewBusy || hostBusy} onClick={() => void exportApprovedSnapshot()} type="button">Export host snapshot</button><button className="primary" disabled={reviewBusy || hostBusy || dirtyQuestionIds.size > 0 || !allApproved} onClick={() => { setError(""); setHostFormOpen((open) => !open); }} type="button">{hostBusy ? "Starting…" : "Start LAN session"}</button></>}<button className="primary" disabled={reviewBusy || hostBusy || dirtyQuestionIds.size > 0 || !allApproved || reviewQuiz.status === "approved"} onClick={() => void approveQuiz()} type="button">{reviewQuiz.status === "approved" ? "Quiz approved" : "Approve quiz"}</button></div></div>
      {notice && <p className="file-note" role="status">{notice}</p>}{error && <p className="error-note" role="alert">{error}</p>}
      {hostFormOpen && <form className="review-card host-session-form" onSubmit={(event) => void createHostSession(event)}><h3>Start this approved quiz on the local host</h3><p>Sign in with a teacher account that has changed its temporary password. Use the teacher account created by your administrator. Your password is cleared after sign-in.</p><label>Teacher email<input autoComplete="username" required type="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} /></label><label>Teacher password<input autoComplete="current-password" required type="password" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} /></label><div className="review-actions"><button className="secondary" disabled={hostBusy} onClick={() => { setHostFormOpen(false); setTeacherPassword(""); }} type="button">Cancel</button><button className="primary" disabled={hostBusy} type="submit">{hostBusy ? "Starting…" : "Authenticate and start"}</button></div></form>}
      {hostedSession && <aside className="snapshot-panel host-session-panel"><div><strong>Live session ready · {hostedSession.title}</strong><button className="text-button" onClick={() => void copyStudentJoinLink()} type="button">Copy student link</button></div><p>Join code: <strong>{hostedSession.code}</strong> · {hostedSession.questionCount} approved questions</p><p>Student join link: <code>{hostedSession.joinUrl}</code></p><p>Open Games to control this session and Reports to review final results.</p></aside>}
      {hostSnapshot && <aside className="snapshot-panel"><div><strong>Edin-compatible GameSnapshot</strong><button className="text-button" onClick={() => void copyHostSnapshot()} type="button">Copy JSON</button></div><p>This teacher-only snapshot includes the answer key for the authoritative host. Do not send it to student clients.</p><pre>{JSON.stringify(hostSnapshot, null, 2)}</pre></aside>}
      <div className="review-bulk-actions"><button className="secondary" disabled={reviewBusy || !pendingCount || dirtyQuestionIds.size > 0} onClick={() => void approvePendingQuestions()} type="button">Approve {pendingCount} pending questions</button><button className="secondary" disabled={reviewBusy || dirtyQuestionIds.size > 0 || reviewQuiz.status === "approved"} onClick={() => setShowManualForm((shown) => !shown)} type="button">{showManualForm ? "Cancel manual question" : "Add question manually"}</button>{dirtyQuestionIds.size > 0 && <span>Save your edits before approving or adding questions.</span>}</div>
      {showManualForm && <form className="review-card manual-question-form" onSubmit={(event) => { event.preventDefault(); void createManualQuestion(); }}><h3>New teacher-created question</h3><label>Question kind<select value={manualQuestion.kind} onChange={(event) => updateManualQuestion({ kind: event.target.value, options: event.target.value === "true-false" ? [{ text: "True", isCorrect: true }, { text: "False", isCorrect: false }] : [{ text: "", isCorrect: true }, { text: "", isCorrect: false }, { text: "", isCorrect: false }, { text: "", isCorrect: false }] })}><option value="multiple-choice">Multiple choice</option><option value="true-false">True / false</option></select></label><label>Question prompt<textarea required value={manualQuestion.prompt} onChange={(event) => updateManualQuestion({ prompt: event.target.value })} /></label><div className="review-fields"><label>Topic<input required value={manualQuestion.topic} onChange={(event) => updateManualQuestion({ topic: event.target.value })} /></label><label>Difficulty<select value={manualQuestion.difficulty} onChange={(event) => updateManualQuestion({ difficulty: event.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div><fieldset className="answer-options"><legend>Answer options — select exactly one correct answer</legend>{manualQuestion.options.map((option, index) => <label className="answer-option" key={index}><input type="radio" name="manual-correct" checked={option.isCorrect} onChange={() => updateManualQuestion({ options: manualQuestion.options.map((item, itemIndex) => ({ ...item, isCorrect: itemIndex === index })) })} /><input required aria-label={`Manual answer option ${index + 1}`} value={option.text} onChange={(event) => updateManualQuestion({ options: manualQuestion.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} /></label>)}</fieldset><label>Explanation<textarea required value={manualQuestion.explanation} onChange={(event) => updateManualQuestion({ explanation: event.target.value })} /></label><button className="primary" disabled={reviewBusy} type="submit">Add as pending review</button></form>}
      {reviewQuiz.questions.map((question, index) => {
        const edit = questionEdits[question.id];
        if (!edit) return null;
        return <article className="review-card" key={question.id}>
          <div className="review-card-heading"><div><p className="eyebrow accent">Question {index + 1} · {question.reviewStatus.replace("-", " ")}</p><span>{question.aiGenerated ? `AI confidence: ${question.aiConfidence ?? "unknown"}` : "Teacher-created"}</span></div><div className="review-order"><button className="secondary" aria-label={`Move question ${index + 1} up`} disabled={reviewBusy || dirtyQuestionIds.size > 0 || index === 0} onClick={() => void moveQuestion(question.id, -1)} type="button">↑</button><button className="secondary" aria-label={`Move question ${index + 1} down`} disabled={reviewBusy || dirtyQuestionIds.size > 0 || index === reviewQuiz.questions.length - 1} onClick={() => void moveQuestion(question.id, 1)} type="button">↓</button></div></div>
          <label>Question prompt<textarea value={edit.prompt} onChange={(event) => updateQuestionEdit(question.id, { prompt: event.target.value })} /></label>
          <div className="review-fields"><label>Topic<input value={edit.topic} onChange={(event) => updateQuestionEdit(question.id, { topic: event.target.value })} /></label><label>Difficulty<select value={edit.difficulty} onChange={(event) => updateQuestionEdit(question.id, { difficulty: event.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div>
          <fieldset className="answer-options"><legend>Answer options — select the correct answer</legend>{edit.options.map((option, optionIndex) => <label className="answer-option" key={`${question.id}-${optionIndex}`}><input type="radio" name={`correct-${question.id}`} checked={option.isCorrect} onChange={() => updateQuestionEdit(question.id, { options: edit.options.map((item, itemIndex) => ({ ...item, isCorrect: itemIndex === optionIndex })) })} /><input aria-label={`Answer option ${optionIndex + 1}`} value={option.text} onChange={(event) => updateQuestionEdit(question.id, { options: edit.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, text: event.target.value } : item) })} /></label>)}</fieldset>
          <label>Explanation<textarea value={edit.explanation} onChange={(event) => updateQuestionEdit(question.id, { explanation: event.target.value })} /></label>
          <div className="evidence-list"><strong>Source evidence</strong>{question.evidence.length ? question.evidence.map((evidence) => <div className="evidence-item" key={evidence.id}><blockquote>Lesson block {evidence.blockOrdinal === null ? "(source unavailable)" : evidence.blockOrdinal + 1}: “{evidence.quote}”</blockquote>{evidence.blockOrdinal !== null && reviewQuiz.lessonId && <button className="text-button" onClick={() => void viewEvidence(evidence.blockOrdinal)} type="button">View in lesson</button>}</div>) : <span>No source quote is attached.</span>}</div>
          <div className="review-actions"><button className="secondary" disabled={reviewBusy || !dirtyQuestionIds.has(question.id)} onClick={() => void saveQuestion(question.id)} type="button">Save edits</button><button className="secondary" disabled={reviewBusy || dirtyQuestionIds.size > 0} onClick={() => void decideQuestion(question.id, "rejected")} type="button">Reject</button><button className="primary" disabled={reviewBusy || dirtyQuestionIds.size > 0 || question.reviewStatus === "approved"} onClick={() => void decideQuestion(question.id, "approved")} type="button">Approve question</button><button className="secondary" disabled={reviewBusy || dirtyQuestionIds.size > 0} onClick={() => void duplicateQuestion(question.id)} type="button">Duplicate</button><button className="secondary" disabled={reviewBusy || dirtyQuestionIds.size > 0} onClick={() => void regenerateQuestion(question.id)} type="button">{regeneratingQuestionId === question.id ? "Regenerating…" : "Regenerate"}</button><button className="danger" disabled={reviewBusy || dirtyQuestionIds.size > 0} onClick={() => void deleteQuestion(question.id)} type="button">Delete</button></div>
        </article>;
      })}
    </section>;
  }

  function renderReports(): JSX.Element {
    return <><section className="report-grid"><article className="source-block"><p className="eyebrow accent">Teacher content</p><h2>{quizzes.filter((quiz) => quiz.status === "approved").length} approved quizzes</h2><p>{quizzes.filter((quiz) => quiz.status !== "approved").length} quizzes still in review</p><p>{lessons.length} lessons in the local library</p></article></section><HostWorkspace key="reports" reportsOnly /></>;
  }

  function renderSettings(): JSX.Element {
    return <section className="settings-grid"><article className="source-block"><p className="eyebrow accent">Local services</p><h2>Workspace configuration</h2><p>PostgreSQL: <strong>{settingsStatus?.databaseConnected ? "Connected" : settingsStatus ? "Not connected" : "Checking…"}</strong></p><p>OpenAI API key: <strong>{settingsStatus?.openAiConfigured ? "Configured in main process" : settingsStatus ? "Not configured" : "Checking…"}</strong></p><p>Generation model: <strong>{settingsStatus?.model ?? "—"}</strong></p><button className="secondary" onClick={() => void loadSettingsStatus()} type="button">Refresh status</button></article><article className="source-block"><p className="eyebrow accent">Content formats</p><h2>Supported lesson imports</h2><p>{settingsStatus?.sourceFormats.join(" · ") ?? "TXT · Markdown · text-based PDF · DOCX"}</p><p>For local development, set DATABASE_URL and OPENAI_API_KEY in the private root .env file. The app never sends either value to the renderer.</p></article></section>;
  }

  useEffect(() => {
    if (page === "Settings") void loadSettingsStatus().catch(() => setError("Could not read local configuration status."));
  }, [page]);

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
      <div className="detail-panel">{selectedLesson ? <><p className="eyebrow accent">Source evidence</p><h2>{selectedLesson.title}</h2><p className="detail-meta">{selectedLesson.blocks.length} source blocks · {selectedLesson.language.toUpperCase()} · {selectedLesson.sourceType}</p><div className="generation-controls"><label htmlFor="question-count">Questions to generate</label><select id="question-count" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[3, 5, 8, 10, 15, 20].map((count) => <option key={count} value={count}>{count} questions</option>)}</select><button className="primary" disabled={generating} onClick={() => void generateQuiz()} type="button">{generating ? "Generating…" : "Generate draft quiz"}</button></div>{notice && <p className="file-note" role="status">{notice}</p>}{error && <p className="error-note" role="alert">{error}</p>}<div className="blocks">{selectedLesson.blocks.map((block) => <article className={focusBlockOrdinal === block.ordinal ? "source-block evidence-focus" : "source-block"} id={`lesson-block-${block.ordinal}`} key={block.id}><span>Block {block.ordinal + 1}</span>{block.heading && <strong>{block.heading}</strong>}<p>{selectedLesson.normalizedText.slice(block.charStart, block.charEnd)}</p></article>)}</div></> : <div className="empty-state detail-empty"><strong>Select a lesson</strong><span>Review source blocks here before generating a Cyber Raid quiz.</span></div>}</div>
    </section>;
  }

  return <main className="shell">
    <aside className="sidebar"><div className="brand">CkaDinTi</div><p className="eyebrow">Teacher workspace</p><nav aria-label="Teacher navigation">{(["Dashboard", "Lessons", "Quizzes", "Games", "Reports", "Settings"] as Page[]).map((item) => <button className={page === item ? "nav-item active" : "nav-item"} key={item} onClick={() => setPage(item)} type="button">{item}</button>)}</nav></aside>
    <section className="content"><header className="topbar"><div><p className="eyebrow">Local classroom control</p><h1>{page === "Dashboard" ? "Good morning, teacher" : page}</h1></div><span className="status"><span className="status-dot" /> Teacher workspace</span></header>{page === "Dashboard" ? renderDashboard() : page === "Lessons" ? renderLessons() : page === "Quizzes" ? renderQuizReview() : page === "Reports" ? renderReports() : page === "Settings" ? renderSettings() : <HostWorkspace key="games" />}</section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><TeacherApp /></StrictMode>);
