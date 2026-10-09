// Home Assistant REST API (long-lived token stored in secrets.json).
import { request } from './lib/http.js';
import { getConfig, getSecrets } from './store.js';

export function haSettings(override = {}) {
  const cfg = getConfig().homeassistant;
  return {
    url: String(override.url || cfg.url || '').replace(/\/+$/, ''),
    token: override.token || getSecrets().homeassistant?.token || '',
    enabled: cfg.enabled,
  };
}

async function haGet(path, { url, token }) {
  if (!url) throw new Error('Home Assistant URL not configured');
  if (!token) throw new Error('Home Assistant token not configured');
  const res = await request(`${url}${path}`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    timeout: 10_000,
    throwOnError: false,
  });
  if (res.status === 401) throw new Error('Unauthorized (check token)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(res.text);
}

export async function testConnection(override) {
  try {
    const s = haSettings(override);
    const ping = await haGet('/api/', s);
    let version;
    try { version = (await haGet('/api/config', s)).version; } catch { /* optional */ }
    return { ok: true, version, message: ping.message };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getState(entityId) {
  return haGet(`/api/states/${encodeURIComponent(entityId)}`, haSettings());
}

export async function listEntities(domain) {
  const states = await haGet('/api/states', haSettings());
  return states
    .filter((s) => !domain || s.entity_id.startsWith(`${domain}.`))
    .map((s) => ({
      entity_id: s.entity_id,
      name: s.attributes?.friendly_name || s.entity_id,
      state: s.state,
      unit: s.attributes?.unit_of_measurement || '',
    }))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function haUsable() {
  const s = haSettings();
  return Boolean(s.enabled && s.url && s.token);
}
