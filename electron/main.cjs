const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");

app.setName("Project Binder");

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

function createWindow(appUrl) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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

  win.loadURL(appUrl);
}

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
  app.quit();
});
