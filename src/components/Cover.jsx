import { PC, coverColorChoices, coverColorName } from "../utils.js";
import { Icon } from "../icons.jsx";
import Dropdown from "./Dropdown.jsx";
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
        headingLevels={[1, 2]}
        showTable
        showQuote
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

function ColorDropdown({ draft, onChange }) {
  const color = draft.color || PC[0];
  const name = coverColorName(color);
  const options = coverColorChoices(color).map((c) => ({
    value: c,
    label: coverColorName(c),
  }));
  return (
    <Dropdown
      className="cover-color-dd"
      align="right"
      options={options}
      value={color}
      onChange={(c) => patchDraft(onChange, draft, { color: c })}
      ariaLabel={name}
      title={name}
      renderOption={(o) => (
        <span className="cover-color-opt">
          <span className="cover-color-opt-dot" style={{ background: o.value }} />
          <span className="cover-color-opt-lab">{o.label}</span>
          {o.value === color ? <Icon name="check" size={14} /> : null}
        </span>
      )}
    >
      <span className="cover-color-dd-dot" style={{ background: color }} />
      <span className="cover-color-dd-lab">{name}</span>
    </Dropdown>
  );
}

function CoverDock({ children }) {
  return (
    <div className="cover-dock">
      <div className="cover-dock-inner">{children}</div>
    </div>
  );
}

function CoverActions({ editing, draft, folder, onStartEdit, onSave, onArchive, onDelete }) {
  const label = editing ? "Save project" : "Edit project";
  return (
    <CoverDock>
      <button
        type="button"
        className={"cover-dock-btn" + (editing ? " primary" : "")}
        title={label}
        aria-label={label}
        onClick={() => {
          if (editing) {
            const name = (draft.name || "").trim() || folder.name || "Untitled";
            onSave({
              name,
              description: draft.description || "",
              color: draft.color || folder.color,
            });
            return;
          }
          onStartEdit({
            name: folder.name || "",
            description: draft.description || "",
            color: draft.color || folder.color || PC[0],
          });
        }}
      >
        <Icon name={editing ? "check" : "pencil"} size={18} />
        <span>{label}</span>
      </button>
      {editing && (
        <>
          <button
            type="button"
            className="cover-dock-btn"
            title="Archive"
            aria-label="Archive"
            onClick={onArchive}
          >
            <Icon name="Archive" size={18} />
            <span>Archive</span>
          </button>
          <button
            type="button"
            className="cover-dock-btn"
            title="Delete"
            aria-label="Delete"
            onClick={onDelete}
          >
            <Icon name="Trash" size={18} />
            <span>Delete</span>
          </button>
        </>
      )}
    </CoverDock>
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
  onArchive,
  onDelete,
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

  return (
    <div id="view" className="mod cover-view" style={{ ["--tab"]: viewColor }}>
      <div className="cover-page">
        <div className="cover-fields">
          {editing ? (
            <>
              <div className="cover-title-row">
                <input
                  className="cover-title"
                  type="text"
                  value={viewName}
                  placeholder="Project name..."
                  onChange={(e) =>
                    patchDraft(onCoverDraftChange, draft, { name: e.target.value })
                  }
                />
                <ColorDropdown draft={draft} onChange={onCoverDraftChange} />
              </div>
              <CoverDescription
                key="edit"
                value={viewDesc}
                editable
                onChange={(html) =>
                  patchDraft(onCoverDraftChange, draft, { description: html })
                }
              />
            </>
          ) : (
            <>
              <h1 className="cover-title-display">{viewName || "Untitled"}</h1>
              {isEmptyDescription(viewDesc) ? (
                <p className="cover-desc-display is-empty">No description yet.</p>
              ) : (
                <CoverDescription key="view" value={viewDesc} editable={false} />
              )}
            </>
          )}
        </div>
      </div>
      {!archived && (
        <CoverActions
          editing={editing}
          draft={
            editing
              ? draft
              : {
                  name: folder.name || "",
                  description: values.description || "",
                  color: folder.color || tabC || PC[0],
                }
          }
          folder={folder}
          onStartEdit={onStartEdit}
          onSave={onSave}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      )}
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
          <div className="cover-title-row">
            <input
              className="cover-title"
              type="text"
              value={draft.name || ""}
              placeholder="Project name..."
              autoFocus
              onChange={(e) => patchDraft(onChange, draft, { name: e.target.value })}
            />
            <ColorDropdown draft={draft} onChange={onChange} />
          </div>
          <CoverDescription
            value={draft.description || ""}
            editable
            onChange={(html) =>
              patchDraft(onChange, draft, { description: html })
            }
          />
        </div>
      </div>
      <CoverDock>
        <button
          type="button"
          className="cover-dock-btn primary"
          title="Create project"
          aria-label="Create project"
          disabled={!canCreate}
          onClick={onCommit}
        >
          <Icon name="check" size={18} />
          <span>Create project</span>
        </button>
      </CoverDock>
    </div>
  );
}
