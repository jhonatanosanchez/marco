// Error codes a server can answer with (self-hosted Marco or Marco Cloud) and the message the admin shows for each.
// api.ts uses apiErrorMessage() for every failed call, so a section that toasts `error.message` shows a
// translated sentence instead of the raw code. Messages are Spanish keys for t() (rows in i18n-dict11.ts).
import { t } from './i18n';
import { LIMIT_EXCEEDED } from './util';

export const API_ERROR_MESSAGES = {
  rate_limited: 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
  screen_limit: 'Has llegado al máximo de pantallas.',
  limit_exceeded: LIMIT_EXCEEDED,
  feature_unavailable: 'Esta función no está disponible en este servidor.',
  conflict: 'La configuración se ha guardado en otro sitio mientras editabas. Recarga la página para ver la versión actual.',
  photo_quota: 'No queda espacio para más fotos. Borra alguna y vuelve a intentarlo.',
  readonly: 'Tu cuenta solo puede ver la configuración, no cambiarla.',
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_MESSAGES;

const isCode = (v: unknown): v is ApiErrorCode => typeof v === 'string' && Object.hasOwn(API_ERROR_MESSAGES, v);

/** The known code in an error body: `code` first, then `error` (servers use both). '' when there is none. */
export function apiErrorCode(body: unknown): ApiErrorCode | '' {
  if (!body || typeof body !== 'object') return '';
  const b = body as { code?: unknown; error?: unknown };
  if (isCode(b.code)) return b.code;
  if (isCode(b.error)) return b.error;
  return '';
}

/** Codes a server answers when it could not fetch a calendar or feed URL (Marco Cloud names them this way). */
export const FETCH_ERROR_MESSAGES: Record<string, string> = {
  blocked_url: 'Esa dirección no se puede consultar desde el servidor (red local, nombre interno o puerto no permitido).',
  too_large: 'El archivo es demasiado grande (máx. 2 MB).',
  timeout: 'Tardó demasiado en responder.',
  too_many_redirects: 'Demasiadas redirecciones.',
  http_denied: 'Acceso denegado: comprueba que el enlace sea público o que incluya su clave.',
  http_not_found: 'No encontrado (404): comprueba la dirección.',
  http_error: 'El servidor de origen respondió con un error.',
  fetch_failed: 'No se pudo conectar con esa dirección.',
  not_a_feed: 'No es un feed RSS ni Atom.',
};

/** Translated text for a fetch error code; anything else (a self-hosted server's own message) as it came. */
export const fetchErrorText = (code: string | undefined | null): string =>
  code && Object.hasOwn(FETCH_ERROR_MESSAGES, code) ? t(FETCH_ERROR_MESSAGES[code]) : code || '';

/** Translated message for a known code ('' otherwise). */
export const codeMessage = (code: string): string => (isCode(code) ? t(API_ERROR_MESSAGES[code]) : '');

/**
 * Message of a failed call. Known codes get their translated sentence; otherwise the server's own `error` /
 * `message` text, with up to three `details` (`path: message`, a detail whose message is a known code is
 * translated), or "HTTP <status>".
 */
export function apiErrorMessage(status: number, data: unknown): string {
  const code = apiErrorCode(data);
  const details = data && typeof data === 'object' && Array.isArray((data as any).details) ? ((data as any).details as unknown[]) : null;
  const detailText = details?.length
    ? `: ${details
        .slice(0, 3)
        .map((d: any) => (d && typeof d === 'object' ? `${d.path ?? ''}: ${codeMessage(d.message) || fetchErrorText(d.message)}` : String(d)))
        .join('; ')}`
    : '';
  if (code) return codeMessage(code) + (code === 'limit_exceeded' || code === 'feature_unavailable' ? detailText : '');
  const own = data && typeof data === 'object' ? (data as any).error || (data as any).message : '';
  if (own) return `${own}${detailText}`;
  if (typeof data === 'string' && data.length < 200 && data) return data;
  return `HTTP ${status}`;
}
