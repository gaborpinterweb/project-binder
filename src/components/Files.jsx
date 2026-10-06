import { useRef, useState } from "react";
import { postFile, deleteFileApi, fileDownloadUrl } from "../api.js";
import { Icon } from "../icons.jsx";
import { askConfirm } from "../confirmDialog.js";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function Files({ mod, folder, tabC, readonly, onApplyWorkspace }) {
  const d = mod[2] || { slug: "", files: [] };
  const files = d.files || [];
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const addFile = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file || readonly || busy) return;
    setBusy(true);
    try {
      const data = await readFileAsBase64(file);
      const next = await postFile({
        project: folder.slug,
        filesTab: d.slug,
        name: file.name,
        mime: file.type || "application/octet-stream",
        data,
      });
      onApplyWorkspace(next, {
        keepNav: { project: folder.slug, board: d.slug, g: null },
      });
    } catch (err) {
      window.alert(err.message || "Could not upload file");
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    if (readonly || busy) return;
    const ok = await askConfirm({
      title: `Delete "${file.name}"?`,
      message: "This permanently removes the file.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = await deleteFileApi({
        project: folder.slug,
        filesTab: d.slug,
        file: file.slug,
      });
      onApplyWorkspace(next, {
        keepNav: { project: folder.slug, board: d.slug, g: null },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="view" className="mod files-view" style={{ ["--tab"]: tabC }}>
      <div className="modbar">
        <div className="modbar-start">
          {!readonly && (
            <button
              type="button"
              className="mod-act"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="Add file"
              aria-label="Add file"
            >
              <Icon name="plus" size={18} />
              <span className="mod-act-lab">Add file</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            className="files-input"
            onChange={addFile}
            disabled={readonly || busy}
          />
        </div>
      </div>
      <div className="files-body">
        {files.length === 0 ? (
          <div className="files-empty">No files yet.</div>
        ) : (
          <ul className="files-list">
            {files.map((file) => (
              <li key={file.slug} className="files-row">
                <Icon name="Files" size={18} />
                <a
                  className="files-name"
                  href={fileDownloadUrl(folder.slug, d.slug, file.slug)}
                  target="_blank"
                  rel="noreferrer"
                  title={file.name}
                >
                  {file.name}
                </a>
                {!readonly && (
                  <button
                    type="button"
                    className="files-del"
                    onClick={() => removeFile(file)}
                    disabled={busy}
                    title="Delete file"
                    aria-label={`Delete ${file.name}`}
                  >
                    <Icon name="Trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
