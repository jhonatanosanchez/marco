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
import { trainingDetail, trainingSummary, cardVisible, localDay } from './core/trainingCore.js';
import { agesList } from './ages.js';
import { loadMoney, moneyConfigured } from './money.js';
import { homelabSummary, homelabMode } from './core/homelabCore.js';
import { loadHomelab, loadNight, silenceHomelab } from './homelab.js';

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
  if (!cardVisible(card, { privateMode: screenPrivacy(cfg, screen, new Date()).active })) return null;
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
      if (!card || (kind === 'detail' && card.type !== 'training' && card.type !== 'homelab')) return res.status(404).json({ error: 'not found' });
      if (card.type === 'ages') return res.json(await agesList(card));
      if (card.type === 'homelab') {
        const now = Date.now();
        const tz = timezone(cfg);
        const h = await loadHomelab(now);
        if (kind === 'detail') return res.json(h ? { ok: true, at: h.at, data: h.data } : { ok: false });
        // Frigate solo se consulta en la ventana de "Anoche"
        const night = homelabMode(now, tz) === 'anoche' ? await loadNight(card, cfg.frigate, now, tz) : null;
        return res.json(homelabSummary(h?.data ?? null, night, { now, tz }));
      }
      if (card.type === 'money') {
        const now = Date.now();
        const m = await loadMoney(now, process.env, localDay(now, timezone(cfg)));
        return res.json(m ? { ok: true, at: m.at, data: m.data } : { ok: false });
      }
      const now = Date.now();
      const build = kind === 'detail' ? trainingDetail : trainingSummary;
      res.json(build(await loadTraining(card, now), { source: card.options.training.source, now, tz: timezone(cfg) }));
    } catch (e) {
      next(e);
    }
  };
  r.get('/display/cards/:id', handler('summary'));
  r.get('/display/cards/:id/detail', handler('detail'));
  // Silenciar o reactivar una alerta desde la hoja (solo tarjetas homelab de esta pantalla). La clave debe estar en la
  // última lectura (activa o ya silenciada); silencios.py vuelve a validar todo (fuente:* solo "arreglo").
  const HASTA = new Set(['arreglo', '1d', '7d']);
  r.post('/display/cards/:id/silence', async (req, res, next) => {
    try {
      const cfg = getConfig();
      const card = cardFor(cfg, req, req.params.id);
      res.set('cache-control', 'private, no-store');
      if (!card || card.type !== 'homelab') return res.status(404).json({ error: 'not found' });
      const { clave, hasta } = req.body ?? {};
      if (typeof clave !== 'string' || clave.length < 1 || clave.length > 120) return res.status(400).json({ error: 'invalid clave' });
      if (!(hasta === null || HASTA.has(hasta))) return res.status(400).json({ error: 'invalid hasta' });
      const h = await loadHomelab(Date.now());
      const known = h && [...h.data.alertas, ...h.data.silenciadas].some((a) => a.clave === clave);
      if (!known) return res.status(400).json({ error: 'unknown clave' });
      const out = await silenceHomelab({ clave, hasta });
      if (!out.ok) return res.status(out.status).json({ error: out.error });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  return r;
}

/** Pantallas que tienen la tarjeta `id` y no están en modo privado. */
function showTargets(cfg, id, now) {
  const card = (cfg.cards?.items ?? []).find((k) => k.id === id);
  return cfg.screens
    .filter((s) => s.screen?.cards?.items?.includes(id) && cardVisible(card, { privateMode: screenPrivacy(cfg, s, new Date(now)).active }))
    .map((s) => s.id);
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
  // ¿tiene el servidor el token de gastos? Solo un booleano: el token nunca sale del servidor
  r.get('/cards/status', requireAuth, (req, res) => {
    res.set('cache-control', 'no-store');
    res.json({ moneyToken: moneyConfigured() });
  });
  return r;
}
