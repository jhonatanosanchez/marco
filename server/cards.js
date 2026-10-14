// Tarjetas (fork fsrhome): el servidor lee las fuentes de cada tarjeta (running-coach, garmin-stats) por la red interna,
// guarda una copia de 30 min por dirección y entrega a las pantallas solo el resumen calculado (core/trainingCore.js).
// Spec: homelab-docs/specs/2026-10-13-marco-tarjetas-entreno-design.md
import { Router } from 'express';
import { getConfig } from './store.js';
import { publish } from './pollHub.js';
import { requireAuth } from './auth.js';
import { logActivity } from './activity.js';
import { screenPrivacy } from './privacy.js';
import { requestScreen } from './displayAccess.js';
import { trainingDetail, trainingSummary } from './core/trainingCore.js';
import { agesList } from './ages.js';

export const CACHE_MS = 30 * 60_000;
const TIMEOUT_MS = 8000;
const UA = 'marco-cards';

/** url → { at, data } (última respuesta buena) */
const cache = new Map();
/** url → promesa en curso (dos pantallas a la vez no duplican la petición) */
const inflight = new Map();

export function _resetCards() {
  cache.clear();
  inflight.clear();
}

/** JSON de `url` con copia de 30 min; si la fuente falla, la última copia buena. → { data, ageMin } (data null sin copia) */
export async function cachedJson(url, now = Date.now()) {
  const hit = cache.get(url);
  if (hit && now - hit.at < CACHE_MS) return { data: hit.data, ageMin: 0 };
  let p = inflight.get(url);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': UA, accept: 'application/json' } });
        if (!r.ok) throw new Error(`http ${r.status}`);
        cache.set(url, { at: now, data: await r.json() });
        return true;
      } catch {
        return false;
      } finally {
        inflight.delete(url);
      }
    })();
    inflight.set(url, p);
  }
  if (await p) return { data: cache.get(url).data, ageMin: 0 };
  return hit ? { data: hit.data, ageMin: Math.round((now - hit.at) / 60_000) } : { data: null, ageMin: null };
}

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** Lo que necesitan las reglas de Entreno; cualquier parte puede ser null (fuente caída sin copia o forma rara). */
export async function loadTraining(card, now = Date.now()) {
  const o = card.options.training;
  const g = o.garminUrl;
  const none = { data: null, ageMin: null };
  const [plan, activities, health, adherence] = await Promise.all([
    o.source === 'coach' ? cachedJson(`${o.coachUrl}/plan`, now) : Promise.resolve(none),
    cachedJson(`${g}/api/activities?limit=20`, now),
    cachedJson(`${g}/api/health-metrics`, now),
    cachedJson(`${g}/api/adherence`, now),
  ]);
  const stale = {};
  if (plan.ageMin) stale.coach = plan.ageMin;
  const gAge = Math.max(activities.ageMin || 0, health.ageMin || 0, adherence.ageMin || 0);
  if (gAge) stale.garmin = gAge;
  return {
    plan: asObj(plan.data),
    activities: Array.isArray(activities.data) ? activities.data : null,
    health: asObj(health.data),
    adherence: asObj(adherence.data),
    stale,
  };
}

const timezone = (cfg) => cfg.datetime?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

/** La tarjeta `id` si está encendida, esta pantalla la tiene y la pantalla no está en modo privado; si no, null. */
function cardFor(cfg, req, id) {
  const card = (cfg.cards?.items ?? []).find((k) => k.id === id && k.enabled);
  if (!card) return null;
  const { screen } = requestScreen(cfg, req);
  if (!screen?.screen?.cards?.items?.includes(id)) return null;
  if (screenPrivacy(cfg, screen, new Date()).active) return null;
  return card;
}

/** Montado bajo /api después de displayAuth (DISPLAY_API_PATHS cubre /api/display). */
export function cardsDisplayRouter() {
  const r = Router();
  const handler = (kind) => async (req, res, next) => {
    try {
      const cfg = getConfig();
      const card = cardFor(cfg, req, req.params.id);
      res.set('cache-control', 'private, no-store');
      if (!card || (kind === 'detail' && card.type !== 'training')) return res.status(404).json({ error: 'not found' });
      if (card.type === 'ages') return res.json(await agesList(card));
      const now = Date.now();
      const build = kind === 'detail' ? trainingDetail : trainingSummary;
      res.json(build(await loadTraining(card, now), { source: card.options.training.source, now, tz: timezone(cfg) }));
    } catch (e) {
      next(e);
    }
  };
  r.get('/display/cards/:id', handler('summary'));
  r.get('/display/cards/:id/detail', handler('detail'));
  return r;
}

/** Pantallas que tienen la tarjeta `id` y no están en modo privado. */
function showTargets(cfg, id, now) {
  return cfg.screens.filter((s) => s.screen?.cards?.items?.includes(id) && !screenPrivacy(cfg, s, new Date(now)).active).map((s) => s.id);
}

export function cardsAdminRouter() {
  const r = Router();
  r.post('/cards/:id/show', requireAuth, (req, res) => {
    const cfg = getConfig();
    const card = (cfg.cards?.items ?? []).find((k) => k.id === req.params.id && k.enabled);
    if (!card) return res.status(404).json({ error: 'unknown card' });
    const now = Date.now();
    const screenIds = showTargets(cfg, card.id, now);
    const delivered = screenIds.length ? publish('cardShow', { id: card.id, sentAt: now }, { screenIds }) : 0;
    const screens = screenIds.map((id) => cfg.screens.find((s) => s.id === id)?.slug || id);
    logActivity('display.cardShow', { req, data: { card: card.id, screens, delivered } });
    res.json({ ok: true, delivered, screens });
  });
  return r;
}
