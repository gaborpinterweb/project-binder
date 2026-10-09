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
# → http://localhost:3456
```

Dev (Vite HMR + API on :3456):

```bash
npm start          # API + static (build first)
npm run dev        # Vite on :5173, proxies /api → :3456
```

## Storage

| Mode | Role |
|------|------|
| **Packaged Electron** (app in Applications / Program Files) | Live data under the OS user-data folder (`Application Support` / `%APPDATA%` / `~/.config`): `userWorkspace.json`, `uploads/`, `appSettings.json`. |
| **CLI / browser** (`npm start`, `npm run dev`, unpackaged Electron) | Boots from [`seedWorkspace.json`](seedWorkspace.json) + [`seedUploads/`](seedUploads); workspace and uploads stay **in memory** for that process. Never writes OS Application Support. Restart → back to seed. |

| File | Role |
|------|------|
| [`seedWorkspace.json`](seedWorkspace.json) | Read-only seed for a fresh start. The app never writes this file. |
| `userWorkspace.json` | Packaged app only: live workspace under OS user data. |

Packaged app: if `userWorkspace.json` is missing, empty, or corrupt/invalid, the server deep-clones `seedWorkspace.json` into a new file on disk.

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

| Project slug | Name | Color | Tab (slug) | Tab columns |
|---|---|---|---|---|
| `internal-business` | Internal business | `#2f7a6e` | Ops (`ops`) | Admin, Marketing, Finance |
| `client-project-a` | Client project A | `#b45a3c` | Delivery (`delivery`) | Design, Frontend, Content |
| `client-project-b` | Client project B | `#6b4f8c` | Launch (`launch`) | Design, Development, Content |

### Internal business — Ops

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `invoice-template` | Update invoice template | Finance | Today | |
| `quarterly-taxes` | Quarterly tax checklist | Finance | This week | |
| `linkedin-cadence` | LinkedIn post cadence | Marketing | Today | |
| `portfolio-site` | Portfolio site refresh | Marketing | Next week | |
| `crm-cleanup` | CRM cleanup | Admin | Backlog | |
| `contract-template` | Client contract template | Admin | This week | yes |

### Client project A — Delivery

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `homepage-wireframes` | Homepage wireframes | Design | Today | |
| `design-system` | Type & color system | Design | This week | |
| `services-page` | Services page draft | Content | Today | |
| `component-library` | Frontend component kit | Frontend | Next week | |
| `case-study-template` | Case study template | Content | This week | yes |
| `accessibility-pass` | Accessibility pass | Frontend | Backlog | |

### Client project B — Launch

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `landing-hero` | Landing hero copy | Content | Today | |
| `waitlist-flow` | Waitlist signup flow | Development | Today | |
| `pricing-section` | Pricing section | Development | Backlog | yes |
| `press-kit` | Press kit PDF | Content | This week | yes |
| `launch-checklist` | Launch day checklist | Development | This week | |
| `onboarding-email` | Onboarding email sequence | Content | Next week | |

Each project also has matching Notes, Files, and Database demo tabs. Descriptions live in each project’s `description` field in the JSON.

### Notes

- Database tabs are available in the UI (`Database` tab type).
- New task boards default to columns `Design, Frontend dev, Backend dev, Content` until customized.

## Should polish (pre-/post-publish)

Tracked polish items — not blockers for a honest 0.1.0, but worth doing soon:

- **Releases:** publish GitHub Release artifacts for macOS and Windows (or soft-claim “mac first” until both exist); optional CI for `build:desktop`
- **Version sync:** one source of truth for version (`package.json` ↔ `APP_VERSION` in `src/utils.js` ↔ server log string)
- **Desktop networking:** bind the API to `127.0.0.1` by default (don’t listen on all interfaces)
- **Electron UX:** clearer load/error copy for packaged app users (avoid `npm start` / localhost-only messaging)
- **Onboarding visuals:** real screenshots or product images in the launch flow (placeholders removed)
- **Error UX:** replace widespread `alert()` with in-app confirm/prompt dialogs where it matters
- **Demo cleanup:** “Remove demo data” button that deletes `isDemo: true` entities only (see Demo data above)
- **Auto-update:** current flow (check GitHub Releases → sidebar “Update available” → open releases page) is enough for MVP; full `electron-updater` + signing/notarization is later
