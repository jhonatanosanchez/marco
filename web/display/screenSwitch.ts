// Animated switch between two carousel screens (the plan comes from web/display/switchPlan.ts).
//
// 1. Snapshot: #app is cloned into a fixed overlay above it (ids become data-shot-id, canvases are copied, scroll
//    positions and the current frame of running animations are kept). With WebGL on, the GL canvas (photo, ambient
//    backdrop) is copied too, so the old screen is complete and opaque.
// 2. The new screen is rendered into the real #app underneath, right away.
// 3. Both layers are animated with the Web Animations API, on transform and opacity only (the wipe's soft edge is a
//    gradient mask that moves with a transform), so the compositor does the work. 'dissolve' instead hands the GL copy to
//    the GL dissolve layer (web/display/gl/dissolveLayer.ts) and crossfades the content above it.
// 4. The overlay is removed. A switch that arrives while one runs finishes that one at once.
//
// A light plan (reduced motion, lite mode, a Raspberry Pi) skips all of that: #app fades out, the new screen goes
// in and #app fades back in, with no copy of the page or of the GL frame.
//
// The ids of the clone are dropped, so the stylesheet rules that use ids (#app, #calendar, ...) get a second
// selector for data-shot-id the first time a switch runs (shotSelectors). The added selector has the same
// specificity, so the clone looks exactly like the screen it copies.
import type { SwitchPlan } from './switchPlan';

export interface SwitchGL {
  /** the GL canvas (#gl), animated together with #app */
  canvas: HTMLCanvasElement;
  /** a copy of the GL frame as it is now, or null */
  snapshot(): HTMLCanvasElement | null;
  /** run the noise dissolve from `from` to the live GL frame; false when it cannot */
  dissolve(from: HTMLCanvasElement, ms: number): boolean;
  /** stop a running dissolve */
  stopDissolve(): void;
  /** keep the GL panel rects where the new layout puts them while #app moves (true), or follow it again (false) */
  holdRects(on: boolean): void;
}

const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
const NEVER_ID = '#__marco-shot-never';
const ID_RE = /#(-?[_a-zA-Z][\w-]*)/g;

/** `#app .x` → `#app .x, :is([data-shot-id="app"],#never) .x` (same specificity, so the cascade order holds). */
export function shotSelector(sel: string): string | null {
  if (!sel.includes('#')) return null;
  const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
  const extra: string[] = [];
  for (const p of parts) {
    if (p.includes('data-shot-id')) return null; // done already
    // leave selectors with quoted strings alone (a '#' there is not an id)
    if (/["']/.test(p) || !ID_RE.test(p)) continue;
    ID_RE.lastIndex = 0;
    extra.push(p.replace(ID_RE, (_m, id: string) => `:is([data-shot-id="${id}"],${NEVER_ID})`));
  }
  ID_RE.lastIndex = 0;
  return extra.length ? `${parts.join(', ')}, ${extra.join(', ')}` : null;
}

const doneRules = new WeakSet<CSSRule>();

function rewriteRules(list: CSSRuleList): void {
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (doneRules.has(r)) continue;
    doneRules.add(r);
    if (r instanceof CSSStyleRule) {
      const next = shotSelector(r.selectorText);
      if (next) {
        try {
          r.selectorText = next;
        } catch { /* keep the rule as it is */ }
      }
    }
    const inner = (r as CSSGroupingRule).cssRules;
    if (inner) rewriteRules(inner);
  }
}

/** Give every id rule of the page a data-shot-id twin (new rules only: the custom CSS can change). */
function shotSelectors(): void {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin
    }
    if (rules) rewriteRules(rules);
  }
}

interface Running {
  overlay: HTMLElement | null;
  anims: Animation[];
  timer: ReturnType<typeof setTimeout>;
  gl: SwitchGL | null;
  /** the light fade only: the new screen, not rendered yet while #app fades out */
  pending?: (() => void) | null;
}

export class ScreenSwitcher {
  private run: Running | null = null;
  /** called when an animated switch ends (the new screen sits still where it belongs) */
  onDone: (() => void) | null = null;

  constructor(private app: HTMLElement, private gl: () => SwitchGL | null) {}

