// Ambient backdrop behind the calendar: a very subtle flowing aurora (rendered at ¼ resolution into a
// render target, refreshed at 15 fps and upscaled) or slow drifting soft particles.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Points, Scene,
  ShaderMaterial, Vector2, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import type { GLLayer, Rect } from './engine';
import { FULLSCREEN_VERT, NOISE } from './noise';

const AURORA = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uI, uLight;
uniform vec3 uA, uB, uBg;
uniform vec2 uRes;
${NOISE}
void main(){
  float t = uTime * 0.035;
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  float n1 = fbm(vec2(p.x * 0.8 + t, p.y * 0.7 - t * 0.6));
  float n2 = fbm(vec2(p.x * 1.4 - t * 0.8, p.y * 1.1 + t * 0.4) + 3.7);
  float y1 = 0.86 + 0.07 * sin(p.x * 1.2 + t * 2.3) + 0.14 * (n1 - 0.5);
  float b1 = exp(-pow((vUv.y - y1) * 4.2, 2.0));
  float y2 = 0.08 + 0.06 * sin(p.x * 0.8 - t * 1.6 + 1.7) + 0.12 * (n2 - 0.5);
  float b2 = exp(-pow((vUv.y - y2) * 5.0, 2.0));
  float curtain = 0.55 + 0.45 * fbm(vec2(p.x * 5.0 + t * 2.5, vUv.y * 0.8 - t));
  vec3 col = uA * b1 * curtain + uB * b2 * (0.45 + 0.55 * n1);
  col += mix(uA, uB, vUv.x) * 0.025 * n2; // faint overall haze
  col *= uI;
  vec3 outc = uLight > 0.5 ? uBg * (1.0 - length(col) * 0.6) + col * 0.6 : uBg + col;
  gl_FragColor = vec4(outc, 1.0);
}`;

const BLIT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uTex;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }`;

const P_VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime, uH;
varying float vA;
varying float vHue;
void main(){
  float sp = 0.004 + seed.z * 0.012;
  float y = fract(seed.y + uTime * sp);
  float x = fract(seed.x + 0.03 * sin(uTime * 0.07 + seed.w * 30.0));
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = (4.0 + seed.w * seed.w * 26.0) * uH;
  float tw = 0.6 + 0.4 * sin(uTime * (0.3 + seed.z) + seed.x * 50.0);
  vA = tw * smoothstep(0.0, 0.2, y) * smoothstep(1.0, 0.8, y);
  vHue = seed.x;
}`;
const P_FRAG = /* glsl */ `
uniform vec3 uA, uB;
uniform float uI;
varying float vA;
varying float vHue;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(mix(uA, uB, vHue) * a * vA * uI, 1.0);
}`;

export class AmbientLayer implements GLLayer {
  private scene = new Scene();
  private blitScene = new Scene();
  private pScene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private aurora: ShaderMaterial;
  private blit: ShaderMaterial;
  private parts: ShaderMaterial;
  private rt: WebGLRenderTarget | null = null;
  private lastUpdate = -1;
  mode: 'aurora' | 'particles' | 'none' = 'aurora';
  enabled = true;

  constructor(private el: () => HTMLElement | null) {
    const geo = new PlaneGeometry(2, 2);
    this.aurora = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: AURORA, depthTest: false, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uI: { value: 0.11 }, uLight: { value: 0 }, uA: { value: new Color('#ff5a4e') }, uB: { value: new Color('#2ec4b6') },
        uBg: { value: new Color(0, 0, 0) }, uRes: { value: new Vector2(1, 1) },
      },
    });
    this.blit = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: BLIT, depthTest: false, depthWrite: false, uniforms: { uTex: { value: null } },
    });
    const a = new Mesh(geo, this.aurora);
    a.frustumCulled = false;
    this.scene.add(a);
    const b = new Mesh(geo, this.blit);
    b.frustumCulled = false;
    this.blitScene.add(b);

    const N = 110;
    const g = new BufferGeometry();
    const s = new Float32Array(N * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute('seed', new BufferAttribute(s, 4));
    g.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    this.parts = new ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uH: { value: 1 }, uI: { value: 0.35 }, uA: { value: new Color('#ff5a4e') }, uB: { value: new Color('#ffffff') } },
    });
    const pts = new Points(g, this.parts);
    pts.frustumCulled = false;
    this.pScene.add(pts);
  }

  setColors(accent: string, second: string, bg: string, light: boolean): void {
    try {
      (this.aurora.uniforms.uA.value as Color).set(accent);
      (this.aurora.uniforms.uB.value as Color).set(second);
      (this.aurora.uniforms.uBg.value as Color).set(bg);
      (this.parts.uniforms.uA.value as Color).set(accent);
      this.aurora.uniforms.uLight.value = light ? 1 : 0;
      this.aurora.uniforms.uI.value = light ? 0.08 : 0.11;
      this.lastUpdate = -1;
    } catch { /* ignore bad colours */ }
  }

  target() {
    return this.el();
  }
  active() {
    return this.enabled && this.mode !== 'none';
  }

  render(r: WebGLRenderer, rect: Rect, time: number): void {
    if (this.mode === 'particles') {
      this.parts.uniforms.uTime.value = time;
      this.parts.uniforms.uH.value = Math.max(0.6, rect.h / 1080);
      r.render(this.pScene, this.cam);
      return;
    }
    const w = Math.max(16, Math.round(rect.w / 4));
    const h = Math.max(16, Math.round(rect.h / 4));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new WebGLRenderTarget(w, h, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
      this.lastUpdate = -1;
    }
    if (this.lastUpdate < 0 || time - this.lastUpdate > 1 / 15) {
      this.lastUpdate = time;
      this.aurora.uniforms.uTime.value = time;
      this.aurora.uniforms.uRes.value.set(rect.w, rect.h);
      r.setScissorTest(false);
      r.setRenderTarget(this.rt);
      r.setViewport(0, 0, w, h);
      r.render(this.scene, this.cam);
      r.setRenderTarget(null);
      r.setScissorTest(true);
      r.setViewport(rect.x, rect.y, rect.w, rect.h);
      r.setScissor(rect.x, rect.y, rect.w, rect.h);
    }
    this.blit.uniforms.uTex.value = this.rt.texture;
    r.render(this.blitScene, this.cam);
  }

  dispose(): void {
    this.rt?.dispose();
    this.aurora.dispose();
    this.blit.dispose();
    this.parts.dispose();
  }
}
