// Modo Echo Show (fork fsrhome): lógica pura, sin DOM, para probarla en Node.
// Horario de apertura, guardia de fps y las URLs de la recarga a lite / de la recarga matutina.
import type { EchoSettings } from '../shared/types';

export const ECHO_DEFAULTS: EchoSettings = {
  enabled: false, keepAlive: 'mp3', openFrom: '05:00', openTo: '16:00', fullscreenOnTap: true, fpsGuard: true,
};
export const FPS_THRESHOLD = 30;
export const FPS_SAMPLES = 10;
export const FPS_WARMUP_MS = 10_000;

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
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

export function hmToMin(s: string): number {
  if (typeof s !== 'string' || !HHMM.test(s)) return -1;
  return +s.slice(0, 2) * 60 + +s.slice(3, 5);
}

/** ¿Abierto en este minuto del día? desde = hasta (o horas inválidas) = siempre abierto. */
export function isOpenAt(minuteOfDay: number, from: string, to: string): boolean {
  const f = hmToMin(from), t = hmToMin(to);
  if (f < 0 || t < 0 || f === t) return true;
  return f < t ? minuteOfDay >= f && minuteOfDay < t : minuteOfDay >= f || minuteOfDay < t;
}

/** Decide pasar a lite: promedio de FPS_SAMPLES muestras (1/s) bajo FPS_THRESHOLD, tras FPS_WARMUP_MS. */
export class FpsGuard {
  private samples: number[] = [];
  private visibleSince: number;
  private fired: boolean;

  constructor(private now: () => number, alreadyLite: boolean) {
    this.visibleSince = now();
    this.fired = alreadyLite;
  }

  markVisible(): void {
    this.visibleSince = this.now();
    this.samples = [];
  }

  sample(fps: number): boolean {
    if (this.now() - this.visibleSince < FPS_WARMUP_MS) return false;
    this.samples.push(fps);
    if (this.samples.length > FPS_SAMPLES) this.samples.shift();
    if (this.fired || this.samples.length < FPS_SAMPLES) return false;
    if ((this.average() ?? Infinity) >= FPS_THRESHOLD) return false;
    this.fired = true;
    return true;
  }

  average(): number | null {
    if (!this.samples.length) return null;
    return Math.round(this.samples.reduce((a, b) => a + b, 0) / this.samples.length);
  }
}

export function liteUrl(href: string): string {
  const u = new URL(href);
  u.searchParams.set('lite', '1');
  u.searchParams.set('echoGuard', '1');
  return u.toString();
}

export function cleanUrl(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('lite');
  u.searchParams.delete('echoGuard');
  return u.toString();
}
