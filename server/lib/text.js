// The text helpers live in server/core/lib/text.js (no Node APIs, shared with Marco Cloud). On Node, hash() uses
// node:crypto, which is much faster on large calendar files and gives the same output as the pure version.
import crypto from 'node:crypto';
import { stableStringify } from '../core/lib/text.js';

export * from '../core/lib/text.js';

export function hash(v, len = 16) {
  const s = typeof v === 'string' ? v : stableStringify(v);
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, len);
}
