import { expect, test } from "@playwright/test";
import { uniqueEmail } from "./helpers.js";

function pbBaseUrl() {
  const port = process.env.E2E_PB_PORT || "8091";
  return `http://127.0.0.1:${port}`;
}

async function createUser(body) {
  const r = await fetch(`${pbBaseUrl()}/api/collections/users/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: r.ok, status: r.status, data };
}

test.describe("Signup security", () => {
  test("public create cannot set billing or verified fields", async () => {
    const password = "password123";

    const withPro = await createUser({
      email: uniqueEmail(),
      password,
      passwordConfirm: password,
      pro: true,
    });
    expect(withPro.ok).toBe(false);

    const withStatus = await createUser({
      email: uniqueEmail(),
      password,
      passwordConfirm: password,
      proStatus: "active",
    });
    expect(withStatus.ok).toBe(false);

    const withPolar = await createUser({
      email: uniqueEmail(),
      password,
      passwordConfirm: password,
      polarCustomerId: "cus_abuse",
      polarSubscriptionId: "sub_abuse",
    });
    expect(withPolar.ok).toBe(false);

    const withVerified = await createUser({
      email: uniqueEmail(),
      password,
      passwordConfirm: password,
      verified: true,
    });
    expect(withVerified.ok).toBe(false);

    const clean = await createUser({
      email: uniqueEmail(),
      password,
      passwordConfirm: password,
    });
    expect(clean.ok).toBe(true);
    expect(clean.data?.pro).toBeFalsy();
    expect(clean.data?.verified).toBeFalsy();
    expect(clean.data?.proStatus || "").toBe("");
    expect(clean.data?.polarCustomerId || "").toBe("");
    expect(clean.data?.polarSubscriptionId || "").toBe("");
  });
});
