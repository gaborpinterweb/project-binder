import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flipSwapHorizontal } from "../flipSwap.js";
import { Icon, IC } from "../icons.jsx";
import { COVER_TAB_ID, TYPES } from "../utils.js";

const TAB_GAP = 6;

function findTabEl(tabsEl, id) {
  if (!tabsEl || !id) return null;
  return [...tabsEl.querySelectorAll(":scope > .tab")].find(
    (el) => el.dataset.tabId === id
  );
}

/** FLIP-animate two tabs after applyOrder reorders the DOM. */
function flipSwapTabs(tabsEl, leftId, rightId, applyOrder) {
  flipSwapHorizontal(
    (id) => findTabEl(tabsEl, id),
    leftId,
    rightId,
    applyOrder,
    "tab-swapping"
  );
}

function TabMoreShell({ visible, title = "Tab options", children }) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const run = (fn) => {
    setOpen(false);
    fn?.();
  };

  return (
    <div
      className={
        "tab-more" + (open ? " open" : "") + (visible ? "" : " is-hidden")
      }
      ref={wrapRef}
      aria-hidden={visible ? undefined : true}
    >
      <button
        type="button"
        ref={btnRef}
        className="tab-more-btn"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={visible ? 0 : -1}
        disabled={!visible}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          if (!visible) return;
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" size={14} />
      </button>
      {open && pos && visible && (
        <div
          className="pop"
          role="menu"
          style={{ top: pos.top, right: pos.right, left: "auto" }}
        >
          {children(run)}
        </div>
      )}
    </div>
  );
}

function TabMoreMenu({
  visible,
  canLeft,
  canRight,
  onMoveLeft,
  onMoveRight,
  onRename,
  onShare,
  onDelete,
}) {
  return (
    <TabMoreShell visible={visible} title="Tab options">
      {(run) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!canLeft}
            onClick={(e) => {
              e.stopPropagation();
              run(onMoveLeft);
            }}
          >
            <Icon name="arrowLeft" size={14} />
            Move left
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canRight}
            onClick={(e) => {
              e.stopPropagation();
              run(onMoveRight);
            }}
          >
            <Icon name="arrowRight" size={14} />
            Move right
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              run(onRename);
            }}
          >
            <Icon name="pencil" size={14} />
            Rename
          </button>
          {onShare ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                run(onShare);
              }}
            >
              <Icon name="share" size={14} />
              Share
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={(e) => {
              e.stopPropagation();
              run(onDelete);
            }}
          >
            <Icon name="Trash" size={14} />
            Delete
          </button>
        </>
      )}
    </TabMoreShell>
  );
}

function CoverTabMoreMenu({ visible, editing, onEdit, onShare, onArchive, onDelete }) {
  return (
    <TabMoreShell visible={visible} title="Project options">
      {(run) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!!editing}
            onClick={(e) => {
              e.stopPropagation();
              run(onEdit);
            }}
          >
            <Icon name="pencil" size={14} />
            Edit project
          </button>
          {onShare ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                run(onShare);
              }}
            >
              <Icon name="share" size={14} />
              Share
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              run(onArchive);
            }}
          >
            <Icon name="Archive" size={14} />
            Archive project
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={(e) => {
              e.stopPropagation();
              run(onDelete);
            }}
          >
            <Icon name="Trash" size={14} />
            Delete project
          </button>
        </>
      )}
    </TabMoreShell>
  );
}

