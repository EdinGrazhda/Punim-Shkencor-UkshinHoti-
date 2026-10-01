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
        data?: Array<{ id: string; title: string }>;
        error?: { code: string; message: string };
      }>;
      getLesson: (id: string) => Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }>;
    };
  }
}
