// Tarjetas (fork fsrhome): la tarjeta flotante de cada pantalla. Cuándo sale cada una lo decide CardRotation
// (cardsRotation.ts); aquí se pide el resumen, se dibuja `showSec` y tocarla abre la hoja.
import '../styles-cards.css';
import '../styles-money.css';
import '../styles-homelab.css';
import type { DisplayCardRef, DisplayCards, HomelabSummary, MoneyResponse, TrainingSummary } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { isPreview, withScreen } from '../identity';
import { cardsSig, trainingCardHtml } from '../cardsText';
import { moneyCardHtml } from '../moneyText';
import { CardRotation, CardStage } from '../cardsRotation';
import { homelabCardHtml } from '../homelabText';
import { HomelabWatcher } from '../homelabWatch';
import type { AgesViewLike } from './agesView';

const NONE: DisplayCards = { items: [], everyMin: 20, showSec: 30, corner: 'br' };

export interface SheetLike { open(ref: DisplayCardRef): void; close(): void; readonly isOpen: boolean }

export class CardsController {
  private c: DisplayCards = NONE;
  private sig = '';
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private el: HTMLElement | null = null;
  private rot: CardRotation<DisplayCardRef>;
  /** "A esta edad" y futuras de pantalla completa: una rotación propia por tarjeta */
  private full = new Map<string, CardRotation<DisplayCardRef>>();
  /** Homelab: un vigilante por tarjeta (sale solo si hay algo; homelabWatch.ts) */
  private watchers = new Map<string, HomelabWatcher>();
  private stage = new CardStage();
  private smallToken = 0;

  constructor(private o: { paused: () => boolean; sheet: SheetLike; ages: AgesViewLike }) {
    // la vista previa del admin no rota (solo "Mostrar ahora"); con la hoja abierta u otra tarjeta en turno tampoco
    this.rot = new CardRotation<DisplayCardRef>({ paused: o.paused, blocked: () => isPreview || o.sheet.isOpen || this.stage.busy, show: (ref) => void this.show(ref) });
  }

  /** config nueva de la pantalla; solo reinicia la rotación si cambió qué sale o cuándo */
  update(c: DisplayCards | undefined): void {
    const o = this.o;
    this.c = c && Array.isArray(c.items) ? c : NONE;
    const small = this.c.items.filter((i) => i.type !== 'ages' && i.type !== 'homelab');
    const sig = cardsSig(this.c);
    if (sig === this.sig) return this.rot.refresh(small);
    this.sig = sig;
    this.closeAll();
    this.rot.reset(small, this.c.everyMin);
    for (const r of this.full.values()) r.stop();
    this.full.clear();
    for (const ref of this.c.items.filter((i) => i.type === 'ages')) {
      const r = new CardRotation<DisplayCardRef>({
        paused: o.paused,
        // nunca encima de una tarjeta chica (aunque todavía esté cargando), la hoja u otra "A esta edad"
        blocked: () => isPreview || o.sheet.isOpen || this.stage.busy,
        show: (x) => {
          const tk = this.stage.begin();
          if (tk) o.ages.open(x, () => this.stage.end(tk));
        },
      });
      r.reset([ref], ref.everyMin ?? 15);
      this.full.set(ref.id, r);
    }
    for (const w of this.watchers.values()) w.stop();
    this.watchers.clear();
    for (const ref of this.c.items.filter((i) => i.type === 'homelab')) {
      const w = new HomelabWatcher({
        everyMin: ref.everyMin ?? 10,
        fetch: () => getJSON<HomelabSummary>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}`), 10_000),
        // nada de red en pausa (horario, modo Echo cerrado), en la vista previa del admin ni con la pestaña oculta
        canPoll: () => !isPreview && !o.paused() && !document.hidden,
        show: (s) => this.showHomelab(ref, s),
      });
      w.start();
      this.watchers.set(ref.id, w);
    }
  }

  /** "Mostrar ahora" del admin (evento cardShow) */
  showNow(id: string): void {
    // "Mostrar ahora" gana sobre lo que esté en pantalla
    this.closeAll();
    const w = this.watchers.get(id);
    if (w) return void w.showNow();
    const r = this.full.get(id);
    if (r) r.showNow(id);
    else this.rot.showNow(id);
  }

  hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.stage.end(this.smallToken);
    this.smallToken = 0;
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
    this.o.ages.close();
    this.stage.reset();
  }

  /** el vigilante de Homelab pide salir: false si hay otra tarjeta, la hoja abierta o pausa (lo reintenta luego) */
  private showHomelab(ref: DisplayCardRef, s: HomelabSummary): boolean {
    if (this.o.paused() || this.o.sheet.isOpen) return false;
    const tk = this.stage.begin();
    if (!tk) return false;
    this.drawSmall(ref, homelabCardHtml(s, ref, ctx.t, Date.now(), ctx.tz), tk);
    return true;
  }

  private async show(ref: DisplayCardRef): Promise<void> {
    const tk = this.stage.begin();
    if (!tk) return;
    let data: TrainingSummary | MoneyResponse;
    try {
      data = await getJSON<TrainingSummary | MoneyResponse>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}`), 10_000);
    } catch {
      this.stage.end(tk);
      return; // esta vez no sale; la siguiente vuelta lo reintenta
    }
    // pausa, o el turno se perdió mientras cargaba (closeAll, "Mostrar ahora")
    if (this.o.paused() || !this.stage.owns(tk)) return void this.stage.end(tk);
    const html = ref.type === 'money' ? moneyCardHtml(data as MoneyResponse, ref, ctx.t) : trainingCardHtml(data as TrainingSummary, ref, ctx.t, ctx.lang);
    this.drawSmall(ref, html, tk);
  }

  private drawSmall(ref: DisplayCardRef, html: string, tk: number): void {
    this.hide();
    this.smallToken = tk;
    const el = document.createElement('div');
    el.className = `mcard mcard--${this.c.corner}`;
    el.innerHTML = html;
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
