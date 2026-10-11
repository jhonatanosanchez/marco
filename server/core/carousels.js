// Carousels ("Carrusel"): a global, ordered list of existing screens, each shown for a number of seconds, in a loop.
// A display points at a carousel the way it points at a screen (slug, private link or paired device). Pure
// functions shared with the admin (web/shared/carousels.ts imports this file), the display and Marco Cloud.
// See docs/ARCHITECTURE.md (Carousels) and docs/API.md.
//
// Every TV on the same carousel shows the same step at the same moment without any server state: the slot comes
// from the Unix epoch and the server time (carouselSlot). An optional schedule (the rule shape of privacy schedules)
// says when the carousel rotates; outside it the display shows one fixed screen (offScreenId).
import { enabledWindows, windowState, nextWindowBoundary } from './schedules.js';

export const CAROUSEL_PREFIX = 'v_';
export const MAX_CAROUSELS = 6;
export const MAX_CAROUSEL_STEPS = 12;
export const MIN_STEP_SEC = 10;
export const MAX_STEP_SEC = 3600;
export const DEFAULT_STEP_SEC = 30;
export const CAROUSEL_TRANSITIONS = Object.freeze(['fade', 'none']);

/** True for a carousel id ("v_…"); screen ids never use that prefix. */
export const isCarouselId = (id) => typeof id === 'string' && id.startsWith(CAROUSEL_PREFIX);

/** The carousels of a config ([] for configs saved before carousels existed). */
export const carouselList = (cfg) => (Array.isArray(cfg?.carousels?.items) ? cfg.carousels.items : []);

/** A carousel by slug (case-insensitive) or id, or null. */
export function findCarousel(cfg, key) {
  const k = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (!k) return null;
  return carouselList(cfg).find((c) => c.slug === k || c.id.toLowerCase() === k) || null;
}

/** Steps of `c` whose screen still exists. */
export function carouselSteps(cfg, c) {
  const ids = new Set((cfg?.screens || []).map((s) => s.id));
  return (Array.isArray(c?.steps) ? c.steps : []).filter((st) => st && ids.has(st.screenId));
}

/** Screen shown outside the schedule (and held at night): offScreenId when it exists, else the first step's screen. */
export function offScreenOf(cfg, c) {
  const screens = cfg?.screens || [];
  if (c?.offScreenId && screens.some((s) => s.id === c.offScreenId)) return c.offScreenId;
  return carouselSteps(cfg, c)[0]?.screenId || cfg?.defaultScreen || screens[0]?.id || '';
}

/** Unique screen ids a carousel can show (its steps and its off-schedule screen), in step order. */
export function carouselMembers(cfg, c) {
  const out = [];
  for (const st of carouselSteps(cfg, c)) if (!out.includes(st.screenId)) out.push(st.screenId);
  const off = offScreenOf(cfg, c);
  if (off && !out.includes(off)) out.push(off);
  return out;
}

/**
 * The `carousel` block of GET /api/display/config (and what the admin and the display compute phases from): only
 * valid steps, the off screen resolved, only the schedule rules that can run.
 */
export function carouselBlock(cfg, c) {
  const screens = cfg?.screens || [];
  const named = (id) => {
    const s = screens.find((x) => x.id === id);
    return { slug: s?.slug || '', name: s?.name || '' };
  };
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    enabled: c.enabled !== false,
    transition: CAROUSEL_TRANSITIONS.includes(c.transition) ? c.transition : 'fade',
    holdOnAlert: c.holdOnAlert !== false,
    nightRotate: c.nightRotate === true,
    offScreenId: offScreenOf(cfg, c),
    schedule: enabledWindows(c.schedule).map(({ id, days, from, to }) => ({ id, enabled: true, days: [...(days || [])], from, to })),
    steps: carouselSteps(cfg, c).map((st) => ({ screenId: st.screenId, seconds: st.seconds, ...named(st.screenId) })),
  };
}

/** Length of one full loop in ms (0 without steps). */
export const cycleMs = (steps) => (Array.isArray(steps) ? steps : []).reduce((n, st) => n + Math.max(1, Number(st.seconds) || 0) * 1000, 0);

/**
 * Step on screen at `nowMs`. The loop is anchored at the Unix epoch, so two displays with the same clock always
 * agree. Returns { index, screenId, startsAt, endsAt, cycleMs } (ms) or null without steps.
 */
export function carouselSlot(steps, nowMs) {
  const total = cycleMs(steps);
  if (!total) return null;
  const pos = ((nowMs % total) + total) % total;
  const loopStart = nowMs - pos;
  let at = 0;
  for (let i = 0; i < steps.length; i++) {
    const len = Math.max(1, Number(steps[i].seconds) || 0) * 1000;
    if (pos < at + len) return { index: i, screenId: steps[i].screenId, startsAt: loopStart + at, endsAt: loopStart + at + len, cycleMs: total };
    at += len;
  }
  // not reached (pos < total); kept so a rounding surprise still answers the last step
  const last = steps.length - 1;
  return { index: last, screenId: steps[last].screenId, startsAt: loopStart + total - Math.max(1, Number(steps[last].seconds) || 0) * 1000, endsAt: loopStart + total, cycleMs: total };
}

