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
  postItem,
  deleteItemApi,
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
  findDbItemByIds,
  liveCardTitle,
  modToTabType,
  tabsOrderPayload,
  isProjectArchived,
  newId,
  rewriteCardRteImageUrls,
  COVER_TAB_ID,
  loadCountdownDurationMin,
  saveCountdownDurationMin,
  loadStoptimerMaxMin,
  saveStoptimerMaxMin,
  loadUiSounds,
  saveUiSounds,
  playSound,
  playTaskCompleteSound,
  playTimerCompleteSound,
  playTimerDiscardSound,
  clearClientAppState,
  hasSeenLaunch,
  markLaunchSeen,
  clearLaunchSeen,
  syncLaunchSeenFromLocal,
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
import MobileSettingsDialog from "./components/MobileSettingsDialog.jsx";
import MobileShell from "./components/MobileShell.jsx";
import SharingSettingsDialog from "./components/SharingSettingsDialog.jsx";
import PromptDialog from "./components/PromptDialog.jsx";
import { askPrompt } from "./promptDialog.js";
import { askConfirm } from "./confirmDialog.js";
import { askPaywall } from "./paywallDialog.js";
import { shouldBlockNewActiveProject } from "./billingLimits.js";
import { showSnackbar } from "./snackbar.js";
import LaunchDialog from "./components/LaunchDialog.jsx";
import UpdateDialog from "./components/UpdateDialog.jsx";
import { checkForUpdate } from "./checkUpdate.js";
import { isCommercialMode, isPbMode } from "./pb/client.js";
import useIsPhone from "./hooks/useIsPhone.js";
import {
  parsePath,
  buildPath,
  navigatePath,
  currentPathname,
  confirmProCheckoutIdFromSearch,
  modTypeToEntityKind,
  entityKindToModType,
  ENTITY_NOTES,
  ENTITY_FILES,
  ENTITY_TASKS,
} from "./routes.js";
import ConfirmProDialog from "./components/ConfirmProDialog.jsx";

