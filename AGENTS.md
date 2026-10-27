# Agent notes — Project Binder

Short orientation for coding agents. Human run/dev/storage docs: [README.md](README.md). PocketBase roadmap: [docs/pocketbase-master-plan.md](docs/pocketbase-master-plan.md).

## Stack

- **UI**: React 19 + Vite (`src/`), ESM
- **Product backend**: PocketBase (auth + `user_data` JSON files + `attachments`); run via `npm start` / `npm run pb`
- **Legacy Node API**: `npm run start:node` (`server.cjs`) — transitional only for Vite HMR against `:3457`
- **Desktop**: removed (no Electron)

## Entry points

| Path | Role |
|------|------|
| `src/main.jsx` → `src/Root.jsx` → `src/App.jsx` | Auth gate (PB) + app shell |
| `src/api.js` | Routes to PocketBase engine (`src/engine/*`) or Node `/api` |
| `src/engine/workspaceEngine.js` | In-browser workspace mutations (from server logic) |
| `src/pb/*` | PocketBase client + file persist |
| `pocketbase/pb_migrations/` | Committed PB schema |
| `server.cjs` | Legacy Node HTTP API (`start:node`) |
| `seedWorkspace.json` / `public/seedWorkspace.json` | Seed / demo |

## Client model

- Projects are folders in App state (`folders`).
- Each project has `mods`: tuples **`[type, name, data]`** where `type` is `Board` | `Notes` | `Files` | `Database` | …
- Navigation: `p` (project index), `m` (tab/mod index), `g` (global view).
- **Mutations (PB)**: engine mutates in-memory store → debounced upload of `userWorkspace` / `userArchive` files.
- **Mutations (Node)**: call `/api` → `applyWorkspace`.

## Agent defaults

Unless the user asks otherwise:

- Do **not** drive the browser for visual QA
- Do **not** commit, push, or amend
- Prefer `npm run build` to verify edits
