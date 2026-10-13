// Profile photos of the family members on disk: data/avatars/<id>.<jpg|png|webp>, where <id> is the start of the
// SHA-256 of the clean file (core/familyPhotoCore.js checks and cleans every upload). The config only holds the id
// (family.members[].photo), so a member with a new photo gets a new address and the screens never show the old one.
//
// Cleaning up: a photo the config does not use is deleted UNUSED_GRACE_MS after it was last used or uploaded: a
// member removed, a photo replaced or taken away, an upload the admin never saved. The week in between lets a config
// backup restored soon after bring the photo back with it. Restoring an older backup whose photo is already gone
// shows that member's emoji (the screens are not even given an address for it: photoUrl()).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { events, getConfig, paths, writeFileAtomic } from './store.js';
import { cleanFamilyPhoto, photoIdsOf, photoPath, PHOTO_ID_RE, PHOTO_TYPES, MAX_PHOTO_BYTES } from './core/familyPhotoCore.js';

/** A photo the config does not use is kept this long (an unsaved upload, a backup restored soon after). */
export const UNUSED_GRACE_MS = 7 * 24 * 3600_000;
/** Most photo files kept at once (6 members, a few unsaved tries). */
export const MAX_STORED = 40;
const NAME_RE = /^([a-f0-9]{24})\.(jpg|png|webp)$/;
const TYPE_OF_EXT = Object.fromEntries(Object.entries(PHOTO_TYPES).map(([t, e]) => [e, t]));

export const avatarsDir = () => path.join(paths.data, 'avatars');

function listFiles() {
  try {
    return fs.readdirSync(avatarsDir()).filter((n) => NAME_RE.test(n));
  } catch {
    return [];
  }
}

/** The stored file of photo `id`: { file, type, size, mtimeMs } or null. */
export function photoFile(id) {
  if (!PHOTO_ID_RE.test(String(id || ''))) return null;
  for (const ext of Object.keys(TYPE_OF_EXT)) {
    const file = path.join(avatarsDir(), `${id}.${ext}`);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) return { file, type: TYPE_OF_EXT[ext], size: st.size, mtimeMs: st.mtimeMs };
    } catch { /* next */ }
  }
  return null;
}

/** Address of photo `id` for the screens and the family page, or null when its file is gone (the emoji then). */
export const photoUrl = (id) => (photoFile(id) ? photoPath(id) : null);

/**
 * Check, clean and store an uploaded photo. Same picture twice = same id (stored once).
 * @returns {{ id: string, type: string, width: number } | { error: string }}
 */
export function storeFamilyPhoto(bytes) {
  const r = cleanFamilyPhoto(bytes instanceof Uint8Array ? bytes : new Uint8Array(0));
  if (!r.ok) return { error: r.error };
  const id = crypto.createHash('sha256').update(r.bytes).digest('hex').slice(0, 24);
  if (!photoFile(id)) {
    collectUnused();
    if (listFiles().length >= MAX_STORED) makeRoom();
    if (listFiles().length >= MAX_STORED) return { error: 'too_many' };
    fs.mkdirSync(avatarsDir(), { recursive: true });
    writeFileAtomic(path.join(avatarsDir(), `${id}.${r.ext}`), Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.length));
  } else {
    // a fresh upload of a photo that was waiting to be cleaned up: it starts its day again
    try { const now = new Date(); fs.utimesSync(photoFile(id).file, now, now); } catch { /* ignore */ }
  }
  return { id, type: r.type, width: r.width };
}

/** At the limit: the oldest photos the config does not use go first (many crop tries in one day never lock uploads). */
function makeRoom(cfg = getConfig()) {
  const used = photoIdsOf(cfg?.family);
  const files = listFiles()
    .map((name) => ({ id: NAME_RE.exec(name)[1], name }))
    .filter((f) => !used.has(f.id))
    .map((f) => {
      try { return { ...f, t: fs.statSync(path.join(avatarsDir(), f.name)).mtimeMs }; } catch { return { ...f, t: 0 }; }
    })
    .sort((a, b) => a.t - b.t);
  let over = listFiles().length - MAX_STORED + 1;
  for (const f of files) {
    if (over <= 0) break;
    try { remove(f.id); over--; } catch { /* next */ }
  }
}

function remove(id) {
  for (const ext of Object.keys(TYPE_OF_EXT)) fs.rmSync(path.join(avatarsDir(), `${id}.${ext}`), { force: true });
}

/** Delete the photos the config does not use that were last used or uploaded more than UNUSED_GRACE_MS ago. */
export function collectUnused({ cfg = getConfig(), now = Date.now() } = {}) {
  const used = photoIdsOf(cfg?.family);
  const gone = [];
  for (const name of listFiles()) {
    const id = NAME_RE.exec(name)[1];
    if (used.has(id)) continue;
    let old = false;
    try { old = now - fs.statSync(path.join(avatarsDir(), name)).mtimeMs > UNUSED_GRACE_MS; } catch { old = false; }
    if (old) {
      try { remove(id); gone.push(id); } catch (err) { console.warn('[family] cannot delete photo:', err.message); }
    }
  }
  return gone;
}

/** The config stopped using these photos: their week starts now (the file's time is the last time it was used). */
function markDropped(ids, now = new Date()) {
  for (const id of ids) {
    const f = photoFile(id);
    if (f) try { fs.utimesSync(f.file, now, now); } catch { /* ignore */ }
  }
}

let sweep = null;
/** Clean up now and every 6 hours (server/index.js). */
export function startPhotoSweep() {
  const run = () => {
    try { collectUnused(); } catch (err) { console.warn('[family] photo cleanup failed:', err.message); }
  };
  run();
  if (!sweep) {
    sweep = setInterval(run, 6 * 3600_000);
    sweep.unref?.();
  }
}

/** Photos of the family config for an export bundle: { [id]: base64 }. */
export function exportFamilyPhotos(cfg = getConfig()) {
  const out = {};
  for (const id of photoIdsOf(cfg.family)) {
    const f = photoFile(id);
    if (!f) continue;
    try { out[id] = fs.readFileSync(f.file).toString('base64'); } catch { /* skip */ }
  }
  return out;
}

/**
 * Photos of an imported bundle ({ [id]: base64 }): each one is checked and cleaned like an upload, and kept only
 * when its id matches its content and the (already imported) config uses it. Returns how many were stored.
 */
export function importFamilyPhotos(raw, cfg = getConfig()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
  const used = photoIdsOf(cfg.family);
  let n = 0;
  for (const [id, b64] of Object.entries(raw)) {
    if (!used.has(id) || typeof b64 !== 'string' || b64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 4) continue;
    const r = storeFamilyPhoto(new Uint8Array(Buffer.from(b64, 'base64')));
    if (r.id === id) n++;
    else if (r.id && !used.has(r.id)) remove(r.id);
  }
  return n;
}

// The config was saved: the photos it stopped using start their week, the ones whose week is over go.
events.on('config', (cfg, prev) => {
  try {
    const before = photoIdsOf(prev?.family);
    const now = photoIdsOf(cfg?.family);
    const dropped = [...before].filter((id) => !now.has(id));
    if (dropped.length) {
      markDropped(dropped);
      collectUnused({ cfg });
    }
  } catch (err) {
    console.warn('[family] photo cleanup failed:', err.message);
  }
});
