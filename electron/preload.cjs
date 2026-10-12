const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  setTrayTitle(title) {
    ipcRenderer.send("tray:set-title", title == null ? "" : String(title));
  },
  setTrayVisible(visible) {
    ipcRenderer.send("tray:set-visible", !!visible);
  },
});
