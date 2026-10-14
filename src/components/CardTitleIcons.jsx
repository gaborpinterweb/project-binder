import { Icon } from "../icons.jsx";
import {
  difficultyIconCount,
  impactIconCount,
  normalizeDifficulty,
  normalizeImpact,
} from "../cardMeta.js";
import FileTypeIcon from "./FileTypeIcon.jsx";

/** First-added attachment (array order is append order). */
export function firstCardFile(files) {
  if (!Array.isArray(files) || !files.length) return null;
  return files[0] || null;
}

export function CardMetaIcon({ kind, level, size = 20, decorative = false }) {
  const normalized =
    kind === "impact" ? normalizeImpact(level) : normalizeDifficulty(level);
  if (!normalized) return null;
  const count =
    kind === "impact"
      ? impactIconCount(normalized)
      : difficultyIconCount(normalized);
  if (!count) return null;
  const label =
    kind === "impact"
      ? `Impact: ${normalized}`
      : `Difficulty: ${normalized}`;
  const glyphSize = Math.max(8, Math.round(size * (count >= 3 ? 0.38 : 0.45)));
  return (
    <span
      className={`card-meta-ico card-meta-${kind} card-meta-${kind}-${normalized}`}
      title={decorative ? undefined : label}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      style={{
        minWidth: size,
        height: size,
        padding: count > 1 ? "0 4px" : 0,
      }}
    >
      {Array.from({ length: count }, (_, i) =>
        kind === "impact" ? (
          <span
            key={i}
            className="card-meta-bang"
            style={{ fontSize: glyphSize }}
          >
            !
          </span>
        ) : (
          <Icon key={i} name="zap" size={glyphSize} filled />
        )
      )}
    </span>
  );
}

/** Title-row badges: impact → difficulty → first file → timer. */
export default function CardTitleIcons({
  impact = "",
  difficulty = "",
  files,
  file = null,
  timerActive = false,
  size = 20,
}) {
  const attachment = file || firstCardFile(files);
  return (
    <>
      <CardMetaIcon kind="impact" level={impact} size={size} />
      <CardMetaIcon kind="difficulty" level={difficulty} size={size} />
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
