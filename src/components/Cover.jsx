import { Icon } from "../icons.jsx";
import { PC, coverColorChoices } from "../utils.js";

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
            <div className="cover-heading">
              <span className="cover-heading-icon">
                <Icon name="folder" size={22} />
              </span>
              <input
                className="cover-title"
                type="text"
                value={viewName}
                placeholder="Untitled"
                onChange={(e) => onCoverDraftChange({ ...draft, name: e.target.value })}
              />
            </div>
            <textarea
              className="cover-desc"
              value={viewDesc}
              placeholder="Describe this project..."
              rows={5}
              onChange={(e) =>
                onCoverDraftChange({ ...draft, description: e.target.value })
              }
            />
            <div className="cover-meta">
              <div className="cover-meta-label">Color</div>
              <div className="cover-swatches">
                {coverColorChoices(draft.color).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={"cover-swatch" + (c === draft.color ? " on" : "")}
                    title={c}
                    style={{ background: c }}
                    onClick={() => onCoverDraftChange({ ...draft, color: c })}
                  />
                ))}
              </div>
            </div>
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
          <div className="cover-heading">
            <span className="cover-heading-icon">
              <Icon name="folder" size={22} />
            </span>
            <h1 className="cover-title-display">{viewName || "Untitled"}</h1>
          </div>
          <p className={"cover-desc-display" + (viewDesc ? "" : " is-empty")}>
            {viewDesc || "No description yet."}
          </p>
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
            placeholder="Untitled"
            autoFocus
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
          <textarea
            className="cover-desc"
            value={draft.description || ""}
            placeholder="Describe this project..."
            rows={5}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
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
