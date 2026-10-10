// Weather: Open-Meteo (no key) with optional Home Assistant override/augment (current conditions + indoor sensors).
import { requestJson } from './lib/http.js';
import { wmoDescription, windDirLabel } from './core/lib/i18n.js';
import { defaultScreen } from './core/screens.js';
import { getConfig } from './store.js';
import * as ha from './homeassistant.js';

const TTL = 10 * 60_000;
// One cache entry + one in-flight request per language (screens may use different languages) (docs/ARCHITECTURE.md).
const cache = new Map(); // lang → { key, at, data }
const inflight = new Map(); // lang → Promise
export const status = { ok: null, updatedAt: null, error: null };

// HA weather condition → WMO code (approximate)
const HA_TO_WMO = {
  'clear-night': 0, sunny: 0, partlycloudy: 2, cloudy: 3, fog: 45, rainy: 63, pouring: 65, lightning: 95,
  'lightning-rainy': 95, hail: 96, snowy: 73, 'snowy-rainy': 66, windy: 3, 'windy-variant': 3, exceptional: 3,
};

const round1 = (n) => (n == null || Number.isNaN(+n) ? null : Math.round(+n * 10) / 10);
const round0 = (n) => (n == null || Number.isNaN(+n) ? null : Math.round(+n));

function withOffset(localIso, offsetSec) {
  if (!localIso) return null;
  const sign = offsetSec >= 0 ? '+' : '-';
  const a = Math.abs(offsetSec);
  const hh = String(Math.floor(a / 3600)).padStart(2, '0');
  const mm = String(Math.floor((a % 3600) / 60)).padStart(2, '0');
  const base = localIso.length === 16 ? `${localIso}:00` : localIso;
  return `${base}${sign}${hh}:${mm}`;
}

