const { app, BrowserWindow } = require("electron");
const http = require("http");
const path = require("path");

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
