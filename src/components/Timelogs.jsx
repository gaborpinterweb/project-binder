import { useEffect, useMemo, useRef, useState } from "react";
import { deleteTimelogApi, fetchTimelogs, postTimelog, putTimelog } from "../api.js";
import {
  GACC,
  TIMELOG_GROUP_BYS,
  TIMELOG_PERIODS,
  allBoards,
  formatClock,
  formatDuration,
  formatSpent,
  groupTimelogsByPeriodAndProject,
  matchesTimelogFilter,
  matchesTimelogPeriod,
  pastel,
} from "../utils.js";
import { Icon } from "../icons.jsx";
import GlobalBar from "./GlobalBar.jsx";
import Dropdown from "./Dropdown.jsx";
import { askConfirm } from "../confirmDialog.js";
import { askPrompt } from "../promptDialog.js";

function entryBoardKey(entry) {
  return `${entry.project || ""}/${entry.board || ""}`;
}

const EXPORT_HEADERS = [
  "Date",
  "Time",
  "Project",
  "Board",
  "Task",
  "Duration",
  "Hours",
  "Note",
];

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExportDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatExportHours(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return (s / 3600).toFixed(2);
}

function timelogExportRows(entries) {
  return (entries || []).map((entry) => {
    const stamp = entry.endedAt || entry.startedAt || "";
    return [
      formatExportDate(stamp),
      formatClock(stamp),
      entry.projectName || entry.project || "",
      entry.boardName || entry.board || "",
      entry.title || "Untitled",
      formatDuration(entry.durationSec),
      formatExportHours(entry.durationSec),
      entry.note || "",
    ];
  });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportFilename(period, ext) {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  const slug = String(period || "timelogs")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `timelogs-${slug}-${y}${m}${d}.${ext}`;
}

function exportTimelogsCsv(entries, period) {
  const rows = timelogExportRows(entries);
  const lines = [EXPORT_HEADERS, ...rows].map((row) =>
    row.map(escapeCsvCell).join(",")
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(exportFilename(period, "csv"), blob);
}

/** HTML table Excel opens as a spreadsheet (no library). */
function exportTimelogsExcel(entries, period) {
  const rows = timelogExportRows(entries);
  const head = EXPORT_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  downloadBlob(exportFilename(period, "xls"), blob);
}

function ExportDropdown({ entries, period, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const run = (format) => {
    if (disabled) return;
    if (format === "csv") exportTimelogsCsv(entries, period);
    else exportTimelogsExcel(entries, period);
    setOpen(false);
  };

  return (
    <div
      className={"export-dd" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className="mod-act export-btn"
        aria-label="Export timelogs"
        title="Export timelogs"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="export" size={18} />
        <span className="mod-act-lab">Export</span>
      </button>
      {open && !disabled && (
        <div className="pop" role="menu">
          <button type="button" role="menuitem" onClick={() => run("csv")}>
            CSV
          </button>
          <button type="button" role="menuitem" onClick={() => run("excel")}>
            Excel
          </button>
        </div>
      )}
    </div>
  );
}

function BoardFilterDropdown({ boards, boardOff, onToggle }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      className={"board-filter" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className="mod-act board-filter-btn"
        aria-label="Task boards"
        title="Task boards"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="board" size={18} />
        <span className="mod-act-lab">Boards</span>
      </button>
      {open && (
        <div className="pop" role="listbox" aria-multiselectable="true">
          {!boards.length && (
            <div className="board-filter-empty">No task boards yet</div>
          )}
          {boards.map((b) => {
            const on = !boardOff.has(b.key);
            return (
              <label
                key={b.key}
                className="board-filter-item"
                role="option"
                aria-selected={on}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(b.key)}
                />
                <span className="dot" style={{ background: b.color || GACC }} />
                <span className="lab">{b.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatFromTo(entry) {
  const start = entry.startedAt ? formatClock(entry.startedAt) : "";
  const end = entry.endedAt ? formatClock(entry.endedAt) : "";
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

function TimelogRow({
  entry,
  isEditing,
  draftNote,
  busySlug,
  noteRef,
  onOpenCard,
  onStartEdit,
  onDraftChange,
  onSaveNote,
  onCancelEdit,
  onDelete,
}) {
  const color = entry.color || GACC;
  const note = entry.note || "";
  const src = [entry.projectName || entry.project, entry.boardName || entry.board]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="timelog-row" style={{ ["--pc"]: color }}>
      <div className="timelog-card-wrap">
        <button
          type="button"
          className="card tint timelog-card"
          style={{ background: pastel(color) }}
          onClick={() => onOpenCard?.(entry.project, entry.board, entry.card)}
        >
          <b>
            <span className="card-name">{entry.title || "Untitled"}</span>
          </b>
          {src ? <span className="src">{src}</span> : null}
        </button>
      </div>
      <div className="timelog-note">
        {isEditing ? (
          <textarea
            ref={noteRef}
            className="entry-note-input"
            rows={2}
            value={draftNote}
            disabled={busySlug === entry.slug}
            placeholder="Add a note…"
            onChange={(e) => onDraftChange(e.target.value)}
            onBlur={() => onSaveNote(entry)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={"entry-note" + (note ? "" : " entry-note-empty")}
            onClick={() => onStartEdit(entry)}
            disabled={!!busySlug}
          >
            <span className="entry-note-text">{note || "Add note"}</span>
            <span className="entry-note-edit" aria-hidden="true">
              <Icon name="pencil" size={12} />
            </span>
          </button>
        )}
      </div>
      <time
        className="timelog-range"
        dateTime={entry.endedAt || entry.startedAt || ""}
      >
        {formatFromTo(entry)}
      </time>
      <div className="timelog-time">
        <span className="dur">{formatDuration(entry.durationSec)}</span>
        <button
          type="button"
          className="entry-delete"
          title="Delete timelog"
          aria-label="Delete timelog"
          disabled={busySlug === entry.slug}
          onClick={() => onDelete(entry)}
        >
          <Icon name="Trash" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Timelogs({
  tabC = GACC,
  folders = [],
  timelogFilter,
  onClearFilter,
  onOpenCard,
  refreshKey,
}) {
  const [entries, setEntries] = useState(null);
  const [period, setPeriod] = useState("This week");
  const [groupBy, setGroupBy] = useState("Day");
  const [boardOff, setBoardOff] = useState(() => new Set());
  const [editingSlug, setEditingSlug] = useState(null);
  const [draftNote, setDraftNote] = useState("");
  const [busySlug, setBusySlug] = useState(null);
  const noteRef = useRef(null);

  const boards = useMemo(
    () =>
      allBoards(folders).map(({ folder, mod, color, key }) => ({
        key,
        label: `${folder.name} · ${mod[1]}`,
        color,
      })),
    [folders]
  );

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    fetchTimelogs()
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, timelogFilter]);

  useEffect(() => {
    if (editingSlug && noteRef.current) {
      noteRef.current.focus();
      const len = noteRef.current.value.length;
      noteRef.current.setSelectionRange(len, len);
    }
  }, [editingSlug]);

  const filter = timelogFilter;
  const shown = useMemo(() => {
    if (!entries) return null;
    return entries.filter(
      (e) =>
        matchesTimelogPeriod(e, period) &&
        matchesTimelogFilter(e, filter) &&
        !boardOff.has(entryBoardKey(e))
    );
  }, [entries, filter, period, boardOff]);

  const groups = useMemo(
    () => (shown ? groupTimelogsByPeriodAndProject(shown, groupBy) : null),
    [shown, groupBy]
  );

  const toggleBoard = (key) => {
    setBoardOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addLog = async () => {
    const boardsList = allBoards(folders);
    if (!boardsList.length) {
      alert("Create a task board first to add a log.");
      return;
    }
    const mins = await askPrompt({
      title: "Add log",
      defaultValue: "25",
      placeholder: "Duration in minutes",
      confirmLabel: "Add",
    });
    if (mins == null) return;
    const durationSec = Math.max(0, Math.round(parseFloat(String(mins).replace(",", ".")) * 60) || 0);
    const { folder, mod, color } = boardsList[0];
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - durationSec * 1000);
    try {
      await postTimelog({
        project: folder.slug,
        board: mod[2]?.slug || "",
        card: "",
        title: "Manual entry",
        projectName: folder.name,
        boardName: mod[1],
        color: color || folder.color || GACC,
        kind: "manual",
        note: "",
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSec,
      });
      const list = await fetchTimelogs();
      setEntries(list);
    } catch {
      alert("Could not add timelog.");
    }
  };

  const startEdit = (entry) => {
    if (busySlug) return;
    setEditingSlug(entry.slug);
    setDraftNote(entry.note || "");
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setDraftNote("");
  };

  const saveNote = async (entry) => {
    if (!editingSlug || busySlug) return;
    const nextNote = draftNote;
    const prev = entry.note || "";
    setEditingSlug(null);
    setDraftNote("");
    if (nextNote === prev) return;
    setBusySlug(entry.slug);
    setEntries((list) =>
      (list || []).map((e) =>
        e.slug === entry.slug ? { ...e, note: nextNote } : e
      )
    );
    try {
      const data = await putTimelog({ slug: entry.slug, note: nextNote });
      if (data.timelogs) setEntries(data.timelogs);
    } catch {
      setEntries((list) =>
        (list || []).map((e) =>
          e.slug === entry.slug ? { ...e, note: prev } : e
        )
      );
      alert("Could not save note.");
    } finally {
      setBusySlug(null);
    }
  };

  const handleDelete = async (entry) => {
    if (busySlug) return;
    const label = entry.title || "Untitled";
    const ok = await askConfirm({
      title: `Delete timelog for "${label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusySlug(entry.slug);
    if (editingSlug === entry.slug) cancelEdit();
    try {
      const data = await deleteTimelogApi({ slug: entry.slug });
      setEntries(data.timelogs || []);
    } catch {
      alert("Could not delete timelog.");
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <div id="view" className="mod" style={{ ["--tab"]: tabC }}>
      <GlobalBar name="Timelogs">
        <button
          type="button"
          className="mod-act"
          title="Add log"
          aria-label="Add log"
          onClick={addLog}
        >
          <Icon name="plus" size={18} />
          <span className="mod-act-lab">Add log</span>
        </button>
        <BoardFilterDropdown
          boards={boards}
          boardOff={boardOff}
          onToggle={toggleBoard}
        />
        <Dropdown
          className="mod-view-dd"
          buttonClassName="mod-act"
          ariaLabel="Group by"
          title="Group by"
          align="right"
          caret={false}
          value={groupBy}
          options={TIMELOG_GROUP_BYS}
          onChange={setGroupBy}
        >
          <Icon name="list" size={18} />
          <span className="mod-act-lab">Group</span>
        </Dropdown>
        <Dropdown
          className="mod-view-dd"
          buttonClassName="mod-act"
          ariaLabel="Timelog period"
          title="Timelog period"
          align="right"
          caret={false}
          value={period}
          options={TIMELOG_PERIODS}
          onChange={setPeriod}
        >
          <Icon name="Calendar" size={18} />
          <span className="mod-act-lab">Period</span>
        </Dropdown>
        <ExportDropdown
          entries={shown || []}
          period={period}
          disabled={!shown?.length}
        />
      </GlobalBar>
      {filter && (
        <div className="log-filter">
          Card: <b>{filter.title || filter.card || "Untitled"}</b>
          <button type="button" className="clear" onClick={onClearFilter}>
            Clear filter
          </button>
        </div>
      )}
      <div className="log timelogs">
        {shown == null && <div className="empty-log">Loading…</div>}
        {shown && !shown.length && (
          <div className="empty-log">
            {filter
              ? `No timelogs for this card in ${period.toLowerCase()}.`
              : entries?.length
                ? `No timelogs for ${period.toLowerCase()}.`
                : "No timelogs yet. Start a pomodoro from a card."}
          </div>
        )}
        {groups &&
          groups.map((periodGroup) => (
            <section className="log-period" key={periodGroup.key}>
              {periodGroup.label != null && (
                <header className="log-period-head">
                  <h3>{periodGroup.label}</h3>
                  <span className="log-agg">{formatSpent(periodGroup.totalSec)}</span>
                </header>
              )}
              <div className="timelog-table">
                {periodGroup.entries.map((entry) => (
                  <TimelogRow
                    key={entry.slug}
                    entry={entry}
                    isEditing={editingSlug === entry.slug}
                    draftNote={draftNote}
                    busySlug={busySlug}
                    noteRef={noteRef}
                    onOpenCard={onOpenCard}
                    onStartEdit={startEdit}
                    onDraftChange={setDraftNote}
                    onSaveNote={saveNote}
                    onCancelEdit={cancelEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
