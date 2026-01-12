import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getWindowOpacity: () => ipcRenderer.invoke("get-window-opacity"),
  setWindowOpacity: (value: number) => ipcRenderer.invoke("set-window-opacity", value),
});
