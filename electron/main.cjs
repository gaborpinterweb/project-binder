const { app, BrowserWindow, shell, Tray, nativeImage, ipcMain } = require("electron");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");
const PRELOAD_PATH = path.join(__dirname, "preload.cjs");
const IS_DARWIN = process.platform === "darwin";

app.setName("Project Binder");

let mainWindow = null;
let tray = null;
let trayTitle = "No timer";

function waitForServer(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    let left = attempts;
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (--left <= 0) return reject(new Error("Server did not start in time"));
        setTimeout(tryOnce, 100);
      });
    };
    tryOnce();
  });
}

function isAppUrl(target, appUrl) {
  try {
    const a = new URL(appUrl);
    const b = new URL(target);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function openExternal(url) {
  // Only allow common external schemes — never pass file: or other local protocols.
  if (!/^https?:|^mailto:|^tel:/i.test(url)) return;
  shell.openExternal(url);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function trayIcon() {
  const img = nativeImage.createFromPath(ICON_PATH);
  if (img.isEmpty()) return img;
  return img.resize({ width: 18, height: 18 });
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

function ensureTray() {
  if (!IS_DARWIN || tray) return;
  const icon = trayIcon();
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip("Project Binder");
  tray.setTitle(trayTitle);
  tray.on("click", focusMainWindow);
}

function setTrayVisible(visible) {
  if (!IS_DARWIN) return;
  if (visible) ensureTray();
  else destroyTray();
}

function setTrayTitle(title) {
  trayTitle = title == null || title === "" ? "No timer" : String(title);
  if (tray) tray.setTitle(trayTitle);
}

function createWindow(appUrl) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
  });
  mainWindow = win;

  // target="_blank" / window.open → default browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url, appUrl)) openExternal(url);
    return { action: "deny" };
  });

  // Same-tab navigations off the app stay in the system browser
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url, appUrl)) return;
    event.preventDefault();
    openExternal(url);
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadURL(appUrl);
}

ipcMain.on("tray:set-visible", (_event, visible) => {
  setTrayVisible(!!visible);
});

ipcMain.on("tray:set-title", (_event, title) => {
  setTrayTitle(title);
});

app.whenReady().then(async () => {
  // Only the packaged app may use real OS Application Support / userData.
  if (app.isPackaged) {
    process.env.PROJECT_BINDER_USER_DATA = app.getPath("userData");
    if (!process.env.PROJECT_BINDER_PORT) process.env.PROJECT_BINDER_PORT = "3456";
  } else if (!process.env.PROJECT_BINDER_PORT) {
    process.env.PROJECT_BINDER_PORT = "3457";
  }
  const port = process.env.PROJECT_BINDER_PORT;
  const appUrl = `http://127.0.0.1:${port}`;
  require("../server.cjs");
  await waitForServer(appUrl);
  createWindow(appUrl);
});

app.on("window-all-closed", () => {
  destroyTray();
  app.quit();
});
