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

# While PB is already running, rebuild UI only (no restart):
npm run pb:ui
```

1. Open the app URL (not `/_/` — that is the PocketBase admin).
2. First PocketBase boot: create a superuser at the install link if prompted (admin only).
3. **Register** an account, then sign in. New accounts must **verify email** before sign-in (needs Resend/`mail.env` locally, or cloud mail).
4. Workspace JSON is stored per user in PocketBase (`user_data` file fields). Backup = copy `pocketbase/pb_data`.
5. Sign out: Settings → Data → Account.

Deep links use path URLs (e.g. `/projects/<id>/tabs/<id>/tasks/<id>`). PocketBase’s default `--indexFallback` serves `index.html` for unknown paths so refresh works; do not start the binary with `--indexFallback=0`.

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

### Deploy on Railway

Preferred hosted path (same Docker image keeps **`/data` volume** across deploys so users/workspace survive new app versions).

1. Create a Railway project from this repo (Dockerfile / [`railway.toml`](railway.toml)).
2. Add a **volume** mounted at **`/data`** (PocketBase `pb_data`).
3. Set variables from [`deploy/railway.env.example`](deploy/railway.env.example): at least `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, `APP_URL` (your public HTTPS URL). Add Resend vars for verify/reset mail.
4. Set Docker **build-arg** `VITE_CLOUD=true` if you want hosted chrome.
5. Deploy. Open the public URL; register or use demo after migrations run.

Redeploys replace the image only; do **not** delete the volume unless you intend to wipe data.

Local image check:

```bash
docker build -t project-binder .
docker run --rm -p 8090:8090 -v binder-data:/data \
  -e PB_ADMIN_EMAIL=admin@example.com -e PB_ADMIN_PASSWORD=changeme \
  -e APP_URL=http://127.0.0.1:8090 project-binder
```

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
