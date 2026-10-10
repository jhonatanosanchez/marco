// Simple rain / snow over the photo panel (background.weatherFx = 'simple'; all motion computed on the GPU).
// Each particle has a depth: far ones are small, faint and slow, near ones bigger, softer and faster, so the
// fall has some parallax. `level` (drizzle … downpour, light … heavy snow) decides how many are shown.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, OrthographicCamera, Points, Scene, ShaderMaterial, type WebGLRenderer,
} from 'three';
import type { GLLayer, Rect } from './engine';

const VERT = /* glsl */ `
attribute vec4 seed; // x0, y0, speed jitter, depth (0 far … 1 near)
uniform float uTime, uSnow, uH, uLevel;
varying float vA, vDepth;
void main(){
  float d = seed.w;
  // only part of the particles for light rain / snow; the rest stay off screen
  float shown = step(seed.z * 0.85 + 0.15 * fract(seed.x * 13.0), uLevel);
  float sp = mix(mix(0.38, 0.75, d), mix(0.035, 0.09, d), uSnow) * (0.85 + 0.3 * seed.z);
  float y = fract(seed.y - uTime * sp);
  float sway = uSnow * (0.008 + 0.014 * d) * sin(uTime * (0.4 + seed.z * 0.5) + seed.x * 40.0);
  float drift = uSnow * 0.01 * uTime * (0.3 + d);
  float x = fract(seed.x + sway + drift - (1.0 - uSnow) * 0.05 * (1.0 - y));
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0) + vec4(0.0, (1.0 - shown) * 4.0, 0.0, 0.0);
  gl_PointSize = mix(mix(10.0, 30.0, d), mix(2.5, 11.0, d * d), uSnow) * uH;
  vA = mix(mix(0.25, 0.7, d), mix(0.45, 0.85, d), uSnow) * smoothstep(0.0, 0.12, y);
  vDepth = d;
}`;
const FRAG = /* glsl */ `
uniform float uSnow, uAlpha;
varying float vA, vDepth;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (uSnow > 0.5) {
    // near flakes slightly out of focus
    float soft = mix(0.15, 0.45, vDepth);
    a = smoothstep(0.5, 0.5 - soft, length(p));
  } else {
    // a thin streak, brighter at the head (bottom), fading towards the tail
    float x = p.x + p.y * 0.1;
    float w = mix(0.03, 0.055, vDepth);
    a = smoothstep(w, 0.0, abs(x)) * smoothstep(-0.5, 0.3, p.y) * smoothstep(0.5, 0.4, p.y);
  }
  gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * vA * uAlpha);
}`;

export class PrecipLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private alpha = 0;
  mode: 'rain' | 'snow' | null = null;
  /** 0..1: how many particles fall (drizzle / light snow … downpour / heavy snow) */
  level = 1;
  enabled = true;

  constructor(private el: () => HTMLElement | null, count = 420) {
    const g = new BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
    // more far particles than near ones
    for (let i = 3; i < count * 4; i += 4) seeds[i] = seeds[i] ** 1.6;
    g.setAttribute('seed', new BufferAttribute(seeds, 4));
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSnow: { value: 0 }, uAlpha: { value: 0 }, uH: { value: 1 }, uLevel: { value: 1 } },
    });
    const pts = new Points(g, this.mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  target() {
    return this.el();
  }
  active() {
    return this.enabled && (this.mode !== null || this.alpha > 0.01);
  }
  get busy() {
    return this.active();
  }
  render(r: WebGLRenderer, rect: Rect, time: number, dt: number): void {
    const want = this.mode ? 0.6 : 0;
    const k = Math.min(1, dt * 0.8);
    this.alpha += (want - this.alpha) * k;
    const u = this.mat.uniforms;
    u.uTime.value = time % 3600;
    if (this.mode) u.uSnow.value = this.mode === 'snow' ? 1 : 0;
    u.uLevel.value += (Math.max(0.2, Math.min(1, this.level || 1)) - u.uLevel.value) * k;
    u.uAlpha.value = this.alpha;
    u.uH.value = Math.max(0.6, rect.h / 1080);
    r.render(this.scene, this.cam);
  }
  dispose(): void {
    this.mat.dispose();
  }
}
