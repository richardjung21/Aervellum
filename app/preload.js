const { contextBridge, ipcRenderer } = require("electron");

const api = {
  config: () => ipcRenderer.invoke("app:config"),
  transcribe: (payload) => ipcRenderer.invoke("audio:transcribe", payload),
  saveNote: (payload) => ipcRenderer.invoke("note:save", payload),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  getNote: (id) => ipcRenderer.invoke("notes:get", id),
  getArchiveCount: (options) => ipcRenderer.invoke("archive:count", options),
  getArchivePage: (index, options) => ipcRenderer.invoke("archive:page", index, options),
  deleteArchiveEntry: (id) => ipcRenderer.invoke("archive:delete", id),
};

contextBridge.exposeInMainWorld("aervellum", api);
contextBridge.exposeInMainWorld("vellum", api);
