import * as THREE from 'three';
import { Effect, BlendFunction, BloomEffect, EffectAttribute } from 'postprocessing';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// EFECTO "CINE": todo el etalonaje de la película en UN solo shader, al final del pase de post.
//   1. bloom suave (del BloomEffect de pmndrs, que acá solo calcula su desenfoque) + HALACIÓN (el rojo que se escapa
//      alrededor de las luces fuertes, como en la película fotoquímica)
//   2. RAYOS de sol (god rays): barrido radial desde el sol sobre lo más brillante, a 1/4 de resolución
//   3. DESTELLO ANAMÓRFICO horizontal en el sol + SUCIEDAD DE LENTE que se ilumina con el bloom
//   4. tono ACES (el mismo de three, con la exposición que pone el fondo)
//   5. LUT por escena con fundido entre dos (A → B)
//   6. modo TÉRMICO (sala de ZURKLIMA): blanco y negro térmico con líneas de pantalla vieja
//   7. viñeta y grano fino de película
//   0. PROFUNDIDAD DE CAMPO (solo high): la imagen reducida a 1/2 y desenfocada a 1/4 con un disco de 16 muestras donde
//      las luces fuertes pesan más (los destellos del mar se vuelven discos de bokeh); se mezcla según la distancia
//      de cada píxel al foco (buffer de profundidad). Dos pasadas chicas en lugar de las seis del DOF de pmndrs.
// La máscara del canal alfa (alfa < 1) deja esos píxeles con su color real: las ventanas de las salas muestran el
// sitio tal cual es (sin tono, sin LUT). Todo lo demás de la escena escribe alfa 1.
// Si un efecto está en 0, su rama no cuesta nada (las texturas solo se leen si hace falta).

const FRAG = /* glsl */`
precision highp sampler3D;
uniform sampler2D tBloom, tRays, tDirt, tBokeh;
uniform sampler3D tLutA, tLutB;
uniform float uBloom, uHalation, uRays, uFlare, uDirt, uExpo, uLutMix, uLutK, uThermal, uVignette, uGrain, uKeep, uNegro;
uniform float uDof, uFocus, uRange, uDebugKeep;
uniform vec2 uSun;
uniform vec3 uSunCol;
uniform float uAspect, uT;

vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExpo / 0.6;
  return clamp(OUT * rrtOdt(IN * c), 0.0, 1.0);
}
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float gHash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
  vec3 hdr = max(inputColor.rgb, 0.0);
  float keep = clamp(1.0 - inputColor.a, 0.0, 1.0) * uKeep;
  vec3 orig = hdr;
  if (uDebugKeep > 0.5) { outputColor = vec4(vec3(keep), 1.0); return; }
  if (uDof > 0.0001) {
    float dist = -getViewZ(depth);
    float coc = clamp((abs(dist - uFocus) - uRange * 0.35) / uRange, 0.0, 1.0) * uDof;
    hdr = mix(hdr, texture2D(tBokeh, uv).rgb, smoothstep(0.0, 1.0, coc) * (1.0 - keep));
  }
  if (uBloom > 0.0001) {
    vec3 b = texture2D(tBloom, uv).rgb;
    hdr += b * uBloom + b * vec3(1.0, 0.30, 0.10) * uHalation;
    if (uDirt > 0.0001) {
      // la suciedad de la lente solo se ve donde hay luz fuerte delante (bloom) y cerca del sol
      float dl = dot(b, vec3(0.3333));
      vec2 ds = (uv - uSun) * vec2(uAspect, 1.0);
      float near = exp(-length(ds) * 2.6) * uFlare;
      float dirt = texture2D(tDirt, vec2(uv.x * uAspect, uv.y) * 0.62).r;
      hdr += (uSunCol * near * 0.9 + b * 1.4) * dirt * (0.25 + dl) * uDirt;
    }
  }
  if (uRays > 0.0001) hdr += texture2D(tRays, uv).r * uRays * uSunCol;
  if (uFlare > 0.0001) {
    vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
    // destello anamórfico: una raya horizontal larga y fina, con un núcleo más ancho (azulado en las puntas)
    float streak = exp(-abs(d.y) * 420.0) * (exp(-abs(d.x) * 1.4) * 0.55 + exp(-abs(d.x) * 7.0) * 0.6);
    float wide = exp(-abs(d.y) * 60.0) * exp(-abs(d.x) * 5.0) * 0.12;
    vec3 tint = mix(uSunCol, vec3(0.62, 0.78, 1.0) * dot(uSunCol, vec3(0.33)), smoothstep(0.05, 0.7, abs(d.x)));
    hdr += tint * (streak + wide) * uFlare;
  }
  vec3 c = aces(hdr);
  vec3 s = toSrgb(c);
  if (uLutK > 0.0001) {
    vec3 q = clamp(s, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0;
    vec3 la = texture(tLutA, q).rgb;
    vec3 lut = uLutMix > 0.0001 ? mix(la, texture(tLutB, q).rgb, uLutMix) : la;
    s = mix(s, lut, uLutK);
  }
  if (uThermal > 0.0001) {
    // cámara térmica en blanco y negro, contraste duro, líneas de barrido y un parpadeo mínimo
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    l = smoothstep(0.08, 0.92, l);
    l = pow(l, 0.8);
    float scan = 0.88 + 0.12 * sin(gl_FragCoord.y * 1.6);
    float roll = 0.96 + 0.04 * sin(uv.y * 9.0 - uT * 3.1);
    vec3 th = vec3(l) * scan * roll;
    s = mix(s, th, uThermal);
  }
  if (uVignette > 0.0001) {
    vec2 v = (uv - 0.5) * vec2(uAspect * 0.82, 1.0);
    s *= mix(1.0, smoothstep(1.05, 0.28, length(v)), uVignette);
  }
  if (uGrain > 0.0001) {
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    float n = gHash(gl_FragCoord.xy + fract(uT * 7.31) * 113.0) - 0.5;
    s += n * uGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
  }
  s = mix(s, toSrgb(clamp(orig, 0.0, 1.0)), keep);
  s *= 1.0 - uNegro;
  outputColor = vec4(toLin(clamp(s, 0.0, 1.0)), 1.0);
}`;

