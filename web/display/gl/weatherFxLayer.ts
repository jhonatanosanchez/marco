// Rich weather over the photo panel: drops on the glass that bend the photo behind them, drops sliding down
// with a short trail, faint rain streaks, layered snow flakes, and warm sun rays from the top right on clear days.
// The photo itself is never blurred or tinted: only the inside of each drop is refracted, so text stays sharp.
// The panel area is copied from the framebuffer (one copy per frame, only while it rains) to refract it.
import {
  CustomBlending, FramebufferTexture, LinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, type WebGLRenderer,
} from 'three';
import type { GLLayer, Rect } from './engine';
import { FULLSCREEN_VERT } from './noise';

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uT, uAspect, uHasTex, uFlash;
uniform vec3 uMode;
float h21(vec2 p){ p = fract(mod(p, 256.0) * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// drops resting on the glass: xy = lens offset, z = mask, w = specular highlight
vec4 drops(vec2 uv, float t, float scale, float seed, float keep, out float rim){
  vec2 g = uv * vec2(scale * uAspect, scale);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float n = h21(id + seed);
  vec2 c = (vec2(n, fract(n * 37.1)) - 0.5) * 0.6;
  float life = fract(t * (0.05 + n * 0.05) + n * 9.0);
  float r = 0.09 + 0.1 * fract(n * 71.3);
  r *= smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.7, life);
  vec2 d = f - c;
  float m = smoothstep(r, r * 0.6, length(d)) * step(keep, fract(n * 13.7));
  float spec = smoothstep(r * 0.4, 0.0, length(d - vec2(-0.3, 0.35) * r)) * m;
  rim = m * smoothstep(0.45, 1.0, length(d) / max(r, 1e-3));
  return vec4(d * m, m, spec);
}
// a few drops sliding down in columns, leaving a thin trail
vec4 slide(vec2 uv, float t){
  float cols = 6.0 * uAspect;
  float x = uv.x * cols; float id = floor(x); float n = h21(vec2(id, 3.1));
  float fx = fract(x) - 0.5 - (n - 0.5) * 0.5 + sin(uv.y * 30.0 + n * 6.0) * 0.03;
  float y = 1.15 - fract(t * (0.05 + n * 0.07) + n) * 1.3;
  float dy = (uv.y - y) * cols / uAspect;
  vec2 d = vec2(fx, dy * 0.55);
  float on = step(0.7, n);
  float head = smoothstep(0.14, 0.07, length(d)) * on;
  float trail = smoothstep(0.035, 0.0, abs(fx)) * step(0.0, dy) * smoothstep(1.2, 0.0, dy) * on;
  float spec = smoothstep(0.05, 0.0, length(d - vec2(-0.04, 0.05))) * head;
  return vec4(d * head * 0.9, head, spec + trail * 0.25);
}
float rainAir(vec2 uv, float t){
  float s = 0.0;
  for (int i = 0; i < 2; i++){
    float fi = float(i);
    vec2 g = vec2((uv.x + uv.y * 0.12) * (90.0 + fi * 50.0) * uAspect, uv.y * (7.0 + fi * 2.0) + t * (8.0 + fi * 3.0));
    vec2 id = floor(g); vec2 f = fract(g);
    float n = h21(id + fi * 11.0);
    s += step(0.95, n) * smoothstep(0.12, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, 0.4, f.y) * smoothstep(1.0, 0.6, f.y) * (0.35 - fi * 0.1);
  }
  return s;
}
float snow(vec2 uv, float t){
  float s = 0.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i); float sc = 8.0 + fi * 5.0;
    vec2 g = vec2(uv.x * uAspect * sc, uv.y * sc + t * (0.35 + fi * 0.12));
    g.x += sin(t * 0.5 + g.y * 0.7 + fi) * 0.4;
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float n = h21(id + fi * 7.0);
    vec2 c = (vec2(n, fract(n * 23.0)) - 0.5) * 0.6;
    float size = 0.04 + 0.05 * fract(n * 5.1) - fi * 0.006;
    s += smoothstep(size, size * 0.2, length(f - c)) * step(0.6, fract(n * 3.3)) * (1.0 - fi * 0.2);
  }
  return s;
}
void main(){
  float rain = uMode.x, sn = uMode.y, sun = uMode.z;
  vec3 add = vec3(0.0);
  float m = 0.0;
  vec3 refr = vec3(0.0);
  if (rain > 0.003) {
    float ra, rb;
    vec4 a = drops(vUv, uT, 7.0, 1.0, 0.55, ra), b = drops(vUv, uT * 1.3, 13.0, 4.0, 0.6, rb), c = slide(vUv, uT);
    vec2 off = a.xy * 0.05 + b.xy * 0.025 + c.xy * 0.05;
    float mask = clamp(a.z + b.z + c.z, 0.0, 1.0) * rain;
    // inside a drop: the photo seen through a small lens, a touch brighter, with a slightly darker rim
    refr = texture2D(uTex, clamp(vUv - off, 0.001, 0.999)).rgb * (1.06 - clamp(ra + rb, 0.0, 1.0) * 0.35) + 0.02;
    m = mask * uHasTex;
    add += (a.w + b.w + c.w) * vec3(0.9, 0.95, 1.0) * 0.22 * rain;
    // without a photo copy: just a faint glint where the drops are
    add += mask * (1.0 - uHasTex) * 0.05;
    add += rainAir(vUv, uT) * rain * vec3(0.75, 0.82, 0.9) * 0.45;
    add += uFlash * rain * 0.05;
  }
  if (sn > 0.003) add += snow(vUv, uT) * sn * vec3(0.95, 0.97, 1.0) * 0.6;
  if (sun > 0.003) {
    vec2 d = (vUv - vec2(0.88, 1.06)) * vec2(uAspect, 1.0);
    float ang = atan(d.y, d.x); float len = length(d);
    float rays = pow(max(0.0, 0.5 + 0.5 * sin(ang * 22.0 + uT * 0.25) * sin(ang * 9.0 - uT * 0.16)), 3.0) * exp(-len * 1.8);
    float glow = exp(-len * 3.2);
    add += vec3(1.0, 0.82, 0.55) * (rays * 0.12 + glow * 0.16) * sun;
  }
  // premultiplied: drops replace the photo under them, everything else adds light
  gl_FragColor = vec4(refr * m + add, m);
}`;

export type WeatherFx = 'rain' | 'snow' | 'sun' | null;

export class WeatherFxLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private tex: FramebufferTexture | null = null;
  private pos = new Vector2();
  private goal = new Vector3();
  private flash = 0;
  private nextFlash = 0;
  /** what to show; null = nothing (fades out) */
  mode: WeatherFx = null;
  /** night mode: no flashes */
  night = false;
  enabled = true;

  constructor(private el: () => HTMLElement | null) {
    this.mat = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        uTex: { value: null }, uT: { value: 0 }, uAspect: { value: 16 / 9 }, uHasTex: { value: 0 }, uFlash: { value: 0 },
        uMode: { value: new Vector3() },
      },
    });
    const m = new Mesh(new PlaneGeometry(2, 2), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  target() {
    return this.el();
  }
  private get level() {
    const v = this.mat.uniforms.uMode.value as Vector3;
    return v.x + v.y + v.z;
  }
  active() {
    return this.enabled && (this.mode !== null || this.level > 0.01);
  }
  /** falling rain or snow needs full fps; the slow sun rays are fine at the idle rate */
  get busy() {
    const v = this.mat.uniforms.uMode.value as Vector3;
    return this.mode === 'rain' || this.mode === 'snow' || v.x > 0.01 || v.y > 0.01;
  }

  render(r: WebGLRenderer, rect: Rect, time: number, dt: number): void {
    const u = this.mat.uniforms;
    const mode = u.uMode.value as Vector3;
    this.goal.set(this.mode === 'rain' ? 1 : 0, this.mode === 'snow' ? 1 : 0, this.mode === 'sun' ? 1 : 0);
    mode.lerp(this.goal, Math.min(1, dt * 0.8));
    // wrapped so the float maths in the shader keeps its precision on a screen that runs for weeks
    u.uT.value = time % 3600;
    u.uAspect.value = rect.w / Math.max(1, rect.h);

    // an occasional far flash while it rains (never at night)
    if (time > this.nextFlash) {
      this.nextFlash = time + 20 + Math.random() * 40;
      if (!this.night && this.mode === 'rain' && Math.random() < 0.5) this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    u.uFlash.value = this.flash;

    if (mode.x > 0.003) {
      // copy what the photo layer just drew under the panel so the drops can bend it
      const w = Math.max(1, rect.w), h = Math.max(1, rect.h);
      if (!this.tex || this.tex.image.width !== w || this.tex.image.height !== h) {
        this.tex?.dispose();
        this.tex = new FramebufferTexture(w, h);
        this.tex.minFilter = this.tex.magFilter = LinearFilter;
      }
      try {
        r.copyFramebufferToTexture(this.tex, this.pos.set(rect.x, rect.y));
        u.uTex.value = this.tex;
        u.uHasTex.value = 1;
      } catch {
        u.uHasTex.value = 0;
      }
    } else if (this.tex) {
      this.tex.dispose();
      this.tex = null;
      u.uTex.value = null;
      u.uHasTex.value = 0;
    }
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    this.tex?.dispose();
    this.tex = null;
    this.mat.dispose();
  }
}
