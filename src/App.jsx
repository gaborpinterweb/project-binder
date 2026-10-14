import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWorkspace,
  putCard,
  deleteCardApi,
  postCard,
  moveCardFilesApi,
  putProject,
  postProject,
  deleteProjectApi,
  putProjectOrder,
  postBoard,
  postDatabase,
  postNotesTab,
  postFilesTab,
  putTab,
  deleteTabApi,
  putTabOrder,
  putItem,
  postTimelog,
  putTimelog,
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
  BOARD_SHOW_KEY,
  BOARD_SORT_KEY,
  POMO_DURATION_SEC,
  MIN_TIMELOG_SEC,
  WORKSPACE_ITEMS,
  fromApi,
  normalizeFolders,
  loadStages,
  loadSession,
  saveSession,
  restoreTabIndex,
  saveLastTab,
  loadCompletedViews,
  loadBoardShow,
  loadBoardSorts,
  normalizeBoardShow,
  normalizeBoardSort,
  loadPomo,
  savePomo,
  pomoRemainingSec,
  pomoElapsedSec,
  isStoptimerSession,
  isStoptimerAtMax,
  stoptimerMaxSec,
  locateRow,
  findCardByIds,
  liveCardTitle,
  modToTabType,
  tabsOrderPayload,
  isProjectArchived,
  newId,
  COVER_TAB_ID,
  loadCountdownDurationMin,
  saveCountdownDurationMin,
  loadStoptimerMaxMin,
  saveStoptimerMaxMin,
  loadUiSounds,
  saveUiSounds,
  loadMenuBarTimer,
  saveMenuBarTimer,
  formatMenuBarTimer,
  playSound,
  playTaskCompleteSound,
  playTimerCompleteSound,
  playTimerDiscardSound,
  clearClientAppState,
  hasSeenLaunch,
  markLaunchSeen,
  nextUnusedProjectColor,
  taskKey,
  formatDuration,
} from "./utils.js";
import Sidebar from "./components/Sidebar.jsx";
import TabBar from "./components/TabBar.jsx";
import Board, { DatabaseView } from "./components/Board.jsx";
import Cover from "./components/Cover.jsx";
import Timelogs from "./components/Timelogs.jsx";
import Trash, { TrashNotePreview } from "./components/Trash.jsx";
import Notes from "./components/Notes.jsx";
import Files from "./components/Files.jsx";
import CardDialog from "./components/CardDialog.jsx";
import TimelogDialog from "./components/TimelogDialog.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";
import PromptDialog from "./components/PromptDialog.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import Snackbar from "./components/Snackbar.jsx";
import { askPrompt } from "./promptDialog.js";
import { askConfirm } from "./confirmDialog.js";
import { showSnackbar } from "./snackbar.js";
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
    id: "",
    files: [],
    s: "",
    ms: "",
    doneAt: "",
    impact: "",
    difficulty: "",
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
  const [timelogDialog, setTimelogDialog] = useState(null);
  const [trashPreview, setTrashPreview] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const [timelogRefresh, setTimelogRefresh] = useState(0);
  const [trashRefresh, setTrashRefresh] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countdownDurationMin, setCountdownDurationMin] = useState(() =>
    loadCountdownDurationMin()
  );
  const [stoptimerMaxMin, setStoptimerMaxMin] = useState(() =>
    loadStoptimerMaxMin()
  );
  const [uiSounds, setUiSounds] = useState(() => loadUiSounds());
  const [menuBarTimer, setMenuBarTimer] = useState(() => loadMenuBarTimer());
  const [launchOpen, setLaunchOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const masterOff = useRef(new Set());
  const colCollapsed = useRef(new Set());
  const completedViewByScope = useRef(new Map());
  const boardShowByScope = useRef(new Map());
  const boardSortByScope = useRef(new Map());
  const pomoFinishing = useRef(false);
  const timelogDialogDoneRef = useRef(null);
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
    if (pr && mod?.[2]?.id) saveLastTab(pr.id, mod[2].id);
  }, []);

  // Apply API workspace payload into folders/stages. Navigation opts (mutually used):
  // - initial: restore last session tab
  // - project (+ optional board, g): jump to a specific place
  // - keepNav: { project, board, g } — keep selection after a mutation reload
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
        const sess = loadSession();
        if (sess && "g" in sess) nextG = sess.g || null;
        if (nextG && !WORKSPACE_ITEMS.includes(nextG)) {
          nextG = "Masterboard";
        }
        if (sess?.project) {
          const pi = next.findIndex((f) => f.id === sess.project);
          nextP = pi >= 0 ? pi : 0;
        }
        nextM = restoreTabIndex(next[nextP]);
        setG(nextG);
        setP(nextP);
        setM(nextM);
        gRef.current = nextG;
        pRef.current = nextP;
        mRef.current = nextM;
      } else if (opts.project != null) {
        let nextP = Math.max(
          0,
          next.findIndex((f) => f.id === opts.project)
        );
        if (nextP < 0) nextP = 0;
        let nextM = 0;
        if (opts.board != null) {
          nextM = Math.max(
            0,
            (next[nextP]?.mods || []).findIndex((mod) => mod[2]?.id === opts.board)
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
        // If keepNav.g is omitted, preserve current global view; pass g: null to clear it.
        const keepP = opts.keepNav.project ?? foldersRef.current[pRef.current]?.id;
        const keepM = opts.keepNav.board;
        const keepG = opts.keepNav.g !== undefined ? opts.keepNav.g : gRef.current;
        let nextP = Math.max(0, next.findIndex((f) => f.id === keepP));
        if (nextP < 0) nextP = 0;
        let nextM = Math.max(
          0,
          (next[nextP]?.mods || []).findIndex((mod) => mod[2]?.id === keepM)
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

  // Helper for mutation callers: keep project tab + current global view (`g`).
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
          project: foldersRef.current[pRef.current]?.id,
          board: foldersRef.current[pRef.current]?.mods[mRef.current]?.[2]?.id,
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

  // Countdown / stopwatch init + ticker
  useEffect(() => {
    const session = loadPomo();
    const expired =
      session &&
      ((!isStoptimerSession(session) && pomoRemainingSec(session) <= 0) ||
        isStoptimerAtMax(session));
    if (expired) {
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
      if (
        (!isStoptimerSession(cur) && pomoRemainingSec(cur) <= 0) ||
        isStoptimerAtMax(cur)
      ) {
        stopPomodoro();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!activePomo]);

  useEffect(() => {
    window.desktop?.setTrayVisible?.(menuBarTimer);
  }, [menuBarTimer]);

  useEffect(() => {
    if (!menuBarTimer) return;
    const syncTitle = () => {
      const cur = activePomoRef.current;
      if (!cur) {
        window.desktop?.setTrayTitle?.("No timer");
        return;
      }
      const sec = isStoptimerSession(cur)
        ? pomoElapsedSec(cur)
        : pomoRemainingSec(cur);
      window.desktop?.setTrayTitle?.(formatMenuBarTimer(sec));
    };
    syncTitle();
    if (!activePomo) return;
    const id = setInterval(syncTitle, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuBarTimer, !!activePomo]);

  useEffect(() => {
    const closeMenus = () => {
      setMenuOpen(false);
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  async function stopPomodoroInner(session, opts = {}) {
    if (!session || pomoFinishing.current) return;
    pomoFinishing.current = true;
    const fromTaskComplete = opts.reason === "taskCompleted";
    const elapsed = pomoElapsedSec(session);
    const maxSec = isStoptimerSession(session) ? stoptimerMaxSec() : null;
    const stoptimerDone = maxSec != null && elapsed >= maxSec;
    const pomoDone =
      !isStoptimerSession(session) && pomoRemainingSec(session) <= 0;
    const autoDone = pomoDone || stoptimerDone;
    // Task-complete path already plays the task sound — skip timer chimes.
    if (!fromTaskComplete) {
      if (elapsed < MIN_TIMELOG_SEC) playTimerDiscardSound();
      else playTimerCompleteSound();
    }
    setActivePomo(null);
    activePomoRef.current = null;
    savePomo(null);
    if (elapsed < MIN_TIMELOG_SEC) {
      showSnackbar({
        icon: "stopwatch",
        message: fromTaskComplete
          ? "Timer stopped — under 1 minute, not saved (task completed)."
          : "Timers under 1 minute aren't saved to timelogs.",
      });
      pomoFinishing.current = false;
      return;
    }
    const endedAt = new Date().toISOString();
    const durationSec = isStoptimerSession(session)
      ? maxSec != null
        ? Math.min(maxSec, elapsed)
        : elapsed
      : Math.min(session.durationSec || POMO_DURATION_SEC, elapsed);
    const note = typeof session.note === "string" ? session.note.trim() : "";
    const title = liveCardTitle(
      foldersRef.current,
      session.project,
      session.board,
      session.card,
      session.title || "Untitled"
    );
    try {
      const data = await postTimelog({
        project: session.project,
        board: session.board,
        card: session.card,
        title,
        projectName: session.projectName,
        boardName: session.boardName,
        color: session.color,
        kind: session.kind || "pomodoro",
        note,
        startedAt: session.startedAt,
        endedAt,
        durationSec,
      });
      const entry = data?.entry;
      if (entry?.id) {
        setTimelogRefresh((n) => n + 1);
        const savedMsg = stoptimerDone
          ? `${title} · ${formatDuration(durationSec)} (max reached)`
          : `${title} · ${formatDuration(durationSec)}`;
        showSnackbar({
          icon: "stopwatch",
          message: fromTaskComplete
            ? `Timer stopped and saved — task completed · ${formatDuration(durationSec)}`
            : savedMsg,
          durationMs: 7000,
          persist: autoDone && !fromTaskComplete,
          action: {
            label: note ? "Edit timelog" : "Add note",
            onClick: () => setTimelogDialog({ mode: "edit", entry }),
          },
        });
      }
    } catch {}
    pomoFinishing.current = false;
  }

  async function stopPomodoro() {
    await stopPomodoroInner(activePomoRef.current);
  }

  async function stopActiveTimerForCard(folder, mod, row) {
    const cur = activePomoRef.current;
    if (!cur || !folder?.id || !mod?.[2]?.id || !row?.id) return;
    if (
      taskKey(cur.project, cur.board, cur.card) !==
      taskKey(folder.id, mod[2].id, row.id)
    ) {
      return;
    }
    await stopPomodoroInner(cur, { reason: "taskCompleted" });
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
    const kind = payload.kind === "stoptimer" ? "stoptimer" : "pomodoro";
    const cur = activePomoRef.current;
    if (cur) {
      const curTitle = liveCardTitle(
        foldersRef.current,
        cur.project,
        cur.board,
        cur.card,
        cur.title || "Untitled"
      );
      const ok = await askConfirm({
        title: "Active timer is in progress",
        message: `You can have one timer in progress at a time. Starting a new one will stop your current timer for "${curTitle}".`,
        confirmLabel: "Stop current and start new",
        danger: true,
      });
      if (!ok) return;
      await stopPomodoroInner(cur);
    }
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
      ...(kind === "pomodoro"
        ? { durationSec: loadCountdownDurationMin() * 60 }
        : {}),
    };
    setActivePomo(session);
    activePomoRef.current = session;
    savePomo(session);
    playSound("/sounds/timer-start.mp3");
  }

  function settleTimelogDialog() {
    const done = timelogDialogDoneRef.current;
    timelogDialogDoneRef.current = null;
    done?.();
  }

  function addManualTimelog(filter) {
    if (filter?.project && filter?.board && filter?.card) {
      return new Promise((resolve) => {
        timelogDialogDoneRef.current = resolve;
        setTimelogDialog({
          mode: "add",
          defaultTaskKey: taskKey(filter.project, filter.board, filter.card),
        });
      });
    }
  }

  function editTimelog(entry) {
    if (!entry?.id) return;
    return new Promise((resolve) => {
      timelogDialogDoneRef.current = resolve;
      setTimelogDialog({ mode: "edit", entry });
    });
  }

  function openTimelogs(filter) {
    setTimelogFilter(filter);
    setG("Timelogs");
  }

  const saveCard = useCallback(
    async (row, folder, mod) => {
      if (!folder || !mod || mod[0] !== "Board") return;
      if (isProjectArchived(folder)) return;
      const title = row.n || "Untitled";
      const data = await putCard({
        project: folder.id,
        board: mod[2].id,
        id: row.id,
        title,
        status: row.s || (mod[2].columns || stagesRef.current)[0] || stagesRef.current[0],
        master: row.ms || stagesRef.current[0],
        doneAt: row.doneAt || "",
        body: row.body || "",
        impact: row.impact || "",
        difficulty: row.difficulty || "",
        ord: row.ord,
        ...(Array.isArray(row.files) ? { files: row.files } : {}),
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
      const cur = activePomoRef.current;
      if (
        cur &&
        cur.project === folder.id &&
        cur.board === mod[2].id &&
        cur.card === row.id &&
        cur.title !== title
      ) {
        const next = { ...cur, title };
        setActivePomo(next);
        activePomoRef.current = next;
        savePomo(next);
      }
      setTimelogFilter((prev) => {
        if (
          !prev ||
          prev.project !== folder.id ||
          prev.board !== mod[2].id ||
          prev.card !== row.id ||
          prev.title === title
        ) {
          return prev;
        }
        return { ...prev, title };
      });
      return data;
    },
    [applyWorkspace, keepNav]
  );

  const deleteCard = useCallback(
    async (folder, mod, id) => {
      if (!folder || !mod || mod[0] !== "Board" || !id) return;
      const data = await deleteCardApi({
        project: folder.id,
        board: mod[2].id,
        id,
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
      setTrashRefresh((n) => n + 1);
      return data;
    },
    [applyWorkspace, keepNav]
  );

  const moveCard = useCallback(
    async (row, from, to) => {
      if (!from || !to || from.mod[0] !== "Board" || to.mod[0] !== "Board") return;
      const same =
        from.folder.id === to.folder.id && from.mod[2].id === to.mod[2].id;
      if (same) {
        await saveCard(row, to.folder, to.mod);
        return;
      }
      const cols = to.mod[2].columns || stagesRef.current;
      if (!cols.includes(row.s)) row.s = cols[0] || stagesRef.current[0];
      if (!stagesRef.current.includes(row.ms)) row.ms = stagesRef.current[0];
      const oldId = row.id;
      let id = oldId || newId();
      const taken = new Set((to.mod[2].rows || []).map((r) => r.id));
      if (taken.has(id)) id = newId();
      row.id = id;
      from.mod[2].rows = (from.mod[2].rows || []).filter((r) => r !== row);
      if (!to.mod[2].rows) to.mod[2].rows = [];
      if (!to.mod[2].rows.includes(row)) to.mod[2].rows.push(row);
      if (Array.isArray(row.files) && row.files.length) {
        await moveCardFilesApi({
          fromProject: from.folder.id,
          fromBoard: from.mod[2].id,
          toProject: to.folder.id,
          toBoard: to.mod[2].id,
          files: row.files,
        });
      }
      await saveCard(row, to.folder, to.mod);
      const data = await deleteCardApi({
        project: from.folder.id,
        board: from.mod[2].id,
        id: oldId,
        permanent: true,
        keepFiles: true,
      });
      applyWorkspace(data, keepNav(to.folder.id, to.mod[2].id));
    },
    [saveCard, applyWorkspace, keepNav]
  );

  const createCard = useCallback(
    async (
      folder,
      mod,
      { title, status, master, body, doneAt, impact, difficulty, id, files } = {}
    ) => {
      if (isProjectArchived(folder)) return;
      const boardCol = status || (mod[2].columns || stagesRef.current)[0];
      const masterCol =
        master && stagesRef.current.includes(master)
          ? master
          : stagesRef.current[0];
      const name = (title || "").trim() || "Untitled";
      const data = await postCard({
        project: folder.id,
        board: mod[2].id,
        title: name,
        status: boardCol,
        master: masterCol,
        body: body || "",
        doneAt: doneAt || "",
        impact: impact || "",
        difficulty: difficulty || "",
        ...(id ? { id } : {}),
        ...(Array.isArray(files) ? { files } : {}),
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
      return data.id;
    },
    [applyWorkspace, keepNav]
  );

  const duplicateCard = useCallback(
    async (row, folder, mod) => {
      if (!folder || !mod || mod[0] !== "Board" || !row) return;
      const base = (row.n || "").trim() || "Untitled";
      return createCard(folder, mod, {
        title: "Duplicate of " + base,
        status: row.s,
        master: row.ms,
        body: row.body || "",
        doneAt: row.doneAt || "",
        impact: row.impact || "",
        difficulty: row.difficulty || "",
      });
    },
    [createCard]
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
      const sameLoc =
        cd.project === folder.id && cd.board === mod[2].id && cd.id;
      const row = {
        n: cd.n || "",
        body: cd.body || "",
        s: status || (cols.includes(cd.s) ? cd.s : cols[0]),
        ms:
          master ||
          (stagesRef.current.includes(cd.ms) ? cd.ms : stagesRef.current[0]),
        doneAt: cd.doneAt || "",
        impact: cd.impact || "",
        difficulty: cd.difficulty || "",
        id: sameLoc ? cd.id : newId(),
        files: sameLoc && Array.isArray(cd.files) ? cd.files : [],
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

  const setBoardShow = useCallback(
    (scope, patch) => {
      const next = normalizeBoardShow(scope, {
        ...normalizeBoardShow(scope, loadBoardShow()[scope]),
        ...(boardShowByScope.current.get(scope) || {}),
        ...patch,
      });
      boardShowByScope.current.set(scope, next);
      const map = loadBoardShow();
      map[scope] = next;
      try {
        localStorage.setItem(BOARD_SHOW_KEY, JSON.stringify(map));
      } catch {}
      bump();
    },
    [bump]
  );

  const setBoardSort = useCallback(
    (scope, mode) => {
      const allowProject = scope === "master";
      const next = normalizeBoardSort(mode, { allowProject });
      boardSortByScope.current.set(scope, next);
      const map = loadBoardSorts();
      map[scope] = next;
      try {
        localStorage.setItem(BOARD_SORT_KEY, JSON.stringify(map));
      } catch {}
      bump();
    },
    [bump]
  );

  const onToggleDone = useCallback(
    async (row, folder, mod, checked) => {
      row.doneAt = checked ? new Date().toISOString() : "";
      if (checked) playTaskCompleteSound();
      await saveCard(row, folder, mod);
      if (checked) await stopActiveTimerForCard(folder, mod, row);
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
    const pi = Math.max(0, next.findIndex((f) => f.id === data.id));
    setP(pi);
    setM(0);
    setG(null);
    rememberCurrentTab(next, pi, 0);
  };

  const setProjectArchived = async (folder, archived) => {
    if (!folder) return;
    const data = await putProject({ project: folder.id, archived: !!archived });
    discardCoverEdit();
    setBoardEdit(false);
    applyWorkspace(data, { project: folder.id, board: null, g: null });
    setG(null);
  };

  const onReorderProjects = useCallback(
    (fromId, toIndex) => {
      const current = foldersRef.current;
      const active = current.filter((f) => !isProjectArchived(f));
      const from = active.findIndex((f) => f.id === fromId);
      if (from < 0 || toIndex == null) return;
      const without = active.slice();
      const [moved] = without.splice(from, 1);
      const clamped = Math.max(0, Math.min(toIndex, without.length));
      // No-op when drop lands in the gap the item already occupies.
      if (clamped === from) return;
      without.splice(clamped, 0, moved);
      let ai = 0;
      const next = current.map((f) =>
        isProjectArchived(f) ? f : without[ai++]
      );
      const keepId = current[pRef.current]?.id;
      const keepBoard = current[pRef.current]?.mods?.[mRef.current]?.[2]?.id;
      foldersRef.current = next;
      setFolders(next);
      if (keepId) {
        const ni = next.findIndex((f) => f.id === keepId);
        if (ni >= 0) {
          setP(ni);
          pRef.current = ni;
        }
      }
      putProjectOrder({ order: next.map((f) => f.id) }).then((data) => {
        applyWorkspace(data, keepNav(keepId, keepBoard));
      });
    },
    [applyWorkspace, keepNav]
  );

  const deleteProjectToTrash = async (folder) => {
    if (!folder) return;
    const data = await deleteProjectApi({ project: folder.id });
    // Delete is only offered while cover-editing; clear draft so the sidebar
    // doesn't keep painting the deleted name/color onto the next project.
    discardCoverEdit();
    setBoardEdit(false);
    const next = applyWorkspace(data);
    if (!next.length) {
      setP(0);
      setM(0);
      setG("Masterboard");
      pRef.current = 0;
      mRef.current = 0;
      gRef.current = "Masterboard";
    } else {
      const nextM = restoreTabIndex(next[0]);
      setP(0);
      setM(nextM);
      setG(null);
      pRef.current = 0;
      mRef.current = nextM;
      gRef.current = null;
    }
    setTrashRefresh((n) => n + 1);
  };

  const confirmArchiveProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Archive "${folder.name}"?`,
      message:
        "Archived projects are hidden from the sidebar, and their items are hidden from the UI entirely. They are not deleted, and you can reactivate them anytime from Settings.",
      confirmLabel: "Archive project",
      confirmIcon: "Archive",
    });
    if (!ok) return;
    setProjectArchived(folder, true);
  };

  const confirmUnarchiveProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Reactivate "${folder.name}"?`,
      message: "The project will become editable again.",
      confirmLabel: "Reactivate",
    });
    if (!ok) return;
    setProjectArchived(folder, false);
  };

  const confirmDeleteProject = async (folder) => {
    if (!folder) return;
    const ok = await askConfirm({
      title: `Delete "${folder.name}"?`,
      message: "It will move to Trash and can be restored within 30 days.",
      confirmLabel: "Delete project",
      confirmIcon: "Trash",
      danger: true,
    });
    if (!ok) return;
    deleteProjectToTrash(folder);
  };

  const saveCover = async (folder, mod, patch) => {
    if (!folder || !mod || mod[0] !== "Cover") return;
    if (isProjectArchived(folder)) return;
    const description =
      patch && patch.description != null
        ? String(patch.description)
        : (mod[2].values && mod[2].values.description) || "";
    const data = await putProject({
      project: folder.id,
      name: patch && patch.name != null ? patch.name : folder.name,
      color: patch && patch.color != null ? patch.color : folder.color,
      cover: { values: { description } },
    });
    discardCoverEdit();
    applyWorkspace(data, keepNav(folder.id, mod[2].id));
  };

  const onAddTab = async (t, title) => {
    setMenuOpen(false);
    const folder = foldersRef.current[pRef.current];
    if (!folder || isProjectArchived(folder)) return;
    const name = nextTabName(folder.mods, title);
    let data;
    if (t === "Board") {
      data = await postBoard({ project: folder.id, name });
    } else if (t === "Notes") {
      data = await postNotesTab({ project: folder.id, name });
    } else if (t === "Files") {
      data = await postFilesTab({ project: folder.id, name });
    } else {
      data = await postDatabase({ project: folder.id, name });
    }
    const next = applyWorkspace(data, { project: folder.id, board: data.id });
    const pi = next.findIndex((f) => f.id === folder.id);
    const mi = next[pi]?.mods.findIndex((mod) => mod[2]?.id === data.id);
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
        project: folder.id,
        order: tabsOrderPayload(nextMods),
      }).then((data) => {
        applyWorkspace(data, keepNav(folder.id, nextMods[j][2]?.id));
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
        project: folder.id,
        type,
        id: mod[2].id,
        name,
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
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
          ? `This tab and its ${count} file${count === 1 ? "" : "s"} will move to Trash.`
          : "This tab will move to Trash.";
      }
      const ok = await askConfirm({
        title: `Delete "${mod[1]}"?`,
        message,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      const data = await deleteTabApi({
        project: folder.id,
        type,
        id: mod[2].id,
      });
      const fallbackId = folder.mods[Math.max(0, index - 1)]?.[2]?.id || COVER_TAB_ID;
      applyWorkspace(data, keepNav(folder.id, fallbackId));
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
        onReorderProjects={onReorderProjects}
        onStopPomo={stopPomodoro}
        onPomoNoteChange={updatePomoNote}
        onOpenPomoCard={() => {
          if (!activePomo) return;
          const hit = findCardByIds(
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
              coverEdit={coverEdit}
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
                // #menu min-width is 240px — keep it inside the viewport.
                const menuW = 240;
                const pad = 8;
                const maxLeft = window.innerWidth - menuW - pad;
                let left = r.left;
                if (left > maxLeft) left = r.right - menuW;
                left = Math.max(pad, Math.min(left, maxLeft));
                setMenuPos({
                  left,
                  top: r.bottom + 4,
                });
                setMenuOpen(true);
              }}
              onAddTab={onAddTab}
              onMoveTab={onMoveTab}
              onRenameTab={onRenameTab}
              onDeleteTab={onDeleteTab}
              onCoverEdit={() => {
                if (!folder || archived) return;
                const coverMod =
                  folder.mods?.find((mod) => mod[0] === "Cover") || folder.mods?.[0];
                const values = coverMod?.[2]?.values || { description: "" };
                setCoverEdit(true);
                setCoverDraft({
                  name: folder.name || "",
                  description: values.description || "",
                  color: folder.color || tabC || PC[0],
                });
              }}
              onCoverArchive={() => confirmArchiveProject(folder)}
              onCoverDelete={() => confirmDeleteProject(folder)}
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
                <code>http://localhost:3457</code>.
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
              boardShowByScope={boardShowByScope.current}
              boardSortByScope={boardSortByScope.current}
              uiTick={uiTick}
              onBump={bump}
              onSetCompletedView={setCompletedView}
              onSetBoardShow={setBoardShow}
              onSetBoardSort={setBoardSort}
              onOpenCard={openItem}
              onToggleDone={onToggleDone}
              onStartNewCard={startNewCard}
              onApplyWorkspace={applyWorkspace}
              locateRow={(r) => locateRow(foldersRef.current, r)}
              activeTimerKey={
                activePomo
                  ? taskKey(activePomo.project, activePomo.board, activePomo.card)
                  : null
              }
              onStartPomo={startPomodoro}
              onAddManualTimelog={addManualTimelog}
              onOpenTimelogs={openTimelogs}
              onDuplicateCard={duplicateCard}
              onDeleteCard={deleteCard}
            />
          )}
          {loaded && !loadError && !draftProject && g === "Timelogs" && (
            <Timelogs
              tabC={GACC}
              folders={folders}
              timelogFilter={timelogFilter}
              onClearFilter={() => setTimelogFilter(null)}
              onOpenCard={(project, board, card) => {
                const hit = findCardByIds(folders, project, board, card);
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
                    id: entry.card || entry.id,
                    doneAt: entry.doneAt || "",
                    impact: entry.impact || "",
                    difficulty: entry.difficulty || "",
                  },
                  loc: {
                    folder: {
                      id: entry.project,
                      name: entry.projectName || entry.project,
                      color: entry.color || GACC,
                    },
                    mod: [
                      "Board",
                      entry.boardName || entry.board || "Board",
                      {
                        id: entry.board,
                        columns: entry.status ? [entry.status] : stages.slice(),
                      },
                    ],
                  },
                });
              }}
              onRestore={async (entry) => {
                let data = await restoreTrashApi({ id: entry.id });
                if (data.needsParent) {
                  const parentLabel =
                    data.parentKind === "project"
                      ? "project"
                      : data.parentKind === "notesTab"
                        ? "notes tab"
                        : data.parentKind === "filesTab"
                          ? "files tab"
                          : "board";
                  const ok = await askConfirm({
                    title: `Restore with ${parentLabel}?`,
                    message: `“${entry.title || "This item"}” belongs to ${parentLabel} “${
                      data.parentName || "Untitled"
                    }”, which is also in Trash.\n\nRestoring will bring back both the ${parentLabel} and this item.`,
                    confirmLabel: "Restore both",
                  });
                  if (!ok) return;
                  data = await restoreTrashApi({
                    id: entry.id,
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
                    board: data.board || data.notesTab || data.filesTab || null,
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
              onSave={(patch) => saveCover(folder, x, patch)}
              onApplyWorkspace={applyWorkspace}
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
                boardShowByScope={boardShowByScope.current}
                boardSortByScope={boardSortByScope.current}
                uiTick={uiTick}
                onBump={bump}
                onSetCompletedView={setCompletedView}
                onSetBoardShow={setBoardShow}
                onSetBoardSort={setBoardSort}
                onOpenCard={openItem}
                onToggleDone={onToggleDone}
                onStartNewCard={startNewCard}
                onApplyWorkspace={applyWorkspace}
                locateRow={(r) => locateRow(foldersRef.current, r)}
                keepNav={keepNav}
                activeTimerKey={
                  activePomo
                    ? taskKey(activePomo.project, activePomo.board, activePomo.card)
                    : null
                }
                onStartPomo={startPomodoro}
                onAddManualTimelog={addManualTimelog}
                onOpenTimelogs={openTimelogs}
                onDuplicateCard={duplicateCard}
                onDeleteCard={deleteCard}
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
                Reactivate
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
          activeTimerKey={
            activePomo
              ? taskKey(activePomo.project, activePomo.board, activePomo.card)
              : null
          }
          logsRefreshKey={timelogRefresh}
          onClose={(result) => {
            if (result?.draftRemember) {
              setCardDraft({
                n: result.draftRemember.n || "",
                body: result.draftRemember.body || "",
                id: result.draftRemember.id || "",
                files: Array.isArray(result.draftRemember.files)
                  ? result.draftRemember.files
                  : [],
                s: result.draftRemember.s || "",
                ms: result.draftRemember.ms || "",
                doneAt: result.draftRemember.doneAt || "",
                impact: result.draftRemember.impact || "",
                difficulty: result.draftRemember.difficulty || "",
                project: result.loc?.folder?.id || "",
                board: result.loc?.mod?.[2]?.id || "",
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
              impact: r.impact || "",
              difficulty: r.difficulty || "",
              id: r.id || "",
            });
            setCardDraft({
              n: "",
              body: "",
              id: "",
              files: [],
              s: "",
              ms: "",
              doneAt: "",
              impact: "",
              difficulty: "",
              project: "",
              board: "",
            });
          }}
          onDelete={dialog.readonly ? undefined : deleteCard}
          onDuplicate={async (r, curLoc) => {
            const projectId = curLoc.folder.id;
            const boardId = curLoc.mod[2].id;
            const id = await duplicateCard(r, curLoc.folder, curLoc.mod);
            setDialog(null);
            const hit = findCardByIds(foldersRef.current, projectId, boardId, id);
            if (hit) openItem(hit.row);
          }}
          onStartPomo={startPomodoro}
          onStopActiveTimerForCard={stopActiveTimerForCard}
          onAddManualTimelog={addManualTimelog}
          onEditTimelog={editTimelog}
          onOpenTimelogs={openTimelogs}
          onMoveCard={moveCard}
          onApplyWorkspace={applyWorkspace}
          keepNav={keepNav}
          onSaveItem={async (r, folder, mod) => {
            const fields = {};
            (mod[2].cols || []).forEach((c) => {
              fields[c.id] = r[c.id] != null ? r[c.id] : "";
            });
            await putItem({
              project: folder.id,
              database: mod[2].id,
              id: r.id,
              fields,
              body: r.body || "",
            });
          }}
        />
      )}

      {timelogDialog ? (
        <TimelogDialog
          folders={folders}
          entry={timelogDialog.mode === "edit" ? timelogDialog.entry : null}
          defaultTaskKey={
            timelogDialog.mode === "add" ? timelogDialog.defaultTaskKey : ""
          }
          onSave={async (payload) => {
            if (timelogDialog.mode === "edit") {
              const data = await putTimelog(payload);
              if (data?.error) throw new Error(data.error);
            } else {
              const data = await postTimelog(payload);
              if (data?.error) throw new Error(data.error);
            }
            setTimelogDialog(null);
            settleTimelogDialog();
            setTimelogRefresh((n) => n + 1);
          }}
          onClose={() => {
            setTimelogDialog(null);
            settleTimelogDialog();
          }}
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
          releasesUrl={updateInfo.releasesUrl}
          matched={updateInfo.matched}
          onClose={() => setUpdateOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          folders={folders}
          countdownDurationMin={countdownDurationMin}
          onCountdownDurationChange={(value) =>
            setCountdownDurationMin(saveCountdownDurationMin(value))
          }
          stoptimerMaxMin={stoptimerMaxMin}
          onStoptimerMaxChange={(value) =>
            setStoptimerMaxMin(saveStoptimerMaxMin(value))
          }
          uiSounds={uiSounds}
          onUiSoundsChange={(enabled) => setUiSounds(saveUiSounds(enabled))}
          menuBarTimer={menuBarTimer}
          onMenuBarTimerChange={(enabled) =>
            setMenuBarTimer(saveMenuBarTimer(enabled))
          }
          onReactivate={confirmUnarchiveProject}
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
          onImportBackup={async (data) => {
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
            window.location.reload();
            await new Promise(() => {});
          }}
        />
      )}
      <PromptDialog />
      <ConfirmDialog />
      <Snackbar />
    </>
  );
}
