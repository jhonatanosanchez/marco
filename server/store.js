// Persistent config + secrets in data/ (atomic writes: tmp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from './defaults.js';
import { validateConfig, mergeDefaults, migrateConfig, isV1 } from './validate.js';
import { backupBeforeSave } from './backups.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {};
// 'config' (config, prev, { reason, req }) after every save. reason: 'admin' | 'server' | 'restore' | 'import' | …
export const events = new EventEmitter();

let config = null;
let secrets = null;
/** Set when the stored config was migrated during the last initStore() (logged by the activity module). */
export let migratedOnLoad = null;

export function initStore(dataDir = process.env.DATA_DIR || path.join(ROOT, 'data')) {
  paths.data = path.resolve(dataDir);
  paths.config = path.join(paths.data, 'config.json');
  paths.secrets = path.join(paths.data, 'secrets.json');
  paths.photos = path.join(paths.data, 'photos');
  paths.cache = path.join(paths.data, 'cache');
  paths.backups = path.join(paths.data, 'backups'); // rotating config backups (docs/ARCHITECTURE.md)
  paths.activity = path.join(paths.data, 'activity.jsonl'); // activity log
  paths.announcements = path.join(paths.data, 'announcements.json'); // active + history
  paths.displays = path.join(paths.data, 'displays.json'); // known displays registry
  migratedOnLoad = null;
  for (const d of [paths.data, paths.photos, paths.cache, paths.backups]) fs.mkdirSync(d, { recursive: true });
  config = loadConfig();
  secrets = loadSecrets();
  return { config, secrets };
}

export function writeFileAtomic(file, data, mode) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

export class StoreError extends Error {}

function readJson(file, { strict = false } = {}) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (strict && (!v || typeof v !== 'object' || Array.isArray(v))) throw new Error('not a JSON object');
    return v;
  } catch (err) {
    if (err.code !== 'ENOENT' && strict) {
      // Secrets hold the admin password hash: falling back to {} would silently reopen the setup wizard on a
      // configured install. Refuse to start instead and let the owner fix or restore the file.
      throw new StoreError(`[store] cannot read ${file}: ${err.message}. Refusing to start: fix the file, restore it from a `
        + 'backup, or delete it on purpose to reset the admin password (the setup wizard then asks for the setup token '
        + 'printed in this log).');
    }
    if (err.code !== 'ENOENT') {
      console.error(`[store] cannot read ${file}: ${err.message}; backing it up and using defaults`);
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    }
    return null;
  }
}

function loadConfig() {
  const raw = readJson(paths.config);
  if (!raw) {
    const c = defaultConfig();
    writeFileAtomic(paths.config, JSON.stringify(c, null, 2));
    return c;
  }
  // v1 (single screen) → v2 (screens[]): keep an untouched copy of the old file, then persist the migrated one.
  const migrate = isV1(raw);
  // Back-fill new keys from defaults, then sanitise. Invalid stored values fall back to defaults (logged).
  const { value, errors } = validateConfig(mergeDefaults(migrateConfig(raw)));
  if (errors.length) console.warn('[store] config had invalid values (defaults used):', errors.map((e) => `${e.path}: ${e.message}`).join('; '));
  if (migrate) {
    try {
      const dest = path.join(paths.backups, 'config-v1-premigration.json');
      if (!fs.existsSync(dest)) fs.copyFileSync(paths.config, dest);
      writeFileAtomic(paths.config, JSON.stringify(value, null, 2));
      console.log(`[store] config migrated to v${value.version} (${value.screens.length} screen); v1 copy in ${dest}`);
      migratedOnLoad = { from: Number(raw.version) || 1, to: value.version };
    } catch (err) {
      console.error('[store] config migration could not be persisted:', err.message);
    }
  }
  return value;
}

function loadSecrets() {
  const s = readJson(paths.secrets, { strict: true }) || {};
  s.google ??= {};
  s.google.accounts ??= {};
  s.homeassistant ??= {};
  if (!Array.isArray(s.apiTokens)) s.apiTokens = []; // webhook tokens (hashed), see docs/ARCHITECTURE.md
  if (!s.sessionSecret) s.sessionSecret = crypto.randomBytes(32).toString('hex');
  writeFileAtomic(paths.secrets, JSON.stringify(s, null, 2), 0o600);
  return s;
}

export const getConfig = () => config;
export const getSecrets = () => secrets;

/**
 * Validate + save a full config. Returns { ok, errors, config }. Bumps revision.
 * Before overwriting, the current file is copied to data/backups/ (rotating, docs/ARCHITECTURE.md).
 * @param {unknown} input
 * @param {{ reason?: string, req?: any, backup?: boolean }} [opts] reason/req are passed to 'config' listeners
 */
export function saveConfig(input, { reason = 'server', req = null, backup = true } = {}) {
  const { ok, errors, value } = validateConfig(input);
  if (!ok) return { ok, errors, config };
  value.revision = (config?.revision || 0) + 1;
  if (backup) {
    try { backupBeforeSave(config); } catch (err) { console.warn('[store] backup before save failed:', err.message); }
  }
  writeFileAtomic(paths.config, JSON.stringify(value, null, 2));
  const prev = config;
  config = value;
  events.emit('config', config, prev, { reason, req });
  return { ok: true, errors: [], config };
}

/** Mutate config through a function (for server-side changes, e.g. adding an allowed Google email). */
export function updateConfig(fn, opts = {}) {
  const next = structuredClone(config);
  fn(next);
  return saveConfig(next, opts);
}

export function updateSecrets(fn) {
  fn(secrets);
  writeFileAtomic(paths.secrets, JSON.stringify(secrets, null, 2), 0o600);
  return secrets;
}

/** Persist the in-memory secrets as they are (after in-place mutations such as token usage counters). */
export const flushSecrets = () => updateSecrets(() => {});