  /** Put the new screen on (apply renders it into #app) with the planned animation. */
  switch(plan: SwitchPlan, apply: () => void): void {
    this.finish();
    if (plan.effect === 'none' || plan.ms <= 0 || document.hidden || typeof this.app.animate !== 'function') return apply();
    if (plan.light) return this.fade(plan.ms, apply);
    let overlay: HTMLElement;
    let glShot: HTMLCanvasElement | null = null;
    const gl = this.glOn();
    let effect = plan.effect;
    try {
      glShot = gl ? gl.snapshot() : null;
      if (effect === 'dissolve' && !glShot) effect = 'fade';
      // the dissolve keeps the old content see-through: the GL layer under it does the background
      overlay = this.snapshot(effect === 'dissolve' ? null : glShot, effect !== 'dissolve');
    } catch (e) {
      console.warn('[switch] snapshot failed', e);
      return apply();
    }
    try {
      apply();
    } catch (e) {
      overlay.remove();
      throw e;
    }
    const ms = plan.ms;
    const anims: Animation[] = [];
    const opts = (extra?: KeyframeAnimationOptions): KeyframeAnimationOptions => ({ duration: ms, easing: EASE, fill: 'both', ...extra });
    const shell = overlay.firstElementChild as HTMLElement;
    const inner = shell.firstElementChild as HTMLElement;
    if (effect === 'dissolve' && !(gl && glShot && gl.dissolve(glShot, ms))) {
      // the GL layer could not take it: a plain crossfade of the full snapshot
      effect = 'fade';
      if (glShot) inner.prepend(glLayer(glShot));
    }
    // the new screen: #app and, when it moves, the GL canvas under it
    const moving: HTMLElement[] = [this.app];
    if (gl && (effect === 'slide' || effect === 'zoom')) {
      gl.holdRects(true);
      moving.push(gl.canvas);
    }
    switch (effect) {
      case 'slide':
        anims.push(shell.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-100%,0,0)' }], opts()));
        for (const el of moving) anims.push(el.animate([{ transform: 'translate3d(100%,0,0)' }, { transform: 'translate3d(0,0,0)' }], opts()));
        break;
      case 'zoom':
        anims.push(shell.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.96)', opacity: 0 }], opts({ easing: 'ease-out' })));
        for (const el of moving) anims.push(el.animate([{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], opts({ easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)' })));
        break;
      case 'wipe': {
        // the shell carries a soft diagonal mask and moves right; the content inside moves back by the same amount,
        // so it stays still while the edge sweeps over it
        const travel = wipeGeometry(shell, inner);
        anims.push(shell.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${travel}px,0,0)` }], opts()));
        anims.push(inner.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-travel}px,0,0)` }], opts()));
        break;
      }
      case 'dissolve':
        anims.push(shell.animate([{ opacity: 1 }, { opacity: 0 }], opts({ easing: 'ease-in-out' })));
        anims.push(this.app.animate([{ opacity: 0 }, { opacity: 1 }], opts({ easing: 'ease-in-out' })));
        break;
      default:
        // a true crossfade: the old screen is opaque, so fading it out over the new one mixes the two
        anims.push(shell.animate([{ opacity: 1 }, { opacity: 0 }], opts({ easing: 'ease-in-out' })));
    }
    const run: Running = { overlay, anims, gl, timer: setTimeout(() => this.finish(), ms + 600) };
    this.run = run;
    void Promise.all(anims.map((a) => a.finished)).then(
      () => this.run === run && this.finish(),
      () => undefined,
    );
  }

  /** End the running animation now (the new screen is put in place if it is not yet). */
  finish(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    clearTimeout(r.timer);
    for (const a of r.anims) {
      try {
        a.cancel();
      } catch { /* ignore */ }
    }
    r.overlay?.remove();
    if (r.gl) {
      r.gl.stopDissolve();
      r.gl.holdRects(false);
    }
    const pending = r.pending;
    r.pending = null;
    try {
      pending?.();
    } finally {
      this.onDone?.();
    }
  }

