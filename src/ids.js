/** Workspace entity ids: 12-char base62, safe as URL + upload path segments. */

export const ID_LENGTH = 12;
export const ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Fixed cover-tab folder id (client-only Cover mod; RTE images under this path). */
export const COVER_TAB_ID = "0000000000c0";

const ID_RE = new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`);
/** Rejection sampling bound: largest multiple of alphabet length ≤ 256. */
const ID_BYTE_MAX = 256 - (256 % ID_ALPHABET.length);

export function isSafePathId(s) {
  return typeof s === "string" && ID_RE.test(s);
}

export function newId() {
  let out = "";
  while (out.length < ID_LENGTH) {
    const bytes = new Uint8Array(ID_LENGTH - out.length + 4);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= ID_BYTE_MAX) continue;
      out += ID_ALPHABET[b % ID_ALPHABET.length];
      if (out.length === ID_LENGTH) break;
    }
  }
  return out;
}
