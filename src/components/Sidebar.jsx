import { Icon } from "../icons.jsx";
import {
  GACC,
  PC,
  formatDuration,
  globalLabel,
  pomoRemainingSec,
} from "../utils.js";

export default function Sidebar({
  folders,
  p,
  g,
  draftProject,
  coverEdit,
  coverDraft,
  activePomo,
  workspaceItems,
  showArchived = false,
  onSelectGlobal,
  onSelectProject,
  onAddProject,
  onStopPomo,
  onPomoNoteChange,
  onOpenPomoCard,
  onOpenSettings,
  updateAvailable,
  onOpenUpdate,
}) {
  const active = folders.map((pr, i) => ({ pr, i })).filter((x) => !x.pr.archived);
  const archived = folders.map((pr, i) => ({ pr, i })).filter((x) => x.pr.archived);
  const globals = workspaceItems || [];

  return (
    <aside>
      <div className="side-scroll">
        {globals.length > 0 && (
          <>
            <h2>Workspace</h2>
            <div id="globals">
              {globals.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={"bm" + (g === n ? " on" : "")}
                  onClick={() => onSelectGlobal(n)}
                >
                  <span style={{ color: GACC }}>
                    <Icon name={n} />
                  </span>
                  <span>{globalLabel(n)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="side-head">
          <h2>Projects</h2>
          <button
            type="button"
            className="side-add"
            id="add-project"
            title="New project"
            aria-label="New project"
            onClick={(e) => {
              e.stopPropagation();
              onAddProject();
            }}
          >
            +
          </button>
        </div>
        <div id="folders">
          {active.length === 0 && (
            <p className="side-empty">No projects yet</p>
          )}
          {active.map(({ pr, i }) => {
            const editingHere = coverEdit && coverDraft && i === p && !g && !draftProject;
            const icColor = editingHere
              ? coverDraft.color || pr.color
              : pr.color || PC[i % PC.length];
            const label = editingHere ? coverDraft.name || pr.name : pr.name;
            return (
              <button
                key={pr.slug}
                type="button"
                className={"bm" + (i === p && !g && !draftProject ? " on" : "")}
                onClick={() => onSelectProject(i)}
              >
                <span style={{ color: icColor }}>
                  <Icon name="folder" />
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {showArchived && (
          <div id="archived-wrap">
            <h2 className="side-muted">Archived projects</h2>
            <div id="archived" className="archived-list">
              {archived.length === 0 && (
                <p className="side-empty">No archived projects yet.</p>
              )}
              {archived.map(({ pr, i }) => (
                <button
                  key={pr.slug}
                  type="button"
                  className={"bm" + (i === p && !g && !draftProject ? " on" : "")}
                  onClick={() => onSelectProject(i)}
                >
                  <span style={{ color: pr.color || PC[i % PC.length] }}>
                    <Icon name="folder" />
                  </span>
                  <span>{pr.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="side-foot">
        <PomoBlock
          activePomo={activePomo}
          onStop={onStopPomo}
          onNoteChange={onPomoNoteChange}
          onOpenCard={onOpenPomoCard}
        />
        {updateAvailable && (
          <button
            type="button"
            className="bm side-update"
            id="app-update"
            title="Update available"
            onClick={(e) => {
              e.stopPropagation();
              onOpenUpdate?.();
            }}
          >
            <span>
              <Icon name="arrow" />
            </span>
            <span>Update available</span>
          </button>
        )}
        <button
          type="button"
          className="bm"
          id="app-settings"
          title="Settings"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings?.();
          }}
        >
          <span>
            <Icon name="settings" />
          </span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function PomoBlock({ activePomo, onStop, onNoteChange, onOpenCard }) {
  if (!activePomo) {
    return <div className="pomo-block" id="pomo-block" hidden />;
  }
  const rem = pomoRemainingSec(activePomo);
  const color = activePomo.color || GACC;
  return (
    <div className="pomo-block on" id="pomo-block">
      <div className="pomo-time" id="pomo-time">
        {formatDuration(rem)}
      </div>
      <button
        type="button"
        className="pomo-mini"
        id="pomo-mini"
        title="Open card"
        style={{ ["--pc"]: color }}
        onClick={onOpenCard}
      >
        <b id="pomo-card-title">{activePomo.title || "Untitled"}</b>
        <span className="meta">
          <span className="dot" id="pomo-card-dot" style={{ background: color }} />
          <span id="pomo-card-meta">
            {(activePomo.projectName || "Project") +
              " · " +
              (activePomo.boardName || "Board")}
          </span>
        </span>
      </button>
      <textarea
        className="pomo-note"
        id="pomo-note"
        rows={2}
        placeholder="Add notes for this timelog..."
        value={activePomo.note || ""}
        onChange={(e) => onNoteChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      <button type="button" className="pomo-stop" id="pomo-stop" onClick={onStop}>
        Stop pomodoro
      </button>
    </div>
  );
}
