// Tarjetas (fork fsrhome): rotación por pantalla. Cada `everyMin` sale la siguiente tarjeta activa durante `showSec`;
// la primera a los 2 min. La rotación sigue contando en pausa (no se acumulan tarjetas). Tocar abre la hoja.
import '../styles-cards.css';
import type { DisplayCardRef, DisplayCards, TrainingSummary } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { isPreview, withScreen } from '../identity';
import { FIRST_MS, cardsSig, nextIndex, trainingCardHtml } from '../cardsText';

const NONE: DisplayCards = { items: [], everyMin: 20, showSec: 30, corner: 'br' };

export interface SheetLike { open(ref: DisplayCardRef): void; close(): void; readonly isOpen: boolean }

export class CardsController {
  private c: DisplayCards = NONE;
  private sig = '';
  private idx = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private el: HTMLElement | null = null;

  constructor(private o: { paused: () => boolean; sheet: SheetLike }) {}

  /** config nueva de la pantalla; solo reinicia la rotación si cambió qué sale o cuándo */
  update(c: DisplayCards | undefined): void {
    this.c = c && Array.isArray(c.items) ? c : NONE;
    const sig = cardsSig(this.c);
    if (sig === this.sig) return;
    this.sig = sig;
    this.closeAll();
    this.idx = -1;
    this.schedule(FIRST_MS);
  }

  /** "Mostrar ahora" del admin (evento cardShow): esa tarjeta ya, si no está en pausa; reinicia la cuenta */
  showNow(id: string): void {
    const i = this.c.items.findIndex((x) => x.id === id);
    if (i < 0 || this.o.paused()) return;
    this.idx = i;
    void this.show(this.c.items[i]);
    this.schedule(this.c.everyMin * 60_000);
  }

  hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    const el = this.el;
    this.el = null;
    if (!el) return;
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 600);
  }

  /** alerta de cámara, cierre del modo Echo: fuera tarjeta y hoja */
  closeAll(): void {
    this.hide();
    this.o.sheet.close();
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.c.items.length) return;
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    this.schedule(this.c.everyMin * 60_000);
    // la vista previa del admin no rota (solo "Mostrar ahora"); en pausa esta vuelta se salta
    if (isPreview || this.o.paused() || this.o.sheet.isOpen) return;
    this.idx = nextIndex(this.c.items.length, this.idx);
    void this.show(this.c.items[this.idx]);
  }

  private async show(ref: DisplayCardRef): Promise<void> {
    let data: TrainingSummary;
    try {
      data = await getJSON<TrainingSummary>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}`), 10_000);
    } catch {
      return; // esta vez no sale; la siguiente vuelta lo reintenta
    }
    if (this.o.paused()) return;
    this.hide();
    const el = document.createElement('div');
    el.className = `mcard mcard--${this.c.corner}`;
    el.innerHTML = trainingCardHtml(data, ref, ctx.t, ctx.lang);
    el.addEventListener('click', () => {
      this.hide();
      this.o.sheet.open(ref);
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    this.el = el;
    this.hideTimer = setTimeout(() => this.hide(), this.c.showSec * 1000);
  }
}
