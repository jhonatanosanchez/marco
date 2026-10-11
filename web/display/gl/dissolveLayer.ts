// Carousel 'dissolve': the last GL frame of the screen that leaves, drawn over the live frame and eaten away by
// soft noise ("ink"), while the content above crossfades (web/display/screenSwitch.ts). Idle (no draw call, no
// texture) between switches.
import { Mesh, NormalBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Texture, Vector2, LinearFilter, ClampToEdgeWrapping, type WebGLRenderer } from 'three';
import type { GLLayer, Rect } from './engine';
import { FULLSCREEN_VERT, NOISE } from './noise';

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uOld;
uniform vec2 uRes;
uniform float uProg, uSeed;
${NOISE}
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float n = fbm(vUv * asp * 2.4 + uSeed);
  // a slow diagonal bias so the ink spreads from one corner instead of everywhere at once
  n = n * 0.75 + (1.0 - (vUv.x * 0.6 + (1.0 - vUv.y) * 0.4)) * 0.25;
  float edge = 0.12;
  float m = smoothstep(n - edge, n + edge, uProg * (1.0 + 2.0 * edge) - edge);
  vec2 d = (vec2(fbm(vUv * 3.0 + uSeed + 4.0), n) - 0.5) * 0.04 * uProg;
  vec3 c = texture2D(uOld, clamp(vUv + d, 0.001, 0.999)).rgb;
  float glow = (1.0 - abs(m * 2.0 - 1.0)) * sin(3.14159 * uProg) * 0.08;
  gl_FragColor = vec4(c + glow, 1.0 - m);
}`;

export class DissolveLayer implements GLLayer {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private tex: Texture | null = null;
  private start = 0;
  private ms = 0;

  constructor(private el: () => HTMLElement | null) {
    this.mat = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: NormalBlending,
      uniforms: { uOld: { value: null }, uRes: { value: new Vector2(1, 1) }, uProg: { value: 0 }, uSeed: { value: 0 } },
    });
    const m = new Mesh(new PlaneGeometry(2, 2), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  target() {
    return this.el();
  }
  active() {
    return this.tex !== null;
  }
  get busy() {
    return this.tex !== null;
  }

  /** Dissolve from `from` (a copy of the GL canvas) to whatever the other layers draw, in `ms`. */
  run(from: HTMLCanvasElement, ms: number): void {
    this.stop();
    const tex = new Texture(from);
    tex.minFilter = tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.tex = tex;
    this.mat.uniforms.uOld.value = tex;
    this.mat.uniforms.uSeed.value = Math.random() * 50;
    this.start = performance.now();
    this.ms = Math.max(1, ms);
  }

  stop(): void {
    this.tex?.dispose();
    this.tex = null;
    this.mat.uniforms.uOld.value = null;
  }

  render(r: WebGLRenderer, rect: Rect): void {
    if (!this.tex) return;
    const p = Math.min(1, (performance.now() - this.start) / this.ms);
    if (p >= 1) return this.stop();
    const u = this.mat.uniforms;
    u.uRes.value.set(rect.w, rect.h);
    u.uProg.value = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    this.stop();
    this.mat.dispose();
  }
}
