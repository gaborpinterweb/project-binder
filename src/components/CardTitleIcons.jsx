import { Icon } from "../icons.jsx";
import FileTypeIcon from "./FileTypeIcon.jsx";

/** First-added attachment (array order is append order). */
export function firstCardFile(files) {
  if (!Array.isArray(files) || !files.length) return null;
  return files[0] || null;
}

/** Title-row badges: priority → first file → timer. */
export default function CardTitleIcons({
  priority = false,
  files,
  file = null,
  timerActive = false,
  size = 20,
}) {
  const attachment = file || firstCardFile(files);
  return (
    <>
      {priority ? (
        <span className="card-timer-ico" title="Priority">
          <Icon name="runningPriority" size={size} />
        </span>
      ) : null}
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
