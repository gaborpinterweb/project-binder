import { askConfirm } from "../confirmDialog.js";
import { getPb, isPbMode } from "../pb/client.js";

export default function MobileSettingsDialog({ onClose }) {
  const handleSignOut = async () => {
    const ok = await askConfirm({
      title: "Sign out?",
      message: "You will need to sign in again to open this workspace.",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    getPb().authStore.clear();
    window.location.reload();
  };

  return (
    <div
      className="ov"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dlg mobile-settings-dlg"
        role="dialog"
        aria-label="Settings"
      >
        <div className="mobile-settings-head">
          <b>Settings</b>
          <button type="button" className="settings-row-btn" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="mobile-settings-body">
          {isPbMode() ? (
            <div className="settings-row">
              <div className="settings-row-copy">
                <b>Sign out</b>
                <span>
                  {getPb().authStore.record?.email || "End this session"}
                </span>
              </div>
              <button
                type="button"
                className="settings-row-btn"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </div>
          ) : (
            <p className="mobile-settings-empty">No settings yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
