import { Icon } from "../icons.jsx";
import {
  EFFORT_LEVELS,
  IMPACT_LEVELS,
  effortChipLabel,
  effortIconCount,
  impactChipLabel,
  impactIconCount,
  normalizeEffort,
  normalizeImpact,
} from "../cardMeta.js";
import { formatSpent } from "../utils.js";
import Dropdown from "./Dropdown.jsx";
import FileTypeIcon from "./FileTypeIcon.jsx";

/** First-added attachment (array order is append order). */
export function firstCardFile(files) {
  if (!Array.isArray(files) || !files.length) return null;
  return files[0] || null;
}

export function CardMetaIcon({ kind, level, size = 20, decorative = false }) {
  const normalized =
    kind === "impact" ? normalizeImpact(level) : normalizeEffort(level);
  if (!normalized) return null;
  const count =
    kind === "impact"
      ? impactIconCount(normalized)
      : effortIconCount(normalized);
  if (!count) return null;
  const label =
    kind === "impact"
      ? impactChipLabel(normalized)
      : effortChipLabel(normalized);
  // Stack fits in the pill; tighter glyphs when count is 3.
  const glyphSize = Math.max(9, Math.round(size * (count >= 3 ? 0.48 : 0.55)));
  return (
    <span
      className={`card-meta-ico card-meta-${kind}`}
      title={decorative ? undefined : label}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      style={{
        minWidth: size,
        height: size,
        padding: "1px 5px",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Icon
          key={i}
          name={kind === "effort" ? "chevronDown" : "chevronUp"}
          size={glyphSize}
        />
      ))}
    </span>
  );
}

/** Circular axis mark for menus (Medium stack = recognizable shape). */
export function CardMetaKindIcon({ kind, size = 18 }) {
  return (
    <CardMetaIcon kind={kind} level="Medium" size={size} decorative />
  );
}

function metaLevels(kind) {
  return kind === "impact" ? IMPACT_LEVELS : EFFORT_LEVELS;
}

function metaChipLabel(kind, level) {
  return kind === "impact"
    ? impactChipLabel(level)
    : effortChipLabel(level);
}

/** Level picker triggered by the stacked-arrow chip. */
export function CardMetaPicker({
  kind,
  level,
  size = 20,
  disabled = false,
  showLabel = false,
  align = "right",
  onChange,
}) {
  const normalized =
    kind === "impact" ? normalizeImpact(level) : normalizeEffort(level);
  if (!normalized || disabled || !onChange) {
    return normalized ? (
      <span className="card-meta-picker-ro">
        <CardMetaIcon kind={kind} level={normalized} size={size} />
        {showLabel ? (
          <span className="lab">{metaChipLabel(kind, normalized)}</span>
        ) : null}
      </span>
    ) : null;
  }
  const options = [
    ...metaLevels(kind).map((lv) => ({
      value: lv,
      label: metaChipLabel(kind, lv),
    })),
    { value: "", label: "Clear" },
  ];
  const title =
    kind === "impact" ? "Change impact" : "Change effort";
  return (
    <div
      className="card-meta-picker"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Dropdown
        className="card-meta-dd"
        buttonClassName="card-meta-dd-btn"
        menuClassName="card-meta-dd-menu"
        align={align}
        value={normalized}
        options={options}
        title={title}
        ariaLabel={title}
        caret={false}
        onChange={(next) => onChange(next || "")}
        renderOption={(o) => (
          <span className="dd-opt">
            {o.value ? (
              <CardMetaIcon
                kind={kind}
                level={o.value}
                size={18}
                decorative
              />
            ) : null}
            {o.label}
          </span>
        )}
      >
        <CardMetaIcon kind={kind} level={normalized} size={size} decorative />
        {showLabel ? (
          <span className="lab">{metaChipLabel(kind, normalized)}</span>
        ) : null}
      </Dropdown>
    </div>
  );
}

