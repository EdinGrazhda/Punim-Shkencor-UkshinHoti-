import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("teacherBridge", {
  importLesson: () => ipcRenderer.invoke("teacher:import-lesson"),
  listLessons: () => ipcRenderer.invoke("teacher:list-lessons"),
  getLesson: (id: string) => ipcRenderer.invoke("teacher:get-lesson", id),
  listQuizzes: () => ipcRenderer.invoke("teacher:list-quizzes"),
  generateQuiz: (lessonId: string, questionCount: number) => ipcRenderer.invoke("teacher:generate-quiz", { lessonId, questionCount }),
  getQuizReview: (id: string) => ipcRenderer.invoke("teacher:get-quiz-review", id),
  saveReviewQuestion: (input: { questionId: string; prompt: string; explanation: string; topic: string; difficulty: string; options: Array<{ text: string; isCorrect: boolean }> }) => ipcRenderer.invoke("teacher:save-review-question", input),
  setQuestionReview: (questionId: string, reviewStatus: "approved" | "rejected") => ipcRenderer.invoke("teacher:set-question-review", { questionId, reviewStatus }),
  deleteReviewQuestion: (questionId: string) => ipcRenderer.invoke("teacher:delete-review-question", questionId),
  reorderReviewQuestions: (quizId: string, orderedQuestionIds: string[]) => ipcRenderer.invoke("teacher:reorder-review-questions", { quizId, orderedQuestionIds }),
  approveQuiz: (quizId: string) => ipcRenderer.invoke("teacher:approve-quiz", quizId),
  createManualQuestion: (input: { quizId: string; kind: string; prompt: string; explanation: string; topic: string; difficulty: string; options: Array<{ text: string; isCorrect: boolean }> }) => ipcRenderer.invoke("teacher:create-manual-question", input),
  duplicateQuestion: (questionId: string) => ipcRenderer.invoke("teacher:duplicate-question", questionId),
  approvePendingQuestions: (quizId: string) => ipcRenderer.invoke("teacher:approve-pending-questions", quizId),
  regenerateQuestion: (questionId: string) => ipcRenderer.invoke("teacher:regenerate-question", questionId),
  exportApprovedSnapshot: (quizId: string) => ipcRenderer.invoke("teacher:export-approved-snapshot", quizId),
  getSettingsStatus: () => ipcRenderer.invoke("teacher:get-settings-status"),
});
