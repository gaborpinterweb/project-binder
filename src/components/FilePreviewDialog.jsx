import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";
import { fileDownloadUrl, revealFile } from "../api.js";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

const FORMAT_BY_EXT = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
  csv: "csv",
  tsv: "csv",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  rtf: "rtf",
  odt: "odt",
  ods: "ods",
  odp: "odp",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
};

const VIEWER_LABELS = {
  "符合寬度": "Fit width",
  "原始大小": "Actual size",
  "符合視窗": "Fit window",
  "‹ 上一張": "‹ Prev",
  "下一張 ›": "Next ›",
};

function formatFromName(name) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  return FORMAT_BY_EXT[ext] || undefined;
}

function fitsContent(format) {
  return format === "image" || format === "pptx";
}

function showInFolderLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/mac/i.test(platform)) return "Show in Finder";
  if (/win/i.test(platform)) return "Show in File Explorer";
  return "Show in folder";
}

function pagerMeta(viewer) {
  if (!viewer) return null;
  if (typeof viewer.next === "function" && typeof viewer.prev === "function") {
    const count = Number(viewer.slideCount) || Number(viewer.pageCount) || 0;
    if (count < 2) return null;
    return {
      kind: "slides",
      count,
      index: Number(viewer.slideIndex) || 0,
    };
  }
  const count = Number(viewer.pageCount) || 0;
  if (count > 1 && Array.isArray(viewer.pageEls) && viewer.pageEls.length) {
    return { kind: "pages", count, index: 0 };
  }
  return null;
}

function hideNativeSlideBar(host, viewer) {
  if (typeof viewer.next !== "function") return;
  const bar = host.firstElementChild;
  if (bar && bar.querySelector("button")) bar.style.display = "none";
}

function localizeViewerUi(host) {
  if (!host) return;
  for (const btn of host.querySelectorAll("button")) {
    const key = String(btn.textContent || "").trim();
    if (VIEWER_LABELS[key]) btn.textContent = VIEWER_LABELS[key];
  }
}

function maxDialogBox() {
  const pad = 32;
  return {
    maxW: Math.min(window.innerWidth * 0.8, window.innerWidth - pad),
    maxH: Math.min(window.innerHeight * 0.8, window.innerHeight - pad),
  };
}

function sizeDialogToContent(dlg, host, format, viewer) {
  if (!dlg || !host) return;
  const { maxW, maxH } = maxDialogBox();
  const chromeH = dlg.querySelector(".file-preview-bar")?.offsetHeight || 48;

  if (format === "image") {
    const img = host.querySelector("img");
    const scroll = img?.parentElement;
    if (!img?.naturalWidth || !img.naturalHeight || !scroll) return;
    const ar = img.naturalWidth / img.naturalHeight;
    let contentW = maxW;
    let contentH = contentW / ar;
    if (contentH + chromeH > maxH) {
      contentH = Math.max(80, maxH - chromeH);
      contentW = contentH * ar;
    }
    const viewerBar = host.firstElementChild;
    const viewerBarH =
      viewerBar && viewerBar !== scroll
        ? viewerBar.getBoundingClientRect().height + 8
        : 0;
    const stageH = Math.round(contentH);
    const totalH = Math.round(chromeH + viewerBarH + stageH);
    dlg.style.width = `${Math.round(contentW)}px`;
    dlg.style.height = `${totalH}px`;
    scroll.style.height = `${stageH}px`;
    scroll.style.flex = "none";
    viewer?.fitWidth?.();
    return;
  }

  if (format === "pptx") {
    const canvas = host.querySelector("canvas");
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    dlg.style.width = `${Math.round(maxW)}px`;
    dlg.style.height = `${Math.round(maxH)}px`;
    // ResizeObserver reflows the slide after width changes; wait two frames.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const slideH = canvas.offsetHeight || 0;
        if (!slideH) return;
        const stageStyles = getComputedStyle(stage);
        const stagePad =
          (parseFloat(stageStyles.paddingTop) || 0) +
          (parseFloat(stageStyles.paddingBottom) || 0);
        const stageH = Math.round(slideH + stagePad);
        dlg.style.height = `${Math.round(chromeH + stageH)}px`;
        stage.style.height = `${stageH}px`;
        stage.style.boxSizing = "border-box";
      });
    });
  }
}

