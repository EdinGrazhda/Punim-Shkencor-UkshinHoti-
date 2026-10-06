import type { HostCommand, PublicSessionState } from "@ckadinti/contracts";
import type { HostedResults, HostedSession } from "../main/services/runtime-host.js";
type HostResult<T> = Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }>;

declare global {
  type TeacherReviewQuestion = {
    id: string; quizId: string; kind: string; prompt: string; explanation: string; topic: string; difficulty: string;
    aiGenerated: boolean; aiConfidence: string | null; reviewStatus: string; ordinal: number;
    options: Array<{ id: string; questionId: string; ordinal: number; text: string; isCorrect: boolean }>;
    evidence: Array<{ id: string; questionId: string; lessonBlockId: string; quoteStart: number; quoteEnd: number; blockOrdinal: number | null; quote: string }>;
  };
  type TeacherQuizReview = { id: string; lessonId: string | null; title: string; language: string; difficulty: string; status: string; questions: TeacherReviewQuestion[] };
  interface Window {
    teacherBridge: {
      listHostSessions: () => HostResult<HostedSession[]>;
      getHostState: (code: string) => HostResult<PublicSessionState>;
      sendHostCommand: (code: string, command: HostCommand) => HostResult<PublicSessionState>;
      getHostResults: (code: string) => HostResult<HostedResults>;
      importLesson: () => Promise<{
        ok: boolean;
        data?: { lesson: { id: string; title: string }; duplicate: boolean } | null;
        error?: { code: string; message: string };
      }>;
      listLessons: () => Promise<{
        ok: boolean;
        data?: Array<{ id: string; title: string; subject: string | null; language: string; sourceType: string; originalFilename: string | null; createdAt: string; updatedAt: string }>;
        error?: { code: string; message: string };
      }>;
      getLesson: (id: string) => Promise<{ ok: boolean; data?: { id: string; title: string; subject: string | null; language: string; sourceType: string; originalFilename: string | null; createdAt: string; updatedAt: string; normalizedText: string; blocks: Array<{ id: string; ordinal: number; heading: string | null; charStart: number; charEnd: number }> }; error?: { code: string; message: string } }>;
      listQuizzes: () => Promise<{ ok: boolean; data?: Array<{ id: string; lessonId: string | null; title: string; language: string; difficulty: string; status: string; updatedAt: string }>; error?: { code: string; message: string } }>;
      generateQuiz: (lessonId: string, questionCount: number) => Promise<{ ok: boolean; data?: { quizId: string; title: string; questionCount: number; status: "needs-review" }; error?: { code: string; message: string } }>;
      getQuizReview: (id: string) => Promise<{ ok: boolean; data?: TeacherQuizReview; error?: { code: string; message: string } }>;
      saveReviewQuestion: (input: { questionId: string; prompt: string; explanation: string; topic: string; difficulty: string; options: Array<{ text: string; isCorrect: boolean }> }) => Promise<{ ok: boolean; data?: { questionId: string; reviewStatus: string }; error?: { code: string; message: string } }>;
      setQuestionReview: (questionId: string, reviewStatus: "approved" | "rejected") => Promise<{ ok: boolean; data?: { questionId: string; reviewStatus: string }; error?: { code: string; message: string } }>;
      deleteReviewQuestion: (questionId: string) => Promise<{ ok: boolean; data?: { questionId: string }; error?: { code: string; message: string } }>;
      reorderReviewQuestions: (quizId: string, orderedQuestionIds: string[]) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>;
      approveQuiz: (quizId: string) => Promise<{ ok: boolean; data?: { quizId: string; status: string }; error?: { code: string; message: string } }>;
      createManualQuestion: (input: { quizId: string; kind: string; prompt: string; explanation: string; topic: string; difficulty: string; options: Array<{ text: string; isCorrect: boolean }> }) => Promise<{ ok: boolean; data?: { questionId: string }; error?: { code: string; message: string } }>;
      duplicateQuestion: (questionId: string) => Promise<{ ok: boolean; data?: { questionId: string }; error?: { code: string; message: string } }>;
      approvePendingQuestions: (quizId: string) => Promise<{ ok: boolean; data?: { count: number }; error?: { code: string; message: string } }>;
      regenerateQuestion: (questionId: string) => Promise<{ ok: boolean; data?: { questionId: string; prompt: string; reviewStatus: "needs-review" }; error?: { code: string; message: string } }>;
      exportApprovedSnapshot: (quizId: string) => Promise<{ ok: boolean; data?: { id: string; title: string; questions: Array<{ id: string; prompt: string; options: string[]; correctOption: number; timeLimitMs: number }> }; error?: { code: string; message: string } }>;
      createHostSession: (quizId: string, email: string, password: string) => Promise<{ ok: boolean; data?: { code: string; joinUrl: string; title: string; questionCount: number }; error?: { code: string; message: string } }>;
      getSettingsStatus: () => Promise<{ ok: boolean; data?: { databaseConnected: boolean; openAiConfigured: boolean; model: string; sourceFormats: string[] }; error?: { code: string; message: string } }>;
    };
  }
}
