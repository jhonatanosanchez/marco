import crypto from 'node:crypto';

/** Lowercase + strip diacritics, for accent-insensitive matching. */
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', euro: '€', copy: '©', reg: '®',
  trade: '™', deg: '°', middot: '·', bull: '•', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º',
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    const k = e.toLowerCase();
    if (k in NAMED) return NAMED[k];
    // Latin-1 letters with accents: &aacute; &ntilde; &ccedil; …
    const acc = { acute: '́', grave: '̀', tilde: '̃', circ: '̂', uml: '̈', cedil: '̧' };
    const mm = /^([a-z])(acute|grave|tilde|circ|uml|cedil)$/i.exec(e);
    if (mm) return (mm[1] + acc[mm[2].toLowerCase()]).normalize('NFC');
    return m;
  });
}

/** Strip HTML tags → plain text, entities decoded, whitespace collapsed. */
export function stripHtml(html) {
  let s = String(html ?? '');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(decodeEntities(s)); // some feeds double-encode
  s = s.replace(/<[^>]*>/g, ' '); // tags that were entity-encoded
  return s.replace(/\s+/g, ' ').trim();
}

export function truncate(s, max) {
  s = String(s ?? '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

/** Stable JSON stringify (sorted keys) for hashing. */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function hash(v, len = 16) {
  const s = typeof v === 'string' ? v : stableStringify(v);
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, len);
}

export function randomId(prefix = '', bytes = 6) {
  return prefix + crypto.randomBytes(bytes).toString('hex');
}
