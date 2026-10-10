// Microsoft calendars (Outlook.com, Hotmail, Microsoft 365) through Microsoft Graph, read only: the parts both
// editions share (endpoints, scopes, ID token checks, calendar list items and the event mapping). The HTTP calls and
// the token storage live in each server (server/microsoft.js here, microsoftApi.ts in Marco Cloud).
//
// Scopes: openid email profile offline_access Calendars.Read Calendars.Read.Shared
//   Calendars.Read          read the account's own calendars and their events
//   Calendars.Read.Shared   read the calendars other people shared with the account (a family calendar, a partner's)
//   offline_access          a refresh token, so screens keep updating with nobody signed in
//   openid email profile    an ID token with the account's email (email, else preferred_username), to name the
//                           account. User.Read is not needed.
import { isValidTimeZone, tzOffsetMinutes } from './lib/tz.js';

export const MS_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const MS_AUTH_URL = `${MS_AUTHORITY}/authorize`;
export const MS_TOKEN_URL = `${MS_AUTHORITY}/token`;
export const GRAPH_API = 'https://graph.microsoft.com/v1.0';
export const CALENDAR_SCOPE = 'Calendars.Read';
export const SHARED_CALENDAR_SCOPE = 'Calendars.Read.Shared';
export const CONNECT_SCOPES = `openid email profile offline_access ${CALENDAR_SCOPE} ${SHARED_CALENDAR_SCOPE}`;
/** A refresh asks for the Graph permissions again, so the access token is for Graph. */
export const REFRESH_SCOPES = `offline_access ${CALENDAR_SCOPE} ${SHARED_CALENDAR_SCOPE}`;
export const CONNECT_CALLBACK_PATH = '/auth/microsoft/callback';
/** Where the owner removes the app's access at Microsoft (there is no revoke endpoint for these tokens). */
export const MANAGE_ACCESS_URLS = ['https://account.live.com/consent/Manage', 'https://myapps.microsoft.com'];
/** OAuth error codes Microsoft may send back to the redirect URI; each becomes microsoft_<code>. */
export const MICROSOFT_OAUTH_ERRORS = new Set([
  'access_denied', 'consent_required', 'interaction_required', 'login_required', 'invalid_request', 'invalid_scope',
  'unauthorized_client', 'unsupported_response_type', 'server_error', 'temporarily_unavailable',
]);
/** Token endpoint errors that mean the account has to be connected again. */
export const MICROSOFT_AUTH_ERRORS = new Set(['invalid_grant', 'interaction_required', 'consent_required', 'login_required']);

export const EVENT_PAGE_SIZE = 500;
export const EVENT_FIELDS = 'id,subject,bodyPreview,location,start,end,isAllDay,isCancelled,type';
export const CALENDAR_FIELDS = 'id,name,color,hexColor,isDefaultCalendar,owner';
/** Calendar groups read for calendars the flat list may leave out (shared calendars under "People's calendars"). */
export const MAX_CALENDAR_GROUPS = 10;

/** The authorize URL of a connect: code flow with PKCE (S256), the account picker always shown. */
export function microsoftAuthUrl({ clientId, redirectUri, state, challenge, lang }) {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: CONNECT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  if (lang) q.set('ui_locales', lang);
  return `${MS_AUTH_URL}?${q}`;
}

/**
 * The token answer's scope list holds a permission to read the account's own calendars (short form or with the Graph
 * resource in front). Calendars.Read.Shared alone is not enough: the default calendar needs Calendars.Read.
 */
export function scopeGranted(scope) {
  return String(scope || '').split(/\s+/).some((s) => /^(?:https:\/\/graph\.microsoft\.com\/)?calendars\.read(?:write)?$/i.test(s));
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

function b64urlJson(part) {
  const b64 = String(part).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

/**
 * The account's email (lower case) from the ID token of a code exchange: `email`, else `preferred_username` when it is
 * an address. The token came straight from the token endpoint over TLS, in exchange for the app's secret and the PKCE
 * verifier, so its signature is not checked again (OpenID Connect Core 3.1.3.7); audience, issuer and expiry are.
 * Null when there is no usable address.
 */
export function idTokenEmail(idToken, clientId, now = Date.now()) {
  if (typeof idToken !== 'string' || !idToken) return null;
  let claims;
  try {
    claims = b64urlJson(idToken.split('.')[1] ?? '');
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  if (!clientId || claims.aud !== clientId) return null;
  const tid = typeof claims.tid === 'string' ? claims.tid : '';
  if (!/^[0-9a-f-]{36}$/i.test(tid) || claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return null;
  if (!(Number(claims.exp) * 1000 > now - 300_000)) return null;
  for (const c of [claims.email, claims.preferred_username]) {
    if (typeof c !== 'string') continue;
    const e = c.normalize('NFC').trim().toLowerCase();
    if (e.length <= 254 && EMAIL.test(e)) return e;
  }
  return null;
}

/** The next page link, only when it stays on Graph (the bearer token never goes anywhere else). */
export function graphNextLink(j) {
  const next = j?.['@odata.nextLink'];
  return typeof next === 'string' && next.startsWith(`${GRAPH_API}/`) ? next : '';
}

export const calendarsUrl = () => `${GRAPH_API}/me/calendars?${new URLSearchParams({ $select: CALENDAR_FIELDS, $top: '100' })}`;
export const calendarGroupsUrl = () => `${GRAPH_API}/me/calendarGroups?${new URLSearchParams({ $select: 'id', $top: String(MAX_CALENDAR_GROUPS) })}`;
export const groupCalendarsUrl = (groupId) =>
  `${GRAPH_API}/me/calendarGroups/${encodeURIComponent(groupId)}/calendars?${new URLSearchParams({ $select: CALENDAR_FIELDS, $top: '100' })}`;

/** calendarView of one calendar for [from, to): Graph expands recurring series into their occurrences. */
export function calendarViewUrl(calendarId, from, to) {
  const q = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: EVENT_FIELDS,
    $orderby: 'start/dateTime',
    $top: String(EVENT_PAGE_SIZE),
  });
  return `${GRAPH_API}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${q}`;
}

/** Graph headers: times in UTC. */
export const graphHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'outlook.timezone="UTC"' });

