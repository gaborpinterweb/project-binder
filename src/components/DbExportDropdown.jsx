import { useEffect, useRef, useState } from "react";
import { copyDbCsvToClipboard, saveDbCsv } from "../dbExport.js";
import { Icon } from "../icons.jsx";
import { dismissSnackbar, showSnackbar } from "../snackbar.js";

async function paintGenerating() {
  showSnackbar({
    icon: "export",
    message: "Generating…",
    durationMs: 15000,
  });
  // Let the generating snackbar paint before sync CSV work.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** Database Export toolbar button (right-aligned). */
export default function DbExportDropdown({ cols, rows, name, disabled }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const copyCsv = async () => {
    if (disabled) return;
    setOpen(false);
    await paintGenerating();
    try {
      await copyDbCsvToClipboard(cols, rows);
      showSnackbar({
        icon: "check",
        message: "CSV copied to clipboard",
        durationMs: 2500,
      });
    } catch {
      showSnackbar({
        icon: "alert",
        message: "Could not copy to clipboard",
        durationMs: 3000,
      });
    }
  };

  const saveCsv = async () => {
    if (disabled) return;
    setOpen(false);
    await paintGenerating();
    try {
      const result = await saveDbCsv(cols, rows, name, {
        beforePrompt: () => dismissSnackbar(),
      });
      if (result?.cancelled) return;
      showSnackbar({
        icon: "check",
        message: "CSV saved",
        durationMs: 2500,
      });
    } catch {
      showSnackbar({
        icon: "alert",
        message: "Could not save CSV",
        durationMs: 3000,
      });
    }
  };

  return (
    <div className={"export-dd" + (open ? " open" : "")} ref={wrapRef}>
      <button
        type="button"
        className="mod-act export-btn"
        aria-label="Export"
        title="Export"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="export" size={18} />
        <span className="mod-act-lab">Export</span>
      </button>
      {open && !disabled && (
        <div className="pop" role="menu">
          <button type="button" role="menuitem" onClick={copyCsv}>
            <Icon name="copy" size={14} />
            Copy as CSV
          </button>
          <button type="button" role="menuitem" onClick={saveCsv}>
            <Icon name="export" size={14} />
            Save as CSV
          </button>
        </div>
      )}
    </div>
  );
}
