// Reloj de la hoja de Dinero (fork fsrhome): un toque revela las cifras 30 s (repinta cada segundo para la cuenta
// regresiva) y la hoja se cierra a los 90 s, esperando a que se oculten si siguen reveladas. Sin DOM, para probarlo con
// reloj falso; MoneySheet le pone el HTML. Spec: homelab-docs/specs/2026-10-14-marco-dinero-design.md
import { REVEAL_MS, secondsLeft, sheetCloseAt } from './moneyText';

export interface RevealHost {
  /** repintar (con o sin montos según `revealed`) */
  paint(): void;
  /** cerrar la hoja (que a su vez llama stop()) */
  close(): void;
}

export class RevealClock {
  private until = 0;
  private openedAt = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(private host: RevealHost) {}

  get revealed(): boolean {
    return Date.now() < this.until;
  }

  get secondsLeft(): number {
    return secondsLeft(this.until, Date.now());
  }

  /** la hoja se acaba de abrir (sin montos) */
  start(): void {
    this.stop();
    this.openedAt = Date.now();
    this.schedule();
  }

  /** un toque en el cuerpo: 30 s de cifras desde ahora */
  reveal(): void {
    this.until = Date.now() + REVEAL_MS;
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => {
      if (!this.revealed && this.tick) {
        clearInterval(this.tick);
        this.tick = null;
      }
      this.host.paint();
    }, 1000);
    this.host.paint();
  }

  /** cierre por cualquier motivo: oculta y suelta los relojes */
  stop(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.tick) clearInterval(this.tick);
    this.closeTimer = null;
    this.tick = null;
    this.until = 0;
  }

  private schedule(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    const wait = sheetCloseAt(this.openedAt, this.until) - Date.now();
    this.closeTimer = setTimeout(() => {
      // revelado después de agendar: esperar a que se oculten
      if (this.revealed) return this.schedule();
      this.host.close();
    }, Math.max(0, wait));
  }
}
