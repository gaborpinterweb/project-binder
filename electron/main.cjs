const { app, BrowserWindow } = require("electron");
const http = require("http");

const APP_URL = "http://127.0.0.1:3456";

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(APP_URL);
}

app.whenReady().then(async () => {
  process.env.PROJECT_BINDER_USER_DATA = app.getPath("userData");
  require("../server.cjs");
  await waitForServer(APP_URL);
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
