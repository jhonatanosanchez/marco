// Screen profiles (F1): resolve ?screen=, project the v2 config into the flat per-screen view that the display
// (and the legacy single-screen code paths) understand. Pure functions. See docs/API.md and docs/ARCHITECTURE.md.
// Mirror for the admin panel: web/shared/screens.ts (keep both in sync).
import { SCREEN_SPLIT_KEYS, SCREEN_ONLY_KEYS, LOCAL_SOURCE_ID, BIRTHDAYS_SOURCE_ID } from './defaults.js';
import { displayPrivacy } from './privacy.js';
import { carouselBlock } from './carousels.js';

/** Default screen profile (cfg.defaultScreen, falling back to the first one). */
export function defaultScreen(cfg) {
  return cfg.screens.find((s) => s.id === cfg.defaultScreen) || cfg.screens[0];
}

/**
 * Find a screen by slug (case-insensitive) or id. Returns { screen, fallback } where `fallback` is true when
 * `key` was given but matched nothing (the default screen is returned then). Empty key → default, fallback false.
 */
export function resolveScreen(cfg, key) {
  const k = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (!k) return { screen: defaultScreen(cfg), fallback: false };
  const hit = cfg.screens.find((s) => s.slug === k || s.id.toLowerCase() === k);
  return hit ? { screen: hit, fallback: false } : { screen: defaultScreen(cfg), fallback: true };
}

/**
 * Flat (v1-shaped) view of one screen: global sections merged with that screen's per-screen sections.
 * `screen.name` = profile name. Includes every global key too (localEvents, birthdays, …).
 */
export function flatView(cfg, screen) {
  const out = {};
  for (const [k, v] of Object.entries(cfg)) if (k !== 'screens') out[k] = v;
  for (const k of SCREEN_ONLY_KEYS) out[k] = screen[k];
  out.screen = { name: screen.name, ...screen.screen };
  for (const k of Object.keys(SCREEN_SPLIT_KEYS)) out[k] = { ...cfg[k], ...screen[k] };
  out.screenId = screen.id;
  out.slug = screen.slug;
  return out;
}

/** Enabled calendar sources visible on a screen, including the built-in local/birthdays pseudo-sources. */
export function screenSourceIds(cfg, screen) {
  const ids = [
    ...cfg.calendar.sources.filter((s) => s.enabled).map((s) => s.id),
    ...(cfg.localEvents.enabled ? [LOCAL_SOURCE_ID] : []),
    ...(cfg.birthdays.enabled ? [BIRTHDAYS_SOURCE_ID] : []),
  ];
  if (!screen) return ids;
  if (!screen.calendar.enabled) return [];
  const only = screen.calendar.sourceIds;
  return Array.isArray(only) ? ids.filter((id) => only.includes(id)) : ids;
}

/** Public projection of every source (incl. pseudo-sources) as sent to the display legend. */
export function publicSources(cfg, screen) {
  const visible = new Set(screenSourceIds(cfg, screen));
  const all = [
    ...cfg.calendar.sources.map(({ id, name, color, emoji, kind }) => ({ id, name, color, emoji, kind })),
    { id: LOCAL_SOURCE_ID, name: cfg.localEvents.name, color: cfg.localEvents.color, emoji: cfg.localEvents.emoji, kind: 'generic' },
    { id: BIRTHDAYS_SOURCE_ID, name: cfg.birthdays.name, color: cfg.birthdays.color, emoji: cfg.birthdays.emoji, kind: 'birthdays' },
  ];
  // Pseudo-sources without any item are left out of the legend.
  const empty = new Set([
    ...(cfg.localEvents.items.length ? [] : [LOCAL_SOURCE_ID]),
    ...(cfg.birthdays.items.length ? [] : [BIRTHDAYS_SOURCE_ID]),
  ]);
  return all.filter((s) => visible.has(s.id) && !empty.has(s.id));
}

/** Schedules (F5) that target a screen (enabled; empty screenIds = all screens). */
export function screenSchedules(cfg, screen) {
  return cfg.schedules.items.filter((m) => m.enabled && (!m.screenIds.length || m.screenIds.includes(screen.id)));
}

/**
 * GET /api/display/config payload for one screen (no secrets, no URLs, no HA entity ids).
 * `privacy` = { status, next } from core/privacy.js (privacyStatus, privacyNextChange); absent = not private.
 * While private with `hidePhotos`, the background only uses stock photos.
 * `carousel` = the carousel this display runs (the screen is one of its members), else null: the payload then says
 * which carousel (`target`, `carousel`) so the display can rotate through its screens.
 */
export function displayConfig(cfg, screen, { fallback = false, privacy = null, carousel = null } = {}) {
  const f = flatView(cfg, screen);
  const priv = displayPrivacy(screen, privacy?.status, privacy?.next ?? null);
  const background = priv.active && screen.privacy?.hidePhotos && f.background.source !== 'stock' ? { ...f.background, source: 'stock' } : f.background;
  const { sources, sourceIds, ...cal } = f.calendar;
  const { haWeatherEntity, haIndoorTempEntity, haIndoorHumidityEntity, ...weather } = f.weather;
  return {
    revision: cfg.revision,
    screenId: screen.id,
    slug: screen.slug,
    screenFallback: fallback,
    screen: f.screen,
    layout: f.layout,
    background,
    calendar: { ...cal, sources: publicSources(cfg, screen) },
    datetime: f.datetime,
    weather,
    news: { enabled: f.news.enabled, rotateSec: f.news.rotateSec },
    todo: { enabled: f.todo.enabled, items: f.todo.items },
    message: f.message,
    countdowns: { enabled: f.countdowns.enabled, max: f.countdowns.max },
    alerts: f.alerts,
    schedules: screenSchedules(cfg, screen).map(({ screenIds, ...m }) => m),
    privacy: priv,
    // what the display is bound to: this screen, or a carousel that shows it among others
    target: carousel
      ? { id: carousel.id, kind: 'carousel', slug: carousel.slug, name: carousel.name }
      : { id: screen.id, kind: 'screen', slug: screen.slug, name: screen.name },
    carousel: carousel ? carouselBlock(cfg, carousel) : null,
  };
}
