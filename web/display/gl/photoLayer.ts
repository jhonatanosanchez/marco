// Photo panel: cover-fit textures with slow Ken Burns drift and a noise-displacement dissolve transition.
import {
  ClampToEdgeWrapping, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Texture, Vector2, Vector3, Vector4,
  type WebGLRenderer,
} from 'three';
import { coverWindow } from '../../shared/focus';
import type { GLLayer, Rect } from './engine';
import { FULLSCREEN_VERT, NOISE } from './noise';

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTex0, uTex1;
uniform vec2 uRes, uAnc0, uAnc1;
uniform vec4 uFit0, uFit1;
uniform vec3 uKB0, uKB1;
uniform float uProg, uBright, uFade, uSeed, uHas1;
${NOISE}
// fit.xy = visible fraction of the texture, fit.zw = window centre in texture uv (cover crop kept around the
// focal point, computed on the CPU); anc = focal point on screen, the Ken Burns zoom anchor.
vec3 samp(sampler2D t, vec2 uv, vec4 fit, vec2 anc, vec3 kb){
  uv = (uv - anc) / kb.x + anc + kb.yz;
  uv = (uv - 0.5) * fit.xy + fit.zw;
  vec3 c = texture2D(t, clamp(uv, 0.001, 0.999)).rgb;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return c * inside;
}
void main(){
  if (uHas1 < 0.5) {
    // No transition running: a single texture sample, no noise (keeps the Pi GPU cool between photos).
    gl_FragColor = vec4(samp(uTex0, vUv, uFit0, uAnc0, uKB0) * uBright * uFade, 1.0);
    return;
  }
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float n = fbm(vUv * asp * 2.2 + uSeed);
  float p = uProg;
  float edge = 0.16;
  float m = smoothstep(n - edge, n + edge, p * (1.0 + 2.0 * edge) - edge);
  vec2 d = (vec2(fbm(vUv * 3.0 + uSeed + 4.0), n) - 0.5) * 0.09;
  vec3 c0 = samp(uTex0, vUv + d * p, uFit0, uAnc0, uKB0);
  vec3 c1 = samp(uTex1, vUv - d * (1.0 - p), uFit1, uAnc1, uKB1);
  vec3 col = mix(c0, c1, m);
  float glow = (1.0 - abs(m * 2.0 - 1.0)) * sin(3.14159 * p);
  col += glow * 0.10;
  gl_FragColor = vec4(col * uBright * uFade, 1.0);
}`;

interface Slot { tex: Texture; w: number; h: number; fx?: number; fy?: number; born: number; dir: Vector2; zoomFrom: number; zoomTo: number }
export interface Focus { focusX?: number; focusY?: number }

export class PhotoLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private cur: Slot | null = null;
  private nxt: Slot | null = null;
  private transStart = 0;
  /** length of the running transition (s) */
  private transDur = 2.6;
  /** when a photo was put in with no transition: a few frames at full rate so it shows at once */
  private cutAt = -1;
  private fadeStart = -1;
  private time = 0;
  brightness = 0.85;
  duration = 2.6;
  /** seconds a photo stays (for Ken Burns pacing) */
  interval = 120;
  cover = true;
  enabled = true;
  /** where the focal point should land vertically (0 = top): centre of the band not covered by text */
  targetY = 0.5;
  private ty = -1;
  private lastT = 0;

  constructor(private el: () => HTMLElement | null) {
    this.mat = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex0: { value: null }, uTex1: { value: null },
        uFit0: { value: new Vector4(1, 1, 0.5, 0.5) }, uFit1: { value: new Vector4(1, 1, 0.5, 0.5) }, uRes: { value: new Vector2(1, 1) },
        uAnc0: { value: new Vector2(0.5, 0.5) }, uAnc1: { value: new Vector2(0.5, 0.5) },
        uKB0: { value: new Vector3(1, 0, 0) }, uKB1: { value: new Vector3(1, 0, 0) },
        uProg: { value: 0 }, uBright: { value: 0.85 }, uFade: { value: 0 }, uSeed: { value: 0 }, uHas1: { value: 0 },
      },
    });
    const m = new Mesh(new PlaneGeometry(2, 2), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  target() {
    return this.el();
  }
  active() {
    return this.enabled && !!this.cur;
  }
  /** transition or fade-in running → engine renders at full fps */
  get busy() {
    return !!this.nxt || (this.fadeStart >= 0 && this.time - this.fadeStart < 1.7) || (this.cutAt >= 0 && this.time - this.cutAt < 0.5);
  }

  private makeSlot(src: TexImageSource & { width: number; height: number }, focus?: Focus): Slot {
    const tex = new Texture(src as any);
    // ImageBitmaps are created pre-flipped (imageOrientation: 'flipY'); UNPACK_FLIP_Y does not apply to them.
    if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) tex.flipY = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.needsUpdate = true;
    const a = Math.random() * Math.PI * 2;
    const zoomIn = Math.random() > 0.4;
    return {
      tex, w: src.width, h: src.height, fx: focus?.focusX, fy: focus?.focusY, born: this.time, dir: new Vector2(Math.cos(a), Math.sin(a)),
      zoomFrom: zoomIn ? 1.03 : 1.12, zoomTo: zoomIn ? 1.12 : 1.04,
    };
  }

  /**
   * Show a decoded image (ImageBitmap / HTMLImageElement), cropped around its focal point when it has one. `sec`:
   * the transition's length (default `duration`); 0 puts it in at once (a carousel switch animates the change).
   */
  show(src: TexImageSource & { width: number; height: number }, focus?: Focus, sec = this.duration): void {
    const slot = this.makeSlot(src, focus);
    if (sec <= 0) {
      this.cur?.tex.dispose();
      this.nxt?.tex.dispose();
      this.cur = slot;
      this.nxt = null;
      this.fadeStart = -1;
      this.cutAt = this.time;
      return;
    }
    if (!this.cur) {
      this.cur = slot;
      this.fadeStart = this.time;
      return;
    }
    if (this.nxt) {
      // finish the running transition immediately
      this.cur.tex.dispose();
      this.cur = this.nxt;
    }
    this.nxt = slot;
    this.transStart = this.time;
    this.transDur = sec;
    this.mat.uniforms.uSeed.value = Math.random() * 50;
  }

  /** Crop window (uFit), zoom anchor (uAnc) and Ken Burns state (uKB) of a slot for the current panel size. */
  private place(s: Slot, rect: Rect, fit: Vector4, anc: Vector2, kb: Vector3): void {
    let ax = 0.5, ay = 0.5;
    if (this.cover) {
      const w = coverWindow(s.w, s.h, rect.w, rect.h, s.fx, s.fy, 0.5, this.ty);
      // texture v grows upwards (rows are flipped on upload), the focal point is measured from the top
      fit.set(w.sx, w.sy, w.cx, 1 - w.cy);
      ax = w.ax;
      ay = 1 - w.ay;
    } else {
      const rs = rect.w / Math.max(rect.h, 1), ri = s.w / Math.max(s.h, 1);
      fit.set(rs > ri ? rs / ri : 1, rs > ri ? 1 : ri / rs, 0.5, 0.5);
    }
    anc.set(ax, ay);
    // Slow zoom anchored on the focal point plus a small drift, clamped so the window never leaves the image.
    const life = Math.max(10, this.interval + this.duration * 2);
    const k = Math.min(1, (this.time - s.born) / life);
    const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
    const z = s.zoomFrom + (s.zoomTo - s.zoomFrom) * e;
    const room = 1 - 1 / z;
    const drift = room * 0.3 * (e * 2 - 1);
    const px = Math.min((1 - ax) * room, Math.max(-ax * room, s.dir.x * drift));
    const py = Math.min((1 - ay) * room, Math.max(-ay * room, s.dir.y * drift));
    kb.set(z, px, py);
  }

  render(r: WebGLRenderer, rect: Rect, time: number): void {
    // glide to a new framing target (widgets appeared / layout changed) instead of jumping
    const dt = Math.min(1, Math.max(0, time - this.lastT));
    this.lastT = time;
    this.ty = this.ty < 0 ? this.targetY : this.ty + (this.targetY - this.ty) * Math.min(1, dt * 2.5);
    this.time = time;
    const u = this.mat.uniforms;
    if (!this.cur) return;
    u.uRes.value.set(rect.w, rect.h);
    u.uBright.value = this.brightness;
    u.uFade.value = this.fadeStart < 0 ? 1 : Math.min(1, (time - this.fadeStart) / 1.6);
    u.uTex0.value = this.cur.tex;
    this.place(this.cur, rect, u.uFit0.value, u.uAnc0.value, u.uKB0.value);
    if (this.nxt) {
      const p = Math.min(1, (time - this.transStart) / this.transDur);
      u.uTex1.value = this.nxt.tex;
      this.place(this.nxt, rect, u.uFit1.value, u.uAnc1.value, u.uKB1.value);
      u.uProg.value = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      u.uHas1.value = 1;
      if (p >= 1) {
        this.cur.tex.dispose();
        this.cur = this.nxt;
        this.nxt = null;
        u.uHas1.value = 0;
        u.uTex0.value = this.cur.tex;
        this.place(this.cur, rect, u.uFit0.value, u.uAnc0.value, u.uKB0.value);
      }
    } else {
      u.uHas1.value = 0;
      u.uProg.value = 0;
    }
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    this.cur?.tex.dispose();
    this.nxt?.tex.dispose();
    this.cur = this.nxt = null;
    this.mat.dispose();
  }
}
