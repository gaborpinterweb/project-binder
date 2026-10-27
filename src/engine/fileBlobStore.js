/** In-memory file bytes keyed `project/tab/file` (mirrors uploads/<projectId>/<tabId>/<fileId>). */

const blobs = new Map();

export const blobKey = (projectId, tabId, fileId) => `${projectId}/${tabId}/${fileId}`;

export const fileBlobStore = {
  get: (key) => blobs.get(key),
  set: (key, blob) => {
    blobs.set(key, blob);
  },
  delete: (key) => blobs.delete(key),
  clear: () => blobs.clear(),
  /** Keys that start with `prefix` (e.g. `project/tab/`). */
  listByPrefix: (prefix) => [...blobs.keys()].filter((k) => k.startsWith(prefix)),
};
