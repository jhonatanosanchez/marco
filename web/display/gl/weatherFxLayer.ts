// Rich weather over the photo panel (background.weatherFx = 'rich'):
//  - rain: drops resting on the glass that act as tiny lenses (they show the photo behind them flipped and
//    shrunk, with a darker rim and a highlight), a mist of micro droplets, drops that slide down in fits and starts
//    leaving a trail of beads, and fine streaks falling at three depths; drizzle is sparse, heavy rain dense;
//    a thunderstorm adds a slanted downpour and lightning flashes (never at night);
//  - snow: flakes at four depths (small and sharp far away, big and soft close by) drifting in the wind;
//  - fog: slow banks of mist, thicker near the bottom;
//  - sun (clear daytime sky): a warm glow in the top right corner with soft shafts and a faint lens flare.
// The photo itself is never blurred: only the inside of each drop is refracted and everything else adds light (or
// a thin mist), so the DOM text above stays sharp. The panel area is copied from the framebuffer (one copy per
// frame, only while it rains) to refract it.
import {
  CustomBlending, FramebufferTexture, LinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector4, type WebGLRenderer,
} from 'three';
import type { GLLayer, Rect } from './engine';
import { FULLSCREEN_VERT, NOISE } from './noise';

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uT, uAspect, uHasTex, uFlash, uLevel, uStorm;
uniform vec4 uMode; // rain, snow, sun, fog (each 0..1, faded in and out)
${NOISE}
float h21(vec2 p){ p = fract(mod(p, 256.0) * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// drops resting on the glass. xy = refraction offset (uv), z = mask, w = highlight; rim = darker edge
vec4 drops(vec2 uv, float t, float scale, float seed, float density, out float rim){
  vec2 cells = vec2(scale * uAspect, scale);
  vec2 g = uv * cells;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float n = h21(id + seed);
  float on = step(1.0 - density, fract(n * 13.7));
  vec2 c = (vec2(n, fract(n * 37.1)) - 0.5) * 0.5;
  float life = fract(t * (0.025 + n * 0.035) + n * 9.0);
  float r = (0.09 + 0.15 * fract(n * 71.3)) * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.8, life);
  vec2 d = f - c;
  // not perfect circles: a little wobble, flatter on top and heavier at the bottom
  float ang = atan(d.y, d.x);
  float wob = 1.0 + 0.06 * sin(ang * 3.0 + n * 20.0) + 0.03 * sin(ang * 5.0 + n * 7.0);
  vec2 ds = d * vec2(1.0, d.y > 0.0 ? 1.18 : 0.9);
  float L = length(ds) / max(r * wob, 1e-3);
  float m = (1.0 - smoothstep(0.8, 1.0, L)) * on;
  rim = m * smoothstep(0.5, 1.0, L);
  float spec = m * smoothstep(0.32, 0.0, length(ds / max(r, 1e-3) - vec2(-0.32, 0.42)));
  // a lens: the drop shows a flipped, shrunk view of what is around it
  vec2 off = d / cells * 2.6 * m;
  return vec4(off, m, spec);
}

// drops sliding down in stop-and-go, leaving a trail of small beads
vec4 slide(vec2 uv, float t, float density, out float rim){
  float cols = 5.0 * uAspect;
  float x = uv.x * cols; float id = floor(x); float n = h21(vec2(id, 3.1));
  float on = step(1.0 - density, n);
  float fx = fract(x) - 0.5 - (n - 0.5) * 0.5 + sin(uv.y * 23.0 + n * 6.0) * 0.025;
  float p = fract(t * (0.035 + n * 0.05) + n);
  p += 0.025 * sin(p * 38.0 + n * 9.0);                // stutters on the glass
  float y = 1.15 - p * 1.35;
  float dy = (uv.y - y) * cols / uAspect;               // cell units, > 0 above the head
  vec2 d = vec2(fx, dy * (dy < 0.0 ? 0.8 : 0.55));       // teardrop: rounder below, pointed above
  float L = length(d) / 0.12;
  float head = (1.0 - smoothstep(0.75, 1.0, L)) * on;
  // beads left behind: shrinking with the distance to the head
  float bj = dy * 7.0; float bc = floor(bj);
  float bn = h21(vec2(id, bc + 17.0));
  float br = max(0.05 * (1.0 - smoothstep(0.0, 2.0, dy)), 0.002);
  vec2 bd = vec2(fx - (bn - 0.5) * 0.06, (fract(bj) - 0.5) / 7.0 * 0.9);
  float bead = (1.0 - smoothstep(br * 0.6, br, length(bd))) * step(0.45, bn) * step(0.15, dy) * step(dy, 2.0) * on;
  float m = clamp(head + bead, 0.0, 1.0);
  rim = head * smoothstep(0.55, 1.0, L);
  float spec = smoothstep(0.35, 0.0, length(d / 0.12 - vec2(-0.3, 0.35))) * head;
  vec2 off = (d * head * 0.12 + bd * bead * 0.6) * vec2(1.0 / cols, uAspect / cols) * 2.0;
  return vec4(off, m, spec);
}

// fine streaks falling at three depths; wind slants them (more in a storm)
float rainAir(vec2 uv, float t, float level){
  float s = 0.0;
  float slant = 0.10 + 0.14 * uStorm;
  for (int i = 0; i < 3; i++){
    float fi = float(i);                                 // 0 far … 2 near
    float cx = (140.0 - fi * 45.0) * uAspect;
    float cy = 5.0 + fi * 1.5;
    vec2 g = vec2((uv.x + uv.y * slant) * cx, uv.y * cy + t * (6.0 + fi * 2.5));
    vec2 id = floor(g); vec2 f = fract(g);
    float n = h21(id + fi * 11.0);
    float keep = step(1.0 - (0.02 + 0.06 * level) * (1.0 + fi * 0.3), n);
    float len = 0.35 + 0.4 * fract(n * 7.7);
    float w = (0.10 + fi * 0.05);
    float streak = smoothstep(w, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, len * 0.7, f.y) * smoothstep(len, len * 0.7, f.y);
    s += keep * streak * (0.22 + fi * 0.16);
  }
  return s;
}

// snow: four depths, near flakes bigger, softer and faster
float snow(vec2 uv, float t, float level){
  float s = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);                                 // 0 near … 3 far
    float sc = 5.0 + fi * 4.0;
    vec2 g = vec2(uv.x * uAspect * sc, uv.y * sc + t * (0.9 - fi * 0.16));
    g.x += sin(t * (0.4 + fi * 0.1) + g.y * 0.6 + fi) * (0.5 - fi * 0.08) + t * 0.12;
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float n = h21(id + fi * 7.0);
    float keep = step(1.0 - (0.25 + 0.45 * level), fract(n * 3.3));
    vec2 c = (vec2(n, fract(n * 23.0)) - 0.5) * 0.6;
    float size = (0.05 + 0.05 * fract(n * 5.1)) * (1.0 - fi * 0.12);
    float soft = mix(0.15, 0.75, 1.0 - fi / 3.0);         // near flakes out of focus
    float a = smoothstep(size, size * soft * 0.6, length(f - c));
    s += a * keep * mix(0.55, 1.0, fi / 3.0) * (fi == 0.0 ? 0.6 : 1.0);
  }
  return s;
}