function nextTabName(mods, base) {
  const used = new Set((mods || []).map((mod) => mod[1]));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export default function App() {
  const isPhone = useIsPhone();
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
    images: [],
    s: "",
    ms: "",
    doneAt: "",
    impact: "",
    effort: "",
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
  const [confirmProOpen, setConfirmProOpen] = useState(false);
  const [confirmProCheckoutId, setConfirmProCheckoutId] = useState("");
  const [sharingTarget, setSharingTarget] = useState(null);
  /** Note/file entity segments driven by the URL (null = tab-only path). */
  const [routeNoteId, setRouteNoteId] = useState(null);
  const [routeFileId, setRouteFileId] = useState(null);
  const [countdownDurationMin, setCountdownDurationMin] = useState(() =>
    loadCountdownDurationMin()
  );
  const [stoptimerMaxMin, setStoptimerMaxMin] = useState(() =>
    loadStoptimerMaxMin()
  );
  const [uiSounds, setUiSounds] = useState(() => loadUiSounds());
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
  const dialogRef = useRef(dialog);
  const settingsOpenRef = useRef(settingsOpen);
  const routeNoteIdRef = useRef(routeNoteId);
  const routeFileIdRef = useRef(routeFileId);
  const settingsPushedRef = useRef(false);
  const confirmProHoldingRef = useRef(false);
  const routeReadyRef = useRef(false);
  const applyingRouteRef = useRef(false);
  const isPhoneRef = useRef(isPhone);

  foldersRef.current = folders;
  stagesRef.current = stages;
  pRef.current = p;
  mRef.current = m;
  gRef.current = g;
  activePomoRef.current = activePomo;
  dialogRef.current = dialog;
  settingsOpenRef.current = settingsOpen;
  routeNoteIdRef.current = routeNoteId;
  routeFileIdRef.current = routeFileId;
  isPhoneRef.current = isPhone;

  const bump = useCallback(() => setUiTick((n) => n + 1), []);

  useEffect(() => {
    document.documentElement.classList.toggle("is-phone", isPhone);
    return () => document.documentElement.classList.remove("is-phone");
  }, [isPhone]);

  const buildAppPath = useCallback(
    (overrides = {}) => {
      const settings =
        overrides.settings !== undefined
          ? overrides.settings
          : settingsOpenRef.current;
      if (settings) return buildPath({ settings: true });

      const gVal = overrides.g !== undefined ? overrides.g : gRef.current;
      if (gVal) {
        const dialogNow =
          overrides.dialog !== undefined ? overrides.dialog : dialogRef.current;
        if (
          gVal === "Masterboard" &&
          dialogNow &&
          !dialogNow.isDraft &&
          !dialogNow.readonly &&
          dialogNow.row?.id &&
          dialogNow.loc?.mod?.[0] === "Board"
        ) {
          return buildPath({
            g: gVal,
            entityKind: ENTITY_TASKS,
            entityId: dialogNow.row.id,
          });
        }
        return buildPath({ g: gVal });
      }

      const foldersNow = overrides.folders || foldersRef.current;
      const pVal = overrides.p !== undefined ? overrides.p : pRef.current;
      const mVal = overrides.m !== undefined ? overrides.m : mRef.current;
      const folder = foldersNow[pVal];
      if (!folder) return buildPath({});

      const mod = folder.mods?.[mVal];
      if (!mod) return buildPath({ projectId: folder.id });

      if (mod[0] === "Cover" || mod[2]?.id === COVER_TAB_ID) {
        return buildPath({ projectId: folder.id, cover: true });
      }

      const tabId = mod[2]?.id;
      if (!tabId) return buildPath({ projectId: folder.id });

      const dialogNow =
        overrides.dialog !== undefined ? overrides.dialog : dialogRef.current;
      const noteId =
        overrides.routeNoteId !== undefined
          ? overrides.routeNoteId
          : routeNoteIdRef.current;
      const fileId =
        overrides.routeFileId !== undefined
          ? overrides.routeFileId
          : routeFileIdRef.current;

      let entityKind = null;
      let entityId = null;
      if (
        dialogNow &&
        !dialogNow.isDraft &&
        !dialogNow.readonly &&
        dialogNow.row?.id &&
        dialogNow.loc?.folder?.id === folder.id &&
        dialogNow.loc?.mod?.[2]?.id === tabId
      ) {
        entityKind = modTypeToEntityKind(dialogNow.loc.mod[0]);
        entityId = dialogNow.row.id;
      } else if (mod[0] === "Notes" && noteId) {
        entityKind = ENTITY_NOTES;
        entityId = noteId;
      } else if (mod[0] === "Files" && fileId) {
        entityKind = ENTITY_FILES;
        entityId = fileId;
      }

      return buildPath({
        projectId: folder.id,
        tabId,
        entityKind,
        entityId,
      });
    },
    []
  );

  const syncUrl = useCallback(
    ({ replace = false, ...overrides } = {}) => {
      if (applyingRouteRef.current) return;
      const path = buildAppPath(overrides);
      // Drop settings-only ?tab= when leaving /settings (preserve while on it).
      navigatePath(path, {
        replace,
        ...(path !== "/settings" ? { search: "" } : {}),
      });
    },
    [buildAppPath]
  );

  useEffect(() => {
    if (!isPhone) return;
    setBoardEdit(false);
    setDraftProject(null);
    setCoverEdit(false);
    setCoverDraft(null);
    if (gRef.current !== "Masterboard") {
      setG("Masterboard");
      gRef.current = "Masterboard";
      if (routeReadyRef.current) {
        syncUrl({
          g: "Masterboard",
          settings: settingsOpenRef.current,
          replace: true,
        });
      }
    }
  }, [isPhone, syncUrl]);

  const clearEntityOverlays = useCallback(() => {
    setDialog(null);
    setRouteNoteId(null);
    setRouteFileId(null);
    dialogRef.current = null;
    routeNoteIdRef.current = null;
    routeFileIdRef.current = null;
  }, []);

  const applyLocation = useCallback(
    ({ replace = true } = {}) => {
      const foldersNow = foldersRef.current;
      const route = parsePath(currentPathname());

      applyingRouteRef.current = true;
      try {
        // Strip leftover settings ?tab= on any non-settings canonicalize.
        const nav = { replace: true, search: "" };

        if (!route || route.kind === "auth") {
          setSettingsOpen(false);
          settingsOpenRef.current = false;
          if (confirmProHoldingRef.current) {
            // Success replaced URL to `/`; keep dialog until Continue.
            return;
          }
          setConfirmProOpen(false);
          // Session already applied on initial load; canonicalize address bar.
          navigatePath(buildAppPath({ settings: false }), nav);
          return;
        }

        if (route.kind === "settings") {
          setConfirmProOpen(false);
          confirmProHoldingRef.current = false;
          setSettingsOpen(true);
          settingsOpenRef.current = true;
          return;
        }

        if (route.kind === "confirmPro") {
          setSettingsOpen(false);
          settingsOpenRef.current = false;
          settingsPushedRef.current = false;
          confirmProHoldingRef.current = false;
          if (!isCommercialMode()) {
            setConfirmProOpen(false);
            navigatePath(buildAppPath({ settings: false }), nav);
            return;
          }
          setConfirmProCheckoutId(confirmProCheckoutIdFromSearch());
          setConfirmProOpen(true);
          if (!gRef.current) {
            setG("Masterboard");
            gRef.current = "Masterboard";
          }
          return;
        }

        setSettingsOpen(false);
        settingsOpenRef.current = false;
        settingsPushedRef.current = false;
        if (!confirmProHoldingRef.current) {
          setConfirmProOpen(false);
        }

        if (route.kind === "global") {
          const nextG =
            isPhoneRef.current && route.g !== "Masterboard"
              ? "Masterboard"
              : route.g;
          clearEntityOverlays();
          setG(nextG);
          gRef.current = nextG;
          navigatePath(buildPath({ g: nextG }), nav);
          return;
        }

        if (route.kind === "globalEntity") {
          const nextG =
            isPhoneRef.current && route.g !== "Masterboard"
              ? "Masterboard"
              : route.g;
          setG(nextG);
          gRef.current = nextG;
          setRouteNoteId(null);
          setRouteFileId(null);
          routeNoteIdRef.current = null;
          routeFileIdRef.current = null;
          if (route.entityKind !== ENTITY_TASKS) {
            clearEntityOverlays();
            navigatePath(buildPath({ g: nextG }), nav);
            return;
          }
          const loc = locateRow(foldersNow, { id: route.entityId });
          const row =
            loc?.mod?.[0] === "Board"
              ? (loc.mod[2]?.rows || []).find((r) => r.id === route.entityId)
              : null;
          if (!loc || !row) {
            clearEntityOverlays();
            navigatePath(buildPath({ g: nextG }), nav);
            return;
          }
          const nextDialog = {
            row: { ...row },
            isDraft: false,
            loc: { folder: loc.folder, mod: loc.mod },
          };
          setDialog(nextDialog);
          dialogRef.current = nextDialog;
          navigatePath(
            buildPath({
              g: nextG,
              entityKind: ENTITY_TASKS,
              entityId: route.entityId,
            }),
            nav
          );
          return;
        }

        // Phone shell is Masterboard-only: project/tab URLs redirect there.
        // Task entity deep links still open the card on Masterboard.
        if (isPhoneRef.current) {
          setG("Masterboard");
          gRef.current = "Masterboard";
          setRouteNoteId(null);
          setRouteFileId(null);
          routeNoteIdRef.current = null;
          routeFileIdRef.current = null;
          if (route.entityKind === ENTITY_TASKS && route.entityId) {
            const loc = locateRow(foldersNow, { id: route.entityId });
            const row =
              loc?.mod?.[0] === "Board"
                ? (loc.mod[2]?.rows || []).find((r) => r.id === route.entityId)
                : null;
            if (loc && row) {
              const nextDialog = {
                row: { ...row },
                isDraft: false,
                loc: { folder: loc.folder, mod: loc.mod },
              };
              setDialog(nextDialog);
              dialogRef.current = nextDialog;
              navigatePath(
                buildPath({
                  g: "Masterboard",
                  entityKind: ENTITY_TASKS,
                  entityId: route.entityId,
                }),
                nav
              );
              return;
            }
          }
          clearEntityOverlays();
          navigatePath(buildPath({ g: "Masterboard" }), nav);
          return;
        }

        const pi = foldersNow.findIndex((f) => f.id === route.projectId);
        if (pi < 0) {
          clearEntityOverlays();
          setG("Masterboard");
          gRef.current = "Masterboard";
          navigatePath(buildPath({ g: "Masterboard" }), nav);
          return;
        }

        setG(null);
        gRef.current = null;
        setP(pi);
        pRef.current = pi;
        const project = foldersNow[pi];
        const mods = project.mods || [];

        // Project root and legacy `/cover` both open the cover tab.
        if (route.kind === "project" || route.kind === "cover") {
          clearEntityOverlays();
          setM(0);
          mRef.current = 0;
          navigatePath(buildPath({ projectId: project.id }), nav);
          return;
        }

        const tabIndex = mods.findIndex((mod) => mod?.[2]?.id === route.tabId);
        if (tabIndex < 0) {
          clearEntityOverlays();
          setM(0);
          mRef.current = 0;
          navigatePath(buildPath({ projectId: project.id }), nav);
          return;
        }

        const mod = mods[tabIndex];
        setM(tabIndex);
        mRef.current = tabIndex;

        if (route.kind === "tab") {
          clearEntityOverlays();
          navigatePath(
            buildPath({ projectId: project.id, tabId: route.tabId }),
            nav
          );
          return;
        }

        // entity
        const expectedType = entityKindToModType(route.entityKind);
        if (!expectedType || mod[0] !== expectedType) {
          clearEntityOverlays();
          navigatePath(
            buildPath({ projectId: project.id, tabId: route.tabId }),
            nav
          );
          return;
        }

        if (route.entityKind === ENTITY_NOTES) {
          setDialog(null);
          dialogRef.current = null;
          setRouteFileId(null);
          routeFileIdRef.current = null;
          const exists = (mod[2]?.notes || []).some(
            (n) => n.id === route.entityId
          );
          if (!exists) {
            setRouteNoteId(null);
            routeNoteIdRef.current = null;
            navigatePath(
              buildPath({ projectId: project.id, tabId: route.tabId }),
              nav
            );
            return;
          }
          setRouteNoteId(route.entityId);
          routeNoteIdRef.current = route.entityId;
          return;
        }

        if (route.entityKind === ENTITY_FILES) {
          setDialog(null);
          dialogRef.current = null;
          setRouteNoteId(null);
          routeNoteIdRef.current = null;
          const exists = (mod[2]?.files || []).some(
            (f) => f.id === route.entityId
          );
          if (!exists) {
            setRouteFileId(null);
            routeFileIdRef.current = null;
            navigatePath(
              buildPath({ projectId: project.id, tabId: route.tabId }),
              nav
            );
            return;
          }
          setRouteFileId(route.entityId);
          routeFileIdRef.current = route.entityId;
          return;
        }

        // tasks / records → CardDialog
        setRouteNoteId(null);
        setRouteFileId(null);
        routeNoteIdRef.current = null;
        routeFileIdRef.current = null;
        const hit =
          mod[0] === "Board"
            ? findCardByIds(
                foldersNow,
                project.id,
                route.tabId,
                route.entityId
              )
            : findDbItemByIds(
                foldersNow,
                project.id,
                route.tabId,
                route.entityId
              );
        if (!hit) {
          setDialog(null);
          dialogRef.current = null;
          navigatePath(
            buildPath({ projectId: project.id, tabId: route.tabId }),
            nav
          );
          return;
        }
        const nextDialog = {
          row: { ...hit.row },
          isDraft: false,
          loc: { folder: hit.folder, mod: hit.mod },
        };
        setDialog(nextDialog);
        dialogRef.current = nextDialog;
      } finally {
        applyingRouteRef.current = false;
        void replace;
      }
    },
    [buildAppPath, clearEntityOverlays]
  );

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
            (next[nextP]?.mods || []).findIndex((mod) => mod?.[2]?.id === opts.board)
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
          (next[nextP]?.mods || []).findIndex((mod) => mod?.[2]?.id === keepM)
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
    if (!loaded || loadError) return;
    if (routeReadyRef.current) return;
    routeReadyRef.current = true;
    applyLocation({ replace: true });
  }, [loaded, loadError, applyLocation]);

  useEffect(() => {
    const onPop = () => {
      if (!routeReadyRef.current) return;
      applyLocation({ replace: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyLocation]);

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
    if (!loaded || loadError) return;
    let cancelled = false;
    (async () => {
      await syncLaunchSeenFromLocal();
      if (cancelled) return;
      if (!hasSeenLaunch()) setLaunchOpen(true);
    })();
    return () => {
      cancelled = true;
    };
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
    if (isPhoneRef.current) return;
    setTimelogFilter(filter);
    clearEntityOverlays();
    setSettingsOpen(false);
    settingsOpenRef.current = false;
    setG("Timelogs");
    gRef.current = "Timelogs";
    syncUrl({ g: "Timelogs", settings: false, dialog: null });
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
        effort: row.effort || "",
        ord: row.ord,
        ...(Array.isArray(row.files) ? { files: row.files } : {}),
        ...(Array.isArray(row.images) ? { images: row.images } : {}),
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
      const fromProject = from.folder.id;
      const fromBoard = from.mod[2].id;
      const toProject = to.folder.id;
      const toBoard = to.mod[2].id;
      if (Array.isArray(row.files) && row.files.length) {
        await moveCardFilesApi({
          fromProject,
          fromBoard,
          toProject,
          toBoard,
          files: row.files,
        });
      }
      if (Array.isArray(row.images) && row.images.length) {
        await moveCardFilesApi({
          fromProject,
          fromBoard,
          toProject,
          toBoard,
          files: row.images,
        });
      }
      row.body = rewriteCardRteImageUrls(row.body || "", {
        fromProject,
        fromBoard,
        fromCard: oldId,
        toProject,
        toBoard,
        toCard: id,
      });
      row.id = id;
      from.mod[2].rows = (from.mod[2].rows || []).filter((r) => r !== row);
      if (!to.mod[2].rows) to.mod[2].rows = [];
      if (!to.mod[2].rows.includes(row)) to.mod[2].rows.push(row);
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
      { title, status, master, body, doneAt, impact, effort, id, files, images } = {}
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
        effort: effort || "",
        ...(id ? { id } : {}),
        ...(Array.isArray(files) ? { files } : {}),
        ...(Array.isArray(images) ? { images } : {}),
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
        effort: row.effort || "",
      });
    },
    [createCard]
  );

  const duplicateDbItem = useCallback(
    async (row, folder, mod) => {
      if (!folder || !mod || mod[0] !== "Database" || !row) return;
      if (isProjectArchived(folder)) return;
      const cols = mod[2].cols || [];
      const fields = {};
      cols.forEach((c) => {
        if (!c?.id) return;
        if (c.id === "n") {
          const base = String(row.n || "").trim() || "Untitled";
          fields[c.id] = "Duplicate of " + base;
          return;
        }
        fields[c.id] = row[c.id] != null ? row[c.id] : "";
      });
      const data = await postItem({
        project: folder.id,
        database: mod[2].id,
        fields,
        body: row.body || "",
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
      return data.id;
    },
    [applyWorkspace, keepNav]
  );

  const deleteDbItem = useCallback(
    async (folder, mod, id) => {
      if (!folder || !mod || mod[0] !== "Database" || !id) return;
      if (isProjectArchived(folder)) return;
      const data = await deleteItemApi({
        project: folder.id,
        database: mod[2].id,
        id,
      });
      applyWorkspace(data, keepNav(folder.id, mod[2].id));
      return data;
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
      const nextDialog = { row: { ...r }, isDraft, loc };
      setDialog(nextDialog);
      dialogRef.current = nextDialog;
      setRouteNoteId(null);
      setRouteFileId(null);
      routeNoteIdRef.current = null;
      routeFileIdRef.current = null;
      setSettingsOpen(false);
      settingsOpenRef.current = false;
      // Phone always stays on Masterboard. Desktop: keep Timelogs/Trash/Masterboard;
      // only jump into the project tab when opening from inside a project.
      if (isPhoneRef.current) {
        setG("Masterboard");
        gRef.current = "Masterboard";
      }
      const stayGlobal = isPhoneRef.current || !!gRef.current;
      if (!stayGlobal && loc?.folder && loc?.mod) {
        const pi = foldersRef.current.findIndex((f) => f.id === loc.folder.id);
        const mi = (foldersRef.current[pi]?.mods || []).findIndex(
          (mod) => mod?.[2]?.id === loc.mod[2]?.id
        );
        if (pi >= 0) {
          setG(null);
          gRef.current = null;
          setP(pi);
          pRef.current = pi;
          if (mi >= 0) {
            setM(mi);
            mRef.current = mi;
          }
        }
      }
      // Drafts stay on the tab URL; persisted cards get an entity path
      // (Masterboard → /master-board/tasks/:id).
      syncUrl({
        dialog: isDraft ? null : nextDialog,
        routeNoteId: null,
        routeFileId: null,
        settings: false,
        g: isPhoneRef.current
          ? "Masterboard"
          : stayGlobal
            ? gRef.current
            : null,
      });
    },
    [syncUrl]
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
        effort: cd.effort || "",
        id: sameLoc ? cd.id : newId(),
        files: sameLoc && Array.isArray(cd.files) ? cd.files : [],
        images: sameLoc && Array.isArray(cd.images) ? cd.images : [],
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

  const onSetCardMeta = useCallback(
    async (row, folder, mod, patch) => {
      if (!row || !folder || !mod) return;
      if (patch.impact !== undefined) row.impact = patch.impact || "";
      if (patch.effort !== undefined) row.effort = patch.effort || "";
      await saveCard(row, folder, mod);
    },
    [saveCard]
  );

  // --- project actions ---
  const startNewProject = async () => {
    const demos = foldersRef.current.filter(
      (f) => !isProjectArchived(f) && f.isDemo
    );
    if (demos.length) {
      const ok = await askConfirm({
        title: "Creating your first project? Let's clean up first!",
        message:
          "Your binder still has demo projects. Delete them before creating your own project?",
        confirmLabel: "Delete and continue",
        confirmIcon: "Trash",
        danger: true,
      });
      if (!ok) return;
      let lastOk = null;
      for (const demo of demos) {
        const data = await deleteProjectApi({ project: demo.id });
        if (data?.error) {
          if (lastOk) applyWorkspace(lastOk);
          alert(data.error || "Could not delete demo projects.");
          return;
        }
        lastOk = data;
      }
      if (lastOk) {
        applyWorkspace(lastOk);
        setTrashRefresh((n) => n + 1);
      }
    }
    if (shouldBlockNewActiveProject(foldersRef.current)) {
      await askPaywall({ highlightFree: "3" });
      return;
    }
    const color = nextUnusedProjectColor(foldersRef.current);
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
    if (shouldBlockNewActiveProject(foldersRef.current)) {
      await askPaywall({ highlightFree: "3" });
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
    pRef.current = pi;
    mRef.current = 0;
    gRef.current = null;
    clearEntityOverlays();
    rememberCurrentTab(next, pi, 0);
    syncUrl({
      folders: next,
      p: pi,
      m: 0,
      g: null,
      dialog: null,
      routeNoteId: null,
      routeFileId: null,
      settings: false,
    });
  };

  const setProjectArchived = async (folder, archived) => {
    if (!folder) return;
    const projectId = folder.id;
    const data = await putProject({ project: projectId, archived: !!archived });
    discardCoverEdit();
    setBoardEdit(false);
    if (archived) {
      const next = applyWorkspace(data);
      clearEntityOverlays();
      if (!next.length) {
        setP(0);
        setM(0);
        setG("Masterboard");
        pRef.current = 0;
        mRef.current = 0;
        gRef.current = "Masterboard";
        syncUrl({ g: "Masterboard", settings: false, dialog: null });
      } else {
        const nextM = restoreTabIndex(next[0]);
        setP(0);
        setM(nextM);
        setG(null);
        pRef.current = 0;
        mRef.current = nextM;
        gRef.current = null;
        syncUrl({
          folders: next,
          p: 0,
          m: nextM,
          g: null,
          dialog: null,
          routeNoteId: null,
          routeFileId: null,
          settings: false,
        });
      }
      return;
    }
    applyWorkspace(data, { project: projectId, board: null, g: null });
    setG(null);
    gRef.current = null;
    clearEntityOverlays();
    syncUrl({
      g: null,
      dialog: null,
      routeNoteId: null,
      routeFileId: null,
      settings: false,
      replace: true,
    });
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
    clearEntityOverlays();
    if (!next.length) {
      setP(0);
      setM(0);
      setG("Masterboard");
      pRef.current = 0;
      mRef.current = 0;
      gRef.current = "Masterboard";
      syncUrl({ g: "Masterboard", settings: false, dialog: null });
    } else {
      const nextM = restoreTabIndex(next[0]);
      setP(0);
      setM(nextM);
      setG(null);
      pRef.current = 0;
      mRef.current = nextM;
      gRef.current = null;
      syncUrl({
        folders: next,
        p: 0,
        m: nextM,
        g: null,
        dialog: null,
        routeNoteId: null,
        routeFileId: null,
        settings: false,
      });
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
    if (shouldBlockNewActiveProject(foldersRef.current)) {
      await askPaywall({ highlightFree: "3" });
      return;
    }
    const ok = await askConfirm({
      title: `Reactivate "${folder.name}"?`,
      message: "The project will become editable again.",
      confirmLabel: "Reactivate",
    });
    if (!ok) return;
    await setProjectArchived(folder, false);
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
    const nextM = mi >= 0 ? mi : (next[pi]?.mods.length || 1) - 1;
    setM(nextM);
    mRef.current = nextM;
    clearEntityOverlays();
    rememberCurrentTab(next, pi, nextM);
    syncUrl({
      folders: next,
      p: pi,
      m: nextM,
      dialog: null,
      routeNoteId: null,
      routeFileId: null,
    });
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
      clearEntityOverlays();
      rememberCurrentTab(nextFolders, pRef.current, j);
      syncUrl({
        folders: nextFolders,
        m: j,
        dialog: null,
        routeNoteId: null,
        routeFileId: null,
      });
      putTabOrder({
        project: folder.id,
        order: tabsOrderPayload(nextMods),
      }).then((data) => {
        applyWorkspace(data, keepNav(folder.id, nextMods[j][2]?.id));
      });
    },
    [applyWorkspace, keepNav, rememberCurrentTab, clearEntityOverlays, syncUrl]
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

  const openShareSettings = useCallback(
    (
      scope,
      projectId,
      tabId,
      enabled,
      { projectShareEnabled = false, targetName = "" } = {}
    ) => {
      if (!isPbMode()) return;
      setSharingTarget({
        scope,
        projectId,
        tabId: tabId || null,
        initiallyEnabled: !!enabled,
        projectShareEnabled: !!projectShareEnabled,
        targetName: String(targetName || "").trim(),
      });
    },
    []
  );

  const onShareTab = useCallback(
    (index) => {
      const folder = foldersRef.current[pRef.current];
      if (!folder || isProjectArchived(folder)) return;
      const mod = folder.mods?.[index];
      if (!mod || mod[0] === "Cover") return;
      const projectShareEnabled = !!(folder.shareEnabled && folder.shareId);
      openShareSettings(
        "tab",
        folder.id,
        mod[2]?.id,
        !!(mod[2]?.shareEnabled && mod[2]?.shareId),
        { projectShareEnabled, targetName: mod[1] || "Tab" }
      );
    },
    [openShareSettings]
  );

  const onCoverShare = useCallback(() => {
    const folder = foldersRef.current[pRef.current];
    if (!folder || isProjectArchived(folder)) return;
    openShareSettings(
      "project",
      folder.id,
      null,
      !!(folder.shareEnabled && folder.shareId),
      { targetName: folder.name || "Project" }
    );
  }, [openShareSettings]);

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
      clearEntityOverlays();
      setTrashRefresh((n) => n + 1);
      syncUrl({
        dialog: null,
        routeNoteId: null,
        routeFileId: null,
        replace: true,
      });
    },
    [applyWorkspace, keepNav, discardCoverEdit, clearEntityOverlays, syncUrl]
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

  const openSettings = () => {
    settingsPushedRef.current = true;
    setSettingsOpen(true);
    settingsOpenRef.current = true;
    // Bare /settings (Experience); deep links keep ?tab= via applyLocation.
    navigatePath("/settings", { search: "" });
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    settingsOpenRef.current = false;
    if (currentPathname() === "/settings") {
      if (settingsPushedRef.current && window.history.length > 1) {
        settingsPushedRef.current = false;
        window.history.back();
      } else {
        settingsPushedRef.current = false;
        navigatePath(buildAppPath({ settings: false }), {
          replace: true,
          search: "",
        });
      }
    }
  };

  const handleConfirmProConfirmed = useCallback(() => {
    confirmProHoldingRef.current = true;
  }, []);

  const closeConfirmPro = useCallback(() => {
    confirmProHoldingRef.current = false;
    setConfirmProOpen(false);
    setSettingsOpen(false);
    settingsOpenRef.current = false;
    clearEntityOverlays();
    setG("Masterboard");
    gRef.current = "Masterboard";
    navigatePath(buildPath({ g: "Masterboard" }), {
      replace: true,
      search: "",
    });
  }, [clearEntityOverlays]);

  const masterBoard = (
    <Board
      mode="master"
      folder={folder}
      folders={folders}
      stages={stages}
      tabC={GACC}
      boardEdit={isPhone ? false : boardEdit}
      onToggleBoardEdit={() => setBoardEdit((v) => !v)}
      masterOff={masterOff.current}
      colCollapsed={colCollapsed.current}
      completedViewByScope={completedViewByScope.current}
      boardShowByScope={boardShowByScope.current}
      boardSortByScope={boardSortByScope.current}
      uiTick={uiTick}
      compact={isPhone}
      onBump={bump}
      onSetCompletedView={setCompletedView}
      onSetBoardShow={setBoardShow}
      onSetBoardSort={setBoardSort}
      onOpenCard={openItem}
      onToggleDone={onToggleDone}
      onSetCardMeta={onSetCardMeta}
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
      onOpenSettings={isPhone ? openSettings : undefined}
    />
  );

  return (
    <>
      {isPhone ? (
        <MobileShell>
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
          {loaded && !loadError && masterBoard}
        </MobileShell>
      ) : (
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
          clearEntityOverlays();
          setSettingsOpen(false);
          settingsOpenRef.current = false;
          setG(n);
          gRef.current = n;
          syncUrl({ g: n, settings: false, dialog: null });
        }}
        onSelectProject={(i, { cover } = {}) => {
          discardDraft();
          discardCoverEdit();
          setBoardEdit(false);
          clearEntityOverlays();
          setSettingsOpen(false);
          settingsOpenRef.current = false;
          setG(null);
          gRef.current = null;
          setP(i);
          pRef.current = i;
          const nextM = cover ? 0 : restoreTabIndex(folders[i]);
          setM(nextM);
          mRef.current = nextM;
          syncUrl({
            g: null,
            p: i,
            m: nextM,
            settings: false,
            dialog: null,
            routeNoteId: null,
            routeFileId: null,
          });
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
        onOpenSettings={openSettings}
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
              key={folder?.id || "none"}
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
                clearEntityOverlays();
                setM(i);
                mRef.current = i;
                syncUrl({
                  m: i,
                  dialog: null,
                  routeNoteId: null,
                  routeFileId: null,
                });
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
              onShareTab={isPbMode() ? onShareTab : undefined}
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
              onCoverShare={isPbMode() ? onCoverShare : undefined}
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
          {loaded && !loadError && !draftProject && g === "Masterboard" && masterBoard}
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
                    effort: entry.effort || "",
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
                if (
                  entry.kind === "project" &&
                  shouldBlockNewActiveProject(foldersRef.current)
                ) {
                  await askPaywall({ highlightFree: "3" });
                  return;
                }
                let data = await restoreTrashApi({ id: entry.id });
                if (data.needsParent) {
                  if (
                    data.parentKind === "project" &&
                    shouldBlockNewActiveProject(foldersRef.current)
                  ) {
                    await askPaywall({ highlightFree: "3" });
                    return;
                  }
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
                syncUrl({ g: "Trash", settings: false, replace: true });
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
                onSetCardMeta={onSetCardMeta}
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
                readonly={archived}
                onOpenCard={openItem}
                onApplyWorkspace={applyWorkspace}
                onDuplicateRecord={
                  archived
                    ? undefined
                    : (row) => duplicateDbItem(row, folder, x)
                }
                onDeleteRecord={
                  archived
                    ? undefined
                    : (row) => deleteDbItem(folder, x, row.id)
                }
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
                routeNoteId={routeNoteId}
                onNoteRouteSelect={(id) => {
                  setRouteNoteId(id || null);
                  routeNoteIdRef.current = id || null;
                  setRouteFileId(null);
                  routeFileIdRef.current = null;
                  setDialog(null);
                  dialogRef.current = null;
                  syncUrl({
                    routeNoteId: id || null,
                    routeFileId: null,
                    dialog: null,
                  });
                }}
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
                routeFileId={routeFileId}
                onFilePreview={(id) => {
                  setRouteFileId(id || null);
                  routeFileIdRef.current = id || null;
                  setRouteNoteId(null);
                  routeNoteIdRef.current = null;
                  setDialog(null);
                  dialogRef.current = null;
                  syncUrl({
                    routeFileId: id || null,
                    routeNoteId: null,
                    dialog: null,
                  });
                }}
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
        </>
      )}

      {dialog && (
        <CardDialog
          row={dialog.row}
          isDraft={dialog.isDraft}
          loc={dialog.loc}
          folders={folders}
          stages={stages}
          g={g}
          readonly={!!dialog.readonly}
          compact={isPhone}
          activeTimerKey={
            activePomo
              ? taskKey(activePomo.project, activePomo.board, activePomo.card)
              : null
          }
          activePomo={activePomo}
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
                images: Array.isArray(result.draftRemember.images)
                  ? result.draftRemember.images
                  : [],
                s: result.draftRemember.s || "",
                ms: result.draftRemember.ms || "",
                doneAt: result.draftRemember.doneAt || "",
                impact: result.draftRemember.impact || "",
                effort: result.draftRemember.effort || "",
                project: result.loc?.folder?.id || "",
                board: result.loc?.mod?.[2]?.id || "",
              });
            }
            setDialog(null);
            dialogRef.current = null;
            syncUrl({ dialog: null });
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
              effort: r.effort || "",
              id: r.id || "",
              files: Array.isArray(r.files) ? r.files : undefined,
              images: Array.isArray(r.images) ? r.images : undefined,
            });
            setCardDraft({
              n: "",
              body: "",
              id: "",
              files: [],
              images: [],
              s: "",
              ms: "",
              doneAt: "",
              impact: "",
              effort: "",
              project: "",
              board: "",
            });
          }}
          onDelete={
            dialog.readonly
              ? undefined
              : async (folder, mod, id) => {
                  if (mod?.[0] === "Database") {
                    await deleteDbItem(folder, mod, id);
                    return;
                  }
                  await deleteCard(folder, mod, id);
                }
          }
          onDuplicate={async (r, curLoc) => {
            const projectId = curLoc.folder.id;
            const tabId = curLoc.mod[2].id;
            if (curLoc.mod[0] === "Database") {
              const id = await duplicateDbItem(r, curLoc.folder, curLoc.mod);
              setDialog(null);
              const hit = findDbItemByIds(
                foldersRef.current,
                projectId,
                tabId,
                id
              );
              if (hit) openItem(hit.row);
              return;
            }
            const id = await duplicateCard(r, curLoc.folder, curLoc.mod);
            setDialog(null);
            const hit = findCardByIds(foldersRef.current, projectId, tabId, id);
            if (hit) openItem(hit.row);
          }}
          onStartPomo={startPomodoro}
          onStopPomo={stopPomodoro}
          onStopActiveTimerForCard={stopActiveTimerForCard}
          onAddManualTimelog={addManualTimelog}
          onEditTimelog={editTimelog}
          onOpenTimelogs={openTimelogs}
          onMoveCard={moveCard}
          onApplyWorkspace={applyWorkspace}
          keepNav={keepNav}
          onSaveItem={async (r, folder, mod) => {
            if (!folder || !mod || mod[0] !== "Database") return;
            if (isProjectArchived(folder)) return;
            const fields = {};
            (mod[2].cols || []).forEach((c) => {
              fields[c.id] = r[c.id] != null ? r[c.id] : "";
            });
            const data = await putItem({
              project: folder.id,
              database: mod[2].id,
              id: r.id,
              fields,
              body: r.body || "",
            });
            applyWorkspace(data, keepNav(folder.id, mod[2].id));
            return data;
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
            setLaunchOpen(false);
            void markLaunchSeen();
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

      {confirmProOpen ? (
        <ConfirmProDialog
          open={confirmProOpen}
          checkoutId={confirmProCheckoutId}
          onConfirmed={handleConfirmProConfirmed}
          onClose={closeConfirmPro}
        />
      ) : null}

      {settingsOpen &&
        (isPhone ? (
          <MobileSettingsDialog onClose={closeSettings} />
        ) : (
          <SettingsDialog
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
            onReactivate={confirmUnarchiveProject}
            onClose={closeSettings}
            onResetSeed={async () => {
              const data = await resetWorkspaceToSeed();
              applyWorkspace(data, { initial: true });
              setBoardEdit(false);
              setDraftProject(null);
              setCoverEdit(false);
              setCoverDraft(null);
              clearEntityOverlays();
              setTimelogFilter(null);
              setTrashRefresh((n) => n + 1);
              setTimelogRefresh((n) => n + 1);
              queueMicrotask(() => applyLocation({ replace: true }));
            }}
            onResetEmpty={async () => {
              const data = await resetWorkspaceToEmpty();
              applyWorkspace(data, { initial: true });
              setBoardEdit(false);
              setDraftProject(null);
              setCoverEdit(false);
              setCoverDraft(null);
              clearEntityOverlays();
              setTimelogFilter(null);
              setTrashRefresh((n) => n + 1);
              setTimelogRefresh((n) => n + 1);
              queueMicrotask(() => applyLocation({ replace: true }));
            }}
            onResetFirstLaunch={async () => {
              await clearLaunchSeen();
              await resetWorkspaceToSeed();
              clearClientAppState();
              window.location.reload();
              await new Promise(() => {});
            }}
          />
        ))}
      {sharingTarget && (
        <SharingSettingsDialog
          projectId={sharingTarget.projectId}
          tabId={sharingTarget.tabId}
          scope={sharingTarget.scope}
          targetName={sharingTarget.targetName}
          initiallyEnabled={sharingTarget.initiallyEnabled}
          projectShareEnabled={!!sharingTarget.projectShareEnabled}
          onClose={() => setSharingTarget(null)}
          onGoToCoverShare={() => {
            setSharingTarget(null);
            discardCoverEdit();
            clearEntityOverlays();
            setM(0);
            mRef.current = 0;
            syncUrl({
              m: 0,
              dialog: null,
              routeNoteId: null,
              routeFileId: null,
            });
            queueMicrotask(() => onCoverShare());
          }}
          onApplied={async () => {
            const data = await fetchWorkspace();
            applyWorkspace(data, keepNav(sharingTarget.projectId, sharingTarget.tabId));
          }}
        />
      )}
      <PromptDialog />
    </>
  );
}
