import { askConfirm } from "./confirmDialog.js";

export const BACKUP_FOLDER_HELP_URL =
  "https://github.com/gaborpinterweb/project-binder/wiki/Backup-folder-problems";

/** Failure UI when a chosen backup folder cannot be written. Resolves true if user wants to pick again. */
export function askBackupFolderFailed() {
  return askConfirm({
    title: "Couldn't use that backup folder",
    message:
      "Project Binder couldn't write to the folder you selected. Choose another folder you can write to — a local folder such as Documents usually works.\n\nCloud folders need to be available offline and have free space.",
    confirmLabel: "Choose another folder",
    cancelLabel: "Cancel",
    helpUrl: BACKUP_FOLDER_HELP_URL,
    helpLabel: "Learn why this happens",
  });
}
