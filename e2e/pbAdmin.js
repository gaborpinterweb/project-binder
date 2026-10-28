/**
 * PocketBase helpers for Playwright (public create + e2e-only superuser).
 * Talks only to the e2e server (baseURL / E2E_PB_PORT); never production.
 */

function pbBaseUrl() {
  const port = process.env.E2E_PB_PORT || "8091";
  return `http://127.0.0.1:${port}`;
}

function adminCreds() {
  return {
    email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@example.com",
    password: process.env.E2E_ADMIN_PASSWORD || "e2e-admin-password",
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

async function superuserToken() {
  const { email, password } = adminCreds();
  const auth = await jsonFetch(
    `${pbBaseUrl()}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    }
  );
  if (!auth?.token) throw new Error("e2e superuser auth returned no token");
  return auth.token;
}

/** Create a users record that is not email-verified (public create rule). */
export async function createUnverifiedUser(email, password) {
  const addr = String(email || "").trim();
  const pass = String(password || "");
  if (!addr || !pass) throw new Error("createUnverifiedUser: email and password required");
  const record = await jsonFetch(`${pbBaseUrl()}/api/collections/users/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: addr,
      password: pass,
      passwordConfirm: pass,
    }),
  });
  if (record?.verified) {
    throw new Error("createUnverifiedUser: user was created verified");
  }
  return record;
}

/** Mark a users record verified (same field email confirmation would set). */
export async function markUserVerified(email) {
  const addr = String(email || "").trim();
  if (!addr) throw new Error("markUserVerified: email required");
  const token = await superuserToken();
  const headers = {
    Authorization: token,
    "Content-Type": "application/json",
  };
  const filter = encodeURIComponent(`email="${addr.replace(/"/g, '\\"')}"`);
  const list = await jsonFetch(
    `${pbBaseUrl()}/api/collections/users/records?filter=${filter}&perPage=1`,
    { headers }
  );
  const id = list?.items?.[0]?.id;
  if (!id) throw new Error(`markUserVerified: no user for ${addr}`);
  await jsonFetch(`${pbBaseUrl()}/api/collections/users/records/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ verified: true }),
  });
}

export async function createVerifiedUser(email, password) {
  await createUnverifiedUser(email, password);
  await markUserVerified(email);
}

/** Superuser patch of billing entitlement (Commercial Free vs Pro). */
async function findUserByEmail(email) {
  const addr = String(email || "").trim();
  if (!addr) throw new Error("findUserByEmail: email required");
  const token = await superuserToken();
  const headers = {
    Authorization: token,
    "Content-Type": "application/json",
  };
  const filter = encodeURIComponent(`email="${addr.replace(/"/g, '\\"')}"`);
  const list = await jsonFetch(
    `${pbBaseUrl()}/api/collections/users/records?filter=${filter}&perPage=1`,
    { headers }
  );
  const record = list?.items?.[0];
  if (!record?.id) throw new Error(`findUserByEmail: no user for ${addr}`);
  return { token, headers, record };
}

export async function getUserByEmail(email) {
  const { record } = await findUserByEmail(email);
  return record;
}

export async function setUserPro(email, pro = true) {
  const { headers, record } = await findUserByEmail(email);
  await jsonFetch(`${pbBaseUrl()}/api/collections/users/records/${record.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      pro: !!pro,
      proStatus: pro ? "active" : "",
    }),
  });
}
