# Handoff: migrate legacy slug workspace → UUID `id`

**Audience:** next agent (or human) migrating **one** packaged production user-data folder.  
**Status:** app + seed already use UUID `id` (`workspace.version` ≥ 2). No runtime backward compatibility.  
**Do not** open the new packaged app against unmigrated production data and expect it to “just work.”

---

## Why this exists

Identity used to be name-derived `slug` fields. That was wrong for renames/collisions. The app now requires:

| Rule | Detail |
|------|--------|
| Schema | `userWorkspace.json` / seed: `"version": 2` |
| Identity | Every entity has UUID `id` (`crypto.randomUUID()` shape) |
| Display | `name` / `title` only — never used as identity |
| tabOrder | `{ "type": "board\|notes\|files\|database", "id": "<uuid>" }` |
| Timelogs | `id` + `project` / `board` / `card` are UUIDs |
| Trash rows | `id` + pointer fields are UUIDs |
| Uploads disk | `uploads/<projectId>/<tabId>/<fileId>` — **tab UUID folder** for Files tabs and board card attachments (and empty folders for Notes/Database when revealed) |
| Validation | `isValidStore` requires `version >= 2`. Legacy slug files are **rejected**. |

**Safety rail:** if packaged mode finds a legacy slug `userWorkspace.json` (has `projects[0].slug`, no `id`, version &lt; 2), the server **exits** instead of overwriting with seed. See `looksLikeLegacySlugWorkspace` in `server.cjs`.

---

## Target shape (reference)

```json
{
  "version": 2,
  "stages": ["Backlog", "This week", "Today", "Tomorrow", "Next week"],
  "projects": [
    {
      "id": "uuid",
      "name": "Freelancing",
      "color": "#198480",
      "boards": [
        {
          "id": "uuid",
          "name": "Ops",
          "columns": ["Admin"],
          "cards": [
            {
              "id": "uuid",
              "title": "…",
              "status": "Admin",
              "master": "Today",
              "body": "",
              "files": [
                { "id": "uuid", "name": "x.pdf", "mime": "application/pdf", "size": 1, "createdAt": "…" }
              ]
            }
          ]
        }
      ],
      "notesTabs": [{ "id": "uuid", "name": "Notes", "notes": [{ "id": "uuid", "title": "…", "body": "" }] }],
      "filesTabs": [{ "id": "uuid", "name": "Files", "files": [{ "id": "uuid", "name": "…", "mime": "…", "size": 0 }] }],
      "databases": [{ "id": "uuid", "name": "…", "columns": [], "items": [{ "id": "uuid", "fields": {}, "body": "" }] }],
      "tabOrder": [{ "type": "board", "id": "uuid" }]
    }
  ],
  "timelogs": [
    {
      "id": "uuid",
      "project": "project-uuid",
      "board": "board-uuid",
      "card": "card-uuid",
      "title": "…",
      "kind": "pomodoro",
      "startedAt": "…",
      "endedAt": "…",
      "durationSec": 1500
    }
  ],
  "trash": []
}
```

**Not migrated to UUID:** DB *column* field keys (`columns[].id` like `"n"`, `"s"`) — those are schema keys embedded in row `fields`, not entity identity.

**Client-only:** Cover tab uses fixed `COVER_TAB_ID` in `src/utils.js` (`00000000-0000-4000-8000-0000000000c0`). Not stored in workspace JSON.

---

## Entities to remap

Build one old→new map (script does this). Keys used by `scripts/migrate-workspace-slugs-to-uids.mjs`:

| Map key pattern | Entity |
|-----------------|--------|
| `project/<projectSlug>` | Project |
| `board/<projectSlug>/<boardSlug>` | Board tab |
| `card/<projectSlug>/<boardSlug>/<cardSlug>` | Task card |
| `cardFile/<projectSlug>/<boardSlug>/<cardSlug>/<fileSlug>` | Card attachment meta (+ blob under board tab folder) |
| `notesTab/<projectSlug>/<tabSlug>` | Notes tab |
| `note/<projectSlug>/<tabSlug>/<noteSlug>` | Note |
| `filesTab/<projectSlug>/<tabSlug>` | Files tab |
| `file/<projectSlug>/<tabSlug>/<fileSlug>` | Files-tab file meta + blob |
| `database/<projectSlug>/<dbSlug>` | Database tab |
| `dbItem/<projectSlug>/<dbSlug>/<itemSlug>` | DB row |
| `timelog/<timelogSlug>` | Timelog |
| `trash/<trashSlug>` | Trash entry |

