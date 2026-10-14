// Hoja de Homelab (fork fsrhome): a pantalla completa. Tocar una alerta abre sus opciones de silencio en línea; tocar la
// cabecera cierra; se cierra a los 90 s sin tocar (cada toque reinicia la cuenta). Al guardar vuelve a pedir el detalle.
// Spec: homelab-docs/specs/2026-10-14-marco-homelab-design.md §4.3
import '../styles-homelab.css';
import type { DisplayCardRef, HomelabDetailResponse, HomelabSilenceHasta } from '../../shared/types';
import { api, getJSON } from '../api';
import { ctx } from '../ctx';
import { withScreen } from '../identity';
import { SHEET_MS } from '../cardsText';
import { homelabSheetHtml } from '../homelabText';
import type { SheetUi } from '../homelabText';
import type { SheetLike } from './cards';

export class HomelabSheet implements SheetLike {
  private root: HTMLElement | null = null;
  private ref: DisplayCardRef | null = null;
  private data: HomelabDetailResponse | null = null;
  private ui: SheetUi = { open: null, saving: false, error: false };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;

  constructor(private paused: () => boolean) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(ref: DisplayCardRef): void {
    void this.load(ref);
  }

  private fetchDetail(ref: DisplayCardRef): Promise<HomelabDetailResponse> {
    return getJSON<HomelabDetailResponse>(withScreen(`/api/display/cards/${encodeURIComponent(ref.id)}/detail`), 10_000)
      .catch((): HomelabDetailResponse => ({ ok: false }));
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
    root.className = 'msheet mhomelab';
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
    if (el.closest('.hl-cancel')) { this.ui = { open: null, saving: false, error: false }; return this.paint(); }
    const opt = el.closest<HTMLElement>('.hl-opt');
    if (opt && this.ui.open) {
      const raw = opt.dataset.hasta ?? 'null';
      void this.save(this.ui.open, (raw === 'null' ? null : raw) as HomelabSilenceHasta);
      return;
    }
    const li = el.closest<HTMLElement>('.hl-alert[data-clave]');
    if (li?.dataset.clave) {
      this.ui = { open: this.ui.open === li.dataset.clave ? null : li.dataset.clave, saving: false, error: false };
      this.paint();
    }
  }

  private async save(clave: string, hasta: HomelabSilenceHasta): Promise<void> {
    const ref = this.ref;
    if (!ref) return;
    const gen = this.gen;
    this.ui = { open: clave, saving: true, error: false };
    this.paint();
    let ok = false;
    try {
      ok = (await api.homelabSilence(ref.id, clave, hasta)).ok === true;
    } catch {
      ok = false;
    }
    if (gen !== this.gen) return; // se cerró mientras guardaba
    if (!ok) { this.ui = { open: clave, saving: false, error: true }; return this.paint(); }
    const r = await this.fetchDetail(ref);
    if (gen !== this.gen) return;
    this.data = r;
    this.ui = { open: null, saving: false, error: false };
    this.paint();
  }

  private paint(): void {
    const root = this.root;
    if (!root || !this.data || !this.ref) return;
    const scrolls = [...root.querySelectorAll<HTMLElement>('.hl-scroll')].map((el) => el.scrollTop);
    root.innerHTML = homelabSheetHtml(this.data, this.ref, this.ui, ctx.t, ctx.lang, Date.now(), ctx.tz);
    root.querySelectorAll<HTMLElement>('.hl-scroll').forEach((el, i) => { el.scrollTop = scrolls[i] ?? 0; });
  }

  close(): void {
    this.gen++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.root?.remove();
    this.root = null;
    this.ref = null;
    this.data = null;
    this.ui = { open: null, saving: false, error: false };
  }
}