/** Outlook's preset calendar colours (calendarColor), for calendars without a hexColor. */
const PRESET_COLORS = {
  lightBlue: '#a4c2f4', lightGreen: '#a7d7a5', lightOrange: '#f9c28b', lightGray: '#c7c7c7', lightYellow: '#f6e58d',
  lightTeal: '#8fd3d0', lightPink: '#f4b0c8', lightBrown: '#c9a98a', lightRed: '#f19999',
};

/**
 * A Graph calendar as a MicrosoftCalendarListItem ({ id, name, color?, isDefault?, owner? }), or null. `owner` is set
 * for a calendar someone else shared with the account.
 */
export function calendarItem(c, accountEmail = '') {
  if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 512) return null;
  const item = { id: c.id, name: String(c.name || 'Calendar').slice(0, 200) };
  if (typeof c.hexColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.hexColor)) item.color = c.hexColor.toLowerCase();
  else if (typeof c.color === 'string' && Object.hasOwn(PRESET_COLORS, c.color)) item.color = PRESET_COLORS[c.color];
  if (c.isDefaultCalendar === true) item.isDefault = true;
  const owner = c.owner?.address;
  if (typeof owner === 'string' && owner && owner.toLowerCase() !== String(accountEmail).toLowerCase()) item.owner = owner.slice(0, 254);
  return item;
}

const UTC_NAMES = new Set(['utc', 'etc/utc', 'gmt', 'etc/gmt', 'coordinated universal time', 'tzone://microsoft/utc']);

/** A Graph dateTimeTimeZone as a Date. UTC unless Graph ignored the Prefer header and named an IANA zone. */
export function graphInstant(v) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?$/.exec(String(v?.dateTime ?? ''));
  if (!m) return null;
  const ms = (m[2] ?? '').slice(1, 4).padEnd(3, '0');
  const asUtc = new Date(`${m[1]}.${ms || '000'}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const tz = String(v?.timeZone ?? 'UTC');
  if (UTC_NAMES.has(tz.toLowerCase()) || !isValidTimeZone(tz)) return asUtc;
  return new Date(asUtc.getTime() - tzOffsetMinutes(asUtc, tz) * 60_000);
}

/**
 * The calendar day of an all-day boundary. Graph sends all-day events at midnight; should it shift one into UTC from
 * the event's own zone (22:00 the day before for Madrid, 04:00 for New York), the nearest midnight is the right day.
 */
function allDayDate(v) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(v?.dateTime ?? ''));
  if (!m) return null;
  const t = Date.parse(`${m[1]}T00:00:00Z`) + (Number(m[2]) * 60 + Number(m[3])) * 60_000 + 12 * 3_600_000;
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

const addDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * A Graph event as a raw instance ({ uid, title, description, location, allDay, start, end }: all-day dates as
 * YYYY-MM-DD with an exclusive end, timed ones as Date), or null (cancelled, series master, unreadable).
 */
export function graphToRaw(it) {
  if (!it || it.isCancelled === true || it.type === 'seriesMaster' || !it.start) return null;
  const base = {
    uid: String(it.id || ''),
    title: String(it.subject || ''),
    description: String(it.bodyPreview || ''),
    location: String(it.location?.displayName || ''),
  };
  if (it.isAllDay === true) {
    const start = allDayDate(it.start);
    if (!start) return null;
    const endDay = allDayDate(it.end);
    return { ...base, allDay: true, start, end: endDay && endDay > start ? endDay : addDay(start) };
  }
  const start = graphInstant(it.start);
  if (!start) return null;
  let end = graphInstant(it.end) ?? new Date(start);
  if (end < start) end = new Date(start);
  return { ...base, allDay: false, start, end };
}
