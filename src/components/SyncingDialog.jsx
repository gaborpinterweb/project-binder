import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { bindSyncingHost } from "../syncingDialog.js";

export default function SyncingDialog() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    bindSyncingHost(setVisible);
    return () => bindSyncingHost(null);
  }, []);

  if (!visible) return null;

  return createPortal(
    <div className="ov ov-prompt ov-syncing" role="alertdialog" aria-modal="true" aria-labelledby="syncing-title">
      <div className="dlg prompt-dlg syncing-dlg">
        <div className="dlg-content prompt-body syncing-body">
          <span className="workspace-boot-spinner" aria-hidden="true" />
          <h2 id="syncing-title" className="prompt-title">
            Syncing data…
          </h2>
        </div>
      </div>
    </div>,
    document.body
  );
}
