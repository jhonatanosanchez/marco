// "A esta edad" a pantalla completa (fork fsrhome): pide la lista del día, precarga las fotos y dibuja el marco de la
// puerta 45 s (o hasta que la toquen). Con menos de 2 fotos cargadas esa vez no sale. Nunca en pausa.
import '../styles-ages.css';
import type { AgesList, AgesPhoto, DisplayCardRef } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { mediaUrl, withScreen } from '../identity';
import { ageLayout, agesHtml } from '../agesText';

const LOAD_MS = 20_000;

/** `onDone`: se llama una vez cuando se va (cerrada, a los 45 s o descartada sin mostrarse); suelta el turno */
export interface AgesViewLike { open(ref: DisplayCardRef, onDone?: () => void): void; close(): void; readonly isOpen: boolean }

const srcOf = (p: AgesPhoto): string => mediaUrl(`/media/immich/${encodeURIComponent(p.id)}?v=${encodeURIComponent(p.v)}`);

function preload(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => { clearTimeout(tm); resolve(ok); };
    const tm = setTimeout(() => done(false), LOAD_MS);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  });
}

export class AgesView implements AgesViewLike {
  private root: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loading = false;
  /** sube con cada close(): una carga que empezó antes se descarta */
  private gen = 0;
  private done: (() => void) | null = null;

  constructor(private paused: () => boolean) {}

  get isOpen(): boolean {
    return this.root !== null || this.loading;
  }

  open(ref: DisplayCardRef, onDone?: () => void): void {
    if (this.loading || this.root) return void onDone?.();
    this.done = onDone ?? null;
    void this.load(ref);
  }

  private finish(): void {
    const d = this.done;
    this.done = null;
    d?.();
  }

  private async load(ref: DisplayCardRef): Promise<void> {
    const gen = this.gen;
    let shown = false;
    if (this.paused()) return this.finish();
    this.loading = true;
    try {
      const list = await getJSON<AgesList>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}`), 30_000);
      if (gen !== this.gen || !list?.photos || list.photos.length < 2) return;
      const ok = await Promise.all(list.photos.map((p) => preload(srcOf(p))));
      const photos = list.photos.filter((_, i) => ok[i]);
      if (gen !== this.gen || photos.length < 2 || this.paused()) return;
      this.show({ ...list, photos }, (ref.showSec ?? 45) * 1000);
      shown = true;
    } catch {
      /* esta vez no sale; la siguiente vuelta lo reintenta */
    } finally {
      this.loading = false;
      if (!shown && gen === this.gen) this.finish();
    }
  }

  private show(list: AgesList, ms: number): void {
    const root = document.createElement('div');
    root.className = 'edades';
    root.innerHTML = agesHtml(list, ageLayout(list.photos.length, innerWidth, innerHeight), ctx.t, srcOf);
    root.addEventListener('click', () => this.close());
    document.body.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('visible', 'animar')));
    this.timer = setTimeout(() => this.close(), ms);
  }

  close(): void {
    this.gen++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const root = this.root;
    this.root = null;
    this.finish();
    if (!root) return;
    root.classList.remove('visible');
    setTimeout(() => root.remove(), 1200);
  }
}