Rewrite all foreign keys (timelog `project`/`board`/`card`, trash pointers, `tabOrder`) through this map. Drop every identity `slug` field after assigning `id`.

---

## Production user-data locations

Packaged Electron (typical):

| OS | Directory |
|----|-----------|
| macOS | `~/Library/Application Support/Project Binder/` |
| Windows | `%APPDATA%/Project Binder/` |
| Linux | `~/.config/Project Binder/` |

Must contain at least `userWorkspace.json`. Uploads live in `uploads/`.

Confirm with the user before writing. Override path may be set via `PROJECT_BINDER_USER_DATA`.

---

## Procedure (agent checklist)

1. **Quit** Project Binder completely (no server holding the files).
2. **Copy** the whole user-data folder to a safe backup (Time Machine / zip / second folder). Do this *before* any script write.
3. **Dry-run** from repo root:

   ```bash
   node scripts/migrate-workspace-slugs-to-uids.mjs \
     --dir "$HOME/Library/Application Support/Project Binder" \
     --dry-run
   ```

   Expect project/timelog counts and upload file counts; fix warnings (`skip uploads…`) before a real run.

4. **Migrate for real** (omit `--dry-run`):

   ```bash
   node scripts/migrate-workspace-slugs-to-uids.mjs \
     --dir "$HOME/Library/Application Support/Project Binder"
   ```

   Script writes:
   - `userWorkspace.json` (v2)
   - `uploads/` remapped
   - `slug-to-uid-map.json` (audit)
   - `userWorkspace.json.pre-uid-bak`
   - `uploads.pre-uid-bak/` (first run)

5. **Verify JSON** quickly:

   ```bash
   node -e "
   const p=process.argv[1];
   const d=require(p);
   if (d.version<2) throw new Error('version');
   if (d.projects.some(x=>x.slug||!x.id)) throw new Error('project');
   console.log('ok', d.projects.length, 'projects');
   " \"$HOME/Library/Application Support/Project Binder/userWorkspace.json\"
   ```

6. **Launch** packaged app (or point `PROJECT_BINDER_USER_DATA` at the migrated folder). Confirm:
   - Projects/tabs open
   - A Files tab lists files; **Show in Finder** opens that tab’s UUID folder only
   - Card attachments still open
   - Timelogs still link to cards
   - Trash restore (if any items)

7. If broken: quit app, restore `.pre-uid-bak` / `uploads.pre-uid-bak`, investigate map gaps, retry on a **copy** of the backup.

8. **localStorage** (optional cleanup): keys under `project-binder:` may still hold old last-tab slugs. Worst case: wrong last tab until user clicks a tab. Clear site/local storage for the app origin if navigation looks stuck — data is server-side.

---

## Seed reference (already done)

Repo seed was converted with:

```bash
node scripts/convert-seed-slugs-to-uids.mjs
```

- Output map: `docs/seed-slug-to-uid-map.json` (seed audit only; **not** production)
- Note: seed uploads folder was historically named `internal-business` while the project slug was `freelancing`; seed converter aliases that. Production migrator maps `uploads/<projectSlug>/` using the **workspace** project slug — no alias.

Do **not** re-run the seed converter unless you intentionally regenerate seed UUIDs (breaks the committed map / upload paths).

---

## Code touchpoints (already updated — do not re-slug)

| Area | Notes |
|------|--------|
| `server.cjs` | `newId()`, `isSafePathId` (UUID), entity `.id`, API create returns `{ id, … }` |
| `userDataStore.cjs` | `isValidStore` ⇒ `version >= 2` |
| `src/utils.js` | `fromApi` / nav / `COVER_TAB_ID` / `newId()` |
| Client components | Entity access via `.id` |
| `slugifyClient` | **Filename sanitizer only** (`noteExport.js`) — not identity |

---

## Out of scope / follow-ups (not this migration)

- Renaming API query param names.
- Migrating DB column short ids to UUIDs (would break row `fields` keys).
- If a workspace still has legacy `uploads/<project>/__cardfiles__/`, move those blobs into the owning board tab UUID folder (current app writes board attachments under the board id).

---

## Done when

- [ ] Backup of pre-migration user-data exists outside the app folder  
- [ ] `userWorkspace.json` has `version: 2`, no entity `slug` keys  
- [ ] `uploads/` paths use project/tab/file UUIDs  
- [ ] Packaged app opens migrated data without refusing legacy workspace  
- [ ] Spot-check Files, card files, timelogs, trash  

Remind the user to review diffs/commits themselves; they own the data and the git history.
