// Vista de cámara a pantalla completa (fork fsrhome): al tocar un recuadro (60 s) o por una alerta de persona (45 s).
// Video H.264 de go2rtc vía este servidor; si el video falla, cae al MJPEG. Mientras está abierta la cuadrícula se
// pausa (pauseCameras('view')). Nunca en la vista previa del admin ni con el modo Echo cerrado. Tocar cierra.
import type { FrigateCamera } from '../../shared/types';
import { ctx } from '../ctx';
import { isPreview, mediaUrl } from '../identity';
import { pauseCameras } from './cameras';

export const TAP_MS = 60_000;
export const ALERT_MS = 45_000;

export class CameraView {
  private root: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private isClosed: () => boolean) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(cam: FrigateCamera, o: { title: string; detail: string; snapshot?: string | null; ms: number; alert?: boolean }): void {
    if (isPreview || this.isClosed()) return;
    this.close();
    pauseCameras('view', true);
    const root = document.createElement('div');
    root.className = `camview${o.alert ? ' camview--alert' : ''}`;
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    const img = new Image();
    img.className = 'camview-fallback';
    img.hidden = true;
    video.onerror = () => {
      video.remove();
      img.hidden = false;
      img.src = mediaUrl(`/media/cameras/${encodeURIComponent(cam.id)}.mjpeg?t=${Date.now()}`);
    };
    video.src = mediaUrl(`/media/cameras/${encodeURIComponent(cam.id)}.mp4?t=${Date.now()}`);
    const head = document.createElement('div');
    head.className = 'camview-head';
    const title = document.createElement('div');
    title.className = 'camview-title';
    title.textContent = o.title;
    const detail = document.createElement('div');
    detail.className = 'camview-detail';
    detail.textContent = o.detail;
    head.append(title, detail);
    root.append(video, img, head);
    if (o.snapshot) {
      const snap = new Image();
      snap.className = 'camview-snap';
      snap.alt = '';
      snap.src = mediaUrl(o.snapshot);
      root.appendChild(snap);
    }
    root.addEventListener('click', () => this.close());
    document.body.appendChild(root);
    this.root = root;
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    this.timer = setTimeout(() => this.close(), o.ms);
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.root) return;
    for (const v of Array.from(this.root.querySelectorAll('video'))) {
      v.removeAttribute('src');
      v.load();
    }
    for (const i of Array.from(this.root.querySelectorAll('img'))) i.removeAttribute('src');
    this.root.remove();
    this.root = null;
    pauseCameras('view', false);
  }
}

/** "Persona en Patio" para la alerta. */
export const alertTitle = (label: string, name: string): string =>
  ctx.t('camAlertTitle', { what: label === 'person' ? ctx.t('camPerson') : label === 'car' ? ctx.t('camCar') : label, name });
