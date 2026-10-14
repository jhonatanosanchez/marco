// Rotación de tarjetas (fork fsrhome): cuándo sale cada una. Sin DOM ni red (lo dibuja quien llama en `show`), para
// probarla con reloj falso. La primera sale a los 2 min; después la siguiente cada `everyMin`. En pausa o bloqueada
// (vista previa del admin, hoja abierta) esa vuelta se salta: la cuenta sigue y no se acumulan tarjetas.
import { FIRST_MS, nextIndex } from './cardsText';

export interface RotationDeps<R> {
  paused: () => boolean;
  blocked: () => boolean;
  show: (ref: R) => void;
}

export class CardRotation<R extends { id: string }> {
  private items: R[] = [];
  private everyMs = 20 * 60_000;
  private idx = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private d: RotationDeps<R>) {}

  /** lista nueva (qué sale o cada cuánto cambió): la cuenta vuelve a empezar */
  reset(items: R[], everyMin: number): void {
    this.items = items;
    this.everyMs = everyMin * 60_000;
    this.idx = -1;
    this.schedule(FIRST_MS);
  }

  /** mismas tarjetas con otros datos (p. ej. un nombre): sin tocar la cuenta */
  refresh(items: R[]): void {
    this.items = items;
  }

  /** "Mostrar ahora": esa tarjeta ya (si no está en pausa) y la cuenta vuelve a empezar */
  showNow(id: string): boolean {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0 || this.d.paused()) return false;
    this.idx = i;
    this.d.show(this.items[i]);
    this.schedule(this.everyMs);
    return true;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    this.stop();
    if (!this.items.length) return;
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    this.schedule(this.everyMs);
    if (this.d.blocked() || this.d.paused()) return;
    this.idx = nextIndex(this.items.length, this.idx);
    this.d.show(this.items[this.idx]);
  }
}
