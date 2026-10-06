import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons.jsx";
import { fileDownloadUrl, revealFile } from "../api.js";
import FileTypeIcon from "./FileTypeIcon.jsx";
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

const PREVIEW_PAD = 12;
const STAGE_BG = "#15171c";
const TOOLBAR_LINE = "#2e333d";

function formatFromName(name) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  return FORMAT_BY_EXT[ext] || undefined;
}

function fitsContent(format) {
  return format === "image" || format === "pptx" || format === "pdf" || format === "docx";
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

function viewerToolbar(host, format) {
  if (format === "pptx") return null;
  const el = host.firstElementChild;
  if (!el || !el.querySelector?.("button")) return null;
  if (el.style.display === "none") return null;
  return el;
}

function viewerStage(host) {
  const kids = [...host.children];
  return kids.length > 1 ? kids[1] : kids[0];
}

function restyleViewer(host, format) {
  const bar = host.firstElementChild;
  const stage = viewerStage(host);
  if (bar && bar !== stage && format !== "pptx") {
    bar.style.margin = "0";
    bar.style.padding = "8px 12px";
    bar.style.boxSizing = "border-box";
    bar.style.flex = "none";
    bar.style.borderBottom = `1px solid ${TOOLBAR_LINE}`;
    bar.style.background = STAGE_BG;
  }
  if (!stage) return stage;
  stage.style.margin = "0";
  stage.style.border = "none";
  stage.style.borderRadius = "0";
  stage.style.boxSizing = "border-box";
  stage.style.padding = `${PREVIEW_PAD}px`;
  stage.style.background = STAGE_BG;
  stage.style.overflow = "auto";
  stage.style.minHeight = "0";
  stage.style.scrollPadding = `${PREVIEW_PAD}px`;
  for (const page of stage.querySelectorAll("[data-page], .dv-page")) {
    page.style.margin = `0 auto ${PREVIEW_PAD}px`;
    page.style.boxShadow = "none";
  }
  const last = stage.querySelector("[data-page]:last-child, .dv-page:last-child");
  if (last) last.style.marginBottom = "0";
  const canvas = stage.querySelector("canvas");
  if (canvas) {
    canvas.style.boxShadow = "none";
    canvas.style.margin = "0 auto";
    canvas.style.display = "block";
  }
  if (format === "image") {
    stage.style.display = "flex";
    stage.style.alignItems = "center";
    stage.style.justifyContent = "center";
  }
  return stage;
}

function intrinsicSize(host, format, viewer) {
  if (format === "image") {
    const img = host.querySelector("img");
    if (img?.naturalWidth && img.naturalHeight) {
      return { w: img.naturalWidth, h: img.naturalHeight };
    }
  }
  if (format === "pptx" && viewer.slideW && viewer.slideH) {
    return { w: viewer.slideW, h: viewer.slideH };
  }
  if (format === "docx" && viewer.pw && viewer.ph) {
    return { w: viewer.pw, h: viewer.ph };
  }
  const page = viewer.pageEls?.[0];
  if (page) {
    const w = page.offsetWidth || parseFloat(page.style.width) || 0;
    const h = page.offsetHeight || parseFloat(page.style.height) || 0;
    if (w && h) return { w, h };
  }
  const canvas = host.querySelector("canvas");
  if (canvas?.offsetWidth && canvas.offsetHeight) {
    return { w: canvas.offsetWidth, h: canvas.offsetHeight };
  }
  return null;
}

function maxDialogBox() {
  const gutter = 32;
  return {
    maxW: Math.min(window.innerWidth * 0.8, window.innerWidth - gutter),
    maxH: Math.min(window.innerHeight * 0.8, window.innerHeight - gutter),
  };
}

function applyFit(viewer, host, format) {
  const stage = viewerStage(host);
  if (!stage || !viewer) return;
  const inner = Math.max(1, stage.clientWidth - PREVIEW_PAD * 2);
  if (format === "image" && viewer.natW) {
    viewer.setZoom(inner / viewer.natW);
    return;
  }
  if (format === "docx" && viewer.pw) {
    viewer.setZoom(inner / viewer.pw);
    return;
  }
  viewer.fitWidth?.();
}

function sizeDialogToContent(dlg, host, format, viewer) {
  if (!dlg || !host) return;
  const stage = restyleViewer(host, format);
  if (!stage) return;
  const size = intrinsicSize(host, format, viewer);
  if (!size) return;
  const { maxW, maxH } = maxDialogBox();
  const titleH = dlg.querySelector(".file-preview-bar")?.offsetHeight || 48;
  const toolbar = viewerToolbar(host, format);
  const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 0;
  const chromeH = titleH + toolbarH;
  const pad = PREVIEW_PAD * 2;
  const maxInnerW = Math.max(80, maxW - pad);
  const maxInnerH = Math.max(80, maxH - chromeH - pad);
  const ar = size.w / size.h;
  let innerW = maxInnerW;
  let innerH = innerW / ar;
  if (innerH > maxInnerH) {
    innerH = maxInnerH;
    innerW = innerH * ar;
  }
  dlg.style.width = `${Math.round(innerW + pad)}px`;
  dlg.style.height = `${Math.round(chromeH + innerH + pad)}px`;
  stage.style.flex = "none";
  stage.style.height = `${Math.round(innerH + pad)}px`;
  applyFit(viewer, host, format);
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
        restyleViewer(host, format);
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
          localizeViewerUi(host);
          if (fit) {
            sizeDialogToContent(dlg, host, format, viewer);
            requestAnimationFrame(() => {
              if (cancelled) return;
              sizeDialogToContent(dlg, host, format, viewer);
            });
          } else {
            applyFit(viewer, host, format);
          }
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
    else viewer.pageEls?.[i]?.scrollIntoView({ block: "start" });
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
          <FileTypeIcon name={file.name} mime={file.mime} size={18} />
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
