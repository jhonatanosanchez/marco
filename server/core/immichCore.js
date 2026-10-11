// Immich (self-hosted photo library) as a background source: the pure parts shared by the validator, the server
// client (server/immich.js) and the tests. No network here.

/** Immich ids (albums, assets) are UUIDs. */
export const IMMICH_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** API keys Immich creates: letters and digits (older servers), `-` and `_` allowed. */
export const IMMICH_KEY_RE = /^[A-Za-z0-9_-]{10,128}$/;
/** Albums one screen can play (merged, duplicates removed). */
export const MAX_IMMICH_ALBUMS = 20;
/** Scopes the API key needs: list albums, read their assets, download the preview images. */
export const IMMICH_SCOPES = ['album.read', 'asset.read', 'asset.view'];
/** Portrait photos on a landscape screen (and the other way round): 'auto' = blurred fill for Immich photos only. */
export const PORTRAIT_FITS = ['auto', 'blur', 'crop'];

/** GET /api/admin/immich/key: whether a key is stored and its last 4 characters (never the key). */
export function immichKeyStatus(key) {
  const k = String(key || '');
  return { set: k.length > 0, hint: k.length >= 8 ? k.slice(-4) : '' };
}

/** "https://photos.example.com/api/" → "https://photos.example.com" (no trailing slash, no /api). */
export function normalizeImmichUrl(u) {
  let s = String(u ?? '').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
  return s;
}

/** { major, minor, patch } from a /server/version answer, or null. */
export function parseVersion(v) {
  if (!v || typeof v !== 'object') return null;
  const n = (x) => (Number.isInteger(x) && x >= 0 ? x : null);
  const major = n(v.major), minor = n(v.minor), patch = n(v.patch) ?? 0;
  return major === null || minor === null ? null : { major, minor, patch };
}

export const versionText = (v) => (v ? `${v.major}.${v.minor}.${v.patch}` : '');

/** a >= b, comparing major.minor only. */
export function atLeast(v, major, minor) {
  if (!v) return false;
  return v.major > major || (v.major === major && v.minor >= minor);
}

/** Servers from 1.135 list an album's assets through POST /search/metadata { albumIds } (3.x has no album.assets). */
export const usesSearch = (v) => atLeast(v, 1, 135);

/** Required scopes the key lacks (`all` covers everything). Unknown permissions (older servers) = none missing. */
export function missingScopes(permissions) {
  if (!Array.isArray(permissions)) return [];
  if (permissions.includes('all')) return [];
  return IMMICH_SCOPES.filter((s) => !permissions.includes(s));
}

/** Album list entry for the admin picker. */
export function mapAlbum(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !IMMICH_ID_RE.test(a.id)) return null;
  const cover = typeof a.albumThumbnailAssetId === 'string' && IMMICH_ID_RE.test(a.albumThumbnailAssetId) ? a.albumThumbnailAssetId : null;
  return {
    id: a.id.toLowerCase(),
    name: typeof a.albumName === 'string' ? a.albumName.slice(0, 200) : '',
    count: Number.isInteger(a.assetCount) ? a.assetCount : 0,
    cover: cover ? cover.toLowerCase() : null,
    shared: a.shared === true,
    start: typeof a.startDate === 'string' ? a.startDate.slice(0, 10) : null,
    end: typeof a.endDate === 'string' ? a.endDate.slice(0, 10) : null,
  };
}

/** Assets that can be shown: images only, not trashed, not offline, not hidden or locked. Archived ones stay. */
export function showableAsset(a, { favoritesOnly = false } = {}) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !IMMICH_ID_RE.test(a.id)) return false;
  if (a.type !== 'IMAGE') return false;
  if (a.isTrashed === true || a.isOffline === true) return false;
  if (a.visibility === 'hidden' || a.visibility === 'locked') return false;
  if (favoritesOnly && a.isFavorite !== true) return false;
  return true;
}

const shortStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Compact item kept in memory and on disk: { id, t (local date and time taken, YYYY-MM-DDTHH:MM:SS, or only the
 * date; sort key, the caption shows the date), name (sort key only, never shown), city, country, v (version for the
 * image URL) }.
 */
export function compactAsset(a) {
  const ex = a.exifInfo && typeof a.exifInfo === 'object' ? a.exifInfo : {};
  const when = shortStr(a.localDateTime, 40) || shortStr(ex.dateTimeOriginal, 40) || shortStr(a.fileCreatedAt, 40);
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(when) ? when.slice(0, 19) : /^\d{4}-\d{2}-\d{2}/.test(when) ? when.slice(0, 10) : '';
  const ms = Date.parse(shortStr(a.updatedAt, 40) || shortStr(a.fileModifiedAt, 40));
  return {
    id: a.id.toLowerCase(),
    t,
    name: shortStr(a.originalFileName, 255),
    city: shortStr(ex.city, 80),
    country: shortStr(ex.country, 80),
    v: Number.isFinite(ms) ? Math.round(ms / 1000).toString(36) : '0',
  };
}

/** Place line for the caption: "Valencia, Spain" (either part may be missing). */
export const placeOf = (it) => [it.city, it.country].filter(Boolean).join(', ');

/** Merge album lists (in order), dropping duplicates. */
export function mergeItems(lists) {
  const seen = new Set();
  const out = [];
  for (const l of lists) {
    for (const it of l || []) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

/** Error code for an Immich HTTP status. */
export function errorCodeFor(status) {
  if (status === 401) return 'invalid_key';
  if (status === 403) return 'missing_scope';
  if (status === 404) return 'not_found';
  return 'http';
}

/** Image types the media proxy passes on. */
export const IMMICH_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'image/avif': 'avif' };

/** Content type from the first bytes (JPEG, PNG, WebP, AVIF), or null. */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  const asc = (a, b) => String.fromCharCode(...buf.subarray(a, b));
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'WEBP') return 'image/webp';
  if (asc(4, 8) === 'ftyp' && /^avi[fs]$/.test(asc(8, 12))) return 'image/avif';
  return null;
}
