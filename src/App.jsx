import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWorkspace,
  putCard,
  deleteCardApi,
  postCard,
  putProject,
  postProject,
  deleteProjectApi,
  postBoard,
  postDatabase,
  postNotesTab,
  postFilesTab,
  putTab,
  deleteTabApi,
  putTabOrder,
  putItem,
  postTimelog,
  resetWorkspaceToSeed,
  resetWorkspaceToEmpty,
  restoreTrashApi,
} from "./api.js";
import {
  STAGES,
  PC,
  GACC,
  COMPLETED_VIEWS,
  COMPLETED_VIEW_KEY,
  POMO_DURATION_SEC,
  WORKSPACE_ITEMS,
  fromApi,
  normalizeFolders,
  loadStages,
  loadSession,
  saveSession,
  restoreTabIndex,
  saveLastTab,
  loadCompletedViews,
  loadPomo,
  savePomo,
  pomoRemainingSec,
  pomoElapsedSec,
  isStoptimerSession,
  locateRow,
  findCardBySlugs,
  modToTabType,
  tabsOrderPayload,
  isProjectArchived,
  slugifyClient,
  loadWorkspaceVisibility,
  saveWorkspaceVisibility,
  loadOpenOnLaunch,
  saveOpenOnLaunch,
  clearClientAppState,
  hasSeenLaunch,
  markLaunchSeen,
  defaultWorkspaceVisibility,
  nextUnusedProjectColor,
  taskKey,
} from "./utils.js";
import Sidebar from "./components/Sidebar.jsx";
import TabBar from "./components/TabBar.jsx";
import Board, { DatabaseView } from "./components/Board.jsx";
import Cover from "./components/Cover.jsx";
import Calendar from "./components/Calendar.jsx";
import Timelogs from "./components/Timelogs.jsx";
import Trash, { TrashNotePreview } from "./components/Trash.jsx";
import Notes from "./components/Notes.jsx";
import Files from "./components/Files.jsx";
import CardDialog from "./components/CardDialog.jsx";
import TimelogDialog from "./components/TimelogDialog.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";
import PromptDialog from "./components/PromptDialog.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import { askPrompt } from "./promptDialog.js";
import { askConfirm } from "./confirmDialog.js";
import LaunchDialog from "./components/LaunchDialog.jsx";
import UpdateDialog from "./components/UpdateDialog.jsx";
import { checkForUpdate } from "./checkUpdate.js";

