import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("teacherBridge", {
  importLesson: () => ipcRenderer.invoke("teacher:import-lesson"),
  listLessons: () => ipcRenderer.invoke("teacher:list-lessons"),
  getLesson: (id: string) => ipcRenderer.invoke("teacher:get-lesson", id),
});
