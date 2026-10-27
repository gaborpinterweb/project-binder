/**
 * Polar subscription webhooks → users.pro / proStatus / polar* fields.
 * Secret: POLAR_WEBHOOK_SECRET (Fly secrets / env). Standard Webhooks headers.
 *
 * Note: PB JS hooks run handlers in an isolated VM — keep logic inside the
 * callback (or require() from inside it). File-scope helpers are not visible.
 */
routerAdd("POST", "/api/polar-webhook", (e) => {
  const { hmacSha256 } = require(`${__hooks}/_hmac_sha256.js`);

  const WEBHOOK_TOLERANCE_SEC = 300;

  const decodeBase64 = (value) => {
    try {
      return Buffer.from(String(value), "base64");
    } catch (err) {
      return null;
    }
  };

  const bufferEqual = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.readUInt8(i) ^ b.readUInt8(i);
    }
    return diff === 0;
  };

  const hmacKeys = (secret) => {
    const keys = [Buffer.from(secret, "utf8")];
    const remainder = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const decoded = decodeBase64(remainder);
    if (decoded && decoded.length > 0 && !bufferEqual(decoded, keys[0])) {
      keys.push(decoded);
    }
    return keys;
  };

  const verifyPolarSignature = (rawBody, headers, secret) => {
    const id = headers["webhook-id"] || "";
    const ts = headers["webhook-timestamp"] || "";
    const sigHeader = headers["webhook-signature"] || "";
    if (!id || !ts || !sigHeader) return false;

    const timestamp = Number(ts);
    if (!Number.isFinite(timestamp)) return false;
    const now = Date.now() / 1000;
    if (timestamp < now - WEBHOOK_TOLERANCE_SEC) return false;
    if (timestamp > now + WEBHOOK_TOLERANCE_SEC) return false;

    const signedContent = `${id}.${Math.floor(timestamp)}.${rawBody}`;
    const keys = hmacKeys(secret);

    const parts = String(sigHeader).split(" ");
    for (let p = 0; p < parts.length; p++) {
      const pair = parts[p].split(",", 2);
      if (pair[0] !== "v1" || !pair[1]) continue;
      const decodedSig = decodeBase64(pair[1]);
      if (!decodedSig) continue;
      for (let k = 0; k < keys.length; k++) {
        const expected = hmacSha256(keys[k], signedContent);
        if (bufferEqual(expected, decodedSig)) return true;
      }
    }
    return false;
  };

  const metadataUserId = (meta) => {
    if (!meta || typeof meta !== "object") return "";
    const v = meta.reference_id ?? meta.referenceId ?? meta.user_id ?? meta.userId;
    return v != null ? String(v).trim() : "";
  };

  const subscriptionEntitled = (sub) => {
    const status = String(sub?.status || "").toLowerCase();
    if (status === "active" || status === "trialing" || status === "past_due") {
      return true;
    }
    if (status === "canceled" && sub?.ends_at) {
      const t = Date.parse(String(sub.ends_at));
      return !Number.isNaN(t) && t > Date.now();
    }
    return false;
  };

  const secret = $os.getenv("POLAR_WEBHOOK_SECRET") || "";
  if (!secret) {
    return e.json(503, { error: "webhook not configured" });
  }

  const rawBody = toString(e.request.body);
  const headers = {
    "webhook-id":
      e.request.header.get("Webhook-Id") ||
      e.request.header.get("webhook-id") ||
      "",
    "webhook-timestamp":
      e.request.header.get("Webhook-Timestamp") ||
      e.request.header.get("webhook-timestamp") ||
      "",
    "webhook-signature":
      e.request.header.get("Webhook-Signature") ||
      e.request.header.get("webhook-signature") ||
      "",
  };
  if (!verifyPolarSignature(rawBody, headers, secret)) {
    return e.json(401, { error: "invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return e.json(400, { error: "invalid json" });
  }

  const eventType = String(payload?.type || "");
  if (!eventType.startsWith("subscription.")) {
    return e.json(200, { ok: true, ignored: true });
  }

  const sub = payload?.data || {};
  const status = String(sub.status || "none").toLowerCase();
  const customerId = sub.customer_id != null ? String(sub.customer_id) : "";
  const subscriptionId = sub.id != null ? String(sub.id) : "";

  let userId = metadataUserId(sub.metadata);
  const userEmail = String(sub.customer?.email || "").trim().toLowerCase();

  let user = null;
  if (userId) {
    try {
      user = e.app.findRecordById("users", userId);
    } catch (err) {
      user = null;
    }
  }
  if (!user && userEmail) {
    try {
      user = e.app.findFirstRecordByFilter("users", "email = {:email}", {
        email: userEmail,
      });
    } catch (err) {
      user = null;
    }
  }
  if (!user) {
    console.log("[polar-webhook] no user for event", eventType, userId, userEmail);
    return e.json(200, { ok: true, unmatched: true });
  }

  const entitled = subscriptionEntitled(sub);

  user.set("pro", entitled);
  user.set("proStatus", status || "none");
  if (customerId) user.set("polarCustomerId", customerId);
  if (subscriptionId) user.set("polarSubscriptionId", subscriptionId);
  e.app.save(user);

  console.log(
    "[polar-webhook]",
    eventType,
    "user",
    user.id,
    "pro",
    entitled,
    "status",
    status
  );
  return e.json(200, { ok: true, pro: entitled });
});
