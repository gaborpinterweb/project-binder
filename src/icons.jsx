import {
  AlignLeft,
  AppWindow,
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Asterisk,
  Bold,
  Calendar,
  Check,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Cloud,
  Code,
  CodeXml,
  Columns2,
  Copy,
  Database,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Folder,
  FolderInput,
  FolderOpen,
  GitBranch,
  GripVertical,
  Hash,
  Highlighter,
  Info,
  Kanban,
  LayoutTemplate,
  Link,
  List,
  ListChecks,
  Lock,
  Maximize2,
  MessageSquare,
  PanelLeft,
  Sparkles,
  Pencil,
  Plus,
  Quote,
  Rows3,
  ScrollText,
  Settings,
  SquareCheck,
  SquareCheckBig,
  StickyNote,
  Table,
  Table2,
  Timer,
  Trash2,
  Type,
  Workflow,
  X,
} from "lucide-react";

/** Countdown tomato — not in Lucide. */
function TomatoIcon({ size = 16, color = "currentColor", strokeWidth = 2, className, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M12 4.8c-.9 1.35-2.4 1.95-3.9 1.8 1.05.75 2.4 1.05 3.9.75 1.35.3 2.7 0 3.75-.75-1.5.15-3-.45-3.75-1.8z" />
      <path d="M6.3 9.3c-1.05 1.8-1.05 4.5.45 6.75 1.65 2.4 4.2 3.45 5.25 3.45s3.6-1.05 5.25-3.45c1.5-2.25 1.5-4.95.45-6.75C16.2 7.5 14.1 6.75 12 6.75S7.8 7.5 6.3 9.3z" />
    </svg>
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
  Notes: StickyNote,
  Links: Link,
  Chat: MessageSquare,
  Iframe: AppWindow,
  Changelog: ScrollText,
  Workflows: Workflow,
  Cover: LayoutTemplate,
  Masterboard: Asterisk,
  Timelogs: Timer,
  Calendar,
  Trash: Trash2,
  folder: Folder,
  settings: Settings,
  pencil: Pencil,
  tomato: TomatoIcon,
  stopwatch: Timer,
  plus: Plus,
  asterisk: Asterisk,
  eye: Eye,
  sidebar: PanelLeft,
  sort: ArrowUpDown,
  grip: GripVertical,
  filter: Filter,
  close: X,
  check: Check,
  export: Download,
  move: FolderInput,
  more: EllipsisVertical,
  copy: Copy,
  caret: ChevronDown,
  arrow: ChevronRight,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  Experience: Sparkles,
  Workspace: FolderOpen,
  About: Info,
  Help: CircleHelp,
  Play: CirclePlay,
  GitHub: GitBranch,
  Developer: CodeXml,
  Archive,
  bold: Bold,
  list: List,
  checklist: ListChecks,
  lock: Lock,
  cloud: Cloud,
  link: Link,
  external: ExternalLink,
  enlarge: Maximize2,
  codeBlock: Code,
  highlight: Highlighter,
  blockquote: Quote,
  tableCol: Columns2,
  tableRow: Rows3,
  tableDelete: Table2,
  fieldText: Type,
  fieldLongText: AlignLeft,
  fieldSelect: ChevronsUpDown,
  fieldMultiSelect: ListChecks,
  fieldCheckbox: SquareCheck,
  fieldNumber: Hash,
  fieldDate: Calendar,
};

export function Icon({ name, size = 16, filled = false }) {
  const Comp = IC[name] || IC.folder;
  return (
    <Comp
      size={size}
      strokeWidth={filled ? 0 : 1.75}
      fill={filled ? "currentColor" : "none"}
    />
  );
}
