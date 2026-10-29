import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { deleteTimelogApi, fetchTimelogs, postTimelog, putTimelog } from "../api.js";
import {
  DEFAULT_TIMELOG_GROUP_BY,
  DEFAULT_TIMELOG_SORT,
  GACC,
  TIMELOG_GROUP_BYS,
  TIMELOG_PERIODS,
  TIMELOG_SORTS,
  allBoardTasks,
  allBoards,
  compareTimelogStamp,
  downloadBlob,
  formatClock,
  formatDuration,
  groupTimelogsByPeriodAndProject,
  liveCardTitle,
  loadTimelogView,
  matchesTimelogFilter,
  matchesTimelogPeriod,
  pastel,
  saveTimelogView,
  taskKey,
} from "../utils.js";
import { Icon } from "../icons.jsx";
import GlobalBar from "./GlobalBar.jsx";
import Dropdown, { fitMenuToViewport } from "./Dropdown.jsx";
import TimelogDialog from "./TimelogDialog.jsx";
import { TimelogMoreMenu } from "./TimelogDropdown.jsx";
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

function exportFilename(period, ext) {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  const id = String(period || "timelogs")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `timelogs-${id}-${y}${m}${d}.${ext}`;
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

function selectedBoards(boards, boardOff) {
  return boards.filter((b) => !boardOff.has(b.key));
}

function selectedProjects(selected) {
  const map = new Map();
  for (const b of selected) {
    const id = b.projectId || b.key.split("/")[0];
    if (map.has(id)) continue;
    map.set(id, {
      id,
      name: b.projectName || "Project",
      color: b.color || GACC,
    });
  }
  return [...map.values()];
}

function boardsAriaLabel(selected, projects) {
  if (!selected.length) return "0 project tabs";
  if (selected.length === 1) return projects[0]?.name || selected[0].label;
  return `${selected.length} project tabs`;
}

function BoardFilterDropdown({ boards, boardOff, onToggle, inline = false }) {
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = selectedBoards(boards, boardOff);
  const projects = selectedProjects(selected);
  const label = boardsAriaLabel(selected, projects);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const anchor = wrapRef.current;
    const apply = () => fitMenuToViewport(anchor, menu);
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
      if (menu) menu.style.maxHeight = "";
    };
  }, [open, boards]);

  return (
    <div
      className={
        "board-filter" +
        (inline ? " board-filter-inline" : "") +
        (open ? " open" : "")
      }
      ref={wrapRef}
    >
      <button
        type="button"
        className={inline ? "log-view-dd-btn" : "mod-act board-filter-btn"}
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {inline ? (
          <>
            {selected.length === 1 ? (
              <>
                <span
                  className="dot"
                  style={{ background: projects[0]?.color || GACC }}
                />
                <span className="dd-lab">
                  {projects[0]?.name || selected[0].label}
                </span>
              </>
            ) : selected.length > 1 ? (
              <>
                <span className="log-view-dots" aria-hidden="true">
                  {projects.map((p) => (
                    <span
                      key={p.id}
                      className="dot"
                      style={{ background: p.color }}
                    />
                  ))}
                </span>
                <span className="dd-lab">{selected.length} project tabs</span>
              </>
            ) : (
              <span className="dd-lab">0 project tabs</span>
            )}
            <span className="dd-caret" aria-hidden="true">
              <Icon name="caret" size={12} />
            </span>
          </>
        ) : (
          <>
            <Icon name="board" size={18} />
            <span className="mod-act-lab">{label}</span>
          </>
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="pop"
          role="listbox"
          aria-multiselectable="true"
        >
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

function LogViewInlineDd({
  value,
  options,
  onChange,
  ariaLabel,
}) {
  return (
    <Dropdown
      className="log-view-dd"
      buttonClassName="log-view-dd-btn"
      ariaLabel={ariaLabel || value}
      title={ariaLabel || value}
      value={value}
      options={options}
      onChange={onChange}
      caret
      fitToViewport
    >
      <span className="dd-lab">{value}</span>
    </Dropdown>
  );
}

function formatFromTo(entry) {
  const start = entry.startedAt ? formatClock(entry.startedAt) : "";
  const end = entry.endedAt ? formatClock(entry.endedAt) : "";
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

/** Section total row; duration sits in the same column as entry `.dur`. */
function TimelogAggHead({ label, totalSec }) {
  return (
    <header className="log-period-head">
      <h3>{label}</h3>
      <div className="timelog-time">
        <span className="log-agg">{formatDuration(totalSec)}</span>
        <span className="timelog-agg-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}

/** View summary: “[Period] for [N project tabs] grouped by [Day] sorted by [Newest first]”. */
function TimelogViewHead({
  totalSec,
  period,
  groupBy,
  sort,
  boards,
  boardOff,
  onPeriodChange,
  onGroupByChange,
  onSortChange,
  onToggleBoard,
}) {
  return (
    <header className="log-period-head log-view-head">
      <div className="log-view-sentence">
        <LogViewInlineDd
          value={period}
          options={TIMELOG_PERIODS}
          onChange={onPeriodChange}
          ariaLabel={`Period: ${period}`}
        />
        <span className="log-view-lit"> for </span>
        <BoardFilterDropdown
          boards={boards}
          boardOff={boardOff}
          onToggle={onToggleBoard}
          inline
        />
        <span className="log-view-lit"> grouped by </span>
        <LogViewInlineDd
          value={groupBy}
          options={TIMELOG_GROUP_BYS}
          onChange={onGroupByChange}
          ariaLabel={`Group by ${groupBy}`}
        />
        <span className="log-view-lit"> sorted by </span>
        <LogViewInlineDd
          value={sort}
          options={TIMELOG_SORTS}
          onChange={onSortChange}
          ariaLabel={`Sorted by ${sort}`}
        />
      </div>
      <div className="timelog-time">
        <span className="log-agg">{formatDuration(totalSec)}</span>
        <span className="timelog-agg-spacer" aria-hidden="true" />
      </div>
    </header>
  );
}

function TimelogRow({
  entry,
  folders = [],
  busyId,
  onOpenCard,
  onEdit,
  onDelete,
}) {
  const color = entry.color || GACC;
  const note = entry.note || "";
  const busy = busyId === entry.id;
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
  const [view, setView] = useState(() => {
    const saved = loadTimelogView();
    if (timelogFilter) {
      return {
        period: "All time",
        groupBy: DEFAULT_TIMELOG_GROUP_BY,
        sort: saved.sort || DEFAULT_TIMELOG_SORT,
        boardOff: new Set(),
        savedPeriod: saved.period,
        savedGroupBy: saved.groupBy,
      };
    }
    return {
      period: saved.period,
      groupBy: saved.groupBy,
      sort: saved.sort || DEFAULT_TIMELOG_SORT,
      boardOff: new Set(saved.boardOff),
      savedPeriod: saved.period,
      savedGroupBy: saved.groupBy,
    };
  });
  const { period, groupBy, sort, boardOff } = view;
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // null | { mode: "add" } | { mode: "edit", entry }

  const boards = useMemo(
    () =>
      allBoards(folders).map(({ folder, mod, color, key }) => ({
        key,
        projectId: folder.id,
        projectName: folder.name,
        label: `${folder.name} · ${mod[1]}`,
        color,
      })),
    [folders]
  );

  const commitView = (patch) => {
    setView((prev) => {
      const next = {
        period: patch.period !== undefined ? patch.period : prev.period,
        groupBy: patch.groupBy !== undefined ? patch.groupBy : prev.groupBy,
        sort: patch.sort !== undefined ? patch.sort : prev.sort,
        boardOff:
          patch.boardOff !== undefined ? patch.boardOff : prev.boardOff,
        savedPeriod:
          patch.period !== undefined ? patch.period : prev.savedPeriod,
        savedGroupBy:
          patch.groupBy !== undefined ? patch.groupBy : prev.savedGroupBy,
      };
      saveTimelogView({
        period: next.savedPeriod,
        groupBy: next.savedGroupBy,
        sort: next.sort,
        boardOff: [...next.boardOff],
      });
      return next;
    });
  };

  const changePeriod = (next) => commitView({ period: next });
  const changeGroupBy = (next) => commitView({ groupBy: next });
  const changeSort = (next) => commitView({ sort: next });

  // Identity only — title refreshes must not re-apply drill-down defaults.
  const filterKey = timelogFilter
    ? `${timelogFilter.project}/${timelogFilter.board}/${timelogFilter.card}`
    : null;

  useEffect(() => {
    if (filterKey) {
      // Card drill-down defaults; period/group are session-only, boards stick.
      setView((prev) => {
        const next = {
          ...prev,
          period: "All time",
          groupBy: DEFAULT_TIMELOG_GROUP_BY,
          boardOff: new Set(),
        };
        saveTimelogView({
          period: next.savedPeriod,
          groupBy: next.savedGroupBy,
          sort: next.sort,
          boardOff: [],
        });
        return next;
      });
      return;
    }
    setView((prev) => {
      if (
        prev.period === prev.savedPeriod &&
        prev.groupBy === prev.savedGroupBy
      ) {
        return prev;
      }
      return {
        ...prev,
        period: prev.savedPeriod,
        groupBy: prev.savedGroupBy,
      };
    });
  }, [filterKey]);

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
    return taskKey(first.folder.id, first.mod[2]?.id, first.row.id);
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
    const list = baseFiltered.filter((e) => matchesTimelogPeriod(e, period));
    const dir = sort === "Oldest first" ? 1 : -1;
    return list
      .slice()
      .sort((a, b) => compareTimelogStamp(a, b, dir));
  }, [baseFiltered, period, sort]);

  const groups = useMemo(
    () =>
      shown ? groupTimelogsByPeriodAndProject(shown, groupBy, sort) : null,
    [shown, groupBy, sort]
  );

  const viewTotalSec = useMemo(() => {
    if (!shown?.length) return 0;
    return shown.reduce(
      (sum, e) => sum + Math.max(0, parseInt(e.durationSec, 10) || 0),
      0
    );
  }, [shown]);

  const toggleBoard = (key) => {
    const next = new Set(boardOff);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commitView({ boardOff: next });
  };

  const openAddDialog = () => {
    if (!allBoardTasks(folders).length) {
      alert("Create a task board with a card first to add a log.");
      return;
    }
    setDialog({ mode: "add" });
  };

  const openEditDialog = (entry) => {
    if (busyId) return;
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
    if (busyId) return;
    const label = entryCardTitle(folders, entry);
    const ok = await askConfirm({
      title: `Delete timelog for "${label}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(entry.id);
    if (dialog?.mode === "edit" && dialog.entry?.id === entry.id) {
      closeDialog();
    }
    try {
      const data = await deleteTimelogApi({ id: entry.id });
      setEntries(data.timelogs || []);
    } catch {
      alert("Could not delete timelog.");
    } finally {
      setBusyId(null);
    }
  };

  const renderTimelogRow = (entry) => (
    <TimelogRow
      key={entry.id}
      entry={entry}
      folders={folders}
      busyId={busyId}
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
        {shown != null && (
          <div className="log-view">
            <TimelogViewHead
              totalSec={viewTotalSec}
              period={period}
              groupBy={groupBy}
              sort={sort}
              boards={boards}
              boardOff={boardOff}
              onPeriodChange={changePeriod}
              onGroupByChange={changeGroupBy}
              onSortChange={changeSort}
              onToggleBoard={toggleBoard}
            />
            {!shown.length ? (
              <div className="empty-log">
                {filter
                  ? period === "All time"
                    ? "No timelogs for this card."
                    : `No timelogs for this card in ${period.toLowerCase()}.`
                  : entries?.length
                    ? period === "All time"
                      ? "No timelogs yet."
                      : `No timelogs for ${period.toLowerCase()}.`
                    : "No timelogs yet."}
              </div>
            ) : (
              <div className="log-view-groups">
                {groups?.map((periodGroup) => (
                  <section className="log-period" key={periodGroup.key}>
                    {periodGroup.label != null && (
                      <TimelogAggHead
                        label={periodGroup.label}
                        totalSec={periodGroup.totalSec}
                      />
                    )}
                    {renderTimelogRows(periodGroup.entries)}
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
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
