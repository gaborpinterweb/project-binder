# Project Binder

## Quick overview

- Free, open-source (MIT), offline
- Local workspace for freelance projects (macOS / Windows desktop via Electron; also runs in the browser)
- **0.1.0 includes:** task boards, master board, notes, files, databases, timelogs, trash, export / import (desktop), auto backup (desktop)
- **Not in 0.1.0 yet:** Google Calendar, Docs/Links/Chat/etc. tab types, auto-update download

## Description

`server.cjs` serves the React UI and JSON API. Seed data ships in the repo. Packaged Electron persists to the OS user-data folder; CLI/browser (`npm start` / `npm run dev`) keep changes in memory only.

```bash
npm install
npm run build
npm start
# → http://localhost:3457  (CLI / browser; in-memory seed)
```

Packaged Electron listens on **:3456** (OS user-data). CLI / `npm start` / unpackaged Electron use **:3457** so both can run at once without sharing a port or workspace.

Dev (Vite HMR + API on :3457):

```bash
npm start          # API + static on :3457 (build first)
npm run dev        # Vite on :5173, proxies /api → :3457
```

Override either with `PROJECT_BINDER_PORT` (or `PORT`).

## Storage

| Mode | Role |
|------|------|
| **Packaged Electron** (app in Applications / Program Files) | Live data under the OS user-data folder (`Application Support` / `%APPDATA%` / `~/.config`): `userWorkspace.json`, `userArchive.json`, `uploads/`, `appSettings.json`. |
| **CLI / browser** (`npm start`, `npm run dev`, unpackaged Electron) | Boots from [`seedWorkspace.json`](seedWorkspace.json) + [`seedUploads/`](seedUploads); workspace, archive, and uploads stay **in memory** for that process. Never writes OS Application Support. Restart → back to seed. |

| File | Role |
|------|------|
| [`seedWorkspace.json`](seedWorkspace.json) | Read-only seed for a fresh start. The app never writes this file. |
| `userWorkspace.json` | Packaged app only: live workspace (active projects) under OS user data. |
| `userArchive.json` | Packaged app only: archived projects (kept out of the active workspace file). |

Entity identity is UUID `id` (`version: 2`). Legacy slug workspaces must be migrated offline — see [docs/migrate-slugs-to-uids.md](docs/migrate-slugs-to-uids.md).

Packaged app: if `userWorkspace.json` is missing, empty, or corrupt/invalid, the server deep-clones `seedWorkspace.json` into a new file on disk. A detectable legacy slug workspace is **not** overwritten (process exits; migrate first).

Restore the demo (dev / CLI): Settings → Developer → **Reset to seed workspace**, or restart the server (memory mode always reseeds on boot).

## Demo data (`isDemo`)

The seed is sample freelancer work. Every **project**, **task board**, and **task card** in `seedWorkspace.json` is marked:

```json
"isDemo": true
```

- Not shown in the UI.
- Exposed on the API (`project.isDemo`, `board.isDemo`, `card.isDemo`) so a future “Remove demo data” control can delete only flagged items and leave user-created work alone.
- User-created projects / boards / cards omit `isDemo`. Writes preserve an existing `isDemo: true` when editing demo entities so saves don’t strip the flag.

### Planned UX (not implemented yet)

New users start from this demo state. A button should:

1. Delete all projects with `isDemo: true` (and their boards/cards), **or** delete only boards/cards flagged `isDemo` inside mixed projects if that model is preferred later.
2. Leave anything without `isDemo` untouched.

Until that exists, restore via Settings → Developer → **Reset to seed workspace** (dev builds only), or by deleting `userWorkspace.json` (see above).

## Seed snapshot (revert target)

Master board stages:

`Backlog, This week, Today, Tomorrow, Next week`

Entities use UUID `id` (see `seedWorkspace.json`). Display names below:

| Project | Color | Tab | Tab columns |
|---|---|---|---|
| Freelancing | `#2f7a6e` | Ops | Admin, Marketing, Finance |
| Client project A | `#b45a3c` | Delivery | Design, Frontend, Content |
| Client project B | `#6b4f8c` | Launch | Design, Development, Content |

### Freelancing — Ops

| Title | Task board column | Master board column | Done |
|---|---|---|---|
| Update invoice template | Finance | Today | |
| Quarterly tax checklist | Finance | This week | |
| LinkedIn post cadence | Marketing | Today | |
| Portfolio site refresh | Marketing | Next week | |
| CRM cleanup | Admin | Backlog | |
| Client contract template | Admin | This week | yes |

### Client project A — Delivery

| Title | Task board column | Master board column | Done |
|---|---|---|---|
| Homepage wireframes | Design | Today | |
| Type & color system | Design | This week | |
| Services page draft | Content | Today | |
| Frontend component kit | Frontend | Next week | |
| Case study template | Content | This week | yes |
| Accessibility pass | Frontend | Backlog | |

### Client project B — Launch

| Title | Task board column | Master board column | Done |
|---|---|---|---|
| Landing hero copy | Content | Today | |
| Waitlist signup flow | Development | Today | |
| Pricing section | Development | Backlog | yes |
| Press kit PDF | Content | This week | yes |
| Launch day checklist | Development | This week | |
| Onboarding email sequence | Content | Next week | |

Each project also has matching Notes, Files, and Database demo tabs. Descriptions live in each project’s `description` field in the JSON.

### Notes

- Database tabs are available in the UI (`Database` tab type).
- New task boards default to columns `Design, Frontend dev, Backend dev, Content` until customized.

## Release assets

Desktop update downloads match GitHub Release assets by filename:

```text
Project-Binder-<version>-<os>-<arch>.zip
```

Examples: `Project-Binder-0.1.0-mac-arm64.zip`, `Project-Binder-0.2.0-win-x64.zip`.

`<os>` is `mac` | `win` | `linux`; `<arch>` is `arm64` | `x64`. Tag releases as `v<version>`. Keep this naming stable — the in-app updater picks the asset for the running platform/arch and otherwise opens the release page.

### macOS download (unsigned build)

Builds are not signed or notarized yet, so macOS may say **Project Binder** is damaged and cannot be opened. The download is fine — unblock it once:

1. Unzip the download and open the folder so you see **Project Binder**.
2. Open **Terminal** (Spotlight → type `Terminal` → Enter).
3. Type this exactly, including the space at the end (don’t press Enter yet):

   ```text
   xattr -cr 
   ```

4. Drag **Project Binder** from the Finder window into the Terminal window. The path appears automatically.
5. Press **Enter**.
6. Double-click **Project Binder** again.

Optional: move it into **Applications** first, then drag that copy into Terminal in step 4.

## Should polish (pre-/post-publish)

Tracked polish items — not blockers for a honest 0.1.0, but worth doing soon:

- **Releases:** add Windows (and Intel Mac) zips using the naming above; optional CI for `build:desktop`
- **Version sync:** one source of truth for version (`package.json` ↔ `APP_VERSION` in `src/utils.js` ↔ server log string)
- **Desktop networking:** bind the API to `127.0.0.1` by default (don’t listen on all interfaces)
- **Electron UX:** clearer load/error copy for packaged app users (avoid `npm start` / localhost-only messaging)
- **Onboarding visuals:** real screenshots or product images in the launch flow (placeholders removed)
- **Error UX:** replace widespread `alert()` with in-app confirm/prompt dialogs where it matters
- **Demo cleanup:** “Remove demo data” button that deletes `isDemo: true` entities only (see Demo data above)
- **Auto-update:** direct asset download when the platform matches is enough for MVP; full `electron-updater` + signing/notarization is later
