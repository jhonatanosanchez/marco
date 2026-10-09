// Keep display credentials out of logs: private-link keys (/d/<key>, ?k=<key>), device tokens (md_…) and pairing
// session ids. Used for server log lines that include URLs and as a safety net in the activity log.
const PATTERNS = [
  [/(\/d\/)[^/?#\s"']+/gi, '$1[redacted]'],
  [/([?&](?:k|key|sessionId|sid)=)[^&#\s"']+/gi, '$1[redacted]'],
  [/\bmd_[A-Za-z0-9_-]{20,}/g, 'md_[redacted]'],
];

/** `s` with display keys, device tokens and pairing ids replaced by "[redacted]". */
export function redactSecrets(s) {
  let out = String(s ?? '');
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** True when `s` contains something redactSecrets() would hide. */
export const hasSecrets = (s) => PATTERNS.some(([re]) => { re.lastIndex = 0; const hit = re.test(String(s ?? '')); re.lastIndex = 0; return hit; });
