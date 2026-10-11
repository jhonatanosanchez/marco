// Demo doorbell (?demo=1&doorbell=1): a sample ring and a drawn "camera" picture, so the overlay can be seen without
// Home Assistant. ?doorbell=nocam shows a ring without a picture. The frames are drawn on a canvas, with a moving
// timestamp, the way a doorbell camera overlays one, so the refresh is visible.
import type { DoorbellRing } from '../shared/types';
import { current } from './time';

export function mockDoorbellRing(which: string, seconds = 300): DoorbellRing {
  const now = Date.now();
  return {
    id: 'd_demo',
    startedAt: new Date(now - 4000).toISOString(),
    updatedAt: new Date(now - 4000).toISOString(),
    expiresAt: new Date(now + seconds * 1000).toISOString(),
    sound: false,
    frames: which !== 'nocam',
    refreshMs: 750,
  };
}

const W = 1280;
const H = 720;
let canvas: HTMLCanvasElement | null = null;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Frame number `n` of the demo camera as a JPEG. */
export function mockDoorbellFrame(n: number): Promise<Blob | null> {
  canvas ??= document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return Promise.resolve(null);
  // street and houses across the road
  const sky = g.createLinearGradient(0, 0, 0, H * 0.45);
  sky.addColorStop(0, '#9fb3c4');
  sky.addColorStop(1, '#d6dde2');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#b9aa98';
  g.fillRect(80, 120, 420, 230);
  g.fillStyle = '#8c6e5a';
  g.beginPath(); g.moveTo(60, 125); g.lineTo(290, 40); g.lineTo(520, 125); g.closePath(); g.fill();
  g.fillStyle = '#e9e4da';
  g.fillRect(760, 150, 460, 200);
  g.fillStyle = '#5d6b78';
  for (const x of [130, 250, 380]) g.fillRect(x, 180, 70, 80);
  for (const x of [800, 940, 1080]) g.fillRect(x, 200, 80, 70);
  // pavement and the path to the door
  const ground = g.createLinearGradient(0, H * 0.48, 0, H);
  ground.addColorStop(0, '#8d8f8c');
  ground.addColorStop(1, '#5d5f5c');
  g.fillStyle = ground;
  g.fillRect(0, H * 0.48, W, H);
  g.fillStyle = '#a49c90';
  g.beginPath(); g.moveTo(470, H * 0.5); g.lineTo(810, H * 0.5); g.lineTo(1100, H); g.lineTo(180, H); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const y = H * 0.5 + (i * i * 9 + i * 16);
    g.beginPath(); g.moveTo(470 - (y - H * 0.5) * 0.85, y); g.lineTo(810 + (y - H * 0.5) * 1.33, y); g.stroke();
  }
  // hedges on both sides
  g.fillStyle = '#3f6b3a';
  for (const [x, y, r] of [[40, 430, 120], [170, 400, 110], [1130, 420, 130], [1250, 450, 120], [980, 395, 90]] as const) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#4f7f47';
  for (const [x, y, r] of [[90, 380, 70], [1180, 370, 75]] as const) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // a courier with a parcel, swaying a little from frame to frame
  const sway = Math.sin(n / 3) * 6;
  const cx = 640 + sway;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(cx, 705, 170, 26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b3a55';
  rr(g, cx - 140, 360, 280, 380, 90);
  g.fill();
  g.fillStyle = '#e8b04a';
  rr(g, cx - 140, 380, 280, 40, 12);
  g.fill();
  g.fillStyle = '#c99b74';
  g.beginPath(); g.arc(cx, 255, 92, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b3a55';
  g.beginPath(); g.ellipse(cx, 190, 100, 48, 0, Math.PI, 0); g.fill();
  g.fillRect(cx - 100, 186, 200, 16);
  g.fillStyle = '#b58457';
  rr(g, cx - 120, 470, 240, 170, 8);
  g.fill();
  g.strokeStyle = '#8f6440';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(cx - 120, 520); g.lineTo(cx + 120, 520); g.moveTo(cx, 470); g.lineTo(cx, 640); g.stroke();
  // wide lens: dark corners
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  // sensor grain
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // camera timestamp
  // the screen's own time zone, like the clock in the corner
  const tk = current();
  const p2 = (x: number) => String(x).padStart(2, '0');
  const stamp = `${tk.dayKey} ${p2(tk.parts.hour)}:${p2(tk.parts.minute)}:${p2(tk.parts.second)}`;
  g.font = '600 26px ui-monospace, monospace';
  g.textAlign = 'right';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillText(stamp, W - 30, 48);
  g.fillStyle = '#fff';
  g.fillText(stamp, W - 32, 46);
  g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillText('CAM 1', 32, H - 30);
  g.fillStyle = '#fff';
  g.fillText('CAM 1', 30, H - 32);
  return new Promise((resolve) => canvas!.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
}
