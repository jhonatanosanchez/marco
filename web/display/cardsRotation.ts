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

/**
 * Una sola tarjeta en pantalla a la vez (fork fsrhome): la chica o "A esta edad", contando desde que se pide (antes de
 * la red) hasta que se va. Así dos rotaciones que vencen en la misma vuelta no salen encimadas.
 */
export class CardStage {
  private owner = 0;
  private seq = 0;

  get busy(): boolean {
    return this.owner !== 0;
  }

  /** turno, o 0 si ya hay otra */
  begin(): number {
    if (this.owner) return 0;
    this.owner = ++this.seq;
    return this.owner;
  }

  /** ¿el turno sigue siendo de `token`? (closeAll o "Mostrar ahora" lo pueden haber quitado mientras cargaba) */
  owns(token: number): boolean {
    return token !== 0 && this.owner === token;
  }

  end(token: number): void {
    if (token && this.owner === token) this.owner = 0;
  }

  reset(): void {
    this.owner = 0;
  }
}
