import { useId } from "react";
import { PC } from "./utils.js";
import {
  AlignLeft,
  AppWindow,
  Archive,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUpAZ,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Asterisk,
  Bold,
  Italic,
  Calendar,
  Check,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Cloud,
  Code,
  CodeXml,
  Columns2,
  Copy,
  Database,
  Diamond,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  FileType,
  Filter,
  Flag,
  Folder,
  FolderInput,
  FolderOpen,
  Folders,
  GitBranch,
  GripVertical,
  Hash,
  Highlighter,
  Hourglass,
  Info,
  Kanban,
  BookMarked,
  LifeBuoy,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  LockOpen,
  Maximize2,
  MessageSquare,
  PanelLeft,
  PanelTop,
  Sparkles,
  Pencil,
  Plus,
  Quote,
  Rows2,
  Rows3,
  Rows4,
  ScrollText,
  Settings,
  Share,
  SquareCheck,
  SquareCheckBig,
  NotebookText,
  Table,
  Table2,
  Timer,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Workflow,
  X,
} from "lucide-react";

/** PC cover hues are muted for white-on-fill contrast; lift for thin strokes on dark UI. */
function vibrantStroke(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  // Vivid mid-lights so the spectrum reads on --side / charcoal pills.
  s = Math.min(0.95, s * 1.2 + 0.2);
  const l2 = Math.min(0.66, Math.max(0.58, l + 0.22));
  const hue = h * 6;
  const c = (1 - Math.abs(2 * l2 - 1)) * s;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const m = l2 - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hue < 1) [rp, gp, bp] = [c, x, 0];
  else if (hue < 2) [rp, gp, bp] = [x, c, 0];
  else if (hue < 3) [rp, gp, bp] = [0, c, x];
  else if (hue < 4) [rp, gp, bp] = [0, x, c];
  else if (hue < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}

/**
 * Per-arm tip colors — clockwise from top, matching the app logo plate:
 * red → brown/yellow → green → blue → indigo → purple.
 * Each Lucide path is one diameter (tip → opposite tip).
 */
const RAINBOW_ARMS = [
  {
    d: "M12 5v14",
    x1: 12,
    y1: 5,
    x2: 12,
    y2: 19,
    from: PC[0], // Cherry — top
    to: PC[10], // Sky — bottom
  },
  {
    d: "m18.065 8.496-12.125 7",
    x1: 18.065,
    y1: 8.496,
    x2: 5.94,
    y2: 15.496,
    from: PC[2], // Pumpkin — top-right brown
    mid: PC[3], // Honey — yellow just inward
    to: PC[11], // Ink — bottom-left indigo
  },
  {
    d: "m5.94 8.504 12.125 7",
    x1: 5.94,
    y1: 8.504,
    x2: 18.065,
    y2: 15.504,
    from: PC[14], // Candy — top-left purple
    to: PC[6], // Leaf — bottom-right green
  },
];

/** Spectrum stroke for Master board selected state — Lucide asterisk paths. */
function RainbowAsterisk({ size = 16, strokeWidth = 2, className, ...rest }) {
  const gid = `asterisk-rainbow-${useId().replace(/:/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <defs>
        {RAINBOW_ARMS.map((arm, i) => {
          const id = `${gid}-${i}`;
          const from = vibrantStroke(arm.from);
          const to = vibrantStroke(arm.to);
          return (
            <linearGradient
              key={id}
              id={id}
              x1={arm.x1}
              y1={arm.y1}
              x2={arm.x2}
              y2={arm.y2}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={from} />
              {arm.mid ? (
                <stop offset="28%" stopColor={vibrantStroke(arm.mid)} />
              ) : null}
              <stop offset="100%" stopColor={to} />
            </linearGradient>
          );
        })}
      </defs>
      {RAINBOW_ARMS.map((arm, i) => (
        <path key={arm.d} d={arm.d} stroke={`url(#${gid}-${i})`} />
      ))}
    </svg>
  );
}