function waitForImage(host) {
  const img = host.querySelector("img");
  if (!img) return Promise.resolve();
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

export default function FilePreviewDialog({
  file,
  project,
  filesTab,
  onClose,
}) {
  const hostRef = useRef(null);
  const dlgRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [paged, setPaged] = useState(false);
  const url = fileDownloadUrl(project, filesTab, file.slug);
  const format = formatFromName(file.name);
  const fit = fitsContent(format);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const dlg = dlgRef.current;
    setStatus("loading");
    setError("");
    setPaged(false);
    setPage(0);
    setPageCount(0);
    if (dlg) {
      dlg.style.width = "";
      dlg.style.height = "";
    }

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load file");
        const blob = await res.blob();
        if (cancelled || !host) return;
        const { mount } = await import("shrimp-doc-viewer");
        const viewer = await mount(host, blob, {
          height: "100%",
          format,
          pdfiumWasmUrl,
        });
        viewerRef.current = viewer;
        if (cancelled) {
          viewer.destroy();
          viewerRef.current = null;
          return;
        }
        localizeViewerUi(host);
        hideNativeSlideBar(host, viewer);
        const pager = pagerMeta(viewer);
        if (pager) {
          setPaged(true);
          setPage(pager.index);
          setPageCount(pager.count);
        }
        if (format === "image") await waitForImage(host);
        if (cancelled) return;
        setStatus("ready");
        requestAnimationFrame(() => {
          if (cancelled) return;
          viewer.fitWidth?.();
          if (fit) sizeDialogToContent(dlg, host, format, viewer);
          localizeViewerUi(host);
        });
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err.message || "Could not preview this file");
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (host) host.replaceChildren();
    };
  }, [url, file.name, format, fit]);

  const goTo = (nextIndex) => {
    const viewer = viewerRef.current;
    if (!viewer || !paged) return;
    const i = Math.max(0, Math.min(pageCount - 1, nextIndex));
    if (typeof viewer.goTo === "function") viewer.goTo(i);
    else viewer.pageEls?.[i]?.scrollIntoView({ block: "nearest" });
    setPage(typeof viewer.slideIndex === "number" ? viewer.slideIndex : i);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!paged) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(page - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(page + 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, paged, page, pageCount]);

  const showInFolder = async () => {
    try {
      await revealFile({ project, filesTab, file: file.slug });
    } catch (err) {
      window.alert(err.message || "Could not show the file");
    }
  };

  return (
    <div
      className="ov ov-file-preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dlgRef}
        className={
          "dlg file-preview-dlg" + (fit ? " is-fit" : " is-viewport")
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        <div className="file-preview-bar">
          <button
            type="button"
            className="file-preview-icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
          <h2 id="file-preview-title" className="file-preview-title" title={file.name}>
            {file.name}
          </h2>
          {paged ? (
            <div className="file-preview-pager">
              <button
                type="button"
                className="file-preview-icon"
                aria-label="Previous page"
                disabled={page <= 0}
                onClick={() => goTo(page - 1)}
              >
                <Icon name="arrowLeft" size={16} />
              </button>
              <span>
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="file-preview-icon"
                aria-label="Next page"
                disabled={page >= pageCount - 1}
                onClick={() => goTo(page + 1)}
              >
                <Icon name="arrowRight" size={16} />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="file-preview-finder"
            onClick={showInFolder}
          >
            {showInFolderLabel()}
          </button>
        </div>
        <div className="file-preview-stage">
          {status === "loading" ? (
            <div className="file-preview-msg">Loading preview…</div>
          ) : null}
          {status === "error" ? (
            <div className="file-preview-msg">{error}</div>
          ) : null}
          <div
            ref={hostRef}
            className={
              "file-preview-host" + (status === "ready" ? "" : " is-pending")
            }
          />
        </div>
      </div>
    </div>
  );
}