function TabBtn({
  label,
  c,
  on,
  type,
  id,
  onClick,
  disabled,
  showMenu,
  menuKind = "tab",
  menuVisible,
  canLeft,
  canRight,
  onMoveLeft,
  onMoveRight,
  onRename,
  onShare,
  onDelete,
  coverEditing,
  onCoverEdit,
  onCoverShare,
  onCoverArchive,
  onCoverDelete,
}) {
  const className =
    "tab" +
    (on ? " on" : "") +
    (disabled ? " locked" : "") +
    (type === "Cover" ? " tab-cover" : "");

  const body = (
    <>
      {type && IC[type] ? (
        <span>
          <Icon name={type} />
        </span>
      ) : null}
      <span className="tab-label">{label}</span>
      {showMenu ? (
        menuKind === "cover" ? (
          <CoverTabMoreMenu
            visible={!!menuVisible}
            editing={coverEditing}
            onEdit={onCoverEdit}
            onShare={onCoverShare}
            onArchive={onCoverArchive}
            onDelete={onCoverDelete}
          />
        ) : (
          <TabMoreMenu
            visible={!!menuVisible}
            canLeft={canLeft}
            canRight={canRight}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onRename={onRename}
            onShare={onShare}
            onDelete={onDelete}
          />
        )
      ) : null}
    </>
  );

  if (showMenu) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={className}
        style={{ ["--c"]: c }}
        data-tab-id={id}
        aria-disabled={disabled || undefined}
        onClick={(e) => {
          if (disabled) return;
          if (e.target.closest(".tab-more")) return;
          onClick?.(e);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.(e);
          }
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={{ ["--c"]: c }}
      data-tab-id={id}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/** Width of a contiguous non-cover window [L..R], including leading gaps after Cover. */
function windowWidth(tabWidths, L, R) {
  let w = 0;
  for (let i = L; i <= R; i++) w += TAB_GAP + tabWidths[i];
  return w;
}

/**
 * Cover stays pinned. When content overflows, pick a contiguous window of other tabs
 * (preferring left, always including the active tab) and park the rest + Add in "...".
 * Add never sits beside "..." — if overflow is needed, Add is menu-only.
 */
function fitTabs({
  tabWidths,
  addWidth,
  overflowWidth,
  avail,
  activeIndex,
  showAdd,
}) {
  const n = tabWidths.length;
  if (n === 0) {
    return { visible: [], hidden: [], showAdd: false, showOverflow: false };
  }

  const coverW = tabWidths[0] || 0;
  const allAfter =
    windowWidth(tabWidths, 1, n - 1) +
    (showAdd ? TAB_GAP + addWidth : 0);
  if (coverW + allAfter <= avail) {
    return {
      visible: Array.from({ length: n }, (_, i) => i),
      hidden: [],
      showAdd,
      showOverflow: false,
    };
  }

  // Reserve "..." ; Add goes to the menu unless it still fits after the window.
  let budget = avail - coverW - TAB_GAP - overflowWidth;
  if (budget < 0) budget = 0;

  let bestL = 1;
  let bestR = 0; // empty window
  let bestCount = -1;

  if (n === 1) {
    // Only Cover — Add (if any) is in the overflow menu.
    return {
      visible: [0],
      hidden: [],
      showAdd: false,
      showOverflow: true,
    };
  }

  const must = activeIndex > 0 && activeIndex < n ? activeIndex : 0;

  for (let L = 1; L < n; L++) {
    for (let R = L; R < n; R++) {
      if (must > 0 && (must < L || must > R)) continue;
      // When Cover is active, only consider left-aligned prefixes.
      if (must === 0 && L !== 1) continue;
      const w = windowWidth(tabWidths, L, R);
      if (w > budget) continue;
      const count = R - L + 1;
      if (count > bestCount || (count === bestCount && L < bestL)) {
        bestCount = count;
        bestL = L;
        bestR = R;
      }
    }
  }

  // If nothing fits (very narrow), still force-show the active non-cover tab.
  if (bestCount < 0 && must > 0) {
    bestL = must;
    bestR = must;
  }

  const visible = [0];
  if (bestCount > 0) {
    for (let i = bestL; i <= bestR; i++) visible.push(i);
  }
  const visibleSet = new Set(visible);
  const hidden = [];
  for (let i = 1; i < n; i++) {
    if (!visibleSet.has(i)) hidden.push(i);
  }

  // When "..." is shown, Add always lives in that menu — never beside it.
  return {
    visible,
    hidden,
    showAdd: false,
    showOverflow: true,
  };
}

function TabsOverflowMenu({
  c,
  items,
  showAdd,
  addLocked,
  onSelect,
  onOpenAdd,
}) {
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - 200),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div
      className={"tab-overflow-wrap" + (open ? " open" : "")}
      ref={wrapRef}
    >
      <button
        type="button"
        ref={btnRef}
        className={"tab tab-overflow" + (open ? " open" : "")}
        style={{ ["--c"]: c }}
        title="More tabs"
        aria-label="More tabs"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      {open && pos && (
        <div
          className="pop tab-overflow-pop"
          role="menu"
          style={{ top: pos.top, left: pos.left }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.locked}
              className={item.active ? "on" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (!item.locked) onSelect?.(item.index);
              }}
            >
              {item.type && IC[item.type] ? (
                <Icon name={item.type} size={14} />
              ) : null}
              {item.label}
            </button>
          ))}
          {showAdd ? (
            <button
              type="button"
              role="menuitem"
              disabled={!!addLocked}
              onClick={(e) => {
                e.stopPropagation();
                if (addLocked) return;
                setOpen(false);
                onOpenAdd?.({ currentTarget: btnRef.current });
              }}
            >
              <span className="tab-overflow-add" aria-hidden="true">
                +
              </span>
              Add tab
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function TabBar({
  folder,
  mods,
  m,
  tabC,
  archived,
  draftProject,
  boardEdit,
  coverEdit,
  menuOpen,
  menuPos,
  onSelectTab,
  onOpenAddMenu,
  onAddTab,
  onMoveTab,
  onRenameTab,
  onShareTab,
  onDeleteTab,
  onCoverEdit,
  onCoverShare,
  onCoverArchive,
  onCoverDelete,
}) {
  const tabsRef = useRef(null);
  const measureRef = useRef(null);
  const swappingRef = useRef(false);
  const [fit, setFit] = useState({
    visible: null,
    hidden: [],
    showAdd: true,
    showOverflow: false,
  });

  const moveAnimated = (index, dir) => {
    if (swappingRef.current || archived || boardEdit) return;
    const j = index + dir;
    if (index < 1 || j < 1 || j >= mods.length) return;
    const leftId = dir > 0 ? mods[index][2]?.id : mods[j][2]?.id;
    const rightId = dir > 0 ? mods[j][2]?.id : mods[index][2]?.id;
    if (!leftId || !rightId) return;
    swappingRef.current = true;
    flipSwapTabs(tabsRef.current, leftId, rightId, () => {
      onMoveTab?.(index, dir);
    });
    window.setTimeout(() => {
      swappingRef.current = false;
    }, 320);
  };

  const recompute = useCallback(() => {
    const tabsEl = tabsRef.current;
    const measureEl = measureRef.current;
    if (!tabsEl || !measureEl || !mods?.length) return;

    const style = getComputedStyle(tabsEl);
    const avail =
      tabsEl.clientWidth -
      (parseFloat(style.paddingLeft) || 0) -
      (parseFloat(style.paddingRight) || 0);

    const measureTabs = [
      ...measureEl.querySelectorAll(":scope > .tab[data-tab-id]"),
    ];
    const tabWidths = mods.map((mod, i) => {
      if (!mod) return 0;
      const id = mod[2]?.id || mod[1] + i;
      const el = measureTabs.find((node) => node.dataset.tabId === id);
      return el?.offsetWidth || 0;
    });
    const addEl = measureEl.querySelector(":scope > .tab.add");
    const overflowEl = measureEl.querySelector(":scope > .tab.tab-overflow");
    const addWidth = addEl?.offsetWidth || 0;
    const overflowWidth = overflowEl?.offsetWidth || 0;

    const next = fitTabs({
      tabWidths,
      addWidth,
      overflowWidth,
      avail,
      activeIndex: m,
      showAdd: !archived,
    });
    setFit((prev) => {
      const sameVisible =
        prev.visible &&
        prev.visible.length === next.visible.length &&
        prev.visible.every((v, i) => v === next.visible[i]);
      const sameHidden =
        prev.hidden.length === next.hidden.length &&
        prev.hidden.every((v, i) => v === next.hidden[i]);
      if (
        sameVisible &&
        sameHidden &&
        prev.showAdd === next.showAdd &&
        prev.showOverflow === next.showOverflow
      ) {
        return prev;
      }
      return next;
    });
  }, [mods, m, archived]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, tabC, boardEdit, coverEdit]);

  useEffect(() => {
    const tabsEl = tabsRef.current;
    if (!tabsEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(tabsEl);
    return () => ro.disconnect();
  }, [recompute]);

  if (draftProject) {
    const c = draftProject.color || tabC;
    return (
      <div id="bar" style={{ ["--tab"]: c }}>
        <div id="tabs">
          <TabBtn label="Cover" c={c} on type="Cover" id={COVER_TAB_ID} />
        </div>
      </div>
    );
  }

  if (!folder) return <div id="bar" style={{ display: "none" }} />;

  const visibleSet =
    fit.visible == null ? null : new Set(fit.visible);
  const showOverflow = !!fit.showOverflow;
  const showAddInBar = fit.visible == null ? !archived : !!fit.showAdd;
  // fit can lag one render behind mods (project switch / tab delete); skip stale indices.
  const overflowItems = (fit.hidden || []).flatMap((i) => {
    const mod = mods[i];
    if (!mod) return [];
    const active = i === m;
    const locked = boardEdit && !active;
    const id = mod[2]?.id || mod[1] + i;
    return [
      {
        index: i,
        id,
        label: mod[1],
        type: mod[0],
        active,
        locked,
      },
    ];
  });
  const addInOverflow = showOverflow && !archived && !showAddInBar;

  const renderTab = (mod, i) => {
    if (!mod) return null;
    const active = i === m;
    const locked = boardEdit && !active;
    const id = mod[2]?.id || mod[1] + i;
    return (
      <TabBtn
        key={id}
        label={mod[1]}
        c={tabC}
        on={active}
        type={mod[0]}
        id={id}
        disabled={locked}
        showMenu={!archived}
        menuKind={mod[0] === "Cover" ? "cover" : "tab"}
        menuVisible={active}
        canLeft={i > 1}
        canRight={i < mods.length - 1}
        coverEditing={!!coverEdit}
        onClick={() => {
          if (locked) return;
          onSelectTab(i);
        }}
        onMoveLeft={() => moveAnimated(i, -1)}
        onMoveRight={() => moveAnimated(i, 1)}
        onRename={() => onRenameTab?.(i)}
        onShare={onShareTab ? () => onShareTab(i) : undefined}
        onDelete={() => onDeleteTab?.(i)}
        onCoverEdit={onCoverEdit}
        onCoverShare={onCoverShare}
        onCoverArchive={onCoverArchive}
        onCoverDelete={onCoverDelete}
      />
    );
  };

  return (
    <>
      <div
        id="bar"
        className={boardEdit ? "board-editing" : undefined}
        style={{ ["--tab"]: tabC }}
      >
        <div id="tabs" ref={tabsRef}>
          {mods.map((mod, i) => {
            if (visibleSet && !visibleSet.has(i)) return null;
            return renderTab(mod, i);
          })}
          {showOverflow ? (
            <TabsOverflowMenu
              c={tabC}
              items={overflowItems}
              showAdd={addInOverflow}
              addLocked={!!boardEdit}
              onSelect={(i) => onSelectTab(i)}
              onOpenAdd={onOpenAddMenu}
            />
          ) : null}
          {showAddInBar ? (
            <button
              type="button"
              className={"tab add" + (boardEdit ? " locked" : "")}
              id="add"
              title="Add tab"
              disabled={!!boardEdit}
              aria-disabled={boardEdit || undefined}
              onClick={(e) => {
                if (boardEdit) return;
                e.stopPropagation();
                onOpenAddMenu(e);
              }}
            >
              +
            </button>
          ) : null}
        </div>
        <div className="tabs-measure" ref={measureRef} aria-hidden="true">
          {mods.map((mod, i) => {
            if (!mod) return null;
            const id = mod[2]?.id || mod[1] + i;
            return (
              <TabBtn
                key={id}
                label={mod[1]}
                c={tabC}
                on={i === m}
                type={mod[0]}
                id={id}
                showMenu={!archived}
                menuKind={mod[0] === "Cover" ? "cover" : "tab"}
                menuVisible={false}
              />
            );
          })}
          {!archived ? (
            <button type="button" className="tab add" tabIndex={-1}>
              +
            </button>
          ) : null}
          <button
            type="button"
            className="tab tab-overflow"
            style={{ ["--c"]: tabC }}
            tabIndex={-1}
          >
            <Icon name="ellipsis" size={16} />
          </button>
        </div>
      </div>
      <div
        id="menu"
        style={{
          display: menuOpen ? "block" : "none",
          left: menuPos?.left ?? 0,
          top: menuPos?.top ?? 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {TYPES.filter((type) => !type.off).map(({ t, title, sub }) => (
          <button
            key={t}
            type="button"
            onClick={() => onAddTab(t, title)}
          >
            <span className="mi" style={{ background: tabC }}>
              <Icon name={t} />
            </span>
            <span className="mt">
              <b>{title}</b>
              <span>{sub}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
