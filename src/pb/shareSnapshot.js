/** Build guest-readable workspace snapshots and collect attachment keys. */

import { COVER_TAB_ID } from "../utils.js";
import { attachmentKey } from "./persist.js";

function pushFileMeta(keys, projectId, tabId, files) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    if (!f?.id) continue;
    keys.add(attachmentKey(projectId, tabId, f.id));
  }
}

/** Collect attachment keys referenced by an API-shaped project. */
export function collectAttachmentKeys(project) {
  const keys = new Set();
  if (!project?.id) return keys;
  const projectId = project.id;
  const cover = project.cover || {};
  pushFileMeta(keys, projectId, COVER_TAB_ID, cover.images);

  for (const b of project.boards || []) {
    for (const c of b.cards || []) {
      pushFileMeta(keys, projectId, b.id, c.files);
      pushFileMeta(keys, projectId, b.id, c.images);
    }
  }
  for (const t of project.notesTabs || []) {
    for (const n of t.notes || []) {
      pushFileMeta(keys, projectId, t.id, n.images);
    }
  }
  for (const t of project.filesTabs || []) {
    pushFileMeta(keys, projectId, t.id, t.files);
  }
  return keys;
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

/**
 * @param {object} workspaceApi - result of engine.getWorkspace()
 * @param {{ scope: "project"|"tab", projectId: string, tabId?: string }} target
 * @returns {{ workspace: object, keys: Set<string> }}
 */
export function buildShareSnapshot(workspaceApi, target) {
  const projects = workspaceApi?.projects || [];
  const project = projects.find((p) => p.id === target.projectId);
  if (!project) throw new Error("project not found");

  let sliced;
  if (target.scope === "project") {
    sliced = cloneProject(project);
  } else {
    const tabId = target.tabId;
    if (!tabId) throw new Error("tabId required for tab share");
    const full = cloneProject(project);
    sliced = {
      id: full.id,
      name: full.name,
      color: full.color,
      cover: { values: { description: "" } },
      boards: [],
      databases: [],
      notesTabs: [],
      filesTabs: [],
      tabOrder: [],
    };
    const board = (full.boards || []).find((b) => b.id === tabId);
    if (board) {
      sliced.boards = [board];
      sliced.tabOrder = [{ type: "board", id: tabId }];
    } else {
      const notes = (full.notesTabs || []).find((t) => t.id === tabId);
      if (notes) {
        sliced.notesTabs = [notes];
        sliced.tabOrder = [{ type: "notes", id: tabId }];
      } else {
        const files = (full.filesTabs || []).find((t) => t.id === tabId);
        if (files) {
          sliced.filesTabs = [files];
          sliced.tabOrder = [{ type: "files", id: tabId }];
        } else {
          const db = (full.databases || []).find((d) => d.id === tabId);
          if (db) {
            sliced.databases = [db];
            sliced.tabOrder = [{ type: "database", id: tabId }];
          } else {
            throw new Error("tab not found");
          }
        }
      }
    }
  }

  const keys = collectAttachmentKeys(sliced);
  const workspace = {
    version: 2,
    stages: Array.isArray(workspaceApi.stages) ? workspaceApi.stages.slice() : [],
    projects: [sliced],
    shareMeta: {
      scope: target.scope,
      projectId: target.projectId,
      tabId: target.tabId || "",
    },
  };
  return { workspace, keys };
}