/** Title-row badges: first file (dialog) → timer (+ optional live label). */
export default function CardTitleIcons({
  files,
  file = null,
  timerActive = false,
  timerLabel = "",
  size = 20,
}) {
  const attachment = file || firstCardFile(files);
  const label = String(timerLabel || "").trim();
  return (
    <>
      {attachment ? (
        <span
          className="card-timer-ico card-file-ico"
          title={attachment.name || "File"}
        >
          <FileTypeIcon
            name={attachment.name}
            mime={attachment.mime}
            size={Math.round(size * 0.8)}
          />
        </span>
      ) : null}
      {timerActive ? (
        <span
          className={"card-timer-ico" + (label ? " has-live" : "")}
          title={label ? `Timer ${label}` : "Timer active"}
        >
          <Icon name="runningClock" size={size} />
          {label ? <span className="card-timer-live">{label}</span> : null}
        </span>
      ) : null}
    </>
  );
}

function shortFileLabel(name, max = 8) {
  const s = String(name || "File").trim() || "File";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Board preview meta row: project → time → file → effort → impact. */
export function CardPreviewMeta({
  impact = "",
  effort = "",
  files,
  src = "",
  spentSec = 0,
  metaShow = null,
  size = 16,
  readonly = false,
  onImpactChange,
  onEffortChange,
}) {
  if (metaShow && !metaShow.details) return null;
  const showTaskBoard = !metaShow || metaShow.taskBoard;
  const showPriority = !metaShow || metaShow.priority;
  const showTime = !metaShow || metaShow.timeSpent;
  const showFiles = !metaShow || metaShow.files;
  const list = showFiles && Array.isArray(files) ? files.filter(Boolean) : [];
  const firstFile = list[0] || null;
  const extraFiles = Math.max(0, list.length - 1);
  const project = showTaskBoard ? String(src || "").trim() : "";
  const hasSpent = showTime && (spentSec || 0) > 0;
  const hasEffort = showPriority && !!normalizeEffort(effort);
  const hasImpact = showPriority && !!normalizeImpact(impact);
  if (!project && !hasEffort && !hasImpact && !firstFile && !hasSpent) {
    return null;
  }
  const canEditImpact =
    showPriority && !readonly && typeof onImpactChange === "function";
  const canEditEffort =
    showPriority && !readonly && typeof onEffortChange === "function";
  const chipIcon = Math.max(11, Math.round(size * 0.75));
  const fileTitle =
    list.length <= 1
      ? firstFile?.name || "File"
      : list.map((f) => f.name || "File").join(", ");
  return (
    <div className="card-meta">
      {project ? (
        <span className="card-meta-chip" title={project}>
          <Icon name="folder" size={chipIcon} />
          <span className="card-meta-chip-lab">{project}</span>
        </span>
      ) : null}
      {hasSpent ? (
        <span className="card-meta-chip" title="Time spent">
          <Icon name="Timelogs" size={chipIcon} />
          <span className="card-meta-chip-lab">{formatSpent(spentSec)}</span>
        </span>
      ) : null}
      {firstFile ? (
        <span className="card-meta-chip card-meta-file" title={fileTitle}>
          <FileTypeIcon
            name={firstFile.name}
            mime={firstFile.mime}
            size={chipIcon}
          />
          <span className="card-meta-chip-lab">
            {shortFileLabel(firstFile.name)}
            {extraFiles
              ? ` + ${extraFiles} other${extraFiles === 1 ? "" : "s"}`
              : ""}
          </span>
        </span>
      ) : null}
      {canEditEffort ? (
        <CardMetaPicker
          kind="effort"
          level={effort}
          size={size}
          onChange={onEffortChange}
        />
      ) : hasEffort ? (
        <CardMetaIcon kind="effort" level={effort} size={size} />
      ) : null}
      {canEditImpact ? (
        <CardMetaPicker
          kind="impact"
          level={impact}
          size={size}
          onChange={onImpactChange}
        />
      ) : hasImpact ? (
        <CardMetaIcon kind="impact" level={impact} size={size} />
      ) : null}
    </div>
  );
}
