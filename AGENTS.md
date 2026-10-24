# Agent notes — Project Binder

Short orientation for coding agents. Human run/dev/storage docs: [README.md](README.md). PocketBase roadmap: [docs/pocketbase-master-plan.md](docs/pocketbase-master-plan.md).

## Stack

- **UI**: React 19 + Vite (`src/`), ESM
- **API / persistence (transitional)**: Node `server.cjs` (CJS), JSON workspace files (in-memory by default)
- **UI host (in progress)**: PocketBase binary via `npm run pb` (`pocketbase/pb_public`)
- **Desktop**: removed (no Electron)

## Entry points

| Path | Role |
|------|------|
| `src/main.jsx` → `src/App.jsx` | App shell, workspace state, navigation |
| `src/api.js` | All browser → `/api/*` calls |
| `server.cjs` | HTTP API; storage via `userDataStore.cjs` |
| `userDataStore.cjs` | In-memory seed by default; disk if `PROJECT_BINDER_USER_DATA` is set |
| `scripts/fetch-pocketbase.cjs` / `run-pocketbase.cjs` | Fetch binary; build UI + `pocketbase serve` |
| `seedWorkspace.json` | Read-only seed / demo (never write; boot peels `archived` projects into the archive store) |

## Client model

- Projects are folders in App state (`folders`).
- Each project has `mods`: tuples **`[type, name, data]`** where `type` is `Board` | `Notes` | `Files` | `Database` | …
- Navigation: `p` (project index), `m` (tab/mod index), `g` (global view: Masterboard, Timelogs, Trash, or `null` for project tabs).
- **Mutations**: call API → feed response into `applyWorkspace(data, opts)`. Prefer `keepNav(projectId, boardId)` from App so selection survives reload. Do not invent a parallel store.

## Where to put code

| Kind | Location |
|------|----------|
| UI components | `src/components/` |
| HTTP only | `src/api.js` |
| Pure helpers | `src/utils.js`, `src/dbFields.js`, `src/dbFilters.js`, `src/dbSorts.js`, `src/dbViews.js`, `src/flipSwap.js` |
| Confirm / prompt hosts | `src/confirmDialog.js`, `src/promptDialog.js` + their dialog components |
| Icons | `src/icons.jsx` (`IC` map + `Icon`) |
| Styles | `src/index.css` (single stylesheet; no new CSS framework) |
| Server writes / schema | `server.cjs` |

Entity identity is UUID `id` (not slug). Display names stay `name` / `title`. Workspace schema `version` ≥ 2. Uploads live at `uploads/<projectId>/<tabId>/<fileId>` (tab UUID folder for Files and board card attachments). Legacy production migration handoff: [docs/migrate-slugs-to-uids.md](docs/migrate-slugs-to-uids.md). Some normalize logic (DB columns, custom views) is still duplicated between client `src/db*` / `utils` and `server.cjs` — change both sides together.

## Hard constraints (anti-spaghetti)

1. **Reuse first** — before adding a helper or “⋮ more” menu, check `utils`, `db*`, `Dropdown`, `flipSwapHorizontal`, existing more-menus.
2. **Extract on the second copy** — don’t grow `App.jsx` / `Board.jsx` with one-off duplicates.
3. **No new state libraries** — extend App’s workspace apply path.
4. **Disabled tab types** in `TYPES` (`off: true`) are roadmap stubs — don’t delete casually; don’t build full UI unless asked.
5. **Keep exports small** — prefer file-private helpers; unexport internals.
6. **Hygiene** — after sizable features, trim dead exports/CSS when obvious.

## Comments

- Comment **invariants and non-obvious why**, not what the next line does.
- File-level one-liners on non-obvious modules are fine.
- No banner comments that restate the file tree; no TODO features in code (use chat/issues).

## Agent defaults

Unless the user asks otherwise:

- Do **not** drive the browser for visual QA
- Do **not** commit, push, or amend
- Do **not** change git config or use destructive git commands
- Prefer `npm run build` (or lint if present) to verify edits
