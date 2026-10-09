// event filters & overrides (hide / rename / style). Pure functions; unit-tested in events-rules.test.js.
// See docs/API.md and docs/ARCHITECTURE.md. Order: hide (any match) → rename (every match, chained, in list order) →
// style (first match on the renamed or the original title).
import { fold } from './lib/text.js';

const WS = /\s/u;

/**
 * Accent/case-insensitive, whitespace-collapsed view of `s` with a map back to the original string.
 * `text[i]` comes from `s.slice(starts[i], ends[i])`.
 */
export function foldMap(input) {
  const s = String(input ?? '').normalize('NFC');
  let text = '';
  const starts = [];
  const ends = [];
  let i = 0;
  let prevWs = false;
  for (const ch of s) {
    const len = ch.length;
    if (WS.test(ch)) {
      if (prevWs) ends[ends.length - 1] = i + len;
      else {
        text += ' ';
        starts.push(i);
        ends.push(i + len);
      }
      prevWs = true;
    } else {
      const f = fold(ch);
      for (let k = 0; k < f.length; k++) {
        starts.push(i);
        ends.push(i + len);
      }
      text += f;
      prevWs = false;
    }
    i += len;
  }
  return { source: s, text, starts, ends };
}

/** Normalised comparison key: folded, whitespace collapsed, trimmed. */
export const normKey = (s) => foldMap(String(s ?? '').trim()).text;

/** Does `rule` match the event? `ev` = { title, description?, location?, sourceId? }. Ignores enabled/sourceIds. */
export function textMatches(rule, ev) {
  const needle = normKey(rule.match);
  if (!needle) return false;
  const title = normKey(ev.title);
  if (rule.matchMode === 'exact') return title === needle;
  if (rule.matchMode === 'startsWith') return title.startsWith(needle);
  if (title.includes(needle)) return true;
  if (rule.field === 'any') {
    return normKey(ev.description).includes(needle) || normKey(ev.location).includes(needle);
  }
  return false;
}

/** Rule applies to this source (enabled, and sourceIds empty or containing the event's source). */
export const ruleApplies = (rule, sourceId) =>
  rule && rule.enabled !== false && (!rule.sourceIds?.length || rule.sourceIds.includes(sourceId));

const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();

/** Apply one rename rule to a title (assumes it matched). Empty result → previous title. */
export function renameTitle(title, rule) {
  const replaceWith = String(rule.replaceWith ?? '');
  let out;
  if (rule.matchMode === 'exact') {
    out = replaceWith;
  } else {
    const trimmed = String(title).trim();
    const m = foldMap(trimmed);
    const needle = normKey(rule.match);
    if (!needle) return title;
    if (rule.matchMode === 'startsWith') {
      if (!m.text.startsWith(needle)) return title;
      out = replaceWith + m.source.slice(m.ends[needle.length - 1]);
    } else {
      // contains: replace every (non-overlapping) occurrence, case/accent-insensitive
      const ranges = [];
      for (let at = m.text.indexOf(needle); at !== -1; at = m.text.indexOf(needle, at + needle.length)) {
        ranges.push([m.starts[at], m.ends[at + needle.length - 1]]);
      }
      if (!ranges.length) return title;
      out = '';
      let last = 0;
      for (const [a, b] of ranges) {
        if (a < last) continue;
        out += m.source.slice(last, a) + replaceWith;
        last = b;
      }
      out += m.source.slice(last);
    }
  }
  out = tidy(out);
  return out || title;
}

/**
 * Evaluate the rules for one event.
 * @param {Array} rules EventRule[]
 * @param {{ title: string, description?: string, location?: string, sourceId: string }} ev
 * @returns {{ hidden: boolean, title: string, style: object|null, applied: {ruleId: string, action: string}[] }}
 */
export function applyEventRules(rules, ev) {
  const applied = [];
  let hidden = false;
  const list = (rules || []).filter((r) => ruleApplies(r, ev.sourceId));
  if (!list.length) return { hidden, title: ev.title, style: null, applied };
  const original = ev.title;

  for (const r of list) {
    if (r.action === 'hide' && textMatches(r, ev)) {
      hidden = true;
      applied.push({ ruleId: r.id, action: 'hide' });
    }
  }

  let title = original;
  for (const r of list) {
    if (r.action !== 'rename' || !textMatches(r, { ...ev, title })) continue;
    const next = renameTitle(title, r);
    if (next !== title) {
      title = next;
      applied.push({ ruleId: r.id, action: 'rename' });
    }
  }

  let style = null;
  for (const r of list) {
    if (r.action !== 'style') continue;
    if (textMatches(r, { ...ev, title }) || (title !== original && textMatches(r, ev))) {
      style = r;
      applied.push({ ruleId: r.id, action: 'style' });
      break;
    }
  }
  return { hidden, title, style, applied };
}
