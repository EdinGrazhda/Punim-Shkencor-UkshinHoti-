import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("teacherBridge", {
  importLesson: () => ipcRenderer.invoke("teacher:import-lesson"),
  listLessons: () => ipcRenderer.invoke("teacher:list-lessons"),
  getLesson: (id: string) => ipcRenderer.invoke("teacher:get-lesson", id),
  listQuizzes: () => ipcRenderer.invoke("teacher:list-quizzes"),
  generateQuiz: (lessonId: string, questionCount: number) => ipcRenderer.invoke("teacher:generate-quiz", { lessonId, questionCount }),
});
