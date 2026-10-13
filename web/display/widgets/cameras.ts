// Widget "Cámaras" (fork fsrhome): cuadrícula 2×2 de MJPEG de Frigate a través de este servidor (/media/cameras).
// - Cada MJPEG se reconecta cada 10 min (uno abierto por horas acumula memoria en Silk) y tras un error a los 30 s.
// - pauseCameras(motivo, on): con cualquier motivo activo (vista abierta, Echo cerrado) o la página oculta, la
//   cuadrícula vacía sus src y cierra las conexiones; al quitarse todos, se vuelve a conectar.
// - Tocar un recuadro llama al handler de main.ts (abre la vista a pantalla completa).
import type { CameraActivity, DisplayWidget, FrigateCamera } from '../../shared/types';
import { ctx } from '../ctx';
import { authHeaders, mediaUrl, withScreen } from '../identity';
import { cameraLabel, gridBox } from '../camerasText';
import '../styles-cameras.css';

export const RECONNECT_MS = 10 * 60_000;
export const RETRY_MS = 30_000;
const LABEL_TICK_MS = 30_000;

const pauses = new Set<string>();
const cards = new Set<CameraCard>();
let activity: Record<string, CameraActivity> = {};
let onTap: ((cam: FrigateCamera) => void) | null = null;

export function pauseCameras(reason: string, on: boolean): void {
  const before = pauses.size > 0;
  if (on) pauses.add(reason);
  else pauses.delete(reason);
  if (pauses.size > 0 !== before) cards.forEach((c) => c.sync());
}

export function setCameraActivity(a: Record<string, CameraActivity>): void {
  activity = a && typeof a === 'object' ? a : {};
  cards.forEach((c) => c.paintLabels());
}

export const setCameraTapHandler = (fn: (cam: FrigateCamera) => void): void => void (onTap = fn);

async function loadActivity(): Promise<void> {
  try {
    const r = await fetch(withScreen('/api/display/cameras'), { headers: authHeaders(), cache: 'no-store' });
    if (r.ok) setCameraActivity(((await r.json()) as { activity: Record<string, CameraActivity> }).activity);
  } catch {
    /* sin actividad: las cámaras siguen */
  }
}

document.addEventListener('visibilitychange', () => cards.forEach((c) => c.sync()));

interface Tile { cam: FrigateCamera; box: HTMLElement; img: HTMLImageElement; label: HTMLElement; retry: ReturnType<typeof setTimeout> | null }

const div = (cls: string, text = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  return d;
};

export class CameraCard {
  readonly el: HTMLElement;
  private w: DisplayWidget;
  private tiles: Tile[] = [];
  private running = false;
  private reconnect: ReturnType<typeof setInterval> | null = null;
  private labelTimer: ReturnType<typeof setInterval> | null = null;
  onState: ((s: 'loading' | 'ok' | 'stale' | 'failed') => void) | null = null;

  constructor(w: DisplayWidget) {
    this.w = w;
    this.el = div('uw-media camgrid');
    this.build();
  }

  get hasData(): boolean {
    return this.tiles.length > 0;
  }

  start(): void {
    this.running = true;
    cards.add(this);
    this.onState?.(this.tiles.length ? 'ok' : 'failed');
    this.sync();
    void loadActivity();
    if (!this.labelTimer) this.labelTimer = setInterval(() => this.paintLabels(), LABEL_TICK_MS);
  }

  stop(): void {
    this.running = false;
    cards.delete(this);
    this.disconnect();
    if (this.labelTimer) clearInterval(this.labelTimer);
    this.labelTimer = null;
  }

  update(w: DisplayWidget): void {
    const same = JSON.stringify(w.cameras ?? []) === JSON.stringify(this.w.cameras ?? []);
    this.w = w;
    if (same) return;
    this.disconnect();
    this.build();
    this.sync();
  }

  layout(maxW: number, maxH: number, _place: 'corner' | 'side' | 'full'): void {
    const [w, h] = gridBox(maxW, maxH, this.tiles.length);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
  }

  /** conecta o desconecta según pausas, visibilidad y si está montada */
  sync(): void {
    if (this.running && pauses.size === 0 && !document.hidden) this.connect();
    else this.disconnect();
  }

  paintLabels(): void {
    const now = Date.now();
    for (const t of this.tiles) {
      const s = cameraLabel(activity[t.cam.id], now, ctx.t);
      t.label.textContent = s;
      t.label.hidden = !s;
    }
  }

  private build(): void {
    this.el.textContent = '';
    this.tiles = (this.w.cameras ?? []).map((cam) => {
      const box = div('cam');
      box.dataset.cam = cam.id;
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      const label = div('cam-label');
      label.hidden = true;
      box.append(img, div('cam-name', cam.name), label, div('cam-off', ctx.t('camNoSignal')));
      box.addEventListener('click', () => onTap?.(cam));
      this.el.appendChild(box);
      return { cam, box, img, label, retry: null };
    });
    this.paintLabels();
  }

  private connect(): void {
    if (this.reconnect) return;
    for (const t of this.tiles) this.open(t);
    this.reconnect = setInterval(() => {
      this.disconnect();
      this.connect();
    }, RECONNECT_MS);
  }

  private open(t: Tile): void {
    if (t.retry) clearTimeout(t.retry);
    t.retry = null;
    t.box.classList.remove('is-off');
    t.img.onerror = () => {
      t.box.classList.add('is-off');
      t.retry = setTimeout(() => {
        if (this.reconnect) this.open(t);
      }, RETRY_MS);
    };
    t.img.src = mediaUrl(`/media/cameras/${encodeURIComponent(t.cam.id)}.mjpeg?t=${Date.now()}`);
  }

  /** vaciar el src cierra la conexión del MJPEG */
  private disconnect(): void {
    if (this.reconnect) clearInterval(this.reconnect);
    this.reconnect = null;
    for (const t of this.tiles) {
      if (t.retry) clearTimeout(t.retry);
      t.retry = null;
      t.img.onerror = null;
      t.img.removeAttribute('src');
    }
  }
}
