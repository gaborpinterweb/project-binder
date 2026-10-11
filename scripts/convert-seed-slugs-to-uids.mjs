/**
 * One-shot: rewrite seedWorkspace.json + seedUploads/ from slug identity to UUID ids.
 * Run from repo root: node scripts/convert-seed-slugs-to-uids.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedPath = path.join(root, "seedWorkspace.json");
const uploadsDir = path.join(root, "seedUploads");
const mapPath = path.join(root, "docs", "seed-slug-to-uid-map.json");

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

const doc = JSON.parse(fs.readFileSync(seedPath, "utf8"));
if (doc.projects?.[0]?.id && !doc.projects?.[0]?.slug) {
  console.error("seedWorkspace.json already looks converted (has id, no slug). Abort.");
  process.exit(1);
}

const map = {};

const projects = (doc.projects || []).map((p) => {
  const oldProject = p.slug;
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
    id: mapGet(map, `timelog/${t.slug}`),
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

fs.mkdirSync(path.dirname(mapPath), { recursive: true });
fs.writeFileSync(seedPath, JSON.stringify(out, null, 2) + "\n");

/** Disk folder alias: seedUploads still used internal-business for freelancing files. */
const uploadProjectAlias = {
  "internal-business": "freelancing",
};

if (fs.existsSync(uploadsDir)) {
  const staging = path.join(root, "seedUploads.__uid__");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  for (const projectSlug of fs.readdirSync(uploadsDir)) {
    const projectSrc = path.join(uploadsDir, projectSlug);
    if (!fs.statSync(projectSrc).isDirectory()) continue;
    const logicalProject = uploadProjectAlias[projectSlug] || projectSlug;
    const projectId = map[`project/${logicalProject}`];
    if (!projectId) {
      console.warn("skip uploads project (no map):", projectSlug);
      continue;
    }
    for (const tabSlug of fs.readdirSync(projectSrc)) {
      const tabSrc = path.join(projectSrc, tabSlug);
      if (!fs.statSync(tabSrc).isDirectory()) continue;
      let tabId = map[`filesTab/${logicalProject}/${tabSlug}`];
      if (!tabId && tabSlug === "__cardfiles__") tabId = "__cardfiles__";
      if (!tabId) {
        console.warn("skip uploads tab (no map):", projectSlug, tabSlug);
        continue;
      }
      for (const fileSlug of fs.readdirSync(tabSrc)) {
        const fileSrc = path.join(tabSrc, fileSlug);
        if (!fs.statSync(fileSrc).isFile()) continue;
        const fileId =
          tabSlug === "__cardfiles__"
            ? mapGet(map, `cardFileBlob/${logicalProject}/${fileSlug}`)
            : map[`file/${logicalProject}/${tabSlug}/${fileSlug}`];
        if (!fileId) {
          console.warn("skip upload file (no map):", projectSlug, tabSlug, fileSlug);
          continue;
        }
        const destDir = path.join(staging, projectId, tabId);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(fileSrc, path.join(destDir, fileId));
      }
    }
  }

  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.renameSync(staging, uploadsDir);
}

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
console.log("Wrote", seedPath);
console.log("Wrote", mapPath);
console.log("Remapped", uploadsDir);
console.log("Mapped keys:", Object.keys(map).length);
