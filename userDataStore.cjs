/**
 * User-data storage: real OS Application Support only for packaged Electron.
 * CLI / browser / unpackaged Electron use an in-memory store seeded from the repo.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function isPackagedElectron() {
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    if (app && typeof app.isPackaged === "boolean") return app.isPackaged;
  } catch {
    /* not running inside Electron */
  }
  return false;
}

function defaultUserDataDir(appName) {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      appName
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    appName
  );
}

function resolvePackagedUserDataDir(appName) {
  const envDir = String(process.env.PROJECT_BINDER_USER_DATA || "").trim();
  if (envDir) return envDir;
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    if (app && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    /* fall through */
  }
  return defaultUserDataDir(appName);
}

function isValidStore(doc) {
  return (
    doc &&
    typeof doc === "object" &&
    doc.version != null &&
    Array.isArray(doc.stages) &&
    Array.isArray(doc.projects) &&
    Array.isArray(doc.timelogs)
  );
}

function readJsonFromDisk(file) {
  if (!fs.existsSync(file)) return { ok: false, reason: "missing" };
  const raw = fs.readFileSync(file, "utf8");
  if (!String(raw).trim()) return { ok: false, reason: "empty" };
  try {
    const doc = JSON.parse(raw);
    if (!isValidStore(doc)) return { ok: false, reason: "invalid" };
    return { ok: true, doc };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

function atomicWriteJson(file, doc) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function walkFiles(rootDir, onFile) {
  if (!fs.existsSync(rootDir)) return;
  const walk = (dir, relParts) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const next = relParts.concat(ent.name);
      if (ent.isDirectory()) walk(abs, next);
      else onFile(next.join("/"), abs);
    }
  };
  walk(rootDir, []);
}

function uploadKey(projectSlug, tabSlug, fileSlug) {
  return `${projectSlug}/${tabSlug}/${fileSlug}`;
}

