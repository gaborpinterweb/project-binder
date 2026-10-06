import { FileIcon, defaultStyles } from "react-file-icon";

const KIND_BY_EXT = {
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  gif: "Image",
  webp: "Image",
  bmp: "Image",
  ico: "Image",
  tif: "Image",
  tiff: "Image",
  heic: "Image",
  heif: "Image",
  avif: "Image",
  svg: "Image",
  mp4: "Video",
  mov: "Video",
  webm: "Video",
  mkv: "Video",
  avi: "Video",
  m4v: "Video",
  mp3: "Audio",
  wav: "Audio",
  aac: "Audio",
  flac: "Audio",
  ogg: "Audio",
  m4a: "Audio",
  ppt: "Presentation",
  pptx: "Presentation",
  key: "Presentation",
  odp: "Presentation",
  xls: "Spreadsheet",
  xlsx: "Spreadsheet",
  csv: "Spreadsheet",
  ods: "Spreadsheet",
  numbers: "Spreadsheet",
  doc: "Document",
  docx: "Document",
  rtf: "Document",
  odt: "Document",
  pages: "Document",
  txt: "Document",
  md: "Document",
  pdf: "PDF",
  zip: "Archive",
  rar: "Archive",
  "7z": "Archive",
  tar: "Archive",
  gz: "Archive",
  tgz: "Archive",
  js: "Code",
  ts: "Code",
  jsx: "Code",
  tsx: "Code",
  json: "Code",
  html: "Code",
  css: "Code",
  py: "Code",
  go: "Code",
  java: "Code",
  xml: "Code",
  yml: "Code",
  yaml: "Code",
  ttf: "Font",
  otf: "Font",
  woff: "Font",
  woff2: "Font",
};

export function fileExtension(name) {
  const base = String(name || "").split(/[/\\]/).pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  return base.slice(i + 1).toLowerCase();
}

function typeFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (!m) return undefined;
  if (m === "application/pdf") return "acrobat";
  if (m.includes("svg")) return "vector";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.includes("zip") || m.includes("compressed") || m.includes("gzip") || m.includes("tar")) {
    return "compressed";
  }
  if (m.includes("spreadsheet") || m.includes("excel")) return "spreadsheet";
  if (m.includes("presentation") || m.includes("powerpoint")) return "presentation";
  if (m.includes("msword") || m.includes("wordprocessing") || m.includes("rtf")) {
    return "document";
  }
  if (m.startsWith("text/") || m.includes("json") || m.includes("javascript") || m.includes("xml")) {
    return "code";
  }
  if (m.includes("font")) return "font";
  return undefined;
}

const KIND_BY_ICON_TYPE = {
  acrobat: "PDF",
  image: "Image",
  vector: "Image",
  audio: "Audio",
  video: "Video",
  compressed: "Archive",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  document: "Document",
  code: "Code",
  font: "Font",
};

export function fileKindLabel(name, mime) {
  const ext = fileExtension(name);
  if (ext && KIND_BY_EXT[ext]) return KIND_BY_EXT[ext];
  return KIND_BY_ICON_TYPE[typeFromMime(mime)] || "File";
}

export default function FileTypeIcon({ name, mime, size = 22 }) {
  const ext = fileExtension(name);
  const preset = (ext && defaultStyles[ext]) || {};
  const type = preset.type || typeFromMime(mime);
  return (
    <span
      className="file-type-icon"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <FileIcon
        extension={ext || undefined}
        {...preset}
        {...(type ? { type } : {})}
      />
    </span>
  );
}
