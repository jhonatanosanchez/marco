// Modo Echo Show (fork fsrhome): mantiene viva la página en Silk con un mp3 mudo, pide pantalla completa al tocar,
// cierra fuera de horario (sin audio el Echo vuelve a su inicio) y pasa a lite si los fps no aguantan.
// Nada de diagnóstico en pantalla: el estado viaja en el latido (status()).
import './styles-echo.css';
import type { EchoSettings, EchoStatus } from '../shared/types';
import { ctx } from './ctx';
import { current, onTick, type Tick } from './time';
import { FpsGuard, cleanUrl, isOpenAt, liteUrl, normalizeEcho } from './echoCore';

const RETRY_MS = 60_000;

export class EchoController {
  private s: EchoSettings = normalizeEcho(undefined);
  private audio: HTMLAudioElement | null = null;
  private tapEl: HTMLDivElement | null = null;
  private pauseEl: HTMLDivElement | null = null;
  private open = true;
  private started = false;
  private fsRefused = false;
  private frames = 0;
  private guard = new FpsGuard(() => Date.now(), ctx.lite);

  /** `disabled`: la vista previa del admin nunca activa el modo (ni audio, ni pausa, ni recargas). */
  constructor(private disabled = false) {}

  update(raw: EchoSettings | undefined): void {
    this.s = normalizeEcho(raw);
    if (this.disabled || !this.s.enabled) { this.teardown(); return; }
    if (!this.started) this.start();
    if (this.s.keepAlive === 'off') this.audio?.pause();
    this.applySchedule(current(), false);
  }

  status(): EchoStatus | null {
    if (this.disabled || !this.s.enabled) return null;
    return {
      fps: this.guard.average(),
      keepAlive: this.audio && !this.audio.paused ? 'on' : 'off',
      fullscreen: isFullscreen(),
      open: this.open,
      liteByGuard: ctx.params.get('echoGuard') === '1',
    };
  }

  private start(): void {
    this.started = true;
    this.audio = new Audio('/echo/silencio.mp3');
    this.audio.loop = true;
    document.addEventListener('pointerdown', this.onTap, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.guard.markVisible(); });
    onTick((t) => { if (this.s.enabled && t.minuteChanged) this.applySchedule(t, true); });
    setInterval(() => this.retry(), RETRY_MS);
    const count = () => { this.frames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
    setInterval(() => this.onSecond(), 1000);
    this.play(); // Silk a veces deja sonar sin gesto tras una recarga; si no, el aviso pide el toque
  }

  private teardown(): void {
    this.audio?.pause();
    this.tapEl?.remove(); this.tapEl = null;
    this.pauseEl?.remove(); this.pauseEl = null;
    this.open = true;
  }

  private onTap = (): void => {
    if (!this.s.enabled || !this.open) return; // fuera de horario tocar no reactiva
    this.play();
    if (this.s.fullscreenOnTap && !isFullscreen() && !this.fsRefused) {
      const d = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      const req = d.requestFullscreen?.bind(d) ?? d.webkitRequestFullscreen?.bind(d);
      try {
        const p = req?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { this.fsRefused = true; });
      } catch { this.fsRefused = true; }
    }
    setTimeout(() => this.renderTap(), 500);
  };

  private play(): void {
    if (!this.audio || this.s.keepAlive !== 'mp3' || !this.open) return;
    this.audio.play().catch(() => {}).finally(() => this.renderTap());
  }

  private retry(): void {
    if (this.s.enabled && this.open && this.audio?.paused) this.play();
  }

  private applySchedule(t: Tick, live: boolean): void {
    const minute = t.parts.hour * 60 + t.parts.minute;
    const nowOpen = isOpenAt(minute, this.s.openFrom, this.s.openTo);
    if (live && nowOpen && !this.open) {
      // reabre: recarga para tomar código nuevo y, si la guardia la pasó a lite, reintenta el modo completo
      location.replace(cleanUrl(location.href));
      return;
    }
    this.open = nowOpen;
    if (!nowOpen) this.audio?.pause();
    this.renderPause();
    this.renderTap();
  }

  private onSecond(): void {
    const fps = this.frames; this.frames = 0;
    if (!this.s.enabled || document.hidden || !this.open || !this.s.fpsGuard) return;
    if (this.guard.sample(fps)) location.replace(liteUrl(location.href));
  }

  private renderTap(): void {
    const need = this.s.enabled && this.open &&
      ((this.s.keepAlive === 'mp3' && !!this.audio?.paused) || (this.s.fullscreenOnTap && !isFullscreen() && !this.fsRefused));
    if (need && !this.tapEl) {
      this.tapEl = document.createElement('div');
      this.tapEl.className = 'echo-tap';
      document.body.appendChild(this.tapEl);
    }
    if (this.tapEl) this.tapEl.textContent = ctx.t('echoTap');
    if (!need && this.tapEl) { this.tapEl.remove(); this.tapEl = null; }
  }

  private renderPause(): void {
    if (this.s.enabled && !this.open) {
      if (!this.pauseEl) {
        this.pauseEl = document.createElement('div');
        this.pauseEl.className = 'echo-pause';
        const card = document.createElement('div');
        card.className = 'echo-pause__card';
        this.pauseEl.appendChild(card);
        document.body.appendChild(this.pauseEl);
      }
      (this.pauseEl.firstElementChild as HTMLElement).textContent = ctx.t('echoPaused', { time: this.s.openFrom });
    } else if (this.pauseEl) {
      this.pauseEl.remove(); this.pauseEl = null;
    }
  }
}

function isFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}