/**
 * What a carousel shows at `nowMs`. `block` = carouselBlock() (or the display's copy of it), `tz` = the configured
 * time zone, `night` = night mode is on for the held screen (the display knows it; the server passes false).
 *   mode 'rotate': inside the schedule (or no schedule): the slot's screen until `endsAt`
 *   mode 'off':    outside the schedule: offScreenId until the next schedule boundary
 *   mode 'night':  night mode while nightRotate is off: offScreenId (re-checked when night mode changes)
 *   mode 'paused': disabled or no steps: the first step's screen (or offScreenId)
 * `endsAt` (ms) is when the answer can change by itself (a slot ends or a schedule boundary comes), null = not by time.
 * @returns {{ mode: 'rotate' | 'off' | 'night' | 'paused', screenId: string, index: number, endsAt: number | null, inSchedule: boolean }}
 */
export function carouselPhase(block, nowMs, { tz = 'UTC', night = false } = {}) {
  const steps = Array.isArray(block?.steps) ? block.steps : [];
  const off = block?.offScreenId || steps[0]?.screenId || '';
  const rules = enabledWindows(block?.schedule);
  const now = new Date(nowMs);
  const boundary = rules.length ? nextWindowBoundary(rules, now, tz) : null;
  const inSchedule = !rules.length || windowState(rules, now, tz).active;
  if (block?.enabled === false || !steps.length) return { mode: 'paused', screenId: steps[0]?.screenId || off, index: steps.length ? 0 : -1, endsAt: null, inSchedule };
  if (!inSchedule) return { mode: 'off', screenId: off, index: -1, endsAt: boundary, inSchedule };
  if (night && !block.nightRotate) return { mode: 'night', screenId: off, index: -1, endsAt: boundary, inSchedule };
  const slot = carouselSlot(steps, nowMs);
  const endsAt = boundary !== null && boundary < slot.endsAt ? boundary : slot.endsAt;
  return { mode: 'rotate', screenId: slot.screenId, index: slot.index, endsAt, inSchedule };
}

/** Screen a carousel shows right now as far as the server knows (no night hold). */
export function carouselScreenNow(cfg, c, nowMs = Date.now()) {
  return carouselPhase(carouselBlock(cfg, c), nowMs, { tz: cfg?.datetime?.timezone || 'UTC' }).screenId;
}

/**
 * What a display key (slug or id) points at: a screen first (screens keep their URLs), then a carousel.
 *   { kind: 'screen', id, screen } | { kind: 'carousel', id, carousel } | null (no match)
 */
export function findTarget(cfg, key) {
  const k = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (!k) return null;
  const s = (cfg?.screens || []).find((x) => x.slug === k || x.id.toLowerCase() === k);
  if (s) return { kind: 'screen', id: s.id, screen: s };
  const c = findCarousel(cfg, k);
  return c ? { kind: 'carousel', id: c.id, carousel: c } : null;
}

/** True when `id` is a saved screen or carousel (what a link, a device or a pairing may be bound to). */
export const isTargetId = (cfg, id) => typeof id === 'string' && Boolean((cfg?.screens || []).some((s) => s.id === id) || carouselList(cfg).some((c) => c.id === id));

/** { id, kind, slug, name } of a screen or carousel id, or null. */
export function targetInfo(cfg, id) {
  const s = (cfg?.screens || []).find((x) => x.id === id);
  if (s) return { id: s.id, kind: 'screen', slug: s.slug, name: s.name };
  const c = carouselList(cfg).find((x) => x.id === id);
  return c ? { id: c.id, kind: 'carousel', slug: c.slug, name: c.name } : null;
}

/** Screen ids behind a target id: the screen itself, or the members of a carousel ([] when unknown). */
export function targetMembers(cfg, id) {
  if ((cfg?.screens || []).some((s) => s.id === id)) return [id];
  const c = carouselList(cfg).find((x) => x.id === id);
  return c ? carouselMembers(cfg, c) : [];
}

/**
 * Drop what points at deleted screens (pure: returns a new list). Steps of a deleted screen go; a carousel left
 * without steps is turned off; an off-schedule screen that is gone falls back to the first step (null).
 */
export function pruneCarousels(items, screenIds) {
  const ids = new Set(screenIds);
  return (Array.isArray(items) ? items : []).map((c) => {
    const steps = (c.steps || []).filter((st) => ids.has(st.screenId));
    return {
      ...c,
      steps,
      enabled: steps.length ? c.enabled : false,
      offScreenId: c.offScreenId && ids.has(c.offScreenId) ? c.offScreenId : null,
    };
  });
}