function nextTabName(mods, base) {
  const used = new Set((mods || []).map((mod) => mod[1]));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export default function App() {
  const [folders, setFolders] = useState([]);
  const [stages, setStages] = useState(STAGES.slice());
  const [p, setP] = useState(0);
  const [m, setM] = useState(0);
  const [g, setG] = useState("Masterboard");
  const [draftProject, setDraftProject] = useState(null);
  const [coverEdit, setCoverEdit] = useState(false);
  const [coverDraft, setCoverDraft] = useState(null);
  const [cardDraft, setCardDraft] = useState({
    n: "",
    body: "",
    s: "",
    ms: "",
    doneAt: "",
    project: "",
    board: "",
  });
  const [boardEdit, setBoardEdit] = useState(false);
  const [activePomo, setActivePomo] = useState(null);
  const [timelogFilter, setTimelogFilter] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [uiTick, setUiTick] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [manualTimelogTaskKey, setManualTimelogTaskKey] = useState("");
  const [trashPreview, setTrashPreview] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const [timelogRefresh, setTimelogRefresh] = useState(0);
  const [trashRefresh, setTrashRefresh] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceVis, setWorkspaceVis] = useState(() => loadWorkspaceVisibility());
  const [openOnLaunch, setOpenOnLaunch] = useState(() => loadOpenOnLaunch());
  const [launchOpen, setLaunchOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const masterOff = useRef(new Set());
  const colCollapsed = useRef(new Set());
  const completedViewByScope = useRef(new Map());
  const pomoFinishing = useRef(false);
  const foldersRef = useRef(folders);
  const stagesRef = useRef(stages);
  const pRef = useRef(p);
  const mRef = useRef(m);
  const gRef = useRef(g);
  const activePomoRef = useRef(activePomo);

  foldersRef.current = folders;
  stagesRef.current = stages;
  pRef.current = p;
  mRef.current = m;
  gRef.current = g;
  activePomoRef.current = activePomo;

  const bump = useCallback(() => setUiTick((n) => n + 1), []);

  const discardCoverEdit = useCallback(() => {
    setCoverEdit(false);
    setCoverDraft(null);
  }, []);

  const discardDraft = useCallback(() => {
    setDraftProject(null);
  }, []);

  const rememberCurrentTab = useCallback((foldersArg, pArg, mArg) => {
    const pr = (foldersArg || foldersRef.current)[pArg ?? pRef.current];
    const mod = pr?.mods?.[mArg ?? mRef.current];
    if (pr && mod?.[2]?.slug) saveLastTab(pr.slug, mod[2].slug);
  }, []);

  const applyWorkspace = useCallback(
    (data, opts = {}) => {
      let nextStages = stagesRef.current;
      const raw = fromApi(data, (list) => {
        const loadedStages = loadStages(list);
        if (loadedStages) nextStages = loadedStages;
      });
      setStages(nextStages);
      stagesRef.current = nextStages;
      const next = normalizeFolders(raw, nextStages);
      setFolders(next);
      foldersRef.current = next;

      if (opts.initial) {
        let nextG = "Masterboard";
        let nextP = 0;
        let nextM = 0;
        if (loadOpenOnLaunch() === "last-tab") {
          const sess = loadSession();
          if (sess && "g" in sess) nextG = sess.g || null;
          if (nextG && !WORKSPACE_ITEMS.includes(nextG)) {
            nextG = "Masterboard";
          }
          if (sess?.project) {
            const pi = next.findIndex((f) => f.slug === sess.project);
            nextP = pi >= 0 ? pi : 0;
          }
          nextM = restoreTabIndex(next[nextP]);
        }
        setG(nextG);
        setP(nextP);
        setM(nextM);
        gRef.current = nextG;
        pRef.current = nextP;
        mRef.current = nextM;
      } else if (opts.project != null) {
        let nextP = Math.max(
          0,
          next.findIndex((f) => f.slug === opts.project)
        );
        if (nextP < 0) nextP = 0;
        let nextM = 0;
        if (opts.board != null) {
          nextM = Math.max(
            0,
            (next[nextP]?.mods || []).findIndex((mod) => mod[2]?.slug === opts.board)
          );
          if (nextM < 0) nextM = 0;
        }
        setP(nextP);
        setM(nextM);
        pRef.current = nextP;
        mRef.current = nextM;
        if (opts.g !== undefined) {
          setG(opts.g);
          gRef.current = opts.g;
        }
      } else if (opts.keepNav) {
        const keepP = opts.keepNav.project ?? foldersRef.current[pRef.current]?.slug;
        const keepM = opts.keepNav.board;
        const keepG = opts.keepNav.g !== undefined ? opts.keepNav.g : gRef.current;
        let nextP = Math.max(0, next.findIndex((f) => f.slug === keepP));
        if (nextP < 0) nextP = 0;
        let nextM = Math.max(
          0,
          (next[nextP]?.mods || []).findIndex((mod) => mod[2]?.slug === keepM)
        );
        if (nextM < 0) nextM = 0;
        setP(nextP);
        setM(nextM);
        setG(keepG);
        pRef.current = nextP;
        mRef.current = nextM;
        gRef.current = keepG;
      }
      bump();
      return next;
    },
    [bump]
  );

  const keepNav = useCallback(
    (project, board) => ({
      keepNav: { project, board, g: gRef.current },
    }),
    []
  );

  const reload = useCallback(async () => {
    const data = await fetchWorkspace();
    const initial = !foldersRef.current.length;
    if (initial) {
      applyWorkspace(data, { initial: true });
    } else {
      applyWorkspace(data, {
        keepNav: {
          project: foldersRef.current[pRef.current]?.slug,
          board: foldersRef.current[pRef.current]?.mods[mRef.current]?.[2]?.slug,
          g: gRef.current,
        },
      });
    }
    setLoaded(true);
  }, [applyWorkspace]);

  useEffect(() => {
    reload().catch((err) => {
      setLoadError(String(err));
      setLoaded(true);
    });
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((info) => {
      if (!cancelled && info.available) setUpdateInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded && !loadError && !hasSeenLaunch()) setLaunchOpen(true);
  }, [loaded, loadError]);

  useEffect(() => {
    if (!loaded || loadError) return;
    saveSession(g, folders, p);
    if (!g) rememberCurrentTab(folders, p, m);
  }, [loaded, loadError, g, folders, p, m, rememberCurrentTab]);

  // Pomodoro init + ticker
  useEffect(() => {
    const session = loadPomo();
    if (session && !isStoptimerSession(session) && pomoRemainingSec(session) <= 0) {
      (async () => {
        setActivePomo(session);
        activePomoRef.current = session;
        await stopPomodoroInner(session);
      })();
      return;
    }
    if (session) {
      setActivePomo(session);
      activePomoRef.current = session;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activePomo) return;
    const id = setInterval(() => {
      bump();
      const cur = activePomoRef.current;
      if (!isStoptimerSession(cur) && pomoRemainingSec(cur) <= 0) {
        stopPomodoro();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!activePomo]);

  useEffect(() => {
    const closeMenus = () => {
      setMenuOpen(false);
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  async function stopPomodoroInner(session) {
    if (!session || pomoFinishing.current) return;
    pomoFinishing.current = true;
    const endedAt = new Date().toISOString();
    const elapsed = Math.max(1, pomoElapsedSec(session));
    const durationSec = isStoptimerSession(session)
      ? elapsed
      : Math.min(session.durationSec || POMO_DURATION_SEC, elapsed);
    const note = typeof session.note === "string" ? session.note.trim() : "";
    setActivePomo(null);
    activePomoRef.current = null;
    savePomo(null);
    try {
      await postTimelog({
        project: session.project,
        board: session.board,
        card: session.card,
        title: session.title,
        projectName: session.projectName,
        boardName: session.boardName,
        color: session.color,
        kind: session.kind || "pomodoro",
        note,
        startedAt: session.startedAt,
        endedAt,
        durationSec,
      });
    } catch {}
    pomoFinishing.current = false;
    if (gRef.current === "Timelogs") setTimelogRefresh((n) => n + 1);
  }

  async function stopPomodoro() {
    await stopPomodoroInner(activePomoRef.current);
  }

  function updatePomoNote(note) {
    const cur = activePomoRef.current;
    if (!cur) return;
    const next = { ...cur, note: typeof note === "string" ? note : "" };
    setActivePomo(next);
    activePomoRef.current = next;
    savePomo(next);
  }

  async function startPomodoro(payload) {
    if (!payload.project || !payload.board) return;
    if (activePomoRef.current) await stopPomodoro();
    const kind = payload.kind === "stoptimer" ? "stoptimer" : "pomodoro";
    const session = {
      project: payload.project,
      board: payload.board,
      card: payload.card || "",
      title: payload.title || "Untitled",
      projectName: payload.projectName || payload.project,
      boardName: payload.boardName || payload.board,
      color: payload.color || GACC,
      kind,
      note: "",
      startedAt: new Date().toISOString(),
      ...(kind === "pomodoro" ? { durationSec: POMO_DURATION_SEC } : {}),
    };
    setActivePomo(session);
    activePomoRef.current = session;
    savePomo(session);
  }

  function addManualTimelog(filter) {
    if (filter?.project && filter?.board && filter?.card) {
      setManualTimelogTaskKey(
        taskKey(filter.project, filter.board, filter.card)
      );
    }
  }

  function openTimelogs(filter) {
    setTimelogFilter(filter);
    setG("Timelogs");
  }

  const saveCard = useCallback(
    async (row, folder, mod) => {
      if (!folder || !mod || mod[0] !== "Board") return;
      if (isProjectArchived(folder)) return;
      const data = await putCard({
        project: folder.slug,
        board: mod[2].slug,
        slug: row.slug,
        title: row.n || "Untitled",
        status: row.s || (mod[2].columns || stagesRef.current)[0] || stagesRef.current[0],
        master: row.ms || stagesRef.current[0],
        doneAt: row.doneAt || "",
        body: row.body || "",
        ord: row.ord,
      });
      applyWorkspace(data, keepNav(folder.slug, mod[2].slug));
      return data;
    },
    [applyWorkspace, keepNav]
  );

  const deleteCard = useCallback(
    async (folder, mod, slug) => {
      if (!folder || !mod || mod[0] !== "Board" || !slug) return;
      const data = await deleteCardApi({
        project: folder.slug,
        board: mod[2].slug,
        slug,
      });
      applyWorkspace(data, keepNav(folder.slug, mod[2].slug));
      setTrashRefresh((n) => n + 1);
      return data;
    },
    [applyWorkspace, keepNav]
  );

  const moveCard = useCallback(
    async (row, from, to) => {
      if (!from || !to || from.mod[0] !== "Board" || to.mod[0] !== "Board") return;
      const same =
        from.folder.slug === to.folder.slug && from.mod[2].slug === to.mod[2].slug;
      if (same) {
        await saveCard(row, to.folder, to.mod);
        return;
      }
      const cols = to.mod[2].columns || stagesRef.current;
      if (!cols.includes(row.s)) row.s = cols[0] || stagesRef.current[0];
      if (!stagesRef.current.includes(row.ms)) row.ms = stagesRef.current[0];
      const oldSlug = row.slug;
      let slug = oldSlug || slugifyClient(row.n || "Untitled");
      const taken = new Set((to.mod[2].rows || []).map((r) => r.slug));
      if (taken.has(slug)) {
        let i = 2;
        const base = slugifyClient(row.n || "Untitled");
        while (taken.has(base + "-" + i)) i++;
        slug = base + "-" + i;
      }
      row.slug = slug;
      from.mod[2].rows = (from.mod[2].rows || []).filter((r) => r !== row);
      if (!to.mod[2].rows) to.mod[2].rows = [];
      if (!to.mod[2].rows.includes(row)) to.mod[2].rows.push(row);
      await saveCard(row, to.folder, to.mod);
      const data = await deleteCardApi({
        project: from.folder.slug,
        board: from.mod[2].slug,
        slug: oldSlug,
        permanent: true,
      });
      applyWorkspace(data, keepNav(to.folder.slug, to.mod[2].slug));
    },
    [saveCard, applyWorkspace, keepNav]
  );

  const createCard = useCallback(
    async (folder, mod, { title, status, master, body, doneAt } = {}) => {
      if (isProjectArchived(folder)) return;
      const boardCol = status || (mod[2].columns || stagesRef.current)[0];
      const masterCol =
        master && stagesRef.current.includes(master)
          ? master
          : stagesRef.current[0];
      const name = (title || "").trim() || "Untitled";
      const data = await postCard({
        project: folder.slug,
        board: mod[2].slug,
        title: name,
        status: boardCol,
        master: masterCol,
        body: body || "",
        doneAt: doneAt || "",
      });
      applyWorkspace(data, keepNav(folder.slug, mod[2].slug));
      return data.slug;
    },
    [applyWorkspace, keepNav]
  );

  const openItem = useCallback(
    (r, opts) => {
      const isDraft = !!(opts && opts.draft);
      let loc = isDraft ? null : locateRow(foldersRef.current, r);
      if ((!loc || isDraft) && opts?.folder && opts?.mod) {
        loc = { folder: opts.folder, mod: opts.mod };
      }
      setDialog({ row: { ...r }, isDraft, loc });
    },
    []
  );

  const startNewCard = useCallback(
    (folder, mod, { status, master } = {}) => {
      if (!folder || !mod || mod[0] !== "Board") return;
      if (isProjectArchived(folder)) return;
      const cols = mod[2].columns || stagesRef.current;
      const cd = cardDraft;
      const row = {
        n: cd.n || "",
        body: cd.body || "",
        s: status || (cols.includes(cd.s) ? cd.s : cols[0]),
        ms:
          master ||
          (stagesRef.current.includes(cd.ms) ? cd.ms : stagesRef.current[0]),
        doneAt: cd.doneAt || "",
        slug: null,
      };
      openItem(row, { draft: true, folder, mod });
    },
    [cardDraft, openItem]
  );

  const setCompletedView = useCallback(
    (scope, mode) => {
      if (!COMPLETED_VIEWS.includes(mode)) mode = "hide";
      completedViewByScope.current.set(scope, mode);
      const map = loadCompletedViews();
      map[scope] = mode;
      try {
        localStorage.setItem(COMPLETED_VIEW_KEY, JSON.stringify(map));
      } catch {}
      bump();
    },
    [bump]
  );

  const onToggleDone = useCallback(
    async (row, folder, mod, checked) => {
      row.doneAt = checked ? new Date().toISOString() : "";
      await saveCard(row, folder, mod);
    },
    [saveCard]
  );

  // --- project actions ---
  const startNewProject = () => {
    const color = nextUnusedProjectColor(folders);
    discardCoverEdit();
    setDraftProject({ name: "", color, description: "" });
    setG(null);
    setBoardEdit(false);
  };

  const commitDraftProject = async () => {
    if (!draftProject) return;
    const name = (draftProject.name || "").trim();
    if (!name) {
      alert("Add a project title first.");
      return;
    }
    const { ok, data } = await postProject({
      name,
      color: draftProject.color,
      cover: { values: { description: draftProject.description || "" } },
    });
    if (!ok) {
      alert(data.error || "Could not create project.");
      return;
    }
    setDraftProject(null);
    const next = applyWorkspace(data);
    const pi = Math.max(0, next.findIndex((f) => f.slug === data.slug));
    setP(pi);
    setM(0);
    setG(null);
    rememberCurrentTab(next, pi, 0);
  };

  const setProjectArchived = async (folder, archived) => {
    if (!folder) return;
    const data = await putProject({ project: folder.slug, archived: !!archived });
    applyWorkspace(data, { project: folder.slug, board: null, g: null });
    setG(null);
  };

  const deleteProjectPermanently = async (folder) => {
    if (!folder) return;
    const data = await deleteProjectApi({ project: folder.slug });
    const next = applyWorkspace(data);
    if (!next.length) {
      setP(0);
      setM(0);
      setG("Masterboard");
    } else {
      setP((prev) => Math.min(prev, next.length - 1));
      setM(restoreTabIndex(next[Math.min(pRef.current, next.length - 1)]));
      setG(null);
    }
  };

  const confirmArchiveProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Archive "${folder.name}"?`,
      message: "Archived projects are read-only until you unarchive them.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    setProjectArchived(folder, true);
  };

  const confirmUnarchiveProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Unarchive "${folder.name}"?`,
      message: "The project will become editable again.",
      confirmLabel: "Unarchive",
    });
    if (!ok) return;
    setProjectArchived(folder, false);
  };

  const confirmDeleteProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Delete "${folder.name}" permanently?`,
      message:
        "This cannot be undone. All boards and tasks in this project will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const okFinal = await askConfirm({
      title: `Final confirmation`,
      message: `Permanently delete "${folder.name}"?`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!okFinal) return;
    deleteProjectPermanently(folder);
  };

  const saveCover = async (folder, mod, patch) => {
    if (!folder || !mod || mod[0] !== "Cover") return;
    if (isProjectArchived(folder)) return;
    const description =
      patch && patch.description != null
        ? String(patch.description)
        : (mod[2].values && mod[2].values.description) || "";
    const data = await putProject({
      project: folder.slug,
      name: patch && patch.name != null ? patch.name : folder.name,
      color: patch && patch.color != null ? patch.color : folder.color,
      cover: { values: { description } },
    });
    discardCoverEdit();
    applyWorkspace(data, keepNav(folder.slug, mod[2].slug));
  };

  const onAddTab = async (t, title) => {
    setMenuOpen(false);
    const folder = foldersRef.current[pRef.current];
    if (!folder || isProjectArchived(folder)) return;
    const name = nextTabName(folder.mods, title);
    let data;
    if (t === "Board") {
      data = await postBoard({ project: folder.slug, name });
    } else if (t === "Notes") {
      data = await postNotesTab({ project: folder.slug, name });
    } else if (t === "Files") {
      data = await postFilesTab({ project: folder.slug, name });
    } else {
      data = await postDatabase({ project: folder.slug, name });
    }
    const next = applyWorkspace(data, { project: folder.slug, board: data.slug });
    const pi = next.findIndex((f) => f.slug === folder.slug);
    const mi = next[pi]?.mods.findIndex((mod) => mod[2]?.slug === data.slug);
    setM(mi >= 0 ? mi : (next[pi]?.mods.length || 1) - 1);
    rememberCurrentTab(next, pi, mi);
  };

  const onMoveTab = useCallback(
    (index, dir) => {
      const folder = foldersRef.current[pRef.current];
      if (!folder || isProjectArchived(folder)) return;
      const mods = folder.mods || [];
      const j = index + dir;
      // Cover stays at index 0
      if (index < 1 || j < 1 || j >= mods.length) return;
      const nextMods = mods.slice();
      [nextMods[index], nextMods[j]] = [nextMods[j], nextMods[index]];
      const nextFolders = foldersRef.current.map((f, i) =>
        i === pRef.current ? { ...f, mods: nextMods } : f
      );
      foldersRef.current = nextFolders;
      setFolders(nextFolders);
      setM(j);
      mRef.current = j;
      rememberCurrentTab(nextFolders, pRef.current, j);
      putTabOrder({
        project: folder.slug,
        order: tabsOrderPayload(nextMods),
      }).then((data) => {
        applyWorkspace(data, keepNav(folder.slug, nextMods[j][2]?.slug));
      });
    },
    [applyWorkspace, keepNav, rememberCurrentTab]
  );

  const onRenameTab = useCallback(
    async (index) => {
      const folder = foldersRef.current[pRef.current];
      if (!folder || isProjectArchived(folder)) return;
      const mod = folder.mods?.[index];
      const type = modToTabType(mod);
      if (!mod || !type) return;
      const next = await askPrompt({
        title: "Rename tab",
        defaultValue: mod[1],
        confirmLabel: "Rename",
      });
      if (next == null) return;
      const name = next.trim();
      if (!name || name === mod[1]) return;
      const data = await putTab({
        project: folder.slug,
        type,
        slug: mod[2].slug,
        name,
      });
      applyWorkspace(data, keepNav(folder.slug, mod[2].slug));
    },
    [applyWorkspace, keepNav]
  );

  const onDeleteTab = useCallback(
    async (index) => {
      const folder = foldersRef.current[pRef.current];
      if (!folder || isProjectArchived(folder)) return;
      const mod = folder.mods?.[index];
      const type = modToTabType(mod);
      if (!mod || !type) return;
      let message = "It will move to Trash and can be restored within 30 days.";
      if (mod[0] === "Board") {
        const count = (mod[2].rows || []).length;
        message = count
          ? `This board and its ${count} card${count === 1 ? "" : "s"} will move to Trash.`
          : "This board will move to Trash.";
      } else if (mod[0] === "Notes") {
        const count = (mod[2].notes || []).length;
        message = count
          ? `This tab and its ${count} note${count === 1 ? "" : "s"} will move to Trash.`
          : "This tab will move to Trash.";
      } else if (mod[0] === "Files") {
        const count = (mod[2].files || []).length;
        message = count
          ? `This tab and its ${count} file${count === 1 ? "" : "s"} will be permanently deleted.`
          : "This tab will be permanently deleted.";
      }
      const ok = await askConfirm({
        title: `Delete "${mod[1]}"?`,
        message,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      const data = await deleteTabApi({
        project: folder.slug,
        type,
        slug: mod[2].slug,
      });
      const fallbackSlug = folder.mods[Math.max(0, index - 1)]?.[2]?.slug || "cover";
      applyWorkspace(data, keepNav(folder.slug, fallbackSlug));
      setBoardEdit(false);
      discardCoverEdit();
      setTrashRefresh((n) => n + 1);
    },
    [applyWorkspace, keepNav, discardCoverEdit]
  );

  const folder = folders[p];
  const archived = folder ? isProjectArchived(folder) : false;
  const mods = folder?.mods || [];
  const x = mods[m];
  const projC =
    (coverEdit && coverDraft && coverDraft.color) ||
    folder?.color ||
    PC[p % PC.length];
  const applyWorkspaceVisibility = useCallback((nextVis) => {
    saveWorkspaceVisibility(nextVis);
    setWorkspaceVis(nextVis);
    if (!nextVis.Archived) {
      const list = foldersRef.current;
      const pi = pRef.current;
      if (list[pi]?.archived) {
        const firstActive = list.findIndex((f) => !f.archived);
        if (firstActive >= 0) {
          setG(null);
          gRef.current = null;
          setP(firstActive);
          setM(restoreTabIndex(list[firstActive]));
          setBoardEdit(false);
        }
      }
    }
  }, []);

  const tabC = projC;
  const isGlobal = !!g && !draftProject;

  void uiTick; // force re-render when Sets mutate

  return (
    <>
      <Sidebar
        folders={folders}
        p={p}
        g={g}
        draftProject={draftProject}
        coverEdit={coverEdit}
        coverDraft={coverDraft}
        activePomo={activePomo}
        workspaceItems={WORKSPACE_ITEMS}
        showArchived={!!workspaceVis.Archived}
        onSelectGlobal={(n) => {
          discardDraft();
          discardCoverEdit();
          setBoardEdit(false);
          setG(n);
        }}
        onSelectProject={(i) => {
          discardDraft();
          discardCoverEdit();
          setG(null);
          setP(i);
          setM(restoreTabIndex(folders[i]));
          setBoardEdit(false);
        }}
        onAddProject={startNewProject}
        onStopPomo={stopPomodoro}
        onPomoNoteChange={updatePomoNote}
        onOpenPomoCard={() => {
          if (!activePomo) return;
          const hit = findCardBySlugs(
            folders,
            activePomo.project,
            activePomo.board,
            activePomo.card
          );
          if (hit) openItem(hit.row);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        updateAvailable={!!updateInfo}
        onOpenUpdate={() => setUpdateOpen(true)}
      />
      <main
        className={
          [isGlobal ? "global-view" : "", boardEdit ? "board-editing" : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <div className="stage">
          {!isGlobal && (
            <TabBar
              folder={folder}
              mods={mods}
              m={m}
              tabC={tabC}
              archived={archived}
              draftProject={draftProject}
              boardEdit={boardEdit && !archived}
              menuOpen={menuOpen}
              menuPos={menuPos}
              onSelectTab={(i) => {
                if (boardEdit) return;
                if (i !== m) discardCoverEdit();
                setM(i);
              }}
              onOpenAddMenu={(e) => {
                if (boardEdit) return;
                discardCoverEdit();
                const r = e.currentTarget.getBoundingClientRect();
                setMenuPos({
                  left: Math.min(r.left, window.innerWidth - 160),
                  top: r.bottom + 4,
                });
                setMenuOpen(true);
              }}
              onAddTab={onAddTab}
              onMoveTab={onMoveTab}
              onRenameTab={onRenameTab}
              onDeleteTab={onDeleteTab}
            />
          )}
          {isGlobal && <div id="bar" style={{ display: "none" }} />}

          {!loaded && (
            <div id="view" className="mod">
              <div style={{ padding: 24, color: "var(--mute)" }}>
                Loading projects…
              </div>
            </div>
          )}
          {loaded && loadError && (
            <div id="view" className="mod">
              <div style={{ padding: 24, color: "var(--mute)" }}>
                Start the app with <code>npm start</code>, then open{" "}
                <code>http://localhost:3456</code>.
                <br />
                <br />
                {loadError}
              </div>
            </div>
          )}
          {loaded && !loadError && draftProject && (
            <Cover
              draftProject={draftProject}
              onCoverDraftChange={setDraftProject}
              onCommitDraft={commitDraftProject}
            />
          )}
          {loaded && !loadError && !draftProject && g === "Masterboard" && (
            <Board
              mode="master"
              folder={folder}
              folders={folders}
              stages={stages}
              tabC={GACC}
              boardEdit={boardEdit}
              onToggleBoardEdit={() => setBoardEdit((v) => !v)}
              masterOff={masterOff.current}
              colCollapsed={colCollapsed.current}
              completedViewByScope={completedViewByScope.current}
              uiTick={uiTick}
              onBump={bump}
              onSetCompletedView={setCompletedView}
              onSaveCard={saveCard}
              onOpenCard={openItem}
              onToggleDone={onToggleDone}
              onStartNewCard={startNewCard}
              onApplyWorkspace={applyWorkspace}
              locateRow={(r) => locateRow(foldersRef.current, r)}
              onStartPomo={startPomodoro}
              onAddManualTimelog={addManualTimelog}
              onOpenTimelogs={openTimelogs}
            />
          )}
          {loaded && !loadError && !draftProject && g === "Calendar" && (
            <Calendar tabC={GACC} />
          )}
          {loaded && !loadError && !draftProject && g === "Timelogs" && (
            <Timelogs
              tabC={GACC}
              folders={folders}
              timelogFilter={timelogFilter}
              onClearFilter={() => setTimelogFilter(null)}
              onOpenCard={(project, board, card) => {
                const hit = findCardBySlugs(folders, project, board, card);
                if (hit) openItem(hit.row);
              }}
              refreshKey={timelogRefresh}
            />
          )}
          {loaded && !loadError && !draftProject && g === "Trash" && (
            <Trash
              tabC={GACC}
              refreshKey={trashRefresh}
              onPreview={(entry) => {
                const kind = entry.kind || "card";
                if (kind === "note") {
                  setTrashPreview({ kind: "note", entry });
                  return;
                }
                if (kind !== "card") return;
                setDialog({
                  readonly: true,
                  isDraft: false,
                  row: {
                    n: entry.title || "",
                    s: entry.status || "",
                    ms: entry.master || "",
                    body: entry.body || "",
                    slug: entry.card || entry.slug,
                    doneAt: entry.doneAt || "",
                  },
                  loc: {
                    folder: {
                      slug: entry.project,
                      name: entry.projectName || entry.project,
                      color: entry.color || GACC,
                    },
                    mod: [
                      "Board",
                      entry.boardName || entry.board || "Board",
                      {
                        slug: entry.board,
                        columns: entry.status ? [entry.status] : stages.slice(),
                      },
                    ],
                  },
                });
              }}
              onRestore={async (entry) => {
                let data = await restoreTrashApi({ slug: entry.slug });
                if (data.needsParent) {
                  const parentLabel =
                    data.parentKind === "notesTab" ? "notes tab" : "board";
                  const ok = await askConfirm({
                    title: `Restore with ${parentLabel}?`,
                    message: `“${entry.title || "This item"}” belongs to ${parentLabel} “${
                      data.parentName || "Untitled"
                    }”, which is also in Trash.\n\nRestoring will bring back both the ${parentLabel} and this item.`,
                    confirmLabel: "Restore both",
                  });
                  if (!ok) return;
                  data = await restoreTrashApi({
                    slug: entry.slug,
                    restoreParent: true,
                  });
                  if (data.needsParent || data.error) {
                    throw new Error(data.error || "Could not restore parent");
                  }
                }
                setTrashPreview(null);
                applyWorkspace(data, {
                  keepNav: {
                    project: data.project,
                    board: data.board || data.notesTab || null,
                    g: "Trash",
                  },
                });
                setTrashRefresh((n) => n + 1);
              }}
            />
          )}
          {loaded &&
            !loadError &&
            !draftProject &&
            g &&
            g !== "Masterboard" &&
            g !== "Calendar" &&
            g !== "Timelogs" &&
            g !== "Trash" && (
              <div id="view" className="mod" style={{ ["--tab"]: GACC }}>
                <div className="modbar gbar">
                  <b>{g}</b>
                </div>
                <div
                  style={{
                    padding: 20,
                    color: "var(--mute)",
                    fontSize: 18,
                    textAlign: "center",
                  }}
                >
                  This is the {g.toLowerCase()} page.
                </div>
              </div>
            )}
          {loaded && !loadError && !draftProject && !g && !folder && (
            <div id="view" className="mod">
              <div className="empty">
                <h2>You have no active projects</h2>
                <p>Create a project from the sidebar to get started.</p>
                <button type="button" className="cta" onClick={startNewProject}>
                  New project
                </button>
              </div>
            </div>
          )}
          {loaded && !loadError && !draftProject && !g && folder && x?.[0] === "Cover" && (
            <Cover
              folder={folder}
              mod={x}
              tabC={tabC}
              readonly={archived}
              coverEdit={coverEdit}
              coverDraft={coverDraft}
              onCoverDraftChange={setCoverDraft}
              onStartEdit={(draft) => {
                setCoverEdit(true);
                setCoverDraft(draft);
              }}
              onSave={(patch) => saveCover(folder, x, patch)}
              onArchive={() => confirmArchiveProject(folder)}
              onDelete={() => confirmDeleteProject(folder)}
            />
          )}
          {loaded &&
            !loadError &&
            !draftProject &&
            !g &&
            folder &&
            x?.[0] === "Board" && (
              <Board
                mode="project"
                mod={x}
                folder={folder}
                folders={folders}
                stages={stages}
                tabC={tabC}
                readonly={archived}
                boardEdit={archived ? false : boardEdit}
                onToggleBoardEdit={() => {
                  if (archived) return;
                  setBoardEdit((v) => {
                    if (!v) {
                      setMenuOpen(false);
                    }
                    return !v;
                  });
                }}
                masterOff={masterOff.current}
                colCollapsed={colCollapsed.current}
                completedViewByScope={completedViewByScope.current}
                uiTick={uiTick}
                onBump={bump}
                onSetCompletedView={setCompletedView}
                onSaveCard={saveCard}
                onOpenCard={openItem}
                onToggleDone={onToggleDone}
                onStartNewCard={startNewCard}
                onApplyWorkspace={applyWorkspace}
                locateRow={(r) => locateRow(foldersRef.current, r)}
                keepNav={keepNav}
                onStartPomo={startPomodoro}
                onAddManualTimelog={addManualTimelog}
                onOpenTimelogs={openTimelogs}
              />
            )}
          {loaded &&
            !loadError &&
            !draftProject &&
            !g &&
            folder &&
            x?.[0] === "Database" && (
              <DatabaseView
                mod={x}
                folder={folder}
                tabC={tabC}
                stages={stages}
                onOpenCard={openItem}
                onApplyWorkspace={applyWorkspace}
              />
            )}
          {loaded &&
            !loadError &&
            !draftProject &&
            !g &&
            folder &&
            x?.[0] === "Notes" && (
              <Notes
                mod={x}
                folder={folder}
                folders={folders}
                tabC={tabC}
                readonly={archived}
                onApplyWorkspace={applyWorkspace}
              />
            )}
          {loaded &&
            !loadError &&
            !draftProject &&
            !g &&
            folder &&
            x?.[0] === "Files" && (
              <Files
                mod={x}
                folder={folder}
                folders={folders}
                tabC={tabC}
                readonly={archived}
                onApplyWorkspace={applyWorkspace}
              />
            )}
          {loaded &&
            !loadError &&
            !draftProject &&
            !g &&
            folder &&
            x &&
            x[0] !== "Cover" &&
            x[0] !== "Board" &&
            x[0] !== "Database" &&
            x[0] !== "Notes" &&
            x[0] !== "Files" && (
              <div id="view" className="mod" style={{ ["--tab"]: tabC }}>
                <div className="modbar" />
                <div
                  style={{
                    padding: 20,
                    color: "var(--mute)",
                    fontSize: 18,
                    textAlign: "center",
                  }}
                >
                  This is a {x[0].toLowerCase()} tab.
                </div>
              </div>
            )}
          {loaded && !loadError && !draftProject && !g && folder && !x && (
            <div id="view" className="mod" style={{ ["--tab"]: tabC }}>
              <div className="modbar" />
              <div
                style={{
                  padding: 20,
                  color: "var(--mute)",
                  fontSize: 18,
                  textAlign: "center",
                }}
              >
                No boards yet. Add one.
              </div>
            </div>
          )}
          {archived && !g && !draftProject && folder && (
            <div className="archive-ribbon">
              <span>This project is archived and cannot be modified.</span>
              <button type="button" onClick={() => confirmUnarchiveProject(folder)}>
                Unarchive
              </button>
            </div>
          )}
        </div>
      </main>

      {dialog && (
        <CardDialog
          row={dialog.row}
          isDraft={dialog.isDraft}
          loc={dialog.loc}
          folders={folders}
          stages={stages}
          g={g}
          readonly={!!dialog.readonly}
          onClose={(result) => {
            if (result?.draftRemember) {
              setCardDraft({
                n: result.draftRemember.n || "",
                body: result.draftRemember.body || "",
                s: result.draftRemember.s || "",
                ms: result.draftRemember.ms || "",
                doneAt: result.draftRemember.doneAt || "",
                project: result.loc?.folder?.slug || "",
                board: result.loc?.mod?.[2]?.slug || "",
              });
            }
            setDialog(null);
            bump();
          }}
          onPersist={dialog.readonly ? async () => {} : saveCard}
          onCreate={async (r, curLoc) => {
            await createCard(curLoc.folder, curLoc.mod, {
              title: r.n,
              status: r.s,
              master: r.ms,
              body: r.body || "",
              doneAt: r.doneAt || "",
            });
            setCardDraft({
              n: "",
              body: "",
              s: "",
              ms: "",
              doneAt: "",
              project: "",
              board: "",
            });
          }}
          onDelete={dialog.readonly ? undefined : deleteCard}
          onDuplicate={async (r, curLoc) => {
            const projectSlug = curLoc.folder.slug;
            const boardSlug = curLoc.mod[2].slug;
            const base = (r.n || "").trim() || "Untitled";
            const slug = await createCard(curLoc.folder, curLoc.mod, {
              title: "Duplicate of " + base,
              status: r.s,
              master: r.ms,
              body: r.body || "",
              doneAt: r.doneAt || "",
            });
            setDialog(null);
            const hit = findCardBySlugs(foldersRef.current, projectSlug, boardSlug, slug);
            if (hit) openItem(hit.row);
          }}
          onStartPomo={startPomodoro}
          onAddManualTimelog={addManualTimelog}
          onOpenTimelogs={openTimelogs}
          onMoveCard={moveCard}
          onSaveItem={async (r, folder, mod) => {
            const fields = {};
            (mod[2].cols || []).forEach((c) => {
              fields[c.id] = r[c.id] != null ? r[c.id] : "";
            });
            await putItem({
              project: folder.slug,
              database: mod[2].slug,
              slug: r.slug,
              fields,
              body: r.body || "",
            });
          }}
        />
      )}

      {manualTimelogTaskKey ? (
        <TimelogDialog
          folders={folders}
          defaultTaskKey={manualTimelogTaskKey}
          onSave={async (payload) => {
            const data = await postTimelog(payload);
            if (data?.error) throw new Error(data.error);
            setManualTimelogTaskKey("");
            if (gRef.current === "Timelogs") setTimelogRefresh((n) => n + 1);
          }}
          onClose={() => setManualTimelogTaskKey("")}
        />
      ) : null}

      {trashPreview?.kind === "note" && (
        <TrashNotePreview
          entry={trashPreview.entry}
          onClose={() => setTrashPreview(null)}
        />
      )}

      {launchOpen && (
        <LaunchDialog
          onStart={() => {
            markLaunchSeen();
            setLaunchOpen(false);
          }}
        />
      )}

      {updateOpen && updateInfo && (
        <UpdateDialog
          notes={updateInfo.notes}
          url={updateInfo.url}
          onClose={() => setUpdateOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          visibility={workspaceVis}
          onChange={applyWorkspaceVisibility}
          openOnLaunch={openOnLaunch}
          onOpenOnLaunchChange={(value) => setOpenOnLaunch(saveOpenOnLaunch(value))}
          onClose={() => setSettingsOpen(false)}
          onResetSeed={async () => {
            const data = await resetWorkspaceToSeed();
            applyWorkspace(data, { initial: true });
            setBoardEdit(false);
            setDraftProject(null);
            setCoverEdit(false);
            setCoverDraft(null);
            setDialog(null);
            setTimelogFilter(null);
            setTrashRefresh((n) => n + 1);
            setTimelogRefresh((n) => n + 1);
          }}
          onResetEmpty={async () => {
            const data = await resetWorkspaceToEmpty();
            applyWorkspace(data, { initial: true });
            setBoardEdit(false);
            setDraftProject(null);
            setCoverEdit(false);
            setCoverDraft(null);
            setDialog(null);
            setTimelogFilter(null);
            setTrashRefresh((n) => n + 1);
            setTimelogRefresh((n) => n + 1);
          }}
          onResetFirstLaunch={async () => {
            await resetWorkspaceToSeed();
            clearClientAppState();
            saveWorkspaceVisibility(defaultWorkspaceVisibility());
            window.location.reload();
            await new Promise(() => {});
          }}
        />
      )}
      <PromptDialog />
      <ConfirmDialog />
    </>
  );
}
