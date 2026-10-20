// Hoja de Organización (fork fsrhome): pendientes con Aprobar (segundo toque para confirmar). Aprobar no aplica nada:
// asistente-wa pide el «sí» por WhatsApp. Se cierra con la cabecera o a los 90 s sin tocar.
import '../styles-homelab.css';
import '../styles-org.css';
import type { DisplayCardRef, OrgDetailResponse } from '../../shared/types';
import { api, getJSON } from '../api';
import { ctx } from '../ctx';
import { withScreen } from '../identity';
import { SHEET_MS } from '../cardsText';
import { orgSheetHtml, type OrgSheetUi } from '../orgText';
import type { SheetLike } from './cards';

const LIMPIO: OrgSheetUi = { confirm: null, saving: false, sent: [], error: null };

export class OrgSheet implements SheetLike {
  private root: HTMLElement | null = null;
  private ref: DisplayCardRef | null = null;
  private data: OrgDetailResponse | null = null;
  private ui: OrgSheetUi = LIMPIO;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;

  constructor(private paused: () => boolean) {}

  get isOpen(): boolean { return this.root !== null; }

  open(ref: DisplayCardRef): void { void this.load(ref); }

  private fetchDetail(ref: DisplayCardRef): Promise<OrgDetailResponse> {
    return getJSON<OrgDetailResponse>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}/detail`), 10_000)
      .catch((): OrgDetailResponse => ({ ok: false }));
  }

  private async load(ref: DisplayCardRef): Promise<void> {
    if (this.paused()) return;
    const gen = ++this.gen;
    const r = await this.fetchDetail(ref);
    if (this.paused() || gen !== this.gen) return;
    this.close();
    this.gen = gen;
    this.ref = ref;
    this.data = r;
    const root = document.createElement('div');
    root.className = 'msheet morg';
    root.addEventListener('click', (ev) => this.onClick(ev));
    document.body.appendChild(root);
    this.root = root;
    this.paint();
    this.arm();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.close(), SHEET_MS);
  }

  private onClick(ev: Event): void {
    const el = ev.target as HTMLElement;
    this.arm();
    if (el.closest('.msheet-head')) return this.close();
    if (this.ui.saving) return;
    if (el.closest('.hl-cancel')) { this.ui = { ...this.ui, confirm: null, error: null }; return this.paint(); }
    const si = el.closest<HTMLElement>('[data-si]');
    if (si?.dataset.si) return void this.approve(si.dataset.si);
    const ap = el.closest<HTMLElement>('[data-aprobar]');
    if (ap?.dataset.aprobar) { this.ui = { ...this.ui, confirm: ap.dataset.aprobar, error: null }; this.paint(); }
  }

  private async approve(id: string): Promise<void> {
    const ref = this.ref;
    if (!ref) return;
    const gen = this.gen;
    this.ui = { ...this.ui, saving: true };
    this.paint();
    let error: string | null = null;
    try {
      const r = await api.orgApprove(ref.id, id);
      if (!r.ok) error = r.error ?? 'rechazada';
    } catch (e) {
      // ApiError no trae el cuerpo: 400 = ya no estaba pendiente o la rechazaron arriba (409); lo demás, sin conexión
      const st = (e as { status?: number }).status;
      error = st === 409 ? 'ya cambió o hay otra pregunta abierta en WhatsApp' : st === 400 ? 'ya no está pendiente' : 'sin conexión';
    }
    if (gen !== this.gen) return; // se cerró mientras guardaba
    const data = await this.fetchDetail(ref);
    if (gen !== this.gen) return;
    this.data = data;
    this.ui = { confirm: null, saving: false, sent: error ? this.ui.sent : [...this.ui.sent, id], error };
    this.paint();
  }

  private paint(): void {
    if (!this.root || !this.data || !this.ref) return;
    this.root.innerHTML = orgSheetHtml(this.data, this.ref, this.ui, ctx.t, Date.now());
  }

  close(): void {
    this.gen++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root?.remove();
    this.root = null;
    this.ref = null;
    this.data = null;
    this.ui = LIMPIO;
  }
}
