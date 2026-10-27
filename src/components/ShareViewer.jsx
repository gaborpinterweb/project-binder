import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board, { DatabaseView } from "./Board.jsx";
import Cover from "./Cover.jsx";
import Notes from "./Notes.jsx";
import Files from "./Files.jsx";
import CardDialog from "./CardDialog.jsx";
import { fetchPublicShare } from "../pb/shares.js";
import { setShareGuestContext } from "../pb/shareGuest.js";
import { APP_NAME, fromApi, GACC, locateRow } from "../utils.js";
import { Icon } from "../icons.jsx";

const SITE_URL = "https://projectbinder.app";

function ShareUnavailable({ message }) {
  return (
    <div className="share-viewer share-unavailable">
      <div className="share-unavailable-card">
        <h1>This link is unavailable</h1>
        <p>{message || "The shared content may be private or the link is invalid."}</p>
        <a className="cta" href={SITE_URL} target="_blank" rel="noopener noreferrer">
          Go to {APP_NAME}
        </a>
      </div>
    </div>
  );
}

export default function ShareViewer({ shareId }) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [folder, setFolder] = useState(null);
  const [scope, setScope] = useState("project");
  const [m, setM] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [routeNoteId, setRouteNoteId] = useState(null);
  const [routeFileId, setRouteFileId] = useState(null);
  const [uiTick, setUiTick] = useState(0);
  const colCollapsed = useRef(new Set());
  const completedViewByScope = useRef(new Map());
  const boardShowByScope = useRef(new Map());
  const boardSortByScope = useRef(new Map());
  const masterOff = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError("");
      try {
        const { record, payload } = await fetchPublicShare(shareId);
        if (cancelled) return;
        if (!record.enabled) {
          setStatus("unavailable");
          setError("This link is turned off.");
          return;
        }
        const folders = fromApi(payload, null);
        const f = folders[0];
        if (!f) {
          setStatus("unavailable");
          setError("Shared project is empty.");
          return;
        }
        setShareGuestContext({
          shareId,
          fileMap: payload.fileMap || {},
        });
        setFolder(f);
        setScope(payload.shareMeta?.scope || record.scope || "project");
        const preferredTab = payload.shareMeta?.tabId;
        let idx = 0;
        if (preferredTab) {
          const found = f.mods?.findIndex((mod) => mod[2]?.id === preferredTab);
          if (found >= 0) idx = found;
        } else if (payload.shareMeta?.scope === "project") {
          idx = 0;
        }
        setM(idx);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setShareGuestContext(null);
        setStatus("unavailable");
        setError(err?.message || "Could not open this link.");
      }
    })();
    return () => {
      cancelled = true;
      setShareGuestContext(null);
    };
  }, [shareId]);

  const mods = folder?.mods || [];
  const x = mods[m];
  const tabC = folder?.color || GACC;
  const bump = useCallback(() => setUiTick((n) => n + 1), []);

  const openItem = useCallback(
    (row) => {
      if (!folder || !x) return;
      if (x[0] === "Board" || x[0] === "Database") {
        setDialog({
          loc: { folder, mod: x },
          row,
          readonly: true,
        });
      }
    },
    [folder, x]
  );

  const tabButtons = useMemo(() => {
    if (!folder) return null;
    const list = scope === "tab" ? (x ? [x] : []) : mods;
    return list.map((mod, i) => {
      const realIndex = scope === "tab" ? m : i;
      const active = realIndex === m;
      return (
        <button
          key={mod[2]?.id || mod[1] + i}
          type="button"
          className={"tab" + (active ? " on" : "") + (mod[0] === "Cover" ? " tab-cover" : "")}
          style={{ ["--c"]: tabC }}
          onClick={() => {
            if (scope === "tab") return;
            setM(i);
            setDialog(null);
            setRouteNoteId(null);
            setRouteFileId(null);
          }}
        >
          {mod[0] ? (
            <span>
              <Icon name={mod[0]} />
            </span>
          ) : null}
          <span className="tab-label">{mod[1]}</span>
        </button>
      );
    });
  }, [folder, mods, m, scope, tabC, x]);

  if (status === "loading") {
    return (
      <div className="share-viewer" role="status" aria-label="Loading shared content">
        <div className="workspace-boot">
          <span className="workspace-boot-spinner" />
        </div>
      </div>
    );
  }

  if (status !== "ready" || !folder || !x) {
    return <ShareUnavailable message={error} />;
  }

  return (
    <div className="share-viewer app-frame">
      <main className="share-viewer-main">
        <div className="stage">
          <div id="bar" className="share-bar" style={{ ["--tab"]: tabC }}>
            <div id="tabs" className="share-tabs">
              {tabButtons}
            </div>
            <div className="share-credit">
              <span className="share-credit-eye" aria-hidden="true">
                <Icon name="eye" size={16} />
              </span>
              <span className="share-credit-text">Read-only link shared via</span>
              <a
                className="share-credit-brand"
                href={SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="share-credit-logo"
                  src="/app-icon.png"
                  alt=""
                  width={18}
                  height={18}
                  draggable={false}
                />
                <span>{APP_NAME}</span>
              </a>
            </div>
          </div>

          {x[0] === "Cover" && (
            <Cover
              folder={folder}
              mod={x}
              tabC={tabC}
              readonly
              coverEdit={false}
              coverDraft={null}
              onCoverDraftChange={() => {}}
              onSave={async () => {}}
              onApplyWorkspace={() => {}}
            />
          )}
          {x[0] === "Board" && (
            <Board
              mode="project"
              mod={x}
              folder={folder}
              folders={[folder]}
              stages={[]}
              tabC={tabC}
              readonly
              boardEdit={false}
              onToggleBoardEdit={() => {}}
              masterOff={masterOff.current}
              colCollapsed={colCollapsed.current}
              completedViewByScope={completedViewByScope.current}
              boardShowByScope={boardShowByScope.current}
              boardSortByScope={boardSortByScope.current}
              uiTick={uiTick}
              onBump={bump}
              onSetCompletedView={() => {}}
              onSetBoardShow={() => {}}
              onSetBoardSort={() => {}}
              onOpenCard={openItem}
              onToggleDone={async () => {}}
              onSetCardMeta={async () => {}}
              onStartNewCard={() => {}}
              onApplyWorkspace={() => {}}
              locateRow={(r) => locateRow([folder], r)}
              keepNav={() => ({})}
              activeTimerKey={null}
              onStartPomo={() => {}}
              onAddManualTimelog={() => {}}
              onOpenTimelogs={() => {}}
              onDuplicateCard={async () => {}}
              onDeleteCard={async () => {}}
            />
          )}
          {x[0] === "Database" && (
            <DatabaseView
              mod={x}
              folder={folder}
              tabC={tabC}
              stages={[]}
              readonly
              onOpenCard={openItem}
              onApplyWorkspace={() => {}}
            />
          )}
          {x[0] === "Notes" && (
            <Notes
              mod={x}
              folder={folder}
              folders={[folder]}
              tabC={tabC}
              readonly
              onApplyWorkspace={() => {}}
              routeNoteId={routeNoteId}
              onNoteRouteSelect={(id) => setRouteNoteId(id || null)}
            />
          )}
          {x[0] === "Files" && (
            <Files
              mod={x}
              folder={folder}
              folders={[folder]}
              tabC={tabC}
              readonly
              onApplyWorkspace={() => {}}
              routeFileId={routeFileId}
              onFilePreview={(id) => setRouteFileId(id || null)}
            />
          )}
        </div>
      </main>

      {dialog && (
        <CardDialog
          row={dialog.row}
          loc={dialog.loc}
          folders={[folder]}
          stages={[]}
          readonly
          showTimelogs={false}
          onClose={() => setDialog(null)}
          onPersist={async () => {}}
          onDuplicate={async () => {}}
          onStartPomo={() => {}}
          onAddManualTimelog={() => {}}
          onOpenTimelogs={() => {}}
          onApplyWorkspace={() => {}}
          keepNav={() => ({})}
        />
      )}
    </div>
  );
}
