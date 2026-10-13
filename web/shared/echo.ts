// Modo Echo Show (fork fsrhome): defaults y normalización de screen.echo, compartidos por la pantalla y el admin.
import type { EchoSettings } from './types';

export const ECHO_DEFAULTS: EchoSettings = {
  enabled: false, keepAlive: 'mp3', openFrom: '05:00', openTo: '16:00', fullscreenOnTap: true, fpsGuard: true,
};

export const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** La config del servidor ya viene validada; esto cubre configs viejas o incompletas campo por campo. */
export function normalizeEcho(raw: unknown): EchoSettings {
  const r = isObj(raw) ? raw : {};
  const D = ECHO_DEFAULTS;
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const h = (v: unknown, d: string) => (typeof v === 'string' && HHMM.test(v) ? v : d);
  return {
    enabled: b(r.enabled, D.enabled),
    keepAlive: r.keepAlive === 'off' || r.keepAlive === 'mp3' ? r.keepAlive : D.keepAlive,
    openFrom: h(r.openFrom, D.openFrom),
    openTo: h(r.openTo, D.openTo),
    fullscreenOnTap: b(r.fullscreenOnTap, D.fullscreenOnTap),
    fpsGuard: b(r.fpsGuard, D.fpsGuard),
  };
}
