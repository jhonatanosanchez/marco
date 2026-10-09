// backups, export/import, activity log, dashboard. See docs/API.md and docs/ARCHITECTURE.md.
// Mounted at /api/admin (session required):
//   GET /backups  POST /backups  GET /backups/:id  POST /backups/:id/restore  DELETE /backups/:id
//   POST /export   POST /import/preview   POST /import/apply
//   GET /activity   DELETE /activity
//   GET /dashboard
import fs from 'node:fs';
import { Router } from 'express';
import { requestLang } from '../lib/i18n.js';
import { requireAuth, rotateSessionEpoch } from '../auth.js';
import { getConfig, getSecrets, saveConfig, updateSecrets } from '../store.js';
import {
  listBackups, writeBackup, backupPath, readBackup, deleteBackup, makeBundle, importPreview, parseImport,
  mergeImport, sanitizeImportedSecrets, repairConfig,
} from '../backups.js';
import { logActivity, listActivity, clearActivity, recentActivity } from '../activity.js';
import { syncDisplayKeys } from '../displayAccess.js';
import { listDisplays, getServerVersion } from '../displays.js';
import { listAnnouncements } from '../announce.js';
import { schedulesNow } from '../schedules.js';
import { getEvents, sourceStatus } from '../calendars.js';
import { cachedWeather } from '../weather.js';
import { localDate, addDays } from '../lib/tz.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const LEVELS = ['info', 'warn', 'error'];

/** Non-secret, human-sized summary of a stored config for activity entries. */
const revOf = (c) => c?.revision ?? null;

/** Dashboard warnings (§7.1). */
export function dashboardWarnings({ secrets, sources, displays, cfg }) {
  const w = [];
  if (secrets.passwordIsDefault && cfg.auth.passwordLoginEnabled) w.push('default_password');
  else if (secrets.passwordFromEnv && cfg.auth.passwordLoginEnabled) w.push('env_password'); // ADMIN_PASSWORD: offer to change it
  // Upgraded installs keep display access 'open' (no key): recommend private links + pairing.
  if (cfg.security?.displayAccess === 'open') w.push('display_access_open');
  if (sources.some((s) => s.enabled !== false && s.ok === false)) w.push('source_errors');
  if (!displays.some((d) => d.connected)) w.push('no_displays');
  if (displays.some((d) => d.connected && d.outdated)) w.push('outdated_displays');
  const googleSources = cfg.calendar.sources.filter((s) => s.enabled && s.type === 'google');
  const accounts = secrets.google?.accounts || {};
  const authFail = /Google account|Google token|refresh token|invalid_grant|HTTP 401|HTTP 403|reconnect/i;
  if (googleSources.some((s) => !accounts[s.googleAccount] || authFail.test(sources.find((x) => x.id === s.id)?.error || ''))) {
    w.push('google_auth_failed');
  }
  return w;
}

