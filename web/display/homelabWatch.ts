// Tarjeta Homelab (fork fsrhome): cuándo sale. Sin DOM ni red (los recibe inyectados) para probarlo con reloj falso.
// Sale solo si hay algo (aviso, alerta o gris): de inmediato cuando la firma es nueva y luego cada `everyMin`; "Anoche"
// sin alertas activas cada 3 × everyMin. En calma no sale y olvida, así el siguiente aviso sale ya.
// Spec: homelab-docs/specs/2026-10-14-marco-homelab-design.md §4.3
import type { HomelabSummary, OrgSummary } from '../shared/types';

export const WATCH_MS = 60_000;
export const WATCH_FIRST_MS = 20_000;

export interface WatchMemo { firma: string | null; shownAt: number }
export const EMPTY_MEMO: WatchMemo = Object.freeze({ firma: null, shownAt: 0 }) as WatchMemo;

export function homelabDecide(m: WatchMemo, s: HomelabSummary, now: number, everyMin: number): { show: boolean; memo: WatchMemo } {
  if (s.estado === 'calma') return { show: false, memo: EMPTY_MEMO };
  if (s.firma !== m.firma) return { show: true, memo: m };
  const factor = s.modo === 'anoche' && s.alertas.length === 0 ? 3 : 1;
  return { show: now - m.shownAt >= factor * everyMin * 60_000, memo: m };
}

export const markShown = (s: WatchSummary, now: number): WatchMemo => ({ firma: s.firma, shownAt: now });

/** Organización: como Homelab, pero "solo altas sin propuestas accionables" se repite cada 3 × everyMin. */
export function orgDecide(m: WatchMemo, s: OrgSummary, now: number, everyMin: number): { show: boolean; memo: WatchMemo } {
  if (s.estado === 'calma') return { show: false, memo: EMPTY_MEMO };
  if (s.firma !== m.firma) return { show: true, memo: m };
  const factor = s.accionables === 0 ? 3 : 1;
  return { show: now - m.shownAt >= factor * everyMin * 60_000, memo: m };
}

export interface WatchSummary { estado: string; firma: string }
type Decide<S> = (m: WatchMemo, s: S, now: number, everyMin: number) => { show: boolean; memo: WatchMemo };

export interface WatchDeps<S extends WatchSummary = HomelabSummary> {
  everyMin: number;
  fetch: () => Promise<S>;
  /** false en pausa (horario, modo Echo cerrado), vista previa del admin o pestaña oculta */
  canPoll: () => boolean;
  /** dibuja la tarjeta; false si no pudo (otra tarjeta, la hoja, pausa) */
  show: (s: S) => boolean;
  now?: () => number;
}

/** Vigilante de una tarjeta que sale sola (Homelab, Organización): `decide` dice cuándo. */
export class CardWatcher<S extends WatchSummary> {
  private memo: WatchMemo = EMPTY_MEMO;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;
  private busy = false;

  constructor(private d: WatchDeps<S> & { decide: Decide<S> }) {}

  private now(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  start(): void {
    this.stop();
    this.alive = true;
    this.timer = setTimeout(() => this.loop(), WATCH_FIRST_MS);
  }

  stop(): void {
    this.alive = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private loop(): void {
    void this.tick().finally(() => {
      if (this.alive) this.timer = setTimeout(() => this.loop(), WATCH_MS);
    });
  }

  async tick(): Promise<void> {
    if (this.busy || !this.d.canPoll()) return;
    this.busy = true;
    try {
      const s = await this.d.fetch();
      const now = this.now();
      const r = this.d.decide(this.memo, s, now, this.d.everyMin);
      this.memo = r.memo;
      // si no pudo salir (otra tarjeta en turno), no se marca: la siguiente consulta lo reintenta
      if (r.show && this.d.show(s)) this.memo = markShown(s, now);
    } catch {
      // esta vez no; la siguiente consulta reintenta
    } finally {
      this.busy = false;
    }
  }

  /** "Mostrar ahora" del admin: sale aunque esté en calma ("Todo bien") */
  async showNow(): Promise<void> {
    try {
      const s = await this.d.fetch();
      if (this.d.show(s) && s.estado !== 'calma') this.memo = markShown(s, this.now());
    } catch {
      // sin datos no hay qué mostrar
    }
  }
}

/** Homelab: el vigilante de siempre (cards.ts lo crea sin `decide`). */
export class HomelabWatcher extends CardWatcher<HomelabSummary> {
  constructor(d: WatchDeps<HomelabSummary>) { super({ ...d, decide: homelabDecide }); }
}
