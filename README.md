# Project Binder

## Quick overview

- Free, open-source (MIT)
- Web workspace for freelance projects (local Node API today; PocketBase UI host in progress)
- **0.1.0 includes:** task boards, master board, notes, files, databases, timelogs, trash, export
- **Roadmap:** thin PocketBase auth + JSON file storage, self-host, paid cloud — see [docs/pocketbase-master-plan.md](docs/pocketbase-master-plan.md)
- Electron desktop has been removed

## Description

**App data / API (transitional):** `server.cjs` serves the React UI and JSON API. Seed data ships in the repo. `npm start` / `npm run dev` keep workspace changes **in memory** for that process (restart → back to seed). Optional on-disk store: set `PROJECT_BINDER_USER_DATA` to a directory.

```bash
npm install
npm run build
npm start
# → http://localhost:3457  (in-memory seed)
```

Dev (Vite HMR + API on :3457):

```bash
npm start          # API + static on :3457 (build first)
npm run dev        # Vite on :5173, proxies /api → :3457
```

Override the API port with `PROJECT_BINDER_PORT` (or `PORT`).

**PocketBase (UI host):** fetches a PocketBase binary, builds the UI into `pocketbase/pb_public`, and serves it:

```bash
npm run pb
# → http://127.0.0.1:8090
```

`npm run pb` alone serves the SPA. Workspace `/api` still needs `npm start` on `:3457` until auth + file storage are wired to PocketBase. Fetch only: `npm run pb:fetch`.

## Storage

| Mode | Role |
|------|------|
| **Default** (`npm start` / `npm run dev`) | Boots from [`seedWorkspace.json`](seedWorkspace.json) + [`seedUploads/`](seedUploads); workspace, archive, and uploads stay **in memory**. Restart → back to seed. |
| **`PROJECT_BINDER_USER_DATA`** | On-disk `userWorkspace.json`, `userArchive.json`, `uploads/`, `appSettings.json` under that directory. |

| File | Role |
|------|------|
| [`seedWorkspace.json`](seedWorkspace.json) | Read-only seed for a fresh start. The app never writes this file. |
| `userWorkspace.json` | Live workspace when using on-disk user data. |
| `userArchive.json` | Archived projects (kept out of the active workspace file). |

Entity identity is UUID `id` (`version: 2`). Legacy slug workspaces must be migrated offline — see [docs/migrate-slugs-to-uids.md](docs/migrate-slugs-to-uids.md).

On-disk mode: if `userWorkspace.json` is missing, empty, or corrupt/invalid, the server deep-clones `seedWorkspace.json` into a new file. A detectable legacy slug workspace is **not** overwritten (process exits; migrate first).

Restore the demo: Settings → Developer → **Reset to seed workspace**, or restart the server (memory mode always reseeds on boot).

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

## Releases

Tag releases as `v<version>` (e.g. `v0.1.0`). The in-app update check opens the GitHub Releases page when a newer semver is available.

## Should polish (pre-/post-publish)

- **Version sync:** one source of truth for version (`package.json` ↔ `APP_VERSION` in `src/utils.js` ↔ server log string)
- **Onboarding visuals:** real screenshots or product images in the launch flow
- **Error UX:** replace widespread `alert()` with in-app confirm/prompt dialogs where it matters
- **Demo cleanup:** “Remove demo data” button that deletes `isDemo: true` entities only (see Demo data above)
- **PocketBase spike:** auth + `userWorkspace` / `userArchive` file fields (see master plan)
