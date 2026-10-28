/**
 * Sign and POST Polar-style Standard Webhooks to the e2e PocketBase hook.
 */
import crypto from "node:crypto";

function pbBaseUrl() {
  const port = process.env.E2E_PB_PORT || "8091";
  return `http://127.0.0.1:${port}`;
}

export function polarWebhookSecret() {
  return process.env.E2E_POLAR_WEBHOOK_SECRET || "e2e_polar_webhook_secret";
}

export function polarCheckoutUrl() {
  return (
    process.env.E2E_POLAR_CHECKOUT_URL || "https://buy.polar.sh/e2e-test-checkout"
  );
}

/** Build Standard Webhooks headers for a raw JSON body. */
export function signPolarWebhook(rawBody, secret = polarWebhookSecret()) {
  const id = `msg_e2e_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const digest = crypto.createHmac("sha256", secret).update(signedContent).digest();
  const signature = `v1,${digest.toString("base64")}`;
  return {
    "Content-Type": "application/json",
    "Webhook-Id": id,
    "Webhook-Timestamp": String(timestamp),
    "Webhook-Signature": signature,
  };
}

export function subscriptionActivePayload({ userId, email }) {
  return {
    type: "subscription.created",
    data: {
      id: `sub_e2e_${Date.now()}`,
      status: "active",
      customer_id: `cus_e2e_${Date.now()}`,
      metadata: userId ? { reference_id: userId } : {},
      customer: email ? { email } : {},
    },
  };
}

/**
 * @param {object} opts
 * @param {object} opts.payload
 * @param {boolean} [opts.validSignature=true]
 * @param {string} [opts.secret]
 */
export async function postPolarWebhook({
  payload,
  validSignature = true,
  secret = polarWebhookSecret(),
}) {
  const rawBody = JSON.stringify(payload);
  const headers = signPolarWebhook(
    rawBody,
    validSignature ? secret : `${secret}_wrong`
  );
  const res = await fetch(`${pbBaseUrl()}/api/polar-webhook`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}
