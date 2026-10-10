import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GACC, allBoardTasks, taskKey, timelogTaskFromCard } from "../utils.js";
import Dropdown from "./Dropdown.jsx";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function secToMinutesInput(sec) {
  const m = Math.max(0, sec || 0) / 60;
  if (Number.isInteger(m)) return String(m);
  return String(Math.round(m * 100) / 100);
}

function parseDurationMinutes(raw) {
  const n = parseFloat(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.max(0, Math.round(n * 60));
}

function buildTaskOptions(folders, entry) {
  const seen = new Set();
  const options = allBoardTasks(folders).map((hit, i) => {
    const t = timelogTaskFromCard(hit.folder, hit.mod, hit.row, hit.fi ?? i);
    seen.add(t.key);
    return {
      value: t.key,
      label: t.title,
      src: [t.projectName, t.boardName].filter(Boolean).join(" · "),
      color: t.color,
      task: t,
    };
  });
  if (entry?.project && entry?.card) {
    const key = taskKey(entry.project, entry.board, entry.card);
    if (!seen.has(key)) {
      options.unshift({
        value: key,
        label: entry.title || "Untitled",
        src: [entry.projectName || entry.project, entry.boardName || entry.board]
          .filter(Boolean)
          .join(" · "),
        color: entry.color || GACC,
        task: {
          key,
          project: entry.project,
          board: entry.board || "",
          card: entry.card,
          title: entry.title || "Untitled",
          projectName: entry.projectName || entry.project || "",
          boardName: entry.boardName || entry.board || "",
          color: entry.color || GACC,
        },
      });
    }
  }
  return options;
}

function applyDateAndDuration(dateStr, durationSec, baseEndedAt) {
  const base = baseEndedAt ? new Date(baseEndedAt) : new Date();
  if (Number.isNaN(base.getTime())) {
    base.setTime(Date.now());
  }
  const endedAt = new Date(base);
  const parts = String(dateStr || "").split("-").map((x) => parseInt(x, 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    endedAt.setFullYear(parts[0], parts[1] - 1, parts[2]);
  }
  const startedAt = new Date(endedAt.getTime() - durationSec * 1000);
  return {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec,
  };
}

export default function TimelogDialog({
  folders = [],
  entry = null,
  defaultTaskKey = "",
  onSave,
  onClose,
}) {
  const isEdit = !!entry?.slug;
  const options = useMemo(
    () => buildTaskOptions(folders, entry),
    [folders, entry]
  );
  const initialKey =
    (entry && taskKey(entry.project, entry.board, entry.card)) ||
    defaultTaskKey ||
    options[0]?.value ||
    "";

  const [taskValue, setTaskValue] = useState(initialKey);
  const [note, setNote] = useState(entry?.note || "");
  const [date, setDate] = useState(() =>
    toDateInputValue(entry?.endedAt || entry?.startedAt)
  );
  const [duration, setDuration] = useState(() =>
    secToMinutesInput(entry?.durationSec ?? 25 * 60)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const noteRef = useRef(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => noteRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!saving) onClose?.();
      }
    };
    // Capture so Escape does not also close a CardDialog underneath.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, saving]);

  const selected = options.find((o) => o.value === taskValue) || options[0];

  const submit = async () => {
    if (saving) return;
    const task = selected?.task;
    if (!task?.card) {
      setError("Select a task.");
      return;
    }
    const durationSec = parseDurationMinutes(duration);
    if (durationSec == null) {
      setError("Enter a valid duration in minutes.");
      return;
    }
    if (!date) {
      setError("Pick a date.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const timing = applyDateAndDuration(
        date,
        durationSec,
        entry?.endedAt || null
      );
      await onSave?.({
        ...(isEdit ? { slug: entry.slug } : { kind: "manual" }),
        project: task.project,
        board: task.board,
        card: task.card,
        title: task.title,
        projectName: task.projectName,
        boardName: task.boardName,
        color: task.color,
        note,
        ...timing,
      });
    } catch {
      setError(isEdit ? "Could not update timelog." : "Could not add timelog.");
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.();
      }}
    >
      <div
        className="dlg prompt-dlg timelog-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit timelog" : "Add timelog"}
      >
        <div className="dlg-content prompt-body">
          <h2 className="prompt-title">{isEdit ? "Edit timelog" : "Add timelog"}</h2>
          <form
            className="prompt-form field-edit-form timelog-dlg-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="field-edit-row">
              <span className="field-edit-lab">Task</span>
              <Dropdown
                className="field-type-dd timelog-task-dd"
                value={selected?.value || ""}
                options={options}
                disabled={!options.length || saving}
                onChange={setTaskValue}
                renderOption={(o) => (
                  <span className="timelog-task-opt">
                    <span
                      className="dot"
                      style={{ background: o.color || GACC }}
                    />
                    <span className="timelog-task-opt-text">
                      <span className="timelog-task-opt-title">{o.label}</span>
                      {o.src ? (
                        <span className="timelog-task-opt-src">{o.src}</span>
                      ) : null}
                    </span>
                  </span>
                )}
              >
                {selected ? (
                  <span className="timelog-task-opt">
                    <span
                      className="dot"
                      style={{ background: selected.color || GACC }}
                    />
                    <span className="timelog-task-opt-text">
                      <span className="dd-lab">{selected.label}</span>
                      {selected.src ? (
                        <span className="timelog-task-opt-src">
                          {selected.src}
                        </span>
                      ) : null}
                    </span>
                  </span>
                ) : (
                  <span className="dd-lab">No tasks</span>
                )}
              </Dropdown>
            </div>

            <label className="field-edit-row">
              <span className="field-edit-lab">Note</span>
              <textarea
                ref={noteRef}
                className="prompt-input timelog-dlg-note"
                rows={3}
                value={note}
                disabled={saving}
                placeholder="Add a note…"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <div className="timelog-dlg-grid">
              <label className="field-edit-row">
                <span className="field-edit-lab">Date</span>
                <input
                  className="prompt-input"
                  type="date"
                  value={date}
                  disabled={saving}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="field-edit-row">
                <span className="field-edit-lab">Duration (minutes)</span>
                <input
                  className="prompt-input"
                  type="text"
                  inputMode="decimal"
                  value={duration}
                  disabled={saving}
                  placeholder="25"
                  onChange={(e) => setDuration(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>

            {error ? <p className="prompt-msg timelog-dlg-error">{error}</p> : null}
            {!options.length ? (
              <p className="prompt-msg">Create a task board with a card first.</p>
            ) : null}

            <div className="actions prompt-actions field-edit-actions">
              <button
                type="button"
                className="dlg-delete"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="dlg-create"
                disabled={saving || !options.length}
              >
                {saving ? "Saving…" : isEdit ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
