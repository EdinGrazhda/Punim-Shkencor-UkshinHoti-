export {};

declare global {
  interface Window {
    teacherBridge: {
      selectLessonFile: () => Promise<string | null>;
    };
  }
}
