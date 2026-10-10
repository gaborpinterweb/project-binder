import { useEffect, useMemo, useRef, useState } from "react";
import { deleteTimelogApi, fetchTimelogs, postTimelog, putTimelog } from "../api.js";
import {
  GACC,
  TIMELOG_GROUP_BYS,
  TIMELOG_PERIODS,
  allBoardTasks,
  allBoards,
  formatClock,
  formatDuration,
  formatSpent,
  groupTimelogsByPeriodAndProject,
  liveCardTitle,
  matchesTimelogFilter,
  matchesTimelogPeriod,
  pastel,
  taskKey,
} from "../utils.js";
import { Icon } from "../icons.jsx";
import GlobalBar from "./GlobalBar.jsx";
import Dropdown from "./Dropdown.jsx";
import TimelogDialog from "./TimelogDialog.jsx";
import { askConfirm } from "../confirmDialog.js";

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

function entryCardTitle(folders, entry) {
  return liveCardTitle(
    folders,
    entry.project,
    entry.board,
    entry.card,
    entry.title || "Untitled"
  );
}

function timelogExportRows(entries, folders = []) {
  return (entries || []).map((entry) => {
    const stamp = entry.endedAt || entry.startedAt || "";
    return [
      formatExportDate(stamp),
      formatClock(stamp),
      entry.projectName || entry.project || "",
      entry.boardName || entry.board || "",
      entryCardTitle(folders, entry),
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

function exportTimelogsCsv(entries, period, folders = []) {
  const rows = timelogExportRows(entries, folders);
  const lines = [EXPORT_HEADERS, ...rows].map((row) =>
    row.map(escapeCsvCell).join(",")
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(exportFilename(period, "csv"), blob);
}

/** HTML table Excel opens as a spreadsheet (no library). */
function exportTimelogsExcel(entries, period, folders = []) {
  const rows = timelogExportRows(entries, folders);
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

function ExportDropdown({ entries, period, folders = [], disabled }) {
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
    if (format === "csv") exportTimelogsCsv(entries, period, folders);
    else exportTimelogsExcel(entries, period, folders);
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

function TimelogMoreMenu({ disabled, onEdit, onDelete }) {
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

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  return (
    <div
      className={"timelog-more" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        className="timelog-more-btn"
        title="Timelog options"
        aria-label="Timelog options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" size={14} />
      </button>
      {open ? (
        <div className="pop" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onEdit)}
          >
            <Icon name="pencil" size={14} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => run(onDelete)}
          >
            <Icon name="Trash" size={14} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TimelogRow({
  entry,
  folders = [],
  busySlug,
  onOpenCard,
  onEdit,
  onDelete,
}) {
  const color = entry.color || GACC;
  const note = entry.note || "";
  const busy = busySlug === entry.slug;
  const stamp = entry.endedAt || entry.startedAt || "";
  const title = entryCardTitle(folders, entry);

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
            <span className="card-name">{title}</span>
          </b>
        </button>
      </div>
      <div className="timelog-note">
        {note ? (
          <span className="timelog-note-text">{note}</span>
        ) : (
          <span className="timelog-note-text is-empty">No notes…</span>
        )}
      </div>
      <time className="timelog-date" dateTime={stamp}>
        {formatExportDate(stamp) || "—"}
      </time>
      <time className="timelog-range" dateTime={stamp}>
        {formatFromTo(entry)}
      </time>
      <div className="timelog-time">
        <span className="dur">{formatDuration(entry.durationSec)}</span>
        <TimelogMoreMenu
          disabled={busy}
          onEdit={() => onEdit(entry)}
          onDelete={() => onDelete(entry)}
        />
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
  const [period, setPeriod] = useState(() =>
    timelogFilter ? "All time" : "This week"
  );
  const [groupBy, setGroupBy] = useState("Day");
  const [boardOff, setBoardOff] = useState(() => new Set());
  const [busySlug, setBusySlug] = useState(null);
  const [dialog, setDialog] = useState(null); // null | { mode: "add" } | { mode: "edit", entry }

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
    if (timelogFilter) setPeriod("All time");
  }, [timelogFilter]);

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

  const filter = timelogFilter;

  const defaultAddTaskKey = useMemo(() => {
    if (filter?.project && filter?.board && filter?.card) {
      return taskKey(filter.project, filter.board, filter.card);
    }
    const first = allBoardTasks(folders)[0];
    if (!first) return "";
    return taskKey(first.folder.slug, first.mod[2]?.slug, first.row.slug);
  }, [folders, filter]);
  const baseFiltered = useMemo(() => {
    if (!entries) return null;
    return entries.filter(
      (e) =>
        matchesTimelogFilter(e, filter) && !boardOff.has(entryBoardKey(e))
    );
  }, [entries, filter, boardOff]);

  const shown = useMemo(() => {
    if (!baseFiltered) return null;
    return baseFiltered.filter((e) => matchesTimelogPeriod(e, period));
  }, [baseFiltered, period]);

  const groups = useMemo(
    () =>
      shown ? groupTimelogsByPeriodAndProject(shown, groupBy) : null,
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

  const openAddDialog = () => {
    if (!allBoardTasks(folders).length) {
      alert("Create a task board with a card first to add a log.");
      return;
    }
    setDialog({ mode: "add" });
  };

  const openEditDialog = (entry) => {
    if (busySlug) return;
    setDialog({ mode: "edit", entry });
  };

  const closeDialog = () => setDialog(null);

  const saveDialog = async (payload) => {
    if (dialog?.mode === "edit") {
      const data = await putTimelog(payload);
      if (data.timelogs) setEntries(data.timelogs);
      else setEntries(await fetchTimelogs());
    } else {
      const data = await postTimelog(payload);
      if (data?.error) throw new Error(data.error);
      if (data?.timelogs) setEntries(data.timelogs);
      else setEntries(await fetchTimelogs());
    }
    setDialog(null);
  };

  const handleDelete = async (entry) => {
    if (busySlug) return;
    const label = entryCardTitle(folders, entry);
    const ok = await askConfirm({
      title: `Delete timelog for "${label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusySlug(entry.slug);
    if (dialog?.mode === "edit" && dialog.entry?.slug === entry.slug) {
      closeDialog();
    }
    try {
      const data = await deleteTimelogApi({ slug: entry.slug });
      setEntries(data.timelogs || []);
    } catch {
      alert("Could not delete timelog.");
    } finally {
      setBusySlug(null);
    }
  };

  const renderTimelogRow = (entry) => (
    <TimelogRow
      key={entry.slug}
      entry={entry}
      folders={folders}
      busySlug={busySlug}
      onOpenCard={onOpenCard}
      onEdit={openEditDialog}
      onDelete={handleDelete}
    />
  );

  const renderTimelogRows = (list) => (
    <div className="timelog-table">{list.map(renderTimelogRow)}</div>
  );

  return (
    <div id="view" className="mod" style={{ ["--tab"]: tabC }}>
      <GlobalBar name="Timelogs">
        <button
          type="button"
          className="mod-act"
          onClick={openAddDialog}
          title="Add log"
          aria-label="Add log"
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
          folders={folders}
          disabled={!shown?.length}
        />
      </GlobalBar>
      {filter && (
        <div className="log-filter">
          Card:{" "}
          <b>
            {entryCardTitle(folders, filter) ||
              filter.title ||
              filter.card ||
              "Untitled"}
          </b>
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
              ? period === "All time"
                ? "No timelogs for this card."
                : `No timelogs for this card in ${period.toLowerCase()}.`
              : entries?.length
                ? period === "All time"
                  ? "No timelogs yet. Start a pomodoro from a card."
                  : `No timelogs for ${period.toLowerCase()}.`
                : "No timelogs yet. Start a pomodoro from a card."}
          </div>
        )}
        {groups &&
          groups.map((periodGroup) => (
            <section className="log-period" key={periodGroup.key}>
              {periodGroup.label != null && (
                <header className="log-period-head">
                  <h3>{periodGroup.label}</h3>
                  <span className="log-agg">
                    {formatSpent(periodGroup.totalSec)}
                  </span>
                </header>
              )}
              {renderTimelogRows(periodGroup.entries)}
            </section>
          ))}
      </div>
      {dialog ? (
        <TimelogDialog
          folders={folders}
          entry={dialog.mode === "edit" ? dialog.entry : null}
          defaultTaskKey={defaultAddTaskKey}
          onSave={saveDialog}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}