export function openMeteoUrl(w, tz) {
  const q = new URLSearchParams({
    latitude: String(w.lat),
    longitude: String(w.lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,uv_index',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max',
    timezone: tz || 'auto',
    wind_speed_unit: 'kmh',
    temperature_unit: w.units === 'imperial' ? 'fahrenheit' : 'celsius',
    forecast_days: String(Math.max(2, Math.min(14, w.forecastDays + 1))),
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** Map an Open-Meteo response to the /api/weather shape (pure; tested). */
export function mapOpenMeteo(j, { lang, locationName, forecastDays, now = new Date() }) {
  const off = j.utc_offset_seconds || 0;
  const c = j.current || {};
  const d = j.daily || {};
  const h = j.hourly || {};
  const current = {
    temp: round1(c.temperature_2m),
    feelsLike: round1(c.apparent_temperature),
    humidity: round0(c.relative_humidity_2m),
    windKmh: round0(c.wind_speed_10m),
    windDir: round0(c.wind_direction_10m),
    windDirLabel: windDirLabel(c.wind_direction_10m, lang),
    code: c.weather_code ?? null,
    isDay: c.is_day === 1 || c.is_day === true,
    description: wmoDescription(c.weather_code, lang),
    pressure: round0(c.pressure_msl),
    uv: round1(c.uv_index),
  };
  const days = (d.time || []).map((date, i) => ({
    date,
    code: d.weather_code?.[i] ?? null,
    min: round1(d.temperature_2m_min?.[i]),
    max: round1(d.temperature_2m_max?.[i]),
    precipChance: round0(d.precipitation_probability_max?.[i]),
    windKmh: round0(d.wind_speed_10m_max?.[i]),
    sunrise: withOffset(d.sunrise?.[i], off),
    sunset: withOffset(d.sunset?.[i], off),
  }));
  // "today" in the location's zone = first daily entry
  const t0 = days[0] || {};
  const today = { sunrise: t0.sunrise ?? null, sunset: t0.sunset ?? null, min: t0.min ?? null, max: t0.max ?? null, precipChance: t0.precipChance ?? null };
  const nowMs = now.getTime();
  const hourly = [];
  (h.time || []).forEach((time, i) => {
    const iso = withOffset(time, off);
    if (Date.parse(iso) + 3600_000 <= nowMs) return; // keep current hour onward
    if (hourly.length >= 8) return;
    hourly.push({
      time: iso,
      temp: round1(h.temperature_2m?.[i]),
      code: h.weather_code?.[i] ?? null,
      precipChance: round0(h.precipitation_probability?.[i]),
      isDay: h.is_day?.[i] === 1,
    });
  });
  return {
    updatedAt: new Date().toISOString(),
    locationName,
    current,
    today,
    daily: days.slice(0, forecastDays).map(({ sunrise, sunset, ...rest }) => rest),
    hourly,
    indoor: null,
  };
}

async function applyHomeAssistant(data, w, lang) {
  if (!ha.haUsable()) return data;
  const num = (s) => {
    const n = parseFloat(s?.state);
    return Number.isFinite(n) ? n : null;
  };
  const tasks = [];
  if (w.provider === 'homeassistant' && w.haWeatherEntity) {
    tasks.push(ha.getState(w.haWeatherEntity).then((s) => {
      const a = s.attributes || {};
      const code = HA_TO_WMO[s.state];
      const cur = data.current;
      if (a.temperature != null) cur.temp = round1(a.temperature);
      if (a.apparent_temperature != null) cur.feelsLike = round1(a.apparent_temperature);
      if (a.humidity != null) cur.humidity = round0(a.humidity);
      if (a.wind_speed != null) {
        const unit = String(a.wind_speed_unit || 'km/h').toLowerCase();
        const k = unit === 'm/s' ? 3.6 : unit === 'mph' ? 1.609 : unit === 'kn' ? 1.852 : 1;
        cur.windKmh = round0(a.wind_speed * k);
      }
      if (a.wind_bearing != null && !Number.isNaN(+a.wind_bearing)) {
        cur.windDir = round0(a.wind_bearing);
        cur.windDirLabel = windDirLabel(a.wind_bearing, lang);
      }
      if (a.pressure != null) cur.pressure = round0(a.pressure);
      if (a.uv_index != null) cur.uv = round1(a.uv_index);
      if (code !== undefined) {
        cur.code = code;
        cur.description = wmoDescription(code, lang);
        if (s.state === 'clear-night') cur.isDay = false;
      }
    }).catch((err) => console.warn('[weather] HA weather entity:', err.message)));
  }
  let indoor = null;
  if (w.haIndoorTempEntity) {
    tasks.push(ha.getState(w.haIndoorTempEntity).then((s) => { indoor = { ...(indoor || {}), temp: round1(num(s)) }; })
      .catch((err) => console.warn('[weather] HA indoor temp:', err.message)));
  }
  if (w.haIndoorHumidityEntity) {
    tasks.push(ha.getState(w.haIndoorHumidityEntity).then((s) => { indoor = { ...(indoor || {}), humidity: round0(num(s)) }; })
      .catch((err) => console.warn('[weather] HA indoor humidity:', err.message)));
  }
  await Promise.all(tasks);
  if (indoor) data.indoor = { temp: indoor.temp ?? null, humidity: indoor.humidity ?? null };
  return data;
}

export async function getWeather({ force = false, lang = null } = {}) {
  const cfg = getConfig();
  // v2: location/provider are global; forecastDays is per screen → fetch the max any screen shows.
  const w = { ...cfg.weather, forecastDays: Math.max(1, ...cfg.screens.map((s) => s.weather.forecastDays)) };
  lang ||= defaultScreen(cfg).screen.language;
  const key = JSON.stringify([w, cfg.datetime.timezone, cfg.homeassistant]);
  const hit = cache.get(lang);
  if (!force && hit && hit.key === key && Date.now() - hit.at < TTL) return hit.data;
  if (inflight.has(lang)) return inflight.get(lang);
  const p = (async () => {
    try {
      const j = await requestJson(openMeteoUrl(w, cfg.datetime.timezone));
      if (j.error) throw new Error(j.reason || 'Open-Meteo error');
      let data = mapOpenMeteo(j, { lang, locationName: w.locationName, forecastDays: w.forecastDays });
      data = await applyHomeAssistant(data, w, lang);
      cache.set(lang, { key, at: Date.now(), data });
      // Entries for an older location/config are useless now.
      for (const [l, e] of cache) if (e.key !== key) cache.delete(l);
      Object.assign(status, { ok: true, updatedAt: data.updatedAt, error: null });
      return data;
    } catch (err) {
      Object.assign(status, { ok: false, error: err.message });
      if (hit) return hit.data; // stale on error
      throw err;
    } finally {
      inflight.delete(lang);
    }
  })();
  inflight.set(lang, p);
  return p;
}

/**
 * Cached weather without fetching (dashboard): the entry for `lang` (default screen language), else any cached
 * language, else null. May be stale.
 */
export function cachedWeather(lang = null) {
  const cfg = getConfig();
  lang ||= defaultScreen(cfg).screen.language;
  return (cache.get(lang) || [...cache.values()][0])?.data || null;
}
