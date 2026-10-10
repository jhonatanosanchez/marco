// Capability block for GET /api/health. The admin and the display read it to decide which sections,
// actions and limits apply. Marco Cloud answers the same shape with its own values; a server that sends
// no `features` field is treated as having every feature on.
import { googleConfigured } from './google.js';
import { CODE_LENGTH } from './pairing.js';

/** Every feature key, in the order docs/API.md lists them. */
export const FEATURE_KEYS = Object.freeze([
  'homeassistant', 'news', 'customCss', 'gallery', 'schedules', 'announcements', 'displayCommands',
  'openDisplayAccess', 'insecureTls', 'googleCalendar', 'googleLogin', 'passwordLogin', 'apiTokens',
  'webhooks', 'backups', 'importExport', 'includeSecrets', 'activity', 'setupWizard', 'status', 'accountMenu', 'updates',
]);

/** Feature flags of a self-hosted server: all on (`updates` too: the update banner and settings), Google follows
 *  its credentials, no account menu. */
export function selfHostedFeatures() {
  const google = googleConfigured();
  const out = {};
  for (const k of FEATURE_KEYS) out[k] = true;
  out.googleCalendar = google;
  out.googleLogin = google;
  out.accountMenu = false;
  return out;
}

/** Live update channel for displays: 'sse' unless MARCO_LIVE=poll. */
export const liveMode = (env = process.env) => (String(env.MARCO_LIVE || '').trim().toLowerCase() === 'poll' ? 'poll' : 'sse');

/**
 * Body of GET /api/health. `lanAddresses` is only passed for a client on this machine (routes/public.js): the
 * pairing screen of a kiosk opened on http://localhost shows them instead of "localhost".
 */
export function healthBody({ version, env = process.env, lanAddresses }) {
  const body = {
    ok: true,
    uptime: Math.round(process.uptime()),
    version,
    live: liveMode(env),
    edition: 'self-hosted',
    tenancy: 'single',
    runtime: 'node',
    pairCodeLength: CODE_LENGTH,
    features: selfHostedFeatures(),
  };
  if (Array.isArray(lanAddresses) && lanAddresses.length) body.lanAddresses = lanAddresses.slice(0, 3);
  return body;
}
