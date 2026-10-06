import { useEffect, useMemo, useState } from "react";
import { GACC, pastel, timelogDayKey } from "../utils.js";
import { Icon } from "../icons.jsx";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function toDayKey(date) {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function entryDayKey(entry) {
  return timelogDayKey(entry.endedAt || entry.startedAt || "");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildMonthCells(monthDate) {
  const first = startOfMonth(monthDate);
  const weekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0
  ).getDate();
  const cells = [];
  for (let i = 0; i < weekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function entrySrc(entry) {
  return [entry.projectName || entry.project, entry.boardName || entry.board]
    .filter(Boolean)
    .join(" · ");
}

export default function TimelogCalendar({
  entries = [],
  selectedSlug,
  onSelectEntry,
  renderInspector,
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const byDay = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const key = entryDayKey(entry);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        String(a.startedAt || a.endedAt).localeCompare(
          String(b.startedAt || b.endedAt)
        )
      );
    }
    return map;
  }, [entries]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const todayKey = toDayKey(new Date());
  const monthPrefix =
    cursor.getFullYear() +
    "-" +
    String(cursor.getMonth() + 1).padStart(2, "0");

  const selected =
    entries.find((e) => e.slug === selectedSlug) || null;

  useEffect(() => {
    if (!selectedSlug) return;
    const stillThere = entries.some((e) => e.slug === selectedSlug);
    if (!stillThere) onSelectEntry?.(null);
  }, [entries, selectedSlug, onSelectEntry]);

  const goToday = () => {
    setCursor(startOfMonth(new Date()));
  };

  return (
    <div className="timelog-cal">
      <div className="timelog-cal-toolbar">
        <div className="timelog-cal-stepper">
          <button
            type="button"
            className="timelog-cal-nav"
            title="Previous month"
            aria-label="Previous month"
            onClick={() => setCursor((d) => shiftMonth(d, -1))}
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <h3 className="timelog-cal-month">{monthLabel(cursor)}</h3>
          <button
            type="button"
            className="timelog-cal-nav"
            title="Next month"
            aria-label="Next month"
            onClick={() => setCursor((d) => shiftMonth(d, 1))}
          >
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
        <button type="button" className="timelog-cal-today" onClick={goToday}>
          Today
        </button>
      </div>

      <div className="timelog-cal-board" role="grid" aria-label={monthLabel(cursor)}>
        <div className="timelog-cal-dows">
          {WEEKDAYS.map((d) => (
            <div key={d} className="timelog-cal-dow" role="columnheader">
              {d}
            </div>
          ))}
        </div>
        <div
          className="timelog-cal-grid"
          style={{
            ["--cal-rows"]: Math.max(1, Math.ceil(cells.length / 7)),
          }}
        >
          {cells.map((date, i) => {
            if (!date) {
              return (
                <div
                  key={"e" + i}
                  className="timelog-cal-cell empty"
                  role="gridcell"
                />
              );
            }
            const key = toDayKey(date);
            const dayEntries = byDay.get(key) || [];
            const isToday = key === todayKey;
            const inMonth = key.startsWith(monthPrefix);
            return (
              <div
                key={key}
                role="gridcell"
                className={
                  "timelog-cal-cell" +
                  (isToday ? " today" : "") +
                  (inMonth ? "" : " outside")
                }
              >
                <span className="timelog-cal-daynum">{date.getDate()}</span>
                <div className="timelog-cal-cards">
                  {dayEntries.map((entry) => {
                    const color = entry.color || GACC;
                    const on = entry.slug === selectedSlug;
                    const src = entrySrc(entry);
                    return (
                      <button
                        key={entry.slug}
                        type="button"
                        className={"timelog-cal-card" + (on ? " on" : "")}
                        style={{
                          ["--pc"]: color,
                          background: pastel(color),
                        }}
                        title={entry.title || "Untitled"}
                        aria-pressed={on}
                        onClick={() =>
                          onSelectEntry?.(on ? null : entry)
                        }
                      >
                        <b className="timelog-cal-card-title">
                          {entry.title || "Untitled"}
                        </b>
                        {src ? (
                          <span className="timelog-cal-card-src">{src}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="timelog-cal-inspector" aria-live="polite">
        {selected ? (
          renderInspector?.(selected)
        ) : (
          <div className="timelog-cal-inspector-empty">
            Select a log on the calendar to inspect it.
          </div>
        )}
      </div>
    </div>
  );
}
