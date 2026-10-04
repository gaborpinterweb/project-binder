import { PC, coverColorChoices } from "../utils.js";
import RichTextEditor from "./RichTextEditor.jsx";

const DESC_PLACEHOLDER = "Project description with goals, deadlines, links and more...";

function isEmptyDescription(html) {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !text;
}

function CoverDescription({ value, onChange, editable }) {
  return (
    <div className={"cover-description" + (editable ? " is-edit" : "")}>
      <RichTextEditor
        value={value || ""}
        placeholder={DESC_PLACEHOLDER}
        editable={editable}
        showToolbar={editable}
        showLabel={false}
        onChange={(html) => {
          if (!editable) return;
          onChange(html);
        }}
      />
    </div>
  );
}

function patchDraft(onChange, draft, patch) {
  onChange((prev) => ({ ...(prev || draft), ...patch }));
}

function ColorSwatches({ draft, onChange }) {
  return (
    <div className="cover-swatches">
      {coverColorChoices(draft.color).map((c) => (
        <button
          key={c}
          type="button"
          className={"cover-swatch" + (c === draft.color ? " on" : "")}
          title={c}
          style={{ background: c }}
          onClick={() => patchDraft(onChange, draft, { color: c })}
        />
      ))}
    </div>
  );
}

export default function Cover({
  folder,
  mod,
  tabC,
  readonly,
  draftProject,
  coverEdit,
  coverDraft,
  onCoverDraftChange,
  onStartEdit,
  onSave,
  onCommitDraft,
}) {
  if (draftProject) {
    return (
      <DraftCover
        draft={draftProject}
        onChange={onCoverDraftChange}
        onCommit={onCommitDraft}
      />
    );
  }

  const archived = !!readonly;
  const editing = coverEdit && !archived;
  const d = mod[2] || { values: { description: "" } };
  const values = d.values || { description: "" };

  const draft = coverDraft || {
    name: folder.name || "",
    description: values.description || "",
    color: folder.color || tabC || PC[0],
  };

  const viewColor = editing ? draft.color || tabC : tabC;
  const viewName = editing ? draft.name || "" : folder.name || "";
  const viewDesc = editing ? draft.description || "" : values.description || "";

  if (editing) {
    return (
      <div id="view" className="mod cover-view" style={{ ["--tab"]: viewColor }}>
        <div className="cover-page">
          <div className="cover-fields">
            <input
              className="cover-title"
              type="text"
              value={viewName}
              placeholder="Project name..."
              onChange={(e) =>
                patchDraft(onCoverDraftChange, draft, { name: e.target.value })
              }
            />
            <CoverDescription
              value={viewDesc}
              editable
              onChange={(html) =>
                patchDraft(onCoverDraftChange, draft, { description: html })
              }
            />
            <ColorSwatches draft={draft} onChange={onCoverDraftChange} />
            <button
              type="button"
              className="cover-save"
              onClick={() => {
                const name = (draft.name || "").trim() || folder.name || "Untitled";
                onSave({
                  name,
                  description: draft.description || "",
                  color: draft.color || folder.color,
                });
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="view" className="mod cover-view" style={{ ["--tab"]: viewColor }}>
      <div className="cover-page">
        <div className="cover-fields">
          <h1 className="cover-title-display">{viewName || "Untitled"}</h1>
          {isEmptyDescription(viewDesc) ? (
            <p className="cover-desc-display is-empty">No description yet.</p>
          ) : (
            <CoverDescription value={viewDesc} editable={false} />
          )}
          {!archived && (
            <button
              type="button"
              className="cover-edit"
              onClick={() =>
                onStartEdit({
                  name: folder.name || "",
                  description: values.description || "",
                  color: folder.color || tabC || PC[0],
                })
              }
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftCover({ draft, onChange, onCommit }) {
  const tabC = draft.color || PC[0];
  const canCreate = !!(draft.name || "").trim();
  return (
    <div id="view" className="mod cover-view" style={{ ["--tab"]: tabC }}>
      <div className="cover-page">
        <div className="cover-fields">
          <input
            className="cover-title"
            type="text"
            value={draft.name || ""}
            placeholder="Project name..."
            autoFocus
            onChange={(e) => patchDraft(onChange, draft, { name: e.target.value })}
          />
          <CoverDescription
            value={draft.description || ""}
            editable
            onChange={(html) =>
              patchDraft(onChange, draft, { description: html })
            }
          />
          <ColorSwatches draft={draft} onChange={onChange} />
          <button
            type="button"
            className="cover-create"
            disabled={!canCreate}
            onClick={onCommit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