function createDiskStore(userDataDir, seedUploadsDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const workspacePath = path.join(userDataDir, "userWorkspace.json");
  const settingsPath = path.join(userDataDir, "appSettings.json");
  const uploadsRoot = path.join(userDataDir, "uploads");

  return {
    persistent: true,
    dir: userDataDir,
    workspacePath,
    settingsPath,
    readWorkspaceFile() {
      return readJsonFromDisk(workspacePath);
    },
    writeWorkspaceFile(doc) {
      atomicWriteJson(workspacePath, doc);
    },
    readAppSettingsFile() {
      if (!fs.existsSync(settingsPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      } catch {
        return null;
      }
    },
    writeAppSettingsFile(doc) {
      atomicWriteJson(settingsPath, doc);
    },
    uploadPath(projectSlug, tabSlug, fileSlug) {
      return path.join(uploadsRoot, projectSlug, tabSlug, fileSlug);
    },
    uploadDir(projectSlug, tabSlug) {
      return path.join(uploadsRoot, projectSlug, tabSlug);
    },
    ensureUploadDir(projectSlug, tabSlug) {
      fs.mkdirSync(path.join(uploadsRoot, projectSlug, tabSlug), { recursive: true });
    },
    writeUpload(projectSlug, tabSlug, fileSlug, buf) {
      const dir = path.join(uploadsRoot, projectSlug, tabSlug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileSlug), buf);
    },
    readUpload(projectSlug, tabSlug, fileSlug) {
      const filePath = path.join(uploadsRoot, projectSlug, tabSlug, fileSlug);
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    },
    uploadExists(projectSlug, tabSlug, fileSlug) {
      return fs.existsSync(path.join(uploadsRoot, projectSlug, tabSlug, fileSlug));
    },
    unlinkUpload(projectSlug, tabSlug, fileSlug) {
      try {
        fs.unlinkSync(path.join(uploadsRoot, projectSlug, tabSlug, fileSlug));
      } catch {
        /* may already be gone */
      }
    },
    moveUpload(fromProject, fromTab, fileSlug, toProject, toTab, toSlug) {
      const fromPath = path.join(uploadsRoot, fromProject, fromTab, fileSlug);
      const toDir = path.join(uploadsRoot, toProject, toTab);
      const toPath = path.join(toDir, toSlug);
      if (!fs.existsSync(fromPath)) return { ok: false, error: "file not found" };
      fs.mkdirSync(toDir, { recursive: true });
      try {
        fs.renameSync(fromPath, toPath);
      } catch (err) {
        if (!err || err.code !== "EXDEV") {
          return { ok: false, error: "could not move file" };
        }
        try {
          fs.copyFileSync(fromPath, toPath);
          fs.unlinkSync(fromPath);
        } catch {
          return { ok: false, error: "could not move file" };
        }
      }
      return { ok: true };
    },
    removeUploadTree(projectSlug, tabSlug) {
      const dir = path.join(uploadsRoot, projectSlug, tabSlug);
      if (!fs.existsSync(dir)) return;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
    clearUploads() {
      if (!fs.existsSync(uploadsRoot)) return;
      try {
        fs.rmSync(uploadsRoot, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
    installSeedUploads() {
      this.clearUploads();
      if (!fs.existsSync(seedUploadsDir)) return;
      fs.cpSync(seedUploadsDir, uploadsRoot, { recursive: true });
    },
    appendUploadsToZip(zip) {
      if (fs.existsSync(uploadsRoot)) {
        zip.addLocalFolder(uploadsRoot, "uploads");
      }
    },
    replaceUploadsFromDirectory(srcUploadsDir) {
      this.clearUploads();
      if (fs.existsSync(srcUploadsDir)) {
        fs.cpSync(srcUploadsDir, uploadsRoot, { recursive: true });
      }
    },
    ensureUserDataDir() {
      fs.mkdirSync(userDataDir, { recursive: true });
      return userDataDir;
    },
  };
}

function createMemoryStore(seedUploadsDir) {
  /** @type {Map<string, Buffer>} */
  const uploads = new Map();
  /** @type {object|null} */
  let appSettings = null;

  return {
    persistent: false,
    dir: null,
    workspacePath: null,
    settingsPath: null,
    readWorkspaceFile() {
      // Always missing so the server boots from seed; mutations live in the process `store`.
      return { ok: false, reason: "memory" };
    },
    writeWorkspaceFile() {
      /* ephemeral — server keeps `store` in RAM */
    },
    readAppSettingsFile() {
      return appSettings;
    },
    writeAppSettingsFile(doc) {
      appSettings = doc;
    },
    uploadPath() {
      return null;
    },
    uploadDir() {
      return null;
    },
    ensureUploadDir() {},
    writeUpload(projectSlug, tabSlug, fileSlug, buf) {
      uploads.set(uploadKey(projectSlug, tabSlug, fileSlug), Buffer.from(buf));
    },
    readUpload(projectSlug, tabSlug, fileSlug) {
      const buf = uploads.get(uploadKey(projectSlug, tabSlug, fileSlug));
      return buf ? Buffer.from(buf) : null;
    },
    uploadExists(projectSlug, tabSlug, fileSlug) {
      return uploads.has(uploadKey(projectSlug, tabSlug, fileSlug));
    },
    unlinkUpload(projectSlug, tabSlug, fileSlug) {
      uploads.delete(uploadKey(projectSlug, tabSlug, fileSlug));
    },
    moveUpload(fromProject, fromTab, fileSlug, toProject, toTab, toSlug) {
      const fromKey = uploadKey(fromProject, fromTab, fileSlug);
      const buf = uploads.get(fromKey);
      if (!buf) return { ok: false, error: "file not found" };
      uploads.set(uploadKey(toProject, toTab, toSlug), buf);
      uploads.delete(fromKey);
      return { ok: true };
    },
    removeUploadTree(projectSlug, tabSlug) {
      const prefix = `${projectSlug}/${tabSlug}/`;
      for (const key of [...uploads.keys()]) {
        if (key.startsWith(prefix)) uploads.delete(key);
      }
    },
    clearUploads() {
      uploads.clear();
    },
    installSeedUploads() {
      uploads.clear();
      walkFiles(seedUploadsDir, (rel, abs) => {
        uploads.set(rel.replace(/\\/g, "/"), fs.readFileSync(abs));
      });
    },
    appendUploadsToZip(zip) {
      for (const [rel, buf] of uploads) {
        zip.addFile(`uploads/${rel}`, Buffer.from(buf));
      }
    },
    replaceUploadsFromDirectory(srcUploadsDir) {
      uploads.clear();
      walkFiles(srcUploadsDir, (rel, abs) => {
        uploads.set(rel.replace(/\\/g, "/"), fs.readFileSync(abs));
      });
    },
    ensureUserDataDir() {
      return null;
    },
  };
}

/**
 * @param {{ appName: string, seedUploadsDir: string }} opts
 */
function createUserDataStore(opts) {
  const appName = opts.appName || "Project Binder";
  const seedUploadsDir = opts.seedUploadsDir;
  const packaged = isPackagedElectron();
  if (packaged) {
    const dir = resolvePackagedUserDataDir(appName);
    return createDiskStore(dir, seedUploadsDir);
  }
  return createMemoryStore(seedUploadsDir);
}

module.exports = {
  createUserDataStore,
  isPackagedElectron,
  isValidStore,
};
