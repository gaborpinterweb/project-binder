/**
 * Demo Files-tab attachments for seed workspace.
 * Metadata in seedWorkspace.json must match name/mime/size (UTF-8 byte length).
 */
import { fileBlobStore, blobKey } from "./engine/fileBlobStore.js";
import {
  attachmentKey,
  uploadAttachment,
  deleteAttachment,
  listAttachmentKeys,
} from "./pb/persist.js";

const STUDIO_NOTES = `Studio notes
=============

Rates (day)
-----------
- Strategy / research: 900
- Design / prototyping: 850
- Implementation support: 750

Half days are billed at 60% of the day rate.
Rush work (under 5 business days) adds 25%.

Availability
------------
Mon–Thu preferred for deep work.
Fridays are for admin, invoicing, and light reviews.

Current capacity: two client tracks max.
Leave a buffer week between launches when possible.

Follow-ups
----------
- Send updated rate card to warm leads before Q4.
- Chase unpaid invoice #184 (Net 14, overdue by 6 days).
- Book quarterly tax check-in with accountant.
- Archive stale proposals older than 90 days.

Notes
-----
Prefer written briefs over verbal-only kickoffs.
Always confirm scope changes in the project Notes tab.
`;

const DISCOVERY_NOTES = `Discovery notes — Client project A
==================================

Goals
-----
1. Clarify brand voice for the relaunch site.
2. Map primary journeys: homepage → pricing → contact.
3. Identify content owners on the client side.

Stakeholders
------------
- Ana (marketing lead) — decision maker for copy.
- Jordan (product) — owns feature messaging.
- Priya (ops) — schedules interviews and reviews.

Open questions
--------------
- Do we keep the current logo lockup or refresh it?
- Is the pricing page public at launch, or gated?
- Which analytics tool is canonical after cutover?

Interview backlog
-----------------
[ ] Ana — brand tone and forbidden phrases
[ ] Jordan — product differentiators
[ ] Support lead — top 10 support themes

Next checkpoint
---------------
Share a one-page brief after the first interview round.
Flag blockers in the Ops board the same day.
`;

const LAUNCH_BRIEF = `Launch brief — Client project B
===============================

Target date
-----------
Soft launch: Thursday next week, 10:00 local.
Public announce: same day, 14:00.

Channels
--------
- Email newsletter (Ana owns send)
- LinkedIn company page + founder posts
- Product blog post (draft in Notes)
- Partner Slack communities (opt-in only)

Owners
------
- Launch checklist: you
- Asset finalization: design
- Press replies: Ana (first 48h)

Checklist
---------
[ ] Final hero copy approved
[ ] Pricing numbers locked
[ ] Status page / rollback note ready
[ ] UTM parameters documented
[ ] Post-launch monitoring window booked (2h)

Risks
-----
Legal review still pending on the FAQ answers.
If delayed past Thursday, slip to the following Tuesday —
do not launch on a Friday.
`;

/** @type {ReadonlyArray<{ projectId: string, tabId: string, fileId: string, name: string, mime: string, text: string }>} */
export const SEED_DEMO_FILES = Object.freeze([
  {
    projectId: "g9tQ8iOPO2vO",
    tabId: "ezSePA488lio",
    fileId: "yQUWkk4sFmur",
    name: "Studio notes.txt",
    mime: "text/plain",
    text: STUDIO_NOTES,
  },
  {
    projectId: "ISJ3PUyRop7t",
    tabId: "PNKZSLNJS5hr",
    fileId: "RExQ4w5X418Q",
    name: "Discovery notes.txt",
    mime: "text/plain",
    text: DISCOVERY_NOTES,
  },
  {
    projectId: "AbvGNYKvjj3z",
    tabId: "qrVtZGxVLUqx",
    fileId: "vDE1MFI0JTyv",
    name: "Launch brief.txt",
    mime: "text/plain",
    text: LAUNCH_BRIEF,
  },
]);

const encoder = new TextEncoder();

export function seedDemoFileBytes(text) {
  return encoder.encode(text);
}

export function seedDemoFileSize(text) {
  return seedDemoFileBytes(text).byteLength;
}

/** Load demo bytes into the in-memory blob store (PB + preview path). */
export function loadSeedDemoBlobs() {
  for (const f of SEED_DEMO_FILES) {
    fileBlobStore.set(
      blobKey(f.projectId, f.tabId, f.fileId),
      seedDemoFileBytes(f.text)
    );
  }
}

/**
 * @param {{ wipeExisting?: boolean }} [opts]
 * wipeExisting: delete all user attachments first (reset-to-seed).
 */
export async function installSeedDemoAttachments({ wipeExisting = false } = {}) {
  if (wipeExisting) {
    const keys = await listAttachmentKeys();
    for (const key of keys) {
      await deleteAttachment(key);
    }
  }
  loadSeedDemoBlobs();
  for (const f of SEED_DEMO_FILES) {
    const bytes = seedDemoFileBytes(f.text);
    await uploadAttachment(
      attachmentKey(f.projectId, f.tabId, f.fileId),
      new Blob([bytes], { type: f.mime }),
      f.name
    );
  }
}
