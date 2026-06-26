const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");
const {
  ensureDirectories,
  getArchiveCount,
  getArchivePage,
  getConfig,
  getNote,
  listNotes,
  saveNote,
  transcribe,
} = require("./local-service");

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#24221d",
    title: "Aervellum",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(async () => {
  await ensureDirectories();

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const isLocalApp = webContents.getURL().startsWith("file:");
      callback(isLocalApp && permission === "media");
    },
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:config", getConfig);
ipcMain.handle("audio:transcribe", (_event, payload) => transcribe(payload));
ipcMain.handle("note:save", (_event, payload) => saveNote(payload));
ipcMain.handle("notes:list", listNotes);
ipcMain.handle("notes:get", (_event, id) => getNote(id));
ipcMain.handle("archive:count", getArchiveCount);
ipcMain.handle("archive:page", (_event, index) => getArchivePage(index));