  /** The light switch: #app fades out, the new screen goes in, #app fades back in (half of `ms` each). */
  private fade(ms: number, apply: () => void): void {
    const half = Math.max(1, Math.round(ms / 2));
    const out = this.app.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half, easing: 'ease-in', fill: 'forwards' });
    const run: Running = { overlay: null, anims: [out], gl: null, pending: apply, timer: setTimeout(() => this.finish(), ms + 600) };
    this.run = run;
    void out.finished.then(() => {
      if (this.run !== run) return;
      const put = run.pending;
      run.pending = null;
      try {
        put?.();
      } catch (e) {
        console.warn('[switch] render failed', e);
      }
      const back = this.app.animate([{ opacity: 0 }, { opacity: 1 }], { duration: half, easing: 'ease-out', fill: 'backwards' });
      run.anims = [back];
      try {
        out.cancel();
      } catch { /* ignore */ }
      void back.finished.then(() => this.run === run && this.finish(), () => undefined);
    }, () => undefined);
  }

  private glOn(): SwitchGL | null {
    const gl = this.gl();
    return gl && document.documentElement.classList.contains('gl') ? gl : null;
  }

  /** The overlay with a still copy of #app (and of the GL frame when given). */
  private snapshot(glShot: HTMLCanvasElement | null, opaque: boolean): HTMLElement {
    shotSelectors();
    const app = this.app;
    const clone = app.cloneNode(true) as HTMLElement;
    const src = [app, ...Array.from(app.querySelectorAll<HTMLElement>('*'))];
    const dst = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
    const scrolled: [HTMLElement, number, number][] = [];
    const animated = new Set<Element>();
    for (const a of app.getAnimations({ subtree: true })) {
      const t = (a.effect as KeyframeEffect | null)?.target;
      if (t) animated.add(t);
    }
    for (let i = 0; i < dst.length; i++) {
      const s = src[i];
      const d = dst[i];
      if (!d || !s) break;
      if (d.id) {
        d.setAttribute('data-shot-id', d.id);
        d.removeAttribute('id');
      }
      if (s.scrollTop || s.scrollLeft) scrolled.push([d, s.scrollTop, s.scrollLeft]);
      if (animated.has(s)) {
        // the clone has no animations: keep the frame they are at now
        const cs = getComputedStyle(s);
        d.style.transform = cs.transform === 'none' ? '' : cs.transform;
        d.style.opacity = cs.opacity;
      }
      if (s instanceof HTMLCanvasElement && d instanceof HTMLCanvasElement && s.width && s.height) {
        try {
          d.getContext('2d')?.drawImage(s, 0, 0);
        } catch { /* a canvas we cannot read stays empty */ }
      } else if (d instanceof HTMLImageElement) d.removeAttribute('loading');
      else if (d instanceof HTMLMediaElement) {
        d.muted = true;
        d.removeAttribute('autoplay');
      }
    }
    clone.classList.remove('booting');
    const overlay = document.createElement('div');
    overlay.className = 'switch-shot';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    const shell = document.createElement('div');
    shell.className = 'switch-shot__shell';
    const inner = document.createElement('div');
    inner.className = 'switch-shot__inner';
    if (glShot) inner.appendChild(glLayer(glShot));
    // no GL copy: the page background makes the old screen opaque
    else if (opaque) inner.style.background = getComputedStyle(document.body).backgroundColor;
    inner.appendChild(clone);
    shell.appendChild(inner);
    overlay.appendChild(shell);
    app.after(overlay);
    for (const [el, top, left] of scrolled) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
    return overlay;
  }
}

function glLayer(c: HTMLCanvasElement): HTMLCanvasElement {
  c.className = 'switch-shot__gl';
  return c;
}

/**
 * Size the wipe shell: wide enough to hold the soft diagonal edge left of the screen at the start and right of it
 * at the end, with the content (inner) placed back on the viewport. Returns how far the shell travels (px).
 */
function wipeGeometry(shell: HTMLElement, inner: HTMLElement): number {
  const vw = window.innerWidth || 1920;
  const vh = window.innerHeight || 1080;
  const feather = Math.round(vw * 0.08);
  // horizontal reach of the tilted edge (about 14 degrees off vertical) plus the soft band
  const m = Math.round(vh * 0.25) + feather;
  const w = 2 * (vw + m);
  shell.classList.add('is-wipe');
  Object.assign(shell.style, { left: `${-(vw + 2 * m)}px`, width: `${w}px`, right: 'auto' });
  shell.style.setProperty('--feather', `${feather}px`);
  Object.assign(inner.style, { left: `${vw + 2 * m}px`, width: `${vw}px`, right: 'auto' });
  return vw + 2 * m;
}