export function systemRouter({ version = getServerVersion() } = {}) {
  const r = Router();
  r.use(requireAuth);
  r.use((req, res, next) => { res.set('cache-control', 'no-store'); next(); });

  // ---------------- backups (§6.1) ----------------
  r.get('/backups', (req, res) => res.json(listBackups()));

  r.post('/backups', (req, res) => {
    const info = writeBackup(getConfig(), 'manual');
    logActivity('backup.created', { req, data: { id: info.id, revision: info.revision, reason: 'manual' } });
    res.json(info);
  });

  r.get('/backups/:id', (req, res) => {
    const file = backupPath(req.params.id);
    if (!file) return res.status(404).json({ error: 'not found' });
    res.set('content-type', 'application/json; charset=utf-8');
    res.set('content-disposition', `attachment; filename="${req.params.id}"`);
    res.send(fs.readFileSync(file));
  });

  r.post('/backups/:id/restore', (req, res) => {
    let raw;
    try { raw = readBackup(req.params.id); } catch { return res.status(422).json({ error: 'backup file is not valid JSON' }); }
    if (!raw) return res.status(404).json({ error: 'not found' });
    const parsed = parseImport(raw);
    if (!parsed.value) return res.status(422).json({ error: 'invalid backup', details: parsed.errors });
    // Values that no longer validate are repaired: broken list items are dropped and other settings fall
    // back to defaults (backups may predate schema changes, or hold values a newer validator rejects).
    const fixedUp = parsed.ok ? { ok: true, value: parsed.value, fixed: [] } : repairConfig(parsed.value);
    if (!fixedUp.ok) return res.status(422).json({ error: 'invalid backup', details: fixedUp.errors });
    const cur = getConfig();
    writeBackup(cur, 'restore');
    const result = saveConfig(fixedUp.value, { reason: 'restore', req, backup: false });
    if (!result.ok) return res.status(400).json({ error: 'invalid config', details: result.errors });
    logActivity('config.restored', {
      req,
      level: fixedUp.fixed.length ? 'warn' : 'info',
      data: { id: req.params.id, fromRevision: revOf(raw), revision: result.config.revision, warnings: parsed.errors.length, repaired: fixedUp.fixed.slice(0, 20) },
    });
    res.json({ ok: true, config: result.config, repaired: fixedUp.fixed });
  });

  r.delete('/backups/:id', (req, res) => {
    if (!deleteBackup(req.params.id)) return res.status(404).json({ error: 'not found' });
    logActivity('backup.deleted', { req, data: { id: req.params.id } });
    res.json({ ok: true });
  });

  // ---------------- export / import (§6.2, §6.3) ----------------
  r.post('/export', (req, res) => {
    const includeSecrets = req.body?.includeSecrets === true;
    const bundle = makeBundle(getConfig(), { appVersion: version, secrets: includeSecrets ? getSecrets() : null });
    logActivity('config.exported', { req, level: includeSecrets ? 'warn' : 'info', data: { secrets: includeSecrets } });
    res.set('content-disposition', `attachment; filename="marco-${localDate(new Date(), getConfig().datetime.timezone)}.json"`);
    res.json(bundle);
  });

  r.post('/import/preview', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || !('bundle' in req.body)) return res.status(400).json({ error: 'bundle required' });
    res.json(importPreview(req.body.bundle, getConfig(), requestLang(req)));
  });

  r.post('/import/apply', (req, res) => {
    const b = req.body || {};
    if (!('bundle' in b)) return res.status(400).json({ error: 'bundle required' });
    const parsed = parseImport(b.bundle);
    if (!parsed.ok) return res.status(400).json({ error: 'invalid', details: parsed.errors });
    if (b.sections !== undefined && !Array.isArray(b.sections)) return res.status(400).json({ error: 'sections must be an array' });
    const cur = getConfig();
    const merged = mergeImport(cur, parsed.value, b.sections);
    writeBackup(cur, 'import');
    const result = saveConfig(merged, { reason: 'import', req, backup: false });
    if (!result.ok) return res.status(400).json({ error: 'invalid', details: result.errors });
    let loggedOut = false;
    const applied = [];
    if (b.includeSecrets === true && parsed.secrets) {
      const s = sanitizeImportedSecrets(parsed.secrets);
      updateSecrets((x) => {
        if (s.haToken !== undefined) { x.homeassistant.token = s.haToken; applied.push('homeassistant'); }
        if (s.googleAccounts) { x.google.accounts = s.googleAccounts; applied.push('google'); }
        if (s.apiTokens) { x.apiTokens = s.apiTokens; applied.push('apiTokens'); }
        if (s.displayKeys) { x.displayKeys = { ...(x.displayKeys || {}), ...s.displayKeys }; applied.push('displayKeys'); }
        if (s.devices) { x.devices = s.devices; applied.push('devices'); }
        if (s.passwordHash && s.passwordHash !== x.passwordHash) {
          x.passwordHash = s.passwordHash;
          x.passwordIsDefault = false;
          delete x.passwordFromEnv;
          applied.push('password');
          loggedOut = true;
        }
      });
    }
    // Keys of screens that are not in the imported config are dropped; devices of missing screens move to the default.
    if (applied.includes('displayKeys') || applied.includes('devices')) syncDisplayKeys();
    logActivity('config.imported', {
      req,
      level: applied.length ? 'warn' : 'info',
      data: { revision: result.config.revision, sections: Array.isArray(b.sections) && b.sections.length ? b.sections : 'all', secrets: applied, fromVersion: parsed.fromVersion },
    });
    if (loggedOut) {
      rotateSessionEpoch();
      req.session = null;
      return res.json({ ok: true, config: result.config, loggedOut: true });
    }
    res.json({ ok: true, config: result.config });
  });

  // ---------------- activity (§6.4) ----------------
  r.get('/activity', (req, res) => {
    const q = req.query;
    const s = (v, max = 100) => (typeof v === 'string' ? v.slice(0, max) : '');
    const level = LEVELS.includes(q.level) ? q.level : '';
    res.json(listActivity({ type: s(q.type), level, q: s(q.q), actor: s(q.actor), before: s(q.before, 40), limit: Number(q.limit) || 50 }));
  });

  r.delete('/activity', (req, res) => {
    clearActivity();
    logActivity('activity.cleared', { req });
    res.json({ ok: true });
  });

  // ---------------- dashboard (§7.1) ----------------
  r.get('/dashboard', wrap(async (req, res) => {
    const cfg = getConfig();
    const tz = cfg.datetime.timezone;
    const now = new Date();
    const today = localDate(now, tz);
    const displays = listDisplays();
    const sources = sourceStatus();
    let nextEvents = [];
    try {
      const ev = await getEvents({ from: today, to: addDays(today, 7), screen: null });
      nextEvents = ev.events.filter((e) => (e.allDay ? e.end > today : Date.parse(e.end) > now.getTime())).slice(0, 10);
    } catch (err) {
      console.warn('[dashboard] events:', err.message);
    }
    const w = cachedWeather();
    const weather = w ? { ...w.current, locationName: w.locationName, updatedAt: w.updatedAt, min: w.today?.min ?? null, max: w.today?.max ?? null } : null;
    res.json({
      version,
      uptime: Math.round(process.uptime()),
      revision: cfg.revision,
      screens: cfg.screens.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, isDefault: s.id === cfg.defaultScreen,
        displaysOnline: displays.filter((d) => d.connected && d.screenId === s.id).length,
      })),
      displays,
      nextEvents,
      sources,
      weather,
      announcements: listAnnouncements().active,
      schedulesNow: schedulesNow(cfg, now),
      activity: recentActivity(8),
      warnings: dashboardWarnings({ secrets: getSecrets(), sources, displays, cfg }),
    });
  }));

  return r;
}
