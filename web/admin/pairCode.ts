// Pairing codes in the admin: cleaning what the owner types, showing it in two halves like the TV, and reading the
// answers of POST /api/admin/pair/claim from either server. Plain TypeScript, so the server tests can load it.
import type { PairConfirm } from '../shared/types';
import { pairCodeLength } from './caps';

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Keep only code characters (upper-cased), at most `length` of them: "abc-23o" → "ABC23". */
export const cleanCode = (v: string, length = pairCodeLength()): string =>
  v.toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, length);

/** "ABC234" → "ABC 234", "ABCD2345" → "ABCD 2345" (the halves the display shows). */
export const formatCode = (c: string, length = pairCodeLength()): string => {
  const half = Math.ceil(length / 2);
  return c.length > half ? `${c.slice(0, half)} ${c.slice(half)}` : c;
};

/** Error code of a failed claim: self-hosted sends { error: message, code }, Marco Cloud { error: code }. */
export const claimErrorCode = (body: unknown): string => {
  const b = body && typeof body === 'object' ? (body as { code?: unknown; error?: unknown }) : {};
  return typeof b.code === 'string' ? b.code : typeof b.error === 'string' ? b.error : '';
};

type ConfirmAnswer = Partial<PairConfirm> & { city?: string | null; country?: string | null };

/** Where the waiting display is, from the confirm step (Marco Cloud servers before 0.5 send city and country). */
export const confirmWhere = (c: ConfirmAnswer): string =>
  typeof c.where === 'string' ? c.where : [c.city, c.country].filter(Boolean).join(', ');
