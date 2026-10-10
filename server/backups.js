// rotating config backups. Export, import and repair are pure and live in server/core/backupsCore.js.
// See docs/API.md and docs/ARCHITECTURE.md. Files live in data/backups/:
//   config-<YYYYMMDDTHHMMSSZ>-r<revision>-<reason>.json   (reason: save | manual | restore | import; rotated, keep 20)
//   config-v1-premigration.json                            (written once by the v1 → v2 migration; never rotated)
import fs from 'node:fs';
import path from 'node:path';
import { paths, writeFileAtomic } from './store.js';
import { KEEP_BACKUPS, COALESCE_MS } from './core/backupsCore.js';

export * from './core/backupsCore.js';

export const BACKUP_ID_RE = /^config-(\d{8}T\d{6}Z-r\d+-(save|manual|restore|import)|v1-premigration)\.json$/;
const ROTATED_RE = /^config-(\d{8})T(\d{6})Z-r(\d+)-(save|manual|restore|import)\.json$/;
export const PREMIGRATION_ID = 'config-v1-premigration.json';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function parseName(name) {
  const m = ROTATED_RE.exec(name);
  if (!m) return null;
  const [, ymd, hms, rev, reason] = m;
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
  return { createdAt: new Date(iso).toISOString(), revision: Number(rev), reason };
}

function rotatedFiles() {
  let names = [];
  try { names = fs.readdirSync(paths.backups); } catch { return []; }
  // Name order == chronological order (fixed-width UTC stamp first); revision breaks ties within one second.
  return names.filter((n) => ROTATED_RE.test(n)).sort((a, b) => {
    const pa = parseName(a);
    const pb = parseName(b);
    return a.slice(0, 23) === b.slice(0, 23) ? pa.revision - pb.revision : a < b ? -1 : 1;
  });
}

function rotate() {
  const files = rotatedFiles();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    try { fs.unlinkSync(path.join(paths.backups, f)); } catch { /* ignore */ }
  }
}

/** Write the given config (object) as a backup with `reason`. Returns its BackupInfo. */
export function writeBackup(cfg, reason, now = new Date()) {
  fs.mkdirSync(paths.backups, { recursive: true });
  const id = `config-${stamp(now)}-r${Number(cfg?.revision) || 0}-${reason}.json`;
  writeFileAtomic(path.join(paths.backups, id), JSON.stringify(cfg, null, 2));
  rotate();
  return backupInfo(id);
}

/**
 * Called by saveConfig() before the config file is overwritten. Copies the current file unless the newest
 * backup is a `save` backup younger than COALESCE_MS (bursts of saves keep the state before the burst).
 * @returns {object|null} BackupInfo of the new backup, or null when coalesced / nothing to back up
 */
export function backupBeforeSave(current, now = new Date()) {
  if (!current) return null;
  const files = rotatedFiles();
  const newest = files.length ? parseName(files[files.length - 1]) : null;
  if (newest && newest.reason === 'save' && now.getTime() - Date.parse(newest.createdAt) < COALESCE_MS
    && now.getTime() >= Date.parse(newest.createdAt)) return null;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(paths.config, 'utf8')); } catch { raw = current; }
  return writeBackup(raw, 'save', now);
}

/** BackupInfo for a file id (null when missing). Content is read to count screens/sources. */
export function backupInfo(id) {
  const file = path.join(paths.backups, id);
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const meta = parseName(id) || { createdAt: st.mtime.toISOString(), revision: 0, reason: 'migration' };
  let screens = 0;
  let sources = 0;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    screens = Array.isArray(c.screens) ? c.screens.length : 1;
    sources = Array.isArray(c.calendar?.sources) ? c.calendar.sources.length : 0;
    if (id === PREMIGRATION_ID && Number.isInteger(c.revision)) meta.revision = c.revision;
  } catch { /* unreadable: counts stay 0 */ }
  return { id, createdAt: meta.createdAt, revision: meta.revision, reason: meta.reason, size: st.size, screens, sources };
}

/** Every backup, newest first (the pre-migration copy included). */
export function listBackups() {
  const ids = rotatedFiles().reverse();
  if (fs.existsSync(path.join(paths.backups, PREMIGRATION_ID))) ids.push(PREMIGRATION_ID);
  return ids.map(backupInfo).filter(Boolean)
    .sort((a, b) => (a.createdAt === b.createdAt ? b.revision - a.revision : a.createdAt < b.createdAt ? 1 : -1));
}

/** Absolute path of a backup file, or null when the id is not a valid / existing backup. */
export function backupPath(id) {
  if (typeof id !== 'string' || !BACKUP_ID_RE.test(id)) return null;
  const file = path.join(paths.backups, id);
  return fs.existsSync(file) ? file : null;
}

export function readBackup(id) {
  const file = backupPath(id);
  if (!file) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function deleteBackup(id) {
  const file = backupPath(id);
  if (!file) return false;
  fs.unlinkSync(file);
  return true;
}
