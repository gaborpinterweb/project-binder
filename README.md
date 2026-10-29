# Project Binder

## Quick overview

- Free, open-source (MIT)
- Web workspace for freelance projects
- **Self-host** with one PocketBase binary (**Community** build), or run a **Commercial** hosted instance (`VITE_COMMERCIAL=true`)
- Boards, master board, notes, files, databases, timelogs, trash, archive, export/import
- Electron desktop has been removed

## Run (product path)

```bash
npm install
npm start                 # Community (default); same as npm run pb
npm run start:commercial  # Commercial (Settings → Pro); pass VITE_POLAR_* if desired
# → http://127.0.0.1:8090

# While PB is already running, rebuild UI only (no restart):
npm run pb:ui
npm run pb:ui:commercial
```

1. Open the app URL (not `/_/` — that is the PocketBase admin).
2. First PocketBase boot: create a superuser at the install link if prompted (admin only).
3. **Register** an account, then sign in. New accounts must **verify email** before sign-in (needs Resend/`mail.env` locally, or cloud mail).
4. Workspace JSON is stored per user in PocketBase (`user_data` file fields). Backup = copy `pocketbase/pb_data`.
5. Sign out: Settings → Data → Account.

Deep links use path URLs (e.g. `/projects/<id>/tabs/<id>/tasks/<id>`). PocketBase’s default `--indexFallback` serves `index.html` for unknown paths so refresh works; do not start the binary with `--indexFallback=0`.

Fetch binary only: `npm run pb:fetch`. Optional Docker: `docker compose up` (see `docker-compose.yml`).

If migrations changed and you already have `pocketbase/pb_data`, delete that folder once so migrations re-apply (loses local PB data). Or: `npm run pb:fresh` / `npm run pb:fresh:commercial` (wipe + rebuild + mail).

### Email (Resend) — verify + password reset

Optional for local; recommended for hosted cloud.

1. Copy [`pocketbase/mail.env.example`](pocketbase/mail.env.example) → `pocketbase/mail.env`.
2. Fill `RESEND_API_KEY`, `MAIL_FROM` (verified domain), `APP_URL`, and your PocketBase superuser `PB_ADMIN_*`.
3. With PB running: `npm run pb:mail` (or restart `npm start` — it applies mail.env automatically when the key is set).

Without `mail.env`, the app still runs; verification/reset emails simply will not send.

### Community vs Commercial builds

- **Community** (default): `npm start` / `npm run build` / Docker without commercial build-args. Full features; no payment UI.
- **Commercial**: `npm run start:commercial` (or `build:commercial`). Settings → Billing; Polar checkout/portal + webhooks for Free/Pro status.

```bash
# Local serve
npm start
VITE_POLAR_CHECKOUT_URL=https://… VITE_POLAR_PORTAL_URL=https://… npm run start:commercial

# Build only
npm run build
VITE_POLAR_CHECKOUT_URL=https://… VITE_POLAR_PORTAL_URL=https://… npm run build:commercial
```

Auth mail (Resend) is independent of the commercial flag.

#### Polar billing (Commercial / sandbox)

1. In Polar, create a **subscription** product, then a **Checkout Link** with **`require_billing_address: true`**. Portal URL is `https://polar.sh/<org-slug>/portal`.
2. Set build-args `VITE_POLAR_CHECKOUT_URL` (Checkout Link) and `VITE_POLAR_PORTAL_URL`. Optional: `VITE_FEEDBACK_URL` (Contact us / Settings feedback; default `https://projectbinder.app/feedback`).
3. Set runtime secret: `fly secrets set POLAR_WEBHOOK_SECRET=…` (same value as the Polar webhook endpoint secret).
4. In Polar (prefer **sandbox** while testing) → Webhooks → URL `https://cloud.projectbinder.app/api/polar-webhook`, events: `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, …
5. Checkout Link **Success URL**: `https://cloud.projectbinder.app/confirm-pro?checkout_id={CHECKOUT_ID}` (Return URL can be `/settings?tab=billing`). The app polls for Pro on `/confirm-pro`.
6. Deploy so migrations + `pb_hooks` are live. Unsigned POSTs to the webhook should return 401/503.
7. Sign in → Settings → Billing → **Get Cloud Pro** (checkout appends `reference_id` = PocketBase user id + `customer_email`). Complete a test purchase; Polar should return to `/confirm-pro`.
8. Settings → Billing should show **Pro** after confirmation (or **Refresh**). PB Admin: user `pro` / `proStatus` / `polar*` fields.
9. Cancel / revoke in Polar sandbox → Refresh → **Free** when entitlement ends.
10. Escape hatch: set `pro` in PB Admin to exercise the status UI without a purchase.

Local commercial with webhooks: export `POLAR_WEBHOOK_SECRET` before `npm run start:commercial`, and point a sandbox webhook at a tunnel to `http://127.0.0.1:8090/api/polar-webhook` (or use `polar webhook listen`), or test against Fly only.

### Deploy on Fly.io

Preferred hosted path (same Docker image keeps a **`/data` volume** across deploys so users/workspace survive new app versions). Config: [`fly.toml`](fly.toml) (Commercial build by default). Deploy from your machine with [flyctl](https://fly.io/docs/hands-on/install-flyctl/).

**Do not run bare `fly deploy`.** Use the gated script:

1. One-time: `fly auth login`, then `fly apps create project-binder` (skip if the app already exists).
2. Create a volume once: `fly volumes create pb_data --region ams --size 3` (mount name must match `fly.toml`).
3. Set secrets from [`deploy/fly.env.example`](deploy/fly.env.example): at least `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, `APP_URL` (your public HTTPS URL). Add Resend vars for verify/reset mail, and `POLAR_WEBHOOK_SECRET` for billing (`fly secrets set …`).
4. Commercial build-args (`VITE_COMMERCIAL=true`) are in `fly.toml`. Set `VITE_POLAR_CHECKOUT_URL` / `VITE_POLAR_PORTAL_URL` there or via Fly build-args when needed.
5. Set the release target URL: copy [`deploy/release.env.example`](deploy/release.env.example) → `deploy/release.env` (gitignored) and set `RELEASE_PROD_URL` to your public origin (or export the same env var).
6. Bump [`package.json`](package.json) `version` (and `releaseName` on a new minor/major), add a matching section in [`CHANGELOG.md`](CHANGELOG.md), commit on `main`, then run **`npm run release`**. The script runs e2e, asks you to type `deploy`, runs Fly deploy, and checks `${RELEASE_PROD_URL}/version.json`. First ship after `/version.json` exists may need `npm run release -- --force`.

Open the public URL; register after migrations run. Point Polar webhooks at `/api/polar-webhook` (see Commercial billing above).

Redeploys replace the image only; do **not** delete the volume unless you intend to wipe data. Keep a **single machine** (SQLite).

Local image check:

```bash
docker build --build-arg VITE_COMMERCIAL=true -t project-binder .
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
