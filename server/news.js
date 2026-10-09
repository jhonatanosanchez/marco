// RSS 2.0 / Atom / RDF news feeds via fast-xml-parser.
import { XMLParser } from 'fast-xml-parser';
import { request, BROWSER_UA } from './lib/http.js';
import { stripHtml, truncate, hash, decodeEntities } from './lib/text.js';
import { getConfig } from './store.js';

const TTL = 15 * 60_000;
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  processEntities: false, // we decode entities ourselves (handles HTML named entities too)
  htmlEntities: false,
  parseTagValue: false,
  trimValues: true,
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
};
const attr = (v, name) => (v && typeof v === 'object' ? v[`@_${name}`] : undefined);

function firstImage(it) {
  for (const enc of arr(it.enclosure)) {
    const url = attr(enc, 'url');
    const type = attr(enc, 'type') || '';
    if (url && (type.startsWith('image') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) return url;
  }
  for (const key of ['media:content', 'media:thumbnail']) {
    for (const m of arr(it[key])) {
      const url = attr(m, 'url');
      const medium = attr(m, 'medium');
      if (url && (!medium || medium === 'image')) return url;
    }
  }
  for (const g of arr(it['media:group'])) {
    const u = attr(arr(g['media:content'])[0], 'url') || attr(arr(g['media:thumbnail'])[0], 'url');
    if (u) return u;
  }
  const html = text(it['content:encoded']) || text(it.description) || text(it.content) || text(it.summary);
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities(html));
  if (m && /^https?:/i.test(m[1])) return m[1];
  return undefined;
}

function toIso(s) {
  const d = new Date(String(s || '').trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse feed XML → { title, items:[{id,title,summary,source,date,image?,link}] } (pure; tested). */
export function parseFeed(xml, sourceName = '') {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('Not an RSS/Atom feed');
  const doc = parser.parse(xml);
  let title = '';
  let rawItems = [];
  let atom = false;
  if (doc.rss) {
    const ch = arr(doc.rss.channel)[0] || {};
    title = text(ch.title);
    rawItems = arr(ch.item);
  } else if (doc.feed) {
    atom = true;
    title = text(doc.feed.title);
    rawItems = arr(doc.feed.entry);
  } else if (doc['rdf:RDF']) {
    const rdf = doc['rdf:RDF'];
    title = text(arr(rdf.channel)[0]?.title);
    rawItems = arr(rdf.item);
  }
  title = stripHtml(title);
  const source = sourceName || title;
  const items = rawItems.map((it) => {
    const t = stripHtml(text(it.title));
    let link = '';
    if (atom) {
      const links = arr(it.link);
      const alt = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate') || links[0];
      link = attr(alt, 'href') || text(alt);
    } else {
      link = text(it.link) || text(it.guid);
    }
    const body = text(it.description) || text(it.summary) || text(it['content:encoded']) || text(it.content);
    const summary = truncate(stripHtml(body), 200);
    const date = toIso(text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']));
    const out = {
      id: hash(`${text(it.guid) || text(it.id) || link || t}`, 12),
      title: t,
      summary: summary === t ? '' : summary,
      source,
      date,
      link: link.trim(),
    };
    const image = firstImage(it);
    if (image) out.image = decodeEntities(image);
    return out;
  }).filter((i) => i.title);
  return { title, items };
}

export async function fetchFeed(url) {
  const res = await request(url, {
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
      'accept-language': 'es-ES,es;q=0.9,pt;q=0.8,en;q=0.7',
    },
  });
  return res.text;
}

export async function testFeed(url) {
  try {
    const f = parseFeed(await fetchFeed(url));
    return { ok: true, title: f.title, count: f.items.length };
  } catch (err) {
    return { ok: false, title: '', count: 0, error: err.message };
  }
}

const feedCache = new Map(); // url → { at, items, error }
export const status = { ok: null, updatedAt: null, errors: [] };

export async function getNews({ force = false } = {}) {
  const cfg = getConfig().news;
  const feeds = cfg.feeds.filter((f) => f.enabled);
  const errors = [];
  await Promise.all(feeds.map(async (f) => {
    const c = feedCache.get(f.url);
    if (!force && c && Date.now() - c.at < TTL) return;
    try {
      const parsed = parseFeed(await fetchFeed(f.url), f.name);
      feedCache.set(f.url, { at: Date.now(), items: parsed.items, name: f.name });
    } catch (err) {
      errors.push({ feedId: f.id, message: err.message });
      // stale on error; retry after 2 min instead of full TTL
      feedCache.set(f.url, { ...(c || { items: [] }), at: Date.now() - TTL + 120_000, error: err.message });
    }
  }));
  // Interleave feeds by date
  const items = feeds.flatMap((f) => (feedCache.get(f.url)?.items || []).map((i) => ({ ...i, source: f.name || i.source })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, cfg.maxItems);
  const updatedAt = new Date().toISOString();
  const persistentErrors = feeds.map((f) => feedCache.get(f.url)?.error && { feedId: f.id, message: feedCache.get(f.url).error }).filter(Boolean);
  Object.assign(status, { ok: persistentErrors.length === 0, updatedAt, errors: persistentErrors.length ? persistentErrors : errors });
  return { updatedAt, items };
}
