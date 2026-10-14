// Hoja de Dinero (fork fsrhome): a pantalla completa. Tocar el cuerpo revela las cifras 30 s (cuenta regresiva);
// tocar la cabecera cierra. Se cierra a los 90 s, esperando a que se oculten las cifras si siguen reveladas. Los datos
// viven solo aquí y se sueltan al cerrar (por cualquier motivo). Spec: homelab-docs/specs/2026-10-14-marco-dinero-design.md
import '../styles-money.css';
import type { DisplayCardRef, MoneyResponse } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { withScreen } from '../identity';
import { moneySheetHtml } from '../moneyText';
import { RevealClock } from '../moneyReveal';
import type { SheetLike } from './cards';

export class MoneySheet implements SheetLike {
  private root: HTMLElement | null = null;
  private ref: DisplayCardRef | null = null;
  private data: MoneyResponse | null = null;
  private gen = 0;
  private clock = new RevealClock({ paint: () => this.paint(), close: () => this.close() });

  constructor(private paused: () => boolean) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(ref: DisplayCardRef): void {
    void this.load(ref);
  }

  private async load(ref: DisplayCardRef): Promise<void> {
    if (this.paused()) return;
    const gen = ++this.gen;
    let r: MoneyResponse;
    try {
      r = await getJSON<MoneyResponse>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}`), 10_000);
    } catch {
      r = { ok: false };
    }
    // pausa, o se cerró/abrió otra mientras cargaba
    if (this.paused() || gen !== this.gen) return;
    this.close();
    this.gen = gen;
    this.ref = ref;
    this.data = r;
    const root = document.createElement('div');
    root.className = 'msheet mmoney';
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.msheet-head')) return this.close();
      if (this.data?.ok) this.clock.reveal();
    });
    document.body.appendChild(root);
    this.root = root;
    this.paint();
    this.clock.start();
  }

  /** repinta conservando el scroll de las listas (el tictac de cada segundo no las regresa arriba) */
  private paint(): void {
    const root = this.root;
    if (!root || !this.data || !this.ref) return;
    const scrolls = [...root.querySelectorAll<HTMLElement>('.mmoney-scroll')].map((el) => el.scrollTop);
    root.innerHTML = moneySheetHtml(this.data, this.ref, { reveal: this.clock.revealed, secondsLeft: this.clock.secondsLeft }, ctx.t, ctx.lang);
    root.querySelectorAll<HTMLElement>('.mmoney-scroll').forEach((el, i) => { el.scrollTop = scrolls[i] ?? 0; });
  }

  close(): void {
    this.gen++;
    this.clock.stop();
    this.root?.remove();
    this.root = null;
    this.ref = null;
    this.data = null;
  }
}
