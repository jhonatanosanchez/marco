// Tarjetas (fork fsrhome): la tarjeta flotante de cada pantalla. Cuándo sale cada una lo decide CardRotation
// (cardsRotation.ts); aquí se pide el resumen, se dibuja `showSec` y tocarla abre la hoja.
import '../styles-cards.css';
import type { DisplayCardRef, DisplayCards, TrainingSummary } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { isPreview, withScreen } from '../identity';
import { cardsSig, trainingCardHtml } from '../cardsText';
import { CardRotation } from '../cardsRotation';

const NONE: DisplayCards = { items: [], everyMin: 20, showSec: 30, corner: 'br' };

export interface SheetLike { open(ref: DisplayCardRef): void; close(): void; readonly isOpen: boolean }

export class CardsController {
  private c: DisplayCards = NONE;
  private sig = '';
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private el: HTMLElement | null = null;
  private rot: CardRotation<DisplayCardRef>;

  constructor(private o: { paused: () => boolean; sheet: SheetLike }) {
    // la vista previa del admin no rota (solo "Mostrar ahora"); con la hoja abierta tampoco
    this.rot = new CardRotation<DisplayCardRef>({ paused: o.paused, blocked: () => isPreview || o.sheet.isOpen, show: (ref) => void this.show(ref) });
  }

  /** config nueva de la pantalla; solo reinicia la rotación si cambió qué sale o cuándo */
  update(c: DisplayCards | undefined): void {
    this.c = c && Array.isArray(c.items) ? c : NONE;
    const sig = cardsSig(this.c);
    if (sig === this.sig) return this.rot.refresh(this.c.items);
    this.sig = sig;
    this.closeAll();
    this.rot.reset(this.c.items, this.c.everyMin);
  }

  /** "Mostrar ahora" del admin (evento cardShow) */
  showNow(id: string): void {
    this.rot.showNow(id);
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

  /** alerta de cámara, anuncio, timbre, cierre del modo Echo: fuera tarjeta y hoja */
  closeAll(): void {
    this.hide();
    this.o.sheet.close();
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
