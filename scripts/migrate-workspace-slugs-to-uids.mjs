/**
 * Offline migrator: slug identity → UUID `id` for a packaged user-data folder.
 *
 * Usage (from repo root):
 *   node scripts/migrate-workspace-slugs-to-uids.mjs \
 *     --dir "/path/to/Project Binder" \
 *     --dry-run
 *
 * Expects:
 *   <dir>/userWorkspace.json
 *   <dir>/uploads/   (optional)
 *
 * Writes (unless --dry-run):
 *   - migrated userWorkspace.json (version 2, `id` fields)
 *   - remapped uploads/<projectId>/<tabId>/<fileId>
 *   - <dir>/slug-to-uid-map.json (audit map)
 *   - backups: userWorkspace.json.pre-uid-bak, uploads.pre-uid-bak/
 *
 * See docs/migrate-slugs-to-uids.md
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function uid() {
  return crypto.randomUUID();
}

function mapGet(map, key) {
  if (!map[key]) map[key] = uid();
  return map[key];
}

function stripSlug(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const next = { ...obj };
  delete next.slug;
  return next;
}

function parseArgs(argv) {
  const out = { dir: "", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--dir") out.dir = String(argv[++i] || "").trim();
    else if (a.startsWith("--dir=")) out.dir = a.slice("--dir=".length).trim();
  }
  return out;
}

function migrateWorkspace(doc, map) {
  if (!doc || typeof doc !== "object") throw new Error("invalid workspace");
  if (Number(doc.version) >= 2 && doc.projects?.[0]?.id && !doc.projects?.[0]?.slug) {
    throw new Error("workspace already looks migrated (version>=2 with id)");
  }

  const projects = (doc.projects || []).map((p) => {
    const oldProject = p.slug;
    if (!oldProject) throw new Error("project missing slug");
    const projectId = mapGet(map, `project/${oldProject}`);

    const boards = (p.boards || []).map((b) => {
      const oldBoard = b.slug;
      const boardId = mapGet(map, `board/${oldProject}/${oldBoard}`);
      return stripSlug({
        ...b,
        id: boardId,
        cards: (b.cards || []).map((c) =>
          stripSlug({
            ...c,
            id: mapGet(map, `card/${oldProject}/${oldBoard}/${c.slug}`),
            files: Array.isArray(c.files)
              ? c.files.map((f) =>
                  stripSlug({
                    ...f,
                    id: mapGet(map, `cardFile/${oldProject}/${oldBoard}/${c.slug}/${f.slug}`),
                  })
                )
              : undefined,
          })
        ),
      });
    });

    const notesTabs = (p.notesTabs || []).map((t) => {
      const oldTab = t.slug;
      return stripSlug({
        ...t,
        id: mapGet(map, `notesTab/${oldProject}/${oldTab}`),
        notes: (t.notes || []).map((n) =>
          stripSlug({
            ...n,
            id: mapGet(map, `note/${oldProject}/${oldTab}/${n.slug}`),
          })
        ),
      });
    });

    const filesTabs = (p.filesTabs || []).map((t) => {
      const oldTab = t.slug;
      return stripSlug({
        ...t,
        id: mapGet(map, `filesTab/${oldProject}/${oldTab}`),
        files: (t.files || []).map((f) =>
          stripSlug({
            ...f,
            id: mapGet(map, `file/${oldProject}/${oldTab}/${f.slug}`),
          })
        ),
      });
    });

    const databases = (p.databases || []).map((d) => {
      const oldDb = d.slug;
      return stripSlug({
        ...d,
        id: mapGet(map, `database/${oldProject}/${oldDb}`),
        items: (d.items || []).map((item) =>
          stripSlug({
            ...item,
            id: mapGet(map, `dbItem/${oldProject}/${oldDb}/${item.slug}`),
          })
        ),
      });
    });

    let tabOrder;
    if (Array.isArray(p.tabOrder)) {
      tabOrder = p.tabOrder
        .map((e) => {
          if (!e?.type || !e.slug) return null;
          const key =
            e.type === "board"
              ? `board/${oldProject}/${e.slug}`
              : e.type === "notes"
                ? `notesTab/${oldProject}/${e.slug}`
                : e.type === "files"
                  ? `filesTab/${oldProject}/${e.slug}`
                  : e.type === "database"
                    ? `database/${oldProject}/${e.slug}`
                    : null;
          const id = key && map[key];
          return id ? { type: e.type, id } : null;
        })
        .filter(Boolean);
    }

    const project = stripSlug({
      ...p,
      id: projectId,
      boards,
      notesTabs,
      filesTabs,
      databases,
    });
    if (tabOrder?.length) project.tabOrder = tabOrder;
    else delete project.tabOrder;
    return project;
  });

  const timelogs = (doc.timelogs || []).map((t) =>
    stripSlug({
      ...t,
      id: mapGet(map, `timelog/${t.slug || uid()}`),
      project: map[`project/${t.project}`] || t.project,
      board: map[`board/${t.project}/${t.board}`] || t.board,
      card: map[`card/${t.project}/${t.board}/${t.card}`] || t.card,
    })
  );

  const trash = (doc.trash || []).map((t) => {
    const oldP = t.project;
    const next = stripSlug({
      ...t,
      id: mapGet(map, `trash/${t.slug || uid()}`),
    });
    if (oldP && map[`project/${oldP}`]) {
      next.project = map[`project/${oldP}`];
      if (t.board && map[`board/${oldP}/${t.board}`]) next.board = map[`board/${oldP}/${t.board}`];
      if (t.card && t.board && map[`card/${oldP}/${t.board}/${t.card}`]) {
        next.card = map[`card/${oldP}/${t.board}/${t.card}`];
      }
      if (t.notesTab && map[`notesTab/${oldP}/${t.notesTab}`]) {
        next.notesTab = map[`notesTab/${oldP}/${t.notesTab}`];
      }
      if (t.note && t.notesTab && map[`note/${oldP}/${t.notesTab}/${t.note}`]) {
        next.note = map[`note/${oldP}/${t.notesTab}/${t.note}`];
      }
    }
    return next;
  });

  const out = {
    ...doc,
    version: 2,
    projects,
    timelogs,
  };
  if (trash.length) out.trash = trash;
  else delete out.trash;
  return out;
}

function remapUploads(uploadsDir, map, staging) {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  if (!fs.existsSync(uploadsDir)) return { files: 0 };

  let files = 0;
  for (const projectSlug of fs.readdirSync(uploadsDir)) {
    const projectSrc = path.join(uploadsDir, projectSlug);
    if (!fs.statSync(projectSrc).isDirectory()) continue;
    const projectId = map[`project/${projectSlug}`];
    if (!projectId) {
      console.warn("skip uploads project (no map):", projectSlug);
      continue;
    }
    for (const tabSlug of fs.readdirSync(projectSrc)) {
      const tabSrc = path.join(projectSrc, tabSlug);
      if (!fs.statSync(tabSrc).isDirectory()) continue;
      let tabId = map[`filesTab/${projectSlug}/${tabSlug}`];
      if (!tabId && tabSlug === "__cardfiles__") tabId = "__cardfiles__";
      if (!tabId) {
        console.warn("skip uploads tab (no map):", projectSlug, tabSlug);
        continue;
      }
      for (const fileSlug of fs.readdirSync(tabSrc)) {
        const fileSrc = path.join(tabSrc, fileSlug);
        if (!fs.statSync(fileSrc).isFile()) continue;
        let fileId;
        if (tabSlug === "__cardfiles__") {
          fileId = mapGet(map, `cardFileBlob/${projectSlug}/${fileSlug}`);
          // Prefer id already assigned from card.files meta when slug matches.
          for (const [k, v] of Object.entries(map)) {
            if (k.startsWith(`cardFile/${projectSlug}/`) && k.endsWith(`/${fileSlug}`)) {
              fileId = v;
              break;
            }
          }
        } else {
          fileId = map[`file/${projectSlug}/${tabSlug}/${fileSlug}`];
        }
        if (!fileId) {
          console.warn("skip upload file (no map):", projectSlug, tabSlug, fileSlug);
          continue;
        }
        const destDir = path.join(staging, projectId, tabId);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(fileSrc, path.join(destDir, fileId));
        files += 1;
      }
    }
  }
  return { files };
}

function main() {
  const { dir, dryRun } = parseArgs(process.argv);
  if (!dir) {
    console.error("Usage: node scripts/migrate-workspace-slugs-to-uids.mjs --dir <userDataDir> [--dry-run]");
    process.exit(1);
  }
  const workspacePath = path.join(dir, "userWorkspace.json");
  const uploadsDir = path.join(dir, "uploads");
  const mapPath = path.join(dir, "slug-to-uid-map.json");

  if (!fs.existsSync(workspacePath)) {
    console.error("missing", workspacePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(workspacePath, "utf8");
  const doc = JSON.parse(raw);
  const map = {};
  const migrated = migrateWorkspace(doc, map);

  console.log("projects:", (migrated.projects || []).length);
  console.log("timelogs:", (migrated.timelogs || []).length);
  console.log("map keys:", Object.keys(map).length);

  const staging = path.join(dir, "uploads.__uid__");
  const uploadStats = remapUploads(uploadsDir, map, staging);
  console.log("upload files mapped:", uploadStats.files);

  if (dryRun) {
    fs.rmSync(staging, { recursive: true, force: true });
    console.log("dry-run OK — no files written");
    return;
  }

  const bakWs = workspacePath + ".pre-uid-bak";
  if (!fs.existsSync(bakWs)) fs.copyFileSync(workspacePath, bakWs);
  else console.warn("backup exists, not overwriting:", bakWs);

  if (fs.existsSync(uploadsDir)) {
    const bakUp = path.join(dir, "uploads.pre-uid-bak");
    if (!fs.existsSync(bakUp)) fs.renameSync(uploadsDir, bakUp);
    else {
      console.warn("uploads backup exists; replacing uploads from staging only");
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(staging)) fs.renameSync(staging, uploadsDir);

  fs.writeFileSync(workspacePath, JSON.stringify(migrated, null, 2) + "\n");
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  console.log("wrote", workspacePath);
  console.log("wrote", mapPath);
  console.log("uploads →", uploadsDir);
}

main();
