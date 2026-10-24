# Project Binder

## Quick overview

- Free, open-source (MIT)
- Web workspace for freelance projects
- **Self-host** with one PocketBase binary, or run a **paid cloud** instance (`VITE_CLOUD=true`)
- Boards, master board, notes, files, databases, timelogs, trash, archive, export/import
- Electron desktop has been removed

## Run (product path)

```bash
npm install
npm start          # same as npm run pb
# → http://127.0.0.1:8090
```

1. Open the app URL (not `/_/` — that is the PocketBase admin).
2. First PocketBase boot: create a superuser at the install link if prompted (admin only).
3. Sign in with the demo account (seeded on migrate), or register your own:
   - Email: `demo@projectbinder.local`
   - Password: `demodemodemo`
4. New accounts must **verify email** before sign-in (demo user is pre-verified).
5. Workspace JSON is stored per user in PocketBase (`user_data` file fields). Backup = copy `pocketbase/pb_data`.
6. Sign out: Settings → Data → Account.

Fetch binary only: `npm run pb:fetch`. Optional Docker: `docker compose up` (see `docker-compose.yml`).

If migrations changed and you already have `pocketbase/pb_data`, delete that folder once so migrations re-apply (loses local PB data).

### Email (Resend) — verify + password reset

Optional for local; recommended for hosted cloud.

1. Copy [`pocketbase/mail.env.example`](pocketbase/mail.env.example) → `pocketbase/mail.env`.
2. Fill `RESEND_API_KEY`, `MAIL_FROM` (verified domain), `APP_URL`, and your PocketBase superuser `PB_ADMIN_*`.
3. With PB running: `npm run pb:mail` (or restart `npm start` — it applies mail.env automatically when the key is set).

Without `mail.env`, the app still runs; verification/reset emails simply will not send.

### Cloud flag

Build with `VITE_CLOUD=true` for hosted chrome. Billing (e.g. Lemon Squeezy) is planned later; not required for auth mail.

### Legacy Node API (dev only)

```bash
npm run start:node   # http://localhost:3457 in-memory seed
npm run dev          # Vite :5173 → proxies /api to :3457
```

Prefer `npm start` (PocketBase) for the real product path.

## Storage (PocketBase)

| Piece | Role |
|-------|------|
| `users` | Email/password auth |
| `user_data` | Per-user `userWorkspace` + `userArchive` JSON files |
| `attachments` | Uploaded file bytes keyed by project/tab/file id |
| [`public/seedWorkspace.json`](public/seedWorkspace.json) | Seed for first login |

Roadmap notes: [docs/pocketbase-master-plan.md](docs/pocketbase-master-plan.md).

## Demo data (`isDemo`)

Seed projects/boards/cards may include `"isDemo": true` (hidden in UI). User-created entities omit it.

## License

MIT — see [LICENSE](LICENSE).