// rayos: barrido radial desde el sol sobre lo que pasa de cierto brillo (en luz real, antes del tono)
const RAYS_FRAG = /* glsl */`
uniform sampler2D tFrame; uniform vec2 uSun; uniform float uN, uAspect; varying vec2 vUv;
void main(){
  vec2 d = (uSun - vUv);
  float len = length(d * vec2(uAspect, 1.0));
  vec2 stepv = d / uN * 0.94;
  vec2 uv = vUv;
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uN) break;
    uv += stepv;
    vec3 c = texture2D(tFrame, clamp(uv, 0.001, 0.999)).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    acc += smoothstep(1.1, 3.2, l) * w;   // solo el cielo claro junto al sol; las nubes (oscuras) tapan
    w *= 0.955;
  }
  gl_FragColor = vec4(vec3(acc / uN * exp(-len * 1.3)), 1.0);
}`;

// DOF: 1) reducción a 1/2 con promedio pesado por brillo (sin chispas sueltas) 2) disco de bokeh de 16 muestras a 1/4
const HALF_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb, b = texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb, d = texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  gl_FragColor = vec4(min((a + b + c + d) * 0.25, vec3(40.0)), 1.0);
}`;
const BOKEH_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
void main(){
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 16.0) * uRadius;
    float a = fi * 2.39996323;                     // ángulo de oro: el disco queda parejo
    vec3 s = texture2D(tSrc, vUv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    float w = 1.0 + smoothstep(1.2, 6.0, l) * 5.0;  // las luces fuertes pesan más: se ven como discos
    acc += s * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;

export class CineEffect extends Effect {
  constructor({ lutSize = 32 } = {}) {
    const blank3 = new THREE.Data3DTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1);
    blank3.needsUpdate = true;
    const blank2 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank2.needsUpdate = true;
    super('CineEffect', FRAG, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['tBloom', new THREE.Uniform(blank2)], ['tRays', new THREE.Uniform(blank2)], ['tDirt', new THREE.Uniform(blank2)],
        ['tBokeh', new THREE.Uniform(blank2)], ['uDof', new THREE.Uniform(0)], ['uDebugKeep', new THREE.Uniform(0)], ['uFocus', new THREE.Uniform(8)], ['uRange', new THREE.Uniform(3)],
        ['tLutA', new THREE.Uniform(blank3)], ['tLutB', new THREE.Uniform(blank3)],
        ['uBloom', new THREE.Uniform(0)], ['uHalation', new THREE.Uniform(0)], ['uRays', new THREE.Uniform(0)],
        ['uFlare', new THREE.Uniform(0)], ['uDirt', new THREE.Uniform(0)], ['uExpo', new THREE.Uniform(1)],
        ['uLutMix', new THREE.Uniform(0)], ['uLutK', new THREE.Uniform(0)], ['uThermal', new THREE.Uniform(0)],
        ['uVignette', new THREE.Uniform(0)], ['uGrain', new THREE.Uniform(0)], ['uKeep', new THREE.Uniform(1)],
        ['uNegro', new THREE.Uniform(0)],
        ['uSun', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))], ['uSunCol', new THREE.Uniform(new THREE.Color(1, 0.85, 0.65))],
        ['uAspect', new THREE.Uniform(1)], ['uT', new THREE.Uniform(0)],
      ]),
    });
    this.blank2 = blank2;
    this.lutSize = lutSize;
    // el bloom de pmndrs, manejado a mano: calcula su desenfoque (mipmap) y este efecto lo suma con la halación
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 2.0, luminanceSmoothing: 0.5, intensity: 1, radius: 0.66, levels: 6 });
    this.bloomOn = true;
    this.uniforms.get('tBloom').value = this.bloom.texture;
    // rayos de sol
    const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rayRT = new THREE.WebGLRenderTarget(2, 2, rtOpt);
    this.rayMat = new THREE.ShaderMaterial({
      uniforms: { tFrame: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uN: { value: 24 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: RAYS_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.rayQuad = new FullScreenQuad(this.rayMat);
    this.raysN = 24;
    this.forceAll = false;
    // profundidad de campo
    this.halfRT = new THREE.WebGLRenderTarget(2, 2, rtOpt);
    this.bokehRT = new THREE.WebGLRenderTarget(2, 2, rtOpt);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.halfMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: vs, fragmentShader: HALF_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.bokehMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 5 } }, vertexShader: vs, fragmentShader: BOKEH_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.dofQuad = new FullScreenQuad(this.halfMat);
  }

  /** Sube una LUT (Uint8 RGBA, size³) como textura 3D. */
  static makeLut(data, size) {
    const t = new THREE.Data3DTexture(data, size, size, size);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  initialize(renderer, alpha, frameBufferType) {
    super.initialize(renderer, alpha, frameBufferType);
    this.bloom.initialize(renderer, alpha, frameBufferType);
  }

  setSize(width, height) {
    this.bloom.setSize(width, height);
    this.uniforms.get('uAspect').value = width / Math.max(1, height);
    this.rayMat.uniforms.uAspect.value = width / Math.max(1, height);
    this.rayRT.setSize(Math.max(2, width >> 2), Math.max(2, height >> 2));
    this.halfRT.setSize(Math.max(2, width >> 1), Math.max(2, height >> 1));
    this.bokehRT.setSize(Math.max(2, width >> 2), Math.max(2, height >> 2));
    this.uniforms.get('tBloom').value = this.bloom.texture;
  }

  update(renderer, inputBuffer, deltaTime) {
    const u = this.uniforms;
    u.get('uT').value += deltaTime;
    if (this.bloomOn && (u.get('uBloom').value > 0.0001 || this.forceAll)) {
      this.bloom.update(renderer, inputBuffer, deltaTime);
      u.get('tBloom').value = this.bloom.texture;
    }
    if (u.get('uRays').value > 0.0001 || this.forceAll) {
      const prev = renderer.getRenderTarget();
      this.rayMat.uniforms.tFrame.value = inputBuffer.texture;
      this.rayMat.uniforms.uSun.value.copy(u.get('uSun').value);
      this.rayMat.uniforms.uN.value = this.raysN;
      renderer.setRenderTarget(this.rayRT);
      this.rayQuad.render(renderer);
      renderer.setRenderTarget(prev);
      u.get('tRays').value = this.rayRT.texture;
    }
    if (u.get('uDof').value > 0.0001 || this.forceAll) {
      const prev = renderer.getRenderTarget();
      const src = inputBuffer.texture;
      this.halfMat.uniforms.tSrc.value = src;
      this.halfMat.uniforms.uTexel.value.set(1 / inputBuffer.width, 1 / inputBuffer.height);
      this.dofQuad.material = this.halfMat;
      renderer.setRenderTarget(this.halfRT);
      this.dofQuad.render(renderer);
      this.bokehMat.uniforms.tSrc.value = this.halfRT.texture;
      this.bokehMat.uniforms.uTexel.value.set(1 / this.halfRT.width, 1 / this.halfRT.height);
      this.dofQuad.material = this.bokehMat;
      renderer.setRenderTarget(this.bokehRT);
      this.dofQuad.render(renderer);
      renderer.setRenderTarget(prev);
      u.get('tBokeh').value = this.bokehRT.texture;
    }
  }

  dispose() {
    super.dispose();
    this.bloom.dispose();
    this.rayRT.dispose();
    this.rayMat.dispose();
    this.rayQuad.dispose();
    this.halfRT.dispose(); this.bokehRT.dispose(); this.halfMat.dispose(); this.bokehMat.dispose(); this.dofQuad.dispose();
  }
}
