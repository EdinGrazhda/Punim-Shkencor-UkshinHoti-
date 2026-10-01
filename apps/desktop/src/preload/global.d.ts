export {};

declare global {
  interface Window {
    teacherBridge: {
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
    };
  }
}
