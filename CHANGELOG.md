# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Minor lines use a tree codename from `package.json` `releaseName` (shown in section headings).

## [Unreleased]

## [1.0.5] - 2026-11-03 (Pine)

### Added

- Mobile Project Tasks tab: open from the nav sheet with the same compact board chrome as Master board (View menu and Add-task FAB).

### Fixed

- Notes on mobile: scrolling and truncated title in the editor drawer.

### Changed

- Record dialog stacks vertically on mobile.
- Dialog action buttons stay sticky on mobile.

## [1.0.4] - 2026-11-02 (Pine)

### Added

- Mobile Notes tab: open from the nav sheet, pinned-first list, and read/edit drawer with lock/unlock.
- Floating TipTap toolbar on phone (slides with lock state) and FAB to add a note.

### Changed

- Mobile Notes list uses flat native-style rows instead of cards.

## [1.0.3] - 2026-11-01 (Pine)

### Added

- Mobile database tab: open records from the nav sheet, card list preview, and FAB to create a record.

## [1.0.2] - 2026-10-30 (Pine)

### Fixed

- Images in task descriptions and notes (including locked note preview).
- Board view is preserved after moving a task to another tab.

### Changed

- PWA theme color darkened to match the sidebar chrome.
- Friendlier email confirmation message.

## [1.0.1] - 2026-10-29 (Pine)

### Added

- Download action for files in the Files module and file preview dialog.
- Paywall gate that blocks importing a workspace incompatible with the current plan limits.

### Changed

- Timelogs UI polish and empty state for the project list.
- Project cover preview updates correctly when switching projects.
- Demo seed: Files tab with sample text files; task tab names renamed.

## [1.0.0] - 2026-10-29 (Pine)

### Added

- First public release of Project Binder on PocketBase (auth, per-user workspace, attachments).
- Community and Commercial builds; Commercial Free/Pro via Polar checkout, webhooks, and `/confirm-pro`.
- Workspace modules: boards (including Master board), notes, files, databases, tasks, timelogs/timers, trash, and archive.
- Export/import, public read-only sharing, Settings (including Billing deep links), onboarding, and web manifest.
- Commercial paywall for active-project, storage, and public-share limits.
- Gated Fly releases (`version.json`, `npm run release`) and Playwright e2e coverage for auth, projects, tasks, timelogs, sharing, and billing.
