# Project Binder

## Quick overview

- Free, open-source (MIT), offline
- Local workspace for freelance projects (macOS / Windows desktop via Electron; also runs in the browser)
- **0.1.0 includes:** task boards, master board, notes, files, databases, timelogs, trash, export
- **Not in 0.1.0 yet:** Google Calendar, Docs/Links/Chat/etc. tab types, workspace import, auto-update download

## Description

`server.cjs` serves the React UI and JSON API. Seed data ships in the repo; the live workspace is written locally (gitignored at the repo root for web/dev; Electron uses the OS user-data folder).

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

| File | Role |
|------|------|
| [`seedWorkspace.json`](seedWorkspace.json) | Read-only seed for a fresh start. The app never writes this file. |
| `userWorkspace.json` | Live workspace (gitignored). All edits are saved here. |

On startup, if `userWorkspace.json` is missing, empty, or corrupt/invalid, the server deep-clones `seedWorkspace.json` into a new `userWorkspace.json`.

Restore the demo (dev builds): Settings → Developer → **Reset to seed workspace**, or delete `userWorkspace.json` and restart `npm start`.

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
| `aurora-app-launch` | Aurora app launch | `#b45a3c` | Launch (`launch`) | Design, Frontend dev, Backend dev, Content |
| `cove-brand-redesign` | Cove brand redesign | `#6b4f8c` | Brand (`brand`) | Design, Webflow, Content |
| `meridian-site-redesign` | Meridian site redesign | `#2f7a6e` | Website (`website`) | Design, Content |
| `shopify-store-migration` | Shopify store migration | `#8a5c2e` | Migration (`migration`) | Theme, Data & apps, SEO |

### Aurora app launch — Launch

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `landing-hero-copy` | Landing hero copy | Content | Today | |
| `waitlist-flow` | Waitlist signup flow | Backend dev | Today | |
| `press-kit` | Press kit PDF | Content | This week | yes |
| `launch-day-checklist` | Launch day checklist | Backend dev | This week | |
| `pricing-section` | Pricing section | Frontend dev | Backlog | yes |
| `onboarding-email` | Onboarding email sequence | Content | Next week | |

### Cove brand redesign — Brand

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `moodboard-signoff` | Moodboard sign-off | Design | Today | yes |
| `homepage-wireframes` | Homepage wireframes | Design | Today | |
| `type-color-system` | Type & color system | Design | This week | |
| `case-study-template` | Case study template | Content | This week | |
| `component-library` | Webflow component library | Webflow | Next week | |
| `asset-handoff` | Asset handoff pack | Content | Backlog | |

### Meridian site redesign — Website

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `discovery-workshop` | Discovery workshop notes | Content | Today | yes |
| `ia-sitemap` | IA & sitemap | Design | Today | |
| `services-page` | Services page draft | Content | This week | |
| `lead-form` | Lead form + CRM hook | Content | This week | |
| `blog-templates` | Insights blog templates | Design | Next week | |
| `accessibility-pass` | Accessibility pass | Design | Backlog | |

### Shopify store migration — Migration

| Card slug | Title | Task board column | Master board column | Done |
|---|---|---|---|---|
| `catalog-export` | Catalog export & clean-up | Data & apps | Today | |
| `url-redirect-map` | URL redirect map | SEO | Today | yes |
| `dawn-theme-setup` | Dawn theme customization | Theme | This week | |
| `checkout-apps` | Checkout & apps install | Data & apps | This week | |
| `customer-accounts` | Customer account migration | Data & apps | Next week | yes |
| `go-live-rehearsal` | Go-live rehearsal | Theme | Backlog | |

Project descriptions live in each project’s `description` field in the JSON.

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
- **localStorage prefix:** rename `projectory:` client keys (legacy migrate from `freelance-workbook:` already exists) before wider adoption, or document the name
- **Demo cleanup:** “Remove demo data” button that deletes `isDemo: true` entities only (see Demo data above)
- **Import:** implement Settings → Developer → Import (currently stubbed / disabled)
- **Auto-update:** current flow (check GitHub Releases → sidebar “Update available” → open releases page) is enough for MVP; full `electron-updater` + signing/notarization is later