void main(){
  float rain = uMode.x, sn = uMode.y, sun = uMode.z, fog = uMode.w;
  vec3 add = vec3(0.0);
  float m = 0.0;
  vec3 refr = vec3(0.0);
  float mist = 0.0; vec3 mistCol = vec3(0.0);
  if (rain > 0.003) {
    float ra, rb, rc, rs;
    float lv = uLevel;
    vec4 a = drops(vUv, uT, 6.0, 1.0, 0.1 + 0.18 * lv, ra);
    vec4 b = drops(vUv, uT * 1.3, 12.0, 4.0, 0.15 + 0.25 * lv, rb);
    vec4 c = drops(vUv, uT * 0.7, 34.0, 9.0, 0.25 + 0.3 * lv, rc);   // micro droplets
    vec4 d = slide(vUv, uT, 0.15 + 0.35 * lv, rs);
    vec2 off = a.xy + b.xy + c.xy * 0.6 + d.xy;
    float mask = clamp(a.z + b.z + c.z * 0.8 + d.z, 0.0, 1.0) * rain;
    float rim = clamp(ra + rb + rc * 0.6 + rs, 0.0, 1.0);
    vec3 behind = texture2D(uTex, clamp(vUv - off, 0.001, 0.999)).rgb;
    // the lens gathers light: a touch brighter inside, darker at the rim, a little cooler
    refr = behind * (1.08 - rim * 0.5) * vec3(0.97, 0.99, 1.03) + 0.015;
    m = mask * uHasTex;
    add += (a.w + b.w + c.w * 0.5 + d.w) * vec3(0.92, 0.96, 1.0) * 0.32 * rain;
    // without a photo copy: just a faint glint where the drops are
    add += mask * (1.0 - uHasTex) * 0.05;
    add += rainAir(vUv, uT, lv) * rain * vec3(0.78, 0.84, 0.92) * (0.35 + 0.25 * lv);
    // lightning: a cold flash over the whole panel
    add += uFlash * rain * vec3(0.85, 0.9, 1.0) * 0.16;
  }
  if (sn > 0.003) add += snow(vUv, uT, uLevel) * sn * vec3(0.95, 0.97, 1.0) * 0.55;
  if (sun > 0.003) {
    vec2 sp = vec2(0.74, 1.03);
    vec2 d = (vUv - sp) * vec2(uAspect, 1.0);
    float ang = atan(d.y, d.x); float len = length(d);
    // soft shafts: two noise octaves around the sun, slowly turning
    float sh = vnoise(vec2(ang * 5.0, uT * 0.04)) * 0.6 + vnoise(vec2(ang * 12.0 + 3.0, uT * 0.06)) * 0.4;
    float shafts = smoothstep(0.32, 0.85, sh) * exp(-len * 1.7) * smoothstep(0.0, 0.15, len);
    float glow = exp(-len * 3.0) + 0.35 * exp(-len * 9.0);
    vec3 warm = vec3(1.0, 0.84, 0.6);
    add += warm * (shafts * 0.15 + glow * 0.15) * sun * uLevel;
    // a faint lens flare: a few soft ghosts on the line from the sun through the centre
    vec2 axis = vec2(0.5) - sp;
    for (int i = 0; i < 3; i++){
      float k = 0.55 + float(i) * 0.45;
      vec2 gp = sp + axis * k * 1.6;
      float rr = 0.035 + float(i) * 0.025;
      float gd = length((vUv - gp) * vec2(uAspect, 1.0));
      float ghost = smoothstep(rr, rr * 0.55, gd);
      add += mix(vec3(1.0, 0.75, 0.5), vec3(0.6, 0.85, 1.0), float(i) * 0.5) * ghost * 0.022 * sun;
    }
  }
  if (fog > 0.003) {
    // banks of mist drifting sideways, denser near the ground
    vec2 q = vec2(vUv.x * uAspect * 1.6 + uT * 0.02, vUv.y * 2.2);
    float f1 = fbm(q + vec2(0.0, uT * 0.004));
    float f2 = fbm(q * 2.1 - vec2(uT * 0.03, 0.0) + 5.2);
    float dens = smoothstep(0.3, 0.75, f1 * 0.65 + f2 * 0.35);
    float height = mix(0.7, 0.16, smoothstep(0.0, 0.85, vUv.y));
    mist = clamp(dens * height + 0.09, 0.0, 0.55) * fog * uLevel;
    mistCol = vec3(0.86, 0.89, 0.92);
  }
  // premultiplied: drops replace the photo under them, the mist veils it a little, everything else adds light
  float a = m + mist * (1.0 - m);
  gl_FragColor = vec4(refr * m + mistCol * mist * (1.0 - m) + add, a);
}`;

export type WeatherFx = 'rain' | 'snow' | 'sun' | 'fog' | null;

export class WeatherFxLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private tex: FramebufferTexture | null = null;
  private pos = new Vector2();
  private goal = new Vector4();
  private flash = 0;
  private flash2 = 0;
  private nextFlash = 0;
  /** what to show; null = nothing (fades out) */
  mode: WeatherFx = null;
  /** strength 0..1 (drizzle … downpour, light … heavy snow) */
  level = 1;
  /** thunderstorm: lightning flashes and a slanted downpour */
  storm = false;
  /** night mode: no flashes */
  night = false;
  enabled = true;

  constructor(private el: () => HTMLElement | null) {
    this.mat = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        uTex: { value: null }, uT: { value: 0 }, uAspect: { value: 16 / 9 }, uHasTex: { value: 0 }, uFlash: { value: 0 },
        uLevel: { value: 1 }, uStorm: { value: 0 }, uMode: { value: new Vector4() },
      },
    });
    const m = new Mesh(new PlaneGeometry(2, 2), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  /** Set what to show (from weatherFxOf in icons.ts). */
  set(mode: WeatherFx, level = 1, storm = false): void {
    this.mode = mode;
    this.level = Math.max(0.2, Math.min(1, level || 1));
    this.storm = storm;
  }

  target() {
    return this.el();
  }
  private get modeVec() {
    return this.mat.uniforms.uMode.value as Vector4;
  }
  active() {
    const v = this.modeVec;
    return this.enabled && (this.mode !== null || v.x + v.y + v.z + v.w > 0.01);
  }
  /** falling rain or snow needs full fps; the slow sun rays and fog are fine at the idle rate */
  get busy() {
    const v = this.modeVec;
    return this.mode === 'rain' || this.mode === 'snow' || v.x > 0.01 || v.y > 0.01;
  }

  render(r: WebGLRenderer, rect: Rect, time: number, dt: number): void {
    const u = this.mat.uniforms;
    const mode = this.modeVec;
    this.goal.set(this.mode === 'rain' ? 1 : 0, this.mode === 'snow' ? 1 : 0, this.mode === 'sun' ? 1 : 0, this.mode === 'fog' ? 1 : 0);
    const k = Math.min(1, dt * 0.8);
    mode.lerp(this.goal, k);
    u.uLevel.value += (this.level - u.uLevel.value) * k;
    u.uStorm.value += ((this.storm ? 1 : 0) - u.uStorm.value) * k;
    // wrapped so the float maths in the shader keeps its precision on a screen that runs for weeks
    u.uT.value = time % 3600;
    u.uAspect.value = rect.w / Math.max(1, rect.h);

    // thunderstorm: lightning every 8-30 s, a bright flash and a weaker second flicker (never at night)
    if (time > this.nextFlash) {
      this.nextFlash = time + 8 + Math.random() * 22;
      if (!this.night && this.mode === 'rain' && this.storm && Math.random() < 0.8) {
        this.flash = 1;
        this.flash2 = 0.12 + Math.random() * 0.1;
      }
    }
    if (this.flash2 > 0) {
      this.flash2 -= dt;
      if (this.flash2 <= 0) this.flash = Math.max(this.flash, 0.6);
    }
    this.flash = Math.max(0, this.flash - dt * 5);
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
