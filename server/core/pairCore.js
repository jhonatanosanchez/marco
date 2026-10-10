// Pairing codes: generation and normalisation, shared by self-hosted Marco (server/pairing.js, 6 characters) and
// Marco Cloud (8 characters). The alphabet has 31 symbols without look-alikes (0/O, 1/I/L). No Node APIs.

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Self-hosted code length. GET /api/health reports the length a server uses as `pairCodeLength`. */
export const CODE_LENGTH = 6;

/**
 * A random code of `length` symbols. Rejection sampling keeps it unbiased over the alphabet (bytes 248..255 are
 * dropped, since 248 = 8 × 31). `randomBytes(n)` returns n random bytes and is only replaced in tests.
 */
export function randomCode(length = CODE_LENGTH, randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(16)) {
      if (b < 248 && out.length < length) out += CODE_ALPHABET[b % 31];
    }
  }
  return out;
}

/** "abc-234" / "ABC 234" → "ABC234"; null when it cannot be a code of `length` symbols. */
export function normalizeCode(v, length = CODE_LENGTH) {
  const s = typeof v === 'string' ? v.toUpperCase().replace(/[\s-]+/g, '') : '';
  if (s.length !== length) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
