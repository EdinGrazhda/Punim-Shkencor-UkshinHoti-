import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("teacherBridge", {
  selectLessonFile: (): Promise<string | null> =>
    ipcRenderer.invoke("teacher:select-lesson-file"),
});
