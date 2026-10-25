#!/usr/bin/env node
/**
 * Apply Resend SMTP (+ SPA verify/reset links) to a running PocketBase.
 * Reads pocketbase/mail.env and/or process env. No-op if RESEND_API_KEY is empty.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, "pocketbase", "mail.env");
const DEFAULT_URL = process.env.PB_URL || "http://127.0.0.1:8090";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function cfg() {
  const file = parseEnvFile(ENV_PATH);
  const g = (k) => (process.env[k] != null && process.env[k] !== "" ? process.env[k] : file[k] || "");
  return {
    apiKey: g("RESEND_API_KEY"),
    mailFrom: g("MAIL_FROM") || "noreply@example.com",
    mailFromName: g("MAIL_FROM_NAME") || "Project Binder",
    appUrl: (g("APP_URL") || DEFAULT_URL).replace(/\/$/, ""),
    adminEmail: g("PB_ADMIN_EMAIL"),
    adminPassword: g("PB_ADMIN_PASSWORD"),
    pbUrl: (g("PB_URL") || DEFAULT_URL).replace(/\/$/, ""),
  };
}

async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data?.message || data?.raw || r.statusText;
    throw new Error(`${opts.method || "GET"} ${url} → ${r.status}: ${msg}`);
  }
  return data;
}

async function main() {
  const c = cfg();
  if (!c.apiKey) {
    console.log("configure-pb-mail: RESEND_API_KEY empty — skip");
    return;
  }
  if (!c.adminEmail || !c.adminPassword) {
    console.error(
      "configure-pb-mail: set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD in pocketbase/mail.env"
    );
    process.exit(1);
  }

  const auth = await jsonFetch(
    `${c.pbUrl}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: c.adminEmail, password: c.adminPassword }),
    }
  );
  const token = auth.token;
  if (!token) throw new Error("superuser auth returned no token");

  const headers = {
    "Content-Type": "application/json",
    Authorization: token,
  };

  await jsonFetch(`${c.pbUrl}/api/settings`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      meta: {
        appName: "Project Binder",
        appUrl: c.appUrl,
        senderName: c.mailFromName,
        senderAddress: c.mailFrom,
      },
      smtp: {
        enabled: true,
        host: "smtp.resend.com",
        port: 587,
        username: "resend",
        password: c.apiKey,
        tls: false,
      },
    }),
  });

  const users = await jsonFetch(`${c.pbUrl}/api/collections/users`, { headers });
  const verificationTemplate = {
    subject: "Verify your Project Binder email",
    body: `<p>Hello,</p>
<p>Please verify your email for Project Binder by clicking the link below:</p>
<p><a href="${c.appUrl}/?verify={TOKEN}">Verify email</a></p>
<p>If you did not create an account, you can ignore this email.</p>`,
  };
  const resetPasswordTemplate = {
    subject: "Reset your Project Binder password",
    body: `<p>Hello,</p>
<p>Reset your password by clicking the link below:</p>
<p><a href="${c.appUrl}/?reset={TOKEN}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
  };
  const confirmEmailChangeTemplate = {
    subject: "Confirm your new Project Binder email",
    body: `<p>Hello,</p>
<p>Confirm your new email for Project Binder by clicking the link below:</p>
<p><a href="${c.appUrl}/?emailChange={TOKEN}">Confirm email change</a></p>
<p>If you did not request this, you can ignore this email.</p>`,
  };

  await jsonFetch(`${c.pbUrl}/api/collections/${users.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      verificationTemplate,
      resetPasswordTemplate,
      confirmEmailChangeTemplate,
    }),
  });

  console.log("configure-pb-mail: Resend SMTP + verify/reset/email-change links applied");
}

main().catch((err) => {
  console.error("configure-pb-mail:", err.message || err);
  process.exit(1);
});
