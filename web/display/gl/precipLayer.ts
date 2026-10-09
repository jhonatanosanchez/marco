// Subtle rain / snow particles over the photo panel (all motion computed on the GPU).
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, OrthographicCamera, Points, Scene, ShaderMaterial, type WebGLRenderer,
} from 'three';
import type { GLLayer, Rect } from './engine';

const VERT = /* glsl */ `
attribute vec4 seed; // x0, y0, speed, size
uniform float uTime, uSnow, uH;
varying float vA;
void main(){
  float sp = mix(0.55, 0.06, uSnow) * (0.6 + seed.z);
  float y = fract(seed.y - uTime * sp);
  float sway = uSnow * 0.015 * sin(uTime * (0.6 + seed.z) + seed.x * 40.0);
  float x = fract(seed.x + sway - (1.0 - uSnow) * 0.05 * (1.0 - y));
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = mix(mix(14.0, 26.0, seed.w), mix(3.0, 8.0, seed.w), uSnow) * uH;
  vA = mix(0.35, 0.8, seed.w) * smoothstep(0.0, 0.15, y);
}`;
const FRAG = /* glsl */ `
uniform float uSnow, uAlpha;
varying float vA;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (uSnow > 0.5) { a = smoothstep(0.5, 0.1, length(p)); }
  else { float x = p.x + p.y * 0.12; a = smoothstep(0.07, 0.0, abs(x)) * smoothstep(0.5, -0.2, p.y) * smoothstep(-0.5, -0.3, p.y); }
  gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * vA * uAlpha);
}`;

export class PrecipLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private alpha = 0;
  mode: 'rain' | 'snow' | null = null;
  enabled = true;

  constructor(private el: () => HTMLElement | null, count = 420) {
    const g = new BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
    g.setAttribute('seed', new BufferAttribute(seeds, 4));
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSnow: { value: 0 }, uAlpha: { value: 0 }, uH: { value: 1 } },
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
    const want = this.mode ? 0.55 : 0;
    this.alpha += (want - this.alpha) * Math.min(1, dt * 0.8);
    const u = this.mat.uniforms;
    u.uTime.value = time;
    if (this.mode) u.uSnow.value = this.mode === 'snow' ? 1 : 0;
    u.uAlpha.value = this.alpha;
    u.uH.value = Math.max(0.6, rect.h / 1080);
    r.render(this.scene, this.cam);
  }
  dispose(): void {
    this.mat.dispose();
  }
}
