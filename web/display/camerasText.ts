// Cámaras (fork fsrhome): partes puras de la pantalla (probadas con node --test, server/test/cameras-display.test.js).
// Sin imports de runtime a propósito.
import type { CameraActivity, CameraAlert } from '../shared/types';

type T = (key: string, vars?: Record<string, string | number>) => string;

export const ACTIVITY_WINDOW_MS = 30 * 60_000;
/** una alerta más vieja que esto llegó por una reconexión: no se abre */
export const ALERT_FRESH_MS = 60_000;

/** "Persona · hace 5 min", "Coche · ahora" o '' (sin actividad en 30 min). */
export function cameraLabel(a: CameraActivity | undefined, nowMs: number, t: T): string {
  if (!a || typeof a.startTime !== 'number') return '';
  const age = nowMs - a.startTime * 1000;
  if (age > ACTIVITY_WINDOW_MS) return '';
  const what = a.label === 'person' ? t('camPerson') : a.label === 'car' ? t('camCar') : a.label;
  const min = Math.floor(Math.max(0, age) / 60_000);
  return `${what} · ${min < 1 ? t('camNow') : t('camAgo', { n: min })}`;
}

export const alertIsFresh = (a: Pick<CameraAlert, 'startTime'>, nowMs: number): boolean => nowMs - a.startTime * 1000 <= ALERT_FRESH_MS;

/** Tamaño de la cuadrícula: 2 columnas de recuadros 16:9 dentro de maxW × maxH. */
export function gridBox(maxW: number, maxH: number, count: number): [number, number] {
  const cols = count > 1 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(count / cols));
  let w = maxW;
  let h = ((w / cols) * 9) / 16 * rows;
  if (h > maxH) {
    h = maxH;
    w = ((h / rows) * 16) / 9 * cols;
  }
  return [Math.floor(w), Math.floor(h)];
}
