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
        <Icon key={i} name="chevronUp" size={glyphSize} />
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

/** Title-row badges: effort → impact → first file → timer. */
export default function CardTitleIcons({
  impact = "",
  effort = "",
  files,
  file = null,
  timerActive = false,
  size = 20,
  readonly = false,
  onImpactChange,
  onEffortChange,
}) {
  const attachment = file || firstCardFile(files);
  const canEditImpact = !readonly && typeof onImpactChange === "function";
  const canEditEffort = !readonly && typeof onEffortChange === "function";
  return (
    <>
      {canEditEffort ? (
        <CardMetaPicker
          kind="effort"
          level={effort}
          size={size}
          onChange={onEffortChange}
        />
      ) : (
        <CardMetaIcon kind="effort" level={effort} size={size} />
      )}
      {canEditImpact ? (
        <CardMetaPicker
          kind="impact"
          level={impact}
          size={size}
          onChange={onImpactChange}
        />
      ) : (
        <CardMetaIcon kind="impact" level={impact} size={size} />
      )}
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
        <span className="card-timer-ico" title="Timer active">
          <Icon name="runningClock" size={size} />
        </span>
      ) : null}
    </>
  );
}
