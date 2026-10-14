// Hoja de detalle de una tarjeta (fork fsrhome): a pantalla completa, se cierra al tocar o a los 90 s. Pide el detalle
// al abrir; si falla, no abre. Nunca en pausa (horario, cámara abierta…).
import type { DisplayCardRef, TrainingDetail } from '../../shared/types';
import { getJSON } from '../api';
import { ctx } from '../ctx';
import { withScreen } from '../identity';
import { SHEET_MS, trainingSheetHtml } from '../cardsText';
import type { SheetLike } from './cards';

export class CardSheet implements SheetLike {
  private root: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private paused: () => boolean) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(ref: DisplayCardRef): void {
    void this.load(ref);
  }

  private async load(ref: DisplayCardRef): Promise<void> {
    if (this.paused()) return;
    let d: TrainingDetail;
    try {
      d = await getJSON<TrainingDetail>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}/detail`), 10_000);
    } catch {
      return;
    }
    if (this.paused()) return;
    this.close();
    const root = document.createElement('div');
    root.className = 'msheet';
    root.innerHTML = trainingSheetHtml(d, ref, ctx.t, ctx.lang);
    root.addEventListener('click', () => this.close());
    document.body.appendChild(root);
    this.root = root;
    this.timer = setTimeout(() => this.close(), SHEET_MS);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root?.remove();
    this.root = null;
  }
}
