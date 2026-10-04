import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Icon, IC } from "../icons.jsx";
import { APP_NAME, TYPES } from "../utils.js";

const SUPPORT_URL =
  "https://github.com/gaborpinterweb/freelance-workbook/issues";

function findTabEl(tabsEl, slug) {
  if (!tabsEl || !slug) return null;
  return [...tabsEl.querySelectorAll(":scope > .tab")].find(
    (el) => el.dataset.tabSlug === slug
  );
}

/** FLIP-animate two tabs after applyOrder reorders the DOM. */
function flipSwapTabs(tabsEl, leftSlug, rightSlug, applyOrder) {
  const leftEl = findTabEl(tabsEl, leftSlug);
  const rightEl = findTabEl(tabsEl, rightSlug);
  if (!leftEl || !rightEl) {
    applyOrder();
    return;
  }

  const firstLeft = leftEl.getBoundingClientRect();
  const firstRight = rightEl.getBoundingClientRect();

  flushSync(() => {
    applyOrder();
  });

  const leftAfter = findTabEl(tabsEl, leftSlug);
  const rightAfter = findTabEl(tabsEl, rightSlug);
  if (!leftAfter || !rightAfter) return;

  const lastLeft = leftAfter.getBoundingClientRect();
  const lastRight = rightAfter.getBoundingClientRect();
  const dxLeft = firstLeft.left - lastLeft.left;
  const dxRight = firstRight.left - lastRight.left;
  if (dxLeft === 0 && dxRight === 0) return;

  leftAfter.classList.add("tab-swapping");
  rightAfter.classList.add("tab-swapping");
  leftAfter.style.transition = "none";
  rightAfter.style.transition = "none";
  leftAfter.style.transform = `translateX(${dxLeft}px)`;
  rightAfter.style.transform = `translateX(${dxRight}px)`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      leftAfter.style.transition = "";
      rightAfter.style.transition = "";
      leftAfter.style.transform = "";
      rightAfter.style.transform = "";
      const cleanup = () => {
        leftAfter.classList.remove("tab-swapping");
        rightAfter.classList.remove("tab-swapping");
      };
      leftAfter.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, 380);
    });
  });
}

function SupportDialog({ onClose }) {
  const ctaRef = useRef(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => ctaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ov ov-prompt"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dlg prompt-dlg support-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        aria-describedby="support-msg"
      >
        <div className="dlg-content prompt-body">
          <h2 id="support-title" className="prompt-title">
            Need help?
          </h2>
          <p id="support-msg" className="prompt-msg">
            Get support for {APP_NAME}, report a bug, or share a feature idea on
            GitHub.
          </p>
          <div className="actions prompt-actions">
            <button type="button" className="dlg-delete" onClick={onClose}>
              Close
            </button>
            <a
              ref={ctaRef}
              className="dlg-create support-cta"
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabMoreMenu({
  canLeft,
  canRight,
  onMoveLeft,
  onMoveRight,
  onRename,
  onDelete,
}) {
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
    <div className={"tab-more" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="tab-more-btn"
        title="Tab options"
        aria-label="Tab options"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" size={14} />
      </button>
      {open && pos && (
        <div
          className="pop"
          role="menu"
          style={{ top: pos.top, right: pos.right, left: "auto" }}
        >
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
        </div>
      )}
    </div>
  );
}

function TabBtn({
  label,
  c,
  on,
  type,
  slug,
  onClick,
  disabled,
  showMenu,
  canLeft,
  canRight,
  onMoveLeft,
  onMoveRight,
  onRename,
  onDelete,
}) {
  const className =
    "tab" + (on ? " on" : "") + (disabled ? " locked" : "");

  const body = (
    <>
      {type && IC[type] ? (
        <span>
          <Icon name={type} />
        </span>
      ) : null}
      <span className="tab-label">{label}</span>
      {showMenu ? (
        <TabMoreMenu
          canLeft={canLeft}
          canRight={canRight}
          onMoveLeft={onMoveLeft}
          onMoveRight={onMoveRight}
          onRename={onRename}
          onDelete={onDelete}
        />
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
        data-tab-slug={slug}
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
      data-tab-slug={slug}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick}
    >
      {body}
    </button>
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
  menuOpen,
  menuPos,
  onSelectTab,
  onOpenAddMenu,
  onAddTab,
  onMoveTab,
  onRenameTab,
  onDeleteTab,
}) {
  const tabsRef = useRef(null);
  const swappingRef = useRef(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const moveAnimated = (index, dir) => {
    if (swappingRef.current || archived || boardEdit) return;
    const j = index + dir;
    if (index < 1 || j < 1 || j >= mods.length) return;
    const leftSlug = dir > 0 ? mods[index][2]?.slug : mods[j][2]?.slug;
    const rightSlug = dir > 0 ? mods[j][2]?.slug : mods[index][2]?.slug;
    if (!leftSlug || !rightSlug) return;
    swappingRef.current = true;
    flipSwapTabs(tabsRef.current, leftSlug, rightSlug, () => {
      onMoveTab?.(index, dir);
    });
    window.setTimeout(() => {
      swappingRef.current = false;
    }, 320);
  };

  if (draftProject) {
    const c = draftProject.color || tabC;
    return (
      <div id="bar" style={{ ["--tab"]: c }}>
        <div id="tabs">
          <TabBtn label="Cover" c={c} on type="Cover" slug="cover" />
        </div>
      </div>
    );
  }

  if (!folder) return <div id="bar" style={{ display: "none" }} />;

  return (
    <>
      <div
        id="bar"
        className={boardEdit ? "board-editing" : undefined}
        style={{ ["--tab"]: tabC }}
      >
        <div id="tabs" ref={tabsRef}>
          {mods.map((mod, i) => {
            const active = i === m;
            const locked = boardEdit && !active;
            const slug = mod[2]?.slug || mod[1] + i;
            return (
              <TabBtn
                key={slug}
                label={mod[1]}
                c={tabC}
                on={active}
                type={mod[0]}
                slug={slug}
                disabled={locked}
                showMenu={active && mod[0] !== "Cover" && !archived}
                canLeft={i > 1}
                canRight={i < mods.length - 1}
                onClick={() => {
                  if (locked) return;
                  onSelectTab(i);
                }}
                onMoveLeft={() => moveAnimated(i, -1)}
                onMoveRight={() => moveAnimated(i, 1)}
                onRename={() => onRenameTab?.(i)}
                onDelete={() => onDeleteTab?.(i)}
              />
            );
          })}
          {!archived && (
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
          )}
        </div>
        <div className="actions">
          <button
            type="button"
            id="support"
            title="Support"
            aria-label="Support"
            onClick={() => setSupportOpen(true)}
          >
            <Icon name="Support" size={18} />
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
      {supportOpen ? (
        <SupportDialog onClose={() => setSupportOpen(false)} />
      ) : null}
    </>
  );
}