/** Animated stopwatch APNG (public/icons/stopwatch-running.png). */
function RunningClockIcon({ size = 18, className, strokeWidth, fill, ...rest }) {
  return (
    <img
      src="/icons/stopwatch-running.png"
      alt=""
      width={size}
      height={size}
      className={["card-timer-clock", className].filter(Boolean).join(" ")}
      draggable={false}
      aria-hidden="true"
      {...rest}
    />
  );
}

/** Animated priority APNG (public/icons/priority.png) — title badge only. */
function RunningPriorityIcon({ size = 18, className, strokeWidth, fill, ...rest }) {
  return (
    <img
      src="/icons/priority.png"
      alt=""
      width={size}
      height={size}
      className={["card-timer-clock", className].filter(Boolean).join(" ")}
      draggable={false}
      aria-hidden="true"
      {...rest}
    />
  );
}

export const IC = {
  table: Table,
  board: Kanban,
  Database,
  Board: Kanban,
  Task: SquareCheckBig,
  Files: Folder,
  Docs: FileText,
  fileMd: FileText,
  fileHtml: FileCode,
  fileTxt: Type,
  fileRich: FileType,
  Notes: NotebookText,
  Links: Link,
  Chat: MessageSquare,
  Iframe: AppWindow,
  Changelog: ScrollText,
  Workflows: Workflow,
  Cover: BookMarked,
  Masterboard: Asterisk,
  Timelogs: Timer,
  Calendar,
  Trash: Trash2,
  folder: Folder,
  folders: Folders,
  settings: Settings,
  pencil: Pencil,
  hourglass: Hourglass,
  stopwatch: Timer,
  runningClock: RunningClockIcon,
  priority: Diamond,
  runningPriority: RunningPriorityIcon,
  plus: Plus,
  asterisk: Asterisk,
  eye: Eye,
  sidebar: PanelLeft,
  sort: ArrowUpDown,
  sortAsc: ArrowUpNarrowWide,
  sortDesc: ArrowDownWideNarrow,
  sortAlphaAsc: ArrowUpAZ,
  sortAlphaDesc: ArrowDownAZ,
  grip: GripVertical,
  filter: Filter,
  close: X,
  check: Check,
  flag: Flag,
  export: Download,
  share: Share,
  move: FolderInput,
  more: EllipsisVertical,
  ellipsis: Ellipsis,
  copy: Copy,
  caret: ChevronDown,
  arrow: ChevronRight,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  Experience: Sparkles,
  Workspace: FolderOpen,
  About: Info,
  Help: LifeBuoy,
  Play: CirclePlay,
  GitHub: GitBranch,
  Developer: CodeXml,
  Archive,
  undo: Undo2,
  redo: Redo2,
  bold: Bold,
  italic: Italic,
  list: List,
  listOrdered: ListOrdered,
  checklist: ListChecks,
  lock: Lock,
  unlock: LockOpen,
  cloud: Cloud,
  link: Link,
  external: ExternalLink,
  enlarge: Maximize2,
  codeBlock: Code,
  highlight: Highlighter,
  blockquote: Quote,
  tableCol: Columns2,
  rows2: Rows2,
  rows3: Rows3,
  rows4: Rows4,
  tableRow: Rows3,
  tableHeaderRow: PanelTop,
  tableHeaderCol: PanelLeft,
  tableDelete: Table2,
  fieldText: Type,
  fieldLongText: AlignLeft,
  fieldUrl: Link,
  fieldSelect: ChevronsUpDown,
  fieldMultiSelect: ListChecks,
  fieldCheckbox: SquareCheck,
  fieldNumber: Hash,
  fieldDate: Calendar,
};

export function Icon({ name, size = 16, filled = false, rainbow = false }) {
  if (rainbow) {
    return <RainbowAsterisk size={size} strokeWidth={filled ? 2.5 : 2} />;
  }
  const Comp = IC[name] || IC.folder;
  return (
    <Comp
      size={size}
      strokeWidth={filled ? 0 : 1.75}
      fill={filled ? "currentColor" : "none"}
    />
  );
}
