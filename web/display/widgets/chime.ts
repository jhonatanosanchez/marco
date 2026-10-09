// Synthesized notification chimes (WebAudio, no audio files). The kiosk runs Chromium with
// --autoplay-policy=no-user-gesture-required; elsewhere a blocked AudioContext simply stays silent.
import type { AlertStyle } from '../../shared/types';

let ac: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
    return ac;
  } catch {
    return null;
  }
}

/** One soft bell-like note: sine + quiet octave partial, fast attack, exponential decay. */
function note(ctx: AudioContext, out: AudioNode, freq: number, at: number, dur: number, peak: number): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(out);
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(freq, at);
  o1.connect(g);
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  g2.connect(g);
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(freq * 2, at);
  o2.connect(g2);
  for (const o of [o1, o2]) {
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

const PATTERNS: Record<AlertStyle, { notes: [number, number][]; repeat: number; gap: number }> = {
  // [frequency Hz, offset s]
  info: { notes: [[784, 0], [1047, 0.16]], repeat: 1, gap: 0 }, // G5 → C6
  success: { notes: [[880, 0], [1319, 0.15]], repeat: 1, gap: 0 }, // A5 → E6
  warning: { notes: [[988, 0], [784, 0.17], [988, 0.34]], repeat: 1, gap: 0 }, // B5 G5 B5
  urgent: { notes: [[1175, 0], [880, 0.14], [1175, 0.28]], repeat: 3, gap: 0.75 },
};

/** Play the chime for `style` at `volume` (0..1). Never throws. */
export function chime(style: AlertStyle, volume: number): void {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  if (v <= 0) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    const master = ctx.createGain();
    master.gain.value = 0.55 * v;
    master.connect(ctx.destination);
    const p = PATTERNS[style] ?? PATTERNS.info;
    const t0 = ctx.currentTime + 0.05;
    for (let r = 0; r < p.repeat; r++) {
      for (const [f, off] of p.notes) note(ctx, master, f, t0 + r * p.gap + off, style === 'urgent' ? 0.5 : 1.1, 0.9);
    }
  } catch (e) {
    console.warn('[chime]', e);
  }
}
